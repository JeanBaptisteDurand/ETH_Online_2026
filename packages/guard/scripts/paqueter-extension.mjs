/**
 * CONSTRUIT ET EMPAQUETTE L'EXTENSION.
 *
 *   node scripts/paqueter-extension.mjs           construit extension/ et ecrit dist/tare-guard.zip
 *   node scripts/paqueter-extension.mjs --sans-zip  construit seulement
 *
 * QUATRE ENTREES, TROIS FORMATS, et se tromper de format echoue de facons differentes :
 *
 *   inject.js  IIFE   monde MAIN. Un script de contenu N'EST PAS un module : un `import`
 *                     en tete le fait echouer au chargement, silencieusement pour l'utilisateur.
 *   pont.js    IIFE   monde ISOLATED, meme contrainte.
 *   worker.js  ESM    service worker declare "type": "module" dans le manifeste.
 *   options.js ESM    charge par <script type="module">.
 *
 * LA TABLE N'EST PAS BUNDLEE. Elle est COPIEE a cote, et le worker la charge par `fetch` au
 * premier swap. C'est la mesure qui a motive toute l'architecture : bundlee dans le script de
 * contenu, elle donnait 21,9 Mo de source JS a parser sur CHAQUE page a document_start. Ce
 * script imprime les deux chiffres pour qu'on puisse verifier que ca ne revient pas.
 */
import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXT = resolve(RACINE, "extension");
const DIST = resolve(RACINE, "dist");

const ENTREES = [
  { src: "inject.src.ts", out: "inject.js", format: "iife", quoi: "script de contenu, monde MAIN" },
  { src: "pont.src.ts", out: "pont.js", format: "iife", quoi: "script de contenu, monde ISOLATED" },
  { src: "worker.src.ts", out: "worker.js", format: "esm", quoi: "service worker" },
  { src: "options.src.ts", out: "options.js", format: "esm", quoi: "page de reglages" },
];

/** Ce que le paquet doit contenir. Un fichier annonce et absent est une erreur, pas un oubli. */
const STATIQUES = ["manifest.json", "options.html", "icon128.png"];

const ko = (n) => `${(n / 1024).toFixed(1)} Ko`;

async function construire() {
  for (const e of ENTREES) {
    await build({
      entryPoints: [resolve(EXT, e.src)],
      outfile: resolve(EXT, e.out),
      bundle: true,
      format: e.format,
      target: "chrome110",
      minify: false, // lisible : un juge peut ouvrir le fichier livre
      logLevel: "warning",
    });
    console.log(`  ${e.out.padEnd(12)} ${ko(statSync(resolve(EXT, e.out)).size).padStart(9)}  ${e.quoi}`);
  }
}

function copierTable() {
  const src = resolve(RACINE, "data", "table.json");
  if (!existsSync(src)) {
    console.error(
      "\ndata/table.json absente. Lance `npm run build:table` d'abord — sans elle le worker\n" +
        "repondra « table absente du paquet » et chaque transaction passera sans verdict.",
    );
    process.exit(1);
  }
  copyFileSync(src, resolve(EXT, "table.json"));
  const t = JSON.parse(readFileSync(src, "utf8"));
  console.log(
    `  table.json   ${ko(statSync(src).size).padStart(9)}  ${t.n_measurements} mesures, bloc ${t.block_number} — CHARGEE PAR FETCH, jamais bundlee`,
  );
  return t;
}

function verifierStatiques() {
  const manquants = STATIQUES.filter((f) => !existsSync(resolve(EXT, f)));
  if (manquants.length) {
    console.error(`\nfichiers annonces par le manifeste et absents : ${manquants.join(", ")}`);
    process.exit(1);
  }
  // Le manifeste doit citer exactement ce qu'on construit : une entree renommee ici et pas
  // la-bas donne une extension qui s'installe et ne fait rien.
  const m = JSON.parse(readFileSync(resolve(EXT, "manifest.json"), "utf8"));
  const cites = new Set([
    ...(m.content_scripts ?? []).flatMap((c) => c.js ?? []),
    m.background?.service_worker,
    ...(m.web_accessible_resources ?? []).flatMap((r) => r.resources ?? []),
  ].filter(Boolean));
  const construits = new Set([...ENTREES.map((e) => e.out), "table.json"]);
  for (const c of cites)
    if (!construits.has(c) && !existsSync(resolve(EXT, c)))
      throw new Error(`le manifeste cite ${c}, qui n'est ni construit ni present`);
  for (const b of ENTREES.map((e) => e.out))
    if (!cites.has(b) && b !== "options.js")
      throw new Error(`${b} est construit mais le manifeste ne le cite pas`);
  return m;
}

console.log("construction de l'extension");
await construire();
const table = copierTable();
const manifeste = verifierStatiques();

if (!process.argv.includes("--sans-zip")) {
  mkdirSync(DIST, { recursive: true });
  const zip = resolve(DIST, "tare-guard.zip");
  rmSync(zip, { force: true });
  const fichiers = [...STATIQUES, ...ENTREES.map((e) => e.out), "table.json", "README.md"].filter((f) =>
    existsSync(resolve(EXT, f)),
  );
  try {
    // `zip` plutot qu'une dependance : il est present sur macOS et sur toute image Debian
    // avec `zip`. Son absence est dite, pas contournee par un paquet de plus.
    execFileSync("zip", ["-q", "-X", zip, ...fichiers], { cwd: EXT });
  } catch (e) {
    console.error(`\nzip indisponible (${e.message.slice(0, 80)}). Les fichiers construits sont dans extension/.`);
    process.exit(1);
  }
  const octets = statSync(zip).size;
  const sha = createHash("sha256").update(readFileSync(zip)).digest("hex");
  writeFileSync(
    resolve(DIST, "tare-guard.zip.json"),
    JSON.stringify(
      {
        schema: "tare-extension-paquet/1",
        version: manifeste.version,
        octets,
        sha256: sha,
        fichiers,
        table: { n_measurements: table.n_measurements, block_number: table.block_number, chain_id: table.chain_id },
        note: "la table est une ressource du paquet, chargee par fetch dans le service worker au premier swap",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\n  dist/tare-guard.zip  ${ko(octets)}  sha256 ${sha.slice(0, 16)}…`);
}
console.log("\nCharger dans Chrome : chrome://extensions -> mode developpeur -> « charger l'extension non empaquetee » -> packages/guard/extension");
