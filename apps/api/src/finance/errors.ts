export class FinanceError extends Error {
  readonly code: string
  readonly statusCode: 400 | 404 | 409

  constructor(
    code: string,
    message: string,
    statusCode: 400 | 404 | 409 = 400,
  ) {
    super(message)
    this.name = 'FinanceError'
    this.code = code
    this.statusCode = statusCode
  }
}

export function isDuplicateEntry(error: unknown): boolean {
  let current = error

  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== 'object' || current === null) return false
    if ('code' in current && current.code === 'ER_DUP_ENTRY') return true
    if (!('cause' in current)) return false
    current = current.cause
  }

  return false
}
