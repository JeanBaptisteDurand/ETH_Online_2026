// LE TEST DE SORTIE, DANS LE NAVIGATEUR.
//
// Portage exact de apps/api/src/exit.ts. Les deux doivent rendre le meme nombre sur les memes
// lignes : le serveur repond a une API, celui-ci fait tourner l'ecran SANS serveur du tout —
// le jeu de mesures est embarque, donc la page fonctionne sur un hebergement statique, et deux
// visiteurs simultanes ne peuvent pas se gener.
//
// Ce que ce nombre EST : la composition des deux prelevements MESURES — achat puis revente — sur
// le meme pool, au meme bloc, frais LP compris.
//
// Ce qu'il N'EST PAS : un aller-retour execute. L'impact de prix du premier echange sur le
// second est ignore, et la taille de revente est inconnue (on sait ce qu'on met, pas combien de
// jetons on obtient). Le prelevement de revente est donc BORNE, d'ou un INTERVALLE et jamais un
// nombre unique quand la revente varie.
//
// Et si un seul sens est mesure : pas de reponse. L'autre sens n'est pas gratuit, il est inconnu,
// et le composer avec zero rendrait un nombre faux ET rassurant.

/** Les etiquettes du jeu embarque sont en francais (voir scripts/build-dataset.mjs). */
export const MESURE = 'MESURE'

export interface Ligne {
  currency0: string
  currency1: string
  zero_for_one: boolean
  amount_in: string
  bps: number | null
  stored_lp_fee: number | null
  label: string
  pool_id: string
  hook: string
  block_number: number
}

export interface Cote {
  amountIn: string
  totalBps: number
  hookBps: number
  lpBps: number
}

export interface PointSortie {
  amountIn: string
  gardeMin: number
  gardeMax: number
  exact: boolean
  achat: Cote
  reventePire: Cote
  reventeMeilleure: Cote
}

export interface TestSortie {
  ok: true
  token: string
  poolId: string
  hook: string
  blockNumber: number
  points: PointSortie[]
  pire: PointSortie
}

export interface RefusSortie {
  ok: false
  raison: string
  sensMesures: string[]
}

const BPS = 10000
/** Un centieme de point de base est sous ce que tout montant affiche peut distinguer. */
const EPS_BPS = 0.01

const cote = (l: Ligne): Cote => {
  const hook = l.bps ?? 0
  const lp = (l.stored_lp_fee ?? 0) / 100
  return { amountIn: l.amount_in, totalBps: hook + lp, hookBps: hook, lpBps: lp }
}

/** Ce qui reste apres avoir paye `bps`. Borne a zero : on ne rend jamais un negatif. */
const reste = (bps: number): number => Math.max(0, 1 - bps / BPS)

const parTaille = (a: Ligne, b: Ligne): number => (BigInt(a.amount_in) < BigInt(b.amount_in) ? -1 : 1)

export function testDeSortie(token: string, lignes: Ligne[]): TestSortie | RefusSortie {
  const t = token.toLowerCase()
  const premiere = lignes[0]
  if (!premiere) return { ok: false, raison: 'aucune mesure pour ce jeton', sensMesures: [] }

  // Acheter le jeton = recevoir le jeton = aller vers le cote de la PoolKey qui le porte.
  // Inverser ce test donnerait le conseil CONTRAIRE, et c'est une simple erreur de signe.
  const enCurrency1 = premiere.currency1.toLowerCase() === t
  const mesurees = lignes.filter((l) => l.label === MESURE && l.bps !== null)

  const achats = mesurees.filter((l) => l.zero_for_one === enCurrency1).sort(parTaille)
  const reventes = mesurees.filter((l) => l.zero_for_one !== enCurrency1)

  if (achats.length === 0 || reventes.length === 0) {
    const sens: string[] = []
    if (achats.length) sens.push('achat')
    if (reventes.length) sens.push('revente')
    return {
      ok: false,
      raison:
        sens.length === 0
          ? "aucune mesure chiffree sur ce jeton, dans aucun sens"
          : `un seul sens est mesure (${sens[0]}). L'autre n'est pas gratuit : il est INCONNU, ` +
            `et le composer avec zero rendrait un nombre faux.`,
      sensMesures: sens,
    }
  }

  const cotesRevente = reventes.map(cote)
  const pireRevente = cotesRevente.reduce((a, b) => (b.totalBps > a.totalBps ? b : a))
  const meilleureRevente = cotesRevente.reduce((a, b) => (b.totalBps < a.totalBps ? b : a))
  const reventePlate = Math.abs(pireRevente.totalBps - meilleureRevente.totalBps) < EPS_BPS

  const points: PointSortie[] = achats.map((l) => {
    const achat = cote(l)
    const apres = reste(achat.totalBps)
    return {
      amountIn: achat.amountIn,
      gardeMin: apres * reste(pireRevente.totalBps),
      gardeMax: apres * reste(meilleureRevente.totalBps),
      exact: reventePlate,
      achat,
      reventePire: pireRevente,
      reventeMeilleure: meilleureRevente,
    }
  })

  const pire = points.reduce((a, b) => (b.gardeMin < a.gardeMin ? b : a))
  return { ok: true, token: t, poolId: premiere.pool_id, hook: premiere.hook, blockNumber: premiere.block_number, points, pire }
}

/** « il te reste 98,01 € sur 100 » — la phrase que lit un humain. */
export function phraseSortie(t: TestSortie, montant: number, devise = '€'): string {
  const lo = (t.pire.gardeMin * montant).toFixed(2)
  const hi = (t.pire.gardeMax * montant).toFixed(2)
  // Deux bornes qui s'affichent pareil ne sont pas un intervalle : l'annoncer userait la
  // confiance pour rien.
  if (t.pire.exact || lo === hi) return `il te reste ${lo} ${devise}`
  return `il te reste entre ${lo} et ${hi} ${devise}`
}

/** Les monnaies de cotation : ce n'est pas d'elles qu'on demande un test de sortie. */
export const MONNAIES_DE_COTATION: Record<string, string> = {
  '0x0000000000000000000000000000000000000000': 'ETH',
  '0x4200000000000000000000000000000000000006': 'WETH',
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
}
