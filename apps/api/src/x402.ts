/**
 * Le peage x402 sur POST /measure.
 *
 * Paquets : @x402/hono et @x402/hedera 2.23.0 (verifie : ils existent sur npm et
 * s'installent). Reseau hedera:testnet, facilitateur https://api.testnet.blocky402.com,
 * dont /supported annonce bien { scheme: "exact", network: "hedera:testnet",
 * extra: { feePayer: "0.0.7162784" } } — verifie le 05/09.
 *
 * Le prix n'est PAS fixe : c'est une fonction du plan. Une requete qui demande cinq
 * mesures paie cinq fois le prix unitaire. C'est le "compute metering rather than a
 * flat per-request charge" ; sans prix dynamique, ce serait un slogan.
 */
import { paymentMiddleware } from "@x402/hono";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import {
  HTTPFacilitatorClient,
  x402ResourceServer,
  type FacilitatorClient,
  type RoutesConfig,
} from "@x402/core/server";
import type { Network } from "@x402/core/types";
import type { MiddlewareHandler } from "hono";
import type { Config } from "./config.js";
import { normalizeNetwork } from "./config.js";
import { buildPlan } from "./plan.js";
import type { UsageMeter } from "./usage.js";

/** Prix en USD, en notation decimale (jamais scientifique : parseMoney la refuse). */
export function priceFor(units: number, unitPriceUsd: number): string {
  const micro = Math.round(units * unitPriceUsd * 1_000_000);
  return "$" + (micro / 1_000_000).toFixed(6);
}

export interface PaymentLayer {
  middleware: MiddlewareHandler;
  network: string;
  facilitatorUrl: string;
  describe(): Record<string, unknown>;
}

export function createPaymentLayer(
  cfg: Config,
  // Le compteur a la mesure vit dans ./metering ; la couche de paiement n'a besoin que de
  // savoir raccrocher un hash de reglement, pas du compteur entier.
  opts: {
    facilitator?: FacilitatorClient;
    onSettled?: (payer: string | null, s: { success: boolean; transaction: string | null }) => void;
  } = {},
): PaymentLayer {
  const network = normalizeNetwork(cfg.x402Network) as Network;
  const facilitator =
    opts.facilitator ?? new HTTPFacilitatorClient({ url: cfg.facilitatorUrl, timeoutMs: 20000 });

  const server = new x402ResourceServer(facilitator).register(network, new ExactHederaScheme());

  if (opts.onSettled) {
    const onSettled = opts.onSettled;
    server.onAfterSettle(async (ctx) => {
      onSettled(ctx.result.payer ?? null, {
        success: ctx.result.success,
        transaction: ctx.result.transaction ?? null,
      });
    });
  }

  const routes: RoutesConfig = {
    "POST /measure": {
      description:
        "Une mesure TARE = une paire de cotations du meme swap, avec le hook puis avec le stub inerte. Facture a la mesure, pas a la requete.",
      mimeType: "application/json",
      serviceName: "TARE",
      accepts: [
        {
          scheme: "exact",
          network,
          payTo: cfg.payTo,
          // prix dynamique : lu sur le corps de la requete, avant tout paiement
          price: async (context) => {
            let body: Record<string, unknown> = {};
            try {
              body = ((await context.adapter.getBody?.()) ?? {}) as Record<string, unknown>;
            } catch {
              body = {};
            }
            const plan = buildPlan(body, {
              defaultBlock: cfg.forkBlock,
              maxUnits: cfg.maxUnitsPerRequest,
            });
            const units = plan.ok ? plan.units : 1;
            return priceFor(units, cfg.unitPriceUsd);
          },
        },
      ],
      unpaidResponseBody: async (context) => {
        let body: Record<string, unknown> = {};
        try {
          body = ((await context.adapter.getBody?.()) ?? {}) as Record<string, unknown>;
        } catch {
          body = {};
        }
        const plan = buildPlan(body, {
          defaultBlock: cfg.forkBlock,
          maxUnits: cfg.maxUnitsPerRequest,
        });
        return {
          contentType: "application/json",
          body: {
            error: "payment required",
            billing: {
              unit: "measurement",
              model: "per-measurement",
              unit_price_usd: cfg.unitPriceUsd,
              units_for_this_request: plan.ok ? plan.units : null,
              total_usd: plan.ok
                ? Number((plan.units * cfg.unitPriceUsd).toFixed(6))
                : null,
              note: "Une mesure = un couple de cotations (avec hook / avec stub). Cinq tailles = cinq unites.",
            },
            plan: plan.ok
              ? { units: plan.units, block: plan.block, resolution: plan.resolution }
              : { error: plan.error },
          },
        };
      },
    },
  };

  // La synchro avec le facilitateur (GET /supported) est PARESSEUSE dans @x402/hono :
  // elle a lieu a la premiere requete protegee, pas au demarrage. Le serveur peut donc
  // demarrer sans reseau ; c'est /measure, et lui seul, qui exige le facilitateur.
  const middleware = paymentMiddleware(routes, server, undefined, undefined, true);

  return {
    middleware,
    network,
    facilitatorUrl: cfg.facilitatorUrl,
    describe() {
      return {
        enabled: true,
        library: "@x402/hono 2.23.0 + @x402/hedera 2.23.0",
        network,
        facilitator: cfg.facilitatorUrl,
        pay_to: cfg.payTo,
        fee_payer_announced_by_facilitator: cfg.hederaFeePayer,
        scheme: "exact",
        unit: "measurement",
        unit_price_usd: cfg.unitPriceUsd,
        max_units_per_request: cfg.maxUnitsPerRequest,
        pricing: "dynamique : prix = unites x prix unitaire",
      };
    },
  };
}

/** Le payeur, quand l'en-tete X-PAYMENT le laisse voir. Best effort, jamais devine. */
export function payerFromHeader(header: string | undefined): {
  payer: string | null;
  network: string | null;
  scheme: string | null;
} {
  if (!header) return { payer: null, network: null, scheme: null };
  try {
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    const payload = (decoded?.payload ?? {}) as Record<string, unknown>;
    const payer =
      (typeof payload.payer === "string" && payload.payer) ||
      (typeof payload.from === "string" && payload.from) ||
      (typeof decoded?.payer === "string" && decoded.payer) ||
      null;
    return {
      payer,
      network: typeof decoded?.network === "string" ? decoded.network : null,
      scheme: typeof decoded?.scheme === "string" ? decoded.scheme : null,
    };
  } catch {
    return { payer: null, network: null, scheme: null };
  }
}
