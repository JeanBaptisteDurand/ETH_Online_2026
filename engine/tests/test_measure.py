"""Labelling logic, exercised against a fake RPC.

These are the tests that matter: they check that the engine refuses to turn an ambiguous
observation into a number. Every false finding this project produced came from doing that.
"""
import unittest
from unittest.mock import patch
from tare.measure import measure
from tare.poolid import PoolKey

K = PoolKey("0x1111111111111111111111111111111111111111",
            "0x2222222222222222222222222222222222222222",
            0, 200, "0x3333333333333333333333333333333333333333")

def fake(with_out, without_out, lp_fee=0):
    """Returns patches producing the given quotes."""
    calls = {"n": 0}
    def _quote(url, key, zfo, amt):
        calls["n"] += 1
        v = with_out if calls["n"] == 1 else without_out
        return (v, None) if v is not None else (None, "NOT_ENOUGH_LIQUIDITY")
    def _slot0(url, key):
        return lp_fee, 0
    return _quote, _slot0

class TestLabelling(unittest.TestCase):
    def _run(self, with_out, without_out, lp_fee=0):
        q, s = fake(with_out, without_out, lp_fee)
        with patch("tare.measure.quote", q), patch("tare.measure.read_slot0", s), \
             patch("tare.measure.get_code", lambda *a, **k: "0xbeef"), \
             patch("tare.measure.set_code", lambda *a, **k: None):
            return measure("http://x", K, True, 10**15, 50614000)

    def test_normal_extraction_is_measured(self):
        m = self._run(9900, 10000)
        self.assertEqual(m.label, "MEASURED")
        self.assertAlmostEqual(m.bps, 100.0, places=2)

    def test_zero_extraction_is_measured_not_dropped(self):
        m = self._run(10000, 10000)
        self.assertEqual(m.label, "MEASURED")
        self.assertEqual(m.bps, 0.0)

    def test_custom_accounting_is_not_measurable(self):
        # Removing the hook makes the pool worse: the hook *is* the liquidity.
        m = self._run(10000, 100)
        self.assertEqual(m.label, "NOT_MEASURABLE")
        self.assertIsNone(m.bps)
        self.assertEqual(m.reason, "custom accounting")

    def test_unquotable_pool_is_labelled_not_valued(self):
        m = self._run(None, None)
        self.assertEqual(m.label, "NOT_QUOTABLE")
        self.assertIsNone(m.bps)

    def test_stub_breaks_pool_is_not_measurable(self):
        m = self._run(9900, None)
        self.assertEqual(m.label, "NOT_MEASURABLE")
        self.assertIsNone(m.bps)
        self.assertTrue(m.reason.startswith("stub:"))

    def test_stored_lp_fee_is_recorded(self):
        m = self._run(9900, 10000, lp_fee=3000)
        self.assertEqual(m.stored_lp_fee, 3000)

    def test_zero_lp_fee_is_recorded_as_zero_not_none(self):
        m = self._run(9900, 10000, lp_fee=0)
        self.assertEqual(m.stored_lp_fee, 0)
        self.assertIsNotNone(m.stored_lp_fee)

    def test_every_measurement_is_replayable(self):
        m = self._run(9900, 10000)
        for field in ("pool_id", "block_number", "amount_in", "zero_for_one",
                      "stub_hash", "engine_ver", "observed_at", "chain_id"):
            self.assertIsNotNone(getattr(m, field), f"{field} missing -> not replayable")

    def test_pool_id_is_derived_not_guessed(self):
        m = self._run(9900, 10000)
        self.assertEqual(m.pool_id, "0x" + K.pool_id().hex())

    def test_hook_code_is_restored_even_when_stub_quote_fails(self):
        restored = []
        q, s = fake(9900, None)
        with patch("tare.measure.quote", q), patch("tare.measure.read_slot0", s), \
             patch("tare.measure.get_code", lambda *a, **k: "0xORIGINAL"), \
             patch("tare.measure.set_code", lambda u, a, c: restored.append(c)):
            measure("http://x", K, True, 10**15, 50614000)
        self.assertEqual(restored[-1], "0xORIGINAL")

    def test_dynamic_fee_flag_is_carried(self):
        dyn = PoolKey(K.currency0, K.currency1, 0x800000, 200, K.hooks)
        q, s = fake(9900, 10000)
        with patch("tare.measure.quote", q), patch("tare.measure.read_slot0", s), \
             patch("tare.measure.get_code", lambda *a, **k: "0xbeef"), \
             patch("tare.measure.set_code", lambda *a, **k: None):
            m = measure("http://x", dyn, True, 10**15, 50614000)
        self.assertTrue(m.fee_is_dynamic)

    def test_bps_is_rounded_not_truncated(self):
        m = self._run(9999, 10000)
        self.assertEqual(m.bps, 1.0)
