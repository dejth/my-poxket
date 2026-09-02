import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import {
  findSession,
  getSessionCookieName,
  type AuthenticatedSession,
} from '../auth/authorization.js'
import type { ApiConfig } from '../config.js'
import type { Database } from '../database/client.js'
import { FinanceError } from './errors.js'
import {
  cancelTransaction,
  correctTransaction,
  createCategory,
  createTransaction,
  getTransaction,
  listCategories,
  listTransactions,
  setCategoryActive,
} from './service.js'

const directionSchema = z.enum(['income', 'expense'])
const paymentMethodSchema = z.enum([
  'cash',
  'bank_transfer',
  'debit_card',
  'other',
])
const identifierSchema = z.uuid()
const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidLocalDate)

const categoryInputSchema = z.object({
  direction: directionSchema,
  name: z.string().min(1).max(100),
})
const categoryStatusSchema = z.object({ isActive: z.boolean() })
const transactionInputSchema = z.object({
  amount: z.string().min(1).max(32),
  categoryId: identifierSchema,
  description: z.string().min(1).max(255),
  direction: directionSchema,
  paymentMethod: paymentMethodSchema,
  transactionDate: localDateSchema,
})
const transactionQuerySchema = z
  .object({
    categoryId: identifierSchema.optional(),
    dateFrom: localDateSchema.optional(),
    dateTo: localDateSchema.optional(),
    direction: directionSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    paymentMethod: paymentMethodSchema.optional(),
    search: z.string().trim().max(100).optional(),
    status: z
      .enum(['active', 'superseded', 'cancelled', 'all'])
      .default('active'),
  })
  .refine(
    ({ dateFrom, dateTo }) => !dateFrom || !dateTo || dateFrom <= dateTo,
    { message: 'วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด' },
  )

interface FinanceRoutesOptions {
  readonly config: ApiConfig
  readonly database: Database
}

export function registerFinanceRoutes(
  app: FastifyInstance,
  { config, database }: FinanceRoutesOptions,
) {
  const cookieName = getSessionCookieName(config.nodeEnv)

  app.get('/api/categories', async (request, reply) => {
    const session = await authenticate(request, reply, cookieName, database)
    if (!session) return
    return reply.send({ items: await listCategories(database) })
  })

  app.post('/api/categories', async (request, reply) => {
    const session = await authorizeMutation(
      request,
      reply,
      cookieName,
      database,
    )
    if (!session) return
    const input = categoryInputSchema.safeParse(request.body)
    if (!input.success) return sendInvalidInput(reply)

    try {
      return reply.status(201).send(await createCategory(database, input.data))
    } catch (error) {
      return sendFinanceError(reply, error)
    }
  })

  app.patch('/api/categories/:id/status', async (request, reply) => {
    const session = await authorizeMutation(
      request,
      reply,
      cookieName,
      database,
    )
    if (!session) return
    const params = z.object({ id: identifierSchema }).safeParse(request.params)
    const input = categoryStatusSchema.safeParse(request.body)
    if (!params.success || !input.success) return sendInvalidInput(reply)

    try {
      return reply.send(
        await setCategoryActive(database, params.data.id, input.data.isActive),
      )
    } catch (error) {
      return sendFinanceError(reply, error)
    }
  })

  app.get('/api/transactions', async (request, reply) => {
    const session = await authenticate(request, reply, cookieName, database)
    if (!session) return
    const query = transactionQuerySchema.safeParse(request.query)
    if (!query.success)
      return sendInvalidInput(reply, query.error.issues[0]?.message)

    return reply.send(await listTransactions(database, query.data))
  })

  app.get('/api/transactions/:id', async (request, reply) => {
    const session = await authenticate(request, reply, cookieName, database)
    if (!session) return
    const params = z.object({ id: identifierSchema }).safeParse(request.params)
    if (!params.success) return sendInvalidInput(reply)

    try {
      return reply.send(await getTransaction(database, params.data.id))
    } catch (error) {
      return sendFinanceError(reply, error)
    }
  })

  app.post('/api/transactions', async (request, reply) => {
    const session = await authorizeMutation(
      request,
      reply,
      cookieName,
      database,
    )
    if (!session) return
    const input = transactionInputSchema.safeParse(request.body)
    if (!input.success) return sendInvalidInput(reply)

    try {
      return reply
        .status(201)
        .send(await createTransaction(database, session.userId, input.data))
    } catch (error) {
      return sendFinanceError(reply, error)
    }
  })

  app.post('/api/transactions/:id/corrections', async (request, reply) => {
    const session = await authorizeMutation(
      request,
      reply,
      cookieName,
      database,
    )
    if (!session) return
    const params = z.object({ id: identifierSchema }).safeParse(request.params)
    const input = transactionInputSchema.safeParse(request.body)
    if (!params.success || !input.success) return sendInvalidInput(reply)

    try {
      return reply
        .status(201)
        .send(
          await correctTransaction(
            database,
            session.userId,
            params.data.id,
            input.data,
          ),
        )
    } catch (error) {
      return sendFinanceError(reply, error)
    }
  })

  app.post('/api/transactions/:id/cancel', async (request, reply) => {
    const session = await authorizeMutation(
      request,
      reply,
      cookieName,
      database,
    )
    if (!session) return
    const params = z.object({ id: identifierSchema }).safeParse(request.params)
    if (!params.success) return sendInvalidInput(reply)

    try {
      return reply.send(await cancelTransaction(database, params.data.id))
    } catch (error) {
      return sendFinanceError(reply, error)
    }
  })
}

async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  cookieName: string,
  database: Database,
): Promise<AuthenticatedSession | undefined> {
  const session = await findSession(request.cookies[cookieName], database)
  if (!session) {
    await reply.status(401).send({
      error: { code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' },
    })
  }
  return session
}

async function authorizeMutation(
  request: FastifyRequest,
  reply: FastifyReply,
  cookieName: string,
  database: Database,
): Promise<AuthenticatedSession | undefined> {
  const session = await authenticate(request, reply, cookieName, database)
  if (!session) return undefined

  if (request.headers['x-csrf-token'] !== session.csrfToken) {
    await reply.status(403).send({
      error: { code: 'FORBIDDEN', message: 'ไม่สามารถดำเนินการได้' },
    })
    return undefined
  }
  return session
}

function sendInvalidInput(reply: FastifyReply, message = 'ข้อมูลไม่ถูกต้อง') {
  return reply.status(400).send({
    error: { code: 'INVALID_INPUT', message },
  })
}

function sendFinanceError(reply: FastifyReply, error: unknown) {
  if (error instanceof FinanceError) {
    return reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message },
    })
  }
  throw error
}

function isValidLocalDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === (month ?? 0) - 1 &&
    date.getUTCDate() === day
  )
}
