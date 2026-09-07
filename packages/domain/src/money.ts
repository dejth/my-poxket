const DECIMAL_INPUT = /^(?<sign>[+-]?)(?<whole>\d+)(?:\.(?<fraction>\d+))?$/

export const THB_DECIMAL_PLACES = 2

export function parseDecimalToMinor(
  input: string,
  decimalPlaces = THB_DECIMAL_PLACES,
): bigint {
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0) {
    throw new RangeError('decimalPlaces must be a non-negative integer')
  }

  const match = DECIMAL_INPUT.exec(input.trim())
  if (!match?.groups) {
    throw new TypeError('Amount must be a plain decimal number')
  }

  const { sign = '', whole = '0', fraction = '' } = match.groups
  const paddedFraction = fraction.padEnd(decimalPlaces + 1, '0')
  const retainedFraction = paddedFraction.slice(0, decimalPlaces)
  const roundingDigit = paddedFraction.at(decimalPlaces) ?? '0'
  const scale = 10n ** BigInt(decimalPlaces)
  let amountMinor = BigInt(whole) * scale + BigInt(retainedFraction || '0')

  // Financial amounts use round half up. The sign is applied after rounding so
  // negative values round away from zero at an exact half.
  if (roundingDigit >= '5') {
    amountMinor += 1n
  }

  return sign === '-' ? -amountMinor : amountMinor
}

export function allocateInstallmentAmounts(
  totalMinor: bigint,
  totalInstallments: number,
): readonly bigint[] {
  if (totalMinor <= 0n) {
    throw new RangeError('totalMinor must be positive')
  }

  if (!Number.isSafeInteger(totalInstallments) || totalInstallments <= 0) {
    throw new RangeError('totalInstallments must be a positive integer')
  }

  const installmentCount = BigInt(totalInstallments)
  const baseAmount = totalMinor / installmentCount
  const finalRemainder = totalMinor % installmentCount
  const amounts = Array<bigint>(totalInstallments).fill(baseAmount)
  amounts[totalInstallments - 1] = baseAmount + finalRemainder
  return amounts
}
