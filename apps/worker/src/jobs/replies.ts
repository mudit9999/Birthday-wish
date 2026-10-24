import { generateWish, parseReply, toWishInput, formatDraftBatch, type ISODate, type Reply } from '@family-wishes/core'
import {
  applyDraftAction,
  findDraftByNumber,
  getSettings,
  occurrenceForDraft,
  openDraftNumbers,
  type Draft,
  type Settings
} from '@family-wishes/db'
import type { WorkerDeps } from '../deps.ts'
import { draftLabel, toBatchItems } from './labels.ts'

const NOTHING_WAITING = 'No drafts are waiting right now.'

type Ctx = { deps: WorkerDeps; date: ISODate; settings: Settings }

async function describe(ctx: Ctx, drafts: Draft[]): Promise<string> {
  const labels = await Promise.all(drafts.map(async (d) => `${d.number}) ${await draftLabel(ctx.deps.db, d)}`))
  return labels.join(', ')
}

function unchanged(n: number): string {
  return `Draft ${n} has already been posted or closed, so nothing changed.`
}

async function approve(ctx: Ctx, numbers: number[]): Promise<string> {
  const approved: Draft[] = []
  for (const n of numbers) {
    const draft = await findDraftByNumber(ctx.deps.db, ctx.date, n)
    const updated = draft ? await applyDraftAction(ctx.deps.db, draft.id, 'approve') : null
    if (updated) approved.push(updated)
  }
  if (approved.length === 0) return numbers.length === 1 ? unchanged(numbers[0] ?? 0) : 'Those drafts were already approved.'
  return `Approved: ${await describe(ctx, approved)}. They'll be posted at ${ctx.settings.sendTime}.`
}

async function skip(ctx: Ctx, n: number): Promise<string> {
  const draft = await findDraftByNumber(ctx.deps.db, ctx.date, n)
  const updated = draft ? await applyDraftAction(ctx.deps.db, draft.id, 'skip') : null
  if (!updated) return unchanged(n)
  return `Skipped ${await describe(ctx, [updated])}. Reply "ok ${n}" to bring it back.`
}

async function redo(ctx: Ctx, n: number): Promise<string> {
  const { db, model } = ctx.deps
  const draft = await findDraftByNumber(db, ctx.date, n)
  const occurrence = draft ? await occurrenceForDraft(db, draft) : null
  if (!draft || !occurrence) return `I couldn't find what draft ${n} was for, so nothing changed.`
  const wish = await generateWish(toWishInput(occurrence), ctx.settings.aiStyle, model)
  const updated = await applyDraftAction(db, draft.id, 'redo', wish)
  if (!updated) return unchanged(n)
  return formatDraftBatch(`New draft ${n}:`, await toBatchItems(db, [updated]))
}

async function edit(ctx: Ctx, n: number, text: string): Promise<string> {
  const draft = await findDraftByNumber(ctx.deps.db, ctx.date, n)
  const updated = draft ? await applyDraftAction(ctx.deps.db, draft.id, 'edit', { text }) : null
  if (!updated) return unchanged(n)
  return `Approved your text for ${await describe(ctx, [updated])}. It'll be posted at ${ctx.settings.sendTime}.`
}

async function apply(ctx: Ctx, reply: Reply, open: number[]): Promise<string> {
  switch (reply.kind) {
    case 'invalid':
      return reply.reason
    case 'approve':
      return approve(ctx, reply.number === 'all' ? open : [reply.number])
    case 'skip':
      return skip(ctx, reply.number === 'all' ? (open[0] ?? 0) : reply.number)
    case 'redo':
      return redo(ctx, reply.number === 'all' ? (open[0] ?? 0) : reply.number)
    case 'edit':
      return edit(ctx, reply.number, reply.text)
  }
}

/** Applies one admin reply to the active batch and always answers with exactly one self-chat message. */
export async function handleAdminReply(text: string, deps: WorkerDeps): Promise<void> {
  const settings = await getSettings(deps.db)
  const date = settings.activeBatchDate
  const open = date ? await openDraftNumbers(deps.db, date) : []
  const answer = date && open.length > 0 ? await apply({ deps, date, settings }, parseReply(text, open), open) : NOTHING_WAITING
  deps.log.info({ reply: text.slice(0, 40) }, 'admin reply handled')
  await deps.messenger.sendToSelf(answer)
}
