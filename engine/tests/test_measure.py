"""Labelling logic, exercised against a fake RPC.

These are the tests that matter: they check that the engine refuses to turn an ambiguous
observation into a number. Every false finding this project produced came from doing that.
"""
import unittest
from unittest.mock import patch
from tare.measure import measure
from tare.poolid import PoolKey
from tare.stub import BYTECODE as STUB

ORIGINAL = "0x" + "60" * 12_000     # un vrai hook : gros, et different du talon

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
    def _run(self, with_out, without_out, lp_fee=0, noeud=None):
        """`noeud` simule le nud : ce que `get_code` rend apres `set_code`.

        Un simulacre qui rend toujours la meme constante ne modelise pas anvil ; il modelise
        un nud ou setCode n'a aucun effet, ce qui est precisement la panne que le moteur doit
        detecter. Le simulacre par defaut applique donc reellement l'ecriture.
        """
        q, s = fake(with_out, without_out, lp_fee)
        etat = {"code": ORIGINAL}
        noeud = noeud or (lambda code: etat.__setitem__("code", code))
        with patch("tare.measure.quote", q), patch("tare.measure.read_slot0", s), \
             patch("tare.measure.get_code", lambda *a, **k: etat["code"]), \
             patch("tare.measure.set_code", lambda url, addr, code: noeud(code)):
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


class TestLeTalonDoitEtreLa(unittest.TestCase):
    """La panne la plus credible de toutes : `anvil_setCode` accepte et n'applique rien.

    La seconde cotation repasse alors par le VRAI hook, la difference vaut exactement zero,
    et la ligne sort `MEASURED` a 0.00 bps. Ce n'est pas une valeur aberrante qu'un lecteur
    remarquerait : un hook qui ne preleve rien existe pour de bon — quatre le font sur
    ETH/USDC. Une panne qui ressemble a un resultat legitime est la pire espece, et c'est
    exactement la forme du faux resultat #5, ou deux mesureurs partageant un fork se
    restauraient mutuellement le hook et 100 bps devenaient 0.00.
    """

    def _run(self, with_out, without_out, noeud):
        q, s = fake(with_out, without_out, 0)
        etat = {"code": ORIGINAL}
        with patch("tare.measure.quote", q), patch("tare.measure.read_slot0", s), \
             patch("tare.measure.get_code", lambda *a, **k: etat["code"]), \
             patch("tare.measure.set_code",
                   lambda url, addr, code: noeud(etat, code)):
            return measure("http://x", K, True, 10**15, 50614000)

    def test_un_setCode_inoperant_ne_rend_jamais_un_nombre(self):
        # Le nud accepte l'ecriture et ne change rien.
        m = self._run(9900, 10000, noeud=lambda etat, code: None)
        self.assertEqual(m.label, "NOT_MEASURABLE")
        self.assertIsNone(m.bps)
        self.assertIn("stub_absent", m.reason)

    def test_un_hook_restaure_pendant_la_cotation_ne_rend_jamais_un_nombre(self):
        # Le talon s'installe, puis un mesureur concurrent remet le hook avant la cotation.
        appels = {"n": 0}

        def noeud(etat, code):
            appels["n"] += 1
            etat["code"] = code
            if appels["n"] == 1:
                # l'ecriture a pris, mais get_code rendra le hook au controle d'apres
                etat["rendu"] = code
        etat_partage = {}

        q, s = fake(9900, 10000, 0)
        lectures = {"n": 0}

        def get_code(*a, **k):
            lectures["n"] += 1
            # 1re lecture : l'original. 2e : le talon (installe). 3e, apres la cotation :
            # le hook est revenu — un autre processus l'a restaure.
            return {1: ORIGINAL, 2: STUB}.get(lectures["n"], ORIGINAL)

        with patch("tare.measure.quote", q), patch("tare.measure.read_slot0", s), \
             patch("tare.measure.get_code", get_code), \
             patch("tare.measure.set_code", lambda *a, **k: None):
            m = measure("http://x", K, True, 10**15, 50614000)
        self.assertEqual(m.label, "NOT_MEASURABLE")
        self.assertIsNone(m.bps)
        self.assertIn("un_seul_mesureur_par_fork", m.reason)

    def test_le_chemin_normal_reste_MEASURED(self):
        # La garde ne doit pas transformer une mesure correcte en refus.
        m = self._run(9900, 10000, noeud=lambda etat, code: etat.__setitem__("code", code))
        self.assertEqual(m.label, "MEASURED")
        self.assertAlmostEqual(m.bps, 100.0, places=2)
