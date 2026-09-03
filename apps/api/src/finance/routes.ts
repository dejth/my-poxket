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
  cancelInstallmentPlan,
  cancelTransaction,
  correctTransaction,
  createCategory,
  createCreditCard,
  createInstallmentPlan,
  createTransaction,
  getTransaction,
  listCategories,
  listCreditCards,
  listCreditCardStatements,
  listInstallmentPlans,
  listTransactions,
  setCategoryActive,
  setCreditCardActive,
  setInstallmentOccurrenceStatus,
} from './service.js'

const directionSchema = z.enum(['income', 'expense'])
const paymentMethodSchema = z.enum([
  'cash',
  'bank_transfer',
  'debit_card',
  'other',
  'credit_card',
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
const creditCardInputSchema = z.object({
  cutoffDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  maskedSuffix: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  name: z.string().min(1).max(100),
})
const transactionInputSchema = z.object({
  amount: z.string().min(1).max(32),
  categoryId: identifierSchema,
  creditCardId: identifierSchema.nullish(),
  description: z.string().min(1).max(255),
  direction: directionSchema,
  paymentMethod: paymentMethodSchema,
  transactionDate: localDateSchema,
})
const installmentPlanInputSchema = z.object({
  categoryId: identifierSchema,
  creditCardId: identifierSchema.nullish(),
  description: z.string().min(1).max(255),
  firstPaymentDate: localDateSchema,
  idempotencyKey: identifierSchema,
  installmentAmount: z.string().min(1).max(32),
  paymentMethod: paymentMethodSchema,
  totalAmount: z.string().min(1).max(32).optional(),
  totalInstallments: z.number().int().min(1).max(65_535),
})
const installmentStatusSchema = z.discriminatedUnion('status', [
  z.object({
    closesPlan: z.boolean().default(false),
    paidAmount: z.string().min(1).max(32),
    paidDate: localDateSchema,
    status: z.literal('paid'),
  }),
  z.object({ status: z.literal('unpaid') }),
])
const transactionQuerySchema = z
  .object({
    categoryId: identifierSchema.optional(),
    creditCardId: identifierSchema.optional(),
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
const statementQuerySchema = z
  .object({
    cardId: identifierSchema.optional(),
    dateFrom: localDateSchema,
    dateTo: localDateSchema,
  })
  .refine(({ dateFrom, dateTo }) => dateFrom <= dateTo, {
    message: 'วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด',
  })

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

  app.get('/api/credit-cards', async (request, reply) => {
    const session = await authenticate(request, reply, cookieName, database)
    if (!session) return
    return reply.send({ items: await listCreditCards(database) })
  })

  app.post('/api/credit-cards', async (request, reply) => {
    const session = await authorizeMutation(
      request,
      reply,
      cookieName,
      database,
    )
    if (!session) return
    const input = creditCardInputSchema.safeParse(request.body)
    if (!input.success) return sendInvalidInput(reply)

    try {
      return reply
        .status(201)
        .send(await createCreditCard(database, input.data))
    } catch (error) {
      return sendFinanceError(reply, error)
    }
  })

  app.patch('/api/credit-cards/:id/status', async (request, reply) => {
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
        await setCreditCardActive(
          database,
          params.data.id,
          input.data.isActive,
        ),
      )
    } catch (error) {
      return sendFinanceError(reply, error)
    }
  })

  app.get('/api/credit-card-statements', async (request, reply) => {
    const session = await authenticate(request, reply, cookieName, database)
    if (!session) return
    const query = statementQuerySchema.safeParse(request.query)
    if (!query.success)
      return sendInvalidInput(reply, query.error.issues[0]?.message)

    try {
      return reply.send({
        items: await listCreditCardStatements(database, query.data),
      })
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

  app.get('/api/installment-plans', async (request, reply) => {
    const session = await authenticate(request, reply, cookieName, database)
    if (!session) return
    return reply.send({ items: await listInstallmentPlans(database) })
  })

  app.post('/api/installment-plans', async (request, reply) => {
    const session = await authorizeMutation(
      request,
      reply,
      cookieName,
      database,
    )
    if (!session) return
    const input = installmentPlanInputSchema.safeParse(request.body)
    if (!input.success) return sendInvalidInput(reply)

    try {
      return reply
        .status(201)
        .send(await createInstallmentPlan(database, session.userId, input.data))
    } catch (error) {
      return sendFinanceError(reply, error)
    }
  })

  app.patch(
    '/api/installment-plans/:id/occurrences/:installmentNumber',
    async (request, reply) => {
      const session = await authorizeMutation(
        request,
        reply,
        cookieName,
        database,
      )
      if (!session) return
      const params = z
        .object({
          id: identifierSchema,
          installmentNumber: z.coerce.number().int().min(1).max(65_535),
        })
        .safeParse(request.params)
      const input = installmentStatusSchema.safeParse(request.body)
      if (!params.success || !input.success) return sendInvalidInput(reply)

      try {
        return reply.send(
          await setInstallmentOccurrenceStatus(
            database,
            params.data.id,
            params.data.installmentNumber,
            input.data,
          ),
        )
      } catch (error) {
        return sendFinanceError(reply, error)
      }
    },
  )

  app.post('/api/installment-plans/:id/cancel', async (request, reply) => {
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
      return reply.send(await cancelInstallmentPlan(database, params.data.id))
    } catch (error) {
      return sendFinanceError(reply, error)
    }
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
