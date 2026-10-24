import { afterAll, beforeAll, expect, test } from 'vitest'
import type { DbHandle } from '../src/client.ts'
import {
  createFestival,
  deleteFestival,
  getFestival,
  listFestivals,
  updateFestival
} from '../src/festivals.ts'
import { createTestDb } from '../src/testing.ts'

let h: DbHandle

beforeAll(async () => {
  h = await createTestDb()
  await h.execRaw('delete from festivals')
})

afterAll(async () => {
  await h.close()
})

test('create, get, update and delete a festival', async () => {
  const created = await createFestival(h.db, { name: 'Test Utsav', date: '2026-12-01' })
  if (created === 'duplicate') throw new Error('unexpected duplicate')
  expect(created).toMatchObject({ name: 'Test Utsav', date: '2026-12-01' })
  expect(await getFestival(h.db, created.id)).toEqual(created)

  expect(await updateFestival(h.db, created.id, { name: 'Test Utsav', date: '2026-12-02' })).toBe('ok')
  expect((await getFestival(h.db, created.id))?.date).toBe('2026-12-02')

  expect(await deleteFestival(h.db, created.id)).toBe('ok')
  expect(await getFestival(h.db, created.id)).toBeNull()
  expect(await deleteFestival(h.db, created.id)).toBe('not_found')
  expect(await updateFestival(h.db, created.id, { name: 'X', date: '2026-12-03' })).toBe('not_found')
})

test('the same festival on the same date is a duplicate', async () => {
  await createFestival(h.db, { name: 'Dup Fest', date: '2026-12-10' })
  expect(await createFestival(h.db, { name: 'Dup Fest', date: '2026-12-10' })).toBe('duplicate')
  const other = await createFestival(h.db, { name: 'Dup Fest', date: '2026-12-11' })
  if (other === 'duplicate') throw new Error('unexpected duplicate')
  expect(await updateFestival(h.db, other.id, { name: 'Dup Fest', date: '2026-12-10' })).toBe('duplicate')
})

test('listFestivals filters by an inclusive date range and sorts by date', async () => {
  await createFestival(h.db, { name: 'Range A', date: '2027-01-05' })
  await createFestival(h.db, { name: 'Range B', date: '2027-01-01' })
  await createFestival(h.db, { name: 'Range C', date: '2027-01-10' })
  const rows = await listFestivals(h.db, { from: '2027-01-01', to: '2027-01-05' })
  expect(rows.map((f) => f.name)).toEqual(['Range B', 'Range A'])
  expect((await listFestivals(h.db)).length).toBeGreaterThanOrEqual(5)
})
