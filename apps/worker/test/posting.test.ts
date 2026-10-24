import type { EventInput } from '@family-wishes/core'
import {
  applyDraftAction,
  createEvent,
  ensureAdmin,
  getCard,
  insertDraftIfMissing,
  listDraftsForDates,
  saveCard,
  setSetting,
  type DbHandle,
  type Draft
} from '@family-wishes/db'
import { createTestDb } from '@family-wishes/db/testing'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { expireOldDrafts, postDueDrafts, pruneOldCards, recoverInterruptedSends } from '../src/jobs/posting.ts'
import { ADMIN_PHONE, FAKE_CARD, fixedNow, testDeps } from './fakes.ts'

const TODAY = '2026-12-05'
const GROUP = '120363000000@g.us'
const at = (time: string, date = TODAY) => fixedNow(`${date}T${time}:00+05:30`)

let h: DbHandle
let adminId: string

async function draft(names: string, date = TODAY): Promise<Draft> {
  const input: EventInput = {
    type: 'birthday', names, familyCallsThem: null, title: null, day: 5, month: 12, year: null, repeatsYearly: true, note: null
  }
  const event = await createEvent(h.db, input, adminId)
  const d = await insertDraftIfMissing(h.db, { occurrenceDate: date, eventId: event.id, text: `Happy birthday ${names}!`, source: 'ai' })
  if (!d) throw new Error('no draft')
  return d
}

async function approved(names: string, date = TODAY): Promise<Draft> {
  const d = await draft(names, date)
  await applyDraftAction(h.db, d.id, 'approve')
  return d
}

async function statuses(date = TODAY) {
  return (await listDraftsForDates(h.db, [date])).map((d) => d.status)
}

beforeEach(async () => {
  h = await createTestDb()
  adminId = (await ensureAdmin(h.db, ADMIN_PHONE)).id
  await setSetting(h.db, 'group_id', GROUP)
})

afterEach(async () => {
  await h.close()
})

test('posts approved drafts once at send time and never pending ones', async () => {
  await approved('A')
  await approved('B')
  await draft('C')

  expect(await postDueDrafts(testDeps(h.db, { now: at('07:59') }))).toBe(0)

  const deps = testDeps(h.db, { now: at('08:00') })
  expect(await postDueDrafts(deps)).toBe(2)
  expect(deps.messenger.to('group')).toEqual(['Happy birthday A!', 'Happy birthday B!'])
  expect(deps.messenger.groupJids).toEqual([GROUP, GROUP])
  const rows = await listDraftsForDates(h.db, [TODAY])
  expect(rows.map((d) => [d.status, d.sentMessageId])).toEqual([
    ['sent', 'MSG1'],
    ['sent', 'MSG2'],
    ['pending', null]
  ])

  expect(await postDueDrafts(deps)).toBe(0)
  expect(deps.messenger.sent).toHaveLength(2)
})

test('a draft approved later in the day posts on the next call', async () => {
  const late = await draft('Late')
  const deps = testDeps(h.db, { now: at('10:30') })
  expect(await postDueDrafts(deps)).toBe(0)
  await applyDraftAction(h.db, late.id, 'approve')
  expect(await postDueDrafts(deps)).toBe(1)
})

test('a failed send marks only that draft failed', async () => {
  await approved('A')
  await approved('B')
  const deps = testDeps(h.db, { now: at('08:00') })
  deps.messenger.failNext = new Error('not a participant')
  expect(await postDueDrafts(deps)).toBe(1)
  const rows = await listDraftsForDates(h.db, [TODAY])
  expect(rows.map((d) => [d.status, d.error])).toEqual([
    ['failed', 'not a participant'],
    ['sent', null]
  ])
})

test('nothing posts while WhatsApp is down or no group is chosen', async () => {
  await approved('A')
  const down = testDeps(h.db, { now: at('08:00') })
  down.messenger.ready = false
  expect(await postDueDrafts(down)).toBe(0)

  await setSetting(h.db, 'group_id', '')
  expect(await postDueDrafts(testDeps(h.db, { now: at('08:00') }))).toBe(0)
  expect(await statuses()).toEqual(['approved'])
})

test('ignoreSendTime posts before send time', async () => {
  await approved('A')
  expect(await postDueDrafts(testDeps(h.db, { now: at('06:00') }), { ignoreSendTime: true })).toBe(1)
})

test('only today’s drafts post', async () => {
  await approved('Tomorrow', '2026-12-06')
  expect(await postDueDrafts(testDeps(h.db, { now: at('09:00') }))).toBe(0)
})

test('a draft with a card posts as one image message captioned with the wish', async () => {
  const withCard = await approved('Card')
  await approved('Plain')
  await saveCard(h.db, withCard.id, FAKE_CARD)

  const deps = testDeps(h.db, { now: at('08:00') })
  expect(await postDueDrafts(deps)).toBe(2)
  const [first, second] = deps.messenger.sent
  expect(first?.text).toBe('Happy birthday Card!')
  expect(first?.card?.mimeType).toBe('image/png')
  expect(Buffer.from(first?.card?.data ?? []).toString('base64')).toBe(FAKE_CARD.base64)
  expect(second).toEqual({ to: 'group', text: 'Happy birthday Plain!' })
})

test('pruneOldCards deletes cards of drafts more than a week old', async () => {
  const old = await approved('Old', '2026-11-27')
  const recent = await approved('Recent', '2026-11-29')
  await saveCard(h.db, old.id, FAKE_CARD)
  await saveCard(h.db, recent.id, FAKE_CARD)
  expect(await pruneOldCards(testDeps(h.db, { now: at('03:00') }))).toBe(1)
  expect(await getCard(h.db, old.id)).toBeNull()
  expect(await getCard(h.db, recent.id)).not.toBeNull()
})

test('expireOldDrafts closes yesterday’s drafts', async () => {
  await draft('Old', '2026-12-04')
  await approved('Old approved', '2026-12-04')
  expect(await expireOldDrafts(testDeps(h.db, { now: at('00:05') }))).toBe(2)
  expect(await statuses('2026-12-04')).toEqual(['expired', 'failed'])
})

test('recoverInterruptedSends fails drafts stuck in sending', async () => {
  const d = await approved('Stuck')
  await applyDraftAction(h.db, d.id, 'claim')
  expect(await recoverInterruptedSends(testDeps(h.db))).toBe(1)
  expect(await statuses()).toEqual(['failed'])
})
