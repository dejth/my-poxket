import argon2 from 'argon2'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { ApiConfig } from '../config.js'
import type { Database } from '../database/client.js'
import { sessions, users } from '../database/schema.js'
import { findSession, getSessionCookieName } from './authorization.js'
import { createSessionRecord } from './session.js'

const loginSchema = z.object({
  password: z.string().min(1).max(256),
  rememberMe: z.boolean().default(false),
  username: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .transform((value) => value.toLowerCase()),
})

interface AuthRoutesOptions {
  readonly config: ApiConfig
  readonly database: Database
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  { config, database }: AuthRoutesOptions,
) {
  const cookieName = getSessionCookieName(config.nodeEnv)
  const dummyPasswordHash = await argon2.hash('not-a-real-user-password', {
    type: argon2.argon2id,
  })

  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_INPUT',
            message: 'ข้อมูลเข้าสู่ระบบไม่ถูกต้อง',
          },
        })
      }

      const [user] = await database
        .select({
          id: users.id,
          isActive: users.isActive,
          passwordHash: users.passwordHash,
          role: users.role,
          username: users.username,
        })
        .from(users)
        .where(eq(users.username, parsed.data.username))
        .limit(1)

      const passwordMatches = await argon2.verify(
        user?.passwordHash ?? dummyPasswordHash,
        parsed.data.password,
      )

      if (!user || !user.isActive || !passwordMatches) {
        return reply.status(401).send({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
          },
        })
      }

      const session = createSessionRecord(user.id, parsed.data.rememberMe)
      await database.insert(sessions).values(session.record)
      reply.setCookie(cookieName, session.token, {
        httpOnly: true,
        maxAge: session.cookieMaxAgeSeconds,
        path: '/',
        sameSite: 'strict',
        secure: config.nodeEnv === 'production',
      })

      return reply.send({
        csrfToken: session.record.csrfToken,
        user: { role: user.role, username: user.username },
      })
    },
  )

  app.get('/api/auth/session', async (request, reply) => {
    const session = await findSession(request.cookies[cookieName], database)
    if (!session) {
      return reply.status(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' },
      })
    }

    return reply.send({
      csrfToken: session.csrfToken,
      user: { role: session.role, username: session.username },
    })
  })

  app.post('/api/auth/logout', async (request, reply) => {
    const session = await findSession(request.cookies[cookieName], database)
    const csrfToken = request.headers['x-csrf-token']

    if (!session || csrfToken !== session.csrfToken) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'ไม่สามารถออกจากระบบได้' },
      })
    }

    await database.delete(sessions).where(eq(sessions.id, session.id))
    reply.clearCookie(cookieName, {
      path: '/',
      sameSite: 'strict',
      secure: config.nodeEnv === 'production',
    })
    return reply.status(204).send()
  })
}
