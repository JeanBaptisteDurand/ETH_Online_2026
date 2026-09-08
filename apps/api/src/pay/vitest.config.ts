/**
 * La suite du client x402 tourne depuis son propre repertoire, comme celles de
 * src/metering et src/assistant : le vitest.config.ts de apps/api n'inclut que test/**.
 *
 *   cd apps/api && npx vitest run --config src/pay/vitest.config.ts
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
