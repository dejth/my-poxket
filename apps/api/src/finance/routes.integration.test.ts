import { randomUUID } from 'node:crypto'

import argon2 from 'argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../app.js'
import type { ApiConfig } from '../config.js'
import { createDatabase } from '../database/client.js'
import {
  categories,
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
    await database.delete(transactions)
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
    await deleteTransactionHistory()
    await database.delete(categories)
  })

  afterAll(async () => {
    await app.close()
    await database.delete(sessions)
    await deleteTransactionHistory()
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
