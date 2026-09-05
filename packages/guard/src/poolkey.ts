/**
 * PoolKey -> poolId, exactement comme engine/tare/poolid.py :
 *
 *     poolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
 *
 * Le test poolid.test.ts rejoue les 199 pools du jeu de mesures : si un seul octet de
 * l'encodage bougeait, la garde chercherait une cle absente et repondrait "pool inconnu"
 * sur un pool parfaitement mesure.
 */
import { keccak256, toHex } from "./keccak.js";
import type { PoolKey } from "./types.js";

const ADDR = /^0x[0-9a-fA-F]{40}$/;

function addrWord(a: string): Uint8Array {
  if (!ADDR.test(a)) throw new Error(`adresse invalide: ${a}`);
  const w = new Uint8Array(32);
  for (let i = 0; i < 20; i++) w[12 + i] = parseInt(a.slice(2 + i * 2, 4 + i * 2), 16);
  return w;
}

function intWord(v: number | bigint): Uint8Array {
  let x = BigInt(v);
  if (x < 0n) x += 1n << 256n; // complement a deux, comme abi.encode(int24)
  const w = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    w[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return w;
}

export function encodePoolKey(k: PoolKey): Uint8Array {
  const parts = [
    addrWord(k.currency0.toLowerCase()),
    addrWord(k.currency1.toLowerCase()),
    intWord(k.fee),
    intWord(k.tickSpacing),
    addrWord(k.hooks.toLowerCase()),
  ];
  const out = new Uint8Array(parts.length * 32);
  parts.forEach((p, i) => out.set(p, i * 32));
  return out;
}

export function poolId(k: PoolKey): string {
  return toHex(keccak256(encodePoolKey(k)));
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Uniswap trie les deux monnaies par valeur d'adresse ; le sens en decoule. */
export function sortCurrencies(a: string, b: string): { currency0: string; currency1: string } {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return BigInt(x) < BigInt(y) ? { currency0: x, currency1: y } : { currency0: y, currency1: x };
}
