"""Le graphe TARE : hooks, bytecodes, pools, tokens, deployeurs, mesures, fiches.

    from tare.graph import load_store
    s = load_store()                       # charge une fois, ensuite c'est du cache
    s.twins("0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc")
    s.impact("0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc")

Construire ou reconstruire :

    python3 -m tare.graph.cli fetch-chain --rpc $BASE_RPC_URL   # eth_getCode + mirror
    python3 -m tare.graph.cli build
"""
from .loader import build_tare_graph, graph_meta, write_graph, DEFAULT_GRAPH
from .store import GraphStore, build_store, invalidate, load_store

__all__ = ["build_tare_graph", "graph_meta", "write_graph", "DEFAULT_GRAPH",
           "GraphStore", "build_store", "invalidate", "load_store"]
