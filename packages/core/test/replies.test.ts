import { expect, test } from 'vitest'
import { MIN_EDIT_LENGTH, parseReply } from '../src/replies.js'

test.each([
  ['ok', [1], { kind: 'approve', number: 1 }],
  ['OK 2', [1, 2], { kind: 'approve', number: 2 }],
  ['ok', [1, 2], { kind: 'approve', number: 'all' }],
  ['okay', [1], { kind: 'approve', number: 1 }],
  ['👍', [1], { kind: 'approve', number: 1 }],
  ['👍🏽', [1], { kind: 'approve', number: 1 }],
  ['👍 2', [1, 2], { kind: 'approve', number: 2 }],
  ['yes', [3], { kind: 'approve', number: 3 }],
  ['  Yes  ', [3], { kind: 'approve', number: 3 }],
  ['skip 2', [1, 2], { kind: 'skip', number: 2 }],
  ['skip', [7], { kind: 'skip', number: 7 }],
  ['redo', [4], { kind: 'redo', number: 4 }],
  ['Redo 1', [1, 2], { kind: 'redo', number: 1 }],
  ['2 Happy birthday Nani! Lots of love 🎂', [1, 2], { kind: 'edit', number: 2, text: 'Happy birthday Nani! Lots of love 🎂' }],
  ['2) Happy birthday Nani! Lots of love', [1, 2], { kind: 'edit', number: 2, text: 'Happy birthday Nani! Lots of love' }],
  ['Happy birthday Nani! Lots of love 🎂', [1], { kind: 'edit', number: 1, text: 'Happy birthday Nani! Lots of love 🎂' }],
  ['Happy birthday Nani!\nLots of love', [1], { kind: 'edit', number: 1, text: 'Happy birthday Nani!\nLots of love' }]
])('parseReply(%s)', (text, open, expected) => expect(parseReply(text, open)).toEqual(expected))

test.each([
  ['skip', [1, 2]],
  ['redo', [1, 2]],
  ['ok 5', [1, 2]],
  ['k', [1]],
  ['thanks', [1]],
  ['nice one', [1]],
  ['2 thanks', [1, 2]],
  ['3 Happy birthday Nani! Lots of love', [1, 2]],
  ['Happy birthday Nani! Lots of love', [1, 2]],
  ['ok', []],
  ['', [1]]
])('parseReply(%s) is invalid with a reason', (text, open) => {
  const r = parseReply(text, open)
  expect(r.kind).toBe('invalid')
  expect((r as { reason: string }).reason.length).toBeGreaterThan(0)
})

test('the short-text reason tells the admin what to send', () => {
  const r = parseReply('thanks', [1])
  expect(r).toMatchObject({ kind: 'invalid' })
  const reason = (r as { reason: string }).reason
  for (const word of ['ok', 'skip', 'redo']) expect(reason).toContain(word)
})

test('an edit exactly MIN_EDIT_LENGTH long is accepted', () => {
  const text = 'a'.repeat(MIN_EDIT_LENGTH)
  expect(parseReply(text, [1])).toEqual({ kind: 'edit', number: 1, text })
})
