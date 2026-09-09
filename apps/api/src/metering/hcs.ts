/**
 * Le journal HCS.
 *
 * Chaque lot de mesures facturees publie son EMPREINTE sur un topic Hedera
 * Consensus Service (testnet). Pas les mesures : leur empreinte, le nombre
 * d'unites, le montant, le payeur et le hash de reglement x402. Le topic devient
 * la piste d'audit horodatee par le consensus Hedera — "verifiable payment audit
 * trails on HCS".
 *
 * On n'ajoute AUCUNE dependance : @hiero-ledger/sdk 2.85.0 (l'ancien
 * @hashgraph/sdk, renomme) est deja installe, tire par @x402/hedera 2.23.0.
 *
 * Regle dure n.3, version reseau : la publication n'est consideree comme faite
 * que si le mirror node la rend. Un timeout, un 429, une page tronquee ne
 * donnent jamais "publie" — ils donnent `verified: false` avec la raison. Le
 * cout n'est jamais suppose : s'il n'a pas ete lu, il vaut null, pas zero.
 */
import { createHash } from "node:crypto";
import {
  AccountId,
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";

export const MIRROR_TESTNET = "https://testnet.mirrornode.hedera.com";
export const HCS_SCHEMA = "tare.metering.v1";

/** Ce qui part sur le topic. Volontairement court : HCS plafonne a 1024 octets par message (au-dela, il faut chunker). */
export interface AnchorPayload {
  v: typeof HCS_SCHEMA;
  batch: string;
  ts: string;
  /** empreinte canonique du lot de mesures */
  digest: string;
  /** unites FACTUREES (mesures), pas requetes */
  units: number;
  unit_price_usd: number;
  amount_usd: number;
  payer: string | null;
  /** hash de reglement x402, quand il existe deja */
  settlement: string | null;
  /** bloc du fork sur lequel les mesures ont ete prises */
  block: number | null;
}

export function anchorPayload(p: AnchorPayload): string {
  return JSON.stringify(p);
}

/** sha256 du message exact, pour comparer octet a octet avec ce que rend le mirror. */
export function messageHash(message: string): string {
  return "sha256:" + createHash("sha256").update(Buffer.from(message, "utf8")).digest("hex");
}

export interface HcsConfig {
  operatorId: string;
  operatorKey: string;
  /** "ECDSA" | "ED25519" — lu dans .env, jamais devine */
  keyType: string;
  network: "testnet" | "mainnet" | "previewnet";
  topicId: string | null;
  mirrorUrl: string;
}

export function hcsConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HcsConfig | null {
  const operatorId = env.HEDERA_PAYER_ACCOUNT_ID ?? env.HEDERA_OPERATOR_ID ?? "";
  const operatorKey = env.HEDERA_PAYER_PRIVATE_KEY ?? env.HEDERA_OPERATOR_KEY ?? "";
  if (!operatorId || !operatorKey) return null;
  const raw = (env.HEDERA_NETWORK ?? "hedera:testnet").toLowerCase();
  const network = raw.includes("mainnet")
    ? "mainnet"
    : raw.includes("previewnet")
      ? "previewnet"
      : "testnet";
  return {
    operatorId,
    operatorKey,
    keyType: (env.HEDERA_PAYER_KEY_TYPE ?? "ECDSA").toUpperCase(),
    network,
    topicId: env.HEDERA_HCS_TOPIC_ID && env.HEDERA_HCS_TOPIC_ID.length > 0
      ? env.HEDERA_HCS_TOPIC_ID
      : null,
    mirrorUrl:
      env.HEDERA_MIRROR_URL ??
      (raw.includes("mainnet") ? "https://mainnet.mirrornode.hedera.com" : MIRROR_TESTNET),
  };
}

function parseKey(cfg: HcsConfig): PrivateKey {
  return cfg.keyType.startsWith("ED")
    ? PrivateKey.fromStringED25519(cfg.operatorKey)
    : PrivateKey.fromStringECDSA(cfg.operatorKey);
}

export function makeClient(cfg: HcsConfig): Client {
  const client =
    cfg.network === "mainnet"
      ? Client.forMainnet()
      : cfg.network === "previewnet"
        ? Client.forPreviewnet()
        : Client.forTestnet();
  client.setOperator(AccountId.fromString(cfg.operatorId), parseKey(cfg));
  return client;
}

export interface CreateTopicResult {
  topic_id: string;
  transaction_id: string;
  memo: string;
  hashscan: string;
}

export async function createTopic(cfg: HcsConfig, memo: string): Promise<CreateTopicResult> {
  const client = makeClient(cfg);
  try {
    const key = parseKey(cfg);
    const tx = await new TopicCreateTransaction()
      .setTopicMemo(memo)
      // clé de soumission : seul TARE ecrit dans son propre journal d'audit.
      .setSubmitKey(key.publicKey)
      .execute(client);
    const receipt = await tx.getReceipt(client);
    const topicId = receipt.topicId;
    if (!topicId) throw new Error("recu HCS sans topicId");
    return {
      topic_id: topicId.toString(),
      transaction_id: tx.transactionId.toString(),
      memo,
      hashscan: hashscanTopic(cfg.network, topicId.toString()),
    };
  } finally {
    client.close();
  }
}

export interface PublishResult {
  topic_id: string;
  sequence_number: number;
  transaction_id: string;
  /** cout REEL en tinybars, lu sur le mirror. null = pas encore lisible, jamais 0 par defaut. */
  charged_tx_fee_tinybar: number | null;
  charged_tx_fee_hbar: number | null;
  fee_note: string | null;
  message: string;
  message_bytes: number;
  message_hash: string;
  hashscan: string;
}

export function hashscanTopic(network: string, topicId: string): string {
  return `https://hashscan.io/${network}/topic/${topicId}`;
}

export function hashscanTransaction(network: string, txId: string): string {
  // 0.0.X@1699999999.000000000 -> 0.0.X-1699999999-000000000
  const normalized = txId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
  return `https://hashscan.io/${network}/transaction/${normalized}`;
}

/** Le format d'id de transaction attendu par l'API REST du mirror node. */
export function mirrorTxId(txId: string): string {
  return txId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
}

export async function publishAnchor(
  cfg: HcsConfig,
  topicId: string,
  payload: AnchorPayload,
  opts: { fetchImpl?: typeof fetch; feeAttempts?: number; feeDelayMs?: number } = {},
): Promise<PublishResult> {
  return publishMessage(cfg, topicId, anchorPayload(payload), opts);
}

/**
 * Publier UN message sur un topic, et rendre ce qu'il a reellement coute.
 *
 * `publishAnchor` n'en est qu'un appel : le journal des paiements et l'identite d'agent
 * (../agent) empruntent le meme chemin, donc la meme lecture de frais, la meme empreinte
 * du message et le meme refus au-dela de 1024 octets. Deux chemins d'ecriture voudraient
 * dire deux disciplines, et l'une des deux finirait par etre la mauvaise.
 */
export async function publishMessage(
  cfg: HcsConfig,
  topicId: string,
  message: string,
  opts: { fetchImpl?: typeof fetch; feeAttempts?: number; feeDelayMs?: number } = {},
): Promise<PublishResult> {
  const bytes = Buffer.byteLength(message, "utf8");
  if (bytes > 1024)
    throw new Error(
      `message HCS de ${bytes} octets : au-dela de 1024 il faudrait chunker. Le payload d'ancrage doit rester une empreinte, pas les mesures.`,
    );

  const client = makeClient(cfg);
  let txIdStr: string;
  let seq: number;
  try {
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(client);
    const receipt = await tx.getReceipt(client);
    txIdStr = tx.transactionId.toString();
    seq = Number(receipt.topicSequenceNumber?.toString() ?? "0");
    if (!seq) throw new Error("recu HCS sans sequence number");
  } finally {
    client.close();
  }

  const fee = await readChargedFee(cfg, txIdStr, opts);

  return {
    topic_id: topicId,
    sequence_number: seq,
    transaction_id: txIdStr,
    charged_tx_fee_tinybar: fee.tinybar,
    charged_tx_fee_hbar: fee.tinybar === null ? null : fee.tinybar / 100_000_000,
    fee_note: fee.note,
    message,
    message_bytes: bytes,
    message_hash: messageHash(message),
    hashscan: hashscanTopic(cfg.network, topicId),
  };
}

/**
 * Le cout reel, lu sur le mirror node. Le mirror a quelques secondes de retard :
 * on reessaie un nombre borne de fois, puis on rend `null` AVEC la raison.
 * Jamais un zero, qui laisserait croire que la publication est gratuite.
 */
export async function readChargedFee(
  cfg: HcsConfig,
  transactionId: string,
  opts: { fetchImpl?: typeof fetch; feeAttempts?: number; feeDelayMs?: number } = {},
): Promise<{ tinybar: number | null; note: string | null }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const attempts = opts.feeAttempts ?? 8;
  const delay = opts.feeDelayMs ?? 1500;
  const url = `${cfg.mirrorUrl}/api/v1/transactions/${mirrorTxId(transactionId)}`;
  let last = "aucune tentative";
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await doFetch(url, { headers: { accept: "application/json" } });
      if (res.status === 404) {
        last = "mirror_lag: transaction pas encore indexee";
      } else if (!res.ok) {
        last = `mirror_http_${res.status}`;
      } else {
        const body = (await res.json()) as { transactions?: Array<{ charged_tx_fee?: number }> };
        const fee = body.transactions?.[0]?.charged_tx_fee;
        if (typeof fee === "number") return { tinybar: fee, note: null };
        last = "reponse mirror sans charged_tx_fee";
      }
    } catch (e) {
      last = `mirror_error: ${(e as Error).message.slice(0, 120)}`;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delay));
  }
  return { tinybar: null, note: `cout non lu (${last}) — non verifie, pas zero` };
}

export interface MirrorMessage {
  sequence_number: number;
  consensus_timestamp: string;
  payer_account_id: string | null;
  message_utf8: string;
  message_hash: string;
  parsed: AnchorPayload | null;
}

export interface MirrorVerification {
  verified: boolean;
  reason: string | null;
  topic_id: string;
  sequence_number: number;
  mirror_url: string;
  message: MirrorMessage | null;
}

/**
 * Relit UN message precis sur le mirror node et compare son contenu octet a
 * octet avec ce qu'on croit avoir publie.
 *
 * Le point de l'endpoint /messages/{sequenceNumber} : il ne pagine pas. Une
 * lecture de la collection /messages, elle, est paginee, et conclure sur sa
 * premiere page serait exactement le faux resultat que ce projet a deja produit
 * cinq fois.
 */
export async function verifyOnMirror(
  cfg: HcsConfig,
  topicId: string,
  sequenceNumber: number,
  expectedMessage: string | null,
  opts: { fetchImpl?: typeof fetch; attempts?: number; delayMs?: number } = {},
): Promise<MirrorVerification> {
  const doFetch = opts.fetchImpl ?? fetch;
  const attempts = opts.attempts ?? 10;
  const delay = opts.delayMs ?? 1500;
  const url = `${cfg.mirrorUrl}/api/v1/topics/${topicId}/messages/${sequenceNumber}`;
  const base = { topic_id: topicId, sequence_number: sequenceNumber, mirror_url: url };
  let last = "aucune tentative";

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await doFetch(url, { headers: { accept: "application/json" } });
      if (res.status === 404) {
        last = "mirror_lag: message pas encore indexe";
      } else if (res.status === 429) {
        last = "mirror_rate_limited";
      } else if (!res.ok) {
        last = `mirror_http_${res.status}`;
      } else {
        const body = (await res.json()) as {
          sequence_number?: number;
          consensus_timestamp?: string;
          payer_account_id?: string;
          message?: string;
        };
        if (typeof body.message !== "string") {
          last = "reponse mirror sans champ message";
        } else {
          const utf8 = Buffer.from(body.message, "base64").toString("utf8");
          let parsed: AnchorPayload | null = null;
          try {
            const j = JSON.parse(utf8) as AnchorPayload;
            if (j && j.v === HCS_SCHEMA) parsed = j;
          } catch {
            parsed = null;
          }
          const msg: MirrorMessage = {
            sequence_number: body.sequence_number ?? sequenceNumber,
            consensus_timestamp: body.consensus_timestamp ?? "",
            payer_account_id: body.payer_account_id ?? null,
            message_utf8: utf8,
            message_hash: messageHash(utf8),
            parsed,
          };
          if (expectedMessage !== null && utf8 !== expectedMessage)
            return {
              ...base,
              verified: false,
              reason: "le mirror rend un contenu different de celui publie",
              message: msg,
            };
          return { ...base, verified: true, reason: null, message: msg };
        }
      }
    } catch (e) {
      last = `mirror_error: ${(e as Error).message.slice(0, 120)}`;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delay));
  }
  return { ...base, verified: false, reason: `NOT_VERIFIED: ${last}`, message: null };
}

/**
 * Toute la piste d'audit du topic. Suit `links.next` JUSQU'AU BOUT : une piste
 * d'audit qui s'arrete a la premiere page n'est pas une piste d'audit.
 */
export async function readTopic(
  cfg: HcsConfig,
  topicId: string,
  opts: { fetchImpl?: typeof fetch; maxPages?: number; limit?: number } = {},
): Promise<{
  complete: boolean;
  reason: string | null;
  pages: number;
  count: number;
  messages: MirrorMessage[];
}> {
  const doFetch = opts.fetchImpl ?? fetch;
  const maxPages = opts.maxPages ?? 20;
  const limit = opts.limit ?? 100;
  let next: string | null = `/api/v1/topics/${topicId}/messages?limit=${limit}&order=asc`;
  const messages: MirrorMessage[] = [];
  let pages = 0;

  while (next) {
    if (pages >= maxPages)
      return {
        complete: false,
        reason: `NOT_VERIFIED: plus de ${maxPages} pages, lecture bornee — la liste ci-dessous est incomplete`,
        pages,
        count: messages.length,
        messages,
      };
    let res: Response;
    try {
      res = await doFetch(cfg.mirrorUrl + next, { headers: { accept: "application/json" } });
    } catch (e) {
      return {
        complete: false,
        reason: `NOT_VERIFIED: mirror_error ${(e as Error).message.slice(0, 120)}`,
        pages,
        count: messages.length,
        messages,
      };
    }
    if (!res.ok)
      return {
        complete: false,
        reason: `NOT_VERIFIED: mirror_http_${res.status}`,
        pages,
        count: messages.length,
        messages,
      };
    const body = (await res.json()) as {
      messages?: Array<{
        sequence_number?: number;
        consensus_timestamp?: string;
        payer_account_id?: string;
        message?: string;
      }>;
      links?: { next?: string | null };
    };
    pages++;
    for (const m of body.messages ?? []) {
      if (typeof m.message !== "string") continue;
      const utf8 = Buffer.from(m.message, "base64").toString("utf8");
      let parsed: AnchorPayload | null = null;
      try {
        const j = JSON.parse(utf8) as AnchorPayload;
        if (j && j.v === HCS_SCHEMA) parsed = j;
      } catch {
        parsed = null;
      }
      messages.push({
        sequence_number: m.sequence_number ?? 0,
        consensus_timestamp: m.consensus_timestamp ?? "",
        payer_account_id: m.payer_account_id ?? null,
        message_utf8: utf8,
        message_hash: messageHash(utf8),
        parsed,
      });
    }
    next = body.links?.next ?? null;
  }
  return { complete: true, reason: null, pages, count: messages.length, messages };
}
