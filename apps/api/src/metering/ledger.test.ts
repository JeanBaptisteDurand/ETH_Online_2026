/**
 * Le registre. Le test central est le premier : une requete, dix unites.
 * Si celui-la tombe, le "per-measurement metering" redevient un slogan.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MeteringLedger, batchDigest, type BatchInput, type MeasurementUnit } from "./ledger.js";
import type { Label } from "../labels.js";

function unit(over: Partial<MeasurementUnit> = {}): MeasurementUnit {
  return {
    measurement_id: null,
    hook: "0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa",
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
    latency_ms: 120,
    error: null,
    ...over,
  };
}

describe("l'unite facturee est la mesure, pas la requete", () => {
  it("une requete de 5 tailles x 2 sens ecrit DIX lignes et facture DIX unites", () => {
    const ledger = new MeteringLedger({ path: null });
    const sizes = ["1", "10", "100", "1000", "10000"];
    const units = sizes.flatMap((amount_in) =>
      ([true, false] as const).map((z) =>
        unit({ amount_in, direction: z ? "0->1" : "1->0" }),
      ),
    );
    const receipt = ledger.recordBatch(batch(units));

    expect(receipt.units_recorded).toBe(10);
    expect(receipt.units_billed).toBe(10);
    expect(receipt.amount_usd).toBe(0.01); // 10 x 0,001 $, pas 0,001 $
    expect(ledger.size).toBe(10);
    expect(ledger.rowsOf(receipt.batch_id)).toHaveLength(10);
    // et le prix par requete, lui, serait reste a 1 unite :
    expect(receipt.units_billed).not.toBe(1);
  });

  it("NOT_MEASURABLE n'est pas facture : on ne facture pas un silence", () => {
    const ledger = new MeteringLedger({ path: null });
    const labels: Label[] = ["MEASURED", "INTERPOLATED", "NOT_QUOTABLE", "NOT_MEASURABLE"];
    const receipt = ledger.recordBatch(
      batch(labels.map((label) => unit({ label, bps: label === "MEASURED" ? 1 : null }))),
    );
    expect(receipt.units_recorded).toBe(4);
    expect(receipt.units_billed).toBe(3);
    expect(receipt.amount_usd).toBe(0.003);
    expect(receipt.by_label).toEqual({
      MEASURED: 1,
      INTERPOLATED: 1,
      NOT_QUOTABLE: 1,
      NOT_MEASURABLE: 1,
    });
    const notBilled = ledger.rowsOf(receipt.batch_id).filter((r) => !r.billable);
    expect(notBilled.map((r) => r.label)).toEqual(["NOT_MEASURABLE"]);
    expect(notBilled[0]!.amount_usd).toBe(0);
  });

  it("un moteur muet : la panne est inscrite, zero unite facturee, jamais un zero silencieux", () => {
    const ledger = new MeteringLedger({ path: null });
    const receipt = ledger.recordBatch(
      batch([unit(), unit({ amount_in: "2" })], { error: "engine_unavailable: timeout" }),
    );
    expect(receipt.units_recorded).toBe(2);
    expect(receipt.units_billed).toBe(0);
    expect(receipt.amount_usd).toBe(0);
    expect(ledger.rowsOf(receipt.batch_id).every((r) => r.error !== null)).toBe(true);

    const empty = ledger.recordFailure(
      batch([], { units_requested: 4, error: "engine_unavailable: RPC muet" }),
    );
    expect(empty.units_requested).toBe(4);
    expect(empty.units_recorded).toBe(0);
    expect(empty.units_billed).toBe(0);
  });
});

describe("l'empreinte du lot", () => {
  it("est stable, independante de l'ordre, et change des qu'un bps change", () => {
    const l1 = new MeteringLedger({ path: null });
    const l2 = new MeteringLedger({ path: null });
    const a = unit({ amount_in: "1", bps: 10 });
    const b = unit({ amount_in: "2", bps: 20 });
    const r1 = l1.recordBatch(batch([a, b]));
    const r2 = l2.recordBatch(batch([b, a]));
    expect(r1.digest).toBe(r2.digest);
    expect(r1.digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    const l3 = new MeteringLedger({ path: null });
    const r3 = l3.recordBatch(batch([a, unit({ amount_in: "2", bps: 20.000001 })]));
    expect(r3.digest).not.toBe(r1.digest);

    // et l'empreinte des lignes relues vaut celle du recu
    expect(batchDigest(l1.rowsOf(r1.batch_id))).toBe(r1.digest);
  });
});

describe("le JSONL append-only", () => {
  let dir: string;
  let path: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tare-metering-"));
    path = join(dir, "metering.jsonl");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("se relit, garde la derniere version de chaque ligne, et compte celles qu'il n'a pas su lire", () => {
    const l1 = new MeteringLedger({ path });
    const r = l1.recordBatch(batch([unit(), unit({ amount_in: "2" })]));
    l1.attachSettlement(r.batch_id, { success: true, transaction: "0.0.1@1.2" });
    expect(readFileSync(path, "utf8").trim().split("\n")).toHaveLength(4); // 2 + 2 relectures

    appendFileSync(path, "{ceci n'est pas du json}\n\n");

    const l2 = new MeteringLedger({ path });
    expect(l2.size).toBe(2); // dedoublonne par id, pas 4
    expect(l2.rejectedLines).toEqual([5]); // la ligne cassee est comptee, pas reparee
    expect(l2.rowsOf(r.batch_id).every((x) => x.settlement_tx === "0.0.1@1.2")).toBe(true);
    expect(l2.totals(null).units_billed).toBe(2);
  });
});

describe("les agregats", () => {
  it("groupent par payeur et rendent les hashes de reglement", () => {
    const ledger = new MeteringLedger({ path: null });
    const a = ledger.recordBatch(batch([unit(), unit({ amount_in: "2" })], { payer: "0.0.111" }));
    const b = ledger.recordBatch(
      batch([unit({ label: "NOT_MEASURABLE", bps: null })], { payer: "0.0.222" }),
    );
    ledger.attachSettlement(a.batch_id, { success: true, transaction: "0.0.111@1700.1" });
    ledger.attachSettlement(b.batch_id, { success: false, transaction: "0.0.222@1700.2" });

    const rows = ledger.rollupByPayer(null);
    const p1 = rows.find((r) => r.payer === "0.0.111")!;
    expect(p1.units_recorded).toBe(2);
    expect(p1.units_billed).toBe(2);
    expect(p1.amount_usd).toBe(0.002);
    expect(p1.settlements).toEqual([{ transaction: "0.0.111@1700.1", ok: true, units: 2 }]);

    const p2 = rows.find((r) => r.payer === "0.0.222")!;
    expect(p2.units_recorded).toBe(1);
    expect(p2.units_billed).toBe(0); // NOT_MEASURABLE
    expect(p2.settlements[0]!.ok).toBe(false);

    expect(ledger.rollupByLabel(null)).toEqual({ MEASURED: 2, NOT_MEASURABLE: 1 });
    expect(ledger.rollupByHook(null)[0]!.units_billed).toBe(2);

    const t = ledger.totals(null);
    expect(t).toMatchObject({
      batches: 2,
      units_recorded: 3,
      units_billed: 2,
      units_unbilled: 1,
      amount_usd: 0.002,
      settled_transactions: 2,
      anchored_units: 0,
    });
  });

  it("la fenetre `since` ne compte que ce qui est apres", () => {
    const ledger = new MeteringLedger({ path: null });
    ledger.recordBatch(batch([unit()]));
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(ledger.totals(future).units_recorded).toBe(0);
    expect(ledger.totals(null).units_recorded).toBe(1);
  });

  it("suit les lots pas encore ancres sur HCS", () => {
    const ledger = new MeteringLedger({ path: null });
    const a = ledger.recordBatch(batch([unit()]));
    const b = ledger.recordBatch(batch([unit({ amount_in: "9" })]));
    expect(ledger.unanchoredBatches()).toEqual([a.batch_id, b.batch_id]);
    ledger.attachAnchor(a.batch_id, { topic_id: "0.0.10371106", sequence_number: 1 });
    expect(ledger.unanchoredBatches()).toEqual([b.batch_id]);
    expect(ledger.totals(null).anchored_units).toBe(1);
  });
});
