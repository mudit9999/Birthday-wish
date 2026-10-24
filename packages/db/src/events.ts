import type { EventInput, FamilyEvent, ISODate } from '@family-wishes/core'
import { and, asc, eq, sql, type SQL } from 'drizzle-orm'
import { events } from './schema.ts'
import type { Db } from './client.ts'

export type Actor = { id: string; isAdmin: boolean }
export type MutationResult = 'ok' | 'not_found' | 'forbidden'

const EVENT_COLUMNS = {
  id: events.id,
  type: events.type,
  names: events.names,
  familyCallsThem: events.familyCallsThem,
  title: events.title,
  day: events.day,
  month: events.month,
  year: events.year,
  repeatsYearly: events.repeatsYearly,
  note: events.note,
  archived: events.archived,
  addedBy: events.addedBy
}

export async function listEvents(
  db: Db,
  opts: { addedBy?: string; includeArchived?: boolean } = {}
): Promise<FamilyEvent[]> {
  const filters = [
    opts.addedBy === undefined ? undefined : eq(events.addedBy, opts.addedBy),
    opts.includeArchived ? undefined : eq(events.archived, false)
  ]
  return db
    .select(EVENT_COLUMNS)
    .from(events)
    .where(and(...filters))
    .orderBy(asc(events.month), asc(events.day), asc(events.names))
}

export async function getEvent(db: Db, id: string): Promise<FamilyEvent | null> {
  const [row] = await db.select(EVENT_COLUMNS).from(events).where(eq(events.id, id))
  return row ?? null
}

export async function createEvent(db: Db, input: EventInput, addedBy: string): Promise<FamilyEvent> {
  const [row] = await db
    .insert(events)
    .values({ ...input, addedBy })
    .returning(EVENT_COLUMNS)
  if (!row) throw new Error('createEvent returned no row')
  return row
}

// Members may only touch their own entries; admins may touch any.
function ownedBy(id: string, actor: Actor): SQL | undefined {
  return and(eq(events.id, id), actor.isAdmin ? undefined : eq(events.addedBy, actor.id))
}

async function missingOrForbidden(db: Db, id: string): Promise<MutationResult> {
  return (await getEvent(db, id)) ? 'forbidden' : 'not_found'
}

export async function updateEvent(db: Db, id: string, input: EventInput, actor: Actor): Promise<MutationResult> {
  const updated = await db
    .update(events)
    .set({ ...input, updatedAt: sql`now()` })
    .where(ownedBy(id, actor))
    .returning({ id: events.id })
  return updated.length > 0 ? 'ok' : missingOrForbidden(db, id)
}

export async function deleteEvent(db: Db, id: string, actor: Actor): Promise<MutationResult> {
  const deleted = await db.delete(events).where(ownedBy(id, actor)).returning({ id: events.id })
  return deleted.length > 0 ? 'ok' : missingOrForbidden(db, id)
}

/** Archives one-time events whose date is before `today`. Returns how many were archived. */
export async function archivePastOneTimeEvents(db: Db, today: ISODate): Promise<number> {
  const archived = await db
    .update(events)
    .set({ archived: true, updatedAt: sql`now()` })
    .where(
      and(
        eq(events.repeatsYearly, false),
        eq(events.archived, false),
        sql`make_date(${events.year}, ${events.month}, ${events.day}) < ${today}::date`
      )
    )
    .returning({ id: events.id })
  return archived.length
}
