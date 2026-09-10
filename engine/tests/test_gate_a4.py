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


class TestReleveSurDisque(unittest.TestCase):
    """`--write`, et pourquoi il a fallu l'ajouter.

    La porte A4 est le SEUL endroit du projet ou une cotation devient un swap execute — donc
    la seule preuve que le corpus entier, qui est de la cotation, correspond a ce qui se passe
    vraiment. Et c'etait le seul resultat qui n'ecrivait rien : « 9 pools, 8 concordants au
    wei, 1 divergent » n'existait qu'en prose, dans des documents, sans artefact ni
    horodatage. Une preuve qui ne s'ecrit pas n'est pas une preuve, c'est un souvenir.
    """

    def test_le_releve_commite_porte_ce_qu_il_faut_pour_le_rejouer(self):
        import json, os
        from pathlib import Path
        from tare.gates import a4

        p = Path(a4._RACINE) / "docs" / "dataset" / "porte-a4.json"
        if not p.exists():
            self.skipTest("porte-a4.json absent : lance python3 -m tare.gates.a4 --write")
        d = json.loads(p.read_text())
        self.assertEqual(d["schema"], "tare-porte-a4/1")
        # Un releve sans commande de rejeu ni horodatage ne vaut pas mieux que la prose
        # qu'il remplace.
        self.assertIn("tare.gates.a4", d["replay"])
        self.assertRegex(d["ecrit_le"], r"^\d{4}-\d{2}-\d{2}T")
        # Le DENOMINATEUR est publie : « 3 pools concordent » ne veut rien dire sans savoir
        # combien ont ete essayes, ni combien la sonde n'a pas su jouer.
        self.assertGreaterEqual(d["candidats_essayes"], d["n"])
        self.assertIn("injouables_par_la_sonde", d)
        self.assertEqual(len(d["resultats"]), d["n"])

    def test_chaque_resultat_porte_les_deux_cotes_ET_les_deux_executions(self):
        import json
        from pathlib import Path
        from tare.gates import a4

        p = Path(a4._RACINE) / "docs" / "dataset" / "porte-a4.json"
        if not p.exists():
            self.skipTest("porte-a4.json absent")
        for r in json.loads(p.read_text())["resultats"]:
            # Les quatre nombres, sans exception : sans les deux executions on ne peut pas
            # verifier le contrefactuel, seulement le croire.
            for k in ("cote_avec", "cote_sans", "execute_avec", "execute_sans",
                      "bps_publie", "bps_execute"):
                self.assertIn(k, r, f"{r.get('hook')} : {k} manquant")
            # et le verdict de concordance est DERIVE des nombres presents, pas ecrit
            self.assertEqual(r["identique_avec"], r["cote_avec"] == r["execute_avec"])
            self.assertEqual(r["identique_sans"], r["cote_sans"] == r["execute_sans"])

    def test_la_piste_est_append_only(self):
        import json
        from pathlib import Path
        from tare.gates import a4

        p = Path(a4._RACINE) / "docs" / "dataset" / "porte-a4.jsonl"
        if not p.exists():
            self.skipTest("porte-a4.jsonl absent")
        lignes = [l for l in p.read_text().splitlines() if l.strip()]
        self.assertGreaterEqual(len(lignes), 1)
        # Chaque ligne est un passage complet et datable : un fichier ecrase perdrait les
        # precedents, et une preuve qu'on remplace a chaque fois n'est pas une piste.
        for l in lignes:
            d = json.loads(l)
            self.assertEqual(d["schema"], "tare-porte-a4/1")
            self.assertIn("ecrit_le", d)
