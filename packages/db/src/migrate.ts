import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { sql } from 'drizzle-orm'
import { createDb, queryRows, type DbHandle } from './client.js'

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url))

const MIGRATION_NAME = /^[\w.-]+\.sql$/

const BOOKKEEPING = `
create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table schema_migrations enable row level security;`

/**
 * Applies pending `*.sql` files in filename order and returns their names.
 * Each file and its bookkeeping row go in one simple-protocol message, which Postgres runs as one transaction.
 */
export async function runMigrations(h: DbHandle, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await h.execRaw(BOOKKEEPING)
  const rows = await queryRows<{ name: string }>(h.db, sql`select name from schema_migrations`)
  const applied = new Set(rows.map((row) => row.name))
  const pending = (await readdir(dir)).filter((name) => name.endsWith('.sql') && !applied.has(name)).sort()
  for (const name of pending) {
    if (!MIGRATION_NAME.test(name)) throw new Error(`unsafe migration file name: ${name}`)
    const body = await readFile(join(dir, name), 'utf8')
    await h.execRaw(`${body}\n;\ninsert into schema_migrations (name) values ('${name}');`)
  }
  return pending
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const h = await createDb(url)
  try {
    const applied = await runMigrations(h)
    process.stdout.write(applied.length ? `Applied: ${applied.join(', ')}\n` : 'Database is up to date.\n')
  } finally {
    await h.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
