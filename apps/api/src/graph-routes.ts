/**
 * Le graphe TARE, servi par HTTP.
 *
 * engine/tare/graph/ construit un MultiDiGraph (hooks, bytecodes, pools, tokens,
 * deployeurs, mesures, fiches de registre) et l'ecrit dans graph.json. Ce module le
 * LIT et rejoue les memes traversees que engine/tare/graph/queries.py, en
 * TypeScript, pour ne pas payer un processus Python par requete.
 *
 * Deux regles de construction, et elles ne sont pas cosmetiques.
 *
 * 1. LE GRAPHE EST CHARGE UNE FOIS.
 *    C'est le bug de cobol-explorer (server/api/app.py:157) : chaque appel HTTP y
 *    reconstruisait l'outil de graphe — 102 ms de CPU brules pour servir une requete
 *    qui en coute 0,09. Ici le fichier est memorise par (chemin, mtime_ns, taille) :
 *    le reecrire invalide l'entree tout seul, y toucher sans le modifier ne coute
 *    rien. Et les agregats qui balaient tous les noeuds (clones, orphelins,
 *    contradictions, desaccords) sont calcules a la premiere demande puis gardes.
 *    `graphCacheStats()` expose hits/misses pour que le test le PROUVE.
 *
 * 2. AUCUNE ROUTE N'INVENTE UN NOMBRE.
 *    Un graphe absent rend 503, jamais `{"n_orphans": 0}`. Un hook inconnu rend 404
 *    avec un statut, jamais `{"twins": []}` — "pas lu" n'est pas "pas de clone". Les
 *    bps ne sont jamais recalcules ici : ils viennent des noeuds Measurement, avec
 *    leur etiquette (MEASURED | INTERPOLATED | NOT_MEASURABLE | NOT_QUOTABLE) et le
 *    compte de chacune, pour qu'un "0 bps" ne se confonde pas avec "on n'a pas su
 *    coter".
 *
 * La parite avec queries.py est verifiee requete par requete contre des sorties
 * produites par la CLI Python (test/fixtures/graph-python/, voir test/graph.test.ts).
 * Si les deux divergent, le test casse.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ENGINE_DIR } from "./paths.js";

/* ------------------------------------------------------------------- schema */

export const NodeKind = {
  HOOK: "Hook",
  BYTECODE: "Bytecode",
  POOL: "Pool",
  TOKEN: "Token",
  DEPLOYER: "Deployer",
  MEASUREMENT: "Measurement",
  REGISTRY_ENTRY: "RegistryEntry",
} as const;

export const EdgeKind = {
  ATTACHED_TO: "ATTACHED_TO",
  HOLDS: "HOLDS",
  DEPLOYED_BY: "DEPLOYED_BY",
  HAS_BYTECODE: "HAS_BYTECODE",
  MEASURED_AS: "MEASURED_AS",
  LISTED_IN: "LISTED_IN",
} as const;

/** Les quatre etiquettes d'honnetete du moteur. Jamais promues, jamais inventees. */
export const LABELS = ["MEASURED", "INTERPOLATED", "NOT_MEASURABLE", "NOT_QUOTABLE"] as const;

export const DEFAULT_CHAIN = 8453;

/**
 * Un hook "a ~0 bps" : sous ce seuil, le prelevement n'est pas distinguable du bruit
 * d'arrondi du quoter. Meme seuil que le sweep (n_gt_1bps) et que queries.FLAT_BPS.
 */
export const FLAT_BPS = 1.0;

export const DEFAULT_GRAPH_PATH = resolve(ENGINE_DIR, "tare", "graph", "data", "graph.json");

/**
 * Le separateur des cles composites (aretes, entrees de cache). NUL, parce que
 * c'est le seul octet qui ne peut apparaitre ni dans un chemin de fichier ni dans
 * un identifiant de noeud : un espace, lui, le peut.
 */
const SEP = "\u0000";

type Attrs = Record<string, unknown>;

export interface GraphNode {
  id: string;
  kind: string;
  label: string | null;
  attrs: Attrs;
}

export interface GraphEdge {
  src: string;
  dst: string;
  kind: string;
  evidence?: Attrs;
}

export interface GraphFile {
  meta?: Attrs;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/* --------------------------------------------------------------- utilitaires */

/**
 * L'ordre de `sorted()` en Python : comparaison par point de code, pas par locale.
 * `localeCompare` rangerait '#' et '0' autrement et la parite avec queries.py
 * sauterait sur les identifiants de fiches (reg:…#0, reg:…#1).
 */
export function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedUnique(xs: string[]): string[] {
  return [...new Set(xs)].sort(cmpStr);
}

/** Python rend None pour une cle absente, JS rend undefined. On aligne sur null. */
function orNull<T>(v: T | undefined): T | null {
  return v === undefined ? null : v;
}

function sameValue(a: unknown, b: unknown): boolean {
  const x = orNull(a);
  const y = orNull(b);
  if (x === y) return true;
  if (x === null || y === null) return false;
  if (typeof x === "object" || typeof y === "object") return JSON.stringify(x) === JSON.stringify(y);
  return false;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** hook_id() de schema.py : 'hook:8453:0xabc…', adresse minusculee. */
export function hookId(chainId: number, address: string): string {
  const a = (address ?? "").trim().toLowerCase();
  return `hook:${Math.trunc(chainId)}:${a.startsWith("0x") ? a : "0x" + a}`;
}

/* --------------------------------------------------------------------- store */

export interface BpsProfile {
  n: number;
  by_label: Record<string, number>;
  n_measured: number;
  bps_min: number | null;
  bps_max: number | null;
  bps_median: number | null;
  flat: boolean | null;
}

/**
 * Un graphe et ses agregats. Immuable du point de vue de l'appelant : deux demandes
 * du meme agregat rendent le meme objet, calcule une seule fois.
 */
export class GraphStore {
  readonly meta: Attrs;
  readonly source: string;
  readonly nEdges: number;

  private readonly nodes = new Map<string, GraphNode>();
  /** id -> sorte d'arete -> voisins. Construit une fois, au chargement. */
  private readonly out = new Map<string, Map<string, string[]>>();
  private readonly inc = new Map<string, Map<string, string[]>>();
  /** src \0 dst \0 kind -> evidence. Une seule arete par triplet (build.build_graph). */
  private readonly ev = new Map<string, Attrs>();
  /** l'ordre du fichier, qui est l'ordre d'insertion de networkx (build.to_json trie par id) */
  private readonly order: string[] = [];
  private readonly memo = new Map<string, unknown>();

  constructor(file: GraphFile, source: string) {
    this.meta = { ...(file.meta ?? {}) };
    this.source = source;

    for (const n of file.nodes) {
      if (!this.nodes.has(n.id)) this.order.push(n.id);
      this.nodes.set(n.id, {
        id: n.id,
        kind: n.kind,
        label: n.label ?? null,
        attrs: n.attrs ?? {},
      });
    }

    const push = (m: Map<string, Map<string, string[]>>, key: string, kind: string, v: string) => {
      let byKind = m.get(key);
      if (!byKind) {
        byKind = new Map();
        m.set(key, byKind);
      }
      const arr = byKind.get(kind);
      if (arr) arr.push(v);
      else byKind.set(kind, [v]);
    };

    let edges = 0;
    for (const e of file.edges) {
      edges += 1;
      push(this.out, e.src, e.kind, e.dst);
      push(this.inc, e.dst, e.kind, e.src);
      this.ev.set(`${e.src}${SEP}${e.dst}${SEP}${e.kind}`, e.evidence ?? {});
    }
    this.nEdges = edges;
  }

  private once<T>(key: string, fn: () => T): T {
    if (!this.memo.has(key)) this.memo.set(key, fn());
    return this.memo.get(key) as T;
  }

  /* -- primitives --------------------------------------------------------- */

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  node(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  attrs(id: string): Attrs {
    return this.nodes.get(id)?.attrs ?? {};
  }

  label(id: string): string | null {
    return this.nodes.get(id)?.label ?? null;
  }

  outOf(id: string, kind: string): string[] {
    return this.out.get(id)?.get(kind) ?? [];
  }

  inOf(id: string, kind: string): string[] {
    return this.inc.get(id)?.get(kind) ?? [];
  }

  /** L'evidence d'une arete : d'ou vient cette relation, et a quel bloc. */
  evidence(src: string, dst: string, kind: string): Attrs {
    return this.ev.get(`${src}${SEP}${dst}${SEP}${kind}`) ?? {};
  }

  /** Les noeuds d'une sorte, dans l'ordre du fichier. */
  *ofKind(kind: string): Generator<GraphNode> {
    for (const id of this.order) {
      const n = this.nodes.get(id)!;
      if (n.kind === kind) yield n;
    }
  }

  /**
   * Accepte 'hook:8453:0x..' ou simplement '0x..'. Rend null si le hook n'est pas
   * dans le graphe — jamais un noeud vide qui ressemblerait a un hook sans pool.
   */
  resolve(ref: string, chainId: number = DEFAULT_CHAIN): string | null {
    const r = (ref ?? "").trim();
    if (this.nodes.has(r)) return r;
    if (r.startsWith("0x")) {
      const candidate = hookId(chainId, r);
      if (this.nodes.has(candidate)) return candidate;
      const low = r.toLowerCase();
      for (const n of this.ofKind(NodeKind.HOOK)) {
        if (n.attrs["address"] === low) return n.id;
      }
    }
    return null;
  }

  /* -- mesures ------------------------------------------------------------ */

  poolsOf(hookNode: string): string[] {
    return sortedUnique(this.outOf(hookNode, EdgeKind.ATTACHED_TO));
  }

  measurementsOfPool(poolNode: string): string[] {
    return sortedUnique(this.outOf(poolNode, EdgeKind.MEASURED_AS));
  }

  /**
   * Le profil d'un paquet de mesures, etiquettes comprises. `bps_max` n'existe que
   * s'il y a au moins une mesure MEASURED : sinon il vaut null, JAMAIS 0.
   */
  bpsProfile(measurementNodes: string[]): BpsProfile {
    const byLabel: Record<string, number> = {};
    for (const l of LABELS) byLabel[l] = 0;
    const values: number[] = [];
    for (const m of measurementNodes) {
      const a = this.attrs(m);
      const lab = str(a["label"]);
      if (lab !== null && lab in byLabel) byLabel[lab] = (byLabel[lab] ?? 0) + 1;
      const bps = num(a["bps"]);
      if (lab === "MEASURED" && bps !== null) values.push(bps);
    }
    values.sort((x, y) => x - y);
    return {
      n: measurementNodes.length,
      by_label: byLabel,
      n_measured: values.length,
      bps_min: values.length ? values[0]! : null,
      bps_max: values.length ? values[values.length - 1]! : null,
      bps_median: values.length ? values[Math.floor(values.length / 2)]! : null,
      flat: values.length ? values.every((v) => v <= FLAT_BPS) : null,
    };
  }

  /* -- bytecode ----------------------------------------------------------- */

  bytecodeOf(hookNode: string): string | null {
    const codes = this.outOf(hookNode, EdgeKind.HAS_BYTECODE).slice().sort(cmpStr);
    return codes.length ? codes[0]! : null;
  }

  /**
   * Les clones : les autres hooks dont eth_getCode rend exactement le meme bytecode.
   * Passe par le noeud Bytecode en etoile — une lecture des arcs entrants d'un seul
   * noeud, pas un parcours de tous les hooks.
   */
  twins(ref: string, chainId: number = DEFAULT_CHAIN): Record<string, unknown> {
    const h = this.resolve(ref, chainId);
    if (h === null) return { hook: ref, found: false, status: "UNKNOWN_HOOK", twins: [] };
    const a = this.attrs(h);
    const c = this.bytecodeOf(h);
    if (c === null) {
      // "pas lu" n'est pas "pas de clone".
      return {
        hook: h,
        found: true,
        status: str(a["bytecode_status"]) ?? "UNAVAILABLE",
        reason: str(a["bytecode_reason"]) ?? "aucun bytecode dans le graphe pour ce hook",
        code_hash: null,
        twins: [],
      };
    }
    const siblings = sortedUnique(this.inOf(c, EdgeKind.HAS_BYTECODE)).filter((x) => x !== h);
    return {
      hook: h,
      found: true,
      status: "CODE",
      code_hash: orNull(this.attrs(c)["code_hash"]),
      code_size: orNull(this.attrs(c)["code_size"]),
      n_twins: siblings.length,
      twins: siblings.map((t) => ({
        id: t,
        address: orNull(this.attrs(t)["address"]),
        label: this.label(t),
        n_pools: this.poolsOf(t).length,
      })),
    };
  }

  /** Tous les groupes de clones du graphe, tries du plus gros au plus petit. */
  clusters(minSize = 2): Array<Record<string, unknown>> {
    const all = this.once("clusters", () => {
      const rows: Array<Record<string, unknown>> = [];
      for (const n of this.ofKind(NodeKind.BYTECODE)) {
        const members = sortedUnique(this.inOf(n.id, EdgeKind.HAS_BYTECODE));
        if (members.length < 2) continue;
        rows.push({
          code_hash: orNull(n.attrs["code_hash"]),
          code_size: orNull(n.attrs["code_size"]),
          n_hooks: members.length,
          hooks: members.map((m) => orNull(this.attrs(m)["address"])),
          n_pools: members.reduce((s, m) => s + this.poolsOf(m).length, 0),
        });
      }
      return rows.sort(
        (x, y) =>
          (y["n_hooks"] as number) - (x["n_hooks"] as number) ||
          cmpStr((x["code_hash"] as string) ?? "", (y["code_hash"] as string) ?? ""),
      );
    });
    return all.filter((c) => (c["n_hooks"] as number) >= minSize);
  }

  /* -- deployeur ---------------------------------------------------------- */

  /**
   * adresse -> les noeuds Deployer qui la portent, un par chaine. Un EOA garde la
   * meme adresse sur toutes les chaines EVM, mais ce n'est PAS le meme compte : les
   * noeuds restent separes par chaine, et c'est cet index — et lui seul — qui
   * autorise a les rapprocher explicitement.
   */
  deployersByAddress(): Map<string, string[]> {
    return this.once("dep_index", () => {
      const idx = new Map<string, string[]>();
      for (const n of this.ofKind(NodeKind.DEPLOYER)) {
        const a = str(n.attrs["address"]);
        if (!a) continue;
        const cur = idx.get(a);
        if (cur) cur.push(n.id);
        else idx.set(a, [n.id]);
      }
      for (const [k, v] of idx) idx.set(k, v.slice().sort(cmpStr));
      return idx;
    });
  }

  /**
   * Les hooks qui partagent un deployeur avec celui-ci. Un deployeur est soit l'EOA
   * qui a signe la tx de creation (mirror), soit celui que la fiche de registre
   * declare — les deux sources sont citees, jamais melangees.
   */
  deployerCluster(ref: string, chainId: number = DEFAULT_CHAIN): Record<string, unknown> {
    const h = this.resolve(ref, chainId);
    if (h === null) return { hook: ref, found: false, status: "UNKNOWN_HOOK", deployers: [] };
    const a = this.attrs(h);
    const deployers = sortedUnique(this.outOf(h, EdgeKind.DEPLOYED_BY));
    if (deployers.length === 0) {
      return {
        hook: h,
        found: true,
        status: str(a["deployer_status"]) ?? "UNAVAILABLE",
        reason: str(a["deployer_reason"]) ?? "aucun deployeur connu pour ce hook",
        deployers: [],
        siblings: [],
      };
    }
    const idx = this.deployersByAddress();
    const rows: Array<Record<string, unknown>> = [];
    const siblings = new Set<string>();
    const cross = new Set<string>();
    for (const d of deployers) {
      const members = sortedUnique(this.inOf(d, EdgeKind.DEPLOYED_BY)).filter((x) => x !== h);
      for (const m of members) siblings.add(m);
      for (const other of idx.get(str(this.attrs(d)["address"]) ?? "") ?? []) {
        if (other !== d) for (const x of this.inOf(other, EdgeKind.DEPLOYED_BY)) cross.add(x);
      }
      // La source de la relation : le mirror (tx de creation) ou la fiche de
      // registre. Les deux sont citees, jamais melangees.
      const source = str(this.evidence(h, d, EdgeKind.DEPLOYED_BY)["source"]);
      rows.push({
        deployer: orNull(this.attrs(d)["address"]),
        id: d,
        sources: source === null ? [] : [source],
        n_siblings: members.length,
      });
    }
    for (const s of siblings) cross.delete(s);
    cross.delete(h);
    const sib = [...siblings].sort(cmpStr);
    const cro = [...cross].sort(cmpStr);
    return {
      hook: h,
      found: true,
      status: "CODE",
      factory: orNull(a["factory"]),
      creation_block: orNull(a["creation_block"]),
      deployers: rows,
      siblings: sib.map((s) => ({
        id: s,
        address: orNull(this.attrs(s)["address"]),
        label: this.label(s),
        n_pools: this.poolsOf(s).length,
      })),
      // Meme adresse de deployeur, autre chaine. Rapproche, jamais fusionne.
      n_cross_chain_siblings: cro.length,
      cross_chain_siblings: cro.map((s) => ({
        id: s,
        address: orNull(this.attrs(s)["address"]),
        chain_id: orNull(this.attrs(s)["chain_id"]),
        label: this.label(s),
      })),
    };
  }

  /* -- impact ------------------------------------------------------------- */

  /**
   * Le rayon de souffle d'un hook.
   *
   * Direct   : les pools auxquels il est attache, les tokens que ces pools
   *            detiennent, les mesures prises dessus.
   * Indirect : les hooks au MEME bytecode et les pools qu'ils portent — si le defaut
   *            est dans le code, il est deja deploye ailleurs — puis les hooks du
   *            meme deployeur.
   *
   * `pools_at_risk` additionne pools directs et pools des clones, sans doublon. Il ne
   * dit pas "ces pools sont fautifs" : il dit "voici ce qu'il faudrait re-mesurer".
   */
  impact(ref: string, chainId: number = DEFAULT_CHAIN): Record<string, unknown> {
    const h = this.resolve(ref, chainId);
    if (h === null) return { hook: ref, found: false, status: "UNKNOWN_HOOK" };

    const directPools = this.poolsOf(h);
    const tokens = new Set<string>();
    const meas: string[] = [];
    for (const p of directPools) {
      for (const t of this.outOf(p, EdgeKind.HOLDS)) tokens.add(t);
      meas.push(...this.measurementsOfPool(p));
    }

    const tw = this.twins(h, chainId);
    const twinIds = ((tw["twins"] as Array<{ id: string }>) ?? []).map((t) => t.id);
    const twinPools = sortedUnique(twinIds.flatMap((t) => this.poolsOf(t)));

    const dc = this.deployerCluster(h, chainId);
    const siblingIds = ((dc["siblings"] as Array<{ id: string }>) ?? []).map((s) => s.id);
    const siblingPools = sortedUnique(siblingIds.flatMap((s) => this.poolsOf(s)));

    const entries = sortedUnique(this.outOf(h, EdgeKind.LISTED_IN));
    const atRisk = sortedUnique([...directPools, ...twinPools]);

    return {
      hook: h,
      found: true,
      address: orNull(this.attrs(h)["address"]),
      label: this.label(h),
      pools: directPools,
      n_pools: directPools.length,
      tokens: [...tokens].map((t) => str(this.attrs(t)["address"]) ?? "").sort(cmpStr),
      n_tokens: tokens.size,
      measurements: this.bpsProfile(meas),
      bytecode: {
        status: tw["status"],
        code_hash: orNull(tw["code_hash"]),
        n_twins: tw["n_twins"] ?? 0,
        twins: ((tw["twins"] as Array<{ address: string | null }>) ?? []).map((t) => t.address),
      },
      twin_pools: twinPools,
      n_twin_pools: twinPools.length,
      deployer: {
        status: dc["status"],
        deployers: ((dc["deployers"] as Array<{ deployer: string | null }>) ?? []).map(
          (d) => d.deployer,
        ),
        n_siblings: siblingIds.length,
        siblings: ((dc["siblings"] as Array<{ address: string | null }>) ?? []).map(
          (s) => s.address,
        ),
      },
      sibling_pools: siblingPools,
      registry_entries: entries,
      n_registry_entries: entries.length,
      pools_at_risk: atRisk,
      n_pools_at_risk: atRisk.length,
    };
  }

  /* -- orphelins ---------------------------------------------------------- */

  /**
   * Les hooks que le registre liste et auxquels aucun pool liquide n'est attache.
   * Restreint a UNE chaine, et pas par confort : la campagne de mesure n'a couvert
   * que Base. Ailleurs, l'absence de pool dans le graphe ne veut rien dire, et les
   * compter en orphelins serait un mensonge de couverture. `scope` porte cette
   * restriction dans la reponse.
   */
  orphans(chainId: number = DEFAULT_CHAIN): Record<string, unknown> {
    return this.once(`orphans:${chainId}`, () => {
      let nListed = 0;
      const orphan: Array<Record<string, unknown>> = [];
      for (const n of this.ofKind(NodeKind.HOOK)) {
        if (num(n.attrs["chain_id"]) !== chainId) continue;
        if (this.outOf(n.id, EdgeKind.LISTED_IN).length === 0) continue; // hors registre : hors sujet
        nListed += 1;
        if (this.poolsOf(n.id).length === 0) {
          orphan.push({
            id: n.id,
            address: orNull(n.attrs["address"]),
            label: n.label,
            bytecode_status: str(n.attrs["bytecode_status"]) ?? "UNAVAILABLE",
            code_size: orNull(n.attrs["code_size"]),
          });
        }
      }
      return {
        scope: `chain_id=${chainId}, pools connus = ceux de docs/dataset/measurements.jsonl`,
        n_listed: nListed,
        n_orphans: orphan.length,
        orphans: orphan.sort((a, b) =>
          cmpStr((a["address"] as string) ?? "", (b["address"] as string) ?? ""),
        ),
      };
    });
  }

  /* -- contradictions ----------------------------------------------------- */

  /**
   * Les hooks que le registre decrit DEUX fois, et pas pareil.
   *
   * C'est la requete qui justifie que RegistryEntry soit un noeud : si les fiches
   * etaient des attributs du Hook, la seconde aurait ecrase la premiere au
   * chargement et cette liste serait vide.
   */
  contradictions(): Record<string, unknown> {
    return this.once("contradictions", () => {
      const diffMaps = (a: Attrs, b: Attrs): Record<string, [unknown, unknown]> => {
        const out: Record<string, [unknown, unknown]> = {};
        for (const k of sortedUnique([...Object.keys(a), ...Object.keys(b)])) {
          if (!sameValue(a[k], b[k])) out[k] = [orNull(a[k]), orNull(b[k])];
        }
        return out;
      };
      const IDENTITY = ["name", "declared_deployer", "verifiedSource", "auditUrl"] as const;
      const pick = (o: Attrs): Attrs =>
        Object.fromEntries(IDENTITY.map((k) => [k, orNull(o[k])])) as Attrs;

      const rows: Array<Record<string, unknown>> = [];
      let nMulti = 0;
      for (const n of this.ofKind(NodeKind.HOOK)) {
        const entries = this.outOf(n.id, EdgeKind.LISTED_IN).slice().sort(cmpStr);
        if (entries.length < 2) continue;
        nMulti += 1;
        const ea = entries.map((e) => this.attrs(e));
        const pairs: Array<Record<string, unknown>> = [];
        for (let i = 0; i < ea.length - 1; i++) {
          const x = ea[i]!;
          const y = ea[i + 1]!;
          const diff = {
            flags: diffMaps((x["flags"] as Attrs) ?? {}, (y["flags"] as Attrs) ?? {}),
            properties: diffMaps((x["properties"] as Attrs) ?? {}, (y["properties"] as Attrs) ?? {}),
            identity: diffMaps(pick(x), pick(y)),
          };
          if (Object.values(diff).some((d) => Object.keys(d).length > 0))
            pairs.push({ entries: [entries[i], entries[i + 1]], diff });
        }
        if (pairs.length === 0) continue;
        const fields = new Set<string>();
        for (const p of pairs) {
          for (const [sec, dd] of Object.entries(p["diff"] as Record<string, Attrs>)) {
            for (const k of Object.keys(dd)) fields.add(`${sec}.${k}`);
          }
        }
        rows.push({
          id: n.id,
          address: orNull(n.attrs["address"]),
          chain_id: orNull(n.attrs["chain_id"]),
          names: ea.map((e) => orNull(e["name"])),
          n_entries: entries.length,
          divergences: pairs,
          fields: [...fields].sort(cmpStr),
        });
      }
      rows.sort(
        (a, b) =>
          ((a["chain_id"] as number) ?? 0) - ((b["chain_id"] as number) ?? 0) ||
          cmpStr((a["address"] as string) ?? "", (b["address"] as string) ?? ""),
      );
      return {
        n_hooks_with_multiple_entries: nMulti,
        n_contradictory: rows.length,
        contradictions: rows,
      };
    });
  }

  /* -- desaccord ---------------------------------------------------------- */

  /**
   * La ou le registre et la mesure ne disent pas la meme chose.
   *
   * `registry_says_active_measure_says_flat` : au moins une fiche declare
   *   vanillaSwap=false (le hook touche au swap) et TOUTES les mesures MEASURED du
   *   hook sont sous flat_bps.
   * `registry_says_vanilla_measure_says_active` : la fiche declare vanillaSwap=true
   *   et la mesure trouve plus que flat_bps. C'est le sens qui coute de l'argent a
   *   un LP.
   *
   * Un hook sans aucune mesure MEASURED n'apparait dans aucune des deux listes. Il
   * apparait dans `not_comparable`, avec le compte de ses etiquettes.
   */
  disagreement(
    chainId: number = DEFAULT_CHAIN,
    flatBps: number = FLAT_BPS,
  ): Record<string, unknown> {
    return this.once(`disagreement:${chainId}:${flatBps}`, () => {
      const active: Array<Record<string, unknown>> = [];
      const vanilla: Array<Record<string, unknown>> = [];
      const skipped: Array<Record<string, unknown>> = [];
      for (const n of this.ofKind(NodeKind.HOOK)) {
        if (num(n.attrs["chain_id"]) !== chainId) continue;
        const declared = this.declaredVanilla(n.id);
        if (declared === null || declared.length === 0) continue;
        const pools = this.poolsOf(n.id);
        const prof = this.bpsProfile(pools.flatMap((p) => this.measurementsOfPool(p)));
        const row: Record<string, unknown> = {
          id: n.id,
          address: orNull(n.attrs["address"]),
          label: n.label,
          vanillaSwap_declared: declared,
          n_pools: pools.length,
          profile: prof,
        };
        if (prof.n_measured === 0) {
          const counted = Object.entries(prof.by_label)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ");
          // Python : `("aucune mesure MEASURED : " + counted) or "aucune mesure du tout"` —
          // la concatenation n'est jamais vide, donc le membre droit ne sert jamais.
          row["reason"] = `aucune mesure MEASURED : ${counted}`;
          skipped.push(row);
          continue;
        }
        if (declared.some((v) => v === false) && prof.bps_max! <= flatBps) active.push(row);
        if (declared.some((v) => v === true) && prof.bps_max! > flatBps) vanilla.push(row);
      }
      const byAddr = (a: Record<string, unknown>, b: Record<string, unknown>) =>
        cmpStr((a["address"] as string) ?? "", (b["address"] as string) ?? "");
      return {
        chain_id: chainId,
        flat_bps: flatBps,
        n_registry_says_active_measure_says_flat: active.length,
        registry_says_active_measure_says_flat: active.sort(byAddr),
        n_registry_says_vanilla_measure_says_active: vanilla.length,
        registry_says_vanilla_measure_says_active: vanilla.sort(byAddr),
        n_not_comparable: skipped.length,
        not_comparable: skipped.sort(byAddr),
      };
    });
  }

  /** Les vanillaSwap declares par les fiches d'un hook, dans l'ordre des fiches. */
  private declaredVanilla(hookNode: string): boolean[] | null {
    const entries = this.outOf(hookNode, EdgeKind.LISTED_IN).slice().sort(cmpStr);
    if (entries.length === 0) return null;
    return entries
      .map((e) => ((this.attrs(e)["properties"] as Attrs) ?? {})["vanillaSwap"])
      .filter((v): v is boolean => typeof v === "boolean");
  }

  /**
   * Le desaccord d'UN hook. Six verdicts, et aucun n'est un nombre :
   * NO_SUCH_HOOK, NO_REGISTRY_ENTRY, NO_VANILLA_DECLARED, NOT_COMPARABLE,
   * REGISTRY_SAYS_ACTIVE_MEASURE_SAYS_FLAT, REGISTRY_SAYS_VANILLA_MEASURE_SAYS_ACTIVE,
   * AGREE. C'est ce que la fiche web affiche : un desaccord se lit, il ne se calcule
   * pas dans le navigateur.
   */
  hookDisagreement(
    ref: string,
    chainId: number = DEFAULT_CHAIN,
    flatBps: number = FLAT_BPS,
  ): Record<string, unknown> {
    const h = this.resolve(ref, chainId);
    if (h === null) return { hook: ref, found: false, verdict: "NO_SUCH_HOOK" };
    const a = this.attrs(h);
    const entries = this.outOf(h, EdgeKind.LISTED_IN).slice().sort(cmpStr);
    const pools = this.poolsOf(h);
    const profile = this.bpsProfile(pools.flatMap((p) => this.measurementsOfPool(p)));
    const base = {
      hook: h,
      found: true,
      address: orNull(a["address"]),
      label: this.label(h),
      chain_id: orNull(a["chain_id"]),
      flat_bps: flatBps,
      n_pools: pools.length,
      profile,
      registry_entries: entries,
      n_registry_entries: entries.length,
    };
    if (entries.length === 0)
      return {
        ...base,
        verdict: "NO_REGISTRY_ENTRY",
        vanillaSwap_declared: [],
        note: "aucune fiche au registre officiel charge : il n'y a rien a contredire. Ce n'est pas un accord.",
      };
    const declared = this.declaredVanilla(h) ?? [];
    if (declared.length === 0)
      return {
        ...base,
        verdict: "NO_VANILLA_DECLARED",
        vanillaSwap_declared: [],
        note: "la fiche ne declare pas vanillaSwap : il n'y a rien a comparer a la mesure.",
      };
    if (profile.n_measured === 0)
      return {
        ...base,
        verdict: "NOT_COMPARABLE",
        vanillaSwap_declared: declared,
        note: "aucune mesure MEASURED sur ce hook : une lecture bornee est un NOT_MEASURABLE, jamais un zero.",
      };
    if (declared.some((v) => v === false) && profile.bps_max! <= flatBps)
      return {
        ...base,
        verdict: "REGISTRY_SAYS_ACTIVE_MEASURE_SAYS_FLAT",
        vanillaSwap_declared: declared,
        note: `le registre declare vanillaSwap=false (le hook touche au swap) mais les ${profile.n_measured} mesures MEASURED plafonnent a ${profile.bps_max} bps, sous le seuil de ${flatBps} bps.`,
      };
    if (declared.some((v) => v === true) && profile.bps_max! > flatBps)
      return {
        ...base,
        verdict: "REGISTRY_SAYS_VANILLA_MEASURE_SAYS_ACTIVE",
        vanillaSwap_declared: declared,
        note: `le registre declare vanillaSwap=true (swap intact) mais la mesure trouve jusqu'a ${profile.bps_max} bps. C'est le sens qui coute de l'argent a un LP.`,
      };
    return {
      ...base,
      verdict: "AGREE",
      vanillaSwap_declared: declared,
      note: "registre et mesure disent la meme chose a ce bloc, pour ces tailles et ces sens.",
    };
  }

  /* -- resume ------------------------------------------------------------- */

  hookSummary(ref: string, chainId: number = DEFAULT_CHAIN): Record<string, unknown> {
    const h = this.resolve(ref, chainId);
    if (h === null) return { hook: ref, found: false };
    const a = this.attrs(h);
    const pools = this.poolsOf(h);
    const meas = pools.flatMap((p) => this.measurementsOfPool(p));
    const entries = sortedUnique(this.outOf(h, EdgeKind.LISTED_IN));
    let worst: string | null = null;
    for (const m of meas) {
      const ma = this.attrs(m);
      const bps = num(ma["bps"]);
      if (ma["label"] !== "MEASURED" || bps === null) continue;
      if (worst === null || bps > num(this.attrs(worst)["bps"])!) worst = m;
    }
    return {
      hook: h,
      found: true,
      address: orNull(a["address"]),
      label: this.label(h),
      chain_id: orNull(a["chain_id"]),
      address_flags: orNull(a["address_flags"]),
      n_pools: pools.length,
      profile: this.bpsProfile(meas),
      worst_measurement: worst === null ? null : this.attrs(worst),
      registry_names: entries.map((e) => orNull(this.attrs(e)["name"])),
      n_registry_entries: entries.length,
      bytecode: {
        status: str(a["bytecode_status"]) ?? "UNAVAILABLE",
        code_size: orNull(a["code_size"]),
      },
      deployer: {
        status: str(a["deployer_status"]) ?? "UNAVAILABLE",
        factory: orNull(a["factory"]),
        creation_block: orNull(a["creation_block"]),
      },
    };
  }

  stats(): Record<string, unknown> {
    return this.once("stats", () => {
      const kinds: Record<string, number> = {};
      for (const id of this.order) {
        const k = this.nodes.get(id)!.kind || "UNKNOWN";
        kinds[k] = (kinds[k] ?? 0) + 1;
      }
      const ekinds: Record<string, number> = {};
      for (const [, byKind] of this.out) {
        for (const [k, v] of byKind) ekinds[k] = (ekinds[k] ?? 0) + v.length;
      }
      const sortObj = (o: Record<string, number>) =>
        Object.fromEntries(Object.entries(o).sort((a, b) => cmpStr(a[0], b[0])));
      return {
        nodes: this.order.length,
        edges: this.nEdges,
        by_node_kind: sortObj(kinds),
        by_edge_kind: sortObj(ekinds),
      };
    });
  }
}

/* ----------------------------------------------------------------- le cache */

const CACHE = new Map<string, GraphStore>();
const STATS = { hits: 0, misses: 0 };

export function graphCacheStats(): { hits: number; misses: number; entries: number } {
  return { ...STATS, entries: CACHE.size };
}

/** Vide le cache. Rend le nombre d'entrees retirees. */
export function invalidateGraph(path?: string): number {
  if (path === undefined) {
    const n = CACHE.size;
    CACHE.clear();
    return n;
  }
  const target = resolve(path);
  let n = 0;
  for (const k of [...CACHE.keys()]) {
    if (k.startsWith(target + SEP)) {
      CACHE.delete(k);
      n += 1;
    }
  }
  return n;
}

export class GraphUnavailable extends Error {
  constructor(
    readonly path: string,
    readonly detail: string,
  ) {
    super(detail);
    this.name = "GraphUnavailable";
  }
}

export const BUILD_COMMAND = "PYTHONPATH=engine python3 -m tare.graph.cli build";

/**
 * Charge graph.json — ou le rend depuis le cache s'il n'a pas bouge. La cle inclut
 * mtime_ns et taille : reecrire le fichier invalide l'entree tout seul, le relire
 * sans l'avoir touche ne coute rien.
 */
export function loadGraphStore(path: string = DEFAULT_GRAPH_PATH): GraphStore {
  const target = resolve(path);
  let st: { mtimeNs: bigint; size: bigint };
  try {
    st = statSync(target, { bigint: true });
  } catch {
    throw new GraphUnavailable(target, `${target} absent — construis-le : ${BUILD_COMMAND}`);
  }
  const key = `${target}${SEP}${st.mtimeNs}${SEP}${st.size}`;
  const hit = CACHE.get(key);
  if (hit) {
    STATS.hits += 1;
    return hit;
  }
  let file: GraphFile;
  try {
    file = JSON.parse(readFileSync(target, "utf8")) as GraphFile;
  } catch (e) {
    throw new GraphUnavailable(
      target,
      `graph.json illisible : ${(e as Error).message.slice(0, 200)}`,
    );
  }
  if (!Array.isArray(file.nodes) || !Array.isArray(file.edges))
    throw new GraphUnavailable(
      target,
      "graph.json sans 'nodes'/'edges' : ce n'est pas un graphe TARE",
    );
  const store = new GraphStore(file, target);
  STATS.misses += 1;
  CACHE.set(key, store);
  return store;
}

/* ------------------------------------------------------------------ routes */

const ADDR = /^0x[0-9a-fA-F]{40}$/;

export interface GraphRouterOptions {
  /** chemin de graph.json ; a defaut TARE_GRAPH_PATH, puis engine/tare/graph/data/ */
  graphPath?: string;
  chainId?: number;
}

export function graphPathFromEnv(): string {
  const p = process.env["TARE_GRAPH_PATH"];
  return p !== undefined && p !== "" ? p : DEFAULT_GRAPH_PATH;
}

/**
 * Le routeur : huit lectures, toutes servies par le meme store en cache. Aucune ne
 * reconstruit le graphe, aucune ne lance de processus Python.
 */
export function createGraphRouter(opts: GraphRouterOptions = {}) {
  const path = opts.graphPath ?? graphPathFromEnv();
  const defaultChain = opts.chainId ?? DEFAULT_CHAIN;
  const app = new Hono();

  const unavailable = (e: unknown) => ({
    error: "graphe indisponible",
    detail: e instanceof GraphUnavailable ? e.detail : String(e).slice(0, 300),
    graph_path: path,
    build: BUILD_COMMAND,
    note: "aucune liste vide n'est renvoyee : un graphe absent n'est pas un graphe sans clone, sans orphelin et sans contradiction.",
  });

  /** Provenance et cout, sur chaque reponse. Un nombre sans sa source ne vaut rien. */
  function envelope(s: GraphStore, t0: number): Record<string, unknown> {
    return {
      graph: {
        source: s.source,
        engine_ver: orNull(s.meta["engine_ver"]),
        block_number: orNull(s.meta["block_number"]),
        measurements: orNull(s.meta["measurements"]),
        hooklist: orNull(s.meta["hooklist"]),
        n_measurements: orNull(s.meta["n_measurements"]),
        n_registry_entries: orNull(s.meta["n_registry_entries"]),
        chain_cache_present: orNull(s.meta["chain_cache_present"]),
        chain_cache_fetched_at: orNull(s.meta["chain_cache_fetched_at"]),
      },
      cache: graphCacheStats(),
      took_ms: Math.round((performance.now() - t0) * 1000) / 1000,
    };
  }

  /** Le graphe, ou un 503 explicite. Jamais une liste vide qui se lirait "rien a signaler". */
  function withStore(c: Context, fn: (s: GraphStore, t0: number) => Response): Response {
    const t0 = performance.now();
    let s: GraphStore;
    try {
      s = loadGraphStore(path);
    } catch (e) {
      return c.json(unavailable(e), 503);
    }
    return fn(s, t0);
  }

  const chainOf = (c: Context): number => {
    const raw = c.req.query("chain");
    const n = raw === undefined ? NaN : Number(raw);
    return Number.isInteger(n) ? n : defaultChain;
  };

  const flatOf = (c: Context): number => {
    const raw = c.req.query("flat-bps");
    const n = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : FLAT_BPS;
  };

  /* -- sommaire : les chiffres que le graphe revele ------------------------ */

  app.get("/graph", (c) =>
    withStore(c, (s, t0) => {
      const chain = chainOf(c);
      const orph = s.orphans(chain) as unknown as { n_listed: number; n_orphans: number };
      const contra = s.contradictions() as unknown as {
        n_hooks_with_multiple_entries: number;
        n_contradictory: number;
      };
      const dis = s.disagreement(chain) as Record<string, number>;
      const clusters = s.clusters();
      return c.json({
        ...envelope(s, t0),
        chain_id: chain,
        stats: s.stats(),
        findings: {
          clone_clusters: clusters.length,
          hooks_in_clone_clusters: clusters.reduce((n, x) => n + (x["n_hooks"] as number), 0),
          orphans: orph.n_orphans,
          listed_hooks_on_chain: orph.n_listed,
          hooks_with_multiple_registry_entries: contra.n_hooks_with_multiple_entries,
          contradictions: contra.n_contradictory,
          registry_says_active_measure_says_flat: dis["n_registry_says_active_measure_says_flat"],
          registry_says_vanilla_measure_says_active:
            dis["n_registry_says_vanilla_measure_says_active"],
          not_comparable: dis["n_not_comparable"],
        },
        routes: [
          "GET /graph/impact/:hook        le rayon de souffle : pools, tokens, clones, pools a re-mesurer",
          "GET /graph/twins/:hook         les hooks au meme bytecode",
          "GET /graph/deployer/:hook      les hooks du meme deployeur",
          "GET /graph/summary/:hook       la fiche courte d'un hook",
          "GET /graph/disagreement/:hook  registre contre mesure, pour un hook",
          "GET /graph/clusters            toutes les grappes de clones",
          "GET /graph/orphans             les hooks du registre sans pool liquide connu",
          "GET /graph/contradictions      les hooks a deux fiches de registre divergentes",
          "GET /graph/disagreement        registre contre mesure, sur toute la chaine",
        ],
      });
    }),
  );

  /* -- par hook ----------------------------------------------------------- */

  function hookRoute(
    name: string,
    fn: (s: GraphStore, hook: string, c: Context) => Record<string, unknown>,
  ) {
    app.get(`/graph/${name}/:hook`, (c) =>
      withStore(c, (s, t0) => {
        const raw = c.req.param("hook");
        if (!ADDR.test(raw))
          return c.json(
            {
              error: "adresse invalide",
              hook: raw,
              expects: "0x suivi de 40 chiffres hexadecimaux",
            },
            400,
          );
        const chain = chainOf(c);
        const r = fn(s, raw.toLowerCase(), c);
        if (r["found"] === false)
          return c.json(
            {
              ...envelope(s, t0),
              chain_id: chain,
              ...r,
              note: "ce hook n'est ni dans les mesures ni dans le registre charge, a cette chaine. Absent du graphe n'est pas 'sans clone' ni 'sans pool'.",
            },
            404,
          );
        return c.json({ ...envelope(s, t0), chain_id: chain, ...r });
      }),
    );
  }

  hookRoute("impact", (s, h, c) => s.impact(h, chainOf(c)));
  hookRoute("twins", (s, h, c) => s.twins(h, chainOf(c)));
  hookRoute("deployer", (s, h, c) => s.deployerCluster(h, chainOf(c)));
  hookRoute("summary", (s, h, c) => s.hookSummary(h, chainOf(c)));
  hookRoute("disagreement", (s, h, c) => s.hookDisagreement(h, chainOf(c), flatOf(c)));

  /* -- agregats ----------------------------------------------------------- */

  app.get("/graph/clusters", (c) =>
    withStore(c, (s, t0) => {
      const raw = Number(c.req.query("min") ?? 2);
      const min = Number.isInteger(raw) && raw >= 2 ? raw : 2;
      const cs = s.clusters(min);
      return c.json({
        ...envelope(s, t0),
        min_size: min,
        n_clusters: cs.length,
        n_hooks: cs.reduce((n, x) => n + (x["n_hooks"] as number), 0),
        clusters: cs,
        note: "meme keccak(eth_getCode) au bloc du graphe. Un clone partage le code, pas forcement l'etat ni les pools.",
      });
    }),
  );

  app.get("/graph/orphans", (c) =>
    withStore(c, (s, t0) => {
      const chain = chainOf(c);
      const r = s.orphans(chain);
      const raw = Number(c.req.query("head") ?? 0);
      const list = r["orphans"] as unknown[];
      return c.json({
        ...envelope(s, t0),
        chain_id: chain,
        ...r,
        orphans: Number.isInteger(raw) && raw > 0 ? list.slice(0, raw) : list,
        note: "sans pool liquide DANS CE GRAPHE. Les pools connus sont ceux que la campagne a mesures : une absence ici n'est pas une absence on-chain.",
      });
    }),
  );

  app.get("/graph/contradictions", (c) =>
    withStore(c, (s, t0) =>
      c.json({
        ...envelope(s, t0),
        ...s.contradictions(),
        note: "deux fiches pour le meme couple (adresse, chainId) dans le registre officiel, et elles ne disent pas la meme chose.",
      }),
    ),
  );

  app.get("/graph/disagreement", (c) =>
    withStore(c, (s, t0) =>
      c.json({
        ...envelope(s, t0),
        ...s.disagreement(chainOf(c), flatOf(c)),
        note: "vanillaSwap declare par la fiche, contre le maximum des mesures MEASURED du hook. Un hook sans mesure MEASURED n'est dans aucune des deux listes : il est dans not_comparable.",
      }),
    ),
  );

  return app;
}
