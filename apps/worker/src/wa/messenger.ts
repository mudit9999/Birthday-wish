import { phoneToJid } from '@family-wishes/core'
import { generateMessageIDV2 } from 'baileys'

/** An image to send with a message; the text becomes its caption. */
export interface OutgoingCard {
  data: Uint8Array
  mimeType: string
}

export interface Messenger {
  isReady(): boolean
  sendToGroup(groupJid: string, text: string, card?: OutgoingCard): Promise<string>
  sendToSelf(text: string): Promise<string>
  sendToPhone(phone: string, text: string): Promise<string>
}

type Content = { text: string } | { image: Buffer; caption: string; mimetype: string }

/** The slice of a Baileys socket the messenger needs. */
export interface SocketLike {
  sendPresenceUpdate(type: 'composing' | 'paused', toJid?: string): Promise<void>
  sendMessage(
    jid: string,
    content: Content,
    options?: { messageId?: string }
  ): Promise<{ key: { id?: string | null } } | undefined>
}

const DEFAULT_SENT_IDS_LIMIT = 500
const MIN_TYPING_MS = 2000
const MAX_TYPING_MS = 5000

/** Ids of messages this worker sent, so their echoes are never read as admin replies. Keeps the newest `limit`. */
export class SentIds {
  private readonly ids = new Set<string>()

  constructor(private readonly limit = DEFAULT_SENT_IDS_LIMIT) {}

  add(id: string): void {
    this.ids.add(id)
    if (this.ids.size > this.limit) {
      const [oldest] = this.ids
      if (oldest !== undefined) this.ids.delete(oldest)
    }
  }

  has(id: string): boolean {
    return this.ids.has(id)
  }
}

function randomTypingDelay(): number {
  return MIN_TYPING_MS + Math.floor(Math.random() * (MAX_TYPING_MS - MIN_TYPING_MS))
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createHumanMessenger(
  sock: SocketLike,
  opts: {
    selfJid: string
    sentIds: SentIds
    delayMs?: () => number
    newId?: () => string
    isReady?: () => boolean
  }
): Messenger {
  const delayMs = opts.delayMs ?? randomTypingDelay
  const newId = opts.newId ?? (() => generateMessageIDV2())

  async function send(jid: string, text: string, typeFirst: boolean, card?: OutgoingCard): Promise<string> {
    const messageId = newId()
    opts.sentIds.add(messageId)
    if (typeFirst) {
      await sock.sendPresenceUpdate('composing', jid)
      await sleep(delayMs())
    }
    const content: Content = card ? { image: Buffer.from(card.data), caption: text, mimetype: card.mimeType } : { text }
    try {
      const sent = await sock.sendMessage(jid, content, { messageId })
      return sent?.key.id ?? messageId
    } finally {
      if (typeFirst) await sock.sendPresenceUpdate('paused', jid).catch(() => undefined)
    }
  }

  return {
    isReady: opts.isReady ?? (() => true),
    sendToGroup: (groupJid, text, card) => send(groupJid, text, true, card),
    sendToSelf: (text) => send(opts.selfJid, text, false),
    sendToPhone: (phone, text) => send(phoneToJid(phone), text, true)
  }
}
