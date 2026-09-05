/**
 * LOT G — le compteur a la mesure et le journal HCS.
 *
 * Trois choses, et rien d'autre :
 *
 *   1. On compte des MESURES, pas des requetes. Une requete "5 tailles x 2 sens"
 *      ecrit dix lignes au registre et coute dix unites. C'est le point Hedera
 *      "pay-per-call inference, data, or compute metering rather than a flat
 *      per-request charge", et il ne se prouve que par le registre.
 *   2. Les routes d'ecriture sont signees en HMAC (porte de CorLens v2).
 *   3. Chaque lot publie son empreinte sur un topic HCS Hedera testnet, et
 *      l'empreinte n'est declaree ancree que si le mirror node la rend, octet
 *      pour octet.
 *
 * MONTAGE dans apps/api/src/app.ts — deux lignes :
 *
 *   import { createMetering } from "./metering/index.js";
 *   const metering = createMetering({ unitPriceUsd: cfg.unitPriceUsd });
 *   app.route("/", metering.router);
 *
 * puis, dans le handler POST /measure, apres `measurements` :
 *
 *   const receipt = metering.service.recordBatch({
 *     route: "/measure", method: "POST", payer: who.payer, network: who.network,
 *     scheme: who.scheme, units_requested: plan.units, unit_price_usd: cfg.unitPriceUsd,
 *     latency_ms: Date.now() - t0, error: null,
 *     units: measurements.map(toMeasurementUnit),
 *   });
 *   void metering.service.anchorBatch(receipt);   // l'ancrage HCS ne bloque pas la reponse
 *
 * `createMetering` est volontairement sans effet de bord reseau au demarrage :
 * sans HEDERA_HCS_TOPIC_ID, il n'y a pas d'ancreur, et /usage le DIT au lieu de
 * pretendre ancrer.
 */
import { MeteringLedger, type MeasurementUnit } from "./ledger.js";
import { MeteringService, hederaAnchorPublisher, type AnchorPublisher } from "./service.js";
import { meteringRouter, mountMetering, type MeteringRouterOptions } from "./router.js";
import { hcsConfigFromEnv, type HcsConfig } from "./hcs.js";
import type { Label } from "../labels.js";

export * from "./hmac.js";
export * from "./ledger.js";
export * from "./hcs.js";
export * from "./service.js";
export * from "./router.js";

export interface CreateMeteringOptions {
  unitPriceUsd?: number;
  /** chemin du registre JSONL. "" ou null => en memoire seulement. */
  ledgerPath?: string | null;
  billableLabels?: readonly Label[];
  hmacSecret?: string | null;
  /** injectable en test : evite tout appel a Hedera */
  anchor?: AnchorPublisher | null;
  env?: NodeJS.ProcessEnv;
  verifyOnPublish?: boolean;
}

export interface Metering {
  service: MeteringService;
  ledger: MeteringLedger;
  router: ReturnType<typeof meteringRouter>;
  hcsConfig: HcsConfig | null;
  unitPriceUsd: number;
}

export function createMetering(opts: CreateMeteringOptions = {}): Metering {
  const env = opts.env ?? process.env;
  const unitPriceUsd = opts.unitPriceUsd ?? Number(env.TARE_UNIT_PRICE_USD ?? "0.001");
  const ledger = new MeteringLedger({
    path: opts.ledgerPath === undefined ? (env.TARE_METERING_LOG ?? null) : opts.ledgerPath,
    billableLabels: opts.billableLabels,
  });

  const hcsConfig = hcsConfigFromEnv(env);
  let anchor: AnchorPublisher | null = opts.anchor ?? null;
  if (anchor === null && opts.anchor === undefined && hcsConfig?.topicId)
    anchor = hederaAnchorPublisher(hcsConfig, hcsConfig.topicId);

  const service = new MeteringService({
    ledger,
    anchor,
    verifyOnPublish: opts.verifyOnPublish ?? true,
  });
  const routerOpts: MeteringRouterOptions = {
    hmacSecret: opts.hmacSecret ?? env.TARE_HMAC_SECRET ?? null,
    hcs: hcsConfig,
  };
  return { service, ledger, router: meteringRouter(service, routerOpts), hcsConfig, unitPriceUsd };
}

/** Adaptateur : une Measurement de src/measurement.ts -> une unite facturable. */
export function toMeasurementUnit(m: {
  id?: string;
  hook: string;
  pool_id: string;
  block_number: number;
  amount_in: string;
  direction: "0->1" | "1->0";
  label: Label;
  bps: number | null;
}): MeasurementUnit {
  return {
    measurement_id: m.id ?? null,
    hook: m.hook,
    pool_id: m.pool_id,
    block_number: m.block_number,
    amount_in: m.amount_in,
    direction: m.direction,
    label: m.label,
    bps: m.bps,
  };
}

export { mountMetering };
