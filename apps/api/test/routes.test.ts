/** Les quatre routes de lecture, sur le jeu v1 fige. */
import { describe, it, expect, beforeAll } from "vitest";
import { createApp } from "../src/app.js";
import { fakeFacilitator, fakeEngine } from "./helpers.js";

const HOOK_A = "0x985c14baa2a18316ffda0aefb3a632fadfca2acc";
const HOOK_B = "0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc";

let app: ReturnType<typeof createApp>["app"];

beforeAll(() => {
  app = createApp({
    config: { usageLogPath: "", x402Enabled: true },
    facilitator: fakeFacilitator(),
    engine: fakeEngine(),
  }).app;
});

describe("GET /hooks", () => {
  it("classe les hooks par bps maximum et compte pools et mesures", async () => {
    const res = await app.request("/hooks");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.count).toBeGreaterThanOrEqual(4);

    const a = body.hooks.find((h: any) => h.hook === HOOK_A);
    expect(a.pools).toBe(25);
    expect(a.measurements).toBe(100);
    expect(a.labels.MEASURED).toBe(52);

    const b = body.hooks.find((h: any) => h.hook === HOOK_B);
    expect(b.pools).toBe(2);
    expect(b.measurements).toBe(8);

    // trie decroissant, les hooks sans nombre en dernier
    const withBps = body.hooks.filter((h: any) => h.max_bps !== null).map((h: any) => h.max_bps);
    expect([...withBps].sort((x, y) => y - x)).toEqual(withBps);
  });

  it("distingue 'pas de registre charge' de 'absent du registre'", async () => {
    const body = await (await app.request("/hooks")).json() as any;
    for (const h of body.hooks) {
      if (!h.registry_available) {
        expect(h.in_registry).toBeNull();
        expect(h.registry).toBeNull();
      } else {
        expect(typeof h.in_registry).toBe("boolean");
      }
    }
  });

  it("fait porter a chaque maximum son bloc, sa taille, son sens et son rejeu", async () => {
    const body = await (await app.request("/hooks")).json() as any;
    for (const h of body.hooks) {
      if (h.max_bps === null) continue;
      expect(h.max_measurement.block_number).toBeGreaterThan(0);
      expect(h.max_measurement.amount_in).toMatch(/^[0-9]+$/);
      expect(["0->1", "1->0"]).toContain(h.max_measurement.direction);
      expect(h.max_measurement.replay).toContain("--amount-in");
    }
  });
});

describe("GET /hook/:address", () => {
  it("rend tous les profils, chacun avec pool_id, bloc, taille, sens et etiquette", async () => {
    const res = await app.request(`/hook/${HOOK_B}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.count).toBe(8);
    expect(body.profiles.length).toBe(2);
    for (const p of body.profiles) {
      expect(p.pool_id).toMatch(/^0x[0-9a-f]{64}$/);
      for (const pt of p.points) {
        expect(pt.block_number).toBe(50614000);
        expect(pt.amount_in).toMatch(/^[0-9]+$/);
        expect(["0->1", "1->0"]).toContain(pt.direction);
        expect(["MEASURED", "INTERPOLATED", "NOT_MEASURABLE", "NOT_QUOTABLE"]).toContain(pt.label);
        expect(pt.replay).toContain("measure_one.py");
      }
    }
  });

  it("refuse une adresse malformee", async () => {
    expect((await app.request("/hook/pas-une-adresse")).status).toBe(400);
  });

  it("ne confond pas 'aucune mesure' avec zero", async () => {
    const res = await app.request("/hook/0x0000000000000000000000000000000000000001");
    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(body.measurements).toEqual([]);
    expect(body.note).toContain("absence de mesure");
  });
});

describe("GET /measurement/:id", () => {
  it("rend la mesure et sa commande de rejeu exacte", async () => {
    const hook = await (await app.request(`/hook/${HOOK_B}`)).json() as any;
    const id = hook.profiles[0].points[0].id;
    const res = await app.request(`/measurement/${id}`);
    expect(res.status).toBe(200);
    const m = await res.json() as any;
    expect(m.id).toBe(id);
    expect(m.replay.command).toBe(`make measure HOOK=${HOOK_B} BLOCK=${m.block_number}`);
    expect(m.replay_command).toContain(`--hooks ${HOOK_B}`);
    expect(m.replay_command).toContain(`--amount-in ${m.amount_in}`);
    expect(m.replay_command).toContain(`--zero-for-one ${m.zero_for_one}`);
    expect(m.how_to_replay.length).toBe(3);
  });

  it("rend 404 sur un id inconnu, jamais une mesure vide", async () => {
    const res = await app.request("/measurement/m_0000000000000000");
    expect(res.status).toBe(404);
    expect((await res.json() as any).error).toBe("mesure inconnue");
  });
});
