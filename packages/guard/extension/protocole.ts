/**
 * LE PROTOCOLE ENTRE LES TROIS MORCEAUX DE L'EXTENSION.
 *
 * Trois morceaux, parce que Chrome MV3 impose trois mondes qui ne se parlent pas
 * directement :
 *
 *   inject.js   monde MAIN     voit window.ethereum, donc peut l'envelopper.
 *                              Ne voit PAS chrome.runtime, ni chrome.storage.
 *   pont.js     monde ISOLATED voit chrome.runtime. Ne voit pas window.ethereum.
 *   worker.js   service worker porte la table de 21 Mo, la cle d'API, et le reseau.
 *
 * D'ou le chemin d'une question : inject -> (window.postMessage) -> pont ->
 * (chrome.runtime.sendMessage) -> worker, et la reponse en sens inverse.
 *
 * CE QUE CETTE ARCHITECTURE NE GARANTIT PAS, et il faut le dire au lieu de le laisser
 * croire : un script du monde MAIN partage ce monde avec la page. Une page hostile peut
 * donc repondre a la place du pont et fabriquer un verdict favorable. Ce n'est pas une
 * faille qu'on peut fermer de ce cote : le monde MAIN est le monde de la page.
 *
 * Ce n'est pas le modele de menace non plus. La garde protege l'utilisateur contre ce que
 * le HOOK prend — pas contre un dapp malveillant, qui n'aurait de toute facon aucune raison
 * de passer par window.ethereum : il parlerait au portefeuille par EIP-6963, ou fabriquerait
 * une autre transaction. Ce que la garde apporte, c'est un chiffre mesure devant les yeux de
 * quelqu'un qui allait signer de bonne foi.
 */

/** La marque qui distingue nos messages de tous les autres postMessage d'une page. */
export const MARQUE = "tare-guard/1";

export interface DemandeConsultation {
  marque: typeof MARQUE;
  genre: "consulter";
  id: string;
  tx: { to?: string | null; data?: string | null; input?: string | null; chainId?: unknown };
}

export interface ReponseConsultation {
  marque: typeof MARQUE;
  genre: "verdict";
  id: string;
  /** le rapport de la garde, ou null quand la consultation a echoue */
  rapport: unknown | null;
  raison: string | null;
}

/** Ce que l'utilisateur a decide, pour que le journal du compte le porte. */
export interface DemandeJournal {
  marque: typeof MARQUE;
  genre: "journal";
  id: string;
  quoi: "analyse" | "verdict" | "substitution" | "mesure";
  sujet: string | null;
  detail: Record<string, unknown>;
}

export type Message = DemandeConsultation | ReponseConsultation | DemandeJournal;

export function estDeNous(x: unknown): x is Message {
  return Boolean(x) && typeof x === "object" && (x as { marque?: unknown }).marque === MARQUE;
}

/** Les cles de chrome.storage.local. Nommees ici pour qu'aucune ne soit ecrite deux fois. */
export const CLES_STOCKAGE = {
  /** la cle d'API du compte, de portee 'extension'. Absente = l'extension marche quand meme. */
  cleApi: "tare.cle_api",
  /** la base de l'API, pour que le journal parte au bon endroit */
  api: "tare.api",
  /** false pour ne rien envoyer du tout : l'analyse reste locale */
  journaliser: "tare.journaliser",
} as const;

/** L'API par defaut. Remplacable depuis la page d'options — jamais devinee ailleurs. */
export const API_DEFAUT = "http://127.0.0.1:8787";
