import { randomUUID } from 'node:crypto'

import argon2 from 'argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../app.js'
import type { ApiConfig } from '../config.js'
import { createDatabase } from '../database/client.js'
import {
  categories,
  creditCards,
  installmentOccurrences,
  installmentPlans,
  sessions,
  transactions,
  users,
} from '../database/schema.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('finance API with MariaDB', () => {
  const username = 'fictional-owner'
  const password = 'fictional-password-1234'
  const userId = randomUUID()
  const config: ApiConfig = {
    bootstrapPassword: undefined,
    bootstrapUsername: undefined,
    databaseUrl: databaseUrl ?? 'mysql://unused',
    host: '127.0.0.1',
    nodeEnv: 'test',
    port: 3000,
    webOrigin: 'http://localhost:5173',
  }
  const { connection, database } = createDatabase(config)
  let app: Awaited<ReturnType<typeof createApp>>
  let cookie = ''
  let csrfToken = ''

  beforeAll(async () => {
    await database.delete(sessions)
    await database.delete(installmentOccurrences)
    await database.delete(installmentPlans)
    await deleteTransactionHistory()
    await database.delete(creditCards)
    await database.delete(categories)
    await database.delete(users).where(eq(users.username, username))
    await database.insert(users).values({
      id: userId,
      isActive: true,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      role: 'owner',
      username,
    })

    app = await createApp(config)
    const login = await app.inject({
      method: 'POST',
      payload: { password, rememberMe: false, username },
      url: '/api/auth/login',
    })
    const setCookie = login.headers['set-cookie']
    cookie =
      (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? ''
    csrfToken = login.json<{ csrfToken: string }>().csrfToken
  })

  beforeEach(async () => {
    await database.delete(installmentOccurrences)
    await database.delete(installmentPlans)
    await deleteTransactionHistory()
    await database.delete(creditCards)
    await database.delete(categories)
  })

  afterAll(async () => {
    if (app) await app.close()
    await database.delete(sessions)
    await database.delete(installmentOccurrences)
    await database.delete(installmentPlans)
    await deleteTransactionHistory()
    await database.delete(creditCards)
    await database.delete(categories)
    await database.delete(users).where(eq(users.id, userId))
    await connection.end()
  })

  it('blocks unauthenticated and non-CSRF mutations', async () => {
    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/api/categories',
    })
    expect(unauthenticated.statusCode).toBe(401)

    const forbidden = await app.inject({
      headers: { cookie },
      method: 'POST',
      payload: { direction: 'expense', name: 'อาหารสมมติ' },
      url: '/api/categories',
    })
    expect(forbidden.statusCode).toBe(403)
  })

  it('creates, filters, and preserves transactions with inactive categories', async () => {
    const category = await createCategory('expense', 'อาหารสมมติ')
    const created = await createTransaction(category.id, {
      amount: '1250.50',
      description: 'ค่าอาหารตัวอย่าง',
      direction: 'expense',
      paymentMethod: 'cash',
      transactionDate: '2026-09-02',
    })
    expect(created.amountMinor).toBe('125050')

    const filtered = await app.inject({
      headers: { cookie },
      method: 'GET',
      url: `/api/transactions?direction=expense&categoryId=${category.id}&search=อาหาร`,
    })
    expect(filtered.statusCode).toBe(200)
    expect(filtered.json<{ items: unknown[] }>().items).toHaveLength(1)

    const deactivated = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'PATCH',
      payload: { isActive: false },
      url: `/api/categories/${category.id}/status`,
    })
    expect(deactivated.statusCode).toBe(200)

    const blocked = await createTransactionResponse(category.id, {
      amount: '10',
      description: 'รายการใหม่',
      direction: 'expense',
      paymentMethod: 'cash',
      transactionDate: '2026-09-03',
    })
    expect(blocked.statusCode).toBe(409)

    const history = await app.inject({
      headers: { cookie },
      method: 'GET',
      url: '/api/transactions',
    })
    expect(history.json<{ items: unknown[] }>().items).toHaveLength(1)
  })

  it('corrects atomically, retains the original, and cancels without deletion', async () => {
    const category = await createCategory('income', 'รายได้สมมติ')
    const original = await createTransaction(category.id, {
      amount: '50000',
      description: 'รายได้ตัวอย่าง',
      direction: 'income',
      paymentMethod: 'bank_transfer',
      transactionDate: '2026-09-01',
    })

    const correction = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      payload: {
        amount: '51000',
        categoryId: category.id,
        description: 'รายได้ตัวอย่างที่แก้ไข',
        direction: 'income',
        paymentMethod: 'bank_transfer',
        transactionDate: '2026-09-01',
      },
      url: `/api/transactions/${original.id}/corrections`,
    })
    expect(correction.statusCode).toBe(201)
    const replacement = correction.json<{
      correctsTransactionId: string
      id: string
      status: string
    }>()
    expect(replacement.correctsTransactionId).toBe(original.id)
    expect(replacement.status).toBe('active')

    const retriedCorrection = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      payload: {
        amount: '52000',
        categoryId: category.id,
        description: 'รายการแก้ไขซ้ำ',
        direction: 'income',
        paymentMethod: 'bank_transfer',
        transactionDate: '2026-09-01',
      },
      url: `/api/transactions/${original.id}/corrections`,
    })
    expect(retriedCorrection.statusCode).toBe(400)

    const originalAfter = await app.inject({
      headers: { cookie },
      method: 'GET',
      url: `/api/transactions/${original.id}`,
    })
    expect(originalAfter.json<{ status: string }>().status).toBe('superseded')

    const cancelled = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      url: `/api/transactions/${replacement.id}/cancel`,
    })
    expect(cancelled.statusCode).toBe(200)
    expect(cancelled.json<{ status: string }>().status).toBe('cancelled')

    const retriedCancellation = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      url: `/api/transactions/${replacement.id}/cancel`,
    })
    expect(retriedCancellation.statusCode).toBe(400)

    const history = await app.inject({
      headers: { cookie },
      method: 'GET',
      url: '/api/transactions?status=all',
    })
    expect(history.json<{ items: unknown[] }>().items).toHaveLength(2)
  })

  it('rejects invalid amounts, mismatched categories, and unavailable card input', async () => {
    const category = await createCategory('income', 'รายได้สมมติ')
    const duplicateCategory = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      payload: { direction: 'income', name: '  รายได้สมมติ  ' },
      url: '/api/categories',
    })
    expect(duplicateCategory.statusCode).toBe(409)

    for (const amount of ['0', '-1', 'invalid', '1000000000']) {
      const response = await createTransactionResponse(category.id, {
        amount,
        description: 'ข้อมูลไม่ถูกต้อง',
        direction: 'income',
        paymentMethod: 'cash',
        transactionDate: '2026-09-01',
      })
      expect(response.statusCode).toBe(400)
    }

    const invalidDate = await createTransactionResponse(category.id, {
      amount: '100',
      description: 'วันที่ไม่ถูกต้อง',
      direction: 'income',
      paymentMethod: 'cash',
      transactionDate: '2026-02-30',
    })
    expect(invalidDate.statusCode).toBe(400)

    const invalidRange = await app.inject({
      headers: { cookie },
      method: 'GET',
      url: '/api/transactions?dateFrom=2026-09-02&dateTo=2026-09-01',
    })
    expect(invalidRange.statusCode).toBe(400)

    const mismatch = await createTransactionResponse(category.id, {
      amount: '100',
      description: 'ผิดประเภท',
      direction: 'expense',
      paymentMethod: 'cash',
      transactionDate: '2026-09-01',
    })
    expect(mismatch.statusCode).toBe(400)

    const card = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      payload: {
        amount: '100',
        categoryId: category.id,
        description: 'บัตรยังไม่เปิดใช้',
        direction: 'expense',
        paymentMethod: 'credit_card',
        transactionDate: '2026-09-01',
      },
      url: '/api/transactions',
    })
    expect(card.statusCode).toBe(400)
  })

  it('enforces critical money and payment rules in MariaDB', async () => {
    const category = await createCategory('income', 'หมวดทดสอบข้อบังคับ')
    const baseValues = {
      categoryId: category.id,
      createdByUserId: userId,
      description: 'ข้อมูลสมมติสำหรับทดสอบ constraint',
      direction: 'income' as const,
      paymentMethod: 'cash' as const,
      status: 'active' as const,
      transactionDate: '2026-09-01',
    }

    await expect(
      database.insert(transactions).values({
        ...baseValues,
        amountMinor: 0n,
        currency: 'THB',
        id: randomUUID(),
      }),
    ).rejects.toThrow()

    await expect(
      database.insert(transactions).values({
        ...baseValues,
        amountMinor: 100_000_000_000n,
        currency: 'THB',
        id: randomUUID(),
      }),
    ).rejects.toThrow()

    await expect(
      database.insert(transactions).values({
        ...baseValues,
        amountMinor: 100n,
        currency: 'USD',
        id: randomUUID(),
      }),
    ).rejects.toThrow()

    await expect(
      database.insert(transactions).values({
        ...baseValues,
        amountMinor: 100n,
        currency: 'THB',
        id: randomUUID(),
        paymentMethod: 'credit_card',
      }),
    ).rejects.toThrow()
  })

  it('assigns card purchases to derived statements and preserves inactive history', async () => {
    const category = await createCategory('expense', 'ค่าใช้จ่ายบัตรสมมติ')
    const card = await createCreditCard({
      cutoffDay: 17,
      dueDay: 1,
      maskedSuffix: '1234',
      name: 'บัตรตัวอย่าง',
    })

    await createTransaction(category.id, {
      amount: '100',
      creditCardId: card.id,
      description: 'ก่อนวันตัดรอบ',
      direction: 'expense',
      paymentMethod: 'credit_card',
      transactionDate: '2026-09-16',
    })
    await createTransaction(category.id, {
      amount: '200',
      creditCardId: card.id,
      description: 'ตรงวันตัดรอบ',
      direction: 'expense',
      paymentMethod: 'credit_card',
      transactionDate: '2026-09-17',
    })
    const afterCutoff = await createTransaction(category.id, {
      amount: '300',
      creditCardId: card.id,
      description: 'หลังวันตัดรอบ',
      direction: 'expense',
      paymentMethod: 'credit_card',
      transactionDate: '2026-09-18',
    })

    const statements = await getStatements(card.id)
    expect(statements).toEqual([
      expect.objectContaining({
        amountMinor: '30000',
        officialDueDate: '2026-11-01',
        plannedPaymentDate: '2026-10-31',
        purchaseCount: 1,
        statementEndDate: '2026-10-17',
      }),
      expect.objectContaining({
        amountMinor: '30000',
        officialDueDate: '2026-10-01',
        plannedPaymentDate: '2026-09-30',
        purchaseCount: 2,
        statementEndDate: '2026-09-17',
      }),
    ])

    const deactivated = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'PATCH',
      payload: { isActive: false },
      url: `/api/credit-cards/${card.id}/status`,
    })
    expect(deactivated.statusCode).toBe(200)

    const blocked = await createTransactionResponse(category.id, {
      amount: '10',
      creditCardId: card.id,
      description: 'รายการใหม่บนบัตรที่ปิด',
      direction: 'expense',
      paymentMethod: 'credit_card',
      transactionDate: '2026-09-20',
    })
    expect(blocked.statusCode).toBe(409)

    const correction = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      payload: {
        amount: '350',
        categoryId: category.id,
        creditCardId: card.id,
        description: 'ย้ายกลับรอบเดิม',
        direction: 'expense',
        paymentMethod: 'credit_card',
        transactionDate: '2026-09-17',
      },
      url: `/api/transactions/${afterCutoff.id}/corrections`,
    })
    expect(correction.statusCode).toBe(201)

    expect(await getStatements(card.id)).toEqual([
      expect.objectContaining({
        amountMinor: '65000',
        purchaseCount: 3,
        statementEndDate: '2026-09-17',
      }),
    ])
  })

  it('generates exact installments once across concurrent retries', async () => {
    const category = await createCategory('expense', 'ผ่อนชำระสมมติ')
    const idempotencyKey = randomUUID()
    const payload = {
      categoryId: category.id,
      description: 'อุปกรณ์ตัวอย่าง',
      firstPaymentDate: '2026-01-31',
      idempotencyKey,
      installmentAmount: '10.00',
      paymentMethod: 'bank_transfer',
      totalAmount: '100.00',
      totalInstallments: 10,
    }
    const responses = await Promise.all([
      createInstallmentPlanResponse(payload),
      createInstallmentPlanResponse(payload),
    ])
    expect(responses.map(({ statusCode }) => statusCode)).toEqual([201, 201])

    const plans = responses.map((response) =>
      response.json<{
        endDate: string
        id: string
        occurrences: { amountMinor: string; installmentNumber: number }[]
      }>(),
    )
    expect(plans[0]!.id).toBe(plans[1]!.id)
    expect(plans[0]!.endDate).toBe('2026-10-31')
    expect(plans[0]!.occurrences).toHaveLength(10)
    expect(plans[0]!.occurrences.at(-1)).toEqual(
      expect.objectContaining({
        amountMinor: '1000',
        installmentNumber: 10,
      }),
    )

    const rows = await database
      .select({ id: installmentPlans.id })
      .from(installmentPlans)
    const occurrences = await database
      .select({ id: installmentOccurrences.id })
      .from(installmentOccurrences)
    expect(rows).toHaveLength(1)
    expect(occurrences).toHaveLength(10)
  })

  it('tracks paid state, completes N/N, and rejects N+1/N', async () => {
    const category = await createCategory('expense', 'งวดเดียวสมมติ')
    const created = await createInstallmentPlan({
      categoryId: category.id,
      description: 'แผนหนึ่งงวด',
      firstPaymentDate: '2026-09-03',
      idempotencyKey: randomUUID(),
      installmentAmount: '700',
      paymentMethod: 'cash',
      totalAmount: '700',
      totalInstallments: 1,
    })

    const paid = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'PATCH',
      payload: {
        paidAmount: '700',
        paidDate: '2026-09-03',
        status: 'paid',
      },
      url: `/api/installment-plans/${created.id}/occurrences/1`,
    })
    expect(paid.statusCode).toBe(200)
    expect(
      paid.json<{ occurrences: { status: string }[]; status: string }>(),
    ).toEqual(
      expect.objectContaining({
        occurrences: [expect.objectContaining({ status: 'paid' })],
        status: 'completed',
      }),
    )

    const impossible = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'PATCH',
      payload: {
        paidAmount: '700',
        paidDate: '2026-10-03',
        status: 'paid',
      },
      url: `/api/installment-plans/${created.id}/occurrences/2`,
    })
    expect(impossible.statusCode).toBe(404)

    const zeroValueInstallments = await createInstallmentPlanResponse({
      categoryId: category.id,
      description: 'ยอดต่องวดไม่ถูกต้อง',
      firstPaymentDate: '2026-09-03',
      idempotencyKey: randomUUID(),
      installmentAmount: '0',
      paymentMethod: 'cash',
      totalInstallments: 2,
    })
    expect(zeroValueInstallments.statusCode).toBe(400)
  })

  it('settles a plan early and can safely reopen it', async () => {
    const category = await createCategory('expense', 'ผ่อนรถสมมติ')
    const created = await createInstallmentPlan({
      categoryId: category.id,
      description: 'รถตัวอย่าง',
      firstPaymentDate: '2026-01-05',
      idempotencyKey: randomUUID(),
      installmentAmount: '5000',
      paymentMethod: 'bank_transfer',
      totalInstallments: 3,
    })

    await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'PATCH',
      payload: {
        paidAmount: '5000',
        paidDate: '2026-01-05',
        status: 'paid',
      },
      url: `/api/installment-plans/${created.id}/occurrences/1`,
    })
    const settledResponse = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'PATCH',
      payload: {
        closesPlan: true,
        paidAmount: '145000',
        paidDate: '2026-02-05',
        status: 'paid',
      },
      url: `/api/installment-plans/${created.id}/occurrences/2`,
    })
    expect(settledResponse.statusCode).toBe(200)
    const settled = settledResponse.json<{
      occurrences: {
        closesPlan: boolean
        paidAmountMinor: string | null
        status: string
      }[]
      status: string
    }>()
    expect(settled.status).toBe('settled')
    expect(settled.occurrences).toEqual([
      expect.objectContaining({ closesPlan: false, status: 'paid' }),
      expect.objectContaining({
        closesPlan: true,
        paidAmountMinor: '14500000',
        status: 'paid',
      }),
      expect.objectContaining({ closesPlan: false, status: 'cancelled' }),
    ])

    const reopenedResponse = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'PATCH',
      payload: { status: 'unpaid' },
      url: `/api/installment-plans/${created.id}/occurrences/2`,
    })
    expect(reopenedResponse.statusCode).toBe(200)
    const reopened = reopenedResponse.json<{
      occurrences: { closesPlan: boolean; status: string }[]
      status: string
    }>()
    expect(reopened.status).toBe('active')
    expect(reopened.occurrences).toEqual([
      expect.objectContaining({ closesPlan: false, status: 'paid' }),
      expect.objectContaining({ closesPlan: false, status: 'unpaid' }),
      expect.objectContaining({ closesPlan: false, status: 'unpaid' }),
    ])
  })

  it('cancels unpaid installments while preserving paid history', async () => {
    const category = await createCategory('expense', 'เงินกู้สมมติ')
    const created = await createInstallmentPlan({
      categoryId: category.id,
      description: 'ชำระเงินกู้ตัวอย่าง',
      firstPaymentDate: '2025-10-05',
      idempotencyKey: randomUUID(),
      installmentAmount: '1250.75',
      paymentMethod: 'bank_transfer',
      totalInstallments: 60,
    })
    expect(created.endDate).toBe('2030-09-05')
    expect(created.totalAmountMinor).toBeNull()
    expect(created.occurrences[0]!.amountMinor).toBe('125075')

    await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'PATCH',
      payload: {
        paidAmount: '1250.75',
        paidDate: '2025-10-05',
        status: 'paid',
      },
      url: `/api/installment-plans/${created.id}/occurrences/1`,
    })
    const cancelled = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      url: `/api/installment-plans/${created.id}/cancel`,
    })
    expect(cancelled.statusCode).toBe(200)
    const plan = cancelled.json<{
      occurrences: {
        paidAmountMinor: string | null
        paidDate: string | null
        status: string
      }[]
      status: string
    }>()
    expect(plan.status).toBe('cancelled')
    expect(plan.occurrences[0]).toEqual(
      expect.objectContaining({
        paidAmountMinor: '125075',
        paidDate: '2025-10-05',
        status: 'paid',
      }),
    )
    expect(
      plan.occurrences.slice(1).every(({ status }) => status === 'cancelled'),
    ).toBe(true)
  })

  it('validates card configuration and duplicate names', async () => {
    await createCreditCard({
      cutoffDay: 31,
      dueDay: 5,
      maskedSuffix: '5678',
      name: 'บัตรทดสอบ',
    })

    const duplicate = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      payload: {
        cutoffDay: 17,
        dueDay: 1,
        name: '  บัตรทดสอบ  ',
      },
      url: '/api/credit-cards',
    })
    expect(duplicate.statusCode).toBe(409)

    for (const payload of [
      { cutoffDay: 0, dueDay: 1, name: 'วันไม่ถูกต้อง' },
      { cutoffDay: 17, dueDay: 32, name: 'วันไม่ถูกต้อง' },
      { cutoffDay: 17, dueDay: 1, maskedSuffix: '123', name: 'เลขไม่ครบ' },
    ]) {
      const response = await app.inject({
        headers: { cookie, 'x-csrf-token': csrfToken },
        method: 'POST',
        payload,
        url: '/api/credit-cards',
      })
      expect(response.statusCode).toBe(400)
    }
  })

  async function createCategory(direction: 'income' | 'expense', name: string) {
    const response = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      payload: { direction, name },
      url: '/api/categories',
    })
    expect(response.statusCode).toBe(201)
    return response.json<{ id: string }>()
  }

  async function createCreditCard(input: {
    cutoffDay: number
    dueDay: number
    maskedSuffix?: string
    name: string
  }) {
    const response = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      payload: input,
      url: '/api/credit-cards',
    })
    expect(response.statusCode).toBe(201)
    return response.json<{ id: string }>()
  }

  async function createInstallmentPlan(input: Record<string, string | number>) {
    const response = await createInstallmentPlanResponse(input)
    expect(response.statusCode).toBe(201)
    return response.json<{
      endDate: string
      id: string
      occurrences: {
        amountMinor: string | null
        paidAmountMinor: string | null
      }[]
      totalAmountMinor: string | null
    }>()
  }

  function createInstallmentPlanResponse(
    input: Record<string, string | number>,
  ) {
    return app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      payload: input,
      url: '/api/installment-plans',
    })
  }

  async function getStatements(cardId: string) {
    const response = await app.inject({
      headers: { cookie },
      method: 'GET',
      url: `/api/credit-card-statements?cardId=${cardId}&dateFrom=2026-09-01&dateTo=2026-10-31`,
    })
    expect(response.statusCode).toBe(200)
    return response.json<{ items: unknown[] }>().items
  }

  async function createTransaction(
    categoryId: string,
    input: Omit<Record<string, string>, 'categoryId'>,
  ) {
    const response = await createTransactionResponse(categoryId, input)
    expect(response.statusCode).toBe(201)
    return response.json<{
      amountMinor: string
      id: string
      status: string
    }>()
  }

  function createTransactionResponse(
    categoryId: string,
    input: Omit<Record<string, string>, 'categoryId'>,
  ) {
    return app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      payload: { ...input, categoryId },
      url: '/api/transactions',
    })
  }

  async function deleteTransactionHistory() {
    for (;;) {
      const rows = await database
        .select({
          correctsTransactionId: transactions.correctsTransactionId,
          id: transactions.id,
        })
        .from(transactions)
      if (rows.length === 0) return

      const referencedIds = new Set(
        rows.flatMap(({ correctsTransactionId }) =>
          correctsTransactionId ? [correctsTransactionId] : [],
        ),
      )
      const leaves = rows.filter(({ id }) => !referencedIds.has(id))
      if (leaves.length === 0)
        throw new Error('Transaction history has a cycle')

      for (const { id } of leaves) {
        await database.delete(transactions).where(eq(transactions.id, id))
      }
    }
  }
})
