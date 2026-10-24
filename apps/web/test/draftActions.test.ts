import type { CardModel, WishModel } from '@family-wishes/core'
import { createTestDb } from '@family-wishes/db/testing'
import {
  addMember,
  applyDraftAction,
  createEvent,
  ensureAdmin,
  getCard,
  getDraft,
  insertDraftIfMissing,
  queryRows,
  saveCard,
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
const wish: WishModel = { generate: async () => REDONE }
const PNG = { base64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 5]).toString('base64'), mimeType: 'image/png' }
const NEW_PNG = { base64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 6]).toString('base64'), mimeType: 'image/png' }
const card: CardModel = { generate: async () => NEW_PNG }
// 11:30 in Asia/Kolkata on the draft's day.
const ON_THE_DAY = new Date('2026-12-05T06:00:00Z')
const DAY_BEFORE = new Date('2026-12-04T06:00:00Z')

async function pendingSendRequests(): Promise<number> {
  const rows = await queryRows<{ n: number }>(h.db, sql`select count(*)::int as n from job_requests where job = 'send' and done_at is null`)
  return rows[0]?.n ?? 0
}

async function storedCard(): Promise<string | null> {
  const stored = await getCard(h.db, draft.id)
  return stored ? Buffer.from(stored.data).toString('base64') : null
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
  const inputs = [
    { action: 'approve' },
    { action: 'skip' },
    { action: 'redo' },
    { action: 'edit', text: 'x'.repeat(40) },
    { action: 'card_new' },
    { action: 'card_remove' }
  ] as const
  for (const input of inputs) {
    expect(await draftAction(h.db, member, draft.id, input, { wish, card })).toBe('forbidden')
  }
  expect(await getDraft(h.db, draft.id)).toEqual(draft)
  expect(await storedCard()).toBeNull()
})

test('approve and skip move the draft', async () => {
  expect(await draftAction(h.db, admin, draft.id, { action: 'approve' }, {})).toBe('ok')
  expect((await getDraft(h.db, draft.id))?.status).toBe('approved')
  expect(await draftAction(h.db, admin, draft.id, { action: 'skip' }, {})).toBe('ok')
  expect((await getDraft(h.db, draft.id))?.status).toBe('skipped')
})

test('a sent draft cannot be approved again', async () => {
  await applyDraftAction(h.db, draft.id, 'approve')
  await applyDraftAction(h.db, draft.id, 'claim')
  await applyDraftAction(h.db, draft.id, 'markSent')
  expect(await draftAction(h.db, admin, draft.id, { action: 'approve' }, {})).toBe('not_allowed')
})

test('a short edit is rejected', async () => {
  expect(await draftAction(h.db, admin, draft.id, { action: 'edit', text: '  thanks  ' }, {})).toBe('too_short')
  expect((await getDraft(h.db, draft.id))?.text).toBe('Happy birthday Rahul!')
})

test('an edit replaces the text, marks it as the admin’s and approves it', async () => {
  const text = 'Happy birthday Rahul! Lots of love from the whole family.'
  expect(await draftAction(h.db, admin, draft.id, { action: 'edit', text: `  ${text}  ` }, {})).toBe('ok')
  expect(await getDraft(h.db, draft.id)).toMatchObject({ text, source: 'admin', status: 'approved' })
})

test('redo asks the model for a new wish and puts it back to pending', async () => {
  await applyDraftAction(h.db, draft.id, 'approve')
  expect(await draftAction(h.db, admin, draft.id, { action: 'redo' }, { wish })).toBe('ok')
  expect(await getDraft(h.db, draft.id)).toMatchObject({ text: REDONE, source: 'ai', status: 'pending' })
})

test('an unknown draft is not allowed', async () => {
  expect(await draftAction(h.db, admin, '00000000-0000-0000-0000-000000000000', { action: 'redo' }, { wish })).toBe('not_allowed')
})

describe('greeting cards', () => {
  test('card_new makes a card, replacing the old one, without changing the draft', async () => {
    await saveCard(h.db, draft.id, PNG)
    expect(await draftAction(h.db, admin, draft.id, { action: 'card_new' }, { card })).toBe('ok')
    expect(await storedCard()).toBe(NEW_PNG.base64)
    expect(await getDraft(h.db, draft.id)).toEqual(draft)
  })

  test('card_new reports a failure and keeps the old card', async () => {
    await saveCard(h.db, draft.id, PNG)
    const failing: CardModel = { generate: async () => null }
    expect(await draftAction(h.db, admin, draft.id, { action: 'card_new' }, { card: failing })).toBe('card_failed')
    expect(await draftAction(h.db, admin, draft.id, { action: 'card_new' }, {})).toBe('card_failed')
    expect(await storedCard()).toBe(PNG.base64)
  })

  test('card_remove deletes the card so the wish posts as text', async () => {
    await saveCard(h.db, draft.id, PNG)
    expect(await draftAction(h.db, admin, draft.id, { action: 'card_remove' }, {})).toBe('ok')
    expect(await storedCard()).toBeNull()
  })

  test('the card of a posted draft cannot change', async () => {
    await saveCard(h.db, draft.id, PNG)
    await applyDraftAction(h.db, draft.id, 'approve')
    await applyDraftAction(h.db, draft.id, 'claim')
    expect(await draftAction(h.db, admin, draft.id, { action: 'card_new' }, { card })).toBe('not_allowed')
    expect(await draftAction(h.db, admin, draft.id, { action: 'card_remove' }, {})).toBe('not_allowed')
    expect(await storedCard()).toBe(PNG.base64)
  })
})

describe('post now', () => {
  const postNow = (text = 'Happy birthday Rahul!') => ({ action: 'post_now', text }) as const

  beforeEach(async () => {
    await setSetting(h.db, 'group_id', '120363000000000000@g.us')
    await setWaStatus(h.db, { state: 'connected' })
  })

  test('approves today’s draft and asks the worker to post straight away', async () => {
    expect(await draftAction(h.db, admin, draft.id, postNow(), {}, ON_THE_DAY)).toBe('ok')
    expect(await getDraft(h.db, draft.id)).toMatchObject({ status: 'approved', source: 'ai', text: 'Happy birthday Rahul!' })
    expect(await pendingSendRequests()).toBe(1)
  })

  test('saves an edit in the box as the admin’s text before posting', async () => {
    const text = 'Happy birthday Rahul! Lots of love from the whole family.'
    expect(await draftAction(h.db, admin, draft.id, postNow(`  ${text} `), {}, ON_THE_DAY)).toBe('ok')
    expect(await getDraft(h.db, draft.id)).toMatchObject({ status: 'approved', source: 'admin', text })
    expect(await pendingSendRequests()).toBe(1)
  })

  test('posts an already approved draft without changing it', async () => {
    await applyDraftAction(h.db, draft.id, 'approve')
    expect(await draftAction(h.db, admin, draft.id, postNow(), {}, ON_THE_DAY)).toBe('ok')
    expect(await pendingSendRequests()).toBe(1)
  })

  test('refuses a draft for another day', async () => {
    expect(await draftAction(h.db, admin, draft.id, postNow(), {}, DAY_BEFORE)).toBe('not_today')
    expect((await getDraft(h.db, draft.id))?.status).toBe('pending')
    expect(await pendingSendRequests()).toBe(0)
  })

  test('refuses when no group is chosen', async () => {
    await setSetting(h.db, 'group_id', '')
    expect(await draftAction(h.db, admin, draft.id, postNow(), {}, ON_THE_DAY)).toBe('no_group')
    expect(await pendingSendRequests()).toBe(0)
  })

  test('refuses when WhatsApp is not connected', async () => {
    await setWaStatus(h.db, { state: 'reconnecting' })
    expect(await draftAction(h.db, admin, draft.id, postNow(), {}, ON_THE_DAY)).toBe('not_connected')
    expect((await getDraft(h.db, draft.id))?.status).toBe('pending')
  })

  test('refuses a short edit and a non-admin', async () => {
    expect(await draftAction(h.db, admin, draft.id, postNow('hi'), {}, ON_THE_DAY)).toBe('too_short')
    expect(await draftAction(h.db, member, draft.id, postNow(), {}, ON_THE_DAY)).toBe('forbidden')
    expect(await pendingSendRequests()).toBe(0)
  })

  test('refuses a draft that has already been posted', async () => {
    await applyDraftAction(h.db, draft.id, 'approve')
    await applyDraftAction(h.db, draft.id, 'claim')
    await applyDraftAction(h.db, draft.id, 'markSent')
    expect(await draftAction(h.db, admin, draft.id, postNow(), {}, ON_THE_DAY)).toBe('not_allowed')
    expect(await pendingSendRequests()).toBe(0)
  })
})
