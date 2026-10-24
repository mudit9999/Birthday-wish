import { generateWish, localDate, MIN_EDIT_LENGTH, toWishInput, type WishModel } from '@family-wishes/core'
import {
  applyDraftAction,
  getDraft,
  getSettings,
  getWaStatus,
  occurrenceForDraft,
  requestJob,
  type Db,
  type Draft,
  type Member
} from '@family-wishes/db'

export type DraftInput =
  | { action: 'approve' | 'skip' | 'redo' }
  | { action: 'edit'; text: string }
  | { action: 'post_now'; text: string }
export type DraftActionResult = 'ok' | 'forbidden' | 'not_allowed' | 'too_short' | 'not_today' | 'no_group' | 'not_connected'

async function redo(db: Db, id: string, model: WishModel | null): Promise<Draft | null> {
  const draft = await getDraft(db, id)
  const occurrence = draft ? await occurrenceForDraft(db, draft) : null
  if (!occurrence) return null
  const { aiStyle } = await getSettings(db)
  return applyDraftAction(db, id, 'redo', await generateWish(toWishInput(occurrence), aiStyle, model))
}

/** Saves any edit, approves, and asks the worker to post today's approved wishes now instead of at send time. */
async function postNow(db: Db, id: string, text: string, now: Date): Promise<DraftActionResult> {
  const draft = await getDraft(db, id)
  if (!draft) return 'not_allowed'
  const { timeZone, groupId } = await getSettings(db)
  if (draft.occurrenceDate !== localDate(now, timeZone)) return 'not_today'
  if (!groupId) return 'no_group'
  if ((await getWaStatus(db)).state !== 'connected') return 'not_connected'
  const edited = text !== draft.text
  if (edited && text.length < MIN_EDIT_LENGTH) return 'too_short'
  if (edited || draft.status !== 'approved') {
    const updated = await applyDraftAction(db, id, edited ? 'edit' : 'approve', edited ? { text } : undefined)
    if (!updated) return 'not_allowed'
  }
  await requestJob(db, 'send')
  return 'ok'
}

/** The admin's website action on one draft. Every call re-checks admin rights and the draft's current status. */
export async function draftAction(
  db: Db,
  actor: Member,
  id: string,
  input: DraftInput,
  model: WishModel | null,
  now: Date = new Date()
): Promise<DraftActionResult> {
  if (!actor.isAdmin) return 'forbidden'
  if (input.action === 'post_now') return postNow(db, id, input.text.trim(), now)
  if (input.action === 'edit' && input.text.trim().length < MIN_EDIT_LENGTH) return 'too_short'
  const updated =
    input.action === 'redo'
      ? await redo(db, id, model)
      : input.action === 'edit'
        ? await applyDraftAction(db, id, 'edit', { text: input.text.trim() })
        : await applyDraftAction(db, id, input.action)
  return updated ? 'ok' : 'not_allowed'
}
