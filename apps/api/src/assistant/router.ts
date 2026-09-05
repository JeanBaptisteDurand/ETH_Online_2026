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
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { ACTION_CATALOGUE, ActionSchema, parseActions } from "./actions.js";
import { getStore } from "./store.js";
import { getGraph, graphBuildCount } from "./graph.js";
import { execute, toRow, HONESTY_RULES } from "./execute.js";
import { ask, sessions as defaultSessions, type Stage } from "./ask.js";
import { deterministicPlanner, type PlannerFn } from "./llm.js";
import { SessionStore, safeSessionId } from "./session.js";

export interface AssistantDeps {
  planner?: PlannerFn;
  sessions?: SessionStore;
  /** desactive CORS quand l'assistant est monte dans une app qui le gere deja */
  cors?: boolean;
}

export function createAssistantRouter(deps: AssistantDeps = {}) {
  const app = new Hono();
  const bag = deps.sessions ?? defaultSessions;
  const planner = deps.planner ?? deterministicPlanner;
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
    return c.json(answer, answer.ok ? 200 : 429);
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
