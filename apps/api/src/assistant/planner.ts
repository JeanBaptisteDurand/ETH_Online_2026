/**
 * LE PLANIFICATEUR : question -> actions typees.
 *
 * Il ne calcule rien. Il decide QUOI interroger. Les grandeurs arrivent apres, par
 * execute.ts, et seulement depuis le jeu de mesures.
 *
 * Le planificateur par defaut est DETERMINISTE : des regles lisibles, testables,
 * qui tournent sans cle d'API et sans reseau. Un planificateur LLM peut le remplacer
 * (voir llm.ts) — sa sortie passe par le meme Zod et le meme auditeur de nombres,
 * donc il n'a pas plus de droits que celui-ci.
 */
import type { Action, ColumnName, FlagName } from "./actions.js";
import { ActionListSchema } from "./actions.js";
import type { StoreView } from "./store.js";
import { NEGLIGIBLE_BPS } from "./store.js";
// type seul : pas d'import a l'execution, donc pas de cycle avec explain.ts
import type { ExplainResult } from "./explain.js";

export type Intent =
  | "registry-disagrees"
  | "contradictions"
  | "top-extractors"
  | "quiet-hooks"
  | "curve"
  | "compare"
  | "twins"
  | "blast-radius"
  | "deployer"
  | "orphans"
  | "evidence"
  | "measure-request"
  | "open"
  | "filter"
  | "sort"
  | "columns"
  | "reset"
  | "export"
  | "permalink"
  /** expliquer LE PRODUIT : la methode, les etiquettes, les limites. Voir explain.ts. */
  | "explain"
  | "help"
  | "unclear";

export interface PlannerContext {
  /** les hooks de la reponse precedente : "ouvre-la" a besoin de savoir de quoi on parle */
  lastHooks?: string[];
  openHook?: string | null;
  openPool?: string | null;
}

export interface PlanOut {
  intent: Intent;
  actions: Action[];
  /** ce que le planificateur a compris, en clair, pour que l'humain puisse le contredire */
  reading: string;
  params: {
    hooks: string[];
    pools: string[];
    measurementIds: string[];
    minBps: number | null;
    maxBps: number | null;
    vanillaSwap: boolean | null;
    nameHits: { hook: string; name: string }[];
  };
  /** pourquoi cette lecture-la : la trace du planificateur, jamais cachee */
  why: string[];
  /** phrase proposee par un modele de langage. Elle n'est publiee QUE si elle passe
   *  l'auditeur de nombres (narrate.ts). Le planificateur deterministe la laisse nulle. */
  say?: string | null;
  /** ce qui a ete degrade en route (LLM invalide, phrase rejetee...) — jamais cache */
  degraded?: { reason: string; detail: string } | null;
  /** l'explication deja construite, quand l'intention est `explain`. Le texte y est
   *  ecrit par le produit et deja audite ; ask.ts le publie tel quel avec ses sources. */
  explain?: ExplainResult | null;
}

/* ------------------------------------------------------------ normalisation */

export function normalize(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NUM = "([0-9]+(?:[.,][0-9]+)?)";
const LESS = new RegExp(`(?:moins de|sous|en dessous de|inferieur[e]?s? a|under|below|<=?)\\s*${NUM}`);
const MORE = new RegExp(`(?:plus de|au dessus de|au dela de|superieur[e]?s? a|depassent|over|above|>=?)\\s*${NUM}`);

function num(m: RegExpMatchArray | null): number | null {
  if (!m || !m[1]) return null;
  const v = Number(m[1].replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

/* ------------------------------------------------------------- extraction */

interface Extracted {
  pools: string[];
  hooks: string[];
  measurementIds: string[];
  minBps: number | null;
  maxBps: number | null;
  vanillaSwap: boolean | null;
  nameHits: { hook: string; name: string }[];
  clean: string;
}

/** Les mots trop communs pour designer un hook. */
const STOP = new Set([
  "hook",
  "hooks",
  "pool",
  "pools",
  "base",
  "swap",
  "static",
  "fee",
  "dynamic",
  "initializer",
  "v2",
  "v3",
  "v4",
]);

function extract(qRaw: string, store: StoreView): Extracted {
  const q = normalize(qRaw);
  // Les pool_id d'abord : sans ca, le motif d'adresse mordrait leurs 40 premiers hex.
  const pools = [...new Set(q.match(/0x[0-9a-f]{64}/g) ?? [])];
  let rest = q;
  for (const p of pools) rest = rest.replaceAll(p, " ");
  const hooks = [...new Set(rest.match(/0x[0-9a-f]{40}/g) ?? [])];
  for (const h of hooks) rest = rest.replaceAll(h, " ");
  const measurementIds = [...new Set(q.match(/m_[0-9a-f]{16}/g) ?? [])];

  const hasBps = /\bbps\b|point[s]? de base|\bpdb\b/.test(q);
  const less = num(rest.match(LESS));
  const more = num(rest.match(MORE));
  const maxBps = hasBps ? less : null;
  const minBps = hasBps ? more : null;

  let vanillaSwap: boolean | null = null;
  const van = q.match(/vanilla\s*swap\s*[:=]?\s*(false|true|faux|vrai)?/);
  if (van) {
    const v = van[1];
    vanillaSwap = v === "true" || v === "vrai" ? true : false; // "vanillaSwap" seul => la valeur discutee est false
  }

  // Un nom du registre cite en clair ("clanker", "zora", "doppler"…).
  const nameHits: { hook: string; name: string }[] = [];
  for (const h of store.hooks) {
    const name = h.registry?.name;
    if (!name) continue;
    const words = normalize(name)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w));
    if (words.some((w) => rest.includes(w))) nameHits.push({ hook: h.hook, name });
  }

  return { pools, hooks, measurementIds, minBps, maxBps, vanillaSwap, nameHits, clean: rest };
}

/* ----------------------------------------------------------- choix de pool */

/**
 * Quel pool tracer quand l'humain n'en nomme pas ? Celui qui montre quelque chose :
 * le profil le plus marque (le plus grand ecart entre la petite et la grande taille),
 * a defaut celui qui porte le maximum. Ce choix est ecrit dans la narration.
 */
export function pickProfile(store: StoreView, hook: string): { pool_id: string; why: string } | null {
  const h = store.byHook.get(hook);
  if (!h || h.profiles.length === 0) return null;
  const nonFlat = h.profiles.filter((p) => p.non_flat && p.spread_bps !== null);
  if (nonFlat.length > 0) {
    nonFlat.sort((a, b) => (b.spread_bps ?? 0) - (a.spread_bps ?? 0));
    return {
      pool_id: nonFlat[0]!.pool_id,
      why: "profil non plat le plus marque de ce hook (le prelevement y bouge avec la taille du swap)",
    };
  }
  const measured = h.profiles.filter((p) => p.measured > 0);
  if (measured.length === 0)
    return { pool_id: h.profiles[0]!.pool_id, why: "aucun profil mesurable : premier pool du jeu" };
  measured.sort((a, b) => (b.max_bps ?? -1) - (a.max_bps ?? -1));
  return { pool_id: measured[0]!.pool_id, why: "profil qui porte le maximum mesure de ce hook" };
}

const DEFAULT_COLUMNS: ColumnName[] = ["hook", "registre", "mesure", "pools", "etiquette"];

/* ------------------------------------------------------------- le planning */

export function plan(question: string, store: StoreView, ctx: PlannerContext = {}): PlanOut {
  const q = normalize(question);
  const e = extract(question, store);
  const why: string[] = [];
  const mk = (intent: Intent, actions: Action[], reading: string): PlanOut => {
    const parsed = ActionListSchema.safeParse(actions);
    if (!parsed.success)
      throw new Error(
        `le planificateur a produit une action invalide : ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join(" ; ")}`,
      );
    return {
      intent,
      actions: parsed.data,
      reading,
      params: {
        hooks: e.hooks,
        pools: e.pools,
        measurementIds: e.measurementIds,
        minBps: e.minBps,
        maxBps: e.maxBps,
        vanillaSwap: e.vanillaSwap,
        nameHits: e.nameHits,
      },
      why,
    };
  };

  const hook = e.hooks[0] ?? e.nameHits[0]?.hook ?? ctx.openHook ?? ctx.lastHooks?.[0] ?? null;
  if (e.hooks[0]) why.push("adresse de hook lue dans la question");
  else if (e.nameHits[0]) why.push(`nom du registre reconnu : ${e.nameHits[0].name}`);
  else if (ctx.openHook) why.push("hook deja ouvert dans la session");
  else if (ctx.lastHooks?.[0]) why.push("hook de la reponse precedente");

  /* --- remise a zero --------------------------------------------------- */
  if (/\b(reset|remets? a zero|efface|reinitialise|tout afficher|enleve les filtres)\b/.test(q))
    return mk("reset", [{ type: "reset" }], "remettre le tableau a plat");

  /* --- aide -------------------------------------------------------------- */
  if (/\b(aide|help|que sais tu|que peux tu|comment ca marche|methode)\b/.test(q))
    return mk("help", [{ type: "reset" }], "expliquer ce que l'assistant sait faire");

  /* --- permalien / export ------------------------------------------------ */
  if (/\b(permalien|permalink|lien|partage[rz]?)\b/.test(q))
    return mk("permalink", [{ type: "permalink" }], "figer l'etat courant dans une URL");
  const exp = q.match(/\b(csv|jsonl|json|markdown)\b/);
  if (/\b(exporte|export|telecharge|download)\b/.test(q))
    return mk(
      "export",
      [{ type: "export", format: (exp?.[1] as "csv" | "json" | "jsonl" | "markdown") ?? "csv" }],
      "exporter la selection courante",
    );

  /* --- la preuve d'une ligne --------------------------------------------- */
  if (e.measurementIds[0])
    return mk(
      "evidence",
      [{ type: "showEvidence", measurementId: e.measurementIds[0] }],
      "montrer la ligne brute et sa commande de rejeu",
    );

  /* --- la demande de mesure ---------------------------------------------- */
  if (/\b(mesure[rz]?|measure|refais? la mesure|remesure)\b/.test(q) && hook && !/\bmesures?\b\s+(de|du|des)\b/.test(q)) {
    why.push("verbe de mesure + un hook identifie");
    return mk(
      "measure-request",
      [
        {
          type: "measure",
          hook,
          pool: e.pools[0] ?? null,
          sizes: ["1000000000000000"],
          directions: ["0->1"],
          block: null,
        },
      ],
      "demander une mesure a la demande",
    );
  }

  /* --- le desaccord registre / mesure : LE moment de la demo ------------- */
  const talksRegistry = /\bregistre|registry|allowlist|liste officielle|vanilla\b/.test(q);
  const talksDisagree = /\bcontradiction|contredit|desaccord|disagree|mais|alors que|pourtant\b/.test(q);
  if (e.vanillaSwap !== null || (talksRegistry && (talksDisagree || e.maxBps !== null || e.minBps !== null))) {
    const maxBps = e.maxBps ?? (e.minBps === null ? NEGLIGIBLE_BPS : null);
    why.push(
      e.maxBps !== null
        ? "seuil haut lu dans la question"
        : `aucun seuil dans la question : on prend le seuil publie du produit (${NEGLIGIBLE_BPS} bps)`,
    );
    const filter = {
      registryDisagrees: true,
      measuredOnly: true,
      ...(maxBps !== null ? { maxBps } : {}),
      ...(e.minBps !== null ? { minBps: e.minBps } : {}),
    };
    return mk(
      "registry-disagrees",
      [
        { type: "reset" },
        { type: "filter", filter },
        { type: "columns", columns: DEFAULT_COLUMNS },
        { type: "sort", col: "mesure", dir: "asc" },
      ],
      "confronter ce que le registre affirme a ce que la mesure voit",
    );
  }

  if (/\bcontradiction|contredit|desaccord|disagree|incoherence\b/.test(q))
    return mk("contradictions", [{ type: "showContradictions" }], "lister les desaccords registre/mesure");

  /* --- la structure ------------------------------------------------------ */
  if (/\bjumeau|jumeaux|twin|meme[s]? permission|identique/.test(q) && hook)
    return mk("twins", [{ type: "showTwins", hook }], "trouver les hooks aux permissions identiques");
  if (/\brayon|blast|impact|portee|combien de pools|quels pools\b/.test(q) && hook)
    return mk("blast-radius", [{ type: "showBlastRadius", hook }], "mesurer la portee du hook dans le graphe");
  if (/\bdeployeur|deployer|qui a deploye|auteur\b/.test(q) && hook)
    return mk("deployer", [{ type: "showDeployer", hook }], "ce que le registre dit du deployeur");
  if (/\borphelin|orphan|jamais mesure|absent[e]? du registre|inconnu du registre\b/.test(q))
    return mk("orphans", [{ type: "showOrphans" }], "ce qui manque des deux cotes");

  /* --- la courbe --------------------------------------------------------- */
  if (/\bcourbe|profil|curve|en fonction de la taille|par taille|plot\b/.test(q) && hook) {
    const pool = e.pools[0] ?? ctx.openPool ?? pickProfile(store, hook)?.pool_id ?? null;
    if (pool)
      return mk(
        "curve",
        [
          { type: "open", hook, pool },
          { type: "plotCurve", hook, pool, direction: null },
        ],
        "tracer le prelevement en fonction de la taille du swap",
      );
  }

  /* --- comparaison ------------------------------------------------------- */
  const twoHooks =
    e.hooks.length >= 2
      ? [e.hooks[0]!, e.hooks[1]!]
      : e.nameHits.length >= 2
        ? [e.nameHits[0]!.hook, e.nameHits[1]!.hook]
        : null;
  if (twoHooks && /\bcompare|versus|\bvs\b|face a|cote a cote|difference entre\b/.test(q))
    return mk("compare", [{ type: "compare", a: twoHooks[0]!, b: twoHooks[1]! }], "mettre deux hooks cote a cote");

  /* --- ouvrir ------------------------------------------------------------ */
  if (/\bouvre|ouvrir|detail|fiche|montre (moi )?(le|la|ce)\b/.test(q) && hook)
    return mk(
      "open",
      [
        { type: "open", hook, pool: e.pools[0] ?? null },
        { type: "highlight", hooks: [hook] },
      ],
      "ouvrir la fiche du hook",
    );

  /* --- tri --------------------------------------------------------------- */
  const sortCol = /\bpar (mesure|prelevement|bps)\b/.test(q)
    ? "mesure"
    : /\bpar pools?\b/.test(q)
      ? "pools"
      : /\bpar (nom|hook|adresse)\b/.test(q)
        ? "hook"
        : null;
  if (/\btri[e]?[rz]?|classe[rz]?|ordonne|sort\b/.test(q) && sortCol) {
    const dir: "asc" | "desc" = /\bcroissant|ascendant|asc\b/.test(q) ? "asc" : "desc";
    return mk("sort", [{ type: "sort", col: sortCol as ColumnName, dir }], "trier le tableau");
  }

  /* --- filtres par grandeur ---------------------------------------------- */
  if (e.minBps !== null || e.maxBps !== null) {
    const filter = {
      measuredOnly: true,
      ...(e.minBps !== null ? { minBps: e.minBps } : {}),
      ...(e.maxBps !== null ? { maxBps: e.maxBps } : {}),
    };
    why.push("seuil en bps lu dans la question");
    return mk(
      e.minBps !== null ? "top-extractors" : "quiet-hooks",
      [
        { type: "reset" },
        { type: "filter", filter },
        { type: "sort", col: "mesure", dir: e.minBps !== null ? "desc" : "asc" },
      ],
      "reduire le tableau au seuil demande",
    );
  }

  /* --- classement -------------------------------------------------------- */
  if (/\b(les plus|top|pire[s]?|worst|classement|qui prend le plus|maximum)\b/.test(q))
    return mk(
      "top-extractors",
      [
        { type: "reset" },
        { type: "filter", filter: { measuredOnly: true } },
        { type: "sort", col: "mesure", dir: "desc" },
      ],
      "classer les hooks par prelevement mesure decroissant",
    );

  if (/\bnon plat|non plate|varie|change avec la taille|non lineaire\b/.test(q))
    return mk(
      "filter",
      [
        { type: "reset" },
        { type: "filter", filter: { nonFlat: true } },
        { type: "sort", col: "mesure", dir: "desc" },
      ],
      "ne garder que les hooks dont le prelevement bouge avec la taille",
    );

  const FLAG_WORDS: Record<string, FlagName> = {
    beforeswapreturnsdelta: "beforeSwapReturnsDelta",
    afterswapreturnsdelta: "afterSwapReturnsDelta",
    beforeswap: "beforeSwap",
    afterswap: "afterSwap",
    beforeinitialize: "beforeInitialize",
    afterinitialize: "afterInitialize",
    beforeaddliquidity: "beforeAddLiquidity",
    afteraddliquidity: "afterAddLiquidity",
  };
  const flagHit = q.match(
    /\b(beforeswapreturnsdelta|afterswapreturnsdelta|beforeswap|afterswap|beforeinitialize|afterinitialize|beforeaddliquidity|afteraddliquidity)\b/,
  );
  const flagName = flagHit?.[1] ? FLAG_WORDS[flagHit[1]] : undefined;
  if (flagName)
    return mk(
      "filter",
      [
        { type: "reset" },
        { type: "filter", filter: { flag: flagName } },
      ],
      "filtrer sur une permission declaree par l'adresse",
    );

  /* --- une adresse toute seule ------------------------------------------- */
  if (e.hooks.length === 1 && q.replace(e.hooks[0]!, "").trim().length < 12)
    return mk(
      "open",
      [
        { type: "open", hook: e.hooks[0]!, pool: e.pools[0] ?? null },
        { type: "highlight", hooks: [e.hooks[0]!] },
      ],
      "adresse seule : on ouvre sa fiche",
    );

  return mk(
    "unclear",
    [
      {
        type: "clarify",
        question:
          "Je n'ai pas compris ce qu'il faut interroger. Donne-moi une adresse de hook, un seuil en bps, ou demande 'les contradictions', 'les orphelins', 'la courbe de <hook>'.",
      },
    ],
    "question non reconnue : on demande, on ne devine pas",
  );
}
