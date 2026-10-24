import type { Festival, ISODate } from '@family-wishes/core'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { festivals } from './schema.ts'
import { isUniqueViolation, type Db } from './client.ts'

const FESTIVAL_COLUMNS = { id: festivals.id, name: festivals.name, date: festivals.date }

export async function listFestivals(db: Db, range?: { from: ISODate; to: ISODate }): Promise<Festival[]> {
  const inRange = range ? and(gte(festivals.date, range.from), lte(festivals.date, range.to)) : undefined
  return db.select(FESTIVAL_COLUMNS).from(festivals).where(inRange).orderBy(asc(festivals.date), asc(festivals.name))
}

export async function getFestival(db: Db, id: string): Promise<Festival | null> {
  const [row] = await db.select(FESTIVAL_COLUMNS).from(festivals).where(eq(festivals.id, id))
  return row ?? null
}

export async function createFestival(db: Db, f: { name: string; date: ISODate }): Promise<Festival | 'duplicate'> {
  const [row] = await db
    .insert(festivals)
    .values(f)
    .onConflictDoNothing({ target: [festivals.name, festivals.date] })
    .returning(FESTIVAL_COLUMNS)
  return row ?? 'duplicate'
}

export async function updateFestival(
  db: Db,
  id: string,
  f: { name: string; date: ISODate }
): Promise<'ok' | 'not_found' | 'duplicate'> {
  try {
    const updated = await db.update(festivals).set(f).where(eq(festivals.id, id)).returning({ id: festivals.id })
    return updated.length > 0 ? 'ok' : 'not_found'
  } catch (error) {
    if (isUniqueViolation(error)) return 'duplicate'
    throw error
  }
}

export async function deleteFestival(db: Db, id: string): Promise<'ok' | 'not_found'> {
  const deleted = await db.delete(festivals).where(eq(festivals.id, id)).returning({ id: festivals.id })
  return deleted.length > 0 ? 'ok' : 'not_found'
}
