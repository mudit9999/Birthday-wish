import type { ISODate } from '@family-wishes/core'
import { isNull, sql } from 'drizzle-orm'
import { jobRequests, jobRuns } from './schema.ts'
import type { Db } from './client.ts'

export type RequestedJob = 'draft' | 'send'

/** Records that `job` ran for `date`; false if it already had, so daily jobs run once even across restarts. */
export async function claimJobRun(db: Db, job: string, date: ISODate): Promise<boolean> {
  const inserted = await db
    .insert(jobRuns)
    .values({ job, runDate: date })
    .onConflictDoNothing()
    .returning({ job: jobRuns.job })
  return inserted.length > 0
}

/** Asks the worker to run a job now (the admin's "run now" buttons). */
export async function requestJob(db: Db, job: RequestedJob): Promise<void> {
  await db.insert(jobRequests).values({ job })
}

/** Takes every outstanding request, marking it done. */
export async function takeJobRequests(db: Db): Promise<RequestedJob[]> {
  const taken = await db
    .update(jobRequests)
    .set({ doneAt: sql`now()` })
    .where(isNull(jobRequests.doneAt))
    .returning({ job: jobRequests.job })
  return taken.map((row) => row.job)
}
