#!/usr/bin/env node
/**
 * LES SYMBOLES DES JETONS, LUS SUR LA CHAINE UNE FOIS POUR TOUTES.
 *
 * POURQUOI CE FICHIER EXISTE.
 *
 * Le corpus ne porte que des ADRESSES. A l'ecran, « 0xb200…4199 » ne dit rien : on ne sait pas
 * quoi coller, ni ce qu'on regarde. Mais ecrire « USDC » a cote d'une adresse parce qu'elle y
 * ressemble serait exactement la faute que ce projet reproche au reste — un nom invente vaut
 * moins qu'une adresse nue.
 *
 * Alors on les LIT : `symbol()` et `name()`, deux `eth_call` par jeton, sur un vrai noeud Base.
 * Le resultat est ecrit ici dans un artefact SUIVI PAR GIT, et le site le lit au build. Aucune
 * requete a l'execution, et aucun appel RPC en CI : un clone frais a deja les symboles.
 *
 * CE QU'IL FAUT SAVOIR DU RESULTAT. Les jetons ou la comparaison de portes existe vraiment
 * sont, pour la plupart, des jetons de TEST — « This is a test token », « Flash POKE Sub Quote
 * Test ». C'est un fait sur Base au bloc epingle, pas un defaut de la mesure : les paires
 * serieuses n'ont presque jamais deux portes mesurees a la meme taille. Le fichier les rend
 * tels quels ; c'est a l'ecran de dire ce qu'ils sont.
 *
 *   node apps/web/scripts/fetch-symboles.mjs          # lit .env pour BASE_RPC_URL
 *   node apps/web/scripts/fetch-symboles.mjs --max 40
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = dirname(fileURLToPath(import.meta.url))
const web = resolve(ici, '..')
const depot = resolve(web, '../..')
const SORTIE = resolve(web, 'src/data/symboles.json')

const arg = (nom, defaut) => {
  const i = process.argv.indexOf(nom)
  return i === -1 ? defaut : process.argv[i + 1]
}
const MAX = Number(arg('--max', '40'))

/* ------------------------------------------------------------------ le noeud */

const env = existsSync(resolve(depot, '.env'))
  ? Object.fromEntries(
      readFileSync(resolve(depot, '.env'), 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    )
  : {}
const RPC = process.env['BASE_RPC_URL'] ?? env['BASE_RPC_URL']
if (!RPC) {
  console.error('BASE_RPC_URL absent : ni dans l\'environnement, ni dans .env — rien n\'est ecrit.')
  process.exit(1)
}

/* --------------------------------------------- quels jetons valent une lecture */

// Ceux que l'ecran montre : les jetons pour lesquels DEUX portes au moins sont mesurees dans
// la meme monnaie et a la meme taille. Ce sont les seuls ou la question « laquelle ? » se pose,
// donc les seuls qu'on propose — et donc les seuls qu'il faut savoir nommer.
const MONNAIES = new Set([
  '0x4200000000000000000000000000000000000006',
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  '0x0000000000000000000000000000000000000000',
])

const groupes = new Map()
const vus = new Map()
for (const ligne of readFileSync(resolve(depot, 'docs/dataset/measurements.jsonl'), 'utf8').split('\n')) {
  if (!ligne.trim()) continue
  const r = JSON.parse(ligne)
  for (const c of [r.currency0, r.currency1]) vus.set(c.toLowerCase(), (vus.get(c.toLowerCase()) ?? 0) + 1)
  if (r.label !== 'MEASURED' || r.bps === null || r.stored_lp_fee === null) continue
  for (const [t, autre] of [
    [r.currency0, r.currency1],
    [r.currency1, r.currency0],
  ]) {
    const jeton = t.toLowerCase()
    if (MONNAIES.has(jeton)) continue
    const cle = `${jeton}|${autre.toLowerCase()}|${r.amount_in}`
    const m = groupes.get(cle) ?? new Map()
    m.set(r.pool_id, r.stored_lp_fee / 100 + r.bps)
    groupes.set(cle, m)
  }
}

const ecarts = new Map()
for (const [cle, pools] of groupes) {
  if (pools.size < 2) continue
  const v = [...pools.values()]
  const jeton = cle.slice(0, cle.indexOf('|'))
  ecarts.set(jeton, Math.max(ecarts.get(jeton) ?? 0, Math.max(...v) - Math.min(...v)))
}

const candidats = [
  ...MONNAIES,
  ...[...ecarts.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a),
  ...[...vus.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a),
]
const cibles = [...new Set(candidats)].slice(0, MAX)

/* ------------------------------------------------------------------ la lecture */

const appel = async (to, data) => {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  })
  const j = await r.json()
  return j.result ?? null
}

/**
 * Decode une chaine ABI. Deux formes existent dans la nature : `string` dynamique (offset,
 * longueur, octets) et `bytes32` fixe — les jetons anciens. Les deux sont acceptees, et tout ce
 * qui n'est ni l'une ni l'autre rend `null` plutot qu'un charabia.
 */
const chaine = (hex) => {
  if (!hex || hex === '0x') return null
  const b = hex.slice(2)
  try {
    if (b.length <= 64) {
      const t = Buffer.from(b.replace(/0+$/, '').padEnd(Math.ceil(b.replace(/0+$/, '').length / 2) * 2, '0'), 'hex')
        .toString('utf8')
        .replace(/\0/g, '')
        .trim()
      return t || null
    }
    const len = parseInt(b.slice(64, 128), 16)
    if (!Number.isFinite(len) || len === 0 || len > 256) return null
    const t = Buffer.from(b.slice(128, 128 + len * 2), 'hex').toString('utf8').replace(/\0/g, '').trim()
    return t || null
  } catch {
    return null
  }
}

const table = {}
let lus = 0
for (const a of cibles) {
  if (a === '0x0000000000000000000000000000000000000000') {
    // La monnaie native n'est pas un contrat : personne ne peut lui demander son symbole.
    table[a] = { symbole: 'ETH', nom: 'Ether', natif: true }
    continue
  }
  const sym = chaine(await appel(a, '0x95d89b41'))
  const nom = chaine(await appel(a, '0x06fdde03'))
  lus += 2
  // Un jeton illisible n'est pas un jeton sans nom : il est NON LU, et l'ecran le dira.
  if (sym || nom) table[a] = { symbole: sym, nom }
}

writeFileSync(
  SORTIE,
  JSON.stringify(
    {
      schema: 'tare-symboles/1',
      quoi: 'symbol() et name() lus sur Base, pour les jetons que le site nomme a l ecran',
      chain_id: 8453,
      n_jetons: Object.keys(table).length,
      appels_rpc: lus,
      jetons: table,
    },
    null,
    1,
  ) + '\n',
)
console.log(`symboles.json — ${Object.keys(table).length} jetons nommes, ${lus} appels RPC`)
for (const [a, t] of Object.entries(table).slice(0, 6)) console.log(`  ${a}  ${t.symbole ?? '—'}  ${t.nom ?? '—'}`)
