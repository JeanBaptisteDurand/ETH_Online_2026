/**
 * La consultation. Regle dure n.2 : aucune etiquette n'est promue.
 */
import { describe, it, expect } from "vitest";
import { TABLE } from "../src/guard.js";
import { consult, hookContext, assertTable, BadTable } from "../src/table.js";
import { WORST_POOL } from "./helpers.js";

describe("table pre-calculee", () => {
  it("porte les 995 mesures du bloc 50 614 000", () => {
    expect(TABLE.schema).toBe("tare-guard-table/1");
    expect(TABLE.n_measurements).toBe(995);
    expect(TABLE.n_hooks).toBe(12);
    expect(TABLE.n_pools).toBe(199);
    expect(TABLE.block_number).toBe(50614000);
    expect(TABLE.chain_id).toBe(8453);
    expect(TABLE.engine_ver).toBe("tare-engine/0.3.0");
    expect(TABLE.stub_hash).toBe("0x8e39b2ad4344342b4f7dc5cf31df0aec9bd5b5f8ec7fccd241256cf1fda637a4");
  });

  it("refuse une table qui n'a pas le bon schema", () => {
    expect(() => assertTable({ schema: "autre" })).toThrow(BadTable);
    expect(() => assertTable(null)).toThrow(BadTable);
  });

  it("aucune ligne NOT_QUOTABLE ou NOT_MEASURABLE ne porte de nombre", () => {
    let nonNumeric = 0;
    for (const pool of Object.values(TABLE.pools)) {
      for (const points of Object.values(pool.dirs)) {
        for (const p of points) {
          if (p.label === "NOT_QUOTABLE" || p.label === "NOT_MEASURABLE") {
            expect(p.bps, `${p.label} porte ${p.bps}`).toBeNull();
            nonNumeric++;
          }
        }
      }
    }
    expect(nonNumeric).toBe(275); // 265 NOT_QUOTABLE + 10 NOT_MEASURABLE
  });
});

describe("consult", () => {
  const dir = "1->0" as const;

  it("taille exacte -> MEASURED, avec le bloc et la taille cites", () => {
    const c = consult(TABLE, WORST_POOL.poolId, WORST_POOL.hook, dir, "100000000000000");
    expect(c.label).toBe("MEASURED");
    expect(c.basis).toBe("exact");
    expect(c.bps).toBeCloseTo(689.9519, 4);
    expect(c.citations.length).toBe(1);
    expect(c.citations[0]!.blockNumber).toBe(50614000);
    expect(c.citations[0]!.amountIn).toBe("100000000000000");
  });

  it("taille intermediaire -> INTERPOLATED, encadree par deux mesures citees", () => {
    const c = consult(TABLE, WORST_POOL.poolId, WORST_POOL.hook, dir, "300000000000000000");
    expect(c.label).toBe("INTERPOLATED");
    expect(c.basis).toBe("interpolated");
    expect(c.citations.length).toBe(2);
    expect(c.citations[0]!.amountIn).toBe("100000000000000000");
    expect(c.citations[1]!.amountIn).toBe("1000000000000000000");
    // le profil descend de 645,05 a 406,64 : l'interpole doit tomber entre les deux
    expect(c.bps!).toBeLessThan(645.0497);
    expect(c.bps!).toBeGreaterThan(406.6356);
  });

  it("taille hors plage -> NOT_MEASURABLE, jamais une extrapolation", () => {
    const big = consult(TABLE, WORST_POOL.poolId, WORST_POOL.hook, dir, "10000000000000000000");
    expect(big.label).toBe("NOT_MEASURABLE");
    expect(big.bps).toBeNull();
    expect(big.reason).toContain("taille_hors_plage_mesuree");
    expect(big.citations[0]!.amountIn).toBe("1000000000000000000");
    const small = consult(TABLE, WORST_POOL.poolId, WORST_POOL.hook, dir, "1");
    expect(small.label).toBe("NOT_MEASURABLE");
    expect(small.bps).toBeNull();
  });

  it("sens non mesure -> NOT_MEASURABLE, avec l'autre sens en faisceau", () => {
    const c = consult(TABLE, WORST_POOL.poolId, WORST_POOL.hook, "0->1", "100000000000000");
    expect(c.label).toBe("NOT_MEASURABLE");
    expect(c.bps).toBeNull();
    expect(c.reason).toBe("sens_non_mesure:0->1");
    expect(c.citations.length).toBe(5); // les cinq tailles de l'autre sens
    expect(c.basis).toBe("evidence");
  });

  it("taille inconnue (OPEN_DELTA, multi-saut) -> tout le profil en faisceau, aucun nombre", () => {
    const c = consult(TABLE, WORST_POOL.poolId, WORST_POOL.hook, dir, null);
    expect(c.label).toBe("NOT_MEASURABLE");
    expect(c.bps).toBeNull();
    expect(c.reason).toContain("taille_absente_du_calldata");
    expect(c.citations.length).toBe(5);
  });

  it("pool absent mais hook connu -> NOT_MEASURABLE + contexte du hook, pas de promotion", () => {
    const c = consult(TABLE, "0x" + "ab".repeat(32), WORST_POOL.hook, dir, "100000000000000");
    expect(c.label).toBe("NOT_MEASURABLE");
    expect(c.bps).toBeNull();
    expect(c.reason).toContain("pool_absent_de_la_table");
    expect(c.basis).toBe("evidence");
    expect(c.hookContext!.measured!.bpsMax).toBeCloseTo(689.9519, 4);
    expect(c.hookContext!.measured!.worst.amountIn).toBe("100000000000000");
  });

  it("hook totalement inconnu -> aucun faisceau, aucun nombre", () => {
    const c = consult(TABLE, "0x" + "cd".repeat(32), "0x" + "11".repeat(20), dir, "100000000000000");
    expect(c.label).toBe("NOT_MEASURABLE");
    expect(c.bps).toBeNull();
    expect(c.basis).toBe("none");
    expect(c.hookContext).toBeNull();
    expect(c.citations).toEqual([]);
  });

  it("un hook dont toutes les mesures sont non numeriques n'a pas de mediane", () => {
    // 0xbb7784a4 : comptabilite personnalisee, 10 NOT_MEASURABLE + 5 NOT_QUOTABLE
    const ctx = hookContext(TABLE, "0xbb7784a4d481184283ed89619a3e3ed143e1adc0");
    expect(ctx).not.toBeNull();
    expect(ctx!.measured).toBeNull();
    expect(ctx!.labels["NOT_MEASURABLE"]).toBe(10);
    expect(ctx!.labels["NOT_QUOTABLE"]).toBe(5);
  });
});
