import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, "..", "..", "..");

export interface RealTx {
  chain_id: number;
  block_number: number;
  tx_hash: string;
  to: string;
  input: string;
  note: string;
}

export interface Fixtures {
  captured_at: string;
  universal_router: string;
  txs: RealTx[];
}

/** Le calldata REEL capture sur Base. Aucune ligne n'est synthetisee. */
export function realCalldata(): Fixtures {
  return JSON.parse(readFileSync(resolve(HERE, "fixtures/real-calldata.json"), "utf8")) as Fixtures;
}

export function txByHash(prefix: string): RealTx {
  const f = realCalldata();
  const hit = f.txs.find((t) => t.tx_hash.startsWith(prefix));
  if (!hit) throw new Error(`fixture absente: ${prefix}`);
  return hit;
}

export interface Row {
  hook: string;
  pool_id: string;
  currency0: string;
  currency1: string;
  key_fee: number;
  tick_spacing: number;
  zero_for_one: boolean;
  amount_in: string;
  bps: number | null;
  label: string;
  block_number: number;
}

/** Les 995 mesures reelles, telles que le moteur les a ecrites. */
export function measurements(): Row[] {
  return readFileSync(resolve(REPO, "docs/dataset/measurements.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Row);
}

/** Le pool au profil le plus marque du jeu : 689,95 bps a 1e14, 406,64 bps a 1e18. */
export const WORST_POOL = {
  hook: "0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc",
  poolId: "0xd996ff76787c7c520483fe0164699395cc89bfcb6fc4bdba2820771f127fa300",
  currency0: "0x2f3979f983ac689cfbbc0a1b3b4bd24a98dd2c5f",
  currency1: "0x4200000000000000000000000000000000000006",
  fee: 8388608,
  tickSpacing: 200,
  /** le jeu ne mesure ce pool que dans le sens 1->0 */
  zeroForOne: false,
};
