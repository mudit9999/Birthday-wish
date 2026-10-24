import type { EventInput } from '@family-wishes/core'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { DbHandle } from '../src/client.js'
import {
  archivePastOneTimeEvents,
  createEvent,
  deleteEvent,
  getEvent,
  listEvents,
  updateEvent,
  type Actor
} from '../src/events.js'
import { addMember, ensureAdmin } from '../src/members.js'
import { createTestDb } from '../src/testing.js'

let h: DbHandle
let alice: Actor
let bob: Actor
let admin: Actor

function input(overrides: Partial<EventInput> = {}): EventInput {
  return {
    type: 'birthday',
    names: 'Rahul',
    familyCallsThem: 'Chachu',
    title: null,
    day: 25,
    month: 10,
    year: 1965,
    repeatsYearly: true,
    note: null,
    ...overrides
  }
}

async function member(phone: string, name: string): Promise<Actor> {
  const m = await addMember(h.db, { phone, name })
  if (m === 'duplicate') throw new Error('duplicate')
  return { id: m.id, isAdmin: false }
}

beforeAll(async () => {
  h = await createTestDb()
  alice = await member('919811111111', 'Alice')
  bob = await member('919822222222', 'Bob')
  const a = await ensureAdmin(h.db, '919833333333')
  admin = { id: a.id, isAdmin: true }
})

afterAll(async () => {
  await h.close()
})

test('createEvent stores the event and getEvent reads it back', async () => {
  const created = await createEvent(h.db, input(), alice.id)
  expect(created).toMatchObject({ ...input(), archived: false, addedBy: alice.id })
  expect(await getEvent(h.db, created.id)).toEqual(created)
  expect(await getEvent(h.db, '00000000-0000-0000-0000-000000000000')).toBeNull()
})

test('a member cannot change or delete someone else’s event', async () => {
  const event = await createEvent(h.db, input({ names: 'Alice’s mum' }), alice.id)
  expect(await updateEvent(h.db, event.id, input({ names: 'Hacked' }), bob)).toBe('forbidden')
  expect(await deleteEvent(h.db, event.id, bob)).toBe('forbidden')
  expect(await getEvent(h.db, event.id)).toEqual(event)
})

test('a member can change and delete their own event', async () => {
  const event = await createEvent(h.db, input({ names: 'Bob’s dad' }), bob.id)
  expect(await updateEvent(h.db, event.id, input({ names: 'Bob’s father' }), bob)).toBe('ok')
  expect((await getEvent(h.db, event.id))?.names).toBe('Bob’s father')
  expect(await deleteEvent(h.db, event.id, bob)).toBe('ok')
  expect(await getEvent(h.db, event.id)).toBeNull()
})

test('an admin can change and delete anyone’s event', async () => {
  const event = await createEvent(h.db, input({ names: 'Cousin' }), alice.id)
  expect(await updateEvent(h.db, event.id, input({ names: 'Cousin Riya' }), admin)).toBe('ok')
  expect((await getEvent(h.db, event.id))?.names).toBe('Cousin Riya')
  expect(await deleteEvent(h.db, event.id, admin)).toBe('ok')
})

test('missing events are not_found', async () => {
  const missing = '00000000-0000-0000-0000-000000000000'
  expect(await updateEvent(h.db, missing, input(), admin)).toBe('not_found')
  expect(await deleteEvent(h.db, missing, alice)).toBe('not_found')
})

test('archivePastOneTimeEvents archives only past one-time events', async () => {
  const special = { type: 'special' as const, title: 'Housewarming', repeatsYearly: false, year: 2026, month: 11 }
  const past = await createEvent(h.db, input({ ...special, day: 2 }), alice.id)
  const today = await createEvent(h.db, input({ ...special, day: 3 }), alice.id)
  const yearly = await createEvent(h.db, input({ day: 1, month: 1 }), alice.id)

  expect(await archivePastOneTimeEvents(h.db, '2026-11-03')).toBe(1)
  expect((await getEvent(h.db, past.id))?.archived).toBe(true)
  expect((await getEvent(h.db, today.id))?.archived).toBe(false)
  expect((await getEvent(h.db, yearly.id))?.archived).toBe(false)
  expect(await archivePastOneTimeEvents(h.db, '2026-11-03')).toBe(0)

  const visible = (await listEvents(h.db)).map((e) => e.id)
  expect(visible).not.toContain(past.id)
  expect((await listEvents(h.db, { includeArchived: true })).map((e) => e.id)).toContain(past.id)
})

test('listEvents filters by who added them', async () => {
  const mine = await listEvents(h.db, { addedBy: bob.id })
  expect(mine.every((e) => e.addedBy === bob.id)).toBe(true)
  const all = await listEvents(h.db)
  expect(all.length).toBeGreaterThan(mine.length)
})
