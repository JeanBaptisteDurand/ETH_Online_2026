/**
 * AUDIT DU SITE EN LIGNE — aucune doublure, aucun serveur local.
 *
 * Contrairement a playwright.config.ts (qui sert le bundle local et intercepte le pont et
 * l'ecran), cette configuration vise https://tare-hooks.tech tel qu'il est publie. Le pont,
 * l'ecran Speculos et le fork sont les VRAIS. Le seul element simule est le portefeuille.
 *
 *   npx playwright test -c e2e-demo/audit.config.ts
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: /audit-live\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // Une signature sur l'appareil peut demander 40 ecrans : on laisse de la marge au TEST,
  // ce qui ne change rien au delai de 12 s que la PAGE s'impose a elle-meme.
  timeout: 300_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'https://tare-hooks.tech',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: false,
  },
})
