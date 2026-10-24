import { afterAll, beforeAll, expect, test } from 'vitest'
import type { DbHandle } from '../src/client.ts'
import { listFestivals } from '../src/festivals.ts'
import { createTestDb } from '../src/testing.ts'

const NAMES = [
  'Lohri', 'Makar Sankranti', 'Vasant Panchami', 'Maha Shivratri', 'Holi', 'Chaitra Navratri', 'Ram Navami',
  'Hanuman Jayanti', 'Raksha Bandhan', 'Janmashtami', 'Ganesh Chaturthi', 'Sharad Navratri', 'Dussehra',
  'Karwa Chauth', 'Dhanteras', 'Diwali', 'Govardhan Puja', 'Bhai Dooj', 'Chhath'
]

let h: DbHandle

beforeAll(async () => {
  h = await createTestDb()
})

afterAll(async () => {
  await h.close()
})

test.each([2026, 2027])('every festival seeded exactly once in %i', async (year) => {
  const rows = await listFestivals(h.db, { from: `${year}-01-01`, to: `${year}-12-31` })
  expect(rows.map((r) => r.name).sort()).toEqual([...NAMES].sort())
})

test.each([2026, 2027])('the Diwali days are in order in %i', async (year) => {
  const rows = await listFestivals(h.db, { from: `${year}-01-01`, to: `${year}-12-31` })
  const dateOf = (name: string): string => rows.find((r) => r.name === name)?.date ?? ''
  expect(dateOf('Dhanteras') < dateOf('Diwali')).toBe(true)
  expect(dateOf('Diwali') < dateOf('Govardhan Puja')).toBe(true)
  expect(dateOf('Govardhan Puja') < dateOf('Bhai Dooj')).toBe(true)
  expect(dateOf('Bhai Dooj') < dateOf('Chhath')).toBe(true)
  expect(dateOf('Sharad Navratri') < dateOf('Dussehra')).toBe(true)
  expect(dateOf('Chaitra Navratri') < dateOf('Ram Navami')).toBe(true)
})

test('spot-check known dates', async () => {
  const rows = await listFestivals(h.db)
  const find = (name: string, year: number) => rows.find((r) => r.name === name && r.date.startsWith(String(year)))?.date
  expect(find('Diwali', 2026)).toBe('2026-11-08')
  expect(find('Holi', 2026)).toBe('2026-03-04')
  expect(find('Diwali', 2027)).toBe('2027-10-29')
})
