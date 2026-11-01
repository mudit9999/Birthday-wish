import { configDefaults, defineProject } from 'vitest/config'

export default defineProject({
  test: {
    // e2e/ holds Playwright specs, run with `npm run e2e`.
    exclude: [...configDefaults.exclude, 'e2e/**']
  }
})
