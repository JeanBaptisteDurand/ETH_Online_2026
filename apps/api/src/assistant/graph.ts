/**
 * LE GRAPHE DE STRUCTURE.
 *
 * Le JSONL porte les GRANDEURS (combien un hook prend). Le graphe porte la STRUCTURE
 * (qui touche quoi, qui ressemble a qui, qui manque a l'appel). L'assistant interroge
 * les deux et ne melange jamais leurs reponses : une arete n'est pas une mesure.
 *
 * Le graphe est construit UNE fois par version du jeu et garde en cache. Le lot F
 * publiera peut-etre un graphe plus riche ; l'assistant le prendra alors par
 * `setGraphProvider()` sans que rien d'autre ne bouge.
 *
 * Aucun nombre de ce fichier n'est une mesure : ce sont des DENOMBREMENTS exacts
 * (combien de pools, combien de jumeaux). Ils portent quand meme leur provenance.
 */
import { loadRegistry } from "../dataset.js";
import { decodeFlags, HOOK_FLAG_BITS } from "./flags.js";
import { getStore, type StoreView, type HookView } from "./store.js";
import type { FlagName } from "./actions.js";

export interface TwinView {
  hook: string;
  name: string | null;
  chain: string | null;
  measured: boolean;
  /** ce que TARE en sait : null quand le hook n'a jamais ete mesure */
  max_bps: number | null;
  max_measurement_id: string | null;
  same_bitmap: boolean;
  same_name: boolean;
}

export interface BlastRadius {
  hook: string;
  pools: string[];
  pools_measured: string[];
  tokens: string[];
  measurements: number;
  measured: number;
  blocks: number[];
  /**
   * Pools connus a liquidite non nulle pour ce hook (docs/pools-liquides.json).
   * On donne leur NOMBRE, jamais leur liquidite : ce fichier stocke la liquidite en
   * nombre JSON, donc au-dela de 2^53 la valeur exacte est deja perdue a la lecture.
   */
  pools_with_liquidity_known: number;
}

export interface DeployerView {
  hook: string;
  registry_available: boolean;
  in_registry: boolean | null;
  deployer: string | null;
  /** pourquoi il n'y a pas de reponse, quand il n'y en a pas */
  note: string;
  siblings: { hook: string; name: string | null; measured: boolean }[];
}

export interface Contradiction {
  hook: string;
  name: string | null;
  kind: NonNullable<import("./store.js").DisagreementKind>;
  note: string;
  registry_says: { vanillaSwap: boolean | null; swapAccess: string | null };
  measured_max_bps: number | null;
  measurement_id: string | null;
}

export interface Unknowable {
  hook: string;
  name: string | null;
  reason: string;
  labels: Partial<Record<string, number>>;
}

export interface FlagMismatch {
  hook: string;
  flag: FlagName;
  address_bit: boolean;
  registry_says: boolean;
}

export interface Orphans {
  /** mesures en main, mais le registre officiel ne connait pas ce hook */
  measured_not_in_registry: { hook: string; measurements: number; max_bps: number | null }[];
  /** le registre le connait sur la chaine mesuree, TARE ne l'a jamais interroge */
  in_registry_never_measured: { hook: string; name: string | null; chain: string | null }[];
  /** pools presents dans le jeu sans une seule valeur exploitable */
  pools_without_measurement: { pool_id: string; hook: string; measurements: number; labels: Partial<Record<string, number>> }[];
  registry_available: boolean;
  chain_scope: string | null;
}

export interface GraphView {
  twins: (hook: string) => TwinView[];
  blastRadius: (hook: string) => BlastRadius | null;
  deployer: (hook: string) => DeployerView;
  contradictions: () => { confirmed: Contradiction[]; unknowable: Unknowable[]; flag_mismatches: FlagMismatch[] };
  orphans: () => Orphans;
  stats: { hooks: number; pools: number; tokens: number; edges: number; registry_entries: number };
}

interface RegistryLite {
  address: string;
  name: string | null;
  chain: string | null;
  deployer: string | null;
  bitmap: number;
  flags: Partial<Record<FlagName, boolean>>;
}

/** La chaine que le jeu de mesures couvre, deduite du jeu — jamais codee en dur. */
const CHAIN_BY_ID: Record<number, string> = {
  1: "ethereum",
  8453: "base",
  42161: "arbitrum",
  10: "optimism",
  130: "unichain",
  137: "polygon",
  56: "bnb",
};

function buildGraph(store: StoreView): GraphView {
  const reg = loadRegistry();
  const lite: RegistryLite[] = [];
  for (const [address, entry] of reg.entries) {
    const f = entry.fields as Record<string, unknown>;
    const h = (f.hook && typeof f.hook === "object" ? f.hook : f) as Record<string, unknown>;
    const fl = (f.flags && typeof f.flags === "object" ? f.flags : {}) as Record<string, unknown>;
    const flags: Partial<Record<FlagName, boolean>> = {};
    for (const [k, v] of Object.entries(fl)) if (typeof v === "boolean") flags[k as FlagName] = v;
    lite.push({
      address,
      name: typeof h.name === "string" && h.name.trim() !== "" ? h.name : null,
      chain: typeof h.chain === "string" ? h.chain : null,
      deployer:
        typeof h.deployer === "string" && h.deployer.trim() !== "" ? h.deployer.toLowerCase() : null,
      bitmap: decodeFlags(address).bitmap,
      flags,
    });
  }
  const byAddress = new Map(lite.map((l) => [l.address, l]));

  /* index structure : hook -> pools -> tokens */
  const poolsOf = new Map<string, Set<string>>();
  const tokensOf = new Map<string, Set<string>>();
  const allTokens = new Set<string>();
  let edges = 0;
  for (const h of store.hooks) {
    const pools = new Set<string>();
    const tokens = new Set<string>();
    for (const p of h.profiles) {
      pools.add(p.pool_id);
      if (p.currency0) tokens.add(p.currency0);
      if (p.currency1) tokens.add(p.currency1);
      edges += 1 + (p.currency0 ? 1 : 0) + (p.currency1 ? 1 : 0);
    }
    for (const t of tokens) allTokens.add(t);
    poolsOf.set(h.hook, pools);
    tokensOf.set(h.hook, tokens);
  }

  const chainScope = (() => {
    const ids = new Set(store.hooks.map((h) => h.chain_id));
    if (ids.size !== 1) return null;
    const only = [...ids][0]!;
    return CHAIN_BY_ID[only] ?? null;
  })();

  const twins = (hook: string): TwinView[] => {
    const self = byAddress.get(hook);
    const bitmap = decodeFlags(hook).bitmap;
    const out: TwinView[] = [];
    for (const l of lite) {
      if (l.address === hook) continue;
      const sameBitmap = l.bitmap === bitmap;
      const sameName = Boolean(self?.name && l.name && self.name === l.name);
      if (!sameBitmap && !sameName) continue;
      const measured = store.byHook.get(l.address);
      out.push({
        hook: l.address,
        name: l.name,
        chain: l.chain,
        measured: Boolean(measured),
        max_bps: measured?.max_bps ?? null,
        max_measurement_id: measured?.max_measurement?.id ?? null,
        same_bitmap: sameBitmap,
        same_name: sameName,
      });
    }
    // les jumeaux deja mesures d'abord : ce sont les seuls sur lesquels TARE a un mot a dire
    out.sort((a, b) => {
      if (a.measured !== b.measured) return a.measured ? -1 : 1;
      if (a.same_name !== b.same_name) return a.same_name ? -1 : 1;
      return a.hook.localeCompare(b.hook);
    });
    return out;
  };

  const blastRadius = (hook: string): BlastRadius | null => {
    const h = store.byHook.get(hook);
    if (!h) return null;
    return {
      hook,
      pools: [...(poolsOf.get(hook) ?? [])],
      pools_measured: h.profiles.filter((p) => p.measured > 0).map((p) => p.pool_id),
      tokens: [...(tokensOf.get(hook) ?? [])].sort(),
      measurements: h.measurements,
      measured: h.measured,
      blocks: h.blocks,
      pools_with_liquidity_known: h.pools,
    };
  };

  const deployer = (hook: string): DeployerView => {
    const l = byAddress.get(hook);
    if (!store.registry.available)
      return {
        hook,
        registry_available: false,
        in_registry: null,
        deployer: null,
        note: "aucun registre charge : on ne sait pas qui a deploye, ce n'est pas 'personne'",
        siblings: [],
      };
    if (!l)
      return {
        hook,
        registry_available: true,
        in_registry: false,
        deployer: null,
        note: "hook absent du registre officiel : le deployeur n'y est donc pas declare",
        siblings: [],
      };
    if (!l.deployer)
      return {
        hook,
        registry_available: true,
        in_registry: true,
        deployer: null,
        note: "la fiche officielle laisse le champ deployer vide",
        siblings: [],
      };
    const siblings = lite
      .filter((o) => o.deployer === l.deployer && o.address !== hook)
      .map((o) => ({ hook: o.address, name: o.name, measured: store.byHook.has(o.address) }));
    return {
      hook,
      registry_available: true,
      in_registry: true,
      deployer: l.deployer,
      note: `declare par le registre officiel ; ${siblings.length} autre(s) hook(s) portent le meme deployeur`,
      siblings,
    };
  };

  const contradictions = () => {
    const confirmed: Contradiction[] = [];
    const unknowable: Unknowable[] = [];
    for (const h of store.hooks) {
      if (h.disagreement.is === true && h.disagreement.kind) {
        confirmed.push({
          hook: h.hook,
          name: h.registry?.name ?? null,
          kind: h.disagreement.kind,
          note: h.disagreement.note,
          registry_says: {
            vanillaSwap: h.registry?.vanilla_swap ?? null,
            swapAccess: h.registry?.swap_access ?? null,
          },
          measured_max_bps: h.max_bps,
          measurement_id: h.max_measurement?.id ?? null,
        });
      } else if (h.disagreement.is === null && h.registry) {
        unknowable.push({
          hook: h.hook,
          name: h.registry.name,
          reason: h.disagreement.note,
          labels: h.labels,
        });
      }
    }
    // Parite bits d'adresse / drapeaux declares. Les 14 permissions SONT les bits bas de
    // l'adresse : une divergence signalerait une fiche fausse. Sur le registre du 05/09,
    // ce tableau est vide (8 582 comparaisons, zero deviation) — et on le recalcule
    // quand meme a chaque chargement plutot que de le supposer.
    const flag_mismatches: FlagMismatch[] = [];
    for (const l of lite) {
      for (const [name, says] of Object.entries(l.flags) as [FlagName, boolean][]) {
        const bit = (l.bitmap & HOOK_FLAG_BITS[name]) !== 0;
        if (bit !== says)
          flag_mismatches.push({ hook: l.address, flag: name, address_bit: bit, registry_says: says });
      }
    }
    return { confirmed, unknowable, flag_mismatches };
  };

  const orphans = (): Orphans => {
    const measured_not_in_registry = store.hooks
      .filter((h) => h.in_registry === false)
      .map((h) => ({ hook: h.hook, measurements: h.measurements, max_bps: h.max_bps }));
    const in_registry_never_measured = lite
      .filter((l) => (chainScope === null || l.chain === chainScope) && !store.byHook.has(l.address))
      .map((l) => ({ hook: l.address, name: l.name, chain: l.chain }));
    const pools_without_measurement = store.profiles
      .filter((p) => p.measured === 0)
      .map((p) => ({
        pool_id: p.pool_id,
        hook: p.hook,
        measurements: p.points.length,
        labels: p.labels as Partial<Record<string, number>>,
      }));
    return {
      measured_not_in_registry,
      in_registry_never_measured,
      pools_without_measurement,
      registry_available: store.registry.available,
      chain_scope: chainScope,
    };
  };

  return {
    twins,
    blastRadius,
    deployer,
    contradictions,
    orphans,
    stats: {
      hooks: store.hooks.length,
      pools: store.dataset.pools,
      tokens: allTokens.size,
      edges,
      registry_entries: reg.count,
    },
  };
}

/* ------------------------------------------------------------------ cache */

let cache: { store: StoreView; value: GraphView } | null = null;
let builds = 0;
let provider: ((store: StoreView) => GraphView) | null = null;

/** Le lot F peut brancher son propre graphe ici, sans toucher au reste. */
export function setGraphProvider(fn: ((store: StoreView) => GraphView) | null): void {
  provider = fn;
  cache = null;
}

export function getGraph(store: StoreView = getStore()): GraphView {
  if (cache && cache.store === store) return cache.value;
  const value = (provider ?? buildGraph)(store);
  builds += 1;
  cache = { store, value };
  return value;
}

export function graphBuildCount(): number {
  return builds;
}

export function resetGraph(): void {
  cache = null;
}
