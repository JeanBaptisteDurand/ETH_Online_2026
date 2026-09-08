/**
 * La route payante et le compteur.
 *
 * Le facilitateur et le moteur sont factices : ce qu'on teste ici, c'est le peage
 * et le comptage, pas le reseau Hedera ni le fork. La preuve que le vrai
 * facilitateur repond, et que le vrai moteur reproduit la porte A3 a travers
 * l'API, est faite par curl et citee dans le rendu.
 */
import { describe, it, expect } from "vitest";
import { createApp } from "../src/app.js";
import { priceFor } from "../src/x402.js";
import { buildPlan } from "../src/plan.js";
import { fakeFacilitator, fakeEngine } from "./helpers.js";

const POOL = {
  currency0: "0x33747ca0945c56315f3e8ae09fc7d4069f1e8c0c",
  currency1: "0x4200000000000000000000000000000000000006",
  fee: 8388608,
  tick_spacing: 200,
  hooks: "0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc",
};

function paidApp() {
  return createApp({
    config: { usageLogPath: "", x402Enabled: true },
    facilitator: fakeFacilitator(),
    engine: fakeEngine(),
  });
}

function freeApp() {
  const engine = fakeEngine();
  const built = createApp({
    config: { usageLogPath: "", x402Enabled: false },
    facilitator: fakeFacilitator(),
    engine,
  });
  return { ...built, engine };
}

async function post(app: ReturnType<typeof createApp>["app"], body: unknown) {
  return app.request("/measure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("prix", () => {
  it("s'ecrit en decimal, jamais en notation scientifique", () => {
    expect(priceFor(1, 0.001)).toBe("$0.001000");
    expect(priceFor(5, 0.001)).toBe("$0.005000");
    expect(priceFor(10, 0.001)).toBe("$0.010000");
  });
});

describe("POST /measure sans paiement", () => {
  it("rend 402 avec accepts[] sur hedera:testnet", async () => {
    const { app } = paidApp();
    const res = await post(app, { pool: POOL, sizes: ["1000000000000000"] });
    expect(res.status).toBe(402);
    const body = await res.json() as any;
    expect(Array.isArray(body.accepts)).toBe(true);
    expect(body.accepts[0].network).toBe("hedera:testnet");
    expect(body.accepts[0].scheme).toBe("exact");
    expect(body.accepts[0].extra.feePayer).toBe("0.0.7162784");
    expect(res.headers.get("payment-required")).toBeTruthy();
  });

  it("facture a la mesure, pas a la requete : 5 tailles coutent 5 unites", async () => {
    const { app } = paidApp();
    const one = await (await post(app, { pool: POOL, sizes: ["1000000000000000"] })).json() as any;
    const five = await (
      await post(app, { pool: POOL, sizes: ["1", "2", "3", "4", "5"] })
    ).json() as any;
    expect(one.billing.units_for_this_request).toBe(1);
    expect(five.billing.units_for_this_request).toBe(5);
    // USDC Hedera : 6 decimales, donc 0,001 USD = 1000 unites atomiques
    expect(one.accepts[0].amount).toBe("1000");
    expect(five.accepts[0].amount).toBe("5000");
    expect(one.accepts[0].asset).toBe("0.0.429274");
  });

  it("refuse un plan invalide AVANT le peage, en 400 et sans exiger de paiement", async () => {
    const { app } = paidApp();
    const res = await post(app, { hook: "0x0000000000000000000000000000000000000009" });
    expect(res.status).toBe(400);
    expect(res.headers.get("payment-required")).toBeNull();
    expect((await res.json() as any).error).toContain("aucun pool");
  });

  it("plafonne le nombre d'unites par requete", async () => {
    const { app } = createApp({
      config: { usageLogPath: "", x402Enabled: true, maxUnitsPerRequest: 3 },
      facilitator: fakeFacilitator(),
      engine: fakeEngine(),
    });
    const res = await post(app, { pool: POOL, sizes: ["1", "2", "3", "4"] });
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toContain("maximum est 3");
  });
});

describe("POST /measure execute", () => {
  it("appelle le moteur une fois par mesure et rend une etiquette par point", async () => {
    const { app, engine } = freeApp();
    const res = await post(app, {
      pool: POOL,
      sizes: ["100000000000000", "1000000000000000"],
      directions: ["0->1", "1->0"],
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.count).toBe(4);
    expect(body.billing.units_requested).toBe(4);
    expect(body.billing.amount_usd).toBe(0.004);
    expect(engine.calls.length).toBe(1);
    expect(engine.calls[0]!.length).toBe(4);
    for (const m of body.measurements) {
      expect(m.label).toBe("MEASURED");
      expect(m.replay_command).toContain("--amount-in");
      expect(m.block_number).toBe(50614000);
    }
    expect(res.headers.get("X-Tare-Units")).toBe("4");
  });

  it("ne rend aucun nombre quand le moteur est muet", async () => {
    const { app } = createApp({
      config: { usageLogPath: "", x402Enabled: false },
      facilitator: fakeFacilitator(),
      engine: {
        health: fakeEngine().health,
        run: async () => {
          throw new Error("anvil injoignable");
        },
      },
    });
    const res = await post(app, { pool: POOL, sizes: ["1000000000000000"] });
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.error).toBe("moteur indisponible");
    expect(body.note).toContain("NOT_MEASURABLE");
    expect(JSON.stringify(body)).not.toContain("bps");
  });
});

describe("compteur d'usage", () => {
  // Le compteur vit maintenant dans src/metering (une ligne PAR MESURE, pas par appel).
  // L'intention de ces tests ne change pas : deux requetes de 1 et 4 tailles doivent facturer
  // CINQ unites, pas deux. Seuls les chemins du contrat ont bouge.
  it("compte des mesures et non des requetes plates", async () => {
    const { app } = freeApp();
    await post(app, { pool: POOL, sizes: ["1"] });
    await post(app, { pool: POOL, sizes: ["1", "2", "3", "4"] });
    const u = await (await app.request("/usage")).json() as any;
    expect(u.billing.unit).toBe("measurement");
    expect(u.totals.batches).toBe(2);          // deux requetes
    expect(u.totals.units_recorded).toBe(5);   // mais cinq mesures
    expect(u.totals.units_billed).toBe(5);
    expect(u.totals.amount_usd).toBeCloseTo(0.005, 10);
    expect(u.by_label.MEASURED).toBe(5);
  });

  it("journalise chaque mesure, pas chaque appel", async () => {
    const { app } = freeApp();
    await post(app, { pool: POOL, sizes: ["1", "2", "3"] });
    const log = await (await app.request("/usage/log?limit=10")).json() as any;
    expect(log.unit).toBe("measurement");
    expect(log.rows.length).toBe(3);           // trois lignes pour UNE requete
    expect(new Set(log.rows.map((r: any) => r.batch_id)).size).toBe(1);
    for (const r of log.rows) expect(r.unit_price_usd).toBe(0.001);
  });

  it("n'annonce jamais un lot ancre sans verification du mirror", async () => {
    const { app } = freeApp();
    await post(app, { pool: POOL, sizes: ["1"] });
    const u = await (await app.request("/usage")).json() as any;
    // sans publication reelle, aucun lot ne peut se dire ancre
    expect(u.hcs.anchored_batches).toBe(0);
    expect(u.hcs.unanchored_batches).toBeGreaterThanOrEqual(0);
  });
});

/* ---------------------------------------------------------------------------
 * Un champ fourni mais malforme n'est pas un champ absent. Le message doit
 * pointer l'erreur reelle, sinon il envoie corriger ce qui va bien.
 * ------------------------------------------------------------------------- */
describe("un refus accuse le bon champ", () => {
  it("pool_id malforme : le dit, au lieu de reclamer un champ deja fourni", () => {
    const p = buildPlan({ pool_id: "0xdeadbeef" }, { defaultBlock: 50614000, maxUnits: 10 });
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.error).toMatch(/pool_id malforme/);
      expect(p.error).not.toMatch(/il faut "hook"/);
    }
  });

  it("hook malforme : pareil", () => {
    const p = buildPlan({ hook: "pas une adresse" }, { defaultBlock: 50614000, maxUnits: 10 });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toMatch(/hook malforme/);
  });

  it("pool objet mais incomplete : nomme les champs qui manquent", () => {
    const p = buildPlan({ pool: { currency0: "0x1" } }, { defaultBlock: 50614000, maxUnits: 10 });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toMatch(/pool\.currency0.*doivent etre des adresses/);
  });

  it.each([[null], [123], ["abc"]])(
    "pool = %s : un refus qui dit le type recu, JAMAIS une panne",
    (valeur) => {
      // Object.keys(null) et Object.keys(123) JETTENT. Un corps hostile ne doit pas
      // pouvoir transformer un refus en 500.
      const p = buildPlan({ pool: valeur }, { defaultBlock: 50614000, maxUnits: 10 });
      expect(p.ok).toBe(false);
      if (!p.ok) expect(p.error).toMatch(/pool inutilisable/);
    },
  );

  it("aucun corps hostile ne fait JETER buildPlan", () => {
    // La propriete qui compte n'est pas le libelle, c'est qu'il y ait toujours un
    // refus motive au lieu d'une exception.
    const hostiles: unknown[] = [
      { pool: [] }, { pool: [1, 2] }, { pool: true }, { pool_id: 42 }, { hook: [] },
      { hook: {} }, { pool_id: {} }, { sizes: "pas un tableau" }, { directions: 7 },
      { pool: { currency0: null } }, { block: "abc" }, { pools: -1 },
    ];
    for (const h of hostiles) {
      const p = buildPlan(h as Record<string, unknown>, { defaultBlock: 50614000, maxUnits: 10 });
      if (!p.ok) expect(typeof p.error).toBe("string");
      expect(p).toHaveProperty("ok");
    }
  });

  it("corps vide : la, le champ est vraiment absent", () => {
    const p = buildPlan({}, { defaultBlock: 50614000, maxUnits: 10 });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toMatch(/il faut "hook"/);
  });
});
