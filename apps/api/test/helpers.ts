import type { FacilitatorClient } from "@x402/core/server";
import type { EngineHealth } from "../src/engine.js";
import type { RawMeasurement } from "../src/measurement.js";

/**
 * Facilitateur factice. Il rend EXACTEMENT ce que
 * https://api.testnet.blocky402.com/supported renvoyait le 05/09/2026 pour Hedera —
 * la reponse est recopiee, pas inventee, sinon le test ne prouverait rien du vrai
 * protocole.
 */
export function fakeFacilitator(): FacilitatorClient {
  return {
    async getSupported() {
      return {
        kinds: [
          {
            x402Version: 2,
            scheme: "exact",
            network: "hedera:testnet",
            extra: { feePayer: "0.0.7162784" },
          },
        ],
        extensions: [],
      };
    },
    async verify() {
      return { isValid: true, payer: "0.0.999999" };
    },
    async settle() {
      return {
        success: true,
        transaction: "0.0.999999@1700000000.000000000",
        network: "hedera:testnet" as never,
        payer: "0.0.999999",
      };
    },
  } as unknown as FacilitatorClient;
}

export const HEALTH_OK: EngineHealth = {
  rpc: "http://127.0.0.1:8545",
  reachable: true,
  chain_id: 8453,
  block_number: 50614000,
  is_anvil: true,
  fork: { block_number: 50614000 },
  stub_bytes: 89,
  stub_hash: "0x8e39b2ad4344342b4f7dc5cf31df0aec9bd5b5f8ec7fccd241256cf1fda637a4",
  error: null,
};

/** Moteur factice : rend une mesure par plan, sans toucher a un fork. */
export function fakeEngine(bps: number | null = 42.5) {
  const calls: unknown[][] = [];
  return {
    calls,
    health: async () => HEALTH_OK,
    run: async (_py: string, _rpc: string, block: number, plans: any[]) => {
      calls.push(plans);
      return plans.map(
        (p): RawMeasurement => ({
          hook: p.hooks,
          pool_id: "0x" + "ab".repeat(32),
          chain_id: 8453,
          block_number: block,
          currency0: p.currency0,
          currency1: p.currency1,
          key_fee: p.fee,
          tick_spacing: p.tick_spacing,
          fee_is_dynamic: false,
          stored_lp_fee: 0,
          stored_protocol_fee: 0,
          zero_for_one: p.zero_for_one,
          amount_in: p.amount_in,
          out_with: bps === null ? null : "100",
          out_without: bps === null ? null : "200",
          bps,
          label: bps === null ? "NOT_QUOTABLE" : "MEASURED",
          reason: bps === null ? "NOT_ENOUGH_LIQUIDITY" : null,
          stub_hash: HEALTH_OK.stub_hash,
          engine_ver: "tare-engine/0.3.0",
          observed_at: "2026-09-05T00:00:00Z",
        }),
      );
    },
  };
}
