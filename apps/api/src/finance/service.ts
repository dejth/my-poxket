import { randomUUID } from 'node:crypto'

import {
  addCalendarMonthsClamped,
  calculateCardDueDate,
  calculateInstallmentEndDate,
  calculatePlannedCardPaymentDate,
  calculateStatementEndDate,
  nextMonthPeriod,
  recurringDateForPeriod,
} from '@my-poxket/domain/calendar'
import {
  nextTransactionStatus,
  parseTransactionAmount,
  validateCategoryDirection,
  validatePaymentMethod,
} from '@my-poxket/domain/transactions'
import { and, asc, desc, eq, gte, like, lte, sql, type SQL } from 'drizzle-orm'

import type { Database } from '../database/client.js'
import {
  categories,
  creditCards,
  creditCardStatementPayments,
  installmentOccurrences,
  installmentPlans,
  recurringExpenseOccurrences,
  recurringExpenseRules,
  transactions,
} from '../database/schema.js'
import { FinanceError, isDuplicateEntry } from './errors.js'

export type Direction = 'income' | 'expense'
export type NonCardPaymentMethod =
  'cash' | 'bank_transfer' | 'debit_card' | 'other'
export type PaymentMethod = NonCardPaymentMethod | 'credit_card'
export type TransactionLifecycle = 'active' | 'superseded' | 'cancelled'

export interface TransactionInput {
  readonly amount: string
  readonly categoryId: string
  readonly creditCardId?: string | null | undefined
  readonly description: string
  readonly direction: Direction
  readonly paymentMethod: PaymentMethod
  readonly transactionDate: string
}

export interface TransactionFilters {
  readonly categoryId?: string | undefined
  readonly creditCardId?: string | undefined
  readonly dateFrom?: string | undefined
  readonly dateTo?: string | undefined
  readonly direction?: Direction | undefined
  readonly page: number
  readonly pageSize: number
  readonly paymentMethod?: PaymentMethod | undefined
  readonly search?: string | undefined
  readonly status?: TransactionLifecycle | 'all' | undefined
}

export interface InstallmentPlanInput {
  readonly categoryId: string
  readonly creditCardId?: string | null | undefined
  readonly description: string
  readonly firstPaymentDate: string
  readonly idempotencyKey: string
  readonly installmentAmount: string
  readonly paymentMethod: PaymentMethod
  readonly totalAmount?: string | undefined
  readonly totalInstallments: number
}

export interface RecurringExpenseInput {
  readonly amount: string
  readonly categoryId: string
  readonly creditCardId?: string | null | undefined
  readonly description: string
  readonly idempotencyKey?: string | undefined
  readonly paymentMethod: PaymentMethod
  readonly recurrenceDay: number
  readonly startDate: string
}

type QueryDatabase = Pick<Database, 'select'>

interface TransactionRow {
  readonly amountMinor: bigint
  readonly categoryDirection: Direction
  readonly categoryId: string
  readonly categoryName: string
  readonly creditCardId: string | null
  readonly creditCardMaskedSuffix: string | null
  readonly creditCardName: string | null
  readonly correctsTransactionId: string | null
  readonly createdAt: Date
  readonly description: string
  readonly direction: Direction
  readonly id: string
  readonly paymentMethod: PaymentMethod
  readonly status: TransactionLifecycle
  readonly transactionDate: string
  readonly updatedAt: Date
}

const transactionSelection = {
  amountMinor: transactions.amountMinor,
  categoryDirection: categories.direction,
  categoryId: categories.id,
  categoryName: categories.name,
  creditCardId: creditCards.id,
  creditCardMaskedSuffix: creditCards.maskedSuffix,
  creditCardName: creditCards.name,
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

export async function listCreditCards(database: Database) {
  return database
    .select({
      cutoffDay: creditCards.cutoffDay,
      dueDay: creditCards.dueDay,
      id: creditCards.id,
      isActive: creditCards.isActive,
      maskedSuffix: creditCards.maskedSuffix,
      name: creditCards.name,
    })
    .from(creditCards)
    .orderBy(asc(creditCards.name))
}

export async function createCreditCard(
  database: Database,
  input: {
    readonly cutoffDay: number
    readonly dueDay: number
    readonly maskedSuffix?: string | undefined
    readonly name: string
  },
) {
  const name = normalizeCardName(input.name)
  const card = {
    cutoffDay: input.cutoffDay,
    dueDay: input.dueDay,
    id: randomUUID(),
    isActive: true,
    maskedSuffix: input.maskedSuffix ?? null,
    name,
    normalizedName: name.toLocaleLowerCase('th-TH'),
  } as const

  try {
    await database.insert(creditCards).values(card)
  } catch (error) {
    if (isDuplicateEntry(error)) {
      throw new FinanceError(
        'CREDIT_CARD_ALREADY_EXISTS',
        'มีชื่อบัตรนี้อยู่แล้ว กรุณาเปิดใช้งานรายการเดิม',
        409,
      )
    }
    throw error
  }

  return {
    cutoffDay: card.cutoffDay,
    dueDay: card.dueDay,
    id: card.id,
    isActive: card.isActive,
    maskedSuffix: card.maskedSuffix,
    name: card.name,
  }
}

export async function setCreditCardActive(
  database: Database,
  creditCardId: string,
  isActive: boolean,
) {
  const [card] = await database
    .select({ id: creditCards.id })
    .from(creditCards)
    .where(eq(creditCards.id, creditCardId))
    .limit(1)

  if (!card) {
    throw new FinanceError('CREDIT_CARD_NOT_FOUND', 'ไม่พบบัตรเครดิต', 404)
  }

  await database
    .update(creditCards)
    .set({ isActive })
    .where(eq(creditCards.id, creditCardId))
  return { id: creditCardId, isActive }
}

export async function listCreditCardStatements(
  database: Database,
  filters: {
    readonly cardId?: string | undefined
    readonly dateFrom?: string | undefined
    readonly dateTo: string
  },
) {
  const conditions: SQL[] = [
    eq(transactions.paymentMethod, 'credit_card'),
    eq(transactions.status, 'active'),
    lte(transactions.transactionDate, filters.dateTo),
  ]
  if (filters.dateFrom) {
    conditions.push(
      gte(
        transactions.transactionDate,
        addCalendarMonthsClamped(`${filters.dateFrom.slice(0, 7)}-01`, -1),
      ),
    )
  }
  if (filters.cardId) conditions.push(eq(creditCards.id, filters.cardId))

  const query = database
    .select({
      amountMinor: transactions.amountMinor,
      cardId: creditCards.id,
      cardName: creditCards.name,
      cutoffDay: creditCards.cutoffDay,
      dueDay: creditCards.dueDay,
      maskedSuffix: creditCards.maskedSuffix,
      transactionDate: transactions.transactionDate,
    })
    .from(transactions)
    .innerJoin(creditCards, eq(creditCards.id, transactions.creditCardId))
    .where(and(...conditions))
  const rows = filters.dateFrom ? await query.limit(5001) : await query

  if (filters.dateFrom && rows.length > 5000) {
    throw new FinanceError(
      'STATEMENT_RANGE_TOO_LARGE',
      'ช่วงข้อมูลกว้างเกินไป กรุณาระบุช่วงวันที่ให้แคบลง',
    )
  }

  const grouped = new Map<
    string,
    {
      amountMinor: bigint
      cardId: string
      cardName: string
      maskedSuffix: string | null
      purchaseCount: number
      statementEndDate: string
      dueDay: number
    }
  >()

  for (const row of rows) {
    const statementEndDate = calculateStatementEndDate(
      row.transactionDate,
      row.cutoffDay,
    )
    if (
      (filters.dateFrom && statementEndDate < filters.dateFrom) ||
      statementEndDate > filters.dateTo
    ) {
      continue
    }

    const key = `${row.cardId}:${statementEndDate}`
    const current = grouped.get(key)
    if (current) {
      current.amountMinor += row.amountMinor
      current.purchaseCount += 1
    } else {
      grouped.set(key, {
        amountMinor: row.amountMinor,
        cardId: row.cardId,
        cardName: row.cardName,
        dueDay: row.dueDay,
        maskedSuffix: row.maskedSuffix,
        purchaseCount: 1,
        statementEndDate,
      })
    }
  }

  const statements = [...grouped.values()]
    .map(({ dueDay, ...statement }) => {
      const officialDueDate = calculateCardDueDate(
        statement.statementEndDate,
        dueDay,
      )
      return {
        ...statement,
        amountMinor: statement.amountMinor.toString(),
        officialDueDate,
        plannedPaymentDate: calculatePlannedCardPaymentDate(
          statement.statementEndDate,
          officialDueDate,
        ),
      }
    })
    .toSorted(
      (left, right) =>
        right.statementEndDate.localeCompare(left.statementEndDate) ||
        left.cardName.localeCompare(right.cardName, 'th'),
    )

  const paymentRows = await database
    .select({
      creditCardId: creditCardStatementPayments.creditCardId,
      paidAmountMinor: creditCardStatementPayments.paidAmountMinor,
      paidDate: creditCardStatementPayments.paidDate,
      statementEndDate: creditCardStatementPayments.statementEndDate,
      status: creditCardStatementPayments.status,
    })
    .from(creditCardStatementPayments)
  const payments = new Map(
    paymentRows.map((payment) => [
      `${payment.creditCardId}:${payment.statementEndDate}`,
      payment,
    ]),
  )

  return statements.map((statement) => {
    const payment = payments.get(
      `${statement.cardId}:${statement.statementEndDate}`,
    )
    return {
      ...statement,
      paidAmountMinor: payment?.paidAmountMinor?.toString() ?? null,
      paidDate: payment?.paidDate ?? null,
      status: payment?.status ?? ('unpaid' as const),
    }
  })
}

export async function setCreditCardStatementPayment(
  database: Database,
  cardId: string,
  statementEndDate: string,
  input:
    | {
        readonly paidAmount: string
        readonly paidDate: string
        readonly status: 'paid'
      }
    | { readonly status: 'unpaid' },
) {
  const [card] = await database
    .select({ id: creditCards.id })
    .from(creditCards)
    .where(eq(creditCards.id, cardId))
    .limit(1)
  if (!card) {
    throw new FinanceError('CREDIT_CARD_NOT_FOUND', 'ไม่พบบัตรเครดิต', 404)
  }

  const [existing] = await database
    .select({
      id: creditCardStatementPayments.id,
      status: creditCardStatementPayments.status,
    })
    .from(creditCardStatementPayments)
    .where(
      and(
        eq(creditCardStatementPayments.creditCardId, cardId),
        eq(creditCardStatementPayments.statementEndDate, statementEndDate),
      ),
    )
    .limit(1)
  if (input.status === 'unpaid' && existing?.status !== 'paid') {
    throw new FinanceError(
      'CREDIT_CARD_STATEMENT_NOT_PAID',
      'รอบบัญชีนี้ยังไม่ได้บันทึกว่าจ่ายแล้ว',
      409,
    )
  }

  if (input.status === 'paid') {
    const [statement] = await listCreditCardStatements(database, {
      cardId,
      dateFrom: statementEndDate,
      dateTo: statementEndDate,
    })
    if (!statement) {
      throw new FinanceError(
        'CREDIT_CARD_STATEMENT_NOT_FOUND',
        'ไม่พบรอบบัญชีที่ระบุ',
        404,
      )
    }
  }

  const values = {
    paidAmountMinor:
      input.status === 'paid' ? parseAmount(input.paidAmount) : null,
    paidDate: input.status === 'paid' ? input.paidDate : null,
    status: input.status,
  } as const
  if (input.status === 'paid') {
    await database
      .insert(creditCardStatementPayments)
      .values({
        ...values,
        creditCardId: cardId,
        id: randomUUID(),
        statementEndDate,
      })
      .onDuplicateKeyUpdate({ set: values })
  } else if (existing) {
    await database
      .update(creditCardStatementPayments)
      .set(values)
      .where(eq(creditCardStatementPayments.id, existing.id))
  }

  return {
    cardId,
    paidAmountMinor: values.paidAmountMinor?.toString() ?? null,
    paidDate: values.paidDate,
    statementEndDate,
    status: values.status,
  }
}

export async function getDashboardSummary(
  database: Database,
  period: string,
  today = todayInBangkok(),
) {
  const periodStart = `${period}-01`
  const periodEnd = recurringDateForPeriod(period, 31)
  const throughDate = recurringDateForPeriod(nextMonthPeriod(today), 31)

  const [activityRows, statements, plans, rules, statementPayments] =
    await Promise.all([
      database
        .select({
          amountMinor: transactions.amountMinor,
          categoryId: categories.id,
          categoryName: categories.name,
          direction: transactions.direction,
          paymentMethod: transactions.paymentMethod,
        })
        .from(transactions)
        .innerJoin(categories, eq(categories.id, transactions.categoryId))
        .where(
          and(
            eq(transactions.status, 'active'),
            gte(transactions.transactionDate, periodStart),
            lte(transactions.transactionDate, periodEnd),
          ),
        ),
      listCreditCardStatements(database, { dateTo: throughDate }),
      listInstallmentPlans(database),
      listRecurringExpenseRules(database),
      database
        .select({
          cardId: creditCardStatementPayments.creditCardId,
          cardName: creditCards.name,
          dueDay: creditCards.dueDay,
          maskedSuffix: creditCards.maskedSuffix,
          paidAmountMinor: creditCardStatementPayments.paidAmountMinor,
          paidDate: creditCardStatementPayments.paidDate,
          statementEndDate: creditCardStatementPayments.statementEndDate,
          status: creditCardStatementPayments.status,
        })
        .from(creditCardStatementPayments)
        .innerJoin(
          creditCards,
          eq(creditCards.id, creditCardStatementPayments.creditCardId),
        ),
    ])

  let incomeMinor = 0n
  let expenseMinor = 0n
  let transactionCashOutMinor = 0n
  const categoryTotals = new Map<
    string,
    {
      amountMinor: bigint
      categoryId: string
      categoryName: string
      direction: Direction
    }
  >()
  for (const row of activityRows) {
    if (row.direction === 'income') incomeMinor += row.amountMinor
    else expenseMinor += row.amountMinor
    if (row.direction === 'expense' && row.paymentMethod !== 'credit_card') {
      transactionCashOutMinor += row.amountMinor
    }
    const key = `${row.direction}:${row.categoryId}`
    const current = categoryTotals.get(key)
    if (current) current.amountMinor += row.amountMinor
    else {
      categoryTotals.set(key, {
        amountMinor: row.amountMinor,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        direction: row.direction,
      })
    }
  }

  const history: DashboardHistoryItem[] = []
  let payablePaymentsMinor = 0n
  for (const payment of statementPayments) {
    if (
      payment.status !== 'paid' ||
      !payment.paidDate ||
      payment.paidAmountMinor === null ||
      payment.paidDate < periodStart ||
      payment.paidDate > periodEnd
    ) {
      continue
    }
    payablePaymentsMinor += payment.paidAmountMinor
    const officialDueDate = calculateCardDueDate(
      payment.statementEndDate,
      payment.dueDay,
    )
    history.push({
      amountMinor: payment.paidAmountMinor.toString(),
      cardId: payment.cardId,
      context: `รอบบัญชี ${payment.statementEndDate}`,
      date: payment.paidDate,
      id: `card:${payment.cardId}:${payment.statementEndDate}`,
      source: 'credit_card_statement',
      statementEndDate: payment.statementEndDate,
      status: 'paid',
      title: formatCardDisplayName(payment.cardName, payment.maskedSuffix),
      dueDate: calculatePlannedCardPaymentDate(
        payment.statementEndDate,
        officialDueDate,
      ),
    })
  }

  for (const plan of plans) {
    for (const occurrence of plan.occurrences) {
      if (
        occurrence.status === 'paid' &&
        occurrence.paidDate &&
        occurrence.paidAmountMinor &&
        occurrence.paidDate >= periodStart &&
        occurrence.paidDate <= periodEnd
      ) {
        payablePaymentsMinor += BigInt(occurrence.paidAmountMinor)
        history.push({
          amountMinor: occurrence.paidAmountMinor,
          context: `ผ่อน ${occurrence.installmentNumber}/${plan.totalInstallments} · ${formatPlanStatus(plan.status)}`,
          date: occurrence.paidDate,
          dueDate: occurrence.dueDate,
          id: `installment:${occurrence.id}`,
          source: 'installment',
          status: 'paid',
          title: plan.description,
        })
      } else if (
        occurrence.status === 'cancelled' &&
        occurrence.dueDate >= periodStart &&
        occurrence.dueDate <= periodEnd
      ) {
        history.push({
          amountMinor: occurrence.amountMinor,
          context: `ผ่อน ${occurrence.installmentNumber}/${plan.totalInstallments} · ${formatPlanStatus(plan.status)}`,
          date: occurrence.dueDate,
          dueDate: occurrence.dueDate,
          id: `installment:${occurrence.id}`,
          source: 'installment',
          status: 'cancelled',
          title: plan.description,
        })
      }
    }
  }

  for (const rule of rules) {
    for (const occurrence of rule.occurrences) {
      if (
        occurrence.status === 'paid' &&
        occurrence.paidDate &&
        occurrence.paidAmountMinor &&
        occurrence.paidDate >= periodStart &&
        occurrence.paidDate <= periodEnd
      ) {
        payablePaymentsMinor += BigInt(occurrence.paidAmountMinor)
        history.push({
          amountMinor: occurrence.paidAmountMinor,
          context: `ประจำ ${occurrence.recurrencePeriod}`,
          date: occurrence.paidDate,
          dueDate: occurrence.dueDate,
          id: `recurring:${occurrence.id}`,
          source: 'recurring',
          status: 'paid',
          title: occurrence.description,
        })
      } else if (
        occurrence.status === 'cancelled' &&
        occurrence.dueDate >= periodStart &&
        occurrence.dueDate <= periodEnd
      ) {
        history.push({
          amountMinor: occurrence.amountMinor,
          context: `ประจำ ${occurrence.recurrencePeriod}`,
          date: occurrence.dueDate,
          dueDate: occurrence.dueDate,
          id: `recurring:${occurrence.id}`,
          source: 'recurring',
          status: 'cancelled',
          title: occurrence.description,
        })
      }
    }
  }

  const payables: DashboardPayableItem[] = [
    ...statements
      .filter(
        (statement) =>
          statement.status === 'unpaid' &&
          statement.plannedPaymentDate <= throughDate,
      )
      .map((statement) => ({
        amountMinor: statement.amountMinor,
        cardId: statement.cardId,
        context: `รอบบัญชี ${statement.statementEndDate}`,
        dueDate: statement.plannedPaymentDate,
        id: `card:${statement.cardId}:${statement.statementEndDate}`,
        officialDueDate: statement.officialDueDate,
        source: 'credit_card_statement' as const,
        statementEndDate: statement.statementEndDate,
        status:
          statement.officialDueDate < today
            ? ('overdue' as const)
            : ('unpaid' as const),
        title: formatCardDisplayName(
          statement.cardName,
          statement.maskedSuffix,
        ),
      })),
    ...plans.flatMap((plan) =>
      plan.occurrences
        .filter(
          (occurrence) =>
            occurrence.status === 'unpaid' && occurrence.dueDate <= throughDate,
        )
        .map((occurrence) => ({
          amountMinor: occurrence.amountMinor,
          context: `ผ่อน ${occurrence.installmentNumber}/${plan.totalInstallments}`,
          dueDate: occurrence.dueDate,
          id: `installment:${occurrence.id}`,
          source: 'installment' as const,
          status:
            occurrence.dueDate < today
              ? ('overdue' as const)
              : ('unpaid' as const),
          title: plan.description,
        })),
    ),
    ...rules.flatMap((rule) =>
      rule.occurrences
        .filter(
          (occurrence) =>
            occurrence.status === 'unpaid' && occurrence.dueDate <= throughDate,
        )
        .map((occurrence) => ({
          amountMinor: occurrence.amountMinor,
          context: `ประจำ ${occurrence.recurrencePeriod}`,
          dueDate: occurrence.dueDate,
          id: `recurring:${occurrence.id}`,
          source: 'recurring' as const,
          status:
            occurrence.dueDate < today
              ? ('overdue' as const)
              : ('unpaid' as const),
          title: occurrence.description,
        })),
    ),
  ].toSorted(
    (left, right) =>
      left.dueDate.localeCompare(right.dueDate) ||
      left.title.localeCompare(right.title, 'th'),
  )

  const cashOutMinor = transactionCashOutMinor + payablePaymentsMinor
  return {
    activity: {
      categories: [...categoryTotals.values()]
        .map((category) => ({
          ...category,
          amountMinor: category.amountMinor.toString(),
        }))
        .toSorted((left, right) => {
          const directionOrder = left.direction.localeCompare(right.direction)
          if (directionOrder !== 0) return directionOrder
          const leftAmount = BigInt(left.amountMinor)
          const rightAmount = BigInt(right.amountMinor)
          if (leftAmount !== rightAmount)
            return leftAmount > rightAmount ? -1 : 1
          return left.categoryName.localeCompare(right.categoryName, 'th')
        }),
      expenseMinor: expenseMinor.toString(),
      incomeMinor: incomeMinor.toString(),
      netMinor: (incomeMinor - expenseMinor).toString(),
    },
    cashFlow: {
      inflowMinor: incomeMinor.toString(),
      netMinor: (incomeMinor - cashOutMinor).toString(),
      outflowMinor: cashOutMinor.toString(),
    },
    history: history.toSorted(
      (left, right) =>
        right.date.localeCompare(left.date) ||
        left.title.localeCompare(right.title, 'th'),
    ),
    payables,
    period,
    periodEnd,
    periodStart,
    throughDate,
    today,
  }
}

type DashboardSource = 'credit_card_statement' | 'installment' | 'recurring'

interface DashboardPayableItem {
  readonly amountMinor: string
  readonly cardId?: string
  readonly context: string
  readonly dueDate: string
  readonly id: string
  readonly officialDueDate?: string
  readonly source: DashboardSource
  readonly statementEndDate?: string
  readonly status: 'overdue' | 'unpaid'
  readonly title: string
}

interface DashboardHistoryItem {
  readonly amountMinor: string
  readonly cardId?: string
  readonly context: string
  readonly date: string
  readonly dueDate: string
  readonly id: string
  readonly source: DashboardSource
  readonly statementEndDate?: string
  readonly status: 'cancelled' | 'paid'
  readonly title: string
}

function formatCardDisplayName(name: string, maskedSuffix: string | null) {
  return maskedSuffix ? `${name} •••• ${maskedSuffix}` : name
}

function formatPlanStatus(
  status: 'active' | 'cancelled' | 'completed' | 'settled',
) {
  return {
    active: 'กำลังผ่อน',
    cancelled: 'ยกเลิก',
    completed: 'ชำระครบ',
    settled: 'ปิดยอดก่อนกำหนด',
  }[status]
}

export async function listInstallmentPlans(database: Database) {
  const plans = await database
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      createdAt: installmentPlans.createdAt,
      creditCardId: creditCards.id,
      creditCardMaskedSuffix: creditCards.maskedSuffix,
      creditCardName: creditCards.name,
      description: installmentPlans.description,
      firstPaymentDate: installmentPlans.firstPaymentDate,
      id: installmentPlans.id,
      paymentMethod: installmentPlans.paymentMethod,
      status: installmentPlans.status,
      totalAmountMinor: installmentPlans.totalAmountMinor,
      totalInstallments: installmentPlans.totalInstallments,
      updatedAt: installmentPlans.updatedAt,
    })
    .from(installmentPlans)
    .innerJoin(categories, eq(categories.id, installmentPlans.categoryId))
    .leftJoin(creditCards, eq(creditCards.id, installmentPlans.creditCardId))
    .orderBy(desc(installmentPlans.createdAt))

  const occurrences = await database
    .select({
      amountMinor: installmentOccurrences.amountMinor,
      closesPlan: installmentOccurrences.closesPlan,
      dueDate: installmentOccurrences.dueDate,
      id: installmentOccurrences.id,
      installmentNumber: installmentOccurrences.installmentNumber,
      installmentPlanId: installmentOccurrences.installmentPlanId,
      paidAmountMinor: installmentOccurrences.paidAmountMinor,
      paidDate: installmentOccurrences.paidDate,
      status: installmentOccurrences.status,
    })
    .from(installmentOccurrences)
    .orderBy(
      asc(installmentOccurrences.installmentPlanId),
      asc(installmentOccurrences.installmentNumber),
    )

  return plans.map((plan) => serializeInstallmentPlan(plan, occurrences))
}

export async function createInstallmentPlan(
  database: Database,
  userId: string,
  input: InstallmentPlanInput,
) {
  const totalAmountMinor = input.totalAmount
    ? parseAmount(input.totalAmount)
    : null
  const installmentAmountMinor = parseAmount(input.installmentAmount)
  const amounts = Array<bigint>(input.totalInstallments).fill(
    installmentAmountMinor,
  )

  const planId = randomUUID()
  try {
    await database.transaction(async (transaction) => {
      const { categoryId, creditCardId } = await validateInstallmentReferences(
        transaction,
        input,
      )
      await transaction.insert(installmentPlans).values({
        categoryId,
        createdByUserId: userId,
        creditCardId,
        currency: 'THB',
        description: normalizeDescription(input.description),
        firstPaymentDate: input.firstPaymentDate,
        id: planId,
        idempotencyKey: input.idempotencyKey,
        paymentMethod: input.paymentMethod,
        status: 'active',
        totalAmountMinor,
        totalInstallments: input.totalInstallments,
      })
      await transaction.insert(installmentOccurrences).values(
        amounts.map((amountMinor, index) => ({
          amountMinor,
          dueDate: addCalendarMonthsClamped(input.firstPaymentDate, index),
          id: randomUUID(),
          installmentNumber: index + 1,
          installmentPlanId: planId,
          status: 'unpaid' as const,
        })),
      )
    })
  } catch (error) {
    if (!isDuplicateEntry(error)) throw error
    const [existing] = await database
      .select({ id: installmentPlans.id })
      .from(installmentPlans)
      .where(eq(installmentPlans.idempotencyKey, input.idempotencyKey))
      .limit(1)
    if (!existing) throw error
    return getInstallmentPlan(database, existing.id)
  }

  return getInstallmentPlan(database, planId)
}

export async function setInstallmentOccurrenceStatus(
  database: Database,
  planId: string,
  installmentNumber: number,
  input:
    | {
        readonly closesPlan: boolean
        readonly paidAmount: string
        readonly paidDate: string
        readonly status: 'paid'
      }
    | { readonly status: 'unpaid' },
) {
  await database.transaction(async (transaction) => {
    const [plan] = await transaction
      .select({ id: installmentPlans.id, status: installmentPlans.status })
      .from(installmentPlans)
      .where(eq(installmentPlans.id, planId))
      .limit(1)
      .for('update')
    if (!plan) {
      throw new FinanceError('INSTALLMENT_PLAN_NOT_FOUND', 'ไม่พบแผนผ่อน', 404)
    }
    if (plan.status === 'cancelled') {
      throw new FinanceError(
        'INSTALLMENT_PLAN_CANCELLED',
        'แผนผ่อนนี้ถูกยกเลิกแล้ว',
        409,
      )
    }

    const [occurrence] = await transaction
      .select({
        closesPlan: installmentOccurrences.closesPlan,
        id: installmentOccurrences.id,
        status: installmentOccurrences.status,
      })
      .from(installmentOccurrences)
      .where(
        and(
          eq(installmentOccurrences.installmentPlanId, planId),
          eq(installmentOccurrences.installmentNumber, installmentNumber),
        ),
      )
      .limit(1)
      .for('update')
    if (!occurrence) {
      throw new FinanceError('INSTALLMENT_NOT_FOUND', 'ไม่พบงวดที่ระบุ', 404)
    }
    if (input.status === 'paid' && plan.status !== 'active') {
      throw new FinanceError(
        'INSTALLMENT_PLAN_NOT_ACTIVE',
        'บันทึกการจ่ายได้เฉพาะแผนที่กำลังผ่อน',
        409,
      )
    }
    if (input.status === 'paid' && occurrence.status !== 'unpaid') {
      throw new FinanceError(
        'INSTALLMENT_NOT_UNPAID',
        'บันทึกการจ่ายได้เฉพาะงวดที่ยังไม่จ่าย',
        409,
      )
    }
    if (input.status === 'unpaid' && occurrence.status !== 'paid') {
      throw new FinanceError(
        'INSTALLMENT_NOT_PAID',
        'เปลี่ยนกลับได้เฉพาะงวดที่จ่ายแล้ว',
        409,
      )
    }
    if (
      input.status === 'unpaid' &&
      plan.status === 'settled' &&
      !occurrence.closesPlan
    ) {
      throw new FinanceError(
        'INSTALLMENT_PLAN_SETTLED',
        'แผนนี้ปิดยอดแล้ว กรุณายกเลิกการปิดยอดจากงวดที่ใช้ปิดบัญชี',
        409,
      )
    }

    if (input.status === 'paid' && input.closesPlan) {
      await transaction
        .update(installmentOccurrences)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(installmentOccurrences.installmentPlanId, planId),
            eq(installmentOccurrences.status, 'unpaid'),
          ),
        )
    }
    if (input.status === 'unpaid' && occurrence.closesPlan) {
      await transaction
        .update(installmentOccurrences)
        .set({ status: 'unpaid' })
        .where(
          and(
            eq(installmentOccurrences.installmentPlanId, planId),
            eq(installmentOccurrences.status, 'cancelled'),
          ),
        )
    }

    await transaction
      .update(installmentOccurrences)
      .set({
        closesPlan: input.status === 'paid' && input.closesPlan,
        paidAmountMinor:
          input.status === 'paid' ? parseAmount(input.paidAmount) : null,
        paidDate: input.status === 'paid' ? input.paidDate : null,
        status: input.status,
      })
      .where(eq(installmentOccurrences.id, occurrence.id))

    const statuses = await transaction
      .select({ status: installmentOccurrences.status })
      .from(installmentOccurrences)
      .where(eq(installmentOccurrences.installmentPlanId, planId))
    await transaction
      .update(installmentPlans)
      .set({
        status:
          input.status === 'paid' && input.closesPlan
            ? 'settled'
            : statuses.every(({ status }) => status === 'paid')
              ? 'completed'
              : 'active',
      })
      .where(eq(installmentPlans.id, planId))
  })

  return getInstallmentPlan(database, planId)
}

export async function cancelInstallmentPlan(
  database: Database,
  planId: string,
) {
  await database.transaction(async (transaction) => {
    const [plan] = await transaction
      .select({ id: installmentPlans.id, status: installmentPlans.status })
      .from(installmentPlans)
      .where(eq(installmentPlans.id, planId))
      .limit(1)
      .for('update')
    if (!plan) {
      throw new FinanceError('INSTALLMENT_PLAN_NOT_FOUND', 'ไม่พบแผนผ่อน', 404)
    }
    if (plan.status !== 'active') {
      throw new FinanceError(
        'INSTALLMENT_PLAN_NOT_ACTIVE',
        'ยกเลิกได้เฉพาะแผนผ่อนที่ยังใช้งานอยู่',
        409,
      )
    }

    await transaction
      .update(installmentOccurrences)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(installmentOccurrences.installmentPlanId, planId),
          eq(installmentOccurrences.status, 'unpaid'),
        ),
      )
    await transaction
      .update(installmentPlans)
      .set({ status: 'cancelled' })
      .where(eq(installmentPlans.id, planId))
  })

  return getInstallmentPlan(database, planId)
}

async function getInstallmentPlan(database: Database, planId: string) {
  const plans = await listInstallmentPlans(database)
  const plan = plans.find(({ id }) => id === planId)
  if (!plan) {
    throw new FinanceError('INSTALLMENT_PLAN_NOT_FOUND', 'ไม่พบแผนผ่อน', 404)
  }
  return plan
}

export async function listRecurringExpenseRules(database: Database) {
  const [rules, occurrences, categoryRows, cardRows] = await Promise.all([
    database
      .select()
      .from(recurringExpenseRules)
      .orderBy(desc(recurringExpenseRules.createdAt)),
    database
      .select()
      .from(recurringExpenseOccurrences)
      .orderBy(
        asc(recurringExpenseOccurrences.recurringExpenseRuleId),
        desc(recurringExpenseOccurrences.dueDate),
      ),
    database
      .select({ id: categories.id, name: categories.name })
      .from(categories),
    database
      .select({
        id: creditCards.id,
        maskedSuffix: creditCards.maskedSuffix,
        name: creditCards.name,
      })
      .from(creditCards),
  ])
  const categoryNames = new Map(categoryRows.map(({ id, name }) => [id, name]))
  const cards = new Map(cardRows.map((card) => [card.id, card]))

  // ponytail: in-memory grouping is enough for one owner; use keyed queries if history becomes large.
  return rules.map((rule) => ({
    amountMinor: rule.amountMinor.toString(),
    categoryId: rule.categoryId,
    categoryName: categoryNames.get(rule.categoryId) ?? 'หมวดหมู่เดิม',
    createdAt: rule.createdAt,
    creditCardId: rule.creditCardId,
    creditCardMaskedSuffix: rule.creditCardId
      ? (cards.get(rule.creditCardId)?.maskedSuffix ?? null)
      : null,
    creditCardName: rule.creditCardId
      ? (cards.get(rule.creditCardId)?.name ?? null)
      : null,
    description: rule.description,
    id: rule.id,
    occurrences: occurrences
      .filter(
        ({ recurringExpenseRuleId }) => recurringExpenseRuleId === rule.id,
      )
      .map((occurrence) => ({
        amountMinor: occurrence.amountMinor.toString(),
        categoryId: occurrence.categoryId,
        categoryName:
          categoryNames.get(occurrence.categoryId) ?? 'หมวดหมู่เดิม',
        creditCardId: occurrence.creditCardId,
        creditCardMaskedSuffix: occurrence.creditCardId
          ? (cards.get(occurrence.creditCardId)?.maskedSuffix ?? null)
          : null,
        creditCardName: occurrence.creditCardId
          ? (cards.get(occurrence.creditCardId)?.name ?? null)
          : null,
        description: occurrence.description,
        dueDate: occurrence.dueDate,
        id: occurrence.id,
        paidAmountMinor: occurrence.paidAmountMinor?.toString() ?? null,
        paidDate: occurrence.paidDate,
        paymentMethod: occurrence.paymentMethod,
        recurrencePeriod: occurrence.recurrencePeriod,
        status: occurrence.status,
      })),
    paymentMethod: rule.paymentMethod,
    recurrenceDay: rule.recurrenceDay,
    startDate: rule.startDate,
    status: rule.status,
    updatedAt: rule.updatedAt,
  }))
}

export async function createRecurringExpenseRule(
  database: Database,
  userId: string,
  input: RecurringExpenseInput & { readonly idempotencyKey: string },
  today = todayInBangkok(),
) {
  const ruleId = randomUUID()
  try {
    await database.transaction(async (transaction) => {
      const { categoryId, creditCardId } = await validateExpenseReferences(
        transaction,
        input,
      )
      await transaction.insert(recurringExpenseRules).values({
        amountMinor: parseAmount(input.amount),
        categoryId,
        createdByUserId: userId,
        creditCardId,
        currency: 'THB',
        description: normalizeDescription(input.description),
        id: ruleId,
        idempotencyKey: input.idempotencyKey,
        paymentMethod: input.paymentMethod,
        recurrenceDay: input.recurrenceDay,
        startDate: input.startDate,
        status: 'active',
      })
    })
  } catch (error) {
    if (!isDuplicateEntry(error)) throw error
    const [existing] = await database
      .select({ id: recurringExpenseRules.id })
      .from(recurringExpenseRules)
      .where(eq(recurringExpenseRules.idempotencyKey, input.idempotencyKey))
      .limit(1)
    if (!existing) throw error
    await materializeRecurringExpenseRules(database, today)
    return getRecurringExpenseRule(database, existing.id)
  }

  await materializeRecurringExpenseRules(database, today)
  return getRecurringExpenseRule(database, ruleId)
}

export async function updateRecurringExpenseRule(
  database: Database,
  ruleId: string,
  input: RecurringExpenseInput,
  today = todayInBangkok(),
) {
  await database.transaction(async (transaction) => {
    const [rule] = await transaction
      .select({
        id: recurringExpenseRules.id,
        status: recurringExpenseRules.status,
      })
      .from(recurringExpenseRules)
      .where(eq(recurringExpenseRules.id, ruleId))
      .limit(1)
      .for('update')
    if (!rule) throw recurringRuleNotFound()
    if (rule.status !== 'active') {
      throw new FinanceError(
        'RECURRING_RULE_STOPPED',
        'แก้ไขได้เฉพาะรายการประจำที่ยังใช้งานอยู่',
        409,
      )
    }

    const { categoryId, creditCardId } = await validateExpenseReferences(
      transaction,
      input,
    )
    const values = {
      amountMinor: parseAmount(input.amount),
      categoryId,
      creditCardId,
      description: normalizeDescription(input.description),
      paymentMethod: input.paymentMethod,
      recurrenceDay: input.recurrenceDay,
      startDate: input.startDate,
    }
    await transaction
      .update(recurringExpenseRules)
      .set(values)
      .where(eq(recurringExpenseRules.id, ruleId))

    const firstPeriod = firstRecurringPeriod(
      input.startDate,
      input.recurrenceDay,
    )
    await transaction
      .update(recurringExpenseOccurrences)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(recurringExpenseOccurrences.recurringExpenseRuleId, ruleId),
          eq(recurringExpenseOccurrences.status, 'unpaid'),
          gte(recurringExpenseOccurrences.recurrencePeriod, today.slice(0, 7)),
          lte(
            recurringExpenseOccurrences.recurrencePeriod,
            previousPeriod(firstPeriod),
          ),
        ),
      )
    await transaction
      .update(recurringExpenseOccurrences)
      .set({
        amountMinor: values.amountMinor,
        categoryId: values.categoryId,
        creditCardId: values.creditCardId,
        description: values.description,
        dueDate: sql`LEAST(CONCAT(${recurringExpenseOccurrences.recurrencePeriod}, '-', LPAD(${input.recurrenceDay}, 2, '0')), LAST_DAY(CONCAT(${recurringExpenseOccurrences.recurrencePeriod}, '-01')))`,
        paymentMethod: values.paymentMethod,
      })
      .where(
        and(
          eq(recurringExpenseOccurrences.recurringExpenseRuleId, ruleId),
          eq(recurringExpenseOccurrences.status, 'unpaid'),
          gte(recurringExpenseOccurrences.recurrencePeriod, firstPeriod),
          gte(recurringExpenseOccurrences.recurrencePeriod, today.slice(0, 7)),
        ),
      )
  })

  await materializeRecurringExpenseRules(database, today)
  return getRecurringExpenseRule(database, ruleId)
}

export async function setRecurringOccurrenceStatus(
  database: Database,
  ruleId: string,
  period: string,
  input:
    | {
        readonly paidAmount: string
        readonly paidDate: string
        readonly status: 'paid'
      }
    | { readonly status: 'unpaid' },
) {
  const [occurrence] = await database
    .select({
      id: recurringExpenseOccurrences.id,
      status: recurringExpenseOccurrences.status,
    })
    .from(recurringExpenseOccurrences)
    .where(
      and(
        eq(recurringExpenseOccurrences.recurringExpenseRuleId, ruleId),
        eq(recurringExpenseOccurrences.recurrencePeriod, period),
      ),
    )
    .limit(1)
  if (!occurrence) {
    throw new FinanceError(
      'RECURRING_OCCURRENCE_NOT_FOUND',
      'ไม่พบรอบรายการประจำ',
      404,
    )
  }
  if (input.status === 'paid' && occurrence.status !== 'unpaid') {
    throw new FinanceError(
      'RECURRING_OCCURRENCE_NOT_UNPAID',
      'บันทึกการจ่ายได้เฉพาะรายการที่ยังไม่จ่าย',
      409,
    )
  }
  if (input.status === 'unpaid' && occurrence.status !== 'paid') {
    throw new FinanceError(
      'RECURRING_OCCURRENCE_NOT_PAID',
      'ย้อนสถานะได้เฉพาะรายการที่จ่ายแล้ว',
      409,
    )
  }

  await database
    .update(recurringExpenseOccurrences)
    .set({
      paidAmountMinor:
        input.status === 'paid' ? parseAmount(input.paidAmount) : null,
      paidDate: input.status === 'paid' ? input.paidDate : null,
      status: input.status,
    })
    .where(eq(recurringExpenseOccurrences.id, occurrence.id))
  return getRecurringExpenseRule(database, ruleId)
}

export async function stopRecurringExpenseRule(
  database: Database,
  ruleId: string,
  futureOccurrences: 'cancel' | 'retain',
  today = todayInBangkok(),
) {
  await database.transaction(async (transaction) => {
    const [rule] = await transaction
      .select({
        id: recurringExpenseRules.id,
        status: recurringExpenseRules.status,
      })
      .from(recurringExpenseRules)
      .where(eq(recurringExpenseRules.id, ruleId))
      .limit(1)
      .for('update')
    if (!rule) throw recurringRuleNotFound()
    if (rule.status !== 'active') {
      throw new FinanceError(
        'RECURRING_RULE_STOPPED',
        'รายการประจำนี้หยุดแล้ว',
        409,
      )
    }
    if (futureOccurrences === 'cancel') {
      await transaction
        .update(recurringExpenseOccurrences)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(recurringExpenseOccurrences.recurringExpenseRuleId, ruleId),
            eq(recurringExpenseOccurrences.status, 'unpaid'),
            gte(recurringExpenseOccurrences.dueDate, today),
          ),
        )
    }
    await transaction
      .update(recurringExpenseRules)
      .set({ status: 'stopped' })
      .where(eq(recurringExpenseRules.id, ruleId))
  })
  return getRecurringExpenseRule(database, ruleId)
}

export async function materializeRecurringExpenseRules(
  database: Database,
  today = todayInBangkok(),
) {
  const rules = await database
    .select()
    .from(recurringExpenseRules)
    .where(eq(recurringExpenseRules.status, 'active'))
  const throughPeriod = nextMonthPeriod(today)

  for (const rule of rules) {
    // ponytail: replaying bounded months keeps materialization simple; track a cursor if history grows large.
    const rows = []
    for (
      let period = firstRecurringPeriod(rule.startDate, rule.recurrenceDay);
      period <= throughPeriod;
      period = nextMonthPeriod(`${period}-01`)
    ) {
      rows.push({
        amountMinor: rule.amountMinor,
        categoryId: rule.categoryId,
        creditCardId: rule.creditCardId,
        currency: 'THB' as const,
        description: rule.description,
        dueDate: recurringDateForPeriod(period, rule.recurrenceDay),
        id: randomUUID(),
        paymentMethod: rule.paymentMethod,
        recurrencePeriod: period,
        recurringExpenseRuleId: rule.id,
        status: 'unpaid' as const,
      })
    }
    if (rows.length > 0) {
      await database
        .insert(recurringExpenseOccurrences)
        .values(rows)
        .onDuplicateKeyUpdate({
          set: { id: sql`${recurringExpenseOccurrences.id}` },
        })
    }
  }

  return { throughPeriod }
}

async function getRecurringExpenseRule(database: Database, ruleId: string) {
  const rule = (await listRecurringExpenseRules(database)).find(
    ({ id }) => id === ruleId,
  )
  if (!rule) throw recurringRuleNotFound()
  return rule
}

function firstRecurringPeriod(startDate: string, recurrenceDay: number) {
  const startPeriod = startDate.slice(0, 7)
  return recurringDateForPeriod(startPeriod, recurrenceDay) < startDate
    ? nextMonthPeriod(startDate)
    : startPeriod
}

function previousPeriod(period: string) {
  const [year, month] = period.split('-').map(Number)
  const previousMonth = (year ?? 0) * 12 + (month ?? 1) - 2
  return `${Math.floor(previousMonth / 12)}-${String((previousMonth % 12) + 1).padStart(2, '0')}`
}

export function todayInBangkok(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).formatToParts(now)
  const value = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  )
  return `${value.year}-${value.month}-${value.day}`
}

function recurringRuleNotFound() {
  return new FinanceError('RECURRING_RULE_NOT_FOUND', 'ไม่พบรายการประจำ', 404)
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
  if (filters.creditCardId) {
    conditions.push(eq(transactions.creditCardId, filters.creditCardId))
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
    .leftJoin(creditCards, eq(creditCards.id, transactions.creditCardId))
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
    .leftJoin(creditCards, eq(creditCards.id, transactions.creditCardId))
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
        creditCardId: transactions.creditCardId,
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
      ...(original.creditCardId
        ? { allowInactiveCreditCardId: original.creditCardId }
        : {}),
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
    readonly allowInactiveCreditCardId?: string
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

  const creditCardId = input.creditCardId ?? null
  if ((input.paymentMethod === 'credit_card') !== Boolean(creditCardId)) {
    throw new FinanceError(
      'INVALID_CREDIT_CARD_REFERENCE',
      'รายการบัตรเครดิตต้องเลือกบัตร และรายการประเภทอื่นต้องไม่ผูกบัตร',
    )
  }

  if (creditCardId) {
    const [card] = await database
      .select({ id: creditCards.id, isActive: creditCards.isActive })
      .from(creditCards)
      .where(eq(creditCards.id, creditCardId))
      .limit(1)
    if (!card) {
      throw new FinanceError('CREDIT_CARD_NOT_FOUND', 'ไม่พบบัตรเครดิต', 404)
    }
    if (!card.isActive && card.id !== options.allowInactiveCreditCardId) {
      throw new FinanceError(
        'CREDIT_CARD_INACTIVE',
        'บัตรเครดิตนี้ถูกปิดใช้งานแล้ว',
        409,
      )
    }
  }

  try {
    validateCategoryDirection(input.direction, category.direction)
    validatePaymentMethod(input.direction, input.paymentMethod, {
      creditCardsEnabled: true,
    })
  } catch {
    throw new FinanceError(
      'INVALID_TRANSACTION_RULE',
      'ประเภทหมวดหมู่หรือวิธีชำระเงินไม่ตรงกับรายการ',
    )
  }

  return {
    amountMinor: parseAmount(input.amount),
    categoryId: category.id,
    creditCardId,
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

async function validateExpenseReferences(
  database: QueryDatabase,
  input: Pick<
    InstallmentPlanInput,
    'categoryId' | 'creditCardId' | 'paymentMethod'
  >,
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
  if (!category.isActive) {
    throw new FinanceError(
      'CATEGORY_INACTIVE',
      'หมวดหมู่นี้ถูกปิดใช้งานแล้ว',
      409,
    )
  }
  if (category.direction !== 'expense') {
    throw new FinanceError(
      'INVALID_INSTALLMENT_CATEGORY',
      'แผนผ่อนต้องใช้หมวดรายจ่าย',
    )
  }

  const creditCardId = input.creditCardId ?? null
  if ((input.paymentMethod === 'credit_card') !== Boolean(creditCardId)) {
    throw new FinanceError(
      'INVALID_CREDIT_CARD_REFERENCE',
      'แผนผ่อนบัตรเครดิตต้องเลือกบัตร และวิธีชำระอื่นต้องไม่ผูกบัตร',
    )
  }
  if (creditCardId) {
    const [card] = await database
      .select({ id: creditCards.id, isActive: creditCards.isActive })
      .from(creditCards)
      .where(eq(creditCards.id, creditCardId))
      .limit(1)
    if (!card) {
      throw new FinanceError('CREDIT_CARD_NOT_FOUND', 'ไม่พบบัตรเครดิต', 404)
    }
    if (!card.isActive) {
      throw new FinanceError(
        'CREDIT_CARD_INACTIVE',
        'บัตรเครดิตนี้ถูกปิดใช้งานแล้ว',
        409,
      )
    }
  }

  return { categoryId: category.id, creditCardId }
}

const validateInstallmentReferences = validateExpenseReferences

function normalizeCardName(value: string): string {
  const normalized = value.trim().replaceAll(/\s+/g, ' ')
  if (normalized.length < 1 || normalized.length > 100) {
    throw new FinanceError(
      'INVALID_CREDIT_CARD_NAME',
      'ชื่อบัตรเครดิตต้องมี 1–100 ตัวอักษร',
    )
  }
  return normalized
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

function serializeInstallmentPlan(
  plan: {
    readonly categoryId: string
    readonly categoryName: string
    readonly createdAt: Date
    readonly creditCardId: string | null
    readonly creditCardMaskedSuffix: string | null
    readonly creditCardName: string | null
    readonly description: string
    readonly firstPaymentDate: string
    readonly id: string
    readonly paymentMethod: PaymentMethod
    readonly status: 'active' | 'completed' | 'settled' | 'cancelled'
    readonly totalAmountMinor: bigint | null
    readonly totalInstallments: number
    readonly updatedAt: Date
  },
  occurrences: readonly {
    readonly amountMinor: bigint
    readonly closesPlan: boolean
    readonly dueDate: string
    readonly id: string
    readonly installmentNumber: number
    readonly installmentPlanId: string
    readonly paidAmountMinor: bigint | null
    readonly paidDate: string | null
    readonly status: 'unpaid' | 'paid' | 'cancelled'
  }[],
) {
  return {
    ...plan,
    endDate: calculateInstallmentEndDate(
      plan.firstPaymentDate,
      plan.totalInstallments,
    ),
    occurrences: occurrences
      .filter(({ installmentPlanId }) => installmentPlanId === plan.id)
      .map((occurrence) => ({
        amountMinor: occurrence.amountMinor.toString(),
        closesPlan: occurrence.closesPlan,
        dueDate: occurrence.dueDate,
        id: occurrence.id,
        installmentNumber: occurrence.installmentNumber,
        paidAmountMinor: occurrence.paidAmountMinor?.toString() ?? null,
        paidDate: occurrence.paidDate,
        status: occurrence.status,
      })),
    totalAmountMinor: plan.totalAmountMinor?.toString() ?? null,
  }
}
