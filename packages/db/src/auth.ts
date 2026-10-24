import { and, count, desc, eq, gt, gte, sql } from 'drizzle-orm'
import { loginCodes, members, sessions } from './schema.ts'
import type { Db } from './client.ts'
import type { Member } from './members.ts'

export interface LoginCodeRow {
  id: string
  codeHash: string
  expiresAt: Date
  attempts: number
}

export async function countLoginCodesSince(db: Db, phone: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(loginCodes)
    .where(and(eq(loginCodes.phone, phone), gte(loginCodes.createdAt, since)))
  return row?.n ?? 0
}

export async function insertLoginCode(
  db: Db,
  code: { phone: string; codeHash: string; expiresAt: Date; createdAt: Date }
): Promise<void> {
  await db.insert(loginCodes).values(code)
}

/** The phone's most recently requested code; earlier ones are superseded. */
export async function latestLoginCode(db: Db, phone: string): Promise<LoginCodeRow | null> {
  const [row] = await db
    .select({ id: loginCodes.id, codeHash: loginCodes.codeHash, expiresAt: loginCodes.expiresAt, attempts: loginCodes.attempts })
    .from(loginCodes)
    .where(eq(loginCodes.phone, phone))
    .orderBy(desc(loginCodes.createdAt))
    .limit(1)
  return row ?? null
}

export async function countFailedLoginAttempt(db: Db, id: string): Promise<void> {
  await db.update(loginCodes).set({ attempts: sql`${loginCodes.attempts} + 1` }).where(eq(loginCodes.id, id))
}

export async function deleteLoginCodes(db: Db, phone: string): Promise<void> {
  await db.delete(loginCodes).where(eq(loginCodes.phone, phone))
}

export async function insertSession(db: Db, s: { tokenHash: string; memberId: string; expiresAt: Date }): Promise<void> {
  await db.insert(sessions).values(s)
}

/** The member behind an unexpired session hash, or null. */
export async function findMemberBySessionHash(db: Db, tokenHash: string, now: Date): Promise<Member | null> {
  const [row] = await db
    .select({ id: members.id, phone: members.phone, name: members.name, isAdmin: members.isAdmin })
    .from(sessions)
    .innerJoin(members, eq(members.id, sessions.memberId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
  return row ?? null
}

export async function deleteSessionByHash(db: Db, tokenHash: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
}
