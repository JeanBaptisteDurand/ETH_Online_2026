"""The inert hook.

`v4-core/src/libraries/Hooks.sol` does not care what a hook *does*; it validates what a hook
*returns*:

  * every hook call must return at least 32 bytes, and the first word must be the selector
    that was called (`Hooks.sol:153`);
  * `beforeSwap` must return exactly 96 bytes — selector, BeforeSwapDelta, lpFeeOverride
    (`Hooks.sol:166`);
  * the delta-returning path requires exactly 64 bytes (`Hooks.sol:259`).

So the smallest hook that satisfies the protocol while doing nothing must read the incoming
selector, echo it in word 0, and return 96 bytes for `beforeSwap` and 64 otherwise. That is the
whole program.

A note on the returned `lpFeeOverride`: it is zero, and zero does **not** activate the override.
`Pool.sol:303-305` only applies an override when the `0x400000` flag is set, so a pool with a
dynamic fee falls back to `slot0.lpFee` — its stored fee — rather than to zero. This was checked
after an earlier version of this project wrongly claimed the opposite.
"""
from .keccak import keccak256

# PUSH32 mask | CALLDATALOAD 0 | AND | DUP1 | MSTORE 0 |
# PUSH32 beforeSwap.selector | EQ | JUMPI 0x53 | RETURN 64 | JUMPDEST | RETURN 96
BYTECODE = (
    "0x"
    "7fffffffff00000000000000000000000000000000000000000000000000000000"  # PUSH32 selector mask
    "60003516"                                                           # CALLDATALOAD 0, AND
    "80600052"                                                           # DUP1, MSTORE at 0
    "7f575e24b400000000000000000000000000000000000000000000000000000000"  # PUSH32 beforeSwap sel
    "14"                                                                 # EQ
    "605357"                                                             # PUSH1 0x53, JUMPI
    "60406000f3"                                                         # RETURN 64 bytes
    "5b"                                                                 # JUMPDEST 0x53
    "60606000f3"                                                         # RETURN 96 bytes
)

def size() -> int:
    return (len(BYTECODE) - 2) // 2

def digest() -> str:
    return "0x" + keccak256(bytes.fromhex(BYTECODE[2:])).hex()
