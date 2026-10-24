import { isTimeReached, localDate, localTime } from '@family-wishes/core'
import {
  applyDraftAction,
  approvedDraftsFor,
  expireDraftsBefore,
  failInterruptedSends,
  getSettings,
  type Draft
} from '@family-wishes/db'
import type { WorkerDeps } from '../deps.js'

// Dates on which the missing-group warning was already logged, so it appears once a day.
const warnedNoGroup = new Set<string>()

async function postOne(deps: WorkerDeps, groupId: string, draft: Draft): Promise<boolean> {
  const claimed = await applyDraftAction(deps.db, draft.id, 'claim')
  if (!claimed) return false
  try {
    const sentMessageId = await deps.messenger.sendToGroup(groupId, claimed.text)
    await applyDraftAction(deps.db, draft.id, 'markSent', { sentMessageId })
    deps.log.info({ draft: draft.number }, 'wish posted')
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await applyDraftAction(deps.db, draft.id, 'markFailed', { error: message })
    deps.log.error({ err: error, draft: draft.number }, 'posting wish failed')
    return false
  }
}

/** Posts today's approved drafts to the family group once `send_time` has passed. Returns how many posted. */
export async function postDueDrafts(deps: WorkerDeps, opts: { ignoreSendTime?: boolean } = {}): Promise<number> {
  const settings = await getSettings(deps.db)
  const now = deps.now()
  const today = localDate(now, settings.timeZone)
  if (!opts.ignoreSendTime && !isTimeReached(localTime(now, settings.timeZone), settings.sendTime)) return 0
  if (!deps.messenger.isReady()) return 0
  if (!settings.groupId) {
    if (!warnedNoGroup.has(today)) deps.log.warn('no family group chosen; approved wishes are waiting')
    warnedNoGroup.add(today)
    return 0
  }
  let posted = 0
  for (const draft of await approvedDraftsFor(deps.db, today)) {
    if (await postOne(deps, settings.groupId, draft)) posted += 1
  }
  return posted
}

/** Closes drafts from earlier days: unapproved ones expire, approved-but-unsent ones fail. */
export async function expireOldDrafts(deps: WorkerDeps): Promise<number> {
  const { timeZone } = await getSettings(deps.db)
  return expireDraftsBefore(deps.db, localDate(deps.now(), timeZone))
}

/** Run once on startup: anything left mid-send may or may not have reached the group. */
export async function recoverInterruptedSends(deps: WorkerDeps): Promise<number> {
  return failInterruptedSends(deps.db)
}
