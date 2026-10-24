import { afterAll, beforeAll, expect, test } from 'vitest'
import type { DbHandle } from '../src/client.ts'
import { getSettings, setSetting } from '../src/settings.ts'
import { createTestDb } from '../src/testing.ts'

let h: DbHandle

beforeAll(async () => {
  h = await createTestDb()
})

afterAll(async () => {
  await h.close()
})

test('getSettings returns the seeded defaults with empty values as null', async () => {
  const settings = await getSettings(h.db)
  expect(settings).toMatchObject({
    groupId: null,
    draftTime: '20:00',
    nudgeTime: '07:00',
    sendTime: '08:00',
    timeZone: 'Asia/Kolkata',
    countryCode: '91',
    activeBatchDate: null
  })
  expect(settings.aiStyle.length).toBeGreaterThan(0)
})

test('setSetting overwrites a value', async () => {
  await setSetting(h.db, 'send_time', '09:15')
  await setSetting(h.db, 'group_id', '1203630@g.us')
  await setSetting(h.db, 'active_batch_date', '2026-10-25')
  expect(await getSettings(h.db)).toMatchObject({
    sendTime: '09:15',
    groupId: '1203630@g.us',
    activeBatchDate: '2026-10-25'
  })
})
