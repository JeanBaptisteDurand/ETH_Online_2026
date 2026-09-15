/**
 * LE TEST DE BOUT EN BOUT DE L'EXTENSION — un vrai Chromium, l'extension construite, chargee.
 *
 *   cd packages/guard && npm run test:e2e
 *
 * Aucun service distant : les pages de test sont servies en local par le test lui-meme, et le
 * portefeuille est un faux injecte. Le Chromium est celui que Playwright 1.63 met en cache
 * (`npx playwright install chromium` s'il manque). `channel: "chromium"` dans le test : c'est le
 * mode sans tete qui accepte les extensions, le « headless shell » par defaut les refuse.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 90_000,
  expect: { timeout: 10_000 },
});
