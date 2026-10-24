import { expect, test } from 'vitest'
import { createHumanMessenger, SentIds, type SocketLike } from '../src/wa/messenger.ts'

const SELF = '919800000000@s.whatsapp.net'

function fakeSocket(opts: { failSend?: boolean } = {}) {
  const calls: string[] = []
  const sock: SocketLike = {
    async sendPresenceUpdate(type, jid) {
      calls.push(`presence:${type}:${jid}`)
    },
    async sendMessage(jid, content, options) {
      calls.push(`send:${jid}:${content.text}`)
      if (opts.failSend) throw new Error('boom')
      return { key: { id: options?.messageId ?? null } }
    }
  }
  return { sock, calls }
}

test('a group send types first, then sends, then pauses, and records the id', async () => {
  const { sock, calls } = fakeSocket()
  const sentIds = new SentIds()
  const m = createHumanMessenger(sock, { selfJid: SELF, sentIds, delayMs: () => 0, newId: () => 'ID1' })
  expect(await m.sendToGroup('fam@g.us', 'Happy Diwali!')).toBe('ID1')
  expect(calls).toEqual(['presence:composing:fam@g.us', 'send:fam@g.us:Happy Diwali!', 'presence:paused:fam@g.us'])
  expect(sentIds.has('ID1')).toBe(true)
})

test('sendToSelf goes to the self JID without typing', async () => {
  const { sock, calls } = fakeSocket()
  const sentIds = new SentIds()
  const m = createHumanMessenger(sock, { selfJid: SELF, sentIds, delayMs: () => 0, newId: () => 'ID2' })
  await m.sendToSelf('Drafts for tomorrow')
  expect(calls).toEqual([`send:${SELF}:Drafts for tomorrow`])
  expect(sentIds.has('ID2')).toBe(true)
})

test('sendToPhone sends to the phone JID with typing', async () => {
  const { sock, calls } = fakeSocket()
  const m = createHumanMessenger(sock, { selfJid: SELF, sentIds: new SentIds(), delayMs: () => 0, newId: () => 'ID3' })
  await m.sendToPhone('919811111111', 'Your code is 123456')
  expect(calls[1]).toBe('send:919811111111@s.whatsapp.net:Your code is 123456')
})

test('the id is recorded before sending, so an echo can never look like an admin reply', async () => {
  const sentIds = new SentIds()
  let seenDuringSend = false
  const sock: SocketLike = {
    async sendPresenceUpdate() {},
    async sendMessage(_jid, _content, options) {
      seenDuringSend = sentIds.has(options?.messageId ?? '')
      return { key: { id: options?.messageId ?? null } }
    }
  }
  await createHumanMessenger(sock, { selfJid: SELF, sentIds, newId: () => 'ID4' }).sendToSelf('hi')
  expect(seenDuringSend).toBe(true)
})

test('a failed send still pauses typing and rethrows', async () => {
  const { sock, calls } = fakeSocket({ failSend: true })
  const m = createHumanMessenger(sock, { selfJid: SELF, sentIds: new SentIds(), delayMs: () => 0 })
  await expect(m.sendToGroup('fam@g.us', 'x')).rejects.toThrow('boom')
  expect(calls.at(-1)).toBe('presence:paused:fam@g.us')
})

test('isReady follows the option and defaults to true', () => {
  const { sock } = fakeSocket()
  expect(createHumanMessenger(sock, { selfJid: SELF, sentIds: new SentIds() }).isReady()).toBe(true)
  expect(createHumanMessenger(sock, { selfJid: SELF, sentIds: new SentIds(), isReady: () => false }).isReady()).toBe(false)
})
