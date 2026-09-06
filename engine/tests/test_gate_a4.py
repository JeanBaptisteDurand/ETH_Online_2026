"""La porte d'execution : ce qu'elle promet, et ce qu'elle refuse de confondre.

Ces tests ne touchent aucune chaine. Ils verifient la LOGIQUE de la porte — le choix des
candidats, et surtout la separation entre deux echecs que rien ne doit melanger :

  - un pool que la sonde ne sait pas jouer (le hook tient sa propre comptabilite) ;
  - un pool ou la cotation et l'execution DIVERGENT.

Le premier est une limite de l'outil. Le second est un resultat. Les confondre ferait passer
une sonde incomplete pour une methode invalidee, ou l'inverse.

Le rejeu contre une vraie chaine est `make gate-a4`, et il est documente dans LIMITS 10b.
"""
import unittest
from unittest.mock import patch

from tare.gates import a4


class TestLeTirageDesCandidats(unittest.TestCase):
    def test_un_candidat_par_hook_pas_les_premieres_lignes_du_fichier(self):
        rows = a4.pick(12)
        if len(rows) < 2:
            self.skipTest("corpus trop court pour juger de la diversite")
        hooks = [r["hook"].lower() for r in rows]
        # Le corpus est ecrit dans l'ordre du balayage : prendre les n premieres lignes
        # donnait douze pools du MEME hook, et la porte concluait qu'aucun n'etait jouable.
        self.assertEqual(len(hooks), len(set(hooks)), "deux candidats partagent un hook")

    def test_ne_retient_que_des_pools_a_devise_d_entree_native(self):
        # Sans cela il faudrait se procurer un jeton et poser une approbation : deux etapes
        # de plus, chacune capable d'echouer pour une raison qui n'a rien a voir.
        for r in a4.pick(8):
            self.assertEqual(r["currency0"], "0x0000000000000000000000000000000000000000")
            self.assertTrue(r["zero_for_one"])
            self.assertEqual(r["label"], "MEASURED")


class TestCeQueLaPorteRefuseDeConfondre(unittest.TestCase):
    def _rows(self):
        return [
            {"hook": "0xaaa", "pool_id": "0xp1", "currency0": "0x0", "currency1": "0x1",
             "key_fee": 3000, "tick_spacing": 60, "zero_for_one": True,
             "amount_in": "1000", "out_with": "900", "out_without": "1000",
             "bps": 1000.0, "label": "MEASURED"},
            {"hook": "0xbbb", "pool_id": "0xp2", "currency0": "0x0", "currency1": "0x2",
             "key_fee": 3000, "tick_spacing": 60, "zero_for_one": True,
             "amount_in": "1000", "out_with": "800", "out_without": "1000",
             "bps": 2000.0, "label": "MEASURED"},
        ]

    def test_un_pool_injouable_est_compte_a_part_et_n_echoue_pas_la_porte(self):
        rows = self._rows()

        def faux_execute(rpc, probe, row):
            if row["hook"] == "0xaaa":
                raise a4.GateError("execution reverted: custom error 0x90bfb865")
            return 900 if row["out_with"] == "800" else 1000

        with patch.object(a4, "pick", return_value=rows), \
             patch.object(a4, "deploy", return_value="0xprobe"), \
             patch.object(a4, "rpc_call", return_value="0x00"), \
             patch.object(a4, "execute", side_effect=lambda r, p, row: (
                 (_ for _ in ()).throw(a4.GateError("reverted"))
                 if row["hook"] == "0xaaa"
                 else (800 if row.get("_stub") else 800))):
            # 0xaaa reverte, 0xbbb passe : la porte doit rendre un resultat, pas lever.
            rep = a4.run("http://x", n=1)
        self.assertEqual(rep["n"], 1)
        self.assertEqual(len(rep["injouables_par_la_sonde"]), 1)
        self.assertEqual(rep["injouables_par_la_sonde"][0]["hook"], "0xaaa")
        self.assertIn("limite de la sonde", rep["note_injouables"])

    def test_aucun_pool_jouable_leve_au_lieu_de_rendre_un_verdict_vide(self):
        # Zero execution ne vaut pas « tout concorde » : sans une seule execution la porte
        # n'a rien verifie, et elle doit le dire plutot que de sortir verte.
        with patch.object(a4, "pick", return_value=self._rows()), \
             patch.object(a4, "deploy", return_value="0xprobe"), \
             patch.object(a4, "execute", side_effect=a4.GateError("reverted")):
            with self.assertRaises(a4.GateError) as ctx:
                a4.run("http://x", n=1)
        self.assertIn("aucun des", str(ctx.exception))

    def test_le_rapport_publie_son_denominateur(self):
        # 8 concordants sur 9 executes ne se lit pas comme 8 sur 8 : le nombre d'essais et
        # le nombre d'injouables voyagent avec le resultat.
        rows = self._rows()
        with patch.object(a4, "pick", return_value=rows), \
             patch.object(a4, "deploy", return_value="0xprobe"), \
             patch.object(a4, "rpc_call", return_value="0x00"), \
             patch.object(a4, "execute", return_value=900):
            rep = a4.run("http://x", n=2)
        self.assertIn("candidats_essayes", rep)
        self.assertIn("injouables_par_la_sonde", rep)
        self.assertEqual(rep["candidats_essayes"], len(rows))


if __name__ == "__main__":
    unittest.main()
