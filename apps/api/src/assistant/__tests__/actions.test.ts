/**
 * Les actions sont le contrat entre le modele et le front. Ce qui est teste ici :
 * une action ne peut PAS transporter un resultat de mesure, meme si un modele essaie.
 */
import { describe, it, expect } from "vitest";
import {
  ActionSchema,
  ActionListSchema,
  FilterSchema,
  parseActions,
  parseModelPlan,
  ACTION_CATALOGUE,
  ACTION_TYPES,
} from "../actions.js";

const HOOK = "0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc";
const POOL = "0xd996ff76787c7c520483fe0164699395cc89bfcb6fc4bdba2820771f127fa300";

describe("actions typees", () => {
  it("accepte les 18 actions du catalogue, et le catalogue les couvre toutes", () => {
    expect(new Set(ACTION_CATALOGUE.map((a) => a.type))).toEqual(new Set(ACTION_TYPES));
    expect(ACTION_TYPES).toHaveLength(18);
  });

  it("normalise les adresses en minuscules et refuse ce qui n'est pas une adresse", () => {
    const up = ActionSchema.parse({ type: "highlight", hooks: [HOOK.toUpperCase().replace("0X", "0x")] });
    expect(up).toEqual({ type: "highlight", hooks: [HOOK] });
    expect(ActionSchema.safeParse({ type: "showTwins", hook: "0x1234" }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "open", hook: POOL }).success).toBe(false);
  });

  it("REFUSE un filtre auquel un modele a ajoute un resultat de mesure", () => {
    const sournois = { type: "filter", filter: { minBps: 100, bps: 42, max_bps: 1176.46 } };
    const res = ActionSchema.safeParse(sournois);
    expect(res.success).toBe(false);
    const parsed = parseActions([sournois]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.some((i) => /unrecognized|Unrecognized/i.test(i.message))).toBe(true);
  });

  it("REFUSE une action measure qui pretendrait porter sa propre reponse", () => {
    expect(
      ActionSchema.safeParse({
        type: "measure",
        hook: HOOK,
        sizes: ["1000000000000000"],
        bps: 689.95,
        out_with: "123",
      }).success,
    ).toBe(false);
  });

  it("refuse un seuil incoherent (min > max) et les montants non entiers", () => {
    expect(FilterSchema.safeParse({ minBps: 10, maxBps: 1 }).success).toBe(false);
    expect(FilterSchema.safeParse({ minBps: 1, maxBps: 10 }).success).toBe(true);
    expect(
      ActionSchema.safeParse({ type: "measure", hook: HOOK, sizes: ["0.5"] }).success,
    ).toBe(false);
    expect(ActionSchema.safeParse({ type: "measure", hook: HOOK, sizes: ["0"] }).success).toBe(false);
  });

  it("applique les valeurs par defaut de measure sans jamais inventer de resultat", () => {
    const a = ActionSchema.parse({ type: "measure", hook: HOOK });
    expect(a).toEqual({
      type: "measure",
      hook: HOOK,
      pool: null,
      sizes: ["1000000000000000"],
      directions: ["0->1"],
      block: null,
    });
    expect(JSON.stringify(a)).not.toMatch(/bps/);
  });

  it("valide un plan de modele et rejette une cle inconnue au niveau du plan", () => {
    const ok = parseModelPlan({ intent: "curve", actions: [{ type: "reset" }], say: "Voici la courbe." });
    expect(ok.ok).toBe(true);
    const ko = parseModelPlan({ intent: "curve", actions: [{ type: "reset" }], bps: 42 });
    expect(ko.ok).toBe(false);
  });

  it("borne la taille d'une liste d'actions", () => {
    const many = Array.from({ length: 25 }, () => ({ type: "reset" }));
    expect(ActionListSchema.safeParse(many).success).toBe(false);
  });
});
