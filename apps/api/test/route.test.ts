/**
 * GET /route, sur des fixtures ecrites dans un dossier temporaire.
 *
 * Pourquoi des fixtures et pas les vrais fichiers : docs/dataset/measurements.jsonl
 * et measurements-contestes.jsonl sont ecrits EN DIRECT par les balayages. Un test
 * qui affirmerait "ce pool coute 25 bps" sur ces fichiers casserait a la ligne
 * suivante ecrite par le moteur. Les fixtures fixent les nombres pour que les
 * assertions portent sur la LOGIQUE (classement, refus de classer, taille la plus
 * proche), pas sur l'etat d'un fichier en cours d'ecriture.
 *
 * Un dernier test lit quand meme les vrais fichiers s'ils existent, mais il
 * n'affirme que des invariants : etiquettes valides, aucun cout sans mesure, aucun
 * pool non cotable dans le classement.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRouteRouter, resetRouteCaches, lpFeeBps, pairKey } from "../src/route.js";
import { resetCaches } from "../src/dataset.js";
import { DOCS_DIR } from "../src/paths.js";
import { createApp } from "../src/app.js";
import { fakeFacilitator, fakeEngine } from "./helpers.js";

/* --------------------------------------------------------------- fixtures */

const T_A = "0xaaaa000000000000000000000000000000000001";
const T_B = "0xbbbb000000000000000000000000000000000002";
const T_C = "0xcccc000000000000000000000000000000000003";
const T_D = "0xdddd000000000000000000000000000000000004";
const T_E = "0xeeee000000000000000000000000000000000005";
const T_F = "0xffff000000000000000000000000000000000006";
const T_G = "0x1111000000000000000000000000000000000007";
const T_H = "0x2222000000000000000000000000000000000008";
const T_I = "0x3333000000000000000000000000000000000009";
const T_J = "0x444400000000000000000000000000000000000a";

const H1 = "0x1000000000000000000000000000000000000001";
const H2 = "0x2000000000000000000000000000000000000002";
const H3 = "0x3000000000000000000000000000000000000003";
const H4 = "0x4000000000000000000000000000000000000004";
const H5 = "0x5000000000000000000000000000000000000005";
const H6 = "0x6000000000000000000000000000000000000006";
const H7 = "0x7000000000000000000000000000000000000007";
const H8 = "0x8000000000000000000000000000000000000008";
const H9 = "0x9000000000000000000000000000000000000009";

const P1 = "0x" + "11".repeat(32);
const P2 = "0x" + "22".repeat(32);
const P3 = "0x" + "33".repeat(32);
const P5 = "0x" + "55".repeat(32);
const P6 = "0x" + "66".repeat(32);
const P7 = "0x" + "77".repeat(32);
const P8 = "0x" + "88".repeat(32);

const BLOCK = 50614000;
const SMALL = "1000000000000000"; // 1e15
const MID = "10000000000000000"; // 1e16, jamais mesuree
const BIG = "1000000000000000000"; // 1e18

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
    fee_is_dynamic: r.fee === 8388608,
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

/** quatre lignes : deux tailles x deux sens */
function pool(base: Omit<Row, "zfo" | "amount" | "bps" | "label">, spec: {
  small: [number | null, string];
  big: [number | null, string];
}): string[] {
  const out: string[] = [];
  for (const [amount, [bps, label]] of [
    [SMALL, spec.small],
    [BIG, spec.big],
  ] as [string, [number | null, string]][]) {
    for (const zfo of [true, false]) {
      out.push(line({ ...base, zfo, amount, bps, label }));
    }
  }
  return out;
}

/**
 * Un pool qui ne cote QUE dans le sens 1->0. C'est le cas reel de la paire
 * 0xb2../0xb7eb.. : dans un sens rien n'aboutit, dans l'autre le prelevement se lit.
 */
function oneWayPool(base: Omit<Row, "zfo" | "amount" | "bps" | "label">): string[] {
  return [
    line({ ...base, zfo: true, amount: SMALL, bps: null, label: "NOT_QUOTABLE" }),
    line({ ...base, zfo: true, amount: BIG, bps: null, label: "NOT_QUOTABLE" }),
    line({ ...base, zfo: false, amount: SMALL, bps: 210, label: "MEASURED" }),
    line({ ...base, zfo: false, amount: BIG, bps: 264, label: "MEASURED" }),
  ];
}

let dir: string;
let jsonl: string;
let contestes: string;
let census: string;
let router: Hono;
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "tare-route-"));
  jsonl = join(dir, "measurements.jsonl");
  contestes = join(dir, "measurements-contestes.jsonl");
  census = join(dir, "pools-liquides-full.json");

  // Corpus principal : deux paires a pool unique.
  writeFileSync(
    jsonl,
    [
      // C/D : un seul pool, un seul recensement -> "aucune alternative".
      ...pool(
        { hook: H5, pool: P5, c0: T_C, c1: T_D, fee: 3000, ts: 60, lp: 3000 },
        { small: [42, "MEASURED"], big: [44, "MEASURED"] },
      ),
      // E/F : mesure a 1e15 et 1e18 seulement. On demandera 1e16.
      ...pool(
        { hook: H6, pool: P6, c0: T_E, c1: T_F, fee: 500, ts: 10, lp: 500 },
        { small: [7, "MEASURED"], big: [9, "MEASURED"] },
      ),
    ].join("\n") + "\n",
    "utf8",
  );

  // Paires contestees : A/B a trois portes mesurees.
  writeFileSync(
    contestes,
    [
      // P1 : cote a 1e15, NON COTABLE a 1e18.
      ...pool(
        { hook: H1, pool: P1, c0: T_A, c1: T_B, fee: 3000, ts: 60, lp: 3000 },
        { small: [10, "MEASURED"], big: [null, "NOT_QUOTABLE"] },
      ),
      // P2 : cote partout, frais LP faibles -> le moins cher.
      ...pool(
        { hook: H2, pool: P2, c0: T_A, c1: T_B, fee: 500, ts: 10, lp: 500 },
        { small: [20, "MEASURED"], big: [22, "MEASURED"] },
      ),
      // P3 : rien ne cote, jamais.
      ...pool(
        { hook: H3, pool: P3, c0: T_A, c1: T_B, fee: 3000, ts: 60, lp: 3000 },
        { small: [null, "NOT_QUOTABLE"], big: [null, "NOT_MEASURABLE"] },
      ),
      // I/J : deux portes qui ne cotent que dans un sens, et au MEME cout.
      ...oneWayPool({ hook: H8, pool: P7, c0: T_I, c1: T_J, fee: 6000, ts: 60, lp: 6000 }),
      ...oneWayPool({ hook: H9, pool: P8, c0: T_I, c1: T_J, fee: 6000, ts: 60, lp: 6000 }),
      // Une ligne tronquee, comme en produit un balayage en cours d'ecriture.
      '{"hook":"0x1000000000000000000000000000000000000001","pool_id":"0x11',
    ].join("\n") + "\n",
    "utf8",
  );

  // Recensement : A/B a QUATRE portes (la quatrieme n'est pas mesuree).
  writeFileSync(
    census,
    JSON.stringify([
      [H1, [T_A, T_B, 3000, 60, H1], "1000", false],
      [H2, [T_A, T_B, 500, 10, H2], "2000", false],
      [H3, [T_A, T_B, 3000, 60, H3], "3000", false],
      [H4, [T_A, T_B, 100, 1, H4], "4000", false],
      [H5, [T_C, T_D, 3000, 60, H5], "5000", false],
      [H6, [T_E, T_F, 500, 10, H6], "6000", false],
      [H7, [T_G, T_H, 500, 10, H7], "7000", false],
      [H8, [T_I, T_J, 6000, 60, H8], "8000", false],
      [H9, [T_I, T_J, 6000, 60, H9], "9000", false],
    ]),
    "utf8",
  );
  writeFileSync(census + ".scan.json", JSON.stringify({ block_number: BLOCK }), "utf8");

  for (const k of ["TARE_JSONL_PATH", "TARE_CONTESTES_PATH", "TARE_CENSUS_PATH"])
    saved[k] = process.env[k];
  process.env.TARE_JSONL_PATH = jsonl;
  process.env.TARE_CONTESTES_PATH = contestes;
  process.env.TARE_CENSUS_PATH = census;
  resetCaches();
  resetRouteCaches();
  router = createRouteRouter();
});

afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetCaches();
  resetRouteCaches();
  rmSync(dir, { recursive: true, force: true });
});

async function ask(qs: string): Promise<any> {
  const res = await router.request(`/route?${qs}`);
  return { status: res.status, body: await res.json() };
}

/* ------------------------------------------------------------------ tests */

describe("paire a choix multiple", () => {
  it("classe les pools par cout total mesure croissant", async () => {
    const { status, body } = await ask(`currency0=${T_A}&currency1=${T_B}&amount=${SMALL}`);
    expect(status).toBe(200);
    expect(body.verdict).toBe("MULTIPLE_POOLS");

    // P2 : 500/100 = 5 bps de frais LP + 20 bps de hook = 25
    // P1 : 3000/100 = 30 bps + 10 = 40
    expect(body.ranked.map((r: any) => r.pool_id)).toEqual([P2, P1]);
    expect(body.ranked[0].total_bps).toBe(25);
    expect(body.ranked[0].lp_fee_bps).toBe(5);
    expect(body.ranked[0].hook_bps).toBe(20);
    expect(body.ranked[1].total_bps).toBe(40);

    // le classement est croissant, sans exception
    const totals = body.ranked.map((r: any) => r.total_bps);
    expect([...totals].sort((a: number, b: number) => a - b)).toEqual(totals);
  });

  it("fait porter a chaque rang son hook, ses frais LP, son etiquette, son compte et son rejeu", async () => {
    const { body } = await ask(`currency0=${T_A}&currency1=${T_B}&amount=${SMALL}`);
    for (const r of body.ranked) {
      expect(r.hook).toMatch(/^0x[0-9a-f]{40}$/);
      expect(r.pool_id).toMatch(/^0x[0-9a-f]{64}$/);
      expect(typeof r.stored_lp_fee).toBe("number");
      expect(r.lp_fee_bps).toBe(lpFeeBps(r.stored_lp_fee));
      expect(["MEASURED", "INTERPOLATED"]).toContain(r.label);
      expect(r.measurements).toBeGreaterThan(0);
      expect(r.size.used_wei).toMatch(/^[0-9]+$/);
      expect(r.replay).toContain("measure_one.py");
      expect(r.replay).toContain(`--amount-in ${r.size.used_wei}`);
      expect(r.block_number).toBe(BLOCK);
      expect(r.total_bps).toBe(r.lp_fee_bps + r.hook_bps);
    }
  });

  it("porte le bloc, le nombre de mesures et la phrase structurelle", async () => {
    const { body } = await ask(`currency0=${T_A}&currency1=${T_B}&amount=${SMALL}`);
    expect(body.block.measurements).toEqual([BLOCK]);
    expect(body.counts.measurements_for_this_pair).toBe(12);
    expect(body.counts.measurements_in_direction).toBe(6);
    expect(body.counts.pools_measured).toBe(3);
    // derive du recensement : 4 paires, une seule a plusieurs pools
    expect(body.structure.pairs_discovered).toBe(5);
    expect(body.structure.pairs_with_more_than_one_pool).toBe(2);
    expect(body.structure.share_pct).toBe(40);
    expect(body.structure.sentence).toContain("Sur 5 paires decouvertes au bloc 50614000");
    expect(body.structure.sentence).toContain("peage sur la seule route");
  });

  it("liste la porte du recensement qu'aucune mesure ne couvre, sans lui preter un cout", async () => {
    const { body } = await ask(`currency0=${T_A}&currency1=${T_B}&amount=${SMALL}`);
    expect(body.unmeasured_gates.length).toBe(1);
    const g = body.unmeasured_gates[0];
    expect(g.hook).toBe(H4);
    expect(g.label).toBe("NOT_MEASURED");
    expect(g).not.toHaveProperty("total_bps");
    expect(g.replay_to_measure).toContain(`--hooks ${H4}`);
    // et l'affirmation forte est retenue : toutes les portes ne sont pas mesurees
    expect(body.alternatives.claim).toBe("ALTERNATIVES_NON_MESUREES");
    expect(body.alternatives.pools_in_census).toBe(4);
    expect(body.alternatives.pools_measured).toBe(3);
  });

  it("compte les lignes illisibles au lieu de les avaler", async () => {
    const { body } = await ask(`currency0=${T_A}&currency1=${T_B}&amount=${SMALL}`);
    const src = body.sources.find((s: any) => s.kind === "contestes");
    expect(src.exists).toBe(true);
    expect(src.rejected_lines).toBe(1);
  });

  it("trouve la meme paire quel que soit l'ordre des arguments, et dit quel sens il a retenu", async () => {
    const a = await ask(`currency0=${T_A}&currency1=${T_B}&amount=${SMALL}`);
    const b = await ask(`currency0=${T_B}&currency1=${T_A}&amount=${SMALL}`);
    expect(b.body.pair.currency0).toBe(a.body.pair.currency0);
    expect(a.body.direction.zero_for_one).toBe(true);
    expect(b.body.direction.zero_for_one).toBe(false);
    expect(b.body.direction.source).toBe("ordre_des_arguments");
    const forced = await ask(`currency0=${T_B}&currency1=${T_A}&amount=${SMALL}&zeroForOne=true`);
    expect(forced.body.direction.zero_for_one).toBe(true);
    expect(forced.body.direction.source).toBe("parametre_zeroForOne");
  });
});

describe("pool entierement non cotable", () => {
  it("le liste hors classement, sans cout, sans zero et sans derniere place", async () => {
    const { body } = await ask(`currency0=${T_A}&currency1=${T_B}&amount=${SMALL}`);
    expect(body.ranked.map((r: any) => r.pool_id)).not.toContain(P3);
    const u = body.unranked.find((x: any) => x.pool_id === P3);
    expect(u).toBeTruthy();
    expect(u.total_bps).toBeNull();
    expect(u.why).toBe("NO_QUOTED_ROW_IN_DIRECTION");
    expect(u.labels_all_directions).toEqual({ NOT_QUOTABLE: 2, NOT_MEASURABLE: 2 });
    // le classement se decide sur le seul sens demande : un seul de chaque
    expect(u.labels_in_direction).toEqual({ NOT_QUOTABLE: 1, NOT_MEASURABLE: 1 });
    // aucune de ses lignes ne porte de nombre
    for (const p of u.points) expect(p.hook_bps).toBeNull();
    expect(body.unranked_note).toContain("jamais classes");
  });

  it("refuse de classer un pool non cotable A LA TAILLE DEMANDEE, et le dit", async () => {
    const { body } = await ask(`currency0=${T_A}&currency1=${T_B}&amount=${BIG}`);
    // a 1e18, P1 ne cote plus : il sort du classement, il ne devient pas cher
    expect(body.ranked.map((r: any) => r.pool_id)).toEqual([P2]);
    expect(body.ranked[0].total_bps).toBe(27); // 5 + 22
    const u = body.unranked.find((x: any) => x.pool_id === P1);
    expect(u.why).toBe("NOT_QUOTABLE_AT_REQUESTED_SIZE");
    expect(u.label_at_requested_size).toBe("NOT_QUOTABLE");
    expect(u.total_bps).toBeNull();
    // la valeur d'une autre taille est fournie, mais etiquetee comme telle
    expect(u.nearest_quoted.amount_in).toBe(SMALL);
    expect(u.nearest_quoted.total_bps).toBe(40);
    expect(u.nearest_quoted.note).toContain("n'a pas servi au classement");
  });
});

describe("paire a pool unique", () => {
  it("rend le cout mesure et dit qu'aucune alternative n'existe a ce bloc", async () => {
    const { status, body } = await ask(`currency0=${T_C}&currency1=${T_D}&amount=${SMALL}`);
    expect(status).toBe(200);
    expect(body.verdict).toBe("SINGLE_POOL");
    expect(body.headline).toContain("pas de recommandation a faire");
    expect(body.headline).toContain("peage a connaitre");
    expect(body.ranked.length).toBe(1);
    expect(body.ranked[0].total_bps).toBe(72); // 3000/100 + 42
    expect(body.alternatives.claim).toBe("AUCUNE_ALTERNATIVE");
    expect(body.alternatives.sentence).toContain(`au bloc ${BLOCK}`);
    expect(body.alternatives.pools_in_census).toBe(1);
    expect(body.unmeasured_gates).toEqual([]);
  });

  it("assortit l'affirmation forte d'une reserve quand le balayage n'a pas tout lu", async () => {
    // le manifeste de la fixture ne porte pas n_unknown : "on ne sait pas" n'est pas "zero"
    const a = await ask(`currency0=${T_C}&currency1=${T_D}&amount=${SMALL}`);
    expect(a.body.census_source.unreadable_pools).toBeNull();
    expect(a.body.census_source.unreadable_pools_note).toContain("ce n'est pas zero, c'est inconnu");
    expect(a.body.alternatives.caveat).toContain("minorant");
    expect(a.body.alternatives.sentence).toContain("Reserve :");
    expect(a.body.structure.is_lower_bound).toBe(true);

    // avec un manifeste qui dit 0 pool illisible, la reserve disparait
    writeFileSync(census + ".scan.json", JSON.stringify({ block_number: BLOCK, n_unknown: 0 }), "utf8");
    resetRouteCaches();
    try {
      const b = await ask(`currency0=${T_C}&currency1=${T_D}&amount=${SMALL}`);
      expect(b.body.census_source.unreadable_pools).toBe(0);
      expect(b.body.alternatives.caveat).toBeNull();
      expect(b.body.alternatives.sentence).not.toContain("Reserve :");
      expect(b.body.structure.is_lower_bound).toBe(false);

      // et avec 64 pools illisibles, elle revient en nommant le compte
      writeFileSync(census + ".scan.json", JSON.stringify({ block_number: BLOCK, n_unknown: 64 }), "utf8");
      resetRouteCaches();
      const d = await ask(`currency0=${T_C}&currency1=${T_D}&amount=${SMALL}`);
      expect(d.body.alternatives.claim).toBe("AUCUNE_ALTERNATIVE");
      expect(d.body.alternatives.caveat).toContain("64 pools");
      expect(d.body.structure.caveat).toContain("MINORANT");
    } finally {
      writeFileSync(census + ".scan.json", JSON.stringify({ block_number: BLOCK }), "utf8");
      resetRouteCaches();
    }
  });

  it("n'affirme pas l'absence d'alternative quand le recensement n'est pas la", async () => {
    const before = process.env.TARE_CENSUS_PATH;
    process.env.TARE_CENSUS_PATH = join(dir, "recensement-absent.json");
    resetRouteCaches();
    try {
      const { body } = await ask(`currency0=${T_C}&currency1=${T_D}&amount=${SMALL}`);
      expect(body.alternatives.claim).toBe("INDETERMINE");
      expect(body.alternatives.pools_in_census).toBeNull();
      expect(body.structure).toBeNull();
      expect(body.structure_note).toContain("On ne la remplace pas par des chiffres memorises");
      // le cout mesure, lui, reste rendu : c'est la structure qui manque, pas la mesure
      expect(body.ranked[0].total_bps).toBe(72);
    } finally {
      process.env.TARE_CENSUS_PATH = before;
      resetRouteCaches();
    }
  });
});

describe("taille non mesuree", () => {
  it("bascule sur la mesure la plus proche et le dit dans un champ explicite", async () => {
    const { body } = await ask(`currency0=${T_E}&currency1=${T_F}&amount=${MID}`);
    expect(body.ranked.length).toBe(1);
    const r = body.ranked[0];
    expect(r.size.requested_wei).toBe(MID);
    expect(r.size.exact_match).toBe(false);
    expect(r.size.used_wei).toBe(SMALL);
    expect(r.cost_basis).toBe("taille_mesuree_la_plus_proche");
    expect(r.size.note).toContain("n'a pas ete mesuree");
    expect(r.total_bps).toBe(12); // 500/100 + 7
    expect(r.replay).toContain(`--amount-in ${SMALL}`);
  });

  it("dit exact_match quand la taille demandee a bien ete mesuree", async () => {
    const { body } = await ask(`currency0=${T_E}&currency1=${T_F}&amount=${BIG}`);
    const r = body.ranked[0];
    expect(r.size.exact_match).toBe(true);
    expect(r.size.used_wei).toBe(BIG);
    expect(r.cost_basis).toBe("taille_demandee");
    expect(r.total_bps).toBe(14); // 5 + 9
  });

  it("sans taille demandee, classe sur la pire taille mesuree et l'annonce", async () => {
    const { body } = await ask(`currency0=${T_A}&currency1=${T_B}`);
    expect(body.size.requested_wei).toBeNull();
    for (const r of body.ranked) expect(r.cost_basis).toBe("pire_taille_mesuree");
    expect(body.ranked[0].total_bps).toBe(27); // P2 : 5 + max(20,22)
    expect(body.ranked[1].total_bps).toBe(40); // P1 : 30 + 10 (sa seule taille cotee)
  });
});

describe("paire inconnue", () => {
  it("rend NOT_MEASURED avec le nombre de paires couvertes, jamais un cout", async () => {
    const { status, body } = await ask(`currency0=${T_G}&currency1=${T_H}&amount=${SMALL}`);
    expect(status).toBe(200);
    expect(body.verdict).toBe("NOT_MEASURED");
    expect(body.headline).toContain("absence de mesure");
    expect(body.ranked).toEqual([]);
    expect(body.unranked).toEqual([]);
    expect(body.counts.pairs_covered_by_measurements).toBe(4);
    expect(body.counts.measurements_for_this_pair).toBe(0);
    expect(body.block.measurements).toEqual([]);
    // la paire EST au recensement : la porte non mesuree est listee, sans cout
    expect(body.unmeasured_gates.length).toBe(1);
    expect(body.unmeasured_gates[0].label).toBe("NOT_MEASURED");
  });

  it("distingue une paire absente du recensement d'une paire recensee mais non mesuree", async () => {
    const inconnue = "0x9999000000000000000000000000000000000099";
    const { body } = await ask(`currency0=${T_G}&currency1=${inconnue}`);
    expect(body.verdict).toBe("NOT_MEASURED");
    expect(body.alternatives.claim).toBe("INDETERMINE");
    expect(body.alternatives.pools_in_census).toBe(0);
    expect(body.unmeasured_gates).toEqual([]);
  });
});

describe("sens sans cotation", () => {
  it("ne bascule pas de sens toute seule : classement vide, et le chemin est indique", async () => {
    const { body } = await ask(`currency0=${T_I}&currency1=${T_J}&amount=${SMALL}`);
    expect(body.direction.human).toBe("0->1");
    expect(body.ranked).toEqual([]);
    expect(body.headline).toContain("aucun n'a de cout mesure dans le sens 0->1");
    expect(body.direction.pools_quoted_in_other_direction).toBe(2);
    expect(body.direction.hint).toContain("zeroForOne=false");
    for (const u of body.unranked) {
      expect(u.total_bps).toBeNull();
      expect(u.numeric_in_other_direction).toBe(true);
    }
  });

  it("classe une fois le sens donne, et dit quand la mesure ne separe pas deux pools", async () => {
    const { body } = await ask(`currency0=${T_I}&currency1=${T_J}&amount=${BIG}&zeroForOne=false`);
    expect(body.ranked.length).toBe(2);
    // 6000/100 = 60 bps de frais LP + 264 bps de hook
    expect(body.ranked.map((r: any) => r.total_bps)).toEqual([324, 324]);
    expect(body.ranking_note).toContain("arbitraire");
    expect(body.direction.hint).toBeNull();
  });

  it("ne pose pas la note d'egalite quand les couts different", async () => {
    const { body } = await ask(`currency0=${T_A}&currency1=${T_B}&amount=${SMALL}`);
    expect(body.ranking_note).toBeNull();
  });
});

describe("parametres refuses", () => {
  it("refuse plutot que d'ignorer", async () => {
    expect((await ask(`currency0=${T_A}`)).status).toBe(400);
    expect((await ask(`currency0=pas-une-adresse&currency1=${T_B}`)).status).toBe(400);
    expect((await ask(`currency0=${T_A}&currency1=${T_A}`)).status).toBe(400);
    expect((await ask(`currency0=${T_A}&currency1=${T_B}&amount=beaucoup`)).status).toBe(400);
    expect((await ask(`currency0=${T_A}&currency1=${T_B}&amount=0`)).status).toBe(400);
    expect((await ask(`currency0=${T_A}&currency1=${T_B}&zeroForOne=peut-etre`)).status).toBe(400);
  });

  it("accepte les adresses en majuscules", async () => {
    const { status, body } = await ask(`currency0=${T_A.toUpperCase().replace("0X", "0x")}&currency1=${T_B}`);
    expect(status).toBe(200);
    expect(body.pair.currency0).toBe(T_A);
  });
});

describe("cle de paire", () => {
  it("est insensible a l'ordre", () => {
    expect(pairKey(T_B, T_A)).toBe(pairKey(T_A, T_B));
  });
});

describe("enregistrement dans l'API", () => {
  it("/route est servie par createApp", async () => {
    const { app } = createApp({
      config: { usageLogPath: "", x402Enabled: true },
      facilitator: fakeFacilitator(),
      engine: fakeEngine(),
    });
    const res = await app.request(`/route?currency0=${T_A}&currency1=${T_B}&amount=${SMALL}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).verdict).toBe("MULTIPLE_POOLS");
    const index = (await (await app.request("/")).json()) as any;
    expect(index.routes.join("\n")).toContain("/route");
  });
});

/* ------------------------------------------------- les vrais fichiers, si la */

describe("sur le jeu reel", () => {
  const real = resolve(DOCS_DIR, "dataset", "measurements-contestes.jsonl");
  const realCensus = resolve(DOCS_DIR, "dataset", "pools-liquides-full.json");

  it("ne classe jamais un pool sans cout mesure, et derive la structure du recensement", async () => {
    if (!existsSync(real) || !existsSync(realCensus)) {
      // Pas d'invention : si les fichiers ne sont pas la, on ne simule rien.
      expect(existsSync(real) || existsSync(realCensus)).toBe(false);
      return;
    }
    const saved0 = process.env.TARE_JSONL_PATH;
    const saved1 = process.env.TARE_CONTESTES_PATH;
    const saved2 = process.env.TARE_CENSUS_PATH;
    process.env.TARE_JSONL_PATH = resolve(DOCS_DIR, "dataset", "measurements.jsonl");
    process.env.TARE_CONTESTES_PATH = real;
    process.env.TARE_CENSUS_PATH = realCensus;
    resetCaches();
    resetRouteCaches();
    try {
      // ETH/USDC : la paire la plus profonde, quatre portes au recensement.
      const { status, body } = await ask(
        "currency0=0x0000000000000000000000000000000000000000&currency1=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913&amount=1000000000000000000",
      );
      expect(status).toBe(200);
      for (const r of body.ranked) {
        expect(typeof r.hook_bps).toBe("number");
        expect(["MEASURED", "INTERPOLATED"]).toContain(r.label);
        expect(r.total_bps).toBeCloseTo(r.lp_fee_bps + r.hook_bps, 4);
        expect(r.replay).toContain("measure_one.py");
      }
      for (const u of body.unranked) expect(u.total_bps).toBeNull();
      // les chiffres de structure sont DERIVES, pas ecrits en dur
      expect(body.structure.pairs_discovered).toBeGreaterThan(0);
      expect(body.structure.pairs_with_more_than_one_pool).toBeLessThanOrEqual(
        body.structure.pairs_discovered,
      );
      expect(body.structure.sentence).toContain(String(body.structure.pairs_discovered));
      expect(body.counts.measurements_total).toBeGreaterThan(0);
    } finally {
      if (saved0 === undefined) delete process.env.TARE_JSONL_PATH;
      else process.env.TARE_JSONL_PATH = saved0;
      if (saved1 === undefined) delete process.env.TARE_CONTESTES_PATH;
      else process.env.TARE_CONTESTES_PATH = saved1;
      if (saved2 === undefined) delete process.env.TARE_CENSUS_PATH;
      else process.env.TARE_CENSUS_PATH = saved2;
      resetCaches();
      resetRouteCaches();
    }
  });
});

/* ------------------------------------------------------------------------
 * Les trois defauts que la verification adverse a trouves. Chacun a son test :
 * corriger du code que rien ne surveille, c'est le reintroduire a la prochaine
 * modification.
 * ---------------------------------------------------------------------- */

describe("le cout total ne melange jamais deux lignes", () => {
  const D = mkdtempSync(join(tmpdir(), "tare-route-lp-"));
  const J = join(D, "m.jsonl");
  const C = join(D, "c.jsonl");
  const S = join(D, "census.json");
  let r2: Hono;
  const sauve: Record<string, string | undefined> = {};

  beforeAll(() => {
    // Un pool dont la PREMIERE ligne n'a pas de frais LP (lecture de slot0 en echec)
    // et dont la ligne mesuree, elle, en a un. Prendre le frais de la premiere ligne
    // ecarterait ce pool du classement ; prendre celui de la ligne mesuree le classe.
    const brut = (o: Record<string, unknown>) =>
      JSON.stringify({
        hook: H1, pool_id: P1, chain_id: 8453, block_number: BLOCK,
        currency0: T_A, currency1: T_B, key_fee: 500, tick_spacing: 10,
        fee_is_dynamic: false, stored_protocol_fee: 0, zero_for_one: true,
        out_with: "100", out_without: "200",
        stub_hash: "0x8e39b2ad4344342b4f7dc5cf31df0aec9bd5b5f8ec7fccd241256cf1fda637a4",
        engine_ver: "tare-engine/0.3.0", observed_at: "2026-09-05T00:00:00Z",
        reason: null, ...o,
      });
    writeFileSync(
      J,
      [
        brut({ stored_lp_fee: null, amount_in: "1000000000000", bps: null, label: "NOT_MEASURABLE", reason: "rpc" }),
        brut({ stored_lp_fee: 500, amount_in: SMALL, bps: 25, label: "MEASURED" }),
      ].join("\n") + "\n",
      "utf8",
    );
    writeFileSync(C, "", "utf8");
    writeFileSync(S, JSON.stringify([[H1, [T_A, T_B, 500, 10, H1], "1", false]]), "utf8");
    writeFileSync(S + ".scan.json", JSON.stringify({ block_number: BLOCK }), "utf8");
    for (const k of ["TARE_JSONL_PATH", "TARE_CONTESTES_PATH", "TARE_CENSUS_PATH"])
      sauve[k] = process.env[k];
    process.env.TARE_JSONL_PATH = J;
    process.env.TARE_CONTESTES_PATH = C;
    process.env.TARE_CENSUS_PATH = S;
    resetCaches();
    resetRouteCaches();
    r2 = createRouteRouter();
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(sauve)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetCaches();
    resetRouteCaches();
    rmSync(D, { recursive: true, force: true });
  });

  it("prend le frais LP de LA LIGNE qui porte le prelevement, pas de la premiere", async () => {
    const res = await r2.request(`/route?currency0=${T_A}&currency1=${T_B}&amount=${SMALL}`);
    const d: any = await res.json();
    expect(res.status).toBe(200);
    expect(d.ranked).toHaveLength(1);
    const g = d.ranked[0];
    // 500 centiemes de bps = 5 bps, plus 25 bps de hook.
    expect(g.lp_fee_bps_used).toBe(5);
    expect(g.hook_bps).toBe(25);
    expect(g.total_bps).toBe(30);
    // La formule doit NOMMER la mesure, pour que la somme soit verifiable.
    expect(g.total_bps_formula).toContain(g.measurement_id);
  });

  it("signale que les lignes du pool ne portent pas toutes le meme frais LP", async () => {
    const res = await r2.request(`/route?currency0=${T_A}&currency1=${T_B}&amount=${SMALL}`);
    const d: any = await res.json();
    const div = d.ranked[0].lp_fee_divergent_rows;
    expect(div).not.toBeNull();
    expect(div.values_seen).toContain(null);
    expect(div.values_seen).toContain(500);
  });
});

describe("la distance entre tailles ne sature pas", () => {
  it("classe encore correctement au-dela de ce qu'un double peut porter", async () => {
    // 1e309 depasse Number.MAX_VALUE : Number() y rend Infinity, et Infinity-Infinity
    // vaut NaN. Un comparateur qui rend NaN laisse l'ordre du tableau d'entree, donc
    // un classement indefini. La distance doit rester finie et ordonner.
    const enorme = "1" + "0".repeat(309);
    expect(Number(enorme)).toBe(Number.POSITIVE_INFINITY);
    const res = await router.request(
      `/route?currency0=${T_E}&currency1=${T_F}&amount=${enorme}`,
    );
    const d: any = await res.json();
    expect(res.status).toBe(200);
    // La plus grande taille mesuree doit etre retenue, pas la premiere du tableau.
    expect(d.ranked[0].size.used_wei).toBe(BIG);
    expect(d.ranked[0].size.exact_match).toBe(false);
    expect(Number.isFinite(d.ranked[0].total_bps)).toBe(true);
  });
});
