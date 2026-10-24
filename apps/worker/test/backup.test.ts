import { addMember, createEvent, ensureAdmin, type DbHandle } from '@family-wishes/db'
import { createTestDb } from '@family-wishes/db/testing'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { writeBackup } from '../src/jobs/backup.js'
import { ADMIN_PHONE, fixedNow, testDeps } from './fakes.js'

let h: DbHandle

beforeEach(async () => {
  h = await createTestDb()
  const admin = await ensureAdmin(h.db, ADMIN_PHONE)
  await addMember(h.db, { phone: '919811111111', name: 'Nani' })
  await createEvent(
    h.db,
    { type: 'birthday', names: 'Rahul', familyCallsThem: null, title: null, day: 5, month: 12, year: 1958, repeatsYearly: true, note: null },
    admin.id
  )
  await h.execRaw(
    `insert into sessions (token_hash, member_id, expires_at) values ('secret-hash', '${admin.id}', now() + interval '1 day')`
  )
})

afterEach(async () => {
  await h.close()
})

test('writes a dated JSON backup and keeps only the newest 14', async () => {
  const deps = testDeps(h.db, { now: fixedNow('2026-12-05T02:00:00+05:30') })
  for (let day = 1; day <= 15; day += 1) {
    await writeFile(join(deps.backupDir, `backup-2026-11-${String(day).padStart(2, '0')}.json`), '{}')
  }
  await writeFile(join(deps.backupDir, 'notes.txt'), 'keep me')

  const path = await writeBackup(deps)
  expect(path).toBe(join(deps.backupDir, 'backup-2026-12-05.json'))
  const files = (await readdir(deps.backupDir)).filter((f) => f.startsWith('backup-'))
  expect(files).toHaveLength(14)
  expect(files).toContain('backup-2026-12-05.json')
  expect(files).not.toContain('backup-2026-11-02.json')
  expect(await readdir(deps.backupDir)).toContain('notes.txt')

  const backup = JSON.parse(await readFile(path, 'utf8'))
  expect(backup.festivals.length).toBeGreaterThanOrEqual(38)
  expect(backup.members.map((m: { name: string }) => m.name)).toContain('Nani')
  expect(backup.events[0]).toMatchObject({ names: 'Rahul', year: 1958 })
  expect(backup.settings.send_time).toBe('08:00')
  expect(typeof backup.exportedAt).toBe('string')
  const text = JSON.stringify(backup)
  expect(text).not.toContain('secret-hash')
  expect(backup).not.toHaveProperty('sessions')
  expect(backup).not.toHaveProperty('login_codes')
})
