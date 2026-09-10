"""Les hooks declarent-ils ? Le scan derriere « N sur M ».

Ce que ces tests protegent : le paragraphe d'ouverture de README.md et de docs/SUBMISSION.md —
le premier texte qu'un juge lit. Il affirmait « 0 des 84 hooks deployes en 24 000 blocs
n'emet HookSwap ni HookFee ». Trois choses etaient fausses :

  - la fenetre : le corpus couvre 200 000 blocs, pas 24 000 ;
  - le nombre de hooks : 1 559, pas 84 ;
  - et le zero : NEUF de ces 1 559 emettent bien l'un des deux evenements.

Le dossier le savait deja par ailleurs (« LaunchHook emet son taux a chaque echange ») : le
zero etait donc contredit par nos propres documents.

Les tests portent donc sur les deux choses qui empechent ca de revenir : les topic0 sont
CALCULES depuis leur signature, et un zero n'est publiable que si toute la fenetre a ete lue.
"""
import json, os, unittest
from pathlib import Path

from tare import declare

RACINE = Path(declare.RACINE)


class TestTopics(unittest.TestCase):
    def test_topic0_calcules_et_non_recopies(self):
        # Recopies, une faute de frappe dans une signature ferait scanner un evenement qui
        # n'existe pas, et le scan rendrait « zero » a coup sur — la reponse qu'on esperait.
        self.assertEqual(
            declare.topic0("HookSwap(bytes32,address,int128,int128,uint128,uint128)"),
            "0x365f10e9e7ce45d7acfd986c42e0b666f8af282e440e6dafc78c1f2b2f786760",
        )
        self.assertEqual(
            declare.topic0("HookFee(bytes32,address,uint128,uint128)"),
            "0x444083dce778da1269b63671912c00569a2a58fa85827911902301f91793ffd7",
        )

    def test_les_deux_signatures_sont_celles_du_guide(self):
        self.assertEqual(set(declare.SIGNATURES), {"HookSwap", "HookFee"})
        for sig in declare.SIGNATURES.values():
            self.assertIn("bytes32", sig)  # l'id du pool, premier parametre indexe


class TestExtractionDesHooks(unittest.TestCase):
    """L'adresse du hook est le TROISIEME mot non indexe. Se tromper d'offset donnerait un
    ensemble de hooks entierement faux — et un « 0 sur N » ou N serait faux aussi."""

    def _log(self, mots):
        return {"address": "0x498581ff718922c3f8e6a244956af099b2652b2b",
                "topics": ["0x" + "11" * 32],
                "data": "0x" + "".join(m.rjust(64, "0") for m in mots)}

    def test_offset_du_hook(self):
        import tempfile
        hook = "aa" * 20
        logs = [self._log(["1f4", "3c", hook, "deadbeef", "0"])]
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "l.json")
            Path(p).write_text(json.dumps(logs))
            r = declare.hooks_des_logs(p)
        self.assertEqual(r["hooks"], ["0x" + hook])
        self.assertEqual(r["n_hooks"], 1)

    def test_l_adresse_nulle_n_est_pas_un_hook(self):
        import tempfile
        logs = [self._log(["1f4", "3c", "0", "1", "0"])]
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "l.json")
            Path(p).write_text(json.dumps(logs))
            r = declare.hooks_des_logs(p)
        # un pool SANS hook, ce n'est pas un hook qui ne declare pas
        self.assertEqual(r["hooks"], [])
        self.assertEqual(r["n_illisibles"], 0)

    def test_un_log_tronque_est_compte_jamais_avale(self):
        import tempfile
        logs = [self._log(["1f4", "3c", "aa" * 20, "1", "0"]),
                {"address": "0x0", "topics": [], "data": "0x1234"}]
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "l.json")
            Path(p).write_text(json.dumps(logs))
            r = declare.hooks_des_logs(p)
        self.assertEqual(r["n_hooks"], 1)
        self.assertEqual(r["n_illisibles"], 1)


class TestLeReleveCommite(unittest.TestCase):
    """docs/dataset/declarations.json, tel que le scan l'a laisse."""

    @classmethod
    def setUpClass(cls):
        p = RACINE / "docs" / "dataset" / "declarations.json"
        cls.d = json.loads(p.read_text()) if p.exists() else None

    def test_deux_comptes_independants_du_nombre_de_hooks(self):
        if self.d is None:
            self.skipTest("declarations.json absent : lance python3 -m tare.declare --scan --write")
        # tare.collect a ecrit son propre compte en collectant les logs ; tare.declare le
        # recompte depuis les logs. Deux chemins de code, un seul nombre attendu.
        m = json.loads((RACINE / "docs" / "dataset" / "init-logs-200k.json.manifest.json").read_text())
        self.assertEqual(self.d["initialize"]["n_hooks"], m["n_hooks"])

    def test_un_zero_n_est_publiable_que_si_toute_la_fenetre_a_ete_lue(self):
        if self.d is None:
            self.skipTest("declarations.json absent")
        c = self.d["conclusion"]
        if not c["publiable"]:
            self.assertIn("couverture", c["raison"])
            return
        # Publiable => couverture exactement 1. Un bloc non lu n'est pas un bloc sans
        # evenement : c'est la meme distinction que NON_MESURABLE contre 0,00 bps.
        self.assertEqual(self.d["scan"]["couverture_min"], 1.0)
        self.assertEqual(self.d["initialize"]["couverture_des_logs"], 1.0)

    def test_les_hooks_qui_declarent_sont_un_sous_ensemble_des_hooks_vus(self):
        if self.d is None or not self.d["conclusion"]["publiable"]:
            self.skipTest("pas de conclusion publiable")
        vus = set(self.d["hooks"])
        for h in self.d["conclusion"]["hooks_qui_declarent"]:
            self.assertIn(h, vus, f"{h} declare mais n'a pas ete vu dans les Initialize")
        # et ils sont un sous-ensemble des emetteurs tous contrats confondus
        self.assertTrue(
            set(self.d["conclusion"]["hooks_qui_declarent"])
            <= set(self.d["scan"]["emetteurs_tous_contrats"])
        )

    def test_le_releve_porte_de_quoi_le_rejouer(self):
        if self.d is None:
            self.skipTest("declarations.json absent")
        self.assertIn("tare.declare", self.d["rejeu"])
        self.assertEqual(set(self.d["topics"]), {"HookSwap", "HookFee"})
        for nom, t in self.d["topics"].items():
            self.assertEqual(t, declare.topic0(declare.SIGNATURES[nom]))


class TestLeTexteDeSoumission(unittest.TestCase):
    """Le paragraphe d'ouverture doit venir du releve, pas d'un litteral."""

    def test_aucun_des_anciens_chiffres_ne_survit(self):
        from tare.submission import build
        src = Path(build.__file__).read_text()
        # « 24,000 Base blocks », « 84 distinct hooks », « five contracts » : les trois
        # litteraux du paragraphe qui affirmait un zero contredit par notre propre scan.
        for mort in ["24,000 Base blocks", "84 distinct hooks", "five contracts in"]:
            self.assertNotIn(mort, src, f"« {mort} » est encore ecrit en dur")

    def test_sans_releve_il_ne_fabrique_pas_de_chiffre(self):
        from tare.submission.build import declaration_paragraph
        p = declaration_paragraph({"declarations": None})
        self.assertIn("does not currently publish a", p)
        # et il dit quoi lancer
        self.assertIn("tare.declare", p)

    def test_une_couverture_incomplete_n_est_pas_publiee_comme_un_zero(self):
        from tare.submission.build import declaration_paragraph
        p = declaration_paragraph(
            {"declarations": {"conclusion": {"publiable": False, "raison": "couverture 0.9 < 1"}}}
        )
        self.assertIn("couverture 0.9", p)
        self.assertNotIn("0 of", p)


if __name__ == "__main__":
    unittest.main()
