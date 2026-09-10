/**
 * LA PREUVE DE POSSESSION D'UNE ADRESSE, SANS MOT DE PASSE.
 *
 * Un compte TARE n'a pas de mot de passe : l'identite EST le portefeuille. On envoie un
 * message a signer, l'utilisateur le signe avec MetaMask ou Rainbow, et on RECUPERE l'adresse
 * depuis la signature. S'il n'a pas la cle, il ne peut pas produire la signature — c'est tout
 * le mecanisme, et il n'y a rien a voler dans notre base.
 *
 * Deux details qui decident si c'est sur ou seulement joli :
 *
 *   1. LE MESSAGE EST PREFIXE. `personal_sign` ne signe pas le texte brut : il signe
 *      keccak("\x19Ethereum Signed Message:\n" + longueur + texte). Sans ce prefixe, une
 *      signature obtenue pour un message anodin pourrait etre rejouee comme une transaction.
 *      C'est la raison d'etre du prefixe, et l'omettre serait le trou de securite classique.
 *   2. LE NONCE EST A USAGE UNIQUE et lie a l'adresse. Sans lui, une signature captee une
 *      fois ouvre le compte pour toujours.
 *
 * On n'utilise ni viem ni ethers : `@noble/curves` et `@noble/hashes` sont les primitives que
 * viem lui-meme emploie, elles etaient deja dans l'arbre, et on les declare explicitement
 * plutot que d'en dependre par accident.
 */
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

export class SignatureInvalide extends Error {}

const hex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

function octets(h: string): Uint8Array {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  if (s.length % 2 !== 0 || /[^0-9a-fA-F]/.test(s))
    throw new SignatureInvalide(`hexadecimal malforme (${s.length} caracteres)`);
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Le hash que `personal_sign` signe reellement. Le prefixe n'est pas decoratif. */
export function hashPersonalSign(message: string): Uint8Array {
  const corps = new TextEncoder().encode(message);
  const prefixe = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${corps.length}`);
  const tout = new Uint8Array(prefixe.length + corps.length);
  tout.set(prefixe, 0);
  tout.set(corps, prefixe.length);
  return keccak_256(tout);
}

/** L'adresse EVM d'une cle publique non compressee (65 octets, 0x04 en tete). */
function adresseDe(pubNonCompressee: Uint8Array): string {
  return "0x" + hex(keccak_256(pubNonCompressee.slice(1))).slice(-40);
}

/**
 * De quelle adresse vient cette signature ?
 *
 * Rend l'adresse en minuscules. Leve si la signature est malformee ou si la recuperation
 * echoue — on ne rend JAMAIS une adresse nulle ou vide en cas d'echec, parce qu'une adresse
 * vide comparee a une adresse vide serait une authentification reussie.
 */
export function adresseQuiASigne(message: string, signature: string): string {
  const sig = octets(signature);
  if (sig.length !== 65)
    throw new SignatureInvalide(`signature de ${sig.length} octets, 65 attendus (r,s,v)`);

  const r = sig.slice(0, 32);
  const s = sig.slice(32, 64);
  let v = sig[64]!;
  // Les portefeuilles ecrivent v = 27 ou 28 ; certains, 0 ou 1. Les deux formes existent
  // dans la nature, et refuser l'une couperait des utilisateurs reels.
  if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1)
    throw new SignatureInvalide(`octet de recuperation invalide : ${sig[64]}`);

  const hash = hashPersonalSign(message);
  let pub: Uint8Array;
  try {
    const brute = new Uint8Array(64);
    brute.set(r, 0);
    brute.set(s, 32);
    pub = secp256k1.Signature.fromCompact(brute)
      .addRecoveryBit(v)
      .recoverPublicKey(hash)
      .toRawBytes(false);
  } catch (e) {
    throw new SignatureInvalide(`recuperation impossible : ${(e as Error).message}`);
  }
  return adresseDe(pub);
}

/**
 * Le texte a signer. Il NOMME le service, l'adresse et le nonce : une signature obtenue
 * ailleurs ne peut pas etre rejouee ici, et l'utilisateur voit ce qu'il approuve.
 *
 * IL NE PORTE PAS D'HORODATAGE, et c'est deliberе. Une premiere version en mettait un — et
 * la verification le reconstruisait avec l'heure COURANTE, donc un autre texte, donc aucune
 * signature n'aurait jamais verifie. Toute donnee du message doit etre reconstructible a
 * l'identique au moment de verifier : le nonce l'est, une horloge non. La duree de vie est
 * portee par la base (`expire_le`), la ou elle est verifiable.
 */
export function messageAsigner(adresse: string, nonce: string): string {
  return [
    "TARE — connexion a votre compte",
    "",
    `Adresse : ${adresse.toLowerCase()}`,
    `Nonce : ${nonce}`,
    "",
    "Ce nonce ne sert qu'une fois et expire dans 5 minutes.",
    "Signer ce message ne coute rien et n'autorise aucune depense.",
  ].join("\n");
}

/** true si l'adresse est une adresse EVM bien formee. */
export function estAdresse(a: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}
