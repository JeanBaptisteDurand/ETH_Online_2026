"""Assemblage des noeuds et des aretes en MultiDiGraph, et (de)serialisation.

Porte de cobol-explorer/ingestion/graph/build.py. Deux invariants sont repris
tels quels parce qu'ils sont ce qui rend le graphe interrogeable :

  * UNE arete par (src, dst, kind). Un hook attache a un pool l'est une fois,
    meme si dix mesures l'attestent. Les occurrences repetees ne s'empilent pas
    en aretes paralleles : elles FUSIONNENT leur evidence.
  * Aucun noeud sans type. Un point d'arrivee cite par une arete mais jamais
    declare est synthetise depuis son prefixe et marque external.

Ce qui change par rapport a l'original : l'evidence COBOL accumulait des
numeros de ligne (`lines`). Ici elle accumule des references de provenance
(`refs`) — un identifiant de mesure, un index de fiche de registre, un numero
de bloc — parce que c'est ce qui permet de rejouer. Le principe est identique :
la deuxieme occurrence n'a JAMAIS le droit d'effacer la citation de la premiere
(l'ancien `add(key=kind)` gardait silencieusement la derniere).
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from .nx_compat import MultiDiGraph
from .schema import Edge, Node, PREFIX_TO_KIND, split_id

# Les cles d'evidence qui s'accumulent au lieu de s'ecraser.
_LIST_KEYS = ("refs", "blocks")


def _merge_evidence(existing: Optional[dict], new: Optional[dict]) -> dict:
    """Replie une occurrence repetee de la MEME relation en une seule arete,
    SANS perdre aucune citation."""
    ev: Dict[str, Any] = dict(existing or {})
    new = new or {}
    for key in _LIST_KEYS:
        acc: List[Any] = list(ev.get(key) or [])
        for value in (new.get(key) or []):
            if value not in acc:
                acc.append(value)
        one = new.get(key[:-1]) if key.endswith("s") else None
        if one is not None and one not in acc:
            acc.append(one)
        if acc:
            ev[key] = sorted(acc, key=lambda x: (str(type(x)), x))
    # Les qualifiants scalaires : on garde le premier vu, on complete s'il manque.
    for k, v in new.items():
        if k in _LIST_KEYS or k in ("ref", "block"):
            continue
        if k not in ev and v is not None:
            ev[k] = v
    ev["n"] = int(ev.get("n", 0)) + 1
    return ev


def build_graph(nodes: Iterable[Node], edges: Iterable[Edge], cls=None) -> MultiDiGraph:
    g = (cls or MultiDiGraph)()
    for n in nodes:
        if n.id in g:
            # Fusionne les attributs pour qu'un noeud riche (un Hook mesure, avec
            # son bytecode) ne soit pas ecrase par un noeud minimal (le meme hook
            # apercu comme simple point d'arrivee d'une fiche de registre).
            attrs = dict(g.nodes[n.id].get("attrs") or {})
            for k, v in (n.attrs or {}).items():
                if v is not None:
                    attrs.setdefault(k, v)
            g.nodes[n.id]["attrs"] = attrs
            # Un nom vaut mieux qu'une adresse : le hook vu d'abord dans les
            # mesures n'a que son adresse pour etiquette, la fiche de registre
            # lui donne son nom. On garde le plus informatif des deux.
            old = g.nodes[n.id].get("label") or ""
            new = n.label or ""
            if new and (not old or old == attrs.get("address")) and new != attrs.get("address"):
                g.nodes[n.id]["label"] = new
        else:
            g.add_node(n.id, kind=n.kind, label=n.label, attrs=dict(n.attrs or {}))
    for e in edges:
        for endpoint in (e.src, e.dst):
            if endpoint not in g:
                prefix, rest = split_id(endpoint)
                g.add_node(endpoint, kind=PREFIX_TO_KIND.get(prefix, prefix.upper() or "UNKNOWN"),
                           label=rest, attrs={"external": True})
        if g.has_edge(e.src, e.dst, e.kind):
            d = g[e.src][e.dst][e.kind]
            d["evidence"] = _merge_evidence(d.get("evidence"), e.evidence)
        else:
            g.add_edge(e.src, e.dst, key=e.kind, kind=e.kind,
                       evidence=_merge_evidence(None, e.evidence))
    return g


def to_json(g: MultiDiGraph, meta: Optional[dict] = None) -> dict:
    kinds: Dict[str, int] = {}
    for _n, d in g.nodes(data=True):
        k = d.get("kind") or "UNKNOWN"
        kinds[k] = kinds.get(k, 0) + 1
    ekinds: Dict[str, int] = {}
    for _u, _v, k, _d in g.edges(keys=True, data=True):
        ekinds[str(k)] = ekinds.get(str(k), 0) + 1
    return {
        "meta": dict(meta or {}),
        "nodes": [
            {"id": n, "kind": d.get("kind"), "label": d.get("label"), "attrs": d.get("attrs", {})}
            for n, d in sorted(g.nodes(data=True), key=lambda x: x[0])
        ],
        "edges": [
            {"src": u, "dst": v, "kind": k, "evidence": d.get("evidence", {})}
            for u, v, k, d in sorted(g.edges(keys=True, data=True), key=lambda x: (x[0], x[1], str(x[2])))
        ],
        "stats": {
            "nodes": g.number_of_nodes(),
            "edges": g.number_of_edges(),
            "by_node_kind": dict(sorted(kinds.items())),
            "by_edge_kind": dict(sorted(ekinds.items())),
        },
    }


def from_json(data: dict, cls=None) -> MultiDiGraph:
    g = (cls or MultiDiGraph)()
    for n in data["nodes"]:
        g.add_node(n["id"], kind=n["kind"], label=n.get("label"), attrs=n.get("attrs", {}))
    for e in data["edges"]:
        g.add_edge(e["src"], e["dst"], key=e["kind"], kind=e["kind"], evidence=e.get("evidence", {}))
    return g
