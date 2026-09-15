/**
 * LE CORPUS DEJA EMBARQUE, DANS LA FORME QUE LA GARDE CONSULTE.
 *
 * `packages/guard/data/table.json` pese 21 Mo et esbuild l'inline dans tout bundle qui
 * l'atteint : l'importer depuis le site ferait passer la page de demonstration de 8 a 30 Mo.
 * Or `src/data/dataset.json` porte DEJA les memes 125 072 mesures, du meme balayage, au meme
 * bloc — il est simplement encode par colonne. Ce module n'ajoute donc aucune donnee : il
 * REGROUPE celles du paquet dans la forme `GuardTable`, exactement comme
 * packages/guard/scripts/build-table.mjs le fait depuis le JSONL.
 *
 * TROIS CHOSES QU'IL NE FAIT PAS.
 *
 *   1. Il ne juge rien. `consult`, `gradeConsultation`, `chercherAlternative` restent dans le
 *      paquet : ce fichier n'est qu'un adaptateur de format.
 *   2. Il ne promeut aucune etiquette. Une ligne non numerique perd sa valeur en bps —
 *      toujours `null`, jamais zero.
 *   3. Il n'ecrit aucun seuil. `warn` et `block` sont les 90e et 99e centiles des mesures
 *      chiffrees, recalcules ici comme la-bas ; ecrits a la main ils redeviendraient faux au
 *      prochain balayage.
 *
 * src/lib/demo.test.ts compare la table rendue ici a `packages/guard/data/table.json`, ligne
 * par ligne sur les pools de la demonstration : si l'adaptation derivait, le test le dirait.
 */
import { dataset, type Label as LabelFr, type Row } from '../lib/dataset'
import type { GuardTable, Label, TableHook, TablePoint, TablePool } from './garde.mjs'

/** Le corpus du site nomme ses etiquettes en francais ; la garde les nomme en anglais. */
export const ETIQUETTE: Record<LabelFr, Label> = {
  MESURE: 'MEASURED',
  INTERPOLE: 'INTERPOLATED',
  NON_MESURABLE: 'NOT_MEASURABLE',
  NON_COTABLE: 'NOT_QUOTABLE',
}

const NUMERIQUES: ReadonlySet<Label> = new Set<Label>(['MEASURED', 'INTERPOLATED'])

const sens = (r: Row): '0->1' | '1->0' => (r.zero_for_one ? '0->1' : '1->0')

/**
 * La table, construite une fois. 125 072 lignes a regrouper : c'est du travail, et il ne doit
 * pas etre refait a chaque rendu. Le module n'en fait rien au chargement — la page de
 * demonstration est la seule qui appelle, et elle appelle une fois.
 */
let memo: GuardTable | null = null

export function tableDuCorpus(rows: Row[] = dataset.rows): GuardTable {
  if (memo && rows === dataset.rows) return memo

  const pools = new Map<string, TablePool>()
  const hooks = new Map<
    string,
    { n: number; labels: Record<string, number>; pools: Set<string>; measured: NonNullable<TableHook['measured']>['worst'][] }
  >()
  const blocs = new Set<number>()
  const chaines = new Set<number>()

  for (const r of rows) {
    const label = ETIQUETTE[r.label]
    const pid = r.pool_id.toLowerCase()
    const hook = r.hook.toLowerCase()
    const dir = sens(r)
    blocs.add(r.block_number)
    chaines.add(r.chain_id)

    let p = pools.get(pid)
    if (!p) {
      p = {
        hook,
        currency0: r.currency0.toLowerCase(),
        currency1: r.currency1.toLowerCase(),
        fee: r.key_fee,
        tick_spacing: r.tick_spacing,
        fee_is_dynamic: r.fee_is_dynamic,
        stored_lp_fee: r.stored_lp_fee,
        dirs: {},
      }
      pools.set(pid, p)
    }
    // Une etiquette non numerique ne porte pas de nombre. C'est la regle dure n.2, et la
    // retirer ici ferait entrer un zero la ou il n'y a pas de mesure.
    const chiffre = NUMERIQUES.has(label) && typeof r.bps === 'number' ? r.bps : null
    const point: TablePoint = {
      amount_in: r.amount_in,
      bps: chiffre,
      label,
      reason: r.reason ?? (chiffre === null ? 'label_non_numerique' : null),
      block_number: r.block_number,
      chain_id: r.chain_id,
    }
    ;(p.dirs[dir] ??= []).push(point)

    let h = hooks.get(hook)
    if (!h) {
      h = { n: 0, labels: {}, pools: new Set(), measured: [] }
      hooks.set(hook, h)
    }
    h.n += 1
    h.labels[label] = (h.labels[label] ?? 0) + 1
    h.pools.add(pid)
    if (chiffre !== null) {
      h.measured.push({
        bps: chiffre,
        pool_id: pid,
        amount_in: r.amount_in,
        direction: dir,
        label,
        block_number: r.block_number,
        chain_id: r.chain_id,
      })
    }
  }

  // L'interpolation de table.ts suppose les tailles croissantes : sans ce tri, elle
  // encadrerait la taille demandee par deux points pris au hasard.
  for (const p of pools.values()) {
    for (const d of Object.keys(p.dirs)) {
      p.dirs[d]!.sort((a, b) =>
        BigInt(a.amount_in) < BigInt(b.amount_in) ? -1 : BigInt(a.amount_in) > BigInt(b.amount_in) ? 1 : 0,
      )
    }
  }

  const hooksOut: Record<string, TableHook> = {}
  for (const [addr, h] of hooks) {
    h.measured.sort((a, b) => a.bps - b.bps)
    const bps = h.measured.map((m) => m.bps)
    hooksOut[addr] = {
      n: h.n,
      labels: h.labels,
      n_pools: h.pools.size,
      pools: [...h.pools].sort(),
      measured: bps.length
        ? {
            n: bps.length,
            bps_min: bps[0]!,
            bps_median: bps[bps.length >> 1]!,
            bps_max: bps[bps.length - 1]!,
            worst: h.measured[h.measured.length - 1]!,
          }
        : null,
    }
  }

  const tous: number[] = []
  for (const p of pools.values())
    for (const pts of Object.values(p.dirs))
      for (const pt of pts) if (pt.label === 'MEASURED' && typeof pt.bps === 'number') tous.push(pt.bps)
  tous.sort((a, b) => a - b)
  const c = (q: number): number | null =>
    tous.length ? tous[Math.min(tous.length - 1, Math.floor((tous.length * q) / 100))]! : null

  const prov = dataset.provenance.measurements
  const table: GuardTable = {
    schema: 'tare-guard-table/1',
    generated_at: dataset.provenance.built_at,
    source: prov.path,
    engine_ver: prov.engine_ver,
    stub_hash: prov.stub_hash,
    chain_id: chaines.size === 1 ? [...chaines][0]! : 0,
    block_number: blocs.size === 1 ? [...blocs][0]! : 0,
    blocks: [...blocs].sort((a, b) => a - b),
    n_measurements: rows.length,
    n_hooks: hooks.size,
    n_pools: pools.size,
    seuils: {
      warn_bps: c(90),
      block_bps: c(99),
      derives_de: tous.length,
      centiles: { p50: c(50), p75: c(75), p90: c(90), p95: c(95), p99: c(99), p99_9: c(99.9) },
      note:
        'warn = 90th percentile, block = 99th percentile of the numeric measurements. ' +
        'Recomputed from the corpus at every build: written by hand, they would go wrong at ' +
        'the next sweep.',
    },
    hooks: hooksOut,
    pools: Object.fromEntries([...pools.entries()].sort(([a], [b]) => (a < b ? -1 : 1))),
  }

  if (rows === dataset.rows) memo = table
  return table
}
