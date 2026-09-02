import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/mysql2/migrator'

import { loadApiConfig } from '../config.js'
import { createDatabase } from '../database/client.js'

const config = loadApiConfig()
const { connection, database } = createDatabase(config)

try {
  await migrate(database, {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  })
  console.info('Database migrations completed.')
} finally {
  await connection.end()
}
