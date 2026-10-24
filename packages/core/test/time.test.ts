import { describe, expect, test } from 'vitest'
import {
  addDays,
  formatDateLabel,
  isLeapYear,
  isTimeReached,
  localDate,
  localTime
} from '../src/time.js'

describe('time helpers', () => {
  test('local date and time use the given zone, not UTC', () => {
    const now = new Date('2026-10-24T20:00:00Z') // 01:30 on 25 Oct in India
    expect(localDate(now, 'Asia/Kolkata')).toBe('2026-10-25')
    expect(localTime(now, 'Asia/Kolkata')).toBe('01:30')
  })

  test('addDays crosses month, year and leap day', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  test('isLeapYear', () => {
    expect([2024, 2026, 2100, 2000].map(isLeapYear)).toEqual([true, false, false, true])
  })

  test('formatDateLabel', () => {
    expect(formatDateLabel('2026-10-25')).toBe('Sun 25 Oct')
  })

  test('isTimeReached', () => {
    expect(isTimeReached('08:00', '08:00')).toBe(true)
    expect(isTimeReached('07:59', '08:00')).toBe(false)
  })
})
