import type { CardImage, CardModel, WishModel } from '@family-wishes/core'
import type { Db } from '@family-wishes/db'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pino } from 'pino'
import type { WorkerDeps } from '../src/deps.ts'
import type { Messenger, OutgoingCard } from '../src/wa/messenger.ts'

export type SentMessage = { to: 'group' | 'self' | string; text: string; card?: OutgoingCard }

/** Records every send instead of talking to WhatsApp. */
export class FakeMessenger implements Messenger {
  readonly sent: SentMessage[] = []
  readonly groupJids: string[] = []
  ready = true
  /** When set, the next send throws this error once. */
  failNext: Error | null = null
  private nextId = 1

  isReady(): boolean {
    return this.ready
  }

  async sendToGroup(groupJid: string, text: string, card?: OutgoingCard): Promise<string> {
    this.groupJids.push(groupJid)
    return this.record('group', text, card)
  }

  async sendToSelf(text: string): Promise<string> {
    return this.record('self', text)
  }

  async sendToPhone(phone: string, text: string): Promise<string> {
    return this.record(phone, text)
  }

  to(target: SentMessage['to']): string[] {
    return this.sent.filter((m) => m.to === target).map((m) => m.text)
  }

  private record(to: SentMessage['to'], text: string, card?: OutgoingCard): string {
    if (this.failNext) {
      const error = this.failNext
      this.failNext = null
      throw error
    }
    this.sent.push(card ? { to, text, card } : { to, text })
    return `MSG${this.nextId++}`
  }
}

/** Returns `card` (or throws it) and records every prompt. */
export class FakeCardModel implements CardModel {
  readonly prompts: string[] = []

  constructor(private readonly card: CardImage | null | Error = FAKE_CARD) {}

  async generate(prompt: string): Promise<CardImage | null> {
    this.prompts.push(prompt)
    if (this.card instanceof Error) throw this.card
    return this.card
  }
}

export const FAKE_CARD: CardImage = { base64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 7, 7]).toString('base64'), mimeType: 'image/png' }

/** Returns `outputs` in order (repeating the last one) and records every prompt. */
export class FakeModel implements WishModel {
  readonly prompts: { system: string; prompt: string }[] = []

  constructor(private readonly outputs: string[]) {}

  async generate(req: { system: string; prompt: string }): Promise<string> {
    const output = this.outputs[Math.min(this.prompts.length, this.outputs.length - 1)] ?? ''
    this.prompts.push(req)
    return output
  }
}

/** A clock frozen at `iso` (use an explicit offset, e.g. '2026-10-25T08:00:00+05:30'). */
export function fixedNow(iso: string): () => Date {
  const at = new Date(iso)
  return () => new Date(at)
}

export const ADMIN_PHONE = '919800000000'

/** WorkerDeps wired to fakes and a silent logger; override anything per test. */
export function testDeps(db: Db, overrides: Partial<WorkerDeps> = {}): WorkerDeps & { messenger: FakeMessenger } {
  return {
    db,
    messenger: new FakeMessenger(),
    model: new FakeModel(['Happy day from all of us! 🎉 Wishing you lots of love and laughter.']),
    cardModel: null,
    adminPhone: ADMIN_PHONE,
    backupDir: mkdtempSync(join(tmpdir(), 'fw-backups-')),
    log: pino({ level: 'silent' }),
    now: fixedNow('2026-12-04T20:00:00+05:30'),
    ...overrides
  } as WorkerDeps & { messenger: FakeMessenger }
}
