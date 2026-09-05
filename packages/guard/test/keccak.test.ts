/**
 * keccak256 maison : si cette fonction derape, la garde cherche la table avec une mauvaise
 * cle et repond "pool inconnu" sur un pool parfaitement mesure.
 */
import { describe, it, expect } from "vitest";
import { keccak256, toHex, utf8 } from "../src/keccak.js";
import { poolId, encodePoolKey } from "../src/poolkey.js";
import { measurements } from "./helpers.js";

describe("keccak256", () => {
  it("reproduit les vecteurs publics", () => {
    expect(toHex(keccak256(utf8("")))).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
    expect(toHex(keccak256(utf8("abc")))).toBe(
      "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    );
    expect(toHex(keccak256(utf8("The quick brown fox jumps over the lazy dog")))).toBe(
      "0x4d741b6f1eb29cb2a9b9911c82f56fa8d73b04959d3d9d222895df6c0b28aa15",
    );
  });

  it("passe la frontiere du bloc de 136 octets", () => {
    // 135, 136 et 137 octets : le remplissage change de forme a chaque fois
    const a = new Uint8Array(135).fill(0x61);
    const b = new Uint8Array(136).fill(0x61);
    const c = new Uint8Array(137).fill(0x61);
    for (const x of [a, b, c]) expect(toHex(keccak256(x))).toMatch(/^0x[0-9a-f]{64}$/);
    expect(toHex(keccak256(b))).not.toBe(toHex(keccak256(a)));
    expect(toHex(keccak256(c))).not.toBe(toHex(keccak256(b)));
  });
});

describe("poolId", () => {
  it("rederive les 199 pool_id du jeu de mesures, sans exception", () => {
    const rows = measurements();
    const seen = new Set<string>();
    let checked = 0;
    for (const r of rows) {
      if (seen.has(r.pool_id)) continue;
      seen.add(r.pool_id);
      const id = poolId({
        currency0: r.currency0,
        currency1: r.currency1,
        fee: r.key_fee,
        tickSpacing: r.tick_spacing,
        hooks: r.hook,
      });
      expect(id, `pool ${r.pool_id}`).toBe(r.pool_id);
      checked++;
    }
    expect(checked).toBe(199);
  });

  it("encode la PoolKey sur exactement 5 mots de 32 octets", () => {
    const enc = encodePoolKey({
      currency0: "0x2f3979f983ac689cfbbc0a1b3b4bd24a98dd2c5f",
      currency1: "0x4200000000000000000000000000000000000006",
      fee: 8388608,
      tickSpacing: 200,
      hooks: "0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc",
    });
    expect(enc.length).toBe(160);
    // tickSpacing negatif : complement a deux sur 256 bits, comme abi.encode(int24)
    const neg = encodePoolKey({
      currency0: "0x0000000000000000000000000000000000000000",
      currency1: "0x0000000000000000000000000000000000000001",
      fee: 3000,
      tickSpacing: -1,
      hooks: "0x0000000000000000000000000000000000000000",
    });
    expect(toHex(neg.subarray(96, 128))).toBe("0x" + "f".repeat(64));
  });
});
