import { describe, expect, test } from 'vitest'
import {
  isValidTime,
  isValidTimeZone,
  normalizePhone,
  parseEventInput,
  phoneToJid
} from '../src/validation.js'

const TODAY = '2026-10-24'

function raw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'birthday',
    names: 'Rahul',
    familyCallsThem: '',
    title: '',
    day: 25,
    month: 10,
    year: null,
    repeatsYearly: true,
    note: '',
    ...overrides
  }
}

function errorsOf(input: Record<string, unknown>): Record<string, string> {
  const result = parseEventInput(input, TODAY)
  if (result.ok) throw new Error('expected a validation failure')
  return result.errors
}

describe('parseEventInput rejects', () => {
  test.each([
    ['30 Feb', { day: 30, month: 2 }, 'day'],
    ['31 Apr', { day: 31, month: 4 }, 'day'],
    ['29 Feb in a non-leap year', { day: 29, month: 2, year: 2027 }, 'day'],
    ['empty names', { names: '   ' }, 'names'],
    ['names over 100 characters', { names: 'a'.repeat(101) }, 'names'],
    ['note over 300 characters', { note: 'a'.repeat(301) }, 'note'],
    ['year before 1900', { year: 1899 }, 'year'],
    ['year after current year + 5', { year: 2032 }, 'year'],
    ['special without a title', { type: 'special', title: '' }, 'title'],
    ['one-time event without a year', { type: 'special', title: 'Party', repeatsYearly: false }, 'year'],
    [
      'one-time event before today',
      { type: 'special', title: 'Party', repeatsYearly: false, day: 23, month: 10, year: 2026 },
      'day'
    ]
  ])('%s', (_name, overrides, field) => {
    expect(errorsOf(raw(overrides))).toHaveProperty(field)
  })
})

describe('parseEventInput accepts', () => {
  test('29 Feb with no year', () => {
    const result = parseEventInput(raw({ day: 29, month: 2 }), TODAY)
    expect(result.ok).toBe(true)
  })

  test('year at the upper bound', () => {
    expect(parseEventInput(raw({ year: 2031 }), TODAY).ok).toBe(true)
  })

  test('forces repeatsYearly for birthdays and anniversaries', () => {
    for (const type of ['birthday', 'anniversary']) {
      const result = parseEventInput(raw({ type, repeatsYearly: false }), TODAY)
      expect(result).toMatchObject({ ok: true, value: { repeatsYearly: true } })
    }
  })

  test('trims strings and turns empty optionals into null', () => {
    const result = parseEventInput(
      raw({ names: '  Amit & Priya ', familyCallsThem: '  ', note: ' Loves sweets ', type: 'anniversary' }),
      TODAY
    )
    expect(result).toEqual({
      ok: true,
      value: {
        type: 'anniversary',
        names: 'Amit & Priya',
        familyCallsThem: null,
        title: null,
        day: 25,
        month: 10,
        year: null,
        repeatsYearly: true,
        note: 'Loves sweets'
      }
    })
  })

  test('accepts form-style string values', () => {
    const result = parseEventInput(
      raw({ type: 'special', title: 'Housewarming', day: '2', month: '11', year: '2026', repeatsYearly: 'false' }),
      TODAY
    )
    expect(result).toMatchObject({ ok: true, value: { day: 2, month: 11, year: 2026, repeatsYearly: false } })
  })

  test('a one-time event today is allowed', () => {
    const result = parseEventInput(
      raw({ type: 'special', title: 'Party', repeatsYearly: false, day: 24, month: 10, year: 2026 }),
      TODAY
    )
    expect(result.ok).toBe(true)
  })
})

test('rejects input that is not an object', () => {
  expect(parseEventInput('nope', TODAY).ok).toBe(false)
})

describe('normalizePhone', () => {
  test.each(['+91 98765 43210', '098765-43210', '9876543210'])('%s → 919876543210', (input) => {
    expect(normalizePhone(input, '91')).toBe('919876543210')
  })

  test('keeps an international number as-is', () => {
    expect(normalizePhone('+44 7700 900123', '91')).toBe('447700900123')
  })

  test.each(['12345', 'abc', '', '+1234567890123456'])('%s → null', (input) => {
    expect(normalizePhone(input, '91')).toBeNull()
  })
})

test('phoneToJid', () => {
  expect(phoneToJid('919876543210')).toBe('919876543210@s.whatsapp.net')
})

test('isValidTime', () => {
  expect(isValidTime('20:00')).toBe(true)
  expect(isValidTime('00:00')).toBe(true)
  expect(isValidTime('23:59')).toBe(true)
  expect(isValidTime('24:00')).toBe(false)
  expect(isValidTime('8:00')).toBe(false)
  expect(isValidTime('12:60')).toBe(false)
})

test('isValidTimeZone', () => {
  expect(isValidTimeZone('Asia/Kolkata')).toBe(true)
  expect(isValidTimeZone('Mars/Base')).toBe(false)
  expect(isValidTimeZone('')).toBe(false)
})
