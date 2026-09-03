const ISO_LOCAL_DATE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/

export type LocalDate = `${number}-${number}-${number}`

interface DateParts {
  readonly year: number
  readonly month: number
  readonly day: number
}

export function parseLocalDate(value: string): DateParts {
  const match = ISO_LOCAL_DATE.exec(value)
  if (!match?.groups) {
    throw new TypeError('Date must use YYYY-MM-DD')
  }

  const year = Number(match.groups.year)
  const month = Number(match.groups.month)
  const day = Number(match.groups.day)
  const maximumDay = daysInMonth(year, month)

  if (day < 1 || day > maximumDay) {
    throw new RangeError('Date is not a valid calendar date')
  }

  return { year, month, day }
}

export function daysInMonth(year: number, month: number): number {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new RangeError('year and month must identify a calendar month')
  }

  if (month === 2) {
    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    return isLeapYear ? 29 : 28
  }

  return new Set([4, 6, 9, 11]).has(month) ? 30 : 31
}

export function addCalendarMonthsClamped(
  localDate: string,
  monthsToAdd: number,
): LocalDate {
  if (!Number.isSafeInteger(monthsToAdd)) {
    throw new RangeError('monthsToAdd must be an integer')
  }

  const { year, month, day } = parseLocalDate(localDate)
  const zeroBasedTargetMonth = year * 12 + (month - 1) + monthsToAdd
  const targetYear = Math.floor(zeroBasedTargetMonth / 12)
  const targetMonth = (((zeroBasedTargetMonth % 12) + 12) % 12) + 1
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth))
  return formatLocalDate({
    year: targetYear,
    month: targetMonth,
    day: targetDay,
  })
}

export function calculateInstallmentEndDate(
  firstPaymentDate: string,
  totalInstallments: number,
): LocalDate {
  if (!Number.isSafeInteger(totalInstallments) || totalInstallments <= 0) {
    throw new RangeError('totalInstallments must be a positive integer')
  }

  return addCalendarMonthsClamped(firstPaymentDate, totalInstallments - 1)
}

export function calculateStatementEndDate(
  transactionDate: string,
  cutoffDay: number,
): LocalDate {
  validateCardDay(cutoffDay)
  const { year, month, day } = parseLocalDate(transactionDate)
  const statementMonth =
    day <= Math.min(cutoffDay, daysInMonth(year, month)) ? month : month + 1
  return dateForMonthDay(year, statementMonth, cutoffDay)
}

export function calculateCardDueDate(
  statementEndDate: string,
  dueDay: number,
): LocalDate {
  validateCardDay(dueDay)
  const { year, month } = parseLocalDate(statementEndDate)
  const sameMonth = dateForMonthDay(year, month, dueDay)
  return sameMonth > statementEndDate
    ? sameMonth
    : dateForMonthDay(year, month + 1, dueDay)
}

export function calculatePlannedCardPaymentDate(
  statementEndDate: string,
  officialDueDate: string,
): LocalDate {
  parseLocalDate(statementEndDate)
  const { year, month } = parseLocalDate(officialDueDate)
  const priorMonthEnd = dateForMonthDay(year, month - 1, 31)
  return priorMonthEnd >= statementEndDate
    ? priorMonthEnd
    : (officialDueDate as LocalDate)
}

function validateCardDay(day: number): void {
  if (!Number.isSafeInteger(day) || day < 1 || day > 31) {
    throw new RangeError('Card calendar day must be an integer from 1 to 31')
  }
}

function dateForMonthDay(year: number, month: number, day: number): LocalDate {
  const monthIndex = year * 12 + month - 1
  const normalizedYear = Math.floor(monthIndex / 12)
  const normalizedMonth = (((monthIndex % 12) + 12) % 12) + 1
  return formatLocalDate({
    day: Math.min(day, daysInMonth(normalizedYear, normalizedMonth)),
    month: normalizedMonth,
    year: normalizedYear,
  })
}

function formatLocalDate({ year, month, day }: DateParts): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as LocalDate
}
