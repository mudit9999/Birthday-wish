import type { DraftSource } from './draftState.js'

export interface BatchItem {
  number: number
  label: string
  text: string
  source: DraftSource
}

const TEMPLATE_TAG = ' (template — AI unavailable)'
const HELP_LINE =
  'Reply: ok (approve all) · ok 2 · skip 2 · redo 2 (new draft) · 2 <your text> (replace with your own)'

function itemHeading(item: BatchItem): string {
  const tag = item.source === 'template' ? TEMPLATE_TAG : ''
  return `${item.number}) ${item.label}${tag}`
}

/** The self-chat message presenting drafts for approval. */
export function formatDraftBatch(heading: string, items: BatchItem[]): string {
  const blocks = items.map((item) => `${itemHeading(item)}\n${item.text}`)
  return [heading, ...blocks, HELP_LINE].join('\n\n')
}

/** The morning reminder for drafts still waiting; unapproved drafts never post. */
export function formatNudge(items: BatchItem[]): string {
  const lines = items.map((item) => `${item.number}) ${item.label}`)
  return [
    "Reminder: these wishes still need your OK. They won't be posted unless you approve them.",
    lines.join('\n'),
    HELP_LINE
  ].join('\n\n')
}
