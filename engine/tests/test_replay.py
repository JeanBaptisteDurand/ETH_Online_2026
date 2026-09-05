"""La promesse la plus exposee du projet : « chaque valeur se rejoue en une commande ».

Elle a ete fausse en pratique pendant plusieurs jours. La commande publiee sur chaque ligne
etait `make measure HOOK=0x...`, qui remesure TOUS les pools du hook : 1 471 pools pour Zora,
huit tailles, deux sens, plus de vingt mille cotations. Elle depassait dix minutes et personne
ne l'a jamais lancee. Une promesse intenable n'est pas tenue.

Ces tests ne mesurent rien sur une chaine — ils verifient que la commande PUBLIEE designe une
cellule unique, que ses arguments existent dans le jeu, et qu'un ecart fait sortir en erreur.
Le rejeu reel, lui, est verifie par `tare.cli verify` sur un fork au repos.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
JSONL = REPO / "docs" / "dataset" / "measurements.jsonl"


def quelques_lignes(n=200):
    out = []
    if not JSONL.exists():
        return out
    with open(JSONL) as fh:
        for i, l in enumerate(fh):
            if i >= n:
                break
            if l.strip():
                out.append(json.loads(l))
    return out


class TestLaCommandePubliee(unittest.TestCase):
    def test_le_graphe_publie_une_commande_qui_designe_UNE_cellule(self):
        from tare.graph.sources import replay_command

        rows = quelques_lignes()
        if not rows:
            self.skipTest("jeu absent")
        for r in rows[:20]:
            cmd = replay_command(r)
            # Elle doit porter le pool, la taille ET le sens. Sans les trois, elle designe
            # plusieurs mesures et « la » valeur n'est pas rejouable.
            self.assertIn(r["pool_id"], cmd, cmd)
            self.assertIn(str(r["amount_in"]), cmd, cmd)
            self.assertRegex(cmd, r"DIR=(0>1|1>0)", cmd)
            # Et surtout : plus la forme qui remesure tout un hook.
            self.assertNotIn("make measure HOOK=", cmd)

    def test_le_sens_publie_est_celui_de_la_ligne(self):
        from tare.graph.sources import replay_command

        rows = quelques_lignes()
        if not rows:
            self.skipTest("jeu absent")
        vus = set()
        for r in rows:
            attendu = "0>1" if r["zero_for_one"] else "1>0"
            m = re.search(r"DIR=(\S+)", replay_command(r))
            self.assertEqual(m.group(1), attendu)
            vus.add(attendu)
        # Les deux sens doivent apparaitre quelque part, sinon le test ne prouve qu'une moitie.
        self.assertEqual(vus, {"0>1", "1>0"}, f"un seul sens vu : {vus}")


class TestLaCommandeSaitEchouer(unittest.TestCase):
    """Un rejeu qui ne peut pas echouer ne prouve rien."""

    def _run(self, *args):
        return subprocess.run(
            [sys.executable, "-m", "tare.cli", "replay", *args],
            capture_output=True, text=True, cwd=REPO / "engine", timeout=120)

    def test_un_pool_inconnu_sort_en_erreur_et_ne_rend_aucun_nombre(self):
        p = self._run("--pool", "0x" + "de" * 32, "--rpc", "http://127.0.0.1:1")
        self.assertEqual(p.returncode, 2)
        self.assertIn("aucune ligne", p.stderr)
        self.assertNotRegex(p.stdout, r"\d+\.\d{4}")

    def test_un_pool_ambigu_refuse_de_choisir_a_ta_place(self):
        rows = quelques_lignes()
        if not rows:
            self.skipTest("jeu absent")
        p = self._run("--pool", rows[0]["pool_id"], "--rpc", "http://127.0.0.1:1")
        # Plusieurs tailles pour ce pool : il doit demander --size, pas en choisir une.
        self.assertEqual(p.returncode, 2)
        self.assertIn("precise --size", p.stderr)


if __name__ == "__main__":
    unittest.main()
