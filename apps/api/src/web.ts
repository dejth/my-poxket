import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import staticFiles from '@fastify/static'
import type { FastifyInstance } from 'fastify'

export async function registerWeb(
  app: FastifyInstance,
  root = fileURLToPath(new URL('../../../public/', import.meta.url)),
) {
  // Development uses the Vite server; a packaged application contains public/.
  if (!existsSync(root)) return

  await app.register(staticFiles, {
    root,
    dotfiles: 'ignore',
    cacheControl: false,
    setHeaders(response) {
      response.header('Cache-Control', 'no-store')
      response.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      )
    },
  })
  app.setNotFoundHandler((request, reply) => {
    let path: string
    try {
      path = decodeURIComponent(
        new URL(request.url, 'http://localhost').pathname,
      )
    } catch {
      return reply.code(404).send({ error: { code: 'NOT_FOUND' } })
    }
    if (
      (request.method === 'GET' || request.method === 'HEAD') &&
      request.headers.accept?.includes('text/html') &&
      !/^\/(api|assets)(\/|$)/.test(path) &&
      !path.includes('.')
    ) {
      return reply.sendFile('index.html')
    }
    return reply.code(404).send({ error: { code: 'NOT_FOUND' } })
  })
}
