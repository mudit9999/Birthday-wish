import type { EventInput } from '@family-wishes/core'
import {
  addMember,
  applyDraftAction,
  claimJobRun,
  createEvent,
  enqueueOutbox,
  ensureAdmin,
  findDraftByNumber,
  getEvent,
  listDraftsForDates,
  requestJob,
  setSetting,
  takeJobRequests,
  type DbHandle
} from '@family-wishes/db'
import { createTestDb } from '@family-wishes/db/testing'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { fastTick, slowTick, startLoops } from '../src/scheduler.ts'
import { ADMIN_PHONE, fixedNow, testDeps } from './fakes.ts'

const GROUP = '120363000000@g.us'
const at = (date: string, time: string) => fixedNow(`${date}T${time}:00+05:30`)

let h: DbHandle
let adminId: string

function birthday(names: string, day: number, month = 12): EventInput {
  return { type: 'birthday', names, familyCallsThem: null, title: null, day, month, year: null, repeatsYearly: true, note: null }
}

beforeEach(async () => {
  h = await createTestDb()
  adminId = (await ensureAdmin(h.db, ADMIN_PHONE)).id
  await setSetting(h.db, 'group_id', GROUP)
  await createEvent(h.db, birthday('Today', 5), adminId)
  await createEvent(h.db, birthday('Tomorrow', 6), adminId)
})

afterEach(async () => {
  await h.close()
})

test('a worker that was down across draft time still drafts today’s wishes on startup', async () => {
  const deps = testDeps(h.db, { now: at('2026-12-05', '01:00') })
  await slowTick(deps)
  expect(await listDraftsForDates(h.db, ['2026-12-05'])).toHaveLength(1)
  expect(deps.messenger.to('self')[0]).toContain('Birthday — Today')
  expect(await listDraftsForDates(h.db, ['2026-12-06'])).toHaveLength(0)
})

test('tomorrow is drafted from draft_time, not before', async () => {
  await slowTick(testDeps(h.db, { now: at('2026-12-05', '19:59') }))
  expect(await listDraftsForDates(h.db, ['2026-12-06'])).toHaveLength(0)
  const deps = testDeps(h.db, { now: at('2026-12-05', '20:00') })
  await slowTick(deps)
  expect(await listDraftsForDates(h.db, ['2026-12-06'])).toHaveLength(1)
  expect(deps.messenger.to('self').at(-1)).toContain('Birthday — Tomorrow')
})

test('the nudge goes out once at nudge_time when drafts are pending', async () => {
  await slowTick(testDeps(h.db, { now: at('2026-12-05', '06:00') }))
  const seven = testDeps(h.db, { now: at('2026-12-05', '07:00') })
  await slowTick(seven)
  expect(seven.messenger.to('self').filter((t) => t.startsWith('Reminder'))).toHaveLength(1)
  const later = testDeps(h.db, { now: at('2026-12-05', '07:01') })
  await slowTick(later)
  expect(later.messenger.sent).toHaveLength(0)
})

test('no nudge when nothing is pending', async () => {
  const early = testDeps(h.db, { now: at('2026-12-05', '06:00') })
  await slowTick(early)
  const draft = await findDraftByNumber(h.db, '2026-12-05', 1)
  await applyDraftAction(h.db, draft?.id ?? '', 'approve')
  const seven = testDeps(h.db, { now: at('2026-12-05', '07:00') })
  await slowTick(seven)
  expect(seven.messenger.to('self').filter((t) => t.startsWith('Reminder'))).toHaveLength(0)
})

test('the festival reminder goes out once on 1 December at draft time', async () => {
  const deps = testDeps(h.db, { now: at('2026-12-01', '20:00') })
  await slowTick(deps)
  await slowTick(deps)
  expect(deps.messenger.to('self').filter((t) => /festival dates/i.test(t))).toHaveLength(1)
  const otherDay = testDeps(h.db, { now: at('2026-12-02', '20:00') })
  await slowTick(otherDay)
  expect(otherDay.messenger.to('self').filter((t) => /festival dates/i.test(t))).toHaveLength(0)
})

test('past one-time events are archived once a day', async () => {
  const party = await createEvent(
    h.db,
    { type: 'special', names: 'Sharma family', familyCallsThem: null, title: 'Party', day: 1, month: 12, year: 2026, repeatsYearly: false, note: null },
    adminId
  )
  await slowTick(testDeps(h.db, { now: at('2026-12-05', '00:30') }))
  expect((await getEvent(h.db, party.id))?.archived).toBe(true)
})

test('run-now requests: send posts before send time, draft drafts tomorrow', async () => {
  const morning = testDeps(h.db, { now: at('2026-12-05', '06:00') })
  await slowTick(morning)
  const today = await findDraftByNumber(h.db, '2026-12-05', 1)
  await applyDraftAction(h.db, today?.id ?? '', 'approve')

  await requestJob(h.db, 'send')
  await fastTick(morning)
  expect(morning.messenger.to('group')).toEqual(['Happy day from all of us! 🎉 Wishing you lots of love and laughter.'])

  await requestJob(h.db, 'draft')
  await fastTick(testDeps(h.db, { now: at('2026-12-05', '14:00') }))
  expect(await listDraftsForDates(h.db, ['2026-12-06'])).toHaveLength(1)
  expect(await takeJobRequests(h.db)).toEqual([])
})

test('the fast tick posts approved drafts at send time', async () => {
  await slowTick(testDeps(h.db, { now: at('2026-12-05', '06:00') }))
  const today = await findDraftByNumber(h.db, '2026-12-05', 1)
  await applyDraftAction(h.db, today?.id ?? '', 'approve')
  const deps = testDeps(h.db, { now: at('2026-12-05', '08:00') })
  await fastTick(deps)
  expect(deps.messenger.to('group')).toHaveLength(1)
})

test('one failing job does not stop the others in a tick', async () => {
  const deps = testDeps(h.db, { now: at('2026-12-05', '20:00') })
  deps.messenger.failNext = new Error('socket closed')
  await slowTick(deps)
  expect(await listDraftsForDates(h.db, ['2026-12-05'])).toHaveLength(1)
  expect(await listDraftsForDates(h.db, ['2026-12-06'])).toHaveLength(1)
  expect(deps.messenger.to('self').some((t) => t.includes('Birthday — Tomorrow'))).toBe(true)
})

test('claimJobRun only succeeds once per job and date', async () => {
  expect(await claimJobRun(h.db, 'x', '2026-12-05')).toBe(true)
  expect(await claimJobRun(h.db, 'x', '2026-12-05')).toBe(false)
  expect(await claimJobRun(h.db, 'x', '2026-12-06')).toBe(true)
})

test('the nightly backup is written once after 02:00', async () => {
  const early = testDeps(h.db, { now: at('2026-12-05', '01:59') })
  await slowTick(early)
  expect(await readdir(early.backupDir)).toEqual([])

  const deps = testDeps(h.db, { now: at('2026-12-05', '02:00') })
  await slowTick(deps)
  expect(await readdir(deps.backupDir)).toEqual(['backup-2026-12-05.json'])
  const again = testDeps(h.db, { now: at('2026-12-05', '02:01'), backupDir: deps.backupDir })
  await rm(join(deps.backupDir, 'backup-2026-12-05.json'))
  await slowTick(again)
  expect(await readdir(deps.backupDir)).toEqual([])
})

test('the fast tick sends queued login codes', async () => {
  await addMember(h.db, { phone: '919811111111', name: 'Nani' })
  await enqueueOutbox(h.db, '919811111111', 'Your code is 123456')
  const deps = testDeps(h.db, { now: () => new Date() })
  await fastTick(deps)
  expect(deps.messenger.to('919811111111')).toEqual(['Your code is 123456'])
})

test('startLoops recovers interrupted sends first, then ticks until stopped', async () => {
  await slowTick(testDeps(h.db, { now: at('2026-12-05', '06:00') }))
  const stuck = await findDraftByNumber(h.db, '2026-12-05', 1)
  await applyDraftAction(h.db, stuck?.id ?? '', 'approve')
  await applyDraftAction(h.db, stuck?.id ?? '', 'claim')

  const deps = testDeps(h.db, { now: at('2026-12-05', '20:00') })
  const loops = startLoops(deps, { fastMs: 10, slowMs: 20 })
  await new Promise((resolve) => setTimeout(resolve, 300))
  await loops.stop()

  expect((await findDraftByNumber(h.db, '2026-12-05', 1))?.status).toBe('failed')
  expect(deps.messenger.to('group')).toHaveLength(0)
  expect(await listDraftsForDates(h.db, ['2026-12-06'])).toHaveLength(1)
})
