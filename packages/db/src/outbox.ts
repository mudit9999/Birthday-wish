import { asc, eq, inArray, sql } from 'drizzle-orm'
import { outbox } from './schema.ts'
import type { Db } from './client.ts'

export interface OutboxRow {
  id: string
  toPhone: string
  body: string
  createdAt: Date
}

const OUTBOX_COLUMNS = { id: outbox.id, toPhone: outbox.toPhone, body: outbox.body, createdAt: outbox.createdAt }
const INTERRUPTED_ERROR = 'Worker stopped while sending'

/** Queues a WhatsApp message (a login code) for the worker to send. */
export async function enqueueOutbox(db: Db, toPhone: string, body: string): Promise<void> {
  await db.insert(outbox).values({ toPhone, body })
}

/** Moves up to `limit` of the oldest queued rows to `sending` in one statement and returns them. */
export async function claimQueuedOutbox(db: Db, limit: number): Promise<OutboxRow[]> {
  const oldestQueued = db
    .select({ id: outbox.id })
    .from(outbox)
    .where(eq(outbox.status, 'queued'))
    .orderBy(asc(outbox.createdAt))
    .limit(limit)
  return db
    .update(outbox)
    .set({ status: 'sending' })
    .where(inArray(outbox.id, oldestQueued))
    .returning(OUTBOX_COLUMNS)
}

/** Records the outcome and blanks the body so login codes don't linger in the database. */
export async function finishOutbox(
  db: Db,
  id: string,
  result: { ok: true } | { ok: false; error: string }
): Promise<void> {
  await db
    .update(outbox)
    .set(
      result.ok
        ? { status: 'sent', body: '', error: null, sentAt: sql`now()` }
        : { status: 'failed', body: '', error: result.error }
    )
    .where(eq(outbox.id, id))
}

/** On startup: a row left in `sending` may already have arrived, so it is failed rather than resent. */
export async function failInterruptedOutbox(db: Db): Promise<number> {
  const failed = await db
    .update(outbox)
    .set({ status: 'failed', body: '', error: INTERRUPTED_ERROR })
    .where(eq(outbox.status, 'sending'))
    .returning({ id: outbox.id })
  return failed.length
}
