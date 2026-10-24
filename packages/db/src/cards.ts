import type { CardImage, ISODate } from '@family-wishes/core'
import { eq, inArray, lt, sql } from 'drizzle-orm'
import { draftCards, drafts } from './schema.ts'
import type { Db } from './client.ts'

export interface StoredCard {
  data: Uint8Array
  mimeType: string
  createdAt: Date
}

/** Stores the draft's card, replacing any earlier one. */
export async function saveCard(db: Db, draftId: string, card: CardImage): Promise<void> {
  const image = Buffer.from(card.base64, 'base64')
  await db
    .insert(draftCards)
    .values({ draftId, image, mimeType: card.mimeType })
    .onConflictDoUpdate({ target: draftCards.draftId, set: { image, mimeType: card.mimeType, createdAt: sql`now()` } })
}

export async function getCard(db: Db, draftId: string): Promise<StoredCard | null> {
  const [row] = await db
    .select({ data: draftCards.image, mimeType: draftCards.mimeType, createdAt: draftCards.createdAt })
    .from(draftCards)
    .where(eq(draftCards.draftId, draftId))
  return row ?? null
}

export async function deleteCard(db: Db, draftId: string): Promise<void> {
  await db.delete(draftCards).where(eq(draftCards.draftId, draftId))
}

/** When each of `draftIds` got its card; drafts without one are absent. Lets pages bust image caches. */
export async function cardTimes(db: Db, draftIds: string[]): Promise<Map<string, Date>> {
  if (draftIds.length === 0) return new Map()
  const rows = await db
    .select({ draftId: draftCards.draftId, createdAt: draftCards.createdAt })
    .from(draftCards)
    .where(inArray(draftCards.draftId, draftIds))
  return new Map(rows.map((row) => [row.draftId, row.createdAt]))
}

/** Deletes the cards of drafts for days before `date`; returns how many went. */
export async function pruneCardsBefore(db: Db, date: ISODate): Promise<number> {
  const old = db.select({ id: drafts.id }).from(drafts).where(lt(drafts.occurrenceDate, date))
  const deleted = await db.delete(draftCards).where(inArray(draftCards.draftId, old)).returning({ id: draftCards.draftId })
  return deleted.length
}
