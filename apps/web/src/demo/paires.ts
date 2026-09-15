/**
 * LES PAIRES DU CORPUS, ET LES PORTES QUI LES FONT.
 *
 * Le site repond deja « par ou acheter ce jeton » (src/lib/portes.ts). Ce module-ci repond a la
 * question voisine, celle que la demonstration pose : POUR CET ECHANGE, quelles portes existent,
 * et que prend chacune ? Il ne lit que le corpus embarque — aucune requete, aucun service.
 *
 * TROIS REGLES, reprises telles quelles de packages/guard/src/alternative.ts, parce qu'un
 * classement qui les ignore fabrique l'ecart qu'il pretend mesurer :
 *
 *   1. UNE PAIRE EST ORIENTEE. Depenser de l'ETH pour obtenir de l'USDC et faire l'inverse sont
 *      deux echanges differents, et les portes de l'un ne classent pas celles de l'autre.
 *   2. ON NE CLASSE QU'A TAILLE EGALE. Le prelevement varie avec le montant dans la moitie des
 *      couples : comparer 1e12 chez l'un a 1e18 chez l'autre n'a aucun sens.
 *   3. ON NE CLASSE QUE CE QUI EST MESURE. Une porte non mesuree n'est pas une porte gratuite :
 *      elle est inconnue, et elle sort du classement au lieu d'y entrer a zero.
 *
 * CE QU'IL RENDE EN PLUS. `pairesAMontrer` ne rend pas les 8 151 paires mesurees : il rend celles
 * dont les DEUX monnaies portent un symbole lu sur la chaine, et le COMPTE de celles qu'il
 * laisse. Une paire d'adresses nues dans un menu deroulant n'apprend rien a personne, et leur
 * inventer un nom serait la faute meme que ce depot reproche au reste. La troncature se voit
 * toujours : elle n'est jamais silencieuse.
 */
import { dataset, type Label, type Row } from '../lib/dataset'

export type Sens = '0->1' | '1->0'

/** Les frais LP de slot0 sont en centiemes de bps (pips) : 3000 pips = 30 bps. */
export const lpFeeBps = (storedLpFee: number): number => storedLpFee / 100

export interface PorteMesuree {
  row: Row
  poolId: string
  hook: string
  sens: Sens
  taille: string
  /** le prelevement mesure. null = pas mesure a cette taille, JAMAIS zero par defaut. */
  bps: number | null
  label: Label
  /** les frais du pool, lus dans slot0. null = non lu. */
  lpBps: number | null
  feeDynamique: boolean
  keyFee: number
  bloc: number
}

export interface Paire {
  /** la monnaie depensee */
  entree: string
  /** la monnaie recue */
  sortie: string
  /** `entree>sortie`, en minuscules : l'identifiant du menu */
  cle: string
  /** combien de pools distincts font cet echange, toutes tailles confondues */
  nPools: number
  /** combien de pools en portent une MESURE, toutes tailles confondues */
  nPoolsMesures: number
  /** les tailles mesurees, croissantes */
  tailles: string[]
}

export const cleDe = (entree: string, sortie: string): string =>
  `${entree.toLowerCase()}>${sortie.toLowerCase()}`

const cotes = (r: Row): { entree: string; sortie: string } => ({
  entree: (r.zero_for_one ? r.currency0 : r.currency1).toLowerCase(),
  sortie: (r.zero_for_one ? r.currency1 : r.currency0).toLowerCase(),
})

const mesuree = (r: Row): boolean => r.label === 'MESURE' && typeof r.bps === 'number'

function porteDe(r: Row): PorteMesuree {
  return {
    row: r,
    poolId: r.pool_id.toLowerCase(),
    hook: r.hook.toLowerCase(),
    sens: r.zero_for_one ? '0->1' : '1->0',
    taille: r.amount_in,
    // MESURE seulement : une ligne INTERPOLE, NON_MESURABLE ou NON_COTABLE ne porte pas un
    // nombre qu'on ait le droit de classer.
    bps: mesuree(r) ? (r.bps as number) : null,
    label: r.label,
    lpBps: r.stored_lp_fee === null ? null : lpFeeBps(r.stored_lp_fee),
    feeDynamique: r.fee_is_dynamic,
    keyFee: r.key_fee,
    bloc: r.block_number,
  }
}

let memo: Paire[] | null = null

/** Toutes les paires orientees dont au moins une porte est MESUREE, les plus fournies d'abord. */
export function pairesMesurees(rows: Row[] = dataset.rows): Paire[] {
  if (memo && rows === dataset.rows) return memo
  const acc = new Map<string, { entree: string; sortie: string; pools: Set<string>; mesures: Set<string>; tailles: Set<string> }>()
  for (const r of rows) {
    const { entree, sortie } = cotes(r)
    const k = cleDe(entree, sortie)
    let e = acc.get(k)
    if (!e) {
      e = { entree, sortie, pools: new Set(), mesures: new Set(), tailles: new Set() }
      acc.set(k, e)
    }
    e.pools.add(r.pool_id.toLowerCase())
    if (mesuree(r)) {
      e.mesures.add(r.pool_id.toLowerCase())
      e.tailles.add(r.amount_in)
    }
  }
  const out: Paire[] = []
  for (const [cle, e] of acc) {
    if (e.mesures.size === 0) continue
    out.push({
      entree: e.entree,
      sortie: e.sortie,
      cle,
      nPools: e.pools.size,
      nPoolsMesures: e.mesures.size,
      tailles: [...e.tailles].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)),
    })
  }
  out.sort((a, b) => b.nPoolsMesures - a.nPoolsMesures || a.cle.localeCompare(b.cle))
  if (rows === dataset.rows) memo = out
  return out
}

/**
 * Celles qu'on propose, et le compte de celles qu'on laisse.
 *
 * `estNomme` est passe par l'appelant : la lecture des symboles vit deja dans le site, et en
 * ouvrir une seconde ici en ferait une seconde version qui divergerait un jour.
 */
export function pairesAMontrer(
  estNomme: (adresse: string) => boolean,
  toujours: string[] = [],
  rows: Row[] = dataset.rows,
): { montrees: Paire[]; restantes: number; total: number } {
  const toutes = pairesMesurees(rows)
  const garde = new Set(toujours)
  const montrees = toutes.filter(
    (p) => garde.has(p.cle) || (estNomme(p.entree) && estNomme(p.sortie)),
  )
  return { montrees, restantes: toutes.length - montrees.length, total: toutes.length }
}

export interface Classement {
  /** la taille retenue : celle ou cette paire a le plus de portes mesurees */
  taille: string | null
  /** toutes les tailles ou la paire est mesuree, pour que l'ecran en propose d'autres */
  tailles: string[]
  /** les portes mesurees a cette taille, de la moins chere a la plus chere */
  classees: PorteMesuree[]
  /** celles qui existent a cette taille sans porter de nombre : hors classement */
  horsClassement: PorteMesuree[]
  /** l'ecart entre la plus chere et la moins chere, quand il y a au moins deux mesurees */
  ecartBps: number | null
}

/**
 * Les portes de CETTE paire, a UNE taille.
 *
 * Sans `taille`, on prend celle ou la paire a le plus de portes mesurees — c'est la ou la
 * comparaison a le plus de sens. A egalite, la plus grande.
 */
export function classer(
  entree: string,
  sortie: string,
  taille?: string,
  rows: Row[] = dataset.rows,
): Classement {
  const e = entree.toLowerCase()
  const s = sortie.toLowerCase()
  const lignes = rows.filter((r) => {
    const c = cotes(r)
    return c.entree === e && c.sortie === s
  })
  if (lignes.length === 0) return { taille: null, tailles: [], classees: [], horsClassement: [], ecartBps: null }

  const parTaille = new Map<string, Row[]>()
  for (const r of lignes) {
    const l = parTaille.get(r.amount_in) ?? []
    l.push(r)
    parTaille.set(r.amount_in, l)
  }
  const tailles = [...parTaille.keys()]
    .filter((t) => parTaille.get(t)!.some(mesuree))
    .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0))

  let t = taille && parTaille.has(taille) ? taille : undefined
  if (!t) {
    let meilleure: string | null = null
    let combien = -1
    for (const candidate of tailles) {
      const n = new Set(parTaille.get(candidate)!.filter(mesuree).map((r) => r.pool_id)).size
      if (n > combien || (n === combien && meilleure !== null && BigInt(candidate) > BigInt(meilleure))) {
        combien = n
        meilleure = candidate
      }
    }
    t = meilleure ?? tailles[tailles.length - 1]
  }
  if (!t) return { taille: null, tailles, classees: [], horsClassement: [], ecartBps: null }

  const portes = parTaille.get(t)!.map(porteDe)
  const classees = portes.filter((p) => p.bps !== null).sort((a, b) => a.bps! - b.bps!)
  const horsClassement = portes.filter((p) => p.bps === null)
  const ecart =
    classees.length >= 2
      ? Math.round((classees[classees.length - 1]!.bps! - classees[0]!.bps!) * 1e4) / 1e4
      : null
  return { taille: t, tailles, classees, horsClassement, ecartBps: ecart }
}
