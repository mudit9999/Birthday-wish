import {
  enqueueOutbox,
  ensureAdmin,
  addMember,
  type DbHandle
} from '@family-wishes/db'
import { createTestDb } from '@family-wishes/db/testing'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { sendOutbox } from '../src/jobs/outbox.js'
import { recoverInterruptedSends } from '../src/jobs/posting.js'
import { ADMIN_PHONE, testDeps } from './fakes.js'

const MEMBER = '919811111111'

let h: DbHandle

async function outboxRows() {
  const { queryRows } = await import('@family-wishes/db')
  const { sql } = await import('drizzle-orm')
  return queryRows<{ to_phone: string; body: string; status: string; error: string | null }>(
    h.db,
    sql`select to_phone, body, status, error from outbox order by created_at`
  )
}

beforeEach(async () => {
  h = await createTestDb()
  await ensureAdmin(h.db, ADMIN_PHONE)
  await addMember(h.db, { phone: MEMBER, name: 'Nani' })
})

afterEach(async () => {
  await h.close()
})

const realClock = { now: () => new Date() }

test('a queued code to a member is sent once and its body is wiped', async () => {
  await enqueueOutbox(h.db, MEMBER, 'Your Family Wishes code is 123456')
  const deps = testDeps(h.db, realClock)
  expect(await sendOutbox(deps)).toBe(1)
  expect(deps.messenger.to(MEMBER)).toEqual(['Your Family Wishes code is 123456'])
  expect(await outboxRows()).toEqual([{ to_phone: MEMBER, body: '', status: 'sent', error: null }])

  expect(await sendOutbox(deps)).toBe(0)
  expect(deps.messenger.sent).toHaveLength(1)
})

test('a number that is not a member is never messaged', async () => {
  await enqueueOutbox(h.db, '919899999999', 'Your code is 123456')
  const deps = testDeps(h.db, realClock)
  expect(await sendOutbox(deps)).toBe(0)
  expect(deps.messenger.sent).toHaveLength(0)
  expect(await outboxRows()).toMatchObject([{ status: 'failed', error: 'not a member', body: '' }])
})

test('a code older than 10 minutes is dropped unsent', async () => {
  await enqueueOutbox(h.db, MEMBER, 'Your code is 123456')
  await h.execRaw(`update outbox set created_at = now() - interval '11 minutes'`)
  const deps = testDeps(h.db, realClock)
  expect(await sendOutbox(deps)).toBe(0)
  expect(deps.messenger.sent).toHaveLength(0)
  expect(await outboxRows()).toMatchObject([{ status: 'failed', error: 'expired' }])
})

test('codes wait while WhatsApp is down', async () => {
  await enqueueOutbox(h.db, MEMBER, 'Your code is 123456')
  const deps = testDeps(h.db, realClock)
  deps.messenger.ready = false
  expect(await sendOutbox(deps)).toBe(0)
  expect(await outboxRows()).toMatchObject([{ status: 'queued' }])
})

test('a failed send is recorded and not retried', async () => {
  await enqueueOutbox(h.db, MEMBER, 'Your code is 123456')
  const deps = testDeps(h.db, realClock)
  deps.messenger.failNext = new Error('not on WhatsApp')
  expect(await sendOutbox(deps)).toBe(0)
  expect(await outboxRows()).toMatchObject([{ status: 'failed', error: 'not on WhatsApp', body: '' }])
})

test('a code left mid-send by a crash is failed, never resent', async () => {
  await enqueueOutbox(h.db, MEMBER, 'Your code is 123456')
  await h.execRaw(`update outbox set status = 'sending'`)
  await recoverInterruptedSends(testDeps(h.db, realClock))
  expect(await outboxRows()).toMatchObject([{ status: 'failed', body: '' }])
})
