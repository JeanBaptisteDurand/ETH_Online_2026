/**
 * LA PORTE DE REMPLACEMENT.
 *
 * La garde repond « ce que cette porte prend ». La question suivante est evidemment « et
 * ailleurs ? ». Ce module y repond — et, la plupart du temps, il repond NON, parce que c'est
 * la verite : sur les 8 583 jetons du corpus, **97,2 % n'existent que dans un seul pool**.
 * Il n'y a nulle part ou aller.
 *
 * Sur les 237 jetons qui ont deux portes MESUREES, l'ecart median entre la meilleure et la
 * pire vaut **0,0 bps** : les deux coutent pareil. Le choix ne vaut plus de 100 bps que pour
 * **8 jetons**. Ces huit-la sont spectaculaires — sur l'un, changer de porte fait passer de
 * 0,00 a 1 798 bps — et c'est exactement pour eux que ce module existe.
 *
 * D'ou la forme de la reponse : un ETAT nomme, pas un booleen. « Il n'y a qu'une porte » est
 * une reponse utile ; « je n'ai pas trouve mieux » n'en est pas une, parce qu'on ne sait pas
 * si c'est parce qu'il n'y a rien ou parce qu'on n'a pas cherche.
 *
 * TROIS REGLES, et elles sont dures :
 *
 *   1. On ne propose JAMAIS une porte dont le cout n'est pas MESURE. Une porte non mesuree
 *      n'est pas une porte moins chere : elle est inconnue, et l'envoyer serait pire que de
 *      ne rien proposer.
 *   2. On compare a la MEME TAILLE. Le prelevement varie avec le montant dans 49,1 % des
 *      couples (pool, sens), de 75 bps en mediane : comparer 1e15 chez l'un a 1e18 chez
 *      l'autre fabriquerait une economie qui n'existe pas.
 *   3. On ne reecrit rien. Le calldata de remplacement est CONSTRUIT et RENDU ; c'est
 *      l'utilisateur qui signe, ou pas. Des qu'on substitue une transaction en silence, on
 *      devient responsable de son resultat.
 */
import type { Label, PoolKey } from "./types.js";
import type { GuardTable, TablePool } from "./table.js";
import { encodeUniversalRouterExactInSingle } from "./encode.js";

/** Une porte candidate, avec ce qu'on sait d'elle A LA TAILLE DEMANDEE. */
export interface Porte {
  poolId: string;
  poolKey: PoolKey;
  hook: string;
  zeroForOne: boolean;
  direction: "0->1" | "1->0";
  /** le cout total mesure, en points de base. null = pas mesure a cette taille. */
  bps: number | null;
  label: Label | null;
  /** la taille a laquelle ce cout a ete lu — toujours egale a celle demandee, ou null */
  amountIn: string | null;
  stored_lp_fee: number | null;
  fee_is_dynamic: boolean | null;
}

export type EtatAlternative =
  /** une autre porte est mesuree MOINS CHERE a la meme taille */
  | "MEILLEURE_PORTE"
  /** ce jeton n'a qu'un seul pool dans le corpus : il n'y a nulle part ou aller */
  | "PORTE_UNIQUE"
  /** d'autres portes existent, et celle-ci est deja la moins chere des mesurees */
  | "DEJA_LA_MEILLEURE"
  /** d'autres portes existent mais AUCUNE n'est mesuree a cette taille : on ne compare pas */
  | "AUTRES_NON_MESUREES"
  /** la porte actuelle elle-meme n'est pas mesuree a cette taille : rien a comparer */
  | "ACTUELLE_NON_MESUREE";

export interface Alternative {
  etat: EtatAlternative;
  raison: string;
  actuelle: Porte;
  /** la porte proposee, seulement quand l'etat vaut MEILLEURE_PORTE */
  proposee: Porte | null;
  /** l'ecart mesure, en points de base. null des que l'un des deux cotes n'est pas mesure. */
  economie_bps: number | null;
  /** le seuil sous lequel on ne propose rien — publie pour qu'on puisse le deplacer */
  seuil_bps: number;
  /** les autres portes examinees, mesurees ou non — pour que le refus soit verifiable */
  examinees: Porte[];
  /** le calldata complet de la transaction de remplacement, a signer par l'utilisateur */
  calldata: string | null;
  block_number: number;
  chain_id: number;
}

/**
 * L'ECONOMIE MINIMALE qu'on accepte de proposer, en points de base.
 *
 * C'est un SEUIL DE PUBLICATION, pas une frontiere naturelle : le deplacer change la liste, et
 * il est rendu dans la reponse pour qu'on puisse le deplacer et refaire le compte.
 *
 * Il existe parce que le module, sans lui, proposait de re-signer une transaction pour gagner
 * **0,0048 bps** — cinq millioniemes du montant. A ce niveau l'utilisateur paie plus de gaz que
 * ce qu'il economise : le conseil lui coute de l'argent. Un bps vaut un centime sur 100 € ;
 * en dessous, l'ecart n'est meme pas visible a la precision ou le montant s'affiche.
 */
export const ECONOMIE_MIN_BPS = 1;

const MONNAIES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x4200000000000000000000000000000000000006",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
]);

const cle = (p: TablePool): PoolKey => ({
  currency0: p.currency0,
  currency1: p.currency1,
  fee: p.fee,
  tickSpacing: p.tick_spacing,
  hooks: p.hook,
});

/** Le jeton qui n'est pas une monnaie de cotation. null si les deux le sont, ou aucune. */
export function jetonDuPool(p: TablePool): string | null {
  const c0 = p.currency0.toLowerCase();
  const c1 = p.currency1.toLowerCase();
  const a = MONNAIES.has(c0);
  const b = MONNAIES.has(c1);
  if (a === b) return null;
  return a ? c1 : c0;
}

/** Ce que la table dit de CETTE porte, dans CE sens, a CETTE taille exacte — sans interpoler. */
function porteA(
  table: GuardTable,
  poolId: string,
  pool: TablePool,
  direction: "0->1" | "1->0",
  amountIn: string | null,
): Porte {
  const pts = pool.dirs[direction] ?? [];
  // Taille exacte, ou rien. Interpoler ici fabriquerait la comparaison qu'on veut eviter :
  // le prelevement varie avec le montant dans la moitie des couples.
  const pt = amountIn === null ? null : (pts.find((x) => x.amount_in === amountIn) ?? null);
  return {
    poolId,
    poolKey: cle(pool),
    hook: pool.hook,
    zeroForOne: direction === "0->1",
    direction,
    bps: pt && pt.label === "MEASURED" ? pt.bps : null,
    label: pt ? pt.label : null,
    amountIn: pt ? pt.amount_in : null,
    stored_lp_fee: pool.stored_lp_fee,
    fee_is_dynamic: pool.fee_is_dynamic,
  };
}

/** Le sens qui achete le meme jeton dans un autre pool que celui d'origine. */
function memeSens(pool: TablePool, jeton: string): "0->1" | "1->0" {
  // Acheter le jeton = aller VERS le cote de la PoolKey qui le porte.
  return pool.currency1.toLowerCase() === jeton ? "0->1" : "1->0";
}

/**
 * Cherche une porte mesuree moins chere que celle-ci, a la meme taille, pour le meme jeton.
 *
 * `amountIn` a null — chemin multi-saut, OPEN_DELTA — n'est pas une taille nulle : on ne
 * compare pas, et l'etat le dit.
 */
export function chercherAlternative(
  table: GuardTable,
  poolId: string,
  direction: "0->1" | "1->0",
  amountIn: string | null,
): Alternative | null {
  const id = poolId.toLowerCase();
  const pool = table.pools[id];
  if (!pool) return null;

  const actuelle = porteA(table, id, pool, direction, amountIn);
  const socle = {
    actuelle,
    proposee: null,
    economie_bps: null,
    seuil_bps: ECONOMIE_MIN_BPS,
    examinees: [] as Porte[],
    calldata: null,
    block_number: table.block_number,
    chain_id: table.chain_id,
  };

  const jeton = jetonDuPool(pool);
  if (jeton === null) {
    return {
      ...socle,
      etat: "PORTE_UNIQUE",
      raison:
        "les deux cotes de ce pool sont des monnaies de cotation : il n'y a pas de jeton dont chercher les autres portes",
    };
  }

  // Toutes les portes du meme jeton, celle-ci exceptee.
  const soeurs: [string, TablePool][] = [];
  for (const [pid, p] of Object.entries(table.pools)) {
    if (pid === id) continue;
    if (jetonDuPool(p) === jeton) soeurs.push([pid, p]);
  }

  if (soeurs.length === 0) {
    return {
      ...socle,
      etat: "PORTE_UNIQUE",
      raison:
        `ce jeton n'existe que dans ce pool, dans tout le corpus. Il n'y a nulle part ou aller — ` +
        `c'est le cas de 97,2 % des jetons mesures, et la seule decision qui reste est la taille`,
    };
  }

  const examinees = soeurs.map(([pid, p]) => porteA(table, pid, p, memeSens(p, jeton), amountIn));
  const avecSocle = { ...socle, examinees };

  if (actuelle.bps === null) {
    return {
      ...avecSocle,
      etat: "ACTUELLE_NON_MESUREE",
      raison:
        amountIn === null
          ? "la taille n'est pas fixee par ce calldata : comparer deux portes a des tailles differentes fabriquerait une economie qui n'existe pas"
          : `cette porte n'est pas mesuree a ${amountIn} : sans son cout, aucun ecart n'est calculable`,
    };
  }

  const mesurees = examinees.filter((p) => p.bps !== null);
  if (mesurees.length === 0) {
    return {
      ...avecSocle,
      etat: "AUTRES_NON_MESUREES",
      raison:
        `${examinees.length} autre(s) porte(s) existe(nt) pour ce jeton, mais aucune n'est mesuree a ` +
        `${amountIn}. Une porte non mesuree n'est pas une porte moins chere : elle est inconnue`,
    };
  }

  const meilleure = mesurees.reduce((a, b) => (b.bps! < a.bps! ? b : a));
  const ecart = actuelle.bps - meilleure.bps!;
  if (ecart < ECONOMIE_MIN_BPS) {
    return {
      ...avecSocle,
      etat: "DEJA_LA_MEILLEURE",
      raison:
        ecart <= 0
          ? `sur ${mesurees.length} autre(s) porte(s) mesuree(s) a cette taille, la moins chere prend ` +
            `${meilleure.bps!.toFixed(2)} bps contre ${actuelle.bps.toFixed(2)} ici : rester coute moins`
          : `la meilleure autre porte ne gagne que ${ecart.toFixed(4)} bps, sous le seuil de ` +
            `${ECONOMIE_MIN_BPS} bps. A ce niveau le gaz d'une seconde transaction coute plus que ` +
            `l'economie : proposer de re-signer ferait PERDRE de l'argent`,
    };
  }

  // On ne construit le remplacement que sur une porte MESUREE moins chere, a la meme taille.
  const calldata = encodeUniversalRouterExactInSingle([
    {
      poolKey: meilleure.poolKey,
      zeroForOne: meilleure.zeroForOne,
      amountIn: BigInt(amountIn!),
    },
  ]);

  return {
    ...avecSocle,
    etat: "MEILLEURE_PORTE",
    proposee: meilleure,
    economie_bps: Number(ecart.toFixed(4)),
    calldata,
    raison:
      `mesuree a la meme taille (${amountIn}) et au meme bloc : ${meilleure.bps!.toFixed(2)} bps ` +
      `contre ${actuelle.bps.toFixed(2)} ici. Le calldata de remplacement est fourni ; c'est toi qui signes`,
  };
}
