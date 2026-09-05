/**
 * L'interception, sans navigateur : un faux window, un faux provider, un approbateur de test.
 *
 * Ce qui est verifie ici est exactement ce qui casse en vrai :
 *  - seul eth_sendTransaction est intercepte ;
 *  - un provider pose APRES nous est quand meme enveloppe (piege defineProperty) ;
 *  - un provider annonce en EIP-6963 est enveloppe une seule fois ;
 *  - un refus ressort en code 4001, celui que les dapps savent deja lire.
 */
import { describe, it, expect, vi } from "vitest";
import { installTareGuard, wrapProvider, UserRejectedByGuard, type Eip1193Provider } from "../src/browser.js";
import { encodeUniversalRouterExactInSingle } from "../src/encode.js";
import { UNIVERSAL_ROUTER_BASE } from "../src/guard.js";
import { alwaysApprove, alwaysDeny, type Approver } from "../src/approver.js";
import { WORST_POOL, txByHash } from "./helpers.js";

const DATA = encodeUniversalRouterExactInSingle([
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
]);
const TX = { to: UNIVERSAL_ROUTER_BASE, from: "0x000000000000000000000000000000000000dEaD", data: DATA };

function fakeProvider() {
  const calls: { method: string; params?: unknown }[] = [];
  const p: Eip1193Provider = {
    async request(args) {
      calls.push({ method: args.method, params: args.params });
      if (args.method === "eth_sendTransaction") return "0x" + "11".repeat(32);
      if (args.method === "eth_accounts") return ["0x000000000000000000000000000000000000dEaD"];
      return null;
    },
  };
  return { p, calls };
}

/** un faux window : juste ce que la garde utilise */
function fakeWindow() {
  const listeners = new Map<string, ((e: Event) => void)[]>();
  const w: Record<string, unknown> = {
    addEventListener(type: string, cb: (e: Event) => void) {
      const l = listeners.get(type) ?? [];
      l.push(cb);
      listeners.set(type, l);
    },
    removeEventListener(type: string, cb: (e: Event) => void) {
      listeners.set(type, (listeners.get(type) ?? []).filter((x) => x !== cb));
    },
    dispatchEvent(e: Event) {
      for (const cb of listeners.get(e.type) ?? []) cb(e);
      return true;
    },
  };
  return { w, listeners };
}

describe("wrapProvider", () => {
  it("laisse passer tout ce qui n'est pas eth_sendTransaction", async () => {
    const { p, calls } = fakeProvider();
    const approver = { name: "spy", approve: vi.fn() };
    wrapProvider(p, { approver, target: {} });
    await p.request({ method: "eth_accounts" });
    await p.request({ method: "eth_chainId" });
    await p.request({ method: "personal_sign", params: ["0xdead", "0x0"] });
    expect(approver.approve).not.toHaveBeenCalled();
    expect(calls.map((c) => c.method)).toEqual(["eth_accounts", "eth_chainId", "personal_sign"]);
  });

  it("intercepte eth_sendTransaction et laisse partir si l'humain confirme", async () => {
    const { p, calls } = fakeProvider();
    let seen: string | null = null;
    wrapProvider(p, { approver: alwaysApprove, onReport: (r) => (seen = r.headline) });
    const hash = await p.request({ method: "eth_sendTransaction", params: [TX] });
    expect(hash).toBe("0x" + "11".repeat(32));
    expect(calls.length).toBe(1);
    expect(seen).toContain("689.95 bps");
  });

  it("un refus ressort en code 4001, avec le rapport attache", async () => {
    const { p, calls } = fakeProvider();
    wrapProvider(p, { approver: alwaysDeny });
    await expect(p.request({ method: "eth_sendTransaction", params: [TX] })).rejects.toThrow(
      UserRejectedByGuard,
    );
    expect(calls.length).toBe(0); // la transaction n'a jamais atteint le portefeuille
    try {
      await p.request({ method: "eth_sendTransaction", params: [TX] });
    } catch (e) {
      const err = e as UserRejectedByGuard;
      expect(err.code).toBe(4001);
      expect(err.report.verdict).toBe("block");
      expect(err.report.findings[0]!.bps).toBeCloseTo(689.9519, 4);
    }
  });

  it("ne demande rien quand le verdict est ok (swap sans hook)", async () => {
    const tx = txByHash("0x3b78f4b0");
    const { p } = fakeProvider();
    const approver = { name: "spy", approve: vi.fn() };
    wrapProvider(p, { approver });
    await p.request({ method: "eth_sendTransaction", params: [{ to: tx.to, data: tx.input }] });
    expect(approver.approve).not.toHaveBeenCalled();
  });

  it("est idempotent : deux enveloppes ne posent pas deux fenetres", async () => {
    const { p } = fakeProvider();
    let asked = 0;
    const approver: Approver = {
      name: "count",
      async approve() {
        asked++;
        return { approved: true, by: "count", reason: "ok" };
      },
    };
    wrapProvider(p, { approver });
    wrapProvider(p, { approver });
    wrapProvider(p, { approver });
    await p.request({ method: "eth_sendTransaction", params: [TX] });
    expect(asked).toBe(1);
  });
});

describe("installTareGuard", () => {
  it("enveloppe un provider deja present", async () => {
    const { w } = fakeWindow();
    const { p, calls } = fakeProvider();
    w["ethereum"] = p;
    const inst = installTareGuard({ target: w, approver: alwaysDeny });
    expect(inst.wrapped.length).toBe(1);
    await expect(
      (w["ethereum"] as Eip1193Provider).request({ method: "eth_sendTransaction", params: [TX] }),
    ).rejects.toThrow(UserRejectedByGuard);
    expect(calls.length).toBe(0);
    inst.uninstall();
  });

  it("piege un provider pose APRES nous (defineProperty)", async () => {
    const { w } = fakeWindow();
    const inst = installTareGuard({ target: w, approver: alwaysDeny });
    expect(inst.wrapped.length).toBe(0);
    const { p, calls } = fakeProvider();
    w["ethereum"] = p; // le portefeuille s'injecte maintenant
    expect(inst.wrapped.length).toBe(1);
    expect(w["ethereum"]).toBe(p); // et la dapp retrouve bien son provider
    await expect(p.request({ method: "eth_sendTransaction", params: [TX] })).rejects.toThrow(
      UserRejectedByGuard,
    );
    expect(calls.length).toBe(0);
    inst.uninstall();
  });

  it("enveloppe un provider annonce en EIP-6963, une seule fois", async () => {
    const { w } = fakeWindow();
    const inst = installTareGuard({ target: w, approver: alwaysDeny });
    const { p, calls } = fakeProvider();
    const announce = () => {
      const ev = new CustomEvent("eip6963:announceProvider", {
        detail: { info: { name: "Faux Portefeuille", rdns: "test.tare" }, provider: p },
      });
      (w["dispatchEvent"] as (e: Event) => boolean)(ev);
    };
    announce();
    announce();
    expect(inst.wrapped.length).toBe(1);
    await expect(p.request({ method: "eth_sendTransaction", params: [TX] })).rejects.toThrow(
      UserRejectedByGuard,
    );
    expect(calls.length).toBe(0);
    inst.uninstall();
  });

  it("enveloppe aussi la grappe window.ethereum.providers[]", () => {
    const { w } = fakeWindow();
    const a = fakeProvider().p;
    const b = fakeProvider().p;
    const hub = { ...fakeProvider().p, providers: [a, b] } as Eip1193Provider;
    w["ethereum"] = hub;
    const inst = installTareGuard({ target: w, approver: alwaysDeny });
    expect(inst.wrapped.length).toBe(3);
    inst.uninstall();
  });

  it("ne mange pas la transaction si l'analyse echoue", async () => {
    const { p, calls } = fakeProvider();
    const approver = { name: "spy", approve: vi.fn() };
    // une table volontairement cassee fait lever tareGuard
    wrapProvider(p, { approver, table: { schema: "casse" } });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const hash = await p.request({ method: "eth_sendTransaction", params: [TX] });
    expect(hash).toBe("0x" + "11".repeat(32));
    expect(calls.length).toBe(1);
    expect(approver.approve).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
