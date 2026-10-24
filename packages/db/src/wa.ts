import { eq, inArray, sql } from 'drizzle-orm'
import { waAuth, waStatus } from './schema.ts'
import type { Db } from './client.ts'

export type WaState = 'starting' | 'qr' | 'connected' | 'reconnecting' | 'logged_out' | 'wrong_number'

export interface WaGroup {
  id: string
  name: string
}

export interface WaStatus {
  state: WaState
  qr: string | null
  groups: WaGroup[]
  linkedPhone: string | null
  updatedAt: Date
}

const STATUS_ROW_ID = 1

export async function getWaStatus(db: Db): Promise<WaStatus> {
  const [row] = await db.select().from(waStatus).where(eq(waStatus.id, STATUS_ROW_ID))
  if (!row) throw new Error('wa_status row is missing; run the migrations')
  return {
    state: row.state as WaState,
    qr: row.qr,
    groups: row.groups as WaGroup[],
    linkedPhone: row.linkedPhone,
    updatedAt: row.updatedAt ?? row.createdAt
  }
}

export async function setWaStatus(db: Db, patch: Partial<Omit<WaStatus, 'updatedAt'>>): Promise<void> {
  await db
    .update(waStatus)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(waStatus.id, STATUS_ROW_ID))
}

/** Stored auth values by key; keys with no row are absent from the map. */
export async function readWaAuth(db: Db, keys: string[]): Promise<Map<string, unknown>> {
  if (keys.length === 0) return new Map()
  const rows = await db.select({ key: waAuth.key, value: waAuth.value }).from(waAuth).where(inArray(waAuth.key, keys))
  return new Map(rows.map((row) => [row.key, row.value]))
}

export async function writeWaAuth(db: Db, entries: { key: string; value: unknown }[]): Promise<void> {
  if (entries.length === 0) return
  await db
    .insert(waAuth)
    .values(entries)
    .onConflictDoUpdate({ target: waAuth.key, set: { value: sql`excluded.value`, updatedAt: sql`now()` } })
}

export async function deleteWaAuth(db: Db, keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await db.delete(waAuth).where(inArray(waAuth.key, keys))
}

export async function clearWaAuth(db: Db): Promise<void> {
  await db.delete(waAuth)
}
