import { sql } from 'drizzle-orm'
import {
  type AnyMySqlColumn,
  bigint,
  boolean,
  char,
  check,
  date,
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

export const categories = mysqlTable(
  'categories',
  {
    id: char('id', { length: 36 }).notNull(),
    direction: mysqlEnum('direction', ['income', 'expense']).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    normalizedName: varchar('normalized_name', { length: 100 }).notNull(),
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
    uniqueIndex('categories_direction_name_unique').on(
      table.direction,
      table.normalizedName,
    ),
    index('categories_direction_active_index').on(
      table.direction,
      table.isActive,
    ),
  ],
)

export const transactions = mysqlTable(
  'transactions',
  {
    id: char('id', { length: 36 }).notNull(),
    direction: mysqlEnum('direction', ['income', 'expense']).notNull(),
    amountMinor: bigint('amount_minor', {
      mode: 'bigint',
      unsigned: true,
    }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('THB'),
    transactionDate: date('transaction_date', { mode: 'string' }).notNull(),
    description: varchar('description', { length: 255 }).notNull(),
    categoryId: char('category_id', { length: 36 })
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    paymentMethod: mysqlEnum('payment_method', [
      'cash',
      'bank_transfer',
      'debit_card',
      'other',
      'credit_card',
    ]).notNull(),
    status: mysqlEnum('status', ['active', 'superseded', 'cancelled'])
      .notNull()
      .default('active'),
    correctsTransactionId: char('corrects_transaction_id', {
      length: 36,
    }).references((): AnyMySqlColumn => transactions.id, {
      onDelete: 'restrict',
    }),
    createdByUserId: char('created_by_user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
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
    check('transactions_amount_positive', sql`${table.amountMinor} > 0`),
    check(
      'transactions_amount_maximum',
      sql`${table.amountMinor} <= 99999999999`,
    ),
    check('transactions_currency_thb', sql`${table.currency} = 'THB'`),
    check(
      'transactions_credit_card_expense_only',
      sql`${table.paymentMethod} <> 'credit_card' OR ${table.direction} = 'expense'`,
    ),
    uniqueIndex('transactions_correction_unique').on(
      table.correctsTransactionId,
    ),
    index('transactions_date_index').on(table.transactionDate),
    index('transactions_direction_date_index').on(
      table.direction,
      table.transactionDate,
    ),
    index('transactions_category_date_index').on(
      table.categoryId,
      table.transactionDate,
    ),
    index('transactions_status_date_index').on(
      table.status,
      table.transactionDate,
    ),
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
