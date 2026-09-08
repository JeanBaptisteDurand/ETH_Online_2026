/**
 * `npx tsx src/pay/cli.ts <commande>` — le client x402, en ligne de commande.
 *
 *   solde     ce que le payeur et l'encaisseur detiennent AVANT (mirror node)
 *   associer  associe un compte au token USDC
 *   financer  deplace de l'USDC de l'encaisseur vers le payeur (amorcage de demo)
 *   payer     une requete POST /measure reglee de bout en bout, puis relue sur le reseau
 *
 * A savoir, paye au prix d'une heure perdue : le faucet Circle accepte l'identifiant
 * Hedera (`0.0.x`, pas l'adresse EVM) et repond "Tokens sent" — mais si le compte n'est
 * PAS associe au token, rien n'arrive et rien ne le dit. `associer` d'abord, toujours.
 *
 * Rien ici ne suppose : chaque chiffre affiche vient d'une lecture, et un chiffre non lu
 * s'affiche `null`, jamais 0.
 */
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AccountId,
  Client,
  TokenAssociateTransaction,
  TokenId,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { loadConfig } from "../config.js";
import { REPO_ROOT } from "../paths.js";
import { createPayer, payOnce, parseKey, MIRROR_TESTNET } from "./client.js";

const USDC_TESTNET = "0.0.429274";

function need(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} absent de l'environnement (voir .env)`);
  return v;
}

/**
 * Trois etats, jamais deux. Le mirror injoignable ne vaut pas "zero" ; une reponse qui
 * ne liste pas le token ne vaut pas "non lu" non plus : elle dit que le compte n'est pas
 * associe, ce qui est la cause exacte du TOKEN_NOT_ASSOCIATED_TO_ACCOUNT que rendrait le
 * facilitateur.
 */
interface Solde {
  units: number | null;
  associe: boolean | null;
}

async function tokenBalance(accountId: string, token: string): Promise<Solde> {
  let res: Response;
  try {
    res = await fetch(`${MIRROR_TESTNET}/api/v1/accounts/${accountId}/tokens?token.id=${token}`);
  } catch {
    return { units: null, associe: null }; // non lu vaut null, jamais 0
  }
  if (!res.ok) return { units: null, associe: null };
  const body = (await res.json()) as { tokens?: Array<{ balance?: number }> };
  const t = body.tokens?.[0];
  if (!t) return { units: 0, associe: false };
  return { units: t.balance === undefined ? null : Number(t.balance), associe: true };
}

function usdc(s: Solde): string {
  if (s.units === null) return "non lu";
  const montant = `${(s.units / 1e6).toFixed(6)} USDC (${s.units} unites)`;
  return s.associe ? montant : `${montant} — NON ASSOCIE au token`;
}

async function cmdSolde(): Promise<void> {
  const payer = need("HEDERA_PAYER_ACCOUNT_ID");
  const payee = process.env.HEDERA_PAY_TO ?? need("HEDERA_PAYEE_ACCOUNT_ID");
  console.log(`token   ${USDC_TESTNET} (USDC testnet, 6 decimales)`);
  console.log(`payeur  ${payer}  ${usdc(await tokenBalance(payer, USDC_TESTNET))}`);
  console.log(`encaisse ${payee}  ${usdc(await tokenBalance(payee, USDC_TESTNET))}`);
}

/**
 * L'association explicite. Nos deux comptes ont `max_automatic_token_associations: -1`
 * (illimitee), donc elle n'est normalement pas necessaire — mais un compte cree
 * autrement l'exigerait, et le facilitateur echoue alors sur
 * TOKEN_NOT_ASSOCIATED_TO_ACCOUNT. La commande existe pour ce cas-la.
 */
async function cmdAssocier(which: string): Promise<void> {
  const isPayee = which === "encaisseur";
  const id = isPayee ? need("HEDERA_PAYEE_ACCOUNT_ID") : need("HEDERA_PAYER_ACCOUNT_ID");
  const key = isPayee ? need("HEDERA_PAYEE_PRIVATE_KEY") : need("HEDERA_PAYER_PRIVATE_KEY");
  const type =
    (isPayee ? process.env.HEDERA_PAYEE_KEY_TYPE : process.env.HEDERA_PAYER_KEY_TYPE) ?? "ECDSA";

  const client = Client.forTestnet().setOperator(AccountId.fromString(id), parseKey(key, type));
  try {
    const tx = await new TokenAssociateTransaction()
      .setAccountId(AccountId.fromString(id))
      .setTokenIds([TokenId.fromString(USDC_TESTNET)])
      .execute(client);
    const receipt = await tx.getReceipt(client);
    console.log(`${id} associe a ${USDC_TESTNET} : ${receipt.status.toString()}`);
  } catch (e) {
    // TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT n'est pas une panne : c'est deja fait.
    console.log(`${id} : ${(e as Error).message}`);
  } finally {
    client.close();
  }
}

/**
 * Amorcage : le faucet ne livre qu'une fois par adresse et par 2 h. Quand il a rempli le
 * mauvais des deux comptes, on redistribue nous-memes — les deux cles sont a nous.
 * Rien de x402 ici : c'est un virement HTS ordinaire, et il est nomme comme tel.
 */
async function cmdFinancer(montant: string): Promise<void> {
  const from = need("HEDERA_PAYEE_ACCOUNT_ID");
  const to = need("HEDERA_PAYER_ACCOUNT_ID");
  const key = need("HEDERA_PAYEE_PRIVATE_KEY");
  const type = process.env.HEDERA_PAYEE_KEY_TYPE ?? "ECDSA";
  const units = Math.round(Number(montant) * 1e6);
  if (!Number.isFinite(units) || units <= 0) throw new Error(`montant invalide: ${montant}`);

  const client = Client.forTestnet().setOperator(AccountId.fromString(from), parseKey(key, type));
  try {
    const tx = await new TransferTransaction()
      .addTokenTransfer(TokenId.fromString(USDC_TESTNET), AccountId.fromString(from), -units)
      .addTokenTransfer(TokenId.fromString(USDC_TESTNET), AccountId.fromString(to), units)
      .execute(client);
    const receipt = await tx.getReceipt(client);
    console.log(`${from} -> ${to} : ${units} unites (${montant} USDC) : ${receipt.status.toString()}`);
  } finally {
    client.close();
  }
  await cmdSolde();
}

async function cmdPayer(): Promise<void> {
  const cfg = loadConfig();
  const url = process.env.TARE_API_URL ?? `http://127.0.0.1:${cfg.port}/measure`;
  const payerId = need("HEDERA_PAYER_ACCOUNT_ID");
  const payeeId = cfg.payTo;

  // `pool` designe la PoolKey COMPLETE cote API ; un identifiant seul, c'est `pool_id`.
  // Les envoyer l'un pour l'autre donne un 400 avant meme le peage — donc sans paiement,
  // ce qui est le bon comportement : on ne facture pas une requete qu'on refuse.
  const requete: Record<string, unknown> = {
    sizes: (process.env.TARE_SIZES ?? "1000000000000000").split(",").map((s) => s.trim()),
  };
  if (process.env.TARE_POOL_ID) requete.pool_id = process.env.TARE_POOL_ID;
  if (process.env.TARE_HOOK) requete.hook = process.env.TARE_HOOK;
  if (process.env.TARE_DIRECTIONS)
    requete.directions = process.env.TARE_DIRECTIONS.split(",").map((s) => s.trim());
  if (!requete.pool_id && !requete.hook)
    throw new Error("donne TARE_POOL_ID=0x… ou TARE_HOOK=0x… (voir GET /hooks)");

  const avantPayeur = await tokenBalance(payerId, USDC_TESTNET);
  const avantPayee = await tokenBalance(payeeId, USDC_TESTNET);
  console.log(`avant   payeur ${payerId} ${usdc(avantPayeur)}`);
  console.log(`avant   encaisse ${payeeId} ${usdc(avantPayee)}`);

  const http = createPayer({
    accountId: payerId,
    privateKey: need("HEDERA_PAYER_PRIVATE_KEY"),
    keyType: process.env.HEDERA_PAYER_KEY_TYPE ?? "ECDSA",
    network: cfg.x402Network,
  });

  const t0 = Date.now();
  const r = await payOnce(url, requete, http);
  const ms = Date.now() - t0;

  console.log(`\n1. sans paiement -> ${r.challenge.status}`);
  console.log(`   ${JSON.stringify(r.challenge.body).slice(0, 400)}`);
  console.log(`\n2. X-PAYMENT : ${r.paymentHeaderBytes} octets, commence par ${r.paymentHeaderPrefix}...`);
  console.log(`\n3. avec paiement -> ${r.paid.status} en ${ms} ms`);
  console.log(`   reglement annonce : ${JSON.stringify(r.settle)}`);

  if (!r.settle?.success) {
    console.log(`\nNON REGLE. Raison : ${r.settle?.errorReason ?? "aucun en-tete de reglement"}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n4. relecture mirror node`);
  if (!r.mirror?.verified) {
    console.log(`   NOT_VERIFIED : ${r.mirror?.reason ?? "non interroge"}`);
    console.log(`   Le serveur dit "regle" ; le reseau ne l'a pas encore rendu. On ne promeut pas.`);
    process.exitCode = 1;
    return;
  }
  console.log(`   VERIFIED  status=${r.mirror.status}  consensus=${r.mirror.consensus_timestamp}`);
  for (const t of r.mirror.transfers) {
    console.log(`   ${t.from} -> ${t.to} : ${usdc({ units: t.amount, associe: true })} (token ${t.token})`);
  }
  console.log(`   ${r.mirror.hashscan}`);

  const apresPayeur = await tokenBalance(payerId, USDC_TESTNET);
  const apresPayee = await tokenBalance(payeeId, USDC_TESTNET);
  console.log(`\napres   payeur ${payerId} ${usdc(apresPayeur)}`);
  console.log(`apres   encaisse ${payeeId} ${usdc(apresPayee)}`);

  const preuve = {
    v: "tare.x402.settlement.v1",
    ts: new Date().toISOString(),
    url,
    reseau: cfg.x402Network,
    facilitateur: cfg.facilitatorUrl,
    token: USDC_TESTNET,
    payeur: payerId,
    encaisseur: payeeId,
    prix_annonce_402: r.challenge.body,
    transaction: r.settle.transaction,
    mirror: r.mirror,
    solde_payeur: { avant: avantPayeur, apres: apresPayeur },
    solde_encaisseur: { avant: avantPayee, apres: apresPayee },
    latence_ms: ms,
  };
  // Append-only, comme le registre d'usage : un fichier ecrase perdrait les reglements
  // precedents, et une preuve qu'on remplace a chaque fois n'est pas une piste.
  const out = resolve(REPO_ROOT, "docs", "x402-settlements.jsonl");
  appendFileSync(out, JSON.stringify(preuve) + "\n");
  console.log(`\npreuve ajoutee : ${out}`);
}

const [, , cmd, arg] = process.argv;
const run =
  cmd === "solde"
    ? cmdSolde()
    : cmd === "associer"
      ? cmdAssocier(arg ?? "payeur")
      : cmd === "financer"
        ? cmdFinancer(arg ?? "10")
        : cmd === "payer"
          ? cmdPayer()
          : Promise.reject(
              new Error(
                "usage: cli.ts solde | associer [payeur|encaisseur] | financer [montant] | payer",
              ),
            );

run.catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
