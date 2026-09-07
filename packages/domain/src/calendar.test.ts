import { describe, expect, it } from 'vitest'

import {
  addCalendarMonthsClamped,
  calculateCardDueDate,
  calculateInstallmentEndDate,
  calculatePlannedCardPaymentDate,
  calculateStatementEndDate,
  daysInMonth,
  nextMonthPeriod,
  recurringDateForPeriod,
} from './calendar.js'

describe('calendar rules', () => {
  it('clamps recurring days and advances the materialization period', () => {
    expect(recurringDateForPeriod('2026-02', 31)).toBe('2026-02-28')
    expect(recurringDateForPeriod('2028-02', 31)).toBe('2028-02-29')
    expect(nextMonthPeriod('2026-12-20')).toBe('2027-01')
  })

  it('handles leap and non-leap February', () => {
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2027, 2)).toBe(28)
  })

  it('uses the last calendar day when the requested day is unavailable', () => {
    expect(addCalendarMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addCalendarMonthsClamped('2028-01-31', 1)).toBe('2028-02-29')
  })

  it('calculates installment 60/60 from installment 1/60', () => {
    expect(calculateInstallmentEndDate('2025-10-05', 60)).toBe('2030-09-05')
  })

  it('keeps a one-installment plan on its first payment date', () => {
    expect(calculateInstallmentEndDate('2025-10-05', 1)).toBe('2025-10-05')
  })

  it('assigns purchases before, on, and after the card cut-off', () => {
    expect(calculateStatementEndDate('2026-09-16', 17)).toBe('2026-09-17')
    expect(calculateStatementEndDate('2026-09-17', 17)).toBe('2026-09-17')
    expect(calculateStatementEndDate('2026-09-18', 17)).toBe('2026-10-17')
  })

  it('clamps card rules across short months, leap years, and year boundaries', () => {
    expect(calculateStatementEndDate('2027-02-28', 31)).toBe('2027-02-28')
    expect(calculateStatementEndDate('2028-02-29', 31)).toBe('2028-02-29')
    expect(calculateStatementEndDate('2026-12-31', 17)).toBe('2027-01-17')
    expect(calculateCardDueDate('2026-01-31', 31)).toBe('2026-02-28')
  })

  it('derives official and planned payment dates without preceding the statement', () => {
    const dueDate = calculateCardDueDate('2026-09-17', 1)
    expect(dueDate).toBe('2026-10-01')
    expect(calculatePlannedCardPaymentDate('2026-09-17', dueDate)).toBe(
      '2026-09-30',
    )

    const sameMonthDueDate = calculateCardDueDate('2026-09-05', 25)
    expect(sameMonthDueDate).toBe('2026-09-25')
    expect(
      calculatePlannedCardPaymentDate('2026-09-05', sameMonthDueDate),
    ).toBe('2026-09-25')
  })
})
