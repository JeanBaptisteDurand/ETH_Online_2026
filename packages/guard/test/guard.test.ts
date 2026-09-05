/**
 * La garde de bout en bout.
 *
 * Deux familles de cas :
 *  - transactions REELLES de Base (fixtures), qui tombent sur des pools absents de la table :
 *    la garde doit dire qu'elle ne sait pas, et montrer le faisceau ;
 *  - PoolKey REELLES du jeu remises dans une enveloppe Universal Router fabriquee : la garde
 *    doit sortir le nombre exact, avec son bloc et sa taille.
 */
import { describe, it, expect } from "vitest";
import { tareGuard, UNIVERSAL_ROUTER_BASE, TABLE } from "../src/guard.js";
import { encodeUniversalRouterExactInSingle } from "../src/encode.js";
import { txByHash, WORST_POOL } from "./helpers.js";

const key = {
  currency0: WORST_POOL.currency0,
  currency1: WORST_POOL.currency1,
  fee: WORST_POOL.fee,
  tickSpacing: WORST_POOL.tickSpacing,
  hooks: WORST_POOL.hook,
};

function swapTx(amountIn: bigint, zeroForOne = WORST_POOL.zeroForOne) {
  return {
    to: UNIVERSAL_ROUTER_BASE,
    from: "0x000000000000000000000000000000000000dEaD",
    data: encodeUniversalRouterExactInSingle([{ poolKey: key, zeroForOne, amountIn }]),
    value: "0x0",
  };
}

describe("tareGuard — pool mesure", () => {
  it("sort la valeur exacte, son bloc, sa taille et sa commande de rejeu", () => {
    const r = tareGuard(swapTx(10n ** 14n));
    expect(r.findings.length).toBe(1);
    const f = r.findings[0]!;
    expect(f.hook).toBe(WORST_POOL.hook);
    expect(f.label).toBe("MEASURED");
    expect(f.basis).toBe("exact");
    expect(f.bps).toBeCloseTo(689.9519, 4);
    expect(f.verdict).toBe("block"); // 689 bps, tres au-dessus des 100 bps de seuil
    expect(r.verdict).toBe("block");
    expect(r.headline).toContain("689.95 bps");
    expect(r.headline).toContain("50614000");
    expect(f.replay).toContain("--block 50614000");
    expect(f.replay).toContain("--amount-in 100000000000000");
    expect(f.replay).toContain(`--hooks ${WORST_POOL.hook}`);
    expect(f.citations[0]!.blockNumber).toBe(50614000);
  });

  it("interpole entre deux mesures et le dit : INTERPOLATED, jamais MEASURED", () => {
    const r = tareGuard(swapTx(3n * 10n ** 17n));
    const f = r.findings[0]!;
    expect(f.label).toBe("INTERPOLATED");
    expect(f.basis).toBe("interpolated");
    expect(f.citations.length).toBe(2);
    expect(f.sentence).toContain("interpole entre");
    expect(r.verdict).toBe("block");
  });

  it("hors plage de tailles : aucun nombre, mais le faisceau reste visible", () => {
    const r = tareGuard(swapTx(10n ** 21n));
    const f = r.findings[0]!;
    expect(f.label).toBe("NOT_MEASURABLE");
    expect(f.bps).toBeNull();
    expect(f.reason).toContain("taille_hors_plage_mesuree");
    expect(f.basis).toBe("evidence");
    // le verdict s'appuie sur le faisceau, et la phrase le dit
    expect(f.verdict).toBe("block");
    expect(f.sentence).toContain("TARE ne chiffre rien");
  });

  it("le sens non mesure ne devient pas un zero", () => {
    const r = tareGuard(swapTx(10n ** 14n, true)); // 0->1, jamais balaye sur ce pool
    const f = r.findings[0]!;
    expect(f.label).toBe("NOT_MEASURABLE");
    expect(f.bps).toBeNull();
    expect(f.reason).toBe("sens_non_mesure:0->1");
    expect(f.verdict).not.toBe("ok");
  });
});

describe("tareGuard — transactions reelles de Base", () => {
  it("hook mesure mais pool jamais balaye : dit qu'elle ne sait pas, et montre le faisceau", () => {
    const tx = txByHash("0xfa82cb2c"); // hook 0xb429d62f
    const r = tareGuard({ to: tx.to, data: tx.input });
    const f = r.findings[0]!;
    expect(f.hook).toBe("0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc");
    expect(f.label).toBe("NOT_MEASURABLE");
    expect(f.bps).toBeNull();
    expect(f.reason).toContain("pool_absent_de_la_table");
    expect(f.hookContext!.nPools).toBe(31);
    expect(f.hookContext!.measured!.bpsMax).toBeCloseTo(1176.4601, 4);
    expect(f.verdict).toBe("block");
    expect(r.headline).toContain("ailleurs");
  });

  it("hook a comptabilite personnalisee : NOT_MEASURABLE reste NOT_MEASURABLE", () => {
    const tx = txByHash("0x5a0c9c40"); // hook 0xbb7784a4
    const r = tareGuard({ to: tx.to, data: tx.input });
    const f = r.findings[0]!;
    expect(f.hook).toBe("0xbb7784a4d481184283ed89619a3e3ed143e1adc0");
    expect(f.bps).toBeNull();
    expect(f.hookContext!.measured).toBeNull();
    expect(f.verdict).toBe("warn"); // inconnu n'est pas inoffensif, mais rien ne prouve 'block'
  });

  it("hook absent de la table : 'je ne sais pas' vaut warn, jamais ok", () => {
    const tx = txByHash("0xf8677702"); // hook 0x1f91c998, hors jeu
    const r = tareGuard({ to: tx.to, data: tx.input });
    const f = r.findings[0]!;
    expect(f.hook).toBe("0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc");
    expect(f.hookContext).toBeNull();
    expect(f.bps).toBeNull();
    expect(f.verdict).toBe("warn");
    expect(f.sentence).toContain("absent de la table");
    expect(f.sentence).toContain("ce n'est pas la meme chose");
  });

  it("swap sans hook : ok, et surtout pas 'MEASURED 0 bps'", () => {
    const tx = txByHash("0x3b78f4b0");
    const r = tareGuard({ to: tx.to, data: tx.input });
    expect(r.verdict).toBe("ok");
    for (const f of r.findings) {
      expect(f.hook).toBe("0x0000000000000000000000000000000000000000");
      expect(f.bps).toBeNull();
      expect(f.label).toBe("NOT_MEASURABLE");
    }
    expect(r.headline).toBe("Aucun hook dans ce swap.");
  });

  it("les 8 transactions reelles passent sans avertissement de lecture", () => {
    for (const p of ["0x226ac6c7", "0xfa82cb2c", "0x5a0c9c40", "0xf8677702", "0x3b78f4b0", "0xcbb82e2e", "0x7fc967cf", "0x8e67d1bc"]) {
      const tx = txByHash(p);
      const r = tareGuard({ to: tx.to, data: tx.input });
      expect(r.complete, p).toBe(true);
      expect(r.warnings, p).toEqual([]);
    }
  });
});

describe("tareGuard — refus de conclure", () => {
  it("un calldata tronque ne rend jamais 'ok'", () => {
    const full = swapTx(10n ** 14n).data;
    const cut = full.slice(0, Math.floor(full.length * 0.5));
    const r = tareGuard({ to: UNIVERSAL_ROUTER_BASE, data: cut.length % 2 ? cut.slice(0, -1) : cut });
    expect(r.complete).toBe(false);
    expect(r.verdict).not.toBe("ok");
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("ne se prononce pas sur ce qui n'est pas un execute() d'Universal Router", () => {
    const r = tareGuard({ to: UNIVERSAL_ROUTER_BASE, data: "0xa9059cbb" + "0".repeat(128) });
    expect(r.findings).toEqual([]);
    expect(r.headline).toContain("pas un execute()");
  });

  it("signale un destinataire hors liste sans refuser de lire le calldata", () => {
    const tx = swapTx(10n ** 14n);
    const r = tareGuard({ ...tx, to: "0x000000000000000000000000000000000000beef" });
    expect(r.warnings.some((w) => w.startsWith("destinataire_hors_liste"))).toBe(true);
    expect(r.findings.length).toBe(1); // on lit quand meme
  });

  it("dit de combien de blocs la table est en retard", () => {
    const r = tareGuard(swapTx(10n ** 14n), { atBlock: 50889629 });
    expect(r.staleness.tableBlock).toBe(50614000);
    expect(r.staleness.blocksBehind).toBe(275629);
    expect(r.warnings.some((w) => w.startsWith("table_en_retard"))).toBe(true);
  });

  it("une transaction sans calldata n'est pas un swap", () => {
    const r = tareGuard({ to: UNIVERSAL_ROUTER_BASE, value: "0x1" });
    expect(r.findings).toEqual([]);
    expect(r.verdict).toBe("ok");
    expect(r.warnings).toContain("pas_de_calldata:transaction_sans_donnees");
  });

  it("les seuils sont reglables et le verdict les suit", () => {
    const tx = swapTx(10n ** 14n);
    expect(tareGuard(tx, { warnBps: 5, blockBps: 10000 }).verdict).toBe("warn");
    expect(tareGuard(tx, { warnBps: 5, blockBps: 10 }).verdict).toBe("block");
  });

  it("expose la provenance de la table dans chaque rapport", () => {
    const r = tareGuard(swapTx(10n ** 14n));
    expect(r.table.nMeasurements).toBe(TABLE.n_measurements);
    expect(r.table.blockNumber).toBe(50614000);
    expect(r.table.stubHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
