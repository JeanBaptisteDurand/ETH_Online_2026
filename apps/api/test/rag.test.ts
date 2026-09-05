/**
 * La recherche vectorielle servie par HTTP.
 *
 * Deux choses sont verifiees ici, et rien d'autre.
 *
 * 1. AUCUN PASSAGE SANS SA SOURCE. Chaque resultat porte son fichier, ses lignes
 *    et la commande qui les rejoue — et le test RELIT le depot a ces lignes pour
 *    exiger le meme texte. Une citation qu'on ne peut pas verifier n'est pas une
 *    citation.
 * 2. UNE PANNE N'EST JAMAIS UN RESULTAT VIDE. Base injoignable, table absente,
 *    index vide, dimensions incompatibles, embedder muet : cinq etats distincts,
 *    cinq `status` nommes, tous en 503 et aucun avec `passages: []`. Un tableau
 *    vide affirme "rien dans le corpus ne correspond" ; ces cinq-la disent "on
 *    n'a pas pu regarder". Les avoir confondus est le faux resultat #4 de
 *    docs/HONESTY.md — un RPC limite compte comme une chaine sans activite.
 *
 * Le vrai zero, lui, existe et sort en 200 : index en ligne, question plongee,
 * et un filtre a tout ecarte. Il porte `zero_note`.
 *
 * Aucun test ici n'exige un Postgres : le magasin et l'embedder sont injectes.
 * Un dernier bloc, saute si la base ne repond pas, interroge le VRAI index.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { fakeFacilitator, fakeEngine } from "./helpers.js";
import {
  createRagRouter,
  PgVectorStore,
  StoreError,
  maskDsn,
  toVectorLiteral,
  toPassage,
  type IndexInfo,
  type Passage,
  type QueryEmbedder,
  type RagStore,
  OllamaEmbedder,
} from "../src/rag/index.js";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");

/* ------------------------------------------------------------------ doublures */

function fakeEmbedder(dim = 4, vector?: number[]): QueryEmbedder {
  return {
    provider: "faux",
    model: "faux-embed",
    dim,
    async embed() {
      return vector ?? Array.from({ length: dim }, (_, i) => (i === 0 ? 1 : 0));
    },
  };
}

function brokenEmbedder(message: string, status = "EMBED_FAILED"): QueryEmbedder {
  return {
    provider: "faux",
    model: "faux-embed",
    dim: 4,
    async embed(): Promise<number[]> {
      const e = new Error(message) as Error & { status: string };
      e.status = status;
      throw e;
    },
  };
}

/**
 * Un passage batî sur un VRAI extrait de docs/METHOD.md : le test peut alors
 * relire le fichier aux lignes annoncees et exiger le meme texte.
 */
function realPassage(file = "docs/METHOD.md", a = 11, b = 20): Passage {
  const lines = readFileSync(resolve(REPO_ROOT, file), "utf8").split("\n");
  return toPassage({
    id: `${file}#${a}-${b}`,
    corpus: "docs",
    doc_id: file,
    title: "1. The wall",
    source_file: file,
    line_start: a,
    line_end: b,
    header: `DOCUMENT ${file} — section « 1. The wall »`,
    content: lines.slice(a - 1, b).join("\n"),
    chain_id: null,
    address: null,
    graph_node: null,
    distance: 0.2134,
  });
}

const READY: IndexInfo = {
  status: "INDEX_READY",
  table: "rag_chunks",
  dim: 4,
  n_chunks: 3,
  by_corpus: { docs: 3 },
  last_build: null,
};

function fakeStore(over: Partial<RagStore> = {}, info: IndexInfo = READY): RagStore {
  return {
    async info() {
      return info;
    },
    async search() {
      return [realPassage()];
    },
    async close() {},
    ...over,
  };
}

function router(store: RagStore, embedder: QueryEmbedder = fakeEmbedder()) {
  return createRagRouter({ store, embedder });
}

async function get(app: ReturnType<typeof createRagRouter>, url: string) {
  const res = await app.request(`http://t${url}`);
  return { status: res.status, body: (await res.json()) as any };
}

/* ------------------------------------------------------------------- requetes */

describe("GET /rag/search — la requete", () => {
  it("refuse une question absente sans pretendre que rien ne correspond", async () => {
    const { status, body } = await get(router(fakeStore()), "/rag/search");
    expect(status).toBe(400);
    expect(body.status).toBe("BAD_QUERY");
    expect(body.passages).toBeUndefined();
  });

  it("refuse un corpus qui n'existe pas et nomme ceux qui existent", async () => {
    const { status, body } = await get(router(fakeStore()), "/rag/search?q=x&corpus=inventé");
    expect(status).toBe(400);
    expect(body.corpora).toEqual(["docs", "registry", "hook_source"]);
  });

  it("refuse une adresse mal formee plutot que de chercher a cote", async () => {
    const { status, body } = await get(router(fakeStore()), "/rag/search?q=x&address=0xzz");
    expect(status).toBe(400);
    expect(body.error).toContain("mal formee");
  });

  it("borne k au maximum configure au lieu de balayer l'index", async () => {
    const seen: unknown[] = [];
    const store = fakeStore({
      async search(_v, opts) {
        seen.push(opts);
        return [realPassage()];
      },
    });
    const { body } = await get(
      createRagRouter({ store, embedder: fakeEmbedder(), config: { maxK: 10 } }),
      "/rag/search?q=x&k=999",
    );
    expect(body.k).toBe(10);
    expect((seen[0] as any).k).toBe(10);
  });
});

/* ------------------------------------------------------- la source des passages */

describe("GET /rag/search — aucun passage sans sa source", () => {
  it("rend le fichier, les lignes et la commande de rejeu", async () => {
    const { status, body } = await get(router(fakeStore()), "/rag/search?q=le%20mur&k=1");
    expect(status).toBe(200);
    expect(body.status).toBe("OK");
    const p = body.passages[0];
    expect(p.source.file).toBe("docs/METHOD.md");
    expect(p.source.line_start).toBe(11);
    expect(p.source.line_end).toBe(20);
    expect(p.source.cite).toBe("docs/METHOD.md:11-20");
    expect(p.source.replay).toBe("sed -n '11,20p' docs/METHOD.md");
  });

  it("le rejeu annonce rend EXACTEMENT le texte cite, relu dans le depot", async () => {
    const { body } = await get(router(fakeStore()), "/rag/search?q=le%20mur&k=1");
    const p = body.passages[0];
    const lines = readFileSync(resolve(REPO_ROOT, p.source.file), "utf8").split("\n");
    const replayed = lines.slice(p.source.line_start - 1, p.source.line_end).join("\n");
    expect(replayed).toBe(p.content);
  });

  it("rend la distance brute de pgvector, pas un pourcentage de pertinence", async () => {
    const { body } = await get(router(fakeStore()), "/rag/search?q=x&k=1");
    const p = body.passages[0];
    expect(p.distance).toBeCloseTo(0.2134, 6);
    expect(p.cosine_similarity).toBeCloseTo(1 - 0.2134, 6);
    expect(JSON.stringify(p)).not.toContain("pertinence");
  });

  it("n'ecrit aucune synthese : l'API rend des passages, pas des conclusions", async () => {
    const { body } = await get(router(fakeStore()), "/rag/search?q=x&k=1");
    expect(body.answer).toBeUndefined();
    expect(body.summary).toBeUndefined();
    expect(body.note).toContain("ne resume pas");
  });
});

/* ------------------------------------------------- panne n'est pas zero resultat */

describe("GET /rag/search — une panne n'est jamais une liste vide", () => {
  const cases: [string, RagStore, string][] = [
    [
      "base injoignable",
      fakeStore({
        async info() {
          throw new StoreError("connexion refusee", "INDEX_UNAVAILABLE");
        },
        async search() {
          throw new StoreError("connexion refusee", "INDEX_UNAVAILABLE");
        },
      }),
      "INDEX_UNAVAILABLE",
    ],
    [
      "table absente",
      fakeStore(
        {
          async search() {
            throw new StoreError("la table rag_chunks n'existe pas", "INDEX_ABSENT");
          },
        },
        { ...READY, status: "INDEX_ABSENT", n_chunks: null },
      ),
      "INDEX_ABSENT",
    ],
    [
      "index vide",
      fakeStore(
        {
          async search() {
            throw new StoreError("rag_chunks ne contient aucune ligne", "INDEX_EMPTY");
          },
        },
        { ...READY, status: "INDEX_EMPTY", n_chunks: 0, by_corpus: {} },
      ),
      "INDEX_EMPTY",
    ],
    [
      "dimensions incompatibles",
      fakeStore({
        async search() {
          throw new StoreError("question en dimension 4, index en 768", "DIM_MISMATCH");
        },
      }),
      "DIM_MISMATCH",
    ],
  ];

  for (const [name, store, expected] of cases) {
    it(`${name} rend 503 ${expected} et AUCUN tableau de passages`, async () => {
      const { status, body } = await get(router(store), "/rag/search?q=x");
      expect(status).toBe(503);
      expect(body.status).toBe(expected);
      expect(body.passages).toBeUndefined();
      expect(body.n).toBeUndefined();
      expect(body.note).toContain("elle est ABSENTE");
    });
  }

  it("un embedder muet rend 503 EMBED_FAILED, pas un classement au hasard", async () => {
    const { status, body } = await get(
      router(fakeStore(), brokenEmbedder("timeout apres 20000 ms")),
      "/rag/search?q=x",
    );
    expect(status).toBe(503);
    expect(body.status).toBe("EMBED_FAILED");
    expect(body.error).toContain("timeout");
    expect(body.passages).toBeUndefined();
  });

  it("distingue un VRAI zero resultat d'une panne", async () => {
    const store = fakeStore({
      async search() {
        return [];
      },
    });
    const { status, body } = await get(router(store), "/rag/search?q=x&max_distance=0.01");
    expect(status).toBe(200);
    expect(body.status).toBe("OK");
    expect(body.n).toBe(0);
    expect(body.passages).toEqual([]);
    expect(body.zero_note).toContain("Ce n'est pas une panne");
    expect(body.filters.max_distance).toBe(0.01);
  });
});

/* ------------------------------------------------------------------- /rag/meta */

describe("GET /rag/meta", () => {
  it("rend l'etat de l'index et le modele qui l'a rempli", async () => {
    const info: IndexInfo = {
      ...READY,
      dim: 768,
      n_chunks: 1833,
      by_corpus: { docs: 74, registry: 978, hook_source: 781 },
      last_build: {
        id: 2,
        built_at: "2026-09-05T06:15:44.645Z",
        engine_ver: "0.3.0",
        embed_provider: "ollama",
        embed_model: "granite-embedding:278m",
        embed_dim: 768,
        n_chunks: 1833,
        by_corpus: { docs: 74, registry: 978, hook_source: 781 },
        graph: {},
        sources: [],
      },
    };
    const { status, body } = await get(
      router(fakeStore({}, info), fakeEmbedder(768)),
      "/rag/meta",
    );
    expect(status).toBe(200);
    expect(body.index.n_chunks).toBe(1833);
    expect(body.index.by_corpus.registry).toBe(978);
    expect(body.index.last_build.embed_model).toBe("granite-embedding:278m");
    expect(body.dimension_match).toBe(true);
  });

  it("signale une question et un index dans deux espaces vectoriels differents", async () => {
    const { body } = await get(
      router(fakeStore({}, { ...READY, dim: 768 }), fakeEmbedder(1536)),
      "/rag/meta",
    );
    expect(body.dimension_match).toBe(false);
    expect(body.dimension_note).toContain("refusera");
  });

  it("ne laisse jamais fuir le mot de passe du DSN", async () => {
    const { body } = await get(
      createRagRouter({
        store: fakeStore(),
        embedder: fakeEmbedder(),
        config: { dsn: "postgresql://tare:motdepasse@h:5432/tare" },
      }),
      "/rag/meta",
    );
    expect(JSON.stringify(body)).not.toContain("motdepasse");
    expect(body.dsn).toContain("***");
  });
});

/* --------------------------------------------------------------- utilitaires */

describe("les utilitaires du magasin", () => {
  it("masque le mot de passe et garde le reste lisible", () => {
    expect(maskDsn("postgresql://tare:secret@127.0.0.1:5432/tare")).toBe(
      "postgresql://tare:***@127.0.0.1:5432/tare",
    );
    expect(maskDsn("postgresql:///tare")).toBe("postgresql:///tare");
  });

  it("ecrit un vecteur au format litteral de pgvector", () => {
    expect(toVectorLiteral([1, -0.5, 0])).toBe("[1,-0.5,0]");
  });

  it("construit la citation et le rejeu a partir des lignes", () => {
    const p = realPassage("README.md", 3, 9);
    expect(p.source.cite).toBe("README.md:3-9");
    expect(p.source.replay).toBe("sed -n '3,9p' README.md");
  });
});

/* -------------------------------------------------------------- montage dans l'app */

describe("le montage dans l'API", () => {
  it("expose /rag/search et /rag/meta et les annonce a la racine", async () => {
    const { app } = createApp({
      config: { usageLogPath: "", x402Enabled: true },
      facilitator: fakeFacilitator(),
      engine: fakeEngine(),
      ragStore: fakeStore(),
      ragEmbedder: fakeEmbedder(),
    });
    const root = (await (await app.request("/")).json()) as any;
    expect(root.routes.join(" ")).toContain("/rag/search");
    const res = await app.request("/rag/search?q=le%20mur&k=1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.passages[0].source.file).toBe("docs/METHOD.md");
  });
});

/* ------------------------------------------------- l'index reel, s'il est en ligne */

describe("l'index pgvector reel", () => {
  const dsn =
    process.env.TARE_PG_DSN ??
    process.env.DATABASE_URL ??
    "postgresql://tare:tare@127.0.0.1:5432/tare";
  let live = false;
  let info: IndexInfo | null = null;
  let store: PgVectorStore;

  beforeAll(async () => {
    store = new PgVectorStore(dsn, 2000, 8000);
    try {
      info = await store.info();
      live = info.status === "INDEX_READY";
    } catch {
      live = false;
    }
    if (!live) await store.close();
  });

  it("compte les lignes en base — l'index est PEUPLE, pas seulement cree", async () => {
    if (!live) {
      // Un test qui ne prouve rien doit dire pourquoi, et ne rien affirmer.
      expect(info?.status ?? "INDEX_UNAVAILABLE").not.toBe("INDEX_READY");
      console.warn(
        `index pgvector hors ligne (${info?.status ?? "injoignable"}) sur ${maskDsn(dsn)} — ` +
          "TARE_DB_PORT=55432 docker compose up -d db && cd engine && python3 -m tare.rag build",
      );
      return;
    }
    // `void ragIndex;` : la table existe, la route repond, et rien dedans.
    console.info(
      `index pgvector: ${info!.n_chunks} morceaux ${JSON.stringify(info!.by_corpus)}`,
    );
    expect(info!.n_chunks).toBeGreaterThan(0);
    expect(info!.by_corpus!.docs).toBeGreaterThan(0);
    expect(info!.by_corpus!.registry).toBeGreaterThan(500);
    expect(info!.last_build).not.toBeNull();
    expect(info!.dim).toBe(info!.last_build!.embed_dim);
  });

  it("une vraie recherche rend des passages qui se relisent dans le depot", async () => {
    if (!live) return;
    const emb = new OllamaEmbedder(
      (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, ""),
      process.env.TARE_EMBED_MODEL ?? "granite-embedding:278m",
    );
    const { ok } = await emb.available();
    if (!ok || emb.dim !== info!.dim) {
      console.warn("ollama absent ou dimension differente : recherche reelle sautee");
      return;
    }
    const app = createRagRouter({ store, embedder: emb });
    const res = await app.request(
      "http://t/rag/search?q=" + encodeURIComponent("le stub inerte de 89 octets") + "&k=3&corpus=docs",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.n).toBeGreaterThan(0);
    for (const p of body.passages) {
      const lines = readFileSync(resolve(REPO_ROOT, p.source.file), "utf8").split("\n");
      const replayed = lines.slice(p.source.line_start - 1, p.source.line_end).join("\n");
      expect(replayed).toBe(p.content);
      expect(p.distance).toBeGreaterThanOrEqual(0);
    }
    await store.close();
    // 60 s : le premier appel a Ollama charge le modele en memoire. Ce n'est pas
    // une lenteur de la recherche — les suivants repondent en dizaines de ms.
  }, 60000);
});
