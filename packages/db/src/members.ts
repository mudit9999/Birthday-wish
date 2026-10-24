import { and, asc, eq } from 'drizzle-orm'
import { members } from './schema.ts'
import type { Db } from './client.ts'

export interface Member {
  id: string
  phone: string
  name: string
  isAdmin: boolean
}

const MEMBER_COLUMNS = { id: members.id, phone: members.phone, name: members.name, isAdmin: members.isAdmin }

export async function findMemberByPhone(db: Db, phone: string): Promise<Member | null> {
  const [row] = await db.select(MEMBER_COLUMNS).from(members).where(eq(members.phone, phone))
  return row ?? null
}

export async function getMember(db: Db, id: string): Promise<Member | null> {
  const [row] = await db.select(MEMBER_COLUMNS).from(members).where(eq(members.id, id))
  return row ?? null
}

export async function listMembers(db: Db): Promise<Member[]> {
  return db.select(MEMBER_COLUMNS).from(members).orderBy(asc(members.name))
}

export async function addMember(db: Db, m: { phone: string; name: string }): Promise<Member | 'duplicate'> {
  const [row] = await db
    .insert(members)
    .values({ phone: m.phone, name: m.name })
    .onConflictDoNothing({ target: members.phone })
    .returning(MEMBER_COLUMNS)
  return row ?? 'duplicate'
}

/** Admins can't be removed from the site, so the family can never lock itself out. */
export async function removeMember(db: Db, id: string): Promise<'ok' | 'is_admin'> {
  const deleted = await db
    .delete(members)
    .where(and(eq(members.id, id), eq(members.isAdmin, false)))
    .returning({ id: members.id })
  if (deleted.length > 0) return 'ok'
  return (await getMember(db, id))?.isAdmin ? 'is_admin' : 'ok'
}

/** Makes `phone` an admin, creating the member as 'Admin' if new. */
export async function ensureAdmin(db: Db, phone: string): Promise<Member> {
  const [row] = await db
    .insert(members)
    .values({ phone, name: 'Admin', isAdmin: true })
    .onConflictDoUpdate({ target: members.phone, set: { isAdmin: true } })
    .returning(MEMBER_COLUMNS)
  if (!row) throw new Error('ensureAdmin returned no row')
  return row
}
