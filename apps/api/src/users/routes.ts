import { randomUUID } from 'node:crypto'

import argon2 from 'argon2'
import { asc, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { findSession, getSessionCookieName } from '../auth/authorization.js'
import type { ApiConfig } from '../config.js'
import type { Database } from '../database/client.js'
import { sessions, users } from '../database/schema.js'
import { isDuplicateEntry } from '../finance/errors.js'

const userInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    username: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .transform((value) => value.toLowerCase()),
    password: z.string().min(12).max(256),
  })
  .strict()
const editInput = userInput.extend({
  password: z.union([userInput.shape.password, z.literal('')]).optional(),
})
const publicUser = { id: users.id, name: users.name, username: users.username }

export function registerUserRoutes(
  app: FastifyInstance,
  {
    config,
    database,
  }: {
    readonly config: ApiConfig
    readonly database: Database
  },
) {
  async function owner(
    request: FastifyRequest,
    reply: FastifyReply,
    mutation = false,
  ) {
    const session = await findSession(
      request.cookies[getSessionCookieName(config.nodeEnv)],
      database,
    )
    if (!session) {
      void reply.status(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' },
      })
      return
    }
    if (
      session.role !== 'owner' ||
      (mutation && request.headers['x-csrf-token'] !== session.csrfToken)
    ) {
      void reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'เฉพาะเจ้าของบัญชีเท่านั้นที่จัดการผู้ใช้ได้',
        },
      })
      return
    }
    return session
  }

  app.get('/api/users', async (request, reply) => {
    if (!(await owner(request, reply))) return
    return {
      items: await database
        .select(publicUser)
        .from(users)
        .orderBy(asc(users.name), asc(users.username)),
    }
  })

  app.post(
    '/api/users',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!(await owner(request, reply, true))) return
      const parsed = userInput.safeParse(request.body)
      if (!parsed.success) return invalidInput(reply)
      const { password, ...input } = parsed.data
      const user = { ...input, id: randomUUID() }
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      })
      try {
        await database
          .insert(users)
          .values({ ...user, passwordHash, role: 'member', isActive: true })
      } catch (error) {
        if (isDuplicateEntry(error)) return duplicateUsername(reply)
        throw error
      }
      return reply.status(201).send(user)
    },
  )

  app.patch(
    '/api/users/:id',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const current = await owner(request, reply, true)
      if (!current) return
      const params = z.object({ id: z.uuid() }).safeParse(request.params)
      const parsed = editInput.safeParse(request.body)
      if (!params.success || !parsed.success) return invalidInput(reply)
      const { password, ...input } = parsed.data
      const id = params.data.id
      const passwordHash = password
        ? await argon2.hash(password, { type: argon2.argon2id })
        : undefined
      try {
        const found = await database.transaction(async (tx) => {
          const [existing] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, id))
            .for('update')
          if (!existing) return false
          await tx
            .update(users)
            .set({ ...input, ...(passwordHash ? { passwordHash } : {}) })
            .where(eq(users.id, id))
          if (passwordHash)
            await tx.delete(sessions).where(eq(sessions.userId, id))
          return true
        })
        if (!found)
          return reply
            .status(404)
            .send({ error: { code: 'USER_NOT_FOUND', message: 'ไม่พบผู้ใช้' } })
      } catch (error) {
        if (isDuplicateEntry(error)) return duplicateUsername(reply)
        throw error
      }
      return {
        ...input,
        id,
        requiresLogin: Boolean(passwordHash && current.userId === id),
      }
    },
  )
}

function invalidInput(reply: FastifyReply) {
  return reply.status(400).send({
    error: {
      code: 'INVALID_INPUT',
      message: 'กรุณาตรวจชื่อ ชื่อผู้ใช้ และรหัสผ่านอย่างน้อย 12 ตัวอักษร',
    },
  })
}

function duplicateUsername(reply: FastifyReply) {
  return reply.status(409).send({
    error: {
      code: 'USERNAME_ALREADY_EXISTS',
      message: 'ชื่อผู้ใช้นี้มีอยู่แล้ว',
    },
  })
}
