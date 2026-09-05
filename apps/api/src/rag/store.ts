/**
 * Le magasin vectoriel vu depuis l'API : pgvector, en lecture seule.
 *
 * L'ecriture appartient a engine/tare/rag (build.py). L'API ne construit rien : elle
 * lit `rag_chunks` et `rag_builds`, et elle rend des passages qui portent TOUJOURS
 * leur fichier et leurs lignes. Un passage sans source ne sort pas d'ici — c'est la
 * regle 4 appliquee au RAG : `sed -n '67,97p' docs/METHOD.md` doit rendre exactement
 * le texte cite.
 *
 * Les trois etats d'echec sont distincts, et c'est le point :
 *   INDEX_UNAVAILABLE  la base ne repond pas, ou la table n'existe pas
 *   INDEX_EMPTY        la table existe et ne contient AUCUNE ligne
 *   DIM_MISMATCH       la question est dans un autre espace vectoriel que l'index
 * Aucun des trois ne se traduit par `passages: []`. Un tableau vide affirme "rien
 * dans le corpus ne correspond" ; ces trois-la disent "on n'a pas pu regarder".
 * Confondre les deux est exactement le faux resultat #4 de docs/HONESTY.md.
 */
import pg from "pg";

export const CHUNKS_TABLE = "rag_chunks";
export const BUILDS_TABLE = "rag_builds";

export type IndexStatus =
  | "INDEX_READY"
  | "INDEX_EMPTY"
  | "INDEX_ABSENT"
  | "INDEX_UNAVAILABLE";

export class StoreError extends Error {
  readonly status: IndexStatus | "DIM_MISMATCH";
  constructor(message: string, status: IndexStatus | "DIM_MISMATCH" = "INDEX_UNAVAILABLE") {
    super(message);
    this.name = "StoreError";
    this.status = status;
  }
}

export interface PassageSource {
  file: string;
  line_start: number;
  line_end: number;
  cite: string;
  replay: string;
}

export interface Passage {
  id: string;
  corpus: string;
  doc_id: string;
  title: string | null;
  source: PassageSource;
  chain_id: number | null;
  address: string | null;
  graph_node: string | null;
  distance: number;
  cosine_similarity: number;
  header: string;
  content: string;
}

export interface BuildRow {
  id: number;
  built_at: string;
  engine_ver: string;
  embed_provider: string;
  embed_model: string;
  embed_dim: number;
  n_chunks: number;
  by_corpus: Record<string, number>;
  graph: unknown;
  sources: unknown;
}

export interface IndexInfo {
  status: IndexStatus;
  reason?: string;
  table: string;
  dim: number | null;
  n_chunks: number | null;
  by_corpus: Record<string, number> | null;
  last_build: BuildRow | null;
}

/** Le DSN sans le mot de passe : il finit dans /rag/meta et dans les erreurs. */
export function maskDsn(dsn: string): string {
  if (!dsn.includes("@")) return dsn;
  const at = dsn.lastIndexOf("@");
  const head = dsn.slice(0, at);
  const tail = dsn.slice(at + 1);
  const colon = head.lastIndexOf(":");
  return colon > 0 ? `${head.slice(0, colon)}:***@${tail}` : `${head}@${tail}`;
}

/** pgvector accepte un litteral '[a,b,c]'. Aucune perte de precision. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

export interface SearchOptions {
  k?: number;
  corpus?: string | null;
  address?: string | null;
  maxDistance?: number | null;
}

export interface RagStore {
  info(): Promise<IndexInfo>;
  search(embedding: number[], opts?: SearchOptions): Promise<Passage[]>;
  close(): Promise<void>;
}

export class PgVectorStore implements RagStore {
  private pool: pg.Pool | null = null;

  constructor(
    readonly dsn: string,
    private readonly connectionTimeoutMs = 5000,
    private readonly statementTimeoutMs = 15000,
  ) {}

  private getPool(): pg.Pool {
    if (!this.pool) {
      this.pool = new pg.Pool({
        connectionString: this.dsn,
        max: 4,
        connectionTimeoutMillis: this.connectionTimeoutMs,
        idleTimeoutMillis: 10000,
        statement_timeout: this.statementTimeoutMs,
      });
      // Sans ce garde, une coupure du serveur fait tomber le processus Node entier.
      this.pool.on("error", () => {});
    }
    return this.pool;
  }

  private async query<R extends pg.QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<R[]> {
    try {
      const res = await this.getPool().query<R>(sql, params);
      return res.rows;
    } catch (e) {
      throw new StoreError(
        `${maskDsn(this.dsn)}: ${(e as Error).message}`,
        "INDEX_UNAVAILABLE",
      );
    }
  }

  /** La dimension de la colonne, LUE en base — jamais supposee. */
  async dim(): Promise<number | null> {
    const rows = await this.query<{ atttypmod: number }>(
      `SELECT a.atttypmod FROM pg_attribute a JOIN pg_class t ON t.oid = a.attrelid
       WHERE t.relname = $1 AND a.attname = 'embedding' AND a.attnum > 0`,
      [CHUNKS_TABLE],
    );
    const mod = rows[0]?.atttypmod;
    return mod && mod > 0 ? Number(mod) : null;
  }

  async info(): Promise<IndexInfo> {
    let dim: number | null;
    try {
      dim = await this.dim();
    } catch (e) {
      return {
        status: "INDEX_UNAVAILABLE",
        reason: (e as Error).message,
        table: CHUNKS_TABLE,
        dim: null,
        n_chunks: null,
        by_corpus: null,
        last_build: null,
      };
    }
    if (dim === null) {
      return {
        status: "INDEX_ABSENT",
        reason: `la table ${CHUNKS_TABLE} n'existe pas — lancer python3 -m tare.rag build`,
        table: CHUNKS_TABLE,
        dim: null,
        n_chunks: null,
        by_corpus: null,
        last_build: null,
      };
    }
    const counts = await this.query<{ corpus: string; n: string }>(
      `SELECT corpus, count(*)::text AS n FROM ${CHUNKS_TABLE} GROUP BY corpus ORDER BY corpus`,
    );
    const by: Record<string, number> = {};
    let total = 0;
    for (const r of counts) {
      by[r.corpus] = Number(r.n);
      total += Number(r.n);
    }
    const builds = await this.query<BuildRow & { built_at: Date }>(
      `SELECT id, built_at, engine_ver, embed_provider, embed_model, embed_dim,
              n_chunks, by_corpus, sources, graph
       FROM ${BUILDS_TABLE} ORDER BY id DESC LIMIT 1`,
    ).catch(() => []);
    // `id` est un bigserial : le pilote pg le rend en chaine pour ne pas perdre de
    // precision au-dela de 2^53. Ici il tient largement dans un Number.
    const last = builds[0]
      ? ({
          ...builds[0],
          id: Number(builds[0].id),
          built_at: new Date(builds[0].built_at).toISOString(),
        } as BuildRow)
      : null;
    return {
      status: total > 0 ? "INDEX_READY" : "INDEX_EMPTY",
      reason:
        total > 0
          ? undefined
          : `${CHUNKS_TABLE} existe mais ne contient aucune ligne — ce n'est PAS "aucun passage ne correspond"`,
      table: CHUNKS_TABLE,
      dim,
      n_chunks: total,
      by_corpus: by,
      last_build: last,
    };
  }

  async search(embedding: number[], opts: SearchOptions = {}): Promise<Passage[]> {
    const info = await this.info();
    if (info.status !== "INDEX_READY")
      throw new StoreError(info.reason ?? info.status, info.status);
    if (info.dim !== embedding.length)
      throw new StoreError(
        `question en dimension ${embedding.length}, index en ${info.dim} : deux espaces vectoriels ne se comparent pas`,
        "DIM_MISMATCH",
      );

    const k = Math.min(Math.max(opts.k ?? 8, 1), 50);
    const vec = toVectorLiteral(embedding);
    const where: string[] = [];
    const params: unknown[] = [vec];
    if (opts.corpus) {
      params.push(opts.corpus);
      where.push(`corpus = $${params.length}`);
    }
    if (opts.address) {
      params.push(opts.address.toLowerCase());
      where.push(`address = $${params.length}`);
    }
    const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    params.push(vec);
    const orderIdx = params.length;
    params.push(k);
    const rows = await this.query<{
      id: string;
      corpus: string;
      doc_id: string;
      title: string | null;
      source_file: string;
      line_start: number;
      line_end: number;
      header: string;
      content: string;
      chain_id: number | null;
      address: string | null;
      graph_node: string | null;
      distance: string;
    }>(
      `SELECT id, corpus, doc_id, title, source_file, line_start, line_end, header, content,
              chain_id, address, graph_node, (embedding <=> $1::vector) AS distance
       FROM ${CHUNKS_TABLE}${clause}
       ORDER BY embedding <=> $${orderIdx}::vector
       LIMIT $${params.length}`,
      params,
    );
    const out = rows.map((r) => toPassage(r));
    return opts.maxDistance == null
      ? out
      : out.filter((p) => p.distance <= (opts.maxDistance as number));
  }

  async close(): Promise<void> {
    if (this.pool) {
      const p = this.pool;
      this.pool = null;
      await p.end().catch(() => {});
    }
  }
}

export function toPassage(r: {
  id: string;
  corpus: string;
  doc_id: string;
  title: string | null;
  source_file: string;
  line_start: number;
  line_end: number;
  header: string;
  content: string;
  chain_id: number | null;
  address: string | null;
  graph_node: string | null;
  distance: string | number;
}): Passage {
  const a = Number(r.line_start);
  const b = Number(r.line_end);
  const d = Number(r.distance);
  return {
    id: r.id,
    corpus: r.corpus,
    doc_id: r.doc_id,
    title: r.title,
    source: {
      file: r.source_file,
      line_start: a,
      line_end: b,
      cite: `${r.source_file}:${a}-${b}`,
      replay: `sed -n '${a},${b}p' ${r.source_file}`,
    },
    chain_id: r.chain_id === null ? null : Number(r.chain_id),
    address: r.address,
    graph_node: r.graph_node,
    distance: Number(d.toFixed(6)),
    cosine_similarity: Number((1 - d).toFixed(6)),
    header: r.header,
    content: r.content,
  };
}
