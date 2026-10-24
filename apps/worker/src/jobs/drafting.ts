import {
  formatDateLabel,
  formatDraftBatch,
  generateCard,
  generateWish,
  occurrencesOn,
  toWishInput,
  type ISODate,
  type Occurrence
} from '@family-wishes/core'
import {
  getSettings,
  insertDraftIfMissing,
  listDraftsForDates,
  listEvents,
  listFestivals,
  markNotified,
  saveCard,
  setSetting,
  unnotifiedDrafts,
  type Draft
} from '@family-wishes/db'
import type { WorkerDeps } from '../deps.ts'
import { toBatchItems } from './labels.ts'

function occasionId(o: Occurrence): string {
  return o.kind === 'event' ? o.event.id : o.festival.id
}

function occasionRef(o: Occurrence): { eventId: string } | { festivalId: string } {
  return o.kind === 'event' ? { eventId: o.event.id } : { festivalId: o.festival.id }
}

// A missing card never blocks the wish: it simply posts as text.
async function addCard(draft: Draft, o: Occurrence, deps: WorkerDeps): Promise<void> {
  if (!deps.cardModel) return
  try {
    const card = await generateCard(toWishInput(o), deps.cardModel)
    if (card) await saveCard(deps.db, draft.id, card)
    else deps.log.warn({ draft: draft.number }, 'greeting card could not be made; the wish will post as text')
  } catch (error) {
    deps.log.error({ err: error, draft: draft.number }, 'saving greeting card failed')
  }
}

async function createMissingDrafts(date: ISODate, deps: WorkerDeps): Promise<Draft[]> {
  const { db } = deps
  const settings = await getSettings(db)
  const events = await listEvents(db)
  const festivals = await listFestivals(db, { from: date, to: date })
  const drafted = new Set((await listDraftsForDates(db, [date])).map((d) => d.eventId ?? d.festivalId))
  const missing = occurrencesOn(date, events, festivals).filter((o) => !drafted.has(occasionId(o)))

  const created: Draft[] = []
  // One at a time so draft numbers follow the occurrence order.
  for (const o of missing) {
    const wish = await generateWish(toWishInput(o), settings.aiStyle, deps.model)
    const draft = await insertDraftIfMissing(db, { occurrenceDate: date, ...occasionRef(o), ...wish })
    if (!draft) continue
    created.push(draft)
    if (settings.cardImages) await addCard(draft, o, deps)
  }
  return created
}

async function notifyAdmin(date: ISODate, deps: WorkerDeps): Promise<void> {
  if (!deps.messenger.isReady()) return
  const pending = await unnotifiedDrafts(deps.db, date)
  if (pending.length === 0) return
  const items = await toBatchItems(deps.db, pending)
  await deps.messenger.sendToSelf(formatDraftBatch(`Wishes for ${formatDateLabel(date)} — please check:`, items))
  await markNotified(deps.db, pending.map((d) => d.id))
  await setSetting(deps.db, 'active_batch_date', date)
}

/**
 * Makes sure every occasion on `date` has a draft and that the admin has been sent all pending ones.
 * Safe to call repeatedly; returns only the drafts created by this call.
 */
export async function ensureDraftsFor(date: ISODate, deps: WorkerDeps): Promise<Draft[]> {
  const created = await createMissingDrafts(date, deps)
  if (created.length > 0) deps.log.info({ date, count: created.length }, 'drafted wishes')
  await notifyAdmin(date, deps)
  return created
}
