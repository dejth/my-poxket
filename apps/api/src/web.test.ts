import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Fastify from 'fastify'
import { expect, it } from 'vitest'

import { registerWeb } from './web.js'

it('serves CSR pages and assets without rewriting API or private-file requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'poxket-web-'))
  const app = Fastify()
  try {
    await mkdir(join(root, 'assets'))
    await writeFile(join(root, 'index.html'), '<div id="root"></div>')
    await writeFile(join(root, 'assets/app.js'), 'console.log("fictional")')
    await writeFile(join(root, '.env'), 'fictional-private-marker')
    app.get('/api/health', () => ({ status: 'ok' }))
    await registerWeb(app, root)
    for (const url of ['/', '/transactions', '/users?tab=1']) {
      const response = await app.inject({
        url,
        headers: { accept: 'text/html' },
      })
      expect(response.statusCode).toBe(200)
      expect(response.body).toContain('<div id="root">')
      expect(response.headers['content-security-policy']).toContain(
        "frame-ancestors 'none'",
      )
    }
    const asset = await app.inject('/assets/app.js')
    expect(asset.statusCode).toBe(200)
    expect(asset.headers['content-type']).toContain('javascript')
    expect((await app.inject('/api/health')).json()).toEqual({ status: 'ok' })
    for (const url of [
      '/api/missing',
      '/assets/missing.js',
      '/.env',
      '/package.json',
      '/%2eenv',
      '/apps/api/dist/server.js',
    ]) {
      const response = await app.inject({
        url,
        headers: { accept: 'text/html' },
      })
      expect(response.statusCode).toBe(404)
      expect(response.body).not.toContain('fictional-private-marker')
      expect(response.body).not.toContain('<div id="root">')
    }
    expect(
      (await app.inject({ method: 'POST', url: '/transactions' })).statusCode,
    ).toBe(404)
  } finally {
    await app.close()
    await rm(root, { recursive: true })
  }
})
