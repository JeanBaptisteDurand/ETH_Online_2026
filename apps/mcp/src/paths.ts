/**
 * Where the repository is, seen from wherever this file ended up compiled.
 *
 * The MCP server is launched by a client (Claude Desktop, `claude mcp`) whose working directory
 * is not ours, so nothing may be resolved relative to `process.cwd()`. We walk up from this
 * module until we find the repository marker, and we fail loudly rather than silently reading
 * an empty dataset — an empty dataset would produce a confident "no measurement", which is
 * exactly the class of false result this project forbids.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = join("engine", "tare", "measure.py");

export function findRepoRoot(startDir?: string): string {
  const override = process.env.TARE_REPO_ROOT;
  if (override) {
    const abs = resolve(override);
    if (!existsSync(join(abs, MARKER))) {
      throw new Error(
        `TARE_REPO_ROOT=${abs} does not contain ${MARKER}. Point it at the TARE checkout.`,
      );
    }
    return abs;
  }
  let dir = startDir ?? dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, MARKER))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(
    `TARE repository root not found above ${startDir ?? "the module directory"}. ` +
      `Set TARE_REPO_ROOT to the checkout that contains ${MARKER}.`,
  );
}

export const REPO_ROOT = findRepoRoot();
export const MEASUREMENTS_PATH = join(REPO_ROOT, "docs", "measurements-v1.json");
export const POOLS_PATH = join(REPO_ROOT, "docs", "pools-liquides.json");
export const ENGINE_DIR = join(REPO_ROOT, "engine");
export const BRIDGE_PATH = join(REPO_ROOT, "apps", "mcp", "bin", "tare_measure.py");
