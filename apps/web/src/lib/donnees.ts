/**
 * LES VINGT-SEPT JEUX DE DONNÉES DU DÉPÔT, ET QUI LES LIT.
 *
 * `outils.ts` dit ce que fait chaque outil. Ce fichier-ci dit **d'où vient sa matière** et
 * **où elle repart** — parce que la question qui restait sans réponse écrite était : est-ce
 * qu'une donnée du dépôt n'est montrée nulle part ?
 *
 * Chaque entrée porte :
 *   - le FICHIER, par son chemin réel depuis la racine du dépôt ;
 *   - ce qu'il CONTIENT, en une phrase — jamais « des données » ;
 *   - COMMENT il a été produit : la commande ou la source, pour qu'on puisse le refaire ;
 *   - qui le LIT, et qui l'ÉCRIT, par numéro d'outil.
 *
 * LE VOLUME N'EST PAS ICI. Il est *statté au build* par `scripts/build-facts.mjs` et vit dans
 * `facts.inventaire[cle]` : `{ fichier, octets, n, unite }`. Recopier « 125 072 » dans ce
 * fichier-ci aurait été un nombre de plus à laisser pourrir. Si un fichier disparaît, son
 * entrée passe à `null` et l'écran dit « non lu » — il n'affiche pas zéro.
 *
 * DEUX INVARIANTS, tenus par `outils.test.ts` :
 *   1. tout fichier suivi par git sous `docs/dataset/` ou `packages/guard/data/` a une entrée ici ;
 *   2. toute entrée d'ici est lue ou écrite par au moins un outil.
 * Le premier empêche d'oublier une donnée ; le second empêche d'en inventer une que rien
 * n'utilise.
 */

export interface Jeu {
  /** la clé, commune à `facts.inventaire` */
  cle: string
  /** son nom en français, tel qu'il s'affiche */
  nom: string
  /** ce qu'il contient, en une phrase d'utilisateur */
  quoi: string
  /** la commande ou la source qui l'a produit */
  produit: string
  /** les outils qui le lisent */
  lu_par: number[]
  /** les outils qui l'écrivent */
  ecrit_par: number[]
}

export const DONNEES: Jeu[] = [
  {
    cle: 'corpus',
    nom: 'the measurement corpus',
    quoi:
      'one row per counterfactual swap: the pool, the hook, the size, the direction, both ' +
      'quotes, the gap in basis points, and the label that says whether it is measured, ' +
      'interpolated or not measurable',
    produit: 'python3 -m tare.sweep (engine/tare/measure.py), on a pinned anvil fork',
    lu_par: [2, 3, 5, 6, 7, 14],
    ecrit_par: [1],
  },
  {
    cle: 'corpus_resume',
    nom: 'the corpus summary',
    quoi:
      'the thresholds, the sizes, the directions, the stub hash, the block, and the count per ' +
      'label — enough to check that a published number really comes from that corpus',
    produit: 'python3 -m tare.cli summary',
    lu_par: [2, 4],
    ecrit_par: [1],
  },
  {
    cle: 'corpus_encode',
    nom: 'the column-encoded corpus',
    quoi:
      'the same corpus, column by column, so it fits inside a web page: this is the one the ' +
      'site loads, and it is why the site answers without a single network request',
    produit: 'node apps/web/scripts/build-dataset.mjs',
    lu_par: [2, 3, 5, 6],
    ecrit_par: [],
  },
  {
    cle: 'table_garde',
    nom: 'the guard table',
    quoi:
      'the corpus flattened so it can be queried by pool key, shipped as it is inside the ' +
      'extension and inside the MCP server — this is what lets them answer offline',
    produit: 'node packages/guard/scripts/build-table.mjs',
    lu_par: [2, 6, 7, 8],
    ecrit_par: [],
  },
  {
    cle: 'chiffres_alternative',
    nom: 'the replacement door numbers',
    quoi:
      'the real weight of every state of the alternative search, including the share of cases ' +
      'where the answer is “there is only one door” — the number we refused to write by hand',
    produit: 'node packages/guard/scripts/chiffres-alternative.mjs',
    lu_par: [6, 7],
    ecrit_par: [],
  },
  {
    cle: 'sens_unique',
    nom: 'the one-way pools',
    quoi:
      'the pools that let you in for free and do not let you back out: zero basis points on ' +
      'the way in, up to 9 999 on the way back — the case only a round trip reveals',
    produit: 'python3 -m tare.oneway, from the corpus',
    lu_par: [3, 6],
    ecrit_par: [1],
  },
  {
    cle: 'porte_a4',
    nom: 'gate A4 — the swap actually executed',
    quoi:
      'swaps really sent on a fork, put against what the quote announced: the only proof that ' +
      'the counterfactual does not lie, divergence included',
    produit: 'python3 -m tare.gates.a4 --write',
    lu_par: [1, 5],
    ecrit_par: [1],
  },
  {
    cle: 'porte_a4_journal',
    nom: 'the gate A4 log',
    quoi: 'the raw trace of every probe, together with its replay command',
    produit: 'python3 -m tare.gates.a4 --write',
    lu_par: [1],
    ecrit_par: [1],
  },
  {
    cle: 'contestes_mesures',
    nom: 'the disputed measurements',
    quoi:
      'the pools where our measurement and the external source disagree, measured again one ' +
      'by one instead of being set aside',
    produit: 'python3 -m tare.sweep on the list of divergences',
    lu_par: [2, 4],
    ecrit_par: [1],
  },
  {
    cle: 'contestes_resume',
    nom: 'the summary of the disputed ones',
    quoi: 'the same summary as for the corpus, restricted to the disputed pools',
    produit: 'python3 -m tare.cli summary',
    lu_par: [4],
    ecrit_par: [1],
  },
  {
    cle: 'contestes_pools',
    nom: 'the list of disputed pools',
    quoi: 'the pools kept for re-measurement, and why each one of them was kept',
    produit: 'engine/tare/source/, put against the corpus',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'recensement',
    nom: 'the pool census',
    quoi:
      'every Initialize event of the PoolManager over 200 000 blocks of Base: this is the ' +
      'starting universe, the one everything else is a subset of',
    produit: 'python3 -m tare.collect 50614000 200000 docs/dataset/init-logs-200k.json, in slices, with its failures declared',
    lu_par: [4, 5],
    ecrit_par: [],
  },
  {
    cle: 'recensement_manifeste',
    nom: 'the census manifest',
    quoi:
      'the coverage of the sweep: the slices requested, the ones that failed, and the number ' +
      'of distinct hooks found — without which “1 559 hooks” would not be verifiable',
    produit: 'python3 -m tare.collect — the manifest is written along with the file',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'pools_liquides',
    nom: 'the liquid pools',
    quoi:
      'the pools of the census that really hold liquidity, with their complete PoolKey — ' +
      'measuring an empty pool would return a clean number that is false',
    produit: 'python3 -m tare.rescan',
    lu_par: [1, 5],
    ecrit_par: [],
  },
  {
    cle: 'pools_liquides_scan',
    nom: 'the liquidity scan',
    quoi:
      'the tally of the sorting: how many readable, how many liquid, how many at zero, how ' +
      'many unknown and for which reason',
    produit: 'python3 -m tare.rescan',
    lu_par: [5],
    ecrit_par: [],
  },
  {
    cle: 'declarations',
    nom: 'the declarations of the hooks',
    quoi:
      'the sweep of the events the hooks emit themselves: out of 1 559 hooks, 9 announce ' +
      'what they take. This is the measure of what self-declaration is worth',
    produit: 'python3 -m tare.declare --scan --write',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'registre_couverture',
    nom: 'the registry coverage',
    quoi:
      'what the official hook registry holds, put against the hooks we have actually seen ' +
      'running: the share of missing ones is the number of the day',
    produit: 'python3 -m tare.registre',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'registre_epingle',
    nom: 'the pinned registry',
    quoi:
      'the dated copy of the official registry, frozen in the repository so the published ' +
      'number stays verifiable even if the list moves tomorrow',
    produit: 'node apps/web/scripts/fetch-registry.mjs',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'registre_vivant',
    nom: 'the registry of the day',
    quoi: 'the same list read again later: the gap with the pinned copy is visible',
    produit: 'node apps/web/scripts/fetch-registry.mjs',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'volume',
    nom: 'volume put against an independent source',
    quoi:
      'the volume and the TVL of the census pools, read from The Graph: a source we do not ' +
      'control, used to contradict ourselves and not to confirm ourselves',
    produit: 'python3 -m tare.volume',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'reglements',
    nom: 'the x402 settlements',
    quoi:
      'every measurement payment: the amount, the hash, and the read-back on the Hedera ' +
      'mirror node — a settlement is only counted if the mirror node returns it',
    produit: 'apps/api/src/x402.ts, on every paid measurement',
    lu_par: [13],
    ecrit_par: [10],
  },
  {
    cle: 'identite',
    nom: 'the identity of the agent',
    quoi:
      'the HCS-14 UAID, the six canonical fields it is the hash of, and the message published ' +
      'on the Hedera topic — the caller can recompute the identity before paying',
    produit: 'npx tsx apps/api/src/agent/cli.ts export, published on the HCS topic',
    lu_par: [10, 13],
    ecrit_par: [13],
  },
  {
    cle: 'attestations',
    nom: 'the on-chain attestations',
    quoi:
      'the median and maximum take per hook, computed over the corpus, and the real state of ' +
      'their writing: computed, set aside for lack of measurements, or actually written',
    produit: 'python3 -m tare.attest, from the corpus',
    lu_par: [2],
    ecrit_par: [14],
  },
  {
    cle: 'chaine',
    nom: 'the complete chain',
    quoi:
      'the six steps end to end — real transaction, verdict, door search, paid measurement, ' +
      'HCS anchoring, signature on the device — with their duration and their state',
    produit: 'apps/api/src/chaine/run.ts',
    lu_par: [8, 13],
    ecrit_par: [],
  },
  {
    cle: 'concordance',
    nom: 'the source ↔ measurement agreement',
    quoi:
      'the 112 hooks put against their own source code, when it is public: where the code ' +
      'announces a rate, the measurement confirms it — and the 94 cases where it does not are ' +
      'published, up to 9 979 bps of gap',
    produit: 'python3 -m tare.source.cli analyze',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'graphe_cache',
    nom: 'the bytecode graph cache',
    quoi:
      'what the graph rebuild keeps from the chain: the complete graph weighs 198 MB and is ' +
      'not shipped, it is rebuilt — this cache is what makes redoing it possible without ' +
      'reading everything again',
    produit: 'python3 -m tare.graph.cli build',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'ledger',
    nom: 'the screens of the device',
    quoi:
      'the EIP-712 encoded report as it is displayed, screen by screen, on the Ledger — you ' +
      'do not sign an opaque hash, you read what you sign',
    produit: 'packages/keyring, against a Speculos',
    lu_par: [9],
    ecrit_par: [9],
  },
]

export const jeu = (cle: string): Jeu | undefined => DONNEES.find((j) => j.cle === cle)

/** Les jeux qu'un outil lit. */
export const luPar = (n: number): Jeu[] => DONNEES.filter((j) => j.lu_par.includes(n))

/** Les jeux qu'un outil écrit. */
export const ecritPar = (n: number): Jeu[] => DONNEES.filter((j) => j.ecrit_par.includes(n))

/** Le volume d'un jeu, tel qu'il a été statté au build — `null` si le fichier manquait. */
export interface Volume {
  fichier: string
  octets: number | null
  n: number | null
  unite: string | null
}

/** « 90,4 Mo », « 8,3 Mo », « 957 o » — jamais un nombre brut d'octets dans la page. */
export const taille = (octets: number | null): string => {
  if (octets === null) return 'not read'
  if (octets >= 1_000_000) return `${(octets / 1_000_000).toFixed(1)} MB`
  if (octets >= 1_000) return `${Math.round(octets / 1_000)} kB`
  return `${octets} B`
}
