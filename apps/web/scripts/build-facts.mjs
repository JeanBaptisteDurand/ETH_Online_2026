// LES FAITS QUE LE SITE NE MONTRAIT PAS.
//
// Le corpus de mesures avait son ecran. Le reste du projet — le peage x402 regle sur Hedera,
// le journal d'audit HCS, l'identite d'agent HCS-14, les attestations on-chain, la validation
// independante par The Graph, la garde a la signature — n'existait QUE dans le depot. Un
// visiteur du site n'en voyait pas un mot : sur les 57 904 caracteres rendus par la page,
// « x402 », « Hedera », « HCS », « attestation », « Ledger » et « MCP » apparaissaient
// exactement zero fois, et la page entiere ne portait qu'UN SEUL lien.
//
// Ce script assemble ces faits depuis les fichiers du depot, au build. Aucune valeur n'est
// recopiee a la main : si un fichier source manque, le fait correspondant vaut `null` et
// l'ecran le DIT, au lieu d'afficher une valeur figee qui aurait cesse d'etre vraie.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const repo = resolve(root, '../..')
const OUT = resolve(root, 'src/data/facts.json')

const p = (...x) => resolve(repo, ...x)
const lireJson = (chemin) => (existsSync(chemin) ? JSON.parse(readFileSync(chemin, 'utf8')) : null)
const lireJsonl = (chemin) =>
  existsSync(chemin)
    ? readFileSync(chemin, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
    : null

const manquants = []
const exige = (nom, valeur) => {
  if (valeur === null || valeur === undefined) manquants.push(nom)
  return valeur
}

/* ------------------------------------------------------- 1. le peage x402 */

const reglements = exige('docs/x402-settlements.jsonl', lireJsonl(p('docs/x402-settlements.jsonl')))

// Le prix unitaire est LU dans le source de l'API, jamais recopie : c'est lui qui fait foi,
// et un chiffre recopie ici cesserait d'etre vrai le jour ou il changerait la-bas.
const cfgApi = existsSync(p('apps/api/src/config.ts'))
  ? readFileSync(p('apps/api/src/config.ts'), 'utf8')
  : ''
const mPrix = cfgApi.match(/str\("TARE_UNIT_PRICE_USD",\s*"([\d.]+)"\)/)
const prixUnitaire = mPrix ? Number(mPrix[1]) : null
if (prixUnitaire === null) manquants.push('prix unitaire (apps/api/src/config.ts)')
// « Regle » veut dire relu sur le mirror node. Un paiement envoye n'est pas un paiement regle,
// et compter les deux ensemble serait la meme faute que compter un silence pour un zero.
const regles = (reglements ?? []).filter((r) => r?.mirror?.verified === true)

const x402 = reglements === null ? null : {
  regles: regles.length,
  vus: reglements.length,
  par_keyring: regles.filter((r) => r.source_de_la_cle === 'ledger-keyring').length,
  reseau: regles[0]?.reseau ?? null,
  facilitateur: regles[0]?.facilitateur ?? null,
  jeton: regles[0]?.token ?? null,
  payeur: regles[0]?.payeur ?? null,
  encaisseur: regles[0]?.encaisseur ?? null,
  // Le PRIX UNITAIRE, pas le montant d'une requete. Prendre le premier recu donnait 0,005 USDC
  // — le prix d'une requete a CINQ mesures — affiche comme « par mesure ». C'est exactement
  // le nombre faux que cet instrument existe pour empecher, place dans sa propre vitrine.
  // Le prix unitaire est la valeur par defaut de TARE_UNIT_PRICE_USD, lue dans le source de
  // l'API pour qu'elle ne puisse pas deriver d'ici.
  prix_unite_usd: prixUnitaire,
  // Et le rapport qui le rend visible : le plus petit montant regle sur le plus grand.
  montants: [...new Set(regles.map((r) => r.prix_annonce_402?.accepts?.[0]?.amount).filter(Boolean))].sort(),
  lignes: regles.map((r) => ({
    ts: r.ts,
    transaction: r.transaction,
    consensus: r.mirror?.consensus_timestamp ?? null,
    statut: r.mirror?.status ?? null,
    frais_tinybar: r.mirror?.charged_tx_fee ?? null,
    latence_ms: r.latence_ms ?? null,
    cle: r.source_de_la_cle ?? 'env',
    montant: r.prix_annonce_402?.accepts?.[0]?.amount ?? null,
    hashscan: r.transaction
      ? `https://hashscan.io/testnet/transaction/${r.transaction}`
      : null,
  })),
}

/* --------------------------------------------- 2. l'identite d'agent HCS-14 */

const idAgent = exige('docs/dataset/agent-identity.json', lireJson(p('docs/dataset/agent-identity.json')))
const agent = idAgent === null ? null : {
  uaid: idAgent.uaid,
  standard: idAgent.standard,
  spec: idAgent.spec,
  canonical: idAgent.canonical,
  canonical_json: idAgent.canonical_json,
  topic: idAgent.topic,
  hashscan: idAgent.hashscan,
  // Ces deux champs viennent d'une LECTURE du mirror node par `cli.ts export`, pas d'une
  // affirmation du code : si l'identite n'etait pas sur le topic, l'etat le dirait.
  etat: idAgent.etat,
  sequence: idAgent.annonce?.sequence_number ?? null,
  consensus: idAgent.annonce?.consensus_timestamp ?? null,
  lu_le: idAgent.lu_le,
  competences: {
    10: 'Transaction Analytics',
    17: 'API Integration',
    21: 'Tool Provider',
    33: 'Blockchain Integration',
    39: 'Trust Attestation',
  },
  // Ce qui a ete volontairement NON revendique. Le montrer vaut mieux que le taire :
  // c'est la seule facon de rendre credible ce qui EST revendique.
  ecartees: [
    { code: 11, nom: 'Smart Contract Audit', pourquoi: "on lit du source verifie, on n'audite pas" },
    { code: 34, nom: 'Consensus Participation', pourquoi: 'on ECRIT sur HCS, on ne participe pas au consensus' },
    { code: 7, nom: 'Knowledge Retrieval', pourquoi: "l'assistant cherche, mais il ne produit aucun nombre" },
  ],
}

/* ------------------------------------------- 3. les attestations on-chain */

const att = exige('docs/dataset/attestations.json', lireJson(p('docs/dataset/attestations.json')))
const attestations = att === null ? null : {
  contrat: att.contract,
  hashscan: att.contract ? `https://hashscan.io/testnet/contract/${att.contract}` : null,
  rpc: att.rpc,
  // TROIS NOMBRES, ET ILS NE DISENT PAS LA MEME CHOSE.
  //
  // `ecrits` valait `n_a_ecrire` : le site affichait donc « 99 hooks attestes » en gros,
  // alors que 99 est le nombre de hooks CALCULES. Le nombre reellement ecrit on-chain est
  // `n_envoyes` — 16, chacun avec son hash de transaction. Annoncer 99 la ou 16 sont
  // ecrits est exactement ce que ce projet reproche au reste : un chiffre flatteur mis a
  // la place du chiffre vrai.
  calcules: att.n_a_ecrire ?? (att.a_ecrire?.length ?? null),
  ecrits: att.n_envoyes ?? (att.envoyes ?? []).filter((x) => x.ok).length,
  tentes: (att.envoyes ?? []).length || null,
  // Un hook ECARTE n'est pas un hook a zero : il n'a simplement aucune mesure a attester.
  ecartes: att.n_ecartes ?? (att.ecartes_faute_de_mesure?.length ?? null),
  corpus: att.corpus ?? null,
  corpus_digest: att.corpusDigest ?? null,
  pire: (att.a_ecrire ?? [])
    .slice()
    .sort((a, b) => (b.max_bps ?? 0) - (a.max_bps ?? 0))
    .slice(0, 3)
    .map((h) => ({ hook: h.hook, max_bps: h.max_bps, median_bps: h.median_bps, pools: h.nPools })),
}

/* ------------------------------- 4. la validation independante par The Graph */

const vol = exige('docs/dataset/volume-base.json', lireJson(p('docs/dataset/volume-base.json')))
const graph = vol === null ? null : {
  subgraph: vol.source?.subgraph ?? null,
  nom: vol.source?.nom ?? null,
  passerelle: vol.source?.passerelle ?? null,
  pools_du_recensement: vol.couverture?.pools_du_recensement ?? null,
  retrouves: vol.couverture?.retrouves ?? null,
  part: vol.couverture?.part ?? null,
  volume_usd: vol.totaux?.volume_usd ?? null,
  tvl_usd: vol.totaux?.tvl_usd ?? null,
  transactions: vol.totaux?.transactions ?? null,
  // L'hypothese part AVEC le chiffre. Separee, elle serait perdue au premier copier-coller.
  hypothese: vol.estimation?.hypothese ?? null,
  au_taux_median_usd: vol.estimation?.au_taux_median_usd ?? null,
  au_taux_maximum_usd: vol.estimation?.au_taux_maximum_usd ?? null,
  volume_couvert_usd: vol.estimation?.volume_couvert_usd ?? null,
  top_hooks: Object.entries(vol.par_hook ?? {})
    .map(([hook, v]) => ({ hook, ...v }))
    .sort((a, b) => (b.estime_usd ?? 0) - (a.estime_usd ?? 0))
    .slice(0, 5),
}

/* ------------- 4 bis. le registre bouge : deux instantanes, deux chiffres */

// Le site comptait « 83 hooks absents du registre » contre l'instantane EPINGLE (668 adresses,
// commit ccab541, 04/09), pendant que docs/SUBMISSION.md en annoncait 78 contre un tirage plus
// complet du 05/09 (866 adresses). Les deux sont vrais pour LEUR registre, et publier le plus
// gros sans dire contre quoi il est calcule reviendrait a le gonfler.
//
// Alors on publie les deux, avec l'ecart NOMME. Un registre qui gagne 198 adresses en un jour
// n'est pas un fond stable : c'est un fait sur le registre, et il vaut mieux que le chiffre seul.
const snapshot = lireJson(p('apps/web/public/data/hooklist.snapshot.json'))
const live = lireJson(p('docs/hooklist-live-20260905.json'))
const jeu = lireJson(resolve(root, 'src/data/dataset.json'))

let registre = null
if (snapshot && live && jeu) {
  const mesures = jeu.hooks.map((h) => h.address.toLowerCase())
  const aSnap = new Set((snapshot.entries ?? []).map((e) => (e.address ?? '').toLowerCase()))
  const aLive = new Set(live.map((e) => (e.hook?.address ?? '').toLowerCase()))
  const absSnap = mesures.filter((h) => !aSnap.has(h))
  const absLive = mesures.filter((h) => !aLive.has(h))
  registre = {
    mesures: mesures.length,
    epingle: {
      fichier: 'apps/web/public/data/hooklist.snapshot.json',
      commit: snapshot.commit ?? null,
      le: snapshot.fetched_at ?? null,
      adresses: aSnap.size,
      fiches: snapshot.entries_kept ?? (snapshot.entries?.length ?? null),
      absents: absSnap.length,
    },
    plus_recent: {
      fichier: 'docs/hooklist-live-20260905.json',
      le: '2026-09-05',
      adresses: aLive.size,
      fiches: live.length,
      absents: absLive.length,
    },
    // Les hooks que le registre a GAGNES entre les deux tirages. Les nommer est le seul moyen
    // de rendre l'ecart verifiable au lieu d'en faire une excuse.
    gagnes: absSnap.filter((h) => !absLive.includes(h)),
  }
} else {
  manquants.push('reconciliation du registre')
}

/* --------------------------------- 5. la garde a la signature, et le MCP */

const calldata = lireJson(p('packages/guard/test/fixtures/real-calldata.json'))
const garde = calldata === null ? null : {
  transactions_reelles: calldata.txs?.length ?? null,
  capture_le: calldata.captured_at ?? null,
  universal_router: calldata.universal_router ?? null,
  chain_id: calldata.txs?.[0]?.chain_id ?? null,
  exemples: (calldata.txs ?? []).slice(0, 3).map((t) => ({
    hash: t.tx_hash,
    bloc: t.block_number,
    basescan: `https://basescan.org/tx/${t.tx_hash}`,
  })),
}

// Le nombre d'outils MCP est COMPTE dans le source, pas ecrit : c'est le genre de chiffre
// qui devient faux le jour ou on en ajoute un cinquieme.
const serveurMcp = existsSync(p('apps/mcp/src/server.ts'))
  ? readFileSync(p('apps/mcp/src/server.ts'), 'utf8')
  : null
const mcp = serveurMcp === null ? null : {
  outils: [...serveurMcp.matchAll(/registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]),
}

/* -------------------------- 5 bis. les pools a sens unique */

// Le panneau 00 montre deux pools ou l'on entre pour rien et d'ou l'on ne ressort pas. Ce
// sont des exemples ; le RECENSEMENT n'etait nulle part. Six pools sur 2 298 mesures dans
// les deux sens : c'est peu, et le dire ainsi vaut mieux que de laisser croire a une regle.
const ow = lireJson(p('docs/dataset/one-way.json'))
const sensUnique = ow === null ? null : {
  pools_deux_sens: ow.portee?.pools_mesures_dans_les_deux_sens ?? null,
  pools: ow.portee?.pools_retenus ?? null,
  hooks: ow.portee?.hooks_retenus ?? null,
  seuil_lourd_bps: ow.seuils?.heavy_bps ?? null,
  seuil_plat_bps: ow.seuils?.flat_bps ?? null,
  // Le seuil est un choix de PUBLICATION, pas une frontiere naturelle. Le publier avec la
  // liste est la seule facon de laisser quelqu'un le deplacer et refaire le compte.
  note_seuil: ow.seuils?.note ?? null,
  exemples: (ow.pools ?? []).slice(0, 3).map((x) => ({
    pool_id: x.pool_id,
    hook: x.hook,
    sens_lourd: x.sens_lourd,
    lourd_bps: x.bps_median_lourd,
    leger_bps: x.bps_median_leger,
  })),
}
if (sensUnique === null) manquants.push('pools a sens unique (docs/dataset/one-way.json)')

/* ------------------- 6. la porte A4 : cote contre REELLEMENT execute */

// Tout ce que TARE publie vient de `V4Quoter`, appele en eth_call : une SIMULATION. La porte
// A4 execute vraiment le swap sur le fork (unlock, swap, settle, take) et lit le solde du
// contrat sonde — ce qu'un utilisateur RECOIT, pas ce qu'une comptabilite annonce.
//
// Ses chiffres ne vivent que dans la docstring de engine/tare/gates/a4.py : la porte demande
// un fork en marche, et rien n'ecrit de fichier de resultat. On lit donc la docstring, qui est
// le releve engage dans le depot. Si la lecture echoue, le fait vaut null et l'ecran dit
// « non lu » — on ne recopie pas les nombres a la main, ils cesseraient d'etre vrais en silence.
const a4src = existsSync(p('engine/tare/gates/a4.py'))
  ? readFileSync(p('engine/tare/gates/a4.py'), 'utf8')
  : ''
const mHook = a4src.match(/avec le hook\s+execute (\d+)\s+cote (\d+)/)
const mStub = a4src.match(/avec le talon\s+execute (\d+)\s+cote (\d+)/)
const mBps = a4src.match(/bps executes\s+([\d.]+)\s+publie\s+([\d.]+)/)
const execution =
  mHook && mStub && mBps
    ? {
        avec_hook: { execute: mHook[1], cote: mHook[2], egal: mHook[1] === mHook[2] },
        avec_talon: { execute: mStub[1], cote: mStub[2], egal: mStub[1] === mStub[2] },
        bps_executes: Number(mBps[1]),
        bps_publies: Number(mBps[2]),
        source: 'engine/tare/gates/a4.py',
      }
    : null
if (!execution) manquants.push('porte A4 (engine/tare/gates/a4.py)')

/* ----------------- 6 bis. la chaine complete : six etapes sous une seule horloge.
   Le compte d'etapes vivait deja dans `inventaire.chaine`, mais l'horloge — la duree totale
   et le temps de chaque etape — n'etait exposee nulle part. Le front l'annonce : elle doit
   venir d'ici, pas d'un nombre tape dans un composant. */

const ch = lireJson(p('docs/dataset/chaine-complete.json'))
const chaine = ch === null ? null : {
  n_ok: ch.n_ok ?? null,
  n_total: ch.n_total ?? null,
  // `complete: false` des qu'une etape n'a pas tourne — on le dit, on ne l'arrondit pas.
  complete: ch.complete === true,
  duree_ms: ch.duree_ms ?? null,
  debut: ch.debut ?? null,
  etapes: Array.isArray(ch.etapes)
    ? ch.etapes.map((e) => ({
        n: e.n ?? null,
        quoi: e.quoi ?? null,
        etat: e.etat ?? null,
        a_ms: e.a_ms ?? null,
      }))
    : [],
}
if (!chaine) manquants.push('docs/dataset/chaine-complete.json')

/* ----------------- 7. la signature Ledger : le rapport rendu ecran par ecran */

const led = lireJson(p('docs/ledger/guard-speculos.json'))
const ledger = led === null ? null : {
  appareil: led.appareil ?? null,
  // `physique: false` est dit, pas cache : c'est Speculos, pas un Nano branche.
  physique: led.physique === true,
  ts: led.ts ?? null,
  verdict: led.rapport?.verdict ?? null,
  titre: led.rapport?.headline ?? null,
  ecrans: Array.isArray(led.ecrans) ? led.ecrans.length : null,
  type_712: led.eip712?.primaryType ?? null,
  champs_712: led.eip712?.champs ?? null,
  signature_v: led.signature?.v ?? null,
  tx: led.transaction?.hash ?? null,
  bloc: led.transaction?.block ?? null,
  basescan: led.transaction?.hash ? `https://basescan.org/tx/${led.transaction.hash}` : null,
}
if (ledger === null) manquants.push('preuve Ledger (docs/ledger/guard-speculos.json)')

/* ------------------------------------------------------------- l'ecriture */


/* ------------------------------------- l'inventaire : chaque jeu de donnees, mesure */

// POURQUOI CE BLOC EXISTE.
//
// Les pages outil disent « il ingere » et « il rend ». Sans volume derive, « il ingere le
// corpus » est une phrase ; avec, c'est un fait qu'on peut contredire. Chaque entree est
// STATEE sur le fichier reel au build : personne ne recopie 125 072 a la main, et un fichier
// absent passe a null — l'ecran affiche « non lu », jamais zero.
//
// La liste fait aussi office de RECENSEMENT : `outils.test.ts` verifie qu'aucun fichier suivi
// de docs/dataset/ ni de packages/guard/data/ n'est absent d'ici. Une donnee qu'aucun outil ne
// reclame est une donnee qu'on a oublie de montrer.

const octets = (chemin) => (existsSync(chemin) ? statSync(chemin).size : null)
const lignes = (chemin) =>
  existsSync(chemin)
    ? readFileSync(chemin, 'utf8').split('\n').filter((l) => l.trim()).length
    : null

/** cle -> [chemin depuis la racine du depot, comment se compte son unite] */
const JEUX = {
  corpus: ['docs/dataset/measurements.jsonl', (c) => [lignes(c), 'mesures']],
  corpus_resume: ['docs/dataset/summary.json', (c) => [lireJson(c)?.n_measurements ?? null, 'mesures resumees']],
  corpus_encode: ['apps/web/src/data/dataset.json', () => [null, null]],
  contestes_mesures: ['docs/dataset/measurements-contestes.jsonl', (c) => [lignes(c), 'mesures']],
  contestes_resume: ['docs/dataset/summary-contestes.json', (c) => [lireJson(c)?.n_measurements ?? null, 'mesures resumees']],
  contestes_pools: ['docs/dataset/pools-contestes.json', (c) => [lireJson(c)?.length ?? null, 'pools']],
  recensement: ['docs/dataset/init-logs-200k.json', () => {
    const m = lireJson(p('docs/dataset/init-logs-200k.json.manifest.json'))
    return [m?.n_events ?? null, 'evenements Initialize']
  }],
  recensement_manifeste: ['docs/dataset/init-logs-200k.json.manifest.json', (c) => [lireJson(c)?.n_hooks ?? null, 'hooks distincts']],
  pools_liquides: ['docs/dataset/pools-liquides-full.json', (c) => [lireJson(c)?.length ?? null, 'pools']],
  pools_liquides_scan: ['docs/dataset/pools-liquides-full.json.scan.json', (c) => [lireJson(c)?.n_liquid ?? null, 'pools liquides']],
  declarations: ['docs/dataset/declarations.json', (c) => [lireJson(c)?.conclusion?.n_hooks_qui_declarent ?? null, 'hooks qui declarent']],
  sens_unique: ['docs/dataset/one-way.json', (c) => [lireJson(c)?.pools?.length ?? null, 'pools a sens unique']],
  porte_a4: ['docs/dataset/porte-a4.json', (c) => [lireJson(c)?.n ?? null, 'swaps executes']],
  porte_a4_journal: ['docs/dataset/porte-a4.jsonl', (c) => [lignes(c), 'sondes']],
  registre_couverture: ['docs/dataset/registre-couverture.json', (c) => [lireJson(c)?.couverture?.absents ?? null, 'hooks absents du registre']],
  attestations: ['docs/dataset/attestations.json', (c) => [lireJson(c)?.n_envoyes ?? null, 'attestations ecrites']],
  identite: ['docs/dataset/agent-identity.json', (c) => [lireJson(c)?.competences?.length ?? null, 'competences declarees']],
  chaine: ['docs/dataset/chaine-complete.json', (c) => [lireJson(c)?.n_ok ?? null, 'etapes vertes']],
  volume: ['docs/dataset/volume-base.json', (c) => [lireJson(c)?.couverture?.pools_du_recensement ?? null, 'pools confrontes']],
  table_garde: ['packages/guard/data/table.json', (c) => [lireJson(c)?.n_measurements ?? null, 'mesures embarquees']],
  chiffres_alternative: ['packages/guard/data/chiffres-alternative.json', (c) => [lireJson(c)?.mesures_lues ?? null, 'mesures confrontees']],
  reglements: ['docs/x402-settlements.jsonl', (c) => [lignes(c), 'reglements']],
  registre_epingle: ['apps/web/public/data/hooklist.snapshot.json', () => [null, null]],
  registre_vivant: ['docs/hooklist-live-20260905.json', () => [null, null]],
  concordance: ['docs/hooks-source/analysis.json', (c) => {
    const d = lireJson(c)
    return [d?.hooks?.length ?? null, 'hooks confrontes a leur code source']
  }],
  graphe_cache: ['engine/tare/graph/data/chain-cache.json', () => [null, null]],
  ledger: ['docs/ledger/guard-speculos.json', (c) => [lireJson(c)?.ecrans?.length ?? null, 'ecrans rendus']],
}

const inventaire = {}
for (const [cle, [rel, compte]] of Object.entries(JEUX)) {
  const chemin = p(rel)
  const o = octets(chemin)
  if (o === null) manquants.push(rel)
  const [n, unite] = o === null ? [null, null] : compte(chemin)
  inventaire[cle] = { fichier: rel, octets: o, n, unite }
}

const facts = {
  v: 'tare.facts.v1',
  bati_le: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  sources: {
    x402: 'docs/x402-settlements.jsonl',
    agent: 'docs/dataset/agent-identity.json',
    attestations: 'docs/dataset/attestations.json',
    graph: 'docs/dataset/volume-base.json',
    garde: 'packages/guard/test/fixtures/real-calldata.json',
    mcp: 'apps/mcp/src/server.ts',
    execution: 'engine/tare/gates/a4.py',
    sens_unique: 'docs/dataset/one-way.json',
    ledger: 'docs/ledger/guard-speculos.json',
    registre: 'apps/web/public/data/hooklist.snapshot.json + docs/hooklist-live-20260905.json',
  },
  // Un fichier source absent ne fait pas disparaitre la ligne : il la fait passer a null,
  // et l'ecran affiche « non lu » au lieu d'un blanc qu'on prendrait pour un zero.
  manquants,
  depot: 'https://github.com/JeanBaptisteDurand/ETH_Online_2026',
  x402,
  registre,
  agent,
  attestations,
  graph,
  garde,
  sens_unique: sensUnique,
  execution,
  chaine,
  ledger,
  mcp,
  // chaque jeu de donnees du depot, state au build — voir apps/web/src/lib/donnees.ts
  inventaire,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(facts, null, 1) + '\n')
console.log(
  `facts.json — ${x402?.regles ?? '?'} reglements regles / identite ${agent?.etat ?? '?'} #${agent?.sequence ?? '?'} / ` +
    `${attestations?.ecrits ?? '?'} attestations / The Graph ${graph?.retrouves ?? '?'}/${graph?.pools_du_recensement ?? '?'} / ` +
    `${garde?.transactions_reelles ?? '?'} tx decodees / ${mcp?.outils.length ?? '?'} outils MCP / ` +
    `registre ${registre?.epingle.absents ?? '?'} vs ${registre?.plus_recent.absents ?? '?'} absents` +
    (manquants.length ? ` — MANQUANTS : ${manquants.join(', ')}` : ''),
)
