/**
 * Le CLIENT x402 — le cote qui PAIE.
 *
 * Jusqu'ici le depot ne contenait que le peage : `src/x402.ts` sait repondre 402 et
 * annoncer son prix, mais rien dans le projet n'avait jamais REGLE une requete. Un
 * peage que personne ne franchit ne prouve pas qu'il s'ouvre.
 *
 * Ce module franchit le peage pour de vrai, et le fait en deux temps explicites au
 * lieu d'un `fetch` decore : on VOIT le 402, on VOIT l'exigence de paiement, on VOIT
 * l'en-tete signe, on VOIT le reglement. C'est le protocole, pas une abstraction.
 *
 *   1. POST sans paiement            -> 402 + PAYMENT-REQUIRED
 *   2. createPaymentPayload(...)     -> une TransferTransaction Hedera signee par le
 *                                        payeur, PARTIELLEMENT : le facilitateur y
 *                                        ajoute sa signature de fee payer
 *   3. POST avec X-PAYMENT           -> 200 + PAYMENT-RESPONSE { success, transaction }
 *   4. relecture mirror node          -> le reglement n'est REEL que si le reseau le rend
 *
 * Regle dure n.3, appliquee au paiement : `settled` n'est jamais deduit d'un 200. Un
 * 200 dit que le serveur a rendu la ressource ; seul le mirror node dit qu'un transfert
 * a eu lieu, et pour quel montant. Tant qu'il ne l'a pas rendu, l'etat est
 * NOT_VERIFIED — jamais promu.
 */
import { PrivateKey } from "@hiero-ledger/sdk";
import { createClientHederaSigner } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { Network } from "@x402/core/types";

export const MIRROR_TESTNET = "https://testnet.mirrornode.hedera.com";

export interface PayerConfig {
  /** compte Hedera du payeur, forme 0.0.x */
  accountId: string;
  /** cle privee du payeur. Lue dans l'environnement, jamais journalisee. */
  privateKey: string;
  /** "ECDSA" | "ED25519" — lu dans .env, jamais devine (une cle ECDSA lue en ED25519 signe faux). */
  keyType: string;
  /** CAIP-2, p.ex. hedera:testnet */
  network: string;
}

/** La cle, du bon type. On refuse de deviner : un mauvais type produit une signature invalide. */
export function parseKey(raw: string, keyType: string): PrivateKey {
  const t = keyType.trim().toUpperCase();
  if (t === "ECDSA") return PrivateKey.fromStringECDSA(raw);
  if (t === "ED25519") return PrivateKey.fromStringED25519(raw);
  throw new Error(`HEDERA_PAYER_KEY_TYPE inconnu: ${keyType} (attendu ECDSA ou ED25519)`);
}

export function createPayer(cfg: PayerConfig): x402HTTPClient {
  const network = cfg.network as Network;
  const signer = createClientHederaSigner(cfg.accountId, parseKey(cfg.privateKey, cfg.keyType), {
    network: cfg.network,
  });
  const core = new x402Client().register(network, new ExactHederaScheme(signer));
  return new x402HTTPClient(core);
}

/** Ce qu'un transfert HTS a REELLEMENT deplace, lu sur le mirror node. */
export interface MirrorTransfer {
  token: string;
  from: string | null;
  to: string | null;
  amount: number | null;
}

export interface MirrorSettlement {
  /** true seulement si le mirror rend la transaction */
  verified: boolean;
  reason: string | null;
  status: string | null;
  consensus_timestamp: string | null;
  charged_tx_fee: number | null;
  transfers: MirrorTransfer[];
  hashscan: string | null;
}

/**
 * Le format du champ `transaction` d'un SettleResponse Hedera est un TransactionId
 * `0.0.x@seconds.nanos`. Le mirror node, lui, l'ecrit `0.0.x-seconds-nanos`.
 */
export function toMirrorTxId(transactionId: string): string {
  return transactionId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
}

export async function readSettlement(
  transactionId: string,
  opts: { mirrorUrl?: string; attempts?: number; delayMs?: number } = {},
): Promise<MirrorSettlement> {
  const mirror = opts.mirrorUrl ?? MIRROR_TESTNET;
  const attempts = opts.attempts ?? 8;
  const delayMs = opts.delayMs ?? 2000;
  const id = toMirrorTxId(transactionId);
  const empty: MirrorSettlement = {
    verified: false,
    reason: null,
    status: null,
    consensus_timestamp: null,
    charged_tx_fee: null,
    transfers: [],
    hashscan: null,
  };

  let lastReason = "jamais interroge";
  for (let i = 0; i < attempts; i++) {
    let res: Response;
    try {
      res = await fetch(`${mirror}/api/v1/transactions/${id}`);
    } catch (e) {
      lastReason = `mirror injoignable: ${(e as Error).message}`;
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    if (res.status === 404) {
      // pas encore indexe : ce n'est pas une absence, c'est un delai. On reessaie.
      lastReason = "404 sur le mirror (pas encore indexe)";
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    if (!res.ok) {
      lastReason = `mirror ${res.status}`;
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    const body = (await res.json()) as { transactions?: Array<Record<string, unknown>> };
    const tx = body.transactions?.[0];
    if (!tx) {
      lastReason = "mirror a repondu 200 sans transaction";
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    const raw = (tx.token_transfers ?? []) as Array<Record<string, unknown>>;
    // Un transfert HTS s'ecrit en deux lignes signees : le debit (-) et le credit (+).
    // On les recolle par token pour dire "de qui a qui, combien" plutot que deux lignes brutes.
    const byToken = new Map<string, MirrorTransfer>();
    for (const t of raw) {
      const token = String(t.token_id);
      const amount = Number(t.amount);
      const account = String(t.account);
      const entry = byToken.get(token) ?? { token, from: null, to: null, amount: null };
      if (amount < 0) entry.from = account;
      else if (amount > 0) {
        entry.to = account;
        entry.amount = amount;
      }
      byToken.set(token, entry);
    }
    return {
      verified: true,
      reason: null,
      status: String(tx.result ?? ""),
      consensus_timestamp: String(tx.consensus_timestamp ?? ""),
      charged_tx_fee: tx.charged_tx_fee === undefined ? null : Number(tx.charged_tx_fee),
      transfers: [...byToken.values()],
      hashscan: `https://hashscan.io/testnet/transaction/${tx.consensus_timestamp}`,
    };
  }
  return { ...empty, reason: lastReason };
}

export interface PaidRequest {
  /** le 402 : ce que le serveur a exige, et le prix qu'il a calcule */
  challenge: {
    status: number;
    body: unknown;
    accepts: unknown;
  };
  /** l'en-tete signe, tronque : on ne recopie jamais une transaction signee en entier dans un log */
  paymentHeaderPrefix: string;
  paymentHeaderBytes: number;
  /** la reponse payee */
  paid: {
    status: number;
    body: unknown;
  };
  /** ce que le serveur a annonce comme reglement */
  settle: {
    success: boolean;
    transaction: string | null;
    payer: string | null;
    errorReason: string | null;
  } | null;
  /** ce que le RESEAU confirme. Fait foi. */
  mirror: MirrorSettlement | null;
}

/**
 * Une requete payante, de bout en bout. Ne jette pas sur un 402 : le 402 fait partie du
 * protocole, pas de la panne. Jette si le serveur est injoignable, ou si le payload de
 * paiement ne peut pas etre construit — ce sont de vraies pannes.
 */
export async function payOnce(
  url: string,
  body: unknown,
  http: x402HTTPClient,
  opts: { verifyOnMirror?: boolean; mirrorUrl?: string } = {},
): Promise<PaidRequest> {
  const headers = { "content-type": "application/json" };
  const payload = JSON.stringify(body);

  // 1. la requete nue. On ATTEND un 402.
  const first = await fetch(url, { method: "POST", headers, body: payload });
  const firstBody = await first.json().catch(() => null);
  if (first.status !== 402) {
    // 200 sans payer = le peage est desactive (X402_ENABLED=0). On le DIT, on ne
    // pretend pas avoir paye.
    return {
      challenge: { status: first.status, body: firstBody, accepts: null },
      paymentHeaderPrefix: "",
      paymentHeaderBytes: 0,
      paid: { status: first.status, body: firstBody },
      settle: null,
      mirror: null,
    };
  }

  const required = http.getPaymentRequiredResponse(
    (name) => first.headers.get(name),
    firstBody,
  );

  // 2. la transaction Hedera, signee par le payeur.
  const paymentPayload = await http.createPaymentPayload(required);
  const paymentHeaders = http.encodePaymentSignatureHeader(paymentPayload);
  const headerValue = Object.values(paymentHeaders)[0] ?? "";

  // 3. la meme requete, avec le paiement.
  const second = await fetch(url, {
    method: "POST",
    headers: { ...headers, ...paymentHeaders },
    body: payload,
  });
  const secondBody = await second.json().catch(() => null);

  let settle: PaidRequest["settle"] = null;
  try {
    const s = http.getPaymentSettleResponse((name) => second.headers.get(name)) as {
      success?: boolean;
      transaction?: string | null;
      payer?: string | null;
      errorReason?: string | null;
    };
    settle = {
      success: s.success === true,
      transaction: s.transaction ?? null,
      payer: s.payer ?? null,
      errorReason: s.errorReason ?? null,
    };
  } catch {
    settle = null;
  }

  let mirror: MirrorSettlement | null = null;
  if (opts.verifyOnMirror !== false && settle?.transaction) {
    mirror = await readSettlement(settle.transaction, { mirrorUrl: opts.mirrorUrl });
  }

  return {
    challenge: {
      status: first.status,
      body: firstBody,
      accepts: (required as { accepts?: unknown }).accepts ?? null,
    },
    paymentHeaderPrefix: headerValue.slice(0, 24),
    paymentHeaderBytes: headerValue.length,
    paid: { status: second.status, body: secondBody },
    settle,
    mirror,
  };
}
