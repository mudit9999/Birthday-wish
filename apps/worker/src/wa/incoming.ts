import { jidNormalizedUser, type WAMessage } from 'baileys'
import type { SentIds } from './messenger.ts'

/**
 * The admin's reply text if `msg` is something they typed in their own "Message yourself" chat, else null.
 * The worker's own drafts arrive in that chat too and are skipped by id.
 */
export function extractAdminReply(msg: WAMessage, ctx: { selfJids: string[]; sentIds: SentIds }): string | null {
  const { key, message } = msg
  if (!key.fromMe || !key.id || ctx.sentIds.has(key.id)) return null
  const chatJids = [key.remoteJid, key.remoteJidAlt].filter((jid): jid is string => Boolean(jid)).map(jidNormalizedUser)
  if (!chatJids.some((jid) => ctx.selfJids.includes(jid))) return null
  const text = message?.conversation ?? message?.extendedTextMessage?.text
  return text && text.trim() !== '' ? text : null
}
