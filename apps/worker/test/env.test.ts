import { DEFAULT_GEMINI_MODEL } from '@family-wishes/core'
import { expect, test } from 'vitest'
import { loadWorkerEnv } from '../src/env.ts'

const VALID = {
  DATABASE_URL: 'postgres://user:pass@db.example.com:6543/postgres',
  ADMIN_PHONE: '919800000000',
  GEMINI_API_KEY: 'test-key'
}

test('applies defaults', () => {
  expect(loadWorkerEnv(VALID)).toEqual({
    ...VALID,
    GEMINI_MODEL: DEFAULT_GEMINI_MODEL,
    BACKUP_DIR: '/data/backups',
    LOG_LEVEL: 'info'
  })
})

test('blank optional values fall back to defaults', () => {
  expect(loadWorkerEnv({ ...VALID, GEMINI_MODEL: '', LOG_LEVEL: '' })).toMatchObject({
    GEMINI_MODEL: DEFAULT_GEMINI_MODEL,
    LOG_LEVEL: 'info'
  })
})

test('a missing DATABASE_URL names the variable', () => {
  const { DATABASE_URL: _omit, ...rest } = VALID
  expect(() => loadWorkerEnv(rest)).toThrow(/DATABASE_URL/)
})

test('ADMIN_PHONE must be international digits', () => {
  expect(() => loadWorkerEnv({ ...VALID, ADMIN_PHONE: '+91 98765 43210' })).toThrow(/ADMIN_PHONE/)
})

test('error messages never echo secret values', () => {
  try {
    loadWorkerEnv({ ...VALID, ADMIN_PHONE: 'x', LOG_LEVEL: 'loud' })
    expect.unreachable()
  } catch (error) {
    expect(String(error)).not.toContain('test-key')
    expect(String(error)).not.toContain('pass@')
  }
})
