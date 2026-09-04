/**
 * tare_lookup — everything already known about one hook, with a label on every line.
 *
 * This tool never measures. It reports what the committed evidence contains and, just as
 * importantly, what it does not: pools carrying this hook that were never measured come back as
 * NOT_MEASURABLE with the reason, not as an absence the reader has to notice.
 */
import type { Store } from "../store.js";
import type { Config } from "../config.js";
import { maskHex, permissions, touchesSwap } from "../hookflags.js";
import {
  replayDatasetHook,
  replayDatasetPoolsForHook,
  replayDatasetRow,
  replayPermissionMask,
} from "../replay.js";
import { directionLabel, pad, padLeft, render, v, type Payload } from "../answer.js";
import type { Label } from "../labels.js";

export interface LookupInput {
  hook: string;
}

export function lookupTool(input: LookupInput, cfg: Config, store: Store) {
  const hook = input.hook.trim().toLowerCase();
  const rows = store.measurementsForHook(hook);
  const pools = store.poolsForHook(hook);

  const measuredPoolIds = new Set(rows.map((r) => r.pool_id));
  const labelCounts: Record<string, number> = {};
  for (const r of rows) labelCounts[r.label] = (labelCounts[r.label] ?? 0) + 1;

  const profiles = pools.map((p) => {
    const rs = rows.filter((r) => r.pool_id === p.pool_id);
    if (rs.length === 0) {
      return {
        pool_id: p.pool_id,
        currency0: p.currency0,
        currency1: p.currency1,
        fee: p.fee,
        tick_spacing: p.tick_spacing,
        fee_is_dynamic: p.fee_is_dynamic,
        liquidity: p.liquidity,
        label: "NOT_MEASURABLE" as Label,
        reason: `absent from docs/measurements-v1.json — the sweep at block ${cfg.defaultBlock} covered static-fee pools only`,
        points: [],
        replay: replayDatasetPoolsForHook(hook),
      };
    }
    const first = rs[0]!;
    return {
      pool_id: p.pool_id,
      currency0: p.currency0,
      currency1: p.currency1,
      fee: p.fee,
      tick_spacing: p.tick_spacing,
      fee_is_dynamic: p.fee_is_dynamic,
      liquidity: p.liquidity,
      stored_lp_fee: first.stored_lp_fee,
      stored_protocol_fee: first.stored_protocol_fee,
      label: null,
      reason: null,
      points: rs.map((r) => ({
        block_number: r.block_number,
        amount_in: r.amount_in,
        zero_for_one: r.zero_for_one,
        direction: directionLabel(r.zero_for_one),
        label: r.label,
        bps: r.bps,
        out_with: r.out_with,
        out_without: r.out_without,
        reason: r.reason,
        stub_hash: r.stub_hash,
        engine_ver: r.engine_ver,
        replay: replayDatasetRow({
          hook,
          poolId: r.pool_id,
          amountIn: r.amount_in,
          zeroForOne: r.zero_for_one,
          block: r.block_number,
        }),
      })),
    };
  });

  // Pools that were measured but are absent from the liquidity file (should be none; stated, not assumed).
  const orphans = [...measuredPoolIds].filter((id) => !pools.some((p) => p.pool_id === id));

  const payload: Payload = {
    tool: "tare_lookup",
    query: { hook },
    hook_permissions: {
      mask: maskHex(hook),
      granted: permissions(hook),
      can_run_during_a_swap: touchesSwap(hook),
      source: "the low 14 bits of the hook address, per v4-core Hooks.sol",
      replay: replayPermissionMask(hook),
    },
    coverage: {
      pools_carrying_this_hook: pools.length,
      pools_with_at_least_one_measurement: measuredPoolIds.size,
      measurement_rows: rows.length,
      label_counts: labelCounts,
      blocks: [...new Set(rows.map((r) => r.block_number))].sort((a, b) => a - b),
      sizes: [...new Set(rows.map((r) => r.amount_in))].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)),
      measured_pools_absent_from_the_liquidity_file: orphans,
    },
    registry: {
      status: "UNAVAILABLE",
      reason:
        "no Uniswap hook-registry snapshot is committed in this checkout (docs/ holds only " +
        "measurements-v1.json and pools-liquides.json), so registry membership is not asserted here",
    },
    profiles,
    provenance: store.dataset.provenance,
    replay: {
      all_measurements: replayDatasetHook(hook),
      all_pools: replayDatasetPoolsForHook(hook),
    },
  };

  const lines: string[] = [];
  lines.push(`hook        ${hook}`);
  lines.push(`permissions ${maskHex(hook)}  ${permissions(hook).join(" ") || "(none)"}`);
  lines.push(`            can run during a swap: ${touchesSwap(hook)}`);
  lines.push(
    `coverage    ${pools.length} pool(s) carry this hook · ${measuredPoolIds.size} measured · ${rows.length} row(s)`,
  );
  lines.push(
    `labels      ${Object.entries(labelCounts)
      .map(([k, n]) => `${k}=${n}`)
      .join("  ") || "(no measurement)"}`,
  );
  lines.push(`registry    UNAVAILABLE — ${v((payload["registry"] as Record<string, unknown>)["reason"])}`);
  lines.push("");
  for (const p of profiles) {
    lines.push(`pool ${p.pool_id}`);
    lines.push(`  ${p.currency0} / ${p.currency1}  fee=${p.fee} tickSpacing=${p.tick_spacing} dynamic=${p.fee_is_dynamic}`);
    lines.push(`  liquidity ${p.liquidity}   stored_lp_fee=${v((p as Record<string, unknown>)["stored_lp_fee"])}`);
    if (p.points.length === 0) {
      lines.push(`  ${pad("NOT_MEASURABLE", 16)}${v(p.reason)}`);
    } else {
      lines.push(`  ${pad("block", 10)}${pad("size", 20)}${pad("dir", 6)}${pad("label", 16)}bps`);
      for (const pt of p.points) {
        lines.push(
          `  ${pad(String(pt.block_number), 10)}${pad(pt.amount_in, 20)}` +
            `${pad(pt.zero_for_one ? "0->1" : "1->0", 6)}${pad(pt.label, 16)}` +
            `${padLeft(pt.bps === null ? "—" : String(pt.bps), 8)}` +
            (pt.reason ? `   ${pt.reason}` : ""),
        );
      }
    }
    lines.push("");
  }
  lines.push("replay:");
  lines.push(`  ${replayDatasetHook(hook)}`);
  lines.push(`  ${replayDatasetPoolsForHook(hook)}`);
  return render(lines, payload);
}
