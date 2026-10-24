import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**', 'apps/worker/src/**', 'apps/web/lib/**'],
      // Live-socket, process entry and Next request glue (cookies/redirect) are verified manually and by the E2E smoke test.
      exclude: [
        'apps/worker/src/wa/connection.ts',
        'apps/worker/src/main.ts',
        'apps/web/lib/actions/**',
        'apps/web/lib/guards.ts',
        'apps/web/lib/db.ts'
      ],
      thresholds: {
        lines: 80
      }
    }
  }
})
