import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  datetime,
  index,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'

export const users = mysqlTable(
  'users',
  {
    id: char('id', { length: 36 }).notNull(),
    username: varchar('username', { length: 64 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: mysqlEnum('role', ['owner', 'member']).notNull().default('member'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: datetime('created_at', { fsp: 6, mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(6)`),
    updatedAt: datetime('updated_at', { fsp: 6, mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(6)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex('users_username_unique').on(table.username),
  ],
)

export const sessions = mysqlTable(
  'sessions',
  {
    id: char('id', { length: 36 }).notNull(),
    userId: char('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    csrfToken: varchar('csrf_token', { length: 64 }).notNull(),
    expiresAt: datetime('expires_at', { fsp: 6, mode: 'date' }).notNull(),
    createdAt: datetime('created_at', { fsp: 6, mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(6)`),
    lastSeenAt: datetime('last_seen_at', { fsp: 6, mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(6)`),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_id_index').on(table.userId),
    index('sessions_expires_at_index').on(table.expiresAt),
  ],
)

export const appSettings = mysqlTable('app_settings', {
  id: tinyint('id', { unsigned: true }).notNull().primaryKey(),
  currency: char('currency', { length: 3 }).notNull().default('THB'),
  timezone: varchar('timezone', { length: 64 })
    .notNull()
    .default('Asia/Bangkok'),
  decimalPlaces: tinyint('decimal_places', { unsigned: true })
    .notNull()
    .default(2),
  createdAt: datetime('created_at', { fsp: 6, mode: 'date' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(6)`),
  updatedAt: datetime('updated_at', { fsp: 6, mode: 'date' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(6)`)
    .$onUpdate(() => new Date()),
})
