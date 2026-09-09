// LES TESTS DE L'ECRAN /route — a lancer avec le runner de Node, sans bundler ni framework :
//
//     cd apps/web && node --test src/lib/route.test.ts
//
// Ils tiennent les DEUX regles qui distinguent cet ecran d'un comparateur de prix :
//
//   1. une porte sans cout mesure n'est JAMAIS classee — meme si /route l'avait classee.
//      Non mesure n'est pas zero, et une derniere place se lit « cher » ;
//   2. une paire a porte unique n'est JAMAIS presentee comme un choix. Au recensement du
//      bloc epingle c'est le cas de la quasi-totalite des paires : un classement a un
//      element ferait croire a une alternative qui n'existe pas.
//
// Le runner de Node ne sait que retirer les types : il n'execute pas le JSX. La mise en
// scene est donc testee la ou elle est DECIDEE, dans les fonctions pures de ./route.ts, et
// un test lit le source de ../components/Route.tsx pour verifier que l'ecran ne peut pas
// contourner ce rangement. C'est ce qui rend les deux premiers tests concluants.
//
// Les deux fixtures en bas de fichier sont de VRAIES reponses de l'API : capturees en
// appelant buildRouteAnswer() (apps/api/src/route.ts) sur les fichiers du depot
// — docs/dataset/measurements.jsonl, docs/dataset/measurements-contestes.jsonl,
// docs/dataset/pools-liquides-full.json, bloc 50614000 — puis privees de leurs tableaux
// points[] pour tenir ici. Elles sont FIGEES : elles servent a eprouver le rangement,
// jamais a publier un chiffre. Les chiffres affiches, eux, viennent de l'API a l'execution.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decodeRows } from '../data/codec.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  DEMOTED_WHY,
  candidatePairs,
  doorsOf,
  partitionAnswer,
  presentationOf,
  probeOf,
  rankBadges,
  readAnswer,
  routePath,
  sizesOf,
  tokensByFrequency,
  type Mode,
  type RouteAnswer,
} from './route.ts'

const here = dirname(fileURLToPath(import.meta.url))
const webSrc = resolve(here, '..')

/* ------------------------------------------------------------------ fabriques */

/** Une reponse minimale, remplie champ par champ : rien n'est devine par le test. */
function answer(over: Record<string, unknown>) {
  return readAnswer({
    verdict: 'MULTIPLE_POOLS',
    headline: 'peu importe : l ecran ne lit pas la phrase pour decider',
    pair: { currency0: 'a', currency1: 'b' },
    direction: { zero_for_one: true, human: '0->1' },
    size: { requested_wei: null },
    block: { measurements: [50614000] },
    alternatives: { claim: 'PLUSIEURS_PORTES', pools_measured: 2, pools_in_census: 2, census_available: true },
    ranked: [],
    unranked: [],
    unmeasured_gates: [],
    counts: {},
    sources: [],
    ...over,
  })
}

function gate(over: Record<string, unknown>) {
  return {
    pool_id: 'p' + String(over['total_bps'] ?? 'x'),
    hook: 'h',
    lp_fee_bps_used: 5,
    hook_bps: 1,
    total_bps_formula: 'formule',
    label: 'MEASURED',
    measurement_id: 'm_test',
    labels_in_direction: { MEASURED: 8 },
    ...over,
  }
}

/* ------------------------------------------- regle 1 : pas de classement sans cout */

test("regle 1 — une porte sans cout total chiffre n'entre jamais dans le classement", () => {
  const a = answer({
    ranked: [
      gate({ total_bps: 12.5, pool_id: 'ok' }),
      gate({ total_bps: null, pool_id: 'nul' }),
      gate({ total_bps: '0', pool_id: 'chaine' }),
      gate({ total_bps: Number.NaN, pool_id: 'nan' }),
      gate({ total_bps: Number.POSITIVE_INFINITY, pool_id: 'inf' }),
    ],
  })
  const p = partitionAnswer(a)

  assert.equal(p.gates.length, 1, 'une seule porte porte un cout total fini')
  assert.equal(p.gates[0]!.pool_id, 'ok')
  assert.equal(p.demoted, 4, 'les quatre autres sont sorties du classement par l ecran')
  for (const g of p.gates) assert.ok(Number.isFinite(g.total_bps))
  for (const g of p.aside) {
    assert.equal(g.why, DEMOTED_WHY)
    assert.ok(/pas un cout de zero/.test(g.why_fr ?? ''), 'le motif dit que ce n est pas un zero')
  }
  // Et surtout : aucune des portes degradees ne recoit un cout, meme implicite.
  assert.ok(!p.aside.some((g) => 'total_bps' in (g as unknown as Record<string, unknown>)))
})

test('regle 1 — sur les vraies reponses, tout cout classe nomme la mesure qui le porte', () => {
  for (const fx of [MULTI, SINGLE]) {
    const a = readAnswer(fx)
    const p = partitionAnswer(a)
    assert.equal(p.demoted, 0, 'l API ne classe rien qui ne soit chiffre')
    assert.ok(p.gates.length > 0)
    for (const g of p.gates) {
      assert.ok(Number.isFinite(g.total_bps))
      assert.ok(g.measurement_id, 'chaque cout porte un identifiant de mesure')
      assert.ok(g.formula && g.formula.includes(g.measurement_id!), 'la formule nomme la mesure')
      assert.ok(g.replay, 'chaque cout porte sa commande de rejeu')
    }
    for (let i = 1; i < p.gates.length; i += 1)
      assert.ok(p.gates[i - 1]!.total_bps <= p.gates[i]!.total_bps, 'couts croissants')
  }
})

test('regle 1 — les etiquettes non chiffrables restent hors classement, avec leur motif', () => {
  const a = readAnswer(MULTI)
  const p = partitionAnswer(a)
  assert.equal(p.aside.length, 1)
  const hors = p.aside[0]!
  assert.equal(hors.why, 'NOT_QUOTABLE_AT_REQUESTED_SIZE')
  assert.ok(hors.why_fr && hors.why_fr.length > 20, 'le motif est rendu en clair')
  assert.ok(hors.nearest, 'la valeur voisine existe')
  assert.ok(
    /AUTRE taille/.test(hors.nearest!.note ?? ''),
    'et elle dit qu elle est a une autre taille que celle demandee',
  )
  assert.ok(
    !p.gates.some((g) => g.pool_id === hors.pool_id),
    'le pool hors classement n apparait nulle part dans le classement',
  )
})

/* --------------------------------------- regle 2 : une porte unique n'est pas un choix */

test("regle 2 — porte unique : un peage, aucun rang, aucun choix", () => {
  const a = readAnswer(SINGLE)
  const p = partitionAnswer(a)
  const pres = presentationOf(a, p)

  assert.equal(a.verdict, 'SINGLE_POOL')
  assert.equal(pres.mode, 'PEAGE')
  assert.equal(pres.isChoice, false, 'l ecran n a pas le droit de presenter un choix')
  assert.equal(pres.doors, 1)
  assert.equal(pres.tollSupported, true, 'le recensement soutient l absence d alternative')
  assert.deepEqual(rankBadges(p, pres), [], 'aucun rang 01 : il n y a pas de 02')
  assert.equal(p.gates.length, 1, 'le cout de la seule porte reste affichable')
})

test("regle 2 — une porte unique que le recensement ne couvre pas ne prend pas la phrase forte", () => {
  const a = answer({
    verdict: 'SINGLE_POOL',
    alternatives: {
      claim: 'INDETERMINE',
      sentence: 'cette paire n apparait pas dans le recensement',
      pools_measured: 1,
      pools_in_census: null,
      census_available: false,
    },
    ranked: [gate({ total_bps: 30 })],
  })
  const p = partitionAnswer(a)
  const pres = presentationOf(a, p)
  assert.equal(pres.mode, 'PEAGE')
  assert.equal(pres.isChoice, false)
  assert.equal(pres.tollSupported, false, 'sans recensement, aucune affirmation d unicite')
  assert.equal(pres.doorsSource, 'mesures')
})

test("regle 2 — un seul cout mesure entoure de portes non cotables n'est pas un classement", () => {
  const a = answer({
    alternatives: { claim: 'PLUSIEURS_PORTES', pools_measured: 4, pools_in_census: 4, census_available: true },
    ranked: [gate({ total_bps: 6 })],
    unranked: [
      { pool_id: 'q1', hook: 'h', why: 'NO_QUOTED_ROW_IN_DIRECTION', why_fr: 'rien de cotable' },
      { pool_id: 'q2', hook: 'h', why: 'NO_STORED_LP_FEE', why_fr: 'pas de frais LP lus', hook_bps: 300 },
      { pool_id: 'q3', hook: 'h', why: 'NO_ROW_IN_DIRECTION', why_fr: 'aucune ligne dans ce sens' },
    ],
  })
  const p = partitionAnswer(a)
  const pres = presentationOf(a, p)
  assert.equal(pres.mode, 'UNE_SEULE_MESURE')
  assert.equal(pres.isChoice, false)
  assert.deepEqual(rankBadges(p, pres), [])
  // La porte a 300 bps de prelevement de hook reste hors classement : sans frais LP lus,
  // le cout TOTAL n'existe pas, et un cout partiel ne se classe pas contre un cout total.
  assert.equal(p.aside.find((g) => g.pool_id === 'q2')!.hook_bps, 300)
  assert.ok(!p.gates.some((g) => g.pool_id === 'q2'))
})

test('plusieurs couts mesures : classement croissant et rangs numerotes', () => {
  const a = readAnswer(MULTI)
  const p = partitionAnswer(a)
  const pres = presentationOf(a, p)
  assert.equal(pres.mode, 'CLASSEMENT')
  assert.equal(pres.isChoice, true)
  assert.deepEqual(
    rankBadges(p, pres),
    p.gates.map((_, i) => String(i + 1).padStart(2, '0')),
  )
  assert.ok(pres.doors !== null && pres.doors >= 2)
  assert.equal(pres.doorsSource, 'recensement')
})

test("aucune mesure : ni classement, ni peage, ni zero", () => {
  const a = answer({
    verdict: 'NOT_MEASURED',
    alternatives: { claim: 'INDETERMINE', pools_measured: 0, pools_in_census: null, census_available: false },
  })
  const p = partitionAnswer(a)
  const pres = presentationOf(a, p)
  assert.equal(pres.mode, 'AUCUNE_MESURE')
  assert.equal(pres.isChoice, false)
  assert.equal(p.gates.length, 0)
  assert.deepEqual(rankBadges(p, pres), [])
})

/* ------------------------------------------------- l'ecran ne peut pas contourner ca */

test("l'ecran ne lit pas le classement de l'API : il lit le rangement", () => {
  const src = readFileSync(resolve(webSrc, 'components/Route.tsx'), 'utf8')
  assert.ok(src.includes('partitionAnswer('), 'Route.tsx passe par partitionAnswer')
  assert.ok(/part\.gates\.map\(/.test(src), 'le classement affiche vient de part.gates')
  assert.ok(!/\.ranked\b/.test(src), 'Route.tsx ne touche jamais answer.ranked directement')
  assert.ok(/rankBadges\(/.test(src), 'les rangs viennent de rankBadges, qui peut refuser d en donner')
  // Et il ne refait aucune addition de cout : /route est la seule autorite sur total_bps.
  // On cherche l'ADDITION, pas le signe : « frais LP 60.00 + hook 216.92 » est un texte
  // affiche, pas un calcul. Une addition s'ecrirait `x.lp_fee_bps +` ou `+ g.hook_bps`.
  assert.ok(!/\.lp_fee_bps\s*\+/.test(src), 'aucune addition de frais LP dans l ecran')
  assert.ok(!/\+\s*\w*\.hook_bps/.test(src), 'aucune recomposition de cout dans l ecran')
  assert.ok(!/\.total_bps\s*[+\-*/]/.test(src), 'aucun cout total retouche par l ecran')
})

test('aucune adresse, aucune paire, aucun cout ecrits en dur', () => {
  for (const f of ['lib/route.ts', 'components/Route.tsx']) {
    const src = readFileSync(resolve(webSrc, f), 'utf8')
    const litteral = src.match(/0x[0-9a-fA-F]{40}/g)
    assert.equal(litteral, null, `${f} contient une adresse ecrite en dur : ${litteral}`)
  }
})

/* --------------------------------------------- ce que l'ecran propose est derive du jeu */

test('les candidats, les jetons et les tailles sortent des lignes fournies', () => {
  const rows = [
    { currency0: '0xA', currency1: '0xB', amount_in: '1000' },
    { currency0: '0xA', currency1: '0xC', amount_in: '10' },
    { currency0: '0xB', currency1: '0xC', amount_in: '1000' },
    { currency0: '0xA', currency1: '0xD', amount_in: '100' },
  ]
  const t = tokensByFrequency(rows)
  assert.equal(t[0]!.address, '0xa')
  assert.equal(t[0]!.rows, 3)
  assert.deepEqual(sizesOf(rows), ['10', '100', '1000'], 'tailles dedoublonnees et croissantes')

  const c3 = candidatePairs(rows, 3)
  assert.equal(c3.length, 3, 'C(3,2) paires')
  assert.equal(new Set(c3.map((x) => x.key)).size, 3, 'aucune paire en double')
  assert.ok(!c3.some((x) => x.a === x.b), 'aucune paire d un jeton avec lui-meme')
  assert.equal(candidatePairs(rows, 10).length, 6, 'C(4,2) quand on demande plus de jetons qu il n y en a')
})

test('les candidats du vrai corpus embarque en sortent tous, et lui seul', () => {
  const ds = JSON.parse(readFileSync(resolve(webSrc, 'data/dataset.json'), 'utf8')) as {
    rows_enc: unknown
  }
  const rows = decodeRows<{ currency0: string; currency1: string; amount_in: string }>(ds.rows_enc)
  const jetons = new Set(tokensByFrequency(rows).map((t) => t.address))
  const c = candidatePairs(rows, 10)
  assert.equal(c.length, 45, 'C(10,2) candidats derives des 10 jetons les plus frequents')
  for (const p of c) {
    assert.ok(jetons.has(p.a) && jetons.has(p.b), 'les deux jetons viennent du corpus')
  }
  // Le nombre de portes n'est jamais decide ici : il vient de la reponse de l API.
  const p0 = probeOf(c[0]!, readAnswer(MULTI))
  assert.equal(doorsOf(p0), Math.max(readAnswer(MULTI).alternatives.pools_in_census ?? 0, readAnswer(MULTI).alternatives.pools_measured ?? 0))
})

test("une taille vide n'est pas une taille de zero dans l'URL", () => {
  const sans = routePath({ currency0: '0xa', currency1: '0xb', amount: '', zeroForOne: null })
  assert.ok(!sans.includes('amount='), 'aucune taille transmise')
  assert.ok(!sans.includes('zeroForOne='), 'aucun sens impose')
  const avec = routePath({ currency0: '0xa', currency1: '0xb', amount: '10', zeroForOne: false })
  assert.ok(avec.includes('amount=10') && avec.includes('zeroForOne=false'))
})


/* ------------------------------------ le cas reel : plusieurs portes, aucun cout dans ce sens */

// Ce mode n'est pas theorique. Au bloc epingle, la paire contestee
// 0xb2..f94199 / 0xb7eb..a3356 a DEUX portes, et dans le sens 0->1 aucune des deux ne cote :
// /route rend alors ranked=[] et unranked=[deux portes NO_QUOTED_ROW_IN_DIRECTION]. Verifie
// en appelant l'API sur le depot :
//   cd apps/api && npx tsx -e "import {buildRouteAnswer,loadPairIndex,loadCensus} from './src/route.ts'; \
//     const a=buildRouteAnswer({currency0:'0xb2000000000000000000007d9640993d01f94199', \
//     currency1:'0xb7ebae7b9135b6454a6ba0b5e483317f72ca3356',amount:null,zeroForOne:true}, \
//     loadPairIndex(true),loadCensus(true)); console.log(a.ranked.length,a.unranked.length)"
// L'ecran doit dire « aucun cout mesure dans ce sens », pas « aucune extraction ».
test("plusieurs portes mais aucune cotation dans ce sens : ce n'est ni un classement ni un zero", () => {
  const a = answer({
    direction: {
      zero_for_one: true,
      human: '0->1',
      hint: 'aucune porte ne cote dans le sens 0->1, mais 2 pool(s) cotent dans l autre sens',
      pools_quoted_in_other_direction: 2,
    },
    ranked: [],
    unranked: [
      { pool_id: 'q1', hook: 'h1', why: 'NO_QUOTED_ROW_IN_DIRECTION', why_fr: 'tout est NOT_QUOTABLE' },
      { pool_id: 'q2', hook: 'h2', why: 'NO_QUOTED_ROW_IN_DIRECTION', why_fr: 'tout est NOT_QUOTABLE' },
    ],
  })
  const p = partitionAnswer(a)
  const pres = presentationOf(a, p)

  assert.equal(pres.mode, 'AUCUN_COUT')
  assert.equal(pres.isChoice, false, 'sans aucun cout mesure il n y a rien a choisir')
  assert.deepEqual(rankBadges(p, pres), [])
  assert.equal(p.gates.length, 0, 'aucune porte chiffree')
  assert.equal(p.aside.length, 2, 'les deux portes restent LISTEES, hors classement')
  assert.equal(p.demoted, 0, "l API n avait rien classe : l ecran n a rien eu a degrader")
  // Le piege que ce test ferme : afficher 0 bps parce qu aucun cout n a ete lu.
  for (const g of p.aside) {
    assert.equal(g.hook_bps, null, 'aucun prelevement invente')
    assert.ok(/NOT_QUOTABLE|NO_QUOTED/.test(`${g.why} ${g.why_fr}`), 'le motif est porte')
  }
})

/* -------------------------------------- aucun mode autre que CLASSEMENT n'ouvre un choix */

// Exhaustif par construction : si quelqu un ajoute un mode a l avenir, il devra passer ici.
test('seul le mode CLASSEMENT autorise des rangs — tous les autres modes n en donnent aucun', () => {
  const cas: { mode: Mode; a: RouteAnswer }[] = [
    { mode: 'PEAGE', a: readAnswer(SINGLE) },
    { mode: 'CLASSEMENT', a: readAnswer(MULTI) },
    {
      mode: 'UNE_SEULE_MESURE',
      a: answer({
        alternatives: { claim: 'PLUSIEURS_PORTES', pools_measured: 2, pools_in_census: 2, census_available: true },
        ranked: [gate({ total_bps: 6 })],
        unranked: [{ pool_id: 'q', hook: 'h', why: 'NO_QUOTED_ROW_IN_DIRECTION', why_fr: 'rien' }],
      }),
    },
    {
      mode: 'AUCUN_COUT',
      a: answer({
        alternatives: { claim: 'PLUSIEURS_PORTES', pools_measured: 2, pools_in_census: 2, census_available: true },
        ranked: [],
        unranked: [
          { pool_id: 'q1', hook: 'h', why: 'NO_ROW_IN_DIRECTION', why_fr: 'rien' },
          { pool_id: 'q2', hook: 'h', why: 'NO_ROW_IN_DIRECTION', why_fr: 'rien' },
        ],
      }),
    },
    {
      mode: 'AUCUNE_MESURE',
      a: answer({
        verdict: 'NOT_MEASURED',
        alternatives: { claim: 'INDETERMINE', pools_measured: 0, pools_in_census: null, census_available: false },
      }),
    },
  ]
  const vus = new Set<Mode>()
  for (const c of cas) {
    const p = partitionAnswer(c.a)
    const pres = presentationOf(c.a, p)
    assert.equal(pres.mode, c.mode, `mode attendu pour le cas ${c.mode}`)
    vus.add(pres.mode)
    const rangs = rankBadges(p, pres)
    if (pres.mode === 'CLASSEMENT') {
      assert.equal(pres.isChoice, true)
      assert.equal(rangs.length, p.gates.length)
      assert.ok(rangs.length >= 2, 'un classement compte au moins deux couts')
    } else {
      assert.equal(pres.isChoice, false, `${pres.mode} ne presente jamais un choix`)
      assert.deepEqual(rangs, [], `${pres.mode} ne numerote aucune porte`)
    }
  }
  assert.equal(vus.size, 5, 'les cinq modes sont couverts par ce test')
})

/* ------------------------- l avertissement de taille est LA OU LE NOMBRE EST, pas en bas */

test("la taille non mesuree est dite dans la cellule du cout, pas en note de bas de page", () => {
  const src = readFileSync(resolve(webSrc, 'components/Route.tsx'), 'utf8')

  // 1. La regle est portee par une fonction dediee, et elle se tait quand la taille colle.
  assert.ok(/function SizeWarning\(/.test(src), 'un composant dedie porte l avertissement')
  assert.ok(
    /if \(!s \|\| s\.exact_match\) return null/.test(src),
    'aucun avertissement quand la taille demandee est celle qui a ete mesuree',
  )

  // 2. Il est rendu DANS la cellule qui porte le total : entre le nombre et la fin de la
  //    cellule, avant tout le reste de la ligne (hook, pool, formule, rejeu).
  const cellule = src.indexOf('rampCell(gate.total_bps)')
  const nombre = src.indexOf('fmtBps(gate.total_bps)')
  const avert = src.indexOf('<SizeWarning gate={gate} />')
  const suite = src.indexOf('hook {gate.hook')
  const rejeu = src.indexOf('gate.replay ?')
  assert.ok(cellule > 0 && nombre > 0 && avert > 0 && suite > 0 && rejeu > 0, 'reperes presents')
  assert.ok(cellule < nombre, 'la cellule du cout ouvre avant le nombre')
  assert.ok(nombre < avert, "l avertissement suit immediatement le nombre qu'il qualifie")
  assert.ok(avert < suite, "il est dans la cellule du cout, pas dans le bloc d identite de la porte")
  assert.ok(avert < rejeu, "il n est pas relegue en pied de ligne")

  // 3. Et il n existe qu une fois : pas de second avertissement en bas de panneau qui
  //    laisserait croire que le premier est optionnel.
  assert.equal(src.split('<SizeWarning').length - 1, 1, 'rendu exactement une fois, dans la cellule du cout')
})

/* ------------------- le sondage ne transforme jamais une paire non interrogee en zero porte */

test("le bandeau ne compte que les paires reellement interrogees", () => {
  const src = readFileSync(resolve(webSrc, 'components/Route.tsx'), 'utf8')
  // Le denominateur affiche est le nombre de candidats, le numerateur le nombre de reponses
  // recues. Une paire non sondee est donc VISIBLEMENT absente, jamais rangee a zero porte.
  assert.ok(/\{probed\}\/\{candidates\.length\}/.test(src), 'le compteur montre les deux nombres')
  // Le budget automatique est borne, et lever le plafond est un geste explicite.
  assert.ok(/const AUTO_PROBES = \d+/.test(src), 'le budget de sondage est une constante nommee')
  assert.ok(
    /onClick=\{\(\) => setBudget\(candidates\.length\)\}/.test(src),
    'le reste du sondage se demande, il ne se declenche pas tout seul',
  )
  // Et les trois tas du bandeau se lisent sur doorsOf, jamais sur un cout.
  assert.ok(/doorsOf\(p\) > 1/.test(src) && /doorsOf\(p\) === 1/.test(src), 'tri par nombre de portes')
  assert.ok(!/bps/.test(src.slice(src.indexOf('const multi ='), src.indexOf('const multi =') + 400)),
    'aucun cout n intervient dans le choix des paires proposees')
})

/* ----------------------------------------------------------------------- fixtures */

const MULTI = JSON.parse(`{
 "question": "echanger 0x0000000000000000000000000000000000000000 contre 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 : par quel pool passer ?",
 "verdict": "MULTIPLE_POOLS",
 "headline": "4 pools mesures pour cette paire : le classement ci-dessous va du cout total mesure le plus faible au plus eleve.",
 "pair": {
  "currency0": "0x0000000000000000000000000000000000000000",
  "currency1": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "as_asked": [
   "0x0000000000000000000000000000000000000000",
   "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
  ],
  "note": "la paire est insensible a l'ordre des arguments ; l'ordre canonique est celui de la PoolKey (currency0 < currency1)."
 },
 "direction": {
  "zero_for_one": true,
  "human": "0->1",
  "source": "ordre_des_arguments",
  "note": "sens deduit de l'ordre des arguments : le premier jeton donne est celui que l'on vend. Passe zeroForOne pour l'imposer.",
  "hint": null,
  "pools_quoted_in_other_direction": 0
 },
 "size": {
  "requested_wei": "1000000000000000000",
  "note": "chaque pool porte son propre champ size : exact_match dit si la taille demandee a ete mesuree telle quelle."
 },
 "block": {
  "measurements": [
   50614000
  ],
  "census": 50614000,
  "note": "toutes les mesures de cette paire viennent de ce bloc."
 },
 "alternatives": {
  "claim": "PLUSIEURS_PORTES",
  "sentence": "le recensement voit 4 portes pour cette paire, toutes couvertes par au moins une mesure.",
  "caveat": "le balayage de decouverte n'a pas pu lire 64 pools (voir pools-liquides-full.json.scan.json, unknown_pools) et le manifeste ne dit pas a quelles paires ils appartiennent : ce recensement est un MINORANT.",
  "pools_measured": 4,
  "pools_in_census": 4,
  "census_available": true,
  "pools_in_census_note": null
 },
 "structure": {
  "pairs_discovered": 7802,
  "pairs_with_more_than_one_pool": 8,
  "pairs_with_a_single_pool": 7794,
  "share_pct": 0.1025,
  "block_number": 50614000,
  "source": "/Users/beorlor/Documents/ethonline/ETH_Online_2026/docs/dataset/pools-liquides-full.json",
  "is_lower_bound": true,
  "caveat": "le balayage de decouverte n'a pas pu lire 64 pools (voir pools-liquides-full.json.scan.json, unknown_pools) et le manifeste ne dit pas a quelles paires ils appartiennent : ce recensement est un MINORANT.",
  "sentence": "Sur 7802 paires decouvertes au bloc 50614000, 8 offrent un choix de pool (0.1025 %). Pour les 7794 autres, il n'existe qu'une porte : un prelevement n'y est pas un prix concurrentiel, c'est un peage sur la seule route."
 },
 "structure_note": null,
 "counts": {
  "measurements_for_this_pair": 64,
  "measurements_in_direction": 32,
  "measurements_used_for_ranking": 3,
  "pools_measured": 4,
  "pools_ranked": 3,
  "pools_listed_unranked": 1,
  "gates_not_measured": 0,
  "pairs_covered_by_measurements": 4694,
  "measurements_total": 74483
 },
 "ranked": [
  {
   "pool_id": "0xbc1abbd1e582f6facd111e7ac88270d610255ff29b3f8c2ffa8d349a4095c834",
   "hook": "0x5641f004773b348b9498bdccb728a9db56bc80c4",
   "key_fee": 8388608,
   "fee_is_dynamic": true,
   "stored_lp_fee": 0,
   "lp_fee_bps": 0,
   "tick_spacing": 10,
   "measurements": 16,
   "measurements_in_direction": 8,
   "labels_all_directions": {
    "MEASURED": 7,
    "NOT_QUOTABLE": 9
   },
   "labels_in_direction": {
    "MEASURED": 7,
    "NOT_QUOTABLE": 1
   },
   "hook_bps": 0,
   "lp_fee_bps_used": 0,
   "total_bps": 0,
   "total_bps_formula": "stored_lp_fee/100 (0) + hook_bps (0) = 0  [mesure m_b1028fd5f9815e30]",
   "lp_fee_divergent_rows": null,
   "label": "MEASURED",
   "cost_basis": "taille_demandee",
   "size": {
    "requested_wei": "1000000000000000000",
    "used_wei": "1000000000000000000",
    "exact_match": true,
    "note": "cout lu a la taille demandee."
   },
   "measurement_id": "m_b1028fd5f9815e30",
   "block_number": 50614000,
   "direction": "0->1",
   "replay": "python3 apps/api/scripts/measure_one.py --rpc $RPC --block 50614000 --hooks 0x5641f004773b348b9498bdccb728a9db56bc80c4 --currency0 0x0000000000000000000000000000000000000000 --currency1 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 --fee 8388608 --tick-spacing 10 --zero-for-one true --amount-in 1000000000000000000"
  },
  {
   "pool_id": "0x438c4c680caa6eb423f98efe84736fbe52e7e56fad672253e51c9faccae09824",
   "hook": "0x7dbaf6df37436da054d95a845ad5e4cd42c500c4",
   "key_fee": 8388608,
   "fee_is_dynamic": true,
   "stored_lp_fee": 0,
   "lp_fee_bps": 0,
   "tick_spacing": 10,
   "measurements": 16,
   "measurements_in_direction": 8,
   "labels_all_directions": {
    "MEASURED": 7,
    "NOT_QUOTABLE": 9
   },
   "labels_in_direction": {
    "MEASURED": 7,
    "NOT_QUOTABLE": 1
   },
   "hook_bps": 0,
   "lp_fee_bps_used": 0,
   "total_bps": 0,
   "total_bps_formula": "stored_lp_fee/100 (0) + hook_bps (0) = 0  [mesure m_1da1830758470c02]",
   "lp_fee_divergent_rows": null,
   "label": "MEASURED",
   "cost_basis": "taille_demandee",
   "size": {
    "requested_wei": "1000000000000000000",
    "used_wei": "1000000000000000000",
    "exact_match": true,
    "note": "cout lu a la taille demandee."
   },
   "measurement_id": "m_1da1830758470c02",
   "block_number": 50614000,
   "direction": "0->1",
   "replay": "python3 apps/api/scripts/measure_one.py --rpc $RPC --block 50614000 --hooks 0x7dbaf6df37436da054d95a845ad5e4cd42c500c4 --currency0 0x0000000000000000000000000000000000000000 --currency1 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 --fee 8388608 --tick-spacing 10 --zero-for-one true --amount-in 1000000000000000000"
  },
  {
   "pool_id": "0x0640a8b46f4a47061bb9e742de5551e1c52bcbfd8f662a5da57c6ebe664a5ff5",
   "hook": "0xd8a63c167d5509d433d23659ba87cae2b87200c4",
   "key_fee": 8388608,
   "fee_is_dynamic": true,
   "stored_lp_fee": 0,
   "lp_fee_bps": 0,
   "tick_spacing": 10,
   "measurements": 16,
   "measurements_in_direction": 8,
   "labels_all_directions": {
    "MEASURED": 8,
    "NOT_QUOTABLE": 8
   },
   "labels_in_direction": {
    "MEASURED": 8
   },
   "hook_bps": 0,
   "lp_fee_bps_used": 0,
   "total_bps": 0,
   "total_bps_formula": "stored_lp_fee/100 (0) + hook_bps (0) = 0  [mesure m_b674bbf04913439f]",
   "lp_fee_divergent_rows": null,
   "label": "MEASURED",
   "cost_basis": "taille_demandee",
   "size": {
    "requested_wei": "1000000000000000000",
    "used_wei": "1000000000000000000",
    "exact_match": true,
    "note": "cout lu a la taille demandee."
   },
   "measurement_id": "m_b674bbf04913439f",
   "block_number": 50614000,
   "direction": "0->1",
   "replay": "python3 apps/api/scripts/measure_one.py --rpc $RPC --block 50614000 --hooks 0xd8a63c167d5509d433d23659ba87cae2b87200c4 --currency0 0x0000000000000000000000000000000000000000 --currency1 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 --fee 8388608 --tick-spacing 10 --zero-for-one true --amount-in 1000000000000000000"
  }
 ],
 "unranked": [
  {
   "pool_id": "0x2fcc6c5ff68b185fee2521a889a0a4e3c17dc7c981349b9ec68614a844ea9aff",
   "hook": "0xf4c3801c3eb091fe70a6375a3569ad8a1ac20044",
   "key_fee": 500,
   "fee_is_dynamic": false,
   "stored_lp_fee": 500,
   "lp_fee_bps": 5,
   "tick_spacing": 10,
   "measurements": 16,
   "measurements_in_direction": 8,
   "labels_all_directions": {
    "MEASURED": 6,
    "NOT_QUOTABLE": 10
   },
   "labels_in_direction": {
    "MEASURED": 6,
    "NOT_QUOTABLE": 2
   },
   "why": "NOT_QUOTABLE_AT_REQUESTED_SIZE",
   "why_fr": "a la taille demandee (1000000000000000000 wei) ce pool rend NOT_QUOTABLE. Ce n'est pas un cout de zero, et on ne lui substitue pas une autre taille pour le classer.",
   "label_at_requested_size": "NOT_QUOTABLE",
   "reason_at_requested_size": "NOT_ENOUGH_LIQUIDITY",
   "measurement_at_requested_size": "m_baa602ce34e6851d",
   "replay_at_requested_size": "python3 apps/api/scripts/measure_one.py --rpc $RPC --block 50614000 --hooks 0xf4c3801c3eb091fe70a6375a3569ad8a1ac20044 --currency0 0x0000000000000000000000000000000000000000 --currency1 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 --fee 500 --tick-spacing 10 --zero-for-one true --amount-in 1000000000000000000",
   "total_bps": null,
   "nearest_quoted": {
    "amount_in": "100000000000000000",
    "hook_bps": 1,
    "lp_fee_bps": 5,
    "total_bps": 6,
    "label": "MEASURED",
    "measurement_id": "m_4a1b1536d9a01f1d",
    "replay": "python3 apps/api/scripts/measure_one.py --rpc $RPC --block 50614000 --hooks 0xf4c3801c3eb091fe70a6375a3569ad8a1ac20044 --currency0 0x0000000000000000000000000000000000000000 --currency1 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 --fee 500 --tick-spacing 10 --zero-for-one true --amount-in 100000000000000000",
    "note": "cette valeur est a une AUTRE taille que celle demandee. Elle n'a pas servi au classement."
   }
  }
 ],
 "ranking_note": "au moins deux pools ont le MEME cout total mesure : leur ordre relatif est deterministe (frais LP puis adresse du hook) mais arbitraire. La mesure ne les separe pas.",
 "unranked_note": "ces pools sont LISTES et jamais classes : aucun cout ne leur est invente, aucun zero ne leur est prete, et leur place dans cette liste ne dit rien de leur prix.",
 "unmeasured_gates": [],
 "cost_model": {
  "formula": "total_bps = stored_lp_fee / 100 + hook_bps",
  "stored_lp_fee": "frais LP lus dans slot0 au bloc de la mesure, en centiemes de bps (pips).",
  "hook_bps": "prelevement du hook, mesure par contrefactuel : le meme swap cote deux fois, une fois avec le bytecode du hook, une fois avec un stub inerte de 89 octets pose par anvil_setCode. La PoolKey ne bouge pas.",
  "assumption": "l'addition suppose que la cotation sans hook paie exactement stored_lp_fee — ce que slot0 dit a ce bloc. Si un hook modifiait le frais stocke hors du chemin de swap, cette hypothese tomberait ; on ne l'a pas verifiee ici."
 },
 "sources": [
  {
   "path": "/Users/beorlor/Documents/ethonline/ETH_Online_2026/docs/dataset/measurements.jsonl",
   "kind": "jsonl",
   "exists": true,
   "rows_read": 74115,
   "rejected_lines": 0,
   "measurements": 74115
  },
  {
   "path": "/Users/beorlor/Documents/ethonline/ETH_Online_2026/docs/dataset/measurements-contestes.jsonl",
   "kind": "contestes",
   "exists": true,
   "rows_read": 368,
   "rejected_lines": 0,
   "measurements": 368
  }
 ],
 "census_source": {
  "path": "/Users/beorlor/Documents/ethonline/ETH_Online_2026/docs/dataset/pools-liquides-full.json",
  "available": true,
  "pools": 7817,
  "rejected_rows": 0,
  "duplicate_poolkeys_dropped": 0,
  "block_number": 50614000,
  "unreadable_pools": 64,
  "unreadable_pools_note": "pools que le balayage de decouverte n'a pas pu lire. Leurs paires sont inconnues : ils ne peuvent pas etre ecartes d'une paire donnee.",
  "rescan_command": "python3 -m tare.rescan /Users/beorlor/Documents/ethonline/ETH_Online_2026/docs/dataset/init-logs-200k.json /Users/beorlor/Documents/ethonline/ETH_Online_2026/docs/dataset/pools-liquides-full.json 50614000 12"
 },
 "dataset_notes": {
  "duplicates_dropped": 0,
  "skipped_without_pair": 0,
  "note": "les deux jsonl sont ecrits en direct par les balayages : rejected_lines compte les lignes illisibles, elles ne sont pas avalees."
 },
 "honesty": [
  "Aucun cout n'est estime : chaque nombre vient d'une mesure identifiee, avec son bloc, sa taille, son sens et sa commande de rejeu.",
  "NOT_QUOTABLE et NOT_MEASURABLE ne sont pas des zeros : les pools concernes sont listes hors classement.",
  "Une taille non mesuree n'est jamais inventee : elle est signalee par size.exact_match=false et size.used_wei.",
  "Les chiffres de structure sont derives du recensement a chaque appel, jamais ecrits en dur."
 ]
}`) as unknown

const SINGLE = JSON.parse(`{
 "question": "echanger 0x4200000000000000000000000000000000000006 contre 0x69df254076b8a0360ea1180b58aaf1749fe97786 : par quel pool passer ?",
 "verdict": "SINGLE_POOL",
 "headline": "Un seul pool mesure pour cette paire : il n'y a pas de recommandation a faire, il y a un peage a connaitre.",
 "pair": {
  "currency0": "0x4200000000000000000000000000000000000006",
  "currency1": "0x69df254076b8a0360ea1180b58aaf1749fe97786",
  "as_asked": [
   "0x4200000000000000000000000000000000000006",
   "0x69df254076b8a0360ea1180b58aaf1749fe97786"
  ],
  "note": "la paire est insensible a l'ordre des arguments ; l'ordre canonique est celui de la PoolKey (currency0 < currency1)."
 },
 "direction": {
  "zero_for_one": true,
  "human": "0->1",
  "source": "ordre_des_arguments",
  "note": "sens deduit de l'ordre des arguments : le premier jeton donne est celui que l'on vend. Passe zeroForOne pour l'imposer.",
  "hint": null,
  "pools_quoted_in_other_direction": 0
 },
 "size": {
  "requested_wei": "1000000000000000000",
  "note": "chaque pool porte son propre champ size : exact_match dit si la taille demandee a ete mesuree telle quelle."
 },
 "block": {
  "measurements": [
   50614000
  ],
  "census": 50614000,
  "note": "toutes les mesures de cette paire viennent de ce bloc."
 },
 "alternatives": {
  "claim": "AUCUNE_ALTERNATIVE",
  "sentence": "le recensement ne voit qu'un seul pool v4 pour cette paire au bloc 50614000 : aucune alternative n'existe a ce bloc, on ne peut pas contourner le hook. Reserve : le balayage de decouverte n'a pas pu lire 64 pools (voir pools-liquides-full.json.scan.json, unknown_pools) et le manifeste ne dit pas a quelles paires ils appartiennent : ce recensement est un MINORANT.",
  "caveat": "le balayage de decouverte n'a pas pu lire 64 pools (voir pools-liquides-full.json.scan.json, unknown_pools) et le manifeste ne dit pas a quelles paires ils appartiennent : ce recensement est un MINORANT.",
  "pools_measured": 1,
  "pools_in_census": 1,
  "census_available": true,
  "pools_in_census_note": null
 },
 "structure": {
  "pairs_discovered": 7802,
  "pairs_with_more_than_one_pool": 8,
  "pairs_with_a_single_pool": 7794,
  "share_pct": 0.1025,
  "block_number": 50614000,
  "source": "/Users/beorlor/Documents/ethonline/ETH_Online_2026/docs/dataset/pools-liquides-full.json",
  "is_lower_bound": true,
  "caveat": "le balayage de decouverte n'a pas pu lire 64 pools (voir pools-liquides-full.json.scan.json, unknown_pools) et le manifeste ne dit pas a quelles paires ils appartiennent : ce recensement est un MINORANT.",
  "sentence": "Sur 7802 paires decouvertes au bloc 50614000, 8 offrent un choix de pool (0.1025 %). Pour les 7794 autres, il n'existe qu'une porte : un prelevement n'y est pas un prix concurrentiel, c'est un peage sur la seule route."
 },
 "structure_note": null,
 "counts": {
  "measurements_for_this_pair": 5,
  "measurements_in_direction": 5,
  "measurements_used_for_ranking": 1,
  "pools_measured": 1,
  "pools_ranked": 1,
  "pools_listed_unranked": 0,
  "gates_not_measured": 0,
  "pairs_covered_by_measurements": 4740,
  "measurements_total": 75219
 },
 "ranked": [
  {
   "pool_id": "0x010d0023c9e072f62720b6627a13973b9505a3d80dccd59acdb2ca803826c538",
   "hook": "0x0469a4bd3724dc86c9542f4694c976da13c450c0",
   "key_fee": 8388608,
   "fee_is_dynamic": true,
   "stored_lp_fee": 0,
   "lp_fee_bps": 0,
   "tick_spacing": 200,
   "measurements": 5,
   "measurements_in_direction": 5,
   "labels_all_directions": {
    "MEASURED": 5
   },
   "labels_in_direction": {
    "MEASURED": 5
   },
   "hook_bps": 69.1703,
   "lp_fee_bps_used": 0,
   "total_bps": 69.1703,
   "total_bps_formula": "stored_lp_fee/100 (0) + hook_bps (69.1703) = 69.1703  [mesure m_626ae794a3cdb2bd]",
   "lp_fee_divergent_rows": null,
   "label": "MEASURED",
   "cost_basis": "taille_demandee",
   "size": {
    "requested_wei": "1000000000000000000",
    "used_wei": "1000000000000000000",
    "exact_match": true,
    "note": "cout lu a la taille demandee."
   },
   "measurement_id": "m_626ae794a3cdb2bd",
   "block_number": 50614000,
   "direction": "0->1",
   "replay": "python3 apps/api/scripts/measure_one.py --rpc $RPC --block 50614000 --hooks 0x0469a4bd3724dc86c9542f4694c976da13c450c0 --currency0 0x4200000000000000000000000000000000000006 --currency1 0x69df254076b8a0360ea1180b58aaf1749fe97786 --fee 8388608 --tick-spacing 200 --zero-for-one true --amount-in 1000000000000000000"
  }
 ],
 "unranked": [],
 "ranking_note": null,
 "unranked_note": "ces pools sont LISTES et jamais classes : aucun cout ne leur est invente, aucun zero ne leur est prete, et leur place dans cette liste ne dit rien de leur prix.",
 "unmeasured_gates": [],
 "cost_model": {
  "formula": "total_bps = stored_lp_fee / 100 + hook_bps",
  "stored_lp_fee": "frais LP lus dans slot0 au bloc de la mesure, en centiemes de bps (pips).",
  "hook_bps": "prelevement du hook, mesure par contrefactuel : le meme swap cote deux fois, une fois avec le bytecode du hook, une fois avec un stub inerte de 89 octets pose par anvil_setCode. La PoolKey ne bouge pas.",
  "assumption": "l'addition suppose que la cotation sans hook paie exactement stored_lp_fee — ce que slot0 dit a ce bloc. Si un hook modifiait le frais stocke hors du chemin de swap, cette hypothese tomberait ; on ne l'a pas verifiee ici."
 },
 "sources": [
  {
   "path": "/Users/beorlor/Documents/ethonline/ETH_Online_2026/docs/dataset/measurements.jsonl",
   "kind": "jsonl",
   "exists": true,
   "rows_read": 74851,
   "rejected_lines": 0,
   "measurements": 74851
  },
  {
   "path": "/Users/beorlor/Documents/ethonline/ETH_Online_2026/docs/dataset/measurements-contestes.jsonl",
   "kind": "contestes",
   "exists": true,
   "rows_read": 368,
   "rejected_lines": 0,
   "measurements": 368
  }
 ],
 "census_source": {
  "path": "/Users/beorlor/Documents/ethonline/ETH_Online_2026/docs/dataset/pools-liquides-full.json",
  "available": true,
  "pools": 7817,
  "rejected_rows": 0,
  "duplicate_poolkeys_dropped": 0,
  "block_number": 50614000,
  "unreadable_pools": 64,
  "unreadable_pools_note": "pools que le balayage de decouverte n'a pas pu lire. Leurs paires sont inconnues : ils ne peuvent pas etre ecartes d'une paire donnee.",
  "rescan_command": "python3 -m tare.rescan /Users/beorlor/Documents/ethonline/ETH_Online_2026/docs/dataset/init-logs-200k.json /Users/beorlor/Documents/ethonline/ETH_Online_2026/docs/dataset/pools-liquides-full.json 50614000 12"
 },
 "dataset_notes": {
  "duplicates_dropped": 0,
  "skipped_without_pair": 0,
  "note": "les deux jsonl sont ecrits en direct par les balayages : rejected_lines compte les lignes illisibles, elles ne sont pas avalees."
 },
 "honesty": [
  "Aucun cout n'est estime : chaque nombre vient d'une mesure identifiee, avec son bloc, sa taille, son sens et sa commande de rejeu.",
  "NOT_QUOTABLE et NOT_MEASURABLE ne sont pas des zeros : les pools concernes sont listes hors classement.",
  "Une taille non mesuree n'est jamais inventee : elle est signalee par size.exact_match=false et size.used_wei.",
  "Les chiffres de structure sont derives du recensement a chaque appel, jamais ecrits en dur."
 ]
}`) as unknown
