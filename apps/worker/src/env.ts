import { DEFAULT_CARD_MODEL, DEFAULT_GEMINI_MODEL } from '@family-wishes/core'
import { z } from 'zod'

const blankAsMissing = (value: unknown) => (value === '' ? undefined : value)

const workerEnvSchema = z.object({
  DATABASE_URL: z.string({ error: 'is required' }).min(1, 'is required'),
  ADMIN_PHONE: z
    .string({ error: 'is required' })
    .regex(/^\d{8,15}$/, 'must be 8–15 digits in international format without + (e.g. 919876543210)'),
  GEMINI_API_KEY: z.string({ error: 'is required' }).min(1, 'is required'),
  GEMINI_MODEL: z.preprocess(blankAsMissing, z.string().default(DEFAULT_GEMINI_MODEL)),
  GEMINI_IMAGE_MODEL: z.preprocess(blankAsMissing, z.string().default(DEFAULT_CARD_MODEL)),
  BACKUP_DIR: z.preprocess(blankAsMissing, z.string().default('/data/backups')),
  LOG_LEVEL: z.preprocess(
    blankAsMissing,
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')
  )
})

export type WorkerEnv = z.infer<typeof workerEnvSchema>

/** Validates the worker's environment, naming each bad variable without echoing its value. */
export function loadWorkerEnv(env: Record<string, string | undefined>): WorkerEnv {
  const result = workerEnvSchema.safeParse(env)
  if (result.success) return result.data
  const problems = result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`)
  throw new Error(`Invalid worker environment: ${problems.join('; ')}`)
}
