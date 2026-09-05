/**
 * Regle dure n.3, testee au niveau de l'octet : une lecture bornee LEVE. Elle ne rend jamais
 * un zero. Un offset ABI legerement faux qui rendrait 0x000...0 se lirait "ce swap ne passe par
 * aucun hook" — le faux negatif parfait.
 */
import { describe, it, expect } from "vitest";
import { Region, OutOfBounds, MalformedWord, hexToBytes, bytesToHex } from "../src/abi.js";

const w = (hex: string) => hex.padStart(64, "0");

describe("Region", () => {
  it("leve au lieu de tronquer un mot", () => {
    const r = new Region(hexToBytes("0x" + "aa".repeat(20)), "t");
    expect(() => r.word(0)).toThrow(OutOfBounds);
    // et surtout : la levee ne se transforme pas en 0
    let value: unknown = "jamais lu";
    try {
      value = r.uint(0);
    } catch (e) {
      value = e;
    }
    expect(value).toBeInstanceOf(OutOfBounds);
  });

  it("refuse une adresse dont les 12 octets de tete ne sont pas nuls", () => {
    const dirty = new Region(hexToBytes("0x" + "ff".repeat(32)), "t");
    expect(() => dirty.address(0)).toThrow(MalformedWord);
    const clean = new Region(hexToBytes("0x" + w("1aea38f06dece45c252ef1ac5af989d51dc8e8cc")), "t");
    expect(clean.address(0)).toBe("0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc");
  });

  it("refuse un offset ABI qui pointe hors de la zone", () => {
    const r = new Region(hexToBytes("0x" + w("ffffffff")), "t");
    expect(() => r.index(0, "offset")).toThrow(OutOfBounds);
  });

  it("refuse un offset ABI plus grand que 2^53-1", () => {
    const r = new Region(hexToBytes("0x" + "ff".repeat(32)), "t");
    expect(() => r.index(0, "offset")).toThrow(MalformedWord);
  });

  it("refuse un booleen qui n'est ni 0 ni 1, et un int24 qui deborde", () => {
    const two = new Region(hexToBytes("0x" + w("02")), "t");
    expect(() => two.bool(0)).toThrow(MalformedWord);
    const big = new Region(hexToBytes("0x" + w("7fffff")), "t");
    expect(big.int24(0)).toBe(8388607);
    const tooBig = new Region(hexToBytes("0x" + w("800000")), "t");
    expect(() => tooBig.int24(0)).toThrow(MalformedWord);
  });

  it("lit int24 negatif comme le fait abi.encode", () => {
    const minusOne = new Region(hexToBytes("0x" + "f".repeat(64)), "t");
    expect(minusOne.int24(0)).toBe(-1);
    const minus60 = new Region(hexToBytes("0x" + "f".repeat(62) + "c4"), "t");
    expect(minus60.int24(0)).toBe(-60);
  });

  it("slice hors zone leve au lieu de rendre une fenetre plus courte", () => {
    const r = new Region(new Uint8Array(64), "t");
    expect(r.slice(0, 64, "x").length).toBe(64);
    expect(() => r.slice(32, 64, "x")).toThrow(OutOfBounds);
  });

  it("hexToBytes refuse un hexa impair ou invalide", () => {
    expect(() => hexToBytes("0xabc")).toThrow(MalformedWord);
    expect(() => hexToBytes("0xzz")).toThrow(MalformedWord);
    expect(bytesToHex(hexToBytes("0x00ff"))).toBe("0x00ff");
  });
});
