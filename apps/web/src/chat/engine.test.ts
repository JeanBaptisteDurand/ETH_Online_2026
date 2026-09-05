// LES TESTS DU CHAT — a lancer avec le runner de Node, sans bundler et sans framework :
//
//     cd apps/web && node --test src/chat/engine.test.ts src/chat/validate.test.ts
//
// Ils ne verifient pas que le code s'execute : ils RECOMPTENT. La selection de la demo est
// recalculee depuis docs/dataset/measurements.jsonl et l'instantane du registre, sans passer
// par src/data/dataset.json, puis comparee a ce que le moteur du chat produit. Si les deux
// divergent, le test tombe — exactement comme scripts/verify.mjs le fait pour la page.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import type { Hook, Row } from '../lib/dataset.ts'
import { buildModel, judge } from './model.ts'
import {
  applyActions,
  applyFilter,
  applySort,
  contradictions,
  crossCheck,
  decodeView,
  encodeView,
  exportRows,
  orphans,
  sameFilter,
  select,
  twins,
} from './engine.ts'
import { EMPTY_VIEW, NEGLIGIBLE_BPS } from './types.ts'
import type { Action, ChatView } from './types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '../..')
const repoRoot = resolve(webRoot, '../..')

const ds = JSON.parse(readFileSync(resolve(webRoot, 'src/data/dataset.json'), 'utf8')) as {
  hooks: Hook[]
  rows: Row[]
  provenance: { registry: { entries: number } }
  totals: { hooks: number; rows: number }
}
const model = buildModel(ds.hooks, ds.rows, ds.provenance.registry.entries)

/* ------------------------------------------------ le recompte independant */

type Raw = { hook: string; pool_id: string; bps: number | null; label: string }
const raws: Raw[] = readFileSync(resolve(repoRoot, 'docs/dataset/measurements.jsonl'), 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as Raw)

const snapshot = JSON.parse(
  readFileSync(resolve(webRoot, 'public/data/hooklist.snapshot.json'), 'utf8'),
) as { entries: { address: string; vanillaSwap: boolean; name: string }[] }
const registryByAddress = new Map(snapshot.entries.map((e) => [e.address.toLowerCase(), e]))

/** La selection de la demo, recalculee a la main depuis les sources brutes. */
function demoSelectionFromScratch(maxBps: number): string[] {
  const byHook = new Map<string, Raw[]>()
  for (const r of raws) {
    const arr = byHook.get(r.hook)
    if (arr) arr.push(r)
    else byHook.set(r.hook, [r])
  }
  const out: string[] = []
  for (const [hook, list] of byHook) {
    const measured = list.filter((m) => (m.label === 'MESURE' || m.label === 'MEASURED') && typeof m.bps === 'number')
    if (measured.length === 0) continue // measuredOnly
    const max = Math.max(...measured.map((m) => m.bps as number))
    const reg = registryByAddress.get(hook)
    if (!reg) continue // pas d'affirmation a contredire
    // registryDisagrees === true
    const disagrees =
      (reg.vanillaSwap === false && max < NEGLIGIBLE_BPS) || (reg.vanillaSwap === true && max >= NEGLIGIBLE_BPS)
    if (!disagrees) continue
    if (max > maxBps) continue
    out.push(hook)
  }
  return out.sort()
}

/* ------------------------------------------------------------- le modele */

test('le modele local couvre exactement les hooks du jeu publie', () => {
  assert.equal(model.hooks.length, ds.totals.hooks)
  assert.equal(
    model.hooks.reduce((n, h) => n + h.rowCount, 0),
    ds.totals.rows,
  )
})

test('judge() est le portage exact de store.ts : null n’est pas un accord', () => {
  assert.equal(judge(false, true, false, 0.5, 3).is, null)
  assert.equal(judge(true, false, null, 0.5, 3).is, null)
  assert.equal(judge(true, true, null, 0.5, 3).is, null)
  assert.equal(judge(true, true, false, null, 0).is, null)
  assert.equal(judge(true, true, false, 0.5, 3).is, true)
  assert.equal(judge(true, true, false, 1, 3).is, false)
  assert.equal(judge(true, true, true, 1, 3).is, true)
  assert.equal(judge(true, true, true, 0.5, 3).is, false)
})

test('les 14 bits de permission viennent de l’adresse, pas d’un RPC', () => {
  const h = model.byHook.get('0x0469a4bd3724dc86c9542f4694c976da13c450c0')
  assert.ok(h)
  assert.equal(h.flagBits.length, 14)
  assert.equal(h.mask, Number(BigInt(h.address) & 0x3fffn))
})

/* ---------------------------------------------------------------- la demo */

const DEMO: Action[] = [
  { type: 'reset' },
  { type: 'filter', filter: { registryDisagrees: true, measuredOnly: true, maxBps: 1 } },
  { type: 'columns', columns: ['hook', 'registre', 'mesure', 'etiquette'] },
  { type: 'sort', col: 'mesure', dir: 'asc' },
]

test('la demo reduit le tableau a la selection recomptee depuis les sources brutes', () => {
  const out = applyActions(DEMO, model)
  const attendu = demoSelectionFromScratch(1)
  assert.deepEqual([...out.selection].sort(), attendu)
  assert.ok(out.selection.length > 0, 'la demo doit retenir au moins une ligne')
  assert.ok(out.selection.length < model.hooks.length, 'la demo doit REDUIRE le tableau')
  assert.deepEqual(out.view.columns, ['hook', 'registre', 'mesure', 'etiquette'])
  assert.deepEqual(out.view.sort, { col: 'mesure', dir: 'asc' })
})

test('la demo ecarte au lieu de conclure, et dit pourquoi ligne par ligne', () => {
  const out = applyActions(DEMO, model)
  assert.ok(out.withheld.length > 0, 'la demo doit ecarter des lignes, pas les faire disparaitre')
  for (const w of out.withheld) {
    assert.ok(model.byHook.has(w.hook))
    assert.ok(w.reason.length > 0, 'un ecart sans motif est un silence')
    assert.ok(!out.selection.includes(w.hook))
  }
  // un hook sans aucune mesure ne peut etre ni au-dessus ni en dessous d'un seuil
  const sansMesure = model.hooks.filter((h) => h.measured === 0)
  assert.ok(sansMesure.length > 0)
  for (const h of sansMesure) {
    assert.ok(!out.selection.includes(h.address))
    assert.ok(out.withheld.some((w) => w.hook === h.address), `${h.address} doit etre ecarte AVEC son motif`)
    assert.notEqual(h.answerLabel, 'MESURE')
  }
})

test('la ligne ouverte apres la demo porte une courbe cotable', () => {
  const demo = applyActions(DEMO, model)
  const first = demo.selection[0]
  const node = model.byHook.get(first)
  assert.ok(node)
  const pool = node.profiles.find((p) => p.measured > 0)
  assert.ok(pool, 'la ligne ouverte doit avoir au moins un profil cotable')
  const out = applyActions([{ type: 'plotCurve', hook: first, pool: pool.poolId, direction: null }], model, demo.view)
  assert.equal(out.results[0].ok, true)
  assert.deepEqual(out.view.curve, { hook: first, pool: pool.poolId, direction: null })
  assert.equal(out.view.open?.hook, first)
  // la courbe ne perd pas le filtre de la demo : le tableau reste reduit
  assert.deepEqual(out.selection, demo.selection)
})

/* -------------------------------------------------------------- le filtre */

test('un seuil ne transforme jamais une absence en zero', () => {
  const sansMesure = model.hooks.filter((h) => h.bpsMax === null)
  assert.ok(sansMesure.length > 0, 'le jeu doit contenir au moins un hook sans valeur mesuree')
  const { kept, withheld } = applyFilter(model.hooks, { maxBps: 1000000 })
  for (const h of sansMesure) {
    assert.ok(!kept.includes(h))
    assert.ok(withheld.some((w) => w.hook === h.address))
  }
})

test('registryDisagrees ecarte les cas non tranchables au lieu de les compter comme accords', () => {
  const { kept, withheld } = applyFilter(model.hooks, { registryDisagrees: false })
  for (const h of model.hooks) {
    if (h.disagreement.is === null) {
      assert.ok(!kept.includes(h))
      assert.ok(withheld.some((w) => w.hook === h.address))
    }
  }
})

test('le filtre par permission lit les bits de l’adresse', () => {
  const { kept } = applyFilter(model.hooks, { flag: 'beforeSwap' })
  for (const h of kept) assert.equal(((BigInt(h.address) >> 7n) & 1n) === 1n, true)
})

test('le filtre libre cherche dans l’adresse et le nom du registre', () => {
  const { kept } = applyFilter(model.hooks, { search: 'clanker' })
  assert.ok(kept.length > 0)
  for (const h of kept) assert.ok(`${h.address} ${h.name ?? ''}`.toLowerCase().includes('clanker'))
})

/* ----------------------------------------------------------------- le tri */

test('le tri sur la mesure met les non mesures au bout, pas a zero', () => {
  const asc = applySort(model.hooks, 'mesure', 'asc')
  assert.equal(asc[0].bpsMax, null, 'en ordre croissant, une absence vaut -1 : elle passe avant 0')
  const desc = applySort(model.hooks, 'mesure', 'desc')
  assert.equal(desc[desc.length - 1].bpsMax, null)
  for (let i = 1; i < desc.length; i += 1) {
    const a = desc[i - 1].bpsMax ?? -1
    const b = desc[i].bpsMax ?? -1
    assert.ok(a >= b)
  }
})

/* ---------------------------------------------------------- la structure */

test('les jumeaux declarent exactement le meme masque de 14 bits', () => {
  for (const h of model.hooks) for (const t of twins(model, h.address)) assert.equal(t.mask, h.mask)
})

test('les contradictions etablies et les cas non tranchables ne se melangent pas', () => {
  const c = contradictions(model)
  for (const h of c.confirmed) assert.equal(h.disagreement.is, true)
  for (const u of c.unknowable) assert.equal(u.hook.disagreement.is, null)
  const total = c.confirmed.length + c.unknowable.length
  assert.equal(total + model.hooks.filter((h) => h.disagreement.is === false).length, model.hooks.length)
})

test('les orphelins sont les hooks mesures absents du registre', () => {
  const o = orphans(model)
  for (const h of o.measuredNotInRegistry) assert.equal(h.inRegistry, false)
  for (const p of o.poolsWithoutMeasurement) {
    const h = model.byHook.get(p.hook)
    assert.ok(h)
    assert.equal(h.profiles.find((x) => x.poolId === p.poolId)?.measured, 0)
  }
})

/* -------------------------------------------------- l'etat et le permalien */

test('reset efface filtre, tri, colonnes et surlignage', () => {
  const demo = applyActions(DEMO, model)
  const out = applyActions([{ type: 'reset' }], model, demo.view)
  assert.deepEqual(out.view, EMPTY_VIEW)
  assert.equal(out.selection.length, model.hooks.length)
})

test('le permalien fige des selecteurs, jamais une valeur mesuree', () => {
  const demo = applyActions(DEMO, model)
  const out = applyActions([{ type: 'permalink' }], model, demo.view)
  const hash = out.results[0].payload
  assert.ok(hash)
  const back = decodeView(hash)
  assert.ok(back)
  assert.ok(sameFilter(back.filter, demo.view.filter))
  assert.deepEqual(back.sort, demo.view.sort)
  // aucune valeur en bps ne voyage dans l'URL
  const decoded = decodeURIComponent(hash)
  for (const h of model.hooks)
    if (h.bpsMax !== null) assert.ok(!decoded.includes(h.bpsMax.toFixed(4)))
  assert.equal(decodeView('#rien'), null)
  assert.equal(decodeView(encodeView(EMPTY_VIEW))?.filter, null)
})

test('l’export recopie la selection et ses etiquettes, sans rien creer', () => {
  const demo = applyActions(DEMO, model)
  const rows = select(model, demo.view).rows
  const csv = exportRows(rows, 'csv')
  assert.equal(csv.split('\n').length, rows.length + 1)
  const jsonl = exportRows(rows, 'jsonl').split('\n').map((l) => JSON.parse(l) as Record<string, string>)
  assert.equal(jsonl.length, rows.length)
  for (let i = 0; i < rows.length; i += 1) {
    const max = rows[i].bpsMax
    assert.equal(jsonl[i].hook, rows[i].address)
    assert.equal(jsonl[i].bps_max, max === null ? '' : max.toFixed(4))
    assert.equal(jsonl[i].etiquette, rows[i].answerLabel)
  }
})

/* ------------------------------------------------------ le controle croise */

test('la divergence entre lecture locale et lecture serveur est dite, pas arbitree', () => {
  const f = { maxBps: 1 }
  assert.equal(crossCheck(['0xa'], ['0xa'], f, { maxBps: 1 }), null)
  const w = crossCheck(['0xa'], ['0xa', '0xb'], f, { maxBps: 1 })
  assert.ok(w && w.includes('divergent'))
  // criteres differents : on ne compare pas, donc on n'accuse pas
  assert.equal(crossCheck(['0xa'], ['0xa', '0xb'], f, { maxBps: 2 }), null)
  assert.equal(crossCheck(['0xa'], null, f, f), null)
})

test('une question qui ne touche pas au filtre l’avoue', () => {
  const demo = applyActions(DEMO, model)
  const out = applyActions([{ type: 'sort', col: 'pools', dir: 'desc' }], model, demo.view)
  assert.equal(out.notes.length, 1)
  const frais = applyActions([{ type: 'sort', col: 'pools', dir: 'desc' }], model, EMPTY_VIEW as ChatView)
  assert.equal(frais.notes.length, 0)
})

test('une demande de mesure n’est jamais executee par le navigateur', () => {
  const out = applyActions(
    [
      {
        type: 'measure',
        hook: model.hooks[0].address,
        pool: null,
        sizes: ['1000000000000000'],
        directions: ['0->1'],
        block: null,
      },
    ],
    model,
  )
  assert.equal(out.results[0].ok, false)
  assert.ok(out.results[0].note.toLowerCase().includes('un seul mesureur par anvil'))
  assert.ok(out.results[0].lines.some((l) => l.v.includes('POST /measure')))
})
