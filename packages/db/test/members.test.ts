import { afterAll, beforeAll, expect, test } from 'vitest'
import type { DbHandle } from '../src/client.js'
import {
  addMember,
  ensureAdmin,
  findMemberByPhone,
  getMember,
  listMembers,
  removeMember
} from '../src/members.js'
import { createTestDb } from '../src/testing.js'

let h: DbHandle

beforeAll(async () => {
  h = await createTestDb()
})

afterAll(async () => {
  await h.close()
})

test('addMember creates a member and rejects a duplicate phone', async () => {
  const added = await addMember(h.db, { phone: '919800000001', name: 'Nani' })
  expect(added).toMatchObject({ phone: '919800000001', name: 'Nani', isAdmin: false })
  expect(await addMember(h.db, { phone: '919800000001', name: 'Someone else' })).toBe('duplicate')
})

test('find, get and list members', async () => {
  const nani = await findMemberByPhone(h.db, '919800000001')
  expect(nani?.name).toBe('Nani')
  expect(await getMember(h.db, nani?.id ?? '')).toEqual(nani)
  expect(await findMemberByPhone(h.db, '919899999999')).toBeNull()
  expect(await getMember(h.db, '00000000-0000-0000-0000-000000000000')).toBeNull()
  expect((await listMembers(h.db)).map((m) => m.name)).toContain('Nani')
})

test('ensureAdmin is idempotent and promotes an existing member', async () => {
  const first = await ensureAdmin(h.db, '919800000002')
  const second = await ensureAdmin(h.db, '919800000002')
  expect(first).toMatchObject({ phone: '919800000002', name: 'Admin', isAdmin: true })
  expect(second).toEqual(first)

  await addMember(h.db, { phone: '919800000003', name: 'Papa' })
  expect(await ensureAdmin(h.db, '919800000003')).toMatchObject({ name: 'Papa', isAdmin: true })
})

test('removeMember refuses to remove an admin', async () => {
  const admin = await ensureAdmin(h.db, '919800000002')
  expect(await removeMember(h.db, admin.id)).toBe('is_admin')
  expect(await getMember(h.db, admin.id)).not.toBeNull()

  const guest = await addMember(h.db, { phone: '919800000004', name: 'Guest' })
  if (guest === 'duplicate') throw new Error('unexpected duplicate')
  expect(await removeMember(h.db, guest.id)).toBe('ok')
  expect(await getMember(h.db, guest.id)).toBeNull()
})
