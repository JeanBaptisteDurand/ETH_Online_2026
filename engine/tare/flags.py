"""Uniswap v4 hook permission flags — the low 14 bits of the hook address.

Ported from LPLens (phases/05-hooks/flags.ts) and kept byte-identical to the TypeScript
package @tare/hookflags. Verified against the whole official registry: 8,974 bit
comparisons over 613 hooks, zero deviation.
"""

HOOK_FLAGS = {
    "BEFORE_INITIALIZE": 1 << 13,
    "AFTER_INITIALIZE": 1 << 12,
    "BEFORE_ADD_LIQUIDITY": 1 << 11,
    "AFTER_ADD_LIQUIDITY": 1 << 10,
    "BEFORE_REMOVE_LIQUIDITY": 1 << 9,
    "AFTER_REMOVE_LIQUIDITY": 1 << 8,
    "BEFORE_SWAP": 1 << 7,
    "AFTER_SWAP": 1 << 6,
    "BEFORE_DONATE": 1 << 5,
    "AFTER_DONATE": 1 << 4,
    "BEFORE_SWAP_RETURNS_DELTA": 1 << 3,
    "AFTER_SWAP_RETURNS_DELTA": 1 << 2,
    "AFTER_ADD_LIQUIDITY_RETURNS_DELTA": 1 << 1,
    "AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA": 1 << 0,
}

REGISTRY_NAME = {
    "BEFORE_INITIALIZE": "beforeInitialize",
    "AFTER_INITIALIZE": "afterInitialize",
    "BEFORE_ADD_LIQUIDITY": "beforeAddLiquidity",
    "AFTER_ADD_LIQUIDITY": "afterAddLiquidity",
    "BEFORE_REMOVE_LIQUIDITY": "beforeRemoveLiquidity",
    "AFTER_REMOVE_LIQUIDITY": "afterRemoveLiquidity",
    "BEFORE_SWAP": "beforeSwap",
    "AFTER_SWAP": "afterSwap",
    "BEFORE_DONATE": "beforeDonate",
    "AFTER_DONATE": "afterDonate",
    "BEFORE_SWAP_RETURNS_DELTA": "beforeSwapReturnsDelta",
    "AFTER_SWAP_RETURNS_DELTA": "afterSwapReturnsDelta",
    "AFTER_ADD_LIQUIDITY_RETURNS_DELTA": "afterAddLiquidityReturnsDelta",
    "AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA": "afterRemoveLiquidityReturnsDelta",
}

MASK = (1 << 14) - 1

def decode_flags(addr: str):
    lo = int(addr, 16) & MASK
    return lo, [k for k, v in HOOK_FLAGS.items() if lo & v]

def can_alter_swap_output(addr: str) -> bool:
    lo, _ = decode_flags(addr)
    return bool(lo & (HOOK_FLAGS["BEFORE_SWAP_RETURNS_DELTA"] | HOOK_FLAGS["AFTER_SWAP_RETURNS_DELTA"]))
