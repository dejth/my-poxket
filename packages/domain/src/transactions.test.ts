import { describe, expect, it } from 'vitest'

import {
  MAX_TRANSACTION_AMOUNT_MINOR,
  nextTransactionStatus,
  parseTransactionAmount,
  validateCategoryDirection,
  validatePaymentMethod,
} from './transactions.js'

describe('transaction amounts', () => {
  it('converts THB decimal input into exact minor units', () => {
    expect(parseTransactionAmount('1250.50')).toBe(125_050n)
    expect(parseTransactionAmount('1.005')).toBe(101n)
  })

  it('rejects zero, negative, malformed, and oversized values', () => {
    for (const input of ['0', '-1', '1e3', 'NaN', '']) {
      expect(() => parseTransactionAmount(input)).toThrow()
    }
    expect(() =>
      parseTransactionAmount(
        ((MAX_TRANSACTION_AMOUNT_MINOR + 1n) / 100n).toString(),
      ),
    ).toThrow('maximum')
  })
})

describe('transaction compatibility', () => {
  it('requires category and transaction directions to match', () => {
    expect(() => validateCategoryDirection('income', 'income')).not.toThrow()
    expect(() => validateCategoryDirection('income', 'expense')).toThrow()
  })

  it('defers credit-card expenses and always rejects credit-card income', () => {
    expect(() => validatePaymentMethod('expense', 'cash')).not.toThrow()
    expect(() => validatePaymentMethod('expense', 'credit_card')).toThrow(
      'not available',
    )
    expect(() =>
      validatePaymentMethod('income', 'credit_card', {
        creditCardsEnabled: true,
      }),
    ).toThrow('only be used for expenses')
  })
})

describe('transaction lifecycle', () => {
  it('only cancels or supersedes active transactions', () => {
    expect(nextTransactionStatus('active', 'cancel')).toBe('cancelled')
    expect(nextTransactionStatus('active', 'correct')).toBe('superseded')
    expect(() => nextTransactionStatus('cancelled', 'correct')).toThrow()
    expect(() => nextTransactionStatus('superseded', 'cancel')).toThrow()
  })
})
