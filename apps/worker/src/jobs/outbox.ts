import { claimQueuedOutbox, findMemberByPhone, finishOutbox, type OutboxRow } from '@family-wishes/db'
import type { WorkerDeps } from '../deps.js'

const BATCH_SIZE = 10
const CODE_LIFETIME_MS = 10 * 60 * 1000

async function deliver(deps: WorkerDeps, row: OutboxRow): Promise<boolean> {
  if (deps.now().getTime() - row.createdAt.getTime() > CODE_LIFETIME_MS) {
    await finishOutbox(deps.db, row.id, { ok: false, error: 'expired' })
    return false
  }
  // The worker only ever messages pre-approved family numbers.
  if (!(await findMemberByPhone(deps.db, row.toPhone))) {
    await finishOutbox(deps.db, row.id, { ok: false, error: 'not a member' })
    deps.log.warn('outbox message to a non-member was dropped')
    return false
  }
  try {
    await deps.messenger.sendToPhone(row.toPhone, row.body)
    await finishOutbox(deps.db, row.id, { ok: true })
    return true
  } catch (error) {
    await finishOutbox(deps.db, row.id, { ok: false, error: error instanceof Error ? error.message : String(error) })
    deps.log.error({ err: error }, 'sending login code failed')
    return false
  }
}

/** Sends queued login codes to family members. Returns how many were sent. */
export async function sendOutbox(deps: WorkerDeps): Promise<number> {
  if (!deps.messenger.isReady()) return 0
  let sent = 0
  for (const row of await claimQueuedOutbox(deps.db, BATCH_SIZE)) {
    if (await deliver(deps, row)) sent += 1
  }
  return sent
}
