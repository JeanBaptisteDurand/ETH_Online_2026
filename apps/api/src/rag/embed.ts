/**
 * L'embedding de la REQUETE, cote API.
 *
 * L'index est rempli par engine/tare/rag (granite-embedding:278m via Ollama, 768
 * dimensions). Pour interroger cet index il faut plonger la question dans LE MEME
 * espace vectoriel : un vecteur OpenAI 1536 contre un index Granite 768 ne rend pas
 * un classement moins bon, il ne rend rien du tout. C'est pour cela que
 * `PgVectorStore.search` verifie la dimension AVANT de lancer la requete et refuse
 * plutot que de tronquer ou de completer.
 *
 * Regle 3, ici : un Ollama injoignable, un HTTP 429 ou une reponse tronquee LEVENT.
 * Aucun de ces cas ne se traduit par un vecteur nul, et aucun ne se traduit par
 * `passages: []` — un tableau vide voudrait dire "rien ne correspond", ce qui est
 * une affirmation sur le corpus qu'on n'a pas le droit de faire quand on n'a pas
 * pu poser la question.
 */

export class EmbedError extends Error {
  readonly status: string;
  constructor(message: string, status = "EMBED_FAILED") {
    super(message);
    this.name = "EmbedError";
    this.status = status;
  }
}

export interface EmbedderInfo {
  provider: string;
  model: string;
  dim: number;
}

export interface QueryEmbedder extends EmbedderInfo {
  embed(text: string): Promise<number[]>;
}

const OLLAMA_DIM = 768;
const OPENAI_DIMS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
};

/** Le vecteur rendu par un fournisseur, verifie avant d'etre utilise. */
function check(v: unknown, dim: number, who: string): number[] {
  if (!Array.isArray(v)) throw new EmbedError(`${who}: pas de vecteur dans la reponse`);
  if (v.length !== dim)
    throw new EmbedError(`${who}: vecteur de dimension ${v.length}, attendu ${dim}`);
  const out = v.map(Number);
  if (out.some((x) => !Number.isFinite(x)))
    throw new EmbedError(`${who}: le vecteur contient une valeur non finie`);
  if (out.every((x) => x === 0)) throw new EmbedError(`${who}: vecteur entierement nul`);
  return out;
}

async function postJson(
  url: string,
  body: unknown,
  timeoutMs: number,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new EmbedError(`${url}: HTTP ${res.status} — ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch {
      // Une reponse tronquee n'est pas une reponse (regle 3, faux resultat #2).
      throw new EmbedError(`${url}: reponse non-JSON (${text.length} octets)`);
    }
  } catch (e) {
    if (e instanceof EmbedError) throw e;
    const msg = (e as Error).name === "AbortError" ? `timeout apres ${timeoutMs} ms` : String(e);
    throw new EmbedError(`${url}: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

export class OllamaEmbedder implements QueryEmbedder {
  readonly provider = "ollama";
  constructor(
    readonly baseUrl: string,
    readonly model: string,
    readonly dim: number = OLLAMA_DIM,
    private readonly timeoutMs = 20000,
  ) {}

  async available(): Promise<{ ok: boolean; why: string }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: ctrl.signal });
      if (!res.ok) return { ok: false, why: `${this.baseUrl}: HTTP ${res.status}` };
      const body = (await res.json()) as { models?: { name?: string }[] };
      const names = new Set((body.models ?? []).map((m) => m.name));
      if (!names.has(this.model))
        return { ok: false, why: `${this.baseUrl}: modele ${this.model} absent` };
      return { ok: true, why: "" };
    } catch (e) {
      return { ok: false, why: `${this.baseUrl} injoignable: ${(e as Error).message}` };
    } finally {
      clearTimeout(timer);
    }
  }

  async embed(text: string): Promise<number[]> {
    const r = (await postJson(
      `${this.baseUrl}/api/embed`,
      { model: this.model, input: text },
      this.timeoutMs,
    )) as { embeddings?: unknown[]; error?: string };
    if (r.error) throw new EmbedError(`ollama: ${r.error}`);
    const first = Array.isArray(r.embeddings) ? r.embeddings[0] : undefined;
    return check(first, this.dim, `ollama/${this.model}`);
  }
}

export class OpenAIEmbedder implements QueryEmbedder {
  readonly provider = "openai";
  readonly dim: number;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly timeoutMs = 20000,
    private readonly baseUrl = "https://api.openai.com/v1",
  ) {
    this.dim = OPENAI_DIMS[model] ?? 1536;
  }

  async available(): Promise<{ ok: boolean; why: string }> {
    return this.apiKey
      ? { ok: true, why: "" }
      : { ok: false, why: "OPENAI_API_KEY absente" };
  }

  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) throw new EmbedError("OPENAI_API_KEY absente", "EMBED_UNAVAILABLE");
    const r = (await postJson(
      `${this.baseUrl}/embeddings`,
      { model: this.model, input: text },
      this.timeoutMs,
      { authorization: `Bearer ${this.apiKey}` },
    )) as { data?: { embedding?: unknown }[] };
    const first = Array.isArray(r.data) ? r.data[0]?.embedding : undefined;
    return check(first, this.dim, `openai/${this.model}`);
  }
}

export interface EmbedderChoice {
  embedder: QueryEmbedder;
  log: string[];
}

/**
 * Ollama d'abord (gratuit, local, et c'est le modele qui a rempli l'index),
 * OpenAI en repli. Le journal dit POURQUOI, et il ressort dans /rag/meta : si un
 * jour l'API interroge en 1536 un index rempli en 768, on veut pouvoir le lire.
 */
export async function pickEmbedder(cfg: {
  ollamaUrl: string;
  ollamaModel: string;
  openaiKey: string;
  openaiModel: string;
  prefer?: "ollama" | "openai";
}): Promise<EmbedderChoice> {
  const log: string[] = [];
  const ollama = new OllamaEmbedder(cfg.ollamaUrl.replace(/\/$/, ""), cfg.ollamaModel);
  const openai = new OpenAIEmbedder(cfg.openaiKey, cfg.openaiModel);
  const order = cfg.prefer === "openai" ? [openai, ollama] : [ollama, openai];
  for (const cand of order) {
    const { ok, why } = await cand.available();
    if (ok) {
      log.push(`${cand.provider}: retenu (${cand.model}, ${cand.dim} dims)`);
      return { embedder: cand, log };
    }
    log.push(`${cand.provider}: ecarte — ${why}`);
  }
  throw new EmbedError(
    `aucun fournisseur d'embeddings disponible. ${log.join(" | ")}`,
    "EMBED_UNAVAILABLE",
  );
}
