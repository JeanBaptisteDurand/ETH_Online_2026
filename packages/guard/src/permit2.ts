/**
 * PERMIT2 — UNE SEULE SIGNATURE AU LIEU DE DEUX TRANSACTIONS.
 *
 * Ce module ne rend pas la substitution possible : elle l'est deja, `alternative.ts` construit
 * le calldata de remplacement et le decodeur du meme paquet le relit. Ce que Permit2 apporte
 * est un GAIN D'USAGE, et il faut le dire ainsi plutot que de le vendre comme une brique
 * manquante.
 *
 * Sans Permit2, remplacer une transaction demande a l'utilisateur DEUX envois : un `approve`
 * du jeton vers l'Universal Router, puis le swap. Avec, il SIGNE un message hors chaine — qui
 * ne coute rien et ne peut pas echouer — et le routeur presente cette signature lui-meme,
 * dans la meme transaction que le swap. Un envoi, une signature.
 *
 * CE QUE PERMIT2 NE DISPENSE PAS DE FAIRE, et c'est le piege : le jeton doit avoir ete
 * approuve **vers le contrat Permit2** une fois pour toutes. Cette approbation-la est une
 * vraie transaction, et l'utilisateur peut ne l'avoir jamais faite. On ne peut pas la deviner
 * ni la contourner : `etatPermit2` la nomme, et l'ecran doit la demander AVANT de proposer une
 * signature qui echouerait. Promettre « une seule signature » a quelqu'un qui n'a pas encore
 * approuve Permit2 serait faux.
 *
 * Le domaine EIP-712 de Permit2 n'a PAS de champ `version` — c'est une particularite du
 * contrat, et l'ajouter changerait le hash du domaine, donc rendrait toute signature invalide
 * sans qu'aucune erreur ne le dise.
 */
import { keccak256, toHex } from "./keccak.js";

/** Permit2, a la meme adresse sur toutes les chaines ou il est deploye. */
export const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";

/** L'Universal Router sur Base — le `spender` du permit. */
export const UNIVERSAL_ROUTER_BASE = "0x6ff5693b99212da76ad316178a184ab56d299b43";

/** La commande de l'Universal Router qui presente un permit. */
export const COMMAND_PERMIT2_PERMIT = 0x0a;

/** `uint160` maximum : le montant « tout », tel que Permit2 l'entend. */
export const MONTANT_MAX_PERMIT2 = (1n << 160n) - 1n;
/** `uint48` maximum : l'expiration « jamais ». */
export const EXPIRATION_MAX = (1n << 48n) - 1n;

export interface DetailsPermit {
  /** le jeton a autoriser — celui qu'on DEPENSE, pas celui qu'on recoit */
  token: string;
  /** uint160 */
  amount: bigint;
  /** uint48, horodatage Unix en secondes */
  expiration: bigint;
  /** uint48 ; il vient du contrat Permit2 (allowance(owner,token,spender).nonce) */
  nonce: bigint;
}

export interface PermitSingle {
  details: DetailsPermit;
  /** qui pourra depenser : l'Universal Router */
  spender: string;
  /** uint256, au-dela duquel la SIGNATURE elle-meme n'est plus valable */
  sigDeadline: bigint;
}

/* ------------------------------------------------------------------ EIP-712 */

const enc = new TextEncoder();
const hashTexte = (s: string): Uint8Array => keccak256(enc.encode(s));

/** Les types, dans l'ordre exact ou Permit2 les hache. Un ordre different change le hash. */
export const TYPE_DETAILS = "PermitDetails(address token,uint160 amount,uint48 expiration,uint48 nonce)";
export const TYPE_SINGLE =
  "PermitSingle(PermitDetails details,address spender,uint256 sigDeadline)" + TYPE_DETAILS;

function mot(v: bigint | number): Uint8Array {
  let h = BigInt(v).toString(16);
  if (h.length > 64) throw new Error(`valeur trop grande pour un mot de 32 octets : ${v}`);
  h = h.padStart(64, "0");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function motAdresse(a: string): Uint8Array {
  const s = a.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(s)) throw new Error(`adresse malformee : ${a}`);
  return mot(BigInt("0x" + s));
}

function coller(parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * Le separateur de domaine de Permit2.
 *
 * ATTENTION : `EIP712Domain(string name,uint256 chainId,address verifyingContract)` — SANS
 * `version`. Permit2 n'en declare pas, et en ajouter un changerait ce hash, donc invaliderait
 * toute signature sans qu'aucun message d'erreur ne le dise. C'est le genre de detail qui
 * coute une journee.
 */
export function domaineHash(chainId: number, permit2 = PERMIT2): Uint8Array {
  return keccak256(
    coller([
      hashTexte("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
      hashTexte("Permit2"),
      mot(chainId),
      motAdresse(permit2),
    ]),
  );
}

/** `hashStruct(PermitDetails)`. */
export function detailsHash(d: DetailsPermit): Uint8Array {
  return keccak256(
    coller([hashTexte(TYPE_DETAILS), motAdresse(d.token), mot(d.amount), mot(d.expiration), mot(d.nonce)]),
  );
}

/** `hashStruct(PermitSingle)`. */
export function permitSingleHash(p: PermitSingle): Uint8Array {
  return keccak256(
    coller([hashTexte(TYPE_SINGLE), detailsHash(p.details), motAdresse(p.spender), mot(p.sigDeadline)]),
  );
}

/** Le digest EIP-712 complet : `keccak(0x19 0x01 || domaine || struct)`. C'est CA qui est signe. */
export function digestPermit(p: PermitSingle, chainId: number, permit2 = PERMIT2): string {
  return toHex(
    keccak256(coller([Uint8Array.from([0x19, 0x01]), domaineHash(chainId, permit2), permitSingleHash(p)])),
  );
}

/**
 * Le message EIP-712 a passer a `eth_signTypedData_v4`, tel qu'un portefeuille l'attend.
 * On le rend en entier plutot que de laisser le client le reconstruire : deux
 * reconstructions divergeraient un jour, et la signature ne verifierait plus — c'est
 * exactement l'erreur qui a ete faite sur le message de connexion au compte.
 */
export function messageTypeAsigner(p: PermitSingle, chainId: number, permit2 = PERMIT2) {
  return {
    domain: { name: "Permit2", chainId, verifyingContract: permit2 },
    types: {
      PermitDetails: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint160" },
        { name: "expiration", type: "uint48" },
        { name: "nonce", type: "uint48" },
      ],
      PermitSingle: [
        { name: "details", type: "PermitDetails" },
        { name: "spender", type: "address" },
        { name: "sigDeadline", type: "uint256" },
      ],
    },
    primaryType: "PermitSingle" as const,
    message: {
      details: {
        token: p.details.token,
        amount: p.details.amount.toString(),
        expiration: p.details.expiration.toString(),
        nonce: p.details.nonce.toString(),
      },
      spender: p.spender,
      sigDeadline: p.sigDeadline.toString(),
    },
  };
}

/* ------------------------------------------- l'entree de la commande 0x0a */

/**
 * `abi.encode(PermitSingle, bytes signature)` — l'entree de la commande PERMIT2_PERMIT.
 *
 * La struct est en tete (statique sauf `details`, lui-meme statique), la signature est
 * dynamique et vient apres, avec son offset.
 */
export function encodePermit2PermitInput(p: PermitSingle, signature: string): Uint8Array {
  const sig = signature.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]*$/.test(sig) || sig.length % 2 !== 0)
    throw new Error(`signature malformee : ${signature.slice(0, 16)}…`);
  const octets = new Uint8Array(sig.length / 2);
  for (let i = 0; i < octets.length; i++) octets[i] = parseInt(sig.slice(i * 2, i * 2 + 2), 16);

  // PermitSingle occupe 5 mots : token, amount, expiration, nonce, spender, sigDeadline
  // -> 6 mots en realite. L'offset de la signature suit donc 7 mots (6 + son propre offset).
  const tete = coller([
    motAdresse(p.details.token),
    mot(p.details.amount),
    mot(p.details.expiration),
    mot(p.details.nonce),
    motAdresse(p.spender),
    mot(p.sigDeadline),
  ]);
  const offset = tete.length + 32;
  const rembourrage = (32 - (octets.length % 32)) % 32;
  return coller([
    tete,
    mot(offset),
    mot(octets.length),
    octets,
    new Uint8Array(rembourrage),
  ]);
}

/* ------------------------------------------------- ce qui reste a l'utilisateur */

export type EtatPermit2 =
  /** le jeton n'est pas approuve vers Permit2 : une VRAIE transaction est requise d'abord */
  | "APPROBATION_REQUISE"
  /** approuve, et l'autorisation du routeur couvre le montant : rien a signer */
  | "DEJA_AUTORISE"
  /** approuve, mais l'autorisation manque ou expire : une signature suffit */
  | "SIGNATURE_SUFFIT";

export interface Besoin {
  etat: EtatPermit2;
  raison: string;
  /** la transaction d'approbation a envoyer, quand il en faut une */
  approbation: { to: string; data: string } | null;
  /** le message a signer, quand une signature suffit */
  aSigner: ReturnType<typeof messageTypeAsigner> | null;
}

/** `approve(address,uint256)` du jeton vers Permit2, montant maximum. */
export function calldataApprobation(): string {
  // keccak("approve(address,uint256)")[0..4] = 0x095ea7b3
  return (
    "0x095ea7b3" +
    toHex(motAdresse(PERMIT2)).slice(2) +
    "f".repeat(64) // uint256 max : l'approbation vers Permit2 se fait une fois pour toutes
  );
}

/**
 * Ce qu'il reste a faire, vu l'etat lu sur la chaine.
 *
 * `allowanceVersPermit2` et `autorisationDuRouteur` sont LUS, jamais supposes. Un null n'est
 * pas un zero : si la lecture n'a pas abouti, on rend APPROBATION_REQUISE avec la raison —
 * proposer une signature qui echouerait serait pire que demander une approbation de trop.
 */
export function besoin(args: {
  token: string;
  montant: bigint;
  chainId: number;
  spender?: string;
  /** allowance(utilisateur -> Permit2) sur le jeton ERC-20. null = non lu. */
  allowanceVersPermit2: bigint | null;
  /** ce que Permit2 autorise deja au routeur, et jusqu'a quand. null = non lu. */
  autorisationDuRouteur: { montant: bigint; expiration: bigint; nonce: bigint } | null;
  maintenant?: bigint;
}): Besoin {
  const spender = args.spender ?? UNIVERSAL_ROUTER_BASE;
  const now = args.maintenant ?? BigInt(Math.floor(Date.now() / 1000));

  if (args.allowanceVersPermit2 === null)
    return {
      etat: "APPROBATION_REQUISE",
      raison:
        "l'autorisation du jeton vers Permit2 n'a pas pu etre lue. On ne suppose pas qu'elle existe : " +
        "proposer une signature qui echouerait serait pire que demander une approbation de trop",
      approbation: { to: args.token, data: calldataApprobation() },
      aSigner: null,
    };

  if (args.allowanceVersPermit2 < args.montant)
    return {
      etat: "APPROBATION_REQUISE",
      raison:
        `ce jeton n'est pas encore approuve vers Permit2 (${args.allowanceVersPermit2} lu, ${args.montant} requis). ` +
        "C'est une vraie transaction, a envoyer UNE fois pour ce jeton — Permit2 ne la remplace pas",
      approbation: { to: args.token, data: calldataApprobation() },
      aSigner: null,
    };

  const a = args.autorisationDuRouteur;
  if (a && a.montant >= args.montant && a.expiration > now)
    return {
      etat: "DEJA_AUTORISE",
      raison: `le routeur est deja autorise pour ${a.montant} jusqu'a ${a.expiration} : rien a signer`,
      approbation: null,
      aSigner: null,
    };

  const permit: PermitSingle = {
    details: {
      token: args.token,
      amount: MONTANT_MAX_PERMIT2,
      // 30 jours : assez pour ne pas re-signer a chaque swap, assez court pour que
      // l'autorisation ne traine pas indefiniment si la cle est perdue.
      expiration: now + 30n * 86400n,
      nonce: a ? a.nonce : 0n,
    },
    spender,
    // 30 minutes : la SIGNATURE elle-meme perime vite, meme si l'autorisation dure.
    sigDeadline: now + 1800n,
  };
  return {
    etat: "SIGNATURE_SUFFIT",
    raison: a
      ? `autorisation du routeur insuffisante ou expiree (${a.montant} jusqu'a ${a.expiration}) : une signature la renouvelle`
      : "aucune autorisation du routeur lue : une signature suffit, sans transaction",
    approbation: null,
    aSigner: messageTypeAsigner(permit, args.chainId),
  };
}
