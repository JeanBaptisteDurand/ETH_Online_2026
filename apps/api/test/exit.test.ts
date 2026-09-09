/**
 * LE TEST DE SORTIE. Un seul nombre, donc une seule occasion de mentir.
 *
 * Trois choses doivent tenir, et chacune correspond a une facon precise de tromper :
 *   - composer un sens mesure avec un sens INCONNU rendrait un nombre faux et rassurant ;
 *   - rendre une valeur unique la ou on ne connait qu'une plage cacherait l'incertitude ;
 *   - annoncer un intervalle dont les deux bornes s'affichent pareil userait la confiance
 *     pour rien.
 */
import { describe, it, expect } from "vitest";
import { buildExitTest, phrase, type ExitTest } from "../src/exit.js";

const WETH = "0x4200000000000000000000000000000000000006";
const JETON = "0xb20000000000000000000090aa1082ce28905f01";

function m(over: Record<string, unknown> = {}) {
  return {
    id: "m_" + String(over.amount_in ?? "1") + String(over.zero_for_one ?? "t") + String(over.bps ?? ""),
    hook: "0x9ce0e33e68c7bfc035b31961e4f1ddc55f0c0145",
    pool_id: "0x" + "bb".repeat(32),
    currency0: WETH,
    currency1: JETON,
    block_number: 50614000,
    amount_in: "1000000000000",
    zero_for_one: true,
    direction: "0->1",
    bps: 0,
    stored_lp_fee: 0,
    label: "MEASURED",
    replay: "python3 …",
    ...over,
  } as never;
}
const ok = (r: unknown): ExitTest => {
  expect(r).not.toHaveProperty("refus");
  return r as ExitTest;
};

describe("composer deux sens mesures", () => {
  it("100 bps a l'achat et 100 a la revente laissent 98,01 %", () => {
    const t = ok(
      buildExitTest(JETON, [
        m({ zero_for_one: true, bps: 100 }),
        m({ zero_for_one: false, bps: 100 }),
      ]),
    );
    expect(t.pire.garde_min).toBeCloseTo(0.9801, 6);
    expect(phrase(t, 100)).toBe("tu mets 100 EUR, il te reste 98.01 EUR");
  });

  it("ajoute les frais LP au prelevement du hook", () => {
    const t = ok(
      buildExitTest(JETON, [
        m({ zero_for_one: true, bps: 0, stored_lp_fee: 3000 }), // 30 bps
        m({ zero_for_one: false, bps: 0, stored_lp_fee: 3000 }),
      ]),
    );
    expect(t.pire.achat.total_bps).toBeCloseTo(30, 6);
    expect(t.pire.garde_min).toBeCloseTo(0.997 * 0.997, 6);
  });

  it("un prelevement au-dela de 100 % borne a zero, jamais un negatif", () => {
    const t = ok(
      buildExitTest(JETON, [
        m({ zero_for_one: true, bps: 0, stored_lp_fee: 3000 }),
        m({ zero_for_one: false, bps: 9999, stored_lp_fee: 3000 }), // 10029 bps
      ]),
    );
    expect(t.pire.garde_min).toBe(0);
    expect(phrase(t, 100)).toBe("tu mets 100 EUR, il te reste 0.00 EUR");
  });
});

describe("l'intervalle, et quand il disparait", () => {
  it("une revente qui VARIE donne un intervalle — la trappe", () => {
    const t = ok(
      buildExitTest(JETON, [
        m({ zero_for_one: true, bps: 0, stored_lp_fee: 100 }),
        m({ zero_for_one: false, bps: 0, amount_in: "1000" }),
        m({ zero_for_one: false, bps: 9990, amount_in: "100000" }),
      ]),
    );
    expect(t.pire.exact).toBe(false);
    expect(t.pire.garde_min).toBeLessThan(0.01);
    expect(t.pire.garde_max).toBeGreaterThan(0.99);
    // l'achat coute 1 bps, la revente 0 au mieux et 9990 au pire : de presque tout a presque rien
    expect(phrase(t, 100)).toBe("tu mets 100 EUR, il te reste entre 0.10 et 99.99 EUR");
  });

  it("deux bornes qui s'affichent pareil ne s'annoncent pas comme un intervalle", () => {
    // 99,9999 et 100,0000 bps donnent le meme centime : « entre 98.01 et 98.01 » annoncerait
    // une incertitude que le lecteur ne voit pas.
    const t = ok(
      buildExitTest(JETON, [
        m({ zero_for_one: true, bps: 100 }),
        m({ zero_for_one: false, bps: 99.9999, amount_in: "1000" }),
        m({ zero_for_one: false, bps: 100, amount_in: "100000" }),
      ]),
    );
    expect(t.pire.exact).toBe(true);
    expect(phrase(t, 100)).not.toMatch(/entre/);
  });

  it("le point retenu est le PIRE, pas le premier ni la moyenne", () => {
    const t = ok(
      buildExitTest(JETON, [
        m({ zero_for_one: true, bps: 10, amount_in: "1000" }),
        m({ zero_for_one: true, bps: 5000, amount_in: "100000" }),
        m({ zero_for_one: false, bps: 0 }),
      ]),
    );
    expect(t.pire.achat.total_bps).toBeCloseTo(5000, 6);
    expect(t.points).toHaveLength(2);
  });
});

describe("le refus, quand un sens manque", () => {
  it("refuse quand seul l'achat est mesure — l'inconnu n'est pas zero", () => {
    const r = buildExitTest(JETON, [m({ zero_for_one: true, bps: 42 })]);
    expect(r).toHaveProperty("refus");
    if ("refus" in r) {
      expect(r.raison).toMatch(/INCONNU/);
      expect(r.sens_mesures).toEqual(["achat"]);
    }
  });

  it("refuse quand aucune mesure ne porte de nombre", () => {
    const r = buildExitTest(JETON, [
      m({ zero_for_one: true, bps: null, label: "NOT_QUOTABLE" }),
      m({ zero_for_one: false, bps: null, label: "NOT_MEASURABLE" }),
    ]);
    expect(r).toHaveProperty("refus");
    if ("refus" in r) expect(r.sens_mesures).toEqual([]);
  });
});

describe("le sens de l'achat suit la PoolKey", () => {
  it("jeton en currency0 : l'acheter c'est aller de 1 vers 0", () => {
    const t = ok(
      buildExitTest(JETON, [
        m({ currency0: JETON, currency1: WETH, zero_for_one: false, bps: 10 }),
        m({ currency0: JETON, currency1: WETH, zero_for_one: true, bps: 9000 }),
      ]),
    );
    expect(t.pire.achat.total_bps).toBeCloseTo(10, 6); // l'achat est le sens 1->0
    expect(t.pire.revente.pire.total_bps).toBeCloseTo(9000, 6);
  });
});

describe("les limites sont toujours dites", () => {
  it("nomme l'impact de prix ignore et la taille de revente inconnue", () => {
    const t = ok(
      buildExitTest(JETON, [m({ zero_for_one: true, bps: 1 }), m({ zero_for_one: false, bps: 1 })]),
    );
    expect(t.limites.join(" ")).toMatch(/impact de prix/);
    expect(t.limites.join(" ")).toMatch(/taille de revente est inconnue/);
    expect(t.limites.join(" ")).toMatch(/un seul bloc/);
  });
});

describe("un frais LP non lu n'est pas un frais LP nul", () => {
  // `stored_lp_fee: null` veut dire « slot0 non relu », pas « pas de frais LP ». Le passer a
  // zero rendrait un montant de sortie trop FLATTEUR, et il aurait l'air d'une mesure — c'est
  // exactement la substitution que tout le reste du moteur refuse. Aucune ligne MEASURED du
  // corpus n'est dans ce cas aujourd'hui (14 lignes sur 125 072 ont un frais nul, toutes
  // NOT_QUOTABLE ou NOT_MEASURABLE) ; la garde vaut pour le jour ou le moteur en produira une.
  it("la ligne sort du calcul, et le sens devient non mesure", () => {
    const r = buildExitTest(JETON, [
      m({ zero_for_one: true, bps: 100 }),
      m({ zero_for_one: false, bps: 100, stored_lp_fee: null }),
    ]);
    expect(r).toHaveProperty("refus");
    expect((r as { sens_mesures: string[] }).sens_mesures).toEqual(["achat"]);
  });

  it("elle ne devient pas non plus la meilleure revente de l'intervalle", () => {
    const t = ok(
      buildExitTest(JETON, [
        m({ zero_for_one: true, bps: 100 }),
        m({ zero_for_one: false, bps: 100, stored_lp_fee: 3000, amount_in: "1" }),
        m({ zero_for_one: false, bps: 100, stored_lp_fee: null, amount_in: "2" }),
      ]),
    );
    // Sans la garde, la ligne a null serait lue « 0 bps de frais LP », deviendrait la
    // meilleure revente, et l'intervalle s'ouvrirait vers un chiffre que rien n'a mesure.
    expect(t.pire.revente.meilleure.total_bps).toBeCloseTo(130, 6);
    expect(t.pire.exact).toBe(true);
  });
});
