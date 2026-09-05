/**
 * LES ROUTES DE L'ASSISTANT.
 *
 * Un sous-routeur Hono autonome, montable sous n'importe quel prefixe :
 *
 *     import { registerAssistant } from "./assistant/index.js";
 *     registerAssistant(app);            // -> /assistant/*
 *
 * Il n'ajoute aucune dependance a l'API existante et ne touche a aucune de ses routes.
 * Le peage x402 ne couvre PAS ces routes : le chat tourne sur un quota de session
 * (voir session.ts), parce qu'aucun visiteur d'un navigateur n'a de compte Hedera.
 */
import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { ACTION_CATALOGUE, ActionSchema, parseActions } from "./actions.js";
import { getStore } from "./store.js";
import { getGraph, graphBuildCount } from "./graph.js";
import { execute, toRow, HONESTY_RULES } from "./execute.js";
import { ask, sessions as defaultSessions, type Stage } from "./ask.js";
import { deterministicPlanner, type PlannerFn } from "./llm.js";
import { SessionStore, safeSessionId } from "./session.js";

/**
 * LE CODE HTTP D'UNE REPONSE DE L'ASSISTANT.
 *
 * Il a menti pendant tout un tour de ce lot : `answer.ok ? 200 : 429`. Toute reponse
 * non-ok repartait donc en 429 Too Many Requests, y compris une question vide ou trop
 * longue — le client lisait "tu vas trop vite" alors que RIEN n'avait ete limite. Un
 * code de statut est une affirmation sur LA CAUSE ; se tromper de cause, c'est mentir,
 * et un client qui reagit au 429 en attendant puis en reessayant attendra pour rien.
 *
 * La regle, et pourquoi chaque code :
 *
 *  - 200 : la question a ete comprise. Une DEMANDE DE PRECISION est une reponse, pas
 *    un echec : intention `unclear` avec une action `clarify`, le corps porte la
 *    lecture, les suggestions et le quota. Le modele qui n'a pas su quoi interroger
 *    n'est pas un client fautif.
 *  - 400 : il n'y a pas de question exploitable — absente, vide, ou plus de 600
 *    caracteres (ask.ts). C'est la requete qui est en faute, pas la cadence.
 *  - 429 : le quota de questions de la session est epuise. C'est la SEULE cause qui
 *    merite ce code ici, et c'en est vraiment une : fenetre glissante par session
 *    (session.ts). Le corps porte `quota.resets_at`, et on ajoute `Retry-After`,
 *    calcule depuis cette date — pas une constante inventee.
 *  - 503 : le planificateur a leve. Ce n'est ni la faute du client ni une limite de
 *    debit, et rien ne dit que ca durera.
 *  - 500 : un `ok:false` dont on ne connait pas la cause. On ne devine pas a la place
 *    d'ask.ts : plutot avouer "je ne sais pas pourquoi" que designer un coupable au
 *    hasard. Si ce code apparait, c'est qu'une voie a ete ajoutee sans etre nommee ici.
 *
 * CE QU'ON NE PREND PAS : 402. Dans ce depot, 402 appartient a x402 et n'est jamais nu :
 * le middleware (src/x402.ts) y joint l'en-tete `payment-required`, et src/app.ts
 * recopie `accepts[]` dans le corps pour qu'un humain le lise. Un 402 sans ces
 * exigences ferait boucler un client x402 sur un paiement que le chat ne sait pas
 * encaisser — le chat n'a pas de prix, il a un quota, et pour la raison ecrite dans
 * session.ts : aucun visiteur de navigateur n'a de compte Hedera.
 */
export const ASSISTANT_STATUS_RULES = [
  "200 : question comprise, y compris quand la reponse est une demande de precision",
  "400 : question absente, vide ou trop longue",
  "429 : quota de questions de la session epuise (Retry-After depuis quota.resets_at)",
  "503 : le planificateur a leve",
  "500 : cause inconnue — jamais un code emprunte a une autre couche",
] as const;

/** Ce dont le calcul a besoin. Volontairement etroit : ce sont les seuls champs qui
 *  portent une CAUSE, et aucun d'eux n'est du texte destine a un humain. */
export interface StatusInput {
  ok: boolean;
  degraded?: { reason: string; detail: string } | null;
}

export function httpStatusForAnswer(a: StatusInput): ContentfulStatusCode {
  if (a.ok) return 200;
  const reason = a.degraded?.reason ?? null;
  // ask.ts ne pose PAS de `degraded` sur la seule voie ou la question elle-meme est
  // inexploitable : c'est ce qui la distingue, et c'est verifie par les tests.
  if (reason === null) return 400;
  if (reason === "quota") return 429;
  if (reason === "planner_error") return 503;
  return 500;
}

/** Secondes a attendre avant de reessayer, prises sur la fenetre reelle de la session.
 *  Rend null quand la reponse ne porte pas de quota utilisable : on n'invente pas un
 *  delai, on se tait. */
export function retryAfterSeconds(resetsAt: unknown, now = Date.now()): number | null {
  if (typeof resetsAt !== "number" || !Number.isFinite(resetsAt)) return null;
  return Math.max(0, Math.ceil((resetsAt - now) / 1000));
}

export interface AssistantDeps {
  planner?: PlannerFn;
  sessions?: SessionStore;
  /** desactive CORS quand l'assistant est monte dans une app qui le gere deja */
  cors?: boolean;
  /**
   * Ce qui a ete branche comme planificateur, en clair, pour /health. C'est une
   * DECLARATION de configuration, jamais une sonde : on n'appelle aucun fournisseur
   * au demarrage, parce qu'un fournisseur joignable a 8h ne l'est pas forcement a la
   * question suivante, et annoncer "ok" sur la foi d'une sonde ancienne serait mentir.
   */
  plannerInfo?: PlannerInfo;
}

/** Ce que /health dit du planificateur. Aucun secret n'y passe : des noms de modeles. */
export interface PlannerInfo {
  mode: "llm" | "deterministe";
  providers: string[];
  budget_ms: number;
  why: string;
}

const DETERMINISTIC_INFO: PlannerInfo = {
  mode: "deterministe",
  providers: [],
  budget_ms: 0,
  why: "aucun planificateur LLM fourni a ce routeur : expressions regulieres seules",
};

export function createAssistantRouter(deps: AssistantDeps = {}) {
  const app = new Hono();
  const bag = deps.sessions ?? defaultSessions;
  const planner = deps.planner ?? deterministicPlanner;
  const plannerInfo = deps.plannerInfo ?? DETERMINISTIC_INFO;
  if (deps.cors !== false) app.use("*", cors());

  app.get("/", (c) =>
    c.json({
      service: "TARE — assistant",
      golden_rule:
        "Le modele choisit quoi interroger et explique ce qui revient. IL NE PRODUIT JAMAIS UN NOMBRE : toute valeur citee vient d'une ligne du jeu, avec son bloc, sa taille et son sens.",
      honesty_rules: HONESTY_RULES,
      routes: [
        "GET  /            ce document",
        "GET  /actions     le catalogue des actions que le front sait executer",
        "GET  /table       l'etat initial du tableau (aucune question)",
        "GET  /health      etat du modele de lecture et du graphe",
        "GET  /quota       le quota de la session",
        "POST /ask         {question, session_id?} -> actions + narration + citations",
        "GET  /stream?q=   les memes etapes, en flux SSE (EventSource)",
        "POST /stream      idem, question dans le corps",
        "POST /actions/validate  valide une liste d'actions sans rien executer",
        "POST /actions/run       execute une liste d'actions deja typee (le front rejoue un permalien)",
      ],
      status_codes: ASSISTANT_STATUS_RULES,
      billing:
        "Le chat a un quota par session. Facturer une mesure en x402 depuis un navigateur est impossible : aucun visiteur n'a de compte Hedera. x402 garde POST /measure et le MCP.",
    }),
  );

  app.get("/actions", (c) =>
    c.json({
      count: ACTION_CATALOGUE.length,
      note: "Toutes les actions sont validees par Zod en sortie. Aucune ne peut transporter un resultat de mesure.",
      actions: ACTION_CATALOGUE,
    }),
  );

  app.get("/health", (c) => {
    const store = getStore();
    const graph = getGraph(store);
    return c.json({
      ok: store.complete,
      complete: store.complete,
      incomplete_reason: store.incomplete_reason,
      dataset: store.dataset,
      registry: store.registry,
      graph: graph.stats,
      graph_builds: graphBuildCount(),
      sessions: bag.size(),
      planner: plannerInfo,
    });
  });

  app.get("/quota", (c) => {
    const id = safeSessionId(c.req.query("session_id"));
    return c.json({ session_id: id, quota: bag.state(id) });
  });

  app.get("/table", (c) => {
    const store = getStore();
    return c.json({
      dataset: store.dataset,
      registry: store.registry,
      count: store.hooks.length,
      rows: store.hooks.map(toRow),
      honesty_rules: HONESTY_RULES,
    });
  });

  app.post("/ask", async (c) => {
    let body: Record<string, unknown> = {};
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "corps JSON invalide" }, 400);
    }
    const answer = await ask(body.question, {
      sessionId: typeof body.session_id === "string" ? body.session_id : undefined,
      planner,
      sessions: bag,
    });
    const status = httpStatusForAnswer(answer);
    if (status === 429) {
      const secs = retryAfterSeconds(answer.quota?.resets_at);
      if (secs !== null) c.header("Retry-After", String(secs));
    }
    return c.json(answer, status);
  });

  const streamAnswer = (c: Context, question: unknown, sessionId?: string) =>
    streamSSE(c, async (stream) => {
      const send = async (stage: Stage) => {
        await stream.writeSSE({ event: stage.event, data: JSON.stringify(stage.data) });
      };
      try {
        await ask(question, { sessionId, planner, sessions: bag, onStage: send });
      } catch (e) {
        // Regle dure : on ne conclut jamais sur une reponse tronquee.
        await send({
          event: "error",
          data: {
            error: "flux interrompu",
            detail: (e as Error).message.slice(0, 300),
            label: "NOT_MEASURABLE",
            note: "aucun resultat partiel n'est publie : une reponse coupee n'est pas une reponse.",
          },
        });
      }
    });

  app.get("/stream", async (c) =>
    streamAnswer(c, c.req.query("q") ?? c.req.query("question"), c.req.query("session_id")),
  );

  app.post("/stream", async (c) => {
    let body: Record<string, unknown> = {};
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "corps JSON invalide" }, 400);
    }
    return streamAnswer(
      c,
      body.question,
      typeof body.session_id === "string" ? body.session_id : undefined,
    );
  });

  app.post("/actions/validate", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "corps JSON invalide" }, 400);
    }
    const list = Array.isArray(body) ? body : (body as { actions?: unknown }).actions;
    const res = parseActions(list);
    return c.json(res, res.ok ? 200 : 400);
  });

  app.post("/actions/run", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "corps JSON invalide" }, 400);
    }
    const list = Array.isArray(body) ? body : (body as { actions?: unknown }).actions;
    const res = parseActions(list);
    if (!res.ok) return c.json(res, 400);
    const store = getStore();
    const exec = execute(res.actions, store, getGraph(store), { measureQuotaLeft: 0 });
    return c.json({
      ok: true,
      actions: res.actions,
      data: exec,
      dataset: store.dataset,
      honesty_rules: HONESTY_RULES,
    });
  });

  return app;
}

/** Monte l'assistant sur une app existante, sans toucher a ses routes. */
export function registerAssistant(
  app: Hono,
  deps: AssistantDeps & { basePath?: string } = {},
): Hono {
  app.route(deps.basePath ?? "/assistant", createAssistantRouter(deps));
  return app;
}

export { ActionSchema };
