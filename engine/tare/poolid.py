"""PoolKey -> poolId -> storage slots.

    poolId    = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
    stateSlot = keccak256(abi.encode(poolId, POOLS_SLOT))
    liquidity = stateSlot + 3        slot0 = stateSlot + 0

The derivation is checked against a live pool in tests/test_poolid.py, because getting it wrong
returns a plausible zero rather than an error — which is exactly how an earlier version of this
project concluded that 100% of pools were empty.
"""
from dataclasses import dataclass
from .keccak import keccak256
from .consts import POOLS_SLOT, OFF_SLOT0, OFF_LIQUIDITY, DYNAMIC_FEE_FLAG

def _w(x: int) -> bytes:
    return int(x).to_bytes(32, "big", signed=(x < 0))

def _addr(a: str) -> bytes:
    return bytes(12) + bytes.fromhex(a[2:].rjust(40, "0"))

@dataclass(frozen=True)
class PoolKey:
    currency0: str
    currency1: str
    fee: int
    tick_spacing: int
    hooks: str

    @property
    def is_dynamic_fee(self) -> bool:
        return bool(self.fee & DYNAMIC_FEE_FLAG)

    def pool_id(self) -> bytes:
        return keccak256(
            _addr(self.currency0) + _addr(self.currency1)
            + _w(self.fee) + _w(self.tick_spacing) + _addr(self.hooks)
        )

    def _state_base(self) -> int:
        return int.from_bytes(keccak256(self.pool_id() + _w(POOLS_SLOT)), "big")

    def slot(self, offset: int) -> str:
        return "0x" + format((self._state_base() + offset) % (1 << 256), "064x")

    def slot0(self) -> str:
        return self.slot(OFF_SLOT0)

    def liquidity_slot(self) -> str:
        return self.slot(OFF_LIQUIDITY)
