import 'server-only'
import type { Member } from '@family-wishes/db'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { SESSION_COOKIE, SESSION_TTL_MS, findSessionMember } from './auth/session'
import { getDb } from './db'

/** The signed-in member for this request, or null. Cached so layout and page share one lookup. */
export const getCurrentMember = cache(async (): Promise<Member | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? ''
  return findSessionMember(await getDb(), token, new Date())
})

export async function requireMember(): Promise<Member> {
  const member = await getCurrentMember()
  if (!member) redirect('/login')
  return member
}

export async function requireAdmin(): Promise<Member> {
  const member = await requireMember()
  if (!member.isAdmin) redirect('/')
  return member
}

export async function setSessionCookie(token: string): Promise<void> {
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000)
  })
}

export async function takeSessionCookie(): Promise<string> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value ?? ''
  store.delete(SESSION_COOKIE)
  return token
}
