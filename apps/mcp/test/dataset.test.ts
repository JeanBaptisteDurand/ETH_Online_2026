import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseJsonBigSafe } from "../src/dataset.js";
import { LABELS, normalizeLabel } from "../src/labels.js";
import { MEASUREMENTS_JSONL, POOLS_FULL_PATH, POOLS_PATH } from "../src/paths.js";
import { store } from "./helpers.js";

/**
 * Le corpus COMPLET, et le compte verifie contre le fichier lui-meme.
 *
 * Le serveur lisait docs/measurements-v1.json — 128 mesures — en s'annoncant « TARE », soit
 * 0,1 % du corpus. Ce test n'ecrit plus un nombre en dur : il compte les lignes non vides du
 * fichier que la provenance DIT avoir lu, et compare. Un nombre en dur redeviendrait faux au
 * prochain balayage, et le test rougirait pour la mauvaise raison.
 */
test("le corpus se charge en entier, et le compte correspond au fichier lu", () => {
  const p = store.dataset.provenance;
  const attendues = readFileSync(p.measurements_file, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0).length;
  assert.equal(p.measurements_rows + p.measurements_rejected_lines, attendues);
  assert.match(p.measurements_sha256, /^0x[0-9a-f]{64}$/);
  // et c'est bien le corpus complet qui est lu quand il existe
  assert.equal(p.measurements_file, MEASUREMENTS_JSONL);
  assert.equal(p.pools_file, POOLS_FULL_PATH);
  assert.ok(p.measurements_rows > 100000, `seulement ${p.measurements_rows} mesures lues`);
  assert.ok(p.pools_rows > 7000, `seulement ${p.pools_rows} pools lus`);
});

test("uint128 liquidity survives the parse exactly — a rounded liquidity is a fabricated number", () => {
  // 6242907904062804350752 is not representable as an IEEE double: JSON.parse alone loses it.
  // LES DEUX RECENSEMENTS N'ECRIVENT PAS PAREIL, et c'est le point de ce test.
  // docs/pools-liquides.json ecrit la liquidite en NOMBRE JSON nu : 6242907904062804350752
  // ne survit pas a un IEEE double, et une liquidite arrondie est un nombre fabrique.
  // docs/dataset/pools-liquides-full.json, lui, la cite deja en chaine. Le chargeur doit
  // rendre une chaine exacte dans les DEUX cas — sinon un changement de recensement
  // reintroduirait l'arrondi sans que rien ne le dise.
  const nu = readFileSync(POOLS_PATH, "utf8");
  const naif = JSON.parse(nu) as [string, unknown, number, boolean][];
  assert.notEqual(String(naif[0]![2]), "6242907904062804350752"); // le double a perdu
  const sauve = parseJsonBigSafe(nu) as [string, unknown, string, boolean][];
  assert.equal(sauve[0]![2], "6242907904062804350752"); // la reecriture l'a garde

  const cite = parseJsonBigSafe(readFileSync(POOLS_FULL_PATH, "utf8")) as [string, unknown, string, boolean][];
  assert.equal(typeof cite[0]![2], "string");
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

test("la quatrieme colonne du recensement est fee & 0x800000, sur TOUTES les lignes", () => {
  // loadPools leve a la premiere divergence : arriver ici prouve l'invariant sur les 7 817
  // lignes. On publie la repartition plutot que de l'ecrire en dur — elle change a chaque
  // recensement, l'invariant non.
  const dyn = store.dataset.pools.filter((p) => p.fee_is_dynamic).length;
  const stat = store.dataset.pools.length - dyn;
  assert.ok(dyn > 0 && stat > 0, `repartition degeneree : ${dyn} dynamiques / ${stat} statiques`);
  assert.equal(dyn + stat, store.dataset.pools.length);
  for (const p of store.dataset.pools)
    assert.equal(p.fee_is_dynamic, (p.fee & 0x800000) !== 0, `${p.pool_id} : colonne incoherente`);
});
