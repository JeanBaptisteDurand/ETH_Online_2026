/**
 * Ce qui dort sur le disque — et surtout ce qui n'y dort PAS.
 *
 * Le point de tout l'exercice : la cle qui signe les paiements x402 de TARE ne doit plus
 * etre lisible dans un fichier. Si on remplaçait `HEDERA_PAYER_PRIVATE_KEY=0x...` par le
 * secret chiffre PLUS sa cle de dechiffrement a cote, on n'aurait rien gagne — juste
 * deplace le probleme d'une ligne.
 *
 * Donc : `walletSyncEncryptionKey` n'est JAMAIS ecrit. Il n'est pas non plus perdu — le
 * membre le recupere en s'authentifiant aupres du backend de Ledger, qui lui rend le flux
 * resolu de la trustchain (`restoreTrustchain`). Ce qui reste sur le disque, c'est :
 *
 *   - la cle privee du MEMBRE : revocable. `removeMember` sur la trustchain coupe l'acces
 *     de cette machine sans toucher ni la graine, ni les autres membres, ni le secret.
 *   - le `rootId` : un identifiant public.
 *   - le secret SCELLE : inutilisable sans le membre.
 *
 * Ce n'est pas de la magie, et il ne faut pas le vendre comme telle : un attaquant qui
 * vole le fichier de membre ET peut joindre le backend peut dechiffrer. Ce qu'on gagne est
 * precis, et c'est deja beaucoup : le secret n'est plus en clair, l'acces est **revocable**
 * et **attribuable a une machine**, et l'amorcage a exige une approbation materielle.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

export const SCHEMA = "tare.keyring.v1";

export interface MemberCredentials {
  pubkey: string;
  privatekey: string;
}

export interface SealedRing {
  v: typeof SCHEMA;
  /** quand l'amorcage materiel a eu lieu */
  scelle_le: string;
  /** l'appareil qui a approuve. « Speculos … » dit explicitement que ce n'est pas un Nano. */
  appareil: string;
  /** true seulement pour un appareil physique. Jamais suppose. */
  physique: boolean;
  /** le backend LKRP utilise : prod et staging n'acceptent pas les memes attestations */
  backend: string;
  /** identifiant public de la trustchain */
  rootId: string;
  /** le membre. Revocable. */
  membre: MemberCredentials;
  /** le nom du secret, pour qu'un humain sache ce qu'il ouvre */
  nom: string;
  /** le secret chiffre, en hexadecimal */
  scelle: string;
}

/**
 * Refuse de lire un etat qui contiendrait une cle de chiffrement : ce serait le signe
 * qu'une version anterieure l'a ecrite, et le fichier ne vaudrait plus rien.
 */
export function parseRing(raw: string): SealedRing {
  const o = JSON.parse(raw) as Record<string, unknown>;
  if (o.v !== SCHEMA) throw new Error(`schema inattendu: ${String(o.v)} (attendu ${SCHEMA})`);
  if ("walletSyncEncryptionKey" in o || "cle_de_chiffrement" in o)
    throw new Error(
      "ce fichier contient une cle de chiffrement en clair — il ne protege rien. " +
        "Rescelle le secret (`ring seal`) et detruis celui-ci.",
    );
  for (const k of ["rootId", "membre", "scelle", "nom", "backend"]) {
    if (!o[k]) throw new Error(`champ manquant dans l'etat du trousseau: ${k}`);
  }
  const m = o.membre as Record<string, unknown>;
  if (!m.pubkey || !m.privatekey) throw new Error("credentials du membre incomplets");
  return o as unknown as SealedRing;
}

export function readRing(path: string): SealedRing {
  if (!existsSync(path)) throw new Error(`aucun trousseau a ${path} — lance d'abord: ring seal`);
  return parseRing(readFileSync(path, "utf8"));
}

export function writeRing(path: string, ring: SealedRing): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(ring, null, 2) + "\n");
  // 0600 : la cle du membre est un secret, meme si elle est revocable.
  chmodSync(path, 0o600);
}

export function ringExists(path: string): boolean {
  return existsSync(path);
}
