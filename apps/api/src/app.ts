import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, { LogController } from 'fastify'

import { registerAuthRoutes } from './auth/routes.js'
import type { ApiConfig } from './config.js'
import { createDatabase } from './database/client.js'
import { registerFinanceRoutes } from './finance/routes.js'

export async function createApp(config: ApiConfig) {
  const app = Fastify({
    logController: new LogController({ disableRequestLogging: true }),
    logger:
      config.nodeEnv === 'production' ? { level: 'info' } : { level: 'warn' },
    trustProxy: config.nodeEnv === 'production',
  })

  const { connection, database } = createDatabase(config)
  app.addHook('onClose', async () => connection.end())

  await app.register(cookie)
  await app.register(helmet, {
    contentSecurityPolicy: false,
  })
  await app.register(rateLimit, {
    global: false,
  })

  app.get('/api/health', () => ({
    service: 'my-poxket-api',
    status: 'ok',
  }))

  await registerAuthRoutes(app, { config, database })
  registerFinanceRoutes(app, { config, database })

  app.setErrorHandler((error, request, reply) => {
    const isRateLimited =
      error instanceof Error &&
      'statusCode' in error &&
      error.statusCode === 429
    const statusCode: 429 | 500 = isRateLimited ? 429 : 500
    const errorName = error instanceof Error ? error.name : 'UnknownError'
    request.log.error({ errorName, statusCode }, 'Request failed')
    void reply.status(statusCode).send({
      error: {
        code: statusCode === 429 ? 'RATE_LIMITED' : 'REQUEST_FAILED',
        message:
          statusCode === 429
            ? 'มีคำขอมากเกินไป กรุณาลองใหม่ภายหลัง'
            : 'The request could not be completed.',
      },
    })
  })

  return app
}
