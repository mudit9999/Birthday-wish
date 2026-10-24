import { addDays, isTimeReached, localDate, localTime, type ISODate } from '@family-wishes/core'
import { archivePastOneTimeEvents, claimJobRun, getSettings, takeJobRequests } from '@family-wishes/db'
import type { WorkerDeps } from './deps.ts'
import { writeBackup } from './jobs/backup.ts'
import { sendFestivalReminder, sendNudge } from './jobs/daily.ts'
import { ensureDraftsFor } from './jobs/drafting.ts'
import { sendOutbox } from './jobs/outbox.ts'
import { expireOldDrafts, postDueDrafts, recoverInterruptedSends } from './jobs/posting.ts'

const FAST_TICK_MS = 5_000
const SLOW_TICK_MS = 60_000
const FESTIVAL_REMINDER_DAY = '-12-01'
const BACKUP_TIME = '02:00'

/** Runs one job, logging instead of throwing so the rest of the tick still runs. */
async function safely<T>(deps: WorkerDeps, job: string, run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run()
  } catch (error) {
    deps.log.error({ err: error, job }, 'job failed')
    return undefined
  }
}

/** Runs `run` at most once per day per job name, even across restarts. */
async function oncePerDay(deps: WorkerDeps, job: string, date: ISODate, run: () => Promise<unknown>): Promise<void> {
  await safely(deps, job, async () => {
    if (await claimJobRun(deps.db, job, date)) await run()
  })
}

async function clock(deps: WorkerDeps) {
  const settings = await getSettings(deps.db)
  const now = deps.now()
  const today = localDate(now, settings.timeZone)
  const time = localTime(now, settings.timeZone)
  return { settings, today, tomorrow: addDays(today, 1), time }
}

/** Every 5 s: post due wishes, send login codes and handle the admin's "run now" requests. */
export async function fastTick(deps: WorkerDeps): Promise<void> {
  await safely(deps, 'post', () => postDueDrafts(deps))
  await safely(deps, 'outbox', () => sendOutbox(deps))
  const requests = (await safely(deps, 'requests', () => takeJobRequests(deps.db))) ?? []
  for (const job of new Set(requests)) {
    if (job === 'draft') {
      await safely(deps, 'draft-now', async () => ensureDraftsFor((await clock(deps)).tomorrow, deps))
    } else {
      await safely(deps, 'send-now', () => postDueDrafts(deps, { ignoreSendTime: true }))
    }
  }
}

/** Every 60 s: expire, draft today and (after draft time) tomorrow, and the once-a-day jobs. */
export async function slowTick(deps: WorkerDeps): Promise<void> {
  const { settings, today, tomorrow, time } = await clock(deps)
  await safely(deps, 'expire', () => expireOldDrafts(deps))
  await safely(deps, 'draft-today', () => ensureDraftsFor(today, deps))
  if (isTimeReached(time, settings.draftTime)) {
    await safely(deps, 'draft-tomorrow', () => ensureDraftsFor(tomorrow, deps))
  }
  await oncePerDay(deps, 'archive', today, () => archivePastOneTimeEvents(deps.db, today))
  if (isTimeReached(time, BACKUP_TIME)) {
    await oncePerDay(deps, 'backup', today, () => writeBackup(deps))
  }
  if (!deps.messenger.isReady()) return
  if (isTimeReached(time, settings.nudgeTime)) {
    await oncePerDay(deps, 'nudge', today, () => sendNudge(deps))
  }
  if (today.endsWith(FESTIVAL_REMINDER_DAY) && isTimeReached(time, settings.draftTime)) {
    await oncePerDay(deps, 'festival_reminder', today, () => sendFestivalReminder(deps))
  }
}

/** A tick runner that skips a beat instead of overlapping a still-running tick; `idle()` waits for the current one. */
function nonOverlapping(deps: WorkerDeps, name: string, tick: (deps: WorkerDeps) => Promise<void>) {
  let current: Promise<unknown> | null = null
  return {
    run(): Promise<unknown> {
      current ??= safely(deps, name, () => tick(deps)).finally(() => {
        current = null
      })
      return current
    },
    idle: () => current ?? Promise.resolve()
  }
}

/** Recovers interrupted sends, then runs the slow tick now and every minute and the fast tick every 5 s. */
export function startLoops(
  deps: WorkerDeps,
  intervals: { fastMs: number; slowMs: number } = { fastMs: FAST_TICK_MS, slowMs: SLOW_TICK_MS }
): { stop(): Promise<void> } {
  const slow = nonOverlapping(deps, 'slow-tick', slowTick)
  const fast = nonOverlapping(deps, 'fast-tick', fastTick)
  let stopped = false
  const timers: ReturnType<typeof setInterval>[] = []

  // Recovery must finish before any tick can claim a draft, or it would fail a send in progress.
  const started = safely(deps, 'recover', () => recoverInterruptedSends(deps)).then(async () => {
    if (stopped) return
    await slow.run()
    if (stopped) return
    timers.push(
      setInterval(() => void slow.run(), intervals.slowMs),
      setInterval(() => void fast.run(), intervals.fastMs)
    )
  })

  return {
    /** Stops scheduling and resolves once no tick is running, so the caller can close the database. */
    async stop() {
      stopped = true
      timers.forEach(clearInterval)
      await started
      await Promise.all([slow.idle(), fast.idle()])
    }
  }
}
