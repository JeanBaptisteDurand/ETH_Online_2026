"""networkx.MultiDiGraph — le vrai s'il est installe, sinon un equivalent stdlib.

Le moteur TARE n'a aucune dependance : il parle a la chaine avec curl et hache
avec un keccak ecrit a la main. Le graphe ne va pas etre le premier module a
casser `make test` sur une machine neuve. Alors : si networkx est importable, on
prend networkx — c'est la structure de reference, celle de cobol-explorer. Sinon
on prend cette implementation, qui expose exactement la surface utilisee par
build.py et queries.py et rien de plus :

    add_node / add_edge / has_edge / nodes(data=) / edges(keys=, data=)
    in_edges(n, keys=, data=) / out_edges(n, keys=, data=)
    g[u][v][key] / n in g / number_of_nodes() / number_of_edges()

Les deux chemins sont testes (engine/tests/test_graph.py, TestBothBackends) :
les memes donnees doivent donner le meme JSON et les memes reponses aux requetes.
"""
from __future__ import annotations

from typing import Any, Dict, Iterator, List, Optional, Tuple

class _NodeView:
    def __init__(self, store: Dict[str, dict]):
        self._s = store

    def __call__(self, data: bool = False):
        if data:
            return list(self._s.items())
        return list(self._s.keys())

    def __iter__(self) -> Iterator[str]:
        return iter(self._s)

    def __len__(self) -> int:
        return len(self._s)

    def __contains__(self, n: object) -> bool:
        return n in self._s

    def __getitem__(self, n: str) -> dict:
        return self._s[n]

class StdlibMultiDiGraph:
    """Multigraphe oriente a cles. Une arete est identifiee par (u, v, key)."""

    def __init__(self) -> None:
        self._nodes: Dict[str, dict] = {}
        self._succ: Dict[str, Dict[str, Dict[Any, dict]]] = {}
        self._pred: Dict[str, Dict[str, Dict[Any, dict]]] = {}

    # -- noeuds
    def add_node(self, n: str, **attrs: Any) -> None:
        if n not in self._nodes:
            self._nodes[n] = {}
            self._succ[n] = {}
            self._pred[n] = {}
        self._nodes[n].update(attrs)

    @property
    def nodes(self) -> _NodeView:
        return _NodeView(self._nodes)

    def __contains__(self, n: object) -> bool:
        return n in self._nodes

    def __iter__(self) -> Iterator[str]:
        return iter(self._nodes)

    def __len__(self) -> int:
        return len(self._nodes)

    def __getitem__(self, u: str) -> Dict[str, Dict[Any, dict]]:
        return self._succ[u]

    def number_of_nodes(self) -> int:
        return len(self._nodes)

    # -- aretes
    def add_edge(self, u: str, v: str, key: Any = None, **attrs: Any) -> Any:
        self.add_node(u)
        self.add_node(v)
        if key is None:
            key = len(self._succ[u].get(v, {}))
        d = self._succ[u].setdefault(v, {}).setdefault(key, {})
        d.update(attrs)
        self._pred[v].setdefault(u, {})[key] = d
        return key

    def has_edge(self, u: str, v: str, key: Any = None) -> bool:
        if u not in self._succ or v not in self._succ[u]:
            return False
        return True if key is None else key in self._succ[u][v]

    def number_of_edges(self) -> int:
        return sum(len(ks) for nbrs in self._succ.values() for ks in nbrs.values())

    def edges(self, nbunch: Optional[str] = None, keys: bool = False,
              data: bool = False) -> List[Tuple]:
        srcs = [nbunch] if nbunch is not None else list(self._succ)
        return self._collect(srcs, self._succ, keys, data, reverse=False)

    def out_edges(self, n: Optional[str] = None, keys: bool = False,
                  data: bool = False) -> List[Tuple]:
        return self.edges(n, keys=keys, data=data)

    def in_edges(self, n: Optional[str] = None, keys: bool = False,
                 data: bool = False) -> List[Tuple]:
        dsts = [n] if n is not None else list(self._pred)
        return self._collect(dsts, self._pred, keys, data, reverse=True)

    def _collect(self, roots, side, keys, data, reverse) -> List[Tuple]:
        out: List[Tuple] = []
        for a in roots:
            if a not in side:
                continue
            for b, kd in side[a].items():
                for k, d in kd.items():
                    u, v = (b, a) if reverse else (a, b)
                    row: Tuple = (u, v)
                    if keys:
                        row = row + (k,)
                    if data:
                        row = row + (d,)
                    out.append(row)
        return out


try:  # pragma: no cover - depend de la machine
    import networkx as _nx
    MultiDiGraph = _nx.MultiDiGraph
    BACKEND = "networkx"
except ImportError:  # pragma: no cover - depend de la machine
    _nx = None
    MultiDiGraph = StdlibMultiDiGraph
    BACKEND = "stdlib"

HAS_NETWORKX = _nx is not None
