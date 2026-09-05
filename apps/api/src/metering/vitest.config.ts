/**
 * La suite du lot G tourne depuis son propre repertoire — le vitest.config.ts
 * de apps/api n'inclut que test/**, et ce lot n'a pas le droit d'y toucher.
 *
 *   cd apps/api && npx vitest run --config src/metering/vitest.config.ts
 *
 * Pour la replier dans la suite generale, il suffira d'ajouter
 * "src/metering/**\/*.test.ts" a `include` dans apps/api/vitest.config.ts.
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: dirname(fileURLToPath(import.meta.url)),
    environment: "node",
    include: ["**/*.test.ts"],
    testTimeout: 30000,
  },
});
