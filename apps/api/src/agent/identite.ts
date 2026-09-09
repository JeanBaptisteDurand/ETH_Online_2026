// L'IDENTITE DE TARE, ET LA JUSTIFICATION DE CHACUN DE SES CHAMPS.
//
// Un identifiant d'agent ne vaut que ce que valent les champs dont il derive. Ceux-ci sont
// tous verifiables dans ce depot, et aucun n'est choisi pour bien sonner.

import { uaid, type Identite } from "./hcs14.js";

/**
 * La version qui entre dans l'empreinte. Elle est ECRITE ICI plutot que lue dans
 * package.json a l'execution : l'identite doit etre la meme dans le conteneur, dans les
 * tests et sur la machine d'un tiers qui la recalcule, y compris sans le fichier sous la
 * main. Un test verifie qu'elle n'a pas derive de package.json.
 */
export const VERSION = "0.1.0";

export const TARE: Identite = {
  // La norme : « for self-sovereign agents lacking a specific registry, the registry field
  // shall be set to 'self' ». TARE n'est inscrit dans AUCUN annuaire d'agents. Ecrire « hol »
  // ou « hedera » reviendrait a revendiquer une inscription qui n'existe pas.
  registry: "self",
  name: "TARE",
  version: VERSION,
  // On expose un serveur MCP reel — apps/mcp, quatre outils, 33 tests — et c'est par la
  // qu'un agent consomme le service. Pas « hcs-10 » : on n'implemente pas ce protocole.
  protocol: "mcp",
  // Le compte Hedera qui paie les ancrages et qui a cree le topic 0.0.10371106. C'est le
  // meme identifiant que portent les lignes `payer` de la piste d'audit : c'est lui qui
  // relie l'identite au journal des paiements.
  nativeId: "hedera:testnet:0.0.10367920",
  // Chaque code correspond a quelque chose qui TOURNE dans ce depot :
  //   10 Transaction Analytics   le contrefactuel : 125 072 mesures de swaps sur Base
  //   17 API Integration         apps/api, x402 sur Hedera, peage a la mesure
  //   21 Tool Provider           apps/mcp, quatre outils exposes a un agent
  //   33 Blockchain Integration  fork Base epingle, anvil_setCode, lectures on-chain
  //   39 Trust Attestation       contracts/ : 99 hooks et leur prelevement, lisibles on-chain
  // Volontairement PAS revendiques, alors qu'ils etaient tentants :
  //   11 Smart Contract Audit    on lit du source verifie, on n'audite pas
  //   34 Consensus Participation on ECRIT sur HCS, on ne participe pas au consensus
  //   7  Knowledge Retrieval     l'assistant recherche, mais il ne produit aucun nombre
  skills: [10, 17, 21, 33, 39],
  // Aucun registre, donc aucun identifiant dans un registre. La norme dit « 0 si non
  // applicable » ; c'est le cas.
  uid: "0",
};

/** L'identifiant complet de TARE. Deterministe : recalculable par n'importe qui. */
export const UAID_TARE = uaid(TARE);
