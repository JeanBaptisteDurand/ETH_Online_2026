import { strict as assert } from "node:assert";
import { test } from "node:test";
import { poolId } from "../src/poolid.js";
import { store } from "./helpers.js";

test("the TypeScript poolId agrees with the Python engine on every measured pool", () => {
  // Le moteur a ecrit ces identifiants depuis des PoolKey qui vivent dans le recensement. Si
  // les deux derivations divergent, la jointure se vide EN SILENCE — c'est ca qu'on teste,
  // pas le nombre de pools, qui change a chaque balayage.
  const measured = new Set(store.dataset.measurements.map((m) => m.pool_id));
  assert.ok(measured.size > 1000, `seulement ${measured.size} pools mesures`);
  const derived = new Set(store.dataset.pools.map((p) => p.pool_id));
  const orphelins = [...measured].filter((id) => !derived.has(id));
  assert.equal(
    orphelins.length,
    0,
    `${orphelins.length} poolId mesures introuvables dans le recensement, dont ${orphelins.slice(0, 3).join(", ")}`,
  );
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
