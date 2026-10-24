import {
  allowedFrom,
  nextStatus,
  type DraftAction,
  type DraftSource,
  type DraftStatus,
  type ISODate,
  type Occurrence
} from '@family-wishes/core'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { drafts } from './schema.ts'
import type { Db } from './client.ts'
import { getEvent } from './events.ts'
import { getFestival } from './festivals.ts'

export interface Draft {
  id: string
  occurrenceDate: ISODate
  eventId: string | null
  festivalId: string | null
  number: number
  text: string
  source: DraftSource
  status: DraftStatus
  error: string | null
  sentMessageId: string | null
}

export type DraftPatch = { text?: string; source?: DraftSource; error?: string; sentMessageId?: string }

const DRAFT_COLUMNS = {
  id: drafts.id,
  occurrenceDate: drafts.occurrenceDate,
  eventId: drafts.eventId,
  festivalId: drafts.festivalId,
  number: drafts.number,
  text: drafts.text,
  source: drafts.source,
  status: drafts.status,
  error: drafts.error,
  sentMessageId: drafts.sentMessageId
}

const OPEN_STATUSES: DraftStatus[] = ['pending', 'approved', 'skipped', 'failed']
const DAY_ENDED_ERROR = 'The day ended before it could be posted.'
const INTERRUPTED_ERROR = 'Worker stopped while sending — check the group before retrying.'

/** Inserts a pending draft numbered after the date's last one; `null` if this occasion already has one. */
export async function insertDraftIfMissing(
  db: Db,
  d: { occurrenceDate: ISODate; eventId?: string; festivalId?: string; text: string; source: DraftSource }
): Promise<Draft | null> {
  const [row] = await db
    .insert(drafts)
    .values({
      occurrenceDate: d.occurrenceDate,
      eventId: d.eventId ?? null,
      festivalId: d.festivalId ?? null,
      number: sql`(select coalesce(max(${drafts.number}), 0) + 1 from ${drafts} where ${drafts.occurrenceDate} = ${d.occurrenceDate})`,
      text: d.text,
      source: d.source,
      status: 'pending'
    })
    .onConflictDoNothing()
    .returning(DRAFT_COLUMNS)
  return row ?? null
}

function targetStatus(action: Exclude<DraftAction, 'expire'>): DraftStatus {
  const [from] = allowedFrom(action)
  const to = from ? nextStatus(from, action) : null
  if (!to) throw new Error(`no transition for ${action}`)
  return to
}

function changesFor(action: Exclude<DraftAction, 'expire'>, patch: DraftPatch) {
  return {
    status: targetStatus(action),
    updatedAt: sql`now()`,
    error: patch.error ?? null,
    ...(patch.text === undefined ? {} : { text: patch.text }),
    ...(patch.source === undefined ? {} : { source: patch.source }),
    ...(action === 'edit' ? { source: patch.source ?? 'admin' } : {}),
    ...(action === 'approve' || action === 'edit' ? { approvedAt: sql`now()` } : {}),
    ...(action === 'markSent' ? { sentAt: sql`now()`, sentMessageId: patch.sentMessageId ?? null } : {})
  }
}

/** Moves a draft with one conditional update; `null` when its current status doesn't allow `action`. */
export async function applyDraftAction(
  db: Db,
  id: string,
  action: Exclude<DraftAction, 'expire'>,
  patch: DraftPatch = {}
): Promise<Draft | null> {
  if (action === 'edit' && !patch.text) throw new Error('edit needs text')
  const [row] = await db
    .update(drafts)
    .set(changesFor(action, patch))
    .where(and(eq(drafts.id, id), inArray(drafts.status, allowedFrom(action))))
    .returning(DRAFT_COLUMNS)
  return row ?? null
}

export async function getDraft(db: Db, id: string): Promise<Draft | null> {
  const [row] = await db.select(DRAFT_COLUMNS).from(drafts).where(eq(drafts.id, id))
  return row ?? null
}

export async function listDraftsForDates(db: Db, dates: ISODate[]): Promise<Draft[]> {
  if (dates.length === 0) return []
  return db
    .select(DRAFT_COLUMNS)
    .from(drafts)
    .where(inArray(drafts.occurrenceDate, dates))
    .orderBy(asc(drafts.occurrenceDate), asc(drafts.number))
}

/** Numbers the admin can still act on for `date`. */
export async function openDraftNumbers(db: Db, date: ISODate): Promise<number[]> {
  const rows = await db
    .select({ number: drafts.number })
    .from(drafts)
    .where(and(eq(drafts.occurrenceDate, date), inArray(drafts.status, OPEN_STATUSES)))
    .orderBy(asc(drafts.number))
  return rows.map((row) => row.number)
}

export async function findDraftByNumber(db: Db, date: ISODate, number: number): Promise<Draft | null> {
  const [row] = await db
    .select(DRAFT_COLUMNS)
    .from(drafts)
    .where(and(eq(drafts.occurrenceDate, date), eq(drafts.number, number)))
  return row ?? null
}

export async function approvedDraftsFor(db: Db, date: ISODate): Promise<Draft[]> {
  return db
    .select(DRAFT_COLUMNS)
    .from(drafts)
    .where(and(eq(drafts.occurrenceDate, date), eq(drafts.status, 'approved')))
    .orderBy(asc(drafts.number))
}

/** Closes drafts for days before `date`: pending → expired, approved → failed. */
export async function expireDraftsBefore(db: Db, date: ISODate): Promise<number> {
  const before = sql`${drafts.occurrenceDate} < ${date}::date`
  const expired = await db
    .update(drafts)
    .set({ status: 'expired', updatedAt: sql`now()` })
    .where(and(before, eq(drafts.status, 'pending')))
    .returning({ id: drafts.id })
  const failed = await db
    .update(drafts)
    .set({ status: 'failed', error: DAY_ENDED_ERROR, updatedAt: sql`now()` })
    .where(and(before, eq(drafts.status, 'approved')))
    .returning({ id: drafts.id })
  return expired.length + failed.length
}

/** On startup: a `sending` draft may or may not have reached the group, so it needs a human check. */
export async function failInterruptedSends(db: Db): Promise<number> {
  const failed = await db
    .update(drafts)
    .set({ status: 'failed', error: INTERRUPTED_ERROR, updatedAt: sql`now()` })
    .where(eq(drafts.status, 'sending'))
    .returning({ id: drafts.id })
  return failed.length
}

/** Pending drafts for `date` the admin hasn't been sent yet. */
export async function unnotifiedDrafts(db: Db, date: ISODate): Promise<Draft[]> {
  return db
    .select(DRAFT_COLUMNS)
    .from(drafts)
    .where(and(eq(drafts.occurrenceDate, date), eq(drafts.status, 'pending'), isNull(drafts.notifiedAt)))
    .orderBy(asc(drafts.number))
}

export async function markNotified(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db.update(drafts).set({ notifiedAt: sql`now()` }).where(inArray(drafts.id, ids))
}

/** The event or festival a draft wishes for, or null if it has since been deleted. */
export async function occurrenceForDraft(db: Db, draft: Draft): Promise<Occurrence | null> {
  const date = draft.occurrenceDate
  if (draft.eventId) {
    const event = await getEvent(db, draft.eventId)
    return event ? { kind: 'event', date, event } : null
  }
  const festival = draft.festivalId ? await getFestival(db, draft.festivalId) : null
  return festival ? { kind: 'festival', date, festival } : null
}
