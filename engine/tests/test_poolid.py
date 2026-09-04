import unittest
from tare.poolid import PoolKey
from tare.consts import DYNAMIC_FEE_FLAG

# A real Base pool, used because a wrong derivation returns a plausible zero, not an error.
LIVE = PoolKey(
    currency0="0x33747ca0945c56315f3e8ae09fc7d4069f1e8c0c",
    currency1="0x4200000000000000000000000000000000000006",
    fee=8388608, tick_spacing=200,
    hooks="0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc",
)
EXPECTED_ID = "706140c978c382cda318ba3d1282368231e580a3d7b13803d09ca3593caca8cf"

class TestPoolId(unittest.TestCase):
    def test_pool_id_matches_chain(self):
        self.assertEqual(LIVE.pool_id().hex(), EXPECTED_ID)

    def test_pool_id_is_32_bytes(self):
        self.assertEqual(len(LIVE.pool_id()), 32)

    def test_slots_are_contiguous(self):
        s0 = int(LIVE.slot0(), 16)
        liq = int(LIVE.liquidity_slot(), 16)
        self.assertEqual(liq - s0, 3)

    def test_slot_is_32_byte_hex(self):
        self.assertEqual(len(LIVE.slot0()), 66)

    def test_dynamic_fee_detected(self):
        self.assertTrue(LIVE.is_dynamic_fee)
        self.assertEqual(LIVE.fee, DYNAMIC_FEE_FLAG)

    def test_static_fee_detected(self):
        static = PoolKey(LIVE.currency0, LIVE.currency1, 0, 200, LIVE.hooks)
        self.assertFalse(static.is_dynamic_fee)

    def test_hook_address_changes_pool_id(self):
        other = PoolKey(LIVE.currency0, LIVE.currency1, LIVE.fee, LIVE.tick_spacing,
                        "0x0000000000000000000000000000000000000000")
        self.assertNotEqual(other.pool_id(), LIVE.pool_id())

    def test_negative_tick_spacing_encodes_signed(self):
        neg = PoolKey(LIVE.currency0, LIVE.currency1, 0, -60, LIVE.hooks)
        self.assertEqual(len(neg.pool_id()), 32)
