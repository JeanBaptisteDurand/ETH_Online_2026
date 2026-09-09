// Verification, pas decoration. Ce script re-controle les trois affirmations que l'interface
// affiche, en utilisant l'ORDRE DES BITS REELLEMENT LIVRE dans src/lib/flags.ts — pas une copie.
//
//   npm run verify
//
// Il sort en code 1 des qu'une affirmation ne tient plus. C'est volontaire : une affirmation
// invalidee doit casser la chaine, pas s'afficher quand meme.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeRows } from '../src/data/codec.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(root, '../..')

let failures = 0
const check = (ok, msg) => {
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${msg}`)
  if (!ok) failures += 1
}

// --- 1. l'ordre des bits livre dans flags.ts
const flagsSrc = readFileSync(resolve(root, 'src/lib/flags.ts'), 'utf8')
const ORDER = [...flagsSrc.matchAll(/\{\s*bit:\s*(\d+),\s*key:\s*'([A-Za-z]+)'/g)].map((m) => ({
  bit: Number(m[1]),
  key: m[2],
}))
check(ORDER.length === 14, `src/lib/flags.ts declare ${ORDER.length} permissions (attendu 14)`)
check(
  ORDER.every((f, i) => f.bit === 13 - i),
  'les bits vont de 13 a 0, dans l ordre de Hooks.sol',
)

// --- 2. les 14 permissions sont les 14 bits de poids faible de l adresse
const snap = JSON.parse(readFileSync(resolve(root, 'public/data/hooklist.snapshot.json'), 'utf8'))
// L instantane ne stocke pas les flags — ils se recalculent depuis l adresse. Ce qu il stocke,
// c est l ORDRE avec lequel le controle a ete fait. On exige que ce soit exactement l ordre livre.
check(
  JSON.stringify(snap.flag_bit_check.order) === JSON.stringify(ORDER.map((f) => f.key)),
  `l ordre des bits controle est celui de ${snap.flag_bit_check.order_source}`,
)
check(
  snap.flag_bit_check.entries_matching_low14bits === snap.flag_bit_check.entries,
  `bits de permission : ${snap.flag_bit_check.entries_matching_low14bits}/${snap.flag_bit_check.entries} fiches, ` +
    `${snap.flag_bit_check.comparisons} comparaisons, zero ecart`,
)
check(
  snap.flag_bit_check.comparisons === snap.flag_bit_check.entries * 14,
  `${snap.flag_bit_check.comparisons} comparaisons = ${snap.flag_bit_check.entries} fiches x 14 bits`,
)
check(
  snap.entries.every((e) => /^0x[0-9a-f]{40}$/.test(e.address)),
  'toutes les adresses conservees sont des adresses 20 octets en minuscules',
)

// --- 3. le registre est qualitatif
check(
  snap.field_census.quantitative_fields.length === 0,
  `registre : ${snap.field_census.leaf_fields} champs, ${snap.field_census.boolean_fields} booleens, ` +
    `numeriques [${snap.field_census.numeric_fields.join(', ')}], quantitatifs ${snap.field_census.quantitative_fields.length}`,
)

// --- 4. le jeu de donnees derive n invente rien
// Doit lire EXACTEMENT la meme source que build-dataset.mjs, sinon le recompte compare le jeu
// affiche a un autre corpus et invalide tout — ce qui est arrive en basculant sur le balayage complet.
const JSONL = resolve(repo, 'docs/dataset/measurements.jsonl')
const measurements = existsSync(JSONL)
  ? readFileSync(JSONL, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
  : JSON.parse(readFileSync(resolve(repo, 'docs/measurements-v1.json'), 'utf8'))
const ds = JSON.parse(readFileSync(resolve(root, 'src/data/dataset.json'), 'utf8'))
// Les lignes sont encodees par colonne dans le fichier ; ce qui suit les verifie DECODEES,
// c'est-a-dire exactement telles que l'instrument les lit.
ds.rows = decodeRows(ds.rows_enc)
check(ds.totals.rows === measurements.length, `${ds.totals.rows} lignes = les ${measurements.length} mesures brutes`)
const over1 = measurements.filter(
  (m) => (m.label === 'MESURE' || m.label === 'MEASURED') && typeof m.bps === 'number' && m.bps > 1 && m.stored_lp_fee === 0,
).length
check(
  ds.totals.over1bpsWithZeroStoredFee === over1,
  `${ds.totals.over1bpsWithZeroStoredFee} mesures > 1 bps sur stored_lp_fee = 0 (recompte : ${over1})`,
)
for (const h of ds.hooks) {
  const mine = measurements.filter((m) => m.hook === h.address)
  const vals = mine.filter((m) => typeof m.bps === 'number' && (m.label === 'MESURE' || m.label === 'MEASURED')).map((m) => m.bps)
  const max = vals.length ? Math.max(...vals) : null
  check(h.bpsMax === max, `${h.address.slice(0, 10)}… bpsMax = ${h.bpsMax} (recompte : ${max})`)
  check(
    h.rowCount === mine.length && h.poolCount === new Set(mine.map((m) => m.pool_id)).size,
    `${h.address.slice(0, 10)}… ${h.rowCount} lignes / ${h.poolCount} pools`,
  )
}
// Aucune valeur ne doit exister sans etiquette MESURE.
check(
  ds.rows.every((r) => (r.bps === null) === (r.label !== 'MESURE')),
  'aucune ligne ne porte un nombre sans l etiquette MESURE, et aucune MESURE n est sans nombre',
)

console.log(failures === 0 ? '\nTOUT TIENT' : `\n${failures} AFFIRMATION(S) INVALIDEE(S)`)
process.exit(failures === 0 ? 0 : 1)
