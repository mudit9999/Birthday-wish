import { describe, expect, test } from 'vitest'
import { greetingFor, occasionParts, personTint, relativeDay } from '../lib/present'

describe('greetingFor', () => {
  test.each([
    ['05:30', 'Good morning'],
    ['11:59', 'Good morning'],
    ['12:00', 'Good afternoon'],
    ['16:59', 'Good afternoon'],
    ['17:00', 'Good evening'],
    ['23:30', 'Good evening'],
    ['02:00', 'Good evening']
  ])('%s → %s', (time, expected) => expect(greetingFor(time)).toBe(expected))
})

describe('relativeDay', () => {
  test('today, tomorrow, then days', () => {
    expect(relativeDay('2026-10-24', '2026-10-24')).toBe('today')
    expect(relativeDay('2026-10-24', '2026-10-25')).toBe('tomorrow')
    expect(relativeDay('2026-10-24', '2026-10-26')).toBe('in 2 days')
    expect(relativeDay('2026-12-30', '2027-01-02')).toBe('in 3 days')
  })
})

describe('occasionParts', () => {
  const event = {
    id: 'e',
    names: 'Rahul',
    familyCallsThem: 'Chachu',
    title: null,
    day: 26,
    month: 10,
    year: 1958,
    repeatsYearly: true,
    note: null,
    archived: false,
    addedBy: null
  }
  test('splits who from what, never with the year', () => {
    expect(occasionParts({ kind: 'event', date: '2026-10-26', event: { ...event, type: 'birthday' } })).toEqual({
      who: 'Rahul (Chachu)',
      what: 'Birthday',
      initial: 'R'
    })
    expect(
      occasionParts({ kind: 'event', date: '2026-10-26', event: { ...event, type: 'special', title: 'Housewarming', familyCallsThem: null } })
    ).toEqual({ who: 'Rahul', what: 'Housewarming', initial: 'R' })
    expect(occasionParts({ kind: 'festival', date: '2026-11-08', festival: { id: 'f', name: 'Diwali', date: '2026-11-08' } })).toEqual({
      who: 'Diwali',
      what: 'Festival',
      initial: 'D'
    })
  })
})

describe('personTint', () => {
  test('is stable for a name and pale', () => {
    expect(personTint('Rahul')).toBe(personTint('Rahul'))
    expect(personTint('Rahul')).toMatch(/^hsl\(\d{1,3} 5\d% 9\d%\)$/)
  })
  test('spreads different names around the wheel', () => {
    const hues = ['Rahul', 'Priya', 'Nani', 'Amit'].map((n) => Number(/hsl\((\d+)/.exec(personTint(n))?.[1]))
    expect(new Set(hues).size).toBe(4)
  })
})
