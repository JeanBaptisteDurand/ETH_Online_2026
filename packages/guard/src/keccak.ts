/**
 * keccak256, en TypeScript pur, sans aucune dependance.
 *
 * Pourquoi le reecrire : la garde tourne dans une extension de navigateur ou aucun CDN n'est
 * joignable et ou l'on ne veut pas embarquer ethers pour une seule fonction. Il en faut une, et
 * une seule : poolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks)),
 * la meme derivation que engine/tare/poolid.py.
 *
 * Implementation Keccak-f[1600] sur des lignes BigInt de 64 bits : quelques hachages par
 * transaction, la lisibilite prime sur la vitesse. Verifie dans test/keccak.test.ts contre les
 * vecteurs publics ET contre 199 pool_id reels du jeu de mesures — si la derivation derapait,
 * la garde consulterait la table avec une mauvaise cle et repondrait "hook inconnu" sur un pool
 * parfaitement mesure. C'est exactement le genre de faux resultat que ce projet a deja produit.
 */

const MASK64 = (1n << 64n) - 1n;

const RC: readonly bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

/** decalages rho, indexes en x + 5y comme l'etat lui-meme */
const ROT: readonly number[] = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

function rotl(x: bigint, n: number): bigint {
  if (n === 0) return x;
  const b = BigInt(n);
  return ((x << b) | (x >> (64n - b))) & MASK64;
}

function keccakF(a: bigint[]): void {
  const B = new Array<bigint>(25).fill(0n);
  const C = new Array<bigint>(5).fill(0n);
  const D = new Array<bigint>(5).fill(0n);

  for (let round = 0; round < 24; round++) {
    // theta
    for (let x = 0; x < 5; x++) {
      C[x] = a[x]! ^ a[x + 5]! ^ a[x + 10]! ^ a[x + 15]! ^ a[x + 20]!;
    }
    for (let x = 0; x < 5; x++) {
      D[x] = C[(x + 4) % 5]! ^ rotl(C[(x + 1) % 5]!, 1);
    }
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) a[x + 5 * y] = a[x + 5 * y]! ^ D[x]!;
    }
    // rho + pi
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(a[x + 5 * y]!, ROT[x + 5 * y]!);
      }
    }
    // chi
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        a[x + 5 * y] = B[x + 5 * y]! ^ (~B[((x + 1) % 5) + 5 * y]! & B[((x + 2) % 5) + 5 * y]! & MASK64);
      }
    }
    // iota
    a[0] = a[0]! ^ RC[round]!;
  }
}

/** keccak256 (padding Keccak d'origine 0x01/0x80, pas celui de SHA3-256) */
export function keccak256(input: Uint8Array): Uint8Array {
  const RATE = 136; // 1088 bits
  const padLen = RATE - (input.length % RATE);
  const buf = new Uint8Array(input.length + padLen);
  buf.set(input, 0);
  buf[input.length] = 0x01;
  buf[buf.length - 1] = (buf[buf.length - 1]! | 0x80) & 0xff;

  const state = new Array<bigint>(25).fill(0n);
  for (let off = 0; off < buf.length; off += RATE) {
    for (let i = 0; i < RATE / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(buf[off + i * 8 + b]!);
      state[i] = state[i]! ^ lane;
    }
    keccakF(state);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = state[i]!;
    for (let b = 0; b < 8; b++) {
      out[i * 8 + b] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let s = "0x";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
