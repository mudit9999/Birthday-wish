'use server'

import { revalidatePath } from 'next/cache'
import { addFamilyMember, chooseGroup, removeFamilyMember, removeFestival, runNow, saveFestival, saveSettings } from '../admin'
import { getDb } from '../db'
import { requireAdmin } from '../guards'

export type NoticeState = { message: string | null; error: boolean }

const RUN_NOW_MESSAGES = {
  draft: "Asked the worker to draft tomorrow's wishes. They'll arrive in your WhatsApp shortly.",
  send: 'Asked the worker to post approved wishes now.'
} as const

export async function chooseGroupAction(_prev: NoticeState, formData: FormData): Promise<NoticeState> {
  const admin = await requireAdmin()
  const result = await chooseGroup(await getDb(), admin, String(formData.get('groupId') ?? ''))
  revalidatePath('/admin')
  if (result === 'ok') return { message: 'Family group saved.', error: false }
  return { message: 'That group is not in the linked WhatsApp account. Refresh and pick again.', error: true }
}

/** `job` is bound by the page; it is re-validated here because bound arguments come from the client. */
export async function runNowAction(job: string): Promise<NoticeState> {
  const admin = await requireAdmin()
  if (job !== 'draft' && job !== 'send') return { message: 'Unknown job.', error: true }
  await runNow(await getDb(), admin, job)
  return { message: RUN_NOW_MESSAGES[job], error: false }
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '')

const MEMBER_MESSAGES = {
  ok: 'Added. They can now sign in with this number.',
  forbidden: 'Only the admin can do that.',
  invalid_phone: 'That doesn’t look like a mobile number.',
  invalid_name: 'Please enter a name (up to 60 characters).',
  duplicate: 'That number is already on the list.'
} as const

export async function addMemberAction(_prev: NoticeState, formData: FormData): Promise<NoticeState> {
  const admin = await requireAdmin()
  const result = await addFamilyMember(await getDb(), admin, { phone: field(formData, 'phone'), name: field(formData, 'name') })
  revalidatePath('/admin/members')
  return { message: MEMBER_MESSAGES[result], error: result !== 'ok' }
}

export async function removeMemberAction(id: string): Promise<void> {
  const admin = await requireAdmin()
  await removeFamilyMember(await getDb(), admin, id)
  revalidatePath('/admin/members')
}

const FESTIVAL_MESSAGES = {
  ok: 'Saved.',
  forbidden: 'Only the admin can do that.',
  invalid: 'Enter a name and a real date.',
  duplicate: 'That festival is already on that date.',
  not_found: 'That festival no longer exists.'
} as const

export async function saveFestivalAction(id: string | null, _prev: NoticeState, formData: FormData): Promise<NoticeState> {
  const admin = await requireAdmin()
  const result = await saveFestival(await getDb(), admin, id, { name: field(formData, 'name'), date: field(formData, 'date') })
  revalidatePath('/admin/festivals')
  return { message: FESTIVAL_MESSAGES[result], error: result !== 'ok' }
}

export async function deleteFestivalAction(id: string): Promise<void> {
  const admin = await requireAdmin()
  await removeFestival(await getDb(), admin, id)
  revalidatePath('/admin/festivals')
}

export type SettingsFormState = { errors: Record<string, string>; saved: boolean }

const SETTING_FIELDS = ['draft_time', 'nudge_time', 'send_time', 'time_zone', 'country_code', 'ai_style'] as const

export async function saveSettingsAction(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const admin = await requireAdmin()
  const raw = Object.fromEntries(SETTING_FIELDS.map((name) => [name, field(formData, name)]))
  const result = await saveSettings(await getDb(), admin, raw)
  revalidatePath('/admin', 'layout')
  return result.ok ? { errors: {}, saved: true } : { errors: result.errors, saved: false }
}
