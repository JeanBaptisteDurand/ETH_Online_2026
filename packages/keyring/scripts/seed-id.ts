/**
 * Prouve, de bout en bout, que le Ledger Key Ring Protocol tourne sans appareil physique.
 *
 *   scripts/ledger/build-app.sh ledger-sync
 *   scripts/ledger/run-speculos.sh ledger-sync     # http://127.0.0.1:5011
 *   npx tsx packages/keyring/scripts/seed-id.ts
 *
 * Ce qui se passe : on demande un defi au backend de Ledger, on l'envoie a l'application
 * « Ledger Sync », on APPROUVE a l'ecran, et on recupere la credential signee.
 *
 * Chaque ecran traverse est imprime. Si l'ecran d'approbation n'apparait pas, le script
 * echoue au lieu de rendre une preuve : une signature qu'on n'a pas vue approuver ne
 * prouve pas qu'un humain a consenti.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchChallenge,
  proveSeedId,
  speculosScreen,
  walkAndConfirm,
  LEDGER_SYNC_CONNECT,
  TRUSTCHAIN_API,
} from "../src/index.js";

// Le SDK de Ledger et son transport Speculos ne sont publies qu'en CommonJS, et leur
// resolution ESM est cassee en amont (@ledgerhq/errors importe sans extension). On les
// charge donc par require : c'est la seule forme qui fonctionne, pas une preference.
const require = createRequire(import.meta.url);
const SpeculosHttpTransport = require("@ledgerhq/hw-transport-node-speculos-http").default;
const { device } = require("@ledgerhq/hw-ledger-key-ring-protocol");

const API = process.env.SPECULOS_URL ?? "http://127.0.0.1:5011";
const PORT = Number(new URL(API).port || 5011);

async function main(): Promise<void> {
  const challenge = await fetchChallenge(process.env.TRUSTCHAIN_API ?? TRUSTCHAIN_API);
  console.log(`defi LKRP   ${challenge.data}  (expire ${challenge.expiry})`);
  console.log(`emis par    ${challenge.host}`);
  console.log(`tlv         ${challenge.tlv.length / 2} octets, signes par Ledger\n`);

  const transport = await SpeculosHttpTransport.open({ apiPort: PORT });
  const screen = speculosScreen(API);

  let settled = false;
  let walk: Awaited<ReturnType<typeof walkAndConfirm>> = { screens: [], confirmed: false };

  try {
    const proof = await proveSeedId(
      transport,
      challenge,
      async () => {
        walk = await walkAndConfirm(screen, LEDGER_SYNC_CONNECT, { settled: () => settled });
        for (const s of walk.screens) console.log(`  ecran  ${s}`);
        if (!walk.confirmed)
          throw new Error(
            "l'ecran « Connect » n'est jamais apparu — rien n'a ete approuve, " +
              `ecrans vus : ${JSON.stringify(walk.screens)}`,
          );
      },
      (t) => device.apdu(t),
    );
    settled = true;

    console.log(`\npreuve signee par l'appareil`);
    console.log(`  cle publique   ${proof.publicKey}`);
    console.log(`  signature      ${proof.signature}`);
    console.log(`  attestation    type=${proof.attestationType} ${proof.attestation ?? "aucune"}`);

    const here = dirname(fileURLToPath(import.meta.url));
    const out = resolve(here, "../../../docs/ledger/seed-id.json");
    writeFileSync(
      out,
      JSON.stringify(
        {
          v: "tare.lkrp.seedid.v1",
          ts: new Date().toISOString(),
          appareil: "Speculos — application Ledger Sync (Nano X)",
          physique: false,
          defi: challenge,
          ecrans: walk.screens,
          preuve: proof,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`\npreuve ecrite : ${out}`);
  } finally {
    settled = true;
    await transport.close();
  }
}

main().catch((e: Error) => {
  console.error(`ECHEC : ${e.message}`);
  process.exit(1);
});
