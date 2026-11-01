import { join } from 'node:path'

export const E2E_PORT = 3100

// Fixed, non-secret values: the smoke test only ever runs against a throwaway local PGlite database.
export const E2E_ENV = {
  DATABASE_URL: `pglite:${join(import.meta.dirname, '..', '.pglite-e2e')}`,
  ADMIN_PASSWORD: 'e2e-admin-password-0001',
  SESSION_SECRET: 'e2e-session-secret-0123456789abcdefghij',
  ADMIN_PHONE: '919999900000',
  GEMINI_API_KEY: 'e2e-not-a-real-key',
  POLLINATIONS_API_KEY: ''
} as const
