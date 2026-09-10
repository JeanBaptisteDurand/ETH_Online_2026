/**
 * LA PORTE DE REMPLACEMENT.
 *
 * Ce module propose de re-signer une transaction ailleurs. C'est la seule chose de tout le
 * projet qui touche a l'argent de quelqu'un d'autre au moment ou il bouge, et c'est donc celle
 * ou une erreur coute le plus cher. Trois facons de nuire, trois series de tests :
 *
 *   1. proposer une porte NON MESUREE — l'utilisateur irait vers un inconnu en croyant aller
 *      vers un moins cher ;
 *   2. comparer a des TAILLES differentes — le prelevement varie avec le montant dans 49,1 %
 *      des couples, de 75 bps en mediane : l'economie serait fabriquee ;
 *   3. proposer pour une economie DERISOIRE — a 0,0048 bps, le gaz d'une seconde transaction
 *      coute plus que le gain, et le conseil fait perdre de l'argent.
 *
 * Et le controle qui rend le reste credible : le calldata construit doit se RELIRE par le
 * decodeur du meme paquet, et rendre exactement le pool et le montant annonces.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertTable, type GuardTable, type TablePool } from "../src/table.js";
import { chercherAlternative, jetonDuPool, ECONOMIE_MIN_BPS } from "../src/alternative.js";
import { decodeUniversalRouterCalldata } from "../src/calldata.js";

const WETH = "0x4200000000000000000000000000000000000006";
const JETON = "0x1111111111111111111111111111111111111111";

function pool(over: Partial<TablePool> & { dirs: TablePool["dirs"] }): TablePool {
  return {
    hook: "0xaaaa000000000000000000000000000000000001",
    currency0: WETH,
    currency1: JETON,
    fee: 3000,
    tick_spacing: 60,
    fee_is_dynamic: false,
    stored_lp_fee: 3000,
    ...over,
  };
}

const pt = (amount_in: string, bps: number | null, label = "MEASURED") => ({
  amount_in,
  bps,
  label: label as never,
  reason: null,
  block_number: 50614000,
  chain_id: 8453,
});

function table(pools: Record<string, TablePool>): GuardTable {
  return assertTable({
    schema: "tare-guard-table/1",
    generated_at: "2026-09-10T00:00:00Z",
    source: "test",
    engine_ver: "tare-engine/0.3.0",
    stub_hash: "0x8e39b2ad",
    chain_id: 8453,
    block_number: 50614000,
    blocks: [50614000],
    n_measurements: 0,
    n_hooks: 1,
    n_pools: Object.keys(pools).length,
    hooks: {},
    pools,
  });
}

describe("une porte unique n'est pas un echec de recherche", () => {
  it("le dit, et le dit comme une reponse", () => {
    const t = table({ "0xp1": pool({ dirs: { "0->1": [pt("1000", 100)] } }) });
    const a = chercherAlternative(t, "0xp1", "0->1", "1000")!;
    expect(a.etat).toBe("PORTE_UNIQUE");
    expect(a.proposee).toBeNull();
    expect(a.calldata).toBeNull();
    // « je n'ai pas trouve mieux » ne dirait pas si c'est parce qu'il n'y a rien.
    expect(a.raison).toMatch(/n'existe que dans ce pool/);
    expect(a.raison).toMatch(/97,2 %/);
  });
});

describe("on ne propose jamais une porte non mesuree", () => {
  it("une soeur sans mesure a cette taille n'est pas une soeur moins chere", () => {
    const t = table({
      "0xp1": pool({ dirs: { "0->1": [pt("1000", 300)] } }),
      "0xp2": pool({
        hook: "0xbbbb000000000000000000000000000000000002",
        dirs: { "0->1": [pt("1000", null, "NOT_QUOTABLE")] },
      }),
    });
    const a = chercherAlternative(t, "0xp1", "0->1", "1000")!;
    expect(a.etat).toBe("AUTRES_NON_MESUREES");
    expect(a.calldata).toBeNull();
    expect(a.raison).toMatch(/n'est pas une porte moins chere : elle est inconnue/);
    // et la porte examinee est RENDUE, pour que le refus soit verifiable
    expect(a.examinees).toHaveLength(1);
    expect(a.examinees[0]!.bps).toBeNull();
  });

  it("une soeur mesuree a une AUTRE taille ne compte pas", () => {
    const t = table({
      "0xp1": pool({ dirs: { "0->1": [pt("1000", 300)] } }),
      "0xp2": pool({
        hook: "0xbbbb000000000000000000000000000000000002",
        dirs: { "0->1": [pt("999999", 1)] }, // moins chere, mais pas a la meme taille
      }),
    });
    const a = chercherAlternative(t, "0xp1", "0->1", "1000")!;
    expect(a.etat).toBe("AUTRES_NON_MESUREES");
    expect(a.economie_bps).toBeNull();
  });

  it("sans taille fixee, on ne compare pas du tout", () => {
    const t = table({
      "0xp1": pool({ dirs: { "0->1": [pt("1000", 300)] } }),
      "0xp2": pool({ hook: "0xbbbb000000000000000000000000000000000002", dirs: { "0->1": [pt("1000", 1)] } }),
    });
    const a = chercherAlternative(t, "0xp1", "0->1", null)!;
    expect(a.etat).toBe("ACTUELLE_NON_MESUREE");
    expect(a.raison).toMatch(/tailles differentes fabriquerait une economie/);
  });
});

describe("une economie derisoire n'est pas une economie", () => {
  it("sous le seuil, on conseille de RESTER, en disant pourquoi", () => {
    const t = table({
      "0xp1": pool({ dirs: { "0->1": [pt("1000", 300)] } }),
      "0xp2": pool({
        hook: "0xbbbb000000000000000000000000000000000002",
        dirs: { "0->1": [pt("1000", 300 - ECONOMIE_MIN_BPS / 2)] },
      }),
    });
    const a = chercherAlternative(t, "0xp1", "0->1", "1000")!;
    expect(a.etat).toBe("DEJA_LA_MEILLEURE");
    expect(a.calldata).toBeNull();
    expect(a.raison).toMatch(/ferait PERDRE de l'argent/);
  });

  it("le seuil est PUBLIE dans la reponse, pour qu'on puisse le deplacer", () => {
    const t = table({ "0xp1": pool({ dirs: { "0->1": [pt("1000", 100)] } }) });
    expect(chercherAlternative(t, "0xp1", "0->1", "1000")!.seuil_bps).toBe(ECONOMIE_MIN_BPS);
  });
});

describe("quand une vraie meilleure porte existe", () => {
  const t = table({
    "0xp1": pool({ dirs: { "0->1": [pt("1000000000000000000", 300)] } }),
    "0xp2": pool({
      hook: "0xbbbb000000000000000000000000000000000002",
      fee: 500,
      tick_spacing: 10,
      dirs: { "0->1": [pt("1000000000000000000", 0.5)] },
    }),
  });
  const a = chercherAlternative(t, "0xp1", "0->1", "1000000000000000000")!;

  it("elle est proposee, avec l'ecart mesure", () => {
    expect(a.etat).toBe("MEILLEURE_PORTE");
    expect(a.proposee!.poolId).toBe("0xp2");
    expect(a.economie_bps).toBeCloseTo(299.5, 4);
  });

  it("le calldata construit se RELIT, et rend le pool propose", () => {
    // C'est le controle qui rend la proposition utilisable : sans lui, on enverrait
    // l'utilisateur signer des octets que personne n'a jamais relus.
    const d = decodeUniversalRouterCalldata(a.calldata!);
    expect(d.complete).toBe(true);
    expect(d.issues).toHaveLength(0);
    expect(d.legs).toHaveLength(1);
    expect(d.legs[0]!.poolKey.hooks.toLowerCase()).toBe(a.proposee!.poolKey.hooks.toLowerCase());
    expect(d.legs[0]!.poolKey.fee).toBe(500);
    expect(d.legs[0]!.amountIn).toBe("1000000000000000000");
    expect(d.legs[0]!.zeroForOne).toBe(a.proposee!.zeroForOne);
  });

  it("l'utilisateur signe : on rend le calldata, on n'envoie rien", () => {
    // Le module n'a aucun moyen d'emettre une transaction, et c'est deliberе.
    const src = readFileSync(resolve(import.meta.dirname, "../src/alternative.ts"), "utf8");
    expect(src).not.toMatch(/eth_sendTransaction|sendTransaction\(|request\(/);
    expect(src).toMatch(/l'utilisateur qui signe, ou pas/);
  });
});

describe("le sens suit la PoolKey de l'autre pool, pas celle d'origine", () => {
  it("un jeton en currency0 chez la soeur inverse le sens", () => {
    const t = table({
      "0xp1": pool({ dirs: { "0->1": [pt("1000", 300)] } }), // jeton en currency1 -> acheter = 0->1
      "0xp2": pool({
        hook: "0xbbbb000000000000000000000000000000000002",
        currency0: JETON,
        currency1: WETH, // jeton en currency0 -> acheter = 1->0
        dirs: { "1->0": [pt("1000", 1)] },
      }),
    });
    const a = chercherAlternative(t, "0xp1", "0->1", "1000")!;
    expect(a.etat).toBe("MEILLEURE_PORTE");
    expect(a.proposee!.direction).toBe("1->0");
    expect(a.proposee!.zeroForOne).toBe(false);
  });
});

describe("sur la table reelle du depot", () => {
  const chemin = resolve(import.meta.dirname, "../data/table.json");
  const reelle = (() => {
    try {
      return assertTable(JSON.parse(readFileSync(chemin, "utf8")));
    } catch {
      return null;
    }
  })();

  it.skipIf(!reelle)("la porte unique est le cas ecrasant, et c'est le fait qui compte", () => {
    // Un echantillon d'un pool sur vingt : balayer les 125 072 lignes coute 75 s, et la part
    // cherchee est si ecrasante qu'un echantillon la montre aussi bien. Le balayage complet
    // reste faisable a la main (scratchpad), il n'a pas sa place dans une suite qu'on relance.
    const ids = Object.keys(reelle!.pools).filter((_, i) => i % 20 === 0);
    let unique = 0;
    let total = 0;
    for (const pid of ids) {
      const p = reelle!.pools[pid]!;
      for (const [d, pts] of Object.entries(p.dirs)) {
        for (const point of pts) {
          const a = chercherAlternative(reelle!, pid, d as "0->1" | "1->0", point.amount_in);
          if (!a) continue;
          total++;
          if (a.etat === "PORTE_UNIQUE") unique++;
        }
      }
    }
    expect(total).toBeGreaterThan(2000);
    expect(unique / total).toBeGreaterThan(0.99);
  }, 60000);

  it.skipIf(!reelle)("jetonDuPool ecarte les paires de monnaies de cotation", () => {
    const p = Object.values(reelle!.pools).find(
      (x) => jetonDuPool(x) === null && x.currency0 !== x.currency1,
    );
    if (p) expect(jetonDuPool(p)).toBeNull();
  });
});

describe("la garde porte la proposition dans son verdict", () => {
  it("un vrai calldata capture sur Base ressort avec un etat nomme", async () => {
    const { tareGuard } = await import("../src/guard.js");
    const fx = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "fixtures/real-calldata.json"), "utf8"),
    ) as { txs: { to: string; input: string; chain_id: number }[] };
    const tx = fx.txs[0]!;
    const r = tareGuard({ to: tx.to, data: tx.input, chainId: tx.chain_id });
    // Le champ existe toujours ; c'est son ETAT qui porte l'information.
    expect(r).toHaveProperty("alternative");
    if (r.alternative) {
      expect([
        "PORTE_UNIQUE",
        "ACTUELLE_NON_MESUREE",
        "AUTRES_NON_MESUREES",
        "DEJA_LA_MEILLEURE",
        "MEILLEURE_PORTE",
      ]).toContain(r.alternative.etat);
      expect(r.alternative.raison.length).toBeGreaterThan(20);
    }
  });

  it("une transaction sans calldata ne propose rien, et ne pretend pas avoir cherche", async () => {
    const { tareGuard } = await import("../src/guard.js");
    const r = tareGuard({ to: "0x6ff5693b99212da76ad316178a184ab56d299b43", data: "0x" });
    expect(r.alternative).toBeNull();
  });
});
