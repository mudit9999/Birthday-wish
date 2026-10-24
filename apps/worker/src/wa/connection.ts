import { setWaStatus, type Db } from '@family-wishes/db'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  type ConnectionState,
  type WASocket
} from 'baileys'
import type { Logger } from 'pino'
import { useDbAuthState } from './authState.js'
import { extractAdminReply } from './incoming.js'
import { createHumanMessenger, SentIds, type Messenger } from './messenger.js'

const BACKOFF_START_MS = 1000
const BACKOFF_MAX_MS = 60_000

type AuthState = Awaited<ReturnType<typeof useDbAuthState>>

export interface ConnectionDeps {
  db: Db
  adminPhone: string
  log: Logger
  onReply: (text: string) => Promise<void>
}

function phoneOf(jid: string | undefined): string {
  return jidNormalizedUser(jid).split('@')[0] ?? ''
}

function disconnectCode(update: Partial<ConnectionState>): number | undefined {
  return (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode
}

/** Keeps one WhatsApp socket alive (QR, reconnects, logout) and exposes a messenger that follows it. */
export async function startConnection(deps: ConnectionDeps): Promise<{ messenger: Messenger; stop(): Promise<void> }> {
  const { db, adminPhone, log } = deps
  const sentIds = new SentIds()
  let sock: WASocket | null = null
  let current: Messenger | null = null
  let ready = false
  let stopped = false
  let attempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  function selfJidsOf(s: WASocket): string[] {
    return [s.user?.id, s.user?.lid].filter((jid): jid is string => Boolean(jid)).map(jidNormalizedUser)
  }

  function scheduleReconnect(delayMs: number): void {
    if (stopped) return
    retryTimer = setTimeout(() => {
      connect().catch((error: unknown) => {
        log.error({ err: error }, 'reconnect failed')
        scheduleReconnect(Math.min(BACKOFF_START_MS * 2 ** attempt++, BACKOFF_MAX_MS))
      })
    }, delayMs)
  }

  async function onOpen(s: WASocket): Promise<void> {
    const linkedPhone = phoneOf(s.user?.id)
    if (linkedPhone !== adminPhone) {
      log.error({ linkedPhone }, 'linked WhatsApp number is not ADMIN_PHONE; refusing to send')
      await setWaStatus(db, { state: 'wrong_number', qr: null, linkedPhone })
      return
    }
    const groups = Object.values(await s.groupFetchAllParticipating()).map((g) => ({ id: g.id, name: g.subject }))
    current = createHumanMessenger(s, { selfJid: jidNormalizedUser(s.user?.id), sentIds })
    ready = true
    attempt = 0
    await setWaStatus(db, { state: 'connected', qr: null, linkedPhone, groups })
    log.info({ groups: groups.length }, 'WhatsApp connected')
  }

  async function onClose(update: Partial<ConnectionState>, auth: AuthState): Promise<void> {
    ready = false
    current = null
    if (stopped) return
    if (disconnectCode(update) === DisconnectReason.loggedOut) {
      log.warn('WhatsApp logged out; clearing session and waiting for a new QR scan')
      await auth.clear()
      await setWaStatus(db, { state: 'logged_out', qr: null, linkedPhone: null, groups: [] })
      scheduleReconnect(0)
      return
    }
    await setWaStatus(db, { state: 'reconnecting' })
    scheduleReconnect(Math.min(BACKOFF_START_MS * 2 ** attempt++, BACKOFF_MAX_MS))
  }

  async function onUpdate(s: WASocket, auth: AuthState, update: Partial<ConnectionState>): Promise<void> {
    if (update.qr) await setWaStatus(db, { state: 'qr', qr: update.qr })
    if (update.connection === 'open') await onOpen(s)
    if (update.connection === 'close') await onClose(update, auth)
  }

  async function connect(): Promise<void> {
    const auth = await useDbAuthState(db)
    const baileysLog = log.child({ module: 'baileys' }, { level: 'warn' })
    const s = makeWASocket({
      auth: { creds: auth.state.creds, keys: makeCacheableSignalKeyStore(auth.state.keys, baileysLog) },
      logger: baileysLog,
      browser: Browsers.ubuntu('Family Wishes'),
      markOnlineOnConnect: false
    })
    sock = s
    s.ev.on('creds.update', () => {
      auth.saveCreds().catch((error: unknown) => log.error({ err: error }, 'saving WhatsApp creds failed'))
    })
    s.ev.on('connection.update', (update) => {
      onUpdate(s, auth, update).catch((error: unknown) => log.error({ err: error }, 'connection update failed'))
    })
    s.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return
      for (const m of messages) {
        const text = extractAdminReply(m, { selfJids: selfJidsOf(s), sentIds })
        if (text) deps.onReply(text).catch((error: unknown) => log.error({ err: error }, 'handling admin reply failed'))
      }
    })
  }

  function active(): Messenger {
    if (!ready || !current) throw new Error('WhatsApp is not connected')
    return current
  }

  await setWaStatus(db, { state: 'starting' })
  await connect()

  return {
    messenger: {
      isReady: () => ready,
      sendToGroup: (jid, text) => active().sendToGroup(jid, text),
      sendToSelf: (text) => active().sendToSelf(text),
      sendToPhone: (phone, text) => active().sendToPhone(phone, text)
    },
    async stop() {
      stopped = true
      clearTimeout(retryTimer)
      sock?.end(undefined)
    }
  }
}
