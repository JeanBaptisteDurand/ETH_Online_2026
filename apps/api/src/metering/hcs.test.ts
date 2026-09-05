/**
 * Le journal HCS, sans toucher a Hedera : `fetch` est injecte.
 *
 * Ces tests portent tous sur la regle dure n.3. Le projet a deja produit cinq
 * faux resultats en concluant sur une reponse tronquee ; ici on verifie qu'un
 * 404, un 429, une erreur reseau et une pagination interrompue rendent
 * NOT_VERIFIED — et que le cout non lu vaut `null`, jamais zero.
 */
import { describe, it, expect } from "vitest";
import {
  HCS_SCHEMA,
  anchorPayload,
  hashscanTopic,
  hashscanTransaction,
  hcsConfigFromEnv,
  messageHash,
  mirrorTxId,
  readChargedFee,
  readTopic,
  verifyOnMirror,
  type AnchorPayload,
  type HcsConfig,
} from "./hcs.js";

const CFG: HcsConfig = {
  operatorId: "0.0.10367920",
  operatorKey: "0x00",
  keyType: "ECDSA",
  network: "testnet",
  topicId: "0.0.10371106",
  mirrorUrl: "https://testnet.mirrornode.hedera.com",
};

const PAYLOAD: AnchorPayload = {
  v: HCS_SCHEMA,
  batch: "b_test",
  ts: "2026-09-05T00:00:00.000Z",
  digest: "sha256:" + "ab".repeat(32),
  units: 10,
  unit_price_usd: 0.001,
  amount_usd: 0.01,
  payer: "0.0.10367920",
  settlement: "0.0.10367920@1788569227.263707186",
  block: 50614000,
};

/** Un `fetch` scripte : une reponse par appel, dans l'ordre. */
function scriptedFetch(steps: Array<{ status: number; body?: unknown } | Error>) {
  let i = 0;
  const calls: string[] = [];
  const impl = (async (url: string | URL) => {
    calls.push(String(url));
    const step = steps[Math.min(i, steps.length - 1)];
    i++;
    if (step instanceof Error) throw step;
    return {
      ok: step!.status >= 200 && step!.status < 300,
      status: step!.status,
      json: async () => step!.body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls, count: () => i };
}

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

describe("l'identite du message", () => {
  it("le payload tient sous les 1024 octets d'un message HCS non chunke", () => {
    const msg = anchorPayload(PAYLOAD);
    expect(Buffer.byteLength(msg, "utf8")).toBeLessThan(1024);
    expect(messageHash(msg)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.parse(msg).v).toBe(HCS_SCHEMA);
  });

  it("les liens HashScan et l'id mirror sont formes comme Hedera les attend", () => {
    expect(hashscanTopic("testnet", "0.0.10371106")).toBe(
      "https://hashscan.io/testnet/topic/0.0.10371106",
    );
    expect(mirrorTxId("0.0.10367920@1788569227.263707186")).toBe(
      "0.0.10367920-1788569227-263707186",
    );
    expect(hashscanTransaction("testnet", "0.0.10367920@1788569227.263707186")).toBe(
      "https://hashscan.io/testnet/transaction/0.0.10367920-1788569227-263707186",
    );
  });

  it("hcsConfigFromEnv rend null sans operateur, et ne devine pas le reseau", () => {
    expect(hcsConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    const cfg = hcsConfigFromEnv({
      HEDERA_PAYER_ACCOUNT_ID: "0.0.1",
      HEDERA_PAYER_PRIVATE_KEY: "0xdead",
      HEDERA_NETWORK: "hedera:testnet",
    } as NodeJS.ProcessEnv)!;
    expect(cfg.network).toBe("testnet");
    expect(cfg.topicId).toBeNull(); // pas de topic => pas d'ancrage, et on le dira
    expect(cfg.mirrorUrl).toBe("https://testnet.mirrornode.hedera.com");
  });
});

describe("verifyOnMirror — une reponse tronquee n'est jamais une preuve", () => {
  it("reessaie sur un 404 (retard du mirror) puis verifie le contenu octet pour octet", async () => {
    const msg = anchorPayload(PAYLOAD);
    const f = scriptedFetch([
      { status: 404 },
      {
        status: 200,
        body: {
          sequence_number: 7,
          consensus_timestamp: "1788569234.806167390",
          payer_account_id: "0.0.10367920",
          message: b64(msg),
        },
      },
    ]);
    const v = await verifyOnMirror(CFG, "0.0.10371106", 7, msg, {
      fetchImpl: f.impl,
      attempts: 4,
      delayMs: 1,
    });
    expect(v.verified).toBe(true);
    expect(v.message!.consensus_timestamp).toBe("1788569234.806167390");
    expect(v.message!.parsed!.units).toBe(10);
    expect(v.message!.message_hash).toBe(messageHash(msg));
    expect(f.calls[0]).toBe(
      "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10371106/messages/7",
    );
  });

  it("un rate-limit qui dure rend NOT_VERIFIED avec la raison, pas un succes", async () => {
    const f = scriptedFetch([{ status: 429 }]);
    const v = await verifyOnMirror(CFG, "0.0.10371106", 7, null, {
      fetchImpl: f.impl,
      attempts: 3,
      delayMs: 1,
    });
    expect(v.verified).toBe(false);
    expect(v.reason).toContain("mirror_rate_limited");
    expect(v.message).toBeNull();
    expect(f.count()).toBe(3);
  });

  it("une erreur reseau rend NOT_VERIFIED, jamais 'publie quand meme'", async () => {
    const f = scriptedFetch([new Error("ECONNRESET")]);
    const v = await verifyOnMirror(CFG, "0.0.10371106", 7, null, {
      fetchImpl: f.impl,
      attempts: 2,
      delayMs: 1,
    });
    expect(v.verified).toBe(false);
    expect(v.reason).toContain("ECONNRESET");
  });

  it("refuse un contenu qui differe de ce qui a ete publie", async () => {
    const f = scriptedFetch([{ status: 200, body: { sequence_number: 7, message: b64("{}") } }]);
    const v = await verifyOnMirror(CFG, "0.0.10371106", 7, anchorPayload(PAYLOAD), {
      fetchImpl: f.impl,
      attempts: 1,
      delayMs: 1,
    });
    expect(v.verified).toBe(false);
    expect(v.reason).toContain("different");
    expect(v.message!.parsed).toBeNull();
  });
});

describe("readTopic — la piste d'audit va jusqu'au bout ou se declare incomplete", () => {
  it("suit links.next sur plusieurs pages", async () => {
    const f = scriptedFetch([
      {
        status: 200,
        body: {
          messages: [{ sequence_number: 1, consensus_timestamp: "1.0", message: b64("{}") }],
          links: { next: "/api/v1/topics/0.0.10371106/messages?limit=1&order=asc&page=2" },
        },
      },
      {
        status: 200,
        body: {
          messages: [
            {
              sequence_number: 2,
              consensus_timestamp: "2.0",
              message: b64(anchorPayload(PAYLOAD)),
            },
          ],
          links: { next: null },
        },
      },
    ]);
    const out = await readTopic(CFG, "0.0.10371106", { fetchImpl: f.impl, limit: 1 });
    expect(out.complete).toBe(true);
    expect(out.pages).toBe(2);
    expect(out.count).toBe(2);
    expect(out.messages[1]!.parsed!.batch).toBe("b_test");
  });

  it("une pagination sans fin s'arrete et se declare INCOMPLETE", async () => {
    const f = scriptedFetch([
      {
        status: 200,
        body: {
          messages: [{ sequence_number: 1, message: b64("{}") }],
          links: { next: "/api/v1/topics/x/messages?page=next" },
        },
      },
    ]);
    const out = await readTopic(CFG, "0.0.10371106", { fetchImpl: f.impl, maxPages: 3 });
    expect(out.complete).toBe(false);
    expect(out.reason).toContain("NOT_VERIFIED");
    expect(out.pages).toBe(3);
  });

  it("un 500 du mirror rend une lecture incomplete, pas une liste vide credible", async () => {
    const f = scriptedFetch([{ status: 500 }]);
    const out = await readTopic(CFG, "0.0.10371106", { fetchImpl: f.impl });
    expect(out.complete).toBe(false);
    expect(out.reason).toBe("NOT_VERIFIED: mirror_http_500");
    expect(out.messages).toEqual([]);
  });
});

describe("le cout d'un message", () => {
  it("est lu sur le mirror node, en tinybars", async () => {
    const f = scriptedFetch([
      { status: 404 },
      { status: 200, body: { transactions: [{ charged_tx_fee: 377528 }] } },
    ]);
    const fee = await readChargedFee(CFG, "0.0.10367920@1788569227.263707186", {
      fetchImpl: f.impl,
      feeAttempts: 3,
      feeDelayMs: 1,
    });
    expect(fee.tinybar).toBe(377528);
    expect(fee.note).toBeNull();
  });

  it("non lu, il vaut null AVEC la raison — jamais zero, qui dirait 'gratuit'", async () => {
    const f = scriptedFetch([{ status: 404 }]);
    const fee = await readChargedFee(CFG, "0.0.1@1.2", {
      fetchImpl: f.impl,
      feeAttempts: 2,
      feeDelayMs: 1,
    });
    expect(fee.tinybar).toBeNull();
    expect(fee.tinybar).not.toBe(0);
    expect(fee.note).toContain("non verifie, pas zero");
  });
});
