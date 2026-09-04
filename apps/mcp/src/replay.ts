/**
 * Every value this server prints must come back with one command a judge can paste.
 *
 * The commands are written relative to the repository root and quoted for POSIX shells. They are
 * built from the same fields that produced the answer, so a wrong answer produces a command that
 * exposes it.
 */
import { REPO_ROOT } from "./paths.js";

function sq(s: string): string {
  return "'" + String(s).replace(/'/g, `'\\''`) + "'";
}

export interface DatasetCite {
  hook: string;
  poolId: string;
  amountIn: string;
  zeroForOne: boolean;
  block: number;
}

/** Re-read the exact row out of the committed evidence file. */
export function replayDatasetRow(c: DatasetCite): string {
  const filter =
    `.[] | select(.hook==${JSON.stringify(c.hook)} and .pool_id==${JSON.stringify(c.poolId)} ` +
    `and .amount_in==${JSON.stringify(c.amountIn)} and .zero_for_one==${c.zeroForOne} ` +
    `and .block_number==${c.block})`;
  return `cd ${sq(REPO_ROOT)} && jq ${sq(filter)} docs/measurements-v1.json`;
}

export function replayDatasetHook(hook: string): string {
  const filter = `[.[] | select(.hook==${JSON.stringify(hook)})]`;
  return `cd ${sq(REPO_ROOT)} && jq ${sq(filter)} docs/measurements-v1.json`;
}

export function replayDatasetPoolsForHook(hook: string): string {
  const filter = `[.[] | select(.[0]==${JSON.stringify(hook)})]`;
  return `cd ${sq(REPO_ROOT)} && jq ${sq(filter)} docs/pools-liquides.json`;
}

export interface EngineCite extends DatasetCite {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  rpc: string;
}

/** Take the measurement again, from scratch, against a fork pinned to the same block. */
export function replayEngine(c: EngineCite): string {
  return (
    `cd ${sq(REPO_ROOT)} && docker compose up -d anvil && ` +
    `python3 apps/mcp/bin/tare_measure.py --rpc ${sq(c.rpc)} --hook ${sq(c.hook)} ` +
    `--currency0 ${sq(c.currency0)} --currency1 ${sq(c.currency1)} --fee ${c.fee} ` +
    `--tick-spacing ${c.tickSpacing} --amount ${sq(c.amountIn)} ` +
    `--zero-for-one ${c.zeroForOne ? 1 : 0} --block ${c.block}`
  );
}

/** Read the hook's code at the pinned block and hash it, with no tool but curl. */
export function replayCodeHash(hook: string, rpc: string): string {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getCode",
    params: [hook, "latest"],
  });
  return `curl -s -X POST -H 'Content-Type: application/json' --data ${sq(body)} ${sq(rpc)}`;
}

/** The permission bits are in the address itself; this needs no network at all. */
export function replayPermissionMask(hook: string): string {
  return `python3 -c ${sq(`print(hex(int(${JSON.stringify(hook)}, 16) & 0x3fff))`)}`;
}

/** The exact list the min / median / max in tare_impact were computed from. */
export function replayBpsValues(hook: string): string {
  // The committed file still carries the engine-0.2 French label; both spellings are accepted so
  // the command keeps working after a dataset regeneration.
  const filter =
    `[.[] | select(.hook==${JSON.stringify(hook)} and (.label=="MESURE" or .label=="MEASURED")) | .bps] | sort`;
  return `cd ${sq(REPO_ROOT)} && jq ${sq(filter)} docs/measurements-v1.json`;
}

export function replayApi(url: string): string {
  return `curl -s ${sq(url)}`;
}
