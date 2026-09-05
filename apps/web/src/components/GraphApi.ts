/**
 * Le client du graphe.
 *
 * Le graphe (engine/tare/graph/, servi par apps/api/src/graph-routes.ts) n'est PAS
 * dans le paquet JS : il pese 3,3 Mo et la regle de la page est un verdict a l'ecran
 * en moins de cinq secondes sans requete reseau. Les trois encarts de graphe sont
 * donc un supplement, charges apres coup et jamais bloquants.
 *
 * Consequence, et c'est la seule qui compte : quand l'API ne repond pas, les encarts
 * disent "pas joignable" et donnent la commande a taper. Ils n'affichent JAMAIS zero
 * clone, zero pool, zero desaccord — ce serait la meme faute que confondre un
 * NOT_MEASURABLE avec un 0 bps.
 */

/** Base de l'API. `VITE_TARE_API=https://…` au build pour pointer ailleurs. */
export const API_BASE: string =
  (import.meta.env['VITE_TARE_API'] as string | undefined)?.replace(/\/+$/, '') ??
  'http://127.0.0.1:8787'

export const CLI = 'PYTHONPATH=engine python3 -m tare.graph.cli'

/* --------------------------------------------------------------------- types */

/** Les quatre etiquettes d'honnetete, telles que le moteur les ecrit. */
export type GraphLabel = 'MEASURED' | 'INTERPOLATED' | 'NOT_MEASURABLE' | 'NOT_QUOTABLE'

export type BpsProfile = {
  n: number
  by_label: Record<GraphLabel, number>
  n_measured: number
  bps_min: number | null
  bps_max: number | null
  bps_median: number | null
  flat: boolean | null
}

export type Envelope = {
  graph: {
    source: string
    engine_ver: string | null
    block_number: number | null
    n_measurements: number | null
    n_registry_entries: number | null
    chain_cache_present: boolean | null
    chain_cache_fetched_at: string | null
  }
  cache: { hits: number; misses: number; entries: number }
  took_ms: number
}

export type Findings = {
  clone_clusters: number
  hooks_in_clone_clusters: number
  orphans: number
  listed_hooks_on_chain: number
  hooks_with_multiple_registry_entries: number
  contradictions: number
  registry_says_active_measure_says_flat: number
  registry_says_vanilla_measure_says_active: number
  not_comparable: number
}

export type GraphSummary = Envelope & { chain_id: number; findings: Findings }

export type TwinRow = { id: string; address: string; label: string | null; n_pools: number }

export type Twins = Envelope & {
  hook: string
  found: boolean
  /** 'CODE' quand eth_getCode a repondu ; sinon 'ABSENT' ou 'UNAVAILABLE'. */
  status: string
  reason?: string
  code_hash: string | null
  code_size?: number | null
  n_twins?: number
  twins: TwinRow[]
}

export type Impact = Envelope & {
  hook: string
  found: boolean
  address: string
  label: string | null
  pools: string[]
  n_pools: number
  tokens: string[]
  n_tokens: number
  measurements: BpsProfile
  bytecode: { status: string; code_hash: string | null; n_twins: number; twins: string[] }
  twin_pools: string[]
  n_twin_pools: number
  deployer: { status: string; deployers: string[]; n_siblings: number; siblings: string[] }
  sibling_pools: string[]
  registry_entries: string[]
  n_registry_entries: number
  pools_at_risk: string[]
  n_pools_at_risk: number
}

export type Verdict =
  | 'NO_SUCH_HOOK'
  | 'NO_REGISTRY_ENTRY'
  | 'NO_VANILLA_DECLARED'
  | 'NOT_COMPARABLE'
  | 'REGISTRY_SAYS_ACTIVE_MEASURE_SAYS_FLAT'
  | 'REGISTRY_SAYS_VANILLA_MEASURE_SAYS_ACTIVE'
  | 'AGREE'

export type Disagreement = Envelope & {
  hook: string
  found: boolean
  address: string
  label: string | null
  chain_id: number
  flat_bps: number
  n_pools: number
  profile: BpsProfile
  registry_entries: string[]
  n_registry_entries: number
  verdict: Verdict
  vanillaSwap_declared: boolean[]
  note: string
}

/**
 * Ce qu'un verdict veut dire, en une ligne. Le texte long vient de l'API (champ
 * `note`) ; celui-ci est l'etiquette courte affichee en tete d'encart.
 */
export const VERDICT_LABEL: Record<Verdict, string> = {
  NO_SUCH_HOOK: 'hook absent du graphe',
  NO_REGISTRY_ENTRY: 'aucune fiche au registre',
  NO_VANILLA_DECLARED: 'la fiche ne declare pas vanillaSwap',
  NOT_COMPARABLE: 'non comparable — aucune mesure MESUREE',
  REGISTRY_SAYS_ACTIVE_MEASURE_SAYS_FLAT: 'DESACCORD — le registre dit actif, la mesure ne trouve rien',
  REGISTRY_SAYS_VANILLA_MEASURE_SAYS_ACTIVE: 'DESACCORD — le registre dit vanille, la mesure preleve',
  AGREE: 'accord — registre et mesure disent la meme chose',
}

/** Un desaccord au sens strict : les deux lectures se contredisent. */
export function isDisagreement(v: Verdict): boolean {
  return (
    v === 'REGISTRY_SAYS_ACTIVE_MEASURE_SAYS_FLAT' ||
    v === 'REGISTRY_SAYS_VANILLA_MEASURE_SAYS_ACTIVE'
  )
}

/* --------------------------------------------------------------------- fetch */

export type Fetched<T> =
  | { state: 'loading' }
  /** l'API a repondu 404 : le hook n'est pas dans le graphe. Ce n'est pas "zero". */
  | { state: 'absent'; detail: string }
  /** l'API n'a pas repondu, ou a repondu 503. Aucun nombre n'est affichable. */
  | { state: 'error'; detail: string }
  | { state: 'ready'; data: T }

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<Fetched<T>> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { signal })
  } catch (e) {
    return { state: 'error', detail: `${API_BASE} injoignable (${(e as Error).message})` }
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { state: 'error', detail: `reponse illisible (HTTP ${res.status})` }
  }
  const b = body as Record<string, unknown>
  if (res.status === 404) return { state: 'absent', detail: String(b['note'] ?? 'hook inconnu') }
  if (!res.ok)
    return {
      state: 'error',
      detail: `${String(b['error'] ?? `HTTP ${res.status}`)} — ${String(b['detail'] ?? '')}`.trim(),
    }
  return { state: 'ready', data: body as T }
}
