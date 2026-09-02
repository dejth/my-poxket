import { parseDecimalToMinor } from './money.js'

export const TRANSACTION_DIRECTIONS = ['income', 'expense'] as const
export const PAYMENT_METHODS = [
  'cash',
  'bank_transfer',
  'debit_card',
  'other',
  'credit_card',
] as const
export const TRANSACTION_STATUSES = [
  'active',
  'superseded',
  'cancelled',
] as const

export type TransactionDirection = (typeof TRANSACTION_DIRECTIONS)[number]
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

export const MAX_TRANSACTION_AMOUNT_MINOR = 99_999_999_999n

export function parseTransactionAmount(input: string): bigint {
  const amountMinor = parseDecimalToMinor(input)

  if (amountMinor <= 0n) {
    throw new RangeError('Transaction amount must be positive')
  }

  if (amountMinor > MAX_TRANSACTION_AMOUNT_MINOR) {
    throw new RangeError('Transaction amount exceeds the supported maximum')
  }

  return amountMinor
}

export function validateCategoryDirection(
  transactionDirection: TransactionDirection,
  categoryDirection: TransactionDirection,
): void {
  if (transactionDirection !== categoryDirection) {
    throw new RangeError('Transaction and category directions must match')
  }
}

export function validatePaymentMethod(
  direction: TransactionDirection,
  paymentMethod: PaymentMethod,
  options: { readonly creditCardsEnabled?: boolean } = {},
): void {
  if (paymentMethod !== 'credit_card') {
    return
  }

  if (direction !== 'expense') {
    throw new RangeError('Credit cards can only be used for expenses')
  }

  if (!options.creditCardsEnabled) {
    throw new RangeError('Credit-card transactions are not available yet')
  }
}

export function nextTransactionStatus(
  current: TransactionStatus,
  action: 'cancel' | 'correct',
): TransactionStatus {
  if (current !== 'active') {
    throw new RangeError('Only an active transaction can be changed')
  }

  return action === 'cancel' ? 'cancelled' : 'superseded'
}
