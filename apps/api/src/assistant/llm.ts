/**
 * LE PLANIFICATEUR LLM — optionnel, et volontairement pauvre.
 *
 * Ce que le modele recoit : le catalogue d'actions, l'inventaire des hooks (adresse,
 * nom du registre, ce que le registre affirme, s'il a deja ete mesure) et la question.
 * Ce que le modele NE recoit PAS : une seule valeur mesuree. On ne peut pas repeter
 * un nombre qu'on n'a jamais lu.
 *
 * Ce que le modele rend : un JSON {intent, actions[], say?}. Les actions passent par
 * Zod (actions.ts), la phrase passe par l'auditeur (narrate.ts). Un JSON invalide, un
 * timeout, une reponse tronquee : on retombe sur le planificateur deterministe et on
 * l'ECRIT dans la reponse. Jamais un resultat a moitie.
 */
import { parseModelPlan, ACTION_CATALOGUE, type Action } from "./actions.js";
import { plan as deterministicPlan, type Intent, type PlanOut, type PlannerContext } from "./planner.js";
import type { StoreView } from "./store.js";

export type ModelCall = (req: { system: string; user: string }) => Promise<string>;

export type PlannerFn = (
  question: string,
  store: StoreView,
  ctx: PlannerContext,
) => Promise<PlanOut>;

const INTENTS: Intent[] = [
  "registry-disagrees",
  "contradictions",
  "top-extractors",
  "quiet-hooks",
  "curve",
  "compare",
  "twins",
  "blast-radius",
  "deployer",
  "orphans",
  "evidence",
  "measure-request",
  "open",
  "filter",
  "sort",
  "columns",
  "reset",
  "export",
  "permalink",
  "help",
  "unclear",
];

const BY_ACTION: Partial<Record<Action["type"], Intent>> = {
  plotCurve: "curve",
  compare: "compare",
  showTwins: "twins",
  showBlastRadius: "blast-radius",
  showDeployer: "deployer",
  showContradictions: "contradictions",
  showOrphans: "orphans",
  showEvidence: "evidence",
  measure: "measure-request",
  open: "open",
  filter: "filter",
  sort: "sort",
  columns: "columns",
  export: "export",
  permalink: "permalink",
  clarify: "unclear",
  reset: "reset",
};

export function intentFromActions(actions: Action[], hinted: string): Intent {
  const hit = INTENTS.find((i) => i === hinted);
  if (hit) return hit;
  for (const a of actions) {
    if (a.type === "reset") continue;
    const guess = BY_ACTION[a.type];
    if (guess) return guess;
  }
  return "unclear";
}

export function buildSystemPrompt(store: StoreView): string {
  const inventory = store.hooks
    .map((h) => {
      const bits = [
        h.hook,
        h.registry?.name ?? "(absent du registre)",
        `vanillaSwap=${h.registry?.vanilla_swap ?? "inconnu"}`,
        h.measured > 0 ? "deja mesure" : "aucune valeur mesuree",
      ];
      return "- " + bits.join(" | ");
    })
    .join("\n");

  return [
    "Tu es le planificateur de TARE. TARE mesure ce qu'un hook Uniswap v4 prend reellement",
    "sur un swap : sur un fork epingle, le bytecode du hook est remplace par un stub inerte,",
    "le meme swap est cote deux fois, et l'ecart EST le prelevement.",
    "",
    "REGLE D'OR, absolue : tu choisis QUOI interroger. TU NE PRODUIS JAMAIS UN NOMBRE.",
    "Tu n'as recu aucune valeur mesuree et tu n'as pas le droit d'en ecrire une.",
    "Le champ `say` doit etre une phrase SANS AUCUN CHIFFRE ; toute phrase qui en contient",
    "est jetee par l'auditeur, et ta reponse sera remplacee par la narration deterministe.",
    "",
    "Tu reponds UNIQUEMENT par un objet JSON :",
    '{"intent":"...","actions":[...],"say":"phrase sans chiffre (optionnel)"}',
    "",
    "Actions disponibles (aucune autre cle n'est acceptee, la validation est stricte) :",
    ...ACTION_CATALOGUE.map((a) => `- ${a.args} : ${a.what}`),
    "",
    "Intentions possibles : " + INTENTS.join(", "),
    "",
    "Inventaire des hooks mesures (adresse | nom du registre | affirmation du registre | etat) :",
    inventory,
  ].join("\n");
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("aucun objet JSON dans la reponse du modele");
  return JSON.parse(body.slice(start, end + 1));
}

export interface LlmPlannerOptions {
  /** au-dela, on ne conclut pas sur une reponse a moitie arrivee : on retombe */
  timeoutMs?: number;
}

/**
 * Enveloppe un appel modele en planificateur. Le repli deterministe n'est pas un
 * filet de securite discret : il est annonce dans `degraded`.
 */
export function makeLlmPlanner(call: ModelCall, opts: LlmPlannerOptions = {}): PlannerFn {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  return async (question, store, ctx) => {
    const fallback = (reason: string, detail: string): PlanOut => {
      const p = deterministicPlan(question, store, ctx);
      return {
        ...p,
        why: [...p.why, `repli deterministe : ${reason}`],
        degraded: { reason, detail: detail.slice(0, 300) },
      };
    };

    let raw: string;
    try {
      raw = await Promise.race([
        call({ system: buildSystemPrompt(store), user: question }),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error(`timeout ${timeoutMs} ms`)), timeoutMs),
        ),
      ]);
    } catch (e) {
      return fallback("modele injoignable", (e as Error).message);
    }
    if (typeof raw !== "string" || raw.trim() === "")
      return fallback("reponse vide du modele", "chaine vide");

    let parsedJson: unknown;
    try {
      parsedJson = extractJson(raw);
    } catch (e) {
      return fallback("JSON illisible", (e as Error).message);
    }

    const res = parseModelPlan(parsedJson);
    if (!res.ok)
      return fallback(
        "plan refuse par la validation",
        res.issues.map((i) => `${i.path}: ${i.message}`).join(" ; "),
      );
    if (res.plan.actions.length === 0) return fallback("plan vide", "aucune action proposee");

    return {
      intent: intentFromActions(res.plan.actions, res.plan.intent),
      actions: res.plan.actions,
      reading: `plan propose par le modele (intent annonce: ${res.plan.intent})`,
      params: {
        hooks: [],
        pools: [],
        measurementIds: [],
        minBps: null,
        maxBps: null,
        vanillaSwap: null,
        nameHits: [],
      },
      why: ["planificateur LLM", "actions validees par Zod avant execution"],
      say: res.plan.say ?? null,
      degraded: null,
    };
  };
}

/** Le planificateur par defaut : deterministe, sans reseau, sans cle. */
export const deterministicPlanner: PlannerFn = async (question, store, ctx) =>
  deterministicPlan(question, store, ctx);
