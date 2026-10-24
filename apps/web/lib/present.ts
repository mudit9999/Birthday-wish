import type { ISODate, Occurrence } from '@family-wishes/core'

const DAY_MS = 24 * 60 * 60 * 1000

/** Greeting for a local 'HH:MM'; night counts as evening. */
export function greetingFor(localTime: string): string {
  const hour = Number(localTime.slice(0, 2))
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** 'today', 'tomorrow' or 'in N days' from `from` to a later `to`. */
export function relativeDay(from: ISODate, to: ISODate): string {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

const KIND_LABELS = { birthday: 'Birthday', anniversary: 'Anniversary' } as const

/** Who the occasion is for and what it is, for two-line rows. Never includes a year. */
export function occasionParts(o: Occurrence): { who: string; what: string; initial: string } {
  if (o.kind === 'festival') return { who: o.festival.name, what: 'Festival', initial: o.festival.name.charAt(0).toUpperCase() }
  const { event } = o
  const who = event.familyCallsThem ? `${event.names} (${event.familyCallsThem})` : event.names
  const what = event.type === 'special' ? (event.title ?? 'Special day') : KIND_LABELS[event.type]
  return { who, what, initial: event.names.charAt(0).toUpperCase() }
}

// Golden-angle steps keep neighbouring names far apart on the colour wheel.
const GOLDEN_ANGLE = 137

/** A pale, stable tint for a person's initial: identity, not data. */
export function personTint(name: string): string {
  const hash = [...name].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7)
  const hue = (hash * GOLDEN_ANGLE) % 360
  return `hsl(${hue} 55% 92%)`
}
