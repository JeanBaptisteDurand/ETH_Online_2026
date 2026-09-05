/**
 * LE MODELE DE LECTURE de l'assistant.
 *
 * Une seule vue, construite une fois par version du jeu de donnees, sur laquelle
 * toutes les actions s'executent. Elle porte les grandeurs (le JSONL) et ce que le
 * registre officiel en dit — sans jamais confondre les deux.
 *
 * Trois etats distincts pour "ce que le registre dit", jamais melanges :
 *   registry_available=false            -> aucun fichier de registre : on ne sait pas
 *   registry_available=true, in=false   -> le hook est ABSENT du registre officiel
 *   registry_available=true, in=true    -> la fiche officielle, telle quelle
 *
 * Regle dure n.3 : une lecture incomplete (ligne rejetee, source vide) rend
 * `complete=false`. Tout ce qui en sort est alors etiquete NOT_MEASURABLE et
 * l'assistant refuse de citer un nombre. Ce projet a produit cinq faux resultats
 * en concluant sur une lecture tronquee ; ce champ existe pour ca.
 */
import { loadDataset, loadRegistry, loadPools, type Dataset, type Registry } from "../dataset.js";
import type { Measurement } from "../measurement.js";
import type { Label } from "../labels.js";
import { decodeFlags, canAlterSwapOutput } from "./flags.js";
import type { FlagName } from "./actions.js";

/** En dessous, on considere qu'on n'a rien vu passer. Un seuil affiche, jamais cache. */
export const NEGLIGIBLE_BPS = 1;
/** Un profil est "non plat" si l'ecart entre sa plus petite et sa plus grande valeur depasse ca. */
export const NON_FLAT_BPS = 5;

export interface RegistryView {
  name: string | null;
  chain: string | null;
  chain_id: number | null;
  description: string | null;
  deployer: string | null;
  verified_source: boolean | null;
  audit_url: string | null;
  vanilla_swap: boolean | null;
  dynamic_fee: boolean | null;
  upgradeable: boolean | null;
  requires_custom_swap_data: boolean | null;
  swap_access: string | null;
  flags: Partial<Record<FlagName, boolean>>;
}

export interface PointView {
  id: string;
  amount_in: string;
  direction: "0->1" | "1->0";
  zero_for_one: boolean;
  bps: number | null;
  label: Label;
  reason: string | null;
  block_number: number;
  replay: string;
}

export interface ProfileView {
  hook: string;
  pool_id: string;
  currency0: string | null;
  currency1: string | null;
  key_fee: number | null;
  tick_spacing: number | null;
  fee_is_dynamic: boolean | null;
  stored_lp_fee: number | null;
  stored_protocol_fee: number | null;
  blocks: number[];
  points: PointView[];
  measured: number;
  max_bps: number | null;
  min_bps: number | null;
  /** l'ecart max-min sur les points MEASURED d'un meme sens */
  spread_bps: number | null;
  non_flat: boolean;
  labels: Partial<Record<Label, number>>;
}

export type DisagreementKind =
  | "registry-says-not-vanilla-but-nothing-measured"
  | "registry-says-vanilla-but-measured-takes"
  | null;

export interface HookView {
  hook: string;
  chain_id: number;
  blocks: number[];
  measurements: number;
  measured: number;
  pools: number;
  pools_measured: number;
  labels: Partial<Record<Label, number>>;
  max_bps: number | null;
  min_bps: number | null;
  /** la mesure qui porte le maximum : sans elle le nombre ne se rejoue pas */
  max_measurement: PointView | null;
  registry_available: boolean;
  in_registry: boolean | null;
  registry: RegistryView | null;
  flags: { bitmap: number; active: FlagName[]; can_alter_swap_output: boolean };
  profiles: ProfileView[];
  non_flat_profiles: number;
  /** desaccord registre/mesure. `null` quand on ne sait pas — ce n'est pas "pas de desaccord". */
  disagreement: { is: boolean | null; kind: DisagreementKind; note: string };
}

export interface StoreView {
  hooks: HookView[];
  byHook: Map<string, HookView>;
  byMeasurement: Map<string, Measurement>;
  profiles: ProfileView[];
  /** lecture integrale ? sinon aucun nombre ne sort d'ici */
  complete: boolean;
  incomplete_reason: string | null;
  dataset: {
    source: string;
    source_kind: Dataset["source_kind"];
    measurements: number;
    hooks: number;
    pools: number;
    blocks: number[];
    rejected_lines: number;
    loaded_at: string;
  };
  registry: { available: boolean; path: string | null; entries: number };
  pools_with_liquidity: number;
}

/* ------------------------------------------------------------- extraction */

function b(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function s(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function readRegistry(fields: Record<string, unknown>): RegistryView {
  const nest = (k: string): Record<string, unknown> => {
    const v = fields[k];
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : fields;
  };
  const h = nest("hook");
  const p = nest("properties");
  const f = nest("flags");
  const flags: Partial<Record<FlagName, boolean>> = {};
  for (const [k, v] of Object.entries(f)) if (typeof v === "boolean") flags[k as FlagName] = v;
  return {
    name: s(h.name),
    chain: s(h.chain),
    chain_id: typeof h.chainId === "number" ? h.chainId : null,
    description: s(h.description),
    deployer: s(h.deployer),
    verified_source: b(h.verifiedSource),
    audit_url: s(h.auditUrl),
    vanilla_swap: b(p.vanillaSwap),
    dynamic_fee: b(p.dynamicFee),
    upgradeable: b(p.upgradeable),
    requires_custom_swap_data: b(p.requiresCustomSwapData),
    swap_access: s(p.swapAccess),
    flags,
  };
}

function pointOf(m: Measurement): PointView {
  return {
    id: m.id,
    amount_in: m.amount_in,
    direction: m.direction,
    zero_for_one: m.zero_for_one,
    bps: m.bps,
    label: m.label,
    reason: m.reason,
    block_number: m.block_number,
    replay: m.replay.command_exact,
  };
}

function buildProfile(hook: string, pool_id: string, ms: Measurement[]): ProfileView {
  const first = ms[0]!;
  const labels: Partial<Record<Label, number>> = {};
  for (const m of ms) labels[m.label] = (labels[m.label] ?? 0) + 1;

  const points = ms
    .slice()
    .sort((a, c) => {
      if (a.zero_for_one !== c.zero_for_one) return a.zero_for_one ? -1 : 1;
      const d = BigInt(a.amount_in) - BigInt(c.amount_in);
      return d < 0n ? -1 : d > 0n ? 1 : 0;
    })
    .map(pointOf);

  const measured = points.filter((p) => p.bps !== null);
  // Le "non plat" se juge a sens constant : comparer 0->1 et 1->0 melangerait
  // deux courbes differentes et inventerait un ecart qui n'existe pas.
  let spread: number | null = null;
  for (const zfo of [true, false]) {
    const side = measured.filter((p) => p.zero_for_one === zfo).map((p) => p.bps!);
    if (side.length < 2) continue;
    const d = Math.max(...side) - Math.min(...side);
    spread = spread === null ? d : Math.max(spread, d);
  }

  return {
    hook,
    pool_id,
    currency0: first.currency0,
    currency1: first.currency1,
    key_fee: first.key_fee,
    tick_spacing: first.tick_spacing,
    fee_is_dynamic: first.fee_is_dynamic,
    stored_lp_fee: first.stored_lp_fee,
    stored_protocol_fee: first.stored_protocol_fee,
    blocks: [...new Set(ms.map((m) => m.block_number))].sort((a, c) => a - c),
    points,
    measured: measured.length,
    max_bps: measured.length ? Math.max(...measured.map((p) => p.bps!)) : null,
    min_bps: measured.length ? Math.min(...measured.map((p) => p.bps!)) : null,
    spread_bps: spread,
    non_flat: spread !== null && spread > NON_FLAT_BPS,
    labels,
  };
}

function judge(
  reg: RegistryView | null,
  available: boolean,
  maxBps: number | null,
  measured: number,
): HookView["disagreement"] {
  if (!available)
    return { is: null, kind: null, note: "aucun registre charge : rien a confronter" };
  if (!reg)
    return {
      is: null,
      kind: null,
      note: "hook absent du registre officiel : il n'y a pas d'affirmation a contredire",
    };
  if (reg.vanilla_swap === null)
    return { is: null, kind: null, note: "le registre ne se prononce pas sur vanillaSwap" };
  if (measured === 0 || maxBps === null)
    return {
      is: null,
      kind: null,
      note: "aucune mesure MEASURED sur ce hook : NOT_MEASURABLE, pas un zero",
    };
  if (reg.vanilla_swap === false && maxBps < NEGLIGIBLE_BPS)
    return {
      is: true,
      kind: "registry-says-not-vanilla-but-nothing-measured",
      note: `le registre dit vanillaSwap=false, et le maximum mesure reste sous le seuil de ${NEGLIGIBLE_BPS} bps`,
    };
  if (reg.vanilla_swap === true && maxBps >= NEGLIGIBLE_BPS)
    return {
      is: true,
      kind: "registry-says-vanilla-but-measured-takes",
      note: `le registre dit vanillaSwap=true, et la mesure voit passer au moins ${NEGLIGIBLE_BPS} bps`,
    };
  return { is: false, kind: null, note: "le registre et la mesure vont dans le meme sens" };
}

/* ---------------------------------------------------------------- montage */

function build(ds: Dataset, reg: Registry, poolsWithLiquidity: number): StoreView {
  const available = reg.path !== null && reg.count > 0;
  const hooks: HookView[] = [];
  const profiles: ProfileView[] = [];
  const byMeasurement = new Map<string, Measurement>();
  const allBlocks = new Set<number>();
  const allPools = new Set<string>();

  for (const [hook, list] of ds.byHook) {
    const byPool = new Map<string, Measurement[]>();
    const labels: Partial<Record<Label, number>> = {};
    for (const m of list) {
      byMeasurement.set(m.id, m);
      labels[m.label] = (labels[m.label] ?? 0) + 1;
      allBlocks.add(m.block_number);
      allPools.add(m.pool_id);
      const arr = byPool.get(m.pool_id);
      if (arr) arr.push(m);
      else byPool.set(m.pool_id, [m]);
    }

    const hookProfiles = [...byPool.entries()]
      .map(([pool_id, ms]) => buildProfile(hook, pool_id, ms))
      .sort((a, c) => (c.max_bps ?? -1) - (a.max_bps ?? -1));
    profiles.push(...hookProfiles);

    const measuredPoints = hookProfiles.flatMap((p) => p.points).filter((p) => p.bps !== null);
    const max = measuredPoints.reduce<PointView | null>(
      (best, p) => (best === null || p.bps! > best.bps! ? p : best),
      null,
    );
    const min = measuredPoints.length ? Math.min(...measuredPoints.map((p) => p.bps!)) : null;
    const entry = reg.entries.get(hook);
    const view = entry ? readRegistry(entry.fields) : null;

    hooks.push({
      hook,
      chain_id: list[0]!.chain_id,
      blocks: [...new Set(list.map((m) => m.block_number))].sort((a, c) => a - c),
      measurements: list.length,
      measured: measuredPoints.length,
      pools: byPool.size,
      pools_measured: hookProfiles.filter((p) => p.measured > 0).length,
      labels,
      max_bps: max?.bps ?? null,
      min_bps: min,
      max_measurement: max,
      registry_available: available,
      in_registry: available ? Boolean(entry) : null,
      registry: view,
      flags: {
        ...decodeFlags(hook),
        can_alter_swap_output: canAlterSwapOutput(hook),
      },
      profiles: hookProfiles,
      non_flat_profiles: hookProfiles.filter((p) => p.non_flat).length,
      disagreement: judge(view, available, max?.bps ?? null, measuredPoints.length),
    });
  }

  hooks.sort((a, c) => {
    if (a.max_bps === null && c.max_bps === null) return c.measurements - a.measurements;
    if (a.max_bps === null) return 1;
    if (c.max_bps === null) return -1;
    if (c.max_bps !== a.max_bps) return c.max_bps - a.max_bps;
    return c.measurements - a.measurements;
  });

  const incomplete =
    ds.source_kind === "empty"
      ? "aucune source de mesures chargee"
      : ds.rejected.length > 0
        ? `${ds.rejected.length} ligne(s) du jeu illisibles : la lecture est partielle`
        : null;

  return {
    hooks,
    byHook: new Map(hooks.map((h) => [h.hook, h])),
    byMeasurement,
    profiles,
    complete: incomplete === null,
    incomplete_reason: incomplete,
    dataset: {
      source: ds.source,
      source_kind: ds.source_kind,
      measurements: ds.measurements.length,
      hooks: hooks.length,
      pools: allPools.size,
      blocks: [...allBlocks].sort((a, c) => a - c),
      rejected_lines: ds.rejected.length,
      loaded_at: ds.loaded_at,
    },
    registry: { available, path: reg.path, entries: reg.count },
    pools_with_liquidity: poolsWithLiquidity,
  };
}

/* ------------------------------------------------------------------ cache */

let cache: { ds: Dataset; reg: Registry; pools: number; value: StoreView } | null = null;
let builds = 0;

/**
 * La vue est construite UNE fois par version du jeu, pas une fois par requete HTTP.
 * (Le RAG COBOL de reference reconstruisait son graphe a chaque appel : 102 ms de CPU
 * brules pour une requete a 0,09 ms. On ne reprend pas ce bug.)
 * `loadDataset()` et `loadRegistry()` rendent le MEME objet tant que le mtime ne bouge
 * pas : comparer les references suffit, et c'est exact.
 */
export function getStore(): StoreView {
  const ds = loadDataset();
  const reg = loadRegistry();
  const pools = loadPools().length;
  if (cache && cache.ds === ds && cache.reg === reg && cache.pools === pools) return cache.value;
  const value = build(ds, reg, pools);
  builds += 1;
  cache = { ds, reg, pools, value };
  return value;
}

/** Compteur de constructions — un test s'en sert pour prouver que le cache tient. */
export function storeBuildCount(): number {
  return builds;
}

export function resetStore(): void {
  cache = null;
}
