import { loadApiConfig } from '../config.js'
import { createDatabase } from '../database/client.js'
import { initializeStarterCategories } from '../finance/starter-categories.js'

const { connection, database } = createDatabase(loadApiConfig())

try {
  await initializeStarterCategories(database)
  console.info('Starter categories initialized. Existing categories preserved.')
} finally {
  await connection.end()
}
