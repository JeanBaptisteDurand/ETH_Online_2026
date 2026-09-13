/**
 * LOT G — the per-measurement meter and the HCS log.
 *
 * Three things, and nothing else:
 *
 *   1. We count MEASUREMENTS, not requests. A "5 sizes x 2 directions" request
 *      writes ten rows to the ledger and costs ten units. This is the Hedera
 *      point "pay-per-call inference, data, or compute metering rather than a
 *      flat per-request charge", and only the ledger can prove it.
 *   2. The write routes are HMAC-signed (ported from an earlier metering
 *      service of ours).
 *   3. Each batch publishes its digest on a Hedera testnet HCS topic, and the
 *      digest is declared anchored only if the mirror node returns it, byte for
 *      byte.
 *
 * WIRING in apps/api/src/app.ts — two lines:
 *
 *   import { createMetering } from "./metering/index.js";
 *   const metering = createMetering({ unitPriceUsd: cfg.unitPriceUsd });
 *   app.route("/", metering.router);
 *
 * then, in the POST /measure handler, after `measurements`:
 *
 *   const receipt = metering.service.recordBatch({
 *     route: "/measure", method: "POST", payer: who.payer, network: who.network,
 *     scheme: who.scheme, units_requested: plan.units, unit_price_usd: cfg.unitPriceUsd,
 *     latency_ms: Date.now() - t0, error: null,
 *     units: measurements.map(toMeasurementUnit),
 *   });
 *   void metering.service.anchorBatch(receipt);   // HCS anchoring does not block the response
 *
 * `createMetering` deliberately has no network side effect at startup: without
 * HEDERA_HCS_TOPIC_ID there is no anchor publisher, and /usage SAYS so instead
 * of pretending to anchor.
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
  /** path of the JSONL ledger. "" or null => in memory only. */
  ledgerPath?: string | null;
  billableLabels?: readonly Label[];
  hmacSecret?: string | null;
  /** injectable in tests: avoids any call to Hedera */
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

/** Adapter: a Measurement from src/measurement.ts -> a billable unit. */
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
