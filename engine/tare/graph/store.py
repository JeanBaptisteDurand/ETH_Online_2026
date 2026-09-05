"""Le graphe charge UNE fois, pas une fois par requete.

C'est le bug de cobol-explorer, a server/api/app.py:157 : chaque appel HTTP y
reconstruisait GraphTools, soit 102 ms de CPU brules pour servir une requete qui
en coute 0,09 ms. Le graphe est immuable entre deux ecritures du fichier : il n'y
a aucune raison de le relire.

GraphStore garde donc :
  * le MultiDiGraph, charge une fois, memorise par (chemin, mtime_ns, taille) —
    reecrire graph.json invalide l'entree, y toucher sans le modifier ne coute rien ;
  * les agregats derives (clones, orphelins, contradictions, desaccords), calcules
    a la premiere demande et gardes. Ce sont eux qui coutent : ils balaient tous
    les noeuds.

`hits` et `misses` sont exposes pour que le test puisse le PROUVER plutot que
l'affirmer (test_graph_store.TestCache).
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from . import queries
from .build import from_json
from .loader import DEFAULT_GRAPH, build_tare_graph, graph_meta
from .nx_compat import MultiDiGraph

_LOCK = threading.Lock()
_CACHE: Dict[Tuple[str, int, int], "GraphStore"] = {}
STATS = {"hits": 0, "misses": 0}


class GraphStore:
    """Un graphe et ses agregats. Immuable du point de vue de l'appelant."""

    def __init__(self, g: MultiDiGraph, meta: Optional[dict] = None, source: Optional[str] = None):
        self.g = g
        self.meta = dict(meta or graph_meta(g))
        self.source = source
        self._memo: Dict[str, Any] = {}

    # -- agregats, calcules une fois

    def _once(self, key: str, fn):
        if key not in self._memo:
            self._memo[key] = fn()
        return self._memo[key]

    def stats(self) -> dict:
        return self._once("stats", lambda: queries.stats(self.g))

    def clusters(self, min_size: int = 2) -> List[dict]:
        allc = self._once("clusters", lambda: queries.bytecode_clusters(self.g, min_size=2))
        return [c for c in allc if c["n_hooks"] >= min_size]

    def orphans(self, chain_id: int = queries.DEFAULT_CHAIN) -> dict:
        return self._once(f"orphans:{chain_id}", lambda: queries.orphans(self.g, chain_id))

    def contradictions(self) -> dict:
        return self._once("contradictions", lambda: queries.contradictions(self.g))

    def disagreement(self, chain_id: int = queries.DEFAULT_CHAIN,
                     flat_bps: float = queries.FLAT_BPS) -> dict:
        return self._once(f"disagreement:{chain_id}:{flat_bps}",
                          lambda: queries.disagreement(self.g, chain_id, flat_bps))

    # -- par hook, pas de memo : le cout est en O(degre), pas en O(graphe)

    def impact(self, ref: str, chain_id: int = queries.DEFAULT_CHAIN) -> dict:
        return queries.impact(self.g, ref, chain_id)

    def twins(self, ref: str, chain_id: int = queries.DEFAULT_CHAIN) -> dict:
        return queries.twins(self.g, ref, chain_id)

    def deployers_by_address(self) -> Dict[str, List[str]]:
        return self._once("dep_index", lambda: queries.deployers_by_address(self.g))

    def deployer_cluster(self, ref: str, chain_id: int = queries.DEFAULT_CHAIN) -> dict:
        return queries.deployer_cluster(self.g, ref, chain_id, self.deployers_by_address())

    def hook_summary(self, ref: str, chain_id: int = queries.DEFAULT_CHAIN) -> dict:
        return queries.hook_summary(self.g, ref, chain_id)

    def neighbors(self, node_id: str) -> dict:
        return queries.neighbors(self.g, node_id)


def _key(path: Path) -> Tuple[str, int, int]:
    st = path.stat()
    return (str(path.resolve()), st.st_mtime_ns, st.st_size)


def load_store(path: Path = DEFAULT_GRAPH) -> GraphStore:
    """Charge graph.json — ou le rend depuis le cache s'il n'a pas bouge."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(
            f"{path} absent — construis-le : python3 -m tare.graph.cli build")
    key = _key(path)
    with _LOCK:
        hit = _CACHE.get(key)
        if hit is not None:
            STATS["hits"] += 1
            return hit
    data = json.loads(path.read_text())
    store = GraphStore(from_json(data), meta=data.get("meta"), source=str(path))
    with _LOCK:
        STATS["misses"] += 1
        _CACHE[key] = store
    return store


def build_store(**kwargs) -> GraphStore:
    """Construit depuis les sources sans passer par le disque (tests, scripts)."""
    g = build_tare_graph(**kwargs)
    return GraphStore(g, source="sources")


def invalidate(path: Optional[Path] = None) -> int:
    """Vide le cache. Renvoie le nombre d'entrees retirees."""
    with _LOCK:
        if path is None:
            n = len(_CACHE)
            _CACHE.clear()
            return n
        target = str(Path(path).resolve())
        drop = [k for k in _CACHE if k[0] == target]
        for k in drop:
            del _CACHE[k]
        return len(drop)
