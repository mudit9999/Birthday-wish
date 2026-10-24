import { z } from 'zod'
import type { EventType } from './occurrences.ts'
import type { ISODate } from './time.ts'

export interface EventInput {
  type: EventType
  names: string
  familyCallsThem: string | null
  title: string | null
  day: number
  month: number
  year: number | null
  repeatsYearly: boolean
  note: string | null
}

export type EventInputResult = { ok: true; value: EventInput } | { ok: false; errors: Record<string, string> }

const MIN_YEAR = 1900
const MAX_YEARS_AHEAD = 5
const NAMES_MAX = 100
const NICKNAME_MAX = 100
const TITLE_MAX = 100
const NOTE_MAX = 300
// Any leap year works: with no year we must allow 29 Feb.
const LEAP_REFERENCE_YEAR = 2000

function blankToNull(value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function optionalText(max: number) {
  return z.preprocess(blankToNull, z.string().max(max, `Keep this under ${max} characters`).nullable())
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 'on'
}

function daysInMonth(month: number, year: number | null): number {
  return new Date(Date.UTC(year ?? LEAP_REFERENCE_YEAR, month, 0)).getUTCDate()
}

function toIsoDate(year: number, month: number, day: number): ISODate {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function eventSchema(today: ISODate) {
  const maxYear = Number(today.slice(0, 4)) + MAX_YEARS_AHEAD
  return z
    .object({
      type: z.enum(['birthday', 'anniversary', 'special'], { error: 'Choose a type' }),
      names: z
        .string({ error: 'Please enter a name' })
        .trim()
        .min(1, 'Please enter a name')
        .max(NAMES_MAX, `Keep this under ${NAMES_MAX} characters`),
      familyCallsThem: optionalText(NICKNAME_MAX),
      title: optionalText(TITLE_MAX),
      day: z.coerce.number({ error: 'Choose a day' }).int().min(1, 'Choose a day').max(31, 'Choose a day'),
      month: z.coerce.number({ error: 'Choose a month' }).int().min(1, 'Choose a month').max(12, 'Choose a month'),
      year: z.preprocess(
        blankToNull,
        z.coerce
          .number({ error: 'Enter a valid year' })
          .int('Enter a valid year')
          .min(MIN_YEAR, `Year must be ${MIN_YEAR} or later`)
          .max(maxYear, `Year must be ${maxYear} or earlier`)
          .nullable()
      ),
      repeatsYearly: z.preprocess(toBoolean, z.boolean()),
      note: optionalText(NOTE_MAX)
    })
    .superRefine((v, ctx) => {
      if (v.type === 'special' && v.title === null) {
        ctx.addIssue({ code: 'custom', path: ['title'], message: 'Please name the occasion' })
      }
      if (v.day > daysInMonth(v.month, v.year)) {
        ctx.addIssue({ code: 'custom', path: ['day'], message: 'That day does not exist in this month' })
        return
      }
      if (v.type !== 'special' || v.repeatsYearly) return
      if (v.year === null) {
        ctx.addIssue({ code: 'custom', path: ['year'], message: 'A one-time event needs a year' })
      } else if (toIsoDate(v.year, v.month, v.day) < today) {
        ctx.addIssue({ code: 'custom', path: ['day'], message: 'That date has already passed' })
      }
    })
    .transform((v): EventInput => ({ ...v, repeatsYearly: v.type !== 'special' || v.repeatsYearly }))
}

/** Validates a raw event form/body. Errors are keyed by field name (`form` for whole-input problems). */
export function parseEventInput(raw: unknown, today: ISODate): EventInputResult {
  const result = eventSchema(today).safeParse(raw)
  if (result.success) return { ok: true, value: result.data }
  const errors = result.error.issues.reduce<Record<string, string>>((acc, issue) => {
    const field = String(issue.path[0] ?? 'form')
    return field in acc ? acc : { ...acc, [field]: issue.message }
  }, {})
  return { ok: false, errors }
}

const LOCAL_NUMBER_LENGTH = 10
const PHONE_PATTERN = /^\d{8,15}$/

function toInternational(input: string, countryCode: string): string {
  const digits = input.replace(/\D/g, '')
  if (input.startsWith('+')) return digits
  if (digits.length === LOCAL_NUMBER_LENGTH + 1 && digits.startsWith('0')) return countryCode + digits.slice(1)
  if (digits.length === LOCAL_NUMBER_LENGTH) return countryCode + digits
  return digits
}

/** International digits without `+` (e.g. `'919876543210'`), or `null` if it can't be a phone number. */
export function normalizePhone(input: string, countryCode: string): string | null {
  const phone = toInternational(input.trim(), countryCode)
  return PHONE_PATTERN.test(phone) ? phone : null
}

export function phoneToJid(phone: string): string {
  return `${phone}@s.whatsapp.net`
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** Whether `s` is a 24h `'HH:MM'` time. */
export function isValidTime(s: string): boolean {
  return TIME_PATTERN.test(s)
}

/** Whether `s` is an IANA time zone the runtime knows. */
export function isValidTimeZone(s: string): boolean {
  if (s === '') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: s })
    return true
  } catch {
    return false
  }
}
