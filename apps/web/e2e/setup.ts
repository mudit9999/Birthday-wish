import { rm } from 'node:fs/promises'
import { createDb } from '@family-wishes/db'
import { runMigrations } from '../../../packages/db/src/migrate.ts'

const PGLITE_PREFIX = 'pglite:'

/**
 * Recreates the throwaway PGlite database the smoke test runs against.
 * Runs as the first half of the Playwright web server command, so the database is ready
 * (and closed again) before `next dev` opens it: PGlite allows one process per directory.
 */
async function resetE2eDatabase(url: string | undefined): Promise<void> {
  if (!url?.startsWith(PGLITE_PREFIX) || url === `${PGLITE_PREFIX}memory`) {
    throw new Error('E2E setup only resets a file-based PGlite database (DATABASE_URL=pglite:<dir>)')
  }
  await rm(url.slice(PGLITE_PREFIX.length), { recursive: true, force: true })
  const handle = await createDb(url)
  try {
    await runMigrations(handle)
  } finally {
    await handle.close()
  }
}

resetE2eDatabase(process.env.DATABASE_URL).catch((error: unknown) => {
  process.stderr.write(`E2E setup failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
