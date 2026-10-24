import {
  deleteSessionByHash,
  findMemberBySessionHash,
  insertSession,
  type Db,
  type Member
} from '@family-wishes/db'
import { createHash, randomBytes } from 'node:crypto'

export const SESSION_COOKIE = 'fw_session'
export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000

// Only the hash is stored, so a database leak can't be replayed as a login.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Creates a session and returns the raw token for the cookie. */
export async function createSession(db: Db, memberId: string, now: Date): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await insertSession(db, { tokenHash: hashToken(token), memberId, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
  return token
}

export async function findSessionMember(db: Db, token: string, now: Date): Promise<Member | null> {
  if (!token) return null
  return findMemberBySessionHash(db, hashToken(token), now)
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  if (token) await deleteSessionByHash(db, hashToken(token))
}
