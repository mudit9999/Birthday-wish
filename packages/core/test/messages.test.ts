import { expect, test } from 'vitest'
import { formatDraftBatch, formatNudge, type BatchItem } from '../src/messages.ts'

const items: BatchItem[] = [
  { number: 1, label: 'Birthday — Rahul (Chachu)', text: 'Happy birthday Chachu! 🎂', source: 'ai' },
  { number: 2, label: 'Diwali', text: 'Happy Diwali to the whole family! 🪔', source: 'template' }
]

test('formatDraftBatch lists every draft with its number, label and text', () => {
  const out = formatDraftBatch('Wishes for tomorrow, Sun 25 Oct', items)
  expect(out.startsWith('Wishes for tomorrow, Sun 25 Oct')).toBe(true)
  for (const item of items) {
    expect(out).toContain(`${item.number}) ${item.label}`)
    expect(out).toContain(item.text)
  }
})

test('formatDraftBatch ends with a help line', () => {
  const lastLine = formatDraftBatch('Heading', items).trim().split('\n').at(-1) ?? ''
  for (const hint of ['ok', 'skip 2', 'redo 2', '2 <your text>']) expect(lastLine).toContain(hint)
})

test('template drafts are tagged, AI drafts are not', () => {
  const out = formatDraftBatch('Heading', items)
  expect(out).toContain('2) Diwali (template — AI unavailable)')
  expect(out).not.toContain('Chachu) (template')
})

test('formatNudge lists the pending numbers and labels', () => {
  const out = formatNudge(items)
  expect(out).toContain('1) Birthday — Rahul (Chachu)')
  expect(out).toContain('2) Diwali')
  expect(out).not.toContain(items[0]?.text ?? '')
})
