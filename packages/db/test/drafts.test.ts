import type { EventInput } from '@family-wishes/core'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { DbHandle } from '../src/client.ts'
import {
  applyDraftAction,
  approvedDraftsFor,
  expireDraftsBefore,
  failInterruptedSends,
  findDraftByNumber,
  insertDraftIfMissing,
  listDraftsForDates,
  openDraftNumbers,
  type Draft
} from '../src/drafts.ts'
import { createEvent } from '../src/events.ts'
import { createFestival } from '../src/festivals.ts'
import { ensureAdmin } from '../src/members.ts'
import { createTestDb } from '../src/testing.ts'

let h: DbHandle
let adminId: string

const birthday: EventInput = {
  type: 'birthday',
  names: 'Rahul',
  familyCallsThem: null,
  title: null,
  day: 1,
  month: 1,
  year: null,
  repeatsYearly: true,
  note: null
}

async function newEvent(names: string): Promise<string> {
  return (await createEvent(h.db, { ...birthday, names }, adminId)).id
}

async function draftFor(date: string, names: string): Promise<Draft> {
  const draft = await insertDraftIfMissing(h.db, {
    occurrenceDate: date,
    eventId: await newEvent(names),
    text: `Happy birthday ${names}!`,
    source: 'ai'
  })
  if (!draft) throw new Error('draft not inserted')
  return draft
}

beforeAll(async () => {
  h = await createTestDb()
  adminId = (await ensureAdmin(h.db, '919800000009')).id
})

afterAll(async () => {
  await h.close()
})

test('insertDraftIfMissing numbers drafts per date and skips existing ones', async () => {
  const eventA = await newEvent('A')
  const first = await insertDraftIfMissing(h.db, { occurrenceDate: '2026-12-01', eventId: eventA, text: 'Hi A', source: 'ai' })
  expect(first).toMatchObject({ number: 1, status: 'pending', eventId: eventA, festivalId: null, source: 'ai' })
  expect(await insertDraftIfMissing(h.db, { occurrenceDate: '2026-12-01', eventId: eventA, text: 'Again', source: 'ai' })).toBeNull()

  const festival = await createFestival(h.db, { name: 'Test Fest', date: '2026-12-01' })
  if (festival === 'duplicate') throw new Error('duplicate')
  const second = await insertDraftIfMissing(h.db, {
    occurrenceDate: '2026-12-01',
    festivalId: festival.id,
    text: 'Happy Test Fest',
    source: 'template'
  })
  expect(second).toMatchObject({ number: 2, festivalId: festival.id, eventId: null })

  const otherDay = await draftFor('2026-12-02', 'B')
  expect(otherDay.number).toBe(1)
})

test('two concurrent claims leave exactly one winner (no double send)', async () => {
  const draft = await draftFor('2026-12-03', 'C')
  await applyDraftAction(h.db, draft.id, 'approve')
  const results = await Promise.all([
    applyDraftAction(h.db, draft.id, 'claim'),
    applyDraftAction(h.db, draft.id, 'claim')
  ])
  expect(results.filter((r) => r !== null)).toHaveLength(1)
  expect(results.find((r) => r !== null)?.status).toBe('sending')
  await applyDraftAction(h.db, draft.id, 'markSent')
})

test('a sent draft cannot be approved again', async () => {
  const draft = await draftFor('2026-12-04', 'D')
  await applyDraftAction(h.db, draft.id, 'approve')
  await applyDraftAction(h.db, draft.id, 'claim')
  const sent = await applyDraftAction(h.db, draft.id, 'markSent', { sentMessageId: 'MSG1' })
  expect(sent).toMatchObject({ status: 'sent', sentMessageId: 'MSG1' })
  expect(await applyDraftAction(h.db, draft.id, 'approve')).toBeNull()
})

test('edit replaces the text, marks it as the admin’s and approves it', async () => {
  const draft = await draftFor('2026-12-05', 'E')
  const edited = await applyDraftAction(h.db, draft.id, 'edit', { text: 'Happy birthday from all of us!' })
  expect(edited).toMatchObject({ text: 'Happy birthday from all of us!', source: 'admin', status: 'approved' })
})

test('redo stores the new text and goes back to pending', async () => {
  const draft = await draftFor('2026-12-06', 'F')
  await applyDraftAction(h.db, draft.id, 'approve')
  const redone = await applyDraftAction(h.db, draft.id, 'redo', { text: 'A fresh wish', source: 'template' })
  expect(redone).toMatchObject({ text: 'A fresh wish', source: 'template', status: 'pending' })
})

test('markFailed records the error and re-approving clears it', async () => {
  const draft = await draftFor('2026-12-07', 'G')
  await applyDraftAction(h.db, draft.id, 'approve')
  await applyDraftAction(h.db, draft.id, 'claim')
  expect(await applyDraftAction(h.db, draft.id, 'markFailed', { error: 'Not in group' })).toMatchObject({
    status: 'failed',
    error: 'Not in group'
  })
  expect(await applyDraftAction(h.db, draft.id, 'approve')).toMatchObject({ status: 'approved', error: null })
})

test('lookups by date and number', async () => {
  const pending = await draftFor('2026-12-08', 'H')
  const approved = await draftFor('2026-12-08', 'I')
  const skipped = await draftFor('2026-12-08', 'J')
  await applyDraftAction(h.db, approved.id, 'approve')
  await applyDraftAction(h.db, skipped.id, 'skip')

  expect(await openDraftNumbers(h.db, '2026-12-08')).toEqual([1, 2, 3])
  expect((await findDraftByNumber(h.db, '2026-12-08', 2))?.id).toBe(approved.id)
  expect(await findDraftByNumber(h.db, '2026-12-08', 9)).toBeNull()
  expect((await approvedDraftsFor(h.db, '2026-12-08')).map((d) => d.id)).toEqual([approved.id])

  const listed = await listDraftsForDates(h.db, ['2026-12-08', '2026-12-07'])
  expect(listed.map((d) => [d.occurrenceDate, d.number])).toEqual([
    ['2026-12-07', 1],
    ['2026-12-08', 1],
    ['2026-12-08', 2],
    ['2026-12-08', 3]
  ])
  expect(listed[1]?.id).toBe(pending.id)
  expect(await listDraftsForDates(h.db, [])).toEqual([])
})

test('expireDraftsBefore expires yesterday’s pending, fails yesterday’s approved and spares today', async () => {
  const pending = await draftFor('2027-01-24', 'K')
  const approved = await draftFor('2027-01-24', 'L')
  const today = await draftFor('2027-01-25', 'M')
  await applyDraftAction(h.db, approved.id, 'approve')

  expect(await expireDraftsBefore(h.db, '2027-01-25')).toBeGreaterThanOrEqual(2)
  const [p, a, t] = await listDraftsForDates(h.db, ['2027-01-24', '2027-01-25'])
  expect(p).toMatchObject({ id: pending.id, status: 'expired' })
  expect(a).toMatchObject({ id: approved.id, status: 'failed', error: 'The day ended before it could be posted.' })
  expect(t).toMatchObject({ id: today.id, status: 'pending' })
})

test('failInterruptedSends fails drafts stuck in sending', async () => {
  const draft = await draftFor('2027-02-01', 'N')
  await applyDraftAction(h.db, draft.id, 'approve')
  await applyDraftAction(h.db, draft.id, 'claim')
  expect(await failInterruptedSends(h.db)).toBe(1)
  const [after] = await listDraftsForDates(h.db, ['2027-02-01'])
  expect(after).toMatchObject({
    status: 'failed',
    error: 'Worker stopped while sending — check the group before retrying.'
  })
})
