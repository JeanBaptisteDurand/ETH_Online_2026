/**
 * Le chemin Ledger, contre un FAUX appareil.
 *
 * Ce que ces tests couvrent : la mise en champs du rapport (fonction pure), l'encodage de la
 * signature, et les quatre issues du transport — confirmation, refus de l'humain, panne,
 * transport absent. Chaque voie d'echec doit rendre approved:false ; c'est la seule propriete
 * qui compte vraiment ici.
 *
 * Ce que ces tests NE couvrent PAS, et qu'aucun test de ce depot ne couvre : un appareil
 * physique, ou Speculos. Personne n'a vu ces champs sur un vrai ecran. docs/LIMITS.md § 11.
 */
import { describe, it, expect, vi } from "vitest";
import { tareGuard, UNIVERSAL_ROUTER_BASE } from "../src/guard.js";
import { encodeUniversalRouterExactInSingle } from "../src/encode.js";
import { ledgerApprover, renderPrompt } from "../src/approver.js";
import { keccak256, toHex, utf8 } from "../src/keccak.js";
import { ZERO_ADDRESS } from "../src/poolkey.js";
import {
  LEDGER_DEFAULT_PATH,
  LEDGER_STATUS_USER_REJECTED,
  TARE_GUARD_PRIMARY_TYPE,
  TARE_GUARD_TYPES,
  buildGuardTypedData,
  encodeSignature,
  isUserRejection,
  ledgerEip712Approver,
  ledgerWebHidTransport,
  openWebHidDevice,
  swapSizeField,
  takeField,
  type DeviceSession,
  type Eip712TypedData,
} from "../src/ledger.js";
import { WORST_POOL } from "./helpers.js";

/* --------------------------------------------------------------- le rapport de reference */

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

/** Un pool volontairement absent de la table : le hook n'y est pas, donc aucun nombre. */
const unknownHookTx = {
  to: UNIVERSAL_ROUTER_BASE,
  data: encodeUniversalRouterExactInSingle([
    {
      poolKey: {
        currency0: WORST_POOL.currency0,
        currency1: WORST_POOL.currency1,
        fee: 3000,
        tickSpacing: 60,
        hooks: "0x000000000000000000000000000000000000dead",
      },
      zeroForOne: true,
      amountIn: 10n ** 18n,
    },
  ]),
};
const unknownReport = tareGuard(unknownHookTx);

/* --------------------------------------------------------------- le faux appareil */

interface FakeDevice {
  session: DeviceSession;
  calls: { path: string; typed: Eip712TypedData }[];
  closed: number;
}

function fakeDevice(
  behave: (path: string, typed: Eip712TypedData) => Promise<{ r: string; s: string; v: number }>,
): FakeDevice {
  const d: FakeDevice = {
    calls: [],
    closed: 0,
    session: {
      eth: {
        async signEIP712Message(path, typed) {
          d.calls.push({ path, typed });
          return behave(path, typed);
        },
      },
      async close() {
        d.closed += 1;
      },
    },
  };
  return d;
}

const GOOD_SIG = { r: "a".repeat(64), s: "b".repeat(64), v: 27 };

/* --------------------------------------------------------------- typed data */

describe("buildGuardTypedData — le fond du rapport, en champs", () => {
  it("porte le hook, le pool, les bps mesures, le bloc et la taille", () => {
    const t = buildGuardTypedData(report);
    expect(t.primaryType).toBe(TARE_GUARD_PRIMARY_TYPE);
    expect(t.domain.chainId).toBe(report.table.chainId);
    expect(t.message["measuredAtBlock"]).toBe(50614000);

    const swaps = t.message["swaps"] as Record<string, string>[];
    expect(swaps).toHaveLength(1);
    expect(swaps[0]!["hook"]).toBe(WORST_POOL.hook);
    expect(swaps[0]!["poolId"]).toBe(WORST_POOL.poolId);
    expect(swaps[0]!["take"]).toBe("689.95 bps");
    expect(swaps[0]!["label"]).toBe("MEASURED");
    expect(swaps[0]!["size"]).toBe("100000000000000 en entree");
    expect(swaps[0]!["direction"]).toBe("1->0");
  });

  it("le domaine n'annonce pas de verifyingContract : aucun contrat ne verifie ceci", () => {
    const t = buildGuardTypedData(report);
    expect(Object.keys(t.domain).sort()).toEqual(["chainId", "name", "version"]);
    expect(TARE_GUARD_TYPES["EIP712Domain"]!.map((f) => f.name)).toEqual(["name", "version", "chainId"]);
  });

  it("promptDigest est bien le keccak256 du texte integral montre a l'humain", () => {
    const t = buildGuardTypedData(report);
    expect(t.message["promptDigest"]).toBe(toHex(keccak256(utf8(renderPrompt(report)))));
    // la commande de rejeu est dans le texte, donc la signature l'engage aussi
    expect(renderPrompt(report)).toContain("python3 apps/api/scripts/measure_one.py");
  });

  it("les champs declares et les champs presents sont exactement les memes", () => {
    const t = buildGuardTypedData(report);
    const declared = TARE_GUARD_TYPES[TARE_GUARD_PRIMARY_TYPE]!.map((f) => f.name).sort();
    expect(Object.keys(t.message).sort()).toEqual(declared);

    const swaps = t.message["swaps"] as Record<string, unknown>[];
    const swapFields = TARE_GUARD_TYPES["TareSwap"]!.map((f) => f.name).sort();
    for (const s of swaps) expect(Object.keys(s).sort()).toEqual(swapFields);
  });

  it("tout type reference est soit primitif, soit declare dans le schema", () => {
    const primitives = new Set(["string", "address", "bytes32", "uint256"]);
    for (const fields of Object.values(TARE_GUARD_TYPES)) {
      for (const f of fields) {
        const base = f.type.endsWith("[]") ? f.type.slice(0, -2) : f.type;
        expect(primitives.has(base) || base in TARE_GUARD_TYPES).toBe(true);
      }
    }
  });

  it("cite la table telle qu'elle est, sans chiffre ecrit en dur", () => {
    const t = buildGuardTypedData(report);
    const dataset = t.message["dataset"] as string;
    expect(dataset).toContain(`${report.table.nMeasurements} mesures`);
    expect(dataset).toContain(`${report.table.nHooks} hooks`);
    expect(dataset).toContain(`${report.table.nPools} pools`);
  });

  it("dit le retard de la table, ou dit qu'il est inconnu — jamais zero par defaut", () => {
    expect(buildGuardTypedData(report).message["freshness"]).toContain("retard inconnu");
    const late = tareGuard(tx, { atBlock: 50614111 });
    expect(buildGuardTypedData(late).message["freshness"]).toContain("111 blocs de retard");
  });
});

describe("buildGuardTypedData — 'non mesure' n'est jamais 'zero'", () => {
  it("un hook absent de la table ne produit aucun nombre", () => {
    const swaps = buildGuardTypedData(unknownReport).message["swaps"] as Record<string, string>[];
    expect(swaps[0]!["take"]).toBe("non mesure — ce n'est pas zero");
    expect(swaps[0]!["label"]).toContain("NOT_MEASURABLE");
    expect(JSON.stringify(swaps)).not.toContain("0.00 bps");
  });

  it("un swap sans hook dit qu'il n'y a rien a prelever, pas qu'il prend 0", () => {
    const noHook = takeField({
      hook: ZERO_ADDRESS,
      bps: null,
    } as unknown as Parameters<typeof takeField>[0]);
    expect(noHook).toBe("aucun hook : rien a prelever");
  });

  it("OPEN_DELTA ecrit l'absence de taille, pas un zero recopie", () => {
    const leg = { amountIn: null, amountOut: null, amountIsOpenDelta: true };
    expect(swapSizeField(leg as unknown as Parameters<typeof swapSizeField>[0])).toContain("OPEN_DELTA");
    expect(swapSizeField(leg as unknown as Parameters<typeof swapSizeField>[0])).toContain("pas zero");
  });

  it("une taille absente du calldata le dit au lieu de se taire", () => {
    const leg = { amountIn: null, amountOut: null, amountIsOpenDelta: false };
    expect(swapSizeField(leg as unknown as Parameters<typeof swapSizeField>[0])).toContain("non lue");
  });
});

/* --------------------------------------------------------------- signature */

describe("encodeSignature", () => {
  it("rend 65 octets r||s||v et complete a gauche sans deplacer les octets", () => {
    const hex = encodeSignature({ r: "0x1", s: "2", v: 28 });
    expect(hex).toBe(`0x${"0".repeat(63)}1${"0".repeat(63)}2${"1c"}`);
    expect(hex.length).toBe(2 + 130);
  });

  it("ne normalise pas v : il recopie ce que l'appareil a rendu", () => {
    expect(encodeSignature({ ...GOOD_SIG, v: 0 }).endsWith("00")).toBe(true);
    expect(encodeSignature({ ...GOOD_SIG, v: 27 }).endsWith("1b")).toBe(true);
  });

  it("leve sur une signature illisible plutot que d'en fabriquer une", () => {
    expect(() => encodeSignature({ r: "zz", s: "aa", v: 27 })).toThrow(/signature_illisible/);
    expect(() => encodeSignature({ ...GOOD_SIG, v: 300 })).toThrow(/signature_illisible/);
    expect(() => encodeSignature({ ...GOOD_SIG, v: 1.5 })).toThrow(/signature_illisible/);
  });
});

describe("isUserRejection", () => {
  it("reconnait le refus par le code de statut ou par son nom", () => {
    expect(isUserRejection({ statusCode: LEDGER_STATUS_USER_REJECTED })).toBe(true);
    expect(isUserRejection({ statusText: "CONDITIONS_OF_USE_NOT_SATISFIED" })).toBe(true);
  });

  it("ne prend pas une panne pour un refus", () => {
    expect(isUserRejection(new Error("appareil deconnecte"))).toBe(false);
    expect(isUserRejection({ statusCode: 0x6a80 })).toBe(false);
    expect(isUserRejection(null)).toBe(false);
    expect(isUserRejection("boom")).toBe(false);
  });
});

/* --------------------------------------------------------------- le transport */

describe("ledgerWebHidTransport — confirmation", () => {
  it("fait signer le typed data et rend la signature comme attestation", async () => {
    const dev = fakeDevice(async () => GOOD_SIG);
    const d = await ledgerApprover(ledgerWebHidTransport({ openDevice: async () => dev.session })).approve(report);

    expect(d.approved).toBe(true);
    expect(d.by).toBe("ledger");
    expect(d.attestation).toBe(`0x${"a".repeat(64)}${"b".repeat(64)}1b`);
    expect(dev.calls).toHaveLength(1);
    expect(dev.calls[0]!.path).toBe(LEDGER_DEFAULT_PATH);
    expect(dev.calls[0]!.typed.primaryType).toBe(TARE_GUARD_PRIMARY_TYPE);
    expect(dev.closed).toBe(1);
  });

  it("l'appareil recoit bien les bps mesures, pas un resume", async () => {
    let seen: Eip712TypedData | null = null;
    const dev = fakeDevice(async (_p, typed) => {
      seen = typed;
      return GOOD_SIG;
    });
    await ledgerEip712Approver({ openDevice: async () => dev.session }).approve(report);
    const swaps = (seen as unknown as Eip712TypedData).message["swaps"] as Record<string, string>[];
    expect(swaps[0]!["take"]).toBe("689.95 bps");
  });

  it("le chemin de derivation est parametrable", async () => {
    const dev = fakeDevice(async () => GOOD_SIG);
    await ledgerWebHidTransport({ openDevice: async () => dev.session, path: "44'/60'/3'/0/0" }).showAndConfirm(
      renderPrompt(report),
      report,
    );
    expect(dev.calls[0]!.path).toBe("44'/60'/3'/0/0");
  });
});

describe("ledgerWebHidTransport — toutes les voies d'echec rendent NON", () => {
  it("refus de l'humain sur l'appareil", async () => {
    const dev = fakeDevice(async () => {
      throw Object.assign(new Error("Ledger device: Condition of use not satisfied"), {
        statusCode: LEDGER_STATUS_USER_REJECTED,
        statusText: "CONDITIONS_OF_USE_NOT_SATISFIED",
      });
    });
    const d = await ledgerEip712Approver({ openDevice: async () => dev.session }).approve(report);
    expect(d.approved).toBe(false);
    expect(d.reason).toBe("appareil_a_refuse");
    expect(d.attestation).toBeNull();
    expect(dev.closed).toBe(1);
  });

  it("panne pendant la signature : NON, et l'appareil est referme quand meme", async () => {
    const dev = fakeDevice(async () => {
      throw new Error("appareil deconnecte");
    });
    const d = await ledgerEip712Approver({ openDevice: async () => dev.session }).approve(report);
    expect(d.approved).toBe(false);
    expect(d.reason).toContain("ledger_en_erreur");
    expect(d.reason).toContain("appareil deconnecte");
    expect(dev.closed).toBe(1);
  });

  it("l'appareil ne s'ouvre pas du tout : NON", async () => {
    const d = await ledgerEip712Approver({
      openDevice: async () => {
        throw new Error("aucun appareil autorise");
      },
    }).approve(report);
    expect(d.approved).toBe(false);
    expect(d.reason).toContain("aucun appareil autorise");
  });

  it("signature illisible rendue par l'appareil : NON, pas une attestation bricolee", async () => {
    const dev = fakeDevice(async () => ({ r: "pas du hex", s: "non plus", v: 27 }));
    const d = await ledgerEip712Approver({ openDevice: async () => dev.session }).approve(report);
    expect(d.approved).toBe(false);
    expect(d.reason).toContain("signature_illisible");
  });

  it("sans rapport, il refuse de signer un texte nu", async () => {
    const dev = fakeDevice(async () => GOOD_SIG);
    await expect(
      ledgerWebHidTransport({ openDevice: async () => dev.session }).showAndConfirm("un pave de texte"),
    ).rejects.toThrow(/ledger_sans_rapport/);
    expect(dev.calls).toHaveLength(0);
  });

  it("transport absent : NON, comme avant le cablage", async () => {
    const d = await ledgerApprover(null).approve(report);
    expect(d.approved).toBe(false);
    expect(d.reason).toContain("ledger_non_cable");
  });

  it("une fermeture qui echoue ne transforme pas un oui en non, ni l'inverse", async () => {
    const dev = fakeDevice(async () => GOOD_SIG);
    dev.session.close = async () => {
      throw new Error("close a rate");
    };
    const d = await ledgerEip712Approver({ openDevice: async () => dev.session }).approve(report);
    expect(d.approved).toBe(true);
  });
});

describe("openWebHidDevice — l'ouverture reelle, dans un environnement sans WebHID", () => {
  it("refuse au lieu de supposer qu'un appareil est la", async () => {
    expect((globalThis as { navigator?: { hid?: unknown } }).navigator?.hid).toBeUndefined();
    await expect(openWebHidDevice()).rejects.toThrow(/webhid_indisponible/);
  });

  it("branche sur l'approbateur, cela donne approved:false et non une exception", async () => {
    const d = await ledgerEip712Approver().approve(report);
    expect(d.approved).toBe(false);
    expect(d.reason).toContain("webhid_indisponible");
  });
});

/**
 * Le seul endroit de ce fichier qui touche aux vrais paquets @ledgerhq.
 *
 * Il ne parle a aucun appareil : il verifie que les methodes sur lesquelles ledger.ts s'appuie
 * existent bien dans les versions installees. Si @ledgerhq renomme signEIP712Message, ce test
 * tombe ici plutot que dans la main d'un utilisateur.
 *
 * Attention a la portee : ces import() passent par le resolveur de Vite. Le meme import echoue
 * sous Node en ESM pur (les builds lib-es des paquets utilisent des imports relatifs sans
 * extension) — d'ou l'import dynamique cote empaqueteur dans ledger.ts.
 */
describe("les paquets @ledgerhq installes exposent bien ce dont ledger.ts depend", () => {
  // Delai large et assume : ces deux-la font transformer ~700 Ko de code tiers par Vite. Le
  // defaut de 5 s tient a vide et tombe sur une machine chargee, et un test qui echoue selon
  // la charge ne mesure plus rien.
  it("hw-transport-webhid expose request / openConnected / isSupported", async () => {
    const { default: TransportWebHID } = await import("@ledgerhq/hw-transport-webhid");
    expect(typeof TransportWebHID.request).toBe("function");
    expect(typeof TransportWebHID.openConnected).toBe("function");
    expect(typeof TransportWebHID.isSupported).toBe("function");
  }, 60_000);

  it("hw-app-eth expose signEIP712Message", async () => {
    const { default: Eth } = await import("@ledgerhq/hw-app-eth");
    expect(typeof Eth.prototype.signEIP712Message).toBe("function");
  }, 60_000);
});

describe("le portillon ne demande rien quand il n'y a rien a demander", () => {
  it("un rapport sans hook donne quand meme un typed data lisible", () => {
    const plain = tareGuard({ to: UNIVERSAL_ROUTER_BASE, value: "0x1" });
    const t = buildGuardTypedData(plain);
    expect(t.message["swaps"]).toEqual([]);
    expect(t.message["verdict"]).toBe("OK");
    expect(t.message["warnings"]).toContain("pas_de_calldata");
  });

  it("aucun appareil n'est ouvert tant que le rapport ne le demande pas", async () => {
    const open = vi.fn();
    ledgerWebHidTransport({ openDevice: open as never });
    expect(open).not.toHaveBeenCalled();
  });
});
