import { generateWish, MIN_EDIT_LENGTH, toWishInput, type WishModel } from '@family-wishes/core'
import { applyDraftAction, getDraft, getSettings, occurrenceForDraft, type Db, type Draft, type Member } from '@family-wishes/db'

export type DraftInput = { action: 'approve' | 'skip' | 'redo' } | { action: 'edit'; text: string }
export type DraftActionResult = 'ok' | 'forbidden' | 'not_allowed' | 'too_short'

async function redo(db: Db, id: string, model: WishModel | null): Promise<Draft | null> {
  const draft = await getDraft(db, id)
  const occurrence = draft ? await occurrenceForDraft(db, draft) : null
  if (!occurrence) return null
  const { aiStyle } = await getSettings(db)
  return applyDraftAction(db, id, 'redo', await generateWish(toWishInput(occurrence), aiStyle, model))
}

/** The admin's website action on one draft. Every call re-checks admin rights and the draft's current status. */
export async function draftAction(
  db: Db,
  actor: Member,
  id: string,
  input: DraftInput,
  model: WishModel | null
): Promise<DraftActionResult> {
  if (!actor.isAdmin) return 'forbidden'
  if (input.action === 'edit' && input.text.trim().length < MIN_EDIT_LENGTH) return 'too_short'
  const updated =
    input.action === 'redo'
      ? await redo(db, id, model)
      : input.action === 'edit'
        ? await applyDraftAction(db, id, 'edit', { text: input.text.trim() })
        : await applyDraftAction(db, id, input.action)
  return updated ? 'ok' : 'not_allowed'
}
