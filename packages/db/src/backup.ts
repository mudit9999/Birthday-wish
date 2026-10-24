import { asc } from 'drizzle-orm'
import { events, festivals, members, settings } from './schema.ts'
import type { Db } from './client.ts'

/** Family data worth restoring. Sessions, login codes, WhatsApp keys and the outbox are deliberately left out. */
export async function exportBackup(db: Db) {
  const [memberRows, eventRows, festivalRows, settingRows] = await Promise.all([
    db.select({ id: members.id, phone: members.phone, name: members.name, isAdmin: members.isAdmin }).from(members).orderBy(asc(members.name)),
    db.select().from(events).orderBy(asc(events.month), asc(events.day)),
    db.select({ id: festivals.id, name: festivals.name, date: festivals.date }).from(festivals).orderBy(asc(festivals.date)),
    db.select({ key: settings.key, value: settings.value }).from(settings)
  ])
  return {
    exportedAt: new Date().toISOString(),
    members: memberRows,
    events: eventRows,
    festivals: festivalRows,
    settings: Object.fromEntries(settingRows.map((row) => [row.key, row.value]))
  }
}
