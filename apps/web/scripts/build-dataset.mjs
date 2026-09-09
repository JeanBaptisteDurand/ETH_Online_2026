// Build-time derivation. Reads the two committed sources of truth and emits ONE bundled
// dataset for the instrument. It derives nothing it cannot show the provenance of.
//
//   ../../docs/measurements-v1.json   128 real measurements, engine tare-engine/0.2
//   public/data/hooklist.snapshot.json  the official Uniswap hooklist, pinned to a commit
//
// Rule 3 of the product: a truncated read is NOT_MEASURABLE, never a value. So a hook with
// zero MESURE rows never gets a bps here — it gets a label and a count.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeRows } from '../src/data/codec.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const repo = resolve(root, '../..')

// Le balayage complet (995 mesures, 199 pools, 12 hooks) est en JSONL ; measurements-v1.json
// n'en est que le premier echantillon (128 lignes). On prefere le grand des qu'il existe.
const JSONL_PATH = resolve(repo, 'docs/dataset/measurements.jsonl')
const MEASUREMENTS_PATH = resolve(repo, 'docs/measurements-v1.json')
const SNAPSHOT_PATH = resolve(root, 'public/data/hooklist.snapshot.json')
const OUT = resolve(root, 'src/data/dataset.json')

let measurements
// La provenance se DEDUIT de la branche prise. Elle etait ecrite en dur sur
// `docs/measurements-v1.json` — le fichier de repli, 128 mesures — pendant que la lecture
// venait du JSONL et que l'instrument en affichait 125 072. La page annoncait donc a son
// lecteur une source qui n'etait pas la sienne, dans le panneau meme ou elle etale ses
// lignes brutes. Une chaine ecrite a la main cesse d'etre vraie sans prevenir.
let sourcePath
if (existsSync(JSONL_PATH)) {
  measurements = readFileSync(JSONL_PATH, 'utf8')
    .split('\n').filter((l) => l.trim())
    .map((l) => JSON.parse(l))
  sourcePath = 'docs/dataset/measurements.jsonl'
} else {
  measurements = JSON.parse(readFileSync(MEASUREMENTS_PATH, 'utf8'))
  sourcePath = 'docs/measurements-v1.json'
}
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))

// The engine writes MEASURED / NOT_MEASURABLE / NOT_QUOTABLE; measurements-v1.json was written
// by the run that used the French vocabulary. Both are normalised to the four canonical labels.
const LABELS = {
  MESURE: 'MESURE',
  MEASURED: 'MESURE',
  INTERPOLE: 'INTERPOLE',
  INTERPOLATED: 'INTERPOLE',
  NON_MESURABLE: 'NON_MESURABLE',
  NOT_MEASURABLE: 'NON_MESURABLE',
  NON_COTABLE: 'NON_COTABLE',
  NOT_QUOTABLE: 'NON_COTABLE',
}

const registryByAddress = new Map()
for (const e of snapshot.entries) {
  if (!registryByAddress.has(e.address)) registryByAddress.set(e.address, [])
  registryByAddress.get(e.address).push(e)
}

const rows = measurements.map((m, i) => {
  const label = LABELS[m.label]
  if (!label) throw new Error(`unknown label ${m.label} at row ${i}`)
  return { ...m, id: i, label }
})

const hookAddresses = [...new Set(rows.map((r) => r.hook))].sort()

const hooks = hookAddresses.map((address) => {
  const mine = rows.filter((r) => r.hook === address)
  const measured = mine.filter((r) => r.label === 'MESURE' && typeof r.bps === 'number')
  const pools = [...new Set(mine.map((r) => r.pool_id))]
  const poolsMeasured = [...new Set(measured.map((r) => r.pool_id))]

  const counts = { MESURE: 0, INTERPOLE: 0, NON_MESURABLE: 0, NON_COTABLE: 0 }
  for (const r of mine) counts[r.label] += 1

  // The hook-level label is the STRONGEST evidence present, never an average.
  const label = counts.MESURE > 0 ? 'MESURE'
    : counts.INTERPOLE > 0 ? 'INTERPOLE'
    : counts.NON_MESURABLE > 0 ? 'NON_MESURABLE'
    : 'NON_COTABLE'

  const bpsValues = measured.map((r) => r.bps)
  const bpsMax = bpsValues.length ? Math.max(...bpsValues) : null
  const bpsMin = bpsValues.length ? Math.min(...bpsValues) : null

  // The row that carries bpsMax — so the headline number can be replayed exactly.
  const worst = bpsMax === null ? null : measured.find((r) => r.bps === bpsMax)

  // Registry entries on the chain we measured, then any other chain.
  const chainId = mine[0].chain_id
  const candidates = registryByAddress.get(address) ?? []
  const registry = candidates.find((e) => e.chainId === chainId) ?? candidates[0] ?? null

  const sizes = [...new Set(mine.map((r) => r.amount_in))].sort((a, b) =>
    BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)

  return {
    address,
    chainId,
    blocks: [...new Set(mine.map((r) => r.block_number))].sort((a, b) => a - b),
    registry,                     // null == ABSENT from the official registry
    inRegistry: registry !== null,
    label,
    counts,
    rowCount: mine.length,
    measuredCount: measured.length,
    poolCount: pools.length,
    poolCountMeasured: poolsMeasured.length,
    bpsMax,
    bpsMin,
    worstRowId: worst ? worst.id : null,
    sizes,
    storedLpFees: [...new Set(mine.map((r) => r.stored_lp_fee))].sort((a, b) => a - b),
    keyFees: [...new Set(mine.map((r) => r.key_fee))].sort((a, b) => a - b),
    dynamicFeeOnChain: mine.some((r) => r.fee_is_dynamic),
  }
})

const measuredRows = rows.filter((r) => r.label === 'MESURE' && typeof r.bps === 'number')

const dataset = {
  provenance: {
    measurements: {
      path: sourcePath,
      engine_ver: [...new Set(rows.map((r) => r.engine_ver))].join(', '),
      stub_hash: [...new Set(rows.map((r) => r.stub_hash))].join(', '),
      observed_at: [...new Set(rows.map((r) => r.observed_at))].sort()[0],
      chain_ids: [...new Set(rows.map((r) => r.chain_id))],
      blocks: [...new Set(rows.map((r) => r.block_number))].sort((a, b) => a - b),
    },
    registry: {
      source: snapshot.source,
      file: snapshot.file,
      commit: snapshot.commit,
      fetched_at: snapshot.fetched_at,
      entries: snapshot.entries_in_source,
      flag_bit_check: snapshot.flag_bit_check,
      field_census: snapshot.field_census,
    },
    built_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  },
  totals: {
    rows: rows.length,
    measured: measuredRows.length,
    hooks: hooks.length,
    pools: [...new Set(rows.map((r) => r.pool_id))].length,
    poolsMeasured: [...new Set(measuredRows.map((r) => r.pool_id))].length,
    // The headline of the project: extraction above 1 bp on pools whose on-chain lp fee is zero.
    over1bps: measuredRows.filter((r) => r.bps > 1).length,
    over1bpsWithZeroStoredFee: measuredRows.filter((r) => r.bps > 1 && r.stored_lp_fee === 0).length,
    hooksAbsentFromRegistry: hooks.filter((h) => !h.inRegistry).length,
    sizes: [...new Set(rows.map((r) => r.amount_in))].length,
    labelCounts: rows.reduce((a, r) => ((a[r.label] = (a[r.label] ?? 0) + 1), a), {}),
  },
  hooks,
  // Les lignes partent ENCODEES PAR COLONNE (voir src/data/codec.mjs). Ecrites naivement
  // elles pesaient 87 Mo, embarquees telles quelles dans le bundle : 10,3 s avant le premier
  // texte affiche et 1,18 Go de tas. L'encodage est verifie ligne a ligne avant d'etre ecrit,
  // et `dataset.rows` reste exactement le meme tableau d'objets a la lecture.
  rows_enc: encodeRows(rows),
}

mkdirSync(dirname(OUT), { recursive: true })
const sortie = JSON.stringify(dataset)
writeFileSync(OUT, sortie)
console.log(
  `dataset.json — ${(sortie.length / 1048576).toFixed(1)} Mo / ` +
  `${dataset.totals.rows} rows / ${dataset.totals.hooks} hooks / ` +
  `${dataset.totals.pools} pools / ${dataset.totals.measured} MESURE / ` +
  `${dataset.totals.over1bpsWithZeroStoredFee} > 1 bps on stored_lp_fee=0 / ` +
  `${dataset.totals.hooksAbsentFromRegistry} hooks absent from the registry`,
)
