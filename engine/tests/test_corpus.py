"""Un seul endroit dit ou vivent les mesures.

La meme information a ete declaree trois fois, sous trois formes, dans trois modules. Aucune
n'etait fausse — et c'est le probleme : trois verites paralleles ne divergent que le jour ou
l'une bouge. Ce depot a deja paye ce defaut deux fois. Le registre etait lu depuis deux
fichiers selon le sous-systeme, si bien que la these des 14 bits etait prouvee sur deux tiers
du registre qu'elle pretendait couvrir. Et la deduplication etait ecrite deux fois avec deux
regles, ce qui faisait publier au graphe dix nombres que le jeu avait deja retires.

Ce test empeche la troisieme fois.
"""
import unittest

from tare import corpus
from tare.graph import sources as GS


class TestUneSeuleDeclaration(unittest.TestCase):
    def test_le_graphe_lit_le_meme_corpus_que_le_module_canonique(self):
        self.assertIs(GS.DEFAULT_MEASUREMENTS, corpus.MEASUREMENTS)
        self.assertIs(GS.EXTRA_MEASUREMENTS, corpus.EXTRA)

    def test_les_attestations_lisent_le_meme_corpus(self):
        from tare import attest

        self.assertIs(attest.CORPUS, corpus.MEASUREMENTS)
        self.assertIs(attest.EXTRA, corpus.EXTRA)

    def test_le_rapport_a_sens_unique_lit_le_meme_corpus(self):
        from tare import oneway

        self.assertIs(oneway.MEASUREMENTS, corpus.MEASUREMENTS)
        self.assertIs(oneway.EXTRA, corpus.EXTRA)

    def test_extra_est_une_sequence_pas_un_chemin(self):
        # attest.py la traitait comme un chemin unique et oneway.py comme un tuple. Les deux
        # marchaient, tant qu'on ne melangeait pas les deux conventions.
        self.assertIsInstance(corpus.EXTRA, tuple)
        for p in corpus.EXTRA:
            self.assertTrue(str(p).endswith(".jsonl"))

    def test_un_fichier_absent_est_absent_jamais_vide(self):
        # Un corpus complementaire non encore ecrit ne doit pas retrecir un denominateur :
        # il ne figure simplement pas dans la liste.
        for p in corpus.paths():
            self.assertTrue(p.exists(), f"{p} annonce mais absent")
        self.assertIn(corpus.MEASUREMENTS, corpus.paths())
        self.assertNotIn(corpus.MEASUREMENTS, corpus.paths(include_extra=True)[1:])


if __name__ == "__main__":
    unittest.main()
