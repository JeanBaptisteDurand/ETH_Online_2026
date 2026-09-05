/**
 * LA ROUTE, COTE INSTRUMENT.
 *
 * Ce module ne calcule AUCUN cout. L'autorite est GET /route (apps/api/src/route.ts) :
 * c'est elle qui additionne stored_lp_fee/100 et le prelevement mesure du hook, elle qui
 * nomme la mesure qui porte la somme. Reimplementer ce calcul ici produirait un second
 * nombre capable de contredire le premier — exactement la faute que le produit reproche
 * au registre Uniswap.
 *
 * Ce module fait trois choses, et rien d'autre :
 *
 *   1. il TYPE ce que la reponse contient, en lisant chaque champ de facon defensive :
 *      un nombre qui n'est pas un nombre fini devient `null`, jamais 0 ;
 *   2. il RANGE les portes en deux tas — celles qui portent un cout mesure, et celles
 *      qui n'en portent pas. Une porte du tableau `ranked` de l'API qui arriverait sans
 *      `total_bps` chiffre est SORTIE du classement par l'ecran (compteur `demoted`) :
 *      l'ecran ne classe jamais ce qu'il ne peut pas lire, meme si l'API se trompait ;
 *   3. il DECIDE si l'ecran a le droit de presenter un choix. Une paire a porte unique —
 *      7794 paires sur 7802 au recensement — n'est pas un classement a un element : c'est
 *      un peage. Ce jugement est ici, en fonction pure, parce qu'il doit etre testable
 *      sans navigateur.
 *
 * Les candidats du bandeau « paires interessantes » sont derives du corpus embarque a
 * chaque chargement (aucune paire n'est ecrite en dur), puis interroges : c'est /route
 * qui dit combien de portes existent, pas ce fichier.
 */

/* --------------------------------------------------------------- lecture defensive */

/** Un nombre, ou rien. NaN, Infinity, "0" et undefined ne sont pas des nombres mesures. */
export function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

function counts(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    const x = num(n)
    if (x !== null) out[k] = x
  }
  return out
}

/* ------------------------------------------------------------------------- types */

export type Json = Record<string, unknown>

export type SizeInfo = {
  requested_wei: string | null
  used_wei: string | null
  exact_match: boolean
  note: string | null
}

export type Structure = {
  pairs_discovered: number | null
  pairs_with_more_than_one_pool: number | null
  pairs_with_a_single_pool: number | null
  share_pct: number | null
  block_number: number | null
  source: string | null
  is_lower_bound: boolean
  caveat: string | null
  sentence: string | null
}

export type Alternatives = {
  claim: string | null
  sentence: string | null
  caveat: string | null
  pools_measured: number | null
  pools_in_census: number | null
  census_available: boolean
  pools_in_census_note: string | null
}

export type SourceInfo = {
  path: string | null
  kind: string | null
  exists: boolean
  rows_read: number | null
  rejected_lines: number | null
  measurements: number | null
}

/** La reponse de /route, telle qu'on la LIT. Les champs non lus ne sont pas types. */
export type RouteAnswer = {
  question: string | null
  verdict: string | null
  headline: string | null
  pair: { currency0: string | null; currency1: string | null; note: string | null }
  direction: {
    zero_for_one: boolean | null
    human: string | null
    source: string | null
    note: string | null
    hint: string | null
    pools_quoted_in_other_direction: number | null
  }
  size: { requested_wei: string | null; note: string | null }
  block: { measurements: number[]; census: number | null; note: string | null }
  alternatives: Alternatives
  structure: Structure | null
  structure_note: string | null
  counts: Record<string, number>
  ranked: Json[]
  unranked: Json[]
  unmeasured_gates: Json[]
  ranking_note: string | null
  unranked_note: string | null
  cost_model: { formula: string | null; assumption: string | null }
  sources: SourceInfo[]
  census_source: {
    path: string | null
    unreadable_pools: number | null
    unreadable_pools_note: string | null
    rescan_command: string | null
  }
  honesty: string[]
}

function arr(v: unknown): Json[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Json[]) : []
}

function obj(v: unknown): Json {
  return v && typeof v === 'object' ? (v as Json) : {}
}

/** Normalise la reponse HTTP. Aucun champ manquant n'est remplace par une valeur plausible. */
export function readAnswer(body: unknown): RouteAnswer {
  const b = obj(body)
  const pair = obj(b['pair'])
  const dir = obj(b['direction'])
  const size = obj(b['size'])
  const block = obj(b['block'])
  const alt = obj(b['alternatives'])
  const st = b['structure'] ? obj(b['structure']) : null
  const cost = obj(b['cost_model'])
  const census = obj(b['census_source'])
  return {
    question: str(b['question']),
    verdict: str(b['verdict']),
    headline: str(b['headline']),
    pair: {
      currency0: str(pair['currency0']),
      currency1: str(pair['currency1']),
      note: str(pair['note']),
    },
    direction: {
      zero_for_one: bool(dir['zero_for_one']),
      human: str(dir['human']),
      source: str(dir['source']),
      note: str(dir['note']),
      hint: str(dir['hint']),
      pools_quoted_in_other_direction: num(dir['pools_quoted_in_other_direction']),
    },
    size: { requested_wei: str(size['requested_wei']), note: str(size['note']) },
    block: {
      measurements: Array.isArray(block['measurements'])
        ? (block['measurements'] as unknown[]).map(num).filter((x): x is number => x !== null)
        : [],
      census: num(block['census']),
      note: str(block['note']),
    },
    alternatives: {
      claim: str(alt['claim']),
      sentence: str(alt['sentence']),
      caveat: str(alt['caveat']),
      pools_measured: num(alt['pools_measured']),
      pools_in_census: num(alt['pools_in_census']),
      census_available: alt['census_available'] === true,
      pools_in_census_note: str(alt['pools_in_census_note']),
    },
    structure: st
      ? {
          pairs_discovered: num(st['pairs_discovered']),
          pairs_with_more_than_one_pool: num(st['pairs_with_more_than_one_pool']),
          pairs_with_a_single_pool: num(st['pairs_with_a_single_pool']),
          share_pct: num(st['share_pct']),
          block_number: num(st['block_number']),
          source: str(st['source']),
          is_lower_bound: st['is_lower_bound'] === true,
          caveat: str(st['caveat']),
          sentence: str(st['sentence']),
        }
      : null,
    structure_note: str(b['structure_note']),
    counts: counts(b['counts']),
    ranked: arr(b['ranked']),
    unranked: arr(b['unranked']),
    unmeasured_gates: arr(b['unmeasured_gates']),
    ranking_note: str(b['ranking_note']),
    unranked_note: str(b['unranked_note']),
    cost_model: { formula: str(cost['formula']), assumption: str(cost['assumption']) },
    sources: arr(b['sources']).map((s) => ({
      path: str(s['path']),
      kind: str(s['kind']),
      exists: s['exists'] === true,
      rows_read: num(s['rows_read']),
      rejected_lines: num(s['rejected_lines']),
      measurements: num(s['measurements']),
    })),
    census_source: {
      path: str(census['path']),
      unreadable_pools: num(census['unreadable_pools']),
      unreadable_pools_note: str(census['unreadable_pools_note']),
      rescan_command: str(census['rescan_command']),
    },
    honesty: Array.isArray(b['honesty'])
      ? (b['honesty'] as unknown[]).map(str).filter((x): x is string => x !== null)
      : [],
  }
}

/* ------------------------------------------------------------------- les portes */

/** Une porte CLASSABLE : elle porte un cout total mesure, et le nom de la mesure. */
export type PresentedGate = {
  pool_id: string | null
  hook: string | null
  /** fini par construction : c'est la condition d'entree dans ce tas. */
  total_bps: number
  lp_fee_bps: number | null
  hook_bps: number | null
  formula: string | null
  label: string | null
  cost_basis: string | null
  size: SizeInfo | null
  measurement_id: string | null
  block_number: number | null
  replay: string | null
  labels_in_direction: Record<string, number>
  measurements_in_direction: number | null
  /** note de l'API quand les lignes du pool ne portent pas toutes le meme stored_lp_fee */
  lp_divergent: string | null
}

/** Une porte HORS classement : aucun cout comparable. Jamais zero, jamais derniere. */
export type PresentedAside = {
  pool_id: string | null
  hook: string | null
  why: string | null
  why_fr: string | null
  labels_in_direction: Record<string, number>
  labels_all_directions: Record<string, number>
  /** prelevement du hook seul, quand il existe sans frais LP lisibles (NO_STORED_LP_FEE) */
  hook_bps: number | null
  measurement_id: string | null
  replay: string | null
  label_at_requested_size: string | null
  reason_at_requested_size: string | null
  replay_at_requested_size: string | null
  /** une valeur A UNE AUTRE TAILLE : elle n'a pas servi au classement et le dit */
  nearest: {
    amount_in: string | null
    hook_bps: number | null
    total_bps: number | null
    label: string | null
    measurement_id: string | null
    replay: string | null
    note: string | null
  } | null
}

function readSize(v: unknown): SizeInfo | null {
  if (!v || typeof v !== 'object') return null
  const s = v as Json
  return {
    requested_wei: str(s['requested_wei']),
    used_wei: str(s['used_wei']),
    exact_match: s['exact_match'] === true,
    note: str(s['note']),
  }
}

function asAside(g: Json, why: string | null, whyFr: string | null): PresentedAside {
  const near = g['nearest_quoted']
  return {
    pool_id: str(g['pool_id']),
    hook: str(g['hook']),
    why,
    why_fr: whyFr,
    labels_in_direction: counts(g['labels_in_direction']),
    labels_all_directions: counts(g['labels_all_directions']),
    hook_bps: num(g['hook_bps']),
    measurement_id: str(g['measurement_id']),
    replay: str(g['replay']),
    label_at_requested_size: str(g['label_at_requested_size']),
    reason_at_requested_size: str(g['reason_at_requested_size']),
    replay_at_requested_size: str(g['replay_at_requested_size']),
    nearest:
      near && typeof near === 'object'
        ? {
            amount_in: str((near as Json)['amount_in']),
            hook_bps: num((near as Json)['hook_bps']),
            total_bps: num((near as Json)['total_bps']),
            label: str((near as Json)['label']),
            measurement_id: str((near as Json)['measurement_id']),
            replay: str((near as Json)['replay']),
            note: str((near as Json)['note']),
          }
        : null,
  }
}

/** Le motif que l'ECRAN ajoute quand il degrade une porte que l'API avait classee. */
export const DEMOTED_WHY = 'NO_MEASURED_TOTAL_IN_ANSWER'
export const DEMOTED_WHY_FR =
  "cette porte est arrivee dans le classement de l'API sans cout total chiffre. L'ecran la sort du classement : un cout illisible n'est pas un cout de zero, et il ne se classe pas."

export type Partition = {
  /** classables, du cout total mesure le plus faible au plus eleve */
  gates: PresentedGate[]
  /** hors classement, dans l'ordre rendu par l'API, jamais reordonne par un cout */
  aside: PresentedAside[]
  /** portes que l'ECRAN a sorties du classement de l'API faute de cout lisible */
  demoted: number
}

/**
 * Range les portes. C'est ici que se tient la regle : entrer dans `gates` exige un
 * `total_bps` fini. Tout le reste va dans `aside`, y compris ce que l'API avait classe.
 */
export function partitionAnswer(a: RouteAnswer): Partition {
  const gates: PresentedGate[] = []
  const aside: PresentedAside[] = []
  let demoted = 0

  for (const g of a.ranked) {
    const total = num(g['total_bps'])
    if (total === null) {
      demoted += 1
      aside.push(asAside(g, DEMOTED_WHY, DEMOTED_WHY_FR))
      continue
    }
    gates.push({
      pool_id: str(g['pool_id']),
      hook: str(g['hook']),
      total_bps: total,
      lp_fee_bps: num(g['lp_fee_bps_used']),
      hook_bps: num(g['hook_bps']),
      formula: str(g['total_bps_formula']),
      label: str(g['label']),
      cost_basis: str(g['cost_basis']),
      size: readSize(g['size']),
      measurement_id: str(g['measurement_id']),
      block_number: num(g['block_number']),
      replay: str(g['replay']),
      labels_in_direction: counts(g['labels_in_direction']),
      measurements_in_direction: num(g['measurements_in_direction']),
      lp_divergent:
        g['lp_fee_divergent_rows'] && typeof g['lp_fee_divergent_rows'] === 'object'
          ? str((g['lp_fee_divergent_rows'] as Json)['note'])
          : null,
    })
  }

  // Meme ordre que l'API (cout croissant), recalcule ici pour que l'ecran ne depende pas
  // d'un tri qu'il n'a pas verifie. Departage stable : frais LP, puis adresse du hook.
  gates.sort(
    (x, y) =>
      x.total_bps - y.total_bps ||
      (x.lp_fee_bps ?? 0) - (y.lp_fee_bps ?? 0) ||
      String(x.hook).localeCompare(String(y.hook)),
  )

  for (const g of a.unranked) aside.push(asAside(g, str(g['why']), str(g['why_fr'])))

  return { gates, aside, demoted }
}

/* ------------------------------------------------------------------- le verdict */

export type Mode =
  /** une seule porte : pas de choix, un peage */
  | 'PEAGE'
  /** au moins deux couts mesures : un classement a un sens */
  | 'CLASSEMENT'
  /** plusieurs portes mais un seul cout mesure : ce n'est pas un classement */
  | 'UNE_SEULE_MESURE'
  /** plusieurs portes, aucun cout mesure dans ce sens a cette taille */
  | 'AUCUN_COUT'
  /** la paire n'est couverte par aucune mesure */
  | 'AUCUNE_MESURE'

export type Presentation = {
  mode: Mode
  /** l'ecran a-t-il le droit de presenter un choix (rangs 01, 02, …) ? */
  isChoice: boolean
  /** nombre de portes connues pour la paire, et d'ou vient ce compte */
  doors: number | null
  doorsSource: 'recensement' | 'mesures' | null
  /** le recensement soutient-il « aucune alternative n'existe » ? */
  tollSupported: boolean
  /** titre court de l'ecran. La phrase longue reste celle de l'API, affichee telle quelle. */
  title: string
}

/**
 * Decide de la mise en scene. Deux regles non negociables :
 *   - une seule porte n'est JAMAIS un classement a un element ;
 *   - un classement exige au moins deux couts mesures. Un seul cout mesure entoure de
 *     portes non cotables n'est pas un classement : c'est une seule mesure.
 */
export function presentationOf(a: RouteAnswer, p: Partition): Presentation {
  const measured = a.alternatives.pools_measured ?? p.gates.length + p.aside.length

  // Un recensement DISPONIBLE qui ne couvre pas la paire rend pools_in_census = 0, et l'API
  // le dit franchement : claim = INDETERMINE. Une premiere version lisait ce 0 comme une
  // valeur et l'ecran imprimait « 0 porte · source : recensement » — la paire n'a pas zero
  // porte, on ne sait pas combien elle en a. C'est la regle 1 du projet violee a l'ecran,
  // dans le composant qui existe justement pour ne pas la violer.
  const censusCouvre =
    a.alternatives.census_available && a.alternatives.claim !== 'INDETERMINE'
  const inCensus = censusCouvre ? a.alternatives.pools_in_census : null
  const doors = inCensus === null ? measured : Math.max(inCensus, measured)
  const doorsSource =
    measured === 0 && inCensus === null ? null : inCensus === null ? 'mesures' : 'recensement'
  const tollSupported = a.alternatives.claim === 'AUCUNE_ALTERNATIVE'

  if (measured === 0)
    return {
      mode: 'AUCUNE_MESURE',
      isChoice: false,
      // Sans couverture du recensement, le nombre de portes est INCONNU, pas nul.
      doors: inCensus,
      doorsSource: inCensus === null ? null : 'recensement',
      tollSupported,
      title: 'aucune mesure pour cette paire',
    }

  if (doors === 1)
    return {
      mode: 'PEAGE',
      isChoice: false,
      doors,
      doorsSource,
      tollSupported,
      title: tollSupported ? 'une seule porte — un peage, pas un prix' : 'une seule porte mesuree',
    }

  if (p.gates.length >= 2)
    return {
      mode: 'CLASSEMENT',
      isChoice: true,
      doors,
      doorsSource,
      tollSupported,
      title: `${p.gates.length} couts mesures, du plus faible au plus eleve`,
    }

  if (p.gates.length === 1)
    return {
      mode: 'UNE_SEULE_MESURE',
      isChoice: false,
      doors,
      doorsSource,
      tollSupported,
      title: "un seul cout mesure : ce n'est pas un classement",
    }

  return {
    mode: 'AUCUN_COUT',
    isChoice: false,
    doors,
    doorsSource,
    tollSupported,
    title: 'aucun cout mesure dans ce sens a cette taille',
  }
}

/**
 * Les rangs affiches. Vides quand l'ecran n'a pas le droit de presenter un choix :
 * une porte unique ne porte pas de « 01 » — il n'y a pas de 02.
 */
export function rankBadges(p: Partition, pres: Presentation): string[] {
  if (!pres.isChoice) return []
  return p.gates.map((_, i) => String(i + 1).padStart(2, '0'))
}

/* ------------------------------------------------- ce que l'ecran propose en un clic */

export type MinRow = { currency0: string; currency1: string; amount_in: string }

export type PairCandidate = { a: string; b: string; key: string }

/** Cle de paire insensible a l'ordre, identique a celle de l'API (adresses triees). */
export function pairKey(a: string, b: string): string {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  return x < y ? `${x}|${y}` : `${y}|${x}`
}

/**
 * Les jetons du corpus embarque, du plus frequent au moins frequent. Le compte est un
 * nombre d'observations, pas une mesure de prelevement : il ne sert qu'a choisir quoi
 * proposer.
 */
export function tokensByFrequency(rows: MinRow[]): { address: string; rows: number }[] {
  const f = new Map<string, number>()
  for (const r of rows)
    for (const c of [r.currency0, r.currency1]) {
      const k = c.toLowerCase()
      f.set(k, (f.get(k) ?? 0) + 1)
    }
  return [...f.entries()]
    .map(([address, n]) => ({ address, rows: n }))
    .sort((x, y) => y.rows - x.rows || x.address.localeCompare(y.address))
}

/**
 * Les paires a proposer, DERIVEES du corpus a chaque chargement.
 *
 * Le corpus embarque ne connait qu'un pool par paire : les paires a plusieurs portes ne
 * sont visibles que de l'API, qui lit aussi measurements-contestes.jsonl. On ne peut donc
 * pas les deduire ici — on les DECOUVRE, en interrogeant /route sur toutes les paires
 * formables avec les `topTokens` jetons les plus frequents du corpus. C'est /route qui
 * dit combien de portes existent ; ce fichier ne fait que choisir a qui poser la question.
 *
 * `topTokens` est un seuil, pas une mesure : a 8 jetons la liste ne contient pas encore
 * l'USDC de Base, a 10 si. Il est ecrit ici plutot que cache, et la liste suivra le
 * corpus si les balayages en changent les frequences.
 */
export function candidatePairs(rows: MinRow[], topTokens = 10): PairCandidate[] {
  const tokens = tokensByFrequency(rows).slice(0, topTokens)
  const out: PairCandidate[] = []
  for (let i = 0; i < tokens.length; i += 1)
    for (let j = i + 1; j < tokens.length; j += 1) {
      const a = tokens[i]!.address
      const b = tokens[j]!.address
      out.push({ a, b, key: pairKey(a, b) })
    }
  return out
}

/** Les tailles reellement balayees dans le corpus, croissantes. Aucune n'est inventee. */
export function sizesOf(rows: MinRow[]): string[] {
  const s = new Set<string>()
  for (const r of rows) if (/^[0-9]+$/.test(r.amount_in)) s.add(r.amount_in)
  return [...s].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0))
}

/** L'adresse zero est la monnaie native de la chaine dans une PoolKey v4, pas un jeton ERC20. */
export function isNativeCurrency(address: string): boolean {
  return /^0x0{40}$/.test(address.trim().toLowerCase())
}

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/** Le chemin de la question posee a l'API. Une taille vide n'est pas une taille de zero. */
export function routePath(q: {
  currency0: string
  currency1: string
  amount: string | null
  zeroForOne: boolean | null
}): string {
  const p = new URLSearchParams()
  p.set('currency0', q.currency0)
  p.set('currency1', q.currency1)
  if (q.amount !== null && q.amount !== '') p.set('amount', q.amount)
  if (q.zeroForOne !== null) p.set('zeroForOne', String(q.zeroForOne))
  return `/route?${p.toString()}`
}

/* --------------------------------------------------------- resultat d'un sondage */

/** Ce qu'un sondage de paire retient : le nombre de portes, jamais un cout. */
export type Probe = {
  key: string
  a: string
  b: string
  /** portes vues par le recensement ; null quand le recensement ne couvre pas la paire */
  doorsCensus: number | null
  /** pools couverts par au moins une mesure */
  doorsMeasured: number
  verdict: string | null
  claim: string | null
}

export function probeOf(c: PairCandidate, a: RouteAnswer): Probe {
  return {
    key: c.key,
    a: c.a,
    b: c.b,
    doorsCensus: a.alternatives.census_available ? a.alternatives.pools_in_census : null,
    doorsMeasured: a.alternatives.pools_measured ?? 0,
    verdict: a.verdict,
    claim: a.alternatives.claim,
  }
}

/** Le nombre de portes retenu pour trier le bandeau : le plus grand des deux comptes lus. */
export function doorsOf(p: Probe): number {
  return Math.max(p.doorsCensus ?? 0, p.doorsMeasured)
}
