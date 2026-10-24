import type { WishModel } from '@family-wishes/core'
import { createTestDb } from '@family-wishes/db/testing'
import {
  addMember,
  applyDraftAction,
  createEvent,
  ensureAdmin,
  getDraft,
  insertDraftIfMissing,
  type DbHandle,
  type Draft,
  type Member
} from '@family-wishes/db'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { draftAction } from '../lib/drafts'

const REDONE = 'A fresh wish for Rahul from all of us! 🎉 Have a lovely day.'
const fakeModel: WishModel = { generate: async () => REDONE }

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
