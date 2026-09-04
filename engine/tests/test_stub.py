import unittest
from tare import stub
from tare.consts import SEL_BEFORE_SWAP

class TestStub(unittest.TestCase):
    def test_is_valid_hex(self):
        self.assertTrue(stub.BYTECODE.startswith("0x"))
        bytes.fromhex(stub.BYTECODE[2:])          # raises if malformed

    def test_size_matches_measurements(self):
        # The 128 committed measurements were produced with this exact stub.
        self.assertEqual(stub.size(), 89)

    def test_hash_matches_measurements(self):
        self.assertEqual(stub.digest(),
            "0x8e39b2ad4344342b4f7dc5cf31df0aec9bd5b5f8ec7fccd241256cf1fda637a4")

    def test_echoes_before_swap_selector(self):
        # Hooks.sol:153 — word 0 of the return must be the selector that was called.
        self.assertIn(SEL_BEFORE_SWAP, stub.BYTECODE)

    def test_returns_96_bytes_on_before_swap_path(self):
        # Hooks.sol:166 — beforeSwap must return exactly 96 bytes: PUSH1 0x60, PUSH1 0, RETURN
        self.assertIn("60606000f3", stub.BYTECODE)

    def test_returns_64_bytes_on_delta_path(self):
        # Hooks.sol:259 — callHookWithReturnDelta requires exactly 64 bytes
        self.assertIn("60406000f3", stub.BYTECODE)

    def test_stores_selector_before_returning(self):
        # DUP1 (80), PUSH1 0 (6000), MSTORE (52) — word 0 of memory holds the selector
        self.assertIn("80600052", stub.BYTECODE)

    def test_has_a_jumpdest(self):
        self.assertIn("5b", stub.BYTECODE)
