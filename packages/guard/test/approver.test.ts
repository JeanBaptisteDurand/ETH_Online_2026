/**
 * Le portillon et le point de branchement Ledger.
 *
 * Le point qui compte : une garde qui echoue en "oui" ne garde rien. Toutes les voies
 * d'echec — pas de confirm, pas de transport Ledger, Ledger en erreur — repondent NON.
 */
import { describe, it, expect, vi } from "vitest";
import { tareGuard, UNIVERSAL_ROUTER_BASE } from "../src/guard.js";
import { encodeUniversalRouterExactInSingle } from "../src/encode.js";
import {
  gate,
  renderPrompt,
  confirmApprover,
  alwaysApprove,
  alwaysDeny,
  ledgerApprover,
  type LedgerTransport,
} from "../src/approver.js";
import { WORST_POOL } from "./helpers.js";

const tx = {
  to: UNIVERSAL_ROUTER_BASE,
  data: encodeUniversalRouterExactInSingle([
    {
      poolKey: {
        currency0: WORST_POOL.currency0,
        currency1: WORST_POOL.currency1,
        fee: WORST_POOL.fee,
        tickSpacing: WORST_POOL.tickSpacing,
        hooks: WORST_POOL.hook,
      },
      zeroForOne: false,
      amountIn: 10n ** 14n,
    },
  ]),
};
const report = tareGuard(tx);
const okReport = tareGuard({ to: UNIVERSAL_ROUTER_BASE, value: "0x1" });

describe("renderPrompt", () => {
  it("montre le nombre, son etiquette, son bloc et sa commande de rejeu", () => {
    const text = renderPrompt(report);
    expect(text).toContain("689.95 bps");
    expect(text).toContain("MEASURED");
    expect(text).toContain("bloc 50614000");
    expect(text).toContain("rejouer : python3 apps/api/scripts/measure_one.py");
    expect(text).toContain("995 mesures");
  });
});

describe("gate", () => {
  it("ne derange personne quand le verdict est ok", async () => {
    const spy = { name: "spy", approve: vi.fn() };
    const d = await gate(okReport, spy);
    expect(d.approved).toBe(true);
    expect(spy.approve).not.toHaveBeenCalled();
  });

  it("demande quand le verdict est block", async () => {
    expect(report.verdict).toBe("block");
    expect((await gate(report, alwaysApprove)).approved).toBe(true);
    expect((await gate(report, alwaysDeny)).approved).toBe(false);
  });

  it("askOn permet de tout passer au portillon, meme un ok", async () => {
    const d = await gate(okReport, alwaysDeny, { askOn: ["ok", "warn", "block"] });
    expect(d.approved).toBe(false);
  });
});

describe("confirmApprover", () => {
  it("refuse par defaut quand il n'y a pas de confirm (hors navigateur)", async () => {
    const saved = (globalThis as Record<string, unknown>)["confirm"];
    delete (globalThis as Record<string, unknown>)["confirm"];
    const d = await confirmApprover.approve(report);
    expect(d.approved).toBe(false);
    expect(d.reason).toContain("pas_de_confirm_disponible");
    if (saved !== undefined) (globalThis as Record<string, unknown>)["confirm"] = saved;
  });

  it("suit la reponse de l'humain quand confirm existe", async () => {
    const g = globalThis as Record<string, unknown>;
    g["confirm"] = (m?: string) => {
      expect(m).toContain("689.95 bps");
      return true;
    };
    expect((await confirmApprover.approve(report)).approved).toBe(true);
    g["confirm"] = () => false;
    expect((await confirmApprover.approve(report)).approved).toBe(false);
    delete g["confirm"];
  });
});

describe("ledgerApprover — le point de branchement, non cable", () => {
  it("sans transport il REFUSE, il ne laisse pas passer", async () => {
    const d = await ledgerApprover(null).approve(report);
    expect(d.approved).toBe(false);
    expect(d.by).toBe("ledger");
    expect(d.reason).toContain("ledger_non_cable");
  });

  it("avec un transport, il montre la phrase de renderPrompt et rend l'attestation", async () => {
    let shown = "";
    const transport: LedgerTransport = {
      async showAndConfirm(text) {
        shown = text;
        return { confirmed: true, attestation: "0xdeadbeef" };
      },
    };
    const d = await ledgerApprover(transport).approve(report);
    expect(d.approved).toBe(true);
    expect(d.attestation).toBe("0xdeadbeef");
    expect(shown).toContain("689.95 bps");
    expect(shown).toContain("bloc 50614000");
  });

  it("un transport qui echoue donne NON, pas OUI", async () => {
    const transport: LedgerTransport = {
      async showAndConfirm() {
        throw new Error("appareil deconnecte");
      },
    };
    const d = await ledgerApprover(transport).approve(report);
    expect(d.approved).toBe(false);
    expect(d.reason).toContain("appareil deconnecte");
  });
});
