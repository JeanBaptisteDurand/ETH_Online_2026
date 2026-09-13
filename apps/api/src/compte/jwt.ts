/**
 * LE JETON DE SESSION, EN JWT — SIGNÉ, DATÉ, ET RÉVOCABLE.
 *
 * POURQUOI LES DEUX À LA FOIS.
 *
 * Un JWT seul se vérifie sans toucher la base : la signature suffit. C'est sa force, et c'est
 * exactement ce qui le rend impossible à révoquer — un jeton volé reste valable jusqu'à son
 * `exp`, et personne ne peut l'arrêter. Un jeton opaque, lui, se révoque d'une écriture, mais
 * il oblige à interroger la base à chaque requête et ne porte rien de lisible.
 *
 * On prend les deux. Le JWT porte `sub`, `adresse`, `iat`, `exp` — un client peut lire à quelle
 * adresse il est connecté et jusqu'à quand, sans appeler personne. Et il porte un `jti` : c'est
 * LUI que la table `sessions` connaît, par son sha256. Révoquer une session, c'est marquer ce
 * `jti` ; le JWT devient alors inutile alors même que sa signature reste valide.
 *
 * HS256 À LA MAIN, SANS DÉPENDANCE. `node:crypto` fait tout : un HMAC-SHA256 et deux encodages
 * base64url. Ajouter une bibliothèque de 200 ko pour trente lignes serait une dépendance de
 * plus à auditer, sur le chemin de l'authentification — le pire endroit pour en avoir une.
 *
 * CE QUI EST REFUSÉ, ET POURQUOI CHAQUE REFUS DIT SA RAISON :
 *   - `alg` qui n'est pas exactement `HS256` — la faille `alg: "none"` a vingt ans et elle
 *     marche encore sur les vérificateurs qui font confiance à l'en-tête ;
 *   - une signature qui ne correspond pas, comparée en temps CONSTANT ;
 *   - un `exp` dépassé ;
 *   - tout jeton qui n'a pas exactement trois segments.
 */
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/** Ce que le jeton transporte. Rien de secret : un JWT se lit sans clé. */
export interface Charge {
  /** l'identifiant du compte */
  sub: string;
  /** l'adresse du portefeuille, pour que le client sache qui il est sans appeler l'API */
  adresse: string;
  /** l'identifiant de CETTE session — la table `sessions` en connaît le sha256 */
  jti: string;
  /** émis le, en secondes */
  iat: number;
  /** expire le, en secondes */
  exp: number;
}

export type Refus =
  | "forme"
  | "algorithme"
  | "signature"
  | "expire"
  | "charge";

const b64url = (b: Buffer): string => b.toString("base64url");
const deB64url = (s: string): Buffer => Buffer.from(s, "base64url");

/**
 * LE SECRET. `TARE_JWT_SECRET` s'il est posé, sinon un secret tiré au démarrage.
 *
 * Le repli n'est pas une commodité : il fait que les sessions ne survivent PAS à un
 * redémarrage du serveur, ce qui est le comportement sûr quand personne n'a configuré de
 * secret. Le contraire — un secret par défaut écrit dans le code — serait une clé publique.
 */
const SECRET: Buffer = (() => {
  const s = process.env["TARE_JWT_SECRET"]?.trim();
  if (s && s.length >= 32) return Buffer.from(s, "utf8");
  if (s) {
    throw new Error(
      "TARE_JWT_SECRET est trop court : 32 caracteres au minimum. Un secret court se casse hors ligne.",
    );
  }
  return randomBytes(48);
})();

/** Vrai quand le secret vient de l'environnement — l'API le dit dans son état. */
export const SECRET_CONFIGURE = Boolean(process.env["TARE_JWT_SECRET"]?.trim());

const signature = (entete: string, charge: string): string =>
  b64url(createHmac("sha256", SECRET).update(`${entete}.${charge}`).digest());

/** Signe une charge et rend le JWT compact. */
export function signer(c: Charge): string {
  const entete = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }), "utf8"));
  const charge = b64url(Buffer.from(JSON.stringify(c), "utf8"));
  return `${entete}.${charge}.${signature(entete, charge)}`;
}

/**
 * Vérifie et décode. Rend la charge, ou la RAISON du refus — jamais `null` tout court : un
 * appelant qui ne sait pas pourquoi son jeton est refusé devine, et il devine mal.
 */
export function verifier(jeton: string, maintenant = Date.now()): Charge | { refus: Refus } {
  const parts = jeton.split(".");
  if (parts.length !== 3) return { refus: "forme" };
  const [entete, charge, sig] = parts as [string, string, string];

  let tete: unknown;
  try {
    tete = JSON.parse(deB64url(entete).toString("utf8"));
  } catch {
    return { refus: "forme" };
  }
  // `alg: none` reste la faille la plus vieille et la plus servie : on n'accepte QUE HS256,
  // et on ne lit l'en-tete que pour le refuser, jamais pour choisir un algorithme.
  if (!tete || typeof tete !== "object" || (tete as { alg?: unknown }).alg !== "HS256") {
    return { refus: "algorithme" };
  }

  const attendue = deB64url(signature(entete, charge));
  const donnee = deB64url(sig);
  if (attendue.length !== donnee.length || !timingSafeEqual(attendue, donnee)) {
    return { refus: "signature" };
  }

  let c: unknown;
  try {
    c = JSON.parse(deB64url(charge).toString("utf8"));
  } catch {
    return { refus: "charge" };
  }
  const o = c as Partial<Charge>;
  if (
    typeof o.sub !== "string" ||
    typeof o.adresse !== "string" ||
    typeof o.jti !== "string" ||
    typeof o.iat !== "number" ||
    typeof o.exp !== "number"
  ) {
    return { refus: "charge" };
  }
  if (o.exp * 1000 <= maintenant) return { refus: "expire" };
  return o as Charge;
}

/** La phrase qui accompagne un refus, pour que l'API ne rende jamais un 401 muet. */
export const direRefus = (r: Refus): string =>
  ({
    forme: "le jeton n'a pas la forme d'un JWT : trois segments separes par un point",
    algorithme: "algorithme refuse : seul HS256 est accepte",
    signature: "signature invalide : ce jeton n'a pas ete emis par ce serveur",
    expire: "jeton expire — ouvrez une nouvelle session",
    charge: "charge illisible ou incomplete",
  })[r];
