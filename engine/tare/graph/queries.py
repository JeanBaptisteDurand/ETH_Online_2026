"""Les requetes structurelles — ce qu'une recherche vectorielle ne peut pas dire.

    impact(hook)            le rayon de souffle : pools, tokens, mesures, clones
    twins(hook)             les hooks au meme bytecode
    deployer_cluster(hook)  les hooks du meme deployeur
    orphans()               les hooks du registre sans aucun pool liquide connu
    contradictions()        les hooks a deux fiches de registre divergentes
    disagreement()          le registre dit "pas vanille", la mesure dit ~0 bps

Toutes les traversees sont deterministes : le graphe vient de fichiers et de
eth_getCode, pas d'un modele. Et aucune ne renvoie de nombre invente — une
reponse porte ses etiquettes (MEASURED / INTERPOLATED / NOT_MEASURABLE /
NOT_QUOTABLE) et le compte de chacune, pour qu'un "0 bps" ne puisse jamais etre
confondu avec "on n'a pas su coter".
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from .nx_compat import MultiDiGraph
from .schema import EdgeKind, LABELS, NodeKind, hook_id, split_id

DEFAULT_CHAIN = 8453
# Un hook "a ~0 bps" : sous ce seuil, le prelevement n'est pas distinguable du bruit
# d'arrondi du quoter. C'est le meme seuil que le sweep utilise pour n_gt_1bps.
FLAT_BPS = 1.0


# ------------------------------------------------------------------ primitives

def _in_of(g: MultiDiGraph, node: str, kind: str) -> List[str]:
    if node not in g:
        return []
    return [u for u, v, k, d in g.in_edges(node, keys=True, data=True) if d.get("kind") == kind]


def _out_of(g: MultiDiGraph, node: str, kind: str) -> List[str]:
    if node not in g:
        return []
    return [v for u, v, k, d in g.out_edges(node, keys=True, data=True) if d.get("kind") == kind]


def _attrs(g: MultiDiGraph, node: str) -> Dict[str, Any]:
    return dict(g.nodes[node].get("attrs") or {}) if node in g else {}


def _kind(g: MultiDiGraph, node: str) -> Optional[str]:
    return g.nodes[node].get("kind") if node in g else None


def resolve(g: MultiDiGraph, ref: str, chain_id: int = DEFAULT_CHAIN) -> Optional[str]:
    """Accepte 'hook:8453:0x..' ou simplement '0x..'. Renvoie None si le hook
    n'est pas dans le graphe — jamais un noeud vide qui ressemblerait a un hook
    sans pool."""
    ref = (ref or "").strip()
    if ref in g:
        return ref
    if ref.startswith("0x"):
        candidate = hook_id(chain_id, ref)
        if candidate in g:
            return candidate
        low = ref.lower()
        for n, d in g.nodes(data=True):
            if d.get("kind") == NodeKind.HOOK and (d.get("attrs") or {}).get("address") == low:
                return n
    return None


def neighbors(g: MultiDiGraph, node_id: str) -> Dict[str, list]:
    if node_id not in g:
        return {"in": [], "out": []}
    return {
        "in": [{"src": u, "kind": d.get("kind"), "evidence": d.get("evidence", {})}
               for u, v, k, d in g.in_edges(node_id, keys=True, data=True)],
        "out": [{"dst": v, "kind": d.get("kind"), "evidence": d.get("evidence", {})}
                for u, v, k, d in g.out_edges(node_id, keys=True, data=True)],
    }


# ------------------------------------------------------------------ mesures

def pools_of(g: MultiDiGraph, hook_node: str) -> List[str]:
    return sorted(set(_out_of(g, hook_node, EdgeKind.ATTACHED_TO)))


def measurements_of_pool(g: MultiDiGraph, pool_node: str) -> List[str]:
    return sorted(set(_out_of(g, pool_node, EdgeKind.MEASURED_AS)))


def bps_profile(g: MultiDiGraph, measurement_nodes: Sequence[str]) -> Dict[str, Any]:
    """Le profil d'un paquet de mesures, etiquettes comprises. `bps_max` n'existe
    que s'il y a au moins une mesure MEASURED : sinon il vaut None, jamais 0."""
    by_label = {lab: 0 for lab in LABELS}
    values: List[float] = []
    for m in measurement_nodes:
        a = _attrs(g, m)
        lab = a.get("label")
        if lab in by_label:
            by_label[lab] += 1
        if lab == "MEASURED" and a.get("bps") is not None:
            values.append(float(a["bps"]))
    values.sort()
    return {
        "n": len(measurement_nodes),
        "by_label": by_label,
        "n_measured": len(values),
        "bps_min": values[0] if values else None,
        "bps_max": values[-1] if values else None,
        "bps_median": values[len(values) // 2] if values else None,
        "flat": (all(v <= FLAT_BPS for v in values) if values else None),
    }


# ------------------------------------------------------------------ bytecode

def bytecode_of(g: MultiDiGraph, hook_node: str) -> Optional[str]:
    codes = _out_of(g, hook_node, EdgeKind.HAS_BYTECODE)
    return sorted(codes)[0] if codes else None


def twins(g: MultiDiGraph, ref: str, chain_id: int = DEFAULT_CHAIN) -> Dict[str, Any]:
    """Les clones : les autres hooks dont eth_getCode rend exactement le meme
    bytecode. Passe par le noeud Bytecode en etoile — un _in_of sur un seul
    noeud, pas un parcours de tous les hooks."""
    h = resolve(g, ref, chain_id)
    if h is None:
        return {"hook": ref, "found": False, "status": "UNKNOWN_HOOK", "twins": []}
    a = _attrs(g, h)
    c = bytecode_of(g, h)
    if c is None:
        # Regle 3 : "pas lu" n'est pas "pas de clone".
        return {"hook": h, "found": True, "status": a.get("bytecode_status", "UNAVAILABLE"),
                "reason": a.get("bytecode_reason") or "aucun bytecode dans le graphe pour ce hook",
                "code_hash": None, "twins": []}
    siblings = sorted(set(_in_of(g, c, EdgeKind.HAS_BYTECODE)) - {h})
    return {
        "hook": h, "found": True, "status": "CODE",
        "code_hash": _attrs(g, c).get("code_hash"),
        "code_size": _attrs(g, c).get("code_size"),
        "n_twins": len(siblings),
        "twins": [{"id": t, "address": _attrs(g, t).get("address"),
                   "label": g.nodes[t].get("label"),
                   "n_pools": len(pools_of(g, t))} for t in siblings],
    }


def bytecode_clusters(g: MultiDiGraph, min_size: int = 2) -> List[Dict[str, Any]]:
    """Tous les groupes de clones du graphe, tries du plus gros au plus petit."""
    out = []
    for n, d in g.nodes(data=True):
        if d.get("kind") != NodeKind.BYTECODE:
            continue
        members = sorted(set(_in_of(g, n, EdgeKind.HAS_BYTECODE)))
        if len(members) >= min_size:
            out.append({
                "code_hash": (d.get("attrs") or {}).get("code_hash"),
                "code_size": (d.get("attrs") or {}).get("code_size"),
                "n_hooks": len(members),
                "hooks": [_attrs(g, m).get("address") for m in members],
                "n_pools": sum(len(pools_of(g, m)) for m in members),
            })
    return sorted(out, key=lambda x: (-x["n_hooks"], x["code_hash"] or ""))


# ------------------------------------------------------------------ deployeur

def deployers_by_address(g: MultiDiGraph) -> Dict[str, List[str]]:
    """adresse -> les noeuds Deployer qui la portent, une par chaine. Un EOA
    garde la meme adresse sur toutes les chaines EVM, mais ce n'est PAS le meme
    compte : les noeuds restent separes par chaine, et c'est cet index — et lui
    seul — qui autorise a les rapprocher explicitement."""
    idx: Dict[str, List[str]] = {}
    for n, d in g.nodes(data=True):
        if d.get("kind") != NodeKind.DEPLOYER:
            continue
        a = (d.get("attrs") or {}).get("address")
        if a:
            idx.setdefault(a, []).append(n)
    return {k: sorted(v) for k, v in idx.items()}


def deployer_cluster(g: MultiDiGraph, ref: str, chain_id: int = DEFAULT_CHAIN,
                     addr_index: Optional[Dict[str, List[str]]] = None) -> Dict[str, Any]:
    """Les hooks qui partagent un deployeur avec celui-ci. Un deployeur est soit
    l'EOA qui a signe la tx de creation (mirror), soit celui que la fiche de
    registre declare — les deux sources sont citees, jamais melangees."""
    h = resolve(g, ref, chain_id)
    if h is None:
        return {"hook": ref, "found": False, "status": "UNKNOWN_HOOK", "deployers": []}
    a = _attrs(g, h)
    deployers = sorted(set(_out_of(g, h, EdgeKind.DEPLOYED_BY)))
    if not deployers:
        return {"hook": h, "found": True,
                "status": a.get("deployer_status", "UNAVAILABLE"),
                "reason": a.get("deployer_reason") or "aucun deployeur connu pour ce hook",
                "deployers": [], "siblings": []}
    idx = addr_index if addr_index is not None else deployers_by_address(g)
    rows, siblings, cross = [], set(), set()
    for d in deployers:
        members = sorted(set(_in_of(g, d, EdgeKind.DEPLOYED_BY)) - {h})
        siblings |= set(members)
        sources = set()
        for u, v, k, data in g.in_edges(d, keys=True, data=True):
            if data.get("kind") == EdgeKind.DEPLOYED_BY and u == h:
                sources.add((data.get("evidence") or {}).get("source"))
        for other in idx.get(_attrs(g, d).get("address") or "", []):
            if other != d:
                cross |= set(_in_of(g, other, EdgeKind.DEPLOYED_BY))
        rows.append({"deployer": _attrs(g, d).get("address"), "id": d,
                     "sources": sorted(s for s in sources if s),
                     "n_siblings": len(members)})
    cross -= siblings | {h}
    return {
        "hook": h, "found": True, "status": "CODE",
        "factory": a.get("factory"), "creation_block": a.get("creation_block"),
        "deployers": rows,
        "siblings": [{"id": s, "address": _attrs(g, s).get("address"),
                      "label": g.nodes[s].get("label"),
                      "n_pools": len(pools_of(g, s))} for s in sorted(siblings)],
        # Meme adresse de deployeur, autre chaine. Rapproche, jamais fusionne.
        "n_cross_chain_siblings": len(cross),
        "cross_chain_siblings": [{"id": s, "address": _attrs(g, s).get("address"),
                                  "chain_id": _attrs(g, s).get("chain_id"),
                                  "label": g.nodes[s].get("label")} for s in sorted(cross)],
    }


# ------------------------------------------------------------------ impact

def impact(g: MultiDiGraph, ref: str, chain_id: int = DEFAULT_CHAIN) -> Dict[str, Any]:
    """Le rayon de souffle d'un hook.

    Direct  : les pools auxquels il est attache, les tokens que ces pools
              detiennent, les mesures prises dessus.
    Indirect: les hooks au MEME bytecode et les pools qu'ils portent — si le
              defaut est dans le code, il est deja deploye ailleurs — puis les
              hooks du meme deployeur.

    Le total `pools_at_risk` additionne les pools directs et ceux des clones,
    sans doublon. Il ne dit pas "ces pools sont fautifs" : il dit "voici ce
    qu'il faudrait re-mesurer".
    """
    h = resolve(g, ref, chain_id)
    if h is None:
        return {"hook": ref, "found": False, "status": "UNKNOWN_HOOK"}

    direct_pools = pools_of(g, h)
    tokens, meas = set(), []
    for p in direct_pools:
        tokens |= set(_out_of(g, p, EdgeKind.HOLDS))
        meas.extend(measurements_of_pool(g, p))

    tw = twins(g, h, chain_id)
    twin_ids = [t["id"] for t in tw.get("twins", [])]
    twin_pools = sorted({p for t in twin_ids for p in pools_of(g, t)})

    dc = deployer_cluster(g, h, chain_id)
    sibling_ids = [s["id"] for s in dc.get("siblings", [])]
    sibling_pools = sorted({p for s in sibling_ids for p in pools_of(g, s)})

    entries = sorted(set(_out_of(g, h, EdgeKind.LISTED_IN)))
    at_risk = sorted(set(direct_pools) | set(twin_pools))

    return {
        "hook": h,
        "found": True,
        "address": _attrs(g, h).get("address"),
        "label": g.nodes[h].get("label"),
        "pools": direct_pools,
        "n_pools": len(direct_pools),
        "tokens": sorted(_attrs(g, t).get("address") for t in tokens),
        "n_tokens": len(tokens),
        "measurements": bps_profile(g, meas),
        "bytecode": {"status": tw.get("status"), "code_hash": tw.get("code_hash"),
                     "n_twins": tw.get("n_twins", 0),
                     "twins": [t["address"] for t in tw.get("twins", [])]},
        "twin_pools": twin_pools,
        "n_twin_pools": len(twin_pools),
        "deployer": {"status": dc.get("status"),
                     "deployers": [d["deployer"] for d in dc.get("deployers", [])],
                     "n_siblings": len(sibling_ids),
                     "siblings": [s["address"] for s in dc.get("siblings", [])]},
        "sibling_pools": sibling_pools,
        "registry_entries": entries,
        "n_registry_entries": len(entries),
        "pools_at_risk": at_risk,
        "n_pools_at_risk": len(at_risk),
    }


# ------------------------------------------------------------------ orphelins

def orphans(g: MultiDiGraph, chain_id: int = DEFAULT_CHAIN) -> Dict[str, Any]:
    """Les hooks que le registre liste et auxquels aucun pool liquide n'est
    attache. Restreint a UNE chaine, et pas par confort : la campagne de mesure
    n'a couvert que Base. Sur les autres chaines, l'absence de pool dans le
    graphe ne veut rien dire, et les compter en orphelins serait un mensonge de
    couverture. `scope` porte cette restriction dans la reponse."""
    listed, orphan = [], []
    for n, d in g.nodes(data=True):
        if d.get("kind") != NodeKind.HOOK:
            continue
        a = d.get("attrs") or {}
        if int(a.get("chain_id", -1)) != int(chain_id):
            continue
        if not _out_of(g, n, EdgeKind.LISTED_IN):
            continue  # pas dans le registre : hors sujet ici
        listed.append(n)
        if not pools_of(g, n):
            orphan.append({"id": n, "address": a.get("address"),
                           "label": g.nodes[n].get("label"),
                           "bytecode_status": a.get("bytecode_status", "UNAVAILABLE"),
                           "code_size": a.get("code_size")})
    return {
        "scope": f"chain_id={chain_id}, pools connus = ceux de docs/dataset/measurements.jsonl",
        "n_listed": len(listed),
        "n_orphans": len(orphan),
        "orphans": sorted(orphan, key=lambda x: x["address"] or ""),
    }


# -------------------------------------------------------------- contradictions

def _diff_maps(a: dict, b: dict) -> Dict[str, list]:
    keys = set(a) | set(b)
    return {k: [a.get(k), b.get(k)] for k in sorted(keys) if a.get(k) != b.get(k)}


def contradictions(g: MultiDiGraph) -> Dict[str, Any]:
    """Les hooks que le registre decrit DEUX fois, et pas pareil.

    C'est la requete qui justifie que RegistryEntry soit un noeud : si les
    fiches etaient des attributs du Hook, la seconde aurait ecrase la premiere
    au chargement et cette liste serait vide."""
    rows = []
    n_multi = 0
    for n, d in g.nodes(data=True):
        if d.get("kind") != NodeKind.HOOK:
            continue
        entries = sorted(_out_of(g, n, EdgeKind.LISTED_IN))
        if len(entries) < 2:
            continue
        n_multi += 1
        ea = [_attrs(g, e) for e in entries]
        pairs = []
        for i in range(len(ea) - 1):
            x, y = ea[i], ea[i + 1]
            diff = {
                "flags": _diff_maps(x.get("flags") or {}, y.get("flags") or {}),
                "properties": _diff_maps(x.get("properties") or {}, y.get("properties") or {}),
                "identity": _diff_maps(
                    {k: x.get(k) for k in ("name", "declared_deployer", "verifiedSource", "auditUrl")},
                    {k: y.get(k) for k in ("name", "declared_deployer", "verifiedSource", "auditUrl")}),
            }
            if any(diff.values()):
                pairs.append({"entries": [entries[i], entries[i + 1]], "diff": diff})
        if pairs:
            rows.append({
                "id": n, "address": (d.get("attrs") or {}).get("address"),
                "chain_id": (d.get("attrs") or {}).get("chain_id"),
                "names": [e.get("name") for e in ea],
                "n_entries": len(entries),
                "divergences": pairs,
                "fields": sorted({f"{sec}.{k}"
                                  for p in pairs for sec, dd in p["diff"].items() for k in dd}),
            })
    return {
        "n_hooks_with_multiple_entries": n_multi,
        "n_contradictory": len(rows),
        "contradictions": sorted(rows, key=lambda x: (x["chain_id"] or 0, x["address"] or "")),
    }


# --------------------------------------------------------------- desaccord

def disagreement(g: MultiDiGraph, chain_id: int = DEFAULT_CHAIN,
                 flat_bps: float = FLAT_BPS) -> Dict[str, Any]:
    """La ou le registre et la mesure ne disent pas la meme chose.

    `registry_says_active_measure_says_flat` : au moins une fiche declare
      vanillaSwap=false (le hook touche au swap) et TOUTES les mesures MEASURED
      du hook sont sous flat_bps.
    `registry_says_vanilla_measure_says_active` : la fiche declare
      vanillaSwap=true et la mesure trouve plus que flat_bps. C'est le sens qui
      coute de l'argent a un LP.

    Un hook sans aucune mesure MEASURED n'apparait dans aucune des deux listes.
    Il apparait dans `not_comparable`, avec le compte de ses etiquettes."""
    active, vanilla, skipped = [], [], []
    for n, d in g.nodes(data=True):
        if d.get("kind") != NodeKind.HOOK:
            continue
        a = d.get("attrs") or {}
        if int(a.get("chain_id", -1)) != int(chain_id):
            continue
        entries = sorted(_out_of(g, n, EdgeKind.LISTED_IN))
        if not entries:
            continue
        declared = [(_attrs(g, e).get("properties") or {}).get("vanillaSwap") for e in entries]
        declared = [v for v in declared if v is not None]
        if not declared:
            continue
        meas = [m for p in pools_of(g, n) for m in measurements_of_pool(g, p)]
        prof = bps_profile(g, meas)
        row = {"id": n, "address": a.get("address"), "label": g.nodes[n].get("label"),
               "vanillaSwap_declared": declared, "n_pools": len(pools_of(g, n)),
               "profile": prof}
        if prof["n_measured"] == 0:
            row["reason"] = ("aucune mesure MEASURED : "
                             + ", ".join(f"{k}={v}" for k, v in prof["by_label"].items() if v)
                             or "aucune mesure du tout")
            skipped.append(row)
            continue
        if any(v is False for v in declared) and prof["bps_max"] <= flat_bps:
            active.append(row)
        if any(v is True for v in declared) and prof["bps_max"] > flat_bps:
            vanilla.append(row)
    key = lambda x: x["address"] or ""
    return {
        "chain_id": chain_id,
        "flat_bps": flat_bps,
        "n_registry_says_active_measure_says_flat": len(active),
        "registry_says_active_measure_says_flat": sorted(active, key=key),
        "n_registry_says_vanilla_measure_says_active": len(vanilla),
        "registry_says_vanilla_measure_says_active": sorted(vanilla, key=key),
        "n_not_comparable": len(skipped),
        "not_comparable": sorted(skipped, key=key),
    }


# ------------------------------------------------------------------ resume

def hook_summary(g: MultiDiGraph, ref: str, chain_id: int = DEFAULT_CHAIN) -> Dict[str, Any]:
    h = resolve(g, ref, chain_id)
    if h is None:
        return {"hook": ref, "found": False}
    a = _attrs(g, h)
    pools = pools_of(g, h)
    meas = [m for p in pools for m in measurements_of_pool(g, p)]
    entries = sorted(_out_of(g, h, EdgeKind.LISTED_IN))
    worst = None
    for m in meas:
        ma = _attrs(g, m)
        if ma.get("label") == "MEASURED" and ma.get("bps") is not None:
            if worst is None or float(ma["bps"]) > float(_attrs(g, worst)["bps"]):
                worst = m
    return {
        "hook": h, "found": True, "address": a.get("address"),
        "label": g.nodes[h].get("label"),
        "chain_id": a.get("chain_id"),
        "address_flags": a.get("address_flags"),
        "n_pools": len(pools),
        "profile": bps_profile(g, meas),
        "worst_measurement": (_attrs(g, worst) if worst else None),
        "registry_names": [_attrs(g, e).get("name") for e in entries],
        "n_registry_entries": len(entries),
        "bytecode": {"status": a.get("bytecode_status", "UNAVAILABLE"),
                     "code_size": a.get("code_size")},
        "deployer": {"status": a.get("deployer_status", "UNAVAILABLE"),
                     "factory": a.get("factory"),
                     "creation_block": a.get("creation_block")},
    }


def stats(g: MultiDiGraph) -> Dict[str, Any]:
    kinds: Dict[str, int] = {}
    for _n, d in g.nodes(data=True):
        kinds[d.get("kind") or "UNKNOWN"] = kinds.get(d.get("kind") or "UNKNOWN", 0) + 1
    ekinds: Dict[str, int] = {}
    for _u, _v, k, _d in g.edges(keys=True, data=True):
        ekinds[str(k)] = ekinds.get(str(k), 0) + 1
    return {"nodes": g.number_of_nodes(), "edges": g.number_of_edges(),
            "by_node_kind": dict(sorted(kinds.items())),
            "by_edge_kind": dict(sorted(ekinds.items()))}
