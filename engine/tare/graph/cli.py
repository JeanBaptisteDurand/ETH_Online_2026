"""tare.graph — ligne de commande.

    python3 -m tare.graph.cli fetch-chain --rpc $BASE_RPC_URL [--block 50614000]
    python3 -m tare.graph.cli build       [--out engine/tare/graph/data/graph.json]
    python3 -m tare.graph.cli stats
    python3 -m tare.graph.cli impact           --hook 0x...
    python3 -m tare.graph.cli twins            --hook 0x...
    python3 -m tare.graph.cli deployer-cluster --hook 0x...
    python3 -m tare.graph.cli summary          --hook 0x...
    python3 -m tare.graph.cli clusters   [--min 2]
    python3 -m tare.graph.cli orphans
    python3 -m tare.graph.cli contradictions
    python3 -m tare.graph.cli disagreement [--flat-bps 1.0]

Toute commande accepte --json pour cracher la reponse brute. Le graphe ne
calcule aucun bps : il range ceux que le moteur a mesures et les rend
accompagnes de leur etiquette et de la commande qui les rejoue.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import chain as chain_mod
from . import queries, sources
from .loader import DEFAULT_GRAPH, build_tare_graph, graph_meta, write_graph
from .nx_compat import BACKEND
from .store import load_store

CHAIN_ID = 8453
BLOCK = 50614000


def _store(a):
    return load_store(Path(a.graph))


def _emit(a, payload) -> int:
    print(json.dumps(payload, indent=1, default=str))
    return 0


# --------------------------------------------------------------- fetch-chain

def cmd_fetch_chain(a) -> int:
    rows = sources.read_measurements(Path(a.measurements))
    entries = sources.read_registry(Path(a.hooklist))
    addrs = sources.chain_addresses(rows, entries, chain_id=a.chain_id)
    if a.limit:
        addrs = addrs[:a.limit]
    print(f"{len(addrs)} adresses sur chain {a.chain_id} "
          f"({len({r['hook'].lower() for r in rows})} mesurees, "
          f"{len({e['hook']['address'].lower() for e in entries if e['hook']['chainId'] == a.chain_id})} au registre)")
    previous = None if a.restart else chain_mod.load_cache(Path(a.out))
    cache = chain_mod.enrich(a.rpc, addrs, a.block, chain_id=a.chain_id, mirror=a.mirror,
                             threads=a.threads, previous=previous,
                             log=lambda s: print(s, flush=True))
    path = chain_mod.write_cache(cache, Path(a.out))
    print(f"\n{cache['n_with_code']}/{cache['n_addresses']} bytecodes lus, "
          f"{cache['n_with_creator']}/{cache['n_addresses']} createurs trouves -> {path}")
    unavailable = [x for x, e in cache["entries"].items() if e["code"]["status"] == "UNAVAILABLE"]
    if unavailable:
        print(f"ATTENTION {len(unavailable)} adresses UNAVAILABLE (pas 'sans code' : PAS LUES) : "
              f"{', '.join(unavailable[:5])}{' …' if len(unavailable) > 5 else ''}")
    return 0


# --------------------------------------------------------------------- build

def cmd_build(a) -> int:
    g = build_tare_graph(Path(a.measurements), Path(a.hooklist),
                         Path(a.chain_cache) if a.chain_cache else None)
    path = write_graph(g, Path(a.out))
    st = queries.stats(g)
    meta = graph_meta(g)
    print(f"graphe -> {path}   backend {BACKEND}")
    print(f"{st['nodes']} noeuds, {st['edges']} aretes")
    for k, v in st["by_node_kind"].items():
        print(f"  {k:<16}{v:>6}")
    for k, v in st["by_edge_kind"].items():
        print(f"  {k:<16}{v:>6}")
    if not meta.get("chain_cache_present"):
        print("\nATTENTION cache chaine absent : ni Bytecode ni Deployer(RPC) dans ce graphe.\n"
              "  python3 -m tare.graph.cli fetch-chain --rpc $BASE_RPC_URL")
    return 0


# -------------------------------------------------------------------- lectures

def cmd_stats(a) -> int:
    s = _store(a)
    payload = {"meta": s.meta, "stats": s.stats(),
               "clusters_de_clones": len(s.clusters()),
               "orphelins": s.orphans()["n_orphans"],
               "contradictions": s.contradictions()["n_contradictory"]}
    if a.json:
        return _emit(a, payload)
    print(f"source {s.source}")
    print(f"{s.stats()['nodes']} noeuds, {s.stats()['edges']} aretes  "
          f"(bloc {s.meta.get('block_number')}, backend {s.meta.get('backend')})")
    for k, v in s.stats()["by_node_kind"].items():
        print(f"  {k:<16}{v:>6}")
    for k, v in s.stats()["by_edge_kind"].items():
        print(f"  {k:<16}{v:>6}")
    print(f"\ngroupes de clones : {payload['clusters_de_clones']}")
    print(f"hooks orphelins   : {payload['orphelins']}")
    print(f"contradictions    : {payload['contradictions']}")
    return 0


def cmd_impact(a) -> int:
    r = _store(a).impact(a.hook, a.chain_id)
    if a.json or not r.get("found"):
        return _emit(a, r)
    p = r["measurements"]
    print(f"hook {r['address']}  ({r['label']})")
    print(f"  pools attaches        {r['n_pools']}")
    print(f"  tokens touches        {r['n_tokens']}")
    print(f"  mesures               {p['n']}  " +
          "  ".join(f"{k}={v}" for k, v in p["by_label"].items() if v))
    if p["n_measured"]:
        print(f"  bps MEASURED          min {p['bps_min']}  median {p['bps_median']}  max {p['bps_max']}")
    else:
        print("  bps MEASURED          aucune mesure cotable — pas de nombre a donner")
    b = r["bytecode"]
    print(f"  bytecode              {b['status']}  {b['code_hash'] or ''}  clones {b['n_twins']}")
    print(f"  pools des clones      {r['n_twin_pools']}")
    print(f"  deployeur             {r['deployer']['status']}  "
          f"{','.join(r['deployer']['deployers']) or '—'}  freres {r['deployer']['n_siblings']}")
    print(f"  RAYON DE SOUFFLE      {r['n_pools_at_risk']} pools a re-mesurer si le code est en cause")
    return 0


def cmd_twins(a) -> int:
    r = _store(a).twins(a.hook, a.chain_id)
    if a.json or not r.get("found") or r.get("status") != "CODE":
        return _emit(a, r)
    print(f"hook {a.hook}\n  keccak(code) {r['code_hash']}  {r['code_size']} octets")
    print(f"  {r['n_twins']} clone(s) :")
    for t in r["twins"]:
        print(f"    {t['address']}  {t['n_pools']} pool(s)  {t['label']}")
    return 0


def cmd_deployer_cluster(a) -> int:
    return _emit(a, _store(a).deployer_cluster(a.hook, a.chain_id))


def cmd_summary(a) -> int:
    return _emit(a, _store(a).hook_summary(a.hook, a.chain_id))


def cmd_clusters(a) -> int:
    cs = _store(a).clusters(min_size=a.min)
    if a.json:
        return _emit(a, cs)
    print(f"{len(cs)} groupe(s) de hooks partageant un bytecode (>= {a.min})")
    for c in cs:
        print(f"  {c['n_hooks']:>3} hooks  {c['n_pools']:>4} pools  {c['code_size']:>6} o  "
              f"{c['code_hash'][:18]}…")
        for h in c["hooks"]:
            print(f"        {h}")
    return 0


def cmd_orphans(a) -> int:
    r = _store(a).orphans(a.chain_id)
    if a.json:
        return _emit(a, r)
    print(f"{r['n_orphans']}/{r['n_listed']} hooks du registre sans pool liquide connu")
    print(f"  portee : {r['scope']}")
    for o in r["orphans"][:a.head]:
        print(f"  {o['address']}  code={o['bytecode_status']:<12} {o['label']}")
    if r["n_orphans"] > a.head:
        print(f"  … {r['n_orphans'] - a.head} de plus (--head N ou --json)")
    return 0


def cmd_contradictions(a) -> int:
    r = _store(a).contradictions()
    if a.json:
        return _emit(a, r)
    print(f"{r['n_hooks_with_multiple_entries']} hooks ont plusieurs fiches ; "
          f"{r['n_contradictory']} divergent")
    for c in r["contradictions"]:
        print(f"  chain {c['chain_id']}  {c['address']}  {c['names']}")
        print(f"      champs divergents : {', '.join(c['fields'])}")
        for p in c["divergences"]:
            for sec, dd in p["diff"].items():
                for k, (x, y) in dd.items():
                    print(f"        {sec}.{k}: {x!r} vs {y!r}")
    return 0


def cmd_disagreement(a) -> int:
    r = _store(a).disagreement(a.chain_id, a.flat_bps)
    if a.json:
        return _emit(a, r)
    print(f"seuil de platitude {r['flat_bps']} bps, chain {r['chain_id']}\n")
    print(f"registre dit vanillaSwap=false, mesure a ~0 bps : "
          f"{r['n_registry_says_active_measure_says_flat']}")
    for x in r["registry_says_active_measure_says_flat"]:
        print(f"  {x['address']}  {x['n_pools']} pools  "
              f"max {x['profile']['bps_max']} bps sur {x['profile']['n_measured']} mesures  {x['label']}")
    print(f"\nregistre dit vanillaSwap=true, mesure preleve : "
          f"{r['n_registry_says_vanilla_measure_says_active']}")
    for x in r["registry_says_vanilla_measure_says_active"]:
        print(f"  {x['address']}  {x['n_pools']} pools  "
              f"max {x['profile']['bps_max']} bps sur {x['profile']['n_measured']} mesures  {x['label']}")
    print(f"\nnon comparables (aucune mesure MEASURED) : {r['n_not_comparable']}")
    return 0


# ---------------------------------------------------------------------- main

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="tare.graph.cli", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def reader(p):
        p.add_argument("--graph", default=str(DEFAULT_GRAPH))
        p.add_argument("--chain-id", type=int, default=CHAIN_ID)
        p.add_argument("--json", action="store_true")

    def hooked(p):
        reader(p)
        p.add_argument("--hook", required=True)

    f = sub.add_parser("fetch-chain", help="eth_getCode + tx de creation, vers le cache")
    f.add_argument("--rpc", required=True)
    f.add_argument("--block", type=int, default=BLOCK)
    f.add_argument("--chain-id", type=int, default=CHAIN_ID)
    f.add_argument("--mirror", default=chain_mod.DEFAULT_MIRROR)
    f.add_argument("--threads", type=int, default=6)
    f.add_argument("--limit", type=int, default=0)
    f.add_argument("--measurements", default=str(sources.DEFAULT_MEASUREMENTS))
    f.add_argument("--hooklist", default=str(sources.DEFAULT_HOOKLIST))
    f.add_argument("--out", default=str(chain_mod.DEFAULT_CACHE))
    f.add_argument("--restart", action="store_true",
                   help="ignorer le cache existant et tout re-interroger")
    f.set_defaults(fn=cmd_fetch_chain)

    b = sub.add_parser("build", help="construire graph.json depuis les trois sources")
    b.add_argument("--measurements", default=str(sources.DEFAULT_MEASUREMENTS))
    b.add_argument("--hooklist", default=str(sources.DEFAULT_HOOKLIST))
    b.add_argument("--chain-cache", default=str(chain_mod.DEFAULT_CACHE))
    b.add_argument("--out", default=str(DEFAULT_GRAPH))
    b.set_defaults(fn=cmd_build)

    s = sub.add_parser("stats", help="ce que le graphe contient")
    reader(s)
    s.set_defaults(fn=cmd_stats)

    for name, fn in (("impact", cmd_impact), ("twins", cmd_twins),
                     ("deployer-cluster", cmd_deployer_cluster), ("summary", cmd_summary)):
        p = sub.add_parser(name)
        hooked(p)
        p.set_defaults(fn=fn)

    c = sub.add_parser("clusters", help="tous les groupes de clones")
    reader(c)
    c.add_argument("--min", type=int, default=2)
    c.set_defaults(fn=cmd_clusters)

    o = sub.add_parser("orphans", help="hooks du registre sans pool liquide")
    reader(o)
    o.add_argument("--head", type=int, default=20)
    o.set_defaults(fn=cmd_orphans)

    k = sub.add_parser("contradictions", help="hooks a deux fiches divergentes")
    reader(k)
    k.set_defaults(fn=cmd_contradictions)

    d = sub.add_parser("disagreement", help="registre contre mesure")
    reader(d)
    d.add_argument("--flat-bps", type=float, default=queries.FLAT_BPS)
    d.set_defaults(fn=cmd_disagreement)

    a = ap.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
