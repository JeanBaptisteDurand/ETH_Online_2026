/**
 * The evidence, loaded once, indexed, and fingerprinted.
 *
 * Two rules shape this file.
 *
 * 1. No number is re-derived. Everything an answer can show is read from disk. The only figures
 *    this module computes are counts of its own rows, which are checkable by re-running it.
 * 2. No integer is allowed through `JSON.parse` as a float. `docs/pools-liquides.json` stores
 *    uint128 liquidity as a bare JSON number — 6242907904062804350752 does not survive an IEEE
 *    double, and a silently rounded liquidity is a fabricated number. We quote every integer
 *    literal of 16 digits or more before parsing, and keep it a string forever after.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { MEASUREMENTS_PATH, POOLS_PATH } from "./paths.js";
import { normalizeLabel, type Label } from "./labels.js";
import { poolId } from "./poolid.js";

/** Quote every bare integer literal too long for a double, so it parses as an exact string. */
export function parseJsonBigSafe(text: string): unknown {
  return JSON.parse(text.replace(/(?<=[:,[\s])(-?\d{16,})(?=[,\]}\s])/g, '"$1"'));
}

export interface MeasurementRow {
  hook: string;
  pool_id: string;
  chain_id: number;
  block_number: number;
  currency0: string;
  currency1: string;
  key_fee: number;
  tick_spacing: number;
  fee_is_dynamic: boolean;
  stored_lp_fee: number | null;
  stored_protocol_fee: number | null;
  zero_for_one: boolean;
  amount_in: string;
  out_with: string | null;
  out_without: string | null;
  bps: number | null;
  label: Label;
  reason: string | null;
  stub_hash: string;
  engine_ver: string;
  observed_at: string;
}

export interface PoolRow {
  hook: string;
  currency0: string;
  currency1: string;
  fee: number;
  tick_spacing: number;
  /** uint128, exact, as a decimal string. Never summed across pools: different units. */
  liquidity: string;
  fee_is_dynamic: boolean;
  pool_id: string;
}

export interface Dataset {
  measurements: MeasurementRow[];
  pools: PoolRow[];
  provenance: {
    measurements_file: string;
    measurements_sha256: string;
    measurements_rows: number;
    pools_file: string;
    pools_sha256: string;
    pools_rows: number;
  };
}

function sha256(text: string): string {
  return "0x" + createHash("sha256").update(text, "utf8").digest("hex");
}

function loadMeasurements(text: string): MeasurementRow[] {
  const raw = parseJsonBigSafe(text);
  if (!Array.isArray(raw)) throw new Error("measurements-v1.json is not an array");
  return raw.map((r: Record<string, unknown>, i: number) => {
    if (typeof r?.["hook"] !== "string" || typeof r?.["pool_id"] !== "string") {
      throw new Error(`measurement row ${i} is missing hook/pool_id`);
    }
    const bps = r["bps"];
    if (bps !== null && typeof bps !== "number") throw new Error(`row ${i}: bps is not a number`);
    return {
      ...(r as unknown as MeasurementRow),
      hook: (r["hook"] as string).toLowerCase(),
      pool_id: (r["pool_id"] as string).toLowerCase(),
      amount_in: String(r["amount_in"]),
      label: normalizeLabel(String(r["label"])),
    };
  });
}

function loadPools(text: string): PoolRow[] {
  const raw = parseJsonBigSafe(text);
  if (!Array.isArray(raw)) throw new Error("pools-liquides.json is not an array");
  return raw.map((row: unknown, i: number) => {
    if (!Array.isArray(row) || row.length < 4) throw new Error(`pool row ${i} is malformed`);
    const key = row[1] as [string, string, number, number, string];
    const p: PoolRow = {
      hook: String(row[0]).toLowerCase(),
      currency0: String(key[0]).toLowerCase(),
      currency1: String(key[1]).toLowerCase(),
      fee: Number(key[2]),
      tick_spacing: Number(key[3]),
      liquidity: String(row[2]),
      fee_is_dynamic: Boolean(row[3]),
      pool_id: "",
    };
    // The fourth column is `fee & 0x800000`, checked row by row: 167 dynamic-fee pools carry
    // true, the 32 static ones carry false, with no exception. See test/dataset.test.ts.
    if (p.fee_is_dynamic !== ((p.fee & 0x800000) !== 0)) {
      throw new Error(`pool row ${i}: dynamic-fee column disagrees with the key fee`);
    }
    p.pool_id = poolId({ ...p, hook: String(key[4]).toLowerCase() });
    return p;
  });
}

let cached: Dataset | null = null;

export function loadDataset(): Dataset {
  if (cached) return cached;
  const mText = readFileSync(MEASUREMENTS_PATH, "utf8");
  const pText = readFileSync(POOLS_PATH, "utf8");
  const measurements = loadMeasurements(mText);
  const pools = loadPools(pText);
  if (measurements.length === 0) throw new Error("measurements-v1.json is empty — refusing to serve");
  cached = {
    measurements,
    pools,
    provenance: {
      measurements_file: MEASUREMENTS_PATH,
      measurements_sha256: sha256(mText),
      measurements_rows: measurements.length,
      pools_file: POOLS_PATH,
      pools_sha256: sha256(pText),
      pools_rows: pools.length,
    },
  };
  return cached;
}

export function resetDatasetCache(): void {
  cached = null;
}
