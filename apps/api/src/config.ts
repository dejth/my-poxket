import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import { z } from 'zod'

const LOCAL_ENV_PATH = fileURLToPath(new URL('../../../.env', import.meta.url))

const apiConfigSchema = z.object({
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  BOOTSTRAP_PASSWORD: z.string().min(12).optional(),
  BOOTSTRAP_USERNAME: z.string().min(3).max(64).optional(),
  DATABASE_URL: z.url().startsWith('mysql://'),
  DEV_BOOTSTRAP_PASSWORD: z.string().min(12).optional(),
  DEV_BOOTSTRAP_USERNAME: z.string().min(3).max(64).optional(),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
})

export interface ApiConfig {
  readonly bootstrapPassword: string | undefined
  readonly bootstrapUsername: string | undefined
  readonly databaseUrl: string
  readonly host: string
  readonly nodeEnv: 'development' | 'test' | 'production'
  readonly port: number
  readonly webOrigin: string
}

export function loadApiConfig(environment = process.env): ApiConfig {
  dotenv.config({ path: LOCAL_ENV_PATH, quiet: true })
  const parsed = apiConfigSchema.parse(environment)
  const isDevelopment = parsed.NODE_ENV === 'development'

  return {
    bootstrapPassword: isDevelopment
      ? parsed.DEV_BOOTSTRAP_PASSWORD
      : parsed.BOOTSTRAP_PASSWORD,
    bootstrapUsername: isDevelopment
      ? parsed.DEV_BOOTSTRAP_USERNAME
      : parsed.BOOTSTRAP_USERNAME,
    databaseUrl: parsed.DATABASE_URL,
    host: parsed.API_HOST,
    nodeEnv: parsed.NODE_ENV,
    port: parsed.API_PORT,
    webOrigin: parsed.WEB_ORIGIN,
  }
}
