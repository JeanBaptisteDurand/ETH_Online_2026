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

/* ------------------------------------------------------------------------- */
/* SECTION 01. Elle publiait « 0 des 84 hooks n'emet HookSwap ni HookFee ».  */
/* Les trois nombres etaient faux ET ecrits en dur, sous un commentaire qui  */
/* disait que l'enumeration derriere eux « n'est pas encore commitee ».      */
/* ------------------------------------------------------------------------- */

test("les chiffres de la section 01 sont LUS d'un artefact, jamais ecrits", () => {
  // Les quatre litteraux du bloc UPSTREAM d'avant. Le 84 venait du premier corpus, quand un
  // RPC public ne servait pas plus large ; le vrai balayage porte 1 559 hooks sur 200 000
  // blocs, et NEUF declarent.
  for (const mort of ["hooks_swept: 84", "block_window: 24000", "registry_entries: 613"]) {
    assert.equal(facts.includes(mort), false, `« ${mort} » est encore ecrit en dur`);
  }
  assert.match(facts, /declarations\.json/, "le releve du scan n'est pas lu");
  assert.match(facts, /hooklist-live-20260905\.json/, "le registre n'est pas lu depuis un fichier");
});

test("sans releve de scan, la section ne fabrique aucun chiffre", () => {
  // Un chiffre perime qui a l'air frais est pire qu'un chiffre absent.
  assert.match(facts, /published: false/);
  assert.match(facts, /tare\.declare --scan --write/);
  // et le HTML a une branche pour ce cas, au lieu de rendre `undefined / undefined`
  assert.match(html, /!u\.published/);
});

test("une couverture incomplete n'est pas publiee comme un zero", () => {
  // Un bloc non lu n'est pas un bloc sans evenement : c'est la distinction
  // NON_MESURABLE / 0,00 bps, appliquee a un scan de logs.
  assert.match(facts, /c\.publiable/);
  assert.match(facts, /did not cover its whole window/);
});

test("le registre est compte depuis le fichier, et le fichier est NOMME a l'ecran", () => {
  // Deux totaux publies cote a cote (978 dans le README, 613 ici) sans dire de quel
  // instantane chacun vient est comment un lecteur conclut que l'un des deux est faux.
  assert.match(facts, /registry_file: reg\.file/);
  assert.match(html, /u\.registry_file/);
  // LES TROIS COMPTES sont derives, pas memorises : 27 champs, 19 booleens, 0 quantite.
  // La page annoncait « 19 describing fields » et le dossier « 27 champs, 19 booleens » —
  // deux enonces vrais que rien ne reconciliait, donc un lecteur qui compare conclut que
  // l'un des deux se trompe.
  assert.match(facts, /cles\.identite\.size \+ cles\.flags\.size \+ cles\.props\.size/);
  assert.match(facts, /typeof v === "boolean"/);
  assert.match(facts, /k !== "chainId"/);
  assert.match(html, /u\.registry_booleans/);
});

test("la grille rend UNE case par hook, et les neuf positions viennent de la liste complete", () => {
  // Les index sont calcules dans facts.mjs, ou les 1 559 adresses sont disponibles. Les
  // estimer a l'ecran donnerait une image fausse que rien ne contredirait.
  assert.match(facts, /declaring_indexes/);
  assert.match(facts, /\.indexOf\(h\)/);
  assert.match(html, /u\.declaring_indexes/);
  // et la queue de la derniere ligne est masquee : 1 559 n'est pas un multiple de 48, donc
  // le motif peindrait 1 584 cases sans ce rectangle.
  assert.match(html, /class="mask"/);
  assert.match(html, /reste \* PAS/);
});

test("le releve commite tient ce que la section affirme", () => {
  // Le test le plus direct : la page dit « N sur M declarent ». Les deux nombres doivent
  // sortir du meme fichier, et les index doivent etre aussi nombreux que les declarants.
  const p = resolve(here, "../src/generated/facts.json");
  let f;
  try {
    f = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return; // facts.json non genere : `npm run build` le produit
  }
  const u = f.upstream;
  if (!u?.published) {
    assert.ok(u.why, "un upstream non publie doit dire pourquoi");
    return;
  }
  assert.equal(u.declaring_indexes.length, u.hooks_declaring);
  assert.ok(u.hooks_declaring < u.hooks_swept, "tous les hooks ne peuvent pas declarer");
  assert.ok(u.hooks_declaring <= u.emitting_any_contract, "un hook qui declare est un emetteur");
  // chaque index tombe dans la grille
  for (const i of u.declaring_indexes) {
    assert.ok(i >= 0 && i < u.hooks_swept, `index ${i} hors de la grille`);
  }
  // la couverture est complete, sinon rien n'aurait du etre publie
  assert.equal(u.coverage, 1);
  assert.equal(u.registry_numeric_fields, 0);
});

test("le recensement affiche est le COMPLET, et son fichier est nomme", () => {
  // Section 06 titrait « 199 LIQUID POOLS · 12 DISTINCT HOOKS » depuis un echantillon, alors
  // que la table par hook de la MEME page en montrait 112. La page se contredisait.
  assert.equal(facts.includes('readJson(p("docs/pools-liquides.json"))'), false,
    "le petit recensement est encore lu directement");
  assert.match(facts, /CENSUS_FULL/);
  assert.match(facts, /file: CENSUS_FILE/);
  assert.match(html, /f\.census\.file/);

  const p2 = resolve(here, "../src/generated/facts.json");
  let f;
  try {
    f = JSON.parse(readFileSync(p2, "utf8"));
  } catch {
    return;
  }
  // Le nombre de hooks du recensement ne peut pas etre INFERIEUR au nombre de hooks montres
  // dans la table : ce serait exactement la contradiction qu'on vient de retirer.
  assert.ok(
    f.census.hooks >= f.per_hook.length,
    `le recensement annonce ${f.census.hooks} hooks et la table en montre ${f.per_hook.length}`,
  );
  assert.ok(f.census.pools > f.census.hooks, "il y a plus de pools que de hooks");
  assert.match(f.census.file, /pools-liquides/);
});

test("la couverture du registre est COMPTEE, plus une adresse ecrite a la main", () => {
  // La page portait « one hook is not in the official registry at all », depuis une seule
  // adresse en dur. Le compte reel est 78 sur 112 — soixante-dix pour cent — et c'est un
  // fait bien plus fort : le registre officiel ne decrit pas les deux tiers des hooks qu'on
  // a mesures. Le dossier avait ce chiffre juste ; cette page ne l'avait pas.
  assert.equal(facts.includes('absent_from_registry: ["0x'), false,
    "une adresse est encore ecrite en dur");
  assert.match(facts, /registryCoverage\(\)/);
  assert.match(facts, /absent_addresses/);
  assert.match(html, /registry_coverage\.absent/);

  const p2 = resolve(here, "../src/generated/facts.json");
  let f;
  try {
    f = JSON.parse(readFileSync(p2, "utf8"));
  } catch {
    return;
  }
  const c = f.registry_coverage;
  if (!c) return;
  // Les trois nombres doivent se refermer : listes + absents = mesures, sans exception.
  assert.equal(c.listed + c.absent, c.measured);
  assert.equal(c.absent_addresses.length, c.absent);
  // et le compte des hooks mesures est celui de la table par hook de la meme page
  assert.equal(c.measured, f.per_hook.length,
    "le compte de couverture et la table par hook doivent porter le meme nombre de hooks");
  // aucune adresse listee ne peut figurer parmi les absentes
  assert.equal(new Set(c.absent_addresses).size, c.absent, "doublons dans les absentes");
});

/* ------------------------------------------------------------------------- */
/* LE TITRE. Les chiffres de la section 01 avaient ete corriges ; la PHRASE   */
/* du hero, elle, etait restee litterale. La page annoncait « Zero declare »  */
/* et « not one emits either » trois cents pixels au-dessus d'une grille qui  */
/* montrait NEUF cases allumees et d'un titre qui disait « 9 OF 1 559 ».      */
/* C'est la ligne la plus visible du projet, et elle etait fausse.            */
/* ------------------------------------------------------------------------- */

test("le hero ne peut plus contredire le nombre de hooks qui declarent", () => {
  for (const mort of ["Zero<br>declare", "not one emits either"]) {
    assert.equal(
      html.includes(mort),
      false,
      `« ${mort} » est ecrit en dur dans le hero, alors que le scan compte des declarants`,
    );
  }
  // Le titre ET le chapo doivent LIRE le compte, pas le raconter.
  const hero = html.slice(html.indexOf('<h1 class="hero">'), html.indexOf("</p>", html.indexOf('class="lead"')));
  assert.match(hero, /hooks_declaring/, "le hero n'affiche aucun compte lu : il raconte");
  assert.equal(
    (hero.match(/hooks_declaring/g) ?? []).length >= 2,
    true,
    "le titre et le chapo doivent tous les deux lire le compte, pas seulement l'un des deux",
  );
});
