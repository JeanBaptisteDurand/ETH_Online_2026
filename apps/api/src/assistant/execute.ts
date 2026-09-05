/**
 * L'EXECUTION des actions, cote serveur.
 *
 * Le front execute les memes actions sur son tableau ; ici on les execute sur le
 * modele de lecture pour pouvoir DIRE ce qui revient. Toute grandeur qui sort de ce
 * fichier vient d'une ligne du jeu et traine son bloc, sa taille, son sens, son
 * etiquette et sa commande de rejeu.
 *
 * Deux refus explicites, qui sont le coeur de l'honnetete du produit :
 *  - un hook SANS mesure n'est jamais "sous le seuil" : il est NOT_MEASURABLE et il
 *    sort de la selection dans une liste a part, avec la raison.
 *  - une lecture partielle (`store.complete === false`) interdit toute conclusion
 *    chiffree : la reponse est etiquetee NOT_MEASURABLE.
 */
import type { Action, Filter, ColumnName } from "./actions.js";
import type { Label } from "../labels.js";
import { NEGLIGIBLE_BPS, type HookView, type PointView, type ProfileView, type StoreView } from "./store.js";
import { getGraph, type GraphView } from "./graph.js";
import { hasFlag } from "./flags.js";
import { Narration, fmtBps, type Citation } from "./narrate.js";
import type { Intent, PlanOut } from "./planner.js";
// La narration du routage relit la reponse de GET /route ; elle ne la recalcule pas.
import {
  rankedGates,
  routeFromActions,
  unrankedGates,
  type RouteAnswer,
  type RouteDeps,
  type RouteGate,
} from "./planner.js";

export const HONESTY_RULES = [
  "Le modele choisit quoi interroger et explique ce qui revient : il ne produit jamais un nombre.",
  "Quatre etiquettes, jamais promues : MEASURED | INTERPOLATED | NOT_MEASURABLE | NOT_QUOTABLE.",
  "Une lecture bornee, un timeout, un rate-limit donnent NOT_MEASURABLE — jamais une valeur, jamais un zero.",
  "Chaque valeur porte son bloc, sa taille et son sens, et se rejoue en une commande.",
];

export interface HookRow {
  hook: string;
  name: string | null;
  chain: string | null;
  chain_id: number;
  registry_available: boolean;
  in_registry: boolean | null;
  vanilla_swap: boolean | null;
  swap_access: string | null;
  audit_url: string | null;
  verified_source: boolean | null;
  deployer: string | null;
  max_bps: number | null;
  min_bps: number | null;
  max_measurement: PointView | null;
  pools: number;
  pools_measured: number;
  measurements: number;
  measured: number;
  labels: Partial<Record<Label, number>>;
  answer_label: Label;
  disagreement: HookView["disagreement"];
  flags: HookView["flags"];
  blocks: number[];
  non_flat_profiles: number;
}

export interface Withheld {
  hook: string;
  name: string | null;
  reason: string;
  label: Label;
}

export interface ExecStep {
  action: Action;
  ok: boolean;
  /** l'etiquette du resultat quand il porte des grandeurs ; null quand il n'en porte pas */
  label: Label | null;
  note: string | null;
  data: unknown;
}

export interface Execution {
  steps: ExecStep[];
  rows: HookRow[];
  /** ce qui a ete ecarte faute de mesure : jamais silencieux */
  withheld: Withheld[];
  selection: string[];
  criteria: Filter | null;
  sort: { col: ColumnName; dir: "asc" | "desc" } | null;
  columns: ColumnName[] | null;
  truncated: boolean;
  warnings: string[];
}

/* ------------------------------------------------------------------ lignes */

function answerLabel(h: HookView): Label {
  if (h.measured > 0) return "MEASURED";
  if ((h.labels.NOT_QUOTABLE ?? 0) > 0 && (h.labels.NOT_MEASURABLE ?? 0) === 0) return "NOT_QUOTABLE";
  return "NOT_MEASURABLE";
}

export function toRow(h: HookView): HookRow {
  return {
    hook: h.hook,
    name: h.registry?.name ?? null,
    chain: h.registry?.chain ?? null,
    chain_id: h.chain_id,
    registry_available: h.registry_available,
    in_registry: h.in_registry,
    vanilla_swap: h.registry?.vanilla_swap ?? null,
    swap_access: h.registry?.swap_access ?? null,
    audit_url: h.registry?.audit_url ?? null,
    verified_source: h.registry?.verified_source ?? null,
    deployer: h.registry?.deployer ?? null,
    max_bps: h.max_bps,
    min_bps: h.min_bps,
    max_measurement: h.max_measurement,
    pools: h.pools,
    pools_measured: h.pools_measured,
    measurements: h.measurements,
    measured: h.measured,
    labels: h.labels,
    answer_label: answerLabel(h),
    disagreement: h.disagreement,
    flags: h.flags,
    blocks: h.blocks,
    non_flat_profiles: h.non_flat_profiles,
  };
}

/* ------------------------------------------------------------------ filtre */

export interface FilterOutcome {
  kept: HookView[];
  withheld: Withheld[];
  criteria: Filter;
}

export function applyFilter(hooks: HookView[], f: Filter): FilterOutcome {
  const kept: HookView[] = [];
  const withheld: Withheld[] = [];
  const drop = (h: HookView, reason: string, label: Label) =>
    withheld.push({ hook: h.hook, name: h.registry?.name ?? null, reason, label });

  for (const h of hooks) {
    if (f.hook && h.hook !== f.hook) continue;
    if (f.pool && !h.profiles.some((p) => p.pool_id === f.pool)) continue;
    if (f.chain) {
      const c = (h.registry?.chain ?? "").toLowerCase();
      if (c !== f.chain.toLowerCase()) continue;
    }
    if (f.flag && !hasFlag(h.hook, f.flag)) continue;
    if (f.label && (h.labels[f.label] ?? 0) === 0) continue;
    if (f.nonFlat === true && h.non_flat_profiles === 0) continue;
    if (f.nonFlat === false && h.non_flat_profiles > 0) continue;
    if (f.search) {
      const needle = f.search.toLowerCase();
      const hay = `${h.hook} ${h.registry?.name ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    if (f.allowlisted !== undefined) {
      if (h.in_registry === null) {
        drop(h, "aucun registre charge : la presence dans la liste officielle est inconnue", "NOT_MEASURABLE");
        continue;
      }
      if (h.in_registry !== f.allowlisted) continue;
    }
    if (f.registryDisagrees !== undefined) {
      if (h.disagreement.is === null) {
        drop(h, h.disagreement.note, "NOT_MEASURABLE");
        continue;
      }
      if (h.disagreement.is !== f.registryDisagrees) continue;
    }
    if (f.measuredOnly === true && h.measured === 0) {
      drop(h, "aucune mesure MEASURED sur ce hook", answerLabel(h));
      continue;
    }
    // Un hook sans mesure n'est PAS "sous le seuil" : c'est une absence de mesure.
    if (f.minBps !== undefined || f.maxBps !== undefined) {
      if (h.max_bps === null) {
        drop(
          h,
          "pas de valeur mesuree : ce hook ne peut etre ni au-dessus ni en dessous d'un seuil",
          answerLabel(h),
        );
        continue;
      }
      if (f.minBps !== undefined && h.max_bps < f.minBps) continue;
      if (f.maxBps !== undefined && h.max_bps > f.maxBps) continue;
    }
    kept.push(h);
  }
  return { kept, withheld, criteria: f };
}

const SORT_KEY: Record<ColumnName, (h: HookView) => number | string> = {
  hook: (h) => h.hook,
  registre: (h) => (h.in_registry ? (h.registry?.name ?? "zzz") : "￿"),
  mesure: (h) => (h.max_bps === null ? -1 : h.max_bps),
  pools: (h) => h.pools,
  mesures: (h) => h.measurements,
  etiquette: (h) => answerLabel(h),
  audit: (h) => (h.registry?.audit_url ? 0 : 1),
};

export function applySort(hooks: HookView[], col: ColumnName, dir: "asc" | "desc"): HookView[] {
  const key = SORT_KEY[col];
  const sign = dir === "asc" ? 1 : -1;
  return hooks.slice().sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (typeof ka === "number" && typeof kb === "number") return (ka - kb) * sign;
    return String(ka).localeCompare(String(kb)) * sign;
  });
}

/* ---------------------------------------------------------------- execution */

export interface ExecOptions {
  /** la mesure a la demande ne part JAMAIS d'ici : on decrit la demande, on ne l'execute pas */
  measureQuotaLeft?: number;
}

export function execute(
  actions: Action[],
  store: StoreView,
  graph: GraphView = getGraph(store),
  opts: ExecOptions = {},
): Execution {
  const warnings: string[] = [];
  if (!store.complete && store.incomplete_reason) warnings.push(store.incomplete_reason);

  let pool: HookView[] = store.hooks;
  let criteria: Filter | null = null;
  let sort: Execution["sort"] = null;
  let columns: ColumnName[] | null = null;
  let withheld: Withheld[] = [];
  const steps: ExecStep[] = [];

  for (const action of actions) {
    switch (action.type) {
      case "reset": {
        pool = store.hooks;
        criteria = null;
        sort = null;
        columns = null;
        withheld = [];
        steps.push({ action, ok: true, label: null, note: "tableau remis a plat", data: null });
        break;
      }
      case "filter": {
        const out = applyFilter(pool, action.filter);
        pool = out.kept;
        criteria = { ...(criteria ?? {}), ...action.filter };
        withheld = [...withheld, ...out.withheld];
        steps.push({
          action,
          ok: true,
          label: null,
          note: `${out.kept.length} hook(s) retenu(s), ${out.withheld.length} ecarte(s) faute de mesure`,
          data: { kept: out.kept.length, withheld: out.withheld.length },
        });
        break;
      }
      case "sort": {
        pool = applySort(pool, action.col, action.dir);
        sort = { col: action.col, dir: action.dir };
        steps.push({ action, ok: true, label: null, note: null, data: sort });
        break;
      }
      case "columns": {
        columns = action.columns;
        steps.push({ action, ok: true, label: null, note: null, data: { columns } });
        break;
      }
      case "highlight": {
        steps.push({ action, ok: true, label: null, note: null, data: { hooks: action.hooks } });
        break;
      }
      case "open": {
        const h = store.byHook.get(action.hook);
        if (!h) {
          steps.push({
            action,
            ok: false,
            label: "NOT_MEASURABLE",
            note: "aucune mesure publiee pour ce hook : c'est une absence, pas un zero",
            data: { hook: action.hook },
          });
          break;
        }
        const profile = action.pool ? (h.profiles.find((p) => p.pool_id === action.pool) ?? null) : null;
        steps.push({
          action,
          ok: true,
          label: answerLabel(h),
          note: action.pool && !profile ? "ce pool n'est pas dans le jeu pour ce hook" : null,
          data: { row: toRow(h), profile, profiles: h.profiles.map(summarizeProfile) },
        });
        break;
      }
      case "plotCurve": {
        const h = store.byHook.get(action.hook);
        const p = h?.profiles.find((x) => x.pool_id === action.pool);
        if (!h || !p) {
          steps.push({
            action,
            ok: false,
            label: "NOT_MEASURABLE",
            note: "ce couple hook/pool n'existe pas dans le jeu",
            data: null,
          });
          break;
        }
        const series = [true, false]
          .map((zfo) => ({
            direction: (zfo ? "0->1" : "1->0") as "0->1" | "1->0",
            points: p.points.filter((pt) => pt.zero_for_one === zfo),
          }))
          .filter((s) => s.points.length > 0)
          .filter((s) => action.direction === null || s.direction === action.direction);
        steps.push({
          action,
          ok: true,
          label: p.measured > 0 ? "MEASURED" : answerLabel(h),
          note: p.measured === 0 ? "aucun point cotable sur ce profil" : null,
          data: {
            hook: h.hook,
            pool_id: p.pool_id,
            currency0: p.currency0,
            currency1: p.currency1,
            stored_lp_fee: p.stored_lp_fee,
            fee_is_dynamic: p.fee_is_dynamic,
            blocks: p.blocks,
            non_flat: p.non_flat,
            spread_bps: p.spread_bps,
            max_bps: p.max_bps,
            min_bps: p.min_bps,
            series,
          },
        });
        break;
      }
      case "compare": {
        const a = store.byHook.get(action.a);
        const b = store.byHook.get(action.b);
        steps.push({
          action,
          ok: Boolean(a && b),
          label: a && b ? "MEASURED" : "NOT_MEASURABLE",
          note: a && b ? null : "au moins un des deux hooks n'a aucune mesure publiee",
          data: { a: a ? toRow(a) : { hook: action.a, missing: true }, b: b ? toRow(b) : { hook: action.b, missing: true } },
        });
        break;
      }
      case "measure": {
        // On ne mesure PAS ici. Un seul mesureur par anvil : l'API le fait, sur son
        // propre fork, derriere le peage x402. Le chat n'emet qu'une demande.
        const left = opts.measureQuotaLeft ?? 0;
        steps.push({
          action,
          ok: left > 0,
          label: null,
          note:
            left > 0
              ? "demande prete : POST /measure la fera executer par le moteur"
              : "quota de mesures de la session epuise",
          data: {
            request: {
              hook: action.hook,
              pool_id: action.pool,
              sizes: action.sizes,
              directions: action.directions,
              block: action.block,
            },
            route: "POST /measure",
            billing:
              "facturee en x402 (unite = une mesure). Depuis un navigateur, aucun visiteur n'a de compte Hedera : le chat consomme un quota de session, il ne paie pas.",
            quota_left: left,
          },
        });
        break;
      }
      case "showTwins": {
        const twins = graph.twins(action.hook);
        steps.push({
          action,
          ok: true,
          label: null,
          note: `${twins.length} hook(s) declarent les memes permissions ou portent le meme nom`,
          data: { hook: action.hook, twins },
        });
        break;
      }
      case "showBlastRadius": {
        const r = graph.blastRadius(action.hook);
        steps.push({
          action,
          ok: r !== null,
          label: r ? null : "NOT_MEASURABLE",
          note: r ? null : "ce hook n'apparait dans aucune mesure du jeu",
          data: r,
        });
        break;
      }
      case "showDeployer": {
        steps.push({ action, ok: true, label: null, note: null, data: graph.deployer(action.hook) });
        break;
      }
      case "showContradictions": {
        const c = graph.contradictions();
        steps.push({
          action,
          ok: true,
          label: null,
          note: `${c.confirmed.length} desaccord(s) etabli(s), ${c.unknowable.length} cas non tranchables`,
          data: c,
        });
        break;
      }
      case "showOrphans": {
        steps.push({ action, ok: true, label: null, note: null, data: graph.orphans() });
        break;
      }
      case "showEvidence": {
        const m = store.byMeasurement.get(action.measurementId);
        steps.push({
          action,
          ok: Boolean(m),
          label: m ? m.label : "NOT_MEASURABLE",
          note: m ? null : "id de mesure inconnu du jeu charge",
          data: m
            ? {
                ...m,
                replay_command: m.replay.command_exact,
                how_to_replay: [
                  "docker compose up -d  (fork anvil epingle au bloc)",
                  m.replay.command_exact,
                ],
              }
            : { measurementId: action.measurementId },
        });
        break;
      }
      case "export": {
        steps.push({
          action,
          ok: true,
          label: null,
          note: "l'export porte la selection courante et ses etiquettes",
          data: { format: action.format, rows: pool.length },
        });
        break;
      }
      case "permalink": {
        steps.push({
          action,
          ok: true,
          label: null,
          note: null,
          data: { state: { filter: criteria, sort, columns, selection: pool.map((h) => h.hook) } },
        });
        break;
      }
      case "clarify": {
        steps.push({ action, ok: true, label: null, note: null, data: { question: action.question } });
        break;
      }
    }
  }

  return {
    steps,
    rows: pool.map(toRow),
    withheld,
    selection: pool.map((h) => h.hook),
    criteria,
    sort,
    columns,
    truncated: !store.complete,
    warnings,
  };
}

export function summarizeProfile(p: ProfileView) {
  return {
    pool_id: p.pool_id,
    currency0: p.currency0,
    currency1: p.currency1,
    stored_lp_fee: p.stored_lp_fee,
    fee_is_dynamic: p.fee_is_dynamic,
    points: p.points.length,
    measured: p.measured,
    max_bps: p.max_bps,
    min_bps: p.min_bps,
    spread_bps: p.spread_bps,
    non_flat: p.non_flat,
    blocks: p.blocks,
  };
}

/* --------------------------------------------------------------- narration */

const SHOW = 3;

function src(store: StoreView): string {
  return store.dataset.source.split("/").pop() ?? store.dataset.source;
}

function citeRow(n: Narration, row: HookRow, store: StoreView): void {
  const m = row.max_measurement!;
  n.bps(m.bps!, {
    measurement_id: m.id,
    hook: row.hook,
    pool_id: findPool(store, row.hook, m.id),
    block_number: m.block_number,
    amount_in: m.amount_in,
    direction: m.direction,
    label: m.label,
    replay: m.replay,
    source: src(store),
    what: "maximum mesure pour ce hook, en points de base",
  });
}

function findPool(store: StoreView, hook: string, measurementId: string): string {
  const h = store.byHook.get(hook);
  for (const p of h?.profiles ?? []) if (p.points.some((pt) => pt.id === measurementId)) return p.pool_id;
  return "";
}

/* ------------------------------------------------- la narration du routage */

/** On n'en detaille pas trente : les suivantes sont comptees, pas resumees. */
const ROUTE_SHOW = 4;

function fileOf(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * Une valeur en bps d'une porte. Le signe est ecrit en PROSE et la valeur absolue est
 * citee : un hook peut rendre plus que le pool sans lui (bps negatif dans le jeu), et
 * le jeton numerique cite doit etre exactement celui qu'on ecrit.
 */
function citeGateBps(n: Narration, g: RouteGate, value: number, what: string, source: string): void {
  if (value < 0) n.text("-");
  n.num(fmtBps(Math.abs(value)), {
    kind: "measurement",
    what,
    source,
    measurement_id: g.measurement_id ?? null,
    hook: g.hook,
    pool_id: g.pool_id,
    block_number: g.block_number ?? null,
    amount_in: g.size?.used_wei ?? null,
    direction: g.direction ?? null,
    label: (g.label as Label | undefined) ?? null,
    replay: g.replay ?? null,
  });
}

/** Une porte classee, avec la composition de son cout et la ligne qui le porte. */
function gateLine(n: Narration, g: RouteGate, source: string): void {
  n.text("Porte ").ident(g.hook).text(" sur le pool ").ident(g.pool_id ?? "(pool inconnu)").text(" : ");
  if (g.total_bps === null || g.hook_bps === null || g.hook_bps === undefined || g.lp_fee_bps_used === undefined) {
    n.text(
      "route.ts l'a classee mais la composition de son cout n'est pas complete dans sa reponse ; je ne la resume pas a moitie. ",
    );
    return;
  }
  n.text("cout total ");
  citeGateBps(n, g, g.total_bps, "cout total mesure = frais LP de slot0 + prelevement du hook, tires de la MEME ligne", source);
  n.text(" bps, soit frais LP ");
  citeGateBps(n, g, g.lp_fee_bps_used, "frais LP lus dans slot0 au bloc de la mesure (stored_lp_fee / 100)", source);
  n.text(" bps plus prelevement du hook ");
  citeGateBps(n, g, g.hook_bps, "prelevement du hook mesure par contrefactuel, en points de base", source);
  n.text(" bps");
  if (g.label) n.text(", etiquette ").ident(g.label);
  if (g.measurement_id) n.text(", ligne ").ident(g.measurement_id);
  if (g.size?.used_wei) {
    n.text(", taille ");
    n.size(g.size.used_wei, source);
    n.text(" unites");
  }
  if (g.direction) n.text(", sens ").ident(g.direction);
  if (g.block_number !== undefined && g.block_number !== null) {
    n.text(", bloc ");
    n.block(g.block_number, source);
  }
  n.text(". ");
}

/**
 * PAR OU PASSER, mis en phrase.
 *
 * Ce qui compte ici tient en une regle : quand la paire n'a qu'une porte, on le DIT.
 * Presenter un classement a un element laisserait croire a un choix qui n'existe pas
 * — et le recensement dit que c'est le cas de la quasi-totalite des paires.
 *
 * Aucun nombre n'est calcule ici : tous viennent de la reponse de buildRouteAnswer()
 * (apps/api/src/route.ts) et chacun repart avec sa ligne, son bloc, sa taille, son
 * sens, son etiquette et sa commande de rejeu.
 */
export function narrateRoute(n: Narration, answer: RouteAnswer): void {
  const ranked = rankedGates(answer);
  const unranked = unrankedGates(answer);
  const source = answer.sources.map((x) => fileOf(x.path)).join(" + ");
  const censusFile = fileOf(answer.census_source.path);
  const asked = answer.pair.as_asked;

  n.text("Pour echanger ")
    .ident(asked[0] ?? "?")
    .text(" contre ")
    .ident(asked[1] ?? "?")
    .text(", sens ")
    .ident(answer.direction.human)
    .text(" : ");

  /* --- ce que le jeu mesure vraiment ------------------------------------- */
  if (answer.counts.pools_measured === 0) {
    n.text(
      "aucune mesure du jeu ne couvre cette paire. Je n'ai donc aucun cout a donner et je n'en fabrique pas : une paire non mesuree n'est pas une paire gratuite, c'est une absence de mesure. ",
    );
  } else if (ranked.length === 0) {
    n.text("le jeu porte ");
    n.count(
      answer.counts.pools_measured,
      "portes mesurees pour cette paire",
      "pools distincts de cette paire ayant au moins une ligne dans les fichiers de mesures",
      source,
    );
    n.text(
      " porte(s) mesuree(s), mais aucune n'a de cout dans ce sens : une cotation qui n'aboutit pas est NOT_QUOTABLE, ce n'est pas un cout de zero. ",
    );
    if (answer.direction.pools_quoted_in_other_direction > 0) {
      n.count(
        answer.direction.pools_quoted_in_other_direction,
        "portes cotant dans l'autre sens",
        "pools de la paire portant au moins une ligne chiffree dans le sens oppose",
        source,
      );
      n.text(
        " porte(s) cotent dans l'AUTRE sens : repose la question dans l'ordre inverse. Je ne bascule pas de sens toute seule. ",
      );
    }
  } else if (answer.counts.pools_measured === 1) {
    // LE cas du corpus : une seule porte. On ne rend pas un classement a un element,
    // parce qu'un classement laisse croire a un choix. Ce qu'il y a a savoir ici,
    // c'est le peage — et l'affirmation "aucune alternative" est faite plus bas,
    // seulement si le recensement la soutient.
    n.text("il n'y a pas de classement a rendre : une seule porte est mesuree pour cette paire. ");
    gateLine(n, ranked[0]!, source);
  } else if (ranked.length === 1) {
    // Plusieurs portes mesurees mais une seule chiffrable : ce n'est pas un
    // classement non plus. Dire "la moins chere" en comparant a des portes sans
    // cout serait comparer un nombre a une absence.
    n.text(
      "une seule porte a un cout mesure dans ce sens ; les autres sont listees plus bas, sans cout. Ce n'est donc pas un classement. ",
    );
    gateLine(n, ranked[0]!, source);
  } else {
    n.count(
      ranked.length,
      "portes classees",
      "pools de la paire portant un cout total mesure dans ce sens",
      source,
    );
    n.text(" porte(s) ont un cout total mesure dans ce sens, de la moins chere a la plus chere. ");
    for (const g of ranked.slice(0, ROUTE_SHOW)) gateLine(n, g, source);
    if (ranked.length > ROUTE_SHOW) {
      n.count(
        ranked.length - ROUTE_SHOW,
        "portes classees non detaillees dans cette phrase",
        "reste du classement, lisible tel quel dans la reponse de GET /route",
        source,
      );
      n.text(" autre(s) porte(s) suivent dans le classement. ");
    }
    if (answer.ranking_note)
      n.text(
        "Au moins deux portes ont le MEME cout total mesure : leur ordre relatif est deterministe mais arbitraire, la mesure ne les separe pas. ",
      );
  }

  /* --- ce qui n'est pas classe, et ne le sera pas ------------------------- */
  if (unranked.length > 0) {
    n.count(
      unranked.length,
      "portes listees hors classement",
      "pools de la paire sans cout total mesure dans le sens demande",
      source,
    );
    n.text(" porte(s) sont listees hors classement (");
    n.ident([...new Set(unranked.map((g) => g.why ?? "SANS_RAISON"))].join(", "));
    n.text(
      "). Aucun cout ne leur est prete, aucun zero ne leur est donne, et leur place dans cette liste ne dit rien de leur prix. ",
    );
  }
  if (answer.counts.gates_not_measured > 0) {
    n.count(
      answer.counts.gates_not_measured,
      "portes du recensement jamais mesurees",
      "pools de la paire vus au recensement et absents des fichiers de mesures",
      censusFile,
    );
    n.text(
      " porte(s) vues au recensement n'ont jamais ete mesurees : elles ne sont ni classees, ni comptees comme gratuites. ",
    );
  }

  /* --- peut-on contourner le hook ? -------------------------------------- */
  const pic = answer.alternatives.pools_in_census;
  if (answer.alternatives.claim === "AUCUNE_ALTERNATIVE") {
    n.text("Le recensement ne voit qu'un seul pool v4 pour cette paire");
    if (answer.census_source.block_number !== null) {
      n.text(" au bloc ");
      n.block(answer.census_source.block_number, censusFile);
    }
    n.text(
      " : aucune alternative n'existe a ce bloc, on ne peut pas contourner le hook. Il n'y a donc pas de recommandation a faire, il y a un peage a connaitre — un prelevement n'y est pas un prix concurrentiel, c'est un peage sur la seule route. ",
    );
  } else if (answer.alternatives.claim === "PLUSIEURS_PORTES" && pic !== null) {
    n.text("Le recensement voit ");
    n.count(pic, "portes recensees pour cette paire", "pools de cette paire dans le recensement de decouverte", censusFile);
    n.text(" porte(s) pour cette paire, toutes couvertes par au moins une mesure. ");
  } else if (answer.alternatives.claim === "ALTERNATIVES_NON_MESUREES" && pic !== null) {
    n.text("Le recensement voit ");
    n.count(pic, "portes recensees pour cette paire", "pools de cette paire dans le recensement de decouverte", censusFile);
    n.text(" porte(s) pour cette paire et toutes ne sont pas mesurees : je ne peux donc pas affirmer que ce classement couvre toutes les alternatives. ");
  } else {
    n.text(
      "Je ne peux rien affirmer sur les alternatives de cette paire : le recensement ne la voit pas, ou n'est pas charge. C'est INDETERMINE, ce n'est pas 'aucune alternative'. ",
    );
  }

  /* --- de combien ce recensement est-il un minorant ? --------------------- */
  const unreadable = answer.census_source.unreadable_pools;
  if (unreadable === null) {
    n.text(
      "Reserve : le manifeste du balayage ne dit pas combien de pools sont restes illisibles, donc on ne sait pas de combien ce recensement est un minorant. ",
    );
  } else if (unreadable > 0) {
    n.text("Reserve : le balayage de decouverte n'a pas pu lire ");
    n.count(
      unreadable,
      "pools illisibles au balayage de decouverte",
      "champ n_unknown du manifeste .scan.json de ce recensement",
      censusFile,
    );
    n.text(
      " pools et le manifeste ne dit pas a quelles paires ils appartiennent : ce recensement est un MINORANT. ",
    );
  }

  /* --- la structure, derivee a chaque appel ------------------------------ */
  const st = answer.structure;
  if (st) {
    n.text("Structure du marche, derivee du recensement a chaque appel et jamais ecrite en dur : sur ");
    n.count(
      st.pairs_discovered,
      "paires distinctes recensees",
      "paires (currency0,currency1) distinctes du recensement de decouverte",
      censusFile,
    );
    n.text(" paires");
    if (st.block_number !== null) {
      n.text(" decouvertes au bloc ");
      n.block(st.block_number, censusFile);
    }
    n.text(", ");
    n.count(
      st.pairs_with_more_than_one_pool,
      "paires offrant un choix de pool",
      "paires du recensement ayant strictement plus d'un pool",
      censusFile,
    );
    n.text(" offrent un choix de pool, soit ");
    n.num(fmtBps(st.share_pct), {
      kind: "count",
      what: "part des paires offrant un choix de pool, en pourcent",
      derived_from:
        "pairs_with_more_than_one_pool / pairs_discovered * 100, arrondi a quatre decimales",
      source: censusFile,
    });
    n.text(" %. Pour les ");
    n.count(
      st.pairs_with_a_single_pool,
      "paires a porte unique",
      "pairs_discovered - pairs_with_more_than_one_pool",
      censusFile,
    );
    n.text(
      " autres il n'existe qu'une porte : on ne peut pas contourner le hook, et un prelevement n'y est pas un prix concurrentiel. ",
    );
  } else {
    n.text(
      "Le recensement n'est pas charge : la phrase structurelle n'est pas calculable, et je ne la remplace pas par des chiffres memorises. ",
    );
  }

  /* --- comment verifier ---------------------------------------------------*/
  // "slot0" porte un chiffre sans etre un nombre : il passe par ident(), sinon
  // l'auditeur le compte comme une valeur non sourcee — et il a raison de le faire.
  n.text(
    "Aucune taille n'a ete demandee : chaque porte est lue a sa PIRE taille mesuree dans ce sens, et cette taille est citee avec son cout. Deux portes peuvent donc etre comparees a des tailles differentes si le balayage ne les a pas couvertes aux memes tailles — les tailles ci-dessus le disent. Le cout total est la somme des frais LP lus dans ",
  )
    .ident("slot0")
    .text(
      " et du prelevement du hook mesure par contrefactuel, pris sur la MEME ligne ; chaque valeur repart avec son identifiant de mesure et sa commande de rejeu.",
    );
}

/**
 * La narration. Chaque nombre passe par `Narration`, donc par une citation ; la prose
 * n'a pas le droit de contenir un chiffre. Si un template derape, `build()` leve.
 */
export function narrate(
  intent: Intent,
  planOut: PlanOut,
  exec: Execution,
  store: StoreView,
  /** injectable pour les tests du routage ; sinon route.ts lit ses fichiers */
  routeDeps: RouteDeps = {},
): { text: string; citations: Citation[]; identifiers: string[]; label: Label | null } {
  const n = new Narration();
  const source = src(store);
  const dsCount = (what: string, v: number, recipe: string) => n.count(v, what, recipe, source);

  if (exec.truncated) {
    n.text("La lecture du jeu de mesures est partielle : ");
    if (store.dataset.rejected_lines > 0) {
      n.count(store.dataset.rejected_lines, "lignes du jeu illisibles", "lignes rejetees au parsing du JSONL", source);
      n.text(" ligne(s) n'ont pas pu etre relues. ");
    } else {
      n.text("aucune source de mesures n'est chargee. ");
    }
    n.text(
      "Je ne conclus pas sur une lecture tronquee : cette reponse est NOT_MEASURABLE, et aucune valeur n'en sort.",
    );
    return { ...n.build(), label: "NOT_MEASURABLE" };
  }

  const top = exec.rows.slice(0, SHOW);
  const nameOf = (r: HookRow) => (r.name ? `${r.hook} (${r.name})` : r.hook);

  switch (intent) {
    case "registry-disagrees": {
      const max = planOut.params.maxBps ?? NEGLIGIBLE_BPS;
      n.text("Le registre officiel affirme vanillaSwap=false pour ces hooks. La mesure, elle, ne voit rien passer au-dessus de ");
      n.threshold(max, "seuil sous lequel on considere qu'on n'a rien vu passer");
      n.text(" bps. ");
      dsCount("hooks retenus", exec.rows.length, `filter(${JSON.stringify(exec.criteria)}) sur ${store.dataset.measurements} mesures`);
      n.text(" hook(s) tiennent ce desaccord");
      if (exec.withheld.length > 0) {
        n.text(", et ");
        dsCount("hooks ecartes faute de mesure", exec.withheld.length, "hooks sans valeur MEASURED : NOT_MEASURABLE, jamais 'sous le seuil'");
        n.text(" ont ete ecartes parce qu'on n'a AUCUNE valeur pour eux — ils ne sont pas 'sous le seuil', ils sont NOT_MEASURABLE");
      }
      n.text(". ");
      for (const r of top) {
        n.ident(nameOf(r)).text(" : maximum mesure ");
        citeRow(n, r, store);
        n.text(" bps sur ");
        dsCount("pools mesures de ce hook", r.pools_measured, `pools du hook ${r.hook} portant au moins un MEASURED`);
        n.text(" pool(s). ");
      }
      n.text("Ouvre une ligne pour voir la courbe du prelevement en fonction de la taille du swap.");
      break;
    }
    case "top-extractors":
    case "quiet-hooks":
    case "filter": {
      dsCount("hooks retenus", exec.rows.length, `filter(${JSON.stringify(exec.criteria)})`);
      n.text(" hook(s) passent le filtre");
      if (exec.withheld.length > 0) {
        n.text(" ; ");
        dsCount("hooks ecartes faute de mesure", exec.withheld.length, "hooks sans valeur MEASURED");
        n.text(" sont ecartes faute de mesure (NOT_MEASURABLE, pas un zero)");
      }
      n.text(". ");
      for (const r of top) {
        if (r.max_measurement?.bps == null) continue;
        n.ident(nameOf(r)).text(" : ");
        citeRow(n, r, store);
        n.text(" bps au maximum, taille ");
        n.size(r.max_measurement.amount_in, source);
        n.text(" unites, sens ").ident(r.max_measurement.direction).text(", bloc ");
        n.block(r.max_measurement.block_number, source);
        n.text(". ");
      }
      break;
    }
    case "curve": {
      const step = exec.steps.find((s) => s.action.type === "plotCurve");
      const d = step?.data as
        | { hook: string; pool_id: string; non_flat: boolean; spread_bps: number | null; series: { direction: string; points: PointView[] }[] }
        | null
        | undefined;
      if (!step?.ok || !d) {
        n.text("Ce couple hook/pool n'a pas de profil dans le jeu : NOT_MEASURABLE.");
        return { ...n.build(), label: "NOT_MEASURABLE" };
      }
      n.text("Profil du hook ").ident(d.hook).text(" sur le pool ").ident(d.pool_id).text(". ");
      for (const s of d.series) {
        const pts = s.points.filter((p) => p.bps !== null);
        if (pts.length === 0) {
          n.text("Sens ").ident(s.direction).text(" : aucun point cotable (NOT_QUOTABLE). ");
          continue;
        }
        const first = pts[0]!;
        const last = pts[pts.length - 1]!;
        n.text("Sens ").ident(s.direction).text(" : de ");
        n.bps(first.bps!, { measurement_id: first.id, hook: d.hook, pool_id: d.pool_id, block_number: first.block_number, amount_in: first.amount_in, direction: first.direction, label: first.label, replay: first.replay, source, what: "prelevement a la plus petite taille" });
        n.text(" bps a la taille ");
        n.size(first.amount_in, source);
        n.text(", jusqu'a ");
        n.bps(last.bps!, { measurement_id: last.id, hook: d.hook, pool_id: d.pool_id, block_number: last.block_number, amount_in: last.amount_in, direction: last.direction, label: last.label, replay: last.replay, source, what: "prelevement a la plus grande taille" });
        n.text(" bps a la taille ");
        n.size(last.amount_in, source);
        n.text(". ");
      }
      n.text(d.non_flat ? "Le prelevement change avec la taille : le profil n'est pas plat. " : "Le profil est plat sur les tailles mesurees. ");
      n.text("Chaque point se rejoue par sa propre commande.");
      break;
    }
    case "compare": {
      const step = exec.steps.find((s) => s.action.type === "compare");
      const d = step?.data as { a: HookRow | { hook: string; missing: true }; b: HookRow | { hook: string; missing: true } };
      for (const side of [d.a, d.b]) {
        if ("missing" in side) {
          n.ident(side.hook).text(" : aucune mesure publiee, NOT_MEASURABLE. ");
          continue;
        }
        n.ident(nameOf(side)).text(" : ");
        if (side.max_measurement?.bps == null) {
          n.text("aucune valeur MEASURED, NOT_MEASURABLE. ");
          continue;
        }
        citeRow(n, side, store);
        n.text(" bps au maximum sur ");
        dsCount("pools mesures", side.pools_measured, `pools du hook ${side.hook} portant au moins un MEASURED`);
        n.text(" pool(s). ");
      }
      n.text("Je ne calcule pas l'ecart entre les deux : ce serait un nombre que personne n'a mesure.");
      break;
    }
    case "twins": {
      const step = exec.steps.find((s) => s.action.type === "showTwins");
      const d = step?.data as { hook: string; twins: { hook: string; name: string | null; measured: boolean }[] };
      dsCount("jumeaux trouves", d.twins.length, "hooks du registre partageant le meme bitmap de permissions ou le meme nom");
      n.text(" hook(s) declarent les memes permissions que ").ident(d.hook).text(" (les bits bas de l'adresse, Hooks.sol) ou portent le meme nom. ");
      dsCount("jumeaux deja mesures", d.twins.filter((t) => t.measured).length, "jumeaux presents dans le jeu de mesures");
      n.text(" d'entre eux sont deja mesures ; pour les autres, TARE n'a rien a dire tant qu'ils n'ont pas ete mesures.");
      break;
    }
    case "blast-radius": {
      const step = exec.steps.find((s) => s.action.type === "showBlastRadius");
      if (!step?.ok || !step.data) {
        n.text("Ce hook n'apparait dans aucune mesure du jeu : NOT_MEASURABLE.");
        return { ...n.build(), label: "NOT_MEASURABLE" };
      }
      const d = step.data as { hook: string; pools: string[]; pools_measured: string[]; tokens: string[]; measurements: number; measured: number };
      n.text("Le hook ").ident(d.hook).text(" touche ");
      dsCount("pools du jeu", d.pools.length, `pools distincts portant ce hook dans ${source}`);
      n.text(" pool(s) et ");
      dsCount("tokens concernes", d.tokens.length, "tokens distincts apparaissant dans ces pools");
      n.text(" token(s). ");
      dsCount("pools avec au moins une valeur", d.pools_measured.length, "pools de ce hook portant au moins un MEASURED");
      n.text(" pool(s) portent au moins une valeur, sur ");
      dsCount("mesures du hook", d.measurements, "lignes du jeu pour ce hook");
      n.text(" ligne(s) au total. Le reste est NOT_QUOTABLE ou NOT_MEASURABLE, pas un zero.");
      break;
    }
    case "deployer": {
      const step = exec.steps.find((s) => s.action.type === "showDeployer");
      const d = step?.data as { hook: string; deployer: string | null; note: string; siblings: unknown[] };
      if (!d.deployer) {
        n.text("Pour ").ident(d.hook).text(" : ").ident(d.note).text(". Je ne devine pas un deployeur.");
        break;
      }
      n.text("Le registre declare ").ident(d.deployer).text(" comme deployeur de ").ident(d.hook).text(", et ");
      dsCount("autres hooks du meme deployeur", d.siblings.length, "hooks du registre portant le meme champ deployer");
      n.text(" autre(s) hook(s) portent le meme champ. C'est une declaration du registre, pas une mesure.");
      break;
    }
    case "contradictions": {
      const step = exec.steps.find((s) => s.action.type === "showContradictions");
      const d = step?.data as { confirmed: unknown[]; unknowable: unknown[]; flag_mismatches: unknown[] };
      dsCount("desaccords etablis", d.confirmed.length, "hooks ou le registre affirme une chose et la mesure en montre une autre");
      n.text(" desaccord(s) etabli(s) entre le registre et la mesure, ");
      dsCount("cas non tranchables", d.unknowable.length, "hooks du registre sans valeur MEASURED : NOT_MEASURABLE");
      n.text(" cas ou l'on ne peut pas trancher (aucune valeur mesurable : NOT_MEASURABLE), et ");
      dsCount("divergences bits/registre", d.flag_mismatches.length, "comparaison bit a bit des 14 permissions declarees contre les bits bas de l'adresse");
      n.text(" divergence(s) entre les permissions declarees et les bits de l'adresse.");
      break;
    }
    case "orphans": {
      const step = exec.steps.find((s) => s.action.type === "showOrphans");
      const d = step?.data as { measured_not_in_registry: unknown[]; in_registry_never_measured: unknown[]; pools_without_measurement: unknown[] };
      dsCount("mesures hors registre", d.measured_not_in_registry.length, "hooks presents dans le jeu et absents du registre officiel");
      n.text(" hook(s) sont mesures alors que le registre officiel ne les connait pas, ");
      dsCount("registre jamais mesure", d.in_registry_never_measured.length, "hooks du registre sur la chaine mesuree, absents du jeu");
      n.text(" hook(s) du registre n'ont jamais ete interroges par TARE, et ");
      dsCount("pools sans valeur", d.pools_without_measurement.length, "pools du jeu sans une seule ligne MEASURED");
      n.text(" pool(s) du jeu ne portent aucune valeur exploitable.");
      break;
    }
    case "evidence": {
      const step = exec.steps.find((s) => s.action.type === "showEvidence");
      if (!step?.ok) {
        n.text("Cet identifiant de mesure n'existe pas dans le jeu charge : je n'invente pas la ligne.");
        return { ...n.build(), label: "NOT_MEASURABLE" };
      }
      const m = step.data as { id: string; hook: string; pool_id: string; bps: number | null; label: Label; block_number: number; amount_in: string; direction: string; replay_command: string };
      n
        .text("La ligne ")
        .ident(m.id)
        .text(" porte l'etiquette ")
        .ident(m.label)
        .text(", hook ")
        .ident(m.hook)
        .text(", pool ")
        .ident(m.pool_id)
        .text(", sens ")
        .ident(m.direction)
        .text(", bloc ");
      n.block(m.block_number, source);
      n.text(", taille ");
      n.size(m.amount_in, source);
      n.text(" unites");
      if (m.bps !== null) {
        n.text(", prelevement mesure ");
        n.bps(m.bps, { measurement_id: m.id, hook: m.hook, pool_id: m.pool_id, block_number: m.block_number, amount_in: m.amount_in, direction: m.direction, label: m.label, replay: m.replay_command, source });
        n.text(" bps");
      } else {
        n.text(", sans valeur : cette etiquette ne peut pas porter un nombre");
      }
      n.text(". Elle se rejoue par la commande fournie.");
      break;
    }
    case "measure-request": {
      const step = exec.steps.find((s) => s.action.type === "measure");
      const d = step?.data as { quota_left: number };
      n.text(
        step?.ok
          ? "La demande est prete. Je ne mesure pas moi-meme : la mesure ecrit un stub dans l'etat du noeud, et un seul mesureur peut tenir un fork a la fois. Elle part sur POST /measure. Il reste "
          : "Le quota de mesures de cette session est epuise. Il reste ",
      );
      dsCount("mesures restantes dans la session", Math.max(0, d?.quota_left ?? 0), "quota de session du chat (le peage x402 garde l'API et le MCP, pas le navigateur)");
      n.text(" mesure(s) pour cette session : depuis un navigateur, aucun visiteur n'a de compte Hedera, donc le chat ne paie pas en x402 — il consomme un quota.");
      break;
    }
    case "route": {
      // Le plan deterministe transporte deja la reponse de route.ts. Un plan de modele
      // ne le peut pas : le schema d'actions n'a pas de case "paire de jetons". On la
      // reconstruit alors depuis les adresses que le modele a nommees, et seulement si
      // le recensement les connait comme des jetons.
      const answer = planOut.route ?? routeFromActions(planOut.actions, routeDeps);
      if (!answer) {
        const c = exec.steps.find((s) => s.action.type === "clarify");
        const d = c?.data as { question: string } | undefined;
        n.text(
          d?.question ??
            "Je n'ai pas identifie les deux jetons de cette question de routage. Donne-les moi en adresses completes : je ne devine pas une paire, et je ne donne pas de cout pour une paire que je n'ai pas lue.",
        );
        return { ...n.build(), label: null };
      }
      narrateRoute(n, answer);
      if (rankedGates(answer).length > 0) break;
      // Rien n'a pu etre chiffre : l'etiquette dit LAQUELLE des deux absences c'est.
      return {
        ...n.build(),
        label: answer.counts.pools_measured === 0 ? "NOT_MEASURABLE" : "NOT_QUOTABLE",
      };
    }
    case "open": {
      const step = exec.steps.find((s) => s.action.type === "open");
      if (!step?.ok) {
        n.text("Aucune mesure publiee pour ce hook. C'est une absence de mesure, pas un zero : NOT_MEASURABLE.");
        return { ...n.build(), label: "NOT_MEASURABLE" };
      }
      const d = step.data as { row: HookRow; profiles: ReturnType<typeof summarizeProfile>[] };
      n.ident(nameOf(d.row)).text(" : ");
      dsCount("profils", d.profiles.length, `pools distincts du hook ${d.row.hook} dans ${source}`);
      n.text(" profil(s), ");
      dsCount("lignes", d.row.measurements, `lignes du jeu pour ${d.row.hook}`);
      n.text(" ligne(s). ");
      if (d.row.max_measurement?.bps != null) {
        n.text("Maximum mesure ");
        citeRow(n, d.row, store);
        n.text(" bps. ");
      } else {
        n.text("Aucune valeur MEASURED : NOT_MEASURABLE. ");
      }
      if (d.row.non_flat_profiles > 0) {
        dsCount("profils non plats", d.row.non_flat_profiles, "profils dont l'ecart max-min a sens constant depasse le seuil publie");
        n.text(" profil(s) ne sont pas plats : le prelevement y depend de la taille du swap.");
      }
      break;
    }
    case "sort": {
      n.text("Tableau trie sur la colonne ").ident(exec.sort?.col ?? "?").text(", sens ").ident(exec.sort?.dir ?? "?").text(".");
      break;
    }
    case "reset": {
      n.text("Filtres, tri et surlignage remis a plat.");
      break;
    }
    case "export": {
      n.text("Export prepare sur la selection courante : chaque ligne garde son etiquette et sa commande de rejeu.");
      break;
    }
    case "permalink": {
      n.text("Etat fige : filtre, tri, colonnes et selection tiennent dans l'URL.");
      break;
    }
    case "help": {
      n.text(
        "TARE mesure ce qu'un hook prend reellement sur un swap : sur un fork epingle, le bytecode du hook est remplace par un stub inerte, on cote le meme swap deux fois, l'ecart EST le prelevement. Demande-moi un seuil en bps, un hook (0x...), 'les contradictions', 'les orphelins', 'la courbe de <hook>', 'les jumeaux de <hook>'. Je choisis quoi interroger et je te dis ce qui revient — je ne produis jamais un nombre moi-meme.",
      );
      break;
    }
    default: {
      const c = exec.steps.find((s) => s.action.type === "clarify");
      const d = c?.data as { question: string } | undefined;
      n.text(d?.question ?? "Je n'ai pas compris la question.");
      return { ...n.build(), label: "NOT_MEASURABLE" };
    }
  }

  const built = n.build();
  // Une reponse ne porte une etiquette que si elle porte une grandeur mesuree.
  // Etiqueter "reset" ou "permalink" serait un abus des quatre etiquettes.
  const label: Label | null = built.citations.some((c) => c.kind === "measurement") ? "MEASURED" : null;
  return { ...built, label };
}
