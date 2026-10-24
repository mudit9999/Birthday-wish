import type { FamilyEvent } from '@family-wishes/core'

export const EMPTY_ENTRY: Record<string, string> = {
  type: 'birthday',
  names: '',
  familyCallsThem: '',
  title: '',
  day: '',
  month: '',
  year: '',
  repeatsYearly: 'true',
  note: ''
}

/** An event as the string values the entry form edits. */
export function entryFormValues(event: FamilyEvent): Record<string, string> {
  return {
    type: event.type,
    names: event.names,
    familyCallsThem: event.familyCallsThem ?? '',
    title: event.title ?? '',
    day: String(event.day),
    month: String(event.month),
    year: event.year === null ? '' : String(event.year),
    repeatsYearly: String(event.repeatsYearly),
    note: event.note ?? ''
  }
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '25 Oct' — day and month only, never the year. */
export function dayMonthLabel(event: Pick<FamilyEvent, 'day' | 'month'>): string {
  return `${event.day} ${SHORT_MONTHS[event.month - 1] ?? ''}`
}

/** Only relative paths on this site, so a crafted `returnTo` can't redirect elsewhere. */
export function safeReturnPath(path: string | undefined, fallback: string): string {
  return path && path.startsWith('/') && !path.startsWith('//') ? path : fallback
}
