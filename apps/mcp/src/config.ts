/**
 * Everything the operator can point somewhere else. No secret is read here: the fork URL is
 * local, and the upstream RPC key lives in the engine's `.env`, never in this process.
 */
export interface Config {
  /** Pinned local fork. `docker compose up -d anvil` in the repository root. */
  rpcUrl: string;
  /** LOT B's measurement API, if it happens to be running. Optional by design. */
  apiUrl: string;
  /** The block the committed dataset was taken at. */
  defaultBlock: number;
  /** Wall-clock budget for a live measurement, in ms. */
  engineTimeoutMs: number;
  /** Budget for a probe of the optional API, in ms. Short: it is allowed to be absent. */
  apiTimeoutMs: number;
  /** Set to "0" to forbid the server from touching the fork at all. */
  liveEnabled: boolean;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`${name}=${v} is not an integer`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    rpcUrl: env["TARE_RPC_URL"]?.trim() || "http://127.0.0.1:8545",
    apiUrl: (env["TARE_API_URL"]?.trim() || "http://127.0.0.1:8787").replace(/\/+$/, ""),
    defaultBlock: int("TARE_BLOCK", 50614000),
    engineTimeoutMs: int("TARE_ENGINE_TIMEOUT_MS", 60000),
    apiTimeoutMs: int("TARE_API_TIMEOUT_MS", 1200),
    liveEnabled: (env["TARE_LIVE"]?.trim() ?? "1") !== "0",
  };
}
