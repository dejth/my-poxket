import { sql } from 'drizzle-orm'
import {
  type AnyMySqlColumn,
  bigint,
  boolean,
  char,
  check,
  date,
  datetime,
  foreignKey,
  index,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  smallint,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'

export const users = mysqlTable(
  'users',
  {
    id: char('id', { length: 36 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
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

export const creditCards = mysqlTable(
  'credit_cards',
  {
    id: char('id', { length: 36 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    normalizedName: varchar('normalized_name', { length: 100 }).notNull(),
    maskedSuffix: char('masked_suffix', { length: 4 }),
    cutoffDay: tinyint('cutoff_day', { unsigned: true }).notNull(),
    dueDay: tinyint('due_day', { unsigned: true }).notNull(),
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
    uniqueIndex('credit_cards_name_unique').on(table.normalizedName),
    check(
      'credit_cards_masked_suffix_format',
      sql`${table.maskedSuffix} IS NULL OR ${table.maskedSuffix} REGEXP '^[0-9]{4}$'`,
    ),
    check(
      'credit_cards_cutoff_day_range',
      sql`${table.cutoffDay} BETWEEN 1 AND 31`,
    ),
    check('credit_cards_due_day_range', sql`${table.dueDay} BETWEEN 1 AND 31`),
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
    creditCardId: char('credit_card_id', { length: 36 }).references(
      () => creditCards.id,
      { onDelete: 'restrict' },
    ),
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
    check(
      'transactions_credit_card_reference',
      sql`(${table.paymentMethod} = 'credit_card' AND ${table.creditCardId} IS NOT NULL) OR (${table.paymentMethod} <> 'credit_card' AND ${table.creditCardId} IS NULL)`,
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
    index('transactions_card_status_date_index').on(
      table.creditCardId,
      table.status,
      table.transactionDate,
    ),
  ],
)

export const creditCardStatementPayments = mysqlTable(
  'credit_card_statement_payments',
  {
    id: char('id', { length: 36 }).notNull(),
    creditCardId: char('credit_card_id', { length: 36 })
      .notNull()
      .references(() => creditCards.id, { onDelete: 'restrict' }),
    statementEndDate: date('statement_end_date', { mode: 'string' }).notNull(),
    status: mysqlEnum('status', ['unpaid', 'paid']).notNull().default('unpaid'),
    paidAmountMinor: bigint('paid_amount_minor', {
      mode: 'bigint',
      unsigned: true,
    }),
    paidDate: date('paid_date', { mode: 'string' }),
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
    uniqueIndex('credit_card_statement_payments_statement_unique').on(
      table.creditCardId,
      table.statementEndDate,
    ),
    check(
      'credit_card_statement_payments_paid_values',
      sql`(${table.status} = 'paid' AND ${table.paidDate} IS NOT NULL AND ${table.paidAmountMinor} IS NOT NULL) OR (${table.status} = 'unpaid' AND ${table.paidDate} IS NULL AND ${table.paidAmountMinor} IS NULL)`,
    ),
    check(
      'credit_card_statement_payments_amount_range',
      sql`${table.paidAmountMinor} IS NULL OR (${table.paidAmountMinor} > 0 AND ${table.paidAmountMinor} <= 99999999999)`,
    ),
    index('credit_card_statement_payments_status_date_index').on(
      table.status,
      table.paidDate,
    ),
  ],
)

export const installmentPlans = mysqlTable(
  'installment_plans',
  {
    id: char('id', { length: 36 }).notNull(),
    idempotencyKey: char('idempotency_key', { length: 36 }).notNull(),
    description: varchar('description', { length: 255 }).notNull(),
    totalAmountMinor: bigint('total_amount_minor', {
      mode: 'bigint',
      unsigned: true,
    }),
    currency: char('currency', { length: 3 }).notNull().default('THB'),
    categoryId: char('category_id', { length: 36 })
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    creditCardId: char('credit_card_id', { length: 36 }).references(
      () => creditCards.id,
      { onDelete: 'restrict' },
    ),
    paymentMethod: mysqlEnum('payment_method', [
      'cash',
      'bank_transfer',
      'debit_card',
      'other',
      'credit_card',
    ]).notNull(),
    firstPaymentDate: date('first_payment_date', { mode: 'string' }).notNull(),
    totalInstallments: smallint('total_installments', {
      unsigned: true,
    }).notNull(),
    status: mysqlEnum('status', ['active', 'completed', 'settled', 'cancelled'])
      .notNull()
      .default('active'),
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
    uniqueIndex('installment_plans_idempotency_key_unique').on(
      table.idempotencyKey,
    ),
    check(
      'installment_plans_amount_positive',
      sql`${table.totalAmountMinor} IS NULL OR ${table.totalAmountMinor} > 0`,
    ),
    check(
      'installment_plans_amount_maximum',
      sql`${table.totalAmountMinor} IS NULL OR ${table.totalAmountMinor} <= 99999999999`,
    ),
    check('installment_plans_currency_thb', sql`${table.currency} = 'THB'`),
    check(
      'installment_plans_total_installments_positive',
      sql`${table.totalInstallments} > 0`,
    ),
    check(
      'installment_plans_credit_card_reference',
      sql`(${table.paymentMethod} = 'credit_card' AND ${table.creditCardId} IS NOT NULL) OR (${table.paymentMethod} <> 'credit_card' AND ${table.creditCardId} IS NULL)`,
    ),
    index('installment_plans_status_index').on(table.status),
  ],
)

export const installmentOccurrences = mysqlTable(
  'installment_occurrences',
  {
    id: char('id', { length: 36 }).notNull(),
    installmentPlanId: char('installment_plan_id', { length: 36 }).notNull(),
    installmentNumber: smallint('installment_number', {
      unsigned: true,
    }).notNull(),
    amountMinor: bigint('amount_minor', {
      mode: 'bigint',
      unsigned: true,
    }).notNull(),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    status: mysqlEnum('status', ['unpaid', 'paid', 'cancelled'])
      .notNull()
      .default('unpaid'),
    paidDate: date('paid_date', { mode: 'string' }),
    paidAmountMinor: bigint('paid_amount_minor', {
      mode: 'bigint',
      unsigned: true,
    }),
    closesPlan: boolean('closes_plan').notNull().default(false),
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
    foreignKey({
      columns: [table.installmentPlanId],
      foreignColumns: [installmentPlans.id],
      name: 'installment_occurrences_plan_fk',
    }).onDelete('restrict'),
    uniqueIndex('installment_occurrences_plan_number_unique').on(
      table.installmentPlanId,
      table.installmentNumber,
    ),
    check(
      'installment_occurrences_number_positive',
      sql`${table.installmentNumber} > 0`,
    ),
    check(
      'installment_occurrences_amount_positive',
      sql`${table.amountMinor} > 0`,
    ),
    check(
      'installment_occurrences_paid_amount_positive',
      sql`${table.paidAmountMinor} IS NULL OR (${table.paidAmountMinor} > 0 AND ${table.paidAmountMinor} <= 99999999999)`,
    ),
    check(
      'installment_occurrences_paid_date_status',
      sql`(${table.status} = 'paid' AND ${table.paidDate} IS NOT NULL AND ${table.paidAmountMinor} IS NOT NULL) OR (${table.status} <> 'paid' AND ${table.paidDate} IS NULL AND ${table.paidAmountMinor} IS NULL)`,
    ),
    check(
      'installment_occurrences_closes_plan_paid',
      sql`${table.closesPlan} = 0 OR ${table.status} = 'paid'`,
    ),
    index('installment_occurrences_status_due_date_index').on(
      table.status,
      table.dueDate,
    ),
  ],
)

export const recurringExpenseRules = mysqlTable(
  'recurring_expense_rules',
  {
    id: char('id', { length: 36 }).notNull(),
    idempotencyKey: char('idempotency_key', { length: 36 }).notNull(),
    description: varchar('description', { length: 255 }).notNull(),
    amountMinor: bigint('amount_minor', {
      mode: 'bigint',
      unsigned: true,
    }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('THB'),
    categoryId: char('category_id', { length: 36 })
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    creditCardId: char('credit_card_id', { length: 36 }).references(
      () => creditCards.id,
      { onDelete: 'restrict' },
    ),
    paymentMethod: mysqlEnum('payment_method', [
      'cash',
      'bank_transfer',
      'debit_card',
      'other',
      'credit_card',
    ]).notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    recurrenceDay: tinyint('recurrence_day', { unsigned: true }).notNull(),
    status: mysqlEnum('status', ['active', 'stopped'])
      .notNull()
      .default('active'),
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
    uniqueIndex('recurring_expense_rules_idempotency_key_unique').on(
      table.idempotencyKey,
    ),
    check(
      'recurring_expense_rules_amount_range',
      sql`${table.amountMinor} > 0 AND ${table.amountMinor} <= 99999999999`,
    ),
    check(
      'recurring_expense_rules_currency_thb',
      sql`${table.currency} = 'THB'`,
    ),
    check(
      'recurring_expense_rules_day_range',
      sql`${table.recurrenceDay} BETWEEN 1 AND 31`,
    ),
    check(
      'recurring_expense_rules_credit_card_reference',
      sql`(${table.paymentMethod} = 'credit_card' AND ${table.creditCardId} IS NOT NULL) OR (${table.paymentMethod} <> 'credit_card' AND ${table.creditCardId} IS NULL)`,
    ),
    index('recurring_expense_rules_status_index').on(table.status),
  ],
)

export const recurringExpenseOccurrences = mysqlTable(
  'recurring_expense_occurrences',
  {
    id: char('id', { length: 36 }).notNull(),
    recurringExpenseRuleId: char('recurring_expense_rule_id', {
      length: 36,
    }).notNull(),
    recurrencePeriod: char('recurrence_period', { length: 7 }).notNull(),
    description: varchar('description', { length: 255 }).notNull(),
    amountMinor: bigint('amount_minor', {
      mode: 'bigint',
      unsigned: true,
    }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('THB'),
    categoryId: char('category_id', { length: 36 })
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    creditCardId: char('credit_card_id', { length: 36 }).references(
      () => creditCards.id,
      { onDelete: 'restrict' },
    ),
    paymentMethod: mysqlEnum('payment_method', [
      'cash',
      'bank_transfer',
      'debit_card',
      'other',
      'credit_card',
    ]).notNull(),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    status: mysqlEnum('status', ['unpaid', 'paid', 'cancelled'])
      .notNull()
      .default('unpaid'),
    paidDate: date('paid_date', { mode: 'string' }),
    paidAmountMinor: bigint('paid_amount_minor', {
      mode: 'bigint',
      unsigned: true,
    }),
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
    foreignKey({
      columns: [table.recurringExpenseRuleId],
      foreignColumns: [recurringExpenseRules.id],
      name: 'recurring_expense_occurrences_rule_fk',
    }).onDelete('restrict'),
    uniqueIndex('recurring_expense_occurrences_rule_period_unique').on(
      table.recurringExpenseRuleId,
      table.recurrencePeriod,
    ),
    check(
      'recurring_expense_occurrences_period_format',
      sql`${table.recurrencePeriod} REGEXP '^[0-9]{4}-[0-9]{2}$'`,
    ),
    check(
      'recurring_expense_occurrences_amount_range',
      sql`${table.amountMinor} > 0 AND ${table.amountMinor} <= 99999999999`,
    ),
    check(
      'recurring_expense_occurrences_currency_thb',
      sql`${table.currency} = 'THB'`,
    ),
    check(
      'recurring_expense_occurrences_credit_card_reference',
      sql`(${table.paymentMethod} = 'credit_card' AND ${table.creditCardId} IS NOT NULL) OR (${table.paymentMethod} <> 'credit_card' AND ${table.creditCardId} IS NULL)`,
    ),
    check(
      'recurring_expense_occurrences_paid_values',
      sql`(${table.status} = 'paid' AND ${table.paidDate} IS NOT NULL AND ${table.paidAmountMinor} IS NOT NULL) OR (${table.status} <> 'paid' AND ${table.paidDate} IS NULL AND ${table.paidAmountMinor} IS NULL)`,
    ),
    check(
      'recurring_expense_occurrences_paid_amount_range',
      sql`${table.paidAmountMinor} IS NULL OR (${table.paidAmountMinor} > 0 AND ${table.paidAmountMinor} <= 99999999999)`,
    ),
    index('recurring_expense_occurrences_status_due_date_index').on(
      table.status,
      table.dueDate,
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
