/** Les regles dures, testees comme du code et pas comme une intention. */
import { describe, it, expect } from "vitest";
import { resolveLabel, LABELS } from "../src/labels.js";
import { normalizeMeasurement, measurementId } from "../src/measurement.js";
import { loadDataset } from "../src/dataset.js";

const BASE = {
  hook: "0xAAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA",
  pool_id: "0x" + "11".repeat(32),
  chain_id: 8453,
  block_number: 50614000,
  currency0: "0x0000000000000000000000000000000000000000",
  currency1: "0x4200000000000000000000000000000000000006",
  key_fee: 0,
  tick_spacing: 200,
  zero_for_one: true,
  amount_in: "1000000000000000",
};

describe("etiquettes", () => {
  it("traduit les etiquettes francaises du jeu v1 vers les quatre canoniques", () => {
    expect(resolveLabel("MESURE").label).toBe("MEASURED");
    expect(resolveLabel("NON_COTABLE").label).toBe("NOT_QUOTABLE");
    expect(resolveLabel("MEASURED").label).toBe("MEASURED");
    expect(resolveLabel("NOT_MEASURABLE").label).toBe("NOT_MEASURABLE");
  });

  it("degrade toute etiquette inconnue en NOT_MEASURABLE, jamais en valeur", () => {
    const r = resolveLabel("PROBABLEMENT_OK");
    expect(r.label).toBe("NOT_MEASURABLE");
    expect(r.translation_note).toBe("unknown_label:PROBABLEMENT_OK");
  });
});

describe("regle 3 : un nombre ne survit pas a une etiquette qui ne peut pas le porter", () => {
  it("efface le bps d'une mesure NON_COTABLE meme si la source en fournit un", () => {
    const m = normalizeMeasurement({ ...BASE, label: "NON_COTABLE", bps: 99.9 }, { source: "test" });
    expect(m.label).toBe("NOT_QUOTABLE");
    expect(m.bps).toBeNull();
    expect(m.reason).toContain("bps_dropped");
  });

  it("garde le bps d'une mesure MEASURED", () => {
    const m = normalizeMeasurement({ ...BASE, label: "MESURE", bps: 57.44 }, { source: "test" });
    expect(m.bps).toBe(57.44);
  });
});

describe("regle 4 : bloc, taille, sens, et une commande de rejeu", () => {
  it("porte les quatre sur chaque mesure", () => {
    const m = normalizeMeasurement({ ...BASE, label: "MESURE", bps: 12 }, { source: "test" });
    expect(m.block_number).toBe(50614000);
    expect(m.amount_in).toBe("1000000000000000");
    expect(m.direction).toBe("0->1");
    expect(m.replay.command).toBe(
      `make measure HOOK=${BASE.hook.toLowerCase()} BLOCK=50614000`,
    );
    expect(m.replay.command_exact).toContain("--amount-in 1000000000000000");
    expect(m.replay.command_exact).toContain("--zero-for-one true");
  });
});

describe("identite des mesures", () => {
  it("est deterministe et distingue deux tailles", () => {
    const a = measurementId({ ...BASE, hook: BASE.hook.toLowerCase() });
    const b = measurementId({ ...BASE, hook: BASE.hook.toLowerCase() });
    const c = measurementId({ ...BASE, hook: BASE.hook.toLowerCase(), amount_in: "2" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^m_[0-9a-f]{16}$/);
  });
});

describe("le jeu publie", () => {
  it("charge les 128 mesures du jeu v1 et n'expose que des etiquettes canoniques", () => {
    const ds = loadDataset(true);
    expect(ds.source_kind).toBe("v1-fallback");
    expect(ds.measurements.length).toBe(128);
    for (const m of ds.measurements) expect(LABELS).toContain(m.label);
  });

  it("n'expose jamais un bps sur une etiquette non numerique", () => {
    for (const m of loadDataset().measurements) {
      if (m.label !== "MEASURED" && m.label !== "INTERPOLATED") expect(m.bps).toBeNull();
    }
  });
});
