/**
 * Consultation de la table pre-calculee.
 *
 * La garde ne mesure pas : mesurer coute ~9 s a froid (deux cotations, anvil_setCode, puis la
 * restauration du bytecode) et un seul mesureur peut tourner par noeud, parce que le stub est
 * de l'etat global. Un portefeuille attend une reponse en moins d'une seconde. La garde
 * consulte donc data/table.json, construit par scripts/build-table.mjs a partir des 995 mesures
 * du bloc 50 614 000, et elle porte ce bloc partout.
 *
 * Regle dure n.2 : rien n'est promu. Un pool absent reste NOT_MEASURABLE meme si son hook a ete
 * mesure ailleurs — on montre alors ce que le hook a fait ailleurs, en le nommant pour ce que
 * c'est : un faisceau, pas une mesure de ce pool-ci.
 */
import type { HookContext, Label, TableHit } from "./types.js";

export interface TablePoint {
  amount_in: string;
  bps: number | null;
  label: Label;
  reason: string | null;
  block_number: number;
  chain_id: number;
}

export interface TablePool {
  hook: string;
  currency0: string;
  currency1: string;
  fee: number;
  tick_spacing: number;
  fee_is_dynamic: boolean | null;
  stored_lp_fee: number | null;
  dirs: Record<string, TablePoint[]>;
}

export interface TableHook {
  n: number;
  labels: Record<string, number>;
  n_pools: number;
  pools: string[];
  measured: {
    n: number;
    bps_min: number;
    bps_median: number;
    bps_max: number;
    worst: { bps: number; pool_id: string; amount_in: string; direction: string; label: Label; block_number: number; chain_id: number };
  } | null;
}

export interface GuardTable {
  schema: string;
  generated_at: string;
  source: string;
  source_sha256?: string;
  engine_ver: string | null;
  stub_hash: string | null;
  chain_id: number;
  block_number: number;
  blocks: number[];
  n_measurements: number;
  n_hooks: number;
  n_pools: number;
  hooks: Record<string, TableHook>;
  pools: Record<string, TablePool>;
}

export class BadTable extends Error {}

/** Refuse une table qui n'a pas la forme attendue : mieux vaut ne pas demarrer que repondre a cote. */
export function assertTable(t: unknown): GuardTable {
  if (!t || typeof t !== "object") throw new BadTable("table absente");
  const x = t as Partial<GuardTable>;
  if (x.schema !== "tare-guard-table/1") throw new BadTable(`schema inattendu: ${String(x.schema)}`);
  if (!x.pools || typeof x.pools !== "object") throw new BadTable("table.pools manquant");
  if (!x.hooks || typeof x.hooks !== "object") throw new BadTable("table.hooks manquant");
  if (typeof x.block_number !== "number" || x.block_number <= 0) throw new BadTable("table.block_number manquant");
  return t as GuardTable;
}

function hit(poolId: string, hook: string, direction: string, p: TablePoint): TableHit {
  return {
    poolId,
    hook,
    direction: direction === "0->1" ? "0->1" : "1->0",
    amountIn: p.amount_in,
    bps: p.bps,
    label: p.label,
    reason: p.reason,
    blockNumber: p.block_number,
    chainId: p.chain_id,
  };
}

export function hookContext(table: GuardTable, hook: string): HookContext | null {
  const h = table.hooks[hook.toLowerCase()];
  if (!h) return null;
  return {
    hook: hook.toLowerCase(),
    nMeasurements: h.n,
    nPools: h.n_pools,
    labels: h.labels,
    measured: h.measured
      ? {
          n: h.measured.n,
          bpsMin: h.measured.bps_min,
          bpsMedian: h.measured.bps_median,
          bpsMax: h.measured.bps_max,
          worst: {
            poolId: h.measured.worst.pool_id,
            hook: hook.toLowerCase(),
            direction: h.measured.worst.direction === "0->1" ? "0->1" : "1->0",
            amountIn: h.measured.worst.amount_in,
            bps: h.measured.worst.bps,
            label: h.measured.worst.label,
            reason: null,
            blockNumber: h.measured.worst.block_number,
            chainId: h.measured.worst.chain_id,
          },
        }
      : null,
  };
}

export interface Consultation {
  label: Label;
  bps: number | null;
  reason: string | null;
  basis: "exact" | "interpolated" | "evidence" | "none";
  citations: TableHit[];
  hookContext: HookContext | null;
}

/**
 * Ce que la table sait dire de CE pool, dans CE sens, a CETTE taille.
 *
 * `amountIn` a null (chemin multi-saut, ou OPEN_DELTA) n'est pas une taille nulle : on refuse
 * de choisir un point et on rend tout le profil en faisceau.
 */
export function consult(
  table: GuardTable,
  poolId: string,
  hook: string,
  direction: "0->1" | "1->0",
  amountIn: string | null,
): Consultation {
  const ctx = hookContext(table, hook);
  const pool = table.pools[poolId.toLowerCase()];

  if (!pool) {
    return {
      label: "NOT_MEASURABLE",
      bps: null,
      reason: ctx ? "pool_absent_de_la_table:hook_mesure_ailleurs" : "pool_absent_de_la_table",
      basis: ctx?.measured ? "evidence" : "none",
      citations: ctx?.measured ? [ctx.measured.worst] : [],
      hookContext: ctx,
    };
  }

  const points = pool.dirs[direction] ?? [];
  if (points.length === 0) {
    const other = direction === "0->1" ? "1->0" : "0->1";
    const alt = pool.dirs[other] ?? [];
    return {
      label: "NOT_MEASURABLE",
      bps: null,
      reason: `sens_non_mesure:${direction}`,
      basis: alt.length ? "evidence" : ctx?.measured ? "evidence" : "none",
      citations: alt.length ? alt.map((p) => hit(poolId, pool.hook, other, p)) : ctx?.measured ? [ctx.measured.worst] : [],
      hookContext: ctx,
    };
  }

  if (amountIn === null) {
    return {
      label: "NOT_MEASURABLE",
      bps: null,
      reason: "taille_absente_du_calldata:profil_complet_en_faisceau",
      basis: "evidence",
      citations: points.map((p) => hit(poolId, pool.hook, direction, p)),
      hookContext: ctx,
    };
  }

  const want = BigInt(amountIn);

  const exact = points.find((p) => BigInt(p.amount_in) === want);
  if (exact) {
    return {
      label: exact.label,
      bps: exact.bps,
      reason: exact.reason,
      basis: "exact",
      citations: [hit(poolId, pool.hook, direction, exact)],
      hookContext: ctx,
    };
  }

  const lo = points[0]!;
  const hi = points[points.length - 1]!;
  if (want < BigInt(lo.amount_in) || want > BigInt(hi.amount_in)) {
    const near = want < BigInt(lo.amount_in) ? lo : hi;
    return {
      label: "NOT_MEASURABLE",
      bps: null,
      reason: `taille_hors_plage_mesuree:[${lo.amount_in},${hi.amount_in}]`,
      basis: "evidence",
      citations: [hit(poolId, pool.hook, direction, near)],
      hookContext: ctx,
    };
  }

  let left = lo;
  let right = hi;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (BigInt(a.amount_in) <= want && want <= BigInt(b.amount_in)) {
      left = a;
      right = b;
      break;
    }
  }
  const cites = [hit(poolId, pool.hook, direction, left), hit(poolId, pool.hook, direction, right)];

  if (left.bps === null || right.bps === null || left.label === "NOT_QUOTABLE" || right.label === "NOT_QUOTABLE") {
    return {
      label: "NOT_MEASURABLE",
      bps: null,
      reason: `encadrants_non_numeriques:${left.label}/${right.label}`,
      basis: "evidence",
      citations: cites,
      hookContext: ctx,
    };
  }

  // Les tailles du balayage sont espacees en puissances de dix : on interpole en log10(taille),
  // ce qui suit la forme reelle des profils. Les deux points encadrants sont cites, verifiables.
  const la = Math.log10(Number(left.amount_in));
  const lb = Math.log10(Number(right.amount_in));
  const lw = Math.log10(Number(want));
  const t = lb === la ? 0 : (lw - la) / (lb - la);
  const bps = left.bps + t * (right.bps - left.bps);

  return {
    label: "INTERPOLATED",
    bps: Math.round(bps * 1e4) / 1e4,
    reason: `interpole_log10_entre:${left.amount_in}..${right.amount_in}`,
    basis: "interpolated",
    citations: cites,
    hookContext: ctx,
  };
}
