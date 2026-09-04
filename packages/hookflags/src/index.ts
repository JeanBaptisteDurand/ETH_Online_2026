/**
 * Uniswap v4 hook permission flags.
 *
 * The 14 permissions a hook declares are not stored anywhere: they ARE the low 14 bits of the
 * hook's own address, which is why hooks must be CREATE2-mined. Verified against the whole
 * official registry: 8,974 bit comparisons over 613 hooks, zero deviation (see test/).
 *
 * Ported from LPLens (packages/agent/src/phases/05-hooks/flags.ts), which checked the layout
 * against Uniswap/v4-core/src/libraries/Hooks.sol.
 *
 * Consequence for the product: "paste an address, 14 lights come on" is exact, needs no RPC and
 * no backend, and cannot be wrong.
 */
export const HOOK_FLAGS = {
  BEFORE_INITIALIZE: 1 << 13,
  AFTER_INITIALIZE: 1 << 12,
  BEFORE_ADD_LIQUIDITY: 1 << 11,
  AFTER_ADD_LIQUIDITY: 1 << 10,
  BEFORE_REMOVE_LIQUIDITY: 1 << 9,
  AFTER_REMOVE_LIQUIDITY: 1 << 8,
  BEFORE_SWAP: 1 << 7,
  AFTER_SWAP: 1 << 6,
  BEFORE_DONATE: 1 << 5,
  AFTER_DONATE: 1 << 4,
  BEFORE_SWAP_RETURNS_DELTA: 1 << 3,
  AFTER_SWAP_RETURNS_DELTA: 1 << 2,
  AFTER_ADD_LIQUIDITY_RETURNS_DELTA: 1 << 1,
  AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA: 1 << 0,
} as const;

export type FlagName = keyof typeof HOOK_FLAGS;

/** The registry spells the same flags in camelCase; this maps ours onto theirs. */
export const REGISTRY_NAME: Record<FlagName, string> = {
  BEFORE_INITIALIZE: "beforeInitialize",
  AFTER_INITIALIZE: "afterInitialize",
  BEFORE_ADD_LIQUIDITY: "beforeAddLiquidity",
  AFTER_ADD_LIQUIDITY: "afterAddLiquidity",
  BEFORE_REMOVE_LIQUIDITY: "beforeRemoveLiquidity",
  AFTER_REMOVE_LIQUIDITY: "afterRemoveLiquidity",
  BEFORE_SWAP: "beforeSwap",
  AFTER_SWAP: "afterSwap",
  BEFORE_DONATE: "beforeDonate",
  AFTER_DONATE: "afterDonate",
  BEFORE_SWAP_RETURNS_DELTA: "beforeSwapReturnsDelta",
  AFTER_SWAP_RETURNS_DELTA: "afterSwapReturnsDelta",
  AFTER_ADD_LIQUIDITY_RETURNS_DELTA: "afterAddLiquidityReturnsDelta",
  AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA: "afterRemoveLiquidityReturnsDelta",
};

const MASK = (1 << 14) - 1;

export function decodeFlags(hookAddress: string): { bitmap: number; active: FlagName[] } {
  const lo = Number(BigInt(hookAddress) & BigInt(MASK));
  const active = (Object.keys(HOOK_FLAGS) as FlagName[]).filter((k) => (lo & HOOK_FLAGS[k]) !== 0);
  return { bitmap: lo, active };
}

/** Ordered high bit -> low bit, which is the order the 14 lights are drawn in. */
export function flagRow(hookAddress: string): { name: FlagName; label: string; on: boolean }[] {
  const { bitmap } = decodeFlags(hookAddress);
  return (Object.keys(HOOK_FLAGS) as FlagName[]).map((name) => ({
    name,
    label: REGISTRY_NAME[name],
    on: (bitmap & HOOK_FLAGS[name]) !== 0,
  }));
}

/** A hook that can move the swap output is one that can take from it. */
export function canAlterSwapOutput(hookAddress: string): boolean {
  const { bitmap } = decodeFlags(hookAddress);
  return (bitmap & (HOOK_FLAGS.BEFORE_SWAP_RETURNS_DELTA | HOOK_FLAGS.AFTER_SWAP_RETURNS_DELTA)) !== 0;
}
