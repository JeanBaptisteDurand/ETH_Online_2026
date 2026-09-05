"""Ce que le cache du graphe fait gagner — mesure, pas affirmation.

    PYTHONPATH=engine python3 -m tare.graph.cachebench

Le README affirmait cinq durees sans commande pour les rejouer. C'est exactement
ce que ce projet s'interdit (regle 4). Ce module produit ces cinq durees, sur les
donnees reelles, avec le nombre de repetitions et la mediane ecrits a cote.

Les cinq mesures :

  1. LECTURE FROIDE      load_store() apres invalidate() — lire graph.json et
                         l'indexer. C'est le cout qu'on paie UNE fois.
  2. REMISE A CHAUD      load_store() sur une entree valide — un stat() et un
                         acces dictionnaire. C'est le cout de chaque requete
                         suivante.
  3. impact()            un parcours par hook, en O(degre). Pas de memo : le
                         cout ne depend pas de la taille du graphe. Mesure sur
                         le hook le PLUS LARGE du jeu, donc le pire cas.
  4. AGREGAT MEMOISE     contradictions() deja calcule — un acces au memo.
  5. RECONSTRUCTION      build_store() depuis les sources, ce que ferait un
                         serveur qui reconstruit le graphe a chaque requete.
                         C'est l'erreur que le cache existe pour eviter.

On imprime la MEDIANE, pas la moyenne : une seule pause du ramasse-miettes
suffit a doubler une moyenne, et on ne veut pas publier un chiffre qui bouge.

Rien ici n'est arrondi a la main. Ce que la sortie montre est ce qui a ete
mesure sur la machine qui l'a lancee — donc un ordre de grandeur reproductible,
pas une constante universelle. La ligne d'en-tete le dit.
"""
from __future__ import annotations

import argparse
import json
import platform
import statistics
import sys
import time
from typing import Callable, List

from .loader import DEFAULT_GRAPH
from .nx_compat import BACKEND
from .schema import NodeKind
from .store import build_store, invalidate, load_store


def _median_ms(fn: Callable[[], object], repeats: int) -> float:
    """Mediane de `repeats` appels, en millisecondes."""
    samples: List[float] = []
    for _ in range(repeats):
        t0 = time.perf_counter()
        fn()
        samples.append((time.perf_counter() - t0) * 1000.0)
    return statistics.median(samples)


def _widest_hook(store) -> tuple:
    """Le hook attache au plus de pools : le pire cas pour impact()."""
    best_addr, best_pools = None, -1
    for node, data in store.g.nodes(data=True):
        if data.get("kind") != NodeKind.HOOK:
            continue
        addr = data.get("address") or node
        try:
            imp = store.impact(addr)
        except Exception:
            continue
        n = imp.get("n_pools")
        if n is None:
            n = len(imp.get("pools") or [])
        if n > best_pools:
            best_addr, best_pools = addr, n
    return best_addr, best_pools


def measure(path=DEFAULT_GRAPH, repeats: int = 21) -> dict:
    """Les cinq durees. `repeats` est impair pour que la mediane soit un echantillon."""
    path = str(path)

    # 1. lecture froide : on invalide AVANT chaque appel, sinon on mesure le cache.
    def cold():
        invalidate()
        return load_store(path)

    cold_ms = _median_ms(cold, repeats)

    # 2. remise a chaud : l'entree est valide, load_store doit rendre l'objet garde.
    store = load_store(path)
    warm_ms = _median_ms(lambda: load_store(path), repeats)

    # 3. impact() sur le hook le plus large — le pire cas, pas un cas moyen.
    hook, n_pools = _widest_hook(store)
    impact_ms = _median_ms(lambda: store.impact(hook), repeats) if hook else float("nan")

    # 4. agregat memoise : on force le premier calcul hors mesure.
    store.contradictions()
    memo_ms = _median_ms(store.contradictions, repeats)

    # 5. reconstruction depuis les sources — sans disque, sans cache.
    rebuild_ms = _median_ms(build_store, max(3, repeats // 7))

    return {
        "backend": BACKEND,
        "python": platform.python_version(),
        "machine": f"{platform.system()} {platform.machine()}",
        "graph": path,
        "nodes": store.g.number_of_nodes(),
        "edges": store.g.number_of_edges(),
        "repeats": repeats,
        "cold_load_ms": cold_ms,
        "warm_handback_ms": warm_ms,
        "impact_ms": impact_ms,
        "impact_hook": hook,
        "impact_pools": n_pools,
        "memoised_aggregate_ms": memo_ms,
        "rebuild_from_sources_ms": rebuild_ms,
        "speedup_warm_vs_cold": (cold_ms / warm_ms) if warm_ms else float("inf"),
        "speedup_warm_vs_rebuild": (rebuild_ms / warm_ms) if warm_ms else float("inf"),
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="tare.graph.cachebench")
    ap.add_argument("--repeats", type=int, default=21)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)

    r = measure(repeats=a.repeats)
    if a.json:
        print(json.dumps(r, indent=1))
        return 0

    print(f"{r['nodes']} noeuds, {r['edges']} aretes  (backend {r['backend']}, "
          f"python {r['python']}, {r['machine']})")
    print(f"mediane sur {r['repeats']} repetitions — chiffres propres a cette machine\n")
    print(f"  lecture froide (lire + indexer)      {r['cold_load_ms']:9.3f} ms")
    print(f"  remise a chaud (entree valide)       {r['warm_handback_ms']:9.4f} ms")
    print(f"  impact() sur {r['impact_pools']} pools{'':14}{r['impact_ms']:9.4f} ms"
          f"   {r['impact_hook']}")
    print(f"  agregat memoise (contradictions)     {r['memoised_aggregate_ms']:9.6f} ms")
    print(f"  reconstruction depuis les sources    {r['rebuild_from_sources_ms']:9.3f} ms\n")
    print(f"  a chaud contre a froid               x{r['speedup_warm_vs_cold']:.0f}")
    print(f"  a chaud contre reconstruction        x{r['speedup_warm_vs_rebuild']:.0f}"
          "   <- l'erreur que ce cache evite")
    return 0


if __name__ == "__main__":
    sys.exit(main())
