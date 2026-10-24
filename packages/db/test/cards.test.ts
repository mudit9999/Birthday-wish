import { afterEach, beforeEach, expect, test } from 'vitest'
import type { DbHandle } from '../src/client.ts'
import { cardTimes, deleteCard, getCard, pruneCardsBefore, saveCard } from '../src/cards.ts'
import { insertDraftIfMissing, type Draft } from '../src/drafts.ts'
import { createEvent } from '../src/events.ts'
import { ensureAdmin } from '../src/members.ts'
import { createTestDb } from '../src/testing.ts'

const PNG = { base64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString('base64'), mimeType: 'image/png' }
const JPEG = { base64: Buffer.from([0xff, 0xd8, 0xff, 9]).toString('base64'), mimeType: 'image/jpeg' }

let h: DbHandle

async function draft(names: string, date: string): Promise<Draft> {
  const admin = await ensureAdmin(h.db, '919800000000')
  const event = await createEvent(
    h.db,
    { type: 'birthday', names, familyCallsThem: null, title: null, day: 5, month: 12, year: null, repeatsYearly: true, note: null },
    admin.id
  )
  const d = await insertDraftIfMissing(h.db, { occurrenceDate: date, eventId: event.id, text: `Happy birthday ${names}!`, source: 'ai' })
  if (!d) throw new Error('no draft')
  return d
}

beforeEach(async () => {
  h = await createTestDb()
})

afterEach(async () => {
  await h.close()
})

test('a saved card comes back byte for byte, and saving again replaces it', async () => {
  const d = await draft('Rahul', '2026-12-05')
  expect(await getCard(h.db, d.id)).toBeNull()

  await saveCard(h.db, d.id, PNG)
  const first = await getCard(h.db, d.id)
  expect(first?.mimeType).toBe('image/png')
  expect(Buffer.from(first?.data ?? []).toString('base64')).toBe(PNG.base64)

  await saveCard(h.db, d.id, JPEG)
  const second = await getCard(h.db, d.id)
  expect(second?.mimeType).toBe('image/jpeg')
  expect(Buffer.from(second?.data ?? []).toString('base64')).toBe(JPEG.base64)
})

test('deleteCard removes it, and cardTimes lists only drafts with a card', async () => {
  const a = await draft('A', '2026-12-05')
  const b = await draft('B', '2026-12-05')
  await saveCard(h.db, a.id, PNG)
  expect([...(await cardTimes(h.db, [a.id, b.id])).keys()]).toEqual([a.id])
  expect(await cardTimes(h.db, [])).toEqual(new Map())

  await deleteCard(h.db, a.id)
  expect(await getCard(h.db, a.id)).toBeNull()
})

test('the database refuses a card that is not an image', async () => {
  const d = await draft('Rahul', '2026-12-05')
  await expect(saveCard(h.db, d.id, { base64: 'PGh0bWw+', mimeType: 'text/html' })).rejects.toThrow()
})

test('pruneCardsBefore deletes cards of earlier days only', async () => {
  const old = await draft('Old', '2026-11-20')
  const current = await draft('Current', '2026-12-05')
  await saveCard(h.db, old.id, PNG)
  await saveCard(h.db, current.id, PNG)

  expect(await pruneCardsBefore(h.db, '2026-11-28')).toBe(1)
  expect(await getCard(h.db, old.id)).toBeNull()
  expect(await getCard(h.db, current.id)).not.toBeNull()
})
