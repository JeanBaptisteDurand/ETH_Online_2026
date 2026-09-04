/**
 * tare_twins — the same code, or the same hand, at another address.
 *
 * Three relations, three very different levels of evidence, and the tool says which is which.
 *
 *   PERMISSION TWIN   exact, offline, free. A v4 hook's permissions are the low 14 bits of its
 *                     own address, so two hooks with the same 14 bits declare the same rights.
 *                     This is a declaration, not a behaviour: it is a lead, not a verdict.
 *   BYTECODE TWIN     exact, but needs the pinned fork. `eth_getCode` on both addresses, keccak
 *                     the full body, compare. A short read here would invent a twin, so a code
 *                     string that comes back empty or malformed is NOT_MEASURABLE, never "no".
 *   DEPLOYER TWIN     needs a creation-trace index that this checkout does not ship. It is
 *                     reported as NOT_MEASURABLE with the reason, and never guessed from a
 *                     nonce, a prefix or a vibe.
 */
import sha3 from "js-sha3";
import type { Store } from "../store.js";
import type { Config } from "../config.js";
import { maskHex, permissions } from "../hookflags.js";
import { getCode, blockNumber } from "../rpc.js";
import { replayCodeHash, replayPermissionMask } from "../replay.js";
import { pad, render, v, type Payload } from "../answer.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../paths.js";

/**
 * A bytecode twin can only be found inside the set that is probed, so the set is extensible:
 * a JSON array of addresses at docs/hooks-universe.json, or wherever TARE_HOOK_UNIVERSE points.
 * A malformed file is reported, never silently ignored — an empty universe would turn "we did
 * not look" into "there is no twin".
 */
export function extraUniverse(): { addresses: string[]; file: string | null; error: string | null } {
  const file = process.env["TARE_HOOK_UNIVERSE"] ?? join(REPO_ROOT, "docs", "hooks-universe.json");
  if (!existsSync(file)) return { addresses: [], file: null, error: null };
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(parsed)) return { addresses: [], file, error: "not_a_json_array" };
    const addresses = parsed
      .filter((a): a is string => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a))
      .map((a) => a.toLowerCase());
    const skipped = parsed.length - addresses.length;
    return { addresses, file, error: skipped > 0 ? `${skipped}_entries_were_not_addresses` : null };
  } catch (e) {
    return { addresses: [], file, error: `unreadable:${(e as Error).message}` };
  }
}

const { keccak256 } = sha3;

export interface TwinsInput {
  hook: string;
}

export interface CodeProbe {
  address: string;
  status: "OK" | "NOT_MEASURABLE";
  code_size_bytes: number | null;
  code_hash: string | null;
  reason: string | null;
}

export function hashCode(code: string): { size: number; hash: string } | { error: string } {
  if (typeof code !== "string" || !code.startsWith("0x")) return { error: "code_is_not_a_hex_string" };
  const body = code.slice(2);
  if (body.length % 2 !== 0) return { error: "code_hex_has_odd_length_truncated_read" };
  if (body.length === 0) return { error: "no_code_at_this_address" };
  if (!/^[0-9a-fA-F]+$/.test(body)) return { error: "code_is_not_hex" };
  return { size: body.length / 2, hash: "0x" + keccak256(Buffer.from(body, "hex")) };
}

export async function twinsTool(input: TwinsInput, cfg: Config, store: Store) {
  const hook = input.hook.trim().toLowerCase();
  const extra = extraUniverse();
  const universe = [...new Set([hook, ...store.hooks(), ...extra.addresses])].sort();

  // ---- 1. permission twins: exact and offline ------------------------------------------
  const mask = maskHex(hook);
  const permissionTwins = universe
    .filter((h) => h !== hook && maskHex(h) === mask)
    .map((h) => ({
      address: h,
      mask: maskHex(h),
      pools: store.poolsForHook(h).length,
      measurements: store.measurementsForHook(h).length,
    }));

  // ---- 2. bytecode twins: exact, but only if the fork answers --------------------------
  const head = cfg.liveEnabled ? await blockNumber(cfg.rpcUrl) : null;
  let bytecode: Record<string, unknown>;
  const probes: CodeProbe[] = [];
  if (!cfg.liveEnabled) {
    bytecode = { status: "NOT_MEASURABLE", reason: "TARE_LIVE=0 — this server was started with the fork disabled" };
  } else if (head === null) {
    bytecode = {
      status: "NOT_MEASURABLE",
      reason: `the pinned fork at ${cfg.rpcUrl} did not answer eth_blockNumber; run \`docker compose up -d anvil\` in the repository root`,
    };
  } else if (head !== cfg.defaultBlock) {
    bytecode = {
      status: "NOT_MEASURABLE",
      reason: `the fork head is ${head}, not the pinned block ${cfg.defaultBlock}; a codehash from another block is not comparable to this dataset`,
    };
  } else {
    // Probed in parallel: a dozen cold `eth_getCode` calls against a fresh fork are ~15 s in
    // sequence and under 2 s together, and each answer is independent of the others.
    const results = await Promise.all(
      universe.map(async (address): Promise<CodeProbe> => {
        const r = await getCode(cfg.rpcUrl, address, 20000);
        if (!r.ok || r.value === null) {
          return { address, status: "NOT_MEASURABLE", code_size_bytes: null, code_hash: null, reason: v(r.error) };
        }
        const h = hashCode(r.value);
        if ("error" in h) {
          return { address, status: "NOT_MEASURABLE", code_size_bytes: null, code_hash: null, reason: h.error };
        }
        return { address, status: "OK", code_size_bytes: h.size, code_hash: h.hash, reason: null };
      }),
    );
    probes.push(...results);
    const self = probes.find((p) => p.address === hook);
    const twins =
      self && self.status === "OK"
        ? probes.filter((p) => p.address !== hook && p.status === "OK" && p.code_hash === self.code_hash)
        : [];
    bytecode = {
      status: self && self.status === "OK" ? "MEASURED" : "NOT_MEASURABLE",
      block: head,
      rpc: cfg.rpcUrl,
      self,
      twins: twins.map((t) => ({
        address: t.address,
        code_hash: t.code_hash,
        code_size_bytes: t.code_size_bytes,
        pools: store.poolsForHook(t.address).length,
      })),
      universe_probed: probes,
      reason: self && self.status === "OK" ? null : (self?.reason ?? "the queried hook was not probed"),
      replay: replayCodeHash(hook, cfg.rpcUrl),
    };
  }

  // ---- 3. deployer twins: not shippable from this checkout -----------------------------
  const deployer = {
    status: "NOT_MEASURABLE",
    reason:
      "identifying the deployer needs the contract-creation trace for each address (an indexer, " +
      "or a full-archive debug_traceTransaction sweep). This checkout ships neither, and TARE does " +
      "not infer a deployer from an address prefix or a CREATE2 salt it has not verified.",
    what_would_make_it_measurable:
      "a creation-index for the 8453 hooks under study, keyed by address -> (deployer, tx_hash, block)",
  };

  const payload: Payload = {
    tool: "tare_twins",
    query: { hook },
    universe: {
      addresses: universe,
      source:
        "every hook address appearing in docs/pools-liquides.json or docs/measurements-v1.json, " +
        "plus the queried hook" +
        (extra.addresses.length > 0 ? `, plus ${extra.addresses.length} address(es) from ${extra.file}` : ""),
      widen_it:
        "a bytecode twin can only be found inside the set that is probed. Drop a JSON array of " +
        "addresses at docs/hooks-universe.json (or point TARE_HOOK_UNIVERSE at one) and they are " +
        "probed too.",
      size: universe.length,
    },
    permission_twins: {
      status: "MEASURED",
      mask,
      granted: permissions(hook),
      matches: permissionTwins,
      caveat: "identical declared permissions, not identical behaviour",
      replay: replayPermissionMask(hook),
    },
    bytecode_twins: bytecode,
    deployer_twins: deployer,
    provenance: store.dataset.provenance,
  };

  const lines: string[] = [];
  lines.push(`hook        ${hook}`);
  lines.push(`universe    ${universe.length} known hook address(es) from the committed evidence`);
  lines.push("");
  lines.push(`PERMISSION TWINS   MEASURED (offline, from the address bits)`);
  lines.push(`  mask ${mask}  ${permissions(hook).join(" ") || "(none)"}`);
  if (permissionTwins.length === 0) lines.push("  (no other known hook declares the same 14 bits)");
  for (const t of permissionTwins) {
    lines.push(`  ${pad(t.address, 44)}${pad(`pools=${t.pools}`, 12)}measurements=${t.measurements}`);
  }
  lines.push("");
  const bs = bytecode as Record<string, unknown>;
  lines.push(`BYTECODE TWINS     ${v(bs["status"])}`);
  if (bs["status"] === "MEASURED") {
    const self = bs["self"] as CodeProbe;
    lines.push(`  block ${v(bs["block"])} via ${v(bs["rpc"])}`);
    lines.push(`  self  ${self.code_hash}  (${self.code_size_bytes} bytes)`);
    const tw = bs["twins"] as { address: string; code_size_bytes: number | null }[];
    if (tw.length === 0) lines.push("  (no other known hook has byte-identical code at this block)");
    for (const t of tw) lines.push(`  ${pad(t.address, 44)}${t.code_size_bytes} bytes — identical`);
    lines.push(`  replay: ${v(bs["replay"])}`);
  } else {
    lines.push(`  reason: ${v(bs["reason"])}`);
  }
  lines.push("");
  lines.push(`DEPLOYER TWINS     NOT_MEASURABLE`);
  lines.push(`  reason: ${deployer.reason}`);
  return render(lines, payload);
}
