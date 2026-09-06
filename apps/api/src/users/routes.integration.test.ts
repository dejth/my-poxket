import { randomUUID } from 'node:crypto'

import argon2 from 'argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../app.js'
import { createSessionRecord } from '../auth/session.js'
import { createDatabase } from '../database/client.js'
import { sessions, users } from '../database/schema.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('owner-managed users', () => {
  const config = {
    bootstrapPassword: undefined,
    bootstrapUsername: undefined,
    databaseUrl: databaseUrl ?? 'mysql://unused',
    host: '127.0.0.1',
    port: 3000,
    nodeEnv: 'test' as const,
    webOrigin: 'http://localhost:5173',
  }
  const { database, connection } = createDatabase(config)
  const ownerId = randomUUID()
  const memberId = randomUUID()
  const ownerSession = createSessionRecord(ownerId, false)
  const memberSession = createSessionRecord(memberId, false)
  const ownerHeaders = {
    cookie: `my_poxket_session=${ownerSession.token}`,
    'x-csrf-token': ownerSession.record.csrfToken,
  }
  const memberHeaders = {
    cookie: `my_poxket_session=${memberSession.token}`,
    'x-csrf-token': memberSession.record.csrfToken,
  }
  const createdIds: string[] = [ownerId, memberId]
  let app: Awaited<ReturnType<typeof createApp>>

  beforeAll(async () => {
    const passwordHash = await argon2.hash('fictional-password-1234', {
      type: argon2.argon2id,
    })
    await database.insert(users).values([
      {
        id: ownerId,
        name: 'Owner Example',
        username: 'users-test-owner',
        passwordHash,
        role: 'owner',
      },
      {
        id: memberId,
        name: 'Member Example',
        username: 'users-test-member',
        passwordHash,
        role: 'member',
      },
    ])
    await database
      .insert(sessions)
      .values([ownerSession.record, memberSession.record])
    app = await createApp(config)
  })

  afterAll(async () => {
    if (app) await app.close()
    for (const id of createdIds) {
      await database.delete(sessions).where(eq(sessions.userId, id))
      await database.delete(users).where(eq(users.id, id))
    }
    await connection.end()
  })

  it('blocks anonymous, member, non-CSRF and role-injection requests', async () => {
    for (const method of ['GET', 'POST', 'PATCH'] as const) {
      const url = method === 'PATCH' ? `/api/users/${memberId}` : '/api/users'
      expect((await app.inject({ method, url })).statusCode).toBe(401)
      expect(
        (await app.inject({ method, url, headers: memberHeaders })).statusCode,
      ).toBe(403)
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/users',
          headers: { cookie: ownerHeaders.cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/users',
          headers: ownerHeaders,
          payload: {
            name: 'Example',
            username: 'users-test-created',
            password: 'fictional-password-1234',
            role: 'owner',
          },
        })
      ).statusCode,
    ).toBe(400)
  })

  it('creates a member, normalizes usernames, lists only public fields, and permits shared-ledger login', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: ownerHeaders,
      payload: {
        name: '  New Example  ',
        username: ' USERS-TEST-CREATED ',
        password: 'fictional-created-1234',
      },
    })
    expect(response.statusCode).toBe(201)
    const user = response.json<{ id: string; name: string; username: string }>()
    createdIds.push(user.id)
    expect(user).toEqual({
      id: user.id,
      name: 'New Example',
      username: 'users-test-created',
    })
    const [stored] = await database
      .select()
      .from(users)
      .where(eq(users.id, user.id))
    expect(stored?.role).toBe('member')
    expect(
      await argon2.verify(stored!.passwordHash, 'fictional-created-1234'),
    ).toBe(true)
    const listing = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: ownerHeaders,
    })
    expect(listing.statusCode).toBe(200)
    for (const item of listing.json<{ items: object[] }>().items)
      expect(Object.keys(item).sort()).toEqual(['id', 'name', 'username'])
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'users-test-created',
        password: 'fictional-created-1234',
      },
    })
    expect(login.statusCode).toBe(200)
    const cookie = String(login.headers['set-cookie']).split(';')[0]!
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/categories',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/users',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(403)
  })

  it('rejects duplicate/invalid names and preserves password and session on a blank-password edit', async () => {
    const [before] = await database
      .select()
      .from(users)
      .where(eq(users.id, memberId))
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/users/${memberId}`,
      headers: ownerHeaders,
      payload: {
        name: 'Renamed Example',
        username: 'users-test-renamed',
        password: '',
      },
    })
    expect(response.statusCode).toBe(200)
    const [after] = await database
      .select()
      .from(users)
      .where(eq(users.id, memberId))
    expect(after?.passwordHash).toBe(before?.passwordHash)
    expect(after?.role).toBe('member')
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/auth/session',
          headers: memberHeaders,
        })
      ).statusCode,
    ).toBe(200)
    const duplicate = await app.inject({
      method: 'PATCH',
      url: `/api/users/${memberId}`,
      headers: ownerHeaders,
      payload: {
        name: 'Collision Example',
        username: 'USERS-TEST-OWNER',
        password: 'replacement-password-1234',
      },
    })
    expect(duplicate.statusCode).toBe(409)
    const [unchanged] = await database
      .select()
      .from(users)
      .where(eq(users.id, memberId))
    expect(unchanged).toEqual(after)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/users',
          headers: ownerHeaders,
          payload: { name: ' ', username: 'abc', password: 'short' },
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/users/${randomUUID()}`,
          headers: ownerHeaders,
          payload: { name: 'Missing', username: 'missing-user' },
        })
      ).statusCode,
    ).toBe(404)
  })

  it('revokes target sessions atomically on password change and requires login after changing the owner password', async () => {
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/users/${memberId}`,
          headers: ownerHeaders,
          payload: {
            name: 'Member Example',
            username: 'users-test-renamed',
            password: 'new-fictional-password-1234',
          },
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/auth/session',
          headers: memberHeaders,
        })
      ).statusCode,
    ).toBe(401)
    for (const [password, status] of [
      ['fictional-password-1234', 401],
      ['new-fictional-password-1234', 200],
    ] as const) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { username: 'users-test-renamed', password },
          })
        ).statusCode,
      ).toBe(status)
    }
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/users/${ownerId}`,
      headers: ownerHeaders,
      payload: {
        name: 'Owner Example',
        username: 'users-test-owner',
        password: 'new-owner-password-1234',
      },
    })
    expect(changed.statusCode).toBe(200)
    expect(changed.json<{ requiresLogin: boolean }>().requiresLogin).toBe(true)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/users',
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(401)
  })
})
