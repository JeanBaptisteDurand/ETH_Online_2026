/**
 * Les routes du graphe.
 *
 * Deux choses sont verifiees ici et rien d'autre :
 *   1. la PARITE avec engine/tare/graph/queries.py — le TypeScript rejoue la meme
 *      traversee, sinon on aurait deux verites ;
 *   2. l'HONNETETE des cas limites — graphe absent, hook inconnu, hook sans
 *      bytecode lu : aucun ne doit rendre une liste vide qui se lirait "rien a
 *      signaler".
 *
 * Les fixtures de test/fixtures/graph-python/ sont la sortie brute de la CLI
 * Python sur engine/tare/graph/data/graph.json. Pour les refaire :
 *
 *   PYTHONPATH=engine python3 -m tare.graph.cli orphans        --json > apps/api/test/fixtures/graph-python/orphans.json
 *   PYTHONPATH=engine python3 -m tare.graph.cli contradictions --json > apps/api/test/fixtures/graph-python/contradictions.json
 *   PYTHONPATH=engine python3 -m tare.graph.cli disagreement   --json > apps/api/test/fixtures/graph-python/disagreement.json
 *   PYTHONPATH=engine python3 -m tare.graph.cli clusters       --json > apps/api/test/fixtures/graph-python/clusters.json
 *   PYTHONPATH=engine python3 -m tare.graph.cli impact --hook 0x985c14baa2a18316ffda0aefb3a632fadfca2acc --json > .../impact-0x985c14ba.json
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { fakeFacilitator, fakeEngine } from "./helpers.js";
import {
  createGraphRouter,
  loadGraphStore,
  invalidateGraph,
  graphCacheStats,
  DEFAULT_GRAPH_PATH,
} from "../src/graph-routes.js";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const PY = resolve(HERE, "fixtures", "graph-python");

/** Le hook le plus preleve du jeu publie : 25 pools, 100 mesures. */
const HOOK_MEASURED = "0x985c14baa2a18316ffda0aefb3a632fadfca2acc";
/** Un des deux hooks du plus gros groupe de clones : jumeau par bytecode. */
const HOOK_TWIN = "0x04e08a08bab77b389e970a65d91fba8bf4ef6080";
/** Registre : vanillaSwap=false. Mesure : 0,0019 bps sur 20 mesures. */
const HOOK_DISAGREE = "0x3b2b979df21036cee51b8debb13100e2cb8deacc";
/** Mesure sur un pool, aucune fiche dans le registre charge. */
const HOOK_NO_ENTRY = "0xb995b9efcc8021300bdc93fbd0c156e9a5ca0088";

function py(name: string): any {
  return JSON.parse(readFileSync(join(PY, name + ".json"), "utf8"));
}

let app: ReturnType<typeof createApp>["app"];

beforeAll(() => {
  app = createApp({
    config: { usageLogPath: "", x402Enabled: true },
    facilitator: fakeFacilitator(),
    engine: fakeEngine(),
  }).app;
});

async function get(path: string): Promise<{ status: number; body: any }> {
  const res = await app.request(path);
  return { status: res.status, body: await res.json() };
}

/**
 * Retire l'enveloppe (provenance, cache, cout, note) pour comparer au JSON de la CLI
 * Python. `chain_id` n'est retire que si Python ne le porte pas : certaines reponses
 * (summary, disagreement) le contiennent deja, et l'effacer masquerait un ecart.
 */
function core(body: any, expected: any): any {
  const { graph, cache, took_ms, note, routes, ...rest } = body;
  void graph, cache, took_ms, note, routes;
  if (!(expected && typeof expected === "object" && "chain_id" in expected)) delete rest.chain_id;
  return rest;
}

/** core() + comparaison, pour ne jamais oublier de passer l'attendu au filtre. */
function expectSameAsPython(body: any, fixture: string): void {
  const expected = py(fixture);
  expect(core(body, expected)).toEqual(expected);
}

describe("parite avec engine/tare/graph/queries.py", () => {
  it("GET /graph/impact/:hook rend exactement l'impact de la CLI Python", async () => {
    const { status, body } = await get(`/graph/impact/${HOOK_MEASURED}`);
    expect(status).toBe(200);
    expectSameAsPython(body, "impact-0x985c14ba");
    // et le rayon de souffle est bien un rayon : plus large que les pools directs seuls
    expect(body.n_pools_at_risk).toBeGreaterThanOrEqual(body.n_pools);
  });

  it("GET /graph/impact/:hook rend le meme impact sur un hook a clone nul", async () => {
    const { body } = await get(`/graph/impact/${HOOK_DISAGREE}`);
    expectSameAsPython(body, "impact-0x3b2b979d");
  });

  it("GET /graph/twins/:hook rend exactement les clones de la CLI Python", async () => {
    const a = await get(`/graph/twins/${HOOK_TWIN}`);
    expect(a.status).toBe(200);
    expectSameAsPython(a.body, "twins-0x04e08a08");
    expect(a.body.n_twins).toBe(1);

    const b = await get(`/graph/twins/${HOOK_MEASURED}`);
    expectSameAsPython(b.body, "twins-0x985c14ba");
  });

  it("GET /graph/deployer/:hook et /graph/summary/:hook suivent la CLI Python", async () => {
    expectSameAsPython((await get(`/graph/deployer/${HOOK_MEASURED}`)).body, "deployer-0x985c14ba");
    expectSameAsPython((await get(`/graph/summary/${HOOK_MEASURED}`)).body, "summary-0x985c14ba");
  });

  it("GET /graph/orphans rend la meme liste, dans le meme ordre", async () => {
    const { status, body } = await get("/graph/orphans");
    expect(status).toBe(200);
    expectSameAsPython(body, "orphans");
    expect(body.n_orphans).toBe(148);
    expect(body.n_listed).toBe(157);
  });

  it("GET /graph/contradictions rend les memes divergences, champ par champ", async () => {
    const { status, body } = await get("/graph/contradictions");
    expect(status).toBe(200);
    expectSameAsPython(body, "contradictions");
    expect(body.n_contradictory).toBe(33);
    expect(body.n_hooks_with_multiple_entries).toBe(37);
  });

  it("GET /graph/disagreement rend le meme desaccord, listes et non-comparables", async () => {
    const { status, body } = await get("/graph/disagreement");
    expect(status).toBe(200);
    expectSameAsPython(body, "disagreement");
    expect(body.n_registry_says_active_measure_says_flat).toBe(1);
    expect(body.registry_says_active_measure_says_flat[0].address).toBe(HOOK_DISAGREE);
  });

  it("GET /graph/clusters rend les memes grappes de clones", async () => {
    const { status, body } = await get("/graph/clusters");
    expect(status).toBe(200);
    expect(body.clusters).toEqual(py("clusters"));
    expect(body.n_clusters).toBe(2);
    expect(body.n_hooks).toBe(4);
  });

  it("les statistiques du store correspondent au bloc stats de graph.json", () => {
    const onDisk = JSON.parse(readFileSync(DEFAULT_GRAPH_PATH, "utf8"));
    expect(loadGraphStore(DEFAULT_GRAPH_PATH).stats()).toEqual(onDisk.stats);
  });
});

describe("le graphe est charge une fois, pas une fois par requete", () => {
  it("cinq requetes de suite ne relisent pas le fichier", async () => {
    // On force au moins un chargement, puis on compte a partir de la.
    await get("/graph");
    const before = graphCacheStats();
    for (let i = 0; i < 5; i++) await get("/graph/orphans");
    const after = graphCacheStats();
    expect(after.misses).toBe(before.misses); // aucune relecture
    expect(after.hits).toBe(before.hits + 5); // cinq fois le meme store
  });

  it("le cache est invalide par une reecriture, pas par un simple acces", () => {
    const dir = mkdtempSync(join(tmpdir(), "tare-graph-"));
    const p = join(dir, "graph.json");
    const g = {
      meta: { block_number: 1 },
      nodes: [{ id: "hook:8453:0x" + "aa".repeat(20), kind: "Hook", label: "A", attrs: {} }],
      edges: [],
    };
    writeFileSync(p, JSON.stringify(g));
    const first = loadGraphStore(p);
    expect(loadGraphStore(p)).toBe(first); // meme objet : rien n'a bouge

    g.nodes.push({ id: "hook:8453:0x" + "bb".repeat(20), kind: "Hook", label: "B", attrs: {} });
    writeFileSync(p, JSON.stringify(g));
    const second = loadGraphStore(p);
    expect(second).not.toBe(first); // le fichier a change : nouveau store
    expect(second.stats().nodes).toBe(2);
    expect(first.stats().nodes).toBe(1); // l'ancien n'a pas ete mute

    expect(invalidateGraph(p)).toBe(2); // deux entrees pour ce chemin
  });

  it("un agregat n'est calcule qu'une fois : deux appels rendent le meme objet", () => {
    const s = loadGraphStore(DEFAULT_GRAPH_PATH);
    expect(s.contradictions()).toBe(s.contradictions());
    expect(s.orphans(8453)).toBe(s.orphans(8453));
    expect(s.disagreement(8453, 1.0)).toBe(s.disagreement(8453, 1.0));
  });
});

describe("aucune route n'invente un nombre", () => {
  it("un graphe absent rend 503, jamais des listes vides", async () => {
    const router = createGraphRouter({ graphPath: join(tmpdir(), "tare-graphe-qui-nexiste-pas.json") });
    for (const route of ["/graph", "/graph/orphans", "/graph/contradictions", "/graph/disagreement"]) {
      const res = await router.request(route);
      expect(res.status).toBe(503);
      const body = (await res.json()) as any;
      expect(body.error).toBe("graphe indisponible");
      expect(body.build).toContain("tare.graph.cli build");
      expect(body).not.toHaveProperty("n_orphans");
      expect(body).not.toHaveProperty("orphans");
    }
  });

  it("un hook absent du graphe rend 404 avec un statut, jamais twins:[] en 200", async () => {
    const ghost = "0x" + "01".repeat(20);
    const { status, body } = await get(`/graph/twins/${ghost}`);
    expect(status).toBe(404);
    expect(body.found).toBe(false);
    expect(body.status).toBe("UNKNOWN_HOOK");
    expect(body.note).toContain("Absent du graphe n'est pas");

    const imp = await get(`/graph/impact/${ghost}`);
    expect(imp.status).toBe(404);
    expect(imp.body).not.toHaveProperty("n_pools_at_risk");
  });

  it("une adresse malformee rend 400, pas un graphe vide", async () => {
    for (const bad of ["pas-une-adresse", "0x1234", "0xzz85c14baa2a18316ffda0aefb3a632fadfca2acc"]) {
      const { status, body } = await get(`/graph/impact/${bad}`);
      expect(status).toBe(400);
      expect(body.error).toBe("adresse invalide");
    }
  });

  it("un hook dont le bytecode n'a pas ete lu n'est pas un hook sans clone", async () => {
    const s = loadGraphStore(DEFAULT_GRAPH_PATH);
    // Un hook du registre sur une autre chaine : jamais interroge par eth_getCode.
    const orph = s.orphans(1) as any;
    void orph;
    const unread = [...s.ofKind("Hook")].find(
      (n) => n.attrs["bytecode_status"] === undefined && n.attrs["chain_id"] === 1,
    );
    expect(unread).toBeDefined();
    const t = s.twins(unread!.id) as any;
    expect(t.found).toBe(true);
    expect(t.status).toBe("UNAVAILABLE"); // et surtout pas "CODE" avec zero clone
    expect(t.reason).toContain("aucun bytecode");
    expect(t.code_hash).toBeNull();
  });

  it("un hook sans mesure MEASURED a bps_max = null, jamais 0", async () => {
    const { body } = await get("/graph/disagreement");
    expect(body.n_not_comparable).toBeGreaterThan(0);
    for (const row of body.not_comparable) {
      expect(row.profile.n_measured).toBe(0);
      expect(row.profile.bps_max).toBeNull();
      expect(row.profile.flat).toBeNull();
      expect(row.reason).toContain("aucune mesure MEASURED");
    }
  });

  it("le desaccord par hook nomme son verdict au lieu de rendre un nombre nu", async () => {
    const a = await get(`/graph/disagreement/${HOOK_DISAGREE}`);
    expect(a.status).toBe(200);
    expect(a.body.verdict).toBe("REGISTRY_SAYS_ACTIVE_MEASURE_SAYS_FLAT");
    expect(a.body.vanillaSwap_declared).toEqual([false]);
    expect(a.body.profile.bps_max).toBe(0.0019);
    expect(a.body.note).toContain("vanillaSwap=false");

    // Le meme hook, seuil abaisse sous la mesure : le desaccord doit disparaitre.
    const b = await get(`/graph/disagreement/${HOOK_DISAGREE}?flat-bps=0.001`);
    expect(b.body.verdict).toBe("AGREE");
    expect(b.body.flat_bps).toBe(0.001);

    // Le registre dit vanillaSwap=false et la mesure preleve : les deux disent pareil.
    const c = await get(`/graph/disagreement/${HOOK_MEASURED}`);
    expect(c.body.verdict).toBe("AGREE");
    expect(c.body.vanillaSwap_declared).toEqual([false]);
    expect(c.body.profile.bps_max).toBeGreaterThan(1);

    // Un hook mesure mais absent du registre charge : ni accord ni desaccord.
    const d = await get(`/graph/disagreement/${HOOK_NO_ENTRY}`);
    expect(d.body.verdict).toBe("NO_REGISTRY_ENTRY");
    expect(d.body.n_registry_entries).toBe(0);
    expect(d.body.note).toContain("Ce n'est pas un accord");
  });
});

describe("chaque reponse porte sa provenance", () => {
  it("l'enveloppe cite le fichier, le bloc et les sources du graphe", async () => {
    const { body } = await get("/graph");
    expect(body.graph.source).toBe(DEFAULT_GRAPH_PATH);
    expect(body.graph.block_number).toBe(50614000);
    expect(body.graph.n_measurements).toBe(995);
    expect(body.graph.chain_cache_present).toBe(true);
    expect(body.graph.measurements).toContain("measurements.jsonl");
    expect(typeof body.took_ms).toBe("number");
  });

  it("GET /graph publie les comptes que les traversees revelent", async () => {
    const { body } = await get("/graph");
    expect(body.findings).toEqual({
      clone_clusters: 2,
      hooks_in_clone_clusters: 4,
      orphans: 148,
      listed_hooks_on_chain: 157,
      hooks_with_multiple_registry_entries: 37,
      contradictions: 33,
      registry_says_active_measure_says_flat: 1,
      registry_says_vanilla_measure_says_active: 0,
      not_comparable: 149,
    });
  });

  it("les orphelins et le desaccord disent leur portee au lieu de la sous-entendre", async () => {
    const o = await get("/graph/orphans");
    expect(o.body.scope).toContain("chain_id=8453");
    expect(o.body.note).toContain("pas une absence on-chain");

    const d = await get("/graph/disagreement");
    expect(d.body.chain_id).toBe(8453);
    expect(d.body.flat_bps).toBe(1);
  });

  it("l'API annonce la route du graphe dans son sommaire", async () => {
    const res = await app.request("/");
    const body = (await res.json()) as any;
    expect(body.routes.some((r: string) => r.includes("/graph"))).toBe(true);
  });
});
