// Refait l'instantane du registre officiel Uniswap depuis la source, et RECOMPTE tout ce que
// l'interface affiche a son sujet. Aucun chiffre du registre n'est ecrit a la main dans le front.
//
//   node scripts/fetch-registry.mjs
//
// Ce script demande le reseau : il n'est PAS appele par `npm run build`. L'instantane qu'il
// produit est commite, epingle a un commit de github.com/Uniswap/hooklist.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data/hooklist.snapshot.json')
const REPO = 'https://github.com/Uniswap/hooklist'
const RAW = 'https://raw.githubusercontent.com/Uniswap/hooklist/main/hooklist.json'
const API = 'https://api.github.com/repos/Uniswap/hooklist/commits/main'

// L'ordre des bits n'est pas recopie ici : il est LU dans le fichier qui est livre au navigateur,
// src/lib/flags.ts. Le controle porte donc sur le code que l'utilisateur execute, pas sur un double.
const FLAGS_TS = resolve(dirname(fileURLToPath(import.meta.url)), '../src/lib/flags.ts')
const parsed = [...readFileSync(FLAGS_TS, 'utf8').matchAll(/\{\s*bit:\s*(\d+),\s*key:\s*'([A-Za-z]+)'/g)].map(
  (m) => ({ bit: Number(m[1]), key: m[2] }),
)
if (parsed.length !== 14 || parsed.some((f, i) => f.bit !== 13 - i)) {
  throw new Error(`src/lib/flags.ts : ordre de bits inattendu (${parsed.length} entrees)`)
}
const ORDER = parsed.map((f) => f.key)

const commit = (await (await fetch(API)).json()).sha
const source = await (await fetch(RAW)).json()

// --- controle : les 14 permissions sont-elles les 14 bits de poids faible de l'adresse ?
let comparisons = 0
let entriesMatching = 0
for (const e of source) {
  const n = BigInt(e.hook.address)
  let ok = true
  ORDER.forEach((key, i) => {
    comparisons += 1
    if ((((n >> BigInt(13 - i)) & 1n) === 1n) !== Boolean(e.flags[key])) ok = false
  })
  if (ok) entriesMatching += 1
}

// --- recensement des champs : combien sont numeriques ? Lesquels ?
const census = new Map()
const walk = (o, p = '') => {
  if (o !== null && typeof o === 'object' && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o)) walk(v, p ? `${p}.${k}` : k)
  } else {
    const t = o === null ? 'null' : typeof o
    if (!census.has(p)) census.set(p, new Set())
    census.get(p).add(t)
  }
}
for (const e of source) walk(e)
const fields = [...census.entries()].map(([path, types]) => ({ path, types: [...types].sort() }))
const numericFields = fields.filter((f) => f.types.includes('number')).map((f) => f.path)
const booleanFields = fields.filter((f) => f.types.includes('boolean')).map((f) => f.path)

// --- entrees compactees : les flags ne sont PAS stockes, ils se recalculent depuis l'adresse.
const seen = new Set()
const entries = []
for (const e of source) {
  const h = e.hook
  const p = e.properties
  const address = h.address.toLowerCase()
  const key = `${address}:${h.chainId}`
  if (seen.has(key)) continue
  seen.add(key)
  entries.push({
    address,
    chain: h.chain ?? '',
    chainId: h.chainId ?? 0,
    name: h.name ?? '',
    description: (h.description ?? '').slice(0, 400),
    deployer: h.deployer ?? '',
    verifiedSource: Boolean(h.verifiedSource),
    auditUrl: h.auditUrl ?? '',
    dynamicFee: Boolean(p.dynamicFee),
    upgradeable: Boolean(p.upgradeable),
    requiresCustomSwapData: Boolean(p.requiresCustomSwapData),
    vanillaSwap: Boolean(p.vanillaSwap),
    swapAccess: p.swapAccess ?? '',
  })
}

const snapshot = {
  source: REPO,
  file: 'hooklist.json',
  commit,
  fetched_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  entries_in_source: source.length,
  entries_kept: entries.length,
  flag_bit_check: {
    comparisons,
    entries_matching_low14bits: entriesMatching,
    entries: source.length,
    order: ORDER,
    order_source: 'src/lib/flags.ts',
  },
  field_census: {
    leaf_fields: fields.length,
    numeric_fields: numericFields,
    boolean_fields: booleanFields.length,
    // Aucun champ ne chiffre un prelevement. chainId est un identifiant de reseau.
    quantitative_fields: numericFields.filter((f) => !/chainId$/.test(f)),
  },
  entries,
}

writeFileSync(OUT, JSON.stringify(snapshot))
console.log(
  `hooklist.snapshot.json — commit ${commit.slice(0, 7)} · ${source.length} fiches · ` +
  `bits ${entriesMatching}/${source.length} (${comparisons} comparaisons) · ` +
  `${fields.length} champs feuilles, numeriques: [${numericFields.join(', ')}], ` +
  `quantitatifs: ${snapshot.field_census.quantitative_fields.length}`,
)
