import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_AI_STYLE } from '@family-wishes/core'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { createDb, queryRows, type DbHandle } from '../src/client.ts'
import { runMigrations } from '../src/migrate.ts'
import { createTestDb } from '../src/testing.ts'

const TABLES = [
  'members', 'events', 'festivals', 'drafts', 'settings', 'login_codes',
  'sessions', 'outbox', 'wa_auth', 'wa_status', 'job_runs', 'job_requests'
]

let h: DbHandle

beforeAll(async () => {
  h = await createTestDb()
})

afterAll(async () => {
  await h.close()
})

test('createTestDb applies the migrations and a second run applies nothing', async () => {
  const rows = await queryRows<{ name: string }>(h.db, sql`select name from schema_migrations`)
  expect(rows.map((r) => r.name)).toContain('20261024000001_init.sql')
  expect(await runMigrations(h)).toEqual([])
})

test('row level security is on for every table', async () => {
  const rows = await queryRows<{ relname: string }>(
    h.db,
    sql`select relname from pg_class where relrowsecurity and relnamespace = 'public'::regnamespace`
  )
  const secured = rows.map((r) => r.relname)
  for (const table of [...TABLES, 'schema_migrations']) expect(secured).toContain(table)
})

test('settings are seeded with the defaults', async () => {
  const rows = await queryRows<{ key: string; value: string }>(h.db, sql`select key, value from settings`)
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  expect(settings).toMatchObject({
    draft_time: '20:00',
    nudge_time: '07:00',
    send_time: '08:00',
    time_zone: 'Asia/Kolkata',
    country_code: '91',
    group_id: '',
    active_batch_date: ''
  })
  expect(settings.ai_style).toBe(DEFAULT_AI_STYLE)
})

test('a draft must point at exactly one event or festival', async () => {
  const [event] = await queryRows<{ id: string }>(
    h.db,
    sql`insert into events (type, names, day, month) values ('birthday', 'Rahul', 1, 1) returning id`
  )
  const [festival] = await queryRows<{ id: string }>(
    h.db,
    sql`insert into festivals (name, date) values ('Constraint Test Fest', '2027-03-22') returning id`
  )
  await expect(
    h.execRaw(
      `insert into drafts (occurrence_date, event_id, festival_id, number, text, source, status)
       values ('2027-01-01', '${event?.id}', '${festival?.id}', 1, 'Hi', 'ai', 'pending')`
    )
  ).rejects.toThrow()
})

test('member phones must be international digits', async () => {
  await expect(h.execRaw(`insert into members (phone, name) values ('+91 98', 'Bad')`)).rejects.toThrow()
})

test('a failing migration leaves nothing behind', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fw-migrations-'))
  const scratch = await createDb('pglite:memory')
  try {
    await writeFile(join(dir, '001_bad.sql'), 'create table half_done (id int);\nselect * from no_such_table;')
    await expect(runMigrations(scratch, dir)).rejects.toThrow()
    const tables = await queryRows<{ n: number }>(
      scratch.db,
      sql`select count(*)::int as n from pg_class where relname = 'half_done'`
    )
    expect(tables[0]?.n).toBe(0)
    expect(await queryRows(scratch.db, sql`select name from schema_migrations`)).toEqual([])
  } finally {
    await scratch.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('createDb rejects unknown URLs', async () => {
  await expect(createDb('mysql://nope')).rejects.toThrow(/DATABASE_URL/)
})
