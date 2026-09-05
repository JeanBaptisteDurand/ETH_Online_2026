/**
 * Le jeu de mesures et le registre officiel.
 *
 * Source primaire : docs/dataset/measurements.jsonl (rempli en continu par le moteur).
 * Repli : docs/measurements-v1.json (128 mesures, bloc 50 614 000, deja publiees).
 * Le repli n'est pas silencieux : /meta et chaque mesure disent d'ou elles viennent.
 *
 * Les fichiers sont relus quand leur mtime bouge — l'agent qui remplit le jsonl
 * en parallele n'a pas besoin de redemarrer l'API.
 */
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { DOCS_DIR } from "./paths.js";
import { normalizeMeasurement, type Measurement, type RawMeasurement } from "./measurement.js";

/**
 * Les chemins sont resolus a chaque appel : les tests les epinglent sur des
 * fixtures via TARE_JSONL_PATH / TARE_V1_PATH, sinon on prend docs/.
 * Sans ca, la suite dependrait d'un fichier qu'un autre agent remplit en direct.
 */
export const jsonlPath = (): string =>
  process.env.TARE_JSONL_PATH || resolve(DOCS_DIR, "dataset", "measurements.jsonl");
export const v1Path = (): string =>
  process.env.TARE_V1_PATH || resolve(DOCS_DIR, "measurements-v1.json");
export const poolsPath = (): string =>
  process.env.TARE_POOLS_PATH || resolve(DOCS_DIR, "pools-liquides.json");

export interface RegistryEntry {
  address: string;
  fields: Record<string, unknown>;
}

export interface Dataset {
  measurements: Measurement[];
  byId: Map<string, Measurement>;
  byHook: Map<string, Measurement[]>;
  source: string;
  source_kind: "jsonl" | "v1-fallback" | "empty";
  loaded_at: string;
  /** lignes lues, lignes rejetees (jamais avalees en silence) */
  read: number;
  rejected: { line: number; error: string }[];
}

export interface Registry {
  path: string | null;
  entries: Map<string, RegistryEntry>;
  count: number;
}

export interface PoolRow {
  hook: string;
  currency0: string;
  currency1: string;
  fee: number;
  tick_spacing: number;
  hooks: string;
  /**
   * Liquidite APPROCHEE. docs/pools-liquides.json la stocke en nombre JSON : au-dela
   * de 2^53 la valeur exacte est deja perdue a la lecture. Elle ne sert qu'a classer
   * les pools d'un meme hook, jamais a etre affichee comme une mesure.
   */
  liquidity_approx: number;
}

function mtimeOf(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return -1;
  }
}

function parseJsonl(text: string): { rows: RawMeasurement[]; rejected: { line: number; error: string }[] } {
  const rows: RawMeasurement[] = [];
  const rejected: { line: number; error: string }[] = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === "object") rows.push(obj as RawMeasurement);
      else rejected.push({ line: i + 1, error: "not_an_object" });
    } catch (e) {
      rejected.push({ line: i + 1, error: (e as Error).message.slice(0, 120) });
    }
  });
  return { rows, rejected };
}

function buildDataset(rows: RawMeasurement[], source: string, kind: Dataset["source_kind"], rejected: Dataset["rejected"]): Dataset {
  const measurements: Measurement[] = [];
  for (const row of rows) {
    if (!row || typeof row.hook !== "string" || typeof row.pool_id !== "string") {
      rejected.push({ line: -1, error: "missing hook or pool_id" });
      continue;
    }
    measurements.push(normalizeMeasurement(row, { source: basename(source) }));
  }
  const byId = new Map<string, Measurement>();
  const byHook = new Map<string, Measurement[]>();
  for (const m of measurements) {
    byId.set(m.id, m);
    const list = byHook.get(m.hook);
    if (list) list.push(m);
    else byHook.set(m.hook, [m]);
  }
  return {
    measurements,
    byId,
    byHook,
    source,
    source_kind: kind,
    loaded_at: new Date().toISOString(),
    read: rows.length,
    rejected,
  };
}

let datasetCache: { key: string; value: Dataset } | null = null;

export function loadDataset(force = false): Dataset {
  const jsonl = jsonlPath();
  const v1 = v1Path();
  const key = `${jsonl}:${mtimeOf(jsonl)}:${v1}:${mtimeOf(v1)}`;
  if (!force && datasetCache && datasetCache.key === key) return datasetCache.value;

  let value: Dataset;
  if (existsSync(jsonl)) {
    const { rows, rejected } = parseJsonl(readFileSync(jsonl, "utf8"));
    if (rows.length > 0) {
      value = buildDataset(rows, jsonl, "jsonl", rejected);
      datasetCache = { key, value };
      return value;
    }
  }
  if (existsSync(v1)) {
    const parsed = JSON.parse(readFileSync(v1, "utf8"));
    const rows: RawMeasurement[] = Array.isArray(parsed) ? parsed : (parsed.measurements ?? []);
    value = buildDataset(rows, v1, "v1-fallback", []);
  } else {
    value = buildDataset([], "(aucune source)", "empty", []);
  }
  datasetCache = { key, value };
  return value;
}

/* ------------------------------------------------------------------ registre */

const REGISTRY_NAME = /(hook.?list|registry|hooks?-registry|uniswap.?hooks?)/i;

function extractAddress(o: Record<string, unknown>): string | null {
  for (const k of ["address", "hookAddress", "hook", "id", "contractAddress"]) {
    const v = o[k];
    if (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v.trim())) return v.trim().toLowerCase();
  }
  // Le registre officiel d'Uniswap imbrique l'adresse d'un niveau : {hook:{address,chain,...}}.
  // Sans cette branche, les 613 fiches se chargent en 0 entree et la colonne "ce que le registre
  // dit" - qui est la moitie du produit - reste vide sans que rien ne signale l'erreur.
  for (const k of ["hook", "entry", "meta"]) {
    const nested = o[k];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const a = (nested as Record<string, unknown>).address;
      if (typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a.trim())) return a.trim().toLowerCase();
    }
  }
  return null;
}

/** La chaine sur laquelle le jeu de mesures a ete produit. */
const MEASURED_CHAIN_ID = 8453;

/** chainId de la fiche, qu'il soit a la racine ou sous `hook`. */
function chainIdOf(rec: Record<string, unknown>): number | null {
  const direct = rec["chainId"];
  if (typeof direct === "number") return direct;
  const nested = rec["hook"];
  if (nested && typeof nested === "object") {
    const c = (nested as Record<string, unknown>)["chainId"];
    if (typeof c === "number") return c;
  }
  return null;
}

function collectEntries(parsed: unknown): Map<string, RegistryEntry> {
  const out = new Map<string, RegistryEntry>();
  let arr: unknown[] = [];
  if (Array.isArray(parsed)) arr = parsed;
  else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const k of ["hooks", "entries", "data", "results", "tokens"]) {
      if (Array.isArray(obj[k])) {
        arr = obj[k] as unknown[];
        break;
      }
    }
    if (arr.length === 0) {
      // forme {adresse: {...}}
      for (const [k, v] of Object.entries(obj)) {
        if (/^0x[0-9a-fA-F]{40}$/.test(k) && v && typeof v === "object") {
          out.set(k.toLowerCase(), { address: k.toLowerCase(), fields: v as Record<string, unknown> });
        }
      }
      return out;
    }
  }
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const addr = extractAddress(rec);
    if (!addr) continue;
    // 27 adresses sur 866 existent sur PLUSIEURS chaines (l'une sur 18) : les hooks sont mines
    // en CREATE2 pour leurs bits de permission, donc la meme adresse se redeploie ailleurs.
    // Nos mesures sont sur Base : entre deux fiches, on garde CELLE DE LA CHAINE MESUREE, sinon
    // un hook mesure sur Base herite de la description d'Ethereum. Le choix se fait ici plutot
    // qu'a la lecture, pour que la carte reste indexee par adresse et ne fuie pas dans le code
    // qui traite ses cles comme des adresses (decodeFlags, par exemple).
    const chainId = chainIdOf(rec);
    const existing = out.get(addr);
    if (!existing || (chainId === MEASURED_CHAIN_ID && chainIdOf(existing.fields) !== MEASURED_CHAIN_ID))
      out.set(addr, { address: addr, fields: rec });
  }
  return out;
}

let registryCache: { key: string; value: Registry } | null = null;

/** Cherche un fichier de registre dans docs/. S'il n'y en a pas, on expose null — jamais un faux vide. */
export function loadRegistry(force = false): Registry {
  let candidate: string | null = null;
  try {
    // Le plus RECENT, pas le premier alphabetique : un instantane date
    // (hooklist-live-20260905.json) doit primer sur un clone plus ancien, et l'ordre
    // alphabetique donnait ce resultat par chance plutot que par regle.
    const names = readdirSync(DOCS_DIR).filter((n) => n.endsWith(".json") && REGISTRY_NAME.test(n));
    const ranked = names
      .map((n) => ({ n, m: mtimeOf(join(DOCS_DIR, n)) }))
      .sort((a, b) => b.m - a.m || a.n.localeCompare(b.n));
    if (ranked[0]) candidate = join(DOCS_DIR, ranked[0].n);
  } catch {
    candidate = null;
  }
  if (!candidate) {
    const nested = join(DOCS_DIR, "dataset", "hooklist.json");
    if (existsSync(nested)) candidate = nested;
  }

  const key = `${candidate ?? "-"}:${candidate ? mtimeOf(candidate) : -1}`;
  if (!force && registryCache && registryCache.key === key) return registryCache.value;

  if (!candidate) {
    const value: Registry = { path: null, entries: new Map(), count: 0 };
    registryCache = { key, value };
    return value;
  }
  let entries = new Map<string, RegistryEntry>();
  try {
    entries = collectEntries(JSON.parse(readFileSync(candidate, "utf8")));
  } catch {
    entries = new Map();
  }
  const value: Registry = { path: candidate, entries, count: entries.size };
  registryCache = { key, value };
  return value;
}

/* ------------------------------------------------------- pools a liquidite */

let poolsCache: { key: string; value: PoolRow[] } | null = null;

export function loadPools(force = false): PoolRow[] {
  const pools = poolsPath();
  const key = `${pools}:${mtimeOf(pools)}`;
  if (!force && poolsCache && poolsCache.key === key) return poolsCache.value;
  let value: PoolRow[] = [];
  if (existsSync(pools)) {
    const parsed = JSON.parse(readFileSync(pools, "utf8"));
    if (Array.isArray(parsed)) {
      value = parsed
        .map((row: unknown): PoolRow | null => {
          if (!Array.isArray(row) || !Array.isArray(row[1])) return null;
          const key4 = row[1] as unknown[];
          const [c0, c1, fee, ts, hooks] = key4;
          if (typeof c0 !== "string" || typeof c1 !== "string" || typeof hooks !== "string") return null;
          return {
            hook: String(row[0]).toLowerCase(),
            currency0: c0.toLowerCase(),
            currency1: c1.toLowerCase(),
            fee: Number(fee),
            tick_spacing: Number(ts),
            hooks: hooks.toLowerCase(),
            liquidity_approx: Number(row[2] ?? 0),
          };
        })
        .filter((r): r is PoolRow => r !== null);
    }
  }
  poolsCache = { key, value };
  return value;
}


/* ------------------------------------------------- index pool_id -> PoolKey */

export interface KnownPool {
  pool_id: string;
  currency0: string;
  currency1: string;
  fee: number;
  tick_spacing: number;
  hooks: string;
  from: string;
}

let indexCache: { key: string; value: Map<string, KnownPool> } | null = null;

/**
 * Tous les pools dont on connait la PoolKey complete : ceux du jeu actif ET ceux du
 * jeu v1. Sans le second, un pool_id publie hier cesserait d'etre interrogeable des
 * que le sweep en cours change de source — un lien casse par un detail d'archivage.
 */
export function loadPoolIndex(force = false): Map<string, KnownPool> {
  const key = `${jsonlPath()}:${mtimeOf(jsonlPath())}:${v1Path()}:${mtimeOf(v1Path())}`;
  if (!force && indexCache && indexCache.key === key) return indexCache.value;

  const out = new Map<string, KnownPool>();
  const add = (m: Measurement) => {
    if (out.has(m.pool_id)) return;
    if (!m.currency0 || !m.currency1 || m.key_fee === null || m.tick_spacing === null) return;
    out.set(m.pool_id, {
      pool_id: m.pool_id,
      currency0: m.currency0,
      currency1: m.currency1,
      fee: m.key_fee,
      tick_spacing: m.tick_spacing,
      hooks: m.hook,
      from: m.source,
    });
  };

  for (const m of loadDataset(force).measurements) add(m);

  const v1 = v1Path();
  if (existsSync(v1)) {
    try {
      const parsed = JSON.parse(readFileSync(v1, "utf8"));
      const rows: RawMeasurement[] = Array.isArray(parsed) ? parsed : (parsed.measurements ?? []);
      for (const row of rows) {
        if (!row || typeof row.hook !== "string" || typeof row.pool_id !== "string") continue;
        add(normalizeMeasurement(row, { source: basename(v1) }));
      }
    } catch {
      /* le jeu v1 est un bonus ici : son absence n'est pas une erreur */
    }
  }

  indexCache = { key, value: out };
  return out;
}

export function resetCaches(): void {
  datasetCache = null;
  indexCache = null;
  registryCache = null;
  poolsCache = null;
}
