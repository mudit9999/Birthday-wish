import { createTestDb } from '@family-wishes/db/testing'
import { addMember, queryRows, type DbHandle } from '@family-wishes/db'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { LOGIN_CODE_TEXT, requestLoginCode, verifyLoginCode } from '../lib/auth/otp'

const SECRET = 'test-session-secret-that-is-long-enough-123'
const PHONE = '919811111111'
const T0 = new Date('2026-12-05T10:00:00Z')
const after = (ms: number) => new Date(T0.getTime() + ms)
const MIN = 60_000

let h: DbHandle

function opts(now = T0) {
  return { countryCode: '91', secret: SECRET, now }
}

async function rows() {
  const codes = await queryRows<{ code_hash: string; attempts: number }>(h.db, sql`select code_hash, attempts from login_codes`)
  const outbox = await queryRows<{ to_phone: string; body: string }>(h.db, sql`select to_phone, body from outbox`)
  return { codes, outbox }
}

async function sentCode(): Promise<string> {
  const { outbox } = await rows()
  const match = /\b(\d{6})\b/.exec(outbox.at(-1)?.body ?? '')
  if (!match?.[1]) throw new Error('no code in outbox')
  return match[1]
}

beforeEach(async () => {
  h = await createTestDb()
  await addMember(h.db, { phone: PHONE, name: 'Nani' })
})

afterEach(async () => {
  await h.close()
})

test('a member gets one hashed code row and one WhatsApp message with the code', async () => {
  expect(await requestLoginCode(h.db, '98111 11111', opts())).toBe('sent')
  const { codes, outbox } = await rows()
  expect(codes).toHaveLength(1)
  expect(outbox).toHaveLength(1)
  const code = await sentCode()
  expect(outbox[0]).toEqual({ to_phone: PHONE, body: LOGIN_CODE_TEXT(code) })
  expect(codes[0]?.code_hash).not.toContain(code)
  expect(codes[0]?.code_hash).toMatch(/^[0-9a-f]{64}$/)
})

test('an unknown number looks the same but nothing is stored or sent', async () => {
  expect(await requestLoginCode(h.db, '9899999999', opts())).toBe('sent')
  expect(await rows()).toEqual({ codes: [], outbox: [] })
})

test('a malformed number is rejected', async () => {
  expect(await requestLoginCode(h.db, '12345', opts())).toBe('invalid_phone')
})

test('the 4th request within 15 minutes is rate limited, and allowed again later', async () => {
  for (let i = 0; i < 3; i += 1) expect(await requestLoginCode(h.db, PHONE, opts(after(i * MIN)))).toBe('sent')
  expect(await requestLoginCode(h.db, PHONE, opts(after(3 * MIN)))).toBe('rate_limited')
  expect(await requestLoginCode(h.db, PHONE, opts(after(16 * MIN)))).toBe('sent')
})

test('the right code signs in and clears the phone’s codes', async () => {
  await requestLoginCode(h.db, PHONE, opts())
  const code = await sentCode()
  const result = await verifyLoginCode(h.db, '+91 98111 11111', code, opts(after(MIN)))
  expect(result).toMatchObject({ ok: true })
  expect((await rows()).codes).toEqual([])
})

test('a wrong code is invalid and counts an attempt', async () => {
  await requestLoginCode(h.db, PHONE, opts())
  const code = await sentCode()
  const wrong = code === '000000' ? '111111' : '000000'
  expect(await verifyLoginCode(h.db, PHONE, wrong, opts())).toEqual({ ok: false, reason: 'invalid' })
  expect((await rows()).codes[0]?.attempts).toBe(1)
  expect(await verifyLoginCode(h.db, PHONE, 'abc', opts())).toEqual({ ok: false, reason: 'invalid' })
})

test('after 5 wrong attempts even the right code is refused', async () => {
  await requestLoginCode(h.db, PHONE, opts())
  const code = await sentCode()
  const wrong = code === '000000' ? '111111' : '000000'
  for (let i = 0; i < 5; i += 1) await verifyLoginCode(h.db, PHONE, wrong, opts())
  expect(await verifyLoginCode(h.db, PHONE, code, opts())).toEqual({ ok: false, reason: 'too_many_attempts' })
})

test('a code is expired after 10 minutes', async () => {
  await requestLoginCode(h.db, PHONE, opts())
  const code = await sentCode()
  expect(await verifyLoginCode(h.db, PHONE, code, opts(after(10 * MIN + 1000)))).toEqual({ ok: false, reason: 'expired' })
})

test('verifying with no code requested is invalid', async () => {
  expect(await verifyLoginCode(h.db, PHONE, '123456', opts())).toEqual({ ok: false, reason: 'invalid' })
  expect(await verifyLoginCode(h.db, 'nonsense', '123456', opts())).toEqual({ ok: false, reason: 'invalid' })
})
