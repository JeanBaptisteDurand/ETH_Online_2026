/**
 * L'ALLER-RETOUR, CONTRE LE SERVICE REEL.
 *
 * On demande a /demo/preparer le calldata qu'il rendra au jury, et on le relit avec LE
 * DECODEUR DU DEPOT — `packages/guard/src/calldata.ts`, celui-la meme que la garde execute
 * en direct devant le jury. S'il ne retrouve pas la PoolKey et le hook annonces, la demo est
 * morte, et ce script le dit tout de suite.
 *
 *   npx tsx scripts/relire.ts http://127.0.0.1:8790
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ICI = dirname(fileURLToPath(import.meta.url));

/** Le decodeur du DEPOT d'abord ; la copie vendorisee (identique, rsyncee) en dernier recours. */
const CANDIDATS = [
  resolve(ICI, "../../packages/guard/src/calldata.ts"),
  "/root/tare-api/packages/guard/src/calldata.ts",
  resolve(ICI, "../vendor/guard/src/calldata.ts"),
];
const CANDIDATS_POOLKEY = [
  resolve(ICI, "../../packages/guard/src/poolkey.ts"),
  "/root/tare-api/packages/guard/src/poolkey.ts",
  resolve(ICI, "../vendor/guard/src/poolkey.ts"),
];

const cheminDecodeur = CANDIDATS.find(existsSync);
const cheminPoolKey = CANDIDATS_POOLKEY.find(existsSync);
if (!cheminDecodeur || !cheminPoolKey) {
  console.error("ECHEC  aucun decodeur trouve : ni le depot ni la copie vendorisee");
  process.exit(1);
}
const { decodeUniversalRouterCalldata } = (await import(cheminDecodeur)) as typeof import("../vendor/guard/src/calldata.js");
const { poolId } = (await import(cheminPoolKey)) as typeof import("../vendor/guard/src/poolkey.js");

const BASE = (process.argv[2] ?? process.env.DEMO_BASE ?? "http://127.0.0.1:8790").replace(/\/+$/, "");
const ADRESSE = process.env.ADRESSE ?? "0xDad77910DbDFdE764fC21FCD4E74D71bBACA6D8D";

console.log(`decodeur : ${cheminDecodeur}`);
let echecs = 0;

for (const acte of ["stop", "substitution"] as const) {
  let d: any;
  try {
    const r = await fetch(`${BASE}/demo/preparer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adresse: ADRESSE, acte }),
      signal: AbortSignal.timeout(30000),
    });
    d = await r.json();
  } catch (e) {
    console.log(`ECHEC  acte ${acte} : ${(e as Error).message}`);
    echecs++;
    continue;
  }

  const paires: Array<[string, any, any]> = [["transaction", d.transaction, d.porte]];
  if (d.transaction_remplacement) paires.push(["remplacement", d.transaction_remplacement, d.meilleure_porte]);

  for (const [quoi, tx, veut] of paires) {
    if (!tx?.data || !veut) {
      console.log(`ECHEC  ${acte}/${quoi} : le service n'a pas rendu de calldata (motif: ${d.motif ?? "aucun"})`);
      echecs++;
      continue;
    }
    const r = decodeUniversalRouterCalldata(tx.data);
    const j = r.legs[0];
    const ecarts: string[] = [];
    if (r.router !== "universal-router") ecarts.push(`routeur=${r.router}`);
    if (!r.complete) ecarts.push(`calldata lu partiellement : ${r.issues.map((i) => i.reason).join(", ")}`);
    if (r.legs.length !== 1) ecarts.push(`${r.legs.length} jambes au lieu d'une`);
    if (j) {
      if (j.poolId !== veut.pool_id) ecarts.push(`pool relu ${j.poolId} != annonce ${veut.pool_id}`);
      if (j.poolKey.hooks.toLowerCase() !== veut.hook) ecarts.push(`hook relu ${j.poolKey.hooks} != annonce ${veut.hook}`);
      if (poolId(j.poolKey) !== veut.pool_id) ecarts.push(`keccak(PoolKey relue) != pool annonce`);
      if (j.direction !== veut.sens) ecarts.push(`sens relu ${j.direction} != ${veut.sens}`);
      if (j.amountIn !== veut.taille_wei) ecarts.push(`taille relue ${j.amountIn} != ${veut.taille_wei}`);
    }
    if (ecarts.length === 0) {
      console.log(
        `OK     ${acte}/${quoi} : le decodeur du depot retrouve le pool ${j!.poolId.slice(0, 12)}… ` +
          `et le hook ${j!.poolKey.hooks.slice(0, 12)}…, sens ${j!.direction}, taille ${j!.amountIn}`,
      );
    } else {
      console.log(`ECHEC  ${acte}/${quoi} : ${ecarts.join(" ; ")}`);
      echecs++;
    }
  }
}

console.log(echecs === 0 ? "ALLER-RETOUR : VERT" : `ALLER-RETOUR : ${echecs} ECHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
