import { createGeminiCardModel, createGeminiModel } from '@family-wishes/core'
import { createDb, ensureAdmin } from '@family-wishes/db'
import { pino } from 'pino'
import type { WorkerDeps } from './deps.ts'
import { loadWorkerEnv } from './env.ts'
import { handleAdminReply } from './jobs/replies.ts'
import { startLoops } from './scheduler.ts'
import { startConnection } from './wa/connection.ts'

// Migrations are not run here: they are an explicit deploy step (`npm run db:migrate`).
async function main(): Promise<void> {
  const env = loadWorkerEnv(process.env)
  const log = pino({ level: env.LOG_LEVEL })
  const handle = await createDb(env.DATABASE_URL)
  await ensureAdmin(handle.db, env.ADMIN_PHONE)

  let deps: WorkerDeps | undefined
  const connection = await startConnection({
    db: handle.db,
    adminPhone: env.ADMIN_PHONE,
    log,
    onReply: async (text) => {
      if (deps) await handleAdminReply(text, deps)
    }
  })
  deps = {
    db: handle.db,
    messenger: connection.messenger,
    model: createGeminiModel({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }),
    cardModel: createGeminiCardModel({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_IMAGE_MODEL }),
    adminPhone: env.ADMIN_PHONE,
    backupDir: env.BACKUP_DIR,
    log,
    now: () => new Date()
  }
  const loops = startLoops(deps)
  log.info('worker started')

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'shutting down')
    await loops.stop()
    await connection.stop()
    await handle.close()
    process.exit(0)
  }
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error: unknown) => {
  process.stderr.write(`Worker failed to start: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
