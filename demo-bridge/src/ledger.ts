/**
 * L'APPAREIL, EN LOCAL.
 *
 * Speculos sert l'application Ethereum officielle sur 127.0.0.1:5010. Son ECRAN est expose
 * publiquement (/screenshot, /events, /button/*) pour que le jury le voie et appuie ; son
 * APDU, non. Ce service tourne sur la machine : c'est lui, et lui seul, qui parle APDU.
 *
 * LE TYPE EST CELUI DU DEPOT. `TARE_GUARD_TYPES` et `TARE_GUARD_PRIMARY_TYPE` sont IMPORTES de
 * packages/guard/src/ledger.ts, pas recopies : si le schema bougeait, ce fichier bougerait avec.
 *
 * `fullImplem: false` est decisif. `true` demande le chemin FILTRE, qui exige des descripteurs
 * publies par Ledger pour ce schema — et rend « Blind signing must be enabled », un message
 * trompeur. Le reglage qui marche est **Settings -> Raw messages -> Enabled** ; sans lui
 * l'appareil repond 0x6a80. Voir EIP712.md a la racine du depot.
 *
 * ON NE MARCHE PAS DANS LES ECRANS PAR DEFAUT. La demo consiste precisement a ce qu'un humain
 * lise les champs et appuie. `auto: true` n'existe que pour la verification hors public.
 */
import { createRequire } from "node:module";
import {
  TARE_GUARD_TYPES,
  TARE_GUARD_PRIMARY_TYPE,
  isUserRejection,
  encodeSignature,
  LEDGER_DEFAULT_PATH,
  type Eip712TypedData,
} from "../vendor/guard/src/ledger.js";

export { TARE_GUARD_TYPES, TARE_GUARD_PRIMARY_TYPE };

const require = createRequire(import.meta.url);

export const SPECULOS_URL = process.env.DEMO_SPECULOS ?? "http://127.0.0.1:5010";
export const SPECULOS_PORT = Number(new URL(SPECULOS_URL).port || 5010);
export const CHEMIN_BIP32 = process.env.DEMO_LEDGER_PATH ?? LEDGER_DEFAULT_PATH;

const dodo = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Le texte de l'ecran courant, ou "" si Speculos ne repond pas. Ne leve jamais. */
export async function ecran(): Promise<string> {
  try {
    const r = await fetch(`${SPECULOS_URL}/events?currentscreenonly=true`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return "";
    const j = (await r.json()) as { events?: Array<{ text?: string }> };
    return (j.events ?? []).map((e) => e.text ?? "").join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

export async function joignable(): Promise<boolean> {
  try {
    const r = await fetch(`${SPECULOS_URL}/events?currentscreenonly=true`, {
      signal: AbortSignal.timeout(2500),
    });
    return r.ok;
  } catch {
    return false;
  }
}

const presser = (b: "left" | "right" | "both") =>
  fetch(`${SPECULOS_URL}/button/${b}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "press-and-release" }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => undefined);

export interface Refus {
  refus: 4001;
  raison: string;
  ecrans: string[];
}

export interface Signe {
  signature: string;
  v: number;
  r: string;
  s: string;
  ecrans: string[];
}

export type Resultat = Signe | Refus;

export function estRefus(x: Resultat): x is Refus {
  return (x as Refus).refus === 4001;
}

/**
 * Envoie le message a l'appareil et attend la decision d'un humain.
 *
 * `ecrans` porte la trace de TOUT ce qui s'est affiche : c'est elle qui fait preuve, pas le
 * resultat. Une signature dont on ne sait pas ce qui a ete montre ne prouve rien.
 */
async function signerUneFois(
  typed: Eip712TypedData,
  opts: { auto?: boolean; timeoutMs?: number } = {},
): Promise<Resultat> {
  const auto = opts.auto ?? process.env.DEMO_AUTO === "1";
  const limite = opts.timeoutMs ?? Number(process.env.DEMO_TIMEOUT_MS ?? 240000);

  const SpeculosHttpTransport = require("@ledgerhq/hw-transport-node-speculos-http").default;
  const Eth = require("@ledgerhq/hw-app-eth").default;

  const transport = await SpeculosHttpTransport.open({ apiPort: SPECULOS_PORT });
  const eth = new Eth(transport);

  const ecrans: string[] = [];
  let fini = false;

  const promesse = eth
    .signEIP712Message(CHEMIN_BIP32, typed, false)
    .then((s: { v: number; r: string; s: string }) => {
      fini = true;
      return { ok: true as const, s };
    })
    .catch((e: unknown) => {
      fini = true;
      return { ok: false as const, e };
    });

  // On NOTE les ecrans dans tous les cas ; on n'APPUIE que si `auto`.
  const debut = Date.now();
  let dernier = "";
  while (!fini && Date.now() - debut < limite) {
    await dodo(150);
    const s = await ecran();
    if (!s) continue;
    if (s !== dernier) {
      ecrans.push(s);
      dernier = s;
    }
    if (!auto) continue;
    if (/app is ready|App settings|App info|Quit app/i.test(s)) continue;
    if (/blind signing ahead/i.test(s)) {
      await presser("both");
      await dodo(300);
    } else if (/^Sign message$/i.test(s) || /^Approve$/i.test(s)) {
      await presser("both");
      await dodo(300);
    } else {
      await presser("right"); // « Reject » compris : on passe devant, on n'appuie jamais dessus
    }
  }

  const out = await Promise.race([
    promesse,
    dodo(2000).then(() => ({ ok: false as const, e: new Error("delai_depasse: aucune decision") })),
  ]);
  await transport.close().catch(() => undefined);

  if (out.ok) {
    const sig = out.s as { v: number; r: string; s: string };
    return { signature: encodeSignature(sig), v: sig.v, r: sig.r, s: sig.s, ecrans };
  }

  const e = out.e;
  if (isUserRejection(e)) {
    return { refus: 4001, raison: "l'utilisateur a refuse sur l'appareil (CONDITIONS_OF_USE_NOT_SATISFIED)", ecrans };
  }
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { statusCode?: number })?.statusCode;
  if (code === 0x6a80 || /6a80/i.test(msg)) {
    const jet = new Error(
      "reglage_manquant: l'application repond 0x6a80. Ce n'est PAS la signature aveugle qu'il faut activer, " +
        "c'est Settings -> Raw messages -> Enabled (voir EIP712.md).",
    );
    (jet as Error & { reglageManquant?: boolean }).reglageManquant = true;
    throw jet;
  }
  throw new Error(`appareil: ${msg.slice(0, 200)}`);
}

/**
 * La signature, avec UN rattrapage et un seul.
 *
 * 0x6a80 veut dire « Raw messages » desactive — l'etat dans lequel un `docker restart` du
 * conteneur Speculos laisse l'appareil. Plutot que de rendre une erreur au jury, on rejoue le
 * reglage et on redemande UNE fois. Deux garde-fous : on ne reessaie que sur CE code precis
 * (un refus humain, lui, n'est pas une panne et ne se rejoue pas), et une seule fois — une
 * boucle de rattrapage devant un public serait pire que l'erreur.
 */
export async function signer(
  typed: Eip712TypedData,
  opts: { auto?: boolean; timeoutMs?: number } = {},
): Promise<Resultat> {
  try {
    return await signerUneFois(typed, opts);
  } catch (e) {
    if (!(e as Error & { reglageManquant?: boolean })?.reglageManquant) throw e;
    const r = await activerRawMessages();
    console.log(`[demo-bridge] 0x6a80 : « Raw messages » rejoue -> ${r.etat}`);
    if (r.etat !== "ACTIVE" && r.etat !== "DEJA_ACTIVE") {
      throw new Error(
        `reglage_manquant: l'application repond 0x6a80 et le rattrapage automatique a rendu ${r.etat}. ` +
          `Active Settings -> Raw messages -> Enabled sur l'appareil (voir EIP712.md).`,
      );
    }
    return await signerUneFois(typed, opts);
  }
}

/* ------------------------------------------------------- le reglage « Raw messages » */

/**
 * ACTIVER « Raw messages » SUR L'APPAREIL, SANS L'AIDE DE PERSONNE.
 *
 * Le reglage vit en RAM du conteneur Speculos : un `docker restart` nocturne le remet a
 * Disabled, et la demo tomberait le lendemain sur 0x6a80 devant le jury. Cette fonction le
 * rejoue — au demarrage du service, sur demande, et surtout en RATTRAPAGE quand l'appareil
 * vient de repondre 0x6a80.
 *
 * ELLE NE TOUCHE A RIEN PENDANT UNE SIGNATURE. Si l'ecran montre autre chose que le menu au
 * repos ou les reglages, elle rend `occupe` et n'appuie sur aucun bouton : marcher dans un
 * flux de signature en cours l'annulerait.
 *
 * ELLE NE CONFIRME QUE SUR CE QU'ELLE A RECONNU. Un libelle inconnu se navigue, jamais ne se
 * confirme — c'est la lecon de packages/keyring/src/speculos.ts, apprise en la cassant. Et
 * elle revient a GAUCHE vers le repos : a droite le carrousel finit sur « Quit app », ou un
 * appui double FERME l'application.
 */
export type EtatReglage = "ACTIVE" | "DEJA_ACTIVE" | "OCCUPE" | "INTROUVABLE" | "INJOIGNABLE";

/** Le menu principal : quatre elements, et l'appareil n'y attend rien de personne. */
const MENU_AU_REPOS = /app is ready|App settings|App info|Quit app/i;

/**
 * L'ECRAN D'ERREUR QUI SUIT UN 0x6a80, et le piege qu'il tend.
 *
 * « Blind signing must be enabled in settings » est le message que l'application affiche
 * quand elle refuse un EIP-712 arbitraire. Il est TROMPEUR — ce n'est pas la signature
 * aveugle qu'il faut activer, c'est « Raw messages » (voir EIP712.md) — et il est COLLANT :
 * ni droite ni gauche n'en sortent, seuls les DEUX boutons le renvoient au repos. Constate,
 * pas suppose : sans ce cas, le rattrapage tournait 24 fois sur place et rendait INTROUVABLE.
 *
 * Il contient les mots « Blind signing », donc il doit etre teste AVANT la liste des
 * reglages, sinon il s'y confond.
 */
const ECRAN_ERREUR = /must be enabled in settings/i;

/** Les elements du carrousel des reglages, releves a l'ecran. */
const DANS_LES_REGLAGES =
  /Blind signing\s+Enable|Nonce\s+Display|Raw messages|Debug contracts|Smart accounts|Transaction hash|^Back$/i;

/**
 * ACTIVER « Raw messages » SUR L'APPAREIL, SANS L'AIDE DE PERSONNE.
 *
 * Le reglage vit en RAM du conteneur Speculos : un `docker restart` nocturne le remet a
 * Disabled, et la demo tomberait le lendemain sur 0x6a80 devant le jury. Cette fonction le
 * rejoue — au demarrage du service, sur demande (POST /demo/speculos/raw), a chaque
 * demarrage du conteneur (tare-speculos-raw.service), et en RATTRAPAGE apres un 0x6a80.
 *
 * ELLE NE TOUCHE A RIEN PENDANT UNE SIGNATURE. Si l'ecran n'est ni le menu au repos, ni les
 * reglages, ni l'ecran d'erreur, elle rend `occupe` sans appuyer sur quoi que ce soit :
 * marcher dans un flux de signature en cours l'annulerait.
 *
 * ELLE NE CONFIRME QUE SUR CE QU'ELLE A RECONNU. Un libelle inconnu se navigue, jamais ne se
 * confirme — c'est la lecon de packages/keyring/src/speculos.ts, apprise en la cassant. Et
 * elle revient a GAUCHE vers le repos : a droite le carrousel finit sur « Quit app », ou un
 * appui double FERME l'application.
 */
export async function activerRawMessages(): Promise<{ etat: EtatReglage; ecrans: string[] }> {
  const ecrans: string[] = [];
  const note = (x: string) => {
    if (x && x !== ecrans[ecrans.length - 1]) ecrans.push(x);
  };

  let s = await ecran();
  if (!s) return { etat: "INJOIGNABLE", ecrans };
  note(s);

  // L'ecran d'erreur d'abord : il porte les mots « Blind signing » et se confondrait avec
  // le reglage du meme nom. Seuls les deux boutons en sortent.
  if (ECRAN_ERREUR.test(s)) {
    await presser("both");
    await dodo(700);
    s = await ecran();
    note(s);
  }
  if (!MENU_AU_REPOS.test(s) && !DANS_LES_REGLAGES.test(s)) {
    return { etat: "OCCUPE", ecrans };
  }

  // 1. atteindre « Raw messages »
  let deja = false;
  let trouve = false;
  let precedent = "";
  let immobile = 0;
  for (let i = 0; i < 40; i++) {
    s = await ecran();
    if (!s) {
      await dodo(250);
      continue; // un ecran vide n'est pas un libelle : on n'appuie pas dessus
    }
    note(s);
    immobile = s === precedent ? immobile + 1 : 0;
    precedent = s;

    if (/Raw messages/i.test(s)) {
      trouve = true;
      deja = /Enabled/i.test(s);
      if (!deja) {
        await presser("both");
        await dodo(600);
        s = await ecran();
        note(s);
      }
      break;
    }
    if (ECRAN_ERREUR.test(s)) await presser("both");
    else if (/App settings/i.test(s)) await presser("both");
    else if (/Quit app|App info/i.test(s)) await presser("left");
    else if (immobile >= 3) await presser("both"); // ecran collant non reconnu : on le degage
    else await presser("right");
    await dodo(300);
  }
  if (!trouve || !/Raw messages/i.test(s) || !/Enabled/i.test(s)) {
    return { etat: "INTROUVABLE", ecrans };
  }

  // 2. reposer l'appareil : « Back » est a DROITE, le menu principal se rejoint a GAUCHE.
  for (let i = 0; i < 12; i++) {
    s = await ecran();
    note(s);
    if (/app is ready|App settings/i.test(s)) break;
    if (/^Back$/i.test(s)) {
      await presser("both");
      await dodo(400);
      continue;
    }
    await presser("right");
    await dodo(250);
  }
  for (let i = 0; i < 12; i++) {
    s = await ecran();
    note(s);
    if (/app is ready/i.test(s)) break;
    await presser("left");
    await dodo(250);
  }
  note(await ecran());
  return { etat: deja ? "DEJA_ACTIVE" : "ACTIVE", ecrans };
}

/** Le code que l'application rend quand « Raw messages » est desactive. */
export function estReglageManquant(e: unknown): boolean {
  const code = (e as { statusCode?: number })?.statusCode;
  const msg = e instanceof Error ? e.message : String(e);
  return code === 0x6a80 || /6a80/i.test(msg);
}
