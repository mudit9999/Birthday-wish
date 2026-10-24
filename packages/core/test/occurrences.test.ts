import { describe, expect, test } from 'vitest'
import {
  occurrenceLabel,
  occurrencesOn,
  occursOn,
  upcoming,
  type FamilyEvent,
  type Festival
} from '../src/occurrences.ts'

function ev(overrides: Partial<FamilyEvent> = {}): FamilyEvent {
  return {
    id: 'e1',
    type: 'birthday',
    names: 'Rahul',
    familyCallsThem: null,
    title: null,
    day: 25,
    month: 10,
    year: null,
    repeatsYearly: true,
    note: null,
    archived: false,
    addedBy: null,
    ...overrides
  }
}

const diwali: Festival = { id: 'f1', name: 'Diwali', date: '2026-11-08' }

describe('occursOn', () => {
  test('matches day and month for yearly events in any year', () => {
    const e = ev({ day: 25, month: 10, year: 1965 })
    expect(occursOn(e, '2026-10-25')).toBe(true)
    expect(occursOn(e, '2031-10-25')).toBe(true)
    expect(occursOn(e, '2026-10-26')).toBe(false)
    expect(occursOn(e, '2026-11-25')).toBe(false)
  })

  test('29 Feb falls on 28 Feb in non-leap years', () => {
    const e = ev({ day: 29, month: 2 })
    expect(occursOn(e, '2027-02-28')).toBe(true)
    expect(occursOn(e, '2027-03-01')).toBe(false)
    expect(occursOn(e, '2028-02-29')).toBe(true)
    expect(occursOn(e, '2028-02-28')).toBe(false)
  })

  test('one-time events occur only in their year', () => {
    const e = ev({ type: 'special', title: 'Housewarming', day: 2, month: 11, year: 2026, repeatsYearly: false })
    expect(occursOn(e, '2026-11-02')).toBe(true)
    expect(occursOn(e, '2027-11-02')).toBe(false)
  })

  test('archived events never occur', () => {
    expect(occursOn(ev({ archived: true }), '2026-10-25')).toBe(false)
  })
})

describe('occurrencesOn', () => {
  test('returns festivals first, then events, for the date', () => {
    const events = [ev({ id: 'a', day: 8, month: 11 }), ev({ id: 'b', day: 9, month: 11 })]
    const result = occurrencesOn('2026-11-08', events, [diwali])
    expect(result).toEqual([
      { kind: 'festival', date: '2026-11-08', festival: diwali },
      { kind: 'event', date: '2026-11-08', event: events[0] }
    ])
  })
})

describe('upcoming', () => {
  test('includes the start day and sorts across the year boundary', () => {
    const jan = ev({ id: 'jan', day: 2, month: 1 })
    const xmas = ev({ id: 'xmas', day: 25, month: 12 })
    const late = ev({ id: 'late', day: 10, month: 1 })
    const newYear: Festival = { id: 'ny', name: 'New Year', date: '2027-01-01' }
    const result = upcoming('2026-12-25', 10, [jan, xmas, late], [newYear])
    expect(result.map((o) => o.date)).toEqual(['2026-12-25', '2027-01-01', '2027-01-02'])
    expect(result[2]).toEqual({ kind: 'event', date: '2027-01-02', event: jan })
  })

  test('puts festivals before events on the same day', () => {
    const e = ev({ day: 8, month: 11 })
    const result = upcoming('2026-11-01', 14, [e], [diwali])
    expect(result.map((o) => o.kind)).toEqual(['festival', 'event'])
  })
})

describe('occurrenceLabel', () => {
  test('labels each kind of occurrence', () => {
    const date = '2026-10-25'
    expect(occurrenceLabel({ kind: 'event', date, event: ev({ familyCallsThem: 'Chachu' }) })).toBe(
      'Birthday — Rahul (Chachu)'
    )
    expect(occurrenceLabel({ kind: 'event', date, event: ev({ type: 'anniversary', names: 'Amit & Priya' }) })).toBe(
      'Anniversary — Amit & Priya'
    )
    expect(
      occurrenceLabel({
        kind: 'event',
        date,
        event: ev({ type: 'special', title: 'Housewarming', names: 'Sharma family' })
      })
    ).toBe('Housewarming — Sharma family')
    expect(occurrenceLabel({ kind: 'festival', date: diwali.date, festival: diwali })).toBe('Diwali')
  })

  test('never includes the year', () => {
    const label = occurrenceLabel({ kind: 'event', date: '2026-10-25', event: ev({ year: 1965 }) })
    expect(label).not.toContain('1965')
  })
})
