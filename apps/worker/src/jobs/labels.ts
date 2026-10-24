import { occurrenceLabel, type BatchItem } from '@family-wishes/core'
import { occurrenceForDraft, type Db, type Draft } from '@family-wishes/db'

/** The label shown to the admin for a draft, e.g. 'Birthday — Rahul (Chachu)'. */
export async function draftLabel(db: Db, draft: Draft): Promise<string> {
  const occurrence = await occurrenceForDraft(db, draft)
  return occurrence ? occurrenceLabel(occurrence) : `Wish ${draft.number}`
}

export async function toBatchItems(db: Db, drafts: Draft[]): Promise<BatchItem[]> {
  return Promise.all(
    drafts.map(async (d) => ({ number: d.number, label: await draftLabel(db, d), text: d.text, source: d.source }))
  )
}
