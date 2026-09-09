/**
 * La fiche d'un jeton — la seule route utilisable sans rien connaitre du protocole.
 *
 * Le test central est celui du SENS. Si « acheter » et « vendre » sont inverses, la fiche
 * donne le conseil contraire : elle dirait « tu peux en sortir gratuitement » d'un jeton
 * qui confisque a la sortie. C'est le pire defaut possible pour cet outil, et c'est une
 * simple erreur de signe.
 */
import { describe, it, expect } from "vitest";
import { buildTokenSheet, isQuoteCurrency, QUOTE_CURRENCIES } from "../src/token.js";
import type { RegistryEntry } from "../src/dataset.js";

const WETH = "0x4200000000000000000000000000000000000006";
const JETON = "0xb20000000000000000000090aa1082ce28905f01";

/** Une mesure minimale, avec ce que buildTokenSheet lit reellement. */
function m(over: Record<string, unknown> = {}) {
  return {
    id: "m_" + String(over.amount_in ?? "1") + String(over.zero_for_one ?? "t"),
    hook: "0x9ce0e33e68c7bfc035b31961e4f1ddc55f0c0145",
    pool_id: "0x" + "bb".repeat(32),
    currency0: WETH,
    currency1: JETON,
    block_number: 50614000,
    amount_in: "1000000000000",
    zero_for_one: true,
    direction: "0->1",
    bps: 0,
    label: "MEASURED",
    replay: { command_exact: "python3 …" },
    ...over,
  } as never;
}

const vide = new Map<string, RegistryEntry>();

describe("le sens : acheter, ou vendre", () => {
  it("le jeton est currency1 : l'ACHETER c'est aller de 0 vers 1", () => {
    const rows = [
      m({ zero_for_one: true, bps: 0, amount_in: "1000" }),
      m({ zero_for_one: false, bps: 9990, amount_in: "1000" }),
    ];
    const f = buildTokenSheet(JETON, rows, vide);
    expect(f.tu_achetes?.direction).toBe("0->1");
    expect(f.tu_achetes?.max_bps).toBe(0);
    expect(f.tu_vends?.direction).toBe("1->0");
    expect(f.tu_vends?.max_bps).toBe(9990);
  });

  it("le jeton est currency0 : le sens s'inverse", () => {
    const rows = [
      m({ currency0: JETON, currency1: WETH, zero_for_one: true, bps: 9990 }),
      m({ currency0: JETON, currency1: WETH, zero_for_one: false, bps: 0 }),
    ];
    const f = buildTokenSheet(JETON, rows, vide);
    // vendre le jeton = le donner = partir de lui = 0->1 quand il est currency0
    expect(f.tu_vends?.direction).toBe("0->1");
    expect(f.tu_vends?.max_bps).toBe(9990);
    expect(f.tu_achetes?.max_bps).toBe(0);
  });

  it("nomme la monnaie de cotation en face", () => {
    const f = buildTokenSheet(JETON, [m()], vide);
    expect(f.against?.symbol).toBe("WETH");
  });
});

describe("les alertes", () => {
  it("signale l'asymetrie, et dans le bon sens", () => {
    const rows = [
      m({ zero_for_one: true, bps: 0 }),
      m({ zero_for_one: false, bps: 9990 }),
    ];
    const f = buildTokenSheet(JETON, rows, vide);
    const asym = f.alertes.find((a) => /ASYMETRIE/.test(a));
    expect(asym).toBeTruthy();
    expect(asym).toMatch(/plus cher d'en sortir/);
  });

  it("signale un cout qui varie avec la taille", () => {
    const rows = [
      m({ zero_for_one: true, bps: 0, amount_in: "1000" }),
      m({ zero_for_one: true, bps: 9990, amount_in: "100000" }),
    ];
    const f = buildTokenSheet(JETON, rows, vide);
    expect(f.tu_achetes?.varies_with_size).toBe(true);
    expect(f.alertes.some((a) => /change avec la taille/.test(a))).toBe(true);
  });

  it("dit qu'un seul sens est mesure — sans rendre l'autre a zero", () => {
    const f = buildTokenSheet(JETON, [m({ zero_for_one: true, bps: 42 })], vide);
    expect(f.tu_vends).toBeNull();
    expect(f.alertes.some((a) => /NON MESURE/.test(a))).toBe(true);
  });

  it("signale un hook absent du registre — l'absence de declaration EST une information", () => {
    const f = buildTokenSheet(JETON, [m()], vide);
    expect(f.platform).toBeNull();
    expect(f.platform_declared).toBe(false);
    expect(f.alertes.some((a) => /pas decrit au registre/.test(a))).toBe(true);
  });

  it("rend le nom declare quand le registre le porte", () => {
    const reg = new Map<string, RegistryEntry>([
      [
        "0x9ce0e33e68c7bfc035b31961e4f1ddc55f0c0145",
        { address: "0x9ce0e33e68c7bfc035b31961e4f1ddc55f0c0145", fields: { hook: { name: "Zora Hook" } } },
      ],
    ]);
    const f = buildTokenSheet(JETON, [m()], reg);
    expect(f.platform).toBe("Zora Hook");
    expect(f.platform_declared).toBe(true);
  });
});

describe("aucune etiquette promue", () => {
  it("une ligne NON COTABLE ne devient jamais un point mesure", () => {
    const rows = [
      m({ zero_for_one: true, bps: null, label: "NOT_QUOTABLE" }),
      m({ zero_for_one: true, bps: 12, label: "MEASURED", amount_in: "99" }),
    ];
    const f = buildTokenSheet(JETON, rows, vide);
    expect(f.tu_achetes?.sizes).toBe(1);
    expect(f.non_chiffre.NOT_QUOTABLE).toBe(1);
  });

  it("chaque point porte sa commande de rejeu", () => {
    const f = buildTokenSheet(JETON, [m({ bps: 7 })], vide);
    expect(f.tu_achetes?.points[0]?.replay).toContain("python3");
    expect(f.tu_achetes?.points[0]?.measurement_id).toBeTruthy();
  });
});

describe("les monnaies de cotation", () => {
  it("ETH, WETH et USDC sont reconnues", () => {
    for (const a of Object.keys(QUOTE_CURRENCIES)) expect(isQuoteCurrency(a)).toBe(true);
    expect(isQuoteCurrency(JETON)).toBe(false);
  });
  it("la casse n'a pas d'importance", () => {
    expect(isQuoteCurrency(WETH.toUpperCase().replace("0X", "0x"))).toBe(true);
  });
});
