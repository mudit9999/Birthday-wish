import type { FamilyEvent } from '@family-wishes/core'
import { expect, test } from 'vitest'
import { dayMonthLabel, EMPTY_ENTRY, entryFormValues, safeReturnPath } from '../lib/entryForm'

const event: FamilyEvent = {
  id: 'e1',
  type: 'special',
  names: 'Sharma family',
  familyCallsThem: null,
  title: 'Housewarming',
  day: 2,
  month: 11,
  year: 2026,
  repeatsYearly: false,
  note: null,
  archived: false,
  addedBy: 'm1'
}

test('entryFormValues turns an event into form strings', () => {
  expect(entryFormValues(event)).toEqual({
    type: 'special',
    names: 'Sharma family',
    familyCallsThem: '',
    title: 'Housewarming',
    day: '2',
    month: '11',
    year: '2026',
    repeatsYearly: 'false',
    note: ''
  })
  expect(entryFormValues({ ...event, year: null }).year).toBe('')
  expect(Object.keys(EMPTY_ENTRY).sort()).toEqual(Object.keys(entryFormValues(event)).sort())
})

test('dayMonthLabel never includes the year', () => {
  expect(dayMonthLabel(event)).toBe('2 Nov')
  expect(dayMonthLabel({ day: 29, month: 2 })).toBe('29 Feb')
})

test('safeReturnPath only allows paths on this site', () => {
  expect(safeReturnPath('/entries', '/')).toBe('/entries')
  expect(safeReturnPath('//evil.example', '/')).toBe('/')
  expect(safeReturnPath('https://evil.example', '/')).toBe('/')
  expect(safeReturnPath(undefined, '/entries')).toBe('/entries')
})
