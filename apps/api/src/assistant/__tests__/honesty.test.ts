/**
 * LA REGLE D'OR, VERIFIEE.
 *
 *   Le modele choisit quoi interroger et explique ce qui revient.
 *   IL NE PRODUIT JAMAIS UN NOMBRE.
 *
 * Ce fichier est celui qui doit rester vert quoi qu'il arrive au reste du produit.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ask } from "../ask.js";
import { SessionStore } from "../session.js";
import { makeLlmPlanner, type ModelCall } from "../llm.js";
import {
  Narration,
  UncitedNumberError,
  auditNarration,
  findNumbers,
  sanitizeModelSay,
} from "../narrate.js";
import { getStore, resetStore } from "../store.js";
import { resetGraph } from "../graph.js";
import { resetCaches } from "../../dataset.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEMO = "montre-moi les hooks que le registre dit vanillaSwap=false mais qui mesurent moins de 1 bps";
const fresh = () => new SessionStore();

describe("l'auditeur de nombres", () => {
  it("ne prend pas les identifiants pour des nombres", () => {
    const t =
      "hook 0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc, pool 0xd996ff76787c7c520483fe0164699395cc89bfcb6fc4bdba2820771f127fa300, ligne m_0123456789abcdef, sens 0->1, Uniswap v4, peage x402";
    expect(findNumbers(t)).toEqual([]);
    expect(auditNarration(t, []).ok).toBe(true);
  });

  it("attrape un nombre qui n'a pas de citation", () => {
    const a = auditNarration("ce hook prend 42 bps", ["689.9519"]);
    expect(a.ok).toBe(false);
    expect(a.violations).toEqual(["42"]);
  });

  it("refuse d'ecrire un chiffre dans de la prose", () => {
    const n = new Narration();
    expect(() => n.text("il y a 3 hooks")).toThrow(UncitedNumberError);
  });

  it("laisse passer un nombre SEULEMENT avec son bloc, sa taille, son sens et son rejeu", () => {
    const n = new Narration();
    n.text("maximum ");
    n.bps(689.9519, {
      measurement_id: "m_0123456789abcdef",
      hook: "0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc",
      pool_id: "0xd996ff76787c7c520483fe0164699395cc89bfcb6fc4bdba2820771f127fa300",
      block_number: 50614000,
      amount_in: "100000000000000",
      direction: "1->0",
      label: "MEASURED",
      replay: "python3 apps/api/scripts/measure_one.py ...",
      source: "measurements.jsonl",
    });
    n.text(" bps");
    const built = n.build();
    expect(built.text).toContain("689.9519");
    expect(built.citations).toHaveLength(1);
    const c = built.citations[0]!;
    expect(c.block_number).toBe(50614000);
    expect(c.amount_in).toBe("100000000000000");
    expect(c.direction).toBe("1->0");
    expect(c.replay).toBeTruthy();
  });

  it("jette la phrase d'un modele qui contient un nombre non source, au lieu de la corriger", () => {
    const r = sanitizeModelSay("Ce hook prend environ 42 bps.", [
      { token: "689.9519", kind: "measurement", what: "max", source: "jsonl" },
    ]);
    expect(r.kept).toBeNull();
    expect(r.violations).toEqual(["42"]);
  });
});

describe("le modele ne peut pas inventer un nombre (bout en bout)", () => {
  it("un LLM qui affirme '42 bps' voit sa phrase rejetee, et le chiffre n'atteint jamais la reponse", async () => {
    const menteur: ModelCall = async () =>
      JSON.stringify({
        intent: "top-extractors",
        actions: [{ type: "reset" }, { type: "filter", filter: { minBps: 100 } }],
        say: "D'apres mon analyse, ce hook prend environ 42 bps, soit 3 fois la moyenne.",
      });
    const a = await ask("les gros preleveurs", {
      sessionId: "s_llm_menteur",
      sessions: fresh(),
      planner: makeLlmPlanner(menteur),
    });

    // "42" ne doit plus exister EN TANT QUE NOMBRE (les adresses en contiennent des morceaux)
    expect(findNumbers(a.narration)).not.toContain("42");
    expect(a.narration).not.toContain("3 fois");
    expect(a.degraded?.reason).toBe("uncited_numbers_in_model_sentence");
    // et la reponse reste utile : les actions du modele, elles, ont ete executees
    expect(a.actions.some((x) => x.type === "filter")).toBe(true);
    // tout nombre encore present dans la narration a une citation
    expect(auditNarration(a.narration, a.citations.map((c) => c.token), a.identifiers).ok).toBe(true);
  });

  it("un LLM qui glisse un resultat de mesure dans une action est refuse par Zod, et on le dit", async () => {
    const tricheur: ModelCall = async () =>
      JSON.stringify({
        intent: "top-extractors",
        actions: [{ type: "filter", filter: { minBps: 100, measured_bps: 1176.46 } }],
      });
    const a = await ask("les gros preleveurs", {
      sessionId: "s_llm_tricheur",
      sessions: fresh(),
      planner: makeLlmPlanner(tricheur),
    });
    expect(a.degraded?.reason).toBe("plan refuse par la validation");
    expect(JSON.stringify(a.actions)).not.toContain("1176.46");
    expect(a.why.join(" ")).toContain("repli deterministe");
  });

  it("une phrase de modele SANS chiffre survit et se voit prefixee a la narration", async () => {
    const honnete: ModelCall = async () =>
      JSON.stringify({
        intent: "top-extractors",
        actions: [{ type: "reset" }, { type: "filter", filter: { minBps: 100 } }],
        say: "Je regarde les hooks dont le maximum mesure depasse le seuil que tu donnes.",
      });
    const a = await ask("les gros preleveurs", {
      sessionId: "s_llm_ok",
      sessions: fresh(),
      planner: makeLlmPlanner(honnete),
    });
    expect(a.narration.startsWith("Je regarde les hooks")).toBe(true);
    expect(a.degraded).toBeNull();
  });

  it("un modele muet ou tronque ne produit pas une reponse a moitie : on retombe et on l'ecrit", async () => {
    const tronque: ModelCall = async () => '{"intent":"curve","actions":[{"type":"res';
    const a = await ask(DEMO, { sessionId: "s_llm_cut", sessions: fresh(), planner: makeLlmPlanner(tronque) });
    expect(a.ok).toBe(true);
    expect(a.degraded?.reason).toBe("JSON illisible");
    expect(a.intent).toBe("registry-disagrees");
  });

  it("chaque nombre de chaque reponse a une citation, sur toutes les intentions", async () => {
    const bag = fresh();
    const questions = [
      DEMO,
      "les hooks qui prennent plus de 100 bps",
      "trace la courbe de 0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc",
      "les jumeaux de 0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc",
      "montre les orphelins",
      "les contradictions",
      "le rayon d'impact de 0x0469a4bd3724dc86c9542f4694c976da13c450c0",
      "compare 0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc et 0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc",
      "qui a deploye 0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc",
      "mesure 0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc",
      "aide",
      "quelle est la meilleure recette de crepes",
    ];
    for (const q of questions) {
      const a = await ask(q, { sessionId: "s_audit_all", sessions: bag });
      const audit = auditNarration(a.narration, a.citations.map((c) => c.token), a.identifiers);
      expect(audit.ok, `${q} -> ${audit.violations.join(",")}`).toBe(true);
      expect(a.degraded, `${q} ne doit pas degrader`).toBeNull();
    }
  });

  it("toute citation de mesure porte son bloc, sa taille, son sens et sa commande de rejeu", async () => {
    const a = await ask("les hooks qui prennent plus de 100 bps", {
      sessionId: "s_cit",
      sessions: fresh(),
    });
    const mesures = a.citations.filter((c) => c.kind === "measurement");
    expect(mesures.length).toBeGreaterThan(0);
    for (const c of mesures) {
      expect(c.measurement_id).toMatch(/^m_[0-9a-f]{16}$/);
      expect(typeof c.block_number).toBe("number");
      expect(c.amount_in).toMatch(/^[0-9]+$/);
      expect(["0->1", "1->0"]).toContain(c.direction);
      expect(c.label).toBe("MEASURED");
      expect(c.replay).toContain("measure_one.py");
    }
  });
});

describe("une lecture tronquee n'est jamais une valeur", () => {
  const before = process.env.TARE_JSONL_PATH;
  beforeEach(() => {
    process.env.TARE_JSONL_PATH = resolve(HERE, "fixtures", "broken.jsonl");
    resetCaches();
    resetStore();
    resetGraph();
  });
  afterEach(() => {
    if (before === undefined) delete process.env.TARE_JSONL_PATH;
    else process.env.TARE_JSONL_PATH = before;
    resetCaches();
    resetStore();
    resetGraph();
  });

  it("un jeu coupe en cours d'ecriture rend NOT_MEASURABLE et zero nombre cite", async () => {
    const store = getStore();
    expect(store.complete).toBe(false);
    expect(store.dataset.rejected_lines).toBeGreaterThan(0);

    const a = await ask("les hooks qui prennent plus de 100 bps", {
      sessionId: "s_tronque",
      sessions: fresh(),
    });
    expect(a.label).toBe("NOT_MEASURABLE");
    expect(a.data.truncated).toBe(true);
    expect(a.narration).toContain("NOT_MEASURABLE");
    expect(a.citations.every((c) => c.kind !== "measurement")).toBe(true);
    expect(a.narration).not.toContain("689.9519");
  });
});
