import { createHash, randomBytes, randomUUID } from 'node:crypto'

export const SESSION_24_HOURS_MS = 24 * 60 * 60 * 1000
export const SESSION_7_DAYS_MS = 7 * SESSION_24_HOURS_MS

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createSessionRecord(
  userId: string,
  rememberMe: boolean,
  now = new Date(),
) {
  const token = createOpaqueToken()
  const lifetimeMs = rememberMe ? SESSION_7_DAYS_MS : SESSION_24_HOURS_MS

  return {
    cookieMaxAgeSeconds: lifetimeMs / 1000,
    record: {
      csrfToken: createOpaqueToken(),
      expiresAt: new Date(now.getTime() + lifetimeMs),
      id: randomUUID(),
      tokenHash: hashSessionToken(token),
      userId,
    },
    token,
  }
}
