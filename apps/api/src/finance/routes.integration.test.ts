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
  creditCardStatementPayments,
  installmentOccurrences,
  installmentPlans,
  recurringExpenseOccurrences,
  recurringExpenseRules,
  sessions,
  transactions,
  users,
} from '../database/schema.js'
import { getDashboardSummary, todayInBangkok } from './service.js'

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
    await database.delete(recurringExpenseOccurrences)
    await database.delete(recurringExpenseRules)
    await database.delete(installmentOccurrences)
    await database.delete(installmentPlans)
    await database.delete(creditCardStatementPayments)
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
    await database.delete(recurringExpenseOccurrences)
    await database.delete(recurringExpenseRules)
    await database.delete(installmentOccurrences)
    await database.delete(installmentPlans)
    await database.delete(creditCardStatementPayments)
    await deleteTransactionHistory()
    await database.delete(creditCards)
    await database.delete(categories)
  })

  afterAll(async () => {
    if (app) await app.close()
    await database.delete(sessions)
    await database.delete(recurringExpenseOccurrences)
    await database.delete(recurringExpenseRules)
    await database.delete(installmentOccurrences)
    await database.delete(installmentPlans)
    await database.delete(creditCardStatementPayments)
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

    const materializeWithoutCsrf = await app.inject({
      headers: { cookie },
      method: 'POST',
      url: '/api/recurring-expenses/materialize',
    })
    expect(materializeWithoutCsrf.statusCode).toBe(403)
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

  it('reconciles activity, cash flow, payables, and early-payoff history', async () => {
    expect(todayInBangkok(new Date('2026-08-31T16:59:59.999Z'))).toBe(
      '2026-08-31',
    )
    expect(todayInBangkok(new Date('2026-08-31T17:00:00.000Z'))).toBe(
      '2026-09-01',
    )
    const incomeCategory = await createCategory('income', 'รายได้สรุปสมมติ')
    const expenseCategory = await createCategory('expense', 'รายจ่ายสรุปสมมติ')
    const card = await createCreditCard({
      cutoffDay: 17,
      dueDay: 1,
      maskedSuffix: '1234',
      name: 'บัตรสรุปสมมติ',
    })
    await createTransaction(incomeCategory.id, {
      amount: '5000',
      description: 'รายรับตัวอย่าง',
      direction: 'income',
      paymentMethod: 'bank_transfer',
      transactionDate: '2026-09-01',
    })
    await createTransaction(expenseCategory.id, {
      amount: '100',
      description: 'เงินสดตัวอย่าง',
      direction: 'expense',
      paymentMethod: 'cash',
      transactionDate: '2026-09-01',
    })
    await createTransaction(expenseCategory.id, {
      amount: '300',
      creditCardId: card.id,
      description: 'ยอดซื้อบัตรตัวอย่าง',
      direction: 'expense',
      paymentMethod: 'credit_card',
      transactionDate: '2026-09-17',
    })

    const installments = await createInstallmentPlan({
      categoryId: expenseCategory.id,
      description: 'แผนผ่อนตัวอย่าง',
      firstPaymentDate: '2026-09-01',
      idempotencyKey: randomUUID(),
      installmentAmount: '100',
      paymentMethod: 'bank_transfer',
      totalInstallments: 2,
    })
    await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'PATCH',
      payload: {
        paidAmount: '150',
        paidDate: '2026-09-01',
        status: 'paid',
      },
      url: `/api/installment-plans/${installments.id}/occurrences/1`,
    })

    const settlementPlan = await createInstallmentPlan({
      categoryId: expenseCategory.id,
      description: 'ปิดยอดก่อนกำหนดตัวอย่าง',
      firstPaymentDate: '2026-09-02',
      idempotencyKey: randomUUID(),
      installmentAmount: '100',
      paymentMethod: 'bank_transfer',
      totalInstallments: 3,
    })
    await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'PATCH',
      payload: {
        closesPlan: true,
        paidAmount: '900',
        paidDate: '2026-09-02',
        status: 'paid',
      },
      url: `/api/installment-plans/${settlementPlan.id}/occurrences/1`,
    })

    const recurringResponse = await createRecurringExpenseResponse({
      amount: '50',
      categoryId: expenseCategory.id,
      description: 'รายการประจำสรุปสมมติ',
      idempotencyKey: randomUUID(),
      paymentMethod: 'bank_transfer',
      recurrenceDay: 1,
      startDate: '2026-09-01',
    })
    const recurring = recurringResponse.json<{ id: string }>()
    await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'PATCH',
      payload: {
        paidAmount: '55',
        paidDate: '2026-09-01',
        status: 'paid',
      },
      url: `/api/recurring-expenses/${recurring.id}/occurrences/2026-09`,
    })

    const initialSummary = await getDashboard('2026-09')
    const summaryResponse = await app.inject({
      headers: { cookie },
      method: 'GET',
      url: '/api/dashboard-summary?period=2026-09',
    })
    expect(summaryResponse.statusCode).toBe(200)
    expect(initialSummary.activity).toEqual(
      expect.objectContaining({
        expenseMinor: '40000',
        incomeMinor: '500000',
        netMinor: '460000',
      }),
    )
    expect(initialSummary.cashFlow).toEqual({
      inflowMinor: '500000',
      netMinor: '379500',
      outflowMinor: '120500',
    })
    expect(initialSummary.payables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountMinor: '30000',
          dueDate: '2026-09-30',
          officialDueDate: '2026-10-01',
          source: 'credit_card_statement',
        }),
        expect.objectContaining({
          amountMinor: '10000',
          dueDate: '2026-10-01',
          source: 'installment',
        }),
        expect.objectContaining({
          amountMinor: '5000',
          dueDate: '2026-10-01',
          source: 'recurring',
        }),
      ]),
    )
    expect(
      initialSummary.payables.some(({ title }) =>
        title.includes('ปิดยอดก่อนกำหนด'),
      ),
    ).toBe(false)
    const settlementHistory = initialSummary.history.filter(({ title }) =>
      title.includes('ปิดยอดก่อนกำหนด'),
    )
    expect(settlementHistory).toHaveLength(1)
    expect(settlementHistory[0]).toEqual(
      expect.objectContaining({ amountMinor: '90000', status: 'paid' }),
    )
    expect(settlementHistory[0]?.context).toContain('ปิดยอดก่อนกำหนด')

    const overdueSummary = await getDashboardSummary(
      database,
      '2026-09',
      '2026-10-02',
    )
    const overdueItems = overdueSummary.payables.filter(
      ({ dueDate }) => dueDate <= '2026-10-01',
    )
    expect(overdueItems).toHaveLength(3)
    expect(overdueItems.every(({ status }) => status === 'overdue')).toBe(true)

    const octoberSummary = await getDashboard('2026-10')
    expect(octoberSummary.payables).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'ปิดยอดก่อนกำหนดตัวอย่าง' }),
      ]),
    )
    expect(octoberSummary.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'cancelled',
          title: 'ปิดยอดก่อนกำหนดตัวอย่าง',
        }),
      ]),
    )

    const paidStatement = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'PATCH',
      payload: {
        paidAmount: '310',
        paidDate: '2026-09-30',
        status: 'paid',
      },
      url: `/api/credit-card-statements/${card.id}/2026-09-17/payment`,
    })
    expect(paidStatement.statusCode).toBe(200)
    expect(paidStatement.json()).toEqual(
      expect.objectContaining({
        paidAmountMinor: '31000',
        paidDate: '2026-09-30',
        status: 'paid',
      }),
    )

    const paidSummary = await getDashboard('2026-09')
    expect(paidSummary.cashFlow).toEqual({
      inflowMinor: '500000',
      netMinor: '348500',
      outflowMinor: '151500',
    })
    expect(
      paidSummary.payables.some(
        ({ source }) => source === 'credit_card_statement',
      ),
    ).toBe(false)
    expect(paidSummary.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountMinor: '31000',
          source: 'credit_card_statement',
          status: 'paid',
        }),
      ]),
    )

    const reverted = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'PATCH',
      payload: { status: 'unpaid' },
      url: `/api/credit-card-statements/${card.id}/2026-09-17/payment`,
    })
    expect(reverted.statusCode).toBe(200)
    expect(reverted.json()).toEqual(
      expect.objectContaining({
        paidAmountMinor: null,
        paidDate: null,
        status: 'unpaid',
      }),
    )
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

  it('materializes recurring months once and clamps short months', async () => {
    const category = await createCategory('expense', 'ค่าสมาชิกสมมติ')
    const idempotencyKey = randomUUID()
    const payload = {
      amount: '700',
      categoryId: category.id,
      description: 'บริการสมมติรายเดือน',
      idempotencyKey,
      paymentMethod: 'bank_transfer',
      recurrenceDay: 31,
      startDate: '2026-01-31',
    }
    const responses = await Promise.all([
      createRecurringExpenseResponse(payload),
      createRecurringExpenseResponse(payload),
    ])
    expect(responses.map(({ statusCode }) => statusCode)).toEqual([201, 201])
    const rules = responses.map((response) =>
      response.json<{
        id: string
        occurrences: { dueDate: string; recurrencePeriod: string }[]
      }>(),
    )
    expect(rules[0]!.id).toBe(rules[1]!.id)
    expect(rules[0]!.occurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dueDate: '2026-01-31',
          recurrencePeriod: '2026-01',
        }),
        expect.objectContaining({
          dueDate: '2026-02-28',
          recurrencePeriod: '2026-02',
        }),
      ]),
    )

    const rows = await database
      .select({ period: recurringExpenseOccurrences.recurrencePeriod })
      .from(recurringExpenseOccurrences)
    expect(new Set(rows.map(({ period }) => period)).size).toBe(rows.length)
  })

  it('preserves paid history, edits future periods, and stops explicitly', async () => {
    const category = await createCategory('expense', 'บริการรายเดือนสมมติ')
    const today = bangkokToday()
    const currentPeriod = today.slice(0, 7)
    const nextPeriod = nextPeriodAfter(currentPeriod)
    const createdResponse = await createRecurringExpenseResponse({
      amount: '100',
      categoryId: category.id,
      description: 'รายการประจำเดิม',
      idempotencyKey: randomUUID(),
      paymentMethod: 'cash',
      recurrenceDay: 1,
      startDate: '2026-01-01',
    })
    expect(createdResponse.statusCode).toBe(201)
    const created = createdResponse.json<{ id: string }>()

    const paid = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'PATCH',
      payload: { paidAmount: '100', paidDate: '2026-01-01', status: 'paid' },
      url: `/api/recurring-expenses/${created.id}/occurrences/2026-01`,
    })
    expect(paid.statusCode).toBe(200)

    const edited = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'PATCH',
      payload: {
        amount: '125',
        categoryId: category.id,
        description: 'รายการประจำใหม่',
        paymentMethod: 'cash',
        recurrenceDay: 15,
        startDate: '2026-01-01',
      },
      url: `/api/recurring-expenses/${created.id}`,
    })
    expect(edited.statusCode).toBe(200)
    const editedRule = edited.json<{
      occurrences: {
        amountMinor: string
        description: string
        recurrencePeriod: string
        status: string
      }[]
    }>()
    expect(
      editedRule.occurrences.find(
        ({ recurrencePeriod }) => recurrencePeriod === '2026-01',
      ),
    ).toEqual(
      expect.objectContaining({
        amountMinor: '10000',
        description: 'รายการประจำเดิม',
        status: 'paid',
      }),
    )
    expect(
      editedRule.occurrences.find(
        ({ recurrencePeriod }) => recurrencePeriod === currentPeriod,
      ),
    ).toEqual(
      expect.objectContaining({
        amountMinor: '12500',
        description: 'รายการประจำใหม่',
      }),
    )

    const stopped = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      payload: { futureOccurrences: 'cancel' },
      url: `/api/recurring-expenses/${created.id}/stop`,
    })
    expect(stopped.statusCode).toBe(200)
    const stoppedRule = stopped.json<{
      occurrences: { recurrencePeriod: string; status: string }[]
      status: string
    }>()
    expect(stoppedRule.status).toBe('stopped')
    expect(
      stoppedRule.occurrences.find(
        ({ recurrencePeriod }) => recurrencePeriod === nextPeriod,
      ),
    ).toEqual(expect.objectContaining({ status: 'cancelled' }))
    expect(
      stoppedRule.occurrences.find(
        ({ recurrencePeriod }) => recurrencePeriod === '2026-01',
      ),
    ).toEqual(expect.objectContaining({ status: 'paid' }))

    const retainedResponse = await createRecurringExpenseResponse({
      amount: '50',
      categoryId: category.id,
      description: 'รายการที่คงไว้',
      idempotencyKey: randomUUID(),
      paymentMethod: 'cash',
      recurrenceDay: 28,
      startDate: `${currentPeriod}-01`,
    })
    const retainedRule = retainedResponse.json<{ id: string }>()
    const retained = await app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      payload: { futureOccurrences: 'retain' },
      url: `/api/recurring-expenses/${retainedRule.id}/stop`,
    })
    expect(
      retained
        .json<{
          occurrences: { recurrencePeriod: string; status: string }[]
        }>()
        .occurrences.find(
          ({ recurrencePeriod }) => recurrencePeriod === nextPeriod,
        ),
    ).toEqual(expect.objectContaining({ status: 'unpaid' }))
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

  function createRecurringExpenseResponse(
    input: Record<string, string | number>,
  ) {
    return app.inject({
      headers: { cookie, 'x-csrf-token': csrfToken },
      method: 'POST',
      payload: input,
      url: '/api/recurring-expenses',
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

  async function getDashboard(period: string) {
    return getDashboardSummary(database, period, '2026-09-01')
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

function bangkokToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).formatToParts(new Date())
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  )
  return `${values.year}-${values.month}-${values.day}`
}

function nextPeriodAfter(period: string) {
  const [year, month] = period.split('-').map(Number)
  const monthIndex = (year ?? 0) * 12 + (month ?? 1)
  return `${Math.floor(monthIndex / 12)}-${String((monthIndex % 12) + 1).padStart(2, '0')}`
}
