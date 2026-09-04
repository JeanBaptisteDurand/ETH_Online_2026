import { strict as assert } from "node:assert";
import { test } from "node:test";
import { interpolate } from "../src/interpolate.js";

const points = [
  { amountIn: "1000000000000000", bps: 99.93 },
  { amountIn: "100000000000000000", bps: 93.1 },
];

test("interpolation sits between the two measured points, and cites both", () => {
  const r = interpolate(points, "10000000000000000");
  assert.ok("bps" in r);
  assert.ok(r.bps < 99.93 && r.bps > 93.1, `got ${r.bps}`);
  assert.equal(r.lower.amountIn, "1000000000000000");
  assert.equal(r.upper.amountIn, "100000000000000000");
  // midpoint in log10 of a 100x bracket: exactly halfway between the two measured values
  assert.equal(r.bps, Math.round(((99.93 + 93.1) / 2) * 1e4) / 1e4);
});

test("it refuses to extrapolate — outside the bracket there is nothing to interpolate between", () => {
  const below = interpolate(points, "1000");
  assert.ok("reason" in below);
  assert.match(below.reason, /no_extrapolation/);
  const above = interpolate(points, "1000000000000000000000");
  assert.ok("reason" in above);
  assert.match(above.reason, /no_extrapolation/);
});

test("a single measured point cannot be interpolated from", () => {
  const r = interpolate([points[0]!], "2000000000000000");
  assert.ok("reason" in r);
  assert.match(r.reason, /fewer_than_two_measured_points/);
});

test("an endpoint returns the measured value untouched", () => {
  const r = interpolate(points, "100000000000000000");
  assert.ok("bps" in r);
  assert.equal(r.bps, 93.1);
});
