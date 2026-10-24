import { formatNudge, localDate } from '@family-wishes/core'
import { getSettings, listDraftsForDates, setSetting } from '@family-wishes/db'
import type { WorkerDeps } from '../deps.js'
import { toBatchItems } from './labels.js'

/** Reminds the admin about today's unapproved drafts. Returns whether a reminder was sent. */
export async function sendNudge(deps: WorkerDeps): Promise<boolean> {
  const { timeZone } = await getSettings(deps.db)
  const today = localDate(deps.now(), timeZone)
  const pending = (await listDraftsForDates(deps.db, [today])).filter((d) => d.status === 'pending')
  if (pending.length === 0) return false
  await deps.messenger.sendToSelf(formatNudge(await toBatchItems(deps.db, pending)))
  await setSetting(deps.db, 'active_batch_date', today)
  return true
}

export async function sendFestivalReminder(deps: WorkerDeps): Promise<void> {
  await deps.messenger.sendToSelf(
    "Time to check next year's festival dates on the website (Admin → Festivals), so festival wishes go out on the right days."
  )
}
