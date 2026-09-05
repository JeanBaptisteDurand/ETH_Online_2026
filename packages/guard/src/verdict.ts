/**
 * Du chiffre au verdict.
 *
 * Le verdict est un JUGEMENT, pas une mesure : il a le droit de s'appuyer sur un faisceau
 * ("ce hook a pris 1176 bps sur un autre pool"), a condition de dire sur quoi il s'appuie.
 * C'est le role du champ `basis`. Ce qui n'a pas le droit d'etre invente, c'est le NOMBRE :
 * `bps` reste null des que l'etiquette ne peut pas le porter.
 *
 * Un hook inconnu n'est pas un hook inoffensif. Absent de la table -> 'warn', jamais 'ok'.
 */
import type { Consultation } from "./table.js";
import type { Verdict } from "./types.js";

export interface Thresholds {
  warnBps: number;
  blockBps: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  /** 25 bps : au-dela des 0,3 % d'un pool v2 ordinaire une fois retiree la part LP habituelle */
  warnBps: 25,
  /** 100 bps = 1 % : la mediane du jeu TARE est exactement a 100 bps, ce n'est pas un cas rare */
  blockBps: 100,
};

export function gradeBps(bps: number, t: Thresholds): Verdict {
  if (bps >= t.blockBps) return "block";
  if (bps >= t.warnBps) return "warn";
  return "ok";
}

export interface Graded {
  verdict: Verdict;
  /** le bps qui a decide, et d'ou il vient */
  decidedBy: { bps: number; from: "stated" | "evidence" } | null;
}

export function gradeConsultation(c: Consultation, t: Thresholds, hasHook: boolean): Graded {
  if (!hasHook) return { verdict: "ok", decidedBy: null };

  if (c.bps !== null && (c.label === "MEASURED" || c.label === "INTERPOLATED")) {
    return { verdict: gradeBps(c.bps, t), decidedBy: { bps: c.bps, from: "stated" } };
  }

  // Pas de valeur pour CE pool : on regarde le faisceau, sans jamais l'ecrire dans `bps`.
  const pool = c.citations.filter((h) => h.bps !== null).map((h) => h.bps as number);
  const hookMax = c.hookContext?.measured?.bpsMax;
  const candidates = [...pool];
  if (typeof hookMax === "number") candidates.push(hookMax);
  if (candidates.length === 0) {
    // hook present dans la transaction, rien du tout dans la table : inconnu != inoffensif
    return { verdict: "warn", decidedBy: null };
  }
  const worst = Math.max(...candidates);
  const v = gradeBps(worst, t);
  return { verdict: v === "ok" ? "warn" : v, decidedBy: { bps: worst, from: "evidence" } };
}

const ORDER: Record<Verdict, number> = { ok: 0, warn: 1, block: 2 };

export function worstVerdict(vs: Verdict[]): Verdict {
  let out: Verdict = "ok";
  for (const v of vs) if (ORDER[v] > ORDER[out]) out = v;
  return out;
}
