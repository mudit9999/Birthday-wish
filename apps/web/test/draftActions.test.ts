import type { WishModel } from '@family-wishes/core'
import { createTestDb } from '@family-wishes/db/testing'
import {
  addMember,
  applyDraftAction,
  createEvent,
  ensureAdmin,
  getDraft,
  insertDraftIfMissing,
  queryRows,
  setSetting,
  setWaStatus,
  type DbHandle,
  type Draft,
  type Member
} from '@family-wishes/db'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { draftAction } from '../lib/drafts'

const REDONE = 'A fresh wish for Rahul from all of us! 🎉 Have a lovely day.'
const fakeModel: WishModel = { generate: async () => REDONE }
// 11:30 in Asia/Kolkata on the draft's day.
const ON_THE_DAY = new Date('2026-12-05T06:00:00Z')
const DAY_BEFORE = new Date('2026-12-04T06:00:00Z')

async function pendingSendRequests(): Promise<number> {
  const rows = await queryRows<{ n: number }>(h.db, sql`select count(*)::int as n from job_requests where job = 'send' and done_at is null`)
  return rows[0]?.n ?? 0
}

let h: DbHandle
let admin: Member
let member: Member
let draft: Draft

beforeEach(async () => {
  h = await createTestDb()
  admin = await ensureAdmin(h.db, '919800000000')
  const m = await addMember(h.db, { phone: '919811111111', name: 'Nani' })
  if (m === 'duplicate') throw new Error('duplicate')
  member = m
  const event = await createEvent(
    h.db,
    { type: 'birthday', names: 'Rahul', familyCallsThem: null, title: null, day: 5, month: 12, year: 1958, repeatsYearly: true, note: null },
    admin.id
  )
  const d = await insertDraftIfMissing(h.db, { occurrenceDate: '2026-12-05', eventId: event.id, text: 'Happy birthday Rahul!', source: 'ai' })
  if (!d) throw new Error('no draft')
  draft = d
})

afterEach(async () => {
  await h.close()
})

test('a non-admin is refused and the draft is unchanged', async () => {
  for (const input of [{ action: 'approve' }, { action: 'skip' }, { action: 'redo' }, { action: 'edit', text: 'x'.repeat(40) }] as const) {
    expect(await draftAction(h.db, member, draft.id, input, fakeModel)).toBe('forbidden')
  }
  expect(await getDraft(h.db, draft.id)).toEqual(draft)
})

test('approve and skip move the draft', async () => {
  expect(await draftAction(h.db, admin, draft.id, { action: 'approve' }, null)).toBe('ok')
  expect((await getDraft(h.db, draft.id))?.status).toBe('approved')
  expect(await draftAction(h.db, admin, draft.id, { action: 'skip' }, null)).toBe('ok')
  expect((await getDraft(h.db, draft.id))?.status).toBe('skipped')
})

test('a sent draft cannot be approved again', async () => {
  await applyDraftAction(h.db, draft.id, 'approve')
  await applyDraftAction(h.db, draft.id, 'claim')
  await applyDraftAction(h.db, draft.id, 'markSent')
  expect(await draftAction(h.db, admin, draft.id, { action: 'approve' }, null)).toBe('not_allowed')
})

test('a short edit is rejected', async () => {
  expect(await draftAction(h.db, admin, draft.id, { action: 'edit', text: '  thanks  ' }, null)).toBe('too_short')
  expect((await getDraft(h.db, draft.id))?.text).toBe('Happy birthday Rahul!')
})

test('an edit replaces the text, marks it as the admin’s and approves it', async () => {
  const text = 'Happy birthday Rahul! Lots of love from the whole family.'
  expect(await draftAction(h.db, admin, draft.id, { action: 'edit', text: `  ${text}  ` }, null)).toBe('ok')
  expect(await getDraft(h.db, draft.id)).toMatchObject({ text, source: 'admin', status: 'approved' })
})

test('redo asks the model for a new wish and puts it back to pending', async () => {
  await applyDraftAction(h.db, draft.id, 'approve')
  expect(await draftAction(h.db, admin, draft.id, { action: 'redo' }, fakeModel)).toBe('ok')
  expect(await getDraft(h.db, draft.id)).toMatchObject({ text: REDONE, source: 'ai', status: 'pending' })
})

test('an unknown draft is not allowed', async () => {
  expect(await draftAction(h.db, admin, '00000000-0000-0000-0000-000000000000', { action: 'redo' }, fakeModel)).toBe('not_allowed')
})

describe('post now', () => {
  const postNow = (text = 'Happy birthday Rahul!') => ({ action: 'post_now', text }) as const

  beforeEach(async () => {
    await setSetting(h.db, 'group_id', '120363000000000000@g.us')
    await setWaStatus(h.db, { state: 'connected' })
  })

  test('approves today’s draft and asks the worker to post straight away', async () => {
    expect(await draftAction(h.db, admin, draft.id, postNow(), null, ON_THE_DAY)).toBe('ok')
    expect(await getDraft(h.db, draft.id)).toMatchObject({ status: 'approved', source: 'ai', text: 'Happy birthday Rahul!' })
    expect(await pendingSendRequests()).toBe(1)
  })

  test('saves an edit in the box as the admin’s text before posting', async () => {
    const text = 'Happy birthday Rahul! Lots of love from the whole family.'
    expect(await draftAction(h.db, admin, draft.id, postNow(`  ${text} `), null, ON_THE_DAY)).toBe('ok')
    expect(await getDraft(h.db, draft.id)).toMatchObject({ status: 'approved', source: 'admin', text })
    expect(await pendingSendRequests()).toBe(1)
  })

  test('posts an already approved draft without changing it', async () => {
    await applyDraftAction(h.db, draft.id, 'approve')
    expect(await draftAction(h.db, admin, draft.id, postNow(), null, ON_THE_DAY)).toBe('ok')
    expect(await pendingSendRequests()).toBe(1)
  })

  test('refuses a draft for another day', async () => {
    expect(await draftAction(h.db, admin, draft.id, postNow(), null, DAY_BEFORE)).toBe('not_today')
    expect((await getDraft(h.db, draft.id))?.status).toBe('pending')
    expect(await pendingSendRequests()).toBe(0)
  })

  test('refuses when no group is chosen', async () => {
    await setSetting(h.db, 'group_id', '')
    expect(await draftAction(h.db, admin, draft.id, postNow(), null, ON_THE_DAY)).toBe('no_group')
    expect(await pendingSendRequests()).toBe(0)
  })

  test('refuses when WhatsApp is not connected', async () => {
    await setWaStatus(h.db, { state: 'reconnecting' })
    expect(await draftAction(h.db, admin, draft.id, postNow(), null, ON_THE_DAY)).toBe('not_connected')
    expect((await getDraft(h.db, draft.id))?.status).toBe('pending')
  })

  test('refuses a short edit and a non-admin', async () => {
    expect(await draftAction(h.db, admin, draft.id, postNow('hi'), null, ON_THE_DAY)).toBe('too_short')
    expect(await draftAction(h.db, member, draft.id, postNow(), null, ON_THE_DAY)).toBe('forbidden')
    expect(await pendingSendRequests()).toBe(0)
  })

  test('refuses a draft that has already been posted', async () => {
    await applyDraftAction(h.db, draft.id, 'approve')
    await applyDraftAction(h.db, draft.id, 'claim')
    await applyDraftAction(h.db, draft.id, 'markSent')
    expect(await draftAction(h.db, admin, draft.id, postNow(), null, ON_THE_DAY)).toBe('not_allowed')
    expect(await pendingSendRequests()).toBe(0)
  })
})
