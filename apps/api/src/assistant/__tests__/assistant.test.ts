/**
 * L'assistant de bout en bout : le moment de la demo, le graphe, le cache, les routes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Hono } from "hono";
import { DOCS_DIR } from "../../paths.js";
import { ask } from "../ask.js";
import { SessionStore, DEFAULT_QUOTA } from "../session.js";
import { plan, normalize, pickProfile } from "../planner.js";
import { getStore, storeBuildCount, NEGLIGIBLE_BPS } from "../store.js";
import { getGraph, graphBuildCount } from "../graph.js";
import { execute, applyFilter, toRow } from "../execute.js";
import { decodeFlags, HOOK_FLAG_BITS } from "../flags.js";
import { createAssistantRouter } from "../router.js";
import { ActionListSchema } from "../actions.js";
import type { FlagName } from "../actions.js";

const DEMO = "montre-moi les hooks que le registre dit vanillaSwap=false mais qui mesurent moins de 1 bps";
const CLANKER = "0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc";
const LAUNCH = "0x3b2b979df21036cee51b8debb13100e2cb8deacc";
const CLANKER_POOL = "0xd996ff76787c7c520483fe0164699395cc89bfcb6fc4bdba2820771f127fa300";
const fresh = () => new SessionStore();

function testApp() {
  const app = new Hono();
  app.route("/assistant", createAssistantRouter({ sessions: fresh(), cors: false }));
  return app;
}

describe("le modele de lecture", () => {
  it("charge le jeu publie en entier et n'invente pas de hook", () => {
    const s = getStore();
    expect(s.complete).toBe(true);
    expect(s.dataset.measurements).toBeGreaterThan(900);
    expect(s.hooks.length).toBeGreaterThanOrEqual(12);
    expect(s.registry.available).toBe(true);
    // Le registre compte 613 fiches mais 528 ADRESSES : une meme adresse peut etre
    // deployee sur plusieurs chaines, et l'index de dataset.ts est keye par adresse.
    // On le verifie plutot que de le supposer.
    expect(s.registry.entries).toBeGreaterThan(500);
  });

  it("aucun hook mesure n'herite de la fiche d'une autre chaine", () => {
    const raw = JSON.parse(readFileSync(resolve(DOCS_DIR, "hooklist.json"), "utf8")) as {
      hook: { address: string; chain: string };
    }[];
    const chains = new Map<string, Set<string>>();
    for (const e of raw) {
      const a = e.hook.address.toLowerCase();
      if (!chains.has(a)) chains.set(a, new Set());
      chains.get(a)!.add(e.hook.chain);
    }
    for (const h of getStore().hooks) {
      if (h.registry === null) continue;
      const declared = chains.get(h.hook)!;
      expect(declared.size, `${h.hook} est declare sur plusieurs chaines`).toBe(1);
      expect(h.registry.chain).toBe("base");
    }
  });

  it("ne construit la vue et le graphe QU'UNE fois par version du jeu", () => {
    const a = getStore();
    getGraph(a); // premier montage : c'est celui-la qu'on veut voir NE PAS se repeter
    const sBuilds = storeBuildCount();
    const gBuilds = graphBuildCount();
    for (let i = 0; i < 50; i += 1) {
      const b = getStore();
      const g = getGraph(b);
      expect(b).toBe(a);
      expect(g).toBe(getGraph(a));
    }
    expect(storeBuildCount()).toBe(sBuilds);
    expect(graphBuildCount()).toBe(gBuilds);
  });

  it("un hook sans mesure porte max_bps=null et l'etiquette NOT_MEASURABLE, jamais un zero", () => {
    const s = getStore();
    const muets = s.hooks.filter((h) => h.measured === 0);
    expect(muets.length).toBeGreaterThan(0);
    for (const h of muets) {
      expect(h.max_bps).toBeNull();
      expect(toRow(h).answer_label).not.toBe("MEASURED");
      expect(h.disagreement.is).toBeNull();
    }
  });

  it("un hook sans mesure n'est PAS 'sous le seuil' : il est ecarte avec sa raison", () => {
    const s = getStore();
    const out = applyFilter(s.hooks, { maxBps: NEGLIGIBLE_BPS });
    expect(out.kept.every((h) => h.max_bps !== null && h.max_bps <= NEGLIGIBLE_BPS)).toBe(true);
    expect(out.withheld.length).toBeGreaterThan(0);
    for (const w of out.withheld) {
      expect(w.label).not.toBe("MEASURED");
      expect(w.reason).toMatch(/mesur/);
    }
  });
});

describe("les 14 permissions", () => {
  it("les bits bas de l'adresse valent le registre officiel, fiche par fiche", () => {
    const raw = JSON.parse(readFileSync(resolve(DOCS_DIR, "hooklist.json"), "utf8")) as {
      hook: { address: string };
      flags: Record<string, boolean>;
    }[];
    let comparisons = 0;
    const deviations: string[] = [];
    for (const e of raw) {
      const { bitmap } = decodeFlags(e.hook.address);
      for (const [name, says] of Object.entries(e.flags)) {
        const bit = (bitmap & HOOK_FLAG_BITS[name as FlagName]) !== 0;
        comparisons += 1;
        if (bit !== says) deviations.push(`${e.hook.address}:${name}`);
      }
    }
    expect(comparisons).toBeGreaterThan(8000);
    expect(deviations).toEqual([]);
  });
});

describe("le planificateur", () => {
  it("comprend la question de la demo : desaccord registre + seuil lu dans la phrase", () => {
    const p = plan(DEMO, getStore());
    expect(p.intent).toBe("registry-disagrees");
    const filtre = p.actions.find((a) => a.type === "filter");
    expect(filtre).toBeDefined();
    if (filtre?.type === "filter") {
      expect(filtre.filter.registryDisagrees).toBe(true);
      expect(filtre.filter.maxBps).toBe(1);
    }
    expect(p.actions.some((a) => a.type === "sort")).toBe(true);
    expect(ActionListSchema.safeParse(p.actions).success).toBe(true);
  });

  it("lit les accents, les majuscules et les deux sens du seuil", () => {
    expect(normalize("MONTRE-MOI Où ÇA PRÉLÈVE")).toBe("montre-moi ou ca preleve");
    const haut = plan("les hooks qui prennent plus de 250 bps", getStore());
    expect(haut.intent).toBe("top-extractors");
    const bas = plan("les hooks qui prennent moins de 2 bps", getStore());
    expect(bas.intent).toBe("quiet-hooks");
  });

  it("ne confond pas un pool_id avec une adresse de hook", () => {
    const p = plan(`trace la courbe de ${CLANKER} sur ${CLANKER_POOL}`, getStore());
    expect(p.params.hooks).toEqual([CLANKER]);
    expect(p.params.pools).toEqual([CLANKER_POOL]);
    const curve = p.actions.find((a) => a.type === "plotCurve");
    expect(curve?.type === "plotCurve" && curve.pool).toBe(CLANKER_POOL);
  });

  it("choisit le profil non plat quand l'humain ne nomme pas de pool, et dit pourquoi", () => {
    const pick = pickProfile(getStore(), CLANKER);
    expect(pick?.pool_id).toBe(CLANKER_POOL);
    expect(pick?.why).toMatch(/non plat/);
  });

  it("demande une precision plutot que de deviner", () => {
    const p = plan("bonjour, ca va ?", getStore());
    expect(p.intent).toBe("unclear");
    expect(p.actions[0]?.type).toBe("clarify");
  });
});

describe("le moment de la demo", () => {
  it("reduit le tableau a LaunchHook, ecarte les hooks non mesurables, puis ouvre et trace", async () => {
    const bag = fresh();
    const un = await ask(DEMO, { sessionId: "s_demo", sessions: bag });
    expect(un.intent).toBe("registry-disagrees");
    expect(un.data.rows.map((r) => r.hook)).toEqual([LAUNCH]);
    expect(un.data.rows[0]?.vanilla_swap).toBe(false);
    expect(un.data.rows[0]?.max_bps).toBeLessThan(1);
    expect(un.data.withheld.length).toBeGreaterThan(0);
    expect(un.data.withheld.every((w) => w.label !== "MEASURED")).toBe(true);
    expect(un.citations.some((c) => c.kind === "measurement")).toBe(true);

    // on ouvre la ligne : la session se souvient de quoi on parlait
    const deux = await ask("ouvre-le", { sessionId: "s_demo", sessions: bag });
    expect(deux.intent).toBe("open");
    const open = deux.actions.find((a) => a.type === "open");
    expect(open?.type === "open" && open.hook).toBe(LAUNCH);

    // la courbe se dessine sur le pool choisi par l'assistant
    const trois = await ask("trace la courbe", { sessionId: "s_demo", sessions: bag });
    expect(trois.intent).toBe("curve");
    const step = trois.data.steps.find((s) => s.action.type === "plotCurve");
    expect(step?.ok).toBe(true);
    const d = step?.data as { series: { direction: string; points: { bps: number | null; replay: string }[] }[] };
    expect(d.series.length).toBeGreaterThan(0);
    expect(d.series[0]!.points.length).toBeGreaterThan(1);
    for (const pt of d.series[0]!.points) expect(pt.replay).toContain("measure_one.py");
  });

  it("trace le profil non plat de ClankerHookStaticFeeV2, du plus fort au plus faible", async () => {
    const a = await ask(`trace la courbe de ${CLANKER}`, { sessionId: "s_curve", sessions: fresh() });
    const step = a.data.steps.find((s) => s.action.type === "plotCurve");
    const d = step?.data as { non_flat: boolean; series: { points: { bps: number | null }[] }[] };
    expect(d.non_flat).toBe(true);
    const pts = d.series[0]!.points.map((p) => p.bps);
    expect(pts[0]).toBeGreaterThan(pts[pts.length - 1]!);
    expect(a.narration).toContain("n'est pas plat");
  });
});

describe("le graphe de structure", () => {
  it("donne les jumeaux par bitmap de permissions, et dit lesquels sont mesures", () => {
    const g = getGraph(getStore());
    const twins = g.twins(CLANKER);
    expect(twins.length).toBeGreaterThan(0);
    const bitmap = decodeFlags(CLANKER).bitmap;
    for (const t of twins) {
      expect(t.hook).not.toBe(CLANKER);
      expect(t.same_bitmap || t.same_name).toBe(true);
      if (t.same_bitmap) expect(decodeFlags(t.hook).bitmap).toBe(bitmap);
      if (!t.measured) expect(t.max_bps).toBeNull();
    }
  });

  it("le rayon d'impact compte les pools et les tokens, jamais une liquidite approchee", () => {
    const g = getGraph(getStore());
    const r = g.blastRadius(CLANKER);
    expect(r).not.toBeNull();
    expect(r!.pools.length).toBeGreaterThan(0);
    expect(r!.tokens.length).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toMatch(/liquidity_approx|liquidite/);
  });

  it("separe les desaccords etablis des cas non tranchables", () => {
    const c = getGraph(getStore()).contradictions();
    expect(c.confirmed.length).toBeGreaterThan(0);
    for (const x of c.confirmed) expect(x.measured_max_bps).not.toBeNull();
    for (const u of c.unknowable) expect(u.reason).toMatch(/NOT_MEASURABLE|ne se prononce pas|MEASURED/);
    expect(c.flag_mismatches).toEqual([]);
  });

  it("liste les orphelins des deux cotes sans les confondre", () => {
    const o = getGraph(getStore()).orphans();
    expect(o.chain_scope).toBe("base");
    expect(o.measured_not_in_registry.length).toBeGreaterThan(0);
    expect(o.in_registry_never_measured.length).toBeGreaterThan(0);
    const mesures = new Set(getStore().hooks.map((h) => h.hook));
    for (const x of o.in_registry_never_measured) expect(mesures.has(x.hook)).toBe(false);
  });
});

describe("la mesure a la demande", () => {
  it("n'est jamais executee par l'assistant : elle est decrite, chiffree en quota, et renvoyee au peage", async () => {
    const bag = fresh();
    const a = await ask(`mesure ${CLANKER}`, { sessionId: "s_measure", sessions: bag });
    const step = a.data.steps.find((s) => s.action.type === "measure");
    expect(step?.ok).toBe(true);
    const d = step?.data as { route: string; billing: string; quota_left: number; request: Record<string, unknown> };
    expect(d.route).toBe("POST /measure");
    expect(d.billing).toMatch(/x402/);
    expect(d.request).not.toHaveProperty("bps");
    expect(a.quota.measures_used).toBe(1);
  });

  it("s'arrete net quand le quota de mesures de la session est epuise", async () => {
    const bag = new SessionStore({ ...DEFAULT_QUOTA, measures: 1 });
    await ask(`mesure ${CLANKER}`, { sessionId: "s_m2", sessions: bag });
    const deux = await ask(`mesure ${CLANKER}`, { sessionId: "s_m2", sessions: bag });
    const step = deux.data.steps.find((s) => s.action.type === "measure");
    expect(step?.ok).toBe(false);
    expect(step?.note).toMatch(/quota/);
  });

  it("coupe le chat quand le quota de questions est atteint, sans rien affirmer", async () => {
    const bag = new SessionStore({ ...DEFAULT_QUOTA, questions: 2 });
    await ask(DEMO, { sessionId: "s_quota", sessions: bag });
    await ask(DEMO, { sessionId: "s_quota", sessions: bag });
    const trois = await ask(DEMO, { sessionId: "s_quota", sessions: bag });
    expect(trois.ok).toBe(false);
    expect(trois.citations).toEqual([]);
    expect(trois.data.rows).toEqual([]);
    expect(trois.narration).toMatch(/quota/);
  });
});

describe("les routes", () => {
  it("POST /assistant/ask rend des actions valides et un jeu source", async () => {
    const res = await testApp().request("/assistant/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: DEMO, session_id: "s_route" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(ActionListSchema.safeParse(body.actions).success).toBe(true);
    expect(body.dataset.measurements).toBeGreaterThan(900);
    expect(body.honesty_rules.join(" ")).toMatch(/jamais un nombre/);
    expect(body.data.rows[0].hook).toBe(LAUNCH);
  });

  it("GET /assistant/stream envoie les etapes dans l'ordre, jusqu'a done", async () => {
    const res = await testApp().request(`/assistant/stream?q=${encodeURIComponent(DEMO)}&session_id=s_sse`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    const text = await res.text();
    const events = [...text.matchAll(/^event:\s*(\w+)$/gm)].map((m) => m[1]);
    expect(events[0]).toBe("hello");
    expect(events).toContain("plan");
    expect(events).toContain("action");
    expect(events).toContain("rows");
    expect(events).toContain("narration");
    expect(events).toContain("citations");
    expect(events[events.length - 1]).toBe("done");
  });

  it("POST /assistant/actions/validate refuse une action inventee et dit ou", async () => {
    const res = await testApp().request("/assistant/actions/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actions: [{ type: "filter", filter: { minBps: 1, bps: 42 } }] }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; issues: { path: string }[] };
    expect(body.ok).toBe(false);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("POST /assistant/actions/run rejoue un permalien sans passer par le modele", async () => {
    const actions = [
      { type: "reset" },
      { type: "filter", filter: { minBps: 500 } },
      { type: "sort", col: "mesure", dir: "desc" },
    ];
    const res = await testApp().request("/assistant/actions/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actions }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { rows: { max_bps: number }[] } };
    expect(body.data.rows.length).toBeGreaterThan(0);
    expect(body.data.rows.every((r) => r.max_bps >= 500)).toBe(true);
  });

  it("GET /assistant/health dit si la lecture est complete et combien de fois le graphe a ete monte", async () => {
    const res = await testApp().request("/assistant/health");
    const body = (await res.json()) as { complete: boolean; graph: { hooks: number }; graph_builds: number };
    expect(body.complete).toBe(true);
    expect(body.graph.hooks).toBeGreaterThanOrEqual(12);
    expect(body.graph_builds).toBeGreaterThan(0);
  });

  it("GET /assistant/actions publie le catalogue que le front doit savoir executer", async () => {
    const res = await testApp().request("/assistant/actions");
    const body = (await res.json()) as { count: number; actions: { type: string }[] };
    expect(body.count).toBe(18);
    expect(body.actions.map((a) => a.type)).toContain("plotCurve");
  });
});

describe("l'execution des actions", () => {
  it("un identifiant de mesure inconnu ne fabrique pas de ligne", () => {
    const store = getStore();
    const exec = execute(
      [{ type: "showEvidence", measurementId: "m_" + "0".repeat(16) }],
      store,
      getGraph(store),
    );
    expect(exec.steps[0]?.ok).toBe(false);
    expect(exec.steps[0]?.label).toBe("NOT_MEASURABLE");
  });

  it("la preuve d'une vraie ligne rend son etiquette et sa commande de rejeu", async () => {
    const store = getStore();
    const point = store.byHook.get(CLANKER)!.max_measurement!;
    const a = await ask(`montre la preuve ${point.id}`, { sessionId: "s_ev", sessions: fresh() });
    expect(a.intent).toBe("evidence");
    const step = a.data.steps[0]!;
    expect(step.ok).toBe(true);
    const d = step.data as { replay_command: string; label: string; bps: number };
    expect(d.replay_command).toContain("--amount-in");
    expect(d.label).toBe("MEASURED");
    expect(a.citations.some((c) => c.token === String(d.bps))).toBe(true);
  });
});
