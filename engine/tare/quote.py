"""V4Quoter.quoteExactInputSingle.

    quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))

One dynamic member (`hookData`) makes the outer tuple dynamic, so the head is a single 0x20 offset
followed by the struct. Selector checked in tests against `cast sig`.
"""
from .poolid import PoolKey
from .rpc import eth_call, RpcError
from .consts import V4_QUOTER

SELECTOR = "aa9d21cb"

# UnexpectedRevertBytes — the wrapper v4 puts around a bubbled-up custom error.
UNEXPECTED_REVERT = "6190b2b0"

# BaseV4Quoter.sol:16 — the quoter reverts with this when the pool cannot serve the swap.
# It accounted for 100% of the failures in our first sweep, and it is direction-dependent:
# a pool that cannot quote one way often quotes the other.
NOT_ENOUGH_LIQUIDITY = "7a5ed734"

def _u(x: int) -> str:
    return format(x if x >= 0 else (1 << 256) + x, "064x")

def _a(a: str) -> str:
    return a[2:].lower().rjust(64, "0")

def encode(key: PoolKey, zero_for_one: bool, amount_in: int) -> str:
    return ("0x" + SELECTOR
            + _u(0x20)
            + _a(key.currency0) + _a(key.currency1)
            + _u(key.fee) + _u(key.tick_spacing) + _a(key.hooks)
            + _u(1 if zero_for_one else 0)
            + _u(amount_in)
            + _u(0x100)          # offset of hookData inside the struct
            + _u(0))             # hookData length 0

def first_quotable_direction(url: str, key: PoolKey, amount_in: int):
    """A pool often quotes one way and not the other. Try both before calling it dead."""
    for zfo in (True, False):
        out, _ = quote(url, key, zfo, amount_in)
        if out is not None:
            return zfo
    return None

def quote(url: str, key: PoolKey, zero_for_one: bool, amount_in: int):
    """Return (amount_out, None) or (None, reason)."""
    try:
        raw = eth_call(url, V4_QUOTER, encode(key, zero_for_one, amount_in))
    except RpcError as e:
        msg = str(e)
        if NOT_ENOUGH_LIQUIDITY in msg:
            return None, "NOT_ENOUGH_LIQUIDITY"
        return None, msg[:120]
    if not raw or len(raw) < 66:
        return None, "SHORT_RETURN"
    out = int(raw[2:66], 16)
    return (out, None) if out > 0 else (None, "ZERO_OUT")
