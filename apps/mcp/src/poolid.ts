/**
 * PoolKey -> poolId, in TypeScript, so the server can join `pools-liquides.json` (which stores
 * keys) to `measurements-v1.json` (which stores ids).
 *
 *   poolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
 *
 * This is a port of `engine/tare/poolid.py`, not a second opinion: getting it wrong returns a
 * plausible mismatch rather than an error, so test/poolid.test.ts pins it to the 32 pool ids the
 * Python engine actually wrote into the dataset. If the two ever disagree, the tests fail.
 */
import sha3 from "js-sha3";

const { keccak256 } = sha3;

function word(x: bigint): string {
  const v = x < 0n ? (1n << 256n) + x : x;
  return v.toString(16).padStart(64, "0");
}

function addr(a: string): string {
  const hex = a.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{1,40}$/.test(hex)) throw new Error(`not an address: ${a}`);
  return hex.padStart(64, "0");
}

export interface KeyLike {
  currency0: string;
  currency1: string;
  fee: number;
  tick_spacing: number;
  hook: string;
}

export function poolId(k: KeyLike): string {
  const encoded =
    addr(k.currency0) + addr(k.currency1) + word(BigInt(k.fee)) + word(BigInt(k.tick_spacing)) + addr(k.hook);
  return "0x" + keccak256(Buffer.from(encoded, "hex"));
}
