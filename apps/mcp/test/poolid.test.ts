import { strict as assert } from "node:assert";
import { test } from "node:test";
import { poolId } from "../src/poolid.js";
import { store } from "./helpers.js";

test("the TypeScript poolId agrees with the Python engine on every measured pool", () => {
  // The engine wrote these ids into docs/measurements-v1.json from PoolKeys that live in
  // docs/pools-liquides.json. If the two derivations ever diverge, the join silently empties.
  const measured = new Set(store.dataset.measurements.map((m) => m.pool_id));
  assert.equal(measured.size, 32);
  const derived = new Set(store.dataset.pools.map((p) => p.pool_id));
  for (const id of measured) assert.ok(derived.has(id), `poolId ${id} not reproduced from any PoolKey`);
});

test("poolId is keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))", () => {
  const p = store.dataset.pools.find(
    (q) => q.pool_id === "0x84a874d2ca24f829f7067365bbc8a1811772b6f8ed5634558737c9c93225497e",
  );
  assert.ok(p, "the reference pool is in the liquidity file");
  assert.equal(
    poolId({
      currency0: p.currency0,
      currency1: p.currency1,
      fee: p.fee,
      tick_spacing: p.tick_spacing,
      hook: p.hook,
    }),
    "0x84a874d2ca24f829f7067365bbc8a1811772b6f8ed5634558737c9c93225497e",
  );
});
