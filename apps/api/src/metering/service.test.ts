/**
 * Le service et ses routes. L'ancreur est un double : aucune de ces
 * assertions n'ecrit sur Hedera. Le vrai message publie, lui, est verifie par
 * live-hcs.test.ts et par `tsx src/metering/cli.ts read`.
 */
import { describe, it, expect } from "vitest";
import { MeteringLedger, type BatchInput, type MeasurementUnit } from "./ledger.js";
import { MeteringService, type AnchorPublisher } from "./service.js";
import { meteringRouter } from "./router.js";
import { hmacSigner } from "./hmac.js";
import { HCS_SCHEMA, messageHash, anchorPayload, type AnchorPayload, type PublishResult } from "./hcs.js";
import { createMetering, toMeasurementUnit } from "./index.js";

const SECRET = "hmac-de-test";

function unit(over: Partial<MeasurementUnit> = {}): MeasurementUnit {
  return {
    measurement_id: "m_0123456789abcdef",
    hook: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    pool_id: "0x" + "cd".repeat(32),
    block_number: 50614000,
    amount_in: "1000000000000000",
    direction: "0->1",
    label: "MEASURED",
    bps: 42.5,
    ...over,
  };
}

function batch(units: MeasurementUnit[], over: Partial<BatchInput> = {}): BatchInput {
  return {
    route: "/measure",
    method: "POST",
    payer: "0.0.10367920",
    network: "hedera:testnet",
    scheme: "exact",
    units_requested: units.length,
    units,
    unit_price_usd: 0.001,
    latency_ms: 90,
    error: null,
    ...over,
  };
}

/** Ancreur double : garde ce qu'on lui donne, et rejoue le mirror a la demande. */
function fakeAnchor(opts: { verified?: boolean; throwOnPublish?: boolean; fee?: number | null } = {}) {
  const published: AnchorPayload[] = [];
  let seq = 0;
  const anchor: AnchorPublisher = {
    topic_id: "0.0.10371106",
    network: "testnet",
    hashscan: "https://hashscan.io/testnet/topic/0.0.10371106",
    async publish(payload) {
      if (opts.throwOnPublish) throw new Error("INVALID_SIGNATURE");
      published.push(payload);
      seq += 1;
      const message = anchorPayload(payload);
      const res: PublishResult = {
        topic_id: "0.0.10371106",
        sequence_number: seq,
        transaction_id: `0.0.10367920@178856922${seq}.000000000`,
        charged_tx_fee_tinybar: opts.fee === undefined ? 377528 : opts.fee,
        charged_tx_fee_hbar: opts.fee === undefined ? 0.00377528 : null,
        fee_note: opts.fee === null ? "cout non lu — non verifie, pas zero" : null,
        message,
        message_bytes: Buffer.byteLength(message, "utf8"),
        message_hash: messageHash(message),
        hashscan: "https://hashscan.io/testnet/topic/0.0.10371106",
      };
      return res;
    },
    async verify(sequenceNumber, expectedMessage) {
      const ok = opts.verified !== false;
      return {
        verified: ok,
        reason: ok ? null : "NOT_VERIFIED: mirror_lag: message pas encore indexe",
        topic_id: "0.0.10371106",
        sequence_number: sequenceNumber,
        mirror_url: `https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10371106/messages/${sequenceNumber}`,
        message: ok
          ? {
              sequence_number: sequenceNumber,
              consensus_timestamp: "1788569234.806167390",
              payer_account_id: "0.0.10367920",
              message_utf8: expectedMessage ?? "",
              message_hash: messageHash(expectedMessage ?? ""),
              parsed: expectedMessage ? (JSON.parse(expectedMessage) as AnchorPayload) : null,
            }
          : null,
      };
    },
  };
  return { anchor, published };
}

describe("MeteringService", () => {
  it("garde la fenetre de CorLens (1er du mois UTC) et groupe par payeur", () => {
    const svc = new MeteringService({ ledger: new MeteringLedger({ path: null }) });
    svc.recordBatch(batch([unit(), unit({ amount_in: "2" })], { payer: "0.0.111" }));
    svc.recordBatch(batch([unit({ amount_in: "3" })], { payer: "0.0.222" }));

    const now = new Date("2026-09-05T00:47:00.000Z");
    const rollup = svc.rollupSinceMonthStart(now);
    expect(rollup.since).toBe("2026-09-01T00:00:00.000Z");
    expect(rollup.unit).toBe("measurement");
    expect(rollup.byPayer.map((p) => [p.payer, p.units_billed])).toEqual([
      ["0.0.111", 2],
      ["0.0.222", 1],
    ]);
  });

  it("ancre un lot : le mirror confirme, les lignes recoivent le sequence number", async () => {
    const ledger = new MeteringLedger({ path: null });
    const { anchor, published } = fakeAnchor();
    const svc = new MeteringService({ ledger, anchor });

    const receipt = svc.recordBatch(batch([unit(), unit({ amount_in: "2" })]));
    svc.attachSettlement(receipt.batch_id, {
      success: true,
      transaction: "0.0.10367920@1788569227.263707186",
    });
    const out = await svc.anchorBatch(receipt);

    expect(out.status).toBe("ANCHORED");
    expect(out.publish!.sequence_number).toBe(1);
    expect(published[0]).toMatchObject({
      v: HCS_SCHEMA,
      digest: receipt.digest,
      units: 2,
      amount_usd: 0.002,
      payer: "0.0.10367920",
      settlement: "0.0.10367920@1788569227.263707186",
      block: 50614000,
    });
    expect(ledger.rowsOf(receipt.batch_id).every((r) => r.hcs_sequence_number === 1)).toBe(true);
    expect(ledger.unanchoredBatches()).toEqual([]);

    const hcs = svc.hcsStatus() as Record<string, any>;
    expect(hcs.enabled).toBe(true);
    expect(hcs.anchored_batches).toBe(1);
    expect(hcs.cost.total_tinybar).toBe(377528);
  });

  it("mirror muet => NOT_ANCHORED : l'echec n'est jamais promu en succes", async () => {
    const ledger = new MeteringLedger({ path: null });
    const svc = new MeteringService({ ledger, anchor: fakeAnchor({ verified: false }).anchor });
    const receipt = svc.recordBatch(batch([unit()]));
    const out = await svc.anchorBatch(receipt);

    expect(out.ok).toBe(false);
    expect(out.status).toBe("NOT_ANCHORED");
    expect(out.reason).toContain("NOT_VERIFIED");
    // la ligne n'est PAS marquee ancree
    expect(ledger.rowsOf(receipt.batch_id)[0]!.hcs_sequence_number).toBeNull();
    expect(ledger.unanchoredBatches()).toEqual([receipt.batch_id]);
  });

  it("publication refusee par le reseau => NOT_ANCHORED avec la raison", async () => {
    const svc = new MeteringService({
      ledger: new MeteringLedger({ path: null }),
      anchor: fakeAnchor({ throwOnPublish: true }).anchor,
    });
    const out = await svc.anchorBatch(svc.recordBatch(batch([unit()])));
    expect(out.status).toBe("NOT_ANCHORED");
    expect(out.reason).toContain("INVALID_SIGNATURE");
    expect(out.publish).toBeNull();
  });

  it("sans topic configure, /usage dit 'pas ancre', pas 'ancre a zero'", async () => {
    const svc = new MeteringService({ ledger: new MeteringLedger({ path: null }), anchor: null });
    svc.recordBatch(batch([unit()]));
    const hcs = svc.hcsStatus() as Record<string, any>;
    expect(hcs.enabled).toBe(false);
    expect(hcs.unanchored_batches).toBe(1);
    expect(String(hcs.note)).toContain("pas ancre");
    const out = await svc.anchorBatch(svc.recordBatch(batch([unit({ amount_in: "5" })])));
    expect(out.status).toBe("NOT_ANCHORED");
  });

  it("un cout non lu reste null dans l'agregat, jamais compte comme zero", async () => {
    const svc = new MeteringService({
      ledger: new MeteringLedger({ path: null }),
      anchor: fakeAnchor({ fee: null }).anchor,
    });
    await svc.anchorBatch(svc.recordBatch(batch([unit()])));
    const hcs = svc.hcsStatus() as Record<string, any>;
    expect(hcs.cost.messages_with_known_cost).toBe(0);
    expect(String(hcs.cost.note)).toContain("pas gratuit");
  });
});

describe("les routes du compteur", () => {
  function build(opts: { verified?: boolean } = {}) {
    const ledger = new MeteringLedger({ path: null });
    const { anchor } = fakeAnchor(opts);
    const svc = new MeteringService({ ledger, anchor });
    const app = meteringRouter(svc, { hmacSecret: SECRET });
    return { ledger, svc, app };
  }

  it("GET /usage rend le total en MESURES, par payeur, avec les hashes de reglement", async () => {
    const { svc, app } = build();
    const r1 = svc.recordBatch(
      batch(
        ["1", "2", "3", "4", "5"].flatMap((a) => [
          unit({ amount_in: a, direction: "0->1" }),
          unit({ amount_in: a, direction: "1->0" }),
        ]),
      ),
    );
    svc.attachSettlement(r1.batch_id, {
      success: true,
      transaction: "0.0.10367920@1788569227.263707186",
    });
    await svc.anchorBatch(r1);

    const res = await app.request("/usage");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(body.billing.unit).toBe("measurement");
    expect(body.totals.units_recorded).toBe(10);
    expect(body.totals.units_billed).toBe(10);
    expect(body.totals.amount_usd).toBe(0.01);
    expect(body.totals.anchored_units).toBe(10);
    expect(body.by_payer[0].payer).toBe("0.0.10367920");
    expect(body.by_payer[0].settlements[0].transaction).toBe(
      "0.0.10367920@1788569227.263707186",
    );
    expect(body.settlements[0]).toMatchObject({
      transaction: "0.0.10367920@1788569227.263707186",
      ok: true,
      units: 10,
      amount_usd: 0.01,
      hcs_sequence_numbers: [1],
    });
    expect(body.hcs.topic_id).toBe("0.0.10371106");
  });

  it("GET /usage/log rend une ligne PAR MESURE et dit s'il tronque", async () => {
    const { svc, app } = build();
    svc.recordBatch(batch([unit(), unit({ amount_in: "2" }), unit({ amount_in: "3" })]));
    const res = await app.request("/usage/log?limit=2");
    const body = (await res.json()) as any;
    expect(body.returned).toBe(2);
    expect(body.total_rows_in_memory).toBe(3);
    expect(body.truncated).toBe(true);
    expect(body.rows[0]).toHaveProperty("measurement_id");
  });

  it("GET /usage/batch/:id rend le detail, et 404 sur un lot inconnu", async () => {
    const { svc, app } = build();
    const r = svc.recordBatch(batch([unit(), unit({ label: "NOT_MEASURABLE", bps: null })]));
    const ok = (await (await app.request(`/usage/batch/${r.batch_id}`)).json()) as any;
    expect(ok.units_recorded).toBe(2);
    expect(ok.units_billed).toBe(1);
    expect((await app.request("/usage/batch/b_inexistant")).status).toBe(404);
  });

  it("POST /usage/anchor exige la signature HMAC, puis ancre", async () => {
    const { svc, app } = build();
    const r = svc.recordBatch(batch([unit()]));

    const nu = await app.request("/usage/anchor", {
      method: "POST",
      body: JSON.stringify({ batch_id: r.batch_id }),
      headers: { "content-type": "application/json" },
    });
    expect(nu.status).toBe(401);

    const body = JSON.stringify({ batch_id: r.batch_id });
    const signed = await app.request("/usage/anchor", {
      method: "POST",
      body,
      headers: { ...hmacSigner({ secret: SECRET })(body), "content-type": "application/json" },
    });
    expect(signed.status).toBe(200);
    expect(((await signed.json()) as any).status).toBe("ANCHORED");

    const unknown = JSON.stringify({ batch_id: "b_inconnu" });
    const res404 = await app.request("/usage/anchor", {
      method: "POST",
      body: unknown,
      headers: { ...hmacSigner({ secret: SECRET })(unknown), "content-type": "application/json" },
    });
    expect(res404.status).toBe(404);
  });

  it("un ancrage refuse par le mirror sort en 503, jamais en 200", async () => {
    const { svc, app } = build({ verified: false });
    const r = svc.recordBatch(batch([unit()]));
    const body = JSON.stringify({ batch_id: r.batch_id });
    const res = await app.request("/usage/anchor", {
      method: "POST",
      body,
      headers: { ...hmacSigner({ secret: SECRET })(body), "content-type": "application/json" },
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).status).toBe("NOT_ANCHORED");
  });

  it("GET /usage/rollup garde la forme CorLens { since, byPayer }", async () => {
    const { svc, app } = build();
    svc.recordBatch(batch([unit()]));
    const body = (await (await app.request("/usage/rollup")).json()) as any;
    expect(Object.keys(body).sort()).toEqual(["byPayer", "since", "unit"]);
    expect(body.byPayer[0].units_billed).toBe(1);
  });
});

describe("createMetering", () => {
  it("ne touche pas au reseau sans topic, et branche l'adaptateur de mesure", () => {
    const m = createMetering({
      env: {} as NodeJS.ProcessEnv,
      ledgerPath: null,
      unitPriceUsd: 0.001,
    });
    expect(m.hcsConfig).toBeNull();
    expect(m.service.anchor).toBeNull();

    const u = toMeasurementUnit({
      id: "m_dead",
      hook: "0xAAAA",
      pool_id: "0xBBBB",
      block_number: 50614000,
      amount_in: "7",
      direction: "1->0",
      label: "NOT_QUOTABLE",
      bps: null,
    });
    const receipt = m.service.recordBatch(batch([u]));
    expect(receipt.units_billed).toBe(1); // NOT_QUOTABLE est un verdict, pas un silence
    expect(m.ledger.list(1)[0]!.measurement_id).toBe("m_dead");
  });
});

/* ------------------------------------------------------------------------ *
 * Ce que le PREMIER paiement x402 reellement regle a montre, et que rien
 * dans ces tests ne couvrait : la comptabilite d'un lot paye puis declare
 * non facturable, et la republication d'un lot deja ancre.
 * ------------------------------------------------------------------------ */

describe("le premier reglement reel", () => {
  it("une unite NOT_MEASURABLE payee n'est pas gratuite : elle devient un credit", () => {
    const ledger = new MeteringLedger({ path: null });
    const receipt = ledger.recordBatch(batch([unit({ label: "NOT_MEASURABLE", bps: null })]));
    ledger.attachSettlement(receipt.batch_id, {
      success: true,
      transaction: "0.0.7162784@1788839558.000000000",
      payer: "0.0.10367920",
    });

    const t = ledger.totals(null);
    expect(t.units_billed).toBe(0);
    expect(t.amount_usd).toBe(0); // rien n'est DU
    expect(t.amount_settled_usd).toBe(0.001); // mais 0,001 USDC a bel et bien bouge
    expect(t.credit_units).toBe(1);
    expect(t.credit_usd).toBe(0.001); // l'ecart est un credit, jamais un zero
  });

  it("une unite mesuree et payee ne laisse aucun credit", () => {
    const ledger = new MeteringLedger({ path: null });
    const receipt = ledger.recordBatch(batch([unit()]));
    ledger.attachSettlement(receipt.batch_id, {
      success: true,
      transaction: "0.0.7162784@1788839470.544998334",
      payer: "0.0.10367920",
    });
    const t = ledger.totals(null);
    expect(t.amount_usd).toBe(0.001);
    expect(t.amount_settled_usd).toBe(0.001);
    expect(t.credit_usd).toBe(0);
  });

  it("un reglement ECHOUE ne compte ni comme preleve ni comme credit", () => {
    const ledger = new MeteringLedger({ path: null });
    const receipt = ledger.recordBatch(batch([unit({ label: "NOT_MEASURABLE", bps: null })]));
    ledger.attachSettlement(receipt.batch_id, { success: false, transaction: null });
    const t = ledger.totals(null);
    expect(t.amount_settled_usd).toBe(0);
    expect(t.credit_usd).toBe(0);
  });

  it("un lot deja ancre n'est jamais republie : une piste d'audit ne se dedouble pas", async () => {
    const ledger = new MeteringLedger({ path: null });
    const { anchor, published } = fakeAnchor();
    const svc = new MeteringService({ ledger, anchor });
    const receipt = svc.recordBatch(batch([unit()]));

    const first = await svc.anchorBatch(receipt);
    const second = await svc.anchorBatch(receipt);

    expect(first.status).toBe("ANCHORED");
    expect(second).toBe(first); // le meme resultat, pas un second message
    expect(published).toHaveLength(1);
  });

  it("l'empreinte HCS porte le payeur connu au REGLEMENT, pas celui du recu", async () => {
    const ledger = new MeteringLedger({ path: null });
    const { anchor, published } = fakeAnchor();
    const svc = new MeteringService({ ledger, anchor });
    // Le recu ignore le payeur : l'en-tete de paiement Hedera ne le laisse pas voir.
    const receipt = svc.recordBatch(batch([unit()], { payer: null }));
    svc.attachSettlement(receipt.batch_id, {
      success: true,
      transaction: "0.0.7162784@1788839470.544998334",
      payer: "0.0.10367920",
    });

    await svc.anchorBatch(receipt);
    expect(published[0]!.payer).toBe("0.0.10367920");
    expect(published[0]!.settlement).toBe("0.0.7162784@1788839470.544998334");
  });
});
