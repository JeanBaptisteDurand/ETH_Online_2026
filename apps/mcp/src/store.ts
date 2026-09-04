/**
 * Query surface over the dataset. Pure lookups and counts — nothing here estimates anything.
 */
import { loadDataset, type Dataset, type MeasurementRow, type PoolRow } from "./dataset.js";

export interface Store {
  dataset: Dataset;
  hooks(): string[];
  measurementsForHook(hook: string): MeasurementRow[];
  poolsForHook(hook: string): PoolRow[];
  poolById(poolId: string): PoolRow | undefined;
  measurementsForPool(hook: string, poolId: string): MeasurementRow[];
  /** Exact row for a (hook, pool, size, direction, block) request, or undefined. */
  exact(q: {
    hook: string;
    poolId: string;
    amountIn: string;
    zeroForOne: boolean;
    block: number;
  }): MeasurementRow | undefined;
  /** Every block the dataset covers, ascending. */
  blocks(): number[];
  sizes(): string[];
}

export function norm(addressOrId: string): string {
  return addressOrId.trim().toLowerCase();
}

export function createStore(dataset: Dataset = loadDataset()): Store {
  const byHook = new Map<string, MeasurementRow[]>();
  for (const m of dataset.measurements) {
    const list = byHook.get(m.hook) ?? [];
    list.push(m);
    byHook.set(m.hook, list);
  }
  const poolsByHook = new Map<string, PoolRow[]>();
  const poolsById = new Map<string, PoolRow>();
  for (const p of dataset.pools) {
    const list = poolsByHook.get(p.hook) ?? [];
    list.push(p);
    poolsByHook.set(p.hook, list);
    poolsById.set(p.pool_id, p);
  }

  return {
    dataset,
    hooks: () => [...new Set([...byHook.keys(), ...poolsByHook.keys()])].sort(),
    measurementsForHook: (hook) => byHook.get(norm(hook)) ?? [],
    poolsForHook: (hook) => poolsByHook.get(norm(hook)) ?? [],
    poolById: (poolId) => poolsById.get(norm(poolId)),
    measurementsForPool: (hook, poolId) =>
      (byHook.get(norm(hook)) ?? []).filter((m) => m.pool_id === norm(poolId)),
    exact: (q) =>
      (byHook.get(norm(q.hook)) ?? []).find(
        (m) =>
          m.pool_id === norm(q.poolId) &&
          m.amount_in === q.amountIn &&
          m.zero_for_one === q.zeroForOne &&
          m.block_number === q.block,
      ),
    blocks: () => [...new Set(dataset.measurements.map((m) => m.block_number))].sort((a, b) => a - b),
    sizes: () =>
      [...new Set(dataset.measurements.map((m) => m.amount_in))].sort((a, b) =>
        BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0,
      ),
  };
}
