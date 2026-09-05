/**
 * L'INTENTION `route` : "je veux echanger A contre B, par quel pool passer ?"
 *
 * Ce que ces tests defendent, dans l'ordre d'importance :
 *
 *  1. Quand la paire n'a QU'UNE porte, la reponse le DIT. Elle ne presente pas un
 *     classement a un element : un classement laisse croire a un choix, et le
 *     recensement dit que ce choix n'existe pour presque aucune paire.
 *  2. Une paire non mesuree ne recoit JAMAIS un cout. Pas de zero de remplacement,
 *     pas de "probablement comme les autres".
 *  3. Aucun bps n'est calcule ici : tout vient de buildRouteAnswer() (route.ts) et
 *     repart avec sa ligne, son bloc, sa taille, son sens et sa commande de rejeu.
 *  4. L'intention marche AVEC le planificateur deterministe ET avec un plan de
 *     modele, et un modele qui glisse un nombre dans sa phrase se la fait jeter.
 *
 * Pourquoi des fixtures et pas les vrais fichiers : docs/dataset/*.jsonl sont ecrits
 * EN DIRECT par les balayages. Un test qui affirmerait "cette porte coute 25 bps"
 * sur eux casserait a la ligne suivante ecrite par le moteur. Les fixtures figent
 * les nombres pour que les assertions portent sur la LOGIQUE. Un dernier bloc lit
 * quand meme le vrai jeu, mais n'y verifie que des invariants.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  plan,
  extractPair,
  detectRoute,
  strongRouteAsk,
  normalize,
  routeFromActions,
  KNOWN_TOKENS,
  rankedGates,
  unrankedGates,
  type PlanOut,
} from "../planner.js";
import { execute, narrate } from "../execute.js";
import { getStore, resetStore, type StoreView } from "../store.js";
import { getGraph, resetGraph } from "../graph.js";
import { ActionListSchema } from "../actions.js";
import { auditNarration } from "../narrate.js";
import { ask } from "../ask.js";
import { SessionStore } from "../session.js";
import { makeLlmPlanner, buildSystemPrompt, type ModelCall } from "../llm.js";
import { resetCaches } from "../../dataset.js";
import { resetRouteCaches, loadCensus, loadPairIndex, buildRouteAnswer } from "../../route.js";

/* --------------------------------------------------------------- fixtures */

const ETH = KNOWN_TOKENS.eth!;
const WETH = KNOWN_TOKENS.weth!;
const USDC = KNOWN_TOKENS.usdc!;
const T_A = "0xaaaa000000000000000000000000000000000001";
const T_B = "0xbbbb000000000000000000000000000000000002";
const T_C = "0xcccc000000000000000000000000000000000003";
const T_D = "0xdddd000000000000000000000000000000000004";
const T_E = "0xeeee000000000000000000000000000000000005";

const HA = "0xa000000000000000000000000000000000000001";
const HB = "0xb000000000000000000000000000000000000002";
const HC = "0xc000000000000000000000000000000000000003";
const HD = "0xd000000000000000000000000000000000000004";
const HE = "0xe000000000000000000000000000000000000005";

const PA = "0x" + "a1".repeat(32);
const PB = "0x" + "b2".repeat(32);
const PC = "0x" + "c3".repeat(32);
const PD = "0x" + "d4".repeat(32);
const PE = "0x" + "e5".repeat(32);

const BLOCK = 50614000;
const SMALL = "1000000000000000";
const BIG = "1000000000000000000";
/** Le manifeste du recensement de fixture : une valeur qu'on ne peut pas confondre
 *  avec le n_unknown du vrai balayage (64), pour prouver qu'on lit bien la fixture. */
const UNKNOWN_POOLS = 3;

interface Row {
  hook: string;
  pool: string;
  c0: string;
  c1: string;
  fee: number;
  ts: number;
  lp: number;
  zfo: boolean;
  amount: string;
  bps: number | null;
  label: string;
}

function line(r: Row): string {
  return JSON.stringify({
    hook: r.hook,
    pool_id: r.pool,
    chain_id: 8453,
    block_number: BLOCK,
    currency0: r.c0,
    currency1: r.c1,
    key_fee: r.fee,
    tick_spacing: r.ts,
    fee_is_dynamic: false,
    stored_lp_fee: r.lp,
    stored_protocol_fee: 0,
    zero_for_one: r.zfo,
    amount_in: r.amount,
    out_with: r.bps === null ? null : "100",
    out_without: r.bps === null ? null : "200",
    bps: r.bps,
    label: r.label,
    reason: r.bps === null ? "quote_reverted" : null,
    stub_hash: "0x8e39b2ad4344342b4f7dc5cf31df0aec9bd5b5f8ec7fccd241256cf1fda637a4",
    engine_ver: "tare-engine/0.3.0",
    observed_at: "2026-09-05T00:00:00Z",
  });
}

/** Quatre lignes : deux tailles x deux sens, memes valeurs dans les deux sens. */
function pool(
  base: Omit<Row, "zfo" | "amount" | "bps" | "label">,
  spec: { small: [number | null, string]; big: [number | null, string] },
): string[] {
  const out: string[] = [];
  for (const [amount, [bps, label]] of [
    [SMALL, spec.small],
    [BIG, spec.big],
  ] as [string, [number | null, string]][])
    for (const zfo of [true, false]) out.push(line({ ...base, zfo, amount, bps, label }));
  return out;
}

let dir: string;
let store: StoreView;
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "tare-route-intent-"));
  const jsonl = join(dir, "measurements.jsonl");
  const contestes = join(dir, "measurements-contestes.jsonl");
  const census = join(dir, "pools-liquides-full.json");

  // Corpus principal : la paire a porte UNIQUE, celle qui porte l'argument du projet.
  writeFileSync(
    jsonl,
    [
      ...pool(
        { hook: HD, pool: PD, c0: T_A, c1: WETH, fee: 6000, ts: 60, lp: 6000 },
        { small: [100, "MEASURED"], big: [100, "MEASURED"] },
      ),
    ].join("\n") + "\n",
    "utf8",
  );

  // Paires contestees : ETH/USDC, trois portes dont une qui ne cote jamais.
  writeFileSync(
    contestes,
    [
      // 3000 pips = 30 bps de frais LP, pire prelevement mesure 12 -> 42
      ...pool(
        { hook: HA, pool: PA, c0: ETH, c1: USDC, fee: 3000, ts: 60, lp: 3000 },
        { small: [10, "MEASURED"], big: [12, "MEASURED"] },
      ),
      // 500 pips = 5 bps + 20 -> 25 : la moins chere
      ...pool(
        { hook: HB, pool: PB, c0: ETH, c1: USDC, fee: 500, ts: 10, lp: 500 },
        { small: [20, "MEASURED"], big: [20, "MEASURED"] },
      ),
      // rien ne cote : listee, jamais classee, jamais mise a zero
      ...pool(
        { hook: HC, pool: PC, c0: ETH, c1: USDC, fee: 3000, ts: 60, lp: 3000 },
        { small: [null, "NOT_QUOTABLE"], big: [null, "NOT_MEASURABLE"] },
      ),
    ].join("\n") + "\n",
    "utf8",
  );

  // Recensement : ETH/USDC a trois portes, T_A/WETH une seule, T_B/T_C une seule
  // jamais mesuree. T_D/T_E n'y figure pas du tout.
  writeFileSync(
    census,
    JSON.stringify([
      [HA, [ETH, USDC, 3000, 60, HA], "1000", false],
      [HB, [ETH, USDC, 500, 10, HB], "2000", false],
      [HC, [ETH, USDC, 3000, 60, HC], "3000", false],
      [HD, [T_A, WETH, 6000, 60, HD], "4000", false],
      [HE, [T_B, T_C, 3000, 60, HE], "5000", false],
    ]),
    "utf8",
  );
  writeFileSync(
    census + ".scan.json",
    JSON.stringify({ block_number: BLOCK, n_unknown: UNKNOWN_POOLS, replay: "python3 -m tare.rescan ..." }),
    "utf8",
  );

  for (const k of ["TARE_JSONL_PATH", "TARE_CONTESTES_PATH", "TARE_CENSUS_PATH", "TARE_CENSUS_SCAN_PATH"])
    saved[k] = process.env[k];
  process.env.TARE_JSONL_PATH = jsonl;
  process.env.TARE_CONTESTES_PATH = contestes;
  process.env.TARE_CENSUS_PATH = census;
  process.env.TARE_CENSUS_SCAN_PATH = census + ".scan.json";
  resetCaches();
  resetRouteCaches();
  resetStore();
  resetGraph();
  store = getStore();
});

afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetCaches();
  resetRouteCaches();
  resetStore();
  resetGraph();
  rmSync(dir, { recursive: true, force: true });
});

/* ----------------------------------------------------------------- outils */

function answer(question: string): { plan: PlanOut; text: string; label: string | null; citations: ReturnType<typeof narrate>["citations"]; identifiers: string[] } {
  const p = plan(question, store);
  const exec = execute(p.actions, store, getGraph(store));
  const n = narrate(p.intent, p, exec, store);
  return { plan: p, text: n.text, label: n.label, citations: n.citations, identifiers: n.identifiers };
}

const fresh = () => new SessionStore();

/* ------------------------------------------------------------- extraction */

describe("lire la paire dans la question", () => {
  it("reconnait deux symboles ecrits en francais courant", () => {
    const q = "je veux echanger de l'ETH contre de l'USDC, par quel pool passer ?";
    expect(detectRoute(normalize(q))).toBe(true);
    expect(extractPair(q).currencies).toEqual([ETH, USDC]);
  });

  it("ne prend pas ETH a l'interieur de WETH", () => {
    expect(extractPair("swap WETH contre USDC").currencies).toEqual([WETH, USDC]);
  });

  it("garde l'ordre de la phrase : le premier jeton est celui qu'on vend", () => {
    expect(extractPair("echanger de l'USDC contre de l'ETH").currencies).toEqual([USDC, ETH]);
  });

  it("lit deux adresses completes", () => {
    expect(extractPair(`par ou passer de ${T_A} vers ${WETH} ?`).currencies).toEqual([T_A, WETH]);
  });

  it("ne confond pas les 40 premiers hex d'un pool_id avec une adresse de jeton", () => {
    expect(extractPair(`par ou passer sur le pool ${PA} ?`).currencies).toEqual([]);
  });

  it("ne devine pas un symbole inconnu : il n'est simplement pas lu", () => {
    const pair = extractPair("echanger de l'ETH contre du DEGEN");
    expect(pair.currencies).toEqual([ETH]);
    expect(strongRouteAsk(normalize("echanger de l'ETH contre du DEGEN"))).toBe(true);
  });

  it("chaque symbole connu est une adresse que le recensement porte vraiment", () => {
    const census = loadCensus();
    const tokens = new Set<string>();
    for (const p of census.pools) {
      tokens.add(p.currency0);
      tokens.add(p.currency1);
    }
    // La fixture ne porte que eth, weth et usdc : c'est exactement la table publiee.
    for (const [sym, addr] of Object.entries(KNOWN_TOKENS))
      expect(tokens.has(addr), `${sym} absent du recensement de fixture`).toBe(true);
  });
});

/* ------------------------------------------------------ plusieurs portes */

describe("une paire a plusieurs portes", () => {
  it("classe du cout total mesure le plus faible au plus eleve, sans rien inventer", () => {
    const a = answer("je veux echanger de l'ETH contre de l'USDC, par quel pool passer ?");
    expect(a.plan.intent).toBe("route");
    expect(a.plan.params.currencies).toEqual([ETH, USDC]);
    const gates = rankedGates(a.plan.route!);
    // 500 pips / 100 = 5 bps + 20 bps de hook = 25 ; 3000 / 100 = 30 + 12 = 42.
    expect(gates.map((g) => g.pool_id)).toEqual([PB, PA]);
    expect(gates.map((g) => g.total_bps)).toEqual([25, 42]);
    expect(a.text).toContain("25");
    expect(a.text).toContain("42");
    expect(a.label).toBe("MEASURED");
  });

  it("liste la porte qui ne cote pas, sans lui preter de cout ni de zero", () => {
    const a = answer("je veux echanger de l'ETH contre de l'USDC, par quel pool passer ?");
    expect(a.plan.route!.unranked).toHaveLength(1);
    expect((a.plan.route!.unranked[0] as { pool_id: string }).pool_id).toBe(PC);
    expect((a.plan.route!.unranked[0] as { total_bps: number | null }).total_bps).toBeNull();
    expect(a.text).toContain("hors classement");
    expect(a.text).toContain("aucun zero ne leur est donne");
  });

  it("ne cite aucun cout attache a la porte non cotable", () => {
    const a = answer("je veux echanger de l'ETH contre de l'USDC, par quel pool passer ?");
    for (const c of a.citations)
      if (c.kind === "measurement") expect(c.pool_id).not.toBe(PC);
  });
});

/* ---------------------------------------------------------- porte unique */

describe("une paire a porte unique — le coeur du resultat", () => {
  const question = `je veux echanger ${T_A} contre ${WETH}, par quel pool passer ?`;

  it("dit qu'il n'y a qu'une porte au lieu de presenter un classement", () => {
    const a = answer(question);
    expect(a.plan.intent).toBe("route");
    expect(a.plan.route!.verdict).toBe("SINGLE_POOL");
    expect(a.text).toContain("une seule porte est mesuree");
    expect(a.text).toContain("il y a un peage a connaitre");
    // Le vocabulaire du classement n'a rien a faire ici : il n'y a pas de choix.
    expect(a.text).not.toContain("moins chere a la plus chere");
    expect(a.text).not.toContain("porte(s) ont un cout total mesure");
  });

  it("affirme l'absence d'alternative seulement parce que le recensement la soutient", () => {
    const a = answer(question);
    expect(a.plan.route!.alternatives.claim).toBe("AUCUNE_ALTERNATIVE");
    expect(a.text).toContain("aucune alternative n'existe a ce bloc");
    expect(a.text).toContain("peage sur la seule route");
  });

  it("porte la reserve du recensement : le compte de pools illisibles vient du manifeste", () => {
    const a = answer(question);
    expect(a.text).toContain("MINORANT");
    const cite = a.citations.find((c) => c.what.includes("illisibles"));
    expect(cite?.token).toBe(String(UNKNOWN_POOLS));
    expect(cite?.derived_from).toContain("n_unknown");
  });

  it("ouvre la fiche de la seule porte quand le magasin la connait", () => {
    const a = answer(question);
    const opened = a.plan.actions.find((x) => x.type === "open");
    expect(opened).toEqual({ type: "open", hook: HD, pool: PD });
  });

  it("le cout affiche est la somme nommee des deux termes de la MEME ligne", () => {
    const a = answer(question);
    const g = rankedGates(a.plan.route!)[0]!;
    // 6000 pips / 100 = 60 bps de frais LP + 100 bps de hook = 160.
    expect(g.lp_fee_bps_used).toBe(60);
    expect(g.hook_bps).toBe(100);
    expect(g.total_bps).toBe(160);
    expect(a.text).toContain("160");
    const cite = a.citations.find((c) => c.token === "160");
    expect(cite?.measurement_id).toBe(g.measurement_id);
    expect(cite?.replay).toContain("measure_one.py");
    expect(cite?.block_number).toBe(BLOCK);
  });
});

/* -------------------------------------------------------- paire inconnue */

describe("une paire que le jeu ne mesure pas", () => {
  it("ne rend aucun cout pour une paire absente du recensement ET des mesures", () => {
    const a = answer(`par quel pool passer de ${T_D} a ${T_E} ?`);
    expect(a.plan.intent).toBe("route");
    expect(a.plan.route!.verdict).toBe("NOT_MEASURED");
    expect(a.label).toBe("NOT_MEASURABLE");
    expect(a.text).toContain("absence de mesure");
    // Aucune ligne de porte n'est ecrite : la phrase de methode parle bien du "cout
    // total", mais aucune porte n'en porte un ici.
    expect(a.text).not.toMatch(/Porte 0x/);
    expect(a.citations.some((c) => c.kind === "measurement")).toBe(false);
    expect(a.plan.route!.ranked).toHaveLength(0);
  });

  it("dit INDETERMINE quand le recensement ne voit pas la paire, jamais 'aucune alternative'", () => {
    const a = answer(`par quel pool passer de ${T_D} a ${T_E} ?`);
    expect(a.plan.route!.alternatives.claim).toBe("INDETERMINE");
    expect(a.text).toContain("INDETERMINE");
    expect(a.text).not.toContain("aucune alternative n'existe");
  });

  it("une porte recensee mais jamais mesuree n'est ni classee ni comptee gratuite", () => {
    const a = answer(`je veux echanger ${T_B} contre ${T_C}, par ou passer ?`);
    expect(a.plan.route!.verdict).toBe("NOT_MEASURED");
    expect(a.plan.route!.counts.gates_not_measured).toBe(1);
    expect(a.text).toContain("jamais ete mesurees");
    expect(a.text).toContain("ni comptees comme gratuites");
    expect(a.citations.some((c) => c.kind === "measurement")).toBe(false);
  });

  it("demande le second jeton au lieu de le deviner", () => {
    const a = answer("je veux echanger de l'ETH contre du DEGEN");
    expect(a.plan.intent).toBe("route");
    expect(a.plan.route ?? null).toBeNull();
    expect(a.plan.actions).toEqual([
      { type: "clarify", question: expect.stringContaining("un seul jeton") },
    ]);
    expect(a.citations).toHaveLength(0);
  });
});

/* ------------------------------------------------- structure et honnetete */

describe("les chiffres de structure sont derives, jamais ecrits en dur", () => {
  it("compte les paires du recensement de fixture et pas celles du vrai jeu", () => {
    const a = answer("je veux echanger de l'ETH contre de l'USDC, par quel pool passer ?");
    const st = a.plan.route!.structure!;
    // trois paires dans la fixture : ETH/USDC, T_A/WETH, T_B/T_C ; une seule a choix.
    expect(st.pairs_discovered).toBe(3);
    expect(st.pairs_with_more_than_one_pool).toBe(1);
    expect(st.pairs_with_a_single_pool).toBe(2);
    expect(a.text).toContain(String(st.pairs_discovered));
    const cite = a.citations.find((c) => c.what === "paires distinctes recensees");
    expect(cite?.token).toBe("3");
    expect(cite?.derived_from).toContain("recensement");
  });

  it("chaque nombre de la phrase a une citation : l'auditeur repasse dessus", () => {
    for (const q of [
      "je veux echanger de l'ETH contre de l'USDC, par quel pool passer ?",
      `je veux echanger ${T_A} contre ${WETH}, par quel pool passer ?`,
      `par quel pool passer de ${T_D} a ${T_E} ?`,
    ]) {
      const a = answer(q);
      const audit = auditNarration(a.text, a.citations.map((c) => c.token), a.identifiers);
      expect(audit.ok, `${q} -> ${audit.violations.join(", ")}`).toBe(true);
    }
  });

  it("les actions rendues passent le meme Zod que les autres intentions", () => {
    for (const q of [
      "je veux echanger de l'ETH contre de l'USDC, par quel pool passer ?",
      `je veux echanger ${T_A} contre ${WETH}, par quel pool passer ?`,
      `par quel pool passer de ${T_D} a ${T_E} ?`,
      "je veux echanger de l'ETH contre du DEGEN",
    ])
      expect(ActionListSchema.safeParse(plan(q, store).actions).success).toBe(true);
  });

  it("n'attrape pas les questions des autres intentions", () => {
    expect(
      plan("montre-moi les hooks que le registre dit vanillaSwap=false mais qui mesurent moins de 1 bps", store)
        .intent,
    ).toBe("registry-disagrees");
    expect(plan("les hooks qui prennent plus de 100 bps", store).intent).toBe("top-extractors");
    expect(plan("les contradictions", store).intent).toBe("contradictions");
    // "contre" seul ne fabrique pas une question de routage : sans deux jetons lus,
    // la question repart au reste du planificateur (ici elle n'est comprise par
    // personne, et c'est le comportement d'avant ce chantier).
    expect(plan("le registre contre la mesure", store).intent).toBe("unclear");
  });
});

/* ------------------------------------------------------ les deux etages */

describe("l'intention marche dans les deux etages du planificateur", () => {
  it("etage deterministe : bout en bout par ask()", async () => {
    const a = await ask("je veux echanger de l'ETH contre de l'USDC, par quel pool passer ?", {
      sessionId: "s_route_det",
      sessions: fresh(),
    });
    expect(a.intent).toBe("route");
    expect(a.label).toBe("MEASURED");
    expect(a.degraded).toBeNull();
    expect(a.narration).toContain("25");
    expect(auditNarration(a.narration, a.citations.map((c) => c.token), a.identifiers).ok).toBe(true);
  });

  it("etage LLM : le modele nomme les deux jetons, le produit calcule", async () => {
    const modele: ModelCall = async () =>
      JSON.stringify({
        intent: "route",
        actions: [
          { type: "reset" },
          { type: "highlight", hooks: [ETH, USDC] },
        ],
        say: "Je regarde les portes de cette paire.",
      });
    const a = await ask("par ou passer pour vendre de l ETH contre de l USDC ?", {
      sessionId: "s_route_llm",
      sessions: fresh(),
      planner: makeLlmPlanner(modele, { budgetMs: 2000 }),
    });
    expect(a.intent).toBe("route");
    expect(a.label).toBe("MEASURED");
    expect(a.narration).toContain("25");
    expect(a.narration).toContain("42");
    expect(auditNarration(a.narration, a.citations.map((c) => c.token), a.identifiers).ok).toBe(true);
  });

  it("un modele qui invente une adresse n'obtient pas une paire", () => {
    const built = routeFromActions([
      { type: "reset" },
      { type: "highlight", hooks: ["0xdead000000000000000000000000000000000001", "0xdead000000000000000000000000000000000002"] },
    ]);
    expect(built).toBeNull();
  });

  it("l'auditeur refuse toujours une phrase de modele qui transporte un bps", async () => {
    const menteur: ModelCall = async () =>
      JSON.stringify({
        intent: "route",
        actions: [{ type: "reset" }, { type: "highlight", hooks: [ETH, USDC] }],
        say: "D'apres mon analyse cette paire coute 4242.4242 bps.",
      });
    const a = await ask("par ou passer entre ETH et USDC ?", {
      sessionId: "s_route_menteur",
      sessions: fresh(),
      planner: makeLlmPlanner(menteur, { budgetMs: 2000 }),
    });
    expect(a.intent).toBe("route");
    expect(a.degraded?.reason).toBe("uncited_numbers_in_model_sentence");
    expect(a.narration).not.toContain("4242.4242");
    // et la reponse reste utile : le produit a quand meme calcule la route
    expect(a.narration).toContain("25");
    expect(auditNarration(a.narration, a.citations.map((c) => c.token), a.identifiers).ok).toBe(true);
  });

  it("le prompt systeme enseigne l'intention et en montre un exemple", () => {
    const prompt = buildSystemPrompt(store);
    expect(prompt).toContain("Intentions possibles :");
    expect(/Intentions possibles : [^\n]*\broute\b/.test(prompt)).toBe(true);
    expect(prompt).toContain('"intent":"route"');
    expect(prompt).toContain("par quel pool passer");
  });
});

/* ------------------------------------------------------- le vrai corpus */

/**
 * Les fixtures ne prouvent que la logique. Ce bloc-la lit les VRAIS fichiers — et
 * n'y affirme que des invariants, jamais un nombre : quatre balayages ecrivent
 * dedans pendant que ce test tourne, et un nombre fige y serait faux dans l'heure.
 */
function withRealDataset<T>(fn: () => T): T {
  for (const k of ["TARE_JSONL_PATH", "TARE_CONTESTES_PATH", "TARE_CENSUS_PATH", "TARE_CENSUS_SCAN_PATH"])
    delete process.env[k];
  resetCaches();
  resetRouteCaches();
  try {
    return fn();
  } finally {
    process.env.TARE_JSONL_PATH = join(dir, "measurements.jsonl");
    process.env.TARE_CONTESTES_PATH = join(dir, "measurements-contestes.jsonl");
    process.env.TARE_CENSUS_PATH = join(dir, "pools-liquides-full.json");
    process.env.TARE_CENSUS_SCAN_PATH = join(dir, "pools-liquides-full.json.scan.json");
    resetCaches();
    resetRouteCaches();
  }
}

describe("invariants sur le vrai jeu (aucun nombre fige)", () => {
  it("le vrai recensement porte les trois symboles publies", () => {
    withRealDataset(() => {
      const census = loadCensus();
      // Absent du depot ? On ne conclut pas a sa place : on le dit et on s'arrete.
      expect(census.available, "recensement reel absent ou illisible").toBe(true);
      const tokens = new Set<string>();
      for (const p of census.pools) {
        tokens.add(p.currency0);
        tokens.add(p.currency1);
      }
      for (const [sym, addr] of Object.entries(KNOWN_TOKENS))
        expect(tokens.has(addr), `${sym} (${addr}) absent du vrai recensement`).toBe(true);
    });
  });

  // Ce test relit VRAIMENT docs/dataset/measurements.jsonl (plusieurs dizaines de
  // Mo, en cours d'ecriture par les balayages). Il lui faut donc son propre delai :
  // le laisser au delai commun le ferait echouer sur la lenteur de la machine, pas
  // sur une regle violee — et un test rouge pour une mauvaise raison ne prouve rien.
  it("aucune porte classee du vrai jeu ne porte une etiquette sans droit au nombre", () => {
    withRealDataset(() => {
      const r = buildRouteAnswer(
        { currency0: ETH, currency1: USDC, amount: null, zeroForOne: null },
        loadPairIndex(),
        loadCensus(),
      );
      for (const g of rankedGates(r)) {
        expect(["MEASURED", "INTERPOLATED"]).toContain(g.label);
        expect(typeof g.total_bps).toBe("number");
        expect(g.measurement_id).toMatch(/^m_[0-9a-f]{16}$/);
        // la somme est verifiable terme a terme, sur la ligne nommee
        expect(g.total_bps).toBeCloseTo((g.lp_fee_bps_used ?? 0) + (g.hook_bps ?? 0), 4);
      }
      for (const g of unrankedGates(r)) {
        expect(g.total_bps).toBeNull();
        expect(typeof g.why).toBe("string");
      }
    });
  }, 180_000);
});

/* --------------------------------------------------------------------------
 * La frontiere avec les intentions voisines. Ajouter `route` a fait REGRESSER
 * `compare` : « compare 0xHOOK contre 0xHOOK » partait en routage, parce que le mot
 * « contre » et deux adresses suffisaient, sans verifier que ces adresses etaient des
 * jetons. Une intention nouvelle qui vole des questions a une ancienne est une
 * regression, meme quand elle marche parfaitement sur les siennes.
 * ------------------------------------------------------------------------ */

describe("route ne vole pas les questions des autres intentions", () => {
  const cas: [string, string][] = [
    [`compare ${HA} contre ${HB}`, "compare"],
    [`les jumeaux de ${HA} et ${HB}`, "twins"],

    [`ouvre ${HB}`, "open"],
  ];
  for (const [q, attendu] of cas)
    it(`« ${q.slice(0, 40)}… » reste ${attendu}`, () => {
      expect(plan(q, store).intent).toBe(attendu);
    });

  it("« trace la courbe de 0xHOOK » n'est jamais volee par route", () => {
    // La fixture ne porte pas de courbe pour ce hook : l'intention retombe sur unclear.
    // Ce qu'on verifie ici n'est pas qu'elle vaut curve, c'est qu'elle ne vaut PAS route.
    expect(plan(`trace la courbe de ${HA}`, store).intent).not.toBe("route");
  });

  it("mais une vraie paire de jetons part bien en route", () => {
    expect(plan(`echanger ${T_A} contre ${T_B}`, store).intent).toBe("route");
  });

  it("sur un verbe d'echange explicite, deux adresses inconnues sont ROUTEES mais sans cout", () => {
    // « echanger » ne laisse aucun doute sur l'intention : on repond. Mais deux adresses que
    // le recensement ne connait pas ne fabriquent aucune porte et aucun chiffre — la reponse
    // dit qu'il n'y a rien de mesure, ce qui vaut mieux que « je n'ai pas compris ».
    const p = plan(
      "echanger 0x1111111111111111111111111111111111111111 contre 0x2222222222222222222222222222222222222222",
      store,
    );
    expect(p.intent).toBe("route");
    expect(p.route?.verdict).toBe("NOT_MEASURED");
    expect(p.route?.ranked ?? []).toEqual([]);
  });

  it("sur le signal faible seul (« A contre B »), deux adresses inconnues ne font pas une paire", () => {
    // Sans verbe d'echange, « contre » est ambigu : c'est le cas qui volait les questions
    // de compare. Ce qui n'est pas lu comme jeton n'est pas promu jeton.
    const p = plan(
      "0x1111111111111111111111111111111111111111 contre 0x2222222222222222222222222222222222222222",
      store,
    );
    expect(p.intent).not.toBe("route");
  });
});
