import {
  createEvent,
  createFestival,
  ensureAdmin,
  findDraftByNumber,
  setSetting,
  type DbHandle
} from '@family-wishes/db'
import { createTestDb } from '@family-wishes/db/testing'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { ensureDraftsFor } from '../src/jobs/drafting.ts'
import { handleAdminReply } from '../src/jobs/replies.ts'
import { ADMIN_PHONE, FakeModel, testDeps } from './fakes.ts'

const DATE = '2026-12-05'
const FIRST = 'Happy Test Utsav to the whole family! ✨ Wishing everyone joy.'
const REDONE = 'A brand new wish for Chachu! 🎂 Lots of love from all of us.'

let h: DbHandle
let deps: ReturnType<typeof testDeps>

beforeEach(async () => {
  h = await createTestDb()
  const admin = await ensureAdmin(h.db, ADMIN_PHONE)
  await createFestival(h.db, { name: 'Test Utsav', date: DATE })
  await createEvent(
    h.db,
    { type: 'birthday', names: 'Rahul', familyCallsThem: 'Chachu', title: null, day: 5, month: 12, year: null, repeatsYearly: true, note: null },
    admin.id
  )
  deps = testDeps(h.db, { model: new FakeModel([FIRST, FIRST, REDONE]) })
  await ensureDraftsFor(DATE, deps)
  deps.messenger.sent.length = 0
})

afterEach(async () => {
  await h.close()
})

async function status(n: number) {
  return (await findDraftByNumber(h.db, DATE, n))?.status
}

function onlyReply(): string {
  expect(deps.messenger.sent).toHaveLength(1)
  expect(deps.messenger.sent[0]?.to).toBe('self')
  return deps.messenger.sent[0]?.text ?? ''
}

test('ok 2 approves draft 2 only', async () => {
  await handleAdminReply('ok 2', deps)
  expect([await status(1), await status(2)]).toEqual(['pending', 'approved'])
  const reply = onlyReply()
  expect(reply).toContain('Approved')
  expect(reply).toContain('Birthday — Rahul (Chachu)')
})

test('ok approves every open draft', async () => {
  await handleAdminReply('ok', deps)
  expect([await status(1), await status(2)]).toEqual(['approved', 'approved'])
  expect(onlyReply()).toContain('Test Utsav')
})

test('skip 1 skips draft 1', async () => {
  await handleAdminReply('skip 1', deps)
  expect(await status(1)).toBe('skipped')
  expect(onlyReply()).toContain('Skipped')
})

test('redo 2 writes a new draft and sends it', async () => {
  await handleAdminReply('ok 2', deps)
  deps.messenger.sent.length = 0
  await handleAdminReply('redo 2', deps)
  const draft = await findDraftByNumber(h.db, DATE, 2)
  expect(draft).toMatchObject({ text: REDONE, status: 'pending', source: 'ai' })
  expect(onlyReply()).toContain(REDONE)
})

test('a numbered text replaces the draft and approves it', async () => {
  await handleAdminReply('2 Happy birthday Nani, lots of love!', deps)
  expect(await findDraftByNumber(h.db, DATE, 2)).toMatchObject({
    text: 'Happy birthday Nani, lots of love!',
    source: 'admin',
    status: 'approved'
  })
  expect(onlyReply()).toContain('Approved')
})

test('a stray short reply changes nothing and explains why', async () => {
  await handleAdminReply('k', deps)
  expect([await status(1), await status(2)]).toEqual(['pending', 'pending'])
  expect(onlyReply()).toContain('too short')
})

test('with no active batch the admin is told nothing is waiting', async () => {
  await setSetting(h.db, 'active_batch_date', '')
  await handleAdminReply('ok', deps)
  expect(onlyReply()).toContain('No drafts are waiting')
})

test('acting on a draft that already went out says so', async () => {
  await h.execRaw(`update drafts set status = 'sent' where number = 1`)
  await handleAdminReply('skip 2', deps)
  deps.messenger.sent.length = 0
  await h.execRaw(`update drafts set status = 'expired' where number = 2`)
  await handleAdminReply('ok', deps)
  expect(onlyReply()).toContain('No drafts are waiting')
})
