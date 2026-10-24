'use server'

import { createGeminiCardModel, createGeminiModel, MIN_EDIT_LENGTH } from '@family-wishes/core'
import { revalidatePath } from 'next/cache'
import { getDb } from '../db'
import { draftAction, type DraftInput, type DraftModels } from '../drafts'
import { getWebEnv } from '../env'
import { requireAdmin } from '../guards'
import type { NoticeState } from './admin'

const MESSAGES = {
  ok: {
    approve: 'Approved.',
    skip: 'Skipped.',
    redo: 'New draft written.',
    edit: 'Your text is saved and approved.',
    post_now: 'Approved. It will be in the group within a few seconds.',
    card_new: 'New card made.',
    card_remove: 'Card removed. This wish will post as text.'
  },
  forbidden: 'Only the admin can do that.',
  not_allowed: 'This draft has already been posted or closed, so nothing changed.',
  too_short: `That's too short to be a wish (at least ${MIN_EDIT_LENGTH} characters).`,
  not_today: 'Only today’s wishes can be posted now. This one posts on its own day.',
  no_group: 'Choose the family group on the WhatsApp page first.',
  not_connected: 'WhatsApp isn’t connected right now, so nothing was posted. Check the WhatsApp page.',
  card_failed: 'Gemini couldn’t make a card just now, so nothing changed. Try again in a minute.'
} as const

const SIMPLE_INTENTS = ['approve', 'skip', 'redo', 'card_new', 'card_remove'] as const

function readInput(formData: FormData): DraftInput | null {
  const intent = String(formData.get('intent') ?? '')
  const text = String(formData.get('text') ?? '')
  if (intent === 'edit' || intent === 'post_now') return { action: intent, text }
  const simple = SIMPLE_INTENTS.find((known) => known === intent)
  return simple ? { action: simple } : null
}

function modelsFor(input: DraftInput): DraftModels {
  const env = getWebEnv()
  if (input.action === 'redo') return { wish: createGeminiModel({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }) }
  if (input.action === 'card_new') return { card: createGeminiCardModel({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_IMAGE_MODEL }) }
  return {}
}

/** `id` is bound by the page and untrusted; `draftAction` re-checks admin rights and the draft's status. */
export async function draftFormAction(id: string, _prev: NoticeState, formData: FormData): Promise<NoticeState> {
  const admin = await requireAdmin()
  const input = readInput(formData)
  if (!input) return { message: 'Unknown action.', error: true }
  const result = await draftAction(await getDb(), admin, id, input, modelsFor(input))
  revalidatePath('/admin/drafts')
  if (result === 'ok') return { message: MESSAGES.ok[input.action], error: false }
  return { message: MESSAGES[result], error: true }
}
