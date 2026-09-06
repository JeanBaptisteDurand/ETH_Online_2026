"""Construction du graphe TARE depuis les trois sources, et ecriture du JSON."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

from .. import __version__
from . import chain as chain_mod
from . import sources
from .build import build_graph, to_json
from .nx_compat import BACKEND, MultiDiGraph

DATA_DIR = Path(__file__).resolve().parent / "data"
DEFAULT_GRAPH = DATA_DIR / "graph.json"


def build_tare_graph(measurements: Path = sources.DEFAULT_MEASUREMENTS,
                     hooklist: Path = sources.DEFAULT_HOOKLIST,
                     chain_cache: Optional[Path] = chain_mod.DEFAULT_CACHE,
                     cls=None) -> MultiDiGraph:
    rows = sources.read_measurements(measurements)
    entries = sources.read_registry(hooklist)
    cache = chain_mod.load_cache(chain_cache) if chain_cache else {"entries": {}, "missing": True}

    nodes, edges = [], []
    for producer in (sources.from_measurements(rows),
                     sources.from_registry(entries),
                     sources.from_chain(cache)):
        nodes.extend(producer[0])
        edges.extend(producer[1])

    g = build_graph(nodes, edges, cls=cls)
    g.graph_meta = {  # type: ignore[attr-defined]
        "engine_ver": f"tare-engine/{__version__}",
        "backend": (cls.__name__ if cls else BACKEND),
        "measurements": str(measurements),
        "hooklist": str(hooklist),
        "chain_cache": str(chain_cache) if chain_cache else None,
        "chain_cache_present": not cache.get("missing", False),
        "chain_cache_fetched_at": cache.get("fetched_at"),
        # DEUX nombres, parce qu'ils different et que confondre les deux egare. `n_rows_read`
        # est ce que le fichier contenait au moment de la construction ; `n_measurements` est
        # le nombre de noeuds Measurement reellement poses. L'ecart, ce sont des lignes en
        # double — meme pool, meme bloc, meme taille, meme sens — fondues en un seul noeud.
        # Le champ s'appelait n_measurements en portant la premiere valeur : un test qui
        # comparait la meta au compte des noeuds echouait sur un graphe parfaitement correct.
        "n_rows_read": len(rows),
        "n_measurements": sum(1 for n, d in g.nodes(data=True) if d.get("kind") == "Measurement"),
        "n_rows_collapsed_as_duplicates": len(rows) - sum(
            1 for n, d in g.nodes(data=True) if d.get("kind") == "Measurement"),
        "n_registry_entries": len(entries),
        "n_chain_entries": len(cache.get("entries") or {}),
        "block_number": rows[0]["block_number"] if rows else None,
    }
    return g


def graph_meta(g: MultiDiGraph) -> Dict[str, Any]:
    return dict(getattr(g, "graph_meta", {}) or {})


def write_graph(g: MultiDiGraph, path: Path = DEFAULT_GRAPH) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(to_json(g, graph_meta(g)), indent=1) + "\n")
    return path
