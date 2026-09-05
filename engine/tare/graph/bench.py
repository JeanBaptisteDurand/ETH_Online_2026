"""Etoile contre clique : le chiffre, pas l'intuition.

    python3 -m tare.graph.bench

Trois mesures, toutes sur les donnees reelles du graphe construit :

  1. twins() par le noeud Bytecode en etoile  — un _in_of sur UN noeud.
  2. twins() sans noeud Bytecode              — il faut balayer tous les Hook et
     comparer les empreintes : c'est ce que coute l'absence de pre-agregat.
  3. le nombre d'aretes qu'une clique SAME_BYTECODE_AS materialisee coûterait,
     en fonction de la taille du plus gros groupe de clones.

Le point 3 est le seul qui depende du jeu de donnees : sur Base au bloc epingle
le plus gros groupe fait 2 hooks, donc la clique reste minuscule. Ce n'est pas
un argument contre l'etoile, c'est la raison pour laquelle on ne mesure pas que
ca — la clique coute n(n-1) aretes et se recalcule ENTIEREMENT a chaque nouveau
hook, la ou l'etoile en ajoute une seule.
"""
from __future__ import annotations

import time
from typing import Dict, List

from .nx_compat import BACKEND
from .schema import EdgeKind, NodeKind
from .store import load_store
from . import queries as q


def naive_twins(g, hook_node: str) -> List[str]:
    """twins() sans noeud Bytecode : on balaie tous les hooks."""
    mine = None
    for c in q._out_of(g, hook_node, EdgeKind.HAS_BYTECODE):
        mine = q._attrs(g, c).get("code_hash")
        break
    if mine is None:
        return []
    out = []
    for n, d in g.nodes(data=True):
        if d.get("kind") != NodeKind.HOOK or n == hook_node:
            continue
        for c in q._out_of(g, n, EdgeKind.HAS_BYTECODE):
            if q._attrs(g, c).get("code_hash") == mine:
                out.append(n)
                break
    return sorted(out)


def main() -> int:
    s = load_store()
    g = s.g
    hooks = [n for n, d in g.nodes(data=True)
             if d.get("kind") == NodeKind.HOOK and q._out_of(g, n, EdgeKind.HAS_BYTECODE)]
    print(f"backend {BACKEND}  {g.number_of_nodes()} noeuds  {g.number_of_edges()} aretes")
    print(f"{len(hooks)} hooks portent un bytecode lu\n")

    t = time.perf_counter()
    star = {h: q.twins(g, h)["n_twins"] for h in hooks}
    t_star = (time.perf_counter() - t) * 1000

    t = time.perf_counter()
    naive = {h: len(naive_twins(g, h)) for h in hooks}
    t_naive = (time.perf_counter() - t) * 1000

    assert star == naive, "les deux methodes doivent repondre la meme chose"
    print(f"twins() sur les {len(hooks)} hooks")
    print(f"  etoile (noeud Bytecode)      {t_star:8.1f} ms   {t_star/len(hooks):6.3f} ms/hook")
    print(f"  balayage (sans pre-agregat)  {t_naive:8.1f} ms   {t_naive/len(hooks):6.3f} ms/hook")
    print(f"  facteur                      x{t_naive/t_star:.1f}\n")

    groups: Dict[str, int] = {}
    for h in hooks:
        for c in q._out_of(g, h, EdgeKind.HAS_BYTECODE):
            groups[c] = groups.get(c, 0) + 1
    clique = sum(n * (n - 1) for n in groups.values())
    print(f"aretes pour representer la relation 'meme bytecode'")
    print(f"  etoile HAS_BYTECODE          {len(hooks):6d}  (+{len(groups)} noeuds Bytecode)")
    print(f"  clique SAME_BYTECODE_AS      {clique:6d}  (plus gros groupe : {max(groups.values())} hooks)")
    print(f"  a 100 clones d'un meme code, la clique en demanderait {100*99}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
