import type { EventInput } from '@family-wishes/core'
import {
  applyDraftAction,
  createEvent,
  ensureAdmin,
  getSettings,
  insertDraftIfMissing,
  setSetting,
  type DbHandle
} from '@family-wishes/db'
import { createTestDb } from '@family-wishes/db/testing'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { sendFestivalReminder, sendNudge } from '../src/jobs/daily.ts'
import { ADMIN_PHONE, fixedNow, testDeps } from './fakes.ts'

let h: DbHandle
let adminId: string
const now = fixedNow('2026-12-05T07:00:00+05:30')

async function draftToday(names: string) {
  const input: EventInput = {
    type: 'birthday', names, familyCallsThem: null, title: null, day: 5, month: 12, year: null, repeatsYearly: true, note: null
  }
  const event = await createEvent(h.db, input, adminId)
  const d = await insertDraftIfMissing(h.db, { occurrenceDate: '2026-12-05', eventId: event.id, text: `Happy birthday ${names}!`, source: 'ai' })
  if (!d) throw new Error('no draft')
  return d
}

beforeEach(async () => {
  h = await createTestDb()
  adminId = (await ensureAdmin(h.db, ADMIN_PHONE)).id
})

afterEach(async () => {
  await h.close()
})

test('sendNudge lists only pending drafts and makes today the active batch', async () => {
  await draftToday('Pending')
  const done = await draftToday('Approved')
  await applyDraftAction(h.db, done.id, 'approve')
  await setSetting(h.db, 'active_batch_date', '2026-12-04')

  const deps = testDeps(h.db, { now })
  expect(await sendNudge(deps)).toBe(true)
  const [nudge] = deps.messenger.to('self')
  expect(nudge).toContain('1) Birthday — Pending')
  expect(nudge).not.toContain('Approved')
  expect((await getSettings(h.db)).activeBatchDate).toBe('2026-12-05')
})

test('sendNudge does nothing without pending drafts', async () => {
  const deps = testDeps(h.db, { now })
  expect(await sendNudge(deps)).toBe(false)
  expect(deps.messenger.sent).toHaveLength(0)
})

test('sendFestivalReminder points the admin to the festivals page', async () => {
  const deps = testDeps(h.db, { now })
  await sendFestivalReminder(deps)
  expect(deps.messenger.to('self')[0]).toMatch(/festival/i)
})
