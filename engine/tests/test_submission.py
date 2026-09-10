"""Les champs de la fiche de soumission.

Ce que ces tests protegent : les trois textes qu'un juge lit AVANT d'ouvrir le depot. Au
premier tour asynchrone d'ETHOnline, aucun juge ne voit l'auteur — il reste le texte, le
depot et l'URL de demo. Ces trois champs n'etaient rediges nulle part.

Et la regle qui compte plus que leur existence : AUCUN NOMBRE ECRIT A LA MAIN. Chacun de
ceux qui y figurent a deja ete faux une fois, ailleurs dans ce depot :

  « 0 des 84 hooks declarent »          dans README.md ET dans SUBMISSION.md
  « 300,00 -> 0,03 bps »                dans le dossier et dans ETAT
  « un seul hook absent du registre »   sur la landing publiee
  « 199 pools / 12 hooks »              sur la landing, contre sa propre table
  « six real payments »                 dans SUBMISSION.md, contre quatre au journal

Un champ de soumission ecrit a la main serait le prochain.
"""
import json
import re
import unittest
from pathlib import Path

from tare.submission import build

REPO = Path(build.REPO)


class TestLaFiche(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.f = build.facts()
        cls.fiche = build.fiche(cls.f)
        cls.sections = build._sections(cls.fiche)

    def test_les_champs_existent(self):
        self.assertEqual(
            list(self.sections),
            ["Title", "Short description", "What it does", "The two fields that are not prose"],
        )
        for nom, bloc in self.sections.items():
            self.assertGreater(len(bloc), 100, f"{nom} est vide ou trop court")

    def test_aucune_magnitude_n_est_ecrite_a_la_main(self):
        """Aucun nombre de quatre chiffres ou plus ne doit etre un litteral du code source.

        Les nombres du texte rendu viennent tous d'une interpolation. On lit donc la SOURCE de
        `fiche()`, pas son resultat : c'est la que le litteral se glisserait.
        """
        src = build.fiche.__doc__ or ""
        corps = build.__loader__.get_source(build.__name__)
        debut = corps.index("def fiche(")
        fin = corps.index("def main(", debut)
        code = corps[debut:fin]
        # On retire les chaines de commentaire et le docstring : ils CITENT les anciens
        # chiffres faux, ce qui est le contraire d'un defaut.
        code = re.sub(r'"""[\s\S]*?"""', " ", code)
        code = re.sub(r"#[^\n]*", " ", code)
        # DEUX EXCEPTIONS, et ce sont des IDENTIFIANTS, pas des mesures :
        #   1764   la mediane du `howItsMade` des 27 finalistes async — une reference externe
        #          qui ne peut pas etre derivee de ce depot, et qui est nommee comme telle.
        #   84532  l'identifiant de chaine de Base Sepolia, en repli quand l'environnement ne
        #          le donne pas. Un identifiant ne devient pas faux quand le corpus grandit.
        # Tout le reste doit venir d'un fichier.
        IDENTIFIANTS = {"1764", "84532"}
        litteraux = [
            n
            for n in re.findall(r"(?<![\w.])(\d{4,})(?![\w])", code)
            if n not in IDENTIFIANTS
        ]
        self.assertEqual(
            litteraux, [], f"magnitudes ecrites a la main dans fiche() : {litteraux}"
        )

    def test_chaque_nombre_du_texte_se_retrouve_dans_un_artefact(self):
        """Les nombres cites doivent etre ceux des fichiers, pas des voisins plausibles."""
        t = self.fiche.replace(",", "").replace(" ", "").replace(" ", " ")
        # le corpus
        self.assertIn(str(self.f["rows"]), t.replace(" ", ""))
        # la declaration, si le releve est la
        d = self.f.get("declarations")
        if d and (d.get("conclusion") or {}).get("publiable"):
            c = d["conclusion"]
            self.assertIn(str(c["n_hooks_qui_declarent"]), t)
            self.assertIn(str(c["n_hooks"]).replace(",", ""), t.replace(",", ""))
        # la couverture du registre
        cov = (self.f.get("couverture") or {}).get("couverture")
        if cov:
            self.assertIn(str(cov["absents"]), t)
            self.assertIn(str(cov["part_absente_pct"]), t)
        # la part de porte unique
        a = self.f.get("alternative")
        if a:
            part = a["etats"]["PORTE_UNIQUE"] / a["mesures_lues"] * 100
            self.assertIn(f"{part:.2f}", t)
            self.assertIn(str(a["propositions_au_dessus_du_seuil"]), t)

    def test_le_titre_porte_un_verbe_et_une_quantite(self):
        bloc = self.sections["Title"]
        # LA LIGNE DU TITRE, pas la section : le mot « analytics » figure dans la
        # justification, qui explique pourquoi on ne l'emploie pas. Chercher dans toute la
        # section faisait rougir ce test sur un texte correct — c'est le meme defaut que
        # trois tests du front, qui matchaient sur des commentaires.
        ligne = next(l for l in bloc.splitlines() if l.startswith("**") and l.endswith("**"))
        self.assertIn("takes", ligne)
        for descriptif in ("analytics", "dashboard", "explorer", "registry"):
            self.assertNotIn(descriptif, ligne.lower(), f"le titre DECRIT ({descriptif})")
        # la quantite vit dans la justification, pas dans le titre : un titre qui porte un
        # nombre le rend faux au prochain balayage.
        self.assertIn(f"{self.f['rows']:,}", bloc)

    def test_les_quatre_etiquettes_sont_nommees_et_aucune_n_est_promue(self):
        quoi = self.sections["What it does"]
        for e in ("MEASURED", "INTERPOLATED", "NOT_MEASURABLE", "NOT_QUOTABLE"):
            self.assertIn(e, quoi, f"{e} absent du texte")
        # et la distinction qui les justifie
        self.assertIn("never a zero", quoi)

    def test_le_texte_dit_ce_qu_il_ne_fait_pas(self):
        quoi = self.sections["What it does"]
        # La substitution est CONSTRUITE, jamais envoyee : le texte doit le dire, sinon la
        # promesse lue est plus large que le produit.
        self.assertIn("never sends it", quoi)
        # et le corpus est de la COTATION, pas de l'execution
        self.assertIn("**quoted**, not executed", quoi)

    def test_sans_artefact_la_fiche_ne_fabrique_aucun_chiffre(self):
        """Un releve absent doit produire une phrase vague, jamais un nombre invente."""
        maigre = dict(self.f, declarations=None, couverture=None, alternative=None)
        m = build.fiche(maigre)
        self.assertIn("almost none of the hooks", m)
        self.assertIn("the vast majority", m)
        self.assertNotIn("69.64", m)
        self.assertNotIn("99.71", m)


class TestLUrlDeDemo(unittest.TestCase):
    """Le champ `demo` : la SEULE caracteristique universelle des 27 finalistes async.

    26 sur 27 y ont mis une URL vivante. L'exception etait LPLens, qui y a mis un lien GitHub
    alors que lplens.xyz tournait. C'est l'action a cout nul la plus rentable du dossier, et
    c'est celle qu'on oublie en dernier.
    """

    def test_absente_la_fiche_le_dit_et_donne_la_marche_a_suivre(self):
        import os

        garde = os.environ.pop("TARE_DEMO_URL", None)
        try:
            t = build.fiche(build.facts())
            # Une URL plausible mais morte est PIRE qu'un champ vide : elle fait cliquer pour
            # rien, et c'est le premier geste du juge.
            self.assertIn("NOT SET AT GENERATION TIME", t)
            self.assertIn("Settings -> Pages", t)
            self.assertIn("TARE_DEMO_URL=", t)
            # et le fait qui explique pourquoi ce champ compte plus que le reste
            self.assertIn("26 of the 27 async finalists", t)
        finally:
            if garde is not None:
                os.environ["TARE_DEMO_URL"] = garde

    def test_posee_elle_est_citee_telle_quelle(self):
        import os

        garde = os.environ.get("TARE_DEMO_URL")
        os.environ["TARE_DEMO_URL"] = "https://exemple.tld/hooks/"
        try:
            t = build.fiche(build.facts())
            self.assertIn("https://exemple.tld/hooks/", t)
            self.assertNotIn("NOT SET AT GENERATION TIME", t)
        finally:
            if garde is None:
                os.environ.pop("TARE_DEMO_URL", None)
            else:
                os.environ["TARE_DEMO_URL"] = garde


class TestLAbonnement(unittest.TestCase):
    """La phrase sur l'abonnement ne doit rien affirmer qui ne soit pas en ligne."""

    def test_sans_adresse_la_fiche_dit_que_le_contrat_n_est_pas_deploye(self):
        import os

        garde = os.environ.pop("TARE_ABONNEMENT_CONTRAT", None)
        try:
            t = build.fiche(build.facts())
            # « a contract on Base Sepolia holds the subscription » serait une affirmation sur
            # quelque chose qui n'est pas en ligne — exactement ce que ce projet reproche au
            # registre officiel.
            # La phrase est sur une seule ligne dans le rendu : on cherche le fait, pas sa
            # mise en page.
            self.assertIn("not yet deployed to a public testnet", t)
            self.assertIn("never an assumed subscription", t)
        finally:
            if garde is not None:
                os.environ["TARE_ABONNEMENT_CONTRAT"] = garde

    def test_avec_une_adresse_la_fiche_la_cite(self):
        import os

        garde = os.environ.get("TARE_ABONNEMENT_CONTRAT")
        os.environ["TARE_ABONNEMENT_CONTRAT"] = "0x" + "ab" * 20
        try:
            t = build.fiche(build.facts())
            self.assertIn("0x" + "ab" * 20, t)
            self.assertNotIn("not yet", t)
        finally:
            if garde is None:
                os.environ.pop("TARE_ABONNEMENT_CONTRAT", None)
            else:
                os.environ["TARE_ABONNEMENT_CONTRAT"] = garde

    def test_le_poids_du_contrat_est_COMPTE(self):
        """« 133 lines of Solidity » etait ecrit a la main. Le contrat en fait 182."""
        n = len(Path(build.CONTRAT).read_text().splitlines())
        t = build.fiche(dict(build.facts(), declarations=None))
        self.assertIn(f"{n} lines of Solidity", t)
        self.assertNotIn("133 lines", t)


class TestLeFichierEcrit(unittest.TestCase):
    def test_il_porte_son_avertissement_de_generation(self):
        p = REPO / "docs" / "SUBMISSION-FICHE.md"
        if not p.exists():
            self.skipTest("SUBMISSION-FICHE.md absent : lance --write")
        t = p.read_text()
        self.assertIn("Engendre par", t)
        self.assertIn("Ne pas editer a la main", t)
        # et il rappelle POURQUOI, avec les trois nombres qui ont ete faux
        self.assertIn("were wrong", t)


if __name__ == "__main__":
    unittest.main()
