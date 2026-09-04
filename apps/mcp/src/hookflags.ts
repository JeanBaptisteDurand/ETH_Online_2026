/**
 * A v4 hook declares its permissions in the low 14 bits of its own address.
 *
 * `Hooks.sol` derives every permission from `uint160(address(hook))`, so the address *is* the
 * declaration: no call, no RPC, no registry. This is the only hook fact TARE can state offline
 * with certainty, and it is checkable against the dataset — a hook whose address does not carry
 * BEFORE_SWAP cannot run during a swap, and must therefore measure 0.00 bps. Both such hooks in
 * `docs/measurements-v1.json` measure exactly 0.00. See test/hookflags.test.ts.
 */
export const PERMISSION_BITS = [
  ["beforeInitialize", 13],
  ["afterInitialize", 12],
  ["beforeAddLiquidity", 11],
  ["afterAddLiquidity", 10],
  ["beforeRemoveLiquidity", 9],
  ["afterRemoveLiquidity", 8],
  ["beforeSwap", 7],
  ["afterSwap", 6],
  ["beforeDonate", 5],
  ["afterDonate", 4],
  ["beforeSwapReturnsDelta", 3],
  ["afterSwapReturnsDelta", 2],
  ["afterAddLiquidityReturnsDelta", 1],
  ["afterRemoveLiquidityReturnsDelta", 0],
] as const;

export type Permission = (typeof PERMISSION_BITS)[number][0];

export const ALL_HOOKS_MASK = 0x3fff;

export function permissionMask(hook: string): number {
  const hex = hook.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{40}$/.test(hex)) throw new Error(`not a 20-byte address: ${hook}`);
  // Only the low 14 bits matter; take them from the last 4 hex digits.
  return parseInt(hex.slice(-4), 16) & ALL_HOOKS_MASK;
}

export function permissions(hook: string): Permission[] {
  const mask = permissionMask(hook);
  return PERMISSION_BITS.filter(([, bit]) => (mask >> bit) & 1).map(([name]) => name);
}

/** Can this address be called at all during a swap? If not, its swap extraction must be zero. */
export function touchesSwap(hook: string): boolean {
  const mask = permissionMask(hook);
  return Boolean((mask >> 7) & 1) || Boolean((mask >> 6) & 1);
}

export function maskHex(hook: string): string {
  return "0x" + permissionMask(hook).toString(16).padStart(4, "0");
}
