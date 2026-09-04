/** Priorite des sources, et rejets jamais avales. */
import { describe, it, expect, afterEach } from "vitest";
import { resolve } from "node:path";
import { loadDataset, loadRegistry, loadPools, resetCaches } from "../src/dataset.js";
import { API_ROOT } from "../src/paths.js";

const FIXTURE = resolve(API_ROOT, "test", "fixtures", "measurements.jsonl");

afterEach(() => {
  process.env.TARE_JSONL_PATH = "/tare-tests/aucun-jsonl.jsonl";
  resetCaches();
});

describe("sources", () => {
  it("prend le jsonl quand il existe et n'est pas vide", () => {
    process.env.TARE_JSONL_PATH = FIXTURE;
    const ds = loadDataset(true);
    expect(ds.source_kind).toBe("jsonl");
    expect(ds.measurements.length).toBe(2);
  });

  it("signale les lignes illisibles au lieu de les taire", () => {
    process.env.TARE_JSONL_PATH = FIXTURE;
    const ds = loadDataset(true);
    expect(ds.rejected.length).toBe(1);
    expect(ds.rejected[0]!.line).toBe(2);
  });

  it("retombe sur le jeu v1 quand le jsonl est absent", () => {
    const ds = loadDataset(true);
    expect(ds.source_kind).toBe("v1-fallback");
    expect(ds.measurements.length).toBe(128);
  });
});

describe("registre officiel", () => {
  it("expose null quand aucun fichier de registre n'est present dans docs/", () => {
    const reg = loadRegistry(true);
    // s'il apparait un jour, il doit au moins etre indexe par adresse minuscule
    if (reg.path === null) expect(reg.count).toBe(0);
    else for (const k of reg.entries.keys()) expect(k).toBe(k.toLowerCase());
  });
});

describe("pools a liquidite", () => {
  it("lit docs/pools-liquides.json et garde des PoolKey completes", () => {
    const pools = loadPools(true);
    expect(pools.length).toBeGreaterThan(100);
    for (const p of pools.slice(0, 20)) {
      expect(p.hooks).toMatch(/^0x[0-9a-f]{40}$/);
      expect(Number.isFinite(p.fee)).toBe(true);
      expect(Number.isFinite(p.tick_spacing)).toBe(true);
    }
  });
});
