import { addDays, isLeapYear, type ISODate } from './time.js'

export type EventType = 'birthday' | 'anniversary' | 'special'

export interface FamilyEvent {
  id: string
  type: EventType
  names: string
  familyCallsThem: string | null
  title: string | null
  day: number
  month: number
  year: number | null
  repeatsYearly: boolean
  note: string | null
  archived: boolean
  addedBy: string | null
}

export interface Festival {
  id: string
  name: string
  date: ISODate
}

export type Occurrence =
  | { kind: 'event'; date: ISODate; event: FamilyEvent }
  | { kind: 'festival'; date: ISODate; festival: Festival }

const FEBRUARY = 2
const LEAP_DAY = 29

function dateParts(date: ISODate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return { year, month, day }
}

/** Whether `event` falls on `date`; a yearly 29 Feb event falls on 28 Feb in non-leap years. */
export function occursOn(event: FamilyEvent, date: ISODate): boolean {
  if (event.archived) return false
  const { year, month, day } = dateParts(date)
  if (!event.repeatsYearly && event.year !== year) return false
  if (event.month !== month) return false
  if (event.month === FEBRUARY && event.day === LEAP_DAY && !isLeapYear(year)) {
    return day === LEAP_DAY - 1
  }
  return event.day === day
}

/** Everything happening on `date`: festivals first, then events, each in input order. */
export function occurrencesOn(date: ISODate, events: FamilyEvent[], festivals: Festival[]): Occurrence[] {
  const festivalHits: Occurrence[] = festivals
    .filter((festival) => festival.date === date)
    .map((festival) => ({ kind: 'festival', date, festival }))
  const eventHits: Occurrence[] = events
    .filter((event) => occursOn(event, date))
    .map((event) => ({ kind: 'event', date, event }))
  return [...festivalHits, ...eventHits]
}

/** Occurrences from `from` (inclusive) over the next `days` days, sorted by date. */
export function upcoming(from: ISODate, days: number, events: FamilyEvent[], festivals: Festival[]): Occurrence[] {
  return Array.from({ length: days }, (_, offset) => addDays(from, offset)).flatMap((date) =>
    occurrencesOn(date, events, festivals)
  )
}

const TYPE_LABELS: Record<Exclude<EventType, 'special'>, string> = {
  birthday: 'Birthday',
  anniversary: 'Anniversary'
}

/** Human label for an occurrence, e.g. `'Birthday — Rahul (Chachu)'`. Never includes a year. */
export function occurrenceLabel(o: Occurrence): string {
  if (o.kind === 'festival') return o.festival.name
  const { event } = o
  const heading = event.type === 'special' ? (event.title ?? 'Special day') : TYPE_LABELS[event.type]
  const nickname = event.familyCallsThem ? ` (${event.familyCallsThem})` : ''
  return `${heading} — ${event.names}${nickname}`
}
