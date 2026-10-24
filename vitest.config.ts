import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**', 'apps/worker/src/**', 'apps/web/lib/**'],
      // Live-socket and process entry points are verified manually (plan Task 12 step 5, Task 18 step 5).
      exclude: ['apps/worker/src/wa/connection.ts', 'apps/worker/src/main.ts'],
      thresholds: {
        lines: 80
      }
    }
  }
})
