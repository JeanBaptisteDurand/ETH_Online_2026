"""The counterfactual.

Swap the hook, not the pool. `anvil_setCode` rewrites the bytecode at the hook's address; the
PoolKey — which contains that address — is untouched, so poolId, liquidity, slot0 and reserves are
identical. Quote twice. The difference is what the hook took.

bps = (out_without - out_with) / out_without * 10_000

A negative result is not negative extraction: it means the hook *is* the liquidity (custom
accounting), and removing it destroys the pool rather than revealing a fee. Those are labelled
NOT_MEASURABLE, never reported as a number.
"""
from __future__ import annotations   # Python 3.9 compat: PEP 604 unions in annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from . import __version__
from .consts import SLOT0_LP_FEE_SHIFT, SLOT0_PROTOCOL_FEE_SHIFT, U24, POOL_MANAGER
from .keccak import keccak256
from .poolid import PoolKey
from .quote import quote
from .rpc import eth_call, get_code, set_code
from .stub import BYTECODE as STUB, digest as stub_digest

EXTSLOAD = "0x" + keccak256(b"extsload(bytes32)")[:4].hex()

# A hook that gives back more than it takes is running custom accounting.
CUSTOM_ACCOUNTING_BPS = -100.0

@dataclass
class Measurement:
    hook: str
    pool_id: str
    chain_id: int
    block_number: int
    currency0: str
    currency1: str
    key_fee: int
    tick_spacing: int
    fee_is_dynamic: bool
    stored_lp_fee: int | None
    stored_protocol_fee: int | None
    zero_for_one: bool
    amount_in: str
    out_with: str | None
    out_without: str | None
    bps: float | None
    label: str
    reason: str | None
    stub_hash: str
    engine_ver: str
    observed_at: str

    def dict(self):
        return asdict(self)

def read_slot0(url: str, key: PoolKey):
    raw = eth_call(url, POOL_MANAGER, EXTSLOAD + key.slot0()[2:])
    if not raw or raw == "0x":
        return None, None
    v = int(raw, 16)
    return (v >> SLOT0_LP_FEE_SHIFT) & U24, (v >> SLOT0_PROTOCOL_FEE_SHIFT) & U24

def read_liquidity(url: str, key: PoolKey) -> int:
    raw = eth_call(url, POOL_MANAGER, EXTSLOAD + key.liquidity_slot()[2:])
    return int(raw, 16) if raw and raw != "0x" else 0

def measure(url: str, key: PoolKey, zero_for_one: bool, amount_in: int, block: int) -> Measurement:
    lp_fee, proto_fee = read_slot0(url, key)
    base = dict(
        hook=key.hooks, pool_id="0x" + key.pool_id().hex(), chain_id=8453,
        block_number=block, currency0=key.currency0, currency1=key.currency1,
        key_fee=key.fee, tick_spacing=key.tick_spacing, fee_is_dynamic=key.is_dynamic_fee,
        stored_lp_fee=lp_fee, stored_protocol_fee=proto_fee,
        zero_for_one=zero_for_one, amount_in=str(amount_in),
        stub_hash=stub_digest(), engine_ver=f"tare-engine/{__version__}",
        observed_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )

    with_hook, err = quote(url, key, zero_for_one, amount_in)
    if with_hook is None:
        return Measurement(**base, out_with=None, out_without=None, bps=None,
                           label="NOT_QUOTABLE", reason=err)

    original = get_code(url, key.hooks)
    set_code(url, key.hooks, STUB)
    try:
        without_hook, err2 = quote(url, key, zero_for_one, amount_in)
    finally:
        set_code(url, key.hooks, original)      # always restore, even on failure

    if without_hook is None:
        return Measurement(**base, out_with=str(with_hook), out_without=None, bps=None,
                           label="NOT_MEASURABLE", reason=f"stub:{err2}")

    bps = (without_hook - with_hook) / without_hook * 10_000
    if bps <= CUSTOM_ACCOUNTING_BPS:
        return Measurement(**base, out_with=str(with_hook), out_without=str(without_hook),
                           bps=None, label="NOT_MEASURABLE", reason="custom accounting")

    return Measurement(**base, out_with=str(with_hook), out_without=str(without_hook),
                       bps=round(bps, 4), label="MEASURED", reason=None)
