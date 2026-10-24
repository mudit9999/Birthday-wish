import { normalizePhone } from '@family-wishes/core'
import {
  countFailedLoginAttempt,
  countLoginCodesSince,
  deleteLoginCodes,
  enqueueOutbox,
  findMemberByPhone,
  insertLoginCode,
  latestLoginCode,
  type Db
} from '@family-wishes/db'
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

const MINUTE_MS = 60_000
const CODE_TTL_MS = 10 * MINUTE_MS
const RATE_WINDOW_MS = 15 * MINUTE_MS
const MAX_REQUESTS_PER_WINDOW = 3
const MAX_ATTEMPTS = 5
const CODE_PATTERN = /^\d{6}$/

export type LoginCodeOptions = { countryCode: string; secret: string; now: Date }
export type VerifyResult = { ok: true; memberId: string } | { ok: false; reason: 'invalid' | 'expired' | 'too_many_attempts' }

export const LOGIN_CODE_TEXT = (code: string) =>
  `Your Family Wishes login code is ${code}. It expires in 10 minutes. Don't share it with anyone.`

function hashCode(secret: string, phone: string, code: string): Buffer {
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest()
}

/**
 * Queues a 6-digit code to a family member's WhatsApp.
 * Unknown numbers get the same 'sent' answer, so the form can't be used to probe who is on the list.
 */
export async function requestLoginCode(
  db: Db,
  rawPhone: string,
  opts: LoginCodeOptions
): Promise<'sent' | 'invalid_phone' | 'rate_limited'> {
  const phone = normalizePhone(rawPhone, opts.countryCode)
  if (!phone) return 'invalid_phone'
  if (!(await findMemberByPhone(db, phone))) return 'sent'
  const windowStart = new Date(opts.now.getTime() - RATE_WINDOW_MS)
  if ((await countLoginCodesSince(db, phone, windowStart)) >= MAX_REQUESTS_PER_WINDOW) return 'rate_limited'

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await insertLoginCode(db, {
    phone,
    codeHash: hashCode(opts.secret, phone, code).toString('hex'),
    expiresAt: new Date(opts.now.getTime() + CODE_TTL_MS),
    createdAt: opts.now
  })
  await enqueueOutbox(db, phone, LOGIN_CODE_TEXT(code))
  return 'sent'
}

/** Checks a code against the phone's latest request; success uses up all of the phone's codes. */
export async function verifyLoginCode(db: Db, rawPhone: string, code: string, opts: LoginCodeOptions): Promise<VerifyResult> {
  const phone = normalizePhone(rawPhone, opts.countryCode)
  const row = phone ? await latestLoginCode(db, phone) : null
  if (!phone || !row) return { ok: false, reason: 'invalid' }
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' }
  if (row.expiresAt.getTime() <= opts.now.getTime()) return { ok: false, reason: 'expired' }

  const candidate = code.trim()
  const matches =
    CODE_PATTERN.test(candidate) && timingSafeEqual(hashCode(opts.secret, phone, candidate), Buffer.from(row.codeHash, 'hex'))
  const member = matches ? await findMemberByPhone(db, phone) : null
  if (!member) {
    await countFailedLoginAttempt(db, row.id)
    return { ok: false, reason: 'invalid' }
  }
  await deleteLoginCodes(db, phone)
  return { ok: true, memberId: member.id }
}
