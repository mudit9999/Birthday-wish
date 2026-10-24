import type { WishModel } from '@family-wishes/core'
import type { Db } from '@family-wishes/db'
import { pino } from 'pino'
import type { WorkerDeps } from '../src/deps.js'
import type { Messenger } from '../src/wa/messenger.js'

export type SentMessage = { to: 'group' | 'self' | string; text: string }

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

  async sendToGroup(groupJid: string, text: string): Promise<string> {
    this.groupJids.push(groupJid)
    return this.record('group', text)
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

  private record(to: SentMessage['to'], text: string): string {
    if (this.failNext) {
      const error = this.failNext
      this.failNext = null
      throw error
    }
    this.sent.push({ to, text })
    return `MSG${this.nextId++}`
  }
}

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
    adminPhone: ADMIN_PHONE,
    backupDir: '',
    log: pino({ level: 'silent' }),
    now: fixedNow('2026-12-04T20:00:00+05:30'),
    ...overrides
  } as WorkerDeps & { messenger: FakeMessenger }
}
