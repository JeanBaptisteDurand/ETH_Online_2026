"""The 14 permission flags ARE the low 14 bits of the hook address.

This is not a convention we adopted: it is how v4 works, which is why hooks must be CREATE2-mined.
The test proves it against the entire official registry rather than a sample — because the whole
product rests on being able to say things about a hook without trusting anyone's description of it.
"""
import json, pathlib, unittest
from tare.flags import decode_flags, REGISTRY_NAME, HOOK_FLAGS, can_alter_swap_output

REG = pathlib.Path(__file__).parents[2] / "docs" / "hooklist.json"

def _entries():
    raw = json.loads(REG.read_text())
    return raw if isinstance(raw, list) else raw.get("hooks", [])

class TestFlags(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries = _entries()

    def test_registry_is_present_and_large(self):
        self.assertGreater(len(self.entries), 500)

    def test_fourteen_flags_defined(self):
        self.assertEqual(len(HOOK_FLAGS), 14)

    def test_bits_are_unique_and_cover_0_to_13(self):
        self.assertEqual(sorted(HOOK_FLAGS.values()), [1 << i for i in range(14)])

    def test_every_bit_matches_the_registry_on_every_hook(self):
        """613 fiches x 14 booleens = 8582 comparaisons. Un seul ecart invalide le widget
        a 14 diodes, qui n'appelle personne et ne peut donc pas se rattraper.

        Le meme compte est imprime par apps/api/src/assistant/__tests__/flags.test.ts,
        sur le meme registre, depuis une implementation independante.
        """
        checked = mismatched = 0
        for e in self.entries:
            hk = e.get("hook") or {}
            addr = hk.get("address") or hk.get("id") or hk.get("hook")
            if not isinstance(addr, str) or not addr.startswith("0x"):
                continue
            flags = e.get("flags") or {}
            if not flags:
                continue
            _, active = decode_flags(addr)
            active_registry_names = {REGISTRY_NAME[a] for a in active}
            for ours, theirs in REGISTRY_NAME.items():
                if theirs not in flags:
                    continue
                checked += 1
                if bool(flags[theirs]) != (theirs in active_registry_names):
                    mismatched += 1
        self.assertGreater(checked, 5000, "registry shape changed — nothing was compared")
        self.assertEqual(mismatched, 0, f"{mismatched} bit mismatches over {checked} comparisons")
        print(f"\n    {checked} comparaisons de bits, {mismatched} écart")

    def test_zero_address_has_no_flags(self):
        bitmap, active = decode_flags("0x0000000000000000000000000000000000000000")
        self.assertEqual(bitmap, 0)
        self.assertEqual(active, [])

    def test_known_hook_alters_swap_output(self):
        # 0x985c14baa2... carries beforeSwapReturnsDelta + afterSwapReturnsDelta
        self.assertTrue(can_alter_swap_output("0x985c14baa2a18316ffda0aefb3a632fadfca2acc"))

    def test_hookless_pool_cannot_alter_output(self):
        self.assertFalse(can_alter_swap_output("0x0000000000000000000000000000000000000000"))
