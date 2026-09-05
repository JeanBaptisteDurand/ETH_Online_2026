/**
 * La suite du lot H, autonome.
 *
 *   npx vitest run --config src/assistant/vitest.config.ts     (depuis apps/api)
 *
 * Elle a sa propre configuration parce que apps/api/vitest.config.ts n'inclut que
 * test/**, et que ce fichier n'appartient pas a ce lot. Les tests de l'assistant
 * tournent sur le VRAI jeu (docs/dataset/measurements.jsonl) : c'est lui que la demo
 * montre, donc c'est lui qu'on verifie.
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(here, "..", ".."),
  test: {
    environment: "node",
    include: ["src/assistant/__tests__/**/*.test.ts"],
    testTimeout: 20000,
  },
});
