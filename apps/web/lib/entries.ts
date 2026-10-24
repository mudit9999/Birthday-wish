import { parseEventInput, type ISODate } from '@family-wishes/core'
import { createEvent, deleteEvent, updateEvent, type Db, type Member } from '@family-wishes/db'

export type SaveResult = { ok: true } | { ok: false; errors: Record<string, string> }

const FORM_ERRORS = {
  forbidden: 'You can only change entries you added.',
  not_found: 'That entry no longer exists.'
} as const

/** Creates (id null) or updates an entry. Ownership is checked in the database update, not trusted from the page. */
export async function saveEntry(db: Db, actor: Member, raw: unknown, id: string | null, today: ISODate): Promise<SaveResult> {
  const parsed = parseEventInput(raw, today)
  if (!parsed.ok) return parsed
  if (id === null) {
    await createEvent(db, parsed.value, actor.id)
    return { ok: true }
  }
  const result = await updateEvent(db, id, parsed.value, actor)
  return result === 'ok' ? { ok: true } : { ok: false, errors: { form: FORM_ERRORS[result] } }
}

export async function removeEntry(db: Db, actor: Member, id: string): Promise<'ok' | 'forbidden' | 'not_found'> {
  return deleteEvent(db, id, actor)
}
