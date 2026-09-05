/**
 * GET /rag/search — la recherche vectorielle, et /rag/meta — l'etat de l'index.
 *
 * Ce que la route rend, et ce qu'elle ne rend jamais :
 *
 *   * chaque passage porte son FICHIER et ses LIGNES, plus la commande qui les
 *     rejoue. Un passage sans source ne sort pas d'ici (regle 4). Le corps de la
 *     reponse est verifiable ligne a ligne contre le depot ;
 *   * chaque passage porte sa DISTANCE cosinus brute, telle que pgvector l'a
 *     calculee. Elle n'est pas convertie en pourcentage de pertinence : la
 *     distance ne dit pas que le passage repond, elle dit qu'il est proche ;
 *   * l'API n'ecrit AUCUN texte de synthese. Elle rend des passages. Le modele,
 *     lui, choisit quoi interroger et explique ce qui revient (regle 1) ;
 *   * une panne rend 503 avec un `status` nomme — INDEX_UNAVAILABLE, INDEX_EMPTY,
 *     INDEX_ABSENT, DIM_MISMATCH, EMBED_UNAVAILABLE, EMBED_FAILED — et JAMAIS
 *     `passages: []`. Un tableau vide affirme "rien dans le corpus ne
 *     correspond" ; ces cas-la disent "on n'a pas pu regarder". Les avoir
 *     confondus est le faux resultat #4 de docs/HONESTY.md.
 *
 * Un vrai zero resultat existe : index en ligne, question plongee, la base rend
 * zero ligne parce qu'un filtre (`corpus=`, `address=`, `max_distance=`) a tout
 * ecarte. Celui-la sort en 200 avec `status: "OK"`, `n: 0` et le filtre en clair.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { EmbedError, pickEmbedder, type QueryEmbedder } from "./embed.js";
import {
  PgVectorStore,
  StoreError,
  maskDsn,
  type IndexInfo,
  type Passage,
  type RagStore,
} from "./store.js";

export const BUILD_COMMAND =
  "cd engine && python3 -m tare.rag build   # remplit rag_chunks depuis le corpus declare";

export interface RagConfig {
  dsn: string;
  ollamaUrl: string;
  ollamaModel: string;
  openaiKey: string;
  openaiModel: string;
  prefer: "ollama" | "openai";
  defaultK: number;
  maxK: number;
}

export function ragConfigFromEnv(over: Partial<RagConfig> = {}): RagConfig {
  const env = process.env;
  return {
    dsn:
      env.TARE_PG_DSN ??
      env.DATABASE_URL ??
      "postgresql://tare:tare@127.0.0.1:5432/tare",
    ollamaUrl: env.OLLAMA_URL ?? "http://127.0.0.1:11434",
    ollamaModel: env.TARE_EMBED_MODEL ?? "granite-embedding:278m",
    openaiKey: env.OPENAI_API_KEY ?? "",
    openaiModel: env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    prefer: (env.TARE_EMBED_PREFER as "ollama" | "openai") ?? "ollama",
    defaultK: Number(env.TARE_RAG_K ?? 8),
    maxK: Number(env.TARE_RAG_MAX_K ?? 25),
    ...over,
  };
}

export interface RagRouterDeps {
  config?: Partial<RagConfig>;
  /** injectes en test pour ne dependre ni d'un Postgres ni d'un Ollama */
  store?: RagStore;
  embedder?: QueryEmbedder;
}

const CORPORA = ["docs", "registry", "hook_source"] as const;

/** Le rappel des regles, sur chaque reponse : elles sont la specification. */
const NOTE_NO_SUMMARY =
  "L'API ne resume pas et ne conclut pas : elle rend des passages avec leur fichier, leurs lignes et leur distance. Rien ici n'est un nombre mesure.";

function statusCodeFor(status: string): 400 | 503 {
  return status === "BAD_QUERY" ? 400 : 503;
}

export function createRagRouter(deps: RagRouterDeps = {}) {
  const cfg = ragConfigFromEnv(deps.config ?? {});
  const app = new Hono();

  let store: RagStore | null = deps.store ?? null;
  const getStore = (): RagStore => {
    if (!store) store = new PgVectorStore(cfg.dsn);
    return store;
  };

  let embedderCache: { embedder: QueryEmbedder; log: string[] } | null = deps.embedder
    ? { embedder: deps.embedder, log: [`${deps.embedder.provider}: injecte`] }
    : null;
  const getEmbedder = async () => {
    // Le choix du fournisseur coute un appel reseau : on ne le refait pas a chaque
    // requete. C'est le meme raisonnement que le graphe charge une fois.
    if (!embedderCache) embedderCache = await pickEmbedder(cfg);
    return embedderCache;
  };

  function fail(c: Context, status: string, detail: string, extra: Record<string, unknown> = {}) {
    return c.json(
      {
        status,
        error: detail,
        note:
          "aucun passage n'est renvoye et la liste n'est pas vide : elle est ABSENTE. " +
          "Une panne de lecture n'est pas la preuve que le corpus ne contient rien.",
        build: BUILD_COMMAND,
        dsn: maskDsn(cfg.dsn),
        ...extra,
      },
      statusCodeFor(status),
    );
  }

  /* --------------------------------------------------------------- /rag/meta */

  app.get("/rag/meta", async (c) => {
    let info: IndexInfo;
    try {
      info = await getStore().info();
    } catch (e) {
      return fail(c, "INDEX_UNAVAILABLE", (e as Error).message);
    }
    let embedding: Record<string, unknown>;
    try {
      const { embedder, log } = await getEmbedder();
      embedding = { provider: embedder.provider, model: embedder.model, dim: embedder.dim, log };
    } catch (e) {
      embedding = { available: false, error: (e as Error).message };
    }
    const dimOk =
      info.dim !== null && typeof embedding.dim === "number" ? info.dim === embedding.dim : null;
    return c.json({
      index: info,
      embedding,
      dimension_match: dimOk,
      dimension_note:
        dimOk === false
          ? "la question serait plongee dans un autre espace vectoriel que l'index : /rag/search refusera plutot que de classer au hasard"
          : undefined,
      corpora: CORPORA,
      build: BUILD_COMMAND,
      dsn: maskDsn(cfg.dsn),
      note: NOTE_NO_SUMMARY,
    });
  });

  /* ------------------------------------------------------------- /rag/search */

  app.get("/rag/search", async (c) => {
    const t0 = performance.now();
    const q = (c.req.query("q") ?? "").trim();
    if (!q)
      return c.json(
        {
          status: "BAD_QUERY",
          error: "parametre q manquant ou vide",
          usage: "GET /rag/search?q=...&k=8&corpus=docs|registry|hook_source&address=0x...",
        },
        400,
      );
    if (q.length > 2000)
      return c.json(
        { status: "BAD_QUERY", error: `question de ${q.length} caracteres, maximum 2000` },
        400,
      );

    const kRaw = Number(c.req.query("k") ?? cfg.defaultK);
    const k = Number.isFinite(kRaw) ? Math.min(Math.max(Math.trunc(kRaw), 1), cfg.maxK) : cfg.defaultK;
    const corpus = c.req.query("corpus") ?? null;
    if (corpus && !CORPORA.includes(corpus as (typeof CORPORA)[number]))
      return c.json(
        { status: "BAD_QUERY", error: `corpus inconnu: ${corpus}`, corpora: CORPORA },
        400,
      );
    const address = c.req.query("address") ?? null;
    if (address && !/^0x[0-9a-fA-F]{40}$/.test(address))
      return c.json({ status: "BAD_QUERY", error: `adresse mal formee: ${address}` }, 400);
    const mdRaw = c.req.query("max_distance");
    const maxDistance = mdRaw === undefined ? null : Number(mdRaw);
    if (maxDistance !== null && !Number.isFinite(maxDistance))
      return c.json({ status: "BAD_QUERY", error: `max_distance non numerique: ${mdRaw}` }, 400);

    let embedder: QueryEmbedder;
    let log: string[];
    try {
      ({ embedder, log } = await getEmbedder());
    } catch (e) {
      const err = e as EmbedError;
      return fail(c, err.status ?? "EMBED_UNAVAILABLE", err.message);
    }

    let vector: number[];
    try {
      vector = await embedder.embed(q);
    } catch (e) {
      const err = e as EmbedError;
      return fail(c, err.status ?? "EMBED_FAILED", err.message, {
        embedding: { provider: embedder.provider, model: embedder.model, dim: embedder.dim },
      });
    }

    let passages: Passage[];
    try {
      passages = await getStore().search(vector, { k, corpus, address, maxDistance });
    } catch (e) {
      if (e instanceof StoreError) return fail(c, e.status, e.message);
      return fail(c, "INDEX_UNAVAILABLE", (e as Error).message);
    }

    return c.json({
      status: "OK",
      q,
      k,
      filters: { corpus, address, max_distance: maxDistance },
      embedding: { provider: embedder.provider, model: embedder.model, dim: embedder.dim, log },
      n: passages.length,
      zero_note:
        passages.length === 0
          ? "zero passage APRES filtrage : l'index est en ligne et la question a bien ete plongee. Ce n'est pas une panne."
          : undefined,
      passages,
      note: NOTE_NO_SUMMARY,
      took_ms: Math.round((performance.now() - t0) * 1000) / 1000,
    });
  });

  return app;
}
