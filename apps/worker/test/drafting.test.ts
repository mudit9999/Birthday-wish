import type { EventInput } from '@family-wishes/core'
import {
  createEvent,
  createFestival,
  ensureAdmin,
  getSettings,
  listDraftsForDates,
  type DbHandle
} from '@family-wishes/db'
import { createTestDb } from '@family-wishes/db/testing'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { ensureDraftsFor } from '../src/jobs/drafting.ts'
import { ADMIN_PHONE, FakeModel, testDeps } from './fakes.ts'

const DATE = '2026-12-05'

let h: DbHandle
let adminId: string

function birthday(overrides: Partial<EventInput> = {}): EventInput {
  return {
    type: 'birthday',
    names: 'Rahul',
    familyCallsThem: 'Chachu',
    title: null,
    day: 5,
    month: 12,
    year: 1958,
    repeatsYearly: true,
    note: 'Loves cricket',
    ...overrides
  }
}

beforeEach(async () => {
  h = await createTestDb()
  adminId = (await ensureAdmin(h.db, ADMIN_PHONE)).id
  await createEvent(h.db, birthday(), adminId)
  await createFestival(h.db, { name: 'Test Utsav', date: DATE })
})

afterEach(async () => {
  await h.close()
})

test('drafts every occasion, tells the admin once and sets the active batch', async () => {
  const deps = testDeps(h.db)
  const created = await ensureDraftsFor(DATE, deps)

  expect(created.map((d) => [d.number, d.status])).toEqual([
    [1, 'pending'],
    [2, 'pending']
  ])
  const self = deps.messenger.to('self')
  expect(self).toHaveLength(1)
  expect(self[0]).toContain('1) Test Utsav')
  expect(self[0]).toContain('2) Birthday — Rahul (Chachu)')
  expect((await getSettings(h.db)).activeBatchDate).toBe(DATE)
})

test('a second call creates and sends nothing', async () => {
  const deps = testDeps(h.db)
  await ensureDraftsFor(DATE, deps)
  expect(await ensureDraftsFor(DATE, deps)).toEqual([])
  expect(deps.messenger.sent).toHaveLength(1)
})

test('an event added later is drafted next time as number 3 and sent on its own', async () => {
  const deps = testDeps(h.db)
  await ensureDraftsFor(DATE, deps)
  await createEvent(h.db, birthday({ names: 'Priya', familyCallsThem: null }), adminId)

  const created = await ensureDraftsFor(DATE, deps)
  expect(created.map((d) => d.number)).toEqual([3])
  const last = deps.messenger.to('self').at(-1) ?? ''
  expect(last).toContain('3) Birthday — Priya')
  expect(last).not.toContain('Rahul')
})

test('the model never sees the birth year', async () => {
  const model = new FakeModel(['Happy birthday Chachu! 🎂 Wishing you a wonderful day.'])
  await ensureDraftsFor(DATE, testDeps(h.db, { model }))
  expect(model.prompts.length).toBeGreaterThan(0)
  expect(JSON.stringify(model.prompts)).not.toContain('1958')
})

test('drafts wait for WhatsApp and are sent once it is ready', async () => {
  const deps = testDeps(h.db)
  deps.messenger.ready = false
  expect(await ensureDraftsFor(DATE, deps)).toHaveLength(2)
  expect(deps.messenger.sent).toHaveLength(0)
  expect((await getSettings(h.db)).activeBatchDate).toBeNull()

  deps.messenger.ready = true
  expect(await ensureDraftsFor(DATE, deps)).toEqual([])
  expect(deps.messenger.to('self')[0]).toContain('2) Birthday')
  expect((await getSettings(h.db)).activeBatchDate).toBe(DATE)
})

test('a failed self-chat send leaves drafts unnotified for the next call', async () => {
  const deps = testDeps(h.db)
  deps.messenger.failNext = new Error('socket closed')
  await expect(ensureDraftsFor(DATE, deps)).rejects.toThrow('socket closed')
  expect(await listDraftsForDates(h.db, [DATE])).toHaveLength(2)

  await ensureDraftsFor(DATE, deps)
  expect(deps.messenger.to('self')).toHaveLength(1)
})

test('template drafts are tagged when the AI is unavailable', async () => {
  const deps = testDeps(h.db, { model: null })
  await ensureDraftsFor(DATE, deps)
  expect(deps.messenger.to('self')[0]).toContain('(template — AI unavailable)')
})

test('a day with nothing on it sends nothing', async () => {
  const deps = testDeps(h.db)
  expect(await ensureDraftsFor('2026-12-06', deps)).toEqual([])
  expect(deps.messenger.sent).toHaveLength(0)
})
