import { describe, expect, it } from 'vitest'

import { allocateInstallmentAmounts, parseDecimalToMinor } from './money.js'

describe('parseDecimalToMinor', () => {
  it.each([
    ['0', 0n],
    ['700', 70_000n],
    ['7500.10', 750_010n],
    ['1.004', 100n],
    ['1.005', 101n],
    ['-1.005', -101n],
  ])('rounds %s to %s minor units', (input, expected) => {
    expect(parseDecimalToMinor(input)).toBe(expected)
  })

  it('rejects exponent notation to keep conversion explicit', () => {
    expect(() => parseDecimalToMinor('1e3')).toThrow(TypeError)
  })
})

describe('allocateInstallmentAmounts', () => {
  it('puts an indivisible remainder in the final installment', () => {
    expect(allocateInstallmentAmounts(10_000n, 3)).toEqual([
      3_333n,
      3_333n,
      3_334n,
    ])
  })

  it('generates exactly N installments whose sum matches the total', () => {
    const amounts = allocateInstallmentAmounts(750_000n, 60)
    expect(amounts).toHaveLength(60)
    expect(amounts.reduce((sum, amount) => sum + amount, 0n)).toBe(750_000n)
  })
})
