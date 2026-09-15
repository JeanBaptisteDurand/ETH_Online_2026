/**
 * LA PASTILLE DE L'ICONE — ce qu'on voit sans rien ouvrir.
 *
 * Demande du proprietaire pour la demonstration du 16 septembre 2026 : quand on clique `swap`,
 * l'icone de l'extension doit passer d'un etat au repos a un etat « quelque chose a ete detecte ».
 *
 * Quatre etats, PAR ONGLET — chrome.action prend un tabId, et un autre onglet ne s'allume pas :
 *
 *   repos        aucune pastille          rien d'intercepte dans cet onglet depuis son chargement
 *   interceptee  les bps, sur l'orange    une garde TARE a lu le swap ; rien n'est encore parti
 *   refusee      « NO », gris             refuse : rien n'est parti
 *   transmise    « SENT », couleur du     la transaction est partie vers le portefeuille
 *                verdict
 *
 * Le texte au survol dit le reste en clair : le hook, ce qu'il prend, l'etiquette, le bloc, qui
 * a tranche. Il est en ANGLAIS, comme le site : c'est pendant la demonstration, devant un jury
 * anglophone, qu'on le lit.
 *
 * TOUT EST UNE FONCTION PURE DE L'ETAPE. Le service worker s'endort apres une trentaine de
 * secondes et perd sa memoire ; la pastille, elle, est gardee par le navigateur. Rien ici ne
 * depend d'un etat que le worker aurait tenu entre deux messages.
 */
import { MARQUE, type MessageEtape } from "./protocole.js";

/** L'orange du projet (apps/web/src/index.css, --m-4). */
export const ORANGE_TARE = "#eb6628";
export const GRIS_REFUS = "#5f6368";
/** transmise : la couleur dit ce qu'on a laisse partir, pas que c'etait bien */
export const COULEUR_TRANSMISE: Record<"ok" | "warn" | "block", string> = {
  ok: "#1e7f4f",
  warn: "#a15c00",
  block: "#b3261e",
};
export const TITRE_REPOS = "TARE Guard · nothing intercepted on this tab";

export type NomEtapePastille = "repos" | "interceptee" | "refusee" | "transmise";

/** Une etape RELUE : chaque champ a ete verifie, borne, ou mis a null. */
export interface EtapeLue {
  etape: NomEtapePastille;
  garde: "page" | "extension";
  verdict: "ok" | "warn" | "block" | null;
  hook: string | null;
  bps: number | null;
  /** quand `bps` est null : ce que le meme hook a pris ailleurs. Jamais affiche sur la pastille. */
  ailleurs: number | null;
  etiquette: string | null;
  bloc: number | null;
  par: string | null;
}

export interface Pastille {
  /** quatre caracteres au plus : c'est ce qu'une pastille affiche lisiblement */
  texte: string;
  couleur: string;
  titre: string;
}

const ETAPES = new Set<string>(["repos", "interceptee", "refusee", "transmise"]);
const VERDICTS = new Set<string>(["ok", "warn", "block"]);
const ETIQUETTES = new Set<string>(["MEASURED", "INTERPOLATED", "NOT_MEASURABLE", "NOT_QUOTABLE"]);

/** Une chaine courte, sans caractere de controle, ou null. Un titre d'icone n'est pas un roman. */
function court(x: unknown, max: number): string | null {
  if (typeof x !== "string") return null;
  const t = x.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return t.length === 0 ? null : t.slice(0, max);
}

/**
 * Relit un message venu du monde MAIN. Rend null pour tout ce qui n'est pas une etape connue ;
 * borne ou annule chaque champ, parce que la page peut poster ce qu'elle veut.
 */
export function lireEtape(x: unknown): EtapeLue | null {
  if (!x || typeof x !== "object") return null;
  const m = x as Partial<MessageEtape>;
  if (m.marque !== MARQUE || m.genre !== "etape") return null;
  if (typeof m.etape !== "string" || !ETAPES.has(m.etape)) return null;
  const hook = typeof m.hook === "string" && /^0x[0-9a-fA-F]{40}$/.test(m.hook) ? m.hook.toLowerCase() : null;
  // Le corpus va de -100 a 9 999,53 bps : hors de [-10 000, 10 000], ce n'est pas une mesure.
  const mesure = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 10000 ? v : null;
  const bps = mesure(m.bps);
  const bloc = typeof m.bloc === "number" && Number.isSafeInteger(m.bloc) && m.bloc > 0 ? m.bloc : null;
  return {
    etape: m.etape as NomEtapePastille,
    garde: m.garde === "extension" ? "extension" : "page",
    verdict: typeof m.verdict === "string" && VERDICTS.has(m.verdict) ? (m.verdict as EtapeLue["verdict"]) : null,
    hook,
    bps,
    ailleurs: bps === null ? mesure(m.ailleurs) : null,
    etiquette: typeof m.etiquette === "string" && ETIQUETTES.has(m.etiquette) ? m.etiquette : null,
    bloc,
    par: court(m.par, 40),
  };
}

/**
 * Les bps en quatre caracteres au plus : 4,0933 -> "4.1" ; 119,76 -> "120" ; 1 176 -> "1.2k" ;
 * 9 999,53 -> "10k". Une valeur inconnue s'ecrit « ? », jamais « 0 » : inconnu n'est pas nul.
 */
export function texteBps(bps: number | null): string {
  if (bps === null || !Number.isFinite(bps)) return "?";
  if (bps === 0) return "0";
  const a = Math.abs(bps);
  const signe = bps < 0 ? "-" : "";
  if (a < 0.05) return bps < 0 ? "-0" : "<0.1";
  if (a < 9.95) return `${signe}${Number(a.toFixed(1))}`;
  if (a < 999.5) return `${signe}${Math.round(a)}`;
  const k = `${signe}${Number((a / 1000).toFixed(a < 9950 ? 1 : 0))}k`;
  return k.length <= 4 ? k : `${signe}${Math.round(a / 1000)}k`;
}

function bpsEnClair(bps: number): string {
  return `${Number(bps.toFixed(4))} bps`;
}

/** Ce que le hook prend, en une phrase, sans jamais transformer un inconnu en zero. */
export function ceQueLeHookPrend(e: EtapeLue): string {
  if (e.hook === null) {
    return e.bps === null ? "no hook in this swap: nothing for a hook to take" : `this swap takes ${bpsEnClair(e.bps)}`;
  }
  if (e.bps === null) {
    const faisceau = e.ailleurs !== null ? `; the same hook took ${bpsEnClair(e.ailleurs)} elsewhere` : "";
    return (
      `hook ${e.hook} is not measured at this size${e.etiquette ? ` (${e.etiquette})` : ""}: ` +
      `TARE does not know what it takes here — unknown, not zero${faisceau}`
    );
  }
  const source = [e.etiquette, e.bloc !== null ? `block ${e.bloc}` : null].filter(Boolean).join(", ");
  return `hook ${e.hook} takes ${bpsEnClair(e.bps)}${source ? ` (${source})` : ""}`;
}

export function pastillePour(e: EtapeLue): Pastille {
  if (e.etape === "repos") return { texte: "", couleur: GRIS_REFUS, titre: TITRE_REPOS };
  const qui = e.garde === "extension" ? "the extension" : "the page's own TARE guard";
  const quoi = ceQueLeHookPrend(e);
  const verdict = e.verdict ? ` Verdict: ${e.verdict}.` : "";
  // `gate` est le portillon qui laisse passer sans rien demander : ce n'est pas un « qui ».
  const qui_a_tranche = e.par === "overlay" ? "you, in the TARE Guard window" : e.par;
  const par = e.par && e.par !== "gate" ? ` Decided by ${qui_a_tranche}.` : "";
  if (e.etape === "interceptee") {
    return {
      // Sans hook, il n'y a pas de bps a montrer, mais il y a bien eu interception : « ON ».
      texte: e.hook === null && e.bps === null ? "ON" : texteBps(e.bps),
      couleur: ORANGE_TARE,
      titre: `TARE Guard · swap intercepted by ${qui} — ${quoi}.${verdict} Nothing has been sent yet.`,
    };
  }
  if (e.etape === "refusee") {
    return { texte: "NO", couleur: GRIS_REFUS, titre: `TARE Guard · refused, nothing was sent — ${quoi}.${par}` };
  }
  return {
    texte: "SENT",
    couleur: COULEUR_TRANSMISE[e.verdict ?? "warn"],
    titre: `TARE Guard · handed to the wallet — ${quoi}.${verdict}${par}`,
  };
}
