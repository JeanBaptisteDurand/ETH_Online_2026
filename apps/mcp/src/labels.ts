/**
 * The four labels, and nothing else.
 *
 *   MEASURED       two quotes came back, the difference is the number
 *   INTERPOLATED   the number is read off two measured points, never off a model
 *   NOT_MEASURABLE the counterfactual could not be built (custom accounting, stub reverted,
 *                  bounded read, fork unreachable) — a bounded read is never a value
 *   NOT_QUOTABLE   the quoter itself refused this pool/direction/size
 *
 * `docs/measurements-v1.json` was written by engine 0.2, which emitted French labels. The engine
 * emits the canonical set since 0.3. We normalise on read rather than rewriting the dataset,
 * because the dataset is the evidence and evidence is not edited.
 */
export const LABELS = ["MEASURED", "INTERPOLATED", "NOT_MEASURABLE", "NOT_QUOTABLE"] as const;
export type Label = (typeof LABELS)[number];

const ALIASES: Record<string, Label> = {
  MEASURED: "MEASURED",
  MESURE: "MEASURED",
  MESURÉ: "MEASURED",
  INTERPOLATED: "INTERPOLATED",
  INTERPOLE: "INTERPOLATED",
  INTERPOLÉ: "INTERPOLATED",
  NOT_MEASURABLE: "NOT_MEASURABLE",
  NON_MESURABLE: "NOT_MEASURABLE",
  NOT_QUOTABLE: "NOT_QUOTABLE",
  NON_COTABLE: "NOT_QUOTABLE",
};

export function normalizeLabel(raw: string): Label {
  const hit = ALIASES[raw.trim().toUpperCase()];
  if (!hit) throw new Error(`unknown label ${JSON.stringify(raw)} — refusing to guess`);
  return hit;
}

/** A number may only ever be shown under these two labels. */
export function labelCarriesNumber(label: Label): boolean {
  return label === "MEASURED" || label === "INTERPOLATED";
}
