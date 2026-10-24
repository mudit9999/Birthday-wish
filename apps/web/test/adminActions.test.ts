import { createTestDb } from '@family-wishes/db/testing'
import {
  addMember,
  ensureAdmin,
  getSettings,
  setWaStatus,
  takeJobRequests,
  type DbHandle,
  type Member
} from '@family-wishes/db'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { chooseGroup, runNow } from '../lib/admin'

let h: DbHandle
let admin: Member
let member: Member

beforeEach(async () => {
  h = await createTestDb()
  admin = await ensureAdmin(h.db, '919800000000')
  const m = await addMember(h.db, { phone: '919811111111', name: 'Nani' })
  if (m === 'duplicate') throw new Error('duplicate')
  member = m
  await setWaStatus(h.db, { state: 'connected', groups: [{ id: 'fam@g.us', name: 'Family' }] })
})

afterEach(async () => {
  await h.close()
})

test('a non-admin can neither choose the group nor run jobs', async () => {
  expect(await chooseGroup(h.db, member, 'fam@g.us')).toBe('forbidden')
  expect(await runNow(h.db, member, 'send')).toBe('forbidden')
  expect((await getSettings(h.db)).groupId).toBeNull()
  expect(await takeJobRequests(h.db)).toEqual([])
})

test('only a group the linked WhatsApp is in can be chosen', async () => {
  expect(await chooseGroup(h.db, admin, 'stranger@g.us')).toBe('unknown_group')
  expect((await getSettings(h.db)).groupId).toBeNull()
  expect(await chooseGroup(h.db, admin, 'fam@g.us')).toBe('ok')
  expect((await getSettings(h.db)).groupId).toBe('fam@g.us')
})

test('run-now queues a request for the worker', async () => {
  expect(await runNow(h.db, admin, 'draft')).toBe('ok')
  expect(await runNow(h.db, admin, 'send')).toBe('ok')
  expect(await takeJobRequests(h.db)).toEqual(['draft', 'send'])
})
