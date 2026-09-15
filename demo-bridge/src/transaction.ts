/**
 * LA TRANSACTION QUE LE SERVICE CONSTRUIT — ET QU'IL NE SIGNE JAMAIS.
 *
 * Il rend un `{to, data, value}`. C'est le portefeuille de l'utilisateur qui l'envoie, ou pas.
 * C'est la regle dure n.4 d'alternative.ts, tenue jusqu'au bout.
 *
 * DEUX GARANTIES AVANT DE RENDRE QUOI QUE CE SOIT
 *
 *  1. LE CALLDATA EST RELU. Il repasse par `decodeUniversalRouterCalldata` — le decodeur du
 *     depot, pas un miroir ecrit pour l'occasion — et la PoolKey relue est comparee champ a
 *     champ a celle qu'on voulait. Une regression de l'encodeur ne peut pas atteindre un
 *     portefeuille en silence. Etat `RELECTURE_DIVERGENTE` sinon, et rien n'est rendu.
 *
 *  2. LE PLANCHER DE SORTIE VIENT D'UNE COTATION VIVANTE, prise sur le fork de la demo
 *     (V4Quoter, un eth_call local, zero requete au fournisseur payant). Le corpus est epingle
 *     au bloc 50 614 000 : sa colonne de sortie etait juste ce jour-la. Quand la cotation
 *     echoue — et elle echoue legitimement, NOT_ENOUGH_LIQUIDITY est une reponse — le plancher
 *     est rendu `null` avec son motif, et l'avertissement voyage avec la transaction.
 */
import { encodeUniversalRouterExactInSingle } from "../vendor/guard/src/encode.js";
import { decodeUniversalRouterCalldata } from "../vendor/guard/src/calldata.js";
import { coter, V4_QUOTER_BASE } from "../vendor/guard/src/lecture.js";
import type { PoolKey } from "../vendor/guard/src/types.js";
import { ADRESSE_NULLE, type Porte } from "./corpus.js";
import { hex, rpc } from "./fork.js";

/** L'Universal Router sur Base, tel que guard-sans-table.ts le nomme. */
export const UNIVERSAL_ROUTER_BASE = "0x6ff5693b99212da76ad316178a184ab56d299b43";

/**
 * LA TOLERANCE DE PRIX, EN BPS. Ce n'est PAS un chiffre du corpus : c'est une marge, et elle
 * est publiee dans chaque reponse pour qu'on puisse la deplacer et refaire le compte.
 *
 * ELLE VALAIT 50, ET C'ETAIT UN PARI SUR L'HORLOGE. Mesure : dix envois du calldata
 * STRICTEMENT IDENTIQUE au meme bloc epingle donnaient 4 reussites et 6 reverts. L'echec
 * etait toujours le meme — `0x8b063d73`, soit `V4TooLittleReceived(uint256,uint256)` : le
 * plancher de sortie n'etait pas atteint. Et `eth_call` passait a chaque fois ; seul le bloc
 * MINE echouait.
 *
 * Pourquoi : la porte de remplacement porte un hook a FRAIS DYNAMIQUES (fee = 8388608 =
 * 0x800000). Sa cotation est prise a l'horodatage du bloc epingle ; la transaction, elle,
 * s'execute dans un bloc dont anvil a avance l'horloge, et le hook n'y facture plus tout a
 * fait pareil. Un plancher a 50 bps sous la cotation ne laissait pas la place a cet ecart.
 *
 * 300 bps le laisse. Le plancher reste reel, publie, et verifiable dans le calldata — il
 * cesse simplement d'etre un pari sur le temps qui passe entre la cotation et l'inclusion.
 */
export const TOLERANCE_BPS = Number(process.env.DEMO_TOLERANCE_BPS ?? 300);
/** L'echeance : 20 minutes de temps de CHAINE. Assez pour etre inclus, trop court pour etre rejoue. */
export const ECHEANCE_SECONDES = 1200n;

export type EtatTransaction = "PRETE" | "SANS_PLANCHER" | "RELECTURE_DIVERGENTE";

export interface TransactionConstruite {
  etat: EtatTransaction;
  transaction: { to: string; data: string; value: string } | null;
  /** la sortie cotee EN DIRECT sur le fork, avant tolerance. null = non cotee. */
  cotation: string | null;
  /** le plancher retenu apres tolerance. null quand aucune cotation n'a abouti. */
  plancher: string | null;
  tolerance_bps: number;
  /** l'echeance de l'`execute`, horodatage Unix en secondes (temps de chaine) */
  echeance: string | null;
  motif: string | null;
  /** ce que le decodeur du depot a relu dans le calldata construit */
  relecture: { pool_id: string; hook: string; sens: string; taille: string | null } | null;
}

function memeCle(a: PoolKey, b: PoolKey): boolean {
  return (
    a.currency0.toLowerCase() === b.currency0.toLowerCase() &&
    a.currency1.toLowerCase() === b.currency1.toLowerCase() &&
    a.fee === b.fee &&
    a.tickSpacing === b.tickSpacing &&
    a.hooks.toLowerCase() === b.hooks.toLowerCase()
  );
}

/** L'horodatage du dernier bloc du FORK. Le temps reel n'est pas le temps de la chaine. */
async function horodatageChaine(): Promise<bigint> {
  const b = await rpc<{ timestamp: string }>("eth_getBlockByNumber", ["latest", false]);
  return BigInt(b.timestamp);
}

/**
 * Construit le calldata du swap d'ORIGINE vers l'Universal Router pour une porte donnee.
 * Ne leve pas : tout echec ressort en etat nomme.
 */
export async function construireTransaction(porte: Porte): Promise<TransactionConstruite> {
  const amountIn = BigInt(porte.taille_wei);
  const zeroForOne = porte.sens === "0->1";

  // 1. la cotation vivante, sur le fork de la demo
  const c = await coter(
    { rpc: process.env.DEMO_RPC ?? "http://127.0.0.1:8546", timeoutMs: 10000 },
    { poolKey: porte.pool_key, zeroForOne, amountIn, quoter: V4_QUOTER_BASE },
  );
  const plancher =
    c.amountOut === null ? null : (c.amountOut * BigInt(10000 - TOLERANCE_BPS)) / 10000n;

  // 2. l'echeance, en temps de chaine
  let echeance: bigint | null = null;
  try {
    echeance = (await horodatageChaine()) + ECHEANCE_SECONDES;
  } catch {
    echeance = null;
  }

  // 3. l'encodage
  const data = encodeUniversalRouterExactInSingle(
    [{ poolKey: porte.pool_key, zeroForOne, amountIn, amountOutMinimum: plancher ?? 0n }],
    echeance === null ? {} : { deadline: echeance },
  );

  // 4. LA RELECTURE — par le decodeur du depot, pas par un miroir
  const relu = decodeUniversalRouterCalldata(data);
  const jambe = relu.legs[0];
  if (!relu.complete || relu.legs.length !== 1 || !jambe) {
    return {
      etat: "RELECTURE_DIVERGENTE",
      transaction: null,
      cotation: c.amountOut?.toString() ?? null,
      plancher: plancher?.toString() ?? null,
      tolerance_bps: TOLERANCE_BPS,
      echeance: echeance?.toString() ?? null,
      motif: `relecture_incomplete: ${relu.issues.map((i) => `${i.where}:${i.reason}`).join(" | ") || `${relu.legs.length}_jambes`}`,
      relecture: null,
    };
  }
  const relecture = {
    pool_id: jambe.poolId,
    hook: jambe.poolKey.hooks.toLowerCase(),
    sens: jambe.direction,
    taille: jambe.amountIn,
  };
  if (
    !memeCle(jambe.poolKey, porte.pool_key) ||
    jambe.poolId !== porte.pool_id ||
    jambe.direction !== porte.sens ||
    jambe.amountIn !== porte.taille_wei
  ) {
    return {
      etat: "RELECTURE_DIVERGENTE",
      transaction: null,
      cotation: c.amountOut?.toString() ?? null,
      plancher: plancher?.toString() ?? null,
      tolerance_bps: TOLERANCE_BPS,
      echeance: echeance?.toString() ?? null,
      motif: `relecture_divergente: attendu ${porte.pool_id}/${porte.hook}/${porte.sens}/${porte.taille_wei}, relu ${relecture.pool_id}/${relecture.hook}/${relecture.sens}/${relecture.taille}`,
      relecture,
    };
  }

  // 5. la monnaie d'entree decide de `value`. Se tromper de branche envoie une transaction
  //    sans les fonds, ou une transaction qui revert.
  const value = porte.monnaie_entree === ADRESSE_NULLE ? hex(amountIn) : "0x0";

  return {
    etat: plancher === null ? "SANS_PLANCHER" : "PRETE",
    transaction: { to: UNIVERSAL_ROUTER_BASE, data, value },
    cotation: c.amountOut?.toString() ?? null,
    plancher: plancher?.toString() ?? null,
    tolerance_bps: TOLERANCE_BPS,
    echeance: echeance?.toString() ?? null,
    motif:
      plancher === null
        ? `plancher_absent: ${c.raison ?? "cotation indisponible"} — amountOutMinimum vaut 0 dans ce calldata, ne l'envoie pas sur un reseau reel`
        : null,
    relecture,
  };
}
