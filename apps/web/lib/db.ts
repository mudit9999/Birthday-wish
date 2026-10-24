import 'server-only'
import { createDb, type Db, type DbHandle } from '@family-wishes/db'
import { getWebEnv } from './env'

// Kept on globalThis so `next dev` hot reloads reuse one connection (PGlite allows a single opener per directory).
const holder = globalThis as typeof globalThis & { __familyWishesDb?: Promise<DbHandle> }

export async function getDb(): Promise<Db> {
  holder.__familyWishesDb ??= createDb(getWebEnv().DATABASE_URL)
  return (await holder.__familyWishesDb).db
}
