/**
 * Ce qu'on va interroger — decide AVANT le paiement, parce que c'est le plan qui
 * fixe le prix : une unite = une mesure (un couple de cotations), pas une requete.
 *
 * Le modele appelant ne produit aucun nombre : il choisit un hook, un pool, des
 * tailles et des sens. Le plan est la forme lisible de ce choix.
 */
import { loadPoolIndex, loadPools } from "./dataset.js";

export interface PlanTarget {
  pool_id: string | null;
  currency0: string;
  currency1: string;
  fee: number;
  tick_spacing: number;
  hooks: string;
}

export interface PlanItem extends PlanTarget {
  zero_for_one: boolean;
  amount_in: string;
}

export interface Plan {
  ok: boolean;
  error: string | null;
  block: number;
  units: number;
  items: PlanItem[];
  /** comment le pool a ete choisi — jamais implicite */
  resolution: {
    via: "explicit-pool" | "pool_id" | "hook" | "none";
    note: string;
    pools_considered: number;
  };
}

const DEFAULT_SIZE = "1000000000000000"; // 0,001 unite du token 0 (18 decimales)

function isAddress(v: unknown): v is string {
  return typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v.trim());
}

function isPoolId(v: unknown): v is string {
  return typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v.trim());
}

function parseSizes(raw: unknown): { sizes: string[]; error: string | null } {
  if (raw === undefined || raw === null) return { sizes: [DEFAULT_SIZE], error: null };
  const arr = Array.isArray(raw) ? raw : [raw];
  if (arr.length === 0) return { sizes: [DEFAULT_SIZE], error: null };
  const sizes: string[] = [];
  for (const v of arr) {
    const s = String(v).trim();
    if (!/^[0-9]+$/.test(s) || s === "0") return { sizes: [], error: `taille invalide: ${s}` };
    sizes.push(s);
  }
  return { sizes, error: null };
}

function parseDirections(body: Record<string, unknown>): { dirs: boolean[]; error: string | null } {
  if (typeof body.zero_for_one === "boolean") return { dirs: [body.zero_for_one], error: null };
  const raw = body.directions;
  if (raw === undefined || raw === null) return { dirs: [true], error: null };
  const arr = Array.isArray(raw) ? raw : [raw];
  const dirs: boolean[] = [];
  for (const v of arr) {
    const s = String(v).trim();
    if (s === "0->1" || s === "true" || s === "zeroForOne") dirs.push(true);
    else if (s === "1->0" || s === "false" || s === "oneForZero") dirs.push(false);
    else return { dirs: [], error: `sens invalide: ${s}` };
  }
  return { dirs: dirs.length ? dirs : [true], error: null };
}

function fail(error: string, block: number): Plan {
  return {
    ok: false,
    error,
    block,
    units: 0,
    items: [],
    resolution: { via: "none", note: error, pools_considered: 0 },
  };
}

export function buildPlan(
  body: Record<string, unknown>,
  opts: { defaultBlock: number; maxUnits: number },
): Plan {
  const block = Number.isFinite(Number(body.block)) && Number(body.block) > 0
    ? Number(body.block)
    : opts.defaultBlock;

  const { sizes, error: sizeErr } = parseSizes(body.sizes ?? body.amount_in);
  if (sizeErr) return fail(sizeErr, block);
  const { dirs, error: dirErr } = parseDirections(body);
  if (dirErr) return fail(dirErr, block);

  let targets: PlanTarget[] = [];
  let via: Plan["resolution"]["via"] = "none";
  let note = "";
  let considered = 0;

  const explicit = body.pool as Record<string, unknown> | undefined;
  if (explicit && typeof explicit === "object") {
    const { currency0, currency1, fee, tick_spacing, hooks } = explicit as Record<string, unknown>;
    if (!isAddress(currency0) || !isAddress(currency1) || !isAddress(hooks))
      return fail("pool.currency0, pool.currency1 et pool.hooks doivent etre des adresses", block);
    if (!Number.isFinite(Number(fee)) || !Number.isFinite(Number(tick_spacing)))
      return fail("pool.fee et pool.tick_spacing doivent etre des entiers", block);
    targets = [
      {
        pool_id: null,
        currency0: currency0.toLowerCase(),
        currency1: currency1.toLowerCase(),
        fee: Number(fee),
        tick_spacing: Number(tick_spacing),
        hooks: hooks.toLowerCase(),
      },
    ];
    via = "explicit-pool";
    note = "PoolKey fournie telle quelle par l'appelant";
    considered = 1;
  } else if (isPoolId(body.pool_id)) {
    const pid = body.pool_id.toLowerCase();
    const known = loadPoolIndex().get(pid);
    if (!known)
      return fail(
        `pool_id inconnu du jeu de mesures : ${pid}. Fournis "pool" (la PoolKey complete) pour un pool jamais mesure.`,
        block,
      );
    targets = [
      {
        pool_id: known.pool_id,
        currency0: known.currency0,
        currency1: known.currency1,
        fee: known.fee,
        tick_spacing: known.tick_spacing,
        hooks: known.hooks,
      },
    ];
    via = "pool_id";
    note = `PoolKey reconstruite depuis ${known.from}`;
    considered = 1;
  } else if (isAddress(body.hook)) {
    const hook = body.hook.toLowerCase();
    const pools = loadPools().filter((p) => p.hooks === hook);
    considered = pools.length;
    if (pools.length === 0)
      return fail(
        `aucun pool a liquidite non nulle connu pour ce hook : ${hook}. Fournis "pool" pour forcer une PoolKey.`,
        block,
      );
    pools.sort((a, b) => b.liquidity_approx - a.liquidity_approx);
    const wanted = Number(body.pools ?? 1);
    const take = pools.slice(0, Math.max(1, Math.min(Number.isFinite(wanted) ? wanted : 1, pools.length)));
    targets = take.map((p) => ({
      pool_id: null,
      currency0: p.currency0,
      currency1: p.currency1,
      fee: p.fee,
      tick_spacing: p.tick_spacing,
      hooks: p.hooks,
    }));
    via = "hook";
    note = `${take.length} pool(s) retenu(s) sur ${pools.length}, par liquidite approchee decroissante (docs/pools-liquides.json)`;
  } else {
    return fail('il faut "hook", "pool_id" ou "pool" (la PoolKey complete)', block);
  }

  const items: PlanItem[] = [];
  for (const t of targets)
    for (const size of sizes)
      for (const zfo of dirs) items.push({ ...t, zero_for_one: zfo, amount_in: size });

  if (items.length > opts.maxUnits)
    return fail(
      `${items.length} mesures demandees, le maximum est ${opts.maxUnits} par requete`,
      block,
    );

  return {
    ok: true,
    error: null,
    block,
    units: items.length,
    items,
    resolution: { via, note, pools_considered: considered },
  };
}
