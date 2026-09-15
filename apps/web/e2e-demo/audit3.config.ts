/**
 * DEUXIEME AUDIT — contre le site en ligne, apres les corrections.
 * Aucun service double : pont, ecran Speculos et fork sont les vrais.
 *
 *   cd apps/web/e2e-demo && npx playwright test -c audit2.config.ts
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: /audit3-live\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 1_200_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'https://tare-hooks.tech',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
})
