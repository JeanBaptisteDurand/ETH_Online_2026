/**
 * La chaine COMPLETE, sans raccourci : une transaction reelle -> l'ecran de l'appareil.
 *
 *   1. on prend une transaction capturee sur Base mainnet (test/fixtures/real-calldata.json),
 *      rejouable par son hash avec `cast tx` ;
 *   2. `tareGuard(tx)` decode le calldata de l'Universal Router, en sort la PoolKey, retrouve
 *      la mesure dans la table, et rend un verdict ;
 *   3. ce rapport-la — pas un autre — devient un message EIP-712 ;
 *   4. Speculos, servant l'application Ethereum officielle, l'affiche champ par champ ;
 *   5. on marche dans les ecrans, on note TOUT ce qui s'affiche, et on signe.
 *
 * POURQUOI CE SCRIPT EXISTE. docs/ledger/ECRANS.md portait une capture d'ecrans obtenue par un
 * script jamais commite. La capture etait donc invérifiable : rien ne prouvait que le rapport
 * montre a l'appareil venait du decodage d'une vraie transaction plutot que d'un objet ecrit a
 * la main. Ce fichier ferme ce trou — et si la chaine ne tient pas, il le montrera.
 *
 * PREALABLE :
 *   ./scripts/ledger/build-app.sh ethereum       (depuis la racine du depot)
 *   ./scripts/ledger/run-speculos.sh ethereum    -> http://127.0.0.1:5010
 *   puis, sur l'appareil : Settings -> Raw messages -> Enabled
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tareGuard } from "../src/guard.js";
import { buildGuardTypedData } from "../src/ledger.js";
import { renderPrompt } from "../src/approver.js";
import type { TxRequest } from "../src/types.js";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = resolve(HERE, "..");

const API = process.env.SPECULOS_URL ?? "http://127.0.0.1:5010";
const PORT = Number(new URL(API).port || 5010);
const INDEX = Number(process.env.TX_INDEX ?? 1);
const PATH_BIP32 = process.env.LEDGER_PATH ?? "44'/60'/0'/0/0";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function screen(): Promise<string> {
  try {
    const r = await fetch(`${API}/events?currentscreenonly=true`);
    const j = (await r.json()) as { events?: Array<{ text?: string }> };
    return (j.events ?? []).map((e) => e.text ?? "").join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}
const press = (b: "left" | "right" | "both") =>
  fetch(`${API}/button/${b}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "press-and-release" }),
  }).catch(() => undefined);

async function main(): Promise<void> {
  /* --- 1. une transaction REELLE, pas une fixture inventee --- */
  const fixtures = JSON.parse(
    readFileSync(resolve(GUARD, "test/fixtures/real-calldata.json"), "utf8"),
  ) as { universal_router: string; txs: Array<Record<string, string | number>> };
  const raw = fixtures.txs[INDEX];
  if (!raw) throw new Error(`aucune transaction a l'index ${INDEX}`);

  console.log(`transaction  ${raw.tx_hash}`);
  console.log(`  bloc       ${raw.block_number} (Base, chaine ${raw.chain_id})`);
  console.log(`  vers       ${raw.to}`);
  console.log(`  note       ${raw.note}`);
  console.log(`  rejouable  cast tx ${raw.tx_hash} --rpc-url <base>\n`);

  /* --- 2. la garde decode et decide. Rien n'est fourni a la main. --- */
  const tx: TxRequest = { to: String(raw.to), data: String(raw.input), from: undefined };
  const report = tareGuard(tx);

  const f = report.findings[0];
  console.log(`verdict      ${report.verdict}   (calldata lu en entier : ${report.complete})`);
  console.log(`hook lu      ${f?.hook ?? "(aucun)"}`);
  console.log(`pool lu      ${f?.leg?.poolId ?? "(aucun)"}`);
  console.log(`prelevement  ${f?.bps ?? "non mesure"} bps  [${f?.label ?? "-"}]  base: ${f?.basis ?? "-"}`);
  console.log(`en une ligne ${report.headline}`);
  if (f?.replay) console.log(`rejeu        ${f.replay}`);
  console.log();

  /* --- 3. ce rapport-la devient le message signe --- */
  const typed = buildGuardTypedData(report);
  const champs = Object.keys(typed.message);
  console.log(`EIP-712      ${typed.primaryType}, ${champs.length} champs : ${champs.join(", ")}\n`);

  /* --- 4/5. l'appareil l'affiche, on note tout, on signe --- */
  const SpeculosHttpTransport = require("@ledgerhq/hw-transport-node-speculos-http").default;
  const Eth = require("@ledgerhq/hw-app-eth").default;

  const transport = await SpeculosHttpTransport.open({ apiPort: PORT });
  const eth = new Eth(transport);

  const ecrans: string[] = [];
  let fini = false;

  // `fullImplem: false` demande le rendu BRUT de la structure. `true` demanderait le chemin
  // filtre, qui exige des descripteurs publies par Ledger pour ce schema — et rend un message
  // trompeur sur la signature aveugle.
  const signature = eth
    .signEIP712Message(PATH_BIP32, typed, false)
    .then((s: unknown) => { fini = true; return { ok: true as const, s }; })
    .catch((e: Error) => { fini = true; return { ok: false as const, e: e.message }; });

  let dernier = "";
  for (let i = 0; i < 400 && !fini; i++) {
    await sleep(120);
    const s = await screen();
    if (!s) continue;
    if (s !== dernier) { ecrans.push(s); dernier = s; }
    // Le flux de l'application Ethereum, releve ecran par ecran :
    //
    //   « Blind signing ahead — To accept risk, press both buttons »   <- DEUX BOUTONS
    //   « Review typed message », « Review struct … », chaque champ     <- a droite
    //   « Sign message »                                                <- DEUX BOUTONS
    //   « Reject transaction »                                          <- surtout pas
    //
    // Le premier ecran est un avertissement, pas un refus : il faut l'accepter pour que
    // l'application rende ENSUITE la structure champ par champ. Un marcheur qui appuie a
    // droite dessus tombe sur « Reject transaction », revient, et tourne en rond — c'est
    // exactement ce qui s'est passe au premier essai, 399 ecrans durant.
    // ATTENDRE que la demande arrive. Les ecrans du menu au repos — « app is ready »,
    // « App settings », « App info », « Quit app » — ne sont PAS le flux de signature :
    // appuyer dessus promene l'appareil dans ses reglages, et l'APDU qui arrive ensuite
    // tombe sur un etat imprevu et casse le flux (« stream has been aborted »). On ne
    // touche a rien tant que l'appareil n'a pas ouvert la demande.
    if (/app is ready|App settings|App info|Quit app/i.test(s)) continue;

    if (/blind signing ahead/i.test(s)) { await press("both"); await sleep(300); }
    else if (/^Sign message$/i.test(s) || /^Approve$/i.test(s)) { await press("both"); await sleep(300); }
    else await press("right"); // « Reject » compris : on passe devant, on n'appuie jamais dessus
  }

  const out = await signature;
  console.log(`ECRANS AFFICHES (${ecrans.length}) :`);
  for (const e of ecrans) console.log(`  ${e}`);

  if (!out.ok) {
    console.log(`\nSIGNATURE REFUSEE : ${out.e}`);
    await transport.close();
    process.exit(1);
  }
  const sig = out.s as { v: number; r: string; s: string };
  console.log(`\nSIGNE   v=${sig.v}  r=${sig.r.slice(0, 18)}…  s=${sig.s.slice(0, 18)}…`);

  const preuve = {
    v: "tare.guard.speculos.v1",
    ts: new Date().toISOString(),
    appareil: "Speculos — application Ethereum officielle (Nano X)",
    physique: false,
    transaction: { hash: raw.tx_hash, block: raw.block_number, chain_id: raw.chain_id, to: raw.to },
    rapport: {
      verdict: report.verdict,
      complete: report.complete,
      headline: report.headline,
      findings: report.findings.map((x) => ({
        hook: x.hook,
        poolId: x.leg?.poolId ?? null,
        label: x.label,
        bps: x.bps,
        basis: x.basis,
        sentence: x.sentence,
        replay: x.replay,
      })),
      table: report.table,
    },
    prompt: renderPrompt(report),
    eip712: { primaryType: typed.primaryType, champs },
    ecrans,
    signature: { v: sig.v, r: sig.r, s: sig.s },
  };
  const dest = resolve(GUARD, "../../docs/ledger/guard-speculos.json");
  writeFileSync(dest, JSON.stringify(preuve, null, 2) + "\n");
  console.log(`preuve ecrite : ${dest}`);
  await transport.close();
}

main().catch((e: Error) => {
  console.error(`ECHEC : ${e.message}`);
  process.exit(1);
});
