#!/usr/bin/env tsx
/**
 * L'outil du journal HCS. Trois verbes, aucun effet cache.
 *
 *   tsx src/metering/cli.ts topic-create            cree le topic (une fois)
 *   tsx src/metering/cli.ts anchor [--dry]          publie une empreinte et la relit
 *   tsx src/metering/cli.ts read                    relit TOUT le topic (toutes les pages)
 *
 * L'import de ../config.js charge le .env de la racine. Aucun secret n'est
 * imprime : ni la cle, ni meme sa longueur.
 */
import "../config.js";
import { MeteringLedger } from "./ledger.js";
import { MeteringService, hederaAnchorPublisher } from "./service.js";
import { createTopic, hashscanTopic, hcsConfigFromEnv, readTopic } from "./hcs.js";

function need<T>(v: T | null, what: string): T {
  if (v === null) {
    console.error(`ERREUR: ${what}`);
    process.exit(2);
  }
  return v;
}

async function main(): Promise<void> {
  const verb = process.argv[2] ?? "help";
  const cfg = need(
    hcsConfigFromEnv(),
    "HEDERA_PAYER_ACCOUNT_ID / HEDERA_PAYER_PRIVATE_KEY absents du .env",
  );

  if (verb === "topic-create") {
    const memo =
      process.argv[3] ?? "TARE — journal d'audit des mesures facturees (hook Uniswap v4)";
    const res = await createTopic(cfg, memo);
    console.log(JSON.stringify(res, null, 2));
    console.log(`\nAjoute au .env :\nHEDERA_HCS_TOPIC_ID=${res.topic_id}`);
    return;
  }

  const topicId = need(cfg.topicId, "HEDERA_HCS_TOPIC_ID absent du .env — lance d'abord topic-create");

  if (verb === "read") {
    const all = await readTopic(cfg, topicId);
    console.log(
      JSON.stringify(
        {
          topic_id: topicId,
          hashscan: hashscanTopic(cfg.network, topicId),
          complete: all.complete,
          reason: all.reason,
          pages: all.pages,
          count: all.count,
          messages: all.messages,
        },
        null,
        2,
      ),
    );
    if (!all.complete) process.exitCode = 1;
    return;
  }

  if (verb === "anchor") {
    // Un lot REEL au format du registre : deux mesures, celles du hook le plus
    // marque du jeu publie (689,95 -> 406,64 bps, bloc 50614000, Base).
    const ledger = new MeteringLedger({ path: null });
    const service = new MeteringService({
      ledger,
      anchor: hederaAnchorPublisher(cfg, topicId),
      verifyOnPublish: true,
    });
    const receipt = service.recordBatch({
      route: "/measure",
      method: "POST",
      payer: process.env.HEDERA_PAYER_ACCOUNT_ID ?? null,
      network: "hedera:testnet",
      scheme: "exact",
      units_requested: 2,
      unit_price_usd: Number(process.env.TARE_UNIT_PRICE_USD ?? "0.001"),
      latency_ms: null,
      error: null,
      units: [
        {
          measurement_id: null,
          hook: "0x1aea38f0a2f1b0a1d0e1d94b0e2d1a0f0c0b0a88",
          pool_id: "0x" + "11".repeat(32),
          block_number: 50614000,
          amount_in: "1000000000000000",
          direction: "0->1",
          label: "MEASURED",
          bps: 689.95,
        },
        {
          measurement_id: null,
          hook: "0x1aea38f0a2f1b0a1d0e1d94b0e2d1a0f0c0b0a88",
          pool_id: "0x" + "11".repeat(32),
          block_number: 50614000,
          amount_in: "100000000000000000",
          direction: "0->1",
          label: "MEASURED",
          bps: 406.64,
        },
      ],
    });
    console.log("recu du lot:", JSON.stringify(receipt, null, 2));
    if (process.argv.includes("--dry")) {
      console.log("--dry : rien n'a ete publie sur Hedera.");
      return;
    }
    const out = await service.anchorBatch(receipt);
    console.log(JSON.stringify(out, null, 2));
    if (!out.ok) process.exitCode = 1;
    return;
  }

  if (verb === "usage") {
    // Le parcours complet, en vrai : une requete "5 tailles x 2 sens" -> dix
    // unites -> reglement raccroche -> empreinte ancree sur HCS -> GET /usage.
    const ledger = new MeteringLedger({ path: null });
    const service = new MeteringService({
      ledger,
      anchor: hederaAnchorPublisher(cfg, topicId),
      verifyOnPublish: true,
    });
    const sizes = ["1000000000000000", "10000000000000000", "100000000000000000", "1000000000000000000", "10000000000000000000"];
    const receipt = service.recordBatch({
      route: "/measure",
      method: "POST",
      payer: process.env.HEDERA_PAYER_ACCOUNT_ID ?? null,
      network: "hedera:testnet",
      scheme: "exact",
      units_requested: 10,
      unit_price_usd: Number(process.env.TARE_UNIT_PRICE_USD ?? "0.001"),
      latency_ms: null,
      error: null,
      units: sizes.flatMap((amount_in) =>
        (["0->1", "1->0"] as const).map((direction) => ({
          measurement_id: null,
          hook: "0x1aea38f0a2f1b0a1d0e1d94b0e2d1a0f0c0b0a88",
          pool_id: "0x" + "11".repeat(32),
          block_number: 50614000,
          amount_in,
          direction,
          label: "MEASURED" as const,
          bps: 406.64,
        })),
      ),
    });
    service.attachSettlement(receipt.batch_id, {
      success: true,
      transaction: process.argv[3] ?? "0.0.10367920@0.0",
    });
    const out = await service.anchorBatch(receipt);
    console.log("ancrage:", out.status, "seq", out.publish?.sequence_number ?? null);
    console.log(JSON.stringify(service.usage(), null, 2));
    if (!out.ok) process.exitCode = 1;
    return;
  }

  console.log(
    "verbes: topic-create [memo] | anchor [--dry] | usage [tx-de-reglement] | read\ntopic courant: " + (cfg.topicId ?? "(aucun)"),
  );
}

main().catch((e) => {
  console.error("ECHEC:", (e as Error).message);
  process.exit(1);
});
