"""Le README ne doit pas pouvoir mentir plus longtemps que le jeu ne change.

Ce fichier existe a cause d'un vrai defaut, corrige le 05/09 : le tableau
« What we found » du README decrivait `docs/measurements-v1.json` (128 lignes,
32 pools, deux hooks, max 100.00 bps) alors que le depot publiait
`docs/dataset/measurements.jsonl` (995 lignes, 199 pools, douze hooks, max
1176.46 bps). Personne n'avait invente un chiffre ; le jeu avait grandi et la
prose etait restee. C'est le reproche exact que ce projet adresse au registre
Uniswap, et il valait pour nous.

La regle appliquee ici : tout nombre que le README affirme sur le jeu doit etre
recalculable, et ce test le recalcule. S'il devient rouge, ce n'est pas le test
qui est faux — c'est le README.

UNE SEULE EXCEPTION, et elle est explicite. Pendant qu'un balayage tourne, le jeu
gagne des lignes de seconde en seconde : le README serait perime une minute apres
avoir ete regenere, et le test echouerait en permanence sans rien apprendre a
personne. Ces tests s'abstiennent donc TANT QU'UN BALAYAGE TOURNE, en disant
lequel et quoi lancer ensuite. Ils ne s'abstiennent jamais autrement — sur une
machine d'integration, ou aucun balayage ne tourne, ils s'executent toujours.
"""
from __future__ import annotations

import re
import subprocess
import unittest
from pathlib import Path

from tare.dataset.stats import lp_fee_zero_table, read_rows

REPO = Path(__file__).resolve().parents[2]
README = REPO / "README.md"


def _sweep_en_cours() -> str:
    """Le balayage qui tourne, ou une chaine vide. Jamais une exception."""
    try:
        out = subprocess.run(["pgrep", "-f", "tare.cli sweep"],
                             capture_output=True, text=True, timeout=5)
    except Exception:
        return ""
    pids = [x for x in out.stdout.split() if x.strip()]
    return f"{len(pids)} balayage(s) en cours (pid {', '.join(pids[:4])})" if pids else ""


SWEEP = _sweep_en_cours()
RAISON = (f"{SWEEP} : le jeu grandit pendant le test. "
          "Relancer apres, avec `bash scripts/regenerate.sh`.")


def _section(text: str, anchor: str, window: int = 2600) -> str:
    """La section qui suit un titre, jusqu'au titre suivant."""
    i = text.find(anchor)
    if i < 0:
        return ""
    j = text.find("\n## ", i + len(anchor))
    return text[i:j if 0 < j < i + window else i + window]


def _numbers_near(text: str, anchor: str, window: int = 900):
    """Les nombres ecrits autour d'un ancrage, virgules de milliers retirees."""
    chunk = _section(text, anchor, window)
    return [float(m.replace(",", "")) for m in re.findall(r"\d[\d,]*\.?\d*", chunk)]


def _bold_numbers(text: str) -> set:
    """Les nombres qui apparaissent DANS un passage en gras.

    Le README ecrit tantot `**995**`, tantot `**199 pools**` : ce qui compte est que
    le chiffre soit mis en avant, pas la ponctuation autour.
    """
    out = set()
    for span in re.findall(r"\*\*([^*]+)\*\*", text):
        for m in re.findall(r"\d[\d,]*(?:\.\d+)?", span):
            out.add(m.replace(",", ""))
    return out


@unittest.skipIf(SWEEP, RAISON)
class TestReadmeChiffres(unittest.TestCase):
    """Chaque assertion nomme le chiffre du README qu'elle protege."""

    @classmethod
    def setUpClass(cls):
        cls.text = README.read_text()
        cls.bold = _bold_numbers(cls.text)
        cls.t = lp_fee_zero_table(read_rows(), above_bps=1.0, lp_fee_zero=True)

    def _exige(self, n, quoi):
        self.assertIn(str(n), self.bold,
                      f"{quoi} = {n} n'est pas mis en avant dans README.md — "
                      "le jeu a bouge et la prose est restee")

    def test_le_README_cite_la_taille_reelle_du_jeu(self):
        self._exige(self.t["rows"], "lignes publiees")
        self._exige(self.t["pools"], "pools")
        self._exige(self.t["hooks"], "hooks")

    def test_le_README_cite_le_compte_de_chaque_etiquette(self):
        for label, n in self.t["labels"].items():
            self._exige(n, label)

    def test_le_README_cite_le_filtre_et_ses_trois_totaux(self):
        self._exige(self.t["n"], "mesures au-dessus du seuil")
        self._exige(self.t["n_pools"], "pools concernes")
        self._exige(self.t["n_hooks"], "hooks concernes")

    def test_le_README_cite_min_mediane_max(self):
        trio = f"{self.t['min_bps']:.2f} / {self.t['median_bps']:.2f} / {self.t['max_bps']:.2f}"
        self.assertIn(trio, self.text,
                      f"le README doit porter « {trio} bps », recalcule depuis le jeu")

    def test_le_README_ne_cite_plus_le_jeu_v1(self):
        """128 lignes / 32 pools : le jeu d'avant. Le citer comme actuel est le bug corrige."""
        found = _numbers_near(self.text, "## What we found")
        self.assertNotIn(128.0, found, "128 est la taille de measurements-v1.json, pas du jeu publie")
        self.assertNotIn(32.0, found, "32 pools est la taille de measurements-v1.json")

    def test_chaque_hook_du_tableau_porte_son_max_reel(self):
        """Un max recopie a la main est un max qui vieillit. On les verifie tous."""
        for h in self.t["by_hook"]:
            court = h["hook"][:10]
            self.assertIn(court, self.text, f"{h['hook']} absent du tableau du README")
            self.assertIn(f"{h['max_bps']:.2f}", self.bold,
                          f"{court} : le README doit mettre en avant son max "
                          f"{h['max_bps']:.2f} bps")

    def test_le_tableau_du_README_se_rejoue_en_une_commande(self):
        self.assertIn("tare.dataset.stats", self.text,
                      "un tableau sans commande de rejeu est une affirmation, pas une mesure")

    def test_le_README_ne_sous_compte_pas_les_faux_resultats(self):
        """HONESTY.md en documente huit. Le README en annoncait trois."""
        honesty = (REPO / "docs" / "HONESTY.md").read_text()
        n = len(re.findall(r"^### #\d+ — ", honesty, re.M))
        self.assertGreater(n, 0, "HONESTY.md ne liste plus aucun faux resultat : format change ?")
        mots = {3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight",
                9: "nine", 10: "ten"}
        self.assertIn(f"{mots.get(n, n)} false findings", self.text,
                      f"HONESTY.md documente {n} faux resultats ; "
                      "le README doit en annoncer autant")


class TestReadmeLiens(unittest.TestCase):
    """Uniswap exige un README qui pointe les lignes de code. Un lien mort ne pointe rien."""

    @classmethod
    def setUpClass(cls):
        cls.text = README.read_text()

    def test_tous_les_liens_locaux_resolvent(self):
        morts = []
        for label, target in re.findall(r"\[([^\]]*)\]\(([^)]+)\)", self.text):
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            path = REPO / target.split("#")[0]
            if not path.exists():
                morts.append(target)
        self.assertEqual(morts, [], f"liens morts dans README.md : {morts}")

    def test_toute_ancre_de_ligne_existe_vraiment(self):
        """`fichier.py#L96-L140` sur un fichier de 102 lignes ne pointe nulle part."""
        faux = []
        for _, target in re.findall(r"\[([^\]]*)\]\(([^)]+)\)", self.text):
            if "#L" not in target or target.startswith("http"):
                continue
            rel, anchor = target.split("#", 1)
            path = REPO / rel
            if not path.is_file():
                continue
            total = len(path.read_text(errors="ignore").splitlines())
            for n in (int(x) for x in re.findall(r"L(\d+)", anchor)):
                if n > total:
                    faux.append(f"{target} — {rel} n'a que {total} lignes")
        self.assertEqual(faux, [], f"ancres de ligne hors fichier : {faux}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
