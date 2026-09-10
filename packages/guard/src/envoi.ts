/**
 * DE LA PROPOSITION A LA TRANSACTION ENVOYABLE.
 *
 * `chercherAlternative` rendait un `calldata` — et rien d'autre. Aucun appelant ne pouvait en
 * faire un `eth_sendTransaction` : il manquait le destinataire, il manquait `value`, il
 * manquait la decision entre « payer en ETH natif » et « depenser un ERC-20 via Permit2 », et
 * il manquait le plancher de sortie. Un calldata sans ces quatre choses n'est pas une
 * substitution, c'est une demonstration.
 *
 * CE MODULE NE SIGNE RIEN ET N'ENVOIE RIEN. Il rend soit un objet `{to, data, value}` pret a
 * passer au portefeuille, soit un ETAT NOMME qui dit precisement ce qui manque. C'est la
 * regle dure n.3 d'alternative.ts, tenue jusqu'au bout : la derniere main sur la transaction
 * est celle de l'utilisateur.
 *
 * LES QUATRE CHOSES QU'IL REFUSE DE DEVINER
 *
 * 1. LE PLANCHER DE SORTIE. `amountOutMinimum` a zero rend la transaction signable a
 *    n'importe quel prix : c'est une invitation ecrite au sandwich. Et il ne peut PAS venir du
 *    corpus, epingle au bloc 50 614 000 : un plancher tire d'une cotation vieille de six jours
 *    est faux dans les deux sens. Il vient d'une cotation vivante (lecture.ts) ou il n'y a pas
 *    de transaction.
 *
 * 2. L'ECHEANCE. Le defaut de l'encodeur valait 0xffffffff — le 7 fevrier 2106. Une
 *    transaction sans echeance reelle peut etre retenue puis rejouee des heures plus tard, a
 *    un prix qui n'a plus rien a voir avec celui qu'on a montre.
 *
 * 3. LA MONNAIE D'ENTREE. Si c'est l'ETH natif, il faut `value` et il ne faut SURTOUT PAS de
 *    permit : Permit2 ne connait que les ERC-20. Si c'est un ERC-20, c'est l'inverse exact.
 *    Se tromper de branche produit soit une transaction qui revert, soit une transaction qui
 *    part sans les fonds.
 *
 * 4. LE NONCE PERMIT2. Non lu n'est pas zero : voir NONCE_NON_LU dans permit2.ts.
 *
 * Et une derniere garantie, avant de rendre quoi que ce soit : le calldata construit est
 * RELU par le decodeur de ce meme paquet, et la PoolKey relue est comparee a celle qu'on
 * voulait. Une regression de l'encodeur ne peut pas atteindre un portefeuille en silence.
 */
import type { Alternative } from "./alternative.js";
import { encodeUniversalRouterExactInSingle } from "./encode.js";
import { decodeUniversalRouterCalldata } from "./calldata.js";
import { ZERO_ADDRESS } from "./poolkey.js";
import {
  besoin,
  MONTANT_MAX_PERMIT2,
  PERMIT2,
  UNIVERSAL_ROUTER_BASE,
  type Besoin,
  type PermitSingle,
} from "./permit2.js";

export type EtatEnvoi =
  /** `{to, data, value}` est complet : le portefeuille peut l'envoyer tel quel */
  | "PRET"
  /** l'alternative ne propose rien (porte unique, deja la meilleure, pool inconnu…) */
  | "PAS_DE_PROPOSITION"
  /** aucune cotation vivante n'a ete fournie : pas de plancher, donc pas de transaction */
  | "SANS_PLANCHER"
  /** le jeton d'entree n'est pas approuve vers Permit2 : une vraie transaction d'abord */
  | "APPROBATION_REQUISE"
  /** approuve, mais il faut signer le permit — le message a signer est fourni */
  | "SIGNATURE_REQUISE"
  /** l'autorisation actuelle du routeur n'a pas ete lue : son nonce est inconnu */
  | "NONCE_NON_LU"
  /** ni permit signe, ni lecture d'etat Permit2 : on ne sait pas ou on en est */
  | "ETAT_PERMIT2_INCONNU"
  /** un permit a ete fourni pour un swap en ETH natif : Permit2 ne connait que les ERC-20 */
  | "PERMIT_SUR_MONNAIE_NATIVE"
  /** le calldata construit ne se relit pas comme la porte visee : on ne le rend pas */
  | "RELECTURE_DIVERGENTE";

export interface TransactionPrete {
  to: string;
  data: string;
  /** en hexadecimal, comme un portefeuille l'attend. "0x0" pour un ERC-20. */
  value: string;
}

export interface Envoi {
  etat: EtatEnvoi;
  raison: string;
  /** non nul UNIQUEMENT quand etat vaut PRET */
  transaction: TransactionPrete | null;
  /** ce qui reste a faire cote Permit2, quand c'est ce qui bloque */
  permit2: Besoin | null;
  /** la monnaie DEPENSEE par le swap propose */
  monnaieEntree: string | null;
  /** vrai quand la monnaie d'entree est l'ETH natif : `value` porte alors le montant */
  native: boolean;
  amountIn: string | null;
  /** le plancher retenu, apres tolerance */
  amountOutMinimum: string | null;
  /** la cotation vivante dont le plancher est tire, avant tolerance */
  cotation: string | null;
  toleranceBps: number | null;
  /** l'echeance de l'`execute`, horodatage Unix en secondes */
  deadline: string | null;
  /** la liste de commandes de l'Universal Router, pour qu'on voie l'ordre : 0x0a10 ou 0x10 */
  commandes: string | null;
}

/**
 * La tolerance par defaut, en points de base : 50 = 0,5 %.
 *
 * Ce n'est pas un chiffre du corpus, et il ne faut pas le presenter comme tel : c'est une
 * marge de prix entre le moment de la cotation et celui de l'inclusion. Elle est rendue dans
 * la reponse pour que l'ecran l'affiche et que l'utilisateur puisse la deplacer.
 */
export const TOLERANCE_BPS = 50;

/** L'echeance par defaut : 20 minutes. Assez pour etre inclus, trop court pour etre rejoue. */
export const ECHEANCE_SECONDES = 1200n;

export interface OptionsEnvoi {
  /** la sortie cotee EN DIRECT pour la porte proposee, a la meme taille. null = pas de plancher. */
  cotation: bigint | null;
  /** l'heure, en secondes Unix. Passee explicitement pour que les tests soient reproductibles. */
  maintenant: bigint;
  toleranceBps?: number;
  echeanceSecondes?: bigint;
  routeur?: string;
  permit2?: string;
  /** le proprietaire des fonds — necessaire seulement pour nommer l'etat Permit2 */
  proprietaire?: string;
  /** un permit DEJA signe, a presenter avant le swap dans la meme transaction */
  permit?: { permit: PermitSingle; signature: string };
  /**
   * L'etat Permit2 lu sur la chaine, quand aucun permit n'est encore signe. Les deux lectures
   * viennent de lecture.ts ; un null y signifie « non lu », jamais zero.
   */
  etatPermit2?: {
    allowanceVersPermit2: bigint | null;
    autorisationDuRouteur: { montant: bigint; expiration: bigint; nonce: bigint } | null;
  };
}

function socle(alt: Alternative): Envoi {
  return {
    etat: "PAS_DE_PROPOSITION",
    raison: "",
    transaction: null,
    permit2: null,
    monnaieEntree: null,
    native: false,
    amountIn: alt.proposee?.amountIn ?? null,
    amountOutMinimum: null,
    cotation: null,
    toleranceBps: null,
    deadline: null,
    commandes: null,
  };
}

/**
 * Le plancher : la cotation vivante, moins la tolerance. Arrondi VERS LE BAS.
 *
 * Arrondir vers le haut rendrait le plancher legerement plus exigeant que la tolerance
 * annoncee, et ferait revert des transactions qui devaient passer.
 */
export function plancher(cotation: bigint, toleranceBps: number): bigint {
  if (toleranceBps < 0 || toleranceBps >= 10000)
    throw new Error(`tolerance hors bornes : ${toleranceBps} bps`);
  return (cotation * BigInt(10000 - toleranceBps)) / 10000n;
}

/**
 * Rend la transaction de remplacement, ou dit exactement ce qui manque.
 *
 * L'appelant fait les lectures (lecture.ts) et passe leurs resultats ; ce module ne parle a
 * aucun reseau — c'est ce qui le rend testable sans noeud, et utilisable dans une extension.
 */
export function transactionDeRemplacement(alt: Alternative, opts: OptionsEnvoi): Envoi {
  const base = socle(alt);

  if (alt.etat !== "MEILLEURE_PORTE" || alt.proposee === null || alt.proposee.amountIn === null)
    return {
      ...base,
      etat: "PAS_DE_PROPOSITION",
      raison:
        `l'etat de l'alternative est ${alt.etat} : il n'y a pas de porte a proposer, donc pas de ` +
        `transaction a construire. « ${alt.raison.slice(0, 140)} »`,
    };

  const p: typeof alt.proposee & { amountIn: string } = { ...alt.proposee, amountIn: alt.proposee.amountIn };
  const amountIn = BigInt(p.amountIn);
  const monnaieEntree = (p.zeroForOne ? p.poolKey.currency0 : p.poolKey.currency1).toLowerCase();
  const native = monnaieEntree === ZERO_ADDRESS;
  const routeur = (opts.routeur ?? UNIVERSAL_ROUTER_BASE).toLowerCase();
  const tol = opts.toleranceBps ?? TOLERANCE_BPS;
  const deadline = opts.maintenant + (opts.echeanceSecondes ?? ECHEANCE_SECONDES);
  const b0 = { ...base, monnaieEntree, native, amountIn: p.amountIn };

  if (opts.cotation === null)
    return {
      ...b0,
      etat: "SANS_PLANCHER",
      raison:
        "aucune cotation vivante n'a ete fournie pour la porte proposee, donc aucun plancher de " +
        "sortie n'est calculable. Le corpus ne peut pas y servir : il est epingle au bloc " +
        `${alt.block_number} et sa colonne de sortie etait juste ce jour-la. Sans plancher, la ` +
        "transaction serait signable a n'importe quel prix — on ne la rend pas",
    };

  const minOut = plancher(opts.cotation, tol);
  const b1 = {
    ...b0,
    cotation: opts.cotation.toString(),
    toleranceBps: tol,
    amountOutMinimum: minOut.toString(),
    deadline: deadline.toString(),
  };

  if (minOut === 0n)
    return {
      ...b1,
      etat: "SANS_PLANCHER",
      raison:
        `la cotation vivante (${opts.cotation}) moins ${tol} bps de tolerance tombe a zero : le ` +
        "plancher n'en serait pas un. Cette taille est trop petite pour ce pool",
    };

  /* ------------------------------------------------- la branche de la monnaie */

  let permit: OptionsEnvoi["permit"] = undefined;
  let etatP: Besoin | null = null;

  if (native) {
    // Permit2 ne connait que les ERC-20 : sur l'ETH natif il n'y a rien a autoriser, et le
    // montant voyage dans `value`. Un permit ici serait accepte par l'encodeur et rejete par
    // la chaine — donc on refuse plutot que de le retirer en silence.
    if (opts.permit)
      return {
        ...b1,
        etat: "PERMIT_SUR_MONNAIE_NATIVE",
        raison:
          "un permit a ete fourni alors que la monnaie d'entree est l'ETH natif " +
          `(${ZERO_ADDRESS}). Permit2 ne gere que les ERC-20 : ce permit ferait revert la ` +
          "transaction. Sur l'ETH natif il n'y a rien a autoriser, le montant part dans `value`",
      };
  } else {
    if (opts.permit) {
      // Le permit doit porter LE jeton depense. Un permit sur un autre jeton passerait
      // l'encodeur sans rien autoriser du bon cote.
      const jetonDuPermit = opts.permit.permit.details.token.toLowerCase();
      if (jetonDuPermit !== monnaieEntree)
        return {
          ...b1,
          etat: "ETAT_PERMIT2_INCONNU",
          raison:
            `le permit fourni autorise ${jetonDuPermit} alors que ce swap depense ${monnaieEntree}. ` +
            "Il n'autoriserait rien du bon cote : la transaction reverterait au transfert",
        };
      if (opts.permit.permit.details.amount < amountIn)
        return {
          ...b1,
          etat: "ETAT_PERMIT2_INCONNU",
          raison:
            `le permit fourni autorise ${opts.permit.permit.details.amount} alors que ce swap ` +
            `depense ${amountIn} : il ne couvre pas le montant`,
        };
      if (opts.permit.permit.sigDeadline < opts.maintenant)
        return {
          ...b1,
          etat: "SIGNATURE_REQUISE",
          raison:
            `la signature du permit a expire (sigDeadline ${opts.permit.permit.sigDeadline}, il est ` +
            `${opts.maintenant}). Il faut re-signer : la chaine la rejetterait`,
        };
      permit = opts.permit;
    } else if (opts.etatPermit2) {
      etatP = besoin({
        token: monnaieEntree,
        montant: amountIn,
        chainId: alt.chain_id,
        spender: routeur,
        allowanceVersPermit2: opts.etatPermit2.allowanceVersPermit2,
        autorisationDuRouteur: opts.etatPermit2.autorisationDuRouteur,
        maintenant: opts.maintenant,
      });
      if (etatP.etat === "APPROBATION_REQUISE")
        return { ...b1, etat: "APPROBATION_REQUISE", raison: etatP.raison, permit2: etatP };
      if (etatP.etat === "NONCE_NON_LU")
        return { ...b1, etat: "NONCE_NON_LU", raison: etatP.raison, permit2: etatP };
      if (etatP.etat === "SIGNATURE_SUFFIT")
        return {
          ...b1,
          etat: "SIGNATURE_REQUISE",
          raison:
            etatP.raison +
            ". Le message a signer est fourni ; renvoie-le ici avec sa signature et la " +
            "transaction sera complete",
          permit2: etatP,
        };
      // DEJA_AUTORISE : le routeur peut deja depenser, aucune commande 0x0a n'est necessaire.
    } else {
      return {
        ...b1,
        etat: "ETAT_PERMIT2_INCONNU",
        raison:
          `ce swap depense un ERC-20 (${monnaieEntree}) : il faut soit un permit signe, soit les ` +
          "deux lectures on-chain (allowance du jeton vers Permit2, et autorisation du routeur " +
          "chez Permit2). Ni l'un ni les autres n'ont ete fournis — et on ne les suppose pas",
      };
    }
  }

  /* ---------------------------------------------------------- la construction */

  const data = encodeUniversalRouterExactInSingle(
    [
      {
        poolKey: p.poolKey,
        zeroForOne: p.zeroForOne,
        amountIn,
        amountOutMinimum: minOut,
      },
    ],
    { deadline, permit },
  );

  // La relecture. Un encodeur qui derive produirait une transaction que l'utilisateur
  // signerait sans que rien ne le dise — exactement la faute que le codec de l'instrument
  // evite en decodant ce qu'il vient d'ecrire.
  const relu = decodeUniversalRouterCalldata(data);
  const jambe = relu.legs[0];
  const attendu = p.poolKey;
  const divergence =
    !relu.complete
      ? `le calldata construit ne se relit pas jusqu'au bout : ${relu.issues.map((i) => i.where + ":" + i.reason).join(", ")}`
      : relu.legs.length !== 1
        ? `la relecture voit ${relu.legs.length} jambe(s) au lieu d'une`
        : !jambe
          ? "la relecture ne voit aucune jambe"
          : jambe.poolKey.hooks.toLowerCase() !== attendu.hooks.toLowerCase()
            ? `le hook relu (${jambe.poolKey.hooks}) n'est pas celui de la porte visee (${attendu.hooks})`
            : jambe.poolKey.currency0.toLowerCase() !== attendu.currency0.toLowerCase() ||
                jambe.poolKey.currency1.toLowerCase() !== attendu.currency1.toLowerCase()
              ? "les monnaies relues ne sont pas celles de la porte visee"
              : jambe.poolKey.fee !== attendu.fee || jambe.poolKey.tickSpacing !== attendu.tickSpacing
                ? `les frais/tickSpacing relus (${jambe.poolKey.fee}/${jambe.poolKey.tickSpacing}) ne sont pas ceux de la porte visee (${attendu.fee}/${attendu.tickSpacing})`
                : jambe.amountIn !== p.amountIn
                  ? `la taille relue (${jambe.amountIn}) n'est pas celle demandee (${p.amountIn})`
                  : jambe.zeroForOne !== p.zeroForOne
                    ? "le sens relu n'est pas celui de la porte visee"
                    : null;

  if (divergence !== null)
    return {
      ...b1,
      etat: "RELECTURE_DIVERGENTE",
      raison:
        `${divergence}. On ne rend pas une transaction qu'on ne sait pas relire : ce serait ` +
        "faire signer a l'utilisateur quelque chose que personne n'a verifie",
      permit2: etatP,
    };

  const commandes = permit ? "0x0a10" : "0x10";
  return {
    ...b1,
    etat: "PRET",
    raison:
      `porte ${p.poolId.slice(0, 10)}… (hook ${p.hook.slice(0, 10)}…), ${p.bps?.toFixed(2)} bps mesures ` +
      `a cette taille contre ${alt.actuelle.bps?.toFixed(2)} sur la porte d'origine. Plancher ` +
      `${minOut} (cotation vivante ${opts.cotation} moins ${tol} bps), echeance ${deadline}. ` +
      `Commandes ${commandes}${permit ? " : le permit passe AVANT le swap" : ""}. ` +
      "C'est toi qui signes",
    transaction: {
      to: routeur,
      data,
      value: native ? "0x" + amountIn.toString(16) : "0x0",
    },
    permit2: etatP,
    commandes,
  };
}

/**
 * Le message a faire signer, quand l'etat vaut SIGNATURE_REQUISE et qu'on veut le construire
 * sans repasser par `transactionDeRemplacement`. C'est le meme `besoin()` que ci-dessus, expose
 * pour que l'API puisse le rendre seul.
 */
export function permitAsigner(args: {
  token: string;
  montant: bigint;
  chainId: number;
  spender?: string;
  allowanceVersPermit2: bigint | null;
  autorisationDuRouteur: { montant: bigint; expiration: bigint; nonce: bigint } | null;
  maintenant: bigint;
}): Besoin {
  return besoin({ ...args, spender: args.spender ?? UNIVERSAL_ROUTER_BASE });
}

export { PERMIT2, MONTANT_MAX_PERMIT2 };
