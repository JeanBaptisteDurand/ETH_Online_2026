"""Le volume, et surtout ce qu'on refuse d'en faire.

Ce module multiplie un volume CUMULE par un taux mesure a UN SEUL bloc. C'est utile et
c'est faux si on le presente comme un montant constate. Les tests ci-dessous verrouillent
les trois choses qui empechent cette confusion : l'hypothese est ecrite dans le fichier,
un pool non retrouve est ABSENT et jamais a zero, et l'estimation est BORNEE (median et
maximum), jamais un nombre unique.
"""
from __future__ import annotations

import json
import os
import unittest

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FICHIER = os.path.join(REPO, "docs", "dataset", "volume-base.json")


@unittest.skipUnless(os.path.exists(FICHIER), "volume-base.json absent (python3 -m tare.volume)")
class TestVolumeBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(FICHIER) as f:
            cls.d = json.load(f)

    def test_l_hypothese_est_ecrite_dans_le_fichier(self):
        h = self.d["estimation"]["hypothese"]
        self.assertIn("CUMULE", h)
        self.assertIn("UN SEUL", h)
        self.assertIn("estimation", h.lower())

    def test_l_estimation_est_bornee_jamais_un_nombre_unique(self):
        e = self.d["estimation"]
        self.assertIn("au_taux_median_usd", e)
        self.assertIn("au_taux_maximum_usd", e)
        self.assertGreaterEqual(e["au_taux_maximum_usd"], e["au_taux_median_usd"])

    def test_un_pool_non_retrouve_est_absent_pas_a_zero(self):
        c = self.d["couverture"]
        self.assertIn("jamais present a volume zero", c["note"])
        self.assertEqual(len(self.d["pools"]), c["retrouves"])

    def test_la_source_dit_quel_subgraph_et_pourquoi_pas_l_autre(self):
        s = self.d["source"]
        self.assertEqual(s["subgraph"], "5f2npKL2a8oC6thaahyGW5NhJPAtDyMRnQHVmaNSJZ6o")
        self.assertIn("ETHEREUM", s["note"])

    def test_l_estimation_ne_depasse_pas_le_volume_couvert(self):
        e = self.d["estimation"]
        self.assertLessEqual(e["au_taux_median_usd"], e["volume_couvert_usd"])
        self.assertLessEqual(e["au_taux_maximum_usd"], e["volume_couvert_usd"])

    def test_le_recensement_est_confirme_par_une_source_independante(self):
        c = self.d["couverture"]
        self.assertEqual(c["retrouves"], c["pools_du_recensement"])
        self.assertEqual(c["part"], 1.0)
