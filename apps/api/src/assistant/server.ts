/**
 * L'assistant, servi seul.
 *
 *   npx tsx src/assistant/server.ts          # -> http://127.0.0.1:8788/assistant
 *
 * Il tourne a cote de l'API principale (port 8787) sans rien lui prendre : il ne lit
 * que le jeu de mesures et le registre, il n'ouvre aucun fork et ne mesure rien.
 * (Un seul mesureur par anvil : la mesure reste derriere POST /measure de l'API.)
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { registerAssistant } from "./router.js";
import { getStore } from "./store.js";
import { getGraph } from "./graph.js";
import { plannerFromEnv } from "./llm.js";

const port = Number(process.env.ASSISTANT_PORT ?? 8788);

// LE PLANIFICATEUR REEL. Ollama et OpenAI sont lances ENSEMBLE sur chaque question et
// la premiere reponse valide gagne (llm.ts, raceProviders) ; le deterministe reste le
// filet en dessous des deux. On ne sonde aucun fournisseur ici : ce qui est imprime est
// ce qui est CONFIGURE, pas ce qui est joignable. Chaque question dira elle-meme, dans
// `why` et `degraded`, qui a repondu et ce que les autres ont fait.
const { planner, mode, providers, budget_ms, why } = plannerFromEnv();

const app = new Hono();
app.use("*", cors());
app.get("/", (c) => c.redirect("/assistant"));
registerAssistant(app, {
  cors: false,
  planner,
  plannerInfo: { mode, providers, budget_ms, why },
});

// On chauffe le modele de lecture et le graphe AU DEMARRAGE, une fois. Les reconstruire
// a chaque requete serait le bug du RAG COBOL de reference : 102 ms de CPU brules par appel.
const store = getStore();
const graph = getGraph(store);
console.log(
  `[assistant] ${store.dataset.measurements} mesures, ${store.hooks.length} hooks, ` +
    // `entries` compte les ADRESSES connues, pas les fiches : 978 fiches du registre vivant
    // decrivent 866 adresses distinctes, parce qu'un meme hook est decrit sur plusieurs
    // chaines. Ecrire « 866 fiches » melangeait les deux unites.
    `${graph.stats.pools} pools, ${graph.stats.tokens} tokens, ` +
      `registre: ${store.registry.entries} hooks connus`,
);
if (!store.complete) console.warn(`[assistant] LECTURE PARTIELLE : ${store.incomplete_reason}`);
console.log(
  `[assistant] planificateur ${mode}` +
    (providers.length ? ` — ${providers.join(" et ")}, budget ${budget_ms} ms` : "") +
    ` (${why})`,
);
console.log(`[assistant] http://127.0.0.1:${port}/assistant`);

serve({ fetch: app.fetch, port });
