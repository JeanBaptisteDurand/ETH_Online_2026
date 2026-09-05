/**
 * L'INTENTION `explain` — le chat qui explique LE PRODUIT.
 *
 * Les autres intentions interrogent le jeu de mesures. Celle-ci n'interroge rien :
 * elle explique la METHODE et ses limites. Pourquoi on remplace le hook et pas le
 * pool, ce que veut dire chaque etiquette, pourquoi un bps eleve n'est pas
 * forcement un abus, ce que le registre ne sait pas dire.
 *
 * TROIS REGLES, les memes que partout ailleurs :
 *
 * 1. LE TEXTE N'EST PAS ECRIT PAR LE MODELE. Chaque article est ecrit ici, en dur,
 *    et passe par le MEME auditeur de nombres que la narration (narrate.ts) : un
 *    chiffre sans citation leve UncitedNumberError et l'article ne part pas. Le
 *    modele, lui, ne fait qu'une chose : CHOISIR l'article. C'est un choix dans une
 *    liste fermee, pas une redaction.
 *
 * 2. CHAQUE ARTICLE CITE SES SOURCES, et la citation est verifiee A L'EXECUTION :
 *    le passage est relu dans le fichier du depot au moment de repondre. Une section
 *    renommee ne devient pas un lien mort qui a l'air d'une preuve — elle devient un
 *    aveu (`passage: null`, `found: false`).
 *
 * 3. LE RAG NE PEUT PAS ETRE "VIDE PAR DEFAUT". GET /rag/search injoignable, lent,
 *    en erreur ou illisible => `grounded: false` et la raison est ECRITE dans la
 *    reponse. Zero passage rendu par un RAG qui a repondu 200, c'est autre chose, et
 *    ca se dit autrement. Ce projet a produit huit faux resultats en lisant une
 *    reponse manquante comme une reponse vide (docs/HONESTY.md).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "../paths.js";
import { Narration, type Citation } from "./narrate.js";
import type { StoreView } from "./store.js";
import { normalize } from "./planner.js";

/* ------------------------------------------------------------------ sources */

/** Le depot, tel qu'on peut le lire depuis un navigateur. */
export const SOURCE_BASE =
  process.env.TARE_SOURCE_BASE ??
  "https://github.com/JeanBaptisteDurand/ETH_Online_2026/blob/main";

export interface DocRef {
  /** chemin relatif a la racine du depot */
  file: string;
  /** le titre de section, mot pour mot, tel qu'il est ecrit dans le fichier */
  heading: string | null;
}

export interface ExplainSource {
  kind: "doctrine" | "rag";
  file: string;
  heading: string | null;
  /** lien cliquable vers le fichier, ancre sur la section quand il y en a une */
  url: string;
  /** le passage, MOT POUR MOT. null quand on n'a pas su le relire : jamais invente. */
  passage: string | null;
  /** la section a-t-elle ete retrouvee dans le fichier, maintenant ? */
  found: boolean;
  /** ligne de debut de la section dans le fichier (1-indexee), quand elle est connue */
  line: number | null;
  /** score de similarite rendu par le RAG. Jamais fabrique. */
  score: number | null;
  note: string | null;
}

/** L'ancre GitHub d'un titre markdown. Meme regle que GitHub : minuscules, ponctuation
 *  jetee, espaces en tirets. On l'applique au titre RELU DANS LE FICHIER, pas a un
 *  titre recopie de memoire. */
export function githubAnchor(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

interface Section {
  heading: string;
  line: number;
  body: string;
}

const fileCache = new Map<string, string[] | null>();
const sectionCache = new Map<string, Section | null>();

function readLines(file: string): string[] | null {
  if (fileCache.has(file)) return fileCache.get(file)!;
  let lines: string[] | null = null;
  try {
    lines = readFileSync(resolve(REPO_ROOT, file), "utf8").split("\n");
  } catch {
    lines = null;
  }
  fileCache.set(file, lines);
  return lines;
}

/** Vide les caches de lecture. Utile aux tests, et a un rechargement a chaud. */
export function resetDocCache(): void {
  fileCache.clear();
  sectionCache.clear();
}

/**
 * Retrouve une section markdown par son titre EXACT et rend son premier paragraphe.
 * Rien n'est devine : un titre absent rend null, et l'appelant l'ecrit.
 */
export function findSection(file: string, heading: string): Section | null {
  const key = `${file}\u0000${heading}`;
  if (sectionCache.has(key)) return sectionCache.get(key)!;
  const lines = readLines(file);
  let out: Section | null = null;
  if (lines) {
    const want = heading.trim();
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      const m = l.match(/^(#{1,6})\s+(.*?)\s*$/);
      if (!m || m[2] !== want) continue;
      const depth = m[1]!.length;
      const body: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const n = lines[j]!;
        const h = n.match(/^(#{1,6})\s+/);
        if (h && h[1]!.length <= depth) break;
        body.push(n);
      }
      out = { heading: want, line: i + 1, body: firstParagraph(body) };
      break;
    }
  }
  sectionCache.set(key, out);
  return out;
}

/** Le premier vrai paragraphe : on saute les lignes vides, on s'arrete au blanc suivant. */
function firstParagraph(lines: string[]): string {
  const kept: string[] = [];
  let started = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (!started && l === "") continue;
    if (started && l === "") break;
    started = true;
    kept.push(l);
    if (kept.join(" ").length > 420) break;
  }
  return kept.join(" ").replace(/\s+/g, " ").slice(0, 460);
}

export function sourceOf(ref: DocRef): ExplainSource {
  const sec = ref.heading ? findSection(ref.file, ref.heading) : null;
  const anchor = sec ? `#${githubAnchor(sec.heading)}` : "";
  return {
    kind: "doctrine",
    file: ref.file,
    heading: ref.heading,
    url: `${SOURCE_BASE}/${ref.file}${anchor}`,
    passage: sec ? sec.body : null,
    found: ref.heading === null ? readLines(ref.file) !== null : sec !== null,
    line: sec ? sec.line : null,
    score: null,
    note: sec
      ? null
      : ref.heading === null
        ? readLines(ref.file) === null
          ? "fichier introuvable dans ce depot : le lien est publie, le passage ne l'est pas"
          : null
        : "section introuvable dans ce depot aujourd'hui : je publie le lien, pas un passage invente",
  };
}

/* ------------------------------------------------------- morceaux de phrase */

export type Seg =
  | { k: "t"; s: string }
  | { k: "i"; s: string }
  | { k: "n"; token: string; cite: Omit<Citation, "token"> };

/** de la prose : elle ne doit contenir aucun chiffre */
const t = (s: string): Seg => ({ k: "t", s });
/** un identifiant recopie d'une source (un nom de type, une formule, un chemin) */
const i = (s: string): Seg => ({ k: "i", s });
/** un nombre et sa provenance */
const n = (token: string, cite: Omit<Citation, "token">): Seg => ({ k: "n", token, cite });

const METHOD = "docs/METHOD.md";
const LIMITS = "docs/LIMITS.md";
const HONESTY = "docs/HONESTY.md";

const konst = (what: string, source: string): Omit<Citation, "token"> => ({
  kind: "constant",
  what,
  source,
});

export interface DoctrineCtx {
  dataset: StoreView["dataset"];
  registry: StoreView["registry"];
}

export interface DoctrineArticle {
  id: string;
  title: string;
  /** mots qui font pencher vers cet article (deja normalises : sans accent, minuscules) */
  keys: string[];
  /** tournures qui suffisent a elles seules : elles emportent la decision */
  strong: string[];
  body: (ctx: DoctrineCtx) => Seg[];
  refs: DocRef[];
  /** la requete envoyee au RAG vectoriel pour ancrer cet article */
  ragQuery: string;
}

/* ------------------------------------------------------------- LA DOCTRINE */

export const DOCTRINE: DoctrineArticle[] = [
  {
    id: "hook-not-pool",
    title: "Pourquoi on remplace le hook, et pas le pool",
    keys: [
      "hook",
      "pool",
      "remplace",
      "remplacer",
      "stub",
      "bytecode",
      "setcode",
      "substitue",
      "echange",
      "code",
      "inerte",
      "fork",
      "epingle",
    ],
    strong: [
      "pourquoi le hook et pas le pool",
      "pourquoi remplacer le hook",
      "pourquoi on remplace le hook",
      "pourquoi pas le pool",
      "comment vous mesurez",
      "comment ca marche la mesure",
      "que fait le stub",
      "c est quoi le stub",
    ],
    body: () => [
      t("TARE ne change pas le pool : il change le hook. Sur un fork epingle, "),
      i("anvil_setCode"),
      t(" reecrit le bytecode A L'ADRESSE DU HOOK, et rien d'autre. La "),
      i("PoolKey"),
      t(" n'est pas touchee, donc le "),
      i("poolId"),
      t(" reste identique octet pour octet ; "),
      i("slot0"),
      t(", le tick, les champs de frais et la carte des positions ne bougent pas. Le meme swap est ensuite cote deux fois par "),
      i("V4Quoter"),
      t(", avec des arguments identiques, et une seule chose differe entre les deux appels : le code qui s'execute. C'est ce qui en fait une mesure et pas une comparaison. Changer le pool, lui, casserait tout : deux pools differents ne sont pas un contrefactuel, ce sont deux sujets, et l'ecart entre eux ne dit rien du hook. Le bytecode d'origine est capture avant l'ecriture et remis dans un "),
      i("finally"),
      t(", pour qu'un plantage en cours de cotation ne laisse jamais un hook stubbe."),
    ],
    refs: [
      { file: METHOD, heading: "2. The trick" },
      { file: METHOD, heading: "3. The stub, and the invariants it has to satisfy" },
    ],
    ragQuery: "remplacer le bytecode du hook, pas le pool, anvil_setCode, meme poolId, deux cotations",
  },
  {
    id: "stub-compliant",
    title: "Le stub inerte : pourquoi il ne peut pas etre un compte vide",
    keys: ["stub", "octets", "inerte", "vide", "noop", "hooks.sol", "retour", "revert", "compte"],
    strong: [
      "pourquoi un stub",
      "pourquoi pas une adresse vide",
      "pourquoi pas supprimer le hook",
      "taille du stub",
      "combien d octets",
    ],
    body: () => [
      t("Le stub doit etre un no-op CONFORME, pas un compte vide. Une adresse sans code echoue aux verifications de forme de retour de "),
      i("Hooks.sol"),
      t(" : la cotation ne rend pas un resultat moins bon, elle revert, et on n'a plus rien a comparer. Le stub fait "),
      n("89", konst("taille du stub inerte conforme, en octets", `${METHOD}, section 3`)),
      t(" octets, et ces octets n'existent que pour rendre le contrefactuel ATTEIGNABLE. Il ne simule pas un hook gentil : il rend la permission, dans la forme attendue, sans rien prelever."),
    ],
    refs: [
      { file: METHOD, heading: "3. The stub, and the invariants it has to satisfy" },
      { file: LIMITS, heading: "8. The stub is a counterfactual, not an option" },
    ],
    ragQuery: "stub inerte conforme Hooks.sol 89 octets, une adresse sans code fait revert la cotation",
  },
  {
    id: "counterfactual",
    title: "Le stub est un contrefactuel, pas une option offerte a l'utilisateur",
    keys: [
      "contrefactuel",
      "counterfactual",
      "economiser",
      "eviter",
      "option",
      "monde",
      "alternative",
      "sans le hook",
    ],
    strong: [
      "est ce que je peux eviter le hook",
      "combien j economise",
      "que se passe t il sans le hook",
      "c est quoi un contrefactuel",
      "pourquoi contrefactuel",
    ],
    body: () => [
      t(
        "Personne ne peut retirer un hook d'un pool vivant. La comparaison que trace TARE est entre le monde et un monde inatteignable. C'est precisement ce qui en fait une mesure propre — les deux cotations ne different que par une variable — et c'est aussi pourquoi le resultat ne doit JAMAIS se dire \"tu economiserais tant en evitant ce hook\". On ne peut pas l'eviter et garder le pool : le pool EST le hook.",
      ),
    ],
    refs: [{ file: LIMITS, heading: "8. The stub is a counterfactual, not an option" }],
    ragQuery: "le stub est un contrefactuel, on ne peut pas retirer le hook du pool, pas une economie",
  },
  {
    id: "labels",
    title: "Les quatre etiquettes, et pourquoi aucune n'est promue",
    keys: [
      "etiquette",
      "etiquettes",
      "label",
      "labels",
      "measured",
      "mesure",
      "interpolated",
      "interpole",
      "not_measurable",
      "non mesurable",
      "not_quotable",
      "non cotable",
      "quatre",
    ],
    strong: [
      "les quatre etiquettes",
      "que veulent dire les etiquettes",
      "c est quoi les etiquettes",
      "quelles sont les etiquettes",
      "explique les etiquettes",
    ],
    body: () => [
      t(
        "Quatre etiquettes, jamais promues l'une vers l'autre. MEASURED : le contrefactuel a tourne, les deux cotations ont rendu un montant, l'ecart est la valeur. INTERPOLATED : aucune mesure n'existe a la taille demandee, mais deux points MEASURED l'encadrent sur le meme pool, le meme sens et le meme bloc — la valeur a ete calculee, pas observee, et elle ne deviendra jamais une mesure. NOT_QUOTABLE : on a demande et le pool a dit non ; la cotation a revert, presque toujours faute de liquidite. NOT_MEASURABLE : on n'a pas pu regarder, ou le contrefactuel n'a pas de sens ici. Aucune de ces deux dernieres n'est un zero : ce sont des absences de lecture, et le corpus garde la ligne pour que l'absence occupe sa place au lieu de retrecir silencieusement le denominateur de toutes les statistiques calculees ensuite.",
      ),
    ],
    refs: [
      { file: HONESTY, heading: "`MEASURED`" },
      { file: HONESTY, heading: "`INTERPOLATED`" },
      { file: HONESTY, heading: "`NOT_QUOTABLE`" },
      { file: HONESTY, heading: "`NOT_MEASURABLE`" },
    ],
    ragQuery: "les quatre etiquettes MEASURED INTERPOLATED NOT_QUOTABLE NOT_MEASURABLE et ce qu'elles ne veulent pas dire",
  },
  {
    id: "label-measured",
    title: "MEASURED : ce que l'etiquette dit, et ce qu'elle ne dit pas",
    keys: ["measured", "mesure", "etiquette", "label", "valeur", "observe"],
    strong: ["que veut dire measured", "c est quoi measured", "signification de measured"],
    body: () => [
      t(
        "MEASURED veut dire : a ce bloc, sur ce pool, pour cette taille et ce sens, remplacer le code du hook par un no-op conforme a change la cotation de tant. Ca ne veut PAS dire \"ce hook prend ce frais\". Attribuer cet ecart a un frais, a une remise, a du routage ou a de la comptabilite propre au hook est une INTERPRETATION, et nous n'avons lu le code d'aucun hook.",
      ),
    ],
    refs: [
      { file: HONESTY, heading: "`MEASURED`" },
      { file: LIMITS, heading: "6. A high bps is not an abuse — and we have not read the hooks' code" },
    ],
    ragQuery: "MEASURED signifie que le contrefactuel a tourne, pas que le hook prend un frais",
  },
  {
    id: "label-not-measurable",
    title: "NOT_MEASURABLE : une absence de lecture, jamais un zero",
    keys: [
      "not_measurable",
      "non mesurable",
      "absence",
      "zero",
      "rpc",
      "timeout",
      "rate limit",
      "concurrent",
      "comptabilite",
      "custom accounting",
    ],
    strong: [
      "que veut dire not_measurable",
      "c est quoi not_measurable",
      "pourquoi not_measurable",
      "pourquoi pas zero",
    ],
    body: () => [
      t(
        "NOT_MEASURABLE couvre trois situations distinctes, et le champ `reason` dit toujours laquelle. Le noeud a echoue — limite de debit, delai depasse, un etat qu'anvil n'a pas su reconstituer : c'est l'INSTRUMENT qui a casse, pas le sujet. Ou bien le stub etait deja installe en arrivant, donc un autre processus tenait ce fork et tout ce qu'on aurait cote aurait decrit SON stub. Ou bien la cotation avec stub est revenue MEILLEURE que la vraie, largement : le hook ne preleve pas sur un pool, le hook EST la liquidite, et le retirer ne revele pas un frais, ca detruit le lieu. Dans les trois cas la ligne ne porte aucun nombre. Ce n'est pas zero, ce n'est pas \"pas de frais\", c'est l'absence d'une lecture.",
      ),
    ],
    refs: [
      { file: HONESTY, heading: "`NOT_MEASURABLE`" },
      { file: LIMITS, heading: "4. Custom accounting: the counterfactual is meaningless, by construction" },
    ],
    ragQuery: "NOT_MEASURABLE rpc_unavailable concurrent_measurer custom accounting, une absence de lecture pas un zero",
  },
  {
    id: "label-not-quotable",
    title: "NOT_QUOTABLE : le pool a dit non",
    keys: ["not_quotable", "non cotable", "revert", "liquidite", "sens", "direction", "refus"],
    strong: [
      "que veut dire not_quotable",
      "c est quoi not_quotable",
      "pourquoi le pool refuse",
      "pourquoi pas de cotation",
    ],
    body: () => [
      t(
        "NOT_QUOTABLE veut dire qu'on a demande et que le pool a refuse : la cotation a revert avec une erreur du protocole, en pratique presque toujours un manque de liquidite pour cette taille et ce sens. La ligne garde la raison. Ca ne veut pas dire que le pool est mort, et ca ne dit RIEN du hook : dans ce corpus, la plupart des pools ne cotent que dans un seul sens, et l'autre sens de chacun d'eux est un NOT_QUOTABLE qui n'apprend rien sur le prelevement.",
      ),
    ],
    refs: [{ file: HONESTY, heading: "`NOT_QUOTABLE`" }],
    ragQuery: "NOT_QUOTABLE le quoter revert NotEnoughLiquidity, un seul sens cotable",
  },
  {
    id: "label-interpolated",
    title: "INTERPOLATED : calcule, jamais observe",
    keys: ["interpolated", "interpole", "entre", "calcule", "extrapole", "encadre"],
    strong: [
      "que veut dire interpolated",
      "c est quoi interpolated",
      "vous interpolez",
      "pourquoi interpole",
    ],
    body: () => [
      t(
        "INTERPOLATED veut dire qu'aucune mesure n'existe a la taille demandee, mais que deux points MEASURED l'encadrent sur le meme pool, le meme sens et le meme bloc. La valeur a ete CALCULEE entre eux, pas observee, et elle ne devient jamais une mesure. En dehors de l'intervalle mesure, rien n'est rendu : on refuse d'extrapoler, on rend une raison. Le corpus livre ne contient aucune ligne INTERPOLATED — chaque nombre publie a ete observe.",
      ),
    ],
    refs: [{ file: HONESTY, heading: "`INTERPOLATED`" }],
    ragQuery: "INTERPOLATED calcule entre deux points mesures, refus d'extrapoler",
  },
  {
    id: "high-bps-not-abuse",
    title: "Un bps eleve n'est pas un abus",
    keys: [
      "abus",
      "abusif",
      "arnaque",
      "scam",
      "vol",
      "malhonnete",
      "eleve",
      "gros",
      "beaucoup",
      "legitime",
      "legitimite",
      "frais",
      "fee",
      "juge",
      "mechant",
      "dangereux",
    ],
    strong: [
      "un bps eleve est il un abus",
      "est ce que c est un abus",
      "est ce un scam",
      "est ce que le hook vole",
      "pourquoi ce n est pas un abus",
      "est ce que c est grave",
      "est ce que c est legitime",
    ],
    body: () => [
      t(
        "La mesure est une GRANDEUR. Elle est muette sur la legitimite. Un frais de lancement affiche ouvertement et un prelevement silencieux produisent EXACTEMENT la meme lecture, parce que l'instrument compare du bytecode a de l'absence de bytecode et n'a aucune opinion sur ce que ce bytecode avait le droit de faire. Deux faits du corpus vont dans ce sens : la plupart des lignes elevees a frais stocke nul se trouvent sur des pools dont la ",
      ),
      i("PoolKey"),
      t(
        " porte le drapeau de frais dynamique, c'est-a-dire le mecanisme sanctionne par le protocole lui-meme ; et les hooks concernes sont de l'infrastructure de lancement publique et nommee. Le fait interessant n'est pas qu'un champ soit nul, c'est qu'AUCUN champ nulle part n'enregistre la grandeur. C'est pour ca que ce corpus existe. Nous n'avons lu le code d'aucun hook.",
      ),
    ],
    refs: [
      { file: LIMITS, heading: "6. A high bps is not an abuse — and we have not read the hooks' code" },
      { file: HONESTY, heading: "What we refuse to say" },
    ],
    ragQuery: "un bps eleve n'est pas un abus, la mesure est une grandeur muette sur la legitimite, frais dynamique",
  },
  {
    id: "registry-limits",
    title: "Ce que le registre ne sait pas dire",
    keys: [
      "registre",
      "registry",
      "allowlist",
      "hooklist",
      "fiche",
      "declare",
      "declaration",
      "vanillaswap",
      "champ",
      "verite",
      "officiel",
    ],
    strong: [
      "que dit le registre",
      "a quoi sert le registre",
      "le registre est il fiable",
      "pourquoi le registre se trompe",
      "ce que le registre ne sait pas",
      "c est quoi le registre",
    ],
    body: (ctx) => [
      t("Le registre officiel est une DESCRIPTION, pas une verite terrain. Ses champs sont des booleens et un enum : "),
      t("pas un seul n'est une grandeur. Il peut dire qu'un hook PEUT executer "),
      i("beforeSwap"),
      t(" ; il ne peut pas dire ce que ca coute. Il est aussi incomplet, et indexe d'une facon qui trompe : plusieurs adresses y sont declarees sur plusieurs chaines, parce que les hooks sont mines en "),
      i("CREATE2"),
      t(" pour leurs bits de permission et que la meme adresse se redeploie ailleurs — un index a la seule adresse attache la premiere fiche rencontree, ce qui a deja produit un faux resultat dans ce projet. En revanche les "),
      n("14", konst("nombre de permissions declarees par les bits bas d'une adresse de hook", "Hooks.sol, engine/tare/flags.py")),
      t(" bits de permission, eux, SONT une verite terrain : ils sont l'adresse. Les permissions sont exactes, les grandeurs sont mesurees, et le registre ne fournit ni les unes ni les autres. Le registre charge ici porte "),
      n(String(ctx.registry.entries), {
        kind: "count",
        what: "fiches du registre chargees par cette instance",
        source: ctx.registry.path ?? "aucun registre charge",
        derived_from: "entrees lues dans le fichier de registre au demarrage de l'assistant",
      }),
      t(" fiche(s)."),
    ],
    refs: [
      { file: LIMITS, heading: "7. The registry is a description, not a ground truth" },
      { file: HONESTY, heading: "#6 — a registry entry from the wrong chain attached to a Base measurement" },
    ],
    ragQuery: "le registre est une description pas une verite terrain, aucun champ n'est une grandeur, CREATE2 multi-chaines",
  },
  {
    id: "no-number-from-model",
    title: "Pourquoi le modele ne produit jamais un nombre",
    keys: [
      "modele",
      "llm",
      "ia",
      "gpt",
      "hallucine",
      "hallucination",
      "invente",
      "invention",
      "chiffre",
      "nombre",
      "auditeur",
      "confiance",
    ],
    strong: [
      "le modele invente il",
      "pourquoi le modele ne produit pas de nombre",
      "est ce que l ia invente",
      "comment je sais que tu n inventes pas",
      "pourquoi je te ferais confiance",
      "est ce que tu hallucines",
    ],
    body: () => [
      t(
        "Le modele choisit QUOI interroger et explique ce qui revient. Il ne produit jamais un nombre. Techniquement : il ne recoit aucune valeur mesuree, seulement le catalogue d'actions et l'inventaire des hooks ; sa sortie est une liste d'actions typees validee par un schema strict, ou une cle inconnue fait echouer la liste entiere ; et toute phrase qu'il propose passe par un auditeur qui masque les identifiants puis exige qu'il reste zero chiffre sans citation. Une phrase fautive n'est pas corrigee, elle est JETEE — une phrase corrigee garderait la forme d'une affirmation que personne n'a verifiee — et le remplacement est ecrit dans la reponse. Les nombres viennent du moteur, de l'API et du corpus commit, et chacun se rejoue en une commande.",
      ),
    ],
    refs: [
      { file: HONESTY, heading: "What we refuse to say" },
      { file: "README.md", heading: "The honesty rules" },
    ],
    ragQuery: "le modele ne produit jamais un nombre, il choisit quoi interroger, auditeur de citations",
  },
  {
    id: "one-measurer",
    title: "Un seul mesureur par anvil, sinon les nombres sont de la fiction",
    keys: [
      "anvil",
      "mesureur",
      "parallele",
      "concurrent",
      "fork",
      "shard",
      "port",
      "processus",
      "simultane",
    ],
    strong: [
      "pourquoi un seul mesureur",
      "puis je mesurer en parallele",
      "pourquoi un fork par processus",
      "c est quoi le probleme du parallele",
    ],
    body: () => [
      t("Le stub est un ETAT GLOBAL MUTABLE du noeud. Deux processus de mesure sur un meme "),
      i("anvil"),
      t(
        " lisent le stub l'un de l'autre, et le mode de defaillance n'est pas une erreur : c'est un nombre propre, plausible et FAUX. C'est arrive dans ce projet — une valeur elevee est devenue une valeur nulle. Qui rejoue la campagne doit lancer un processus par fork, sur son propre port. Le garde-fou transforme la violation en refus etiquete plutot qu'en nombre.",
      ),
    ],
    refs: [
      { file: LIMITS, heading: "9. One measurer per anvil, or the numbers are fiction" },
      { file: HONESTY, heading: "#5 — two measurers on one fork: **100 bps became 0.00**" },
    ],
    ragQuery: "un seul mesureur par anvil, le stub est un etat global, deux processus produisent un faux nombre",
  },
  {
    id: "bps-definition",
    title: "Ce qu'un bps veut dire ici, exactement",
    keys: ["bps", "point de base", "basis point", "pourcentage", "unite", "formule", "calcul"],
    strong: [
      "c est quoi un bps",
      "que veut dire bps",
      "comment est calcule le bps",
      "c est quoi un point de base",
      "quelle est la formule",
    ],
    body: () => [
      t("Un point de base ici, c'est l'ecart RELATIF entre les deux cotations : "),
      i("bps = (sortie_sans_hook − sortie_avec_hook) / sortie_sans_hook"),
      t(" multiplie par "),
      n("10000", konst("base des points de base : un point de base est un dix-millieme", `${METHOD}, section 2`)),
      t(
        ". C'est une grandeur attachee a un bloc, un pool, une taille et un sens : changer l'un des quatre change le nombre. Un resultat negatif n'est pas un prelevement negatif ; en dessous d'un seuil publie la ligne devient NOT_MEASURABLE avec la raison \"comptabilite propre\" et ne porte aucun nombre.",
      ),
    ],
    refs: [
      { file: METHOD, heading: "2. The trick" },
      { file: HONESTY, heading: "What we refuse to say" },
    ],
    ragQuery: "formule du bps, ecart relatif entre les deux cotations, dix mille, negatif custom accounting",
  },
  {
    id: "corpus-scope",
    title: "Ce que le corpus couvre, et ce qu'il ne couvre pas",
    keys: [
      "corpus",
      "jeu",
      "dataset",
      "couverture",
      "combien",
      "population",
      "echantillon",
      "representatif",
      "chaine",
      "bloc",
      "portee",
      "limite",
      "limites",
    ],
    strong: [
      "que couvre le corpus",
      "c est quoi le corpus",
      "est ce representatif",
      "quelles sont les limites",
      "combien de mesures",
      "sur quoi vous avez mesure",
    ],
    body: (ctx) => [
      t("Cette instance a charge "),
      n(String(ctx.dataset.measurements), {
        kind: "count",
        what: "lignes de mesure chargees",
        source: ctx.dataset.source,
        derived_from: "lignes du JSONL relues au demarrage, lignes rejetees comptees a part",
      }),
      t(" ligne(s), sur "),
      n(String(ctx.dataset.pools), {
        kind: "count",
        what: "pools distincts du corpus",
        source: ctx.dataset.source,
        derived_from: "pool_id distincts dans les lignes chargees",
      }),
      t(" pool(s) et "),
      n(String(ctx.dataset.hooks), {
        kind: "count",
        what: "hooks distincts du corpus",
        source: ctx.dataset.source,
        derived_from: "adresses de hook distinctes dans les lignes chargees",
      }),
      t(" hook(s)"),
      ...(ctx.dataset.blocks.length === 1
        ? [
            t(", au bloc "),
            n(String(ctx.dataset.blocks[0]), {
              kind: "block",
              what: "bloc du fork epingle sur lequel tout le corpus a ete cote",
              source: ctx.dataset.source,
            }),
          ]
        : []),
      t(
        ". Ce n'est pas la population : c'est un echantillon d'une chaine, pris a un instant, et ce n'est meme pas un echantillon propre. Tout ce qui est en dehors n'est pas mesure, et ce qui n'est pas mesure n'est pas zero. Une cotation n'est pas non plus un swap : elle ne subit ni glissement de prix par un autre echange dans le meme bloc, ni ordonnancement.",
      ),
    ],
    refs: [
      { file: LIMITS, heading: "2. 199 pools is not the population, and it is not even a clean sample" },
      { file: LIMITS, heading: "5. A quote is not a swap" },
    ],
    ragQuery: "le corpus n'est pas la population, une chaine un bloc, une cotation n'est pas un swap",
  },
  {
    id: "replay",
    title: "Comment rejouer n'importe quelle valeur",
    keys: ["rejouer", "rejeu", "replay", "verifier", "verification", "commande", "reproduire", "preuve"],
    strong: [
      "comment je verifie",
      "comment rejouer",
      "puis je verifier",
      "comment reproduire",
      "ou est la preuve",
    ],
    body: () => [
      t(
        "Chaque valeur du corpus porte sa ligne, son bloc, sa taille, son sens, son etiquette et la COMMANDE EXACTE qui la reproduit. La commande relance la meme cotation double sur un fork epingle au meme bloc : elle ne rejoue pas un enregistrement, elle refait la mesure. Demande-moi la preuve d'une ligne par son identifiant et je te rends la ligne brute avec sa commande ; le fork doit tourner de ton cote, et un seul processus de mesure par fork.",
      ),
    ],
    refs: [
      { file: METHOD, heading: "9. Replay" },
      { file: "README.md", heading: "Reproduce any number" },
    ],
    ragQuery: "rejouer une valeur, commande exacte, fork epingle au meme bloc",
  },
  {
    id: "what-tare-is",
    title: "Ce que TARE mesure, en une phrase",
    keys: ["tare", "produit", "projet", "sert", "utilite", "quoi", "presentation"],
    strong: [
      "c est quoi tare",
      "que fait tare",
      "a quoi sert tare",
      "explique moi tare",
      "explique le produit",
      "de quoi ca parle",
      "presente moi le projet",
    ],
    body: () => [
      t(
        "TARE mesure ce qu'un hook Uniswap prend reellement sur un swap. Aucun champ de la chaine ne l'enregistre : le registre officiel decrit des permissions, pas des grandeurs. Alors on fabrique le contrefactuel — sur un fork epingle, le bytecode du hook est remplace par un stub inerte conforme, le meme swap est cote deux fois, et l'ecart EST le prelevement. Ce que ca ne dit pas : si ce prelevement est legitime. C'est une grandeur, pas un jugement.",
      ),
    ],
    refs: [
      { file: METHOD, heading: "1. The wall" },
      { file: METHOD, heading: "2. The trick" },
    ],
    ragQuery: "TARE mesure ce qu'un hook prend sur un swap, aucun champ ne l'enregistre, contrefactuel",
  },
];

export const DOCTRINE_IDS: string[] = DOCTRINE.map((a) => a.id);

export function articleById(id: string): DoctrineArticle | null {
  return DOCTRINE.find((a) => a.id === id) ?? null;
}

/** Rend le texte d'un article, AUDITE : un chiffre non source y leve UncitedNumberError. */
export function renderArticle(
  a: DoctrineArticle,
  ctx: DoctrineCtx,
  tail = "",
): { text: string; citations: Citation[]; identifiers: string[] } {
  const nar = new Narration();
  for (const seg of a.body(ctx)) {
    if (seg.k === "t") nar.text(seg.s);
    else if (seg.k === "i") nar.ident(seg.s);
    else nar.num(seg.token, seg.cite);
  }
  // La phrase de cloture est de la prose comme le reste : elle passe par le meme
  // auditeur. Un chiffre s'y glisserait qu'elle ne partirait pas.
  if (tail) nar.text(tail);
  return nar.build();
}

/* ------------------------------------------------------------- la detection */

/** Les tournures qui signalent une demande d'EXPLICATION plutot qu'une interrogation du jeu. */
const ASK_MARKERS = [
  "pourquoi",
  "explique",
  "expliques",
  "explication",
  "que veut dire",
  "qu est ce que",
  "qu est ce qu",
  "c est quoi",
  "ca veut dire quoi",
  "veut dire quoi",
  "signifie",
  "signification",
  "comment ca marche",
  "comment ca fonctionne",
  "comment vous",
  "comment tu",
  "comment fais tu",
  "comment est ce que",
  "a quoi sert",
  "quelle est la difference",
  "c est quoi la difference",
  "en quoi",
  "est ce que c est",
  "est ce un",
  "est ce que je peux",
  "puis je",
  "dis moi",
  "parle moi",
  "presente",
  "what is",
  "why ",
  "how do you",
  "how does",
  "what does",
  "explain",
  "meaning of",
];

/** Ce qui trahit une interrogation du JEU, pas une question de doctrine. */
const DATA_SHAPES = [
  /0x[0-9a-fA-F]{40}/,
  /\bm_[0-9a-f]{16}\b/,
  /(?:moins de|plus de|sous|au dessus de|superieur|inferieur|under|over|above|below)\s*[0-9]/,
];

export interface ExplainMatch {
  topic: string;
  title: string;
  score: number;
  hits: string[];
  /** vrai quand une tournure entiere a emporte la decision, sans avoir besoin d'un marqueur */
  strong: boolean;
}

/**
 * La detection deterministe. Elle ne devine pas : elle exige soit une tournure
 * doctrinale entiere, soit un marqueur d'explication ET un article qui accroche.
 */
export function detectExplain(question: string): ExplainMatch | null {
  const q = " " + normalize(question) + " ";
  const marker = ASK_MARKERS.find((m) => q.includes(" " + m) || q.includes(m + " ")) ?? null;
  const dataShaped = DATA_SHAPES.some((re) => re.test(question) || re.test(q));

  let best: ExplainMatch | null = null;
  for (const a of DOCTRINE) {
    const hits: string[] = [];
    let score = 0;
    let strong = false;
    for (const s of a.strong) {
      if (q.includes(s)) {
        score += 10;
        strong = true;
        hits.push(`tournure: ${s}`);
      }
    }
    for (const k of a.keys) {
      const re = new RegExp(`(^|[^a-z0-9])${escapeRe(k)}([^a-z0-9]|$)`);
      if (re.test(q)) {
        score += 1;
        hits.push(k);
      }
    }
    if (score === 0) continue;
    if (!best || score > best.score) best = { topic: a.id, title: a.title, score, hits, strong };
  }
  if (!best) return null;

  // Une question qui porte une adresse, un id de mesure ou un seuil interroge le JEU.
  // Elle ne devient une explication que si une tournure entiere le dit.
  if (dataShaped && !best.strong) return null;
  if (best.strong) return best;
  if (!marker) return null;
  return best;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* -------------------------------------------------------------------- RAG */

export interface RagPassage {
  file: string;
  heading: string | null;
  passage: string;
  score: number | null;
  line: number | null;
}

export interface RagOutcome {
  ok: boolean;
  passages: RagPassage[];
  /** pourquoi il n'y a rien : jamais confondu avec "il n'y a rien a trouver" */
  reason: string | null;
  detail: string | null;
  url: string | null;
}

export interface RagOptions {
  /** URL complete de GET /rag/search, sans la requete */
  url?: string | null;
  timeoutMs?: number;
  topK?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Le RAG vectoriel, servi par `python3 -m tare.rag.serve` (engine/tare/rag/serve.py).
 *
 * Cette constante a pointe pendant des jours vers 8787/rag/search, ou RIEN n'ecoutait :
 * l'API Hono n'a jamais expose cette route. Chaque explication repartait donc avec
 * « RAG indisponible : HTTP 404 » dans son journal et se rabattait sur les regles, sans que
 * personne le remarque — le repli fonctionnait trop bien. Le RAG etait construit, indexe,
 * mesure, et jamais interroge par la seule surface qui en avait besoin.
 */
export const DEFAULT_RAG_URL =
  process.env.TARE_RAG_URL ?? "http://127.0.0.1:8789/search";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * Lit ce que rend GET /rag/search sans exiger une forme precise : le lot N est
 * ecrit a cote, et un contrat trop rigide ferait passer un RAG present pour un RAG
 * absent. Ce qui est rigide, en revanche : un passage sans fichier ET sans texte
 * n'est pas une source, il est jete.
 */
export function readRagPayload(body: unknown): RagPassage[] {
  const root = body as Record<string, unknown> | unknown[] | null;
  let list: unknown[] = [];
  if (Array.isArray(root)) list = root;
  else if (root && typeof root === "object") {
    for (const key of ["results", "passages", "hits", "matches", "chunks", "documents"]) {
      const v = (root as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        list = v;
        break;
      }
    }
  }
  const out: RagPassage[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const meta = (r.metadata && typeof r.metadata === "object" ? r.metadata : {}) as Record<string, unknown>;
    const file = str(r.file) ?? str(r.path) ?? str(r.source) ?? str(r.doc) ?? str(meta.file) ?? str(meta.path) ?? str(meta.source);
    const passage =
      str(r.text) ?? str(r.passage) ?? str(r.excerpt) ?? str(r.chunk) ?? str(r.content) ?? str(r.snippet);
    if (!file && !passage) continue;
    const scoreRaw = r.score ?? r.similarity ?? r.distance ?? meta.score;
    const lineRaw = r.line ?? r.start_line ?? r.lineno ?? meta.line;
    out.push({
      file: file ?? "(source non nommee par le RAG)",
      heading: str(r.heading) ?? str(r.section) ?? str(r.title) ?? str(meta.heading) ?? str(meta.section),
      passage: passage ?? "",
      score: typeof scoreRaw === "number" && Number.isFinite(scoreRaw) ? scoreRaw : null,
      line: typeof lineRaw === "number" && Number.isInteger(lineRaw) ? lineRaw : null,
    });
  }
  return out;
}

/**
 * Interroge le RAG vectoriel. Toute panne rend `ok:false` AVEC SA RAISON.
 * Un echec n'est jamais rendu comme "zero passage" : ce sont deux etats differents,
 * et les confondre est exactement ce qui a produit les faux resultats de ce projet.
 */
export async function ragSearch(query: string, opts: RagOptions = {}): Promise<RagOutcome> {
  const base = opts.url === undefined ? DEFAULT_RAG_URL : opts.url;
  if (!base)
    return {
      ok: false,
      passages: [],
      reason: "rag_desactive",
      detail: "aucune URL de RAG configuree",
      url: null,
    };
  // 4 000 ms etait sous le temps de reponse REEL du RAG : mesure entre 3,2 et 9,6 s sur
  // cette machine pendant qu'elle porte quatre balayages. Un delai trop court transforme un
  // RAG qui marche en « RAG indisponible », et fait chercher la panne au mauvais endroit.
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const topK = opts.topK ?? 4;
  const url = `${base}${base.includes("?") ? "&" : "?"}q=${encodeURIComponent(query)}&k=${topK}`;
  const f = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await f(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!r.ok)
      return {
        ok: false,
        passages: [],
        reason: "rag_erreur_http",
        detail: `HTTP ${r.status}`,
        url,
      };
    const text = await r.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch (e) {
      return {
        ok: false,
        passages: [],
        reason: "rag_reponse_illisible",
        detail: (e as Error).message.slice(0, 200),
        url,
      };
    }
    const passages = readRagPayload(body).slice(0, topK);
    return { ok: true, passages, reason: null, detail: null, url };
  } catch (e) {
    const err = e as Error;
    const aborted = err.name === "AbortError" || ctrl.signal.aborted;
    return {
      ok: false,
      passages: [],
      reason: aborted ? "rag_timeout" : "rag_injoignable",
      detail: aborted ? `pas de reponse en ${timeoutMs} ms` : err.message.slice(0, 200),
      url,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------- l'explication */

export interface ExplainResult {
  topic: string;
  title: string;
  /** le texte, deja audite : aucun chiffre n'y figure sans citation */
  text: string;
  citations: Citation[];
  identifiers: string[];
  sources: ExplainSource[];
  /** le RAG a-t-il repondu ? false => l'explication se limite a ce qui est en dur, et le dit */
  grounded: boolean;
  /** comment le sujet a ete choisi */
  chosen_by: "modele" | "regles" | "demande";
  why: string[];
  degraded: { reason: string; detail: string } | null;
}

export interface BuildExplainOptions {
  /** sujet impose (le modele a choisi, ou l'appelant sait deja) */
  topic?: string | null;
  chosenBy?: ExplainResult["chosen_by"];
  why?: string[];
  rag?: RagOptions | false;
  degraded?: { reason: string; detail: string } | null;
}

const FALLBACK_TOPIC = "what-tare-is";

/**
 * Fabrique l'explication : un article ecrit ici, ses sources relues dans le depot,
 * et les passages du RAG quand il repond. Le texte NE VIENT JAMAIS DU MODELE.
 */
export async function buildExplain(
  question: string,
  store: StoreView,
  opts: BuildExplainOptions = {},
): Promise<ExplainResult> {
  const why = [...(opts.why ?? [])];
  let chosen_by = opts.chosenBy ?? "regles";
  let article = opts.topic ? articleById(opts.topic) : null;
  let degraded = opts.degraded ?? null;

  if (opts.topic && !article) {
    degraded = {
      reason: "sujet_inconnu",
      detail: `sujet propose hors du catalogue : ${String(opts.topic).slice(0, 60)}`,
    };
    why.push("sujet propose hors catalogue : on retombe sur la detection par regles");
    chosen_by = "regles";
  }
  if (!article) {
    const det = detectExplain(question);
    if (det) {
      article = articleById(det.topic);
      why.push(`sujet choisi par regles : ${det.topic} (indices: ${det.hits.slice(0, 4).join(", ")})`);
    }
  }
  if (!article) {
    article = articleById(FALLBACK_TOPIC)!;
    why.push("aucun sujet precis reconnu : on explique ce que fait le produit");
  }

  const sources: ExplainSource[] = article.refs.map(sourceOf);
  const missing = sources.filter((s) => !s.found);
  if (missing.length > 0)
    why.push(
      `section(s) introuvable(s) aujourd'hui dans le depot : ${missing.map((m) => `${m.file} > ${m.heading}`).join(" ; ")}`,
    );

  /* Le RAG d'abord : la phrase de cloture DIT ce qui s'est passe, donc elle a besoin
     de le savoir avant d'etre ecrite. Et elle passe par le meme auditeur que le reste. */
  let grounded = false;
  let tail: string;
  if (opts.rag === false) {
    tail =
      " Le RAG vectoriel n'a pas ete interroge pour cette reponse : ce que tu lis vient des articles ecrits dans le code et des sections citees dessous, rien de plus.";
    why.push("RAG non interroge (desactive par l'appelant)");
  } else {
    const rag = await ragSearch(article.ragQuery, opts.rag ?? {});
    if (rag.ok) {
      grounded = true;
      for (const p of rag.passages) {
        const anchor = p.heading ? `#${githubAnchor(p.heading)}` : "";
        sources.push({
          kind: "rag",
          file: p.file,
          heading: p.heading,
          url: p.file.startsWith("http") ? p.file : `${SOURCE_BASE}/${p.file}${anchor}`,
          passage: p.passage || null,
          found: true,
          line: p.line,
          score: p.score,
          note: null,
        });
      }
      why.push(
        rag.passages.length > 0
          ? `RAG vectoriel : ${rag.passages.length} passage(s) rendus pour "${article.ragQuery.slice(0, 60)}"`
          : "RAG vectoriel joignable, mais aucun passage rendu pour cette requete",
      );
      tail =
        rag.passages.length > 0
          ? " Les passages qui ancrent cette reponse sont cites dessous, avec leur fichier."
          : " Le RAG vectoriel a repondu sans trouver de passage pour cette requete : ce n'est pas une panne, c'est un index qui ne couvre pas ce sujet. Ce que tu lis vient donc des seules sections citees dessous.";
    } else {
      tail =
        " Le RAG vectoriel n'a pas repondu, donc cette explication se limite a ce qui est ecrit en dur dans le produit et aux sections citees dessous. Je ne comble pas le trou.";
      degraded = degraded ?? { reason: rag.reason ?? "rag_indisponible", detail: rag.detail ?? "" };
      why.push(`RAG indisponible : ${rag.reason} — ${rag.detail ?? ""}`.trim());
    }
  }

  const ctx: DoctrineCtx = { dataset: store.dataset, registry: store.registry };
  const rendered = renderArticle(article, ctx, tail);

  return {
    topic: article.id,
    title: article.title,
    text: rendered.text,
    citations: rendered.citations,
    identifiers: rendered.identifiers,
    sources,
    grounded,
    chosen_by,
    why,
    degraded,
  };
}

/** Le catalogue des sujets, tel qu'on le montre au modele : des identifiants, pas du texte a recopier. */
export const TOPIC_CATALOGUE: { id: string; title: string }[] = DOCTRINE.map((a) => ({
  id: a.id,
  title: a.title,
}));
