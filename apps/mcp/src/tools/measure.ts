/**
 * tare_measure — one swap, quoted twice, or an honest refusal.
 *
 * Resolution order, and the label each step can produce:
 *
 *   1. the committed dataset, exact row        MEASURED / NOT_QUOTABLE / NOT_MEASURABLE
 *   2. the LOT B API, if it answers            whatever it labels, re-validated here
 *   3. the local engine against the pinned fork MEASURED / NOT_QUOTABLE / NOT_MEASURABLE
 *   4. interpolation between two measured sizes INTERPOLATED
 *   5. nothing                                  NOT_MEASURABLE, with the reason
 *
 * Step 3 is the product: `anvil_setCode` swaps the hook for an inert stub, the PoolKey is
 * untouched, and the two quotes differ by exactly what the hook took. This process never does
 * that arithmetic itself — `bin/tare_measure.py` does, and prints it.
 */
import type { Config } from "../config.js";
import type { Store } from "../store.js";
import { measureViaApi, probe } from "../api.js";
import { runEngine } from "../engine.js";
import { blockNumber } from "../rpc.js";
import { interpolate, type Point } from "../interpolate.js";
import { permissions, maskHex, touchesSwap } from "../hookflags.js";
import { replayDatasetPoolsForHook, replayDatasetRow, replayEngine, replayPermissionMask } from "../replay.js";
import { directionLabel, pad, padLeft, render, v, type Payload } from "../answer.js";
import type { Label } from "../labels.js";

export interface MeasureInput {
  hook: string;
  pool: string;
  size: string;
  direction: string;
  block?: number;
}

export function parseDirection(d: string): boolean {
  // "0->1", "0 to 1", "zeroForOne" and "true" all mean the same thing; anything else is refused
  // rather than guessed, because a swap measured the wrong way round is a wrong number.
  const s = d.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["0to1", "01", "zeroforone", "zeroforonetrue", "true"].includes(s)) return true;
  if (["1to0", "10", "oneforzero", "zeroforonefalse", "false"].includes(s)) return false;
  throw new Error(`direction must be "0to1" or "1to0", got ${JSON.stringify(d)}`);
}

export function parseSize(size: string): string {
  const s = String(size).trim().replace(/_/g, "");
  if (!/^[0-9]+$/.test(s)) {
    throw new Error(
      `size must be a positive integer amount in the smallest unit of the input token, as a ` +
        `decimal string (e.g. "1000000000000000"). Got ${JSON.stringify(size)}.`,
    );
  }
  if (BigInt(s) === 0n) throw new Error("size must be greater than zero");
  return BigInt(s).toString();
}

export async function measureTool(input: MeasureInput, cfg: Config, store: Store) {
  const hook = input.hook.trim().toLowerCase();
  const poolId = input.pool.trim().toLowerCase();
  const zeroForOne = parseDirection(input.direction);
  const amountIn = parseSize(input.size);
  const block = input.block ?? cfg.defaultBlock;

  const pool = store.poolById(poolId);
  const steps: { step: string; outcome: string }[] = [];

  const payload: Payload = {
    tool: "tare_measure",
    query: { hook, pool_id: poolId, amount_in: amountIn, direction: directionLabel(zeroForOne), block },
    hook_permissions: {
      mask: maskHex(hook),
      granted: permissions(hook),
      can_run_during_a_swap: touchesSwap(hook),
      source: "the low 14 bits of the hook address, per v4-core Hooks.sol",
      replay: replayPermissionMask(hook),
    },
    provenance: store.dataset.provenance,
    resolution: steps,
  };

  // ---- 1. the committed evidence -------------------------------------------------------
  const row = store.exact({ hook, poolId, amountIn, zeroForOne, block });
  if (row) {
    steps.push({ step: "dataset", outcome: `hit:${row.label}` });
    payload["result"] = {
      label: row.label,
      bps: row.bps,
      out_with: row.out_with,
      out_without: row.out_without,
      reason: row.reason,
      block_number: row.block_number,
      amount_in: row.amount_in,
      zero_for_one: row.zero_for_one,
      stored_lp_fee: row.stored_lp_fee,
      stored_protocol_fee: row.stored_protocol_fee,
      stub_hash: row.stub_hash,
      engine_ver: row.engine_ver,
      observed_at: row.observed_at,
      source: "dataset:docs/measurements-v1.json",
      replay: replayDatasetRow({ hook, poolId, amountIn, zeroForOne, block }),
    };
    return render(lines(payload, row.label, row.bps, row.reason, pool ?? null), payload);
  }
  steps.push({ step: "dataset", outcome: "miss" });

  // ---- 2. the optional LOT B API -------------------------------------------------------
  const api = await probe(cfg.apiUrl, cfg.apiTimeoutMs);
  payload["api"] = api;
  if (api.status === "OK") {
    const got = await measureViaApi(cfg.apiUrl, { hook, poolId, amountIn, zeroForOne, block }, cfg.engineTimeoutMs);
    if (got.hit) {
      steps.push({ step: "api", outcome: `hit:${got.hit.label}` });
      payload["result"] = {
        ...got.hit,
        amount_in: amountIn,
        zero_for_one: zeroForOne,
        source: `api:${got.url}`,
        replay: `curl -s '${got.url}'`,
      };
      return render(lines(payload, got.hit.label, got.hit.bps, got.hit.reason, pool ?? null), payload);
    }
    steps.push({ step: "api", outcome: `no_usable_answer:${v(got.reason)}` });
  } else {
    steps.push({ step: "api", outcome: `unavailable:${v(api.reason)}` });
  }

  // ---- 3. the local fork ---------------------------------------------------------------
  if (!pool) {
    steps.push({ step: "engine", outcome: "skipped:pool_key_unknown" });
  } else if (!cfg.liveEnabled) {
    steps.push({ step: "engine", outcome: "skipped:TARE_LIVE=0" });
  } else {
    const head = await blockNumber(cfg.rpcUrl);
    if (head === null) {
      steps.push({ step: "engine", outcome: `fork_unreachable:${cfg.rpcUrl}` });
    } else if (head !== block) {
      steps.push({ step: "engine", outcome: `fork_block_mismatch:head=${head},requested=${block}` });
    } else {
      const r = await runEngine({
        rpcUrl: cfg.rpcUrl,
        hook,
        currency0: pool.currency0,
        currency1: pool.currency1,
        fee: pool.fee,
        tickSpacing: pool.tick_spacing,
        amountIn,
        zeroForOne,
        block,
        timeoutMs: cfg.engineTimeoutMs,
      });
      steps.push({ step: "engine", outcome: `ran:${r.label}` });
      if (r.label !== "NOT_MEASURABLE" || r.out_with !== null || r.reason?.startsWith("custom")) {
        payload["result"] = {
          label: r.label,
          bps: r.bps,
          out_with: r.out_with,
          out_without: r.out_without,
          reason: r.reason,
          block_number: block,
          amount_in: amountIn,
          zero_for_one: zeroForOne,
          stored_lp_fee: r.stored_lp_fee,
          stored_protocol_fee: r.stored_protocol_fee,
          stub_hash: r.stub_hash,
          engine_ver: r.engine_ver,
          observed_at: r.observed_at,
          source: `engine:${r.engine_ver ?? "tare-engine"} against ${cfg.rpcUrl} at block ${block}`,
          replay: replayEngine({
            hook,
            poolId,
            amountIn,
            zeroForOne,
            block,
            currency0: pool.currency0,
            currency1: pool.currency1,
            fee: pool.fee,
            tickSpacing: pool.tick_spacing,
            rpc: cfg.rpcUrl,
          }),
        };
        return render(lines(payload, r.label, r.bps, r.reason, pool), payload);
      }
    }
  }

  // ---- 4. interpolation, between two measured points only ------------------------------
  const neighbours = store
    .measurementsForPool(hook, poolId)
    .filter((m) => m.zero_for_one === zeroForOne && m.block_number === block && m.label === "MEASURED" && m.bps !== null);
  const points: Point[] = neighbours.map((m) => ({ amountIn: m.amount_in, bps: m.bps as number }));
  const interp = interpolate(points, amountIn);
  if ("bps" in interp) {
    steps.push({ step: "interpolation", outcome: "hit" });
    payload["result"] = {
      label: "INTERPOLATED" as Label,
      bps: interp.bps,
      out_with: null,
      out_without: null,
      reason: null,
      block_number: block,
      amount_in: amountIn,
      zero_for_one: zeroForOne,
      method: interp.method,
      between: [interp.lower, interp.upper],
      source: "interpolation between two MEASURED rows of docs/measurements-v1.json",
      replay: replayDatasetRow({ hook, poolId, amountIn: interp.lower.amountIn, zeroForOne, block }),
      replay_upper: replayDatasetRow({ hook, poolId, amountIn: interp.upper.amountIn, zeroForOne, block }),
    };
    return render(lines(payload, "INTERPOLATED", interp.bps, null, pool ?? null), payload);
  }
  steps.push({ step: "interpolation", outcome: `refused:${interp.reason}` });

  // ---- 5. nothing ----------------------------------------------------------------------
  const reason = pool
    ? `no measurement available: ${steps.map((s) => `${s.step}=${s.outcome}`).join("; ")}`
    : `pool ${poolId} is not in docs/pools-liquides.json, so its PoolKey (currencies, fee, tickSpacing) ` +
      `is unknown and the counterfactual cannot be built`;
  payload["result"] = {
    label: "NOT_MEASURABLE" as Label,
    bps: null,
    out_with: null,
    out_without: null,
    reason,
    block_number: block,
    amount_in: amountIn,
    zero_for_one: zeroForOne,
    source: "none",
    replay: pool
      ? replayEngine({
          hook,
          poolId,
          amountIn,
          zeroForOne,
          block,
          currency0: pool.currency0,
          currency1: pool.currency1,
          fee: pool.fee,
          tickSpacing: pool.tick_spacing,
          rpc: cfg.rpcUrl,
        })
      : replayDatasetPoolsForHook(hook),
  };
  payload["known_pools_for_this_hook"] = store.poolsForHook(hook).map((p) => p.pool_id);
  return render(lines(payload, "NOT_MEASURABLE", null, reason, pool ?? null), payload);
}

function lines(
  payload: Payload,
  label: Label,
  bps: number | null,
  reason: string | null,
  pool: { currency0: string; currency1: string; fee: number; tick_spacing: number; liquidity: string } | null,
): string[] {
  const q = payload["query"] as Record<string, unknown>;
  const r = (payload["result"] ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  out.push(`hook       ${v(q["hook"])}`);
  out.push(`pool       ${v(q["pool_id"])}`);
  if (pool) {
    out.push(`  key      currency0=${pool.currency0}`);
    out.push(`           currency1=${pool.currency1}`);
    out.push(`           fee=${pool.fee} tickSpacing=${pool.tick_spacing} dynamicFee=${(pool.fee & 0x800000) !== 0}`);
    out.push(`  liquidity ${pool.liquidity}  (uint128, in-range, at the block below; never summed across pools)`);
  }
  out.push(`block      ${v(q["block"])}`);
  out.push(`size       ${v(q["amount_in"])}  (smallest unit of the input token)`);
  out.push(`direction  ${v(q["direction"])}`);
  out.push("");
  out.push(`${pad("LABEL", 12)}${label}`);
  out.push(`${pad("bps", 12)}${bps === null ? "— (no number: this label does not carry one)" : String(bps)}`);
  if (r["out_with"] || r["out_without"]) {
    out.push(`${pad("out_with", 12)}${v(r["out_with"])}`);
    out.push(`${pad("out_without", 12)}${v(r["out_without"])}`);
  }
  if (reason) out.push(`${pad("reason", 12)}${reason}`);
  out.push(`${pad("source", 12)}${v(r["source"])}`);
  out.push("");
  out.push("replay:");
  out.push(`  ${v(r["replay"])}`);
  if (r["replay_upper"]) out.push(`  ${v(r["replay_upper"])}`);
  out.push("");
  out.push("resolution path:");
  for (const s of payload["resolution"] as { step: string; outcome: string }[]) {
    out.push(`  ${padLeft(s.step, 14)}  ${s.outcome}`);
  }
  return out;
}
