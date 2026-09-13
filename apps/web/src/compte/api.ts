/**
 * LE CLIENT DU COMPTE. La seule chose du front qui parle aux neuf routes du compte.
 *
 * Il existe pour que l'ecran ne fabrique jamais rien : pas de jeton reconstruit, pas de
 * message re-signe autrement, pas d'abonnement deduit d'un « on vient de payer ». Chaque
 * fonction ici rend soit ce que le serveur a dit, soit un REFUS NOMME — jamais un `null`
 * qu'un composant interpreterait comme « pas abonne ».
 *
 * DEUX AUTHENTIFICATIONS, JAMAIS MELANGEES, comme cote serveur :
 *   - le JETON DE SESSION (`authorization: Bearer`) appartient a l'humain devant le
 *     navigateur. Il ouvre la lecture du compte et la gestion des cles.
 *   - la CLE D'API (`x-tare-cle`) appartient a une machine — l'extension, le MCP. Le site ne
 *     s'en sert JAMAIS : il la delivre et l'affiche une fois, puis l'oublie.
 *
 * LE MESSAGE A SIGNER VIENT DU SERVEUR, EN ENTIER. Le client ne le reconstruit pas. C'est
 * une regle apprise ici a un cout reel : une version portait un horodatage, rebati a la
 * verification avec l'heure courante — aucune signature n'aurait jamais pu verifier, et rien
 * ne l'aurait dit.
 *
 * LE JETON N'EST PAS DANS localStorage PAR DEFAUT. `sessionStorage` s'efface a la fermeture
 * de l'onglet ; un jeton de session qui survit trois semaines dans un navigateur partage est
 * une porte ouverte. L'appelant peut choisir autrement, mais il doit le choisir.
 */

/** L'adresse de l'API. `VITE_TARE_API=https://…` au build ; repli local sinon. */
const CONFIGUREE = (import.meta.env?.['VITE_TARE_API'] as string | undefined)?.replace(/\/+$/, '')
export const API = CONFIGUREE ?? 'http://127.0.0.1:8787'
export const API_DONNEE = Boolean(CONFIGUREE)

/* ------------------------------------------------------------------ les formes */

export type Portee = 'extension' | 'mcp'
export type Source = 'site' | 'extension' | 'mcp'
export type Nature = 'analyse' | 'verdict' | 'substitution' | 'mesure'

export interface Abonnement {
  actif: boolean
  /** non nul des que quelque chose empeche de conclure a un abonnement actif */
  raison: string | null
  actif_jusqu_au?: string | null
  contrat?: string | null
  chain_id?: number | null
  verifie_le?: string | null
}

export interface CleResume {
  id: string
  nom: string
  portee: Portee
  /** les premiers caracteres, pour reconnaitre la cle sans la revoir */
  prefixe: string
  cree_le: string
  vue_le: string | null
  revoquee_le: string | null
}

export interface Compte {
  compte: { adresse: string; cree_le: string; vu_le: string }
  abonnement: Abonnement
  cles: CleResume[]
  compteurs: Record<string, number>
  telechargements: { extension: string; mcp: string; details: string } | null
  note: string | null
}

export interface Evenement {
  id: string
  source: Source
  quoi: Nature
  sujet: string | null
  detail: Record<string, unknown>
  cree_le: string
}

export interface Journal {
  lignes: Evenement[]
  /** vrai quand la liste est coupee : une liste tronquee le DIT */
  tronque?: boolean
  total?: number
}

export interface Paquet {
  disponible: boolean
  nom?: string
  octets?: number
  sha256?: string
  version?: string | null
  construit_le?: string
  contenu?: Record<string, unknown> | null
  /** quand il n'est pas construit : pourquoi, et la commande */
  raison?: string
  commande?: string
}

export interface Paquets {
  abonnement: { actif: boolean; raison: string | null }
  ouverts: boolean
  extension: Paquet
  mcp: Paquet
  note: string | null
}

/* ------------------------------------------------------------------- les refus */

/**
 * UN REFUS NOMME, jamais une exception nue.
 *
 * `genre` existe pour que l'ecran sache quoi AFFICHER sans lire un message : « abonnement
 * inactif » demande un bouton d'abonnement, « session refusee » demande une reconnexion, et
 * « api absente » ne demande rien du tout parce que ce n'est pas une panne.
 */
export type GenreRefus =
  /** aucune API publiee pour cette version du site, et la page est publique */
  | 'api_absente'
  /** le serveur n'a pas repondu, ou pas a temps */
  | 'injoignable'
  /** 401 : jeton inconnu, ferme, expire — ou cle refusee */
  | 'non_authentifie'
  /** 402 : l'abonnement n'est pas actif sur la chaine */
  | 'abonnement_inactif'
  /** 503 : le service repond mais une piece manque (base, paquet non construit) */
  | 'indisponible'
  /** 400 : la requete est mauvaise. C'est notre faute, pas celle de l'utilisateur */
  | 'requete_invalide'
  /** tout le reste */
  | 'erreur'

export class Refus extends Error {
  readonly genre: GenreRefus
  readonly statut: number | null
  /** le corps rendu par le serveur, quand il en a rendu un */
  readonly corps: Record<string, unknown> | null
  constructor(genre: GenreRefus, message: string, statut: number | null = null, corps: Record<string, unknown> | null = null) {
    super(message)
    this.name = 'Refus'
    this.genre = genre
    this.statut = statut
    this.corps = corps
  }
}

/** Au-dela, on n'attend plus : un ecran qui tourne pour toujours est un silence deguise. */
const DELAI_MS = 10000

function local(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname === '' ||
    hostname.endsWith('.local')
  )
}

/** Vrai quand il n'y a rien a joindre : repli local, page publique, rien donne au build. */
export function pasDApi(): boolean {
  if (API_DONNEE) return false
  if (typeof location === 'undefined') return false
  if (local(location.hostname)) return false
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(API)
}

const RAISON_SANS_API =
  "aucune API n'est publiee pour cette version du site : le compte, l'abonnement et les cles " +
  "demandent un serveur, et il n'y en a pas a joindre depuis ici. Ce n'est pas une panne — le " +
  'reste de cet ecran vient du paquet. En local : cd apps/api && npm start'

async function appeler<T>(
  chemin: string,
  opts: { methode?: string; jeton?: string | null; corps?: unknown } = {},
): Promise<T> {
  if (pasDApi()) throw new Refus('api_absente', RAISON_SANS_API)

  const entetes: Record<string, string> = {}
  if (opts.corps !== undefined) entetes['content-type'] = 'application/json'
  if (opts.jeton) entetes['authorization'] = `Bearer ${opts.jeton}`

  let res: Response
  try {
    res = await fetch(`${API}${chemin}`, {
      method: opts.methode ?? 'GET',
      headers: entetes,
      body: opts.corps === undefined ? undefined : JSON.stringify(opts.corps),
      signal: AbortSignal.timeout(DELAI_MS),
    })
  } catch (e) {
    const err = e as Error
    throw new Refus(
      'injoignable',
      err.name === 'TimeoutError'
        ? `${API} n'a pas repondu en ${DELAI_MS / 1000} s`
        : `${API} injoignable (${err.message})`,
    )
  }

  let corps: Record<string, unknown> | null = null
  try {
    corps = (await res.json()) as Record<string, unknown>
  } catch {
    corps = null
  }

  if (res.ok) return corps as T

  const detail = String(corps?.['detail'] ?? corps?.['raison'] ?? corps?.['error'] ?? `HTTP ${res.status}`)
  const genre: GenreRefus =
    res.status === 401
      ? 'non_authentifie'
      : res.status === 402
        ? 'abonnement_inactif'
        : res.status === 503
          ? 'indisponible'
          : res.status === 400 || res.status === 422
            ? 'requete_invalide'
            : 'erreur'
  throw new Refus(genre, detail, res.status, corps)
}

/* ---------------------------------------------------------------- le portefeuille */

/**
 * Un fournisseur EIP-1193, tel qu'un portefeuille l'expose.
 *
 * On ne depend d'aucune bibliotheque : `personal_sign` et `eth_requestAccounts` sont deux
 * appels, et une bibliotheque de connexion pese plus que tout le reste de cet ecran.
 */
export interface Fournisseur {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(evenement: string, rappel: (...a: unknown[]) => void): void
}

export interface PortefeuilleAnnonce {
  /** ce que le portefeuille dit de lui : nom, icone, rdns */
  info: { uuid: string; name: string; icon: string; rdns: string }
  provider: Fournisseur
}

/**
 * Les portefeuilles installes, par EIP-6963.
 *
 * POURQUOI PAS `window.ethereum` : avec deux portefeuilles installes, un seul gagne cette
 * variable et l'autre devient invisible. EIP-6963 est la reponse standard a ce probleme —
 * chaque portefeuille s'annonce, et l'utilisateur choisit. `window.ethereum` reste un REPLI
 * pour les portefeuilles qui n'annoncent pas encore, et il est nomme comme tel a l'ecran.
 *
 * `attente` existe parce que les annonces sont asynchrones : demander la liste au premier
 * rendu la trouve vide. On demande, on attend, on rend ce qui est arrive.
 */
export function ecouterPortefeuilles(
  aChange: (liste: PortefeuilleAnnonce[]) => void,
  attente = 350,
): () => void {
  if (typeof window === 'undefined') return () => undefined
  const vus = new Map<string, PortefeuilleAnnonce>()
  const sur = (ev: Event) => {
    const d = (ev as CustomEvent).detail as PortefeuilleAnnonce | undefined
    if (!d?.info?.uuid || typeof d.provider?.request !== 'function') return
    vus.set(d.info.uuid, d)
    aChange([...vus.values()])
  }
  window.addEventListener('eip6963:announceProvider', sur as EventListener)
  window.dispatchEvent(new Event('eip6963:requestProvider'))

  const t = setTimeout(() => {
    // Repli : un portefeuille qui n'annonce pas encore, mais qui a pose window.ethereum.
    if (vus.size === 0) {
      const w = (window as unknown as { ethereum?: Fournisseur }).ethereum
      if (w && typeof w.request === 'function') {
        vus.set('window.ethereum', {
          info: { uuid: 'window.ethereum', name: 'window.ethereum (n\'annonce pas EIP-6963)', icon: '', rdns: '' },
          provider: w,
        })
        aChange([...vus.values()])
      }
    }
  }, attente)

  return () => {
    clearTimeout(t)
    window.removeEventListener('eip6963:announceProvider', sur as EventListener)
  }
}

/* ------------------------------------------------------------------ la connexion */

export interface Session {
  jeton: string
  adresse: string
  expire_le?: string
}

/**
 * Le parcours complet : nonce -> signature -> jeton. Trois appels, et rien de devine.
 *
 * Le TEXTE signe est celui que le serveur a rendu, transmis tel quel a `personal_sign`. Le
 * reconstruire cote client marchait jusqu'au jour ou les deux reconstructions divergeaient,
 * et alors aucune signature ne verifiait plus sans qu'un seul message ne le dise.
 */
export async function connecter(fournisseur: Fournisseur): Promise<Session> {
  const comptes = (await fournisseur.request({ method: 'eth_requestAccounts' })) as string[]
  const adresse = comptes?.[0]
  if (!adresse) throw new Refus('non_authentifie', 'le portefeuille n\'a rendu aucune adresse')

  const n = await appeler<{ adresse: string; nonce: string; message: string }>('/compte/nonce', {
    methode: 'POST',
    corps: { adresse },
  })

  let signature: string
  try {
    signature = (await fournisseur.request({
      method: 'personal_sign',
      // L'ordre est [message, adresse] : inverse, MetaMask signe l'adresse comme message.
      params: [n.message, adresse],
    })) as string
  } catch (e) {
    const err = e as { code?: number; message?: string }
    if (err.code === 4001)
      throw new Refus('non_authentifie', 'signature refusee dans le portefeuille')
    throw new Refus('non_authentifie', `signature impossible : ${err.message ?? 'sans message'}`)
  }

  const s = await appeler<Session>('/compte/session', {
    methode: 'POST',
    corps: { adresse, nonce: n.nonce, signature },
  })
  return { ...s, adresse: adresse.toLowerCase() }
}


/**
 * LA MEME SESSION, MAIS SIGNEE PAR WAGMI (donc par RainbowKit).
 *
 * `connecter()` ci-dessus parle directement a un fournisseur EIP-1193 decouvert en EIP-6963.
 * Celle-ci fait exactement la meme chose — nonce, signature, session — avec une adresse deja
 * connectee et une fonction de signature fournie par wagmi. Elle existe pour que RainbowKit
 * puisse ouvrir une session SANS que le panneau ait a retrouver le fournisseur brut derriere
 * le connecteur, ce qui casserait avec WalletConnect ou la signature part sur le telephone.
 *
 * LA REGLE NE BOUGE PAS : le message vient du serveur, EN ENTIER, et on le signe tel quel.
 */
export async function connecterAvecSigneur(
  adresse: string,
  signer: (message: string) => Promise<string>,
): Promise<Session> {
  if (!adresse) throw new Refus('non_authentifie', "aucune adresse connectee")

  const n = await appeler<{ adresse: string; nonce: string; message: string }>('/compte/nonce', {
    methode: 'POST',
    corps: { adresse },
  })

  let signature: string
  try {
    signature = await signer(n.message)
  } catch (e) {
    const err = e as { code?: number; name?: string; message?: string }
    // wagmi enveloppe le refus de l'utilisateur : le code 4001 n'est pas toujours en surface.
    if (err.code === 4001 || /reject|denied|UserRejected/i.test(`${err.name} ${err.message}`))
      throw new Refus('non_authentifie', 'signature refusee dans le portefeuille')
    throw new Refus('non_authentifie', `signature impossible : ${err.message ?? 'sans message'}`)
  }

  const s = await appeler<Session>('/compte/session', {
    methode: 'POST',
    corps: { adresse, nonce: n.nonce, signature },
  })
  return { ...s, adresse: adresse.toLowerCase() }
}

export const deconnecter = (jeton: string): Promise<{ ferme: boolean }> =>
  appeler('/compte/session', { methode: 'DELETE', jeton })

/* --------------------------------------------------------------- lire son compte */

export const lireCompte = (jeton: string): Promise<Compte> => appeler('/compte', { jeton })

/** Relit l'abonnement SUR LA CHAINE et rafraichit le cache. A appeler apres un paiement. */
export const relireAbonnement = (jeton: string): Promise<{ abonnement: Abonnement; lecture: unknown }> =>
  appeler('/compte/abonnement', { methode: 'POST', jeton })

export const lireJournal = (jeton: string, opts: { limite?: number; quoi?: Nature } = {}): Promise<Journal> => {
  const q = new URLSearchParams()
  if (opts.limite !== undefined) q.set('limite', String(opts.limite))
  if (opts.quoi) q.set('quoi', opts.quoi)
  const s = q.toString()
  return appeler(`/compte/journal${s ? `?${s}` : ''}`, { jeton })
}

export const lirePaquets = (jeton: string): Promise<Paquets> => appeler('/compte/paquets', { jeton })

/* ------------------------------------------------------------------- les cles */

export interface CleNeuve {
  /** LE SECRET, rendu UNE SEULE FOIS. Ni la base ni cette page ne le reverront. */
  cle: string
  note: string
  enregistree: CleResume
}

export const creerCle = (jeton: string, portee: Portee, nom = ''): Promise<CleNeuve> =>
  appeler('/compte/cle', { methode: 'POST', jeton, corps: { portee, nom } })

export const revoquerCle = (jeton: string, id: string): Promise<{ revoquee: boolean; note: string | null }> =>
  appeler(`/compte/cle/${encodeURIComponent(id)}`, { methode: 'DELETE', jeton })

/* --------------------------------------------------------- garder la session */

const CLE_SESSION = 'tare.compte.session'

/**
 * Le jeton, garde pour la duree de l'ONGLET.
 *
 * `sessionStorage` et non `localStorage` : un jeton de session qui survit des semaines dans
 * un navigateur partage est une porte laissee ouverte, et personne ne s'en souvient. Se
 * reconnecter coute une signature, qui ne coute rien.
 */
export function garderSession(s: Session | null): void {
  try {
    if (s === null) sessionStorage.removeItem(CLE_SESSION)
    else sessionStorage.setItem(CLE_SESSION, JSON.stringify(s))
  } catch {
    /* navigation privee, stockage refuse : on continue sans garder */
  }
}

export function sessionGardee(): Session | null {
  try {
    const b = sessionStorage.getItem(CLE_SESSION)
    if (!b) return null
    const s = JSON.parse(b) as Session
    return s?.jeton && s?.adresse ? s : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------- l'abonnement */

/** Le contrat d'abonnement, tel que le build le connait. Absent = on ne propose pas de payer. */
export const CONTRAT_ABONNEMENT =
  (import.meta.env?.['VITE_ABONNEMENT_CONTRAT'] as string | undefined) ?? null
export const CHAINE_ABONNEMENT = Number(
  (import.meta.env?.['VITE_ABONNEMENT_CHAIN_ID'] as string | undefined) ?? '84532',
)

/**
 * Envoie le paiement d'abonnement, puis rend le hash. Elle NE dit PAS que c'est abonne :
 * seule la relecture on-chain le dit, et c'est `relireAbonnement` qui la demande.
 *
 * AUCUN CALLDATA. Le contrat a un `receive() external payable` qui abonne l'expediteur, et
 * c'est exactement pour ca qu'il l'a : le site n'a aucun selecteur a fabriquer.
 *
 * Cette version-ci portait `data: '0xd0dcd9e6'`, ecrit a la main comme etant `abonner()`.
 * `cast sig "abonner()"` rend `0x30ff4dce`. Un selecteur faux ne tombe pas sur `receive()`
 * — `receive()` n'est appele que si le calldata est VIDE — il tombe sur `fallback()`, que ce
 * contrat n'a pas : la transaction aurait revert et l'utilisateur aurait perdu son gaz.
 * Envoyer de la valeur sans calldata n'a rien a se tromper.
 *
 * Le montant est en wei, decide par l'appelant depuis `coutPour()` du contrat — jamais
 * devine ici : un montant en dur deviendrait faux au premier changement de prix.
 */
export async function payerAbonnement(
  fournisseur: Fournisseur,
  args: { depuis: string; montantWei: bigint; contrat?: string },
): Promise<string> {
  const contrat = args.contrat ?? CONTRAT_ABONNEMENT
  if (!contrat)
    throw new Refus(
      'indisponible',
      "aucun contrat d'abonnement n'est configure pour cette version du site " +
        "(VITE_ABONNEMENT_CONTRAT absente au build) : il n'y a rien a payer",
    )
  const hash = (await fournisseur.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from: args.depuis,
        to: contrat,
        value: '0x' + args.montantWei.toString(16),
      },
    ],
  })) as string
  return hash
}

/**
 * Le prix du contrat, LU sur la chaine : `prix()` et `duree()`, deux `eth_call`.
 *
 * L'ecran doit afficher ce que ca coute AVANT de proposer de payer, et il ne peut pas le
 * deviner : le proprietaire du contrat peut changer le prix, et un montant en dur dans le
 * paquet publie deviendrait faux sans que rien ne le dise. Un `null` ici n'est pas « gratuit
 * » : c'est « non lu », et l'ecran doit alors refuser de proposer le paiement.
 */
export async function lirePrixAbonnement(
  fournisseur: Fournisseur,
  contrat = CONTRAT_ABONNEMENT,
): Promise<{ prixWei: bigint; dureeS: bigint } | { raison: string }> {
  if (!contrat)
    return {
      raison:
        "aucun contrat d'abonnement n'est configure pour cette version du site " +
        '(VITE_ABONNEMENT_CONTRAT absente au build)',
    }
  // Les deux selecteurs des getters publics.
  //
  // Ces deux valeurs-ci ont ete VERIFIEES : `cast sig "prix()"` -> 0xc65e9c79 et
  // `cast sig "duree()"` -> 0x541a629d, puis relues contre le contrat deploye sur un anvil
  // local. La version precedente en portait deux autres, inventees, sous un commentaire qui
  // affirmait qu'elles etaient verifiees — un `eth_call` sur un mauvais selecteur rend `0x`,
  // que ce code aurait lu comme « le contrat n'est pas deploye la ». Une affirmation de
  // verification non faite est pire qu'une valeur fausse : elle empeche de la chercher.
  const appels = { prix: '0xc65e9c79', duree: '0x541a629d' }
  try {
    const [p, d] = await Promise.all(
      [appels.prix, appels.duree].map((data) =>
        fournisseur.request({ method: 'eth_call', params: [{ to: contrat, data }, 'latest'] }),
      ),
    )
    if (typeof p !== 'string' || typeof d !== 'string' || p === '0x' || d === '0x')
      return { raison: `aucun code a ${contrat} sur cette chaine : le contrat n'y est pas deploye` }
    const prixWei = BigInt(p)
    const dureeS = BigInt(d)
    if (prixWei === 0n || dureeS === 0n)
      return { raison: 'le contrat rend un prix ou une duree nuls : il n\'est pas initialise' }
    return { prixWei, dureeS }
  } catch (e) {
    return { raison: `lecture du prix impossible : ${(e as Error).message.slice(0, 120)}` }
  }
}
