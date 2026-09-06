"""Ou vivent les mesures publiees. Un seul endroit le dit.

Ce module existe parce que la meme information etait declaree trois fois, sous trois formes :

    tare/graph/sources.py   DEFAULT_MEASUREMENTS + EXTRA_MEASUREMENTS (un tuple)
    tare/oneway.py          MEASUREMENTS + EXTRA                     (un tuple)
    tare/attest.py          CORPUS + EXTRA                           (un chemin seul)

Aucune n'etait fausse, et c'est precisement le probleme : trois verites paralleles qui ne
divergent que le jour ou l'une bouge. Ce projet a deja paye deux fois ce defaut — le registre
lu depuis deux fichiers differents selon le sous-systeme, et la deduplication ecrite deux fois
avec deux regles, ce qui faisait publier au graphe dix nombres que le jeu avait retires.

Une seule declaration, importee partout.
"""
from __future__ import annotations

from pathlib import Path
from typing import List

REPO = Path(__file__).resolve().parents[2]
DOCS = REPO / "docs"

#: Le balayage principal — le corpus, celui que tout le depot appelle « les mesures ».
MEASUREMENTS = DOCS / "dataset" / "measurements.jsonl"

#: Les balayages complementaires. Ce sont des mesures comme les autres, ecrites a part parce
#: qu'elles visent une question precise (les 8 paires ou plusieurs pools existent). Les
#: ignorer ferait decrire au graphe, au RAG et aux attestations un corpus que le depot ne
#: publie pas.
EXTRA: tuple = (DOCS / "dataset" / "measurements-contestes.jsonl",)


def paths(include_extra: bool = True) -> List[Path]:
    """Les fichiers a lire, dans l'ordre, sans ceux qui n'existent pas.

    Un fichier absent est ABSENT — il n'est pas lu comme vide. La difference compte : un
    corpus complementaire qu'on n'a pas encore ecrit ne doit pas retrecir un denominateur.
    """
    out = [MEASUREMENTS] if MEASUREMENTS.exists() else []
    if include_extra:
        out += [p for p in EXTRA if p.exists()]
    return out
