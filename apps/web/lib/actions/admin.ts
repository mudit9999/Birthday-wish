'use server'

import { revalidatePath } from 'next/cache'
import { chooseGroup, runNow } from '../admin'
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
