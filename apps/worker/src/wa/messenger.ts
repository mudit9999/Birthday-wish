import { phoneToJid } from '@family-wishes/core'
import { generateMessageIDV2 } from 'baileys'

export interface Messenger {
  isReady(): boolean
  sendToGroup(groupJid: string, text: string): Promise<string>
  sendToSelf(text: string): Promise<string>
  sendToPhone(phone: string, text: string): Promise<string>
}

/** The slice of a Baileys socket the messenger needs. */
export interface SocketLike {
  sendPresenceUpdate(type: 'composing' | 'paused', toJid?: string): Promise<void>
  sendMessage(
    jid: string,
    content: { text: string },
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

  async function send(jid: string, text: string, typeFirst: boolean): Promise<string> {
    const messageId = newId()
    opts.sentIds.add(messageId)
    if (typeFirst) {
      await sock.sendPresenceUpdate('composing', jid)
      await sleep(delayMs())
    }
    try {
      const sent = await sock.sendMessage(jid, { text }, { messageId })
      return sent?.key.id ?? messageId
    } finally {
      if (typeFirst) await sock.sendPresenceUpdate('paused', jid).catch(() => undefined)
    }
  }

  return {
    isReady: opts.isReady ?? (() => true),
    sendToGroup: (groupJid, text) => send(groupJid, text, true),
    sendToSelf: (text) => send(opts.selfJid, text, false),
    sendToPhone: (phone, text) => send(phoneToJid(phone), text, true)
  }
}
