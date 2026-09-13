// LES TESTS DU TEST DE SORTIE — a lancer avec le runner de Node, sans bundler ni framework :
//
//     cd apps/web && node --test src/lib/exit.test.ts
//
// Le nombre affiche par cet ecran est le seul de tout le site qu'un visiteur peut lire SANS
// savoir ce qu'est un point de base. C'est aussi celui qui peut mentir le plus discretement.
// Ces tests tiennent les quatre regles qui l'empechent :
//
//   1. un seul sens mesure ne rend PAS de reponse. Composer avec zero le sens inconnu donnerait
//      un nombre faux ET rassurant — le pire des deux ;
//   2. la composition n'est pas une somme : 100 bps puis 100 bps laisse 98,01 et non 98,00 ;
//   3. une revente qui varie rend un INTERVALLE, et le point retenu est le PIRE ;
//   4. les deux portages — celui du navigateur et celui de l'API — rendent le meme nombre sur
//      les memes lignes. C'est la seule chose qui rend l'ecran statique defendable : sinon le
//      site et l'API repondraient deux verites a la meme question.
//
// La regle 4 est verifiee en important reellement apps/api/src/exit.ts : les deux fichiers
// different par leurs etiquettes (MESURE cote jeu embarque, MEASURED cote moteur) et par rien
// d'autre. Si l'un derive, ce test tombe.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decodeRows } from '../data/codec.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { testDeSortie, phraseSortie, MONNAIES_DE_COTATION, type Ligne } from './exit.ts'
import { buildExitTest, phrase, type ExitTest, type ExitRefus } from '../../../api/src/exit.ts'

const ICI = dirname(fileURLToPath(import.meta.url))

const T = '0x1111111111111111111111111111111111111111'
const QUOTE = '0x4200000000000000000000000000000000000006'

/** Une ligne du jeu de mesures. Le jeton teste est en currency1 : l'acheter, c'est zeroForOne. */
function ligne(p: Partial<Ligne> & { zero_for_one: boolean; bps: number | null }): Ligne {
  return {
    currency0: QUOTE,
    currency1: T,
    amount_in: '1000000000000000',
    stored_lp_fee: 0,
    label: 'MESURE',
    pool_id: '0xpool',
    hook: '0xhook',
    block_number: 50614000,
    ...p,
  } as Ligne
}

// ---------------------------------------------------------------- 1. le refus

test('un seul sens mesure : pas de reponse, et la raison dit que l autre est INCONNU', () => {
  const r = testDeSortie(T, [ligne({ zero_for_one: true, bps: 100 })])
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.deepEqual(r.sensMesures, ['achat'])
  assert.match(r.raison, /INCONNU/)
  // et surtout : rien qui ressemble a un montant.
  assert.doesNotMatch(r.raison, /\d+[.,]\d\d/)
})

test('le sens manquant est nomme : revente seule mesuree', () => {
  const r = testDeSortie(T, [ligne({ zero_for_one: false, bps: 100 })])
  assert.equal(r.ok, false)
  if (!r.ok) assert.deepEqual(r.sensMesures, ['revente'])
})

test('aucune mesure chiffree : refus sans aucun sens, pas un zero', () => {
  const r = testDeSortie(T, [
    ligne({ zero_for_one: true, bps: null, label: 'NON_COTABLE' }),
    ligne({ zero_for_one: false, bps: null, label: 'NON_MESURABLE' }),
  ])
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.deepEqual(r.sensMesures, [])
    assert.match(r.raison, /aucun sens/)
  }
})

test('NON_COTABLE et NON_MESURABLE ne comptent jamais comme des mesures', () => {
  const r = testDeSortie(T, [
    ligne({ zero_for_one: true, bps: 100 }),
    ligne({ zero_for_one: false, bps: 100 }),
    // une ligne etiquetee mais chiffree : elle ne doit pas elargir l intervalle.
    ligne({ zero_for_one: false, bps: 9999, label: 'NON_COTABLE' }),
  ])
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.pire.reventePire.totalBps, 100)
})

test('un frais LP non lu n est pas un frais LP nul : la ligne sort du calcul', () => {
  // stored_lp_fee a null veut dire « slot0 non relu ». Le lire comme 0 rendrait un montant
  // de sortie trop flatteur, avec l air d une mesure.
  const r = testDeSortie(T, [
    ligne({ zero_for_one: true, bps: 100 }),
    ligne({ zero_for_one: false, bps: 100, stored_lp_fee: null }),
  ])
  assert.equal(r.ok, false)
  if (!r.ok) assert.deepEqual(r.sensMesures, ['achat'])
})

test('le frais LP non lu ne fait pas non plus baisser l intervalle par le bas', () => {
  const r = testDeSortie(T, [
    ligne({ zero_for_one: true, bps: 100 }),
    ligne({ zero_for_one: false, bps: 100, stored_lp_fee: 3000, amount_in: '1' }),
    ligne({ zero_for_one: false, bps: 100, stored_lp_fee: null, amount_in: '2' }),
  ])
  assert.equal(r.ok, true)
  // Sans la garde, la ligne a null serait lue « 0 bps de frais LP » et deviendrait la
  // MEILLEURE revente : l intervalle s ouvrirait vers un chiffre que rien n a mesure.
  if (r.ok) {
    assert.equal(r.pire.reventeMeilleure.totalBps, 130)
    assert.equal(r.pire.exact, true)
  }
})

// ------------------------------------------------------- 2. la composition

test('la composition n est pas une somme : 100 bps puis 100 bps laisse 98,01 et non 98,00', () => {
  const r = testDeSortie(T, [
    ligne({ zero_for_one: true, bps: 100 }),
    ligne({ zero_for_one: false, bps: 100 }),
  ])
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(phraseSortie(r, 100), 'il te reste 98.01 €')
})

test('les frais LP entrent dans le compte : stored_lp_fee est en centiemes de bps', () => {
  // 3000 (soit 0,30 %) = 30 bps, des deux cotes.
  const r = testDeSortie(T, [
    ligne({ zero_for_one: true, bps: 0, stored_lp_fee: 3000 }),
    ligne({ zero_for_one: false, bps: 0, stored_lp_fee: 3000 }),
  ])
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.pire.achat.totalBps, 30)
    assert.equal(phraseSortie(r, 100), 'il te reste 99.40 €')
  }
})

test('un prelevement au-dela de 100 % ne rend jamais un negatif', () => {
  const r = testDeSortie(T, [
    ligne({ zero_for_one: true, bps: 30 }),
    ligne({ zero_for_one: false, bps: 10029 }),
  ])
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(phraseSortie(r, 100), 'il te reste 0.00 €')
})

// ------------------------------------------------- 3. l intervalle et le pire

test('une revente qui varie rend un intervalle, borne par le pire et le meilleur', () => {
  const r = testDeSortie(T, [
    ligne({ zero_for_one: true, bps: 100 }),
    ligne({ zero_for_one: false, bps: 100, amount_in: '1' }),
    ligne({ zero_for_one: false, bps: 5000, amount_in: '2' }),
  ])
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.pire.exact, false)
  assert.ok(r.pire.gardeMin < r.pire.gardeMax)
  assert.equal(phraseSortie(r, 100), 'il te reste entre 49.50 et 98.01 €')
})

test('deux bornes qui s affichent pareil au centime ne sont pas annoncees comme un intervalle', () => {
  // 100.0000 et 99.9999 bps : un ecart reel, invisible sur 100 €. L annoncer userait la
  // confiance pour rien.
  const r = testDeSortie(T, [
    ligne({ zero_for_one: true, bps: 100 }),
    ligne({ zero_for_one: false, bps: 100, amount_in: '1' }),
    ligne({ zero_for_one: false, bps: 99.9999, amount_in: '2' }),
  ])
  assert.equal(r.ok, true)
  if (r.ok) assert.doesNotMatch(phraseSortie(r, 100), /entre/)
})

test('le point retenu est le PIRE achat, pas le premier ni le moyen', () => {
  const r = testDeSortie(T, [
    ligne({ zero_for_one: true, bps: 10, amount_in: '1' }),
    ligne({ zero_for_one: true, bps: 4000, amount_in: '2' }),
    ligne({ zero_for_one: true, bps: 20, amount_in: '3' }),
    ligne({ zero_for_one: false, bps: 0 }),
  ])
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.points.length, 3)
    assert.equal(r.pire.achat.totalBps, 4000)
  }
})

test('les tailles sont triees en entiers, pas en chaines : 9 avant 10', () => {
  const r = testDeSortie(T, [
    ligne({ zero_for_one: true, bps: 10, amount_in: '10000000000000000000' }),
    ligne({ zero_for_one: true, bps: 20, amount_in: '9000000000000000000' }),
    ligne({ zero_for_one: false, bps: 0 }),
  ])
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.points.map((p) => p.amountIn), [
    '9000000000000000000',
    '10000000000000000000',
  ])
})

// ------------------------------------------------------------- le sens

test('le sens d achat suit la PoolKey : jeton en currency0, acheter c est zeroForOne=false', () => {
  const enZero = (zero_for_one: boolean, bps: number): Ligne =>
    ({ ...ligne({ zero_for_one, bps }), currency0: T, currency1: QUOTE }) as Ligne
  const r = testDeSortie(T, [enZero(false, 100), enZero(true, 900)])
  assert.equal(r.ok, true)
  // L achat est la ligne zeroForOne=false (on va VERS currency0). Inverser ce test donnerait
  // le conseil contraire, avec le meme air de serieux.
  if (r.ok) assert.equal(r.pire.achat.totalBps, 100)
})

// ------------------------------------------- 4. les deux portages s accordent

const CAS: Array<[string, Ligne[]]> = [
  ['symetrique', [ligne({ zero_for_one: true, bps: 100 }), ligne({ zero_for_one: false, bps: 100 })]],
  [
    'intervalle',
    [
      ligne({ zero_for_one: true, bps: 30 }),
      ligne({ zero_for_one: false, bps: 100, amount_in: '1' }),
      ligne({ zero_for_one: false, bps: 9990, amount_in: '2' }),
    ],
  ],
  [
    'une revente au frais LP non lu, ecartee des deux cotes',
    [
      ligne({ zero_for_one: true, bps: 100 }),
      ligne({ zero_for_one: false, bps: 100, stored_lp_fee: 500, amount_in: '1' }),
      ligne({ zero_for_one: false, bps: 100, stored_lp_fee: null, amount_in: '2' }),
    ],
  ],
  [
    'plusieurs tailles a l achat',
    [
      ligne({ zero_for_one: true, bps: 12.5, amount_in: '1' }),
      ligne({ zero_for_one: true, bps: 1250, amount_in: '2' }),
      ligne({ zero_for_one: false, bps: 40, stored_lp_fee: 500 }),
    ],
  ],
]

/** Les memes lignes vues par le moteur : autre etiquette, et les champs que l API porte en plus. */
const versApi = (lignes: Ligne[]) =>
  lignes.map((l, i) => ({
    ...l,
    label: 'MEASURED',
    id: i,
    replay: { command_exact: `cast call --block 50614000 # ${i}` },
  })) as never

const estRefus = (r: ExitTest | ExitRefus): r is ExitRefus => 'refus' in r

for (const [nom, lignes] of CAS) {
  test(`navigateur et API rendent le meme nombre — ${nom}`, () => {
    const ici = testDeSortie(T, lignes)
    const la = buildExitTest(T, versApi(lignes))
    assert.equal(ici.ok, true)
    assert.equal(estRefus(la), false)
    if (!ici.ok || estRefus(la)) return
    assert.equal(ici.pire.gardeMin, la.pire.garde_min)
    assert.equal(ici.pire.gardeMax, la.pire.garde_max)
    assert.equal(ici.pire.exact, la.pire.exact)
    assert.equal(ici.points.length, la.points.length)
    // L API rend une phrase autonome ; le navigateur n en rend que la queue, parce que l ecran
    // ecrit lui-meme « Tu mets 100 € » autour du champ de saisie. Le reste doit coincider au
    // caractere pres — c est la que « entre » apparait ou disparait.
    assert.equal(phrase(la, 100, 'EUR'), `tu mets 100 EUR, ${phraseSortie(ici, 100, 'EUR')}`)
  })
}

test('navigateur et API refusent les memes lignes, pour la meme raison', () => {
  const lignes = [ligne({ zero_for_one: true, bps: 100 })]
  const ici = testDeSortie(T, lignes)
  const la = buildExitTest(T, versApi(lignes))
  assert.equal(ici.ok, false)
  assert.equal(estRefus(la), true)
  if (ici.ok || !estRefus(la)) return
  assert.deepEqual(ici.sensMesures, la.sens_mesures)
  assert.equal(ici.raison, la.raison)
})

// ------------------------------------------------ le vrai jeu, et l ecran

test('sur le jeu embarque, le pool piege 0xb2000000…5615bfb8 ne laisse rien', () => {
  const dataset = JSON.parse(
    readFileSync(resolve(ICI, '../data/dataset.json'), 'utf8'),
  ) as { rows_enc: unknown }
  const t = '0xb2000000000000000000000518f4215d5615bfb8'
  const lignes = decodeRows<Ligne>(dataset.rows_enc).filter(
    (r) => r.currency0.toLowerCase() === t || r.currency1.toLowerCase() === t,
  )
  assert.ok(lignes.length > 0, 'le jeton doit etre dans le jeu embarque')
  const r = testDeSortie(t, lignes)
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(phraseSortie(r, 100), 'il te reste 0.00 €')
})

test('les monnaies de cotation ne sont pas des jetons a tester', () => {
  assert.equal(MONNAIES_DE_COTATION[QUOTE], 'WETH')
  assert.equal(MONNAIES_DE_COTATION['0x0000000000000000000000000000000000000000'], 'ETH')
})

test('l ecran ne peut pas afficher de montant sur un refus', () => {
  const src = readFileSync(resolve(ICI, '../components/Exit.tsx'), 'utf8')
  // LA GARANTIE, et elle n a pas bouge : la phrase qui porte un MONTANT n est ecrite que dans
  // la branche 'ok'. L ecran est passe en anglais et la fonction s appelle desormais
  // `phraseEnAnglais` ; ce que le test garde est identique — un refus ne peut pas produire un
  // nombre. On verifie donc qu elle n est appelee qu une fois, et apres le debut du bloc 'ok'.
  // Deux occurrences attendues : la DECLARATION de la fonction, et son unique APPEL. Une
  // troisieme voudrait dire qu un montant s ecrit ailleurs que dans la branche 'ok'.
  const appels = src.match(/phraseEnAnglais\(/g) ?? []
  assert.equal(appels.length, 2, 'la phrase chiffree ne doit etre appelee qu a un seul endroit')
  const bloc = src.slice(src.indexOf("resultat?.etat === 'ok'"))
  assert.ok(bloc.includes('phraseEnAnglais('), 'le seul appel doit etre dans la branche ok')
  // et le refus dit sa raison plutot que de se taire.
  assert.ok(src.includes('{resultat.raison}'))
})
