import type { ISODate } from '@family-wishes/core'
import { settings } from './schema.ts'
import type { Db } from './client.ts'

export interface Settings {
  groupId: string | null
  draftTime: string
  nudgeTime: string
  sendTime: string
  timeZone: string
  aiStyle: string
  cardImages: boolean
  countryCode: string
  activeBatchDate: ISODate | null
}

export type SettingKey =
  | 'group_id'
  | 'draft_time'
  | 'nudge_time'
  | 'send_time'
  | 'time_zone'
  | 'ai_style'
  | 'card_images'
  | 'country_code'
  | 'active_batch_date'

// Used only if a row is missing; the init migration seeds the same values.
const DEFAULTS: Record<SettingKey, string> = {
  group_id: '',
  draft_time: '20:00',
  nudge_time: '07:00',
  send_time: '08:00',
  time_zone: 'Asia/Kolkata',
  ai_style: '',
  card_images: 'on',
  country_code: '91',
  active_batch_date: ''
}

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.select({ key: settings.key, value: settings.value }).from(settings)
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]))
  const value = (key: SettingKey): string => stored[key] ?? DEFAULTS[key]
  return {
    groupId: value('group_id') || null,
    draftTime: value('draft_time'),
    nudgeTime: value('nudge_time'),
    sendTime: value('send_time'),
    timeZone: value('time_zone'),
    aiStyle: value('ai_style'),
    cardImages: value('card_images') === 'on',
    countryCode: value('country_code'),
    activeBatchDate: value('active_batch_date') || null
  }
}

export async function setSetting(db: Db, key: SettingKey, value: string): Promise<void> {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}
