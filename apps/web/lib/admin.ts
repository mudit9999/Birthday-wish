import { isValidTime, isValidTimeZone, normalizePhone } from '@family-wishes/core'
import {
  addMember,
  createFestival,
  deleteFestival,
  getSettings,
  getWaStatus,
  removeMember,
  requestJob,
  setSetting,
  updateFestival,
  type Db,
  type Member,
  type RequestedJob,
  type SettingKey
} from '@family-wishes/db'
import { z } from 'zod'

const NAME_MAX = 60
const AI_STYLE_MAX = 1000
const FORBIDDEN_FORM = { ok: false as const, errors: { form: 'Only the admin can change settings.' } }

/** Saves the family group; only a group the linked WhatsApp account is actually in can be chosen. */
export async function chooseGroup(db: Db, actor: Member, groupId: string): Promise<'ok' | 'forbidden' | 'unknown_group'> {
  if (!actor.isAdmin) return 'forbidden'
  const { groups } = await getWaStatus(db)
  if (!groups.some((group) => group.id === groupId)) return 'unknown_group'
  await setSetting(db, 'group_id', groupId)
  return 'ok'
}

/** Asks the worker to draft tomorrow's wishes or post approved ones now. */
export async function runNow(db: Db, actor: Member, job: RequestedJob): Promise<'ok' | 'forbidden'> {
  if (!actor.isAdmin) return 'forbidden'
  await requestJob(db, job)
  return 'ok'
}

export async function addFamilyMember(
  db: Db,
  actor: Member,
  input: { phone: string; name: string }
): Promise<'ok' | 'forbidden' | 'invalid_phone' | 'invalid_name' | 'duplicate'> {
  if (!actor.isAdmin) return 'forbidden'
  const name = input.name.trim()
  if (name.length === 0 || name.length > NAME_MAX) return 'invalid_name'
  const phone = normalizePhone(input.phone, (await getSettings(db)).countryCode)
  if (!phone) return 'invalid_phone'
  return (await addMember(db, { phone, name })) === 'duplicate' ? 'duplicate' : 'ok'
}

export async function removeFamilyMember(db: Db, actor: Member, id: string): Promise<'ok' | 'forbidden' | 'is_self' | 'is_admin'> {
  if (!actor.isAdmin) return 'forbidden'
  if (actor.id === id) return 'is_self'
  return removeMember(db, id)
}

function isRealDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date)
}

export async function saveFestival(
  db: Db,
  actor: Member,
  id: string | null,
  input: { name: string; date: string }
): Promise<'ok' | 'forbidden' | 'invalid' | 'duplicate' | 'not_found'> {
  if (!actor.isAdmin) return 'forbidden'
  const name = input.name.trim()
  if (name.length === 0 || name.length > NAME_MAX || !isRealDate(input.date)) return 'invalid'
  if (id === null) return (await createFestival(db, { name, date: input.date })) === 'duplicate' ? 'duplicate' : 'ok'
  return updateFestival(db, id, { name, date: input.date })
}

export async function removeFestival(db: Db, actor: Member, id: string): Promise<'ok' | 'forbidden' | 'not_found'> {
  if (!actor.isAdmin) return 'forbidden'
  return deleteFestival(db, id)
}

const time = z.string().trim().refine(isValidTime, 'Use 24-hour HH:MM, e.g. 20:00')
const settingsSchema = z.object({
  draft_time: time,
  nudge_time: time,
  send_time: time,
  time_zone: z.string().trim().refine(isValidTimeZone, 'Use a time zone such as Asia/Kolkata'),
  country_code: z.string().trim().regex(/^\d{1,3}$/, 'Use 1–3 digits, e.g. 91'),
  ai_style: z.string().trim().min(1, 'Describe the style in a few words').max(AI_STYLE_MAX, `Keep this under ${AI_STYLE_MAX} characters`),
  // An unticked checkbox sends nothing, which means off.
  card_images: z.preprocess((v) => (v === 'on' ? 'on' : 'off'), z.enum(['on', 'off']))
})

export type SettingsResult = { ok: true } | { ok: false; errors: Record<string, string> }

export async function saveSettings(db: Db, actor: Member, raw: unknown): Promise<SettingsResult> {
  if (!actor.isAdmin) return FORBIDDEN_FORM
  const parsed = settingsSchema.safeParse(raw)
  if (!parsed.success) {
    const errors = parsed.error.issues.reduce<Record<string, string>>((acc, issue) => {
      const field = String(issue.path[0] ?? 'form')
      return field in acc ? acc : { ...acc, [field]: issue.message }
    }, {})
    return { ok: false, errors }
  }
  for (const [key, value] of Object.entries(parsed.data) as [SettingKey, string][]) {
    await setSetting(db, key, value)
  }
  return { ok: true }
}
