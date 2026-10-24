import type { WAMessage } from 'baileys'
import { expect, test } from 'vitest'
import { extractAdminReply } from '../src/wa/incoming.ts'
import { SentIds } from '../src/wa/messenger.ts'

const PHONE_JID = '919800000000@s.whatsapp.net'
const LID_JID = '123456789012345@lid'
const selfJids = [PHONE_JID, LID_JID]

function msg(overrides: { id?: string; fromMe?: boolean; remoteJid?: string; remoteJidAlt?: string; message?: WAMessage['message'] }): WAMessage {
  return {
    key: {
      id: overrides.id ?? 'IN1',
      fromMe: overrides.fromMe ?? true,
      remoteJid: overrides.remoteJid ?? PHONE_JID,
      ...(overrides.remoteJidAlt ? { remoteJidAlt: overrides.remoteJidAlt } : {})
    },
    message: overrides.message === undefined ? { conversation: 'ok 2' } : overrides.message
  } as WAMessage
}

test('reads a fromMe message in the self chat by phone JID', () => {
  expect(extractAdminReply(msg({}), { selfJids, sentIds: new SentIds() })).toBe('ok 2')
})

test('matches the self chat by its @lid JID, including device suffixes', () => {
  expect(extractAdminReply(msg({ remoteJid: '123456789012345:12@lid' }), { selfJids, sentIds: new SentIds() })).toBe('ok 2')
  expect(
    extractAdminReply(msg({ remoteJid: 'other@lid', remoteJidAlt: PHONE_JID }), { selfJids, sentIds: new SentIds() })
  ).toBe('ok 2')
})

test('reads extendedTextMessage text', () => {
  const m = msg({ message: { extendedTextMessage: { text: '2 Happy birthday Nani!' } } })
  expect(extractAdminReply(m, { selfJids, sentIds: new SentIds() })).toBe('2 Happy birthday Nani!')
})

test('ignores the worker’s own drafts echoed back', () => {
  const sentIds = new SentIds()
  sentIds.add('DRAFT1')
  expect(extractAdminReply(msg({ id: 'DRAFT1', message: { conversation: 'Happy birthday Chachu! 🎂 Lots of love' } }), { selfJids, sentIds })).toBeNull()
})

test.each([
  ['not fromMe', msg({ fromMe: false })],
  ['another chat', msg({ remoteJid: '919811111111@s.whatsapp.net' })],
  ['a group', msg({ remoteJid: '120363000000@g.us' })],
  ['no text', msg({ message: { imageMessage: {} } })],
  ['no message', msg({ message: null })],
  ['blank text', msg({ message: { conversation: '   ' } })]
])('ignores %s', (_name, m) => {
  expect(extractAdminReply(m, { selfJids, sentIds: new SentIds() })).toBeNull()
})

test('SentIds forgets the oldest ids beyond its limit', () => {
  const ids = new SentIds(2)
  ids.add('a')
  ids.add('b')
  ids.add('c')
  expect([ids.has('a'), ids.has('b'), ids.has('c')]).toEqual([false, true, true])
})
