/**
 * Les quatre etiquettes, et rien d'autre.
 *
 * Regle dure n.2 : chaque mesure porte une etiquette.
 * Regle dure n.3 : une lecture bornee ou inconnue est un NOT_MEASURABLE, jamais une valeur.
 *
 * Le jeu v1 (docs/measurements-v1.json) a ete ecrit avec des etiquettes francaises
 * ("MESURE", "NON_COTABLE") avant que le moteur ne se fixe sur les quatre canoniques.
 * On traduit, on ne devine pas : une etiquette inconnue devient NOT_MEASURABLE avec
 * la raison qui dit pourquoi, et sa valeur en bps est effacee.
 */
export const LABELS = ["MEASURED", "INTERPOLATED", "NOT_MEASURABLE", "NOT_QUOTABLE"] as const;
export type Label = (typeof LABELS)[number];

/** Les seules etiquettes qui ont le droit de porter un nombre. */
export const NUMERIC_LABELS: readonly Label[] = ["MEASURED", "INTERPOLATED"];

const ALIASES: Record<string, Label> = {
  MEASURED: "MEASURED",
  MESURE: "MEASURED",
  MESUREE: "MEASURED",
  INTERPOLATED: "INTERPOLATED",
  INTERPOLE: "INTERPOLATED",
  INTERPOLEE: "INTERPOLATED",
  NOT_MEASURABLE: "NOT_MEASURABLE",
  NON_MESURABLE: "NOT_MEASURABLE",
  NOT_QUOTABLE: "NOT_QUOTABLE",
  NON_COTABLE: "NOT_QUOTABLE",
};

export interface LabelResolution {
  label: Label;
  /** l'etiquette telle qu'elle etait ecrite dans la source */
  label_source: string;
  /** raison ajoutee par la traduction, sinon null */
  translation_note: string | null;
}

export function resolveLabel(raw: unknown): LabelResolution {
  const source = typeof raw === "string" ? raw : String(raw);
  const hit = ALIASES[source.trim().toUpperCase()];
  if (hit) return { label: hit, label_source: source, translation_note: null };
  return {
    label: "NOT_MEASURABLE",
    label_source: source,
    translation_note: `unknown_label:${source}`,
  };
}

export function canCarryNumber(label: Label): boolean {
  return NUMERIC_LABELS.includes(label);
}
