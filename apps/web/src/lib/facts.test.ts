// LES TESTS DES PANNEAUX 08 A 12 — a lancer avec le runner de Node :
//
//     cd apps/web && node --test src/lib/facts.test.ts
//
// Ces cinq panneaux ont ete ajoutes parce que le site n'en montrait RIEN : sur les 57 904
// caracteres rendus par la page, « x402 », « Hedera », « HCS », « attestation », « Ledger »
// et « MCP » apparaissaient exactement zero fois, et la page entiere ne portait qu'UN lien.
// Tout le peage regle sur Hedera, le journal d'audit, l'identite d'agent, les attestations
// on-chain et la validation par The Graph n'existaient que dans le depot.
//
// Les afficher cree un risque neuf, et c'est celui-la que ces tests tiennent : une vitrine
// est exactement l'endroit ou un chiffre faux passe le mieux. Trois regles :
//
//   1. AUCUN nombre n'est ecrit dans le composant. Tout vient de src/data/facts.json, assemble
//      au build depuis les fichiers du depot. Un chiffre recopie a la main cesse d'etre vrai
//      sans prevenir — c'est deja arrive deux fois dans ce projet (« six real payments » alors
//      que le journal en portait quatre ; « 0,005 USDC par mesure » alors que 0,005 etait le
//      prix d'une requete a CINQ mesures).
//   2. Une source absente met le fait a `null` et l'ecran DIT « non lu ». Jamais un blanc,
//      qui se lirait « rien », et rien se lit « zero ».
//   3. Ce qui nuance un chiffre part AVEC lui : l'hypothese de l'estimation The Graph, les
//      hooks ecartes faute de mesure, les competences volontairement non revendiquees, et
//      l'absence de vecteur de reference pour HCS-14.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ICI = dirname(fileURLToPath(import.meta.url))
const FACTS = resolve(ICI, '../data/facts.json')
const PANNEAUX = resolve(ICI, '../components/Machine.tsx')

type Ligne402 = { transaction: string; hashscan: string; cle: string; montant: string | null }
type Facts = {
  manquants: string[]
  sources: Record<string, string>
  depot: string
  x402: {
    regles: number; vus: number; par_keyring: number
    prix_unite_usd: number | null; montants: string[]; lignes: Ligne402[]
  }
  agent: {
    etat: string; sequence: number | null; consensus: string | null
    uaid: string; canonical_json: string; hashscan: string
    ecartees: { code: number; nom: string; pourquoi: string }[]
  }
  attestations: { contrat: string; hashscan: string; corpus_digest: string; ecrits: number; ecartes: number }
  registre: {
    mesures: number
    epingle: { commit: string | null; le: string | null; adresses: number; absents: number }
    plus_recent: { le: string; adresses: number; absents: number }
    gagnes: string[]
  }
  graph: {
    hypothese: string; au_taux_median_usd: number; au_taux_maximum_usd: number
    retrouves: number; pools_du_recensement: number; part: number
  }
  garde: { exemples: { basescan: string }[] }
  mcp: { outils: string[] }
} & Record<string, unknown>

const f = JSON.parse(readFileSync(FACTS, 'utf8')) as Facts
const src = readFileSync(PANNEAUX, 'utf8')

/* ------------------------------------------------- 1. les faits sont assembles */

test('toutes les sources ont ete lues — aucun fait ne manque a ce build', () => {
  assert.deepEqual(f.manquants, [], `sources absentes : ${f.manquants.join(', ')}`)
})

test('chaque bloc de faits nomme le fichier dont il vient', () => {
  for (const cle of ['x402', 'agent', 'attestations', 'graph', 'garde', 'mcp']) {
    assert.ok(f.sources[cle], `${cle} doit nommer sa source`)
    assert.notEqual(f[cle], null, `${cle} ne doit pas etre nul sur ce build`)
  }
})

/* --------------------------------- 2. rien n'est recopie a la main dans l'ecran */

test('le composant ne porte aucun chiffre en dur — ils viendraient a mentir', () => {
  // On tolere les valeurs de mise en page (tailles, marges, indices de panneau) et les
  // diviseurs d'unites. Ce qu'on interdit, ce sont les GRANDEURS du projet.
  const interdits = [
    '125 072', '125072', '7 817', '7817', '99 ', '9999', '581 532', '581532',
    '58 162', '0.001 USDC', '4 paiements', '8 transactions', '0.0.10371106',
  ]
  for (const mot of interdits) {
    // `0.0.10371106` a le droit d'apparaitre en commentaire d'entete, pas dans du JSX.
    const dansJsx = src
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
      .join('\n')
    assert.ok(
      !dansJsx.includes(mot),
      `« ${mot} » est ecrit en dur dans Machine.tsx : il doit venir de facts.json`,
    )
  }
})

test('le prix unitaire est celui de l API, pas le montant d une requete', () => {
  // Le bug reel : le premier reglement du journal vaut 5000 (cinq mesures), et l'ecran
  // l'affichait comme « 0,005 USDC par mesure ». Le prix unitaire est lu dans le source
  // de l'API, et les montants reellement regles sont montres a cote pour qu'on voie
  // pourquoi ils different.
  assert.equal(f.x402.prix_unite_usd, 0.001)
  assert.ok(f.x402.montants.length >= 1)
  assert.ok(
    Number(f.x402.montants[f.x402.montants.length - 1]) > Number(f.x402.montants[0]),
    'les montants regles doivent varier : c est ce qui prouve la facturation a la mesure',
  )
})

/* ------------------------------------- 3. « regle » veut dire relu sur le mirror */

test('seuls les paiements RELUS sur le mirror node sont comptes comme regles', () => {
  const brut = readFileSync(resolve(ICI, '../../../../docs/x402-settlements.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as unknown)
  const verifies = (brut as { mirror?: { verified?: boolean } }[]).filter(
    (r) => r?.mirror?.verified === true,
  )
  assert.equal(f.x402.regles, verifies.length)
  assert.equal(f.x402.vus, brut.length)
  // et chaque ligne affichee porte son lien de verification
  for (const l of f.x402.lignes) {
    assert.ok(l.transaction, 'une ligne sans transaction ne serait pas verifiable')
    assert.match(l.hashscan, /^https:\/\/hashscan\.io\//)
  }
})

test('la cle qui a signe est dite pour chaque paiement, jamais supposee', () => {
  for (const l of f.x402.lignes) assert.ok(l.cle === 'ledger-keyring' || l.cle === 'env')
  assert.equal(
    f.x402.par_keyring,
    f.x402.lignes.filter((l) => l.cle === 'ledger-keyring').length,
  )
})

/* -------------------------------------------------- 4. l identite est verifiable */

test("l identite n est affichee comme annoncee que si le mirror l a rendue", () => {
  assert.ok(['ANNOUNCED', 'NOT_ANNOUNCED'].includes(f.agent.etat))
  if (f.agent.etat === 'ANNOUNCED') {
    assert.ok(typeof f.agent.sequence === 'number', 'une annonce a un numero de message')
    assert.ok(f.agent.consensus !== null, 'une annonce a un horodatage de consensus')
    assert.match(f.agent.consensus, /^\d+\.\d+$/)
  } else {
    assert.equal(f.agent.sequence, null, 'pas d annonce => pas de numero')
  }
  // Le composant doit distinguer les deux etats, pas afficher « annonce » quoi qu il arrive.
  assert.ok(src.includes("a.etat === 'ANNOUNCED'"))
})

test("les six champs sont affiches, pour qu un tiers recalcule au lieu de croire", () => {
  assert.ok(src.includes('a.canonical_json'), "le JSON canonique doit etre a l ecran")
  const c = JSON.parse(f.agent.canonical_json)
  assert.deepEqual(Object.keys(c).sort(), [
    'name', 'nativeId', 'protocol', 'registry', 'skills', 'version',
  ])
  assert.equal(f.agent.uaid.split(';')[0], `uaid:aid:${f.agent.uaid.split(':')[2].split(';')[0]}`)
})

test("les competences ecartees sont montrees — c est ce qui rend credibles celles qu on garde", () => {
  const codes = f.agent.ecartees.map((e) => e.code).sort((a, b) => a - b)
  assert.deepEqual(codes, [7, 11, 34])
  for (const e of f.agent.ecartees) assert.ok(e.pourquoi.length > 10)
  assert.ok(src.includes('a.ecartees'), "l ecran doit les rendre, pas seulement les porter")
})

test("la limite de la norme HCS-14 est ecrite a l ecran, pas seulement dans un README", () => {
  assert.match(src, /sans leurs\s*<\/strong>?\s*|sans leurs/)
  assert.ok(src.includes('aucun resultat de reference'))
})

/* ------------------------------------------- 5. les attestations disent l ecart */

test('les hooks ecartes faute de mesure sont affiches a cote de ceux qui sont ecrits', () => {
  assert.ok(typeof f.attestations.ecrits === 'number' && f.attestations.ecrits > 0)
  assert.ok(typeof f.attestations.ecartes === 'number')
  assert.ok(src.includes('a.ecartes'), 'les ecartes doivent etre rendus')
  assert.ok(src.includes('pas ecrits a zero'))
})

test('le contrat atteste porte son lien et son empreinte de corpus', () => {
  assert.match(f.attestations.contrat, /^0x[0-9a-fA-F]{40}$/)
  assert.match(f.attestations.hashscan, /^https:\/\/hashscan\.io\//)
  assert.match(f.attestations.corpus_digest, /^0x[0-9a-f]{64}$/)
})

/* ------------------------------ 6. l estimation ne circule jamais sans son hypothese */

test("le chiffre de The Graph ne s affiche pas sans l hypothese qui le borne", () => {
  assert.ok(f.graph.hypothese && f.graph.hypothese.length > 80)
  assert.ok(src.includes('g.hypothese'), "l hypothese doit etre rendue")
  assert.ok(src.includes('au_taux_maximum_usd'), 'la borne haute doit etre rendue aussi')
  // et l ordre est le bon : mediane < maximum
  assert.ok(f.graph.au_taux_median_usd < f.graph.au_taux_maximum_usd)
})

test('la couverture est un rapport, pas un pourcentage seul', () => {
  assert.equal(f.graph.retrouves, f.graph.pools_du_recensement)
  assert.equal(f.graph.part, 1.0)
  assert.ok(src.includes('g.retrouves') && src.includes('g.pools_du_recensement'))
})

/* --------------------------------------------------- 7. ce qui manquait vraiment */

test('la page porte enfin des liens de verification, et ils sortent du site', () => {
  const liens = [...src.matchAll(/<Lien href=\{([^}]+)\}/g)].map((m) => m[1])
  assert.ok(liens.length >= 5, `seulement ${liens.length} liens dans les panneaux`)
  // Les URL construites dans facts.json pointent bien vers des explorateurs publics.
  const urls = [
    ...f.x402.lignes.map((l) => l.hashscan),
    f.agent.hashscan,
    f.attestations.hashscan,
    ...f.garde.exemples.map((e) => e.basescan),
    f.depot,
  ]
  for (const u of urls) assert.match(u, /^https:\/\/(hashscan\.io|basescan\.org|github\.com)\//)
})

test('le depot pointe la ou le code est reellement pousse', () => {
  // L ancienne valeur — github.com/beorlor/tare — rendait 404 sur la landing.
  assert.equal(f.depot, 'https://github.com/JeanBaptisteDurand/ETH_Online_2026')
})

test('le nombre d outils MCP est compte dans le source, pas ecrit', () => {
  const serveur = readFileSync(resolve(ICI, '../../../mcp/src/server.ts'), 'utf8')
  const compte = [...serveur.matchAll(/registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1])
  assert.deepEqual(f.mcp.outils, compte)
  assert.ok(compte.length > 0)
})

test('une source absente ferait dire « non lu », pas un blanc', () => {
  // La regle est dans le composant : chaque bloc teste son fait avant de rendre.
  for (const garde of ['{!x ?', '{!a ?', '{!g ?']) {
    assert.ok(src.includes(garde), `le composant doit gerer l absence : ${garde}`)
  }
  assert.ok(src.includes('NonLu'), 'le primitif « non lu » doit etre utilise')
})

/* ------------------------ 8. le registre bouge, et le chiffre le dit */

test("le nombre de hooks absents du registre est publie AVEC le registre qu'il vise", () => {
  const r = f.registre
  // Le site comptait 83 contre l'instantane epingle pendant que docs/SUBMISSION.md en
  // annoncait 78 contre un tirage plus complet. Les deux sont vrais pour LEUR registre ;
  // publier le plus gros sans dire contre quoi il est calcule revient a le gonfler.
  assert.ok(r.epingle.adresses < r.plus_recent.adresses, 'le tirage recent est le plus complet')
  assert.ok(
    r.epingle.absents >= r.plus_recent.absents,
    'un registre plus complet ne peut pas rendre PLUS de hooks absents',
  )
  assert.equal(r.epingle.absents - r.plus_recent.absents, r.gagnes.length)
  for (const h of r.gagnes) assert.match(h, /^0x[0-9a-f]{40}$/)
})

test("l ecart est NOMME, pas resume : les hooks gagnes sont listes", () => {
  assert.ok(f.registre.gagnes.length > 0, 'sinon les deux chiffres coincideraient')
  // Et l ecran affiche les deux chiffres, pas seulement le plus flatteur.
  const app = readFileSync(resolve(ICI, '../App.tsx'), 'utf8')
  assert.ok(app.includes('FA.registre.plus_recent.absents'))
  assert.ok(app.includes('FA.registre.epingle.adresses'))
  assert.ok(app.includes('FA.registre.gagnes.length'))
})

test("le chiffre publie par docs/SUBMISSION.md est celui du registre le plus complet", () => {
  const sub = readFileSync(resolve(ICI, '../../../../docs/SUBMISSION.md'), 'utf8')
  const m = sub.match(/\*\*(\d+) appear nowhere in the official registry/)
  assert.ok(m, 'SUBMISSION.md doit publier ce nombre')
  assert.equal(Number(m[1]), f.registre.plus_recent.absents)
})
