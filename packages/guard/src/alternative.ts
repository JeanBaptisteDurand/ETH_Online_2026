/**
 * LA PORTE DE REMPLACEMENT.
 *
 * La garde repond « ce que cette porte prend ». La question suivante est evidemment « et
 * ailleurs ? ». Ce module y repond — et, la plupart du temps, il repond NON, parce que c'est
 * la verite.
 *
 * TOUS LES NOMBRES CI-DESSOUS SONT PRODUITS PAR scripts/chiffres-alternative.mjs, qui rejoue
 * cette logique sur les 125 072 lignes de data/table.json et ecrit data/chiffres-alternative.json.
 * Ils etaient auparavant comptes a la main, et ils etaient faux — voir sensEquivalent().
 *
 * Sur les 125 072 lignes de mesure, chacune etant une question qu'un utilisateur peut poser :
 *
 *   PORTE_UNIQUE           124 704   99,71 %   aucun autre pool ne fait cet echange
 *   ACTUELLE_NON_MESUREE       237    0,19 %
 *   DEJA_LA_MEILLEURE          112    0,09 %
 *   MEILLEURE_PORTE             15    0,01 %
 *   AUTRES_NON_MESUREES          4    0,00 %
 *
 * Quinze propositions dans tout le corpus. Elles se ramenent a QUATRE couples de pools, et la
 * meilleure fait passer de 295,59 a 216,92 bps — **78,67 bps** d'ecart, sur un jeton echange
 * contre lui-meme dans deux pools de meme frais et meme tickSpacing, qui ne different que par
 * leur hook. Aucune ne depasse 100 bps.
 *
 * 15 sur 125 072, c'est le fait qui compte, et il est plus interessant que son contraire : le
 * choix de la porte n'est presque jamais la variable. La variable, c'est la TAILLE — le
 * prelevement varie avec le montant dans 49,1 % des couples (pool, sens), de 75 bps en
 * mediane. Un produit qui vend « on te trouve un meilleur pool » vendrait le mauvais chiffre.
 *
 * D'ou la forme de la reponse : un ETAT nomme, pas un booleen. « Il n'y a qu'une porte » est
 * une reponse utile ; « je n'ai pas trouve mieux » n'en est pas une, parce qu'on ne sait pas
 * si c'est parce qu'il n'y a rien ou parce qu'on n'a pas cherche.
 *
 * QUATRE REGLES, et elles sont dures :
 *
 *   1. On ne propose JAMAIS une porte dont le cout n'est pas MESURE. Une porte non mesuree
 *      n'est pas une porte moins chere : elle est inconnue, et l'envoyer serait pire que de
 *      ne rien proposer.
 *   2. On compare a la MEME TAILLE **et dans les memes MONNAIES**. Comparer 1e15 chez l'un a
 *      1e18 chez l'autre fabriquerait une economie qui n'existe pas ; comparer 1e18 unites de
 *      WETH a 1e18 unites d'USDC serait pire encore.
 *   3. On compare le MEME ECHANGE, dans le MEME SENS. C'est la regle qui manquait, et son
 *      absence produisait des propositions inversees : voir sensEquivalent().
 *   4. On ne reecrit rien. Le calldata de remplacement est CONSTRUIT et RENDU ; c'est
 *      l'utilisateur qui signe, ou pas. Des qu'on substitue une transaction en silence, on
 *      devient responsable de son resultat.
 *
 * La transaction envoyable, elle, est construite par envoi.ts : ce module s'arrete au
 * calldata, parce qu'un `{to, data, value}` exige un plancher de sortie et une echeance que
 * le corpus, epingle a un bloc, ne peut pas fournir.
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
  | "ACTUELLE_NON_MESUREE"
  /**
   * Le pool vise n'est pas dans la table du tout. Ce n'est pas « pas d'alternative » : c'est
   * « on ne connait meme pas cette porte ». Le corpus est epingle a UN bloc, donc un pool
   * cree depuis n'y figure pas — et c'est le cas de toutes les transactions Base capturees
   * apres le bloc 50 614 000. Rendre `null` ici melangeait ce cas avec le multi-saut.
   */
  | "POOL_INCONNU";

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

/** Ce que ce swap DEPENSE et ce qu'il RECOIT, dans ce sens. */
export function cotes(
  pool: TablePool,
  direction: "0->1" | "1->0",
): { entree: string; sortie: string } {
  const c0 = pool.currency0.toLowerCase();
  const c1 = pool.currency1.toLowerCase();
  return direction === "0->1" ? { entree: c0, sortie: c1 } : { entree: c1, sortie: c0 };
}

/**
 * Le sens de CE pool qui fait EXACTEMENT le meme echange, ou null s'il ne le peut pas.
 *
 * C'est la correction d'un defaut qui aurait pu couter tres cher. La version precedente
 * repondait « le sens qui ACHETE le jeton », en dur, sans regarder le sens demande. Sur le
 * couple le plus spectaculaire du corpus — le pool 0x997673… a 300,00 bps et son frere
 * 0xe11e1e… a 0,0316 bps, memes monnaies, meme hook — quelqu'un qui VEND son jeton contre de
 * l'ETH recevait une transaction qui DEPENSE de l'ETH pour acheter le jeton. Le sens inverse,
 * avec un montant lu comme si c'etait le meme.
 *
 * Et la comparaison exige les DEUX monnaies, pas seulement le jeton : un pool JETON/WETH et
 * un pool JETON/USDC portent le meme jeton, mais 1e18 unites de l'un ne valent pas 1e18
 * unites de l'autre. Comparer a « la meme taille » n'y voudrait rien dire — c'est la regle
 * dure n.2, appliquee a la monnaie et plus seulement au nombre.
 */
export function sensEquivalent(
  pool: TablePool,
  entree: string,
  sortie: string,
): "0->1" | "1->0" | null {
  const c0 = pool.currency0.toLowerCase();
  const c1 = pool.currency1.toLowerCase();
  if (c0 === entree && c1 === sortie) return "0->1";
  if (c1 === entree && c0 === sortie) return "1->0";
  return null;
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
  if (!pool) {
    return {
      etat: "POOL_INCONNU",
      raison:
        `ce pool n'est pas dans le corpus : la table est epinglee au bloc ${table.block_number}, ` +
        `et un pool cree depuis n'y figure pas. On ne sait rien de cette porte — donc rien de ` +
        `ses alternatives non plus`,
      actuelle: {
        poolId: id,
        poolKey: { currency0: "", currency1: "", fee: 0, tickSpacing: 0, hooks: "" },
        hook: "",
        zeroForOne: direction === "0->1",
        direction,
        bps: null,
        label: null,
        amountIn,
        stored_lp_fee: null,
        fee_is_dynamic: null,
      },
      proposee: null,
      economie_bps: null,
      seuil_bps: ECONOMIE_MIN_BPS,
      examinees: [],
      calldata: null,
      block_number: table.block_number,
      chain_id: table.chain_id,
    };
  }

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

  // L'echange demande, en monnaies : c'est LUI qu'une autre porte doit savoir refaire.
  const { entree, sortie } = cotes(pool, direction);

  // Toutes les portes qui font le MEME echange — memes deux monnaies, dans le meme sens —
  // celle-ci exceptee. Le sens de chacune est deduit de ses monnaies, jamais suppose.
  const soeurs: [string, TablePool, "0->1" | "1->0"][] = [];
  for (const [pid, p] of Object.entries(table.pools)) {
    if (pid === id) continue;
    const sens = sensEquivalent(p, entree, sortie);
    if (sens !== null) soeurs.push([pid, p, sens]);
  }

  if (soeurs.length === 0) {
    return {
      ...socle,
      etat: "PORTE_UNIQUE",
      raison:
        `aucun autre pool du corpus n'echange ${entree.slice(0, 10)}… contre ${sortie.slice(0, 10)}… : ` +
        `il n'y a nulle part ou aller. C'est le cas de 99,71 % des 125 072 lignes du corpus, et la ` +
        `seule decision qui reste est la taille`,
    };
  }

  const examinees = soeurs.map(([pid, p, sens]) => porteA(table, pid, p, sens, amountIn));
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
