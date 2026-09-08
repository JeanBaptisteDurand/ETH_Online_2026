/**
 * `npx tsx packages/keyring/scripts/ring.ts <commande>`
 *
 *   seal    scelle un secret sous la graine Ledger. EXIGE l'appareil (une seule fois).
 *   open    l'ouvre. AUCUN appareil — c'est la promesse du Key Ring, et elle est verifiee
 *           par un transport qui jette si on le touche.
 *   status  ce que le trousseau contient, sans rien dechiffrer.
 *
 * Prealable pour `seal` :
 *   scripts/ledger/build-app.sh ledger-sync
 *   scripts/ledger/run-speculos.sh ledger-sync
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  seal,
  open as openRing,
  readRing,
  writeRing,
  ringExists,
  speculosScreen,
  autoApprove,
  LKRP_STAGING,
  LKRP_PROD,
} from "../src/index.js";
import { nodeSdkWithDevice, nodeSdkHeadless } from "../src/sdk-node.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const RING_PATH = process.env.TARE_KEYRING ?? resolve(REPO, "var", "keyring.json");
const SPECULOS = process.env.SPECULOS_URL ?? "http://127.0.0.1:5011";
const BACKEND = process.env.LKRP_BACKEND ?? LKRP_STAGING;

function backendLabel(url: string): string {
  if (url === LKRP_PROD) return "production";
  if (url === LKRP_STAGING) return "recette (staging)";
  return url;
}

async function cmdSeal(): Promise<void> {
  const nom = process.env.TARE_SECRET_NAME ?? "HEDERA_PAYER_PRIVATE_KEY";
  const secret = process.env[nom];
  if (!secret)
    throw new Error(
      `${nom} absent de l'environnement — rien a sceller. ` +
        `Charge le .env, ou passe TARE_SECRET_NAME=<AUTRE_VARIABLE>.`,
    );

  if (ringExists(RING_PATH))
    throw new Error(
      `un trousseau existe deja a ${RING_PATH}. Supprime-le explicitement pour rescelle : ` +
        `une ecriture silencieuse ferait perdre l'acces au secret precedent.`,
    );

  console.log(`backend  ${backendLabel(BACKEND)}`);
  console.log(`appareil ${SPECULOS} (Speculos — pas un appareil physique)`);
  console.log(`secret   ${nom}, ${secret.length} caracteres\n`);

  const sdk = nodeSdkWithDevice({ speculosUrl: SPECULOS, backend: BACKEND });
  const screen = speculosScreen(SPECULOS);

  const out = await seal({
    sdk,
    approve: () => autoApprove(screen),
    nom,
    secret,
    appareil: "Speculos — application Ledger Sync (Nano X)",
    physique: false,
    backend: BACKEND,
  });

  for (const s of out.screens) console.log(`  ecran  ${s}`);
  writeRing(RING_PATH, out.ring);
  console.log(`\ntrustchain ${out.ring.rootId}`);
  console.log(`membre     ${out.ring.membre.pubkey}`);
  console.log(`scelle     ${out.ring.scelle.length / 2} octets`);
  console.log(`\ntrousseau ecrit : ${RING_PATH} (mode 0600)`);
  console.log(`la cle de chiffrement n'y est PAS — le membre la retrouve aupres du backend.`);
}

async function cmdOpen(): Promise<void> {
  const ring = readRing(RING_PATH);
  const sdk = nodeSdkHeadless({ backend: ring.backend });
  const secret = await openRing(sdk, ring);
  const masque =
    secret.length > 10 ? `${secret.slice(0, 6)}…${secret.slice(-4)}` : "*".repeat(secret.length);
  console.log(`${ring.nom} ouvert sans appareil : ${masque} (${secret.length} caracteres)`);
  if (process.env.TARE_REVEAL === "1") console.log(secret);
  else console.log("(TARE_REVEAL=1 pour l'afficher en clair)");
}

function cmdStatus(): void {
  const ring = readRing(RING_PATH);
  console.log(`fichier    ${RING_PATH}`);
  console.log(`schema     ${ring.v}`);
  console.log(`secret     ${ring.nom}`);
  console.log(`scelle le  ${ring.scelle_le}`);
  console.log(`appareil   ${ring.appareil}  (physique: ${ring.physique})`);
  console.log(`backend    ${backendLabel(ring.backend)}`);
  console.log(`trustchain ${ring.rootId}`);
  console.log(`membre     ${ring.membre.pubkey}`);
  console.log(`scelle     ${ring.scelle.length / 2} octets`);
  console.log(`cle de chiffrement sur le disque : non`);
}

const cmd = process.argv[2];
const run =
  cmd === "seal"
    ? cmdSeal()
    : cmd === "open"
      ? cmdOpen()
      : cmd === "status"
        ? Promise.resolve(cmdStatus())
        : Promise.reject(new Error("usage: ring.ts seal | open | status"));

run.catch((e: Error) => {
  console.error(`ECHEC : ${e.message}`);
  process.exit(1);
});
