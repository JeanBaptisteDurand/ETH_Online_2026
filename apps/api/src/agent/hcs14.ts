// HCS-14 — L'IDENTITE D'AGENT, CALCULEE ET NON DECLAREE.
//
// La piste de paiement de TARE vit deja sur un topic HCS : chaque lot de mesures y depose son
// empreinte, son nombre d'unites et son hash de reglement. Il y manquait une chose — QUI a
// produit ces mesures. « Le compte 0.0.10367920 » repond a « qui a paye », pas a « quel
// service ». HCS-14 donne cette reponse sous une forme qu'un tiers peut RECALCULER au lieu
// de nous croire : un identifiant derive des champs de l'agent, pas attribue par un annuaire.
//
//   uaid:aid:<base58(sha384(json canonique))>;registry=…;proto=…;nativeId=…;uid=…
//
// La specification : https://hol.org/docs/standards/hcs-14/
//
// CE QUE LA SPECIFICATION NE DONNE PAS, et qu'il faut dire :
//
//   1. Elle publie deux vecteurs de test AVEC leurs entrees mais SANS leurs empreintes. Il
//      n'existe donc aucun resultat de reference contre lequel se comparer. Nos tests
//      valident la canonicalisation regle par regle et le base58 contre les vecteurs
//      standard de Bitcoin plus une implementation independante (bs58) — pas contre un
//      resultat publie par la norme, qui n'existe pas. C'est une limite reelle, pas un
//      detail : deux implementations conformes au texte pourraient diverger sans que ni
//      l'une ni l'autre ne le sache.
//   2. Son exemple de « JSON canonique » montre les cles dans l'ordre skills, name,
//      nativeId, protocol, registry, version — c'est-a-dire PAS trie. Son pseudo-code, lui,
//      fait `JSON.stringify(canonical, Object.keys(canonical).sort())`, qui trie. Les deux
//      se contredisent. On suit le PSEUDO-CODE, parce que c'est lui qui est executable, et
//      on ecrit ici que l'autre lecture existe.
//
// Le module ne fait aucun reseau et ne lit aucune variable d'environnement : l'identite est
// une fonction pure de ses champs, sinon elle ne serait pas verifiable.

import { createHash } from "node:crypto";

/** L'alphabet de Bitcoin. La norme dit « Base58 » sans nommer la variante ; c'est celle-la
 *  que `bs58` implemente, et la seule que « Base58 » designe sans qualificatif. */
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58 « check-less ». Les octets nuls de tete deviennent des « 1 », un par octet. */
export function base58(octets: Uint8Array): string {
  if (octets.length === 0) return "";

  let zeros = 0;
  while (zeros < octets.length && octets[zeros] === 0) zeros++;

  // Division euclidienne repetee par 58 sur une base 256 posee a la main. Passer par un
  // BigInt perdrait les zeros de tete, qui portent de l'information en base58.
  const chiffres: number[] = [];
  for (let i = zeros; i < octets.length; i++) {
    let report = octets[i]!;
    for (let j = 0; j < chiffres.length; j++) {
      const x = chiffres[j]! * 256 + report;
      chiffres[j] = x % 58;
      report = (x / 58) | 0;
    }
    while (report > 0) {
      chiffres.push(report % 58);
      report = (report / 58) | 0;
    }
  }

  let out = "1".repeat(zeros);
  for (let i = chiffres.length - 1; i >= 0; i--) out += ALPHABET[chiffres[i]!];
  return out;
}

/** Les six champs, et eux seuls, qui entrent dans l'empreinte. */
export interface ChampsAgent {
  registry: string;
  name: string;
  version: string;
  protocol: string;
  nativeId: string;
  skills: number[];
}

/** Ce qui s'ajoute en parametres de routage, et qui n'entre PAS dans l'empreinte. */
export interface Identite extends ChampsAgent {
  /** identifiant dans le registre ; « 0 » quand il n'y en a pas */
  uid?: string;
  domain?: string;
}

export interface Canonique {
  name: string;
  nativeId: string;
  protocol: string;
  registry: string;
  skills: number[];
  version: string;
}

/**
 * La forme canonique : minuscules sur `registry` et `protocol`, espaces rognes partout,
 * comptences triees en NOMBRES, cles triees.
 */
export function canonique(a: ChampsAgent): Canonique {
  for (const champ of ["registry", "name", "version", "protocol", "nativeId"] as const) {
    if (!a[champ] || !a[champ].trim()) throw new Error(`champ HCS-14 manquant : ${champ}`);
  }
  return {
    name: a.name.trim(),
    nativeId: a.nativeId.trim(),
    protocol: a.protocol.toLowerCase().trim(),
    registry: a.registry.toLowerCase().trim(),
    // Un tri par defaut trierait en CHAINES : [0, 17, 9] deviendrait [0, 17, 9] et non
    // [0, 9, 17]. Deux agents aux memes competences auraient deux identites.
    skills: [...(a.skills ?? [])].sort((x, y) => x - y),
    version: a.version.trim(),
  };
}

/** Le JSON exactement tel qu'il est hache : cles triees, aucune espace. */
export function jsonCanonique(a: ChampsAgent): string {
  const c = canonique(a);
  return JSON.stringify(c, Object.keys(c).sort() as (keyof Canonique)[]);
}

/** L'empreinte seule, sans le prefixe ni les parametres. */
export function empreinte(a: ChampsAgent): string {
  return base58(createHash("sha384").update(jsonCanonique(a), "utf8").digest());
}

/** L'identifiant complet. */
export function uaid(a: Identite): string {
  const params = [
    `registry=${a.registry}`,
    `proto=${a.protocol}`,
    `nativeId=${a.nativeId}`,
    `uid=${a.uid ?? "0"}`,
  ];
  if (a.domain) params.push(`domain=${a.domain}`);
  return `uaid:aid:${empreinte(a)};${params.join(";")}`;
}

/** Le nom de chaque code de competence, tel que la norme le publie. */
export const COMPETENCES: Record<number, string> = {
  10: "Transaction Analytics",
  17: "API Integration",
  21: "Tool Provider",
  33: "Blockchain Integration",
  39: "Trust Attestation",
};
