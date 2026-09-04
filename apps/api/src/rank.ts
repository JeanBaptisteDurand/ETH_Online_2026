/**
 * Le classement par hook.
 *
 * Le maximum affiche n'est pas un nombre nu : il vient avec l'id de la mesure qui
 * le porte, son bloc, sa taille, son sens et sa commande de rejeu. Un maximum sans
 * ces quatre choses ne serait pas verifiable, donc il ne serait pas publiable.
 *
 * "Ce que le registre officiel en dit" a trois etats distincts, jamais confondus :
 *   registry: null + registry_available: false  -> aucun fichier de registre charge
 *   registry: null + registry_available: true   -> le hook est ABSENT du registre
 *   registry: {...}                             -> la fiche officielle, telle quelle
 */
import type { Measurement } from "./measurement.js";
import type { Dataset, Registry } from "./dataset.js";
import type { Label } from "./labels.js";

export interface HookRow {
  hook: string;
  max_bps: number | null;
  /** la mesure qui porte ce maximum — sans elle, le nombre ne se rejoue pas */
  max_measurement: {
    id: string;
    pool_id: string;
    block_number: number;
    amount_in: string;
    direction: string;
    label: Label;
    replay: string;
  } | null;
  pools: number;
  measurements: number;
  labels: Partial<Record<Label, number>>;
  blocks: number[];
  registry_available: boolean;
  in_registry: boolean | null;
  registry: Record<string, unknown> | null;
}

export function buildRanking(dataset: Dataset, registry: Registry): HookRow[] {
  const available = registry.path !== null && registry.count > 0;
  const rows: HookRow[] = [];

  for (const [hook, list] of dataset.byHook) {
    const labels: Partial<Record<Label, number>> = {};
    const pools = new Set<string>();
    const blocks = new Set<number>();
    let best: Measurement | null = null;

    for (const m of list) {
      labels[m.label] = (labels[m.label] ?? 0) + 1;
      pools.add(m.pool_id);
      blocks.add(m.block_number);
      if (m.bps !== null && (best === null || m.bps > best.bps!)) best = m;
    }

    const entry = registry.entries.get(hook);
    rows.push({
      hook,
      max_bps: best?.bps ?? null,
      max_measurement: best
        ? {
            id: best.id,
            pool_id: best.pool_id,
            block_number: best.block_number,
            amount_in: best.amount_in,
            direction: best.direction,
            label: best.label,
            replay: best.replay.command_exact,
          }
        : null,
      pools: pools.size,
      measurements: list.length,
      labels,
      blocks: [...blocks].sort((a, b) => a - b),
      registry_available: available,
      in_registry: available ? Boolean(entry) : null,
      registry: entry ? entry.fields : null,
    });
  }

  rows.sort((a, b) => {
    if (a.max_bps === null && b.max_bps === null) return b.measurements - a.measurements;
    if (a.max_bps === null) return 1;
    if (b.max_bps === null) return -1;
    if (b.max_bps !== a.max_bps) return b.max_bps - a.max_bps;
    return b.measurements - a.measurements;
  });
  return rows;
}
