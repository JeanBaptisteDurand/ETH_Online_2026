/**
 * tare_impact — the blast radius: which pools carry this hook, which tokens sit behind them, and
 * how much of that surface has actually been measured.
 *
 * Two things this tool refuses to do.
 *
 *   * It never sums liquidity. `pools-liquides.json` stores in-range uint128 liquidity, which is
 *     denominated in the pool's own pair. Adding two of them produces a number with no unit —
 *     a fabricated aggregate that would look authoritative on a slide.
 *   * It never presents the measured pools as the whole surface. Unmeasured pools are listed as
 *     NOT_MEASURABLE, with the reason, and counted separately.
 *
 * The min / median / max it does report are computed from the exact list of bps values printed
 * in the same response, so the reader can recompute them by hand.
 */
import type { Store } from "../store.js";
import type { Config } from "../config.js";
import { maskHex, permissions, touchesSwap } from "../hookflags.js";
import { replayBpsValues, replayDatasetHook, replayDatasetPoolsForHook, replayPermissionMask } from "../replay.js";
import { pad, padLeft, render, v, type Payload } from "../answer.js";

export interface ImpactInput {
  hook: string;
}

export function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  const a = sorted[mid - 1] as number;
  const b = sorted[mid] as number;
  // An even-length median is the mean of the two middle observations; both are printed above it.
  return Math.round(((a + b) / 2) * 1e4) / 1e4;
}

export function impactTool(input: ImpactInput, cfg: Config, store: Store) {
  const hook = input.hook.trim().toLowerCase();
  const pools = store.poolsForHook(hook);
  const rows = store.measurementsForHook(hook);

  const tokenCounts = new Map<string, number>();
  for (const p of pools) {
    for (const t of [p.currency0, p.currency1]) tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 1);
  }
  const tokens = [...tokenCounts.entries()]
    .map(([address, pools_touched]) => ({ address, pools_touched }))
    .sort((a, b) => b.pools_touched - a.pools_touched || a.address.localeCompare(b.address));

  const measuredIds = new Set(rows.map((r) => r.pool_id));
  const exposed = pools.map((p) => {
    const rs = rows.filter((r) => r.pool_id === p.pool_id);
    const measured = rs.filter((r) => r.label === "MEASURED" && r.bps !== null);
    return {
      pool_id: p.pool_id,
      currency0: p.currency0,
      currency1: p.currency1,
      liquidity: p.liquidity,
      fee_is_dynamic: p.fee_is_dynamic,
      status: rs.length === 0 ? "NOT_MEASURABLE" : "COVERED",
      reason:
        rs.length === 0
          ? `no row in docs/measurements-v1.json at block ${cfg.defaultBlock}`
          : null,
      measured_bps: measured.map((r) => ({
        amount_in: r.amount_in,
        zero_for_one: r.zero_for_one,
        bps: r.bps,
        block_number: r.block_number,
      })),
      not_quotable_rows: rs.filter((r) => r.label === "NOT_QUOTABLE").length,
    };
  });

  const bpsValues = rows
    .filter((r) => r.label === "MEASURED" && r.bps !== null)
    .map((r) => r.bps as number)
    .sort((a, b) => a - b);

  const payload: Payload = {
    tool: "tare_impact",
    query: { hook },
    hook_permissions: {
      mask: maskHex(hook),
      granted: permissions(hook),
      can_run_during_a_swap: touchesSwap(hook),
      source: "the low 14 bits of the hook address, per v4-core Hooks.sol",
      replay: replayPermissionMask(hook),
    },
    radius: {
      pools_carrying_this_hook: pools.length,
      pools_covered_by_a_measurement: measuredIds.size,
      pools_not_measurable: pools.length - measuredIds.size,
      distinct_tokens_exposed: tokens.length,
      note:
        "liquidity is uint128 in-range liquidity, denominated per pool. It is listed per pool and " +
        "deliberately never summed: the sum would carry no unit.",
    },
    extraction_on_the_measured_subset:
      bpsValues.length === 0
        ? { status: "NOT_MEASURABLE", reason: "no MEASURED row for this hook", values: [] }
        : {
            status: "MEASURED",
            n: bpsValues.length,
            min: bpsValues[0],
            median: median(bpsValues),
            max: bpsValues[bpsValues.length - 1],
            values: bpsValues,
            derived_from: "the `values` array in this response, which is the full list of MEASURED bps rows",
          },
    tokens,
    pools: exposed,
    provenance: store.dataset.provenance,
    replay: {
      pools: replayDatasetPoolsForHook(hook),
      measurements: replayDatasetHook(hook),
      bps_values: replayBpsValues(hook),
    },
  };

  const lines: string[] = [];
  lines.push(`hook        ${hook}`);
  lines.push(`permissions ${maskHex(hook)}  ${permissions(hook).join(" ") || "(none)"}`);
  lines.push("");
  lines.push(`blast radius`);
  lines.push(`  pools carrying this hook        ${pools.length}`);
  lines.push(`  pools with a measurement        ${measuredIds.size}`);
  lines.push(`  pools NOT_MEASURABLE            ${pools.length - measuredIds.size}`);
  lines.push(`  distinct tokens exposed         ${tokens.length}`);
  lines.push("");
  const ex = payload["extraction_on_the_measured_subset"] as Record<string, unknown>;
  if (ex["status"] === "MEASURED") {
    lines.push(`extraction on the measured subset (bps, MEASURED rows only, n=${v(ex["n"])})`);
    lines.push(`  min ${v(ex["min"])}   median ${v(ex["median"])}   max ${v(ex["max"])}`);
  } else {
    lines.push(`extraction on the measured subset   NOT_MEASURABLE — ${v(ex["reason"])}`);
  }
  lines.push("");
  lines.push(`tokens exposed (pools touched)`);
  for (const t of tokens) lines.push(`  ${pad(t.address, 44)}${padLeft(String(t.pools_touched), 4)}`);
  lines.push("");
  lines.push(`pools`);
  lines.push(`  ${pad("pool_id", 68)}${pad("status", 16)}liquidity (uint128, per pool, never summed)`);
  for (const p of exposed) {
    lines.push(`  ${pad(p.pool_id, 68)}${pad(p.status, 16)}${p.liquidity}`);
    if (p.reason) lines.push(`  ${" ".repeat(68)}reason: ${p.reason}`);
  }
  lines.push("");
  lines.push("replay:");
  lines.push(`  ${replayDatasetPoolsForHook(hook)}`);
  lines.push(`  ${replayDatasetHook(hook)}`);
  return render(lines, payload);
}
