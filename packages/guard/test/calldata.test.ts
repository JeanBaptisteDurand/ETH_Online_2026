/**
 * Le decodage, sur du calldata REEL de Base mainnet.
 *
 * Les huit transactions de test/fixtures/real-calldata.json ont ete lues sur la chaine le
 * 2026-09-05 (eth_getBlockByNumber, chain 8453). Chacune se rejoue :
 *   cast tx <hash> --rpc-url <base>
 * Aucune n'est fabriquee. C'est ce qui fait la difference entre "le decodeur marche sur mes
 * propres octets" et "le decodeur marche".
 */
import { describe, it, expect } from "vitest";
import { decodeUniversalRouterCalldata } from "../src/calldata.js";
import { realCalldata, txByHash } from "./helpers.js";

describe("decodage du calldata Universal Router (transactions reelles Base)", () => {
  it("lit les 8 transactions reelles de bout en bout, sans une seule issue", () => {
    const f = realCalldata();
    expect(f.txs.length).toBe(8);
    for (const tx of f.txs) {
      const r = decodeUniversalRouterCalldata(tx.input);
      expect(r.router, tx.tx_hash).toBe("universal-router");
      expect(r.issues, `${tx.tx_hash} ${tx.note}`).toEqual([]);
      expect(r.complete, tx.tx_hash).toBe(true);
      expect(r.legs.length, `${tx.tx_hash} n'a produit aucun saut`).toBeGreaterThan(0);
    }
  });

  it("sort le hook aux octets 0xa0..0xc0 : 0x0469a4bd sur un SWAP_EXACT_IN_SINGLE reel", () => {
    // https://basescan.org/tx/0x226ac6c7... bloc 50889309
    const tx = txByHash("0x226ac6c7");
    const r = decodeUniversalRouterCalldata(tx.input);
    expect(r.commands).toBe("0x100c"); // V4_SWAP puis SETTLE_ALL
    expect(r.legs.length).toBe(1);
    const leg = r.legs[0]!;
    expect(leg.actionName).toBe("SWAP_EXACT_IN_SINGLE");
    expect(leg.poolKey.hooks).toBe("0x0469a4bd3724dc86c9542f4694c976da13c450c0");
    expect(leg.direction).toBe("1->0");
    expect(leg.amountIn).toBe("1995142195306018451");
    expect(leg.poolId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(leg.amountIsOpenDelta).toBe(false);
  });

  it("sort 0xb429d62f, le hook a 1176 bps du jeu, sur une transaction reelle", () => {
    const tx = txByHash("0xfa82cb2c");
    const r = decodeUniversalRouterCalldata(tx.input);
    const leg = r.legs[0]!;
    expect(leg.poolKey.hooks).toBe("0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc");
    expect(leg.amountIn).toBe("530000000000000");
    expect(leg.poolKey.fee).toBe(8388608); // frais dynamique : le drapeau 0x800000
  });

  it("suit un chemin multi-saut SWAP_EXACT_IN et en tire le sens par tri des monnaies", () => {
    const tx = txByHash("0xcbb82e2e");
    const r = decodeUniversalRouterCalldata(tx.input);
    expect(r.legs.length).toBeGreaterThanOrEqual(1);
    const leg = r.legs[0]!;
    expect(leg.actionName).toBe("SWAP_EXACT_IN");
    expect(BigInt(leg.poolKey.currency0)).toBeLessThan(BigInt(leg.poolKey.currency1));
    // seul le premier saut d'un exact-in a un montant connu
    expect(leg.amountIn).toBe("4909");
    expect(leg.at.hop).toBe(0);
  });

  it("ignore les commandes qui ne sont pas V4_SWAP (SWEEP, PAY_PORTION)", () => {
    const tx = txByHash("0x8e67d1bc");
    const r = decodeUniversalRouterCalldata(tx.input);
    expect(r.commands).toBe("0x100604"); // V4_SWAP, PAY_PORTION, SWEEP
    expect(r.legs.length).toBe(1);
    expect(r.issues).toEqual([]);
  });

  it("traite un montant a zero comme OPEN_DELTA, jamais comme un swap de taille nulle", () => {
    // deux SWAP_EXACT_IN_SINGLE enchaines : le second reprend le delta ouvert (montant 0)
    const tx = txByHash("0x3b78f4b0");
    const r = decodeUniversalRouterCalldata(tx.input);
    expect(r.legs.length).toBe(2);
    const second = r.legs[1]!;
    expect(second.amountIsOpenDelta).toBe(true);
    expect(second.amountIn).toBeNull(); // et surtout PAS "0"
  });

  it("laisse passer ce qui n'est pas un execute() d'Universal Router", () => {
    const r = decodeUniversalRouterCalldata("0xa9059cbb" + "0".repeat(128)); // transfer(address,uint256)
    expect(r.router).toBe("not-universal-router");
    expect(r.selector).toBe("0xa9059cbb");
    expect(r.legs).toEqual([]);
    expect(r.complete).toBe(true);
  });

  it("un calldata tronque devient une issue, jamais un swap sans hook", () => {
    const tx = txByHash("0x226ac6c7");
    // on coupe la transaction reelle en plein milieu
    const cut = tx.input.slice(0, Math.floor(tx.input.length * 0.6));
    const even = cut.length % 2 === 0 ? cut : cut.slice(0, -1);
    const r = decodeUniversalRouterCalldata(even);
    expect(r.complete).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
    // le point clef : on ne recolte pas un hook nul silencieux
    for (const leg of r.legs) {
      expect(leg.poolKey.hooks).not.toBe("0x0000000000000000000000000000000000000000");
    }
  });

  it("resiste a des octets aleatoires sans jamais lever", () => {
    const rnd = "0x3593564c" + Array.from({ length: 400 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
    const r = decodeUniversalRouterCalldata(rnd);
    expect(typeof r.complete).toBe("boolean");
    expect(Array.isArray(r.legs)).toBe(true);
  });

  it("refuse un hexa malforme sans exploser", () => {
    const r = decodeUniversalRouterCalldata("0xzz");
    expect(r.complete).toBe(false);
    expect(r.issues[0]!.reason).toContain("mot_malforme");
  });
});
