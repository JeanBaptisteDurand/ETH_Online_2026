// LES TESTS DU CODEC DU JEU EMBARQUE — a lancer avec le runner de Node :
//
//     cd apps/web && node --test src/lib/codec.test.ts
//
// Le codec (src/data/codec.mjs) existe pour une raison mesuree : ecrites naivement, les
// 125 072 lignes pesaient 87 Mo dans le bundle, la page mettait 10,3 s avant d'afficher son
// premier texte et tenait 1,18 Go de tas. Encodees par colonne : 7,9 Mo.
//
// Mais un codec est un endroit ou une mesure peut se transformer en une autre sans que
// personne ne le voie. Tout l'instrument repose sur ces lignes, et sur le fait qu'aucune n'a
// ete arrondie, deplacee ou inventee. Ces tests tiennent donc trois choses :
//
//   1. l'aller-retour est SANS PERTE — memes cles, meme ordre, memes valeurs, y compris les
//      null (qui ne sont pas des zeros) et les 0 (qui ne sont pas des null) ;
//   2. une colonne qui VARIE a l'interieur d'un pool n'est jamais aplatie sur sa premiere
//      valeur. C'est le cas reel de stored_lp_fee, et l'aplatir donnerait a des milliers de
//      lignes un frais qui n'est pas le leur ;
//   3. le fichier reellement ecrit reste petit. Sans cette borne, un retour a l'ecriture
//      naive repasserait inapercu jusqu'au jour de la demonstration.
//
// Les deux derniers tests tiennent les deux autres corrections du meme lot : le tableau des
// lignes brutes est pagine, et la liste de completion des jetons est bornee. Sans elles, la
// page construisait 182 413 noeuds avant son premier texte.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { encodeRows, decodeRows } from '../data/codec.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const FICHIER = resolve(ICI, '../data/dataset.json')

/** Un jeu minuscule, mais qui couvre les quatre encodages et les cas qui piegent. */
type LigneJeu = {
  id: number
  pool_id: string
  hook: string
  chain_id: number
  bps: number | null
  lp: number | null
  label: string
  reason: string | null
}

const JEU: LigneJeu[] = [
  { id: 0, pool_id: 'p1', hook: 'h1', chain_id: 8453, bps: 1.5, lp: 0, label: 'MESURE', reason: null },
  { id: 1, pool_id: 'p1', hook: 'h1', chain_id: 8453, bps: null, lp: 0, label: 'NON_COTABLE', reason: 'ferme' },
  { id: 2, pool_id: 'p2', hook: 'h2', chain_id: 8453, bps: 9999.0001, lp: 3000, label: 'MESURE', reason: null },
  { id: 3, pool_id: 'p2', hook: 'h2', chain_id: 8453, bps: 0, lp: 3000, label: 'MESURE', reason: null },
]

test('l aller-retour est sans perte, cle par cle et valeur par valeur', () => {
  const relu = decodeRows(encodeRows(JEU))
  assert.deepEqual(relu, JEU)
  // deepEqual ne regarde pas l ordre des cles ; plusieurs verifications du depot comparent
  // par JSON.stringify, qui lui le regarde.
  for (let i = 0; i < JEU.length; i++) {
    assert.equal(JSON.stringify(relu[i]), JSON.stringify(JEU[i]))
  }
})

test('null et 0 ne sont jamais confondus : un silence n est pas un zero', () => {
  const relu = decodeRows<LigneJeu>(encodeRows(JEU))
  assert.equal(relu[1].bps, null)
  assert.equal(relu[3].bps, 0)
  assert.notEqual(relu[1].bps, relu[3].bps)
})

test('chaque colonne recoit l encodage que sa forme justifie', () => {
  const enc = encodeRows(JEU)
  assert.equal(enc.enc.chain_id.k, 'const', 'une seule valeur distincte')
  assert.equal(enc.enc.pool_id.k, 'groupe', 'la colonne qui definit les pools')
  assert.equal(enc.enc.hook.k, 'pool', 'constante a l interieur de chaque pool')
  assert.equal(enc.enc.lp.k, 'pool')
  assert.equal(enc.enc.id.k, 'seq', 'id vaut l indice : il ne s ecrit pas')
})

test('une colonne qui varie DANS un pool n est pas aplatie sur sa premiere valeur', () => {
  const varie = JEU.map((r, i) => ({ ...r, lp: i === 1 ? 500 : r.lp }))
  const enc = encodeRows(varie)
  assert.notEqual(enc.enc.lp.k, 'pool')
  assert.deepEqual(decodeRows<LigneJeu>(enc), varie)
  // et la ligne qui differait garde sa valeur, pas celle de sa voisine.
  assert.equal(decodeRows<LigneJeu>(enc)[1].lp, 500)
  assert.equal(decodeRows<LigneJeu>(enc)[0].lp, 0)
})

test('id qui ne vaut pas l indice n est pas remplace par l indice', () => {
  const decale = JEU.map((r) => ({ ...r, id: r.id + 100 }))
  const enc = encodeRows(decale)
  assert.notEqual(enc.enc.id.k, 'seq')
  assert.deepEqual(decodeRows<LigneJeu>(enc).map((r) => r.id), [100, 101, 102, 103])
})

test('un jeu vide se relit vide, sans lever', () => {
  assert.deepEqual(decodeRows(encodeRows([])), [])
})

// ------------------------------------------------------------- le vrai fichier

test('le fichier ecrit reste petit — la borne qui protege le jour de la demonstration', () => {
  const mo = statSync(FICHIER).size / 1048576
  assert.ok(mo < 20, `dataset.json pese ${mo.toFixed(1)} Mo ; ecrit naivement il en pesait 87`)
})

test('le vrai jeu se relit entierement, et son compte est celui que la page annonce', () => {
  const ds = JSON.parse(readFileSync(FICHIER, 'utf8')) as {
    rows_enc: unknown
    totals: { rows: number; measured: number; labelCounts: Record<string, number> }
  }
  const rows = decodeRows<{ label: string; bps: number | null }>(ds.rows_enc)
  assert.equal(rows.length, ds.totals.rows)
  const comptes: Record<string, number> = {}
  for (const r of rows) comptes[r.label] = (comptes[r.label] ?? 0) + 1
  assert.deepEqual(comptes, ds.totals.labelCounts)
  // et la regle qui tient tout le reste : un nombre n existe qu avec l etiquette MESURE.
  for (const r of rows) {
    if (r.label === 'MESURE') assert.equal(typeof r.bps, 'number')
    else assert.equal(r.bps, null)
  }
})

// ------------------------------------------------- ce qui construisait le DOM

test('le tableau des lignes brutes est pagine, et dit combien il en cache', () => {
  const src = readFileSync(resolve(ICI, '../components/Detail.tsx'), 'utf8')
  assert.match(src, /const PAGE = \d+/)
  assert.ok(src.includes('rows.slice(debut, debut + PAGE)'), 'le tableau rend une fenetre')
  assert.ok(!/\{rows\.map\(/.test(src), 'plus aucun rendu de la totalite des lignes')
  // Pagine n est pas tronque : le titre du panneau annonce toujours le TOTAL, la barre du bas
  // dit quelles lignes sont a l ecran sur combien, et la pire ligne reste a un clic.
  assert.ok(src.includes('raw rows of this hook'))
  assert.ok(src.includes('groupDigits(String(rows.length))'), 'le total est affiche')
  assert.ok(/go to the worst row/i.test(src), 'la pire ligne reste a un clic')
})

test('la completion des jetons est bornee, et le dit au lieu de faire croire a un filtre', () => {
  const src = readFileSync(resolve(ICI, '../components/Route.tsx'), 'utf8')
  assert.match(src, /const PROPOSES_MAX = \d+/)
  assert.ok(src.includes('tokens.slice(0, PROPOSES_MAX)'))
  assert.ok(!/\{tokens\.map\(/.test(src), 'le datalist ne rend plus les 8 583 jetons')
  // L ecran est en anglais. La regle gardee est la meme : la liste est BORNEE, et la page dit
  // qu elle l est — sinon une completion tronquee se lit comme un filtre.
  assert.ok(src.includes('any other address can be typed in'))
})
