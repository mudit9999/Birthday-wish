'use server'

import { localDate } from '@family-wishes/core'
import { getSettings } from '@family-wishes/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb } from '../db'
import { removeEntry, saveEntry } from '../entries'
import { safeReturnPath } from '../entryForm'
import { requireMember } from '../guards'

export type EntryFormState = { errors: Record<string, string>; values: Record<string, string> }

const ENTRY_FIELDS = ['type', 'names', 'familyCallsThem', 'title', 'day', 'month', 'year', 'repeatsYearly', 'note'] as const

function readEntry(formData: FormData): Record<string, string> {
  return Object.fromEntries(ENTRY_FIELDS.map((name) => [name, String(formData.get(name) ?? '')]))
}

/** `id` is bound by the page; it is untrusted, so `saveEntry` re-checks ownership. */
export async function saveEntryAction(
  id: string | null,
  returnTo: string,
  _prev: EntryFormState,
  formData: FormData
): Promise<EntryFormState> {
  const member = await requireMember()
  const db = await getDb()
  const { timeZone } = await getSettings(db)
  const values = readEntry(formData)
  const result = await saveEntry(db, member, values, id, localDate(new Date(), timeZone))
  if (!result.ok) return { errors: result.errors, values }
  revalidatePath('/', 'layout')
  redirect(safeReturnPath(returnTo, '/entries'))
}

export async function deleteEntryAction(id: string, returnTo: string): Promise<void> {
  const member = await requireMember()
  await removeEntry(await getDb(), member, id)
  revalidatePath('/', 'layout')
  redirect(safeReturnPath(returnTo, '/entries'))
}
