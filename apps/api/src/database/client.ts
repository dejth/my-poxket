import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'

import type { ApiConfig } from '../config.js'
import * as schema from './schema.js'

export function createDatabase(config: Pick<ApiConfig, 'databaseUrl'>) {
  const pool = mysql.createPool(config.databaseUrl)

  return {
    connection: pool,
    database: drizzle(pool, { mode: 'default', schema }),
  }
}

export type Database = ReturnType<typeof createDatabase>['database']
