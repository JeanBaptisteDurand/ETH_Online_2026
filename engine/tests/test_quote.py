import unittest
from tare.quote import encode, SELECTOR, NOT_ENOUGH_LIQUIDITY
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

    v4 wraps custom errors, so `NotEnoughLiquidity` (0x7a5ed734) appears inside
    `UnexpectedRevertBytes` (0x6190b2b0) far past that cutoff. Truncating silently disabled the
    detection and every unquotable pool came back as an opaque failure. This is the fourth time a
    bounded read produced a false finding in this project; the test exists so it is the last.
    """
    REAL_ERROR = (
        "{'code': 3, 'message': 'execution reverted: custom error 0x6190b2b0: "
        "00000000000000000000000000000000000000000000000000000000000000200000000000"
        "0000000000000000000000000000000000000000000000000000247a5ed734706140c978c3"
        "82cda318ba3d1282368231e580a3d7b13803d09ca3593caca8cf'}"
    )

    def test_selector_sits_past_200_chars(self):
        self.assertGreater(self.REAL_ERROR.index("7a5ed734"), 200)

    def test_detection_works_on_full_string(self):
        self.assertIn(NOT_ENOUGH_LIQUIDITY, self.REAL_ERROR)

    def test_detection_fails_on_truncated_string(self):
        self.assertNotIn(NOT_ENOUGH_LIQUIDITY, self.REAL_ERROR[:200])

    def test_rpc_does_not_truncate_errors(self):
        import inspect
        from tare import rpc
        src = inspect.getsource(rpc)
        self.assertNotIn('[:200]', src, "rpc.py must not truncate error bodies")
