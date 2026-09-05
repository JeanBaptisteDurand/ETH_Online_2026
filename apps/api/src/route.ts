/**
 * GET /route — "je veux echanger A contre B, par quel pool passer ?"
 *
 * La question a l'air d'etre une question de routage. Elle n'en est pas une.
 *
 * Le recensement de decouverte (docs/dataset/pools-liquides-full.json) dit qu'une
 * ecrasante majorite des paires n'a QU'UN pool v4. Pour celles-la il n'y a rien a
 * recommander : il y a un peage a connaitre. Cette route rend donc deux choses
 * differentes selon ce que le jeu de donnees permet reellement de dire, et elle ne
 * fait jamais passer l'une pour l'autre :
 *
 *   - plusieurs pools mesures  -> un classement par cout total mesure croissant ;
 *   - un seul pool             -> le cout de ce pool, et une phrase sur l'absence
 *                                 d'alternative QUI N'EST AFFIRMEE QUE SI LE
 *                                 RECENSEMENT LA SOUTIENT.
 *
 * Cinq regles tenues ici, ligne par ligne :
 *
 * 1. Aucun nombre qui n'a pas ete mesure. Le cout total = frais LP lus dans slot0
 *    (stored_lp_fee, en centiemes de bps) + prelevement du hook mesure par
 *    contrefactuel. Les deux viennent du jeu ; rien n'est estime, rien n'est
 *    complete par un defaut.
 * 2. Un pool sans ligne chiffree est LISTE dans `unranked`, jamais classe, jamais
 *    mis a zero, jamais relegue en fin de classement comme s'il etait cher.
 * 3. Chaque cout porte sa mesure : id, bloc, taille, sens, etiquette, commande de
 *    rejeu.
 * 4. Les chiffres de structure (paires recensees, paires a choix multiple) sont
 *    DERIVES du recensement a chaque appel. Le jeu grandit ; la phrase suit. Si le
 *    recensement n'est pas la, la phrase n'est pas remplacee par des chiffres
 *    memorises : elle est absente, et on le dit.
 * 5. Ce qu'on ne peut pas verifier est ecrit comme tel. "Aucune alternative
 *    n'existe" n'est affirme que si le recensement ne voit qu'une porte ; sinon on
 *    rend INDETERMINE ou ALTERNATIVES_NON_MESUREES, jamais la phrase forte.
 *
 * Deux fichiers de mesures sont lus, en LECTURE SEULE :
 *   docs/dataset/measurements.jsonl            le corpus principal
 *   docs/dataset/measurements-contestes.jsonl  les paires a plusieurs portes
 * Le premier passe par loadDataset() (meme cache, meme repli v1, memes rejets). Le
 * second n'est pas connu de dataset.ts : on ajoute ici le lecteur de lignes, mais
 * la normalisation reste normalizeMeasurement() — donc memes ids, memes etiquettes,
 * memes commandes de rejeu que partout ailleurs dans l'API.
 *
 * Les deux fichiers sont ecrits EN DIRECT par les balayages. Une derniere ligne
 * tronquee est donc normale : elle est comptee dans `rejected_lines` et exposee
 * dans la reponse, jamais avalee.
 */
import { Hono } from "hono";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { DOCS_DIR } from "./paths.js";
import { loadDataset } from "./dataset.js";
import {
  buildReplay,
  normalizeMeasurement,
  type Measurement,
  type RawMeasurement,
} from "./measurement.js";
import { canCarryNumber, type Label } from "./labels.js";

/* ------------------------------------------------------------------ chemins */

/** Les paires a plusieurs portes, mesurees a part. Surchargeable en test. */
export const contestesPath = (): string =>
  process.env.TARE_CONTESTES_PATH || resolve(DOCS_DIR, "dataset", "measurements-contestes.jsonl");

/** Le recensement de decouverte : tous les pools a liquidite du bloc epingle. */
export const censusPath = (): string =>
  process.env.TARE_CENSUS_PATH || resolve(DOCS_DIR, "dataset", "pools-liquides-full.json");

/** Le manifeste du balayage de decouverte : c'est lui qui porte le bloc. */
export const censusScanPath = (): string =>
  process.env.TARE_CENSUS_SCAN_PATH || censusPath() + ".scan.json";

function mtimeOf(path: string): number {
  try {
    const st = statSync(path);
    // taille ET mtime : un fichier reecrit dans la meme milliseconde change de taille.
    return st.mtimeMs * 1e6 + st.size;
  } catch {
    return -1;
  }
}

/* --------------------------------------------------------- lecture du jsonl */

export interface JsonlRead {
  path: string;
  exists: boolean;
  /** lignes non vides rencontrees */
  read: number;
  /** lignes illisibles : jamais avalees, toujours comptees */
  rejected: { line: number; error: string }[];
  measurements: Measurement[];
}

function readJsonlMeasurements(path: string): JsonlRead {
  if (!existsSync(path))
    return { path, exists: false, read: 0, rejected: [], measurements: [] };

  const rejected: { line: number; error: string }[] = [];
  const measurements: Measurement[] = [];
  let read = 0;
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    read += 1;
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch (e) {
      // Ligne tronquee par un balayage encore en cours : elle compte comme rejet,
      // pas comme absence.
      rejected.push({ line: i + 1, error: (e as Error).message.slice(0, 120) });
      return;
    }
    const row = obj as RawMeasurement;
    if (!row || typeof row !== "object" || typeof row.hook !== "string" || typeof row.pool_id !== "string") {
      rejected.push({ line: i + 1, error: "missing hook or pool_id" });
      return;
    }
    measurements.push(normalizeMeasurement(row, { source: basename(path) }));
  });
  return { path, exists: true, read, rejected, measurements };
}

let contestedCache: { key: string; value: JsonlRead } | null = null;

export function loadContested(force = false): JsonlRead {
  const p = contestesPath();
  const key = `${p}:${mtimeOf(p)}`;
  if (!force && contestedCache && contestedCache.key === key) return contestedCache.value;
  const value = readJsonlMeasurements(p);
  contestedCache = { key, value };
  return value;
}

/* -------------------------------------------------------------- recensement */

export interface CensusPool {
  currency0: string;
  currency1: string;
  fee: number;
  tick_spacing: number;
  hooks: string;
  /**
   * Liquidite telle qu'ecrite dans le recensement, en chaine. On la garde en chaine :
   * elle depasse 2^53 et un Number la deformerait. Elle ne sert JAMAIS au classement —
   * ce n'est pas une mesure de prelevement.
   */
  liquidity_raw: string;
  fee_is_dynamic: boolean | null;
}

export interface Census {
  path: string;
  available: boolean;
  pools: CensusPool[];
  byPair: Map<string, CensusPool[]>;
  /** paires distinctes recensees */
  pairs: number;
  /** paires ayant strictement plus d'un pool */
  pairs_multi: number;
  /** bloc du balayage de decouverte, lu dans le manifeste. null s'il manque. */
  block_number: number | null;
  /**
   * Pools que le balayage de decouverte n'a PAS pu lire (429, timeout). Le manifeste
   * ne dit pas a quelle paire ils appartiennent : le recensement est donc un
   * MINORANT, et "aucune alternative n'existe" est vrai a ces pools pres.
   * null = le manifeste ne le dit pas ; on ne le remplace pas par zero.
   */
  unreadable_pools: number | null;
  /** commande qui rejoue le balayage de decouverte, si le manifeste la porte */
  rescan_command: string | null;
  rejected: number;
  /** lignes du recensement portant une PoolKey deja vue : une porte est une porte */
  duplicates_dropped: number;
}

/** Cle de paire, insensible a l'ordre d'appel : les deux adresses triees. */
export function pairKey(a: string, b: string): string {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

/**
 * Cle de PoolKey. (currency0, currency1, fee, tickSpacing, hooks) determine le
 * poolId : cette cle est donc une bijection avec lui. On s'en sert pour raccorder
 * un pool du recensement a ses mesures SANS calculer de keccak — l'API ne derive
 * pas d'identifiant qu'elle n'a pas lu.
 */
function poolKeyTuple(c0: string, c1: string, fee: number, ts: number, hooks: string): string {
  return [c0.toLowerCase(), c1.toLowerCase(), fee, ts, hooks.toLowerCase()].join("|");
}

let censusCache: { key: string; value: Census } | null = null;

export function loadCensus(force = false): Census {
  const p = censusPath();
  const scan = censusScanPath();
  const key = `${p}:${mtimeOf(p)}:${scan}:${mtimeOf(scan)}`;
  if (!force && censusCache && censusCache.key === key) return censusCache.value;

  const pools: CensusPool[] = [];
  const seenKeys = new Set<string>();
  let rejected = 0;
  let duplicates_dropped = 0;
  let available = false;
  if (existsSync(p)) {
    try {
      const parsed = JSON.parse(readFileSync(p, "utf8"));
      if (Array.isArray(parsed)) {
        available = true;
        for (const row of parsed) {
          if (!Array.isArray(row) || !Array.isArray(row[1])) {
            rejected += 1;
            continue;
          }
          const [c0, c1, fee, ts, hooks] = row[1] as unknown[];
          if (typeof c0 !== "string" || typeof c1 !== "string" || typeof hooks !== "string") {
            rejected += 1;
            continue;
          }
          // Une PoolKey deja vue est le MEME pool : la compter deux fois gonflerait le
          // nombre de portes, donc l'affirmation "aucune alternative n'existe".
          const tuple = poolKeyTuple(c0, c1, Number(fee), Number(ts), hooks);
          if (seenKeys.has(tuple)) {
            duplicates_dropped += 1;
            continue;
          }
          seenKeys.add(tuple);
          pools.push({
            currency0: c0.toLowerCase(),
            currency1: c1.toLowerCase(),
            fee: Number(fee),
            tick_spacing: Number(ts),
            hooks: hooks.toLowerCase(),
            liquidity_raw: String(row[2] ?? ""),
            fee_is_dynamic: typeof row[3] === "boolean" ? row[3] : null,
          });
        }
      }
    } catch {
      available = false;
    }
  }

  const byPair = new Map<string, CensusPool[]>();
  for (const pool of pools) {
    const k = pairKey(pool.currency0, pool.currency1);
    const list = byPair.get(k);
    if (list) list.push(pool);
    else byPair.set(k, [pool]);
  }
  let pairs_multi = 0;
  for (const list of byPair.values()) if (list.length > 1) pairs_multi += 1;

  let block_number: number | null = null;
  let unreadable_pools: number | null = null;
  let rescan_command: string | null = null;
  if (existsSync(scan)) {
    try {
      const manifest = JSON.parse(readFileSync(scan, "utf8")) as Record<string, unknown>;
      if (typeof manifest.block_number === "number") block_number = manifest.block_number;
      if (typeof manifest.n_unknown === "number") unreadable_pools = manifest.n_unknown;
      if (typeof manifest.replay === "string") rescan_command = manifest.replay;
    } catch {
      block_number = null;
    }
  }

  const value: Census = {
    path: p,
    available: available && pools.length > 0,
    pools,
    byPair,
    pairs: byPair.size,
    pairs_multi,
    block_number,
    unreadable_pools,
    rescan_command,
    rejected,
    duplicates_dropped,
  };
  censusCache = { key, value };
  return value;
}

/* ------------------------------------------------- index des paires mesurees */

export interface SourceInfo {
  path: string;
  kind: string;
  exists: boolean;
  rows_read: number;
  rejected_lines: number;
  measurements: number;
}

export interface PairIndex {
  /** paire -> pool_id -> mesures */
  byPair: Map<string, Map<string, Measurement[]>>;
  /** cle de PoolKey -> pool_id, pour raccorder le recensement aux mesures */
  tupleToPool: Map<string, string>;
  sources: SourceInfo[];
  measurements_total: number;
  /** memes id vus dans les deux fichiers : gardes une fois, comptes ici */
  duplicates_dropped: number;
  /** mesures sans currency0/currency1 : impossible de les rattacher a une paire */
  skipped_without_pair: number;
}

let indexCache: { key: string; value: PairIndex } | null = null;

export function loadPairIndex(force = false): PairIndex {
  const ds = loadDataset(force);
  const contested = loadContested(force);
  const key = `${ds.source}:${ds.loaded_at}:${ds.measurements.length}:${contested.path}:${mtimeOf(contested.path)}`;
  if (!force && indexCache && indexCache.key === key) return indexCache.value;

  const byPair = new Map<string, Map<string, Measurement[]>>();
  const tupleToPool = new Map<string, string>();
  const seen = new Set<string>();
  let duplicates_dropped = 0;
  let skipped_without_pair = 0;

  const add = (m: Measurement) => {
    if (seen.has(m.id)) {
      duplicates_dropped += 1;
      return;
    }
    seen.add(m.id);
    if (!m.currency0 || !m.currency1) {
      skipped_without_pair += 1;
      return;
    }
    const k = pairKey(m.currency0, m.currency1);
    let pools = byPair.get(k);
    if (!pools) {
      pools = new Map();
      byPair.set(k, pools);
    }
    const list = pools.get(m.pool_id);
    if (list) list.push(m);
    else pools.set(m.pool_id, [m]);

    if (m.key_fee !== null && m.tick_spacing !== null)
      tupleToPool.set(
        poolKeyTuple(m.currency0, m.currency1, m.key_fee, m.tick_spacing, m.hook),
        m.pool_id,
      );
  };

  for (const m of ds.measurements) add(m);
  for (const m of contested.measurements) add(m);

  const sources: SourceInfo[] = [
    {
      path: ds.source,
      kind: ds.source_kind,
      exists: ds.source_kind !== "empty",
      rows_read: ds.read,
      rejected_lines: ds.rejected.length,
      measurements: ds.measurements.length,
    },
    {
      path: contested.path,
      kind: "contestes",
      exists: contested.exists,
      rows_read: contested.read,
      rejected_lines: contested.rejected.length,
      measurements: contested.measurements.length,
    },
  ];

  const value: PairIndex = {
    byPair,
    tupleToPool,
    sources,
    measurements_total: seen.size,
    duplicates_dropped,
    skipped_without_pair,
  };
  indexCache = { key, value };
  return value;
}

export function resetRouteCaches(): void {
  contestedCache = null;
  censusCache = null;
  indexCache = null;
}

/* ------------------------------------------------------------------- calcul */

/** Les frais LP de slot0 sont en centiemes de bps (pips) : 3000 pips = 30 bps. */
export function lpFeeBps(storedLpFee: number): number {
  return storedLpFee / 100;
}

/** Arrondi d'affichage. Ne cree pas d'information : 4 decimales comme le moteur. */
function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

function countLabels(ms: Measurement[]): Partial<Record<Label, number>> {
  const out: Partial<Record<Label, number>> = {};
  for (const m of ms) out[m.label] = (out[m.label] ?? 0) + 1;
  return out;
}

/**
 * Distance entre deux tailles, en decades. Les tailles balayees sont des puissances
 * de dix (1e12 -> 1e19) : une distance absolue collerait toujours a la plus grande.
 */
function sizeDistance(a: string, b: string): number {
  // Number() sature a Infinity au-dela de ~1.8e308. Une taille en wei y arrive :
  // 10^309 tient dans un uint256. Toutes les distances valaient alors Infinity, le
  // comparateur rendait Infinity - Infinity = NaN, et l'ordre du classement devenait
  // celui du tableau d'entree — c'est-a-dire indefini. On reste donc en BigInt et on
  // compare des ordres de grandeur : le nombre de chiffres, puis la mantisse.
  let x: bigint;
  let y: bigint;
  try {
    x = BigInt(a);
    y = BigInt(b);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  if (x <= 0n || y <= 0n) return Number.POSITIVE_INFINITY;
  const dec = (v: bigint) => {
    const t = v.toString();
    // log10 approche : (nb de chiffres - 1) + log10 des 15 premiers chiffres.
    return t.length - 1 + Math.log10(Number(t.slice(0, 15)) / 10 ** (Math.min(t.length, 15) - 1));
  };
  return Math.abs(dec(x) - dec(y));
}

function point(m: Measurement, lp: number | null) {
  const hook = m.bps;
  return {
    id: m.id,
    amount_in: m.amount_in,
    direction: m.direction,
    hook_bps: hook,
    total_bps: hook !== null && lp !== null ? round4(lp + hook) : null,
    label: m.label,
    reason: m.reason,
    block_number: m.block_number,
    replay: m.replay.command_exact,
  };
}

export interface RouteQuery {
  currency0: string;
  currency1: string;
  /** taille en wei, telle que demandee. null = non precisee. */
  amount: string | null;
  /** sens impose par le parametre, sinon null (deduit de l'ordre des arguments) */
  zeroForOne: boolean | null;
}

/** Ce qu'une porte mesuree rend, classee ou non. */
interface Gate {
  pool_id: string;
  hook: string;
  key_fee: number | null;
  fee_is_dynamic: boolean | null;
  stored_lp_fee: number | null;
  lp_fee_bps: number | null;
  tick_spacing: number | null;
  measurements: number;
  measurements_in_direction: number;
  /** toutes les lignes du pool, les deux sens confondus */
  labels_all_directions: Partial<Record<Label, number>>;
  /** les lignes du seul sens demande : ce sont elles qui decident du classement */
  labels_in_direction: Partial<Record<Label, number>>;
  points: ReturnType<typeof point>[];
}

/**
 * Le coeur. Fonction pure : elle prend l'index, le recensement et la question, et
 * rend l'objet servi. Testable sans HTTP.
 */
export function buildRouteAnswer(q: RouteQuery, index: PairIndex, census: Census) {
  const key = pairKey(q.currency0, q.currency1);
  const [canon0, canon1] = key.split("|") as [string, string];

  // Le sens : impose par le parametre, sinon deduit de l'ordre des arguments. La
  // paire, elle, est insensible a l'ordre — mais "echanger A contre B" a un sens, et
  // on dit lequel on a retenu plutot que de choisir en silence le moins cher.
  const askedFirst = q.currency0.toLowerCase();
  const inferred = askedFirst === canon0;
  const zeroForOne = q.zeroForOne === null ? inferred : q.zeroForOne;
  const directionSource = q.zeroForOne === null ? "ordre_des_arguments" : "parametre_zeroForOne";

  const censusPools = census.available ? (census.byPair.get(key) ?? []) : [];
  const pools = index.byPair.get(key) ?? new Map<string, Measurement[]>();

  /* ---------------------------------------------------------- structure */

  // Le balayage de decouverte n'a pas tout lu. Ses paires etant inconnues, on ne peut
  // pas les ecarter d'une paire donnee : tout ce qui se deduit du recensement est un
  // MINORANT, et on le dit a chaque fois plutot qu'une fois en bas de page.
  const censusCaveat = !census.available
    ? null
    : census.unreadable_pools === null
      ? "le manifeste du balayage ne dit pas combien de pools sont restes illisibles : on ne sait pas de combien ce recensement est un minorant."
      : census.unreadable_pools > 0
        ? `le balayage de decouverte n'a pas pu lire ${census.unreadable_pools} pools (voir ${basename(censusScanPath())}, unknown_pools) et le manifeste ne dit pas a quelles paires ils appartiennent : ce recensement est un MINORANT.`
        : null;

  const structure = census.available
    ? {
        pairs_discovered: census.pairs,
        pairs_with_more_than_one_pool: census.pairs_multi,
        pairs_with_a_single_pool: census.pairs - census.pairs_multi,
        share_pct: round4((census.pairs_multi / census.pairs) * 100),
        block_number: census.block_number,
        source: census.path,
        is_lower_bound: census.unreadable_pools === null || census.unreadable_pools > 0,
        caveat: censusCaveat,
        sentence:
          `Sur ${census.pairs} paires decouvertes` +
          (census.block_number !== null ? ` au bloc ${census.block_number}` : "") +
          `, ${census.pairs_multi} ${census.pairs_multi > 1 ? "offrent" : "offre"} un choix de pool` +
          ` (${round4((census.pairs_multi / census.pairs) * 100)} %).` +
          ` Pour ${census.pairs - census.pairs_multi === 1 ? "la seule autre" : `les ${census.pairs - census.pairs_multi} autres`}, il n'existe qu'une porte :` +
          ` un prelevement n'y est pas un prix concurrentiel, c'est un peage sur la seule route.`,
      }
    : null;

  const structure_note = census.available
    ? null
    : `recensement absent ou illisible (${census.path}) : la phrase structurelle n'est pas calculable. On ne la remplace pas par des chiffres memorises.`;

  /* -------------------------------------------------- portes non mesurees */

  // Une porte que le recensement voit mais dont AUCUNE ligne n'existe. Ce n'est pas
  // un cout de zero : c'est une absence de mesure, et elle sort du classement.
  const unmeasured_gates = censusPools
    .filter((p) => !index.tupleToPool.has(poolKeyTuple(p.currency0, p.currency1, p.fee, p.tick_spacing, p.hooks)))
    .map((p) => ({
      pool_id: null as string | null,
      pool_id_note:
        "poolId non calcule ici : la route ne derive pas d'identifiant qu'elle n'a pas lu. La PoolKey ci-dessous suffit a le recalculer.",
      hook: p.hooks,
      key_fee: p.fee,
      tick_spacing: p.tick_spacing,
      fee_is_dynamic: p.fee_is_dynamic,
      liquidity_raw: p.liquidity_raw,
      label: "NOT_MEASURED",
      note: "cette porte est au recensement mais aucune mesure ne la couvre. Ce n'est pas un cout de zero.",
      replay_to_measure:
        q.amount !== null && census.block_number !== null
          ? buildReplay(
              {
                hook: p.hooks,
                block_number: census.block_number,
                amount_in: q.amount,
                zero_for_one: zeroForOne,
                currency0: p.currency0,
                currency1: p.currency1,
                key_fee: p.fee,
                tick_spacing: p.tick_spacing,
              },
              "$RPC",
            ).command_exact
          : null,
      replay_note:
        q.amount !== null && census.block_number !== null
          ? null
          : "commande de mesure non construite : il manque le parametre amount ou le bloc du recensement.",
    }));

  /* ------------------------------------------------------ portes mesurees */

  const ranked: Record<string, unknown>[] = [];
  const unranked: Record<string, unknown>[] = [];
  let measurements_for_pair = 0;
  let measurements_in_direction = 0;
  const blocks = new Set<number>();

  for (const [pool_id, ms] of pools) {
    measurements_for_pair += ms.length;
    for (const m of ms) blocks.add(m.block_number);
    const head = ms[0]!;
    // Le frais LP affiche AVANT le choix de la ligne : celui de la premiere ligne, faute
    // de mieux. Il ne sert qu'a decrire le pool ; le cout total, lui, est recalcule plus
    // bas sur LA MEME ligne que le prelevement (voir lpChosen).
    const lp = head.stored_lp_fee === null ? null : lpFeeBps(head.stored_lp_fee);
    // Les lignes d'un meme pool peuvent porter des frais LP differents : une lecture de
    // slot0 qui echoue rend null, une autre rend la valeur. Additionner le frais d'une
    // ligne au prelevement d'une autre fabriquerait un cout que rien n'a mesure.
    const lpVus = new Set(ms.map((m) => m.stored_lp_fee));
    const lpDivergent = lpVus.size > 1;
    const inDir = ms.filter((m) => m.zero_for_one === zeroForOne);
    measurements_in_direction += inDir.length;

    const gate: Gate = {
      pool_id,
      hook: head.hook,
      key_fee: head.key_fee,
      fee_is_dynamic: head.fee_is_dynamic,
      stored_lp_fee: head.stored_lp_fee,
      lp_fee_bps: lp,
      tick_spacing: head.tick_spacing,
      measurements: ms.length,
      measurements_in_direction: inDir.length,
      labels_all_directions: countLabels(ms),
      labels_in_direction: countLabels(inDir),
      points: inDir
        .slice()
        .sort((a, b) => (BigInt(a.amount_in) < BigInt(b.amount_in) ? -1 : 1))
        .map((m) => point(m, lp)),
    };

    const quoted = inDir.filter((m) => m.bps !== null && canCarryNumber(m.label));

    // Aucune ligne dans ce sens : on le dit, on ne bascule pas sur l'autre sens.
    if (inDir.length === 0) {
      unranked.push({
        ...gate,
        why: "NO_ROW_IN_DIRECTION",
        why_fr: `aucune mesure dans le sens ${zeroForOne ? "0->1" : "1->0"} pour ce pool.`,
        total_bps: null,
        numeric_in_other_direction: ms.some((m) => m.bps !== null),
      });
      continue;
    }

    // Toutes les lignes du sens sont NOT_QUOTABLE / NOT_MEASURABLE : liste, jamais
    // classe. Pas de zero, pas de derniere place.
    if (quoted.length === 0) {
      unranked.push({
        ...gate,
        why: "NO_QUOTED_ROW_IN_DIRECTION",
        why_fr:
          "toutes les lignes de ce pool dans ce sens sont NOT_QUOTABLE ou NOT_MEASURABLE. Non mesure n'est pas zero : ce pool n'a pas de cout a comparer.",
        total_bps: null,
        numeric_in_other_direction: ms.some((m) => m.bps !== null && m.zero_for_one !== zeroForOne),
      });
      continue;
    }

    // La taille demandee existe-t-elle telle quelle dans ce pool ?
    const exactRow = q.amount === null ? null : (inDir.find((m) => m.amount_in === q.amount) ?? null);

    if (exactRow && exactRow.bps === null) {
      // Le pool a bien ete interroge a CETTE taille et n'a pas su coter. C'est la
      // reponse a la question posee : on ne la remplace pas par une autre taille.
      const fallback = quoted
        .slice()
        .sort((a, b) => sizeDistance(a.amount_in, q.amount!) - sizeDistance(b.amount_in, q.amount!))[0]!;
      unranked.push({
        ...gate,
        why: "NOT_QUOTABLE_AT_REQUESTED_SIZE",
        why_fr: `a la taille demandee (${q.amount} wei) ce pool rend ${exactRow.label}. Ce n'est pas un cout de zero, et on ne lui substitue pas une autre taille pour le classer.`,
        label_at_requested_size: exactRow.label,
        reason_at_requested_size: exactRow.reason,
        measurement_at_requested_size: exactRow.id,
        replay_at_requested_size: exactRow.replay.command_exact,
        total_bps: null,
        nearest_quoted: {
          amount_in: fallback.amount_in,
          hook_bps: fallback.bps,
          lp_fee_bps: lp,
          total_bps: lp !== null && fallback.bps !== null ? round4(lp + fallback.bps) : null,
          label: fallback.label,
          measurement_id: fallback.id,
          replay: fallback.replay.command_exact,
          note: "cette valeur est a une AUTRE taille que celle demandee. Elle n'a pas servi au classement.",
        },
      });
      continue;
    }

    // Choix de la ligne qui porte le cout.
    let chosen: Measurement;
    let cost_basis: string;
    let size_exact: boolean;
    if (q.amount === null) {
      // Sans taille demandee, on ne devine pas la taille de l'echange : on retient la
      // mesure qui a coute LE PLUS CHER, et on le dit. L'etiquette a longtemps ete
      // « pire_taille_mesuree », ce qui decrivait autre chose — le code ne trie pas par
      // taille, il trie par cout. Nommer une regle pour une autre est un mensonge de plus
      // petite taille qu'un faux chiffre, mais de la meme famille.
      chosen = quoted.reduce((a, b) => (b.bps! > a.bps! ? b : a));
      cost_basis = "pire_cout_mesure";
      size_exact = false;
    } else {
      const sorted = quoted
        .slice()
        .sort(
          (a, b) =>
            sizeDistance(a.amount_in, q.amount!) - sizeDistance(b.amount_in, q.amount!) ||
            (BigInt(a.amount_in) < BigInt(b.amount_in) ? -1 : 1),
        );
      chosen = sorted[0]!;
      size_exact = chosen.amount_in === q.amount;
      cost_basis = size_exact ? "taille_demandee" : "taille_mesuree_la_plus_proche";
    }

    // LE frais LP du cout total : celui de la ligne choisie, jamais celui d'une autre.
    const lpChosen = chosen.stored_lp_fee === null ? null : lpFeeBps(chosen.stored_lp_fee);
    if (lpChosen === null) {
      // Sans frais LP lus, le cout TOTAL n'existe pas. On refuse de l'additionner
      // avec un zero implicite ; le prelevement du hook reste visible.
      unranked.push({
        ...gate,
        why: "NO_STORED_LP_FEE",
        why_fr:
          "stored_lp_fee absent pour ce pool : le cout total ne peut pas etre compose. Le prelevement du hook seul reste lisible dans points[].",
        total_bps: null,
        hook_bps: chosen.bps,
        measurement_id: chosen.id,
        replay: chosen.replay.command_exact,
      });
      continue;
    }

    ranked.push({
      ...gate,
      hook_bps: chosen.bps,
      lp_fee_bps_used: lpChosen,
      // Les deux termes viennent de la MEME ligne, et la ligne est nommee juste apres
      // (measurement_id). C'est ce qui rend la somme verifiable.
      total_bps: round4(lpChosen + chosen.bps!),
      total_bps_formula: `stored_lp_fee/100 (${round4(lpChosen)}) + hook_bps (${chosen.bps}) = ${round4(lpChosen + chosen.bps!)}  [mesure ${chosen.id}]`,
      lp_fee_divergent_rows: lpDivergent
        ? {
            values_seen: [...lpVus],
            note: "Les lignes de ce pool ne portent pas toutes le meme stored_lp_fee (une lecture de slot0 a echoue sur au moins une). Le cout total ci-dessus n'utilise que la ligne nommee dans measurement_id.",
          }
        : null,
      label: chosen.label,
      cost_basis,
      size: {
        requested_wei: q.amount,
        used_wei: chosen.amount_in,
        exact_match: size_exact,
        note: size_exact
          ? "cout lu a la taille demandee."
          : q.amount === null
            ? "aucune taille demandee : le cout affiche est le PLUS ELEVE mesure dans ce sens, toutes tailles confondues. Les autres tailles sont dans points[]."
            : `la taille demandee (${q.amount} wei) n'a pas ete mesuree sur ce pool. Le cout affiche est celui de la taille mesuree la plus proche (${chosen.amount_in} wei).`,
      },
      measurement_id: chosen.id,
      block_number: chosen.block_number,
      direction: chosen.direction,
      replay: chosen.replay.command_exact,
    });
  }

  ranked.sort(
    (a, b) =>
      (a.total_bps as number) - (b.total_bps as number) ||
      (a.lp_fee_bps as number) - (b.lp_fee_bps as number) ||
      String(a.hook).localeCompare(String(b.hook)),
  );

  /* -------------------------------------------------------------- verdict */

  const poolsMeasured = pools.size;
  const dirLabel = zeroForOne ? "0->1" : "1->0";

  // Combien de pools cotent dans l'AUTRE sens. N'a d'interet que si le classement
  // est vide : "personne ne cote ici" est une reponse, "relance dans l'autre sens"
  // en est une meilleure — et elle ne coute aucun nombre invente.
  let poolsQuotedOtherDirection = 0;
  for (const ms of pools.values())
    if (ms.some((m) => m.bps !== null && m.zero_for_one !== zeroForOne)) poolsQuotedOtherDirection += 1;

  let verdict: "MULTIPLE_POOLS" | "SINGLE_POOL" | "NOT_MEASURED";
  let headline: string;
  if (poolsMeasured === 0) {
    verdict = "NOT_MEASURED";
    headline =
      "Cette paire n'est couverte par aucune mesure du jeu. Ce n'est pas un cout de zero, c'est une absence de mesure.";
  } else if (poolsMeasured === 1) {
    verdict = "SINGLE_POOL";
    headline =
      ranked.length === 1
        ? "Un seul pool mesure pour cette paire : il n'y a pas de recommandation a faire, il y a un peage a connaitre."
        : `Un seul pool mesure pour cette paire, et il n'a pas de cout mesure dans le sens ${dirLabel} a cette taille. Il est liste hors classement : non mesure n'est pas zero.`;
  } else {
    verdict = "MULTIPLE_POOLS";
    headline =
      ranked.length === 0
        ? `${poolsMeasured} pools mesures pour cette paire, mais aucun n'a de cout mesure dans le sens ${dirLabel} a cette taille : il n'y a pas de classement a rendre.`
        : ranked.length === 1
          ? `${poolsMeasured} pools mesures pour cette paire, un seul a un cout mesure dans le sens ${dirLabel} a cette taille. Les autres sont listes hors classement, sans cout.`
          : `${poolsMeasured} pools mesures pour cette paire : le classement ci-dessous va du cout total mesure le plus faible au plus eleve.`;
  }

  // Deux pools au MEME cout total mesure ne sont pas classables l'un devant l'autre.
  // L'ordre rendu est alors deterministe mais arbitraire, et on le dit plutot que de
  // laisser lire un ecart la ou la mesure n'en voit pas.
  const totals = ranked.map((r) => r.total_bps as number);
  const tied = totals.length !== new Set(totals).size;

  /* --------------------------------------------------------- alternatives */

  // "Aucune alternative n'existe" est une affirmation forte. Elle n'est rendue que
  // si le recensement la soutient. Sinon : INDETERMINE, jamais la phrase forte.
  let claim: "AUCUNE_ALTERNATIVE" | "ALTERNATIVES_NON_MESUREES" | "PLUSIEURS_PORTES" | "INDETERMINE";
  let claim_sentence: string;
  if (!census.available) {
    claim = "INDETERMINE";
    claim_sentence =
      "le recensement n'est pas charge : on ne peut pas affirmer qu'aucune alternative n'existe a ce bloc.";
  } else if (censusPools.length === 0) {
    claim = "INDETERMINE";
    claim_sentence =
      "cette paire n'apparait pas dans le recensement de decouverte : on ne peut rien affirmer sur ses alternatives.";
  } else if (censusPools.length === 1) {
    claim = "AUCUNE_ALTERNATIVE";
    claim_sentence =
      `le recensement ne voit qu'un seul pool v4 pour cette paire au bloc ${census.block_number ?? "(bloc inconnu)"} : aucune alternative n'existe a ce bloc, on ne peut pas contourner le hook.` +
      (censusCaveat ? ` Reserve : ${censusCaveat}` : "");
  } else if (unmeasured_gates.length > 0) {
    claim = "ALTERNATIVES_NON_MESUREES";
    claim_sentence = `le recensement voit ${censusPools.length} portes pour cette paire, ${poolsMeasured} sont mesurees et ${unmeasured_gates.length} ne le sont pas. On ne peut donc pas affirmer que le classement couvre toutes les alternatives.`;
  } else {
    claim = "PLUSIEURS_PORTES";
    claim_sentence = `le recensement voit ${censusPools.length} portes pour cette paire, toutes couvertes par au moins une mesure.`;
  }

  /* ------------------------------------------------------------- reponse */

  const blockList = [...blocks].sort((a, b) => a - b);

  return {
    question: `echanger ${canon0} contre ${canon1} : par quel pool passer ?`,
    verdict,
    headline,
    pair: {
      currency0: canon0,
      currency1: canon1,
      as_asked: [q.currency0.toLowerCase(), q.currency1.toLowerCase()],
      note: "la paire est insensible a l'ordre des arguments ; l'ordre canonique est celui de la PoolKey (currency0 < currency1).",
    },
    direction: {
      zero_for_one: zeroForOne,
      human: zeroForOne ? "0->1" : "1->0",
      source: directionSource,
      note:
        directionSource === "ordre_des_arguments"
          ? "sens deduit de l'ordre des arguments : le premier jeton donne est celui que l'on vend. Passe zeroForOne pour l'imposer."
          : "sens impose par le parametre zeroForOne.",
      hint:
        ranked.length === 0 && poolsQuotedOtherDirection > 0
          ? `aucune porte ne cote dans le sens ${dirLabel}, mais ${poolsQuotedOtherDirection} pool(s) cotent dans l'autre sens : relance avec zeroForOne=${zeroForOne ? "false" : "true"}. Cette route ne bascule pas de sens toute seule.`
          : null,
      pools_quoted_in_other_direction: poolsQuotedOtherDirection,
    },
    size: {
      requested_wei: q.amount,
      note:
        q.amount === null
          ? "aucune taille demandee : chaque pool est classe sur son cout MESURE LE PLUS ELEVE dans ce sens, toutes tailles confondues (cost_basis=pire_cout_mesure). Les autres tailles restent dans points[]."
          : "chaque pool porte son propre champ size : exact_match dit si la taille demandee a ete mesuree telle quelle.",
    },
    block: {
      measurements: blockList,
      census: census.block_number,
      note:
        blockList.length === 0
          ? "aucune mesure : aucun bloc a porter."
          : blockList.length === 1
            ? "toutes les mesures de cette paire viennent de ce bloc."
            : "les mesures de cette paire viennent de plusieurs blocs : elles ne sont pas comparables entre elles sans precaution.",
    },
    alternatives: {
      claim,
      sentence: claim_sentence,
      caveat: censusCaveat,
      pools_measured: poolsMeasured,
      pools_in_census: census.available ? censusPools.length : null,
      census_available: census.available,
      pools_in_census_note: census.available
        ? null
        : "recensement indisponible : pools_in_census est null, ce qui ne veut PAS dire zero porte.",
    },
    structure,
    structure_note,
    counts: {
      measurements_for_this_pair: measurements_for_pair,
      measurements_in_direction,
      measurements_used_for_ranking: ranked.length,
      pools_measured: poolsMeasured,
      pools_ranked: ranked.length,
      pools_listed_unranked: unranked.length,
      gates_not_measured: unmeasured_gates.length,
      pairs_covered_by_measurements: index.byPair.size,
      measurements_total: index.measurements_total,
    },
    ranked,
    unranked,
    ranking_note: tied
      ? "au moins deux pools ont le MEME cout total mesure : leur ordre relatif est deterministe (frais LP puis adresse du hook) mais arbitraire. La mesure ne les separe pas."
      : null,
    unranked_note:
      "ces pools sont LISTES et jamais classes : aucun cout ne leur est invente, aucun zero ne leur est prete, et leur place dans cette liste ne dit rien de leur prix.",
    unmeasured_gates,
    cost_model: {
      formula: "total_bps = stored_lp_fee / 100 + hook_bps",
      stored_lp_fee: "frais LP lus dans slot0 au bloc de la mesure, en centiemes de bps (pips).",
      hook_bps:
        "prelevement du hook, mesure par contrefactuel : le meme swap cote deux fois, une fois avec le bytecode du hook, une fois avec un stub inerte de 89 octets pose par anvil_setCode. La PoolKey ne bouge pas.",
      assumption:
        "l'addition suppose que la cotation sans hook paie exactement stored_lp_fee — ce que slot0 dit a ce bloc. Si un hook modifiait le frais stocke hors du chemin de swap, cette hypothese tomberait ; on ne l'a pas verifiee ici.",
    },
    sources: index.sources,
    census_source: {
      path: census.path,
      available: census.available,
      pools: census.pools.length,
      rejected_rows: census.rejected,
      duplicate_poolkeys_dropped: census.duplicates_dropped,
      block_number: census.block_number,
      unreadable_pools: census.unreadable_pools,
      unreadable_pools_note:
        census.unreadable_pools === null
          ? "le manifeste du balayage ne porte pas ce compte : ce n'est pas zero, c'est inconnu."
          : "pools que le balayage de decouverte n'a pas pu lire. Leurs paires sont inconnues : ils ne peuvent pas etre ecartes d'une paire donnee.",
      rescan_command: census.rescan_command,
    },
    dataset_notes: {
      duplicates_dropped: index.duplicates_dropped,
      skipped_without_pair: index.skipped_without_pair,
      note: "les deux jsonl sont ecrits en direct par les balayages : rejected_lines compte les lignes illisibles, elles ne sont pas avalees.",
    },
    honesty: [
      "Aucun cout n'est estime : chaque nombre vient d'une mesure identifiee, avec son bloc, sa taille, son sens et sa commande de rejeu.",
      "NOT_QUOTABLE et NOT_MEASURABLE ne sont pas des zeros : les pools concernes sont listes hors classement.",
      "Une taille non mesuree n'est jamais inventee : elle est signalee par size.exact_match=false et size.used_wei.",
      "Les chiffres de structure sont derives du recensement a chaque appel, jamais ecrits en dur.",
    ],
  };
}

/* --------------------------------------------------------------- validation */

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const UINT = /^[0-9]+$/;

function parseBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return null;
}

const USAGE = {
  route: "GET /route",
  params: {
    currency0: "adresse (obligatoire). L'ordre des deux jetons est indifferent pour trouver la paire.",
    currency1: "adresse (obligatoire).",
    amount: "taille en wei (optionnel). Entier decimal, strictement positif.",
    zeroForOne:
      "sens (optionnel : true|false|1|0). Sans lui, le sens est deduit de l'ordre des arguments.",
  },
  example: "/route?currency0=0x0000000000000000000000000000000000000000&currency1=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913&amount=1000000000000000000",
};

/* ------------------------------------------------------------------ routeur */

export function createRouteRouter() {
  const router = new Hono();

  router.get("/route", (c) => {
    const q0 = c.req.query("currency0");
    const q1 = c.req.query("currency1");
    if (!q0 || !q1)
      return c.json({ error: "currency0 et currency1 sont obligatoires", usage: USAGE }, 400);
    if (!ADDR.test(q0) || !ADDR.test(q1))
      return c.json(
        { error: "adresse invalide", currency0: q0, currency1: q1, usage: USAGE },
        400,
      );
    if (q0.toLowerCase() === q1.toLowerCase())
      return c.json({ error: "currency0 et currency1 sont identiques : il n'y a pas de paire", usage: USAGE }, 400);

    const rawAmount = c.req.query("amount");
    let amount: string | null = null;
    if (rawAmount !== undefined && rawAmount !== "") {
      // On refuse plutot que d'ignorer : une taille silencieusement jetee ferait
      // repondre a une autre question que celle posee.
      if (!UINT.test(rawAmount))
        return c.json({ error: "amount doit etre un entier decimal en wei", amount: rawAmount, usage: USAGE }, 400);
      if (BigInt(rawAmount) === 0n)
        return c.json({ error: "amount doit etre strictement positif", amount: rawAmount, usage: USAGE }, 400);
      amount = rawAmount;
    }

    const rawDir = c.req.query("zeroForOne");
    let zeroForOne: boolean | null = null;
    if (rawDir !== undefined && rawDir !== "") {
      zeroForOne = parseBool(rawDir);
      if (zeroForOne === null)
        return c.json({ error: "zeroForOne doit valoir true|false|1|0", zeroForOne: rawDir, usage: USAGE }, 400);
    }

    const index = loadPairIndex();
    const census = loadCensus();
    const answer = buildRouteAnswer(
      { currency0: q0, currency1: q1, amount, zeroForOne },
      index,
      census,
    );
    return c.json(answer, 200);
  });

  return router;
}
