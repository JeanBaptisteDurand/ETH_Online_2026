/**
 * LE PLANIFICATEUR LLM — branche pour de vrai, et volontairement pauvre.
 *
 * Ce que le modele recoit : le catalogue d'actions, la liste des sujets d'explication,
 * l'inventaire des hooks (adresse, nom du registre, ce que le registre affirme, s'il a
 * deja ete mesure) et la question.
 * Ce que le modele NE recoit PAS : une seule valeur mesuree. On ne peut pas repeter
 * un nombre qu'on n'a jamais lu. Cette regle ne bouge pas.
 *
 * Ce que le modele rend : un JSON {intent, actions[], say?}. Les actions passent par
 * Zod (actions.ts), la phrase passe par l'auditeur (narrate.ts). Un JSON invalide, un
 * timeout, une reponse TRONQUEE : on retombe sur le planificateur deterministe et on
 * l'ECRIT dans `degraded`. Jamais un resultat a moitie.
 *
 * LES FOURNISSEURS COURENT ENSEMBLE, ILS NE SE SUIVENT PLUS. Ils etaient essayes EN
 * SERIE, et la facture a ete mesuree : une question libre a mis 51,8 s parce que la
 * laisse d'Ollama (45 s) etait payee EN ENTIER avant qu'OpenAI n'ait le droit de
 * commencer. On les lance donc en meme temps et on garde la PREMIERE REPONSE VALIDE —
 * celle qui passe Zod ET l'auditeur de nombres, pas la premiere ARRIVEE : un JSON casse
 * rendu en une seconde ne doit pas battre un plan correct rendu en trois.
 *
 * Les perdants sont annules pour de vrai (AbortSignal jusqu'au fetch), et ce que CHACUN
 * a fait — gagnant, perdant, refuse, expire, annule — est publie dans `why`. La vitesse
 * ne se paie pas en tracabilite : c'est la tracabilite qui est le produit.
 *
 * LA TRONCATURE EST UN ECHEC, PAS UNE REPONSE COURTE. Ollama la signale par
 * `done_reason: "length"`, OpenAI par `finish_reason: "length"`. Les deux sont
 * traitees comme une panne : ce projet a produit huit faux resultats en concluant
 * sur une reponse coupee (docs/HONESTY.md).
 */
import "../config.js"; // charge .env une fois, sans jamais journaliser une cle
import { parseModelPlan, ACTION_CATALOGUE, type Action } from "./actions.js";
import { plan as deterministicPlan, type Intent, type PlanOut, type PlannerContext } from "./planner.js";
import type { StoreView } from "./store.js";
import { sanitizeModelSay } from "./narrate.js";
import {
  buildExplain,
  detectExplain,
  DOCTRINE_IDS,
  TOPIC_CATALOGUE,
  type ExplainResult,
  type RagOptions,
} from "./explain.js";

/** Ce qu'un appel modele rend : du texte, ou du texte avec le nom du fournisseur. */
export type ModelReply = string | { text: string; provider?: string; note?: string };

/**
 * Un appel modele. `signal` est ce qui rend la course honnete : sans lui, "annuler le
 * perdant" voudrait dire "ignorer sa reponse" — la requete continuerait a tourner, le
 * jeton continuerait a etre facture, et le fournisseur continuerait a etre charge pour
 * rien. Un appel qui ignore `signal` reste correct, il est juste moins poli.
 */
export type ModelCall = (req: {
  system: string;
  user: string;
  signal?: AbortSignal;
}) => Promise<ModelReply>;

/** Un fournisseur nomme : la course a besoin de savoir QUI a fait quoi. */
export interface ProviderCall {
  name: string;
  call: ModelCall;
}

export type PlannerFn = (
  question: string,
  store: StoreView,
  ctx: PlannerContext,
) => Promise<PlanOut>;

const INTENTS: Intent[] = [
  "registry-disagrees",
  "contradictions",
  "top-extractors",
  "quiet-hooks",
  "curve",
  "compare",
  "twins",
  "blast-radius",
  "deployer",
  "orphans",
  "evidence",
  "measure-request",
  "open",
  "filter",
  "sort",
  "columns",
  "reset",
  "export",
  "permalink",
  "explain",
  "help",
  "unclear",
];

const BY_ACTION: Partial<Record<Action["type"], Intent>> = {
  plotCurve: "curve",
  compare: "compare",
  showTwins: "twins",
  showBlastRadius: "blast-radius",
  showDeployer: "deployer",
  showContradictions: "contradictions",
  showOrphans: "orphans",
  showEvidence: "evidence",
  measure: "measure-request",
  open: "open",
  filter: "filter",
  sort: "sort",
  columns: "columns",
  export: "export",
  permalink: "permalink",
  clarify: "unclear",
  reset: "reset",
};

export function intentFromActions(actions: Action[], hinted: string): Intent {
  const hit = INTENTS.find((i) => i === hinted);
  if (hit) return hit;
  for (const a of actions) {
    if (a.type === "reset") continue;
    const guess = BY_ACTION[a.type];
    if (guess) return guess;
  }
  return "unclear";
}

/* ------------------------------------------------------------- les prompts */

/**
 * Les exemples ne sont pas de la decoration : sans eux, un 8B rend
 * `"actions":["filter"]` — une chaine la ou un objet est attendu — et le plan est
 * refuse par Zod a chaque tour. Mesure faite sur granite3.3:8b avant de les ajouter.
 */
const FEW_SHOT = [
  {
    q: "quels hooks se contredisent avec le registre ?",
    a: '{"intent":"contradictions","actions":[{"type":"showContradictions"}],"say":"Je confronte ce que le registre affirme a ce que la mesure a vu."}',
  },
  {
    q: "les hooks qui prennent le plus",
    a: '{"intent":"top-extractors","actions":[{"type":"reset"},{"type":"filter","filter":{"measuredOnly":true}},{"type":"sort","col":"mesure","dir":"desc"}],"say":"Je classe les hooks mesures du plus preleve au moins preleve."}',
  },
  {
    q: "montre les orphelins",
    a: '{"intent":"orphans","actions":[{"type":"showOrphans"}],"say":"Je liste ce qui est mesure sans fiche, et les pools sans une seule valeur."}',
  },
  {
    q: "trace la courbe de 0x1111111111111111111111111111111111111111 sur le pool 0x2222222222222222222222222222222222222222222222222222222222222222",
    a: '{"intent":"curve","actions":[{"type":"open","hook":"0x1111111111111111111111111111111111111111","pool":"0x2222222222222222222222222222222222222222222222222222222222222222"},{"type":"plotCurve","hook":"0x1111111111111111111111111111111111111111","pool":"0x2222222222222222222222222222222222222222222222222222222222222222","direction":null}],"say":"Je trace le prelevement en fonction de la taille du swap."}',
  },
  {
    q: "pourquoi vous remplacez le hook et pas le pool ?",
    a: '{"intent":"explain","actions":[],"say":"Je t\'explique la methode."}',
  },
  {
    q: "quelle est la meteo a Paris ?",
    a: '{"intent":"unclear","actions":[{"type":"clarify","question":"Je ne sais parler que des hooks Uniswap v4 mesures par TARE, et de la methode qui les mesure."}],"say":"Cette question sort de ce que je sais lire."}',
  },
];

export function buildSystemPrompt(store: StoreView): string {
  const inventory = store.hooks
    .map((h) => {
      const bits = [
        h.hook,
        h.registry?.name ?? "(absent du registre)",
        `vanillaSwap=${h.registry?.vanilla_swap ?? "inconnu"}`,
        h.measured > 0 ? "deja mesure" : "aucune valeur mesuree",
      ];
      return "- " + bits.join(" | ");
    })
    .join("\n");

  return [
    "Tu es le planificateur de TARE. TARE mesure ce qu'un hook Uniswap v4 prend reellement",
    "sur un swap : sur un fork epingle, le bytecode du hook est remplace par un stub inerte,",
    "le meme swap est cote deux fois, et l'ecart EST le prelevement.",
    "",
    "REGLE D'OR, absolue : tu choisis QUOI interroger. TU NE PRODUIS JAMAIS UN NOMBRE.",
    "Tu n'as recu aucune valeur mesuree et tu n'as pas le droit d'en ecrire une.",
    "Le champ `say` doit etre une phrase SANS AUCUN CHIFFRE ; toute phrase qui en contient",
    "est jetee par l'auditeur, et ta reponse sera remplacee par la narration deterministe.",
    "",
    "Tu reponds UNIQUEMENT par un objet JSON, sans texte autour :",
    '{"intent":"...","actions":[...],"say":"phrase sans chiffre (optionnel)"}',
    "",
    "Chaque action est un OBJET portant une cle \"type\". Formes acceptees, aucune autre ;",
    "toute cle inconnue fait echouer la liste entiere :",
    ...ACTION_CATALOGUE.map((a) => `- ${a.args} : ${a.what}`),
    "",
    "Champs de filter : minBps, maxBps (nombres, des SEUILS venus de l'humain), chain,",
    "flag, label (MEASURED|INTERPOLATED|NOT_MEASURABLE|NOT_QUOTABLE), allowlisted,",
    "registryDisagrees, hook (0x + 40 hex), pool (0x + 64 hex), nonFlat, measuredOnly, search.",
    "Colonnes de sort : hook, registre, mesure, pools, mesures, etiquette, audit. Sens : asc|desc.",
    "",
    "Intentions possibles : " + INTENTS.join(", "),
    "",
    "Quand la question porte sur LA METHODE, LES ETIQUETTES, LES LIMITES ou LE PRODUIT",
    "plutot que sur le jeu de mesures, reponds intent=\"explain\" avec actions=[] :",
    "l'explication est ecrite par le produit, pas par toi.",
    "Quand la question n'a rien a voir avec TARE, reponds intent=\"unclear\" avec une action",
    "clarify qui DIT que tu ne sais pas. N'invente jamais une reponse hors sujet.",
    "",
    "EXEMPLES (respecte cette forme exactement) :",
    ...FEW_SHOT.flatMap((e) => [`Q: ${e.q}`, `R: ${e.a}`]),
    "",
    "Inventaire des hooks mesures (adresse | nom du registre | affirmation du registre | etat) :",
    inventory,
  ].join("\n");
}

/** Le prompt de choix de sujet : une liste fermee, et rien d'autre a rendre. */
export function buildTopicPrompt(): string {
  return [
    "Tu es l'aiguilleur des explications de TARE. On te donne une question et un CATALOGUE",
    "de sujets. Tu choisis UN sujet du catalogue. Tu n'ecris PAS l'explication : elle est",
    "ecrite par le produit, avec ses sources. Tu ne produis jamais un nombre.",
    "",
    "Tu reponds UNIQUEMENT par un objet JSON :",
    '{"topic":"<un id du catalogue>","say":"une phrase d\'introduction, SANS AUCUN CHIFFRE (optionnel)"}',
    "",
    "Si aucun sujet ne convient, rends {\"topic\":\"none\"}.",
    "",
    "CATALOGUE :",
    ...TOPIC_CATALOGUE.map((t) => `- ${t.id} : ${t.title}`),
  ].join("\n");
}

export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("aucun objet JSON dans la reponse du modele");
  return JSON.parse(body.slice(start, end + 1));
}

/* --------------------------------------------------------- les fournisseurs */

export class TruncatedReplyError extends Error {
  constructor(provider: string) {
    super(
      `${provider} a coupe sa reponse a la limite de jetons : une reponse tronquee n'est pas une reponse`,
    );
    this.name = "TruncatedReplyError";
  }
}

/**
 * La laisse d'UN fournisseur a claque. C'est une classe et pas un `Error` nu parce que
 * le rapport de course doit distinguer "il n'a pas repondu a temps" de "il a plante" et
 * de "on l'a annule" : trois causes, trois lignes differentes sous les yeux du lecteur.
 * Le texte, lui, ne change pas — il est deja dans les journaux du matin.
 */
export class ProviderTimeoutError extends Error {
  constructor(
    readonly provider: string,
    readonly timeoutMs: number,
  ) {
    super(`${provider} n'a pas repondu en ${timeoutMs} ms (laisse du fournisseur)`);
    this.name = "ProviderTimeoutError";
  }
}

/** Un fournisseur coupe parce qu'un autre a gagne la course. Ce n'est pas une panne. */
export class RaceCancelledError extends Error {
  constructor(readonly provider: string) {
    super(`${provider} annule : un autre fournisseur a rendu une reponse valide avant lui`);
    this.name = "RaceCancelledError";
  }
}

export interface ProviderOptions {
  timeoutMs?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}

/**
 * LES DELAIS, ETAGES. Ils l'ont ete de travers pendant tout un tour de ce lot, et le
 * symptome meritait d'etre ecrit : la laisse d'Ollama valait 25 000 ms et le budget
 * global du planificateur valait 25 000 ms aussi. Le budget expirait AVEC la laisse,
 * donc la chaine etait avortee avant d'avoir essaye OpenAI. Le repli existait dans le
 * code, il ne s'executait jamais. Un repli non atteignable est un repli absent.
 *
 * La regle depuis : chaque fournisseur a SA laisse, et le budget global doit tenir la
 * PLUS LONGUE d'entre elles, plus une marge. Depuis que les fournisseurs courent
 * ensemble (`raceProviders`), c'est un MAXIMUM et non plus une somme : personne
 * n'attend son tour, donc personne ne paie le tour d'un autre. Un budget cale sur une
 * seule laisse reste le meme piege qu'avant — il couperait le plus lent avant sa propre
 * laisse, et un repli inatteignable est un repli absent.
 *
 * Le defaut d'Ollama est large parce qu'il est mesure, pas devine : granite3.3:8b rend
 * un plan complet en 11 a 28 s sur la machine de developpement (prompt systeme reel,
 * modele deja charge), et le premier appel apres un demarrage a froid paye en plus
 * ~24 s de chargement du modele en memoire. Une laisse de 25 s coupait donc au milieu
 * des plans corrects.
 */
export const DEFAULT_OLLAMA_TIMEOUT_MS = 45_000;
export const DEFAULT_OPENAI_TIMEOUT_MS = 20_000;
/**
 * La marge du budget global au-dessus de la laisse la PLUS LONGUE. Le nom garde son
 * "CHAIN" d'origine parce qu'il est exporte et lu ailleurs ; ce qu'il mesure, lui, a
 * change de sens le jour ou les fournisseurs ont cesse de se suivre.
 */
export const CHAIN_MARGIN_MS = 3_000;

/* Des FONCTIONS, pas des constantes de module. Une constante evaluee a l'import lit
   l'environnement avant que l'appelant ait pu le regler : les `import` ESM sont hisses,
   donc un test qui ecrit process.env juste avant son import arriverait trop tard et
   croirait mesurer un reglage qui n'a jamais pris. On lit au moment de l'appel. */
export const ollamaTimeoutMs = (): number =>
  numEnv("TARE_OLLAMA_TIMEOUT_MS", DEFAULT_OLLAMA_TIMEOUT_MS);
export const openaiTimeoutMs = (): number =>
  numEnv("TARE_OPENAI_TIMEOUT_MS", DEFAULT_OPENAI_TIMEOUT_MS);

function numEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  f: typeof fetch,
  name: string,
  external?: AbortSignal,
): Promise<{ status: number; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const relay = () => ctrl.abort();
  if (external) {
    if (external.aborted) {
      clearTimeout(timer);
      throw new RaceCancelledError(name);
    }
    external.addEventListener("abort", relay, { once: true });
  }
  try {
    const r = await f(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    // `This operation was aborted` ne dit ni QUI a coupe ni AU BOUT DE COMBIEN.
    // Ce message finit dans `degraded`, sous les yeux de quelqu'un : il doit se lire.
    // L'ordre des deux tests n'est pas indifferent : quand la course annule, le signal
    // interne est abattu LUI AUSSI (c'est le relais qui l'abat), donc le tester en
    // premier ferait passer une annulation pour un depassement de laisse — un delai
    // invente, exactement ce qu'on s'interdit.
    if (external?.aborted) throw new RaceCancelledError(name);
    if (ctrl.signal.aborted) throw new ProviderTimeoutError(name, timeoutMs);
    throw e;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", relay);
  }
}

/** Ollama, en local : gratuit, et c'est le premier essaye. */
export function makeOllamaCall(
  cfg: { url?: string; model?: string } & ProviderOptions = {},
): ModelCall {
  const base = (cfg.url ?? process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = cfg.model ?? process.env.OLLAMA_PLANNER_MODEL ?? "granite3.3:8b";
  const timeoutMs = cfg.timeoutMs ?? ollamaTimeoutMs();
  const maxTokens = cfg.maxTokens ?? 700;
  const f = cfg.fetchImpl ?? fetch;
  const name = `ollama:${model}`;
  return async ({ system, user, signal }) => {
    const { status, text } = await postJson(
      `${base}/api/chat`,
      {
        model,
        stream: false,
        format: "json",
        options: { temperature: 0, num_predict: maxTokens },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
      {},
      timeoutMs,
      f,
      name,
      signal,
    );
    if (status !== 200) throw new Error(`${name} HTTP ${status}: ${text.slice(0, 200)}`);
    const j = JSON.parse(text) as {
      message?: { content?: string };
      done_reason?: string;
    };
    // La limite de jetons atteinte = reponse coupee. On ne parse pas un JSON a moitie.
    if (j.done_reason === "length") throw new TruncatedReplyError(name);
    const content = j.message?.content;
    if (typeof content !== "string" || content.trim() === "")
      throw new Error(`${name} n'a rien rendu`);
    return { text: content, provider: name };
  };
}

/** OpenAI, en repli : payant, donc second. */
export function makeOpenAiCall(
  cfg: { apiKey?: string; model?: string; baseUrl?: string } & ProviderOptions = {},
): ModelCall {
  const apiKey = cfg.apiKey ?? process.env.OPENAI_API_KEY ?? "";
  const model = cfg.model ?? process.env.OPENAI_PLANNER_MODEL ?? "gpt-4o-mini";
  const base = (cfg.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const timeoutMs = cfg.timeoutMs ?? openaiTimeoutMs();
  const maxTokens = cfg.maxTokens ?? 700;
  const f = cfg.fetchImpl ?? fetch;
  const name = `openai:${model}`;
  return async ({ system, user, signal }) => {
    if (!apiKey) throw new Error(`${name} sans cle : OPENAI_API_KEY absent`);
    const { status, text } = await postJson(
      `${base}/chat/completions`,
      {
        model,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
      { authorization: `Bearer ${apiKey}` },
      timeoutMs,
      f,
      name,
      signal,
    );
    // Le corps d'erreur peut contenir la cle en clair dans un message : on ne le recopie pas.
    if (status !== 200) throw new Error(`${name} HTTP ${status}`);
    const j = JSON.parse(text) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const choice = j.choices?.[0];
    if (choice?.finish_reason === "length") throw new TruncatedReplyError(name);
    const content = choice?.message?.content;
    if (typeof content !== "string" || content.trim() === "")
      throw new Error(`${name} n'a rien rendu`);
    return { text: content, provider: name };
  };
}

/**
 * Essaye les appels DANS L'ORDRE. Garde pour ce qu'il sert encore : un appelant qui
 * veut explicitement un ordre de priorite, et les tests qui verifient le repli seul.
 * Ce n'est plus ce que `plannerFromEnv` branche — voir `raceProviders` : la chaine
 * fait payer la laisse du premier avant que le second ait le droit de commencer, et
 * cette attente-la a ete mesuree a 45 s sur une question qui a fini en 51,8 s.
 */
export function chainCalls(calls: ProviderCall[]): ModelCall {
  return async (req) => {
    const failures: string[] = [];
    for (const { name, call } of calls) {
      try {
        const r = await call(req);
        const norm = typeof r === "string" ? { text: r, provider: name } : { provider: name, ...r };
        return failures.length ? { ...norm, note: `repli apres : ${failures.join(" ; ")}` } : norm;
      } catch (e) {
        failures.push(`${name} — ${(e as Error).message.slice(0, 160)}`);
      }
    }
    throw new Error(
      failures.length ? failures.join(" ; ") : "aucun fournisseur de modele configure",
    );
  };
}

/* -------------------------------------------------------------- la course */

/**
 * LA NOTE D'UN FOURNISSEUR DANS LA COURSE.
 *
 *  - `valide`  : utilisable tel quel. Il gagne, et les autres sont annules.
 *  - `reserve` : utilisable, mais avec une reserve ecrite (typiquement : le modele a
 *                glisse un chiffre dans sa phrase, l'auditeur la jettera). On ne le
 *                declare pas gagnant tout de suite : si un concurrent rend mieux
 *                pendant qu'il reste du temps, c'est le concurrent qui passe. Si
 *                personne ne fait mieux, la reserve sert — un plan dont la phrase est
 *                jetee reste tres au-dessus d'un repli par expressions regulieres.
 *  - `refuse`  : inutilisable (JSON casse, Zod, plan vide). Ce n'est pas un gagnant
 *                lent, c'est un non-resultat : la course continue sans lui.
 */
export type Grade<T> =
  | { grade: "valide"; value: T }
  | { grade: "reserve"; value: T; detail: string; reason?: string }
  | { grade: "refuse"; detail: string; reason?: string };

export type RaceOutcome =
  | "gagnant"
  | "reserve"
  | "perdant"
  | "refuse"
  | "expire"
  | "annule"
  | "erreur";

/** Ce qu'UN fournisseur a fait, publie tel quel. Personne n'est efface du proces-verbal. */
export interface ProviderReport {
  provider: string;
  outcome: RaceOutcome;
  /** duree reellement observee pour CE fournisseur, en ms. Mesuree, pas estimee. */
  ms: number;
  detail: string | null;
  /** la cause, reutilisable telle quelle par `degraded.reason` quand tout echoue */
  reason: string | null;
}

export interface RaceResult<T> {
  value: T | null;
  provider: string | null;
  /** vrai quand ce qui est rendu vient d'une reserve et non d'un gagnant franc */
  reserved: boolean;
  reports: ProviderReport[];
  /** duree de la course entiere, mesuree */
  ms: number;
}

/**
 * LANCE TOUS LES FOURNISSEURS EN MEME TEMPS ET GARDE LA PREMIERE REPONSE VALIDE.
 *
 * "Valide" et "arrivee la premiere" ne sont pas la meme chose, et c'est tout le sujet :
 * granite3.3:8b rend parfois un JSON tronque en deux secondes la ou gpt-4o-mini rend un
 * plan correct en trois. Prendre la premiere ARRIVEE ferait retomber la question sur le
 * planificateur deterministe alors qu'un plan correct etait en vol. On juge donc chaque
 * reponse (`grade`) AVANT de declarer un gagnant.
 *
 * Ce que cette fonction ne fait pas : inventer une note pour un fournisseur qu'on n'a
 * pas laisse finir. Un fournisseur coupe par la course est marque `annule`, un
 * fournisseur coupe par le budget est marque `expire` — jamais `refuse`, qui voudrait
 * dire qu'on a lu sa reponse et qu'elle etait mauvaise.
 */
export async function raceProviders<T>(
  calls: ProviderCall[],
  req: { system: string; user: string },
  grade: (text: string, provider: string) => Grade<T> | Promise<Grade<T>>,
  budgetMs?: number,
): Promise<RaceResult<T>> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const reports = new Map<string, ProviderReport>();
  // Un objet mutable plutot que deux `let` : la valeur est ecrite depuis des taches
  // concurrentes, et un `let` capture donnerait a TypeScript une fausse certitude.
  // Combien de temps on laisse aux autres apres qu'une reserve soit arrivee. Assez
  // pour qu'un fournisseur deja engage finisse, trop peu pour payer une laisse entiere.
  const GRACE_RESERVE_MS = Math.min(1500, budgetMs ?? 1500);

  const box: {
    winner: { provider: string; value: T; ms: number } | null;
    reserve: { provider: string; value: T; ms: number } | null;
  } = { winner: null, reserve: null };

  let announce: () => void = () => {};
  const firstValid = new Promise<void>((res) => {
    announce = res;
  });

  const tasks = calls.map(async ({ name, call }) => {
    const started = Date.now();
    try {
      const reply = await call({ ...req, signal: ctrl.signal });
      const text = typeof reply === "string" ? reply : reply.text;
      // Le fournisseur a le dernier mot sur son propre nom : un appel peut rendre un
      // nom plus precis que celui de la liste.
      const provider = typeof reply === "string" ? name : (reply.provider ?? name);
      if (typeof text !== "string" || text.trim() === "") {
        reports.set(name, {
          provider,
          outcome: "refuse",
          ms: Date.now() - started,
          detail: `${provider} n'a rien rendu`,
          reason: "reponse vide du modele",
        });
        return;
      }
      const g = await grade(text, provider);
      const ms = Date.now() - started;
      if (g.grade === "valide") {
        if (box.winner) {
          reports.set(name, {
            provider,
            outcome: "perdant",
            ms,
            detail: "reponse valide, mais arrivee apres le gagnant",
            reason: null,
          });
          return;
        }
        box.winner = { provider, value: g.value, ms };
        reports.set(name, { provider, outcome: "gagnant", ms, detail: null, reason: null });
        announce();
        return;
      }
      if (g.grade === "reserve") {
        if (!box.reserve) {
          box.reserve = { provider, value: g.value, ms };
          // Une reserve ne gagne pas tout de suite : un `valide` d'un autre fournisseur
          // vaut mieux, et il arrive peut-etre dans la seconde. Mais elle ne doit pas
          // non plus faire payer le budget entier — c'est le cas ORDINAIRE, et une
          // premiere version de cette course ne cloturait que sur `valide`, si bien que
          // la correction de latence ne servait justement pas la ou elle sert. On ouvre
          // donc une fenetre de grace bornee, puis on se contente de la reserve.
          const grace = setTimeout(() => {
            if (!box.winner) announce();
          }, GRACE_RESERVE_MS);
          if (typeof grace === "object" && "unref" in grace) grace.unref();
        }
        reports.set(name, {
          provider,
          outcome: "reserve",
          ms,
          detail: g.detail,
          reason: g.reason ?? null,
        });
        return;
      }
      reports.set(name, {
        provider,
        outcome: "refuse",
        ms,
        detail: g.detail,
        reason: g.reason ?? null,
      });
    } catch (e) {
      const ms = Date.now() - started;
      const outcome: RaceOutcome =
        e instanceof RaceCancelledError
          ? "annule"
          : e instanceof ProviderTimeoutError
            ? "expire"
            : "erreur";
      reports.set(name, {
        provider: name,
        outcome,
        ms,
        detail: (e as Error).message.slice(0, 200),
        // Trois causes, trois phrases. Une version anterieure ecrivait « modele
        // injoignable » des que ce n'etait pas une annulation : un fournisseur
        // parfaitement joignable, seulement plus lent que sa laisse, etait publie comme
        // injoignable. Le champ `reason` est lu par un humain qui decide s'il faut
        // changer de fournisseur ; lui mentir sur la cause lui fait prendre la mauvaise
        // decision.
        reason:
          outcome === "annule"
            ? null
            : outcome === "expire"
              ? "n'a pas repondu dans sa laisse"
              : "modele injoignable",
      });
    }
  });

  // Les taches ne rejettent jamais : tout est attrape au-dessus. `allSettled` est donc
  // l'evenement "plus personne ne court", pas un ramasse-miettes d'erreurs.
  const everyone = Promise.allSettled(tasks);
  let budgetHit = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const budget =
    budgetMs === undefined
      ? new Promise<void>(() => {})
      : new Promise<void>((res) => {
          timer = setTimeout(() => {
            budgetHit = true;
            res();
          }, budgetMs);
        });

  await Promise.race([firstValid, everyone, budget]);
  if (timer) clearTimeout(timer);
  ctrl.abort();

  // Ce qui n'a pas encore de note n'en aura pas : on vient de couper. On ecrit ce qu'on
  // SAIT (annule, ou budget epuise), on n'attend pas une note qui ne viendra pas et on
  // n'en fabrique pas une. La boucle est synchrone juste apres l'abort : aucune tache
  // ne peut s'intercaler pour ecrire entre-temps.
  for (const { name } of calls) {
    if (reports.has(name)) continue;
    reports.set(name, {
      provider: name,
      outcome: budgetHit ? "expire" : "annule",
      ms: Date.now() - t0,
      detail: budgetHit
        ? `budget de la course epuise : ${budgetMs} ms`
        : "coupe, un autre fournisseur a rendu une reponse utilisable avant lui",
      // Coupe par le budget n'est pas injoignable : ce fournisseur repondait peut-etre,
      // on ne l'a simplement pas laisse finir. On publie la cause reelle.
      reason: budgetHit ? `budget de la course epuise : ${budgetMs} ms` : null,
    });
  }
  const list = calls.map((c) => reports.get(c.name)!);
  const won = box.winner ?? box.reserve;
  return {
    value: won ? won.value : null,
    provider: won ? won.provider : null,
    reserved: box.winner === null && box.reserve !== null,
    reports: list,
    ms: Date.now() - t0,
  };
}

/** Le proces-verbal de la course, en clair, une ligne par fournisseur. */
export function describeRace(reports: ProviderReport[]): string[] {
  return reports.map((r) => {
    const head = `${r.provider} — ${r.outcome} en ${r.ms} ms`;
    return r.detail ? `${head} : ${r.detail}` : head;
  });
}

/**
 * La course vue comme un appel unique. Ici la seule exigence est "du texte non vide" :
 * ce qui suit (le choix d'un sujet dans une liste fermee) a sa propre validation, et la
 * refaire ici obligerait cette fonction a connaitre ce qu'elle transporte.
 */
export function raceCalls(calls: ProviderCall[], budgetMs?: number): ModelCall {
  return async (req) => {
    if (calls.length === 0) throw new Error("aucun fournisseur de modele configure");
    const r = await raceProviders<string>(
      calls,
      req,
      (text) => ({ grade: "valide", value: text }),
      budgetMs,
    );
    if (r.value === null) throw new Error(describeRace(r.reports).join(" ; "));
    const losers = r.reports.filter((x) => x.outcome !== "gagnant");
    return {
      text: r.value,
      provider: r.provider ?? undefined,
      note: losers.length ? `course : ${describeRace(losers).join(" ; ")}` : undefined,
    };
  };
}

export interface EnvModel {
  /** la course vue comme un appel unique : pour ce qui n'a qu'un texte a recuperer */
  call: ModelCall;
  /** les fournisseurs un par un : la course au niveau du PLAN en a besoin pour juger
   *  chaque reponse separement et pour nommer qui a fait quoi */
  calls: ProviderCall[];
  providers: string[];
  /** le budget de la course entiere : la plus LONGUE laisse + marge. JAMAIS moins que
   *  la plus longue laisse — ce serait couper un fournisseur avant sa propre limite. */
  budgetMs: number;
}

/**
 * Le modele tel que l'environnement le decrit. Rien n'est teste par le reseau ici :
 * une sonde au demarrage mentirait sur l'etat au moment de la question.
 *
 * `budgetMs` sort d'ici parce que c'est ici qu'on connait les laisses. Il vaut la plus
 * longue, plus la marge : les fournisseurs courent ensemble, ils ne s'attendent pas.
 */
export function modelCallFromEnv(opts: ProviderOptions = {}): EnvModel | null {
  const calls: { name: string; call: ModelCall }[] = [];
  const leashes: number[] = [];
  const ollamaUrl = process.env.OLLAMA_URL;
  if (ollamaUrl && process.env.TARE_DISABLE_OLLAMA !== "1") {
    const model = process.env.OLLAMA_PLANNER_MODEL ?? "granite3.3:8b";
    const timeoutMs = opts.timeoutMs ?? ollamaTimeoutMs();
    leashes.push(timeoutMs);
    calls.push({
      name: `ollama:${model}`,
      call: makeOllamaCall({ url: ollamaUrl, ...opts, timeoutMs }),
    });
  }
  if (process.env.OPENAI_API_KEY && process.env.TARE_DISABLE_OPENAI !== "1") {
    const model = process.env.OPENAI_PLANNER_MODEL ?? "gpt-4o-mini";
    const timeoutMs = opts.timeoutMs ?? openaiTimeoutMs();
    leashes.push(timeoutMs);
    calls.push({ name: `openai:${model}`, call: makeOpenAiCall({ ...opts, timeoutMs }) });
  }
  if (calls.length === 0) return null;
  const budgetMs = Math.max(...leashes) + CHAIN_MARGIN_MS;
  return {
    call: raceCalls(calls, budgetMs),
    calls,
    providers: calls.map((c) => c.name),
    budgetMs,
  };
}

/* ----------------------------------------------------------- l'explication */

export interface TopicChoice {
  topic: string | null;
  say: string | null;
  provider: string | null;
  error: string | null;
  /** ce que les fournisseurs perdants ont fait, quand l'appel etait une course */
  note: string | null;
}

/**
 * Le modele choisit UN sujet dans une liste fermee. Il n'ecrit pas l'explication.
 * Un sujet hors catalogue est traite comme une absence de choix, pas comme un sujet.
 */
export async function chooseTopic(
  call: ModelCall,
  question: string,
  timeoutMs = 20_000,
): Promise<TopicChoice> {
  let reply: ModelReply;
  try {
    reply = await withTimeout(call({ system: buildTopicPrompt(), user: question }), timeoutMs);
  } catch (e) {
    return {
      topic: null,
      say: null,
      provider: null,
      error: (e as Error).message.slice(0, 300),
      note: null,
    };
  }
  const { text, provider, note } =
    typeof reply === "string"
      ? { text: reply, provider: null, note: null }
      : { text: reply.text, provider: reply.provider ?? null, note: reply.note ?? null };
  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch (e) {
    return { topic: null, say: null, provider, error: (e as Error).message.slice(0, 300), note };
  }
  const o = (parsed ?? {}) as Record<string, unknown>;
  const topic = typeof o.topic === "string" ? o.topic.trim() : "";
  const say = typeof o.say === "string" && o.say.trim() !== "" ? o.say.trim().slice(0, 600) : null;
  if (topic === "" || topic === "none")
    return { topic: null, say, provider, error: topic === "" ? "aucun sujet rendu" : null, note };
  if (!DOCTRINE_IDS.includes(topic))
    return {
      topic: null,
      say,
      provider,
      error: `sujet hors catalogue : ${topic.slice(0, 60)}`,
      note,
    };
  return { topic, say, provider, error: null, note };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms} ms`)), ms)),
  ]);
}

/* ------------------------------------------------------- les planificateurs */

export interface LlmPlannerOptions {
  /**
   * Le budget de LA CHAINE ENTIERE, pas la laisse d'un fournisseur. Au-dela, on ne
   * conclut pas sur une reponse a moitie arrivee : on retombe sur le deterministe.
   * Le mettre a la valeur d'une seule laisse tue le repli — voir OLLAMA_TIMEOUT_MS.
   */
  budgetMs?: number;
  /** comment joindre le RAG vectoriel du lot N. `false` : on ne l'interroge pas. */
  rag?: RagOptions | false;
}

function emptyParams(): PlanOut["params"] {
  return {
    hooks: [],
    pools: [],
    measurementIds: [],
    minBps: null,
    maxBps: null,
    vanillaSwap: null,
    nameHits: [],
  };
}

function explainPlan(res: ExplainResult, say: string | null): PlanOut {
  return {
    intent: "explain",
    actions: [],
    reading: `expliquer : ${res.title}`,
    params: emptyParams(),
    why: res.why,
    say,
    degraded: res.degraded,
    explain: res,
  };
}

/**
 * Le planificateur d'explications. Sans modele, le sujet est choisi par regles ;
 * avec modele, le sujet est choisi par le modele DANS UNE LISTE FERMEE — et s'il
 * rate, on retombe sur les regles et c'est ecrit.
 */
export async function planExplain(
  question: string,
  store: StoreView,
  opts: { call?: ModelCall | null; timeoutMs?: number; rag?: RagOptions | false } = {},
): Promise<PlanOut> {
  const why: string[] = ["intention : explication du produit, pas interrogation du jeu"];
  let topic: string | null = null;
  let say: string | null = null;
  let chosenBy: ExplainResult["chosen_by"] = "regles";
  let degraded: { reason: string; detail: string } | null = null;

  if (opts.call) {
    const choice = await chooseTopic(opts.call, question, opts.timeoutMs ?? 20_000);
    if (choice.topic) {
      topic = choice.topic;
      chosenBy = "modele";
      why.push(`sujet choisi par le modele${choice.provider ? ` (${choice.provider})` : ""}`);
      if (choice.note) why.push(choice.note);
    } else {
      degraded = {
        reason: "aiguillage_modele_indisponible",
        detail: choice.error ?? "le modele n'a designe aucun sujet",
      };
      why.push(`repli sur les regles : ${choice.error ?? "aucun sujet rendu par le modele"}`);
    }
    say = choice.say;
  } else {
    why.push("aucun modele configure : sujet choisi par regles");
  }

  const res = await buildExplain(question, store, {
    topic,
    chosenBy,
    why,
    rag: opts.rag,
    degraded,
  });
  return explainPlan(res, say);
}

/** Ce qu'une reponse de modele vaut une fois lue : un plan, ou un renvoi vers la doctrine. */
export type PlanCandidate =
  | { kind: "plan"; intent: string; actions: Action[]; say: string | null }
  | { kind: "explain" };

/**
 * JUGE UNE REPONSE DE MODELE, sans reseau et sans effet de bord.
 *
 * C'est ici que "valide" prend son sens dans la course : Zod d'abord (actions.ts), puis
 * l'auditeur de nombres (narrate.ts) sur la phrase du modele. Sortir ce jugement du
 * planificateur permet de l'appliquer a CHAQUE concurrent au moment ou il repond, ce
 * qui est la seule facon de preferer un plan correct arrive en troisieme a un JSON
 * casse arrive en premier.
 *
 * POURQUOI `reserve` ET PAS `refuse` QUAND LA PHRASE PORTE UN CHIFFRE. Le plan reste
 * bon : ce sont ses ACTIONS qui interrogent le jeu, et elles ont passe Zod. C'est la
 * phrase qui est fautive, et ask.ts sait deja la jeter en le disant (`degraded`
 * uncited_numbers_in_model_sentence). La declarer perdante d'office ferait retomber la
 * question sur les expressions regulieres pour une phrase d'introduction — on perdrait
 * un plan correct par exces de zele.
 *
 * CE QUE CE PRE-AUDIT NE SAIT PAS. Il tourne AVANT l'execution, donc sans citation :
 * tout chiffre y est donc non source, y compris un seuil que la narration finale
 * aurait pu citer. Le verdict definitif reste celui d'ask.ts, avec les vraies
 * citations. La consequence d'une divergence est bornee et jamais un faux nombre :
 * un plan honnete peut seulement perdre sa priorite dans la course.
 */
export function gradeModelPlan(text: string): Grade<PlanCandidate> {
  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch (e) {
    return {
      grade: "refuse",
      reason: "JSON illisible",
      detail: (e as Error).message.slice(0, 300),
    };
  }

  // Le modele a lui-meme range la question dans la doctrine : on lui fera choisir le
  // sujet dans une liste fermee, on n'ecrit toujours pas le texte a sa place.
  if ((parsed as { intent?: unknown } | null)?.intent === "explain")
    return { grade: "valide", value: { kind: "explain" } };

  const res = parseModelPlan(parsed);
  if (!res.ok)
    return {
      grade: "refuse",
      reason: "plan refuse par la validation",
      detail: res.issues.map((i) => `${i.path}: ${i.message}`).join(" ; "),
    };
  if (res.plan.actions.length === 0)
    return { grade: "refuse", reason: "plan vide", detail: "aucune action proposee" };

  const say = res.plan.say ?? null;
  const value: PlanCandidate = {
    kind: "plan",
    intent: res.plan.intent,
    actions: res.plan.actions,
    say,
  };
  const audit = sanitizeModelSay(say ?? undefined, [], []);
  if (say !== null && audit.kept === null)
    return {
      grade: "reserve",
      value,
      reason: "uncited_numbers_in_model_sentence",
      detail: `phrase du modele porteuse de nombres non sources : ${audit.violations.join(", ")}`,
    };
  return { grade: "valide", value };
}

/**
 * Enveloppe un ou plusieurs appels modele en planificateur. Le repli deterministe
 * n'est pas un filet de securite discret : il est annonce dans `degraded`.
 *
 * Avec PLUSIEURS fournisseurs ils courent ensemble et la premiere reponse VALIDE gagne
 * (`raceProviders`) ; les autres sont annules et leur sort est ecrit dans `why`. Avec
 * un seul, c'est exactement l'ancien comportement, un fournisseur qui court seul.
 */
export function makeLlmPlanner(
  model: ModelCall | ProviderCall[],
  opts: LlmPlannerOptions = {},
): PlannerFn {
  const calls: ProviderCall[] =
    typeof model === "function" ? [{ name: "modele", call: model }] : [...model];
  const timeoutMs =
    opts.budgetMs ?? Math.max(ollamaTimeoutMs(), openaiTimeoutMs()) + CHAIN_MARGIN_MS;
  // L'explication n'a qu'un texte a recuperer : la course y est vue comme un appel.
  const explainCall = calls.length ? raceCalls(calls, timeoutMs) : null;

  return async (question, store, ctx) => {
    const fallback = (reason: string, detail: string, trace: string[] = []): PlanOut => {
      const p = deterministicPlan(question, store, ctx);
      return {
        ...p,
        why: [...p.why, ...trace, `repli deterministe : ${reason}`],
        degraded: { reason, detail: detail.slice(0, 300) },
      };
    };

    // Les questions de doctrine sont reconnues AVANT d'appeler le planificateur :
    // elles n'ont aucune action a produire, et le modele n'a qu'un sujet a choisir.
    if (detectExplain(question))
      return planExplain(question, store, { call: explainCall, timeoutMs, rag: opts.rag });

    const race = await raceProviders<PlanCandidate>(
      calls,
      { system: buildSystemPrompt(store), user: question },
      gradeModelPlan,
      timeoutMs,
    );
    // Une ligne par fournisseur, gagnant compris : c'est le proces-verbal de la course,
    // et il part dans la reponse. Un gain de vitesse qui effacerait qui a fait quoi
    // serait un mauvais echange pour ce projet.
    const trace = describeRace(race.reports).map((l) => `course : ${l}`);

    if (race.value === null) {
      // Aucune valeur : on ne devine pas laquelle des pannes resumer. Quand toutes les
      // causes se ressemblent on garde la leur, sinon on dit qu'il y en a plusieurs.
      const causes = new Set(race.reports.map((r) => r.reason).filter((r): r is string => !!r));
      const reason =
        causes.size === 1
          ? [...causes][0]!
          : "aucun fournisseur n'a rendu de plan valide";
      const only = race.reports.length === 1 ? race.reports[0]! : null;
      const detail = only ? (only.detail ?? only.outcome) : describeRace(race.reports).join(" ; ");
      return fallback(reason, detail, only ? [] : trace);
    }

    if (race.value.kind === "explain") {
      const p = await planExplain(question, store, {
        call: explainCall,
        timeoutMs,
        rag: opts.rag,
      });
      return {
        ...p,
        why: [
          ...p.why,
          `intention explain proposee par le modele${race.provider ? ` (${race.provider})` : ""}`,
          ...trace,
        ],
      };
    }

    const plan = race.value;
    const why = [
      "planificateur LLM",
      "actions validees par Zod avant execution",
      `fournisseur : ${race.provider}`,
      ...trace,
    ];
    if (race.reserved)
      why.push(
        "retenu sous reserve : la phrase du modele porte des nombres, l'auditeur de narrate.ts tranchera",
      );

    return {
      intent: intentFromActions(plan.actions, plan.intent),
      actions: plan.actions,
      reading: `plan propose par le modele (intent annonce: ${plan.intent})`,
      params: emptyParams(),
      why,
      say: plan.say,
      degraded: null,
      explain: null,
    };
  };
}

/**
 * Ajoute l'intention `explain` a un planificateur qui ne la connait pas. Le
 * planificateur deterministe passe par la : sans modele, le chat sait quand meme
 * expliquer le produit.
 */
export function withExplain(
  inner: PlannerFn,
  opts: { call?: ModelCall | null; timeoutMs?: number; rag?: RagOptions | false } = {},
): PlannerFn {
  return async (question, store, ctx) => {
    if (detectExplain(question)) return planExplain(question, store, opts);
    return inner(question, store, ctx);
  };
}

/** Le planificateur par defaut : deterministe, sans reseau, sans cle — mais il explique. */
export const deterministicPlanner: PlannerFn = withExplain(
  async (question, store, ctx) => deterministicPlan(question, store, ctx),
);

/** Le planificateur strictement deterministe, sans meme l'intention `explain`. */
export const rawDeterministicPlanner: PlannerFn = async (question, store, ctx) =>
  deterministicPlan(question, store, ctx);

export interface PlannerFromEnv {
  planner: PlannerFn;
  /** ce qui a ete branche, en clair, pour /health */
  mode: "llm" | "deterministe";
  providers: string[];
  /** le budget reellement applique a la chaine, publie pour qu'il soit verifiable */
  budget_ms: number;
  /** pourquoi ce mode-la, en une phrase lisible par un humain */
  why: string;
}

/**
 * Le planificateur decrit par l'environnement. Aucun appel reseau ici : on annonce
 * ce qui est CONFIGURE, jamais ce qui est joignable. Le premier appel dira le reste.
 */
export function plannerFromEnv(opts: LlmPlannerOptions & ProviderOptions = {}): PlannerFromEnv {
  const rag = opts.rag;
  if (process.env.TARE_PLANNER === "deterministe")
    return {
      planner: withExplain(rawDeterministicPlanner, { rag }),
      mode: "deterministe",
      providers: [],
      budget_ms: 0,
      why: "TARE_PLANNER=deterministe : le planificateur LLM est desactive a la main",
    };
  const env = modelCallFromEnv(opts);
  if (!env)
    return {
      planner: withExplain(rawDeterministicPlanner, { rag }),
      mode: "deterministe",
      providers: [],
      budget_ms: 0,
      why: "aucun fournisseur configure (ni OLLAMA_URL ni OPENAI_API_KEY) : expressions regulieres seules",
    };
  return {
    planner: makeLlmPlanner(env.calls, { ...opts, budgetMs: opts.budgetMs ?? env.budgetMs }),
    mode: "llm",
    providers: env.providers,
    budget_ms: opts.budgetMs ?? env.budgetMs,
    why:
      env.providers.length > 1
        ? `fournisseurs lances ensemble : ${env.providers.join(" et ")} ; la premiere reponse valide gagne, les autres sont annulees et leur sort est publie ; le deterministe reste le filet`
        : `un seul fournisseur : ${env.providers.join("")} ; le deterministe reste le filet`,
  };
}
