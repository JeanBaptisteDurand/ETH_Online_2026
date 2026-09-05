/**
 * LA BOUCLE : question -> planificateur -> graphe (structure) + JSONL (grandeurs)
 *              -> resultats -> narration + actions.
 *
 * Une seule fonction publique, `ask()`. Elle rend un objet complet ; le flux SSE
 * (sse.ts) n'est qu'une autre facon de servir les MEMES etapes, dans l'ordre ou
 * elles se produisent.
 */
import type { Action } from "./actions.js";
import type { Label } from "../labels.js";
import { getStore, type StoreView } from "./store.js";
import { getGraph } from "./graph.js";
import { execute, narrate, HONESTY_RULES, type Execution } from "./execute.js";
import { deterministicPlanner, type PlannerFn } from "./llm.js";
import type { Intent, PlanOut } from "./planner.js";
import { sanitizeModelSay, UncitedNumberError, type Citation } from "./narrate.js";
import type { ExplainSource } from "./explain.js";
import { SessionStore, safeSessionId, type QuotaState } from "./session.js";

export interface Stage {
  event:
    | "hello"
    | "plan"
    | "action"
    | "rows"
    | "narration"
    | "citations"
    | "degraded"
    | "done"
    | "error";
  data: unknown;
}

export interface AskOptions {
  sessionId?: string;
  planner?: PlannerFn;
  sessions?: SessionStore;
  store?: StoreView;
  now?: number;
  /** appele au fur et a mesure : le flux SSE n'est que ce rappel branche sur une reponse */
  onStage?: (stage: Stage) => void | Promise<void>;
}

export interface Answer {
  ok: boolean;
  session_id: string;
  question: string;
  intent: Intent;
  reading: string;
  why: string[];
  actions: Action[];
  narration: string;
  citations: Citation[];
  /** les fragments recopies d'une source (noms du registre, adresses) : ils contiennent
   *  parfois des chiffres sans etre des affirmations chiffrees. Publies pour que le
   *  client puisse refaire l'audit des nombres a l'identique. */
  identifiers: string[];
  /** l'etiquette de la reponse : null quand elle ne porte aucune grandeur mesuree */
  label: Label | null;
  /** les sources d'une explication : fichier, section, passage relu, lien cliquable.
   *  Vide pour toutes les autres intentions — elles citent des mesures, pas des textes. */
  sources: ExplainSource[];
  data: {
    rows: Execution["rows"];
    withheld: Execution["withheld"];
    selection: string[];
    criteria: Execution["criteria"];
    sort: Execution["sort"];
    columns: Execution["columns"];
    steps: Execution["steps"];
    truncated: boolean;
    warnings: string[];
  };
  dataset: StoreView["dataset"];
  registry: StoreView["registry"];
  quota: QuotaState;
  honesty_rules: string[];
  degraded: { reason: string; detail: string } | null;
  suggestions: string[];
  timings_ms: { plan: number; execute: number; narrate: number; total: number };
}

/** Le magasin de sessions par defaut du processus. */
export const sessions = new SessionStore();

const SUGGESTIONS: Partial<Record<Intent, string[]>> = {
  "registry-disagrees": [
    "ouvre le premier",
    "trace la courbe de ce hook",
    "montre les contradictions",
  ],
  "top-extractors": ["trace la courbe du premier", "compare les deux premiers", "montre les orphelins"],
  curve: ["montre la preuve du point le plus haut", "les jumeaux de ce hook", "le rayon d'impact de ce hook"],
  open: ["trace la courbe", "les jumeaux de ce hook", "qui l'a deploye"],
  explain: [
    "que veut dire NOT_MEASURABLE ?",
    "un bps eleve est-il un abus ?",
    "comment je verifie une valeur ?",
  ],
  unclear: [
    "les hooks qui prennent plus de 100 bps",
    "les hooks que le registre dit vanillaSwap=false mais qui mesurent moins de 1 bps",
    "les orphelins",
  ],
};

const DEFAULT_SUGGESTIONS = [
  "les hooks que le registre dit vanillaSwap=false mais qui mesurent moins de 1 bps",
  "les hooks qui prennent plus de 100 bps",
  "les contradictions",
];

function emptyExecution(): Execution {
  return {
    steps: [],
    rows: [],
    withheld: [],
    selection: [],
    criteria: null,
    sort: null,
    columns: null,
    truncated: false,
    warnings: [],
  };
}

export async function ask(questionRaw: unknown, opts: AskOptions = {}): Promise<Answer> {
  const t0 = Date.now();
  const store = opts.store ?? getStore();
  const graph = getGraph(store);
  const bag = opts.sessions ?? sessions;
  const session_id = safeSessionId(opts.sessionId);
  const now = opts.now ?? Date.now();
  const base = {
    session_id,
    dataset: store.dataset,
    registry: store.registry,
    honesty_rules: HONESTY_RULES,
    suggestions: DEFAULT_SUGGESTIONS,
    sources: [] as ExplainSource[],
  };

  const emit = async (event: Stage["event"], data: unknown): Promise<void> => {
    if (opts.onStage) await opts.onStage({ event, data });
  };
  await emit("hello", {
    session_id,
    dataset: store.dataset,
    registry: store.registry,
    honesty_rules: HONESTY_RULES,
  });

  const question = typeof questionRaw === "string" ? questionRaw.trim() : "";
  if (question === "" || question.length > 600) {
    const quota = bag.state(session_id, now);
    return {
      ...base,
      ok: false,
      question,
      intent: "unclear",
      reading: "question absente ou trop longue",
      why: [],
      actions: [{ type: "clarify", question: "Pose une question de moins de six cents caracteres." }],
      narration:
        "Je n'ai pas de question exploitable. Donne-moi un hook, un seuil en bps, ou demande les contradictions.",
      citations: [],
      identifiers: [],
      label: null,
      data: { ...emptyExecution(), truncated: false, warnings: [] },
      quota,
      degraded: null,
      timings_ms: { plan: 0, execute: 0, narrate: 0, total: Date.now() - t0 },
    };
  }

  const spend = bag.spendQuestion(session_id, now);
  if (!spend.ok) {
    return {
      ...base,
      ok: false,
      question,
      intent: "unclear",
      reading: "quota de session epuise",
      why: [],
      actions: [
        {
          type: "clarify",
          question:
            "Quota de questions epuise pour cette session. L'API (x402) et le MCP restent ouverts a un client qui a un compte Hedera.",
        },
      ],
      narration:
        "Le quota de questions de cette session est epuise. Je ne reponds pas a moitie : rien n'est calcule, rien n'est affirme. L'API x402 et le MCP restent disponibles pour un client qui dispose d'un compte Hedera.",
      citations: [],
      identifiers: [],
      label: null,
      data: { ...emptyExecution(), truncated: false, warnings: [] },
      quota: spend.state,
      degraded: { reason: "quota", detail: "questions_left=0" },
      timings_ms: { plan: 0, execute: 0, narrate: 0, total: Date.now() - t0 },
    };
  }

  const s = bag.get(session_id, now);
  const planner = opts.planner ?? deterministicPlanner;

  const tPlan = Date.now();
  let planOut: PlanOut;
  try {
    planOut = await planner(question, store, {
      lastHooks: s.lastHooks,
      openHook: s.openHook,
      openPool: s.openPool,
    });
  } catch (e) {
    return {
      ...base,
      ok: false,
      question,
      intent: "unclear",
      reading: "le planificateur a echoue",
      why: [],
      actions: [{ type: "clarify", question: "Reformule la question : le planificateur n'a rien pu en tirer." }],
      narration:
        "Le planificateur a echoue sur cette question. Je ne devine pas ce qu'il fallait interroger : reformule.",
      citations: [],
      identifiers: [],
      label: null,
      data: { ...emptyExecution(), truncated: false, warnings: [] },
      quota: spend.state,
      degraded: { reason: "planner_error", detail: (e as Error).message.slice(0, 300) },
      timings_ms: { plan: Date.now() - tPlan, execute: 0, narrate: 0, total: Date.now() - t0 },
    };
  }
  const planMs = Date.now() - tPlan;
  await emit("plan", {
    intent: planOut.intent,
    reading: planOut.reading,
    why: planOut.why,
    actions: planOut.actions,
  });

  // Une demande de mesure consomme le quota de mesures, pas celui des questions.
  let measureQuotaLeft = bag.state(session_id, now).measures_left;
  if (planOut.actions.some((a) => a.type === "measure")) {
    const m = bag.spendMeasure(session_id, now);
    measureQuotaLeft = m.state.measures_left;
  }

  const tExec = Date.now();
  // Une explication n'interroge PAS le jeu de mesures : elle explique la methode.
  // Executer une liste d'actions vide renverrait tout le tableau comme "selection",
  // ce qui ferait passer une explication pour un resultat de requete.
  const exec: Execution = planOut.explain
    ? {
        ...emptyExecution(),
        warnings: store.complete ? [] : [store.incomplete_reason ?? "lecture partielle du jeu"],
      }
    : execute(planOut.actions, store, graph, { measureQuotaLeft });
  const execMs = Date.now() - tExec;
  for (const step of exec.steps)
    await emit("action", { action: step.action, ok: step.ok, label: step.label, note: step.note });
  await emit("rows", {
    rows: exec.rows,
    withheld: exec.withheld,
    selection: exec.selection,
    criteria: exec.criteria,
    sort: exec.sort,
    columns: exec.columns,
    truncated: exec.truncated,
    warnings: exec.warnings,
  });

  const tNarr = Date.now();
  let narration = "";
  let citations: Citation[] = [];
  let identifiers: string[] = [];
  let label: Label | null = null;
  let degraded = planOut.degraded ?? null;
  let sources: ExplainSource[] = [];
  try {
    if (planOut.explain) {
      // Le texte a deja ete audite a la construction (explain.ts, renderArticle) :
      // aucun chiffre n'y figure sans citation. On le publie tel quel, avec ses sources.
      narration = planOut.explain.text;
      citations = planOut.explain.citations;
      identifiers = planOut.explain.identifiers;
      sources = planOut.explain.sources;
      label = null;
    } else {
      const out = narrate(planOut.intent, planOut, exec, store);
      narration = out.text;
      citations = out.citations;
      identifiers = out.identifiers;
      label = out.label;
    }
  } catch (e) {
    // Un gabarit qui laisse passer un nombre non source est un BUG, pas un detail :
    // on publie l'aveu, jamais le nombre.
    const isGuard = e instanceof UncitedNumberError;
    narration = isGuard
      ? "Un nombre sans source s'est glisse dans ma phrase : je la retire. Les lignes du tableau restent affichees avec leur etiquette et leur commande de rejeu — elles, elles sont sourcees."
      : "La narration a echoue. Les lignes du tableau restent affichees telles qu'elles sont dans le jeu.";
    citations = [];
    identifiers = [];
    sources = [];
    label = null;
    degraded = {
      reason: isGuard ? "uncited_number_in_template" : "narration_error",
      detail: (e as Error).message.slice(0, 300),
    };
  }
  const narrMs = Date.now() - tNarr;

  // La phrase du modele, si elle survit a l'auditeur. Sinon on le dit.
  const say = sanitizeModelSay(planOut.say ?? undefined, citations, identifiers);
  if (planOut.say && say.kept === null) {
    degraded = {
      reason: "uncited_numbers_in_model_sentence",
      detail: `nombres non sources rejetes : ${say.violations.join(", ")}`,
    };
  } else if (say.kept) {
    narration = `${say.kept} ${narration}`;
  }

  for (const chunk of chunkNarration(narration)) await emit("narration", { chunk });
  await emit("citations", { citations, identifiers, sources });
  if (degraded) await emit("degraded", degraded);

  // Memoire de session : de quoi parlait cette reponse. Une explication ne parle
  // d'aucun hook : elle ne doit pas effacer le contexte de la question precedente.
  const opened = planOut.actions.find((a) => a.type === "open");
  if (!planOut.explain)
    bag.remember(session_id, {
      lastHooks: exec.selection.length ? exec.selection : planOut.params.hooks,
      ...(opened && opened.type === "open"
        ? { openHook: opened.hook, openPool: opened.pool ?? null }
        : {}),
    });

  await emit("done", {
    label,
    quota: bag.state(session_id, now),
    degraded,
    timings_ms: { plan: planMs, execute: execMs, narrate: narrMs, total: Date.now() - t0 },
  });

  return {
    ...base,
    ok: true,
    question,
    intent: planOut.intent,
    reading: planOut.reading,
    why: planOut.why,
    actions: planOut.actions,
    narration,
    citations,
    identifiers,
    label,
    sources,
    data: {
      rows: exec.rows,
      withheld: exec.withheld,
      selection: exec.selection,
      criteria: exec.criteria,
      sort: exec.sort,
      columns: exec.columns,
      steps: exec.steps,
      truncated: exec.truncated,
      warnings: exec.warnings,
    },
    quota: bag.state(session_id, now),
    degraded,
    suggestions: SUGGESTIONS[planOut.intent] ?? DEFAULT_SUGGESTIONS,
    timings_ms: { plan: planMs, execute: execMs, narrate: narrMs, total: Date.now() - t0 },
  };
}

/** Decoupe la narration en morceaux lisibles pour le flux, sans couper un nombre en deux. */
export function chunkNarration(text: string): string[] {
  const parts = text.split(/(?<=\. )/);
  const out: string[] = [];
  for (const p of parts) {
    if (p.trim() === "") continue;
    if (out.length && (out[out.length - 1]!.length + p.length) < 40) out[out.length - 1] += p;
    else out.push(p);
  }
  return out.length ? out : [text];
}
