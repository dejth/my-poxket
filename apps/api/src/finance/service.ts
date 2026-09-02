import { randomUUID } from 'node:crypto'

import {
  nextTransactionStatus,
  parseTransactionAmount,
  validateCategoryDirection,
  validatePaymentMethod,
} from '@my-poxket/domain/transactions'
import { and, asc, desc, eq, gte, like, lte, type SQL } from 'drizzle-orm'

import type { Database } from '../database/client.js'
import { categories, transactions } from '../database/schema.js'
import { FinanceError, isDuplicateEntry } from './errors.js'

export type Direction = 'income' | 'expense'
export type NonCardPaymentMethod =
  'cash' | 'bank_transfer' | 'debit_card' | 'other'
export type TransactionLifecycle = 'active' | 'superseded' | 'cancelled'

export interface TransactionInput {
  readonly amount: string
  readonly categoryId: string
  readonly description: string
  readonly direction: Direction
  readonly paymentMethod: NonCardPaymentMethod
  readonly transactionDate: string
}

export interface TransactionFilters {
  readonly categoryId?: string | undefined
  readonly dateFrom?: string | undefined
  readonly dateTo?: string | undefined
  readonly direction?: Direction | undefined
  readonly page: number
  readonly pageSize: number
  readonly paymentMethod?: NonCardPaymentMethod | undefined
  readonly search?: string | undefined
  readonly status?: TransactionLifecycle | 'all' | undefined
}

type QueryDatabase = Pick<Database, 'select'>

interface TransactionRow {
  readonly amountMinor: bigint
  readonly categoryDirection: Direction
  readonly categoryId: string
  readonly categoryName: string
  readonly correctsTransactionId: string | null
  readonly createdAt: Date
  readonly description: string
  readonly direction: Direction
  readonly id: string
  readonly paymentMethod: NonCardPaymentMethod | 'credit_card'
  readonly status: TransactionLifecycle
  readonly transactionDate: string
  readonly updatedAt: Date
}

const transactionSelection = {
  amountMinor: transactions.amountMinor,
  categoryDirection: categories.direction,
  categoryId: categories.id,
  categoryName: categories.name,
  correctsTransactionId: transactions.correctsTransactionId,
  createdAt: transactions.createdAt,
  description: transactions.description,
  direction: transactions.direction,
  id: transactions.id,
  paymentMethod: transactions.paymentMethod,
  status: transactions.status,
  transactionDate: transactions.transactionDate,
  updatedAt: transactions.updatedAt,
}

export async function listCategories(database: Database) {
  return database
    .select({
      direction: categories.direction,
      id: categories.id,
      isActive: categories.isActive,
      name: categories.name,
    })
    .from(categories)
    .orderBy(asc(categories.direction), asc(categories.name))
}

export async function createCategory(
  database: Database,
  input: { readonly direction: Direction; readonly name: string },
) {
  const name = normalizeDisplayName(input.name)
  const category = {
    direction: input.direction,
    id: randomUUID(),
    isActive: true,
    name,
    normalizedName: name.toLocaleLowerCase('th-TH'),
  } as const

  try {
    await database.insert(categories).values(category)
  } catch (error) {
    if (isDuplicateEntry(error)) {
      throw new FinanceError(
        'CATEGORY_ALREADY_EXISTS',
        'มีหมวดหมู่นี้อยู่แล้ว กรุณาเปิดใช้งานรายการเดิม',
        409,
      )
    }
    throw error
  }

  return {
    direction: category.direction,
    id: category.id,
    isActive: category.isActive,
    name: category.name,
  }
}

export async function setCategoryActive(
  database: Database,
  categoryId: string,
  isActive: boolean,
) {
  const [category] = await database
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1)

  if (!category) {
    throw new FinanceError('CATEGORY_NOT_FOUND', 'ไม่พบหมวดหมู่', 404)
  }

  await database
    .update(categories)
    .set({ isActive })
    .where(eq(categories.id, categoryId))

  return { id: categoryId, isActive }
}

export async function listTransactions(
  database: Database,
  filters: TransactionFilters,
) {
  const conditions: SQL[] = []

  if (filters.status !== 'all') {
    conditions.push(eq(transactions.status, filters.status ?? 'active'))
  }
  if (filters.direction) {
    conditions.push(eq(transactions.direction, filters.direction))
  }
  if (filters.categoryId) {
    conditions.push(eq(transactions.categoryId, filters.categoryId))
  }
  if (filters.paymentMethod) {
    conditions.push(eq(transactions.paymentMethod, filters.paymentMethod))
  }
  if (filters.dateFrom) {
    conditions.push(gte(transactions.transactionDate, filters.dateFrom))
  }
  if (filters.dateTo) {
    conditions.push(lte(transactions.transactionDate, filters.dateTo))
  }
  if (filters.search) {
    conditions.push(
      like(transactions.description, `%${escapeLike(filters.search.trim())}%`),
    )
  }

  const rows = await database
    .select(transactionSelection)
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
    .limit(filters.pageSize + 1)
    .offset((filters.page - 1) * filters.pageSize)

  const hasNextPage = rows.length > filters.pageSize
  return {
    items: rows.slice(0, filters.pageSize).map(serializeTransaction),
    nextPage: hasNextPage ? filters.page + 1 : null,
  }
}

export async function getTransaction(
  database: Database,
  transactionId: string,
) {
  const [row] = await database
    .select(transactionSelection)
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(eq(transactions.id, transactionId))
    .limit(1)

  if (!row) {
    throw new FinanceError('TRANSACTION_NOT_FOUND', 'ไม่พบรายการ', 404)
  }

  return serializeTransaction(row)
}

export async function createTransaction(
  database: Database,
  userId: string,
  input: TransactionInput,
) {
  const values = await prepareTransactionValues(database, userId, input)
  await database.insert(transactions).values(values)
  return getTransaction(database, values.id)
}

export async function correctTransaction(
  database: Database,
  userId: string,
  transactionId: string,
  input: TransactionInput,
) {
  const result = await database.transaction(async (transaction) => {
    const [original] = await transaction
      .select({
        categoryId: transactions.categoryId,
        id: transactions.id,
        status: transactions.status,
      })
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1)
      .for('update')

    if (!original) {
      throw new FinanceError('TRANSACTION_NOT_FOUND', 'ไม่พบรายการ', 404)
    }

    const nextStatus = transitionTransactionStatus(original.status, 'correct')
    const values = await prepareTransactionValues(transaction, userId, input, {
      allowInactiveCategoryId: original.categoryId,
      correctsTransactionId: original.id,
    })

    await transaction
      .update(transactions)
      .set({ status: nextStatus })
      .where(eq(transactions.id, original.id))
    await transaction.insert(transactions).values(values)
    return values.id
  })

  return getTransaction(database, result)
}

export async function cancelTransaction(
  database: Database,
  transactionId: string,
) {
  await database.transaction(async (transaction) => {
    const [current] = await transaction
      .select({ id: transactions.id, status: transactions.status })
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1)
      .for('update')

    if (!current) {
      throw new FinanceError('TRANSACTION_NOT_FOUND', 'ไม่พบรายการ', 404)
    }

    await transaction
      .update(transactions)
      .set({ status: transitionTransactionStatus(current.status, 'cancel') })
      .where(eq(transactions.id, current.id))
  })

  return getTransaction(database, transactionId)
}

async function prepareTransactionValues(
  database: QueryDatabase,
  userId: string,
  input: TransactionInput,
  options: {
    readonly allowInactiveCategoryId?: string
    readonly correctsTransactionId?: string
  } = {},
) {
  const [category] = await database
    .select({
      direction: categories.direction,
      id: categories.id,
      isActive: categories.isActive,
    })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1)

  if (!category) {
    throw new FinanceError('CATEGORY_NOT_FOUND', 'ไม่พบหมวดหมู่', 404)
  }
  if (!category.isActive && category.id !== options.allowInactiveCategoryId) {
    throw new FinanceError(
      'CATEGORY_INACTIVE',
      'หมวดหมู่นี้ถูกปิดใช้งานแล้ว',
      409,
    )
  }

  try {
    validateCategoryDirection(input.direction, category.direction)
    validatePaymentMethod(input.direction, input.paymentMethod)
  } catch (error) {
    throw new FinanceError(
      'INVALID_TRANSACTION_RULE',
      error instanceof Error && error.message.includes('not available')
        ? 'รายการบัตรเครดิตจะเปิดใช้งานใน Phase ถัดไป'
        : 'ประเภทหมวดหมู่หรือวิธีชำระเงินไม่ตรงกับรายการ',
    )
  }

  return {
    amountMinor: parseAmount(input.amount),
    categoryId: category.id,
    correctsTransactionId: options.correctsTransactionId,
    createdByUserId: userId,
    currency: 'THB' as const,
    description: normalizeDescription(input.description),
    direction: input.direction,
    id: randomUUID(),
    paymentMethod: input.paymentMethod,
    status: 'active' as const,
    transactionDate: input.transactionDate,
  }
}

function parseAmount(amount: string): bigint {
  try {
    return parseTransactionAmount(amount)
  } catch {
    throw new FinanceError(
      'INVALID_AMOUNT',
      'จำนวนเงินต้องมากกว่า 0 และไม่เกิน 999,999,999.99 บาท',
    )
  }
}

function transitionTransactionStatus(
  current: TransactionLifecycle,
  action: 'cancel' | 'correct',
): TransactionLifecycle {
  try {
    return nextTransactionStatus(current, action)
  } catch {
    throw new FinanceError(
      'TRANSACTION_NOT_ACTIVE',
      'แก้ไขหรือยกเลิกได้เฉพาะรายการที่ยังใช้งานอยู่',
    )
  }
}

function normalizeDisplayName(value: string): string {
  const normalized = value.trim().replaceAll(/\s+/g, ' ')
  if (normalized.length < 1 || normalized.length > 100) {
    throw new FinanceError(
      'INVALID_CATEGORY_NAME',
      'ชื่อหมวดหมู่ต้องมี 1–100 ตัวอักษร',
    )
  }
  return normalized
}

function normalizeDescription(value: string): string {
  const normalized = value.trim().replaceAll(/\s+/g, ' ')
  if (normalized.length < 1 || normalized.length > 255) {
    throw new FinanceError(
      'INVALID_DESCRIPTION',
      'รายละเอียดต้องมี 1–255 ตัวอักษร',
    )
  }
  return normalized
}

function escapeLike(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_')
}

function serializeTransaction(row: TransactionRow) {
  return {
    ...row,
    amountMinor: row.amountMinor.toString(),
  }
}
