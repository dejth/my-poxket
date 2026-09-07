import { randomUUID } from 'node:crypto'

import argon2 from 'argon2'
import { count, eq } from 'drizzle-orm'

import { loadApiConfig } from '../config.js'
import { createDatabase } from '../database/client.js'
import { appSettings, users } from '../database/schema.js'

const config = loadApiConfig()

if (!config.bootstrapUsername || !config.bootstrapPassword) {
  throw new Error(
    'Bootstrap credentials are required. Use DEV_BOOTSTRAP_* locally or BOOTSTRAP_* in a controlled production command.',
  )
}

const bootstrapUsername = config.bootstrapUsername.trim().toLowerCase()
const bootstrapPassword = config.bootstrapPassword

const { connection, database } = createDatabase(config)

try {
  const [ownerCount] = await database
    .select({ value: count() })
    .from(users)
    .where(eq(users.role, 'owner'))

  if ((ownerCount?.value ?? 0) > 0) {
    throw new Error(
      'An owner account already exists; bootstrap is one-time only.',
    )
  }

  const passwordHash = await argon2.hash(bootstrapPassword, {
    type: argon2.argon2id,
  })

  await database.transaction(async (transaction) => {
    await transaction.insert(users).values({
      id: randomUUID(),
      name: bootstrapUsername,
      isActive: true,
      passwordHash,
      role: 'owner',
      username: bootstrapUsername,
    })
    await transaction
      .insert(appSettings)
      .values({
        currency: 'THB',
        decimalPlaces: 2,
        id: 1,
        timezone: 'Asia/Bangkok',
      })
      .onDuplicateKeyUpdate({ set: { id: 1 } })
  })

  console.info(`Owner account created for username: ${bootstrapUsername}`)
} finally {
  await connection.end()
}
