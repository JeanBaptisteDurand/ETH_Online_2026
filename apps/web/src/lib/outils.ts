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
    nom: 'collection',
    quoi: 'it goes and fetches a piece of data that did not exist yet',
    couleur: 'var(--focus)',
  },
  analyse: {
    nom: 'analysis',
    quoi: 'it reads what is already measured and draws an answer from it',
    couleur: 'var(--m-6)',
  },
  action: {
    nom: 'action',
    quoi: 'it changes something — a transaction, a session, an on-chain write',
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
    nom: 'Measure',
    question: "this hook, on this pool, at this size — how much does it actually take?",
    rend: "two quotes of the same swap and the gap between them, with the block, the stub hash and the replay command",
    entree: [
      "a complete PoolKey: both currencies, the fee, the tickSpacing, the hook address",
      "a size and a direction",
      "a block, to pin the fork — without it, two quotes taken ten minutes apart cannot be compared",
    ],
    execute: [
      "pins an anvil fork at the requested block",
      "quotes the swap as it stands, hook in place",
      "rewrites THE HOOK's bytecode with an inert 89-byte stub — same address, so same poolId, same liquidity, same slot0",
      "quotes the same swap a second time, against the stub",
      "restores the bytecode, and returns the gap between the two quotes",
    ],
    sortie: [
      { champ: 'out_with', quoi: "what the swap returns with the hook in place" },
      { champ: 'out_without', quoi: "what the same swap returns against the inert stub" },
      { champ: 'bps', quoi: "the gap between the two, in basis points — the take" },
      { champ: 'label', quoi: "MESURE, INTERPOLE, NON_MESURABLE or NON_COTABLE — a silence is never a zero" },
      { champ: 'block_number', quoi: "the pinned block, without which the number cannot be replayed" },
      { champ: 'stub_hash', quoi: "the stub digest, to check it is the same inert code" },
      { champ: 'replay', quoi: "the exact command that redoes the measurement on your machine" },
    ],
    code: ['engine/tare/measure.py', 'engine/tare/stub.py', 'apps/api/scripts/measure_one.py'],
    routes: ['POST /measure'],
    panneaux: ['09'],
    acces: ['x402', 'mcp'],
    cout: '0.001 USDC per measurement, settled in x402 on Hedera',
    etat: 'pret',
  },
  {
    n: 2,
    famille: 'analyse',
    nom: 'Look up',
    question: "what has already been measured on this hook?",
    rend: "every corpus row for this hook: size, direction, label, and what it took",
    entree: [
      "a hook address, or a pool id",
    ],
    execute: [
      "searches the corpus already loaded in memory — no network request",
      "computes nothing and fills nothing in: it returns the rows as they were measured",
      "returns the label with every row, so an interpolated value never reads as a measurement",
    ],
    sortie: [
      { champ: 'lignes', quoi: "one per size and direction: bps, label, LP fee, block" },
      { champ: 'median / max', quoi: "the median take and the worst one, over the measured rows only" },
      { champ: 'n_mesures', quoi: "how many rows really exist — truncation is visible" },
      { champ: 'label', quoi: "what is not measured is named, not filled in" },
    ],
    code: ['apps/web/src/lib/dataset.ts', 'packages/guard/src/table.ts', 'apps/mcp/src/server.ts'],
    routes: ['GET /hooks', 'GET /hook/:adresse', 'GET /measurement/:id'],
    panneaux: ['02', '05', '06', '07'],
    acces: ['site', 'mcp', 'extension'],
    cout: 'nothing — the corpus ships inside the page',
    etat: 'pret',
  },
  {
    n: 3,
    famille: 'analyse',
    nom: 'Gauge',
    question: "I put €100 into this token — how much is left if I go back out?",
    rend: "the compounded round-trip take, or a range when the sell side varies with size",
    entree: [
      "a token address",
      "an amount, in a quote currency",
    ],
    execute: [
      "finds the measured pools that carry this token",
      "reads what is taken on the way in, then what is taken on the way OUT — selling has no reason to cost what buying costs",
      "compounds the two, instead of adding them up",
      "returns a range, not a single point, when the sell side varies with size",
    ],
    sortie: [
      { champ: 'entree_bps', quoi: "what buying costs, in basis points" },
      { champ: 'sortie_bps', quoi: "what selling costs — the number nobody displays" },
      { champ: 'aller_retour', quoi: "the two compounded: what is left of €100" },
      { champ: 'intervalle', quoi: "the range when the exit depends on the size" },
      { champ: 'sens_unique', quoi: "true when the pool lets you in and does not let you out" },
    ],
    code: ['apps/web/src/lib/exit.ts'],
    routes: ['GET /token/:adresse', 'GET /exit/:adresse?montant=100'],
    panneaux: ['00'],
    acces: ['site', 'mcp'],
    cout: 'nothing',
    etat: 'pret',
  },
  {
    n: 4,
    famille: 'analyse',
    nom: 'Understand',
    question: "is this hook one of a kind, or are there copies of it?",
    rend: "the clusters of identical bytecode, the orphans, and the contradictions between the registry and the measurement",
    entree: [
      "a hook address, or nothing at all for the overall picture",
    ],
    execute: [
      "puts the official registry against the hooks seen running: the share of missing ones is a fact, not an opinion",
      "puts the corpus against an independent source (The Graph) and publishes the DIVERGENCES, not the agreements",
      "sweeps what the hooks declare themselves, and counts how many do",
      "groups identical bytecodes together: a hook is not necessarily one of a kind",
    ],
    sortie: [
      { champ: 'absents', quoi: "the hooks that run and that the registry does not know" },
      { champ: 'divergents', quoi: "the pools where our measurement and the source disagree, with the gap" },
      { champ: 'declarants', quoi: "the hooks that announce by themselves what they take" },
      { champ: 'grappes', quoi: "the groups of identical bytecode, and the orphans" },
    ],
    code: ['engine/tare/graph/cli.py', 'engine/tare/registre.py', 'engine/tare/declare.py'],
    routes: ['GET /graph/*'],
    panneaux: ['08'],
    acces: ['site'],
    cout: 'one API call; the graph is not in the bundle',
    etat: 'en_attente',
    pourquoi:
      "the graph weighs 198 MB: it is rebuilt by `tare.graph.cli build`, not shipped. With no " +
      "reachable API the three panels say “not reachable” and give the command — they never " +
      "display zero clones.",
  },
  {
    n: 5,
    famille: 'analyse',
    nom: 'Decide',
    question: "to swap A for B, which pool should I go through?",
    rend: "the ranking of the measured doors of a pair, and the plain admission when there is only one",
    entree: [
      "two currency addresses, or a single one when looking for where to buy a token",
      "a size",
    ],
    execute: [
      "keeps the doors that actually BUY the requested token — a pool has two directions, and the selling direction is not a way to buy",
      "groups by currency paid: comparing a price in WETH with a price in USDC means nothing",
      "ranks by total take, LP fee included",
      "refuses to rank when only one door is measured, and says so",
    ],
    sortie: [
      { champ: 'etat', quoi: "PLUSIEURS_PORTES, PORTE_UNIQUE, AUCUNE_MESUREE, JETON_INCONNU or MONNAIE_DE_COTATION" },
      { champ: 'groupes', quoi: "one per currency paid, each of them ranked" },
      { champ: 'total_bps', quoi: "LP fee + hook take, added together" },
      { champ: 'ecart', quoi: "what the best door saves compared with the worst one" },
      { champ: 'raison', quoi: "why there is no ranking, when there is none" },
    ],
    code: ['apps/web/src/lib/portes.ts', 'apps/web/src/lib/route.ts'],
    routes: ['GET /route?currency0=…&currency1=…'],
    panneaux: ['03'],
    acces: ['site', 'mcp'],
    cout: 'nothing',
    etat: 'pret',
  },
  {
    n: 6,
    famille: 'analyse',
    nom: 'Propose another door',
    question: "would it be cheaper somewhere else?",
    rend: "one of six named states — and in 99.71% of cases, “there is only one door”, which is an answer",
    entree: [
      "the transaction about to be signed: its two currencies, its direction, its size",
    ],
    execute: [
      "looks for SIBLING pools: same currencies, same direction — not “the same token elsewhere”, which would compare prices paid in different currencies",
      "compares at equal size, never at an interpolated size",
      "only proposes when the gap clears the one basis point threshold",
      "returns a named state when there is nothing to propose, instead of staying silent",
    ],
    sortie: [
      { champ: 'etat', quoi: "one of six states — among them PORTE_UNIQUE, which is an answer" },
      { champ: 'alternative', quoi: "the target pool, its take, and the gain in basis points" },
      { champ: 'part_porte_unique', quoi: "the real share of cases with no alternative, computed over the whole corpus" },
    ],
    code: ['packages/guard/src/alternative.ts', 'apps/api/src/alternative.ts'],
    routes: ['POST /alternative (construire: false)'],
    panneaux: ['16'],
    acces: ['site', 'extension', 'mcp'],
    cout: 'zero RPC calls: the comparison is local',
    etat: 'pret',
  },
  {
    n: 7,
    famille: 'action',
    nom: 'Substitute the transaction',
    question: "build me the transaction that goes through the cheapest door",
    rend: "a signable {to, data, value}, or one of nine named states that says what is missing",
    entree: [
      "the alternative kept at the previous step",
      "the address of the user",
      "the Permit2 state READ on chain: token allowance to Permit2, authorization to the router, and the nonce",
      "a live quote, for the output floor",
    ],
    execute: [
      "reads the token allowance to the Permit2 contract, then the one to the router — two eth_call, and only if a cheaper door exists",
      "reads the Permit2 nonce instead of guessing it: a guessed nonce makes the transaction fail at signing time",
      "quotes the target door live to set the output floor, minus 50 bps of tolerance — never from the corpus, which is pinned to a block",
      "encodes the 0x0a10 command list: PERMIT2_PERMIT then V4_SWAP, in that order",
      "RE-READS its own calldata before returning it, and refuses if the second read does not give the same values back",
    ],
    sortie: [
      { champ: 'to / data / value', quoi: "the signable transaction — it is never sent by us" },
      { champ: 'etat', quoi: "PRET, or one of the eight states that say what is missing" },
      { champ: 'plancher', quoi: "the minimum to receive, taken from a live quote" },
      { champ: 'echeance', quoi: "now + 20 minutes — the router default was the year 2106" },
      { champ: 'appels_rpc', quoi: "how many calls were made, so that the cost is visible" },
    ],
    code: ['packages/guard/src/envoi.ts', 'packages/guard/src/lecture.ts', 'packages/guard/src/permit2.ts'],
    routes: ['POST /alternative (construire: true)'],
    panneaux: ['16'],
    acces: ['site'],
    cout: 'up to three eth_call, and only if a cheaper door exists',
    etat: 'pret',
  },
  {
    n: 8,
    famille: 'collecte',
    nom: 'Intercept',
    question: "what am I about to sign?",
    rend: "the PoolKey read from the Universal Router calldata, and what this hook took at this size",
    entree: [
      "the calldata the exchange site is about to have signed, intercepted BEFORE the wallet",
      "the chain and the address of the router",
    ],
    execute: [
      "sits between the page and the wallet, through a trap set on the provider request method",
      "decodes the Universal Router calldata and pulls the PoolKey out of it — both currencies, the fee, the tickSpacing, the hook",
      "re-derives the poolId from that PoolKey, and REJECTS the row if the poolId does not come back the same",
      "queries the table embedded in its service worker: no request, so nothing that can go down",
      "returns its verdict before the signature, and leaves the last word to the human",
    ],
    sortie: [
      { champ: 'pool_id', quoi: "the re-derived id, not the one we are handed" },
      { champ: 'hook', quoi: "the hook address read from the PoolKey" },
      { champ: 'bps', quoi: "what this hook took at this size, or the admission that we have not measured it" },
      { champ: 'verdict', quoi: "what is displayed before the signature" },
      { champ: 'delai', quoi: "how long the analysis took — offline, in milliseconds" },
    ],
    code: ['packages/guard/src/calldata.ts', 'packages/guard/src/poolkey.ts', 'packages/guard/extension/inject.src.ts', 'packages/guard/extension/worker.src.ts'],
    routes: [],
    panneaux: [],
    acces: ['extension'],
    cout: 'nothing, and no request: the table is inside the extension',
    etat: 'hors_ligne',
    pourquoi:
      "the extension does not live on the site: it gets installed. It analyzes offline, and the " +
      "API key only serves to drop its verdicts into the history of the account.",
  },
  {
    n: 9,
    famille: 'action',
    nom: 'Approve',
    question: "do I confirm, or do I cancel?",
    rend: "the decision of a human, rendered screen by screen on a Ledger when there is one",
    entree: [
      "the report of the guard: the verdict, the pool, the hook, the take",
      "a device, when there is one",
    ],
    execute: [
      "encodes the report as EIP-712, named type and named fields",
      "renders the message screen by screen on the device — you do not sign an opaque hash",
      "waits for the decision of the human, with no default",
      "a cancellation returns code 4001 and NOTHING is called: what is refused does not go through",
    ],
    sortie: [
      { champ: 'ecrans', quoi: "what was displayed, field by field" },
      { champ: 'signature', quoi: "the signature, when the human accepted" },
      { champ: 'refus', quoi: "code 4001, when they refused — and the call never happened" },
    ],
    code: ['packages/guard/src/ledger.ts', 'packages/keyring/src/speculos.ts'],
    routes: [],
    panneaux: ['14'],
    acces: ['site', 'extension'],
    cout: 'one signature',
    etat: 'pret',
  },
  {
    n: 10,
    famille: 'collecte',
    nom: 'Pay per call',
    question: "I want a fresh measurement, without an account",
    rend: "a 402 that announces the price, then the measurement, then the settlement read back on the mirror node",
    entree: [
      "a measurement request, with no account and no key",
      "a Hedera account holding test USDC",
    ],
    execute: [
      "answers 402 ANNOUNCING the price, instead of refusing",
      "receives the payment, then runs the measurement",
      "READS the settlement BACK on the Hedera mirror node: a server that says 'paid' is not enough, it is the one being checked",
      "only writes the settlement to the log if the mirror node returns it",
    ],
    sortie: [
      { champ: '402', quoi: "the price, the network, the token and the payee, announced before payment" },
      { champ: 'mesure', quoi: "the measurement itself, once the payment has been read back" },
      { champ: 'tx_hash', quoi: "the settlement hash, verifiable on the mirror node" },
      { champ: 'relu', quoi: "true only if the mirror node returned the settlement" },
    ],
    code: ['apps/api/src/x402.ts'],
    routes: ['POST /measure', 'GET /usage', 'GET /usage/hcs'],
    panneaux: ['09'],
    acces: ['x402'],
    cout: '0.001 USDC per measurement',
    etat: 'pret',
  },
  {
    n: 11,
    famille: 'action',
    nom: 'Subscribe',
    question: "I want the extension, the MCP server and my history",
    rend: "an expiry read from a contract, never taken on trust — and a reasoned refusal when the read fails",
    entree: [
      "a connected wallet address",
      "the expiry READ from the contract, never the one our database announces",
    ],
    execute: [
      "sends the price to the contract, which computes the duration itself — the site sends no calldata",
      "reads the expiry back on chain after the transaction",
      "refuses to activate anything if the read fails: “subscription unverified, therefore not active”",
      "then opens the API keys, the downloads and the history",
    ],
    sortie: [
      { champ: 'abonneJusquA', quoi: "the expiry, read from the contract itself" },
      { champ: 'actif', quoi: "false until the on-chain read has confirmed it" },
      { champ: 'surfaces', quoi: "the keys, the downloads and the history that the subscription opens" },
    ],
    code: ['contracts/src/AbonnementTARE.sol', 'apps/api/src/compte/abonnement.ts'],
    routes: ['POST /compte/abonnement', 'GET /compte'],
    panneaux: ['15'],
    acces: ['compte'],
    cout: 'the contract price, read on chain',
    etat: 'en_attente',
    pourquoi:
      '182 lines of Solidity, 20 forge tests, checked against a local fork where 1.5 × the price ' +
      'buys exactly 45.00 days — but **not deployed** on a public network. Until it is, the ' +
      'account answers “subscription unverified, therefore not active”.',
  },
  {
    n: 12,
    famille: 'action',
    nom: 'Authenticate',
    question: "how do I sign in, without a password?",
    rend: "a session token in exchange for a signature, on a text the server shows in full",
    entree: [
      "a wallet address, discovered through EIP-6963",
      "the signature of a text shown IN FULL by the server",
    ],
    execute: [
      "asks the server for a nonce",
      "has a text signed that the server composed and that the user reads in full — we never have a hash signed",
      "checks the signature server-side and opens a session",
      "writes no password, anywhere",
    ],
    sortie: [
      { champ: 'nonce', quoi: "single use, handed out by the server" },
      { champ: 'session', quoi: "a session token in exchange for a signature" },
      { champ: 'adresse', quoi: "the identity kept: an address, not an email" },
    ],
    code: ['apps/api/src/compte/adresse.ts', 'apps/web/src/compte/api.ts'],
    routes: ['POST /compte/nonce', 'POST /compte/session', 'DELETE /compte/session'],
    panneaux: ['15'],
    acces: ['compte'],
    cout: 'one signature, free',
    etat: 'pret',
  },
  {
    n: 13,
    famille: 'action',
    nom: 'Prove',
    question: "who measured, when, and how do I check it without taking your word?",
    rend: "the HCS-14 identity of the agent, recomputable from six fields, and the audit log anchored on Hedera",
    entree: [
      "nothing — the proof must be checkable without asking us for permission",
    ],
    execute: [
      "publishes the six canonical fields of the agent, in their canonical order",
      "gives their SHA-384 hash encoded in base58: the caller RECOMPUTES the identity instead of trusting us",
      "anchors the usage log on a Hedera HCS topic, and reads it back",
      "returns the explorer link for each anchoring",
    ],
    sortie: [
      { champ: 'uaid', quoi: "the HCS-14 identity, recomputable from the six fields" },
      { champ: 'canonical_json', quoi: "the exact six fields that were hashed" },
      { champ: 'topic', quoi: "the Hedera topic, and the sequence number of the message" },
      { champ: 'historique', quoi: "the anchored batches, read back on the mirror node" },
    ],
    code: ['apps/api/src/agent/cli.ts'],
    routes: ['GET /agent', 'GET /agent/hcs', 'GET /usage/hcs/history'],
    panneaux: ['10', '13'],
    acces: ['site', 'x402', 'mcp'],
    cout: 'nothing',
    etat: 'pret',
  },
  {
    n: 14,
    famille: 'action',
    nom: 'Attest',
    question: "can another contract read these measurements?",
    rend: "the median and maximum take of a hook, written into a contract and readable on-chain",
    entree: [
      "the corpus, filtered down to the hooks that have enough measurements",
    ],
    execute: [
      "computes the median and maximum take per hook, over the MEASURED rows only",
      "SETS ASIDE the hooks without enough measurements instead of writing them as zero",
      "writes the values it kept into a contract, together with the corpus digest",
      "publishes the gap between what is computed and what is actually written",
    ],
    sortie: [
      { champ: 'median_bps / max_bps', quoi: "per hook, readable on-chain by another contract" },
      { champ: 'corpusDigest', quoi: "the digest of the corpus these values come from" },
      { champ: 'ecrits / ecartes', quoi: "what is really on-chain, and what is waiting for gas" },
    ],
    code: ['contracts/src/HookRateAttestations.sol', 'engine/tare/attest.py'],
    routes: [],
    panneaux: ['11'],
    acces: ['site'],
    cout: 'the write gas, already paid for 16 hooks',
    etat: 'en_attente',
    pourquoi:
      '99 attestations are computed; **16 are actually written** on-chain. The rest is waiting ' +
      'for gas, and the gap is published rather than smoothed over.',
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
    nom: 'The site',
    pour: 'someone who wants an answer now, without installing anything',
    pourquoi:
      'because the whole corpus is in the page: 125 072 measurements encoded by columns, ' +
      '8.3 MB. You paste an address and read the result — no wallet, no account, not a single ' +
      'network request. Asynchronous judging is done on the evidence: of the 27 projects that ' +
      'won an asynchronous prize, 26 out of 27 had a LIVE demo URL in their submission. ' +
      'This is that URL, and ' +
      'it opens in five seconds.',
    prerequis: 'nothing',
    outils: [2, 3, 4, 5, 6, 7, 9, 13, 14],
  },
  {
    cle: 'extension',
    nom: 'The extension',
    pour: 'someone who already swaps, elsewhere, and will never come to our site',
    pourquoi:
      'because the right moment to know what a hook takes is not while you are searching: ' +
      'it is **three seconds before signing**, on the site where you swap. It sits between ' +
      'the page and the wallet, reads the Universal Router calldata, and returns its verdict ' +
      'before the signature. Twelve kilobytes of content script; the measurement table lives ' +
      'in its service worker and answers with no request at all — so it works even when our ' +
      'server is off.',
    prerequis: 'installing it; an API key only for the history',
    outils: [2, 6, 8, 9],
  },
  {
    cle: 'mcp',
    nom: 'The MCP server',
    pour: 'an agent, not a human',
    pourquoi:
      'because a model asked “how much does this hook take?” **invents a plausible ' +
      'number**. The MCP server gives it four tools whose descriptions say, in so many ' +
      'words, never to state a number the tool did not return — and every answer carries ' +
      'its label, its block, its size, its direction and its replay command. It reads the ' +
      '125 072 measurements from disk and answers offline: the key only decides about the history.',
    prerequis: 'Claude Desktop or any MCP client; the key for the history',
    outils: [1, 2, 3, 5, 6, 13],
  },
  {
    cle: 'x402',
    nom: 'x402 live, on Hedera',
    pour: 'an autonomous agent that has no account and does not want one',
    pourquoi:
      'because an agent does not fill in a sign-up form. It makes a request, receives a ' +
      '**402 that announces the price**, pays, and receives the measurement — 0.001 USDC, ' +
      'settled and read back on the Hedera mirror node, not on our word. The signing key is ' +
      'sealed inside a Ledger, and the agent that answers has an HCS-14 identity published on ' +
      'a topic: the caller can check **who** it is calling before paying.',
    prerequis: 'a Hedera account and some test USDC',
    outils: [1, 10, 13],
  },
  {
    cle: 'compte',
    nom: 'The account',
    pour: 'someone who uses the product more than once',
    pourquoi:
      'it adds no measurement — it opens the **surfaces**: one API key per surface, the ' +
      'downloads of the extension and of the MCP server, and the history of what they did. ' +
      'Signing in is done by wallet signature, with no password, and the subscription is ' +
      'read **on chain** rather than taken on trust.',
    prerequis: 'a wallet, and an active subscription for the keys',
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
