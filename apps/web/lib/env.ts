import { DEFAULT_CARD_MODEL, DEFAULT_GEMINI_MODEL, DEFAULT_POLLINATIONS_MODEL } from '@family-wishes/core'
import { z } from 'zod'

const MIN_PASSWORD_LENGTH = 16
const MIN_SECRET_LENGTH = 32

const webEnvSchema = z.object({
  DATABASE_URL: z.string({ error: 'is required' }).min(1, 'is required'),
  GEMINI_API_KEY: z.string({ error: 'is required' }).min(1, 'is required'),
  GEMINI_MODEL: z.preprocess((v) => (v === '' ? undefined : v), z.string().default(DEFAULT_GEMINI_MODEL)),
  GEMINI_IMAGE_MODEL: z.preprocess((v) => (v === '' ? undefined : v), z.string().default(DEFAULT_CARD_MODEL)),
  POLLINATIONS_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  POLLINATIONS_IMAGE_MODEL: z.preprocess((v) => (v === '' ? undefined : v), z.string().default(DEFAULT_POLLINATIONS_MODEL)),
  ADMIN_PHONE: z
    .string({ error: 'is required' })
    .regex(/^\d{8,15}$/, 'must be 8–15 digits in international format without + (e.g. 919876543210)'),
  ADMIN_PASSWORD: z
    .string({ error: 'is required' })
    .min(MIN_PASSWORD_LENGTH, `must be at least ${MIN_PASSWORD_LENGTH} characters`),
  SESSION_SECRET: z
    .string({ error: 'is required' })
    .min(MIN_SECRET_LENGTH, `must be at least ${MIN_SECRET_LENGTH} characters`)
})

export type WebEnv = z.infer<typeof webEnvSchema>

/** Validates the web environment, naming each bad variable without echoing its value. */
export function parseWebEnv(env: Record<string, string | undefined>): WebEnv {
  const result = webEnvSchema.safeParse(env)
  if (result.success) return result.data
  const problems = result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`)
  throw new Error(`Invalid web environment: ${problems.join('; ')}`)
}

let cached: WebEnv | undefined

export function getWebEnv(): WebEnv {
  cached ??= parseWebEnv(process.env)
  return cached
}
