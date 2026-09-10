/**
 * LES CHIFFRES DE LA PORTE DE REMPLACEMENT, produits par un script et non par une prose.
 *
 * Le module alternative.ts cite des nombres dans son en-tete, et le site les affiche. Ils
 * n'etaient produits par rien : quelqu'un les avait comptes une fois, a la main, et la
 * correction du sens de comparaison les a rendus faux. Ce script les recalcule a partir de
 * packages/guard/data/table.json, en rejouant EXACTEMENT la logique de chercherAlternative().
 *
 *   node scripts/chiffres-alternative.mjs            affiche le releve
 *   node scripts/chiffres-alternative.mjs --write    l'ecrit dans data/chiffres-alternative.json
 *
 * L'UNITE DE COMPTE est le triplet (pool, sens, taille) MESURE : c'est une question qu'un
 * utilisateur peut reellement poser, et pour laquelle le module rend un etat. Compter par
 * jeton, comme avant, melangeait des questions qui n'ont pas le meme nombre de reponses.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const SEUIL = 1; // ECONOMIE_MIN_BPS

const table = JSON.parse(readFileSync(resolve(ICI, "..", "data", "table.json"), "utf8"));

const bas = (s) => String(s).toLowerCase();

/** Les deux monnaies d'un swap, dans ce sens. Meme fonction que cotes() du module. */
function cotes(p, dir) {
  const c0 = bas(p.currency0);
  const c1 = bas(p.currency1);
  return dir === "0->1" ? { entree: c0, sortie: c1 } : { entree: c1, sortie: c0 };
}

/** Index : (entree,sortie) -> les pools qui savent faire cet echange, avec leur sens. */
const parEchange = new Map();
for (const [pid, p] of Object.entries(table.pools)) {
  for (const dir of ["0->1", "1->0"]) {
    const { entree, sortie } = cotes(p, dir);
    const k = `${entree}|${sortie}`;
    if (!parEchange.has(k)) parEchange.set(k, []);
    parEchange.get(k).push([pid, p, dir]);
  }
}

const mesure = (p, dir, taille) => {
  const pt = (p.dirs[dir] ?? []).find((x) => x.amount_in === taille);
  return pt && pt.label === "MEASURED" && pt.bps !== null ? pt.bps : null;
};

const etats = {};
const economies = [];
/** Les propositions au-dessus du seuil, pour qu'on puisse les lire une par une. */
const propositions = [];
let mesuresLues = 0;

for (const [pid, p] of Object.entries(table.pools)) {
  for (const dir of ["0->1", "1->0"]) {
    for (const pt of p.dirs[dir] ?? []) {
      mesuresLues += 1;
      const taille = pt.amount_in;
      const { entree, sortie } = cotes(p, dir);
      const soeurs = (parEchange.get(`${entree}|${sortie}`) ?? []).filter(([q]) => q !== pid);

      let etat;
      if (soeurs.length === 0) etat = "PORTE_UNIQUE";
      else if (pt.label !== "MEASURED" || pt.bps === null) etat = "ACTUELLE_NON_MESUREE";
      else {
        const chiffrees = soeurs
          .map(([qid, q, qdir]) => [qid, mesure(q, qdir, taille)])
          .filter(([, b]) => b !== null);
        if (chiffrees.length === 0) etat = "AUTRES_NON_MESUREES";
        else {
          const [mid, mieux] = chiffrees.reduce((a, b) => (b[1] < a[1] ? b : a));
          const ecart = pt.bps - mieux;
          if (ecart < SEUIL) etat = "DEJA_LA_MEILLEURE";
          else {
            etat = "MEILLEURE_PORTE";
            economies.push(ecart);
            propositions.push({
              de: pid, vers: mid, sens: dir, taille,
              bps_actuel: pt.bps, bps_propose: mieux, economie_bps: Number(ecart.toFixed(4)),
              entree, sortie,
            });
          }
        }
      }
      etats[etat] = (etats[etat] ?? 0) + 1;
    }
  }
}

const tri = [...economies].sort((a, b) => a - b);
const med = tri.length ? (tri.length % 2 ? tri[(tri.length - 1) / 2] : (tri[tri.length / 2 - 1] + tri[tri.length / 2]) / 2) : null;

/** Combien de PAIRES (entree,sortie) ont plus d'une porte, et combien n'en ont qu'une. */
let pairesUniques = 0;
let pairesMultiples = 0;
for (const [, l] of parEchange) (new Set(l.map(([q]) => q)).size > 1 ? pairesMultiples++ : pairesUniques++);

const releve = {
  schema: "tare-chiffres-alternative/1",
  source: "packages/guard/data/table.json",
  block_number: table.block_number,
  chain_id: table.chain_id,
  n_measurements_table: table.n_measurements,
  seuil_bps: SEUIL,
  note:
    "chaque ligne de la table (pool, sens, taille) est une question posee a chercherAlternative() " +
    "et l'etat rendu est compte. Les soeurs sont les pools qui font le MEME echange (memes deux " +
    "monnaies, meme sens), et jamais ceux qui partagent seulement le jeton.",
  mesures_lues: mesuresLues,
  etats,
  part_porte_unique: Number((((etats["PORTE_UNIQUE"] ?? 0) / mesuresLues) * 100).toFixed(2)),
  paires_a_une_porte: pairesUniques,
  paires_a_plusieurs_portes: pairesMultiples,
  propositions_au_dessus_du_seuil: propositions.length,
  economie_bps: tri.length
    ? { min: Number(tri[0].toFixed(4)), mediane: Number(med.toFixed(4)), max: Number(tri[tri.length - 1].toFixed(4)) }
    : null,
  propositions_au_dessus_de_100_bps: propositions.filter((x) => x.economie_bps > 100).length,
  propositions: propositions.sort((a, b) => b.economie_bps - a.economie_bps),
};

if (process.argv.includes("--write")) {
  const out = resolve(ICI, "..", "data", "chiffres-alternative.json");
  writeFileSync(out, JSON.stringify(releve, null, 2) + "\n");
  console.log(`ecrit : ${out}`);
}

console.log(`bloc ${releve.block_number}, ${releve.mesures_lues} lignes de table interrogees`);
for (const [k, v] of Object.entries(releve.etats).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(22)} ${String(v).padStart(7)}  ${((v / mesuresLues) * 100).toFixed(2)} %`);
console.log(`paires a une seule porte    ${releve.paires_a_une_porte}`);
console.log(`paires a plusieurs portes   ${releve.paires_a_plusieurs_portes}`);
console.log(`propositions > ${SEUIL} bps        ${releve.propositions_au_dessus_du_seuil}`);
if (releve.economie_bps)
  console.log(
    `economie                    min ${releve.economie_bps.min} / mediane ${releve.economie_bps.mediane} / max ${releve.economie_bps.max} bps`,
  );
console.log(`dont > 100 bps              ${releve.propositions_au_dessus_de_100_bps}`);
