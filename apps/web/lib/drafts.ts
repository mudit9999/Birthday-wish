import {
  generateCard,
  generateWish,
  localDate,
  MIN_EDIT_LENGTH,
  toWishInput,
  type CardModel,
  type DraftStatus,
  type WishModel
} from '@family-wishes/core'
import {
  applyDraftAction,
  deleteCard,
  getDraft,
  getSettings,
  getWaStatus,
  occurrenceForDraft,
  requestJob,
  saveCard,
  type Db,
  type Draft,
  type Member
} from '@family-wishes/db'

export type DraftInput =
  | { action: 'approve' | 'skip' | 'redo' | 'card_new' | 'card_remove' }
  | { action: 'edit'; text: string }
  | { action: 'post_now'; text: string }
export type DraftActionResult =
  | 'ok'
  | 'forbidden'
  | 'not_allowed'
  | 'too_short'
  | 'not_today'
  | 'no_group'
  | 'not_connected'
  | 'card_failed'
export interface DraftModels {
  wish?: WishModel
  card?: CardModel
}

// Once a draft is posting, posted or expired, its card is what went (or would have gone) out.
const CARD_LOCKED: DraftStatus[] = ['sending', 'sent', 'expired']

async function redo(db: Db, id: string, model: WishModel | null): Promise<Draft | null> {
  const draft = await getDraft(db, id)
  const occurrence = draft ? await occurrenceForDraft(db, draft) : null
  if (!occurrence) return null
  const { aiStyle } = await getSettings(db)
  return applyDraftAction(db, id, 'redo', await generateWish(toWishInput(occurrence), aiStyle, model))
}

async function changeCard(db: Db, id: string, action: 'card_new' | 'card_remove', model: CardModel | undefined): Promise<DraftActionResult> {
  const draft = await getDraft(db, id)
  if (!draft || CARD_LOCKED.includes(draft.status)) return 'not_allowed'
  if (action === 'card_remove') {
    await deleteCard(db, id)
    return 'ok'
  }
  const occurrence = await occurrenceForDraft(db, draft)
  if (!occurrence) return 'not_allowed'
  const card = model ? await generateCard(toWishInput(occurrence), model) : null
  if (!card) return 'card_failed'
  await saveCard(db, id, card)
  return 'ok'
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
  models: DraftModels,
  now: Date = new Date()
): Promise<DraftActionResult> {
  if (!actor.isAdmin) return 'forbidden'
  if (input.action === 'post_now') return postNow(db, id, input.text.trim(), now)
  if (input.action === 'card_new' || input.action === 'card_remove') return changeCard(db, id, input.action, models.card)
  if (input.action === 'edit' && input.text.trim().length < MIN_EDIT_LENGTH) return 'too_short'
  const updated =
    input.action === 'redo'
      ? await redo(db, id, models.wish ?? null)
      : input.action === 'edit'
        ? await applyDraftAction(db, id, 'edit', { text: input.text.trim() })
        : await applyDraftAction(db, id, input.action)
  return updated ? 'ok' : 'not_allowed'
}
