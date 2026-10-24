import { createDb, type DbHandle } from './client.js'
import { runMigrations } from './migrate.js'

/** A fresh in-memory Postgres with all migrations applied. */
export async function createTestDb(): Promise<DbHandle> {
  const h = await createDb('pglite:memory')
  await runMigrations(h)
  return h
}
