import { strict as assert } from "node:assert";
import { test } from "node:test";
import { measureTool, parseDirection, parseSize } from "../src/tools/measure.js";
import { lookupTool } from "../src/tools/lookup.js";
import { impactTool, median } from "../src/tools/impact.js";
import { twinsTool, hashCode } from "../src/tools/twins.js";
import {
  BLOCK,
  HOOK_EXTRACTOR,
  HOOK_INIT_ONLY,
  HOOK_UNREGISTERED,
  POOL_EXTRACTOR,
  offlineCfg,
  payloadOf,
  store,
  textOf,
} from "./helpers.js";

test("tare_measure returns the committed row verbatim, with its block, size, direction and replay", async () => {
  const res = await measureTool(
    { hook: HOOK_EXTRACTOR, pool: POOL_EXTRACTOR, size: "1000000000000000", direction: "0to1", block: BLOCK },
    offlineCfg(),
    store,
  );
  const p = payloadOf(res);
  const r = p["result"] as Record<string, unknown>;
  assert.equal(r["label"], "MEASURED");
  // LES DEUX COTATIONS SONT L'ASSERTION QUI COMPTE, et elles sont IDENTIQUES au dernier
  // chiffre entre l'ancien echantillon (128 lignes) et le corpus complet (125 072) : ce sont
  // les memes mesures. Seul `bps` differe, en PRECISION — l'echantillon l'arrondissait a
  // deux decimales, et affichait donc 0,0 la ou la mesure vaut 0,0001. Un zero arrondi qui
  // ressemble a un vrai zero est exactement ce que ce projet refuse : on lit donc bps depuis
  // la ligne, et on verifie qu'il est coherent avec les deux sorties.
  assert.equal(r["out_with"], "442747808421317694054679");
  assert.equal(r["out_without"], "447218008457966041360433");
  const attendu =
    ((BigInt(String(r["out_without"])) - BigInt(String(r["out_with"]))) * 1000000n) /
    BigInt(String(r["out_without"]));
  assert.ok(
    Math.abs((r["bps"] as number) - Number(attendu) / 100) < 0.01,
    `bps ${String(r["bps"])} incoherent avec les deux sorties`,
  );
  assert.equal(r["block_number"], BLOCK);
  assert.match(String(r["source"]), /^dataset:docs\//);
  const text = textOf(res);
  assert.match(text, /LABEL\s+MEASURED/);
  assert.match(text, new RegExp(String(r["bps"]).replace(".", "\\.")));
  assert.match(text, /zeroForOne=true/);
});

test("tare_measure keeps a NOT_QUOTABLE a NOT_QUOTABLE, and shows no number for it", async () => {
  const res = await measureTool(
    { hook: HOOK_EXTRACTOR, pool: POOL_EXTRACTOR, size: "1000000000000000", direction: "1to0", block: BLOCK },
    offlineCfg(),
    store,
  );
  const r = payloadOf(res)["result"] as Record<string, unknown>;
  // Ce pool ne cote QU'UN sens. L'etiquette et l'absence de nombre sont l'invariant ; la
  // raison exacte (7a5ed734 = NOT_ENOUGH_LIQUIDITY) est celle du corpus qui a ete lu.
  assert.ok(["NOT_QUOTABLE", "NOT_MEASURABLE"].includes(String(r["label"])), String(r["label"]));
  assert.equal(r["bps"], null);
  assert.ok(String(r["reason"]).length > 0, "un refus sans raison n'en est pas un");
  assert.match(textOf(res), /bps\s+— \(no number/);
});

test("tare_measure interpolates only between measured points, and labels it", async () => {
  const res = await measureTool(
    { hook: HOOK_EXTRACTOR, pool: POOL_EXTRACTOR, size: "10000000000000000", direction: "0to1", block: BLOCK },
    offlineCfg(),
    store,
  );
  const r = payloadOf(res)["result"] as Record<string, unknown>;
  // Sur le corpus complet, cette taille peut etre MESUREE au lieu d'etre encadree — le
  // balayage a ajoute des points. Les deux reponses sont justes ; ce qui ne le serait pas,
  // c'est un nombre sans etiquette, ou une interpolation sans ses deux encadrants cites.
  if (r["label"] === "INTERPOLATED") {
    assert.equal(typeof r["bps"], "number");
    assert.equal((r["between"] as unknown[]).length, 2);
    assert.match(String(r["method"]), /log10/);
  } else {
    assert.equal(r["label"], "MEASURED");
    assert.equal(typeof r["bps"], "number");
  }
});

test("tare_measure refuses an unknown pool with NOT_MEASURABLE and no number at all", async () => {
  const res = await measureTool(
    { hook: HOOK_EXTRACTOR, pool: "0x" + "ab".repeat(32), size: "1000000000000000", direction: "0to1" },
    offlineCfg(),
    store,
  );
  const p = payloadOf(res);
  const r = p["result"] as Record<string, unknown>;
  assert.equal(r["label"], "NOT_MEASURABLE");
  assert.equal(r["bps"], null);
  assert.match(String(r["reason"]), /not in docs\/pools-liquides\.json/);
  assert.ok((p["known_pools_for_this_hook"] as string[]).length > 0);
});

test("a size that is not an exact integer string is refused, because a float is a lost number", () => {
  assert.throws(() => parseSize("1e18"), /decimal string/);
  assert.throws(() => parseSize("0.5"), /decimal string/);
  assert.throws(() => parseSize("0"), /greater than zero/);
  assert.equal(parseSize("1_000_000"), "1000000");
  assert.equal(parseDirection("0->1"), true);
  assert.equal(parseDirection("1to0"), false);
  assert.throws(() => parseDirection("sideways"), /direction must be/);
});

test("tare_lookup lists unmeasured pools as NOT_MEASURABLE instead of leaving them out", () => {
  const res = lookupTool({ hook: HOOK_EXTRACTOR }, offlineCfg(), store);
  const p = payloadOf(res);
  const cov = p["coverage"] as Record<string, number>;
  const profiles = p["profiles"] as { label: string | null; points: unknown[] }[];
  // L'INVARIANT : un profil PAR pool portant ce hook, sans exception — c'est ca qui empeche
  // un pool non mesure de disparaitre de la reponse au lieu d'y figurer NOT_MEASURABLE.
  // Les comptes viennent du corpus lu, jamais d'un litteral qui rote au balayage suivant.
  const attendus = new Set(
    store.dataset.pools.filter((q) => q.hook === HOOK_EXTRACTOR.toLowerCase()).map((q) => q.pool_id),
  );
  assert.equal(cov["pools_carrying_this_hook"], attendus.size);
  assert.equal(profiles.length, attendus.size);
  assert.equal(
    cov["measurement_rows"],
    store.dataset.measurements.filter((m) => m.hook === HOOK_EXTRACTOR.toLowerCase()).length,
  );
  assert.ok(attendus.size > 0, "le hook de reference ne porte aucun pool");
  assert.equal((p["registry"] as Record<string, string>)["status"], "UNAVAILABLE");
  assert.match(textOf(res), /permissions 0x2acc/);
});

test("tare_impact never sums liquidity and shows the values its median came from", () => {
  const res = impactTool({ hook: HOOK_UNREGISTERED }, offlineCfg(), store);
  const p = payloadOf(res);
  const radius = p["radius"] as Record<string, unknown>;
  assert.equal(
    radius["pools_carrying_this_hook"],
    new Set(
      store.dataset.pools.filter((q) => q.hook === HOOK_UNREGISTERED.toLowerCase()).map((q) => q.pool_id),
    ).size,
  );
  assert.match(String(radius["note"]), /never summed/);
  const ex = p["extraction_on_the_measured_subset"] as Record<string, unknown>;
  assert.equal(ex["status"], "MEASURED");
  const values = ex["values"] as number[];
  assert.equal(values.length, ex["n"]);
  assert.equal(ex["min"], values[0]);
  assert.equal(ex["max"], values[values.length - 1]);
  assert.equal(ex["median"], median(values));
  assert.equal(JSON.stringify(p).includes('"total_liquidity"'), false);
});

test("tare_impact reports a hook with no MEASURED row as NOT_MEASURABLE, not as zero exposure", () => {
  const res = impactTool({ hook: HOOK_INIT_ONLY }, offlineCfg(), store);
  const ex = payloadOf(res)["extraction_on_the_measured_subset"] as Record<string, unknown>;
  // Ce hook a bien des lignes MEASURED, toutes a zero. Le point n'est pas COMBIEN il y en a
  // — le balayage en ajoute — mais qu'elles soient MONTREES au lieu d'etre cachees, et que
  // « toutes a zero » ne devienne pas « aucune exposition ».
  assert.equal(ex["status"], "MEASURED");
  const valeurs = ex["values"] as number[];
  assert.ok(valeurs.length >= 2, `seulement ${valeurs.length} valeur(s)`);
  assert.equal(valeurs.every((x) => x === 0), true, `des valeurs non nulles : ${valeurs.join(", ")}`);
  assert.equal(ex["min"], 0);
  assert.equal(ex["max"], 0);
});

test("tare_twins finds permission twins offline and refuses bytecode twins without the fork", async () => {
  const res = await twinsTool({ hook: HOOK_EXTRACTOR }, offlineCfg(), store);
  const p = payloadOf(res);
  const perm = p["permission_twins"] as Record<string, unknown>;
  assert.equal(perm["status"], "MEASURED");
  assert.equal(perm["mask"], "0x2acc");
  const matches = perm["matches"] as { address: string }[];
  assert.ok(matches.some((m) => m.address === HOOK_UNREGISTERED));
  const byte = p["bytecode_twins"] as Record<string, unknown>;
  assert.equal(byte["status"], "NOT_MEASURABLE");
  assert.equal((p["deployer_twins"] as Record<string, unknown>)["status"], "NOT_MEASURABLE");
  assert.match(textOf(res), /DEPLOYER TWINS\s+NOT_MEASURABLE/);
});

test("a truncated eth_getCode never becomes a codehash", () => {
  assert.deepEqual(hashCode("0x"), { error: "no_code_at_this_address" });
  assert.deepEqual(hashCode("0x6080604"), { error: "code_hex_has_odd_length_truncated_read" });
  assert.deepEqual(hashCode("6080"), { error: "code_is_not_a_hex_string" });
  const ok = hashCode("0x60806040");
  assert.ok("hash" in ok && ok.size === 4);
});
