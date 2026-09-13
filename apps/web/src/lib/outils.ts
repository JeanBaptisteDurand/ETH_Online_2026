/**
 * LES QUATORZE OUTILS, ET LA DONNÉE QUE CHACUN COUVRE.
 *
 * Ce fichier existe pour une raison de travail : le site porte dix-sept panneaux et onze
 * groupes de faits, et rien ne disait **quelle donnée sert quel outil**. Quelqu'un qui reprend
 * le front devait lire les dix-sept composants pour le deviner.
 *
 * Chaque entrée dit, pour un outil :
 *   - la QUESTION à laquelle il répond, en une phrase d'utilisateur ;
 *   - la DONNÉE qu'il consomme, nommée par son fichier ou sa route — jamais « les mesures » ;
 *   - où elle est DÉJÀ affichée, s'il y a lieu ;
 *   - ce qu'il COÛTE : rien, un appel RPC, un péage, une signature ;
 *   - son ÉTAT réel, y compris quand il n'est pas complet.
 *
 * RÈGLE : un outil dont l'état n'est pas `pret` doit dire pourquoi. « À construire » sans
 * raison est une case vide qu'on oublie de remplir ; « écrit, pas déployé » se vérifie.
 */

export type Acces = 'site' | 'extension' | 'mcp' | 'x402' | 'compte'

export type Etat =
  /** utilisable maintenant, sur le site ou par l'API */
  | 'pret'
  /** le code existe et passe ses tests, mais une action humaine manque */
  | 'en_attente'
  /** hors ligne par construction : rien à joindre */
  | 'hors_ligne'

/**
 * LES TROIS FAMILLES, et pourquoi elles ont une couleur.
 *
 * Quatorze outils dans une liste se lisent comme quatorze choses interchangeables. Les trois
 * familles disent ce qui change vraiment d'un outil à l'autre : est-ce qu'il VA CHERCHER une
 * donnée, est-ce qu'il l'INTERPRÈTE, ou est-ce qu'il CHANGE quelque chose ?
 *
 * La distinction n'est pas décorative : seule la troisième famille touche à l'argent de
 * quelqu'un, et c'est celle où une erreur coûte. Le lecteur doit pouvoir la repérer d'un coup
 * d'œil, sans lire.
 */
export type Famille = 'collecte' | 'analyse' | 'action'

export const FAMILLES: Record<Famille, { nom: string; quoi: string; couleur: string }> = {
  collecte: {
    nom: 'collecte',
    quoi: "il va chercher une donnée qui n'existait pas encore",
    couleur: 'var(--focus)',
  },
  analyse: {
    nom: 'analyse',
    quoi: 'il lit ce qui est déjà mesuré et en tire une réponse',
    couleur: 'var(--m-6)',
  },
  action: {
    nom: 'action',
    quoi: 'il change quelque chose — une transaction, une session, une écriture on-chain',
    couleur: 'var(--m-4)',
  },
}

/** Un champ que l'outil rend — son nom tel qu'il sort, et ce qu'il veut dire. */
export interface Champ {
  champ: string
  quoi: string
}

export interface Outil {
  n: number
  nom: string
  famille: Famille
  /** la question d'un utilisateur, pas la description d'une fonction */
  question: string
  /** ce qu'il rend, en une phrase */
  rend: string
  /**
   * CE QUI ENTRE ET QUI N'EST PAS UN FICHIER : une adresse collée, un calldata intercepté,
   * un état lu sur la chaîne. Les fichiers, eux, viennent de `donnees.ts` — ils y sont
   * déclarés une fois, avec leur volume statté au build, au lieu d'être recopiés ici.
   */
  entree: string[]
  /**
   * CE QU'IL FAIT, étape par étape, dans l'ordre où ça se passe. Trois à cinq lignes : une
   * page qui dirait « il analyse » ne dirait rien. Pour la famille `action`, la dernière
   * étape doit nommer ce qui CHANGE — une signature demandée, une transaction rendue.
   */
  execute: string[]
  /**
   * CE QUI SORT, champ par champ, avec le nom réel du champ. C'est la moitié que les pages
   * outil n'avaient pas : six des quatorze ne montraient aucune sortie du tout.
   */
  sortie: Champ[]
  /** les fichiers de code qui l'implémentent — chacun vérifié présent, jamais deviné */
  code: string[]
  /** les routes HTTP, quand il y en a */
  routes: string[]
  /** les panneaux du site qui l'affichent déjà, par leur numéro */
  panneaux: string[]
  /** par où on l'atteint */
  acces: Acces[]
  cout: string
  etat: Etat
  /** obligatoire quand l'état n'est pas `pret` */
  pourquoi?: string
}

export const OUTILS: Outil[] = [
  {
    n: 1,
    famille: 'collecte',
    nom: 'Mesurer',
    question: "ce hook, sur ce pool, à cette taille — combien prend-il vraiment ?",
    rend: "deux cotations du même swap et leur écart, avec le bloc, le hash du stub et la commande de rejeu",
    entree: [
      "une PoolKey complète : les deux monnaies, les frais, le tickSpacing, l'adresse du hook",
      "une taille et un sens",
      "un bloc, pour épingler le fork — sans lui, deux cotations prises à dix minutes d'écart ne se comparent pas",
    ],
    execute: [
      "épingle un fork anvil au bloc demandé",
      "cote le swap tel quel, hook en place",
      "réécrit le bytecode DU HOOK par un talon inerte de 89 octets — même adresse, donc même poolId, même liquidité, même slot0",
      "cote le même swap une seconde fois, contre le talon",
      "restaure le bytecode, et rend l'écart entre les deux cotations",
    ],
    sortie: [
      { champ: 'out_with', quoi: "ce que le swap rend avec le hook en place" },
      { champ: 'out_without', quoi: "ce que le même swap rend contre le talon inerte" },
      { champ: 'bps', quoi: "l'écart entre les deux, en points de base — le prélèvement" },
      { champ: 'label', quoi: "MESURE, INTERPOLE, NON_MESURABLE ou NON_COTABLE — un silence n'est jamais un zéro" },
      { champ: 'block_number', quoi: "le bloc épinglé, sans lequel le chiffre n'est pas rejouable" },
      { champ: 'stub_hash', quoi: "l'empreinte du talon, pour vérifier que c'est le même inerte" },
      { champ: 'replay', quoi: "la commande exacte qui refait la mesure chez vous" },
    ],
    code: ['engine/tare/measure.py', 'engine/tare/stub.py', 'apps/api/scripts/measure_one.py'],
    routes: ['POST /measure'],
    panneaux: ['09'],
    acces: ['x402', 'mcp'],
    cout: '0,001 USDC par mesure, réglé en x402 sur Hedera',
    etat: 'pret',
  },
  {
    n: 2,
    famille: 'analyse',
    nom: 'Consulter',
    question: "qu'est-ce qui est déjà mesuré sur ce hook ?",
    rend: "toutes les lignes du corpus pour ce hook : taille, sens, étiquette, et ce qu'il a pris",
    entree: [
      "une adresse de hook, ou un identifiant de pool",
    ],
    execute: [
      "cherche dans le corpus déjà chargé en mémoire — aucune requête réseau",
      "ne calcule rien et ne complète rien : il rend les lignes telles qu'elles ont été mesurées",
      "rend l'étiquette avec chaque ligne, pour qu'une valeur interpolée ne se lise pas comme une mesure",
    ],
    sortie: [
      { champ: 'lignes', quoi: "une par taille et par sens : bps, étiquette, frais LP, bloc" },
      { champ: 'median / max', quoi: "le prélèvement médian et le pire, sur les lignes mesurées seules" },
      { champ: 'n_mesures', quoi: "combien de lignes existent vraiment — la troncature se voit" },
      { champ: 'label', quoi: "ce qui n'est pas mesuré est nommé, pas rempli" },
    ],
    code: ['apps/web/src/lib/dataset.ts', 'packages/guard/src/table.ts', 'apps/mcp/src/server.ts'],
    routes: ['GET /hooks', 'GET /hook/:adresse', 'GET /measurement/:id'],
    panneaux: ['02', '05', '06', '07'],
    acces: ['site', 'mcp', 'extension'],
    cout: 'rien — le corpus est embarqué dans la page',
    etat: 'pret',
  },
  {
    n: 3,
    famille: 'analyse',
    nom: 'Situer',
    question: "je mets 100 € sur ce jeton, il m'en reste combien si je ressors ?",
    rend: "le prélèvement composé aller-retour, ou un intervalle quand la revente varie avec la taille",
    entree: [
      "une adresse de jeton",
      "un montant, en monnaie de cotation",
    ],
    execute: [
      "trouve les pools mesurés qui portent ce jeton",
      "prend le prélèvement à l'entrée, puis celui à la SORTIE — la revente n'a aucune raison de coûter comme l'achat",
      "compose les deux, au lieu de les additionner",
      "rend un intervalle, et non un point, quand la revente varie avec la taille",
    ],
    sortie: [
      { champ: 'entree_bps', quoi: "ce que coûte l'achat" },
      { champ: 'sortie_bps', quoi: "ce que coûte la revente — le chiffre que personne n'affiche" },
      { champ: 'aller_retour', quoi: "les deux composés : ce qui reste de 100 euros" },
      { champ: 'intervalle', quoi: "la fourchette quand la sortie dépend de la taille" },
      { champ: 'sens_unique', quoi: "vrai quand le pool laisse entrer et ne laisse pas sortir" },
    ],
    code: ['apps/web/src/lib/exit.ts'],
    routes: ['GET /token/:adresse', 'GET /exit/:adresse?montant=100'],
    panneaux: ['00'],
    acces: ['site', 'mcp'],
    cout: 'rien',
    etat: 'pret',
  },
  {
    n: 4,
    famille: 'analyse',
    nom: 'Comprendre',
    question: "ce hook est-il seul de son espèce, ou en existe-t-il des copies ?",
    rend: "les grappes de bytecode identique, les orphelins, et les contradictions entre le registre et la mesure",
    entree: [
      "une adresse de hook, ou rien du tout pour le tableau d'ensemble",
    ],
    execute: [
      "confronte le registre officiel aux hooks vus tourner : la part des absents est un fait, pas une opinion",
      "confronte le corpus à une source indépendante (The Graph) et publie les DIVERGENCES, pas les concordances",
      "balaie ce que les hooks déclarent eux-mêmes, et compte combien le font",
      "regroupe les bytecodes identiques : un hook n'est pas forcément seul de son espèce",
    ],
    sortie: [
      { champ: 'absents', quoi: "les hooks qui tournent et que le registre ne connaît pas" },
      { champ: 'divergents', quoi: "les pools où notre mesure et la source ne disent pas la même chose, avec l'écart" },
      { champ: 'declarants', quoi: "les hooks qui annoncent eux-mêmes ce qu'ils prennent" },
      { champ: 'grappes', quoi: "les groupes de bytecode identique, et les orphelins" },
    ],
    code: ['engine/tare/graph/cli.py', 'engine/tare/registre.py', 'engine/tare/declare.py'],
    routes: ['GET /graph/*'],
    panneaux: ['08'],
    acces: ['site'],
    cout: 'un appel à l\'API ; le graphe n\'est pas dans le paquet',
    etat: 'en_attente',
    pourquoi:
      "le graphe pèse 198 Mo : il est reconstruit par `tare.graph.cli build`, pas livré. Sans " +
      "API joignable les trois encarts disent « non joignable » et donnent la commande — ils " +
      "n'affichent jamais zéro clone.",
  },
  {
    n: 5,
    famille: 'analyse',
    nom: 'Décider',
    question: "pour échanger A contre B, par quel pool passer ?",
    rend: "le classement des portes mesurées d'une paire, et l'aveu franc quand il n'y en a qu'une",
    entree: [
      "deux adresses de monnaie, ou une seule quand on cherche par où acheter un jeton",
      "une taille",
    ],
    execute: [
      "retient les portes qui ACHÈTENT vraiment le jeton demandé — un pool a deux sens, et le sens qui vend n'est pas une façon d'acheter",
      "groupe par monnaie payée : comparer un prix en WETH à un prix en USDC ne veut rien dire",
      "classe par prélèvement total, frais LP compris",
      "refuse de classer quand une seule porte est mesurée, et le dit",
    ],
    sortie: [
      { champ: 'etat', quoi: "PLUSIEURS_PORTES, PORTE_UNIQUE, AUCUNE_MESUREE, JETON_INCONNU ou MONNAIE_DE_COTATION" },
      { champ: 'groupes', quoi: "un par monnaie payée, chacun classé" },
      { champ: 'total_bps', quoi: "frais LP + prélèvement du hook, additionnés" },
      { champ: 'ecart', quoi: "ce que la meilleure porte fait gagner par rapport à la pire" },
      { champ: 'raison', quoi: "pourquoi il n'y a pas de classement, quand il n'y en a pas" },
    ],
    code: ['apps/web/src/lib/portes.ts', 'apps/web/src/lib/route.ts'],
    routes: ['GET /route?currency0=…&currency1=…'],
    panneaux: ['03'],
    acces: ['site', 'mcp'],
    cout: 'rien',
    etat: 'pret',
  },
  {
    n: 6,
    famille: 'analyse',
    nom: 'Proposer une autre porte',
    question: "et ailleurs, ce serait moins cher ?",
    rend: "l'un de six états nommés — et dans 99,71 % des cas, « il n'y a qu'une porte », qui est une réponse",
    entree: [
      "la transaction qu'on s'apprête à signer : ses deux monnaies, son sens, sa taille",
    ],
    execute: [
      "cherche les pools SŒURS : mêmes monnaies, même sens — pas « le même jeton ailleurs », qui comparerait des prix payés en monnaies différentes",
      "compare à taille égale, jamais à taille interpolée",
      "ne propose que si l'écart dépasse le seuil d'un point de base",
      "rend un état nommé quand il n'y a rien à proposer, au lieu de se taire",
    ],
    sortie: [
      { champ: 'etat', quoi: "l'un de six états — dont PORTE_UNIQUE, qui est une réponse" },
      { champ: 'alternative', quoi: "le pool visé, son prélèvement, et le gain en points de base" },
      { champ: 'part_porte_unique', quoi: "la part réelle des cas sans alternative, calculée sur tout le corpus" },
    ],
    code: ['packages/guard/src/alternative.ts', 'apps/api/src/alternative.ts'],
    routes: ['POST /alternative (construire: false)'],
    panneaux: ['16'],
    acces: ['site', 'extension', 'mcp'],
    cout: 'zéro appel RPC : la comparaison est locale',
    etat: 'pret',
  },
  {
    n: 7,
    famille: 'action',
    nom: 'Substituer la transaction',
    question: "construis-moi la transaction qui passe par la porte la moins chère",
    rend: "un {to, data, value} signable, ou l'un de neuf états nommés qui dit ce qui manque",
    entree: [
      "l'alternative retenue à l'étape précédente",
      "l'adresse de l'utilisateur",
      "l'état Permit2 LU sur la chaîne : allowance du jeton vers Permit2, autorisation vers le routeur, et le nonce",
      "une cotation vivante, pour le plancher de sortie",
    ],
    execute: [
      "lit l'autorisation du jeton vers le contrat Permit2, puis celle vers le routeur — deux eth_call, et seulement si une porte moins chère existe",
      "lit le nonce Permit2 au lieu de le deviner : un nonce deviné fait échouer la transaction au moment de la signer",
      "cote la porte visée en direct pour fixer le plancher de sortie, moins 50 bps de tolérance — jamais depuis le corpus, qui est épinglé à un bloc",
      "encode la liste de commandes 0x0a10 : PERMIT2_PERMIT puis V4_SWAP, dans cet ordre",
      "RELIT son propre calldata avant de le rendre, et refuse si la relecture ne redonne pas les mêmes valeurs",
    ],
    sortie: [
      { champ: 'to / data / value', quoi: "la transaction signable — elle n'est jamais envoyée par nous" },
      { champ: 'etat', quoi: "PRET, ou l'un des huit états qui disent ce qui manque" },
      { champ: 'plancher', quoi: "le minimum à recevoir, tiré d'une cotation vivante" },
      { champ: 'echeance', quoi: "maintenant + 20 minutes — le défaut du routeur valait l'an 2106" },
      { champ: 'appels_rpc', quoi: "combien d'appels ont été faits, pour que le coût se voie" },
    ],
    code: ['packages/guard/src/envoi.ts', 'packages/guard/src/lecture.ts', 'packages/guard/src/permit2.ts'],
    routes: ['POST /alternative (construire: true)'],
    panneaux: ['16'],
    acces: ['site'],
    cout: 'jusqu\'à trois eth_call, et seulement si une porte moins chère existe',
    etat: 'pret',
  },
  {
    n: 8,
    famille: 'collecte',
    nom: 'Intercepter',
    question: "qu'est-ce que je m'apprête à signer ?",
    rend: "la PoolKey lue dans le calldata de l'Universal Router, et ce que ce hook a pris à cette taille",
    entree: [
      "le calldata que le site d'échange s'apprête à faire signer, intercepté AVANT le portefeuille",
      "la chaîne et l'adresse du routeur",
    ],
    execute: [
      "se place entre la page et le portefeuille, par un piège posé sur la méthode de demande du fournisseur",
      "décode le calldata de l'Universal Router et en extrait la PoolKey — les deux monnaies, les frais, le tickSpacing, le hook",
      "redérive le poolId depuis cette PoolKey, et REJETTE la ligne si le poolId ne retombe pas",
      "interroge la table embarquée dans son service worker : aucune requête, donc rien à voir tomber",
      "rend son verdict avant la signature, et laisse le dernier mot à l'humain",
    ],
    sortie: [
      { champ: 'pool_id', quoi: "l'identifiant redérivé, pas celui qu'on nous annonce" },
      { champ: 'hook', quoi: "l'adresse du hook lue dans la PoolKey" },
      { champ: 'bps', quoi: "ce que ce hook a pris à cette taille, ou l'aveu qu'on ne l'a pas mesuré" },
      { champ: 'verdict', quoi: "ce qui s'affiche avant la signature" },
      { champ: 'delai', quoi: "le temps qu'a pris l'analyse — hors ligne, en millisecondes" },
    ],
    code: ['packages/guard/src/calldata.ts', 'packages/guard/src/poolkey.ts', 'packages/guard/extension/inject.src.ts', 'packages/guard/extension/worker.src.ts'],
    routes: [],
    panneaux: [],
    acces: ['extension'],
    cout: 'rien, et aucune requête : la table est dans l\'extension',
    etat: 'hors_ligne',
    pourquoi:
      "l'extension ne vit pas sur le site : elle s'installe. Elle analyse hors ligne, et la " +
      "clé d'API ne sert qu'à déposer ses verdicts dans l'historique du compte.",
  },
  {
    n: 9,
    famille: 'action',
    nom: 'Approuver',
    question: "je confirme, ou j'annule ?",
    rend: "la décision d'un humain, rendue écran par écran sur un Ledger quand il y en a un",
    entree: [
      "le rapport de la garde : le verdict, le pool, le hook, le prélèvement",
      "un appareil, quand il y en a un",
    ],
    execute: [
      "encode le rapport en EIP-712, type et champs nommés",
      "rend le message écran par écran sur l'appareil — on ne signe pas un haché opaque",
      "attend la décision de l'humain, sans défaut",
      "une annulation rend le code 4001 et RIEN n'est appelé : ce qui est refusé ne passe pas",
    ],
    sortie: [
      { champ: 'ecrans', quoi: "ce qui s'est affiché, champ par champ" },
      { champ: 'signature', quoi: "la signature, quand l'humain a accepté" },
      { champ: 'refus', quoi: "le code 4001, quand il a refusé — et l'appel n'a pas eu lieu" },
    ],
    code: ['packages/guard/src/ledger.ts', 'packages/keyring/src/speculos.ts'],
    routes: [],
    panneaux: ['14'],
    acces: ['site', 'extension'],
    cout: 'une signature',
    etat: 'pret',
  },
  {
    n: 10,
    famille: 'collecte',
    nom: 'Payer à l\'unité',
    question: "je veux une mesure neuve, sans compte",
    rend: "un 402 qui annonce le prix, puis la mesure, puis le règlement relu sur le mirror node",
    entree: [
      "une requête de mesure, sans compte et sans clé",
      "un compte Hedera avec de l'USDC de test",
    ],
    execute: [
      "répond 402 en ANNONÇANT le prix, au lieu de refuser",
      "reçoit le paiement, puis exécute la mesure",
      "RELIT le règlement sur le mirror node Hedera : un serveur qui dit 'payé' ne suffit pas, c'est lui qu'on vérifie",
      "n'inscrit le règlement au journal que si le mirror node le rend",
    ],
    sortie: [
      { champ: '402', quoi: "le prix, le réseau, le jeton et l'encaisseur, annoncés avant paiement" },
      { champ: 'mesure', quoi: "la mesure elle-même, une fois le paiement relu" },
      { champ: 'tx_hash', quoi: "le hash du règlement, vérifiable sur le mirror node" },
      { champ: 'relu', quoi: "vrai seulement si le mirror node a rendu le règlement" },
    ],
    code: ['apps/api/src/x402.ts'],
    routes: ['POST /measure', 'GET /usage', 'GET /usage/hcs'],
    panneaux: ['09'],
    acces: ['x402'],
    cout: '0,001 USDC par mesure',
    etat: 'pret',
  },
  {
    n: 11,
    famille: 'action',
    nom: 'S\'abonner',
    question: "je veux l'extension, le MCP et mon historique",
    rend: "une échéance lue sur un contrat, jamais crue sur parole — et un refus motivé quand la lecture échoue",
    entree: [
      "une adresse de portefeuille connectée",
      "l'échéance LUE sur le contrat, jamais celle que notre base annonce",
    ],
    execute: [
      "envoie le prix au contrat, qui calcule lui-même la durée — le site n'envoie aucun calldata",
      "relit l'échéance sur la chaîne après la transaction",
      "refuse d'activer quoi que ce soit si la lecture échoue : « abonnement non vérifié, donc pas actif »",
      "ouvre alors les clés d'API, les téléchargements et l'historique",
    ],
    sortie: [
      { champ: 'abonneJusquA', quoi: "l'échéance, lue sur le contrat" },
      { champ: 'actif', quoi: "faux tant que la lecture on-chain n'a pas confirmé" },
      { champ: 'surfaces', quoi: "les clés, les téléchargements et l'historique que l'abonnement ouvre" },
    ],
    code: ['contracts/src/AbonnementTARE.sol', 'apps/api/src/compte/abonnement.ts'],
    routes: ['POST /compte/abonnement', 'GET /compte'],
    panneaux: ['15'],
    acces: ['compte'],
    cout: 'le prix du contrat, lu sur la chaîne',
    etat: 'en_attente',
    pourquoi:
      '182 lignes de Solidity, 20 tests forge, vérifié contre un fork local où 1,5 × le prix ' +
      "achète exactement 45,00 jours — mais **pas déployé** sur un réseau public. Tant qu'il " +
      "ne l'est pas, le compte répond « abonnement non vérifié, donc pas actif ».",
  },
  {
    n: 12,
    famille: 'action',
    nom: 'Authentifier',
    question: "comment je me connecte, sans mot de passe ?",
    rend: "un jeton de session contre une signature, sur un texte que le serveur rend en entier",
    entree: [
      "une adresse de portefeuille, découverte par EIP-6963",
      "la signature d'un texte rendu EN ENTIER par le serveur",
    ],
    execute: [
      "demande un nonce au serveur",
      "fait signer un texte que le serveur a composé et que l'utilisateur lit en entier — on ne fait pas signer un haché",
      "vérifie la signature côté serveur et ouvre une session",
      "n'écrit aucun mot de passe, nulle part",
    ],
    sortie: [
      { champ: 'nonce', quoi: "à usage unique, donné par le serveur" },
      { champ: 'session', quoi: "un jeton de session contre une signature" },
      { champ: 'adresse', quoi: "l'identité retenue : une adresse, pas un courriel" },
    ],
    code: ['apps/api/src/compte/adresse.ts', 'apps/web/src/compte/api.ts'],
    routes: ['POST /compte/nonce', 'POST /compte/session', 'DELETE /compte/session'],
    panneaux: ['15'],
    acces: ['compte'],
    cout: 'une signature, gratuite',
    etat: 'pret',
  },
  {
    n: 13,
    famille: 'action',
    nom: 'Prouver',
    question: "qui a mesuré, quand, et comment je le vérifie sans vous croire ?",
    rend: "l'identité HCS-14 de l'agent, recalculable depuis six champs, et le journal d'audit ancré sur Hedera",
    entree: [
      "rien — la preuve doit se vérifier sans nous demander la permission",
    ],
    execute: [
      "publie les six champs canoniques de l'agent, dans leur ordre canonique",
      "en donne le haché SHA-384 encodé en base58 : l'appelant RECALCULE l'identité au lieu de nous croire",
      "ancre le journal d'usage sur un topic HCS Hedera, et le relit",
      "rend le lien d'explorateur pour chaque ancrage",
    ],
    sortie: [
      { champ: 'uaid', quoi: "l'identité HCS-14, recalculable depuis les six champs" },
      { champ: 'canonical_json', quoi: "les six champs exacts qui ont été hachés" },
      { champ: 'topic', quoi: "le topic Hedera, et le numéro de séquence du message" },
      { champ: 'historique', quoi: "les lots ancrés, relus sur le mirror node" },
    ],
    code: ['apps/api/src/agent/cli.ts'],
    routes: ['GET /agent', 'GET /agent/hcs', 'GET /usage/hcs/history'],
    panneaux: ['10', '13'],
    acces: ['site', 'x402', 'mcp'],
    cout: 'rien',
    etat: 'pret',
  },
  {
    n: 14,
    famille: 'action',
    nom: 'Attester',
    question: "un autre contrat peut-il lire ces mesures ?",
    rend: "le prélèvement médian et maximum d'un hook, écrits dans un contrat et lisibles on-chain",
    entree: [
      "le corpus, filtré sur les hooks qui ont assez de mesures",
    ],
    execute: [
      "calcule le prélèvement médian et maximum par hook, sur les lignes MESURÉES seules",
      "ÉCARTE les hooks sans mesure suffisante au lieu de les écrire à zéro",
      "écrit les valeurs retenues dans un contrat, avec l'empreinte du corpus",
      "publie l'écart entre ce qui est calculé et ce qui est réellement écrit",
    ],
    sortie: [
      { champ: 'median_bps / max_bps', quoi: "par hook, lisibles on-chain par un autre contrat" },
      { champ: 'corpusDigest', quoi: "l'empreinte du corpus dont ces valeurs sortent" },
      { champ: 'ecrits / ecartes', quoi: "ce qui est vraiment on-chain, et ce qui attend du gaz" },
    ],
    code: ['contracts/src/HookRateAttestations.sol', 'engine/tare/attest.py'],
    routes: [],
    panneaux: ['11'],
    acces: ['site'],
    cout: 'le gaz d\'écriture, déjà payé pour 16 hooks',
    etat: 'en_attente',
    pourquoi:
      '99 attestations sont calculées ; **16 sont réellement écrites** on-chain. Le reste ' +
      "attend du gaz, et l'écart est publié plutôt que lissé.",
  },
]

/* ------------------------------------------------------- les quatre accès */

export interface AccesDesc {
  cle: Acces
  nom: string
  /** à qui il s'adresse */
  pour: string
  /** pourquoi celui-là et pas un autre — la question de JB */
  pourquoi: string
  /** ce qu'il faut pour s'en servir */
  prerequis: string
  outils: number[]
}

export const ACCES: AccesDesc[] = [
  {
    cle: 'site',
    nom: 'Le site',
    pour: 'quelqu\'un qui veut une réponse maintenant, sans rien installer',
    pourquoi:
      "parce que le corpus entier est dans la page : 125 072 mesures encodées par colonnes, " +
      "7,9 Mo. On colle une adresse et on lit le résultat — pas de portefeuille, pas de compte, " +
      "pas une seule requête réseau. Un jugement asynchrone se fait sur pièces : les 27 projets " +
      "primés en asynchrone avaient TOUS une URL de démo vivante, 27 sur 27. C'est celle-là, et " +
      "elle s'ouvre en cinq secondes.",
    prerequis: 'rien',
    outils: [2, 3, 4, 5, 6, 7, 9, 13, 14],
  },
  {
    cle: 'extension',
    nom: 'L\'extension',
    pour: 'quelqu\'un qui échange déjà, ailleurs, et ne viendra pas sur notre site',
    pourquoi:
      "parce que le bon moment pour savoir ce qu'un hook prend n'est pas quand on cherche : " +
      "c'est **trois secondes avant de signer**, sur le site où on échange. Elle se place " +
      "entre la page et le portefeuille, lit le calldata de l'Universal Router, et rend son " +
      "verdict avant la signature. Douze kilooctets de script de contenu ; la table des " +
      "mesures vit dans son service worker et répond sans aucune requête — donc elle marche " +
      "même si notre serveur est éteint.",
    prerequis: 'l\'installer ; une clé d\'API seulement pour l\'historique',
    outils: [2, 6, 8, 9],
  },
  {
    cle: 'mcp',
    nom: 'Le serveur MCP',
    pour: 'un agent, pas un humain',
    pourquoi:
      "parce qu'un modèle à qui on demande « ce hook prend combien ? » **invente un nombre " +
      "plausible**. Le MCP lui donne quatre outils dont les descriptions disent, en toutes " +
      "lettres, de ne jamais énoncer un chiffre que l'outil n'a pas rendu — et chaque réponse " +
      "porte son étiquette, son bloc, sa taille, son sens et sa commande de rejeu. Il lit les " +
      "125 072 mesures sur disque et répond hors ligne : la clé ne décide que de l'historique.",
    prerequis: 'Claude Desktop ou tout client MCP ; la clé pour l\'historique',
    outils: [1, 2, 3, 5, 6, 13],
  },
  {
    cle: 'x402',
    nom: 'x402 en direct, sur Hedera',
    pour: 'un agent autonome qui n\'a pas de compte et n\'en veut pas',
    pourquoi:
      "parce qu'un agent ne remplit pas un formulaire d'inscription. Il fait une requête, " +
      "reçoit un **402 qui annonce le prix**, paie, et reçoit la mesure — 0,001 USDC, réglé " +
      "et relu sur le mirror node Hedera, pas sur notre parole. La clé qui signe est scellée " +
      "dans un Ledger, et l'agent qui répond a une identité HCS-14 publiée sur un topic : " +
      "l'appelant peut vérifier **qui** il appelle avant de payer.",
    prerequis: 'un compte Hedera et de l\'USDC de test',
    outils: [1, 10, 13],
  },
  {
    cle: 'compte',
    nom: 'Le compte',
    pour: 'quelqu\'un qui utilise le produit plus d\'une fois',
    pourquoi:
      "il n'ajoute aucune mesure — il ouvre les **surfaces** : une clé d'API par surface, les " +
      "téléchargements de l'extension et du MCP, et l'historique de ce qu'ils ont fait. La " +
      "connexion se fait par signature de portefeuille, sans mot de passe, et l'abonnement est " +
      "lu **sur la chaîne** plutôt que cru sur parole.",
    prerequis: 'un portefeuille, et un abonnement actif pour les clés',
    outils: [11, 12],
  },
]

/** Les outils d'une famille. */
export const parFamille = (f: Famille): Outil[] => OUTILS.filter((o) => o.famille === f)

/** Les outils d'un accès, dans l'ordre du parcours. */
export const outilsDe = (a: Acces): Outil[] =>
  OUTILS.filter((o) => o.acces.includes(a))

/** L'outil par son numéro. */
export const outil = (n: number): Outil | undefined => OUTILS.find((o) => o.n === n)
