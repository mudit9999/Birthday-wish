import { createTestDb } from '@family-wishes/db/testing'
import {
  addMember,
  ensureAdmin,
  findMemberByPhone,
  getSettings,
  listFestivals,
  type DbHandle,
  type Member
} from '@family-wishes/db'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { addFamilyMember, removeFamilyMember, removeFestival, saveFestival, saveSettings } from '../lib/admin'

let h: DbHandle
let admin: Member
let member: Member

const SETTINGS = {
  draft_time: '20:00',
  nudge_time: '07:00',
  send_time: '08:30',
  time_zone: 'Asia/Kolkata',
  country_code: '91',
  ai_style: 'Short and sweet, in Hinglish.'
}

beforeEach(async () => {
  h = await createTestDb()
  admin = await ensureAdmin(h.db, '919800000000')
  const m = await addMember(h.db, { phone: '919811111111', name: 'Nani' })
  if (m === 'duplicate') throw new Error('duplicate')
  member = m
})

afterEach(async () => {
  await h.close()
})

test('every management function refuses a non-admin', async () => {
  expect(await addFamilyMember(h.db, member, { phone: '9876543210', name: 'X' })).toBe('forbidden')
  expect(await removeFamilyMember(h.db, member, admin.id)).toBe('forbidden')
  expect(await saveFestival(h.db, member, null, { name: 'Fest', date: '2027-05-01' })).toBe('forbidden')
  expect(await removeFestival(h.db, member, '00000000-0000-0000-0000-000000000000')).toBe('forbidden')
  expect(await saveSettings(h.db, member, SETTINGS)).toEqual({ ok: false, errors: { form: expect.any(String) } })
  expect((await getSettings(h.db)).sendTime).toBe('08:00')
})

test('addFamilyMember normalises the phone and rejects bad input', async () => {
  expect(await addFamilyMember(h.db, admin, { phone: '98765 43210', name: ' Papa ' })).toBe('ok')
  expect(await findMemberByPhone(h.db, '919876543210')).toMatchObject({ name: 'Papa', isAdmin: false })
  expect(await addFamilyMember(h.db, admin, { phone: '+91 98765-43210', name: 'Again' })).toBe('duplicate')
  expect(await addFamilyMember(h.db, admin, { phone: '123', name: 'Bad' })).toBe('invalid_phone')
  expect(await addFamilyMember(h.db, admin, { phone: '9876500000', name: '   ' })).toBe('invalid_name')
})

test('removeFamilyMember never removes the admin', async () => {
  expect(await removeFamilyMember(h.db, admin, admin.id)).toBe('is_self')
  expect(await removeFamilyMember(h.db, admin, member.id)).toBe('ok')
  expect(await findMemberByPhone(h.db, member.phone)).toBeNull()
})

test('saveFestival validates the date and saves or updates', async () => {
  expect(await saveFestival(h.db, admin, null, { name: 'Test Utsav', date: '2027-02-30' })).toBe('invalid')
  expect(await saveFestival(h.db, admin, null, { name: '', date: '2027-02-10' })).toBe('invalid')
  expect(await saveFestival(h.db, admin, null, { name: 'Test Utsav', date: '2027-02-10' })).toBe('ok')
  expect(await saveFestival(h.db, admin, null, { name: 'Test Utsav', date: '2027-02-10' })).toBe('duplicate')
  const [row] = await listFestivals(h.db, { from: '2027-02-10', to: '2027-02-10' })
  if (!row) throw new Error('festival missing')
  expect(await saveFestival(h.db, admin, row.id, { name: 'Test Utsav', date: '2027-02-11' })).toBe('ok')
  expect((await listFestivals(h.db, { from: '2027-02-11', to: '2027-02-11' })).map((f) => f.name)).toContain('Test Utsav')
  expect(await removeFestival(h.db, admin, row.id)).toBe('ok')
})

test('saveSettings validates every field and stores valid values', async () => {
  expect(await saveSettings(h.db, admin, { ...SETTINGS, send_time: '25:00' })).toEqual({
    ok: false,
    errors: { send_time: expect.any(String) }
  })
  const bad = await saveSettings(h.db, admin, { ...SETTINGS, time_zone: 'Mars/Base', country_code: '9999', ai_style: '' })
  expect(bad).toMatchObject({ ok: false, errors: { time_zone: expect.any(String), country_code: expect.any(String), ai_style: expect.any(String) } })
  expect((await getSettings(h.db)).sendTime).toBe('08:00')

  expect(await saveSettings(h.db, admin, SETTINGS)).toEqual({ ok: true })
  expect(await getSettings(h.db)).toMatchObject({ sendTime: '08:30', aiStyle: 'Short and sweet, in Hinglish.' })
})
