/**
 * Les trois regles d'honnetete du generateur de faits de la page.
 *
 * apps/landing n'avait aucun test. Une passe adverse y a trouve trois defauts qu'un test
 * aurait attrapes le jour meme, et les trois avaient la meme forme : une valeur d'AFFICHAGE
 * utilisee pour decider d'une AFFIRMATION.
 *
 *   node --test apps/landing/test/facts.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const facts = readFileSync(resolve(here, "../build/facts.mjs"), "utf8");
const html = readFileSync(resolve(here, "../build/html.mjs"), "utf8");

test("« 0.00 bps » ne se decide jamais sur la mediane arrondie", () => {
  // Une porte a 0,004 bps s'affiche 0.00 apres arrondi. Compter les portes « qui ne
  // prennent rien » sur cette chaine publiait une porte preleveuse comme inoffensive.
  const m = html.match(/const nZero = \(x\) =>\s*x\.gates\.filter\(\(g\) => ([^)]+)\)/);
  assert.ok(m, "nZero introuvable");
  assert.match(m[1], /median_raw/, "nZero doit lire la mediane BRUTE");
  assert.doesNotMatch(m[1], /Number\(g\.median\)/, "nZero ne doit pas lire la valeur arrondie");
});

test("un stored_lp_fee absent compte comme une valeur distincte, pas comme rien", () => {
  // L'ignorer faisait passer une porte dont UNE ligne avait ete lue pour une porte dont
  // toutes les lignes s'accordent — et le commentaire d'a cote promettait l'inverse.
  assert.match(facts, /g\.lp\.add\(m\.stored_lp_fee \?\? null\)/);
  assert.doesNotMatch(facts, /if \(m\.stored_lp_fee !== null && m\.stored_lp_fee !== undefined\) g\.lp\.add/);
});

test("une paire dont les portes partagent un hook est marquee comme telle", () => {
  // Deux pools d'un meme hook restent deux portes, mais le choix ne se fait pas entre deux
  // hooks. Cette section parle de hooks : le taire ferait lire le contraire.
  assert.match(facts, /one_hook_several_pools/);
  assert.match(html, /one_hook_several_pools/, "le marquage doit remonter jusqu'a la page");
});

test("la page ne fige aucun poids : la doc renvoie a la commande", () => {
  for (const f of ["../README.md", "../DESIGN.md"]) {
    const doc = readFileSync(resolve(here, f), "utf8");
    assert.match(doc, /relancez `npm run budget`/,
      `${f} doit dire que les poids se remesurent`);
  }
});
