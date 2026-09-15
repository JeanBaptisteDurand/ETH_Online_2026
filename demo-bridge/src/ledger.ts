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

/* ------------------------------------------------------------- un seul a la fois */

/**
 * LE VERROU DE L'APPAREIL, et le bug qu'il repare.
 *
 * Speculos n'a qu'UNE session APDU. Deux demandes qui se chevauchent ne se mettent pas en file :
 * leurs reponses se CROISENT, et la seconde lit la reponse de la premiere. Constate, pas
 * suppose — sous enchainement rapide, `signEIP712Message` a rendu
 * `r=08457468657265756d06312e32322e3101009000`, qui est la reponse a getAppConfiguration
 * (« Ethereum », « 1.22.3 ») et pas une signature. Une garde qui rend une signature fabriquee
 * a partir d'octets qui n'en sont pas serait pire que tout ce qu'elle pretend empecher.
 *
 * Deux appels concurrents ne s'attendent donc PAS : le second est refuse tout de suite, avec un
 * nom. Faire patienter quatre minutes derriere une signature en cours n'aiderait personne, et
 * un ecran qui attend sans rien dire pendant une demo est une panne comme une autre.
 */
let verrou: { quoi: string; depuis: number } | null = null;

export class AppareilOccupe extends Error {
  constructor(quoi: string, depuis: number) {
    super(`appareil_occupe: ${quoi} est en cours depuis ${Math.round((Date.now() - depuis) / 1000)} s`);
  }
}

async function enExclusivite<T>(quoi: string, fn: () => Promise<T>): Promise<T> {
  if (verrou) throw new AppareilOccupe(verrou.quoi, verrou.depuis);
  verrou = { quoi, depuis: Date.now() };
  try {
    return await fn();
  } finally {
    verrou = null;
  }
}

/** Ce que l'appareil est en train de faire, s'il fait quelque chose. */
export function occupationAppareil(): { quoi: string; depuis_ms: number } | null {
  return verrou ? { quoi: verrou.quoi, depuis_ms: Date.now() - verrou.depuis } : null;
}

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

  // ATTENDRE LE REPOS AVANT D'OUVRIR UNE SESSION. Une demande qui arrive pendant que
  // l'appareil est dans ses reglages recoit 0x6a00 (UNKNOWN_ERROR) — constate, en enchainant
  // un amorcage du reglage et une signature. Ce n'est pas un refus et ce n'est pas une panne
  // de l'appareil : c'est une demande posee trop tot. On attend, brievement, et on dit qu'on
  // a attendu plutot que d'echouer sur un code que personne ne sait lire.
  const attenteRepos = Number(process.env.DEMO_ATTENTE_REPOS_MS ?? 15000);
  const t0 = Date.now();
  while (Date.now() - t0 < attenteRepos) {
    const vue = await ecran();
    if (!vue) break; // Speculos muet : la suite rendra une erreur nommee
    if (/app is ready/i.test(vue)) break;
    if (FLUX_TERMINE.test(vue) || ECRAN_ERREUR.test(vue) || FLUX_A_CLORE.test(vue)) {
      await presser("both");
      await dodo(700);
      continue;
    }
    if (/^Back$/i.test(vue)) {
      await presser("both");
      await dodo(300);
      continue;
    }
    // dans les reglages, la sortie (« Back ») est a DROITE ; dans le menu principal, le repos
    // est a GAUCHE. Confondre les deux faisait tourner l'attente sur place.
    if (DANS_LES_REGLAGES.test(vue)) {
      await presser("right");
      await dodo(250);
      continue;
    }
    if (MENU_AU_REPOS.test(vue)) {
      await presser("left");
      await dodo(250);
      continue;
    }
    await dodo(400); // ecran inconnu : on laisse passer, on n'appuie pas au hasard
  }

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

  // ON NE FERME PAS LE TRANSPORT SOUS UNE APDU EN VOL. Le garde-fou valait 2 secondes fixes :
  // si l'appareil n'avait pas encore repondu, on fermait, on rendait une erreur, et la reponse
  // arrivait dans la session SUIVANTE — c'est ainsi que la signature d'une demande se
  // retrouvait dans la reponse d'une autre. On laisse desormais a la demande tout le budget
  // qui lui reste, et la fermeture n'intervient qu'apres.
  const reste = Math.max(2000, limite - (Date.now() - debut));
  const out = await Promise.race([
    promesse,
    dodo(reste).then(() => ({ ok: false as const, e: new Error("delai_depasse: aucune decision") })),
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
  if (code === 0x6a00 || /6a00|UNKNOWN_ERROR/i.test(msg)) {
    const jet = new Error(
      "appareil_pas_pret: the device answered 0x6a00 (UNKNOWN_ERROR) — the request arrived while " +
        "it was not on its idle screen.",
    );
    (jet as Error & { pasPret?: boolean }).pasPret = true;
    throw jet;
  }
  throw new Error(`appareil: ${msg.slice(0, 200)}`);
}

/** L'appareil n'a pas pu ouvrir la demande. Ce n'est ni un refus humain, ni une panne du pont. */
export class AppareilIndisponible extends Error {}

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
  return enExclusivite("une signature", () => signerAvecRattrapage(typed, opts));
}

async function signerAvecRattrapage(
  typed: Eip712TypedData,
  opts: { auto?: boolean; timeoutMs?: number },
): Promise<Resultat> {
  try {
    return await signerUneFois(typed, opts);
  } catch (e) {
    const err = e as Error & { reglageManquant?: boolean; pasPret?: boolean };

    // 0x6a80 — « Raw messages » desactive. On le rejoue et on redemande une fois.
    if (err.reglageManquant) {
      // deja sous verrou : on appelle la routine nue, pas la version verrouillee
      const r = await reglerRawMessages();
      console.log(`[demo-bridge] 0x6a80 : « Raw messages » rejoue -> ${r.etat}`);
      if (r.etat !== "ACTIVE" && r.etat !== "DEJA_ACTIVE") {
        throw new AppareilIndisponible(
          `The device refuses to display the message (0x6a80) and the automatic recovery returned ${r.etat}. ` +
            `Enable Settings -> Raw messages on the device — not blind signing, which would show a hash and no fields.`,
        );
      }
      return await signerUneFois(typed, opts);
    }

    // 0x6a00 — la demande est arrivee alors que l'appareil etait ailleurs. On le repose,
    // et on redemande UNE fois. Deux reprises devant un public seraient pires que l'erreur.
    if (err.pasPret) {
      const r = await ramenerAuRepos();
      console.log(`[demo-bridge] 0x6a00 : appareil repose -> ${r.au_repos ? "au repos" : `« ${r.ecran} »`}`);
      if (!r.au_repos) {
        throw new AppareilIndisponible(
          `The device did not return to its idle screen (last screen seen: "${r.ecran || "none"}"). ` +
            `Nothing was signed and nothing was sent. Press both buttons on the device, then try again.`,
        );
      }
      try {
        return await signerUneFois(typed, opts);
      } catch (e2) {
        const err2 = e2 as Error & { pasPret?: boolean };
        if (err2.pasPret) {
          throw new AppareilIndisponible(
            `The device answered 0x6a00 twice, even after being returned to its idle screen. ` +
              `Nothing was signed and nothing was sent.`,
          );
        }
        throw e2;
      }
    }

    throw e;
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
 * Les ecrans de FIN de flux. « Message signed » / « Message rejected » restent affiches apres
 * une demande terminee : l'appareil n'attend plus rien, mais il n'est pas au menu non plus.
 * Les confondre avec un flux EN COURS faisait rendre OCCUPE a tort apres chaque signature, et
 * le reglage n'etait alors jamais repose.
 */
const FLUX_TERMINE = /Message (signed|rejected)/i;

/**
 * UN FLUX RESTE OUVERT SANS PERSONNE AU BOUT. « Reject transaction » / « Reject message » est
 * le dernier ecran d'une demande que plus personne n'attend : la notre a expire, l'appareil,
 * lui, attend toujours. Constate — l'appareil est reste bloque la, et l'amorcage rendait
 * OCCUPE indefiniment sans jamais pouvoir reposer le reglage.
 *
 * On ne le franchit QUE quand aucune signature n'est en cours (le verrou est libre) : il n'y a
 * alors rien a annuler, et REFUSER est de toute facon l'issue sure. On ne confirme jamais un
 * « Sign », on confirme un « Reject ».
 */
const FLUX_A_CLORE = /^Reject (transaction|message)/i;

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

/**
 * LE REGLAGE QUE CE PROJET REFUSE. « Blind signing » fait signer un HACHAGE, sans un seul
 * champ a l'ecran — exactement ce que la garde existe pour eviter. Il ne doit jamais etre
 * actif, et il l'a ete par accident : une routine de navigation a confirme sur un libelle
 * qu'elle n'avait pas reconnu. On l'eteint donc explicitement quand on passe devant, et on
 * ne confirme plus jamais sur un ecran inconnu a l'interieur des reglages.
 */
const BLIND_SIGNING_ACTIF = /Blind signing\s+Enable transaction.*Enabled/i;

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
  // Une signature en cours a la priorite : on ne marche pas dans ses ecrans.
  if (verrou) return { etat: "OCCUPE", ecrans: [] };
  return enExclusivite("le reglage « Raw messages »", reglerRawMessages);
}

async function reglerRawMessages(): Promise<{ etat: EtatReglage; ecrans: string[] }> {
  const ecrans: string[] = [];
  const note = (x: string) => {
    if (x && x !== ecrans[ecrans.length - 1]) ecrans.push(x);
  };

  let s = await ecran();
  if (!s) return { etat: "INJOIGNABLE", ecrans };
  note(s);

  // L'ecran d'erreur d'abord : il porte les mots « Blind signing » et se confondrait avec
  // le reglage du meme nom. Seuls les deux boutons en sortent.
  // Un flux qui se termine passe par PLUSIEURS ecrans collants d'affilee — « Reject
  // transaction » puis « Message rejected ». Un seul appui n'en sortait pas, et la routine
  // rendait OCCUPE sur un appareil que plus rien n'occupait. On les franchit tous.
  for (let i = 0; i < 6; i++) {
    if (!ECRAN_ERREUR.test(s) && !FLUX_TERMINE.test(s) && !FLUX_A_CLORE.test(s)) break;
    await presser("both");
    await dodo(900);
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
    if (BLIND_SIGNING_ACTIF.test(s)) {
      // libelle RECONNU : on l'eteint, et on repasse devant pour verifier
      await presser("both");
      await dodo(500);
      const apres = await ecran();
      note(apres);
      console.log(`[demo-bridge] « Blind signing » etait actif — eteint (${apres})`);
      continue;
    }
    if (ECRAN_ERREUR.test(s) || FLUX_TERMINE.test(s) || FLUX_A_CLORE.test(s)) await presser("both");
    else if (/App settings/i.test(s)) await presser("both");
    else if (/Quit app|App info/i.test(s)) await presser("left");
    else if (immobile >= 3 && !DANS_LES_REGLAGES.test(s)) {
      // ecran collant NON RECONNU et hors des reglages : on le degage. Jamais dans les
      // reglages — c'est ainsi que « Blind signing » s'est retrouve active.
      await presser("both");
    } else await presser("right");
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

/**
 * RAMENER L'APPAREIL AU REPOS, sans confirmer quoi que ce soit d'inconnu.
 *
 * Un 0x6a00 (UNKNOWN_ERROR) ne veut pas dire que l'appareil est casse : il veut dire que la
 * demande est arrivee alors qu'il etait ailleurs — dans ses reglages, sur un ecran de fin de
 * flux, sur l'ecran d'erreur collant. Constate en enchainant un amorcage du reglage et une
 * signature. Cette routine le repose, et c'est tout ce qu'elle fait.
 */
export async function ramenerAuRepos(limiteMs = 15000): Promise<{ au_repos: boolean; ecran: string }> {
  const t0 = Date.now();
  let vue = "";
  while (Date.now() - t0 < limiteMs) {
    vue = await ecran();
    if (!vue) {
      await dodo(400);
      continue;
    }
    if (/app is ready/i.test(vue)) return { au_repos: true, ecran: vue };
    if (FLUX_TERMINE.test(vue) || ECRAN_ERREUR.test(vue) || FLUX_A_CLORE.test(vue)) {
      await presser("both");
      await dodo(700);
      continue;
    }
    if (/^Back$/i.test(vue)) {
      await presser("both");
      await dodo(400);
      continue;
    }
    // DANS LES REGLAGES : la sortie est « Back », et « Back » est a DROITE. Appuyer a gauche
    // depuis le premier element (« Blind signing ») ne remonte nulle part — la routine
    // tournait alors sur place jusqu'a epuisement du budget, et la demande de signature
    // arrivait quand meme, sur un appareil qui n'etait pas pret. Constate.
    if (DANS_LES_REGLAGES.test(vue)) {
      await presser("right");
      await dodo(250);
      continue;
    }
    // DANS LE MENU PRINCIPAL : on remonte a gauche, jamais a droite (« Quit app » ferme l'app).
    if (MENU_AU_REPOS.test(vue)) {
      await presser("left");
      await dodo(250);
      continue;
    }
    await dodo(400); // ecran inconnu : on ne confirme jamais ce qu'on n'a pas reconnu
  }
  return { au_repos: /app is ready/i.test(vue), ecran: vue };
}

/** Le code que l'application rend quand « Raw messages » est desactive. */
export function estReglageManquant(e: unknown): boolean {
  const code = (e as { statusCode?: number })?.statusCode;
  const msg = e instanceof Error ? e.message : String(e);
  return code === 0x6a80 || /6a80/i.test(msg);
}
