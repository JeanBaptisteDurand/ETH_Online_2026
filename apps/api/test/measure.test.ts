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
  it("compte des mesures et non des requetes plates", async () => {
    const { app } = freeApp();
    await post(app, { pool: POOL, sizes: ["1"] });
    await post(app, { pool: POOL, sizes: ["1", "2", "3", "4"] });
    const u = await (await app.request("/usage")).json() as any;
    expect(u.calls).toBe(2);
    expect(u.units_requested).toBe(5);
    expect(u.units_executed).toBe(5);
    expect(u.amount_usd).toBe(0.005);
    expect(u.unit).toBe("measurement");
    expect(u.by_label.MEASURED).toBe(5);
  });

  it("journalise chaque appel avec ses unites", async () => {
    const { app } = freeApp();
    await post(app, { pool: POOL, sizes: ["1", "2", "3"] });
    const log = await (await app.request("/usage/log?limit=10")).json() as any;
    expect(log.entries.length).toBe(1);
    expect(log.entries[0].units_requested).toBe(3);
    expect(log.entries[0].unit_price_usd).toBe(0.001);
    expect(log.entries[0].amount_usd).toBe(0.003);
  });
});
