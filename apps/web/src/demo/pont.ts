/**
 * LE PONT : le fork, l'appareil, le portefeuille. Trois dehors, et aucun n'est suppose.
 *
 * Ce module ne rend JAMAIS d'exception a l'ecran. Chaque appel rend soit ce que le service a
 * dit, soit un REFUS NOMME — `{ refus, raison }` — que la page affiche tel quel. C'est la
 * regle du reste du site (voir ../compte/api.ts) : un silence rendu comme un chargement est
 * le meme mensonge qu'un silence rendu comme un zero.
 *
 * Trois choses en particulier :
 *
 *   1. AUCUNE CAPTURE N'EST REJOUEE. L'ecran de l'appareil est un PNG servi en direct par
 *      Speculos. S'il ne charge pas, la page dit « device screen unavailable » et ne montre
 *      rien : une capture enregistree ferait passer un enregistrement pour un direct, ce qui
 *      est exactement ce qu'une demonstration ne doit pas faire.
 *   2. LE PONT PEUT NE PAS EXISTER. Le service tourne a cote du fork ; si le DNS ne resout
 *      pas encore, la page reste lisible — le corpus, le decodage du calldata et la
 *      comparaison des portes n'ont besoin de personne.
 *   3. LE RESEAU DU FORK S'AJOUTE DEPUIS LA PAGE. `wallet_addEthereumChain` puis
 *      `wallet_switchEthereumChain` : on n'ouvre pas les reglages de MetaMask devant un jury.
 */

/** L'adresse du service de demonstration. `VITE_DEMO_PONT=https://…` au build. */
export const PONT =
  ((import.meta.env?.['VITE_DEMO_PONT'] as string | undefined) ?? 'https://demo.tare-hooks.tech').replace(
    /\/+$/,
    '',
  )

/** L'adresse de l'appareil Ledger emule. `VITE_DEMO_SPECULOS=https://…` au build. */
export const SPECULOS =
  (
    (import.meta.env?.['VITE_DEMO_SPECULOS'] as string | undefined) ?? 'https://speculos.tare-hooks.tech'
  ).replace(/\/+$/, '')

/**
 * Au-dela, on n'attend plus. Un ecran qui tourne pour toujours est un silence deguise.
 *
 * Ce delai-la vaut pour les routes qui LISENT : l'etat du fork, les soldes, la preparation.
 * Elles repondent en moins d'une seconde, et un silence de douze secondes y est deja une panne.
 */
const DELAI_MS = 12000

/**
 * LE DELAI DE L'APPAREIL — quatre minutes, et ce n'est pas de la prudence.
 *
 * `/demo/approuver` ne rend la main que lorsque l'HUMAIN a tranche sur le Ledger. Faire
 * defiler les champs du rapport EIP-712 demande 46 appuis : mesure faite, entre 19,7 et
 * 36,4 secondes quand c'est une machine qui appuie, trois a cinq fois plus quand c'est une
 * main. Sous les douze secondes des autres routes, la page abandonnait TOUJOURS — un
 * `net::ERR_ABORTED`, puis « did not answer in 12 s » en rouge, pendant que l'appareil
 * attendait toujours. Le delai doit couvrir le geste, pas la requete.
 */
const DELAI_APPAREIL_MS = 240000

export interface Refus {
  refus: 'injoignable' | 'expire' | 'erreur' | 'refuse'
  raison: string
  /** le code rendu par le portefeuille ou par l'appareil, quand il y en a un */
  code?: number
}

/**
 * UN REFUS DU PONT, et pas autre chose.
 *
 * Le test de `'refus' in x` seul ne suffit pas : `/demo/approuver` rend `{ refus: 4001 }` quand
 * l'HUMAIN a dit non sur l'appareil, et ce n'est pas une panne du pont — c'est la reponse que
 * la demonstration vient chercher. La confondre avec un refus de transport faisait disparaitre
 * le « 4001, rien n'est parti » de l'ecran. Le genre d'un refus de transport est une CHAINE ;
 * le code d'un refus humain est un NOMBRE.
 */
export const estRefus = (x: unknown): x is Refus =>
  typeof x === 'object' &&
  x !== null &&
  typeof (x as Record<string, unknown>)['refus'] === 'string'

async function appeler<T>(chemin: string, corps?: unknown, delai = DELAI_MS): Promise<T | Refus> {
  let res: Response
  try {
    res = await fetch(`${PONT}${chemin}`, {
      method: corps === undefined ? 'GET' : 'POST',
      headers: corps === undefined ? undefined : { 'content-type': 'application/json' },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      signal: AbortSignal.timeout(delai),
    })
  } catch (e) {
    const err = e as Error
    return err.name === 'TimeoutError'
      ? { refus: 'expire', raison: `${PONT}${chemin} did not answer in ${delai / 1000} s` }
      : { refus: 'injoignable', raison: `${PONT} unreachable (${err.message})` }
  }
  const corpsRendu = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok)
    return {
      refus: 'erreur',
      // Le service nomme ses refus `erreur` et les motive par `motif`. On lit les deux, et on
      // garde `raison` pour les autres. Un `HTTP 502` seul ne dirait pas ce qui manque.
      raison: String(
        corpsRendu?.['motif'] ??
          corpsRendu?.['raison'] ??
          corpsRendu?.['erreur'] ??
          corpsRendu?.['error'] ??
          `HTTP ${res.status}`,
      ),
    }
  if (corpsRendu === null)
    return { refus: 'erreur', raison: `${chemin} answered ${res.status} with no JSON body` }
  return corpsRendu as T
}

/* ------------------------------------------------------- ce que le service rend */

/**
 * Un pool, un sens, une taille, et ce que le corpus en dit. Les cinq premiers champs sont le
 * contrat ; les suivants sont ce que le service ajoute pour rendre le chiffre verifiable, et
 * ils sont optionnels — l'ecran ne les exige jamais.
 */
export interface PorteDuService {
  pool_id: string
  hook: string
  /** null quand le corpus ne mesure pas ce point. `motif` dit alors pourquoi. Jamais zero. */
  bps: number | null
  taille_wei: string
  sens: string
  etiquette?: string
  motif?: string | null
  monnaie_entree?: string
  monnaie_sortie?: string
  block_number?: number
  chain_id?: number
  rejeu?: string
}

/**
 * Une divergence entre ce que la demo ANNONCE et ce que le corpus MESURE.
 *
 * Le service les publie au lieu de trancher en silence. Les afficher n'est pas de la modestie :
 * c'est la seule facon qu'un jury puisse verifier que le chiffre montre est celui du corpus et
 * non celui du scenario.
 */
export interface Divergence {
  acte: string
  champ: string
  annonce: string
  corpus: string
  consequence: string
}

export interface EtatDemo {
  /** `chain_id` et `block_number` sont nuls quand le fork n'a pas repondu : `motif` le dit. */
  fork: { chain_id: number | null; block_number: number | null; rpc: string; motif?: string | null }
  speculos: { joignable: boolean; ecran?: string | null; api?: string; chemin?: string }
  snapshot: string | number | null
  corpus?: {
    block_number: number
    chain_id: number
    n_measurements: number
    n_hooks: number
    n_pools: number
    stub_hash: string | null
    engine_ver: string | null
  }
  divergences?: Divergence[]
}

export interface TransactionPrete {
  to: string
  data: string
  value: string
}

export interface Soldes {
  eth_wei: string
  /** null quand le contrat n'a pas rendu un mot exploitable. `motif` le dit. Jamais zero. */
  usdc: string | null
  motif?: string
}

export interface Preparation {
  snapshot: string | number | null
  /** la transaction du swap d'ORIGINE : celle qui passe par la porte actuelle */
  transaction: TransactionPrete
  porte: PorteDuService
  soldes: Soldes
  /** au-dela du contrat, quand le service les rend : */
  acte?: string
  /** l'etat nomme de la construction, du vocabulaire d'envoi.ts */
  etat_transaction?: string
  motif?: string | null
  cotation?: string | null
  plancher?: string | null
  tolerance_bps?: number | null
  echeance?: string | null
  meilleure_porte?: PorteDuService | null
  economie_bps?: number | null
  etat_alternative?: string
  /** LA TRANSACTION DE REMPLACEMENT : construite, rendue, jamais envoyee */
  transaction_remplacement?: TransactionPrete | null
}

export interface Approbation {
  signature?: string
  /** le code EIP-1193 d'un refus humain, quand l'appareil a rendu « non » */
  refus?: number
  raison?: string
  /** combien d'ecrans l'appareil a reellement rendus */
  ecrans?: number
  source?: string
  primaryType?: string
  champs?: string[]
}

export const lireEtat = (): Promise<EtatDemo | Refus> => appeler<EtatDemo>('/demo/etat')

export const preparer = (adresse: string, acte: 'stop' | 'substitution'): Promise<Preparation | Refus> =>
  appeler<Preparation>('/demo/preparer', { adresse, acte })

/**
 * Envoie le rapport a l'appareil et ATTEND LA MAIN HUMAINE. Quatre minutes, pas douze
 * secondes : voir DELAI_APPAREIL_MS. C'est la seule route de ce module qui attende quelqu'un.
 */
export const approuver = (acte: 'stop' | 'substitution', verdict?: unknown): Promise<Approbation | Refus> =>
  appeler<Approbation>(
    '/demo/approuver',
    verdict === undefined ? { acte } : { acte, verdict },
    DELAI_APPAREIL_MS,
  )

/** Publie pour que l'ecran puisse dire combien de temps il accepte d'attendre. */
export const DELAI_APPAREIL_S = DELAI_APPAREIL_MS / 1000

export const revenir = (): Promise<{ ok: boolean; block_number?: number } | Refus> =>
  appeler<{ ok: boolean; block_number?: number }>('/demo/revenir', {})

export const lireSoldes = (adresse: string): Promise<Soldes | Refus> =>
  appeler<Soldes>(`/demo/soldes?adresse=${encodeURIComponent(adresse)}`)

/* ---------------------------------------------------------------- l'appareil */

/** L'URL du PNG de l'ecran. Le parametre coupe le cache : sans lui l'image se fige. */
export const urlEcran = (jeton: number): string => `${SPECULOS}/screenshot?t=${jeton}`

export type Bouton = 'left' | 'right' | 'both'

/**
 * Un appui sur un bouton de l'appareil. Speculos attend `press-and-release` : sans action,
 * le bouton reste enfonce et l'ecran ne bouge plus.
 */
export async function appuyer(bouton: Bouton): Promise<{ ok: true } | Refus> {
  try {
    const res = await fetch(`${SPECULOS}/button/${bouton}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'press-and-release' }),
      signal: AbortSignal.timeout(DELAI_MS),
    })
    if (!res.ok) return { refus: 'erreur', raison: `${SPECULOS}/button/${bouton} answered HTTP ${res.status}` }
    return { ok: true }
  } catch (e) {
    const err = e as Error
    return err.name === 'TimeoutError'
      ? { refus: 'expire', raison: `the device did not answer in ${DELAI_MS / 1000} s` }
      : { refus: 'injoignable', raison: `device unreachable (${err.message})` }
  }
}

/* -------------------------------------------------------------- le portefeuille */

export interface Fournisseur {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

/** Le code EIP-1193 d'un refus humain. Ce n'est pas une panne : c'est une reponse. */
export const CODE_REFUS_UTILISATEUR = 4001

export const hexChain = (id: number): string => '0x' + id.toString(16)

/**
 * Ajoute le reseau du fork et bascule dessus.
 *
 * `wallet_addEthereumChain` echoue quand la chaine existe deja avec une autre URL : on tente
 * donc la bascule seule en second, et on rend le refus tel quel si les deux echouent. Rien
 * n'est suppose reussi.
 */
export async function ajouterEtBasculer(
  f: Fournisseur,
  fork: { chain_id: number | null; rpc: string },
): Promise<{ ok: true } | Refus> {
  if (fork.chain_id === null)
    return {
      refus: 'erreur',
      raison: 'the bridge has not published a chain id: the fork did not answer, and a chain id guessed here would be a lie',
    }
  const chainId = hexChain(fork.chain_id)
  try {
    await f.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId,
          chainName: `TARE demo fork (chain ${fork.chain_id})`,
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [fork.rpc],
        },
      ],
    })
  } catch (e) {
    const err = e as { code?: number; message?: string }
    if (err.code === CODE_REFUS_UTILISATEUR)
      return { refus: 'refuse', raison: 'declined in the wallet', code: CODE_REFUS_UTILISATEUR }
    // La chaine peut deja exister : on ne s'arrete pas la, on tente la bascule.
  }
  try {
    await f.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
    return { ok: true }
  } catch (e) {
    const err = e as { code?: number; message?: string }
    return {
      refus: err.code === CODE_REFUS_UTILISATEUR ? 'refuse' : 'erreur',
      raison: err.message ?? 'the wallet refused to switch network',
      ...(typeof err.code === 'number' ? { code: err.code } : {}),
    }
  }
}

export async function comptes(f: Fournisseur): Promise<string[] | Refus> {
  try {
    const c = (await f.request({ method: 'eth_requestAccounts' })) as string[]
    return Array.isArray(c) ? c : []
  } catch (e) {
    const err = e as { code?: number; message?: string }
    return {
      refus: err.code === CODE_REFUS_UTILISATEUR ? 'refuse' : 'erreur',
      raison: err.message ?? 'the wallet returned no address',
      ...(typeof err.code === 'number' ? { code: err.code } : {}),
    }
  }
}

export async function envoyer(
  f: Fournisseur,
  de: string,
  tx: TransactionPrete,
): Promise<{ hash: string } | Refus> {
  try {
    const hash = (await f.request({
      method: 'eth_sendTransaction',
      params: [{ from: de, to: tx.to, data: tx.data, value: tx.value }],
    })) as string
    return { hash }
  } catch (e) {
    const err = e as { code?: number; message?: string }
    return {
      refus: err.code === CODE_REFUS_UTILISATEUR ? 'refuse' : 'erreur',
      raison:
        err.code === CODE_REFUS_UTILISATEUR
          ? 'declined in the wallet. That is an answer, not a failure.'
          : (err.message ?? 'the wallet could not send'),
      ...(typeof err.code === 'number' ? { code: err.code } : {}),
    }
  }
}

export interface Recu {
  transactionHash: string
  blockNumber: string
  status: string
  gasUsed: string
}

/**
 * Le recu, relu sur la chaine. `null` veut dire « pas encore mine », jamais « echoue » : la
 * page attend, et elle dit qu'elle attend.
 */
export async function recu(f: Fournisseur, hash: string): Promise<Recu | null | Refus> {
  try {
    const r = (await f.request({ method: 'eth_getTransactionReceipt', params: [hash] })) as Recu | null
    return r
  } catch (e) {
    return { refus: 'erreur', raison: (e as Error).message }
  }
}
