import { strict as assert } from "node:assert";
import { test } from "node:test";
import { maskHex, permissions, touchesSwap } from "../src/hookflags.js";
import { HOOK_EXTRACTOR, HOOK_INIT_ONLY, HOOK_UNREGISTERED, store } from "./helpers.js";

test("permission decoding is cross-checked against the measurements themselves", () => {
  // A hook whose address grants neither beforeSwap nor afterSwap cannot execute during a swap,
  // so replacing it with the inert stub must change nothing: exactly 0.00 bps. If the bit
  // positions below were wrong, this invariant would break somewhere in the 128 rows.
  for (const hook of new Set(store.dataset.measurements.map((m) => m.hook))) {
    if (touchesSwap(hook)) continue;
    const measured = store
      .measurementsForHook(hook)
      .filter((m) => m.label === "MEASURED")
      .map((m) => m.bps);
    assert.ok(measured.length > 0, `${hook} has no MEASURED row to check against`);
    for (const bps of measured) {
      assert.equal(bps, 0, `${hook} cannot run during a swap yet measured ${bps} bps`);
    }
  }
});

test("the two extracting hooks declare beforeSwap and beforeSwapReturnsDelta", () => {
  for (const hook of [HOOK_EXTRACTOR, HOOK_UNREGISTERED]) {
    const p = permissions(hook);
    assert.ok(p.includes("beforeSwap"), `${hook} lacks beforeSwap`);
    assert.ok(p.includes("beforeSwapReturnsDelta"), `${hook} lacks beforeSwapReturnsDelta`);
    assert.equal(touchesSwap(hook), true);
  }
  assert.equal(maskHex(HOOK_EXTRACTOR), "0x2acc");
});

test("an initialize-only hook declares nothing about swaps", () => {
  assert.deepEqual(permissions(HOOK_INIT_ONLY), ["beforeInitialize"]);
  assert.equal(touchesSwap(HOOK_INIT_ONLY), false);
  assert.equal(maskHex(HOOK_INIT_ONLY), "0x2000");
});

test("a malformed address is refused, not masked", () => {
  assert.throws(() => permissions("0x1234"), /not a 20-byte address/);
});
