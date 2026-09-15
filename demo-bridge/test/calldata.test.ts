/**
 * LE MEILLEUR TEST POSSIBLE : le decodeur du depot relit ce que ce service construit.
 *
 * `packages/guard/src/calldata.ts` est le code qui, en production, lit le calldata d'un swap
 * avant signature. S'il retrouve dans notre calldata la PoolKey et le hook qu'on voulait, alors
 * l'ecran de la demo montrera le hook de la vraie transaction — et pas un autre.
 *
 * Ces tests ne touchent AUCUN reseau : l'encodage et le decodage sont purs.
 */
import { describe, expect, it } from "vitest";
import { encodeUniversalRouterExactInSingle } from "../vendor/guard/src/encode.js";
import { decodeUniversalRouterCalldata } from "../vendor/guard/src/calldata.js";
import { poolId } from "../vendor/guard/src/poolkey.js";
import { ACTES, TAILLE_WEI, lirePorte, TABLE, USDC_BASE, ADRESSE_NULLE } from "../src/corpus.js";
import { construireMessage, champTake } from "../src/message.js";
import { TARE_GUARD_TYPES, TARE_GUARD_PRIMARY_TYPE } from "../vendor/guard/src/ledger.js";

const UNIVERSAL_ROUTER_BASE = "0x6ff5693b99212da76ad316178a184ab56d299b43";

function construire(porte: (typeof ACTES)["stop"]["porte"], plancher = 1n) {
  return encodeUniversalRouterExactInSingle(
    [
      {
        poolKey: porte.pool_key,
        zeroForOne: porte.sens === "0->1",
        amountIn: BigInt(porte.taille_wei),
        amountOutMinimum: plancher,
      },
    ],
    { deadline: 1_800_000_000n },
  );
}

describe("le calldata construit se relit avec le decodeur du depot", () => {
  for (const nom of ["stop", "substitution"] as const) {
    it(`acte ${nom} : PoolKey, hook, sens et taille retrouves a l'identique`, () => {
      const porte = ACTES[nom].porte;
      const data = construire(porte);
      const relu = decodeUniversalRouterCalldata(data);

      expect(relu.router).toBe("universal-router");
      expect(relu.complete).toBe(true);
      expect(relu.issues).toEqual([]);
      expect(relu.legs).toHaveLength(1);

      const jambe = relu.legs[0]!;
      expect(jambe.poolId).toBe(porte.pool_id);
      expect(jambe.poolKey.hooks.toLowerCase()).toBe(porte.hook);
      expect(jambe.poolKey.currency0.toLowerCase()).toBe(porte.pool_key.currency0);
      expect(jambe.poolKey.currency1.toLowerCase()).toBe(porte.pool_key.currency1);
      expect(jambe.poolKey.fee).toBe(porte.pool_key.fee);
      expect(jambe.poolKey.tickSpacing).toBe(porte.pool_key.tickSpacing);
      expect(jambe.direction).toBe(porte.sens);
      expect(jambe.amountIn).toBe(porte.taille_wei);
      expect(jambe.actionName).toBe("SWAP_EXACT_IN_SINGLE");
      expect(jambe.amountIsOpenDelta).toBe(false);
    });
  }

  it("acte substitution : la meilleure porte se relit aussi, et c'est un AUTRE pool", () => {
    const acte = ACTES.substitution;
    const meilleure = acte.meilleure_porte!;
    const relu = decodeUniversalRouterCalldata(construire(meilleure));
    expect(relu.legs[0]!.poolId).toBe(meilleure.pool_id);
    expect(relu.legs[0]!.poolKey.hooks.toLowerCase()).toBe(meilleure.hook);
    expect(meilleure.pool_id).not.toBe(acte.porte.pool_id);
    expect(meilleure.hook).not.toBe(acte.porte.hook);
  });

  it("le poolId rendu est bien keccak(abi.encode(PoolKey)) — pas une chaine recopiee", () => {
    for (const nom of ["stop", "substitution"] as const) {
      const p = ACTES[nom].porte;
      expect(poolId(p.pool_key)).toBe(p.pool_id);
    }
  });

  it("la commande Universal Router est V4_SWAP, et le selecteur celui d'execute avec echeance", () => {
    const data = construire(ACTES.stop.porte);
    const relu = decodeUniversalRouterCalldata(data);
    expect(relu.selector).toBe("0x3593564c");
    expect(relu.commands).toBe("0x10");
  });

  it("un octet change dans le calldata ne passe plus pour la meme porte", () => {
    const porte = ACTES.substitution.porte;
    const data = construire(porte);
    // on abime l'octet de poids faible du hook (mot 0xa0 de la struct)
    const i = data.indexOf(porte.hook.slice(2));
    expect(i).toBeGreaterThan(0);
    const abime = data.slice(0, i + 38) + (data[i + 38] === "0" ? "1" : "0") + data.slice(i + 39);
    const relu = decodeUniversalRouterCalldata(abime);
    expect(relu.legs[0]!.poolId).not.toBe(porte.pool_id);
  });
});

describe("le corpus, et rien que lui", () => {
  it("les deux actes tirent leurs nombres de la table du bloc 50 614 000", () => {
    expect(TABLE.block_number).toBe(50614000);
    expect(TABLE.chain_id).toBe(8453);
    for (const nom of ["stop", "substitution"] as const) {
      const p = ACTES[nom].porte;
      expect(p.block_number).toBe(50614000);
      const brut = TABLE.pools[p.pool_id]!.dirs[p.sens]!.find((x) => x.amount_in === p.taille_wei)!;
      expect(p.bps).toBe(brut.bps);
      expect(p.etiquette).toBe(brut.label);
    }
  });

  it("acte stop : le hook annonce, le prelevement annonce, et aucune alternative", () => {
    const p = ACTES.stop.porte;
    expect(p.hook).toBe("0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc");
    expect(p.bps).not.toBeNull();
    expect(p.bps!.toFixed(2)).toBe("9999.53");
    expect(p.taille_wei).toBe("1000000000000");
    expect(ACTES.stop.meilleure_porte).toBeNull();
    expect(ACTES.stop.etat).toBe("PORTE_UNIQUE");
  });

  it("acte substitution : ETH -> USDC, 4.0933 bps contre 0 bps, meme sens et meme taille", () => {
    const a = ACTES.substitution;
    expect(a.porte.monnaie_entree).toBe(ADRESSE_NULLE);
    expect(a.porte.monnaie_sortie).toBe(USDC_BASE);
    expect(a.porte.native).toBe(true);
    expect(a.porte.bps).toBe(4.0933);
    expect(a.meilleure_porte!.bps).toBe(0);
    expect(a.porte.sens).toBe("0->1");
    expect(a.meilleure_porte!.sens).toBe("0->1");
    expect(a.porte.taille_wei).toBe(a.meilleure_porte!.taille_wei);
    expect(a.economie_bps).toBe(4.0933);
    expect(a.etat).toBe("MEILLEURE_PORTE");
  });

  it("un point non mesure rend null et un motif — jamais zero", () => {
    // meme pool, sens inverse : le corpus le donne NOT_MEASURABLE / NOT_QUOTABLE
    const p = lirePorte(ACTES.substitution.porte.pool_id, "1->0", TAILLE_WEI);
    expect(p.bps).toBeNull();
    expect(p.motif).not.toBeNull();
    expect(champTake(p)).toBe("non mesure — ce n'est pas zero");
  });
});

describe("le message EIP-712", () => {
  it("porte le type du depot, sans le reinventer", () => {
    const m = construireMessage("stop");
    expect(m.typed.primaryType).toBe(TARE_GUARD_PRIMARY_TYPE);
    expect(m.typed.types).toBe(TARE_GUARD_TYPES);
    expect(Object.keys(m.typed.message)).toEqual([
      "verdict",
      "summary",
      "swaps",
      "dataset",
      "measuredAtBlock",
      "freshness",
      "warnings",
      "promptDigest",
    ]);
  });

  it("acte stop : verdict BLOCK et le prelevement du corpus a l'ecran", () => {
    const m = construireMessage("stop");
    const msg = m.typed.message as Record<string, unknown>;
    expect(msg.verdict).toBe("BLOCK");
    expect(msg.measuredAtBlock).toBe(50614000);
    const swaps = msg.swaps as Array<Record<string, string>>;
    expect(swaps).toHaveLength(1);
    expect(swaps[0]!.take).toBe("9999.53 bps");
    expect(swaps[0]!.hook).toBe("0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc");
    expect(String(msg.promptDigest)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("acte substitution : les deux portes sont affichees, l'actuelle puis la proposee", () => {
    const swaps = (construireMessage("substitution").typed.message as Record<string, unknown>)
      .swaps as Array<Record<string, string>>;
    expect(swaps).toHaveLength(2);
    expect(swaps[0]!.take).toBe("4.09 bps");
    expect(swaps[1]!.take).toBe("0.00 bps");
  });

  it("un message deja mis en champs est recopie, pas reecrit", () => {
    const m = construireMessage({
      verdict: "warn",
      summary: "phrase de la page",
      swaps: [
        {
          hook: "0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc",
          poolId: "0xdc3539d6012cafa36bb679c3b268ce1aed33d5dbce7fc170f7730686886c135d",
          take: "9999.53 bps",
          label: "MEASURED",
          size: "1000000000000 en entree",
          direction: "1->0",
        },
      ],
    });
    const msg = m.typed.message as Record<string, unknown>;
    expect(m.source).toBe("message_fourni");
    expect(msg.verdict).toBe("WARN");
    expect(msg.summary).toBe("phrase de la page");
    expect((msg.swaps as unknown[])).toHaveLength(1);
  });

  it("un hook qui n'est pas une adresse est refuse, pas corrige en silence", () => {
    expect(() => construireMessage({ swaps: [{ hook: "pas-une-adresse", poolId: "0x" + "00".repeat(32) }] })).toThrow(
      /hook n'est pas une adresse/,
    );
  });
});

describe("la transaction rendue", () => {
  it("le destinataire est l'Universal Router de Base", () => {
    expect(UNIVERSAL_ROUTER_BASE).toBe("0x6ff5693b99212da76ad316178a184ab56d299b43");
  });

  it("acte substitution : la monnaie d'entree est l'ETH natif, donc value porte le montant", () => {
    expect(ACTES.substitution.porte.native).toBe(true);
  });

  it("acte stop : la monnaie d'entree est un ERC-20, donc value vaut 0x0", () => {
    expect(ACTES.stop.porte.native).toBe(false);
    expect(ACTES.stop.porte.monnaie_entree).toBe("0xdc4f058c103f3879fea72d0fc86eded309f43b07");
  });
});
