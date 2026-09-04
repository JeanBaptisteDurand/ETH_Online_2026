import unittest
from tare.quote import encode, SELECTOR, NOT_ENOUGH_LIQUIDITY, UNEXPECTED_REVERT
from tare.poolid import PoolKey

K = PoolKey("0x33747ca0945c56315f3e8ae09fc7d4069f1e8c0c",
            "0x4200000000000000000000000000000000000006",
            8388608, 200, "0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc")

class TestQuote(unittest.TestCase):
    def test_selector_matches_cast_sig(self):
        self.assertEqual(SELECTOR, "aa9d21cb")

    def test_calldata_word_aligned(self):
        d = encode(K, True, 10**15)
        self.assertEqual((len(d) - 2 - 8) % 64, 0)

    def test_calldata_has_ten_words(self):
        d = encode(K, True, 10**15)
        self.assertEqual((len(d) - 2 - 8) // 64, 10)

    def test_head_is_offset_20(self):
        d = encode(K, True, 10**15)
        self.assertEqual(int(d[10:74], 16), 0x20)

    def test_direction_is_encoded(self):
        a = encode(K, True, 10**15)
        b = encode(K, False, 10**15)
        self.assertNotEqual(a, b)

    def test_amount_is_encoded(self):
        a = encode(K, True, 10**15)
        b = encode(K, True, 10**18)
        self.assertNotEqual(a, b)

    def test_hookdata_is_empty(self):
        d = encode(K, True, 10**15)
        self.assertEqual(int(d[-64:], 16), 0)

    def test_not_enough_liquidity_selector(self):
        from tare.keccak import keccak256
        self.assertEqual(keccak256(b"NotEnoughLiquidity(bytes32)")[:4].hex(),
                         NOT_ENOUGH_LIQUIDITY)


class TestTruncationRegression(unittest.TestCase):
    """Regression: rpc.py used to truncate error strings to 200 chars.

    v4 wraps custom errors, so `NotEnoughLiquidity` (0x7a5ed734) sits inside
    `UnexpectedRevertBytes` (0x6190b2b0). In the real revert captured from a Base fork the
    selector *starts* at index 197 and is 8 characters long, so a 200-char cutoff slices it in
    half and the detection silently never fires — every unquotable pool came back opaque.

    This is the fourth false finding this project produced from a bounded read (a `[:3]` slice, a
    2,000-byte body, a `head -c 220`, and this). The fixture is the real string, not a
    reconstruction: an earlier version of this test hand-typed an approximation and asserted the
    wrong thing about it.
    """
    @classmethod
    def setUpClass(cls):
        import pathlib
        cls.REAL = pathlib.Path(__file__).parent.joinpath("fixture_revert.txt").read_text()

    def test_fixture_is_the_real_revert(self):
        self.assertIn(UNEXPECTED_REVERT, self.REAL)
        self.assertGreater(len(self.REAL), 500)

    def test_selector_is_sliced_by_a_200_char_cutoff(self):
        i = self.REAL.index(NOT_ENOUGH_LIQUIDITY)
        self.assertLess(i, 200)              # it starts before the cutoff
        self.assertGreater(i + 8, 200)       # but ends after it, so the match is destroyed

    def test_detection_works_on_full_string(self):
        self.assertIn(NOT_ENOUGH_LIQUIDITY, self.REAL)

    def test_detection_fails_on_truncated_string(self):
        self.assertNotIn(NOT_ENOUGH_LIQUIDITY, self.REAL[:200])

    def test_rpc_does_not_truncate_errors(self):
        import inspect
        from tare import rpc
        self.assertNotIn("[:200]", inspect.getsource(rpc),
                         "rpc.py must not truncate error bodies")
