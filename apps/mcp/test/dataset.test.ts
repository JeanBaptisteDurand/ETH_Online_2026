import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseJsonBigSafe } from "../src/dataset.js";
import { LABELS, normalizeLabel } from "../src/labels.js";
import { POOLS_PATH } from "../src/paths.js";
import { store } from "./helpers.js";

test("the committed evidence loads whole: 128 measurements, 199 pools", () => {
  assert.equal(store.dataset.provenance.measurements_rows, 128);
  assert.equal(store.dataset.provenance.pools_rows, 199);
  assert.match(store.dataset.provenance.measurements_sha256, /^0x[0-9a-f]{64}$/);
});

test("uint128 liquidity survives the parse exactly — a rounded liquidity is a fabricated number", () => {
  // 6242907904062804350752 is not representable as an IEEE double: JSON.parse alone loses it.
  const naive = JSON.parse(readFileSync(POOLS_PATH, "utf8")) as [string, unknown, number, boolean][];
  assert.notEqual(String(naive[0]![2]), "6242907904062804350752");
  const safe = parseJsonBigSafe(readFileSync(POOLS_PATH, "utf8")) as [string, unknown, string, boolean][];
  assert.equal(safe[0]![2], "6242907904062804350752");
  // and the loaded store keeps it as an exact decimal string
  const p = store.dataset.pools[0]!;
  assert.equal(typeof p.liquidity, "string");
  assert.equal(BigInt(p.liquidity).toString(), p.liquidity);
  assert.equal(
    store.dataset.pools.every((q) => /^[0-9]+$/.test(q.liquidity)),
    true,
  );
});

test("every label normalises into the four canonical labels, and nothing else does", () => {
  for (const m of store.dataset.measurements) assert.ok((LABELS as readonly string[]).includes(m.label));
  assert.equal(normalizeLabel("MESURE"), "MEASURED");
  assert.equal(normalizeLabel("NON_COTABLE"), "NOT_QUOTABLE");
  assert.throws(() => normalizeLabel("PROBABLY_FINE"), /refusing to guess/);
});

test("a row without a number never carries one, and a MEASURED row always does", () => {
  for (const m of store.dataset.measurements) {
    if (m.label === "MEASURED") {
      assert.equal(typeof m.bps, "number", `${m.pool_id} MEASURED without bps`);
      assert.ok(m.out_with !== null && m.out_without !== null);
    } else {
      assert.equal(m.bps, null, `${m.pool_id} ${m.label} carries a bps`);
    }
  }
});

test("the fourth column of pools-liquides.json is fee & 0x800000, on all 199 rows", () => {
  // loadPools throws on the first disagreement; this asserts the split it implies.
  const dyn = store.dataset.pools.filter((p) => p.fee_is_dynamic).length;
  assert.equal(dyn, 167);
  assert.equal(store.dataset.pools.length - dyn, 32);
});
