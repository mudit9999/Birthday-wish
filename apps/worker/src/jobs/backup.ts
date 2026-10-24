import { localDate } from '@family-wishes/core'
import { exportBackup, getSettings } from '@family-wishes/db'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorkerDeps } from '../deps.ts'

const BACKUPS_TO_KEEP = 14
const BACKUP_FILE = /^backup-\d{4}-\d{2}-\d{2}\.json$/

/** Writes `<backupDir>/backup-<date>.json` and prunes all but the newest 14 backups. Returns the new path. */
export async function writeBackup(deps: WorkerDeps): Promise<string> {
  const { timeZone } = await getSettings(deps.db)
  const path = join(deps.backupDir, `backup-${localDate(deps.now(), timeZone)}.json`)
  await mkdir(deps.backupDir, { recursive: true })
  await writeFile(path, JSON.stringify(await exportBackup(deps.db), null, 2), 'utf8')

  // ISO dates in the names sort chronologically.
  const backups = (await readdir(deps.backupDir)).filter((name) => BACKUP_FILE.test(name)).sort().reverse()
  await Promise.all(backups.slice(BACKUPS_TO_KEEP).map((name) => rm(join(deps.backupDir, name))))
  deps.log.info({ path }, 'backup written')
  return path
}
