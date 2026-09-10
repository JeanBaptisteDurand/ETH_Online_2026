"""Le script de la video.

C'est le SEUL document du depot qu'on lit a voix haute. Un chiffre faux y coute plus qu'ailleurs :
une fois enregistre, il ne se corrige plus — il faut retourner la prise.

La version precedente en portait quatre :
  « sept mille neuf cents mesures »   le corpus en a 125 072
  « six cent vingt-quatre pools »     7 817
  « seize hooks »                     112
  « 0 des 84 hooks n'emet »           9 sur 1 559
et un cinquieme, plus vicieux : elle demandait 303 s de parole sous des titres qui s'arretaient
a 3:00.
"""
import re
import unittest
from pathlib import Path

from tare import video
from tare.submission.build import facts


class TestLeScript(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.f = facts()
        cls.t = video.render(cls.f)
        cls.dits = re.findall(r'\*\*Say\.\*\*\s*"(.*?)"', cls.t, re.S)

    def test_les_chiffres_du_corpus_sont_ceux_du_corpus(self):
        joint = " ".join(self.dits)
        # les quatre chiffres qui etaient faux, verifies un par un
        self.assertIn(f"{self.f['rows']:,}", joint)
        self.assertIn(f"{self.f['pools']:,}", joint)
        self.assertIn(str(self.f["hooks"]), joint)
        d = self.f.get("declarations") or {}
        c = d.get("conclusion") or {}
        if c.get("publiable"):
            self.assertIn(f"{c['n_hooks']:,}", joint)
            self.assertIn(str(c["n_hooks_qui_declarent"]), joint)

    def test_aucun_des_anciens_chiffres_faux_ne_survit(self):
        # LE CORPS, sans le commentaire de generation : celui-ci CITE les anciens chiffres pour
        # expliquer pourquoi le fichier est engendre, ce qui est le contraire d'un defaut.
        # Chercher dans tout le fichier faisait rougir ce test sur un script correct — la
        # meme faute que trois tests du front, qui matchaient sur des commentaires.
        corps = self.t.split("-->", 1)[-1]
        for mort in ("7,900", "7 900", "624 pools", "sixteen hooks", "eighty-four hooks",
                     "Eighty-four", "twenty-four thousand"):
            self.assertNotIn(mort, corps, f"« {mort} » est encore dans le script")

    def test_le_gros_chiffre_est_ECARTE_explicitement(self):
        """38 857 est le chiffre frappant, et 67,7 % de ces lignes sont sur des pools a frais
        dynamiques ou `stored_lp_fee = 0` ne veut pas dire gratuit. Le script doit nommer le
        sous-ensemble non ambigu ET interdire le gros nombre."""
        joint = " ".join(self.dits)
        self.assertIn(f"{self.f['zero_stat_n']:,}", joint)
        # le gros nombre ne doit PAS etre dans une replique
        self.assertNotIn(f"{self.f['zero_n']:,}", joint)
        # mais il doit etre nomme dans une note, comme ce qu'il ne faut pas dire
        self.assertIn(f"must NOT say is {self.f['zero_n']:,}", self.t)

    def test_la_parole_tient_dans_la_duree_visee(self):
        mots = len(" ".join(self.dits).split())
        secondes = mots / 145 * 60
        self.assertLessEqual(
            secondes,
            video.CIBLE_S,
            f"{mots} mots = {secondes:.0f} s de parole pour {video.CIBLE_S} s de video",
        )

    def test_les_horodatages_sont_DERIVES_et_se_suivent(self):
        """Ils etaient ecrits a la main et ne correspondaient a rien.

        `render()` seul doit suffire : le post-traitement a ete deplace dedans justement parce
        qu'un appelant direct lisait des marqueurs `{T}` a la place des chiffres.
        """
        titres = re.findall(r"^## (\d):(\d\d) – (\d):(\d\d) · ", self.t, re.M)
        self.assertGreater(len(titres), 5, "pas d'horodatages rendus")
        secs = [(int(a) * 60 + int(b), int(c) * 60 + int(d)) for a, b, c, d in titres]
        # chaque section commence quand la precedente finit, sans trou ni chevauchement
        for (d1, f1), (d2, _) in zip(secs, secs[1:]):
            self.assertEqual(f1, d2, f"trou entre {f1} s et {d2} s")
        # la premiere part de zero, la derniere ferme sur la cible
        self.assertEqual(secs[0][0], 0)
        self.assertEqual(secs[-1][1], video.CIBLE_S)

    def test_chaque_plan_nomme_un_ecran_reel(self):
        """Un plan qu'on ne peut pas tourner devient, au montage, une affirmation."""
        ecrans = re.findall(r"\*\*Screen[^*]*\.\*\*(.*?)(?=\n\n)", self.t, re.S)
        self.assertGreater(len(ecrans), 8)
        # les fichiers et modules cites doivent exister
        racine = Path(video.__file__).parents[2]
        for chemin in set(re.findall(r"`(docs/[\w./-]+|engine/[\w./-]+)`", self.t)):
            self.assertTrue((racine / chemin).exists(), f"{chemin} cite et absent")

    def test_les_acces_montres_sont_ceux_qui_sont_montres(self):
        """La version precedente n'en montrait que trois : la mesure, l'instrument, la garde.

        Le script en montre CINQ. Le sixieme — le MCP — n'y est pas, faute de secondes, et le
        script le DIT au lieu de laisser croire a une couverture complete. Un test qui aurait
        exige les six aurait pousse a le mentionner sans le montrer.
        """
        # Sur UNE ligne : le texte est retourne a la ligne pour la lecture, et une expression
        # de deux mots tombe donc a cheval.
        plat = " ".join(self.t.split())
        for quoi in ("x402", "Ledger", "HCS-14", "extension", "replacement transaction",
                     "signer et envoyer"):
            self.assertIn(quoi, plat, f"« {quoi} » absent du script")
        # et l'absence du MCP est declaree, avec sa raison et le cout de l'ajouter
        self.assertIn("MCP server is NOT in this cut", plat)

    def test_il_dit_de_ne_PAS_dire_none(self):
        # « aucun hook ne declare » etait faux, et c'etait la premiere phrase.
        self.assertIn('Do not say "none"', self.t)


class TestLeRefus(unittest.TestCase):
    def test_un_script_trop_long_est_REFUSE(self):
        """Le generateur doit rendre 1 quand la parole depasse la duree, pas ecrire quand meme."""
        import subprocess, sys as _s

        import os

        # `cwd=engine` ne suffit pas : le paquet `tare` s'importe depuis engine/, et un
        # sous-processus lance ailleurs ne le trouve pas. On pose PYTHONPATH explicitement.
        engine = Path(video.__file__).parents[1]
        env = dict(os.environ, PYTHONPATH=str(engine))
        r = subprocess.run(
            [_s.executable, "-c",
             "import sys; sys.argv=['v']; "
             "from tare import video; video.CIBLE_S = 10; sys.exit(video.main())"],
            capture_output=True, text=True, cwd=str(engine), env=env,
        )
        self.assertEqual(r.returncode, 1)
        self.assertIn("REFUS", r.stderr)
        self.assertIn("mots de trop", r.stderr)


if __name__ == "__main__":
    unittest.main()
