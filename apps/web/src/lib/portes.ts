/**
 * POUR CE JETON, QUELLE PORTE L'ACHETE LE MOINS CHER ?
 *
 * C'est l'opération que le site doit faire en premier : on colle une adresse, on lit par où
 * passer. Tout se calcule dans le navigateur, sur le corpus embarqué — aucune requête, aucun
 * portefeuille, aucun serveur.
 *
 * TROIS CHOSES QUE CE MODULE REFUSE DE FAIRE, et ce sont elles qui décident de sa forme.
 *
 * 1. IL NE CLASSE QUE CE QUI EST MESURÉ. Une porte dont le coût n'est pas mesuré à cette
 *    taille n'est pas une porte moins chère : elle est inconnue. Elle est rendue à part, dans
 *    `non_mesurees`, pour que le refus soit vérifiable — jamais reléguée en fin de classement
 *    comme si elle était chère, jamais comptée à zéro.
 *
 * 2. IL COMPARE À TAILLE ÉGALE **ET DANS LA MÊME MONNAIE**. Le prélèvement varie avec le
 *    montant dans 49,1 % des couples (pool, sens), de 75 bps en médiane : classer 1e15 chez
 *    l'un contre 1e18 chez l'autre fabriquerait un écart qui n'existe pas. Et comparer
 *    1e19 unités de WETH à 1e19 unités d'un autre jeton serait pire encore — ce sont deux
 *    montants sans rapport. Les portes sont donc groupées par MONNAIE DÉPENSÉE, et un
 *    classement ne mélange jamais deux groupes.
 *
 *    La première version de ce fichier ne le faisait pas, et rendait un classement où trois
 *    portes payaient en trois jetons différents. C'est exactement le défaut corrigé le même
 *    jour dans packages/guard/src/alternative.ts.
 *
 * 3. IL DIT « IL N'Y EN A QU'UNE » QUAND C'EST LE CAS, et c'est le cas presque partout :
 *    97,2 % des 8 583 jetons du corpus n'existent que dans un seul pool. « Une seule porte »
 *    est une réponse, pas un échec de recherche — et c'est la réponse honnête que les
 *    agrégateurs ne donnent jamais.
 *
 * LE COÛT TOTAL est la somme de deux choses de nature différente, et on les garde séparées à
 * l'écran : les frais LP lus dans `slot0` (en centièmes de bps) et le prélèvement du hook
 * mesuré par contrefactuel. Le premier est déclaré par le pool, le second ne l'est nulle part.
 */
import type { Row } from './dataset'
import { MONNAIES_DE_COTATION } from './exit'

/** Les frais LP de slot0 sont en centièmes de bps (pips) : 3000 pips = 30 bps. */
export const lpFeeBps = (storedLpFee: number): number => storedLpFee / 100

export type Sens = '0->1' | '1->0'

export interface Porte {
  poolId: string
  hook: string
  /** la monnaie qu'on dépense pour obtenir le jeton */
  paieAvec: string
  /** le nom lisible de cette monnaie quand c'en est une de cotation */
  paieAvecNom: string | null
  sens: Sens
  fee: number
  tickSpacing: number
  feeDynamique: boolean
  /** frais LP lus dans slot0, en bps. null = non lu — jamais 0 par défaut. */
  lpBps: number | null
  /** prélèvement du hook, mesuré. null = pas mesuré à cette taille. */
  hookBps: number | null
  /** lpBps + hookBps, seulement quand les DEUX sont connus. */
  totalBps: number | null
  taille: string
  bloc: number
  /** la commande qui rejoue exactement cette ligne */
  rejeu: string
}

export type EtatRecherche =
  /** plusieurs portes mesurées : elles sont classées */
  | 'PLUSIEURS_PORTES'
  /** une seule porte existe pour ce jeton, dans tout le corpus */
  | 'PORTE_UNIQUE'
  /** des portes existent, aucune n'est mesurée à cette taille */
  | 'AUCUNE_MESUREE'
  /** ce jeton n'est pas dans le corpus */
  | 'JETON_INCONNU'
  /** l'adresse collée est une monnaie de cotation, pas un jeton à acheter */
  | 'MONNAIE_DE_COTATION'

/** Un classement, valable pour UNE monnaie dépensée et UNE taille. */
export interface Groupe {
  /** la monnaie qu'on dépense pour toutes les portes de ce groupe */
  paieAvec: string
  paieAvecNom: string | null
  taille: string
  /** les portes mesurées, de la moins chère à la plus chère */
  classees: Porte[]
  /** celles qui existent mais dont le coût n'est pas mesuré à cette taille */
  non_mesurees: Porte[]
  /** l'écart entre la meilleure et la pire, quand il y a au moins deux mesurées */
  ecart_bps: number | null
}

export interface Recherche {
  etat: EtatRecherche
  raison: string
  jeton: string
  /** la taille retenue, en unités de la monnaie dépensée */
  taille: string | null
  /** un classement par monnaie dépensée. Deux monnaies ne se comparent jamais entre elles. */
  groupes: Groupe[]
  /** combien de pools du corpus portent ce jeton, toutes monnaies confondues */
  n_portes: number
  bloc: number | null
}

const bas = (s: string): string => s.toLowerCase()

/**
 * Le sens qui ACHÈTE ce jeton dans ce pool, ou null si le pool ne le porte pas.
 *
 * Il se déduit des MONNAIES de la PoolKey : acheter, c'est aller vers le côté qui porte le
 * jeton. Ce n'est PAS le sens de la ligne — une ligne du corpus mesure un sens précis.
 */
export function sensQuiAchete(r: Row, jeton: string): Sens | null {
  const t = bas(jeton)
  if (bas(r.currency1) === t) return '0->1'
  if (bas(r.currency0) === t) return '1->0'
  return null
}

/** Le sens que CETTE ligne a mesuré. */
export const sensDeLaLigne = (r: Row): Sens => (r.zero_for_one ? '0->1' : '1->0')

/**
 * Cette ligne mesure-t-elle l'ACHAT de ce jeton ?
 *
 * LA DISTINCTION QUI COMPTE. Un pool est mesuré dans les deux sens : une ligne achète le
 * jeton, l'autre le vend. `sensQuiAchete` seul retient les DEUX, parce qu'il ne regarde que
 * les monnaies de la clé — et la première version de ce fichier affichait donc le coût de la
 * VENTE comme une façon d'acheter, sur le même pool, juste en dessous.
 *
 * C'est le troisième défaut de cette famille dans ce dépôt le même jour : `memeSens` dans
 * packages/guard/src/alternative.ts proposait une porte inversée, et la comparaison par jeton
 * mélangeait deux monnaies. Le sens d'un swap ne se déduit jamais de la paire seule.
 */
export const ligneAchete = (r: Row, jeton: string): boolean =>
  sensQuiAchete(r, jeton) === sensDeLaLigne(r)

/** Ce qu'on dépense pour acheter le jeton par ce pool. */
export const monnaieDepensee = (r: Row, sens: Sens): string =>
  bas(sens === '0->1' ? r.currency0 : r.currency1)

/**
 * Les tailles auxquelles ce jeton est mesuré, du plus petit au plus grand.
 *
 * On les rend pour que l'écran propose des tailles RÉELLES plutôt qu'un curseur libre : une
 * taille non mesurée ne donnerait aucun classement, et l'utilisateur croirait à une panne.
 */
export function taillesPour(rows: Row[], jetonBrut: string): string[] {
  const jeton = bas(jetonBrut)
  const vues = new Set<string>()
  for (const r of rows) {
    if (!ligneAchete(r, jeton)) continue
    vues.add(r.amount_in)
  }
  return [...vues].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0))
}

function porteDe(r: Row, sens: Sens, rejeu: string): Porte {
  const paieAvec = monnaieDepensee(r, sens)
  const lp = r.stored_lp_fee === null ? null : lpFeeBps(r.stored_lp_fee)
  // MESURE seulement : une ligne INTERPOLE, NON_MESURABLE ou NON_COTABLE ne porte pas de
  // nombre qu'on ait le droit de classer.
  const hook = r.label === 'MESURE' && r.bps !== null ? r.bps : null
  return {
    poolId: r.pool_id,
    hook: r.hook,
    paieAvec,
    paieAvecNom: MONNAIES_DE_COTATION[paieAvec] ?? null,
    sens,
    fee: r.key_fee,
    tickSpacing: r.tick_spacing,
    feeDynamique: r.fee_is_dynamic,
    lpBps: lp,
    hookBps: hook,
    // La somme n'existe que si les DEUX moitiés existent. Compléter l'une par zéro
    // publierait un coût plus bas que le réel, ce qui est la seule erreur qui coûte de
    // l'argent à celui qui lit.
    totalBps: lp !== null && hook !== null ? Math.round((lp + hook) * 1e4) / 1e4 : null,
    taille: r.amount_in,
    bloc: r.block_number,
    rejeu,
  }
}

/** La commande qui rejoue une ligne, dans la forme utilisée partout ailleurs. */
export function rejeuDe(r: Row, sens: Sens): string {
  return [
    'python3 apps/api/scripts/measure_one.py',
    '--rpc $RPC',
    `--block ${r.block_number}`,
    `--hooks ${r.hook}`,
    `--currency0 ${r.currency0}`,
    `--currency1 ${r.currency1}`,
    `--fee ${r.key_fee}`,
    `--tick-spacing ${r.tick_spacing}`,
    `--zero-for-one ${sens === '0->1'}`,
    `--amount-in ${r.amount_in}`,
  ].join(' ')
}

/**
 * Par où acheter ce jeton, et à quel coût mesuré.
 *
 * `taille` absente : on prend la plus grande taille à laquelle AU MOINS DEUX portes sont
 * mesurées, parce que c'est celle où la comparaison a un sens. À défaut, la plus grande
 * mesurée tout court. Choisir « une taille raisonnable » serait inventer un chiffre.
 */
export function ouAcheter(rows: Row[], jetonBrut: string, taille?: string): Recherche {
  const jeton = bas(jetonBrut.trim())
  const vide: Omit<Recherche, 'etat' | 'raison'> = {
    jeton,
    taille: taille ?? null,
    groupes: [],
    n_portes: 0,
    bloc: null,
  }

  if (jeton in MONNAIES_DE_COTATION) {
    return {
      ...vide,
      etat: 'MONNAIE_DE_COTATION',
      raison:
        `${MONNAIES_DE_COTATION[jeton]} est la monnaie qu'on DÉPENSE, pas celle qu'on achète. ` +
        `Colle l'adresse du jeton que tu veux obtenir.`,
    }
  }

  // Seules les lignes qui mesurent l'ACHAT. Celles qui mesurent la vente du même jeton, sur
  // le même pool, ne sont pas une façon de l'acheter.
  const concernees = rows.filter((r) => ligneAchete(r, jeton))
  if (concernees.length === 0) {
    return {
      ...vide,
      etat: 'JETON_INCONNU',
      raison:
        "ce jeton n'est dans aucun pool du corpus. Le corpus est épinglé à un bloc : un pool " +
        'créé depuis n\'y figure pas, et son absence ici ne dit rien de son existence.',
    }
  }

  // La taille : celle demandée, ou la plus grande où deux portes au moins sont mesurées.
  let t = taille
  if (!t) {
    const parTaille = new Map<string, Set<string>>()
    for (const r of concernees) {
      if (r.label !== 'MESURE' || r.bps === null) continue
      const s = parTaille.get(r.amount_in) ?? new Set<string>()
      s.add(r.pool_id)
      parTaille.set(r.amount_in, s)
    }
    const multiples = [...parTaille.entries()]
      .filter(([, pools]) => pools.size >= 2)
      .map(([k]) => k)
      .sort((a, b) => (BigInt(a) < BigInt(b) ? 1 : -1))
    t = multiples[0] ?? taillesPour(rows, jeton).slice(-1)[0]
  }

  const aLaTaille = concernees.filter((r) => r.amount_in === t)
  const portes = aLaTaille.map((r) => {
    const sens = sensDeLaLigne(r)
    return porteDe(r, sens, rejeuDe(r, sens))
  })

  // GROUPER PAR MONNAIE DÉPENSÉE. Deux portes qui ne paient pas dans la même monnaie ne se
  // classent pas l'une contre l'autre : 1e19 unités de l'une n'est pas 1e19 unités de l'autre.
  const parMonnaie = new Map<string, Porte[]>()
  for (const p of portes) {
    const l = parMonnaie.get(p.paieAvec) ?? []
    l.push(p)
    parMonnaie.set(p.paieAvec, l)
  }
  const groupes: Groupe[] = [...parMonnaie.entries()]
    .map(([paieAvec, l]) => {
      const mes = l.filter((p) => p.totalBps !== null).sort((a, b) => a.totalBps! - b.totalBps!)
      const ec =
        mes.length >= 2
          ? Math.round((mes[mes.length - 1]!.totalBps! - mes[0]!.totalBps!) * 1e4) / 1e4
          : null
      return {
        paieAvec,
        paieAvecNom: l[0]!.paieAvecNom,
        taille: t!,
        classees: mes,
        non_mesurees: l.filter((p) => p.totalBps === null),
        ecart_bps: ec,
      }
    })
    // L'ORDRE DE LECTURE. Un jeton peut être apparié à des centaines d'autres jetons — le
    // corpus en porte un à 1 839 monnaies — et presque toutes n'ont qu'une porte. Ce que le
    // lecteur veut d'abord, c'est payer avec une monnaie qu'il détient, et là où un choix
    // existe. D'où : monnaies de cotation d'abord, puis celles qui offrent une comparaison,
    // puis la moins chère.
    .sort(
      (a, b) =>
        Number(b.paieAvecNom !== null) - Number(a.paieAvecNom !== null) ||
        Number(b.classees.length >= 2) - Number(a.classees.length >= 2) ||
        b.classees.length - a.classees.length ||
        (a.classees[0]?.totalBps ?? Infinity) - (b.classees[0]?.totalBps ?? Infinity),
    )

  const poolsDuJeton = new Set(concernees.map((r) => r.pool_id))
  const mesurees = groupes.flatMap((g) => g.classees)
  const base = {
    ...vide,
    taille: t ?? null,
    groupes,
    n_portes: poolsDuJeton.size,
    bloc: portes[0]?.bloc ?? null,
  }

  if (poolsDuJeton.size === 1) {
    return {
      ...base,
      etat: 'PORTE_UNIQUE',
      raison:
        "ce jeton n'existe que dans un seul pool du corpus : il n'y a nulle part ailleurs où " +
        "aller. C'est le cas de 97,2 % des 8 583 jetons mesurés, et la seule décision qui " +
        'reste est la taille.',
    }
  }

  if (mesurees.length === 0) {
    return {
      ...base,
      etat: 'AUCUNE_MESUREE',
      raison:
        `${poolsDuJeton.size} portes existent pour ce jeton, mais aucune n'est mesurée à ` +
        `${t}. Une porte non mesurée n'est pas une porte moins chère : elle est inconnue.`,
    }
  }

  // Un classement n'existe que DANS un groupe : deux portes seules dans deux monnaies
  // différentes ne se comparent pas, même si le total en fait deux.
  const comparables = groupes.filter((g) => g.classees.length >= 2)
  if (comparables.length === 0) {
    return {
      ...base,
      etat: 'AUCUNE_MESUREE',
      raison:
        `${poolsDuJeton.size} portes existent pour ce jeton, mais aucune monnaie n'en a deux ` +
        `mesurées à ${t}. ` +
        (mesurees.length === 1
          ? 'Une seule est mesurée : comparer une mesure à une inconnue ne donne pas un classement.'
          : mesurees.length > 1
            ? 'Celles qui le sont paient dans des monnaies différentes, et deux montants ' +
              'nominaux égaux dans deux monnaies ne sont pas le même montant.'
            : 'Une porte non mesurée n\'est pas une porte moins chère : elle est inconnue.'),
    }
  }

  const meilleur = comparables[0]!
  const ec = meilleur.ecart_bps ?? 0
  return {
    ...base,
    etat: 'PLUSIEURS_PORTES',
    raison:
      `${meilleur.classees.length} portes mesurées à la même taille, au même bloc et dans la ` +
      `même monnaie (${meilleur.paieAvecNom ?? meilleur.paieAvec.slice(0, 10) + '…'}). ` +
      (ec < 1
        ? `Elles coûtent la même chose à ${ec.toFixed(4)} bps près : le choix de la porte ne ` +
          'change rien ici, et la variable qui reste est la taille.'
        : `${ec.toFixed(2)} bps séparent la moins chère de la plus chère.`),
  }
}

/**
 * Les groupes à montrer, et combien restent.
 *
 * Un jeton peut être apparié à des centaines d'autres. Tout afficher noie la réponse ; n'en
 * afficher qu'un cacherait qu'il y a d'autres façons de payer. On rend donc les premiers ET
 * le compte de ce qui est laissé, pour que la troncature se voie — elle n'est jamais
 * silencieuse.
 */
export function aMontrer(r: Recherche, max = 4): { montres: Groupe[]; restants: number } {
  const utiles = r.groupes.filter((g) => g.paieAvecNom !== null || g.classees.length >= 2)
  const liste = (utiles.length ? utiles : r.groupes).slice(0, max)
  return { montres: liste, restants: r.groupes.length - liste.length }
}

/** Ce que 100 unités deviennent après un prélèvement de `bps`. Pour l'affichage seul. */
export const sur100 = (bps: number): number => 100 * (1 - bps / 10000)
