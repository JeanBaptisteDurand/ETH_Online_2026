/**
 * The product rules, asserted rather than promised.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measureTool } from "../src/tools/measure.js";
import { lookupTool } from "../src/tools/lookup.js";
import { impactTool } from "../src/tools/impact.js";
import { twinsTool, extraUniverse } from "../src/tools/twins.js";
import { labelCarriesNumber, LABELS, type Label } from "../src/labels.js";
import { BLOCK, HOOK_EXTRACTOR, POOL_EXTRACTOR, offlineCfg, payloadOf, store, textOf } from "./helpers.js";

/** Walk a payload and collect every {label, bps} pair it contains, at any depth. */
function labelledValues(node: unknown, out: { label: Label; bps: unknown }[] = []): { label: Label; bps: unknown }[] {
  if (Array.isArray(node)) {
    for (const c of node) labelledValues(c, out);
  } else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o["label"] === "string" && (LABELS as readonly string[]).includes(o["label"]) && "bps" in o) {
      out.push({ label: o["label"] as Label, bps: o["bps"] });
    }
    for (const c of Object.values(o)) labelledValues(c, out);
  }
  return out;
}

test("across every tool, a label that carries no number never carries one", async () => {
  const cfg = offlineCfg();
  const answers = [
    await measureTool({ hook: HOOK_EXTRACTOR, pool: POOL_EXTRACTOR, size: "1000000000000000", direction: "1to0", block: BLOCK }, cfg, store),
    await measureTool({ hook: HOOK_EXTRACTOR, pool: POOL_EXTRACTOR, size: "1000000000000000", direction: "0to1", block: BLOCK }, cfg, store),
    await measureTool({ hook: HOOK_EXTRACTOR, pool: POOL_EXTRACTOR, size: "10000000000000000", direction: "0to1", block: BLOCK }, cfg, store),
    lookupTool({ hook: HOOK_EXTRACTOR }, cfg, store),
    impactTool({ hook: HOOK_EXTRACTOR }, cfg, store),
    await twinsTool({ hook: HOOK_EXTRACTOR }, cfg, store),
  ];
  let seen = 0;
  for (const a of answers) {
    for (const { label, bps } of labelledValues(payloadOf(a))) {
      seen++;
      if (labelCarriesNumber(label)) assert.equal(typeof bps, "number", `${label} without a number`);
      else assert.equal(bps, null, `${label} carries ${bps}`);
    }
  }
  assert.ok(seen > 50, `only ${seen} labelled values inspected`);
});

test("every answer states its block, its size, its direction and a replay command", async () => {
  const res = await measureTool(
    { hook: HOOK_EXTRACTOR, pool: POOL_EXTRACTOR, size: "1000000000000000", direction: "0to1", block: BLOCK },
    offlineCfg(),
    store,
  );
  const text = textOf(res);
  for (const needle of ["block      50614000", "size       1000000000000000", "direction  currency0 -> currency1", "replay:"]) {
    assert.ok(text.includes(needle), `answer is missing ${JSON.stringify(needle)}`);
  }
});

test("every answer carries the fingerprint of the evidence it was built from", async () => {
  const cfg = offlineCfg();
  for (const a of [
    await measureTool({ hook: HOOK_EXTRACTOR, pool: POOL_EXTRACTOR, size: "1000000000000000", direction: "0to1", block: BLOCK }, cfg, store),
    lookupTool({ hook: HOOK_EXTRACTOR }, cfg, store),
    impactTool({ hook: HOOK_EXTRACTOR }, cfg, store),
    await twinsTool({ hook: HOOK_EXTRACTOR }, cfg, store),
  ]) {
    const prov = payloadOf(a)["provenance"] as Record<string, string>;
    assert.match(prov["measurements_sha256"] as string, /^0x[0-9a-f]{64}$/);
    // Le compte vient du corpus reellement lu, pas d'un litteral : un litteral redevient
    // faux au prochain balayage et le test rougit pour la mauvaise raison.
    assert.equal(prov["measurements_rows"] as unknown, store.dataset.provenance.measurements_rows);
    assert.ok((prov["measurements_rows"] as unknown as number) > 100000);
  }
});

test("the twin universe can be widened, and a broken universe file is reported, not ignored", () => {
  const dir = mkdtempSync(join(tmpdir(), "tare-universe-"));
  const good = join(dir, "good.json");
  writeFileSync(good, JSON.stringify(["0x" + "11".repeat(20), "not-an-address"]));
  process.env["TARE_HOOK_UNIVERSE"] = good;
  const u = extraUniverse();
  assert.deepEqual(u.addresses, ["0x" + "11".repeat(20)]);
  assert.equal(u.error, "1_entries_were_not_addresses");

  const bad = join(dir, "bad.json");
  writeFileSync(bad, "{ not json");
  process.env["TARE_HOOK_UNIVERSE"] = bad;
  assert.match(extraUniverse().error as string, /^unreadable:/);
  delete process.env["TARE_HOOK_UNIVERSE"];
});
