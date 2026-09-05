/**
 * LES ACTIONS TYPEES.
 *
 * L'assistant TARE ne rend pas du texte : il rend une LISTE D'ACTIONS que le front
 * execute sur son tableau. Chaque action est validee par Zod avant de sortir d'ici.
 *
 * REGLE D'OR (elle est aussi ecrite dans README.md, et un test la fait respecter) :
 *   Le modele choisit QUOI interroger et explique CE QUI REVIENT.
 *   IL NE PRODUIT JAMAIS UN NOMBRE.
 *
 * Consequence directe sur ce fichier : AUCUNE action ne peut transporter un resultat
 * de mesure. Les seuls nombres qu'une action accepte sont des SELECTEURS fournis par
 * l'humain (un seuil "moins de 1 bps", un bloc, une taille de swap) ou des identifiants.
 * Les objets sont tous `strict()` : si un modele ajoute `{ bps: 42 }` a un filtre,
 * la validation echoue au lieu de laisser passer un nombre invente.
 */
import { z } from "zod";

/* ------------------------------------------------------------- primitives */

export const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "adresse EVM attendue (0x + 40 hex)")
  .transform((s) => s.toLowerCase());

export const PoolIdSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "pool_id attendu (0x + 64 hex)")
  .transform((s) => s.toLowerCase());

export const MeasurementIdSchema = z
  .string()
  .regex(/^m_[0-9a-f]{16}$/, "id de mesure attendu (m_ + 16 hex)");

/** Un montant de swap est un entier en unites de base : jamais un flottant. */
export const AmountSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,39}$/, "montant entier en unites de base, sans zero initial");

export const LabelSchema = z.enum([
  "MEASURED",
  "INTERPOLATED",
  "NOT_MEASURABLE",
  "NOT_QUOTABLE",
]);
export type ActionLabel = z.infer<typeof LabelSchema>;

/** Les 14 permissions d'un hook v4 — les bits bas de son adresse (Hooks.sol). */
export const FlagSchema = z.enum([
  "beforeInitialize",
  "afterInitialize",
  "beforeAddLiquidity",
  "afterAddLiquidity",
  "beforeRemoveLiquidity",
  "afterRemoveLiquidity",
  "beforeSwap",
  "afterSwap",
  "beforeDonate",
  "afterDonate",
  "beforeSwapReturnsDelta",
  "afterSwapReturnsDelta",
  "afterAddLiquidityReturnsDelta",
  "afterRemoveLiquidityReturnsDelta",
]);
export type FlagName = z.infer<typeof FlagSchema>;

/** Les colonnes du tableau du front (apps/web/src/components/Table.tsx). */
export const ColumnSchema = z.enum([
  "hook",
  "registre",
  "mesure",
  "pools",
  "mesures",
  "etiquette",
  "audit",
]);
export type ColumnName = z.infer<typeof ColumnSchema>;

export const DirectionSchema = z.enum(["0->1", "1->0"]);
export const SortDirSchema = z.enum(["asc", "desc"]);
export const ExportFormatSchema = z.enum(["csv", "json", "jsonl", "markdown"]);

/* ---------------------------------------------------------------- filtres */

/**
 * Le predicat du tableau. `minBps` / `maxBps` sont des SEUILS demandes par l'humain,
 * pas des mesures : ils bornent la selection, ils n'affirment rien.
 */
export const FilterSchema = z
  .strictObject({
    minBps: z.number().finite().min(0).max(1_000_000).optional(),
    maxBps: z.number().finite().min(0).max(1_000_000).optional(),
    chain: z.string().min(1).max(32).optional(),
    flag: FlagSchema.optional(),
    label: LabelSchema.optional(),
    /** presence dans le registre officiel (hooklist.json) */
    allowlisted: z.boolean().optional(),
    /** le registre dit une chose, la mesure en dit une autre */
    registryDisagrees: z.boolean().optional(),
    hook: AddressSchema.optional(),
    pool: PoolIdSchema.optional(),
    /** profil non plat : le prelevement change avec la taille du swap */
    nonFlat: z.boolean().optional(),
    /** ne garder que les hooks qui portent au moins une mesure MEASURED */
    measuredOnly: z.boolean().optional(),
    /** recherche libre sur le nom du registre / l'adresse */
    search: z.string().min(1).max(64).optional(),
  })
  .refine(
    (f) => f.minBps === undefined || f.maxBps === undefined || f.minBps <= f.maxBps,
    { message: "minBps doit etre <= maxBps" },
  );
export type Filter = z.infer<typeof FilterSchema>;

/* ---------------------------------------------------------------- actions */

export const ActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("filter"), filter: FilterSchema }),
  z.strictObject({ type: z.literal("sort"), col: ColumnSchema, dir: SortDirSchema }),
  z.strictObject({ type: z.literal("highlight"), hooks: z.array(AddressSchema).max(64) }),
  z.strictObject({
    type: z.literal("open"),
    hook: AddressSchema,
    pool: PoolIdSchema.nullable().default(null),
  }),
  z.strictObject({
    type: z.literal("plotCurve"),
    hook: AddressSchema,
    pool: PoolIdSchema,
    direction: DirectionSchema.nullable().default(null),
  }),
  z.strictObject({ type: z.literal("compare"), a: AddressSchema, b: AddressSchema }),
  /**
   * Une DEMANDE de mesure, pas une mesure. Elle ne porte que le sujet du swap.
   * Le front la relaie a POST /measure (peage x402) ; le chat, lui, a un quota
   * par session — aucun visiteur d'un navigateur n'a de compte Hedera.
   */
  z.strictObject({
    type: z.literal("measure"),
    hook: AddressSchema,
    pool: PoolIdSchema.nullable().default(null),
    sizes: z.array(AmountSchema).min(1).max(8).default(["1000000000000000"]),
    directions: z.array(DirectionSchema).min(1).max(2).default(["0->1"]),
    block: z.number().int().positive().nullable().default(null),
  }),
  z.strictObject({ type: z.literal("showTwins"), hook: AddressSchema }),
  z.strictObject({ type: z.literal("showBlastRadius"), hook: AddressSchema }),
  z.strictObject({ type: z.literal("showDeployer"), hook: AddressSchema }),
  z.strictObject({ type: z.literal("showContradictions") }),
  z.strictObject({ type: z.literal("showOrphans") }),
  z.strictObject({ type: z.literal("showEvidence"), measurementId: MeasurementIdSchema }),
  z.strictObject({ type: z.literal("reset") }),
  z.strictObject({ type: z.literal("columns"), columns: z.array(ColumnSchema).min(1).max(7) }),
  z.strictObject({ type: z.literal("clarify"), question: z.string().min(1).max(400) }),
  z.strictObject({ type: z.literal("export"), format: ExportFormatSchema }),
  z.strictObject({ type: z.literal("permalink") }),
]);

export type Action = z.infer<typeof ActionSchema>;
export type ActionType = Action["type"];

export const ActionListSchema = z.array(ActionSchema).max(24);

/** Le plan brut qu'un modele a le droit de rendre : des actions, une intention, zero nombre libre. */
export const ModelPlanSchema = z.strictObject({
  intent: z.string().min(1).max(64),
  actions: ActionListSchema,
  /** phrase optionnelle : elle passe ENCORE par l'auditeur de nombres avant publication */
  say: z.string().max(600).optional(),
});
export type ModelPlan = z.infer<typeof ModelPlanSchema>;

export const ACTION_TYPES: readonly ActionType[] = [
  "filter",
  "sort",
  "highlight",
  "open",
  "plotCurve",
  "compare",
  "measure",
  "showTwins",
  "showBlastRadius",
  "showDeployer",
  "showContradictions",
  "showOrphans",
  "showEvidence",
  "reset",
  "columns",
  "clarify",
  "export",
  "permalink",
] as const;

export interface ParseOk {
  ok: true;
  actions: Action[];
}
export interface ParseErr {
  ok: false;
  error: string;
  issues: { path: string; message: string }[];
}

/** Valide une liste d'actions. Un echec n'est jamais avale : il remonte tel quel. */
export function parseActions(raw: unknown): ParseOk | ParseErr {
  const res = ActionListSchema.safeParse(raw);
  if (res.success) return { ok: true, actions: res.data };
  return {
    ok: false,
    error: "actions invalides",
    issues: res.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}

export function parseModelPlan(raw: unknown): { ok: true; plan: ModelPlan } | ParseErr {
  const res = ModelPlanSchema.safeParse(raw);
  if (res.success) return { ok: true, plan: res.data };
  return {
    ok: false,
    error: "plan de modele invalide",
    issues: res.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}

/** Le catalogue publie a /assistant/actions : ce que le front sait executer. */
export const ACTION_CATALOGUE: { type: ActionType; args: string; what: string }[] = [
  { type: "filter", args: "filter({minBps,maxBps,chain,flag,label,allowlisted,registryDisagrees,hook,pool,nonFlat,measuredOnly,search})", what: "reduit le tableau" },
  { type: "sort", args: "sort(col,dir)", what: "trie une colonne" },
  { type: "highlight", args: "highlight([hooks])", what: "surligne des lignes" },
  { type: "open", args: "open(hook,pool)", what: "ouvre la fiche d'un hook, eventuellement sur un pool" },
  { type: "plotCurve", args: "plotCurve(hook,pool,direction)", what: "trace le prelevement en fonction de la taille" },
  { type: "compare", args: "compare(A,B)", what: "met deux hooks cote a cote" },
  { type: "measure", args: "measure({hook,pool,sizes,directions,block})", what: "DEMANDE une mesure a la demande (payante en x402 hors navigateur)" },
  { type: "showTwins", args: "showTwins(hook)", what: "les hooks qui declarent exactement les memes permissions" },
  { type: "showBlastRadius", args: "showBlastRadius(hook)", what: "pools et tokens atteints par ce hook" },
  { type: "showDeployer", args: "showDeployer(hook)", what: "ce que le registre dit du deployeur" },
  { type: "showContradictions", args: "showContradictions()", what: "registre contre mesure" },
  { type: "showOrphans", args: "showOrphans()", what: "hooks mesures absents du registre, et pools sans mesure" },
  { type: "showEvidence", args: "showEvidence(measurementId)", what: "la ligne brute et sa commande de rejeu" },
  { type: "reset", args: "reset()", what: "efface filtres, tri et surlignage" },
  { type: "columns", args: "columns([...])", what: "choisit les colonnes visibles" },
  { type: "clarify", args: "clarify(question)", what: "l'assistant n'a pas compris et le dit" },
  { type: "export", args: "export(format)", what: "exporte la selection" },
  { type: "permalink", args: "permalink()", what: "fige l'etat courant dans une URL" },
];
