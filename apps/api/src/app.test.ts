import { afterEach, describe, expect, it } from 'vitest'

import { createApp } from './app.js'
import type { ApiConfig } from './config.js'

const testConfig: ApiConfig = {
  bootstrapPassword: undefined,
  bootstrapUsername: undefined,
  databaseUrl: 'mysql://test:test@127.0.0.1:3307/test',
  host: '127.0.0.1',
  nodeEnv: 'test',
  port: 3000,
  webOrigin: 'http://localhost:5173',
}

const apps: Awaited<ReturnType<typeof createApp>>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()))
})

describe('API health endpoint', () => {
  it('returns only non-sensitive service status', async () => {
    const app = await createApp(testConfig)
    apps.push(app)
    const response = await app.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      service: 'my-poxket-api',
      status: 'ok',
    })
  })
})
