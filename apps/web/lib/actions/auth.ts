'use server'

import { ensureAdmin, getSettings } from '@family-wishes/db'
import { redirect } from 'next/navigation'
import { checkAdminPassword } from '../auth/admin'
import { requestLoginCode, verifyLoginCode } from '../auth/otp'
import { createSession, deleteSession } from '../auth/session'
import { getDb } from '../db'
import { getWebEnv } from '../env'
import { setSessionCookie, takeSessionCookie } from '../guards'

export type FormState = { error: string | null }

const WRONG_PASSWORD_DELAY_MS = 1000
const VERIFY_ERRORS = {
  invalid: "That code isn't right. Check the WhatsApp message and try again.",
  expired: 'That code has expired. Ask for a new one.',
  too_many_attempts: 'Too many wrong tries. Ask for a new code.'
} as const

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim()

async function signIn(memberId: string, to: string): Promise<never> {
  await setSessionCookie(await createSession(await getDb(), memberId, new Date()))
  redirect(to)
}

export async function requestCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const db = await getDb()
  const phone = field(formData, 'phone')
  const { countryCode } = await getSettings(db)
  const result = await requestLoginCode(db, phone, { countryCode, secret: getWebEnv().SESSION_SECRET, now: new Date() })
  if (result === 'invalid_phone') return { error: 'Please enter a valid mobile number.' }
  if (result === 'rate_limited') return { error: 'Too many codes asked for. Please wait 15 minutes and try again.' }
  redirect(`/login/verify?phone=${encodeURIComponent(phone)}`)
}

export async function verifyCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const db = await getDb()
  const { countryCode } = await getSettings(db)
  const result = await verifyLoginCode(db, field(formData, 'phone'), field(formData, 'code'), {
    countryCode,
    secret: getWebEnv().SESSION_SECRET,
    now: new Date()
  })
  if (!result.ok) return { error: VERIFY_ERRORS[result.reason] }
  return signIn(result.memberId, '/')
}

export async function adminLoginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const env = getWebEnv()
  if (!checkAdminPassword(String(formData.get('password') ?? ''), env.ADMIN_PASSWORD)) {
    await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS))
    return { error: 'Wrong password.' }
  }
  const admin = await ensureAdmin(await getDb(), env.ADMIN_PHONE)
  return signIn(admin.id, '/admin')
}

export async function signOutAction(): Promise<void> {
  await deleteSession(await getDb(), await takeSessionCookie())
  redirect('/login')
}
