/**
 * LES DEUX ACTES, DERIVES DU CORPUS — jamais ecrits.
 *
 * La page de demonstration raconte deux histoires. Aucune des deux n'est choisie a la main :
 * elles sont CHERCHEES dans les 125 072 mesures embarquees, par un critere qu'on peut relire.
 *
 *   acte 1 « ne signe pas »  = le plus gros prelevement MESURE de tout le corpus.
 *   acte 2 « il y a mieux »  = pour l'echange ETH -> USDC, la taille ou l'ecart entre la porte
 *                              la plus chere et la moins chere, toutes deux MESUREES, est le
 *                              plus grand.
 *
 * POURQUOI CA COMPTE. Une demonstration dont les deux exemples sont epingles dans le code
 * cesse d'etre vraie des le balayage suivant, sans que rien ne le dise — et c'est exactement
 * la faute que tout le reste du depot refuse. Ici, si le corpus change, la scene change avec
 * lui ; si le corpus n'a plus de couple substituable, `substitution` rend null et l'ecran le
 * dit au lieu d'afficher une histoire perimee.
 *
 * DEUX REGLES DURES, reprises de packages/guard/src/alternative.ts :
 *   - on ne compare que des lignes MESUREES (une porte non mesuree n'est pas moins chere :
 *     elle est inconnue) ;
 *   - a la MEME TAILLE et dans les MEMES MONNAIES, dans le MEME SENS.
 */
import { dataset, type Row } from '../lib/dataset'
import { MONNAIES_DE_COTATION } from '../lib/exit'
import { encodeUniversalRouterExactInSingle, UNIVERSAL_ROUTER_BASE, ZERO_ADDRESS } from './garde.mjs'
import type { PoolKey } from './garde.mjs'

export type Direction = '0->1' | '1->0'

/** Une porte du corpus, avec la ligne qui la mesure. Rien n'est recalcule ici. */
export interface Porte {
  row: Row
  poolId: string
  hook: string
  poolKey: PoolKey
  direction: Direction
  amountIn: string
  /** le prelevement mesure, en points de base. null quand la ligne ne porte pas de nombre. */
  bps: number | null
  entree: string
  sortie: string
  /** le nom de la monnaie depensee quand c'est une monnaie de cotation, sinon null */
  entreeNom: string | null
  sortieNom: string | null
}

export interface Acte {
  /** le nom que le service de demonstration donne a cet acte */
  cle: 'stop' | 'substitution'
  actuelle: Porte
  /** la porte de remplacement, quand le corpus en montre une moins chere a la meme taille */
  proposee: Porte | null
  /** l'ecart mesure entre les deux, en points de base */
  ecartBps: number | null
  /** le calldata qu'un dapp enverrait a l'Universal Router pour CETTE porte */
  calldata: string
  routeur: string
  /** la valeur jointe : le montant en wei quand la monnaie depensee est l'ETH natif */
  value: string
  /** les autres portes du corpus qui font le meme echange a la meme taille */
  soeurs: Porte[]
}

export const cleDe = (r: Row): Direction => (r.zero_for_one ? '0->1' : '1->0')

export function poolKeyDe(r: Row): PoolKey {
  return {
    currency0: r.currency0.toLowerCase(),
    currency1: r.currency1.toLowerCase(),
    fee: r.key_fee,
    tickSpacing: r.tick_spacing,
    hooks: r.hook.toLowerCase(),
  }
}

export function porteDe(r: Row): Porte {
  const dir = cleDe(r)
  const c0 = r.currency0.toLowerCase()
  const c1 = r.currency1.toLowerCase()
  const entree = dir === '0->1' ? c0 : c1
  const sortie = dir === '0->1' ? c1 : c0
  return {
    row: r,
    poolId: r.pool_id.toLowerCase(),
    hook: r.hook.toLowerCase(),
    poolKey: poolKeyDe(r),
    direction: dir,
    amountIn: r.amount_in,
    bps: r.label === 'MESURE' && typeof r.bps === 'number' ? r.bps : null,
    entree,
    sortie,
    entreeNom: MONNAIES_DE_COTATION[entree] ?? null,
    sortieNom: MONNAIES_DE_COTATION[sortie] ?? null,
  }
}

const mesuree = (r: Row): boolean => r.label === 'MESURE' && typeof r.bps === 'number'

/** Ce que ce swap depense et ce qu'il recoit, dans le sens que la ligne a mesure. */
function cotes(r: Row): { entree: string; sortie: string } {
  const c0 = r.currency0.toLowerCase()
  const c1 = r.currency1.toLowerCase()
  return r.zero_for_one ? { entree: c0, sortie: c1 } : { entree: c1, sortie: c0 }
}

/**
 * LE PIRE PRELEVEMENT MESURE DU CORPUS.
 *
 * Il n'y a rien a choisir : c'est un maximum. Si deux lignes etaient a egalite, la premiere
 * rencontree gagne — elles prendraient le meme, et l'ecran citerait celle qu'il montre.
 */
export function pirePorte(rows: Row[] = dataset.rows): Row | null {
  let pire: Row | null = null
  for (const r of rows) {
    if (!mesuree(r)) continue
    if (pire === null || r.bps! > pire.bps!) pire = r
  }
  return pire
}

/**
 * LE PLUS GRAND ECART MESURE, pour un echange donne.
 *
 * On groupe par TAILLE, parce que le prelevement varie avec le montant dans la moitie des
 * couples : comparer 1e12 chez l'un a 1e18 chez l'autre fabriquerait un ecart qui n'existe
 * pas. Dans chaque groupe, il faut au moins deux portes MESUREES — sinon il n'y a pas de
 * comparaison, seulement une mesure et un inconnu.
 */
export function plusGrandEcart(
  entreeVoulue: string,
  sortieVoulue: string,
  rows: Row[] = dataset.rows,
): { actuelle: Row; proposee: Row; soeurs: Row[] } | null {
  const e = entreeVoulue.toLowerCase()
  const s = sortieVoulue.toLowerCase()
  const parTaille = new Map<string, Row[]>()
  for (const r of rows) {
    const c = cotes(r)
    if (c.entree !== e || c.sortie !== s) continue
    const l = parTaille.get(r.amount_in) ?? []
    l.push(r)
    parTaille.set(r.amount_in, l)
  }
  let meilleur: { actuelle: Row; proposee: Row; soeurs: Row[] } | null = null
  let ecartMax = 0
  for (const lignes of parTaille.values()) {
    const m = lignes.filter(mesuree)
    if (m.length < 2) continue
    const chere = m.reduce((a, b) => (b.bps! > a.bps! ? b : a))
    const basse = m.reduce((a, b) => (b.bps! < a.bps! ? b : a))
    const ecart = chere.bps! - basse.bps!
    if (ecart > ecartMax) {
      ecartMax = ecart
      meilleur = {
        actuelle: chere,
        proposee: basse,
        soeurs: lignes.filter((x) => x.pool_id !== chere.pool_id),
      }
    }
  }
  return meilleur
}

/** Le calldata d'un `execute` d'Universal Router pour CETTE porte, a CETTE taille. */
export function calldataDe(p: Porte): string {
  return encodeUniversalRouterExactInSingle([
    { poolKey: p.poolKey, zeroForOne: p.direction === '0->1', amountIn: BigInt(p.amountIn) },
  ])
}

/** La valeur jointe : le montant quand on depense l'ETH natif, zero sinon. */
export const valeurDe = (p: Porte): string =>
  p.entree === ZERO_ADDRESS ? '0x' + BigInt(p.amountIn).toString(16) : '0x0'

function acteDe(
  cle: Acte['cle'],
  actuelle: Row,
  proposee: Row | null,
  soeurs: Row[],
): Acte {
  const a = porteDe(actuelle)
  const p = proposee ? porteDe(proposee) : null
  return {
    cle,
    actuelle: a,
    proposee: p,
    ecartBps:
      a.bps !== null && p?.bps !== null && p !== null ? Number((a.bps - p.bps!).toFixed(4)) : null,
    calldata: calldataDe(a),
    routeur: UNIVERSAL_ROUTER_BASE,
    value: valeurDe(a),
    soeurs: soeurs.map(porteDe),
  }
}

/** L'ETH natif et l'USDC de Base, tels que src/lib/exit.ts les nomme deja. */
export const ETH_NATIF = ZERO_ADDRESS
export const USDC_BASE = Object.keys(MONNAIES_DE_COTATION).find(
  (a) => MONNAIES_DE_COTATION[a] === 'USDC',
)!

/** L'acte 1, ou null si le corpus ne porte aucune mesure chiffree. */
export function acteStop(rows: Row[] = dataset.rows): Acte | null {
  const pire = pirePorte(rows)
  if (!pire) return null
  const c = cotes(pire)
  const autres = rows.filter((r) => {
    const x = cotes(r)
    return x.entree === c.entree && x.sortie === c.sortie && r.pool_id !== pire.pool_id
  })
  return acteDe('stop', pire, null, autres)
}

/** L'acte 2, ou null si aucun echange ETH -> USDC n'a deux portes mesurees a la meme taille. */
export function acteSubstitution(rows: Row[] = dataset.rows): Acte | null {
  const t = plusGrandEcart(ETH_NATIF, USDC_BASE, rows)
  if (!t) return null
  return acteDe('substitution', t.actuelle, t.proposee, t.soeurs)
}
