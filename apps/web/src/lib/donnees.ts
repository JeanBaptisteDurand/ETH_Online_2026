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
    nom: 'le corpus de mesures',
    quoi:
      "une ligne par swap contrefactuel : le pool, le hook, la taille, le sens, les deux " +
      "cotations, l'écart en points de base, et l'étiquette qui dit si c'est mesuré, interpolé " +
      "ou non mesurable",
    produit: 'python3 -m tare.sweep (engine/tare/measure.py), sur un fork anvil épinglé',
    lu_par: [2, 3, 5, 6, 7, 14],
    ecrit_par: [1],
  },
  {
    cle: 'corpus_resume',
    nom: 'le résumé du corpus',
    quoi:
      "les seuils, les tailles, les sens, le hash du talon, le bloc, et le décompte par " +
      "étiquette — de quoi vérifier qu'un chiffre publié vient bien de ce corpus-là",
    produit: 'python3 -m tare.cli summary',
    lu_par: [2, 4],
    ecrit_par: [1],
  },
  {
    cle: 'corpus_encode',
    nom: 'le corpus encodé par colonnes',
    quoi:
      "le même corpus, colonne par colonne, pour tenir dans une page web : c'est LUI que le " +
      "site charge, et c'est pour ça que le site répond sans une seule requête réseau",
    produit: 'node apps/web/scripts/build-dataset.mjs',
    lu_par: [2, 3, 5, 6],
    ecrit_par: [],
  },
  {
    cle: 'table_garde',
    nom: 'la table de la garde',
    quoi:
      "le corpus remis à plat pour être interrogé par clé de pool, embarqué tel quel dans " +
      "l'extension et dans le serveur MCP — c'est ce qui leur permet de répondre hors ligne",
    produit: 'node packages/guard/scripts/build-table.mjs',
    lu_par: [2, 6, 7, 8],
    ecrit_par: [],
  },
  {
    cle: 'chiffres_alternative',
    nom: 'les chiffres de la porte de remplacement',
    quoi:
      "le poids réel de chaque état de la recherche d'alternative, dont la part de cas où la " +
      "réponse est « il n'y a qu'une porte » — le chiffre qu'on ne voulait pas écrire à la main",
    produit: 'node packages/guard/scripts/chiffres-alternative.mjs',
    lu_par: [6, 7],
    ecrit_par: [],
  },
  {
    cle: 'sens_unique',
    nom: 'les pools à sens unique',
    quoi:
      "les pools qui laissent entrer gratuitement et ne laissent pas ressortir : zéro point de " +
      "base à l'aller, jusqu'à 9 999 au retour — le cas que seul un aller-retour révèle",
    produit: 'python3 -m tare.oneway, à partir du corpus',
    lu_par: [3, 6],
    ecrit_par: [1],
  },
  {
    cle: 'porte_a4',
    nom: 'la porte A4 — le swap réellement exécuté',
    quoi:
      "des swaps vraiment passés sur un fork, confrontés à ce que la cotation annonçait : la " +
      "seule preuve que le contrefactuel ne ment pas, divergence comprise",
    produit: 'python3 -m tare.gates.a4 --write',
    lu_par: [1, 5],
    ecrit_par: [1],
  },
  {
    cle: 'porte_a4_journal',
    nom: 'le journal de la porte A4',
    quoi: "la trace brute de chaque sonde, avec sa commande de rejeu",
    produit: 'python3 -m tare.gates.a4 --write',
    lu_par: [1],
    ecrit_par: [1],
  },
  {
    cle: 'contestes_mesures',
    nom: 'les mesures contestées',
    quoi:
      "les pools où notre mesure et la source externe ne disent pas la même chose, remesurés " +
      "un par un au lieu d'être écartés",
    produit: 'python3 -m tare.sweep sur la liste des divergences',
    lu_par: [2, 4],
    ecrit_par: [1],
  },
  {
    cle: 'contestes_resume',
    nom: 'le résumé des contestées',
    quoi: "le même résumé que pour le corpus, restreint aux pools contestés",
    produit: 'python3 -m tare.cli summary',
    lu_par: [4],
    ecrit_par: [1],
  },
  {
    cle: 'contestes_pools',
    nom: 'la liste des pools contestés',
    quoi: "les pools retenus pour la remesure, et pourquoi chacun l'a été",
    produit: 'engine/tare/source/, confronté au corpus',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'recensement',
    nom: 'le recensement des pools',
    quoi:
      "tous les événements Initialize du PoolManager sur 200 000 blocs de Base : c'est " +
      "l'univers de départ, celui dont tout le reste est un sous-ensemble",
    produit: 'python3 -m tare.collect 50614000 200000 docs/dataset/init-logs-200k.json, par tranches, avec ses échecs déclarés',
    lu_par: [4, 5],
    ecrit_par: [],
  },
  {
    cle: 'recensement_manifeste',
    nom: 'le manifeste du recensement',
    quoi:
      "la couverture du balayage : les tranches demandées, celles qui ont échoué, et le " +
      "nombre de hooks distincts trouvés — sans quoi « 1 559 hooks » ne serait pas vérifiable",
    produit: 'python3 -m tare.collect — le manifeste est écrit avec le fichier',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'pools_liquides',
    nom: 'les pools liquides',
    quoi:
      "les pools du recensement qui ont vraiment de la liquidité, avec leur PoolKey complète — " +
      "mesurer un pool vide rendrait un chiffre propre et faux",
    produit: 'python3 -m tare.rescan',
    lu_par: [1, 5],
    ecrit_par: [],
  },
  {
    cle: 'pools_liquides_scan',
    nom: 'le scan de liquidité',
    quoi:
      "le décompte du tri : combien lisibles, combien liquides, combien à zéro, combien " +
      "inconnus et pour quelle cause",
    produit: 'python3 -m tare.rescan',
    lu_par: [5],
    ecrit_par: [],
  },
  {
    cle: 'declarations',
    nom: 'les déclarations des hooks',
    quoi:
      "le balayage des événements que les hooks émettent eux-mêmes : sur 1 559 hooks, 9 " +
      "annoncent ce qu'ils prennent. C'est la mesure de ce que l'auto-déclaration vaut",
    produit: 'python3 -m tare.declare --scan --write',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'registre_couverture',
    nom: 'la couverture du registre',
    quoi:
      "ce que le registre officiel des hooks contient, confronté aux hooks qu'on a vus " +
      "vraiment tourner : la part des absents est le chiffre du jour",
    produit: 'python3 -m tare.registre',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'registre_epingle',
    nom: 'le registre épinglé',
    quoi:
      "la copie datée du registre officiel, figée dans le dépôt pour que le chiffre publié " +
      "reste vérifiable même si la liste bouge demain",
    produit: 'node apps/web/scripts/fetch-registry.mjs',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'registre_vivant',
    nom: 'le registre du jour',
    quoi: "la même liste relue plus tard : l'écart avec la copie épinglée se voit",
    produit: 'node apps/web/scripts/fetch-registry.mjs',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'volume',
    nom: 'le volume confronté à une source indépendante',
    quoi:
      "le volume et la TVL des pools du recensement, lus chez The Graph : une source qu'on ne " +
      "contrôle pas, utilisée pour se contredire et non pour se confirmer",
    produit: 'python3 -m tare.volume',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'reglements',
    nom: 'les règlements x402',
    quoi:
      "chaque paiement de mesure : le montant, le hash, et sa relecture sur le mirror node " +
      "Hedera — un règlement n'est compté que si le mirror node le rend",
    produit: 'apps/api/src/x402.ts, à chaque mesure payée',
    lu_par: [13],
    ecrit_par: [10],
  },
  {
    cle: 'identite',
    nom: "l'identité de l'agent",
    quoi:
      "l'UAID HCS-14, les six champs canoniques dont il est le haché, et le message publié sur " +
      "le topic Hedera — l'appelant peut recalculer l'identité avant de payer",
    produit: 'npx tsx apps/api/src/agent/cli.ts export, publié sur le topic HCS',
    lu_par: [10, 13],
    ecrit_par: [13],
  },
  {
    cle: 'attestations',
    nom: 'les attestations on-chain',
    quoi:
      "le prélèvement médian et maximum par hook, calculés sur le corpus, et l'état réel de " +
      "leur écriture : calculées, écartées faute de mesure, ou vraiment écrites",
    produit: 'python3 -m tare.attest, à partir du corpus',
    lu_par: [2],
    ecrit_par: [14],
  },
  {
    cle: 'chaine',
    nom: 'la chaîne complète',
    quoi:
      "les six étapes bout en bout — transaction réelle, verdict, recherche de porte, mesure " +
      "payée, ancrage HCS, signature sur l'appareil — avec leur durée et leur état",
    produit: 'apps/api/src/chaine/run.ts',
    lu_par: [8, 13],
    ecrit_par: [],
  },
  {
    cle: 'concordance',
    nom: 'la concordance source ↔ mesure',
    quoi:
      "les 112 hooks confrontés à leur propre code source, quand il est public : là où le code " +
      "annonce un taux, la mesure le confirme — et les 94 cas où elle ne le confirme pas sont " +
      "publiés, jusqu'à 9 979 bps d'écart",
    produit: 'python3 -m tare.source.cli analyze',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'graphe_cache',
    nom: 'le cache du graphe de bytecode',
    quoi:
      "ce que la reconstruction du graphe garde de la chaîne : le graphe complet pèse 198 Mo et " +
      "n'est pas livré, il se reconstruit — ce cache est ce qui permet de le refaire sans tout relire",
    produit: 'python3 -m tare.graph.cli build',
    lu_par: [4],
    ecrit_par: [],
  },
  {
    cle: 'ledger',
    nom: "les écrans de l'appareil",
    quoi:
      "le rapport encodé en EIP-712 tel qu'il s'affiche, écran par écran, sur le Ledger — on " +
      "ne signe pas un haché opaque, on lit ce qu'on signe",
    produit: 'packages/keyring, contre un Speculos',
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
  if (octets === null) return 'non lu'
  if (octets >= 1_000_000) return `${(octets / 1_000_000).toFixed(1).replace('.', ',')} Mo`
  if (octets >= 1_000) return `${Math.round(octets / 1_000)} ko`
  return `${octets} o`
}
