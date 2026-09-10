/**
 * LES SEUILS SONT UN CHOIX DE PRODUIT, ET UN SEUIL MAL POSE DESINSTALLE LA GARDE.
 *
 * Ils valaient 25 et 100 bps, en absolu. Le commentaire qui portait le second admettait le
 * probleme sans en tirer la consequence : « la mediane du jeu TARE est exactement a 100 bps,
 * ce n'est pas un cas rare ». Mesure faite sur le corpus : la garde affichait alors `block`
 * sur 49,6 % des lignes mesurees et 51,1 % des couples (pool, sens).
 *
 * Un garde qui bloque plus d'une transaction sur deux ne protege personne : il apprend a
 * l'utilisateur a l'ignorer, puis a le desinstaller. Une alerte qui se declenche toujours ne
 * previent plus de rien.
 *
 * Ces tests tiennent la regle qui remplace le chiffre rond : le seuil est un CENTILE du
 * corpus, il est recalcule a chaque construction de la table, et la part bloquee reste dans
 * une fourchette qu'on assume. C'est le seul test du depot dont l'invariant est le
 * COMPORTEMENT du produit et pas la correction du code.
 */
import { describe, it, expect } from "vitest";
import { TABLE } from "../src/guard.js";
import { thresholdsFor, gradeBps, DEFAULT_THRESHOLDS } from "../src/verdict.js";

/** Toutes les valeurs chiffrees de la table, dans l'ordre. */
function mesures(): number[] {
  const v: number[] = [];
  for (const p of Object.values(TABLE.pools))
    for (const pts of Object.values(p.dirs))
      for (const pt of pts) if (pt.label === "MEASURED" && typeof pt.bps === "number") v.push(pt.bps);
  return v.sort((a, b) => a - b);
}

/** La mediane par couple (pool, sens) : ce qu'un utilisateur rencontre reellement. */
function medianesParCouple(): number[] {
  const out: number[] = [];
  for (const p of Object.values(TABLE.pools))
    for (const pts of Object.values(p.dirs)) {
      const v = pts.filter((x) => x.label === "MEASURED" && typeof x.bps === "number").map((x) => x.bps as number).sort((a, b) => a - b);
      if (v.length) out.push(v[v.length >> 1]!);
    }
  return out;
}

describe("les seuils viennent de la table, pas du code", () => {
  it("la table porte ses propres centiles", () => {
    expect(TABLE.seuils).toBeDefined();
    expect(TABLE.seuils!.warn_bps).toBeTypeOf("number");
    expect(TABLE.seuils!.block_bps).toBeTypeOf("number");
    expect(TABLE.seuils!.derives_de).toBeGreaterThan(1000);
  });

  it("ce sont bien le 90e et le 99e centile, recalcules ici", () => {
    const v = mesures();
    const c = (q: number) => v[Math.min(v.length - 1, Math.floor((v.length * q) / 100))]!;
    expect(TABLE.seuils!.warn_bps).toBeCloseTo(c(90), 4);
    expect(TABLE.seuils!.block_bps).toBeCloseTo(c(99), 4);
  });

  it("thresholdsFor prefere la table, et dit d'ou vient le verdict", () => {
    const t = thresholdsFor(TABLE);
    expect(t.source).toBe("table");
    expect(t.warnBps).toBe(TABLE.seuils!.warn_bps);
    const repli = thresholdsFor({ seuils: undefined });
    expect(repli.source).toBe("repli");
    expect(repli.derivesDe).toBeNull();
  });

  it("le repli n'est pas un chiffre rond : ce sont les centiles du corpus", () => {
    // 25 et 100 etaient des chiffres ronds, et c'est ce qui les rendait faux.
    expect(DEFAULT_THRESHOLDS.warnBps).not.toBe(25);
    expect(DEFAULT_THRESHOLDS.blockBps).not.toBe(100);
    const v = mesures();
    const p90 = v[Math.floor(v.length * 0.9)]!;
    expect(Math.abs(DEFAULT_THRESHOLDS.warnBps - p90)).toBeLessThan(5);
  });
});

describe("la garde ne doit pas crier au loup", () => {
  it("elle bloque au plus 3 % des mesures — l'ancien seuil en bloquait 49,6 %", () => {
    const v = mesures();
    const t = thresholdsFor(TABLE);
    const bloques = v.filter((b) => gradeBps(b, t) === "block").length;
    const part = bloques / v.length;
    expect(part).toBeLessThan(0.03);
    // et elle doit quand meme bloquer QUELQUE CHOSE : un garde qui ne bloque jamais est un
    // garde decoratif, et le corpus contient de vrais pieges a 9 999 bps.
    expect(part).toBeGreaterThan(0.001);
  });

  it("elle bloque au plus 5 % des couples (pool, sens) — l'ancien en bloquait 51,1 %", () => {
    const med = medianesParCouple();
    const t = thresholdsFor(TABLE);
    const part = med.filter((b) => gradeBps(b, t) === "block").length / med.length;
    expect(part).toBeLessThan(0.05);
  });

  it("la transaction MEDIANE du corpus n'est jamais bloquee", () => {
    // C'est la regression precise a interdire : l'ancien block etait a 100 et la mediane
    // vaut 99,9999. Un garde qui bloque le cas le plus courant se fait desinstaller.
    const v = mesures();
    const mediane = v[v.length >> 1]!;
    expect(gradeBps(mediane, thresholdsFor(TABLE))).not.toBe("block");
  });

  it("elle laisse passer sans rien dire la majorite des mesures", () => {
    const v = mesures();
    const t = thresholdsFor(TABLE);
    const ok = v.filter((b) => gradeBps(b, t) === "ok").length / v.length;
    expect(ok).toBeGreaterThan(0.6);
  });
});

describe("les vrais pieges restent bloques", () => {
  it("un pool a 9 999 bps est bloque, sinon le seuil ne sert a rien", () => {
    expect(gradeBps(9999, thresholdsFor(TABLE))).toBe("block");
  });

  it("l'ordre des verdicts est monotone en bps", () => {
    const t = thresholdsFor(TABLE);
    const rang = { ok: 0, warn: 1, block: 2 } as const;
    let dernier = 0;
    for (const b of [0, 1, 50, 119, 120, 250, 300, 1000, 9999]) {
      const r = rang[gradeBps(b, t) as keyof typeof rang];
      expect(r).toBeGreaterThanOrEqual(dernier);
      dernier = r;
    }
  });
});
