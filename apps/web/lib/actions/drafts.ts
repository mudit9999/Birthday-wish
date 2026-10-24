'use server'

import { createGeminiModel, MIN_EDIT_LENGTH } from '@family-wishes/core'
import { revalidatePath } from 'next/cache'
import { getDb } from '../db'
import { draftAction, type DraftInput } from '../drafts'
import { getWebEnv } from '../env'
import { requireAdmin } from '../guards'
import type { NoticeState } from './admin'

const MESSAGES = {
  ok: { approve: 'Approved.', skip: 'Skipped.', redo: 'New draft written.', edit: 'Your text is saved and approved.' },
  forbidden: 'Only the admin can do that.',
  not_allowed: 'This draft has already been posted or closed, so nothing changed.',
  too_short: `That's too short to be a wish (at least ${MIN_EDIT_LENGTH} characters).`
} as const

function readInput(formData: FormData): DraftInput | null {
  const intent = String(formData.get('intent') ?? '')
  if (intent === 'edit') return { action: 'edit', text: String(formData.get('text') ?? '') }
  if (intent === 'approve' || intent === 'skip' || intent === 'redo') return { action: intent }
  return null
}

/** `id` is bound by the page and untrusted; `draftAction` re-checks admin rights and the draft's status. */
export async function draftFormAction(id: string, _prev: NoticeState, formData: FormData): Promise<NoticeState> {
  const admin = await requireAdmin()
  const input = readInput(formData)
  if (!input) return { message: 'Unknown action.', error: true }
  const env = getWebEnv()
  const model = input.action === 'redo' ? createGeminiModel({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }) : null
  const result = await draftAction(await getDb(), admin, id, input, model)
  revalidatePath('/admin/drafts')
  if (result === 'ok') return { message: MESSAGES.ok[input.action], error: false }
  return { message: MESSAGES[result], error: true }
}
