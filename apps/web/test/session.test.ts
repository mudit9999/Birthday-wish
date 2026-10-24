import { createTestDb } from '@family-wishes/db/testing'
import { addMember, queryRows, type DbHandle, type Member } from '@family-wishes/db'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createSession, deleteSession, findSessionMember } from '../lib/auth/session'

const NOW = new Date('2026-12-05T10:00:00Z')
const DAY = 24 * 60 * 60 * 1000

let h: DbHandle
let member: Member

beforeEach(async () => {
  h = await createTestDb()
  const added = await addMember(h.db, { phone: '919811111111', name: 'Nani' })
  if (added === 'duplicate') throw new Error('duplicate')
  member = added
})

afterEach(async () => {
  await h.close()
})

test('a valid token finds its member, and only the hash is stored', async () => {
  const token = await createSession(h.db, member.id, NOW)
  expect(token.length).toBeGreaterThanOrEqual(43)
  expect(await findSessionMember(h.db, token, NOW)).toEqual(member)
  const stored = await queryRows<{ token_hash: string }>(h.db, sql`select token_hash from sessions`)
  expect(stored).toHaveLength(1)
  expect(stored[0]?.token_hash).not.toBe(token)
})

test('sessions last 180 days', async () => {
  const token = await createSession(h.db, member.id, NOW)
  expect(await findSessionMember(h.db, token, new Date(NOW.getTime() + 179 * DAY))).toEqual(member)
  expect(await findSessionMember(h.db, token, new Date(NOW.getTime() + 181 * DAY))).toBeNull()
})

test('unknown, empty and deleted tokens find nobody', async () => {
  expect(await findSessionMember(h.db, 'not-a-real-token', NOW)).toBeNull()
  expect(await findSessionMember(h.db, '', NOW)).toBeNull()
  const token = await createSession(h.db, member.id, NOW)
  await deleteSession(h.db, token)
  expect(await findSessionMember(h.db, token, NOW)).toBeNull()
})
