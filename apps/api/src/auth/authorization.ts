import { and, eq, gt } from 'drizzle-orm'

import type { Database } from '../database/client.js'
import { sessions, users } from '../database/schema.js'
import { hashSessionToken } from './session.js'

export interface AuthenticatedSession {
  readonly csrfToken: string
  readonly id: string
  readonly role: 'member' | 'owner'
  readonly userId: string
  readonly username: string
}

export function getSessionCookieName(
  nodeEnv: 'development' | 'test' | 'production',
): string {
  return nodeEnv === 'production'
    ? '__Host-my_poxket_session'
    : 'my_poxket_session'
}

export async function findSession(
  token: string | undefined,
  database: Database,
): Promise<AuthenticatedSession | undefined> {
  if (!token) {
    return undefined
  }

  const [session] = await database
    .select({
      csrfToken: sessions.csrfToken,
      id: sessions.id,
      role: users.role,
      userId: users.id,
      username: users.username,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    )
    .limit(1)

  return session
}
