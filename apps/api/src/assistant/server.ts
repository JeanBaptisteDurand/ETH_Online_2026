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

const port = Number(process.env.ASSISTANT_PORT ?? 8788);
const app = new Hono();
app.use("*", cors());
app.get("/", (c) => c.redirect("/assistant"));
registerAssistant(app, { cors: false });

// On chauffe le modele de lecture et le graphe AU DEMARRAGE, une fois. Les reconstruire
// a chaque requete serait le bug du RAG COBOL de reference : 102 ms de CPU brules par appel.
const store = getStore();
const graph = getGraph(store);
console.log(
  `[assistant] ${store.dataset.measurements} mesures, ${store.hooks.length} hooks, ` +
    `${graph.stats.pools} pools, ${graph.stats.tokens} tokens, registre: ${store.registry.entries} fiches`,
);
if (!store.complete) console.warn(`[assistant] LECTURE PARTIELLE : ${store.incomplete_reason}`);
console.log(`[assistant] http://127.0.0.1:${port}/assistant`);

serve({ fetch: app.fetch, port });
