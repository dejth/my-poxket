import { describe, expect, it } from 'vitest'

import {
  addCalendarMonthsClamped,
  calculateInstallmentEndDate,
  daysInMonth,
} from './calendar.js'

describe('calendar rules', () => {
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
})
