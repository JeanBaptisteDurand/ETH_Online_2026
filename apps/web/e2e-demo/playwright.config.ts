/**
 * LES TESTS DE BOUT EN BOUT DE LA ROUTE #/demo.
 *
 * Ce dossier n'est PAS suivi par git : il sert a verifier la page avant la demonstration, pas
 * a entrer dans le depot gele. Il ne dependant d'AUCUN service distant — demo.tare-hooks.tech
 * et speculos.tare-hooks.tech sont interceptes par `page.route()` et servis depuis
 * fixtures.json, qui est lui-meme genere depuis le corpus embarque. Un test qui dependrait du
 * DNS ne dirait plus rien du jour ou le DNS tombe.
 *
 *   cd apps/web && npm run build && npx playwright test -c e2e-demo/playwright.config.ts
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  // UNIQUEMENT demo.spec.ts : le dossier accueille aussi l'audit en direct d'un autre agent,
  // qui parle aux services REELS et ne peut donc pas etre deterministe. Les deux suites ne se
  // melangent pas — celle-ci doit rester verte sans DNS, sans fork et sans appareil.
  testMatch: /demo\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:4181',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    // On sert le BUNDLE, pas le serveur de developpement : c'est ce qui partira par rsync.
    command: 'npm run preview',
    cwd: '..',
    url: 'http://localhost:4181',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
