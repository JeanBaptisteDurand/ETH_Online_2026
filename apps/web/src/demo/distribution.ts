/**
 * CE QUE PRENNENT LES HOOKS, SUR TOUT LE CORPUS — et non ce que prend le pire d'entre eux.
 *
 * POURQUOI CE FICHIER EXISTE. La premiere version de la page de demonstration ouvrait sur le
 * hook qui prend 9 999,53 bps. C'est une ligne sur 125 072, sur un ERC-20 que personne ne
 * detient : mettre l'exception en titre, c'est presenter la queue comme la norme — exactement
 * ce que ce projet reproche aux tableaux de bord qu'il remplace. Un instrument qui exagere
 * une fois ne se relit plus jamais.
 *
 * Ce module calcule donc la DISTRIBUTION, depuis le corpus embarque et rien d'autre. Elle
 * porte la these toute seule : la mediane est a 100 bps — un pour cent de ce que vous
 * echangez — et neuf swaps mesures sur dix passent par une porte qui prend plus que les frais
 * du pool. L'extreme reste publie, a sa place : un point de la queue.
 *
 * TROIS REGLES.
 *
 *   1. SEULES LES LIGNES QUI PORTENT UN NOMBRE ENTRENT. Une ligne NON_MESURABLE ou NON_COTABLE
 *      n'est pas une ligne a zero : elle est inconnue, et la compter comme nulle ferait baisser
 *      toutes les parts. Le denominateur est publie a cote de chaque part, pour qu'on puisse le
 *      verifier.
 *   2. LES CENTILES SE CALCULENT COMME CEUX DE LA GARDE. Meme methode que
 *      packages/guard/scripts/build-table.mjs — `v[floor(n*q/100)]` — pour que le 90e centile
 *      affiche ici soit EXACTEMENT le seuil `warn` que la garde applique. Deux methodes
 *      donneraient deux chiffres, et le lecteur ne saurait pas lequel croire.
 *   3. LES TRANCHES SONT CELLES DE LA RAMPE DU SITE (src/lib/ramp.ts), pas une seconde echelle
 *      inventee pour cette page. Sept paliers logarithmiques, les memes qui colorent le
 *      tableau de l'instrument.
 *
 * CE QU'IL NE CACHE PAS. 51 lignes portent une valeur NEGATIVE — un hook qui rend plus que le
 * pool sans lui. `palierOf` les range avec les zeros, parce que la rampe n'a pas de palier en
 * dessous de zero ; elles sont donc comptees a part et affichees a part. Les taire aurait ete
 * le meme geste que de taire la queue.
 */
import { dataset, type Row } from '../lib/dataset'
import { PALIERS, palierOf, type Palier } from '../lib/ramp'

/** Un pour cent, exprime en points de base. Une UNITE, pas une mesure. */
export const POURCENT_EN_BPS = 100

/**
 * LA MOITIE, exprimee en points de base — cinquante pour cent.
 *
 * C'est le seuil qui nomme la QUEUE, et il est choisi pour se lire sans glossaire : « ce hook
 * prend plus de la moitie de ce que tu echanges ». Un « 5 000 bps » ecrit a la main aurait ete
 * un chiffre rond deguise en frontiere ; une moitie est une unite, et tout le monde sait ce
 * qu'elle vaut.
 */
export const MOITIE_EN_BPS = 50 * POURCENT_EN_BPS

/** Les frais LP de slot0 sont en centiemes de bps (pips) : 3000 pips = 30 bps. */
export const lpFeeBps = (storedLpFee: number): number => storedLpFee / 100

export interface Tranche {
  palier: Palier
  /** le domaine, ecrit comme la rampe du site l'ecrit */
  domain: string
  n: number
  /** la part du total, entre 0 et 1 */
  part: number
  /** la part cumulee jusqu'a la fin de cette tranche, entre 0 et 1 */
  cumul: number
}

export interface Part {
  /** le seuil compare, en bps */
  bps: number
  n: number
  part: number
}

export interface Distribution {
  /** les lignes MESUREES qui portent un nombre : le denominateur de toutes les parts */
  n: number
  /** toutes les lignes du corpus, chiffrees ou non */
  nLignes: number
  /** celles qui n'ont pas de nombre : ni comptees, ni oubliees */
  nSansNombre: number
  mediane: number
  moyenne: number
  p90: number
  p95: number
  p99: number
  max: number
  min: number
  /** la ligne qui porte le maximum — celle que « see the tail » ouvre */
  maxLigne: Row
  tranches: Tranche[]
  /** celles qui ne prennent exactement rien */
  zero: Part
  /** celles qui rendent : un hook peut aussi donner */
  negatives: Part
  /** la part des lignes qui prennent STRICTEMENT plus que `bps` */
  auDessusDe(bps: number): Part
}

let memo: Distribution | null = null

export function distribution(rows: Row[] = dataset.rows): Distribution {
  if (memo && rows === dataset.rows) return memo

  const chiffrees: Row[] = []
  for (const r of rows) if (r.label === 'MESURE' && typeof r.bps === 'number') chiffrees.push(r)
  const v = chiffrees.map((r) => r.bps as number).sort((a, b) => a - b)
  const n = v.length

  // MEME METHODE QUE LA GARDE. Changer d'estimateur ici ferait diverger le 90e centile
  // affiche du seuil `warn` reellement applique par verdict.ts.
  const c = (q: number): number => (n ? v[Math.min(n - 1, Math.floor((n * q) / 100))]! : 0)

  const parPalier = new Map<Palier, number>()
  for (const r of chiffrees) {
    const p = palierOf(r.bps)
    if (p === null) continue
    parPalier.set(p, (parPalier.get(p) ?? 0) + 1)
  }
  let cumul = 0
  const tranches: Tranche[] = PALIERS.map(({ palier, domain }) => {
    const k = parPalier.get(palier) ?? 0
    cumul += k
    return { palier, domain, n: k, part: n ? k / n : 0, cumul: n ? cumul / n : 0 }
  })

  const compte = (garde: (x: number) => boolean): number => {
    let k = 0
    for (const x of v) if (garde(x)) k += 1
    return k
  }
  const zeroN = compte((x) => x === 0)
  const negN = compte((x) => x < 0)

  // Le maximum, et LA LIGNE qui le porte : un chiffre extreme sans son pool ni son bloc ne
  // serait pas verifiable, et c'est precisement ce qu'on reproche a la queue mise en titre.
  let maxLigne = chiffrees[0]!
  for (const r of chiffrees) if ((r.bps as number) > (maxLigne.bps as number)) maxLigne = r

  const d: Distribution = {
    n,
    nLignes: rows.length,
    nSansNombre: rows.length - n,
    mediane: c(50),
    moyenne: n ? v.reduce((a, b) => a + b, 0) / n : 0,
    p90: c(90),
    p95: c(95),
    p99: c(99),
    max: v[n - 1] ?? 0,
    min: v[0] ?? 0,
    maxLigne,
    tranches,
    zero: { bps: 0, n: zeroN, part: n ? zeroN / n : 0 },
    negatives: { bps: 0, n: negN, part: n ? negN / n : 0 },
    auDessusDe(bps: number): Part {
      const k = compte((x) => x > bps)
      return { bps, n: k, part: n ? k / n : 0 }
    },
  }
  if (rows === dataset.rows) memo = d
  return d
}
