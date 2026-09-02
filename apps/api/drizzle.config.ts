import { defineConfig } from 'drizzle-kit'

import { loadApiConfig } from './src/config.js'

const config = loadApiConfig()

export default defineConfig({
  dbCredentials: {
    url: config.databaseUrl,
  },
  dialect: 'mysql',
  out: './drizzle',
  schema: './src/database/schema.ts',
  strict: true,
  verbose: true,
})
