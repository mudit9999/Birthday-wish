import { defineConfig, devices } from '@playwright/test'
import { E2E_ENV, E2E_PORT } from './e2e/env'

const BASE_URL = `http://localhost:${E2E_PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  // The first visit to each page compiles it in `next dev`.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Playwright starts the web server before globalSetup, so the database reset runs here instead.
    command: `node --import tsx e2e/setup.ts && npx next dev -p ${E2E_PORT}`,
    url: `${BASE_URL}/login/admin`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { ...E2E_ENV }
  }
})
