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
// La LOGIQUE de routage n'est PAS reecrite ici : on appelle celle de GET /route.
// Un second calcul de cout, meme "equivalent", finirait par diverger du premier —
// et deux chiffres differents pour la meme paire est exactement le defaut que ce
// projet reproche au registre Uniswap.
import { buildRouteAnswer, loadCensus, loadPairIndex, type Census, type PairIndex } from "../route.js";
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
  /** "je veux echanger A contre B, par quel pool passer ?" — voir apps/api/src/route.ts */
  | "route"
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
    /** les deux jetons d'une question de routage, dans l'ordre lu. Absent ailleurs :
     *  une liste vide voudrait dire "aucun jeton", pas "on n'a pas cherche". */
    currencies?: string[];
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
  /** la reponse de GET /route, telle quelle, quand l'intention est `route`. Meme
   *  principe que `explain` : le produit a deja calcule, le planificateur transporte.
   *  Absente quand le plan vient d'un modele (voir routeFromActions dans execute.ts). */
  route?: RouteAnswer | null;
}

/** Ce que rend apps/api/src/route.ts. On ne redeclare pas sa forme : on la deduit. */
export type RouteAnswer = ReturnType<typeof buildRouteAnswer>;

/** Les champs d'une porte qu'on relit ici. `ranked`/`unranked` sont des sacs ouverts
 *  cote route.ts ; ce type ne fait que nommer ce qu'on ose lire, sans rien ajouter. */
export interface RouteGate {
  pool_id: string | null;
  hook: string;
  lp_fee_bps: number | null;
  lp_fee_bps_used?: number;
  hook_bps?: number | null;
  total_bps: number | null;
  label?: string;
  cost_basis?: string;
  measurement_id?: string;
  block_number?: number;
  direction?: string;
  replay?: string;
  measurements?: number;
  measurements_in_direction?: number;
  why?: string;
  why_fr?: string;
  size?: { requested_wei: string | null; used_wei: string; exact_match: boolean };
}

export function rankedGates(answer: RouteAnswer): RouteGate[] {
  return answer.ranked as unknown as RouteGate[];
}

export function unrankedGates(answer: RouteAnswer): RouteGate[] {
  return answer.unranked as unknown as RouteGate[];
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

/* ------------------------------------------------------------------ routage */

/**
 * PAR OU PASSER.
 *
 * C'est la question d'un utilisateur reel — "je veux echanger A contre B, par quel
 * pool ?" — et c'est celle a laquelle ce projet repond le plus mal si on la traite
 * comme une question de prix. Le recensement de decouverte dit que l'ecrasante
 * majorite des paires n'a QU'UNE porte. Pour celles-la il n'y a rien a recommander :
 * il y a un peage a connaitre. La narration doit le DIRE, pas afficher un classement
 * a un element qui laisserait croire a un choix.
 *
 * Ce fichier ne calcule aucun bps. Il resout la paire et appelle buildRouteAnswer()
 * de apps/api/src/route.ts ; la reponse voyage telle quelle dans PlanOut.route,
 * exactement comme `explain` transporte un texte deja ecrit et deja audite.
 */

/**
 * Les seuls symboles qu'on accepte de traduire en adresse. Ce ne sont pas des
 * mesures, ce sont des identifiants — mais un symbole mal traduit ferait repondre
 * sur une AUTRE paire que celle demandee, et la reponse aurait l'air juste. On en
 * met donc tres peu, et chacun est verifiable dans le recensement :
 *
 *   node -e "const r=require('./docs/dataset/pools-liquides-full.json');
 *     for (const a of ['<adresse>'])
 *       console.log(a, r.filter(x=>x[1][0].toLowerCase()===a||x[1][1].toLowerCase()===a).length)"
 *
 * Comptes obtenus par cette commande sur le recensement publie (bloc 50614000) :
 * weth 2362 pools, eth natif 1230, usdc 279. Un test de route-intent.test.ts refait
 * la verification a chaque execution, donc ces trois lignes ne peuvent pas pourrir
 * en silence. Toute autre ecriture (un symbole inconnu) n'est PAS devinee : la
 * reponse dit qu'elle n'a pas reconnu le jeton et demande son adresse.
 */
export const KNOWN_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  eth: "0x0000000000000000000000000000000000000000",
  weth: "0x4200000000000000000000000000000000000006",
  usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
});

const SYMBOL_RE = new RegExp(`\\b(${Object.keys(KNOWN_TOKENS).join("|")})\\b`, "g");
const ADDRESS_RE = /0x[0-9a-f]{40}/g;

/** Une question de routage : on demande par ou passer, ou on demande un echange. */
const ROUTE_ASK =
  /\bpar ou (?:passer|dois je passer)\b|\bpar quel pool\b|\bquel pool (?:prendre|utiliser|choisir|pour)\b|\bpar quelle porte\b|\bquelle porte\b|\bmeilleur pool\b|\broutage\b|\bwhich pool\b|\bbest pool\b|\bpar ou\b/;
const SWAP_VERB = /\b(echanger|echange|swap|swapper|convertir|convertis|vendre|acheter|trader)\b/;
const WEAK_ASK = /\bcontre\b|\b(?:for|against)\b/;

/** Le signal large : il suffit a regarder si la question porte deux jetons. */
export function detectRoute(qNormalized: string): boolean {
  return ROUTE_ASK.test(qNormalized) || SWAP_VERB.test(qNormalized) || WEAK_ASK.test(qNormalized);
}

/**
 * Le signal fort. "contre" tout seul ne suffit pas a voler une question au reste du
 * planificateur ("le registre contre la mesure" n'est pas une demande de routage) :
 * on ne le retient que quand DEUX jetons sont lus. Avec un seul jeton, il faut un
 * verbe d'echange ou une demande explicite de porte.
 */
export function strongRouteAsk(qNormalized: string): boolean {
  return ROUTE_ASK.test(qNormalized) || SWAP_VERB.test(qNormalized);
}

/**
 * Les deux jetons de la question, dans l'ordre ou ils sont ecrits — cet ordre EST
 * le sens du swap ("A contre B" = on vend A). On ne le reordonne pas en silence.
 */
export function extractPair(qRaw: string): { currencies: string[]; seen: number } {
  const q = normalize(qRaw);
  // Les pool_id d'abord : sans ca, leurs 40 premiers hex passeraient pour une adresse.
  const cleaned = q.replace(/0x[0-9a-f]{64}/g, " ");
  const found: { at: number; addr: string }[] = [];
  for (const m of cleaned.matchAll(ADDRESS_RE)) found.push({ at: m.index ?? 0, addr: m[0] });
  for (const m of cleaned.matchAll(SYMBOL_RE))
    found.push({ at: m.index ?? 0, addr: KNOWN_TOKENS[m[1]!]! });
  found.sort((a, b) => a.at - b.at);
  const currencies: string[] = [];
  for (const f of found) if (!currencies.includes(f.addr)) currencies.push(f.addr);
  return { currencies: currencies.slice(0, 2), seen: currencies.length };
}

/** Les jetons que le recensement connait. Sert a NE PAS prendre une adresse au
 *  hasard pour un jeton : ce qui n'est pas dans le recensement n'est pas promu. */
let tokenIndexCache: { census: Census; set: Set<string> } | null = null;
export function censusTokens(census: Census): Set<string> {
  if (tokenIndexCache && tokenIndexCache.census === census) return tokenIndexCache.set;
  const set = new Set<string>(Object.values(KNOWN_TOKENS));
  for (const p of census.pools) {
    set.add(p.currency0);
    set.add(p.currency1);
  }
  tokenIndexCache = { census, set };
  return set;
}

export interface RouteDeps {
  index?: PairIndex;
  census?: Census;
}

/** L'appel a la logique de route.ts. Aucun cout n'est compose ici. */
export function answerRoute(currencies: string[], deps: RouteDeps = {}): RouteAnswer {
  const index = deps.index ?? loadPairIndex();
  const census = deps.census ?? loadCensus();
  return buildRouteAnswer(
    {
      currency0: currencies[0]!,
      currency1: currencies[1]!,
      // Aucune taille n'est deduite d'un "1 ETH" ecrit en clair : il faudrait
      // supposer les decimales du jeton, et une taille supposee ferait repondre a
      // une autre question. Sans taille, route.ts classe sur le cout MESURE LE PLUS ELEVE
      // et le dit dans cost_basis ; la narration le repete.
      amount: null,
      // Le sens vient de l'ordre des jetons dans la phrase, pas d'un choix a nous.
      zeroForOne: null,
    },
    index,
    census,
  );
}

/**
 * LE REPLI QUAND LE PLAN VIENT D'UN MODELE.
 *
 * Le schema d'actions (actions.ts) n'a pas de case "paire de jetons" et ce chantier
 * n'a pas le droit d'y en ajouter une : le modele nomme donc les deux jetons dans
 * une action existante — le prompt systeme lui montre `highlight`, qui ne fait que
 * transporter des adresses et n'affirme rien.
 *
 * La garde qui rend ca acceptable : une adresse n'est retenue comme JETON que si le
 * recensement la connait comme tel. Un modele qui inventerait une adresse ne
 * fabrique donc pas une paire — il obtient une reponse qui dit qu'il n'y a pas de
 * paire. C'est la meme regle que partout : ce qui n'est pas lu n'est pas promu.
 */
export function routeFromActions(actions: Action[], deps: RouteDeps = {}): RouteAnswer | null {
  const census = deps.census ?? loadCensus();
  const known = censusTokens(census);
  const seen: string[] = [];
  const push = (a: string | null | undefined): void => {
    if (!a) return;
    const x = a.toLowerCase();
    if (known.has(x) && !seen.includes(x)) seen.push(x);
  };
  for (const a of actions) {
    if (a.type === "highlight") for (const h of a.hooks) push(h);
    else if (a.type === "open") push(a.hook);
    else if (a.type === "compare") {
      push(a.a);
      push(a.b);
    } else if (a.type === "filter") push(a.filter.hook);
  }
  if (seen.length < 2) return null;
  return answerRoute(seen.slice(0, 2), { ...deps, census });
}

/**
 * Les actions d'une reponse de routage. Elles ne transportent aucun cout : elles
 * disent quoi regarder. Une porte unique est OUVERTE (on sait laquelle) ; plusieurs
 * portes sont surlignees (le tableau ne sait pas filtrer sur plusieurs pools).
 */
export function routeActions(answer: RouteAnswer, store: StoreView): Action[] {
  const gates = [...rankedGates(answer), ...unrankedGates(answer)];
  if (gates.length === 0) return [{ type: "reset" }];
  const hooks = [...new Set(gates.map((g) => g.hook))].slice(0, 64);
  const only = gates.length === 1 ? gates[0]! : null;
  // On n'ouvre une fiche que si le magasin de l'assistant porte VRAIMENT ce couple :
  // les paires contestees sont mesurees dans un second fichier que dataset.ts ne lit
  // pas, et ouvrir une fiche absente afficherait un echec la ou il n'y a qu'un
  // fichier de plus a charger.
  const known =
    only !== null &&
    only.pool_id !== null &&
    (store.byHook.get(only.hook)?.profiles.some((p) => p.pool_id === only.pool_id) ?? false);
  if (only && known)
    return [
      { type: "reset" },
      { type: "filter", filter: { pool: only.pool_id! } },
      { type: "open", hook: only.hook, pool: only.pool_id! },
      { type: "highlight", hooks: [only.hook] },
    ];
  return [{ type: "reset" }, { type: "highlight", hooks }];
}

const DEFAULT_COLUMNS: ColumnName[] = ["hook", "registre", "mesure", "pools", "etiquette"];

/* ------------------------------------------------------------- le planning */

export function plan(
  question: string,
  store: StoreView,
  ctx: PlannerContext = {},
  /** injectable pour les tests : sans ca, le recensement et l'index sont lus sur disque */
  deps: RouteDeps = {},
): PlanOut {
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

  /* --- par ou passer : la question d'un utilisateur reel ------------------ */
  if (detectRoute(q)) {
    const pair = extractPair(question);
    // Les deux adresses doivent etre des JETONS que le recensement connait — la meme regle
    // que le chemin LLM applique deja (routeFromActions). Sans elle, « compare 0xHOOK contre
    // 0xHOOK » partait en routage : le mot « contre » suffisait a voler la question a
    // l'intention compare, avec deux adresses de hooks prises pour une paire de jetons.
    // Ce qui n'est pas lu comme jeton n'est pas promu jeton.
    // Deux regimes, parce que « contre » est ambigu et « echanger » ne l'est pas.
    //
    // Sur le signal FAIBLE (« A contre B », sans verbe d'echange), on exige que les deux
    // adresses soient des JETONS que le recensement connait. Sans cette regle, « compare
    // 0xHOOK contre 0xHOOK » partait en routage : le mot « contre » suffisait a voler la
    // question a l'intention compare, et deux adresses de hooks passaient pour une paire.
    //
    // Sur le signal FORT (« echanger A contre B », « par quel pool »), l'intention est
    // explicite : on repond meme si les jetons sont inconnus — la reponse sera NOT_MEASURED
    // avec le nombre de paires que le jeu couvre, ce qui vaut mieux que « je n'ai pas
    // compris ». On ne fabrique aucun cout pour autant.
    const connus = censusTokens(deps.census ?? loadCensus());
    const jetons = pair.currencies.filter((c) => connus.has(c.toLowerCase()));
    const explicite = strongRouteAsk(q);
    if (jetons.length === 2) pair.currencies = jetons;
    if (jetons.length === 2 || (explicite && pair.currencies.length === 2)) {
      const answer = answerRoute(pair.currencies, deps);
      const gates = [...rankedGates(answer), ...unrankedGates(answer)];
      why.push("question de routage : deux jetons lus dans la question, dans cet ordre");
      why.push(
        "cout, classement et refus de classer viennent de apps/api/src/route.ts (buildRouteAnswer) : rien n'est recalcule ici",
      );
      why.push(
        "aucune taille demandee : route.ts classe chaque porte sur son cout mesure le PLUS ELEVE, toutes tailles confondues, et l'ecrit dans cost_basis",
      );
      const base = mk(
        "route",
        routeActions(answer, store),
        "dire par quelle porte passe cette paire — et s'il n'y en a qu'une, le dire au lieu de classer",
      );
      return {
        ...base,
        route: answer,
        params: {
          ...base.params,
          // Les adresses de la question sont des JETONS, pas des hooks : `hooks` porte
          // les hooks des portes trouvees, pour que "ouvre le premier" ait un sens.
          hooks: [...new Set(gates.map((g) => g.hook))],
          currencies: pair.currencies,
        },
      };
    }
    if (pair.currencies.length === 1 && strongRouteAsk(q)) {
      why.push("question de routage, mais un seul jeton reconnu : on demande l'autre");
      const base = mk(
        "route",
        [
          {
            type: "clarify",
            question:
              "Je n'ai reconnu qu'un seul jeton dans cette question. Donne-moi les deux, en adresses completes : je ne devine pas un symbole que je ne connais pas, parce qu'un symbole mal traduit repondrait sur une autre paire et la reponse aurait l'air juste.",
          },
        ],
        "routage demande, paire incomplete : on demande plutot que de deviner",
      );
      return {
        ...base,
        route: null,
        params: { ...base.params, currencies: pair.currencies },
      };
    }
  }

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
