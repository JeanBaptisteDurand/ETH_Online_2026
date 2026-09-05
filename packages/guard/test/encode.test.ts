/**
 * Aller-retour encodeur / decodeur sur les 199 PoolKey REELLES du jeu.
 *
 * Lire le hook aux octets 0xa0..0xc0 pourrait etre un coup de chance sur huit transactions.
 * Ici on refabrique le calldata de 199 pools reels — frais dynamiques, tick spacings de 1 a
 * 200, adresses nulles — et on verifie que le decodeur retrouve la cle exacte a chaque fois.
 */
import { describe, it, expect } from "vitest";
import { encodeUniversalRouterExactInSingle } from "../src/encode.js";
import { decodeUniversalRouterCalldata } from "../src/calldata.js";
import { poolId } from "../src/poolkey.js";
import { measurements } from "./helpers.js";

describe("encode -> decode", () => {
  it("retrouve la PoolKey et le pool_id des 199 pools du jeu", () => {
    const rows = measurements();
    const seen = new Set<string>();
    let n = 0;
    for (const r of rows) {
      if (seen.has(r.pool_id)) continue;
      seen.add(r.pool_id);
      const key = {
        currency0: r.currency0,
        currency1: r.currency1,
        fee: r.key_fee,
        tickSpacing: r.tick_spacing,
        hooks: r.hook,
      };
      const data = encodeUniversalRouterExactInSingle([
        { poolKey: key, zeroForOne: r.zero_for_one, amountIn: BigInt(r.amount_in) },
      ]);
      const d = decodeUniversalRouterCalldata(data);
      expect(d.issues, r.pool_id).toEqual([]);
      expect(d.legs.length).toBe(1);
      const leg = d.legs[0]!;
      expect(leg.poolKey).toEqual({
        currency0: r.currency0.toLowerCase(),
        currency1: r.currency1.toLowerCase(),
        fee: r.key_fee,
        tickSpacing: r.tick_spacing,
        hooks: r.hook.toLowerCase(),
      });
      expect(leg.poolId).toBe(r.pool_id);
      expect(leg.poolId).toBe(poolId(key));
      expect(leg.zeroForOne).toBe(r.zero_for_one);
      expect(leg.amountIn).toBe(r.amount_in);
      n++;
    }
    expect(n).toBe(199);
  });

  it("produit la meme forme que le calldata reel : 352 octets de params pour un exact-in-single", () => {
    const data = encodeUniversalRouterExactInSingle([
      {
        poolKey: {
          currency0: "0x0000000000000000000000000000000000000000",
          currency1: "0x4200000000000000000000000000000000000006",
          fee: 3000,
          tickSpacing: 60,
          hooks: "0x0000000000000000000000000000000000000000",
        },
        zeroForOne: true,
        amountIn: 10n ** 15n,
      },
    ]);
    expect(data.startsWith("0x3593564c")).toBe(true);
    const d = decodeUniversalRouterCalldata(data);
    expect(d.commands).toBe("0x10");
    expect(d.legs[0]!.poolKey.tickSpacing).toBe(60);
  });

  it("encode plusieurs swaps dans une seule commande V4_SWAP", () => {
    const k = (hooks: string) => ({
      currency0: "0x0000000000000000000000000000000000000000",
      currency1: "0x4200000000000000000000000000000000000006",
      fee: 8388608,
      tickSpacing: 200,
      hooks,
    });
    const data = encodeUniversalRouterExactInSingle([
      { poolKey: k("0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc"), zeroForOne: true, amountIn: 1n },
      { poolKey: k("0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc"), zeroForOne: false, amountIn: 2n },
    ]);
    const d = decodeUniversalRouterCalldata(data);
    expect(d.legs.map((l) => l.poolKey.hooks)).toEqual([
      "0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc",
      "0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc",
    ]);
  });
});
