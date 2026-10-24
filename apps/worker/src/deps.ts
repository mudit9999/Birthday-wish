import type { WishModel } from '@family-wishes/core'
import type { Db } from '@family-wishes/db'
import type { Logger } from 'pino'
import type { Messenger } from './wa/messenger.ts'

/** Everything a job needs; tests swap in fakes. */
export interface WorkerDeps {
  db: Db
  messenger: Messenger
  model: WishModel | null
  adminPhone: string
  backupDir: string
  log: Logger
  now: () => Date
}
