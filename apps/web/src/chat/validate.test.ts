// LA BARRIERE D'ENTREE DU FRONT.
//
// Ce qui est teste ici n'est pas "le parseur marche" : c'est qu'un NOMBRE INVENTE ne peut pas
// entrer dans l'interface par la porte des actions. Les objets sont stricts, donc une action
// enrichie d'un { bps: 42 } est refusee en bloc au lieu d'etre nettoyee en silence.

import test from 'node:test'
import assert from 'node:assert/strict'
import { parseActions, parseFilter } from './validate.ts'

const HOOK = '0x0469a4bd3724dc86c9542f4694c976da13c450c0'
const POOL = '0x' + 'ab'.repeat(32)

test('les actions de la demo passent telles que le planificateur les emet', () => {
  const r = parseActions([
    { type: 'reset' },
    { type: 'filter', filter: { registryDisagrees: true, measuredOnly: true, maxBps: 1 } },
    { type: 'columns', columns: ['hook', 'registre', 'mesure', 'etiquette'] },
    { type: 'sort', col: 'mesure', dir: 'asc' },
  ])
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.actions.length, 4)
})

test('un resultat de mesure glisse dans un filtre fait echouer la validation', () => {
  const r = parseActions([{ type: 'filter', filter: { maxBps: 1, bps: 42 } }])
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.issues[0].includes('cle inconnue "bps"'))
})

test('une cle inconnue au niveau de l’action est refusee, pas ignoree', () => {
  const r = parseActions([{ type: 'sort', col: 'mesure', dir: 'asc', valeur: 1176.46 }])
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.issues[0].includes('cle inconnue "valeur"'))
})

test('un type d’action inconnu ne s’execute pas', () => {
  const r = parseActions([{ type: 'dropTable' }])
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.issues[0].includes('dropTable'))
})

test('les adresses et pool_id sont contraints, et mis en minuscules', () => {
  const r = parseActions([{ type: 'open', hook: HOOK.toUpperCase().replace('0X', '0x'), pool: null }])
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.actions[0].type === 'open' && r.actions[0].hook, HOOK)
  assert.equal(parseActions([{ type: 'open', hook: '0x1234', pool: null }]).ok, false)
  assert.equal(parseActions([{ type: 'plotCurve', hook: HOOK, pool: '0xdead', direction: null }]).ok, false)
  assert.equal(parseActions([{ type: 'plotCurve', hook: HOOK, pool: POOL, direction: '0->1' }]).ok, true)
})

test('minBps doit rester sous maxBps, et les seuils restent bornes', () => {
  assert.throws(() => parseFilter({ minBps: 10, maxBps: 1 }))
  assert.throws(() => parseFilter({ maxBps: -1 }))
  assert.throws(() => parseFilter({ maxBps: 2_000_000 }))
  assert.deepEqual(parseFilter({ minBps: 1, maxBps: 10 }), { minBps: 1, maxBps: 10 })
})

test('une etiquette hors des quatre autorisees est refusee', () => {
  assert.throws(() => parseFilter({ label: 'PRESQUE_MESURE' }))
  assert.deepEqual(parseFilter({ label: 'NOT_MEASURABLE' }), { label: 'NOT_MEASURABLE' })
})

test('une taille de swap est un entier en unites de base, jamais un flottant', () => {
  assert.equal(
    parseActions([{ type: 'measure', hook: HOOK, pool: null, sizes: ['0.5'], directions: ['0->1'], block: null }]).ok,
    false,
  )
  assert.equal(
    parseActions([{ type: 'measure', hook: HOOK, pool: null, sizes: ['1000000000000000'], directions: ['0->1'], block: null }])
      .ok,
    true,
  )
})

test('un id de mesure respecte la forme du jeu, sinon rien n’est ouvert', () => {
  assert.equal(parseActions([{ type: 'showEvidence', measurementId: 'm_0123456789abcdef' }]).ok, true)
  assert.equal(parseActions([{ type: 'showEvidence', measurementId: 'm_zz' }]).ok, false)
})

test('la liste est bornee et chaque echec est rapporte a son index', () => {
  assert.equal(parseActions(new Array(25).fill({ type: 'reset' })).ok, false)
  const r = parseActions([{ type: 'reset' }, { type: 'sort', col: 'inconnue', dir: 'asc' }])
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.issues[0].startsWith('[1]'))
  assert.equal(parseActions('pas un tableau').ok, false)
})
