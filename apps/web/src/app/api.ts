export interface SessionData {
  readonly csrfToken: string
  readonly user: {
    readonly role: 'member' | 'owner'
    readonly username: string
  }
}

export interface LoginInput {
  readonly password: string
  readonly rememberMe: boolean
  readonly username: string
}

export type Direction = 'income' | 'expense'
export type PaymentMethod =
  'cash' | 'bank_transfer' | 'debit_card' | 'other' | 'credit_card'
export type TransactionStatus = 'active' | 'superseded' | 'cancelled'

export interface CategoryData {
  readonly direction: Direction
  readonly id: string
  readonly isActive: boolean
  readonly name: string
}

export interface CreditCardData {
  readonly cutoffDay: number
  readonly dueDay: number
  readonly id: string
  readonly isActive: boolean
  readonly maskedSuffix: string | null
  readonly name: string
}

export interface CreditCardStatementData {
  readonly amountMinor: string
  readonly cardId: string
  readonly cardName: string
  readonly maskedSuffix: string | null
  readonly officialDueDate: string
  readonly plannedPaymentDate: string
  readonly purchaseCount: number
  readonly statementEndDate: string
}

export type InstallmentPlanStatus =
  'active' | 'completed' | 'settled' | 'cancelled'
export type InstallmentOccurrenceStatus = 'unpaid' | 'paid' | 'cancelled'

export interface InstallmentOccurrenceData {
  readonly amountMinor: string
  readonly closesPlan: boolean
  readonly dueDate: string
  readonly id: string
  readonly installmentNumber: number
  readonly paidAmountMinor: string | null
  readonly paidDate: string | null
  readonly status: InstallmentOccurrenceStatus
}

export interface InstallmentPlanData {
  readonly categoryId: string
  readonly categoryName: string
  readonly createdAt: string
  readonly creditCardId: string | null
  readonly creditCardMaskedSuffix: string | null
  readonly creditCardName: string | null
  readonly description: string
  readonly endDate: string
  readonly firstPaymentDate: string
  readonly id: string
  readonly occurrences: readonly InstallmentOccurrenceData[]
  readonly paymentMethod: PaymentMethod
  readonly status: InstallmentPlanStatus
  readonly totalAmountMinor: string | null
  readonly totalInstallments: number
  readonly updatedAt: string
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

export type RecurringRuleStatus = 'active' | 'stopped'
export type RecurringOccurrenceStatus = 'unpaid' | 'paid' | 'cancelled'

export interface RecurringOccurrenceData {
  readonly amountMinor: string
  readonly categoryId: string
  readonly categoryName: string
  readonly creditCardId: string | null
  readonly creditCardMaskedSuffix: string | null
  readonly creditCardName: string | null
  readonly description: string
  readonly dueDate: string
  readonly id: string
  readonly paidAmountMinor: string | null
  readonly paidDate: string | null
  readonly paymentMethod: PaymentMethod
  readonly recurrencePeriod: string
  readonly status: RecurringOccurrenceStatus
}

export interface RecurringExpenseData {
  readonly amountMinor: string
  readonly categoryId: string
  readonly categoryName: string
  readonly createdAt: string
  readonly creditCardId: string | null
  readonly creditCardMaskedSuffix: string | null
  readonly creditCardName: string | null
  readonly description: string
  readonly id: string
  readonly occurrences: readonly RecurringOccurrenceData[]
  readonly paymentMethod: PaymentMethod
  readonly recurrenceDay: number
  readonly startDate: string
  readonly status: RecurringRuleStatus
  readonly updatedAt: string
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

export interface TransactionData {
  readonly amountMinor: string
  readonly categoryDirection: Direction
  readonly categoryId: string
  readonly categoryName: string
  readonly creditCardId: string | null
  readonly creditCardMaskedSuffix: string | null
  readonly creditCardName: string | null
  readonly correctsTransactionId: string | null
  readonly createdAt: string
  readonly description: string
  readonly direction: Direction
  readonly id: string
  readonly paymentMethod: PaymentMethod
  readonly status: TransactionStatus
  readonly transactionDate: string
  readonly updatedAt: string
}

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
  readonly paymentMethod?: PaymentMethod | undefined
  readonly page?: number | undefined
  readonly pageSize?: number | undefined
  readonly search?: string | undefined
  readonly status?: TransactionStatus | 'all' | undefined
}

interface ApiErrorBody {
  readonly error?: {
    readonly message?: string
  }
}

export async function getSession(): Promise<SessionData | null> {
  const response = await fetch('/api/auth/session', {
    credentials: 'include',
  })
  if (response.status === 401) {
    return null
  }
  return readJsonResponse<SessionData>(response)
}

export async function login(input: LoginInput): Promise<SessionData> {
  const response = await fetch('/api/auth/login', {
    body: JSON.stringify(input),
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  return readJsonResponse<SessionData>(response)
}

export async function logout(csrfToken: string): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    credentials: 'include',
    headers: { 'x-csrf-token': csrfToken },
    method: 'POST',
  })
  if (!response.ok) {
    await readJsonResponse(response)
  }
}

export async function getCategories(): Promise<readonly CategoryData[]> {
  const response = await fetch('/api/categories', { credentials: 'include' })
  const body = await readJsonResponse<{ items: CategoryData[] }>(response)
  return body.items
}

export async function createCategory(
  csrfToken: string,
  input: Pick<CategoryData, 'direction' | 'name'>,
): Promise<CategoryData> {
  return mutateJson('/api/categories', csrfToken, input, 'POST')
}

export async function setCategoryStatus(
  csrfToken: string,
  categoryId: string,
  isActive: boolean,
): Promise<{ readonly id: string; readonly isActive: boolean }> {
  return mutateJson(
    `/api/categories/${categoryId}/status`,
    csrfToken,
    { isActive },
    'PATCH',
  )
}

export async function getCreditCards(): Promise<readonly CreditCardData[]> {
  const response = await fetch('/api/credit-cards', { credentials: 'include' })
  const body = await readJsonResponse<{ items: CreditCardData[] }>(response)
  return body.items
}

export function createCreditCard(
  csrfToken: string,
  input: {
    readonly cutoffDay: number
    readonly dueDay: number
    readonly maskedSuffix?: string | undefined
    readonly name: string
  },
): Promise<CreditCardData> {
  return mutateJson('/api/credit-cards', csrfToken, input, 'POST')
}

export function setCreditCardStatus(
  csrfToken: string,
  creditCardId: string,
  isActive: boolean,
): Promise<{ readonly id: string; readonly isActive: boolean }> {
  return mutateJson(
    `/api/credit-cards/${creditCardId}/status`,
    csrfToken,
    { isActive },
    'PATCH',
  )
}

export async function getCreditCardStatements(filters: {
  readonly cardId?: string | undefined
  readonly dateFrom: string
  readonly dateTo: string
}): Promise<readonly CreditCardStatementData[]> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value)
  }
  const response = await fetch(`/api/credit-card-statements?${params}`, {
    credentials: 'include',
  })
  const body = await readJsonResponse<{ items: CreditCardStatementData[] }>(
    response,
  )
  return body.items
}

export async function getTransactions(
  filters: TransactionFilters = {},
): Promise<{
  readonly items: readonly TransactionData[]
  readonly nextPage: number | null
}> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, String(value))
  }
  const query = params.size > 0 ? `?${params.toString()}` : ''
  const response = await fetch(`/api/transactions${query}`, {
    credentials: 'include',
  })
  return readJsonResponse(response)
}

export async function getInstallmentPlans(): Promise<
  readonly InstallmentPlanData[]
> {
  const response = await fetch('/api/installment-plans', {
    credentials: 'include',
  })
  const body = await readJsonResponse<{ items: InstallmentPlanData[] }>(
    response,
  )
  return body.items
}

export function createInstallmentPlan(
  csrfToken: string,
  input: InstallmentPlanInput,
): Promise<InstallmentPlanData> {
  return mutateJson('/api/installment-plans', csrfToken, input, 'POST')
}

export function setInstallmentStatus(
  csrfToken: string,
  planId: string,
  installmentNumber: number,
  input:
    | {
        readonly paidAmount: string
        readonly paidDate: string
        readonly closesPlan: boolean
        readonly status: 'paid'
      }
    | { readonly status: 'unpaid' },
): Promise<InstallmentPlanData> {
  return mutateJson(
    `/api/installment-plans/${planId}/occurrences/${installmentNumber}`,
    csrfToken,
    input,
    'PATCH',
  )
}

export function cancelInstallmentPlan(
  csrfToken: string,
  planId: string,
): Promise<InstallmentPlanData> {
  return mutateJson(
    `/api/installment-plans/${planId}/cancel`,
    csrfToken,
    undefined,
    'POST',
  )
}

export async function getRecurringExpenses(
  csrfToken: string,
): Promise<readonly RecurringExpenseData[]> {
  await mutateJson(
    '/api/recurring-expenses/materialize',
    csrfToken,
    undefined,
    'POST',
  )
  const response = await fetch('/api/recurring-expenses', {
    credentials: 'include',
  })
  const body = await readJsonResponse<{ items: RecurringExpenseData[] }>(
    response,
  )
  return body.items
}

export function createRecurringExpense(
  csrfToken: string,
  input: RecurringExpenseInput & { readonly idempotencyKey: string },
): Promise<RecurringExpenseData> {
  return mutateJson('/api/recurring-expenses', csrfToken, input, 'POST')
}

export function updateRecurringExpense(
  csrfToken: string,
  ruleId: string,
  input: RecurringExpenseInput,
): Promise<RecurringExpenseData> {
  return mutateJson(
    `/api/recurring-expenses/${ruleId}`,
    csrfToken,
    input,
    'PATCH',
  )
}

export function setRecurringExpenseStatus(
  csrfToken: string,
  ruleId: string,
  period: string,
  input:
    | {
        readonly paidAmount: string
        readonly paidDate: string
        readonly status: 'paid'
      }
    | { readonly status: 'unpaid' },
): Promise<RecurringExpenseData> {
  return mutateJson(
    `/api/recurring-expenses/${ruleId}/occurrences/${period}`,
    csrfToken,
    input,
    'PATCH',
  )
}

export function stopRecurringExpense(
  csrfToken: string,
  ruleId: string,
  futureOccurrences: 'cancel' | 'retain',
): Promise<RecurringExpenseData> {
  return mutateJson(
    `/api/recurring-expenses/${ruleId}/stop`,
    csrfToken,
    { futureOccurrences },
    'POST',
  )
}

export function createTransaction(
  csrfToken: string,
  input: TransactionInput,
): Promise<TransactionData> {
  return mutateJson('/api/transactions', csrfToken, input, 'POST')
}

export function correctTransaction(
  csrfToken: string,
  transactionId: string,
  input: TransactionInput,
): Promise<TransactionData> {
  return mutateJson(
    `/api/transactions/${transactionId}/corrections`,
    csrfToken,
    input,
    'POST',
  )
}

export function cancelTransaction(
  csrfToken: string,
  transactionId: string,
): Promise<TransactionData> {
  return mutateJson(
    `/api/transactions/${transactionId}/cancel`,
    csrfToken,
    undefined,
    'POST',
  )
}

async function mutateJson<T>(
  url: string,
  csrfToken: string,
  body: unknown,
  method: 'PATCH' | 'POST',
): Promise<T> {
  const response = await fetch(url, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    credentials: 'include',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      'x-csrf-token': csrfToken,
    },
    method,
  })
  return readJsonResponse<T>(response)
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & ApiErrorBody
  if (!response.ok) {
    throw new Error(body.error?.message ?? 'ไม่สามารถดำเนินการได้')
  }
  return body
}
