import { describe, expect, it } from 'vitest'

import {
  createSessionRecord,
  hashSessionToken,
  SESSION_24_HOURS_MS,
  SESSION_7_DAYS_MS,
} from './session.js'

describe('session lifetime', () => {
  const now = new Date('2026-09-02T00:00:00.000Z')

  it('uses 24 hours when remember me is not selected', () => {
    const session = createSessionRecord('user-id', false, now)
    expect(session.record.expiresAt.getTime() - now.getTime()).toBe(
      SESSION_24_HOURS_MS,
    )
  })

  it('uses 7 days when remember me is selected', () => {
    const session = createSessionRecord('user-id', true, now)
    expect(session.record.expiresAt.getTime() - now.getTime()).toBe(
      SESSION_7_DAYS_MS,
    )
  })

  it('stores only a one-way hash of the opaque session token', () => {
    const session = createSessionRecord('user-id', false, now)
    expect(session.record.tokenHash).toBe(hashSessionToken(session.token))
    expect(session.record.tokenHash).not.toContain(session.token)
  })
})
