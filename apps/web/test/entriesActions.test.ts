import { createTestDb } from '@family-wishes/db/testing'
import { addMember, createEvent, ensureAdmin, getEvent, type DbHandle, type Member } from '@family-wishes/db'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { removeEntry, saveEntry } from '../lib/entries'

const TODAY = '2026-10-24'

let h: DbHandle
let alice: Member
let bob: Member
let admin: Member

const raw = (overrides: Record<string, string> = {}) => ({
  type: 'birthday',
  names: 'Rahul',
  familyCallsThem: 'Chachu',
  title: '',
  day: '25',
  month: '10',
  year: '1958',
  repeatsYearly: 'true',
  note: '',
  ...overrides
})

async function member(phone: string, name: string): Promise<Member> {
  const m = await addMember(h.db, { phone, name })
  if (m === 'duplicate') throw new Error('duplicate')
  return m
}

beforeEach(async () => {
  h = await createTestDb()
  alice = await member('919811111111', 'Alice')
  bob = await member('919822222222', 'Bob')
  admin = await ensureAdmin(h.db, '919800000000')
})

afterEach(async () => {
  await h.close()
})

async function aliceEntry() {
  const parsed = await saveEntry(h.db, alice, raw(), null, TODAY)
  expect(parsed).toEqual({ ok: true })
  const [event] = await (await import('@family-wishes/db')).listEvents(h.db, { addedBy: alice.id })
  if (!event) throw new Error('no event')
  return event
}

test('a member adds an entry that belongs to them', async () => {
  const event = await aliceEntry()
  expect(event).toMatchObject({ names: 'Rahul', year: 1958, addedBy: alice.id })
})

test('a member calling the action directly cannot change someone else’s entry', async () => {
  const event = await aliceEntry()
  const result = await saveEntry(h.db, bob, raw({ names: 'Hacked' }), event.id, TODAY)
  expect(result).toMatchObject({ ok: false, errors: { form: expect.any(String) } })
  expect(await getEvent(h.db, event.id)).toEqual(event)
})

test('an admin may edit anyone’s entry', async () => {
  const event = await aliceEntry()
  expect(await saveEntry(h.db, admin, raw({ names: 'Rahul Sharma' }), event.id, TODAY)).toEqual({ ok: true })
  expect((await getEvent(h.db, event.id))?.names).toBe('Rahul Sharma')
})

test('invalid input returns field errors and writes nothing', async () => {
  const result = await saveEntry(h.db, alice, raw({ names: '', day: '31', month: '4' }), null, TODAY)
  expect(result).toMatchObject({ ok: false, errors: { names: expect.any(String), day: expect.any(String) } })
})

test('editing a missing entry says so', async () => {
  const result = await saveEntry(h.db, admin, raw(), '00000000-0000-0000-0000-000000000000', TODAY)
  expect(result).toMatchObject({ ok: false, errors: { form: expect.stringMatching(/no longer exists/) } })
})

test('removeEntry refuses someone else’s entry and deletes your own', async () => {
  const event = await aliceEntry()
  expect(await removeEntry(h.db, bob, event.id)).toBe('forbidden')
  expect(await getEvent(h.db, event.id)).not.toBeNull()
  expect(await removeEntry(h.db, alice, event.id)).toBe('ok')
  expect(await removeEntry(h.db, alice, event.id)).toBe('not_found')
})

test('an entry added by the admin cannot be edited by a member', async () => {
  const event = await createEvent(
    h.db,
    { type: 'birthday', names: 'Nani', familyCallsThem: null, title: null, day: 1, month: 1, year: null, repeatsYearly: true, note: null },
    admin.id
  )
  expect(await saveEntry(h.db, alice, raw(), event.id, TODAY)).toMatchObject({ ok: false })
})
