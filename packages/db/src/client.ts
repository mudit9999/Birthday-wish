import type { SQL } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema.ts'

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export interface DbHandle {
  db: Db
  execRaw(sql: string): Promise<void>
  close(): Promise<void>
}

const PGLITE_PREFIX = 'pglite:'
const POSTGRES_URL = /^postgres(ql)?:\/\//
// The Supabase transaction pooler doesn't support prepared statements.
const POSTGRES_OPTIONS = { prepare: false, max: 3 } as const

async function createPglite(target: string): Promise<DbHandle> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const client = target === 'memory' ? new PGlite() : new PGlite(target)
  await client.waitReady
  return {
    db: drizzle({ client, schema }) as unknown as Db,
    execRaw: async (text) => {
      await client.exec(text)
    },
    close: () => client.close()
  }
}

async function createPostgres(url: string): Promise<DbHandle> {
  const { default: postgres } = await import('postgres')
  const { drizzle } = await import('drizzle-orm/postgres-js')
  const client = postgres(url, POSTGRES_OPTIONS)
  return {
    db: drizzle({ client, schema }) as unknown as Db,
    execRaw: async (text) => {
      await client.unsafe(text).simple()
    },
    close: () => client.end()
  }
}

/** Opens `pglite:memory`, `pglite:<dir>` or a `postgres://` URL. */
export async function createDb(url: string): Promise<DbHandle> {
  if (url.startsWith(PGLITE_PREFIX)) return createPglite(url.slice(PGLITE_PREFIX.length))
  if (POSTGRES_URL.test(url)) return createPostgres(url)
  throw new Error('DATABASE_URL must be pglite:memory, pglite:<dir> or a postgres:// URL')
}

/** Runs a raw query and returns its rows, whichever driver is behind `db`. */
export async function queryRows<T>(db: Db, query: SQL): Promise<T[]> {
  const result: unknown = await db.execute(query)
  if (Array.isArray(result)) return result as T[]
  return (result as { rows: T[] }).rows
}

const UNIQUE_VIOLATION = '23505'

/** Whether `error` (or the driver error Drizzle wraps in `cause`) is a Postgres unique violation. */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ((error as { code?: unknown }).code === UNIQUE_VIOLATION) return true
  return isUniqueViolation((error as { cause?: unknown }).cause)
}
