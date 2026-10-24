import { expect, test } from 'vitest'
import { checkAdminPassword } from '../lib/auth/admin'
import { parseWebEnv } from '../lib/env'

const PASSWORD = 'correct horse battery staple'

test('checkAdminPassword accepts only the exact password', () => {
  expect(checkAdminPassword(PASSWORD, PASSWORD)).toBe(true)
  expect(checkAdminPassword('correct horse battery stapl3', PASSWORD)).toBe(false)
  expect(checkAdminPassword('short', PASSWORD)).toBe(false)
  expect(checkAdminPassword('', PASSWORD)).toBe(false)
})

const VALID = {
  DATABASE_URL: 'pglite:memory',
  GEMINI_API_KEY: 'key',
  ADMIN_PHONE: '919800000000',
  ADMIN_PASSWORD: 'a'.repeat(16),
  SESSION_SECRET: 'b'.repeat(32)
}

test('parseWebEnv accepts a complete environment', () => {
  expect(parseWebEnv(VALID)).toMatchObject({ ...VALID, GEMINI_MODEL: 'gemini-3.5-flash-lite' })
})

test.each([
  ['ADMIN_PASSWORD', { ADMIN_PASSWORD: 'a'.repeat(15) }],
  ['SESSION_SECRET', { SESSION_SECRET: 'b'.repeat(31) }],
  ['ADMIN_PHONE', { ADMIN_PHONE: '+91 98' }],
  ['DATABASE_URL', { DATABASE_URL: '' }]
])('parseWebEnv rejects a bad %s without echoing secrets', (name, override) => {
  expect(() => parseWebEnv({ ...VALID, ...override })).toThrow(name)
  try {
    parseWebEnv({ ...VALID, ...override })
  } catch (error) {
    expect(String(error)).not.toContain('a'.repeat(15))
  }
})
