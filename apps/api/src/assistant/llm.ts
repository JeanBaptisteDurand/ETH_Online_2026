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
 * L'ORDRE DES FOURNISSEURS : Ollama d'abord (local, gratuit, granite3.3:8b), OpenAI
 * en repli (gpt-4o-mini). Chaque echec est conserve et publie ; on ne fait jamais
 * passer une bascule de fournisseur pour un fonctionnement normal.
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
export type ModelCall = (req: { system: string; user: string }) => Promise<ModelReply>;

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

export interface ProviderOptions {
  timeoutMs?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  f: typeof fetch,
): Promise<{ status: number; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await f(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return { status: r.status, text: await r.text() };
  } finally {
    clearTimeout(timer);
  }
}

/** Ollama, en local : gratuit, et c'est le premier essaye. */
export function makeOllamaCall(
  cfg: { url?: string; model?: string } & ProviderOptions = {},
): ModelCall {
  const base = (cfg.url ?? process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = cfg.model ?? process.env.OLLAMA_PLANNER_MODEL ?? "granite3.3:8b";
  const timeoutMs = cfg.timeoutMs ?? 25_000;
  const maxTokens = cfg.maxTokens ?? 700;
  const f = cfg.fetchImpl ?? fetch;
  const name = `ollama:${model}`;
  return async ({ system, user }) => {
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
  const timeoutMs = cfg.timeoutMs ?? 20_000;
  const maxTokens = cfg.maxTokens ?? 700;
  const f = cfg.fetchImpl ?? fetch;
  const name = `openai:${model}`;
  return async ({ system, user }) => {
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
 * Essaye les appels dans l'ordre. Chaque echec est CONSERVE et remonte avec le
 * succes : basculer de fournisseur n'est pas un fonctionnement normal, ca se dit.
 */
export function chainCalls(calls: { name: string; call: ModelCall }[]): ModelCall {
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

export interface EnvModel {
  call: ModelCall;
  providers: string[];
}

/**
 * Le modele tel que l'environnement le decrit. Rien n'est teste par le reseau ici :
 * une sonde au demarrage mentirait sur l'etat au moment de la question.
 */
export function modelCallFromEnv(opts: ProviderOptions = {}): EnvModel | null {
  const calls: { name: string; call: ModelCall }[] = [];
  const ollamaUrl = process.env.OLLAMA_URL;
  if (ollamaUrl && process.env.TARE_DISABLE_OLLAMA !== "1") {
    const model = process.env.OLLAMA_PLANNER_MODEL ?? "granite3.3:8b";
    calls.push({ name: `ollama:${model}`, call: makeOllamaCall({ url: ollamaUrl, ...opts }) });
  }
  if (process.env.OPENAI_API_KEY && process.env.TARE_DISABLE_OPENAI !== "1") {
    const model = process.env.OPENAI_PLANNER_MODEL ?? "gpt-4o-mini";
    calls.push({ name: `openai:${model}`, call: makeOpenAiCall(opts) });
  }
  if (calls.length === 0) return null;
  return { call: chainCalls(calls), providers: calls.map((c) => c.name) };
}

/* ----------------------------------------------------------- l'explication */

export interface TopicChoice {
  topic: string | null;
  say: string | null;
  provider: string | null;
  error: string | null;
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
    return { topic: null, say: null, provider: null, error: (e as Error).message.slice(0, 300) };
  }
  const { text, provider } = typeof reply === "string" ? { text: reply, provider: null } : { text: reply.text, provider: reply.provider ?? null };
  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch (e) {
    return { topic: null, say: null, provider, error: (e as Error).message.slice(0, 300) };
  }
  const o = (parsed ?? {}) as Record<string, unknown>;
  const topic = typeof o.topic === "string" ? o.topic.trim() : "";
  const say = typeof o.say === "string" && o.say.trim() !== "" ? o.say.trim().slice(0, 600) : null;
  if (topic === "" || topic === "none")
    return { topic: null, say, provider, error: topic === "" ? "aucun sujet rendu" : null };
  if (!DOCTRINE_IDS.includes(topic))
    return { topic: null, say, provider, error: `sujet hors catalogue : ${topic.slice(0, 60)}` };
  return { topic, say, provider, error: null };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms} ms`)), ms)),
  ]);
}

/* ------------------------------------------------------- les planificateurs */

export interface LlmPlannerOptions {
  /** au-dela, on ne conclut pas sur une reponse a moitie arrivee : on retombe */
  timeoutMs?: number;
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

/**
 * Enveloppe un appel modele en planificateur. Le repli deterministe n'est pas un
 * filet de securite discret : il est annonce dans `degraded`.
 */
export function makeLlmPlanner(call: ModelCall, opts: LlmPlannerOptions = {}): PlannerFn {
  const timeoutMs = opts.timeoutMs ?? 25_000;
  return async (question, store, ctx) => {
    const fallback = (reason: string, detail: string): PlanOut => {
      const p = deterministicPlan(question, store, ctx);
      return {
        ...p,
        why: [...p.why, `repli deterministe : ${reason}`],
        degraded: { reason, detail: detail.slice(0, 300) },
      };
    };

    // Les questions de doctrine sont reconnues AVANT d'appeler le planificateur :
    // elles n'ont aucune action a produire, et le modele n'a qu'un sujet a choisir.
    const det = detectExplain(question);
    if (det)
      return planExplain(question, store, { call, timeoutMs, rag: opts.rag });

    let raw: ModelReply;
    try {
      raw = await withTimeout(
        call({ system: buildSystemPrompt(store), user: question }),
        timeoutMs,
      );
    } catch (e) {
      return fallback("modele injoignable", (e as Error).message);
    }
    const text = typeof raw === "string" ? raw : raw.text;
    const provider = typeof raw === "string" ? null : (raw.provider ?? null);
    const note = typeof raw === "string" ? null : (raw.note ?? null);
    if (typeof text !== "string" || text.trim() === "")
      return fallback("reponse vide du modele", `fournisseur: ${provider ?? "inconnu"}`);

    let parsedJson: unknown;
    try {
      parsedJson = extractJson(text);
    } catch (e) {
      return fallback("JSON illisible", (e as Error).message);
    }

    // Le modele a lui-meme range la question dans la doctrine : on lui fait choisir
    // le sujet, on n'ecrit toujours pas le texte a sa place.
    const hinted = (parsedJson as { intent?: unknown } | null)?.intent;
    if (hinted === "explain") {
      const p = await planExplain(question, store, { call, timeoutMs, rag: opts.rag });
      return {
        ...p,
        why: [
          ...p.why,
          `intention explain proposee par le modele${provider ? ` (${provider})` : ""}`,
        ],
      };
    }

    const res = parseModelPlan(parsedJson);
    if (!res.ok)
      return fallback(
        "plan refuse par la validation",
        res.issues.map((i) => `${i.path}: ${i.message}`).join(" ; "),
      );
    if (res.plan.actions.length === 0) return fallback("plan vide", "aucune action proposee");

    const why = ["planificateur LLM", "actions validees par Zod avant execution"];
    if (provider) why.push(`fournisseur : ${provider}`);
    if (note) why.push(note);

    return {
      intent: intentFromActions(res.plan.actions, res.plan.intent),
      actions: res.plan.actions,
      reading: `plan propose par le modele (intent annonce: ${res.plan.intent})`,
      params: emptyParams(),
      why,
      say: res.plan.say ?? null,
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
}

/**
 * Le planificateur decrit par l'environnement. Aucun appel reseau ici : on annonce
 * ce qui est CONFIGURE, jamais ce qui est joignable. Le premier appel dira le reste.
 */
export function plannerFromEnv(opts: LlmPlannerOptions & ProviderOptions = {}): PlannerFromEnv {
  if (process.env.TARE_PLANNER === "deterministe")
    return { planner: deterministicPlanner, mode: "deterministe", providers: [] };
  const env = modelCallFromEnv(opts);
  if (!env) return { planner: deterministicPlanner, mode: "deterministe", providers: [] };
  return {
    planner: makeLlmPlanner(env.call, opts),
    mode: "llm",
    providers: env.providers,
  };
}
