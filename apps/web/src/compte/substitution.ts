/**
 * LE CLIENT DE LA SUBSTITUTION. `POST /alternative`, et rien d'autre.
 *
 * Il rend ce que le serveur a dit, avec ses etats nommes intacts. Ce module ne decide RIEN :
 * ni si une porte est meilleure, ni si la transaction est envoyable. Ces deux jugements
 * vivent dans packages/guard, sur la table des 125 072 mesures, et les refaire ici en
 * produirait une seconde version qui divergerait un jour.
 *
 * LE COMPTE DES APPELS RPC EST RENDU, et l'ecran l'affiche. La route ne touche au reseau
 * qu'apres avoir verifie qu'il y a quelque chose a proposer : sur 125 072 lignes du corpus,
 * 124 704 rendent « il n'y a qu'une porte » et coutent zero requete. Afficher ce compte
 * n'est pas de la coquetterie — c'est ce qui permet de verifier que la promesse tient.
 */
// L'extension est EXPLICITE parce que ce module est lu par deux resolveurs : Vite, qui
// l'accepte des deux facons, et `node --test`, qui exige l'extension pour depouiller les
// types. Sans elle la suite de tests ne charge pas ce fichier du tout — et un test qui ne
// charge pas ne teste rien.
import { API, Refus, pasDApi } from './api.ts'

/** Les six etats de la comparaison, tels que packages/guard/src/alternative.ts les nomme. */
export type EtatAlternative =
  | 'MEILLEURE_PORTE'
  | 'PORTE_UNIQUE'
  | 'DEJA_LA_MEILLEURE'
  | 'AUTRES_NON_MESUREES'
  | 'ACTUELLE_NON_MESUREE'
  | 'POOL_INCONNU'

/** Les etats de la construction, tels que packages/guard/src/envoi.ts les nomme. */
export type EtatEnvoi =
  | 'PRET'
  | 'PAS_DE_PROPOSITION'
  | 'SANS_PLANCHER'
  | 'APPROBATION_REQUISE'
  | 'SIGNATURE_REQUISE'
  | 'NONCE_NON_LU'
  | 'ETAT_PERMIT2_INCONNU'
  | 'PERMIT_SUR_MONNAIE_NATIVE'
  | 'RELECTURE_DIVERGENTE'
  /** propre a la route : `construire: false` */
  | 'NON_DEMANDE'

export interface Porte {
  poolId: string
  poolKey: { currency0: string; currency1: string; fee: number; tickSpacing: number; hooks: string }
  hook: string
  zeroForOne: boolean
  direction: '0->1' | '1->0'
  bps: number | null
  label: string | null
  amountIn: string | null
  stored_lp_fee: number | null
  fee_is_dynamic: boolean | null
}

export interface Alternative {
  etat: EtatAlternative
  raison: string
  actuelle: Porte
  proposee: Porte | null
  economie_bps: number | null
  seuil_bps: number
  examinees: Porte[]
  calldata: string | null
  block_number: number
  chain_id: number
}

export interface Envoi {
  etat: EtatEnvoi
  raison: string
  transaction: { to: string; data: string; value: string } | null
  permit2: {
    etat: string
    raison: string
    approbation: { to: string; data: string } | null
    aSigner: unknown | null
  } | null
  monnaieEntree: string | null
  native: boolean
  amountIn: string | null
  amountOutMinimum: string | null
  cotation: string | null
  toleranceBps: number | null
  deadline: string | null
  commandes: string | null
}

export interface ReponseAlternative {
  alternative: Alternative
  envoi: Envoi
  table: { block_number: number; chain_id: number; n_measurements: number; source: string }
  /** combien d'eth_call ont ete factures pour cette reponse */
  appels_rpc: number
  lectures: { quoi: string; rejeu: string; raison: string | null }[]
  note?: string
}

export interface DemandeAlternative {
  pool_id?: string
  direction?: '0->1' | '1->0'
  amount_in?: string
  calldata?: string
  /** l'adresse qui signera : sans elle, l'etat Permit2 d'un ERC-20 n'est pas lisible */
  proprietaire?: string
  tolerance_bps?: number
  /** false : la comparaison seule, sans un octet de reseau */
  construire?: boolean
}

const RAISON_SANS_API =
  "aucune API n'est publiee pour cette version du site. La comparaison des portes vit dans le " +
  "paquet de l'extension et dans le corpus, mais la COTATION VIVANTE dont depend le plancher de " +
  'sortie demande un noeud, et il n\'y en a pas a joindre depuis ici. En local : cd apps/api && npm start'

export async function demanderAlternative(d: DemandeAlternative): Promise<ReponseAlternative> {
  if (pasDApi()) throw new Refus('api_absente', RAISON_SANS_API)
  let res: Response
  try {
    res = await fetch(`${API}/alternative`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(d),
      // Trois eth_call au pire, dont une cotation : plus large que le reste du compte.
      signal: AbortSignal.timeout(20000),
    })
  } catch (e) {
    const err = e as Error
    throw new Refus(
      'injoignable',
      err.name === 'TimeoutError' ? `${API} n'a pas repondu en 20 s` : `${API} injoignable (${err.message})`,
    )
  }
  const corps = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) {
    const detail = String(corps?.['raison'] ?? corps?.['error'] ?? `HTTP ${res.status}`)
    throw new Refus(res.status === 422 ? 'requete_invalide' : 'erreur', detail, res.status, corps)
  }
  return corps as unknown as ReponseAlternative
}

/**
 * CE QUE L'ECRAN DOIT MONTRER POUR CHAQUE ETAT.
 *
 * Une seule table, ici, pour que le composant n'invente pas de phrase. `action` dit si un
 * bouton a un sens : `null` veut dire qu'il n'y a rien a cliquer, et un bouton grise avec
 * une explication vaut mieux qu'un bouton absent — l'utilisateur sait alors qu'il n'a pas
 * rate une etape.
 */
export const AFFICHAGE: Record<
  EtatAlternative,
  { titre: string; ton: 'neutre' | 'bon' | 'attention'; action: string | null }
> = {
  MEILLEURE_PORTE: {
    titre: 'une autre porte est mesuree moins chere, a la meme taille',
    ton: 'bon',
    action: 'construire la transaction de remplacement',
  },
  PORTE_UNIQUE: {
    titre: "il n'y a qu'une porte pour cet echange",
    ton: 'neutre',
    action: null,
  },
  DEJA_LA_MEILLEURE: {
    titre: "d'autres portes existent, celle-ci est deja la moins chere",
    ton: 'bon',
    action: null,
  },
  AUTRES_NON_MESUREES: {
    titre: "d'autres portes existent, mais aucune n'est mesuree a cette taille",
    ton: 'attention',
    action: null,
  },
  ACTUELLE_NON_MESUREE: {
    titre: "cette porte n'est pas mesuree a cette taille : rien a comparer",
    ton: 'attention',
    action: null,
  },
  POOL_INCONNU: {
    titre: "ce pool n'est pas dans le corpus",
    ton: 'attention',
    action: null,
  },
}

/** Ce qu'il reste a faire, cote envoi. `null` = rien a cliquer. */
export const SUITE: Record<EtatEnvoi, string | null> = {
  PRET: 'signer et envoyer',
  PAS_DE_PROPOSITION: null,
  NON_DEMANDE: 'lire la chaine et construire',
  SANS_PLANCHER: null,
  APPROBATION_REQUISE: 'approuver le jeton vers Permit2 (une vraie transaction, une fois)',
  SIGNATURE_REQUISE: 'signer le permit (hors chaine, gratuit)',
  NONCE_NON_LU: null,
  ETAT_PERMIT2_INCONNU: null,
  PERMIT_SUR_MONNAIE_NATIVE: null,
  RELECTURE_DIVERGENTE: null,
}
