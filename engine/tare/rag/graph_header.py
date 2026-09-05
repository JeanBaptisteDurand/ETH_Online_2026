"""L'en-tete derive du graphe — la brique reprise de cobol-explorer.

Dans cobol-explorer/ingestion/index/chunk.py, `_deps_header()` prefixait chaque
programme COBOL des copybooks qu'il inclut, des programmes qu'il appelle et des
tables qu'il lit ou ecrit, AVANT le source. Le gain n'est pas cosmetique : une
question posee en termes de relations ("qui ecrit dans la table des soldes ?")
ne trouve rien dans un source qui ne nomme jamais la relation, et tout dans un
en-tete qui la nomme.

TARE a le meme probleme, en pire. Une fiche du registre est une description
ecrite par le publieur du hook : elle ne contient ni le nombre de pools, ni les
clones au meme bytecode, ni un seul point de base. Ces faits-la, seul le graphe
les a. On les met devant.

Regle 3 appliquee au mot pres : quand le graphe n'a pas lu quelque chose, la
ligne le DIT. "bytecode: non lu (RATE_LIMITED)" n'est pas la meme phrase que
l'absence de ligne, et surtout pas la meme que "aucun clone". Un en-tete qui
tait l'ignorance enseigne l'ignorance au vecteur.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

from ..graph import queries as Q
from ..graph.build import from_json
from ..graph.loader import DEFAULT_GRAPH, build_tare_graph, graph_meta
from ..graph.nx_compat import MultiDiGraph
from ..graph.schema import EdgeKind, NodeKind

SHORT = 10  # 0x + 8 hex : assez pour reconnaitre, assez court pour l'en-tete


def _short(addr: Optional[str]) -> str:
    a = addr or ""
    return a if len(a) <= SHORT + 2 else a[:SHORT] + "…"


class GraphIndex:
    """Le graphe + les index qu'un balayage de 978 fiches rendrait quadratiques.

    `deployers_by_address()` parcourt tous les noeuds. L'appeler une fois par
    fiche coute 978 x 3671 iterations pour rien : il est calcule une fois ici et
    passe a `deployer_cluster`. Meme raison que GraphStore cote graphe.
    """

    def __init__(self, g: MultiDiGraph, meta: Optional[dict] = None, source: Optional[str] = None):
        self.g = g
        self.meta = dict(meta or graph_meta(g))
        self.source = source
        self._addr_index = Q.deployers_by_address(g)
        self._by_addr: Dict[str, List[str]] = {}
        for n, d in g.nodes(data=True):
            if d.get("kind") != NodeKind.HOOK:
                continue
            a = (d.get("attrs") or {}).get("address")
            if a:
                self._by_addr.setdefault(a, []).append(n)

    # -- resolution

    def hook_node(self, address: str, chain_id: Optional[int] = None) -> Optional[str]:
        """Le noeud Hook pour cette adresse SUR CETTE CHAINE. Une adresse sans
        chaine peut designer deux hooks distincts (meme code deploye sur deux
        reseaux) : on ne les confond pas — c'est le faux resultat #6."""
        a = (address or "").strip().lower()
        cands = self._by_addr.get(a) or []
        if chain_id is None:
            return sorted(cands)[0] if len(cands) == 1 else None
        for n in cands:
            if int((self.g.nodes[n].get("attrs") or {}).get("chain_id", -1)) == int(chain_id):
                return n
        return None

    # -- faits

    def hook_facts(self, node: str) -> Dict[str, Any]:
        g = self.g
        a = dict(g.nodes[node].get("attrs") or {})
        pools = Q.pools_of(g, node)
        tokens, meas = set(), []
        for p in pools:
            tokens |= set(Q._out_of(g, p, EdgeKind.HOLDS))
            meas.extend(Q.measurements_of_pool(g, p))
        profile = Q.bps_profile(g, meas)
        tw = Q.twins(g, node)
        dc = Q.deployer_cluster(g, node, addr_index=self._addr_index)
        entries = sorted(set(Q._out_of(g, node, EdgeKind.LISTED_IN)))
        blocks = sorted({(g.nodes[m].get("attrs") or {}).get("block_number")
                         for m in meas if (g.nodes[m].get("attrs") or {}).get("block_number")})
        return {
            "node": node,
            "address": a.get("address"),
            "chain_id": a.get("chain_id"),
            "chain": a.get("chain"),
            "label": g.nodes[node].get("label"),
            "address_flags": a.get("address_flags") or [],
            "pools": [(g.nodes[p].get("attrs") or {}).get("pool_id") for p in pools],
            "n_pools": len(pools),
            "n_tokens": len(tokens),
            "measurements": profile,
            "blocks": blocks,
            "bytecode": {"status": tw.get("status"), "reason": tw.get("reason"),
                         "code_hash": tw.get("code_hash"), "code_size": tw.get("code_size"),
                         "n_twins": tw.get("n_twins", 0),
                         "twins": [t.get("address") for t in tw.get("twins", [])]},
            "deployer": {"status": dc.get("status"), "reason": dc.get("reason"),
                         "addresses": [d.get("deployer") for d in dc.get("deployers", [])],
                         "n_siblings": len(dc.get("siblings", [])),
                         "siblings": [s.get("address") for s in dc.get("siblings", [])],
                         "n_cross_chain": dc.get("n_cross_chain_siblings", 0)},
            "n_registry_entries": len(entries),
        }


# ---------------------------------------------------------------- rendu texte

def render_hook_header(facts: Dict[str, Any], max_pools: int = 4, max_twins: int = 4) -> str:
    """L'en-tete d'un hook, en clair. Ce texte est PREFIXE au contenu et c'est
    lui, autant que le contenu, qui est vectorise."""
    L: List[str] = []
    name = facts.get("label") or "hook"
    chain = facts.get("chain") or "?"
    L.append(f"HOOK {name}  {facts.get('address')}  chaine {chain} ({facts.get('chain_id')})")
    L.append(f"graphe: {facts.get('node')}")

    n_pools = facts.get("n_pools") or 0
    if n_pools:
        shown = ", ".join(_short(p) for p in (facts.get("pools") or [])[:max_pools])
        more = f" (+{n_pools - max_pools})" if n_pools > max_pools else ""
        L.append(f"pools attaches: {n_pools} — {shown}{more}")
        L.append(f"tokens detenus: {facts.get('n_tokens')}")
    else:
        # Pas "0 pool" tout court : la couverture de mesure est Base seulement.
        L.append("pools attaches: aucun dans le graphe "
                 "(la campagne de mesure n'a couvert que Base au bloc 50614000)")

    prof = facts.get("measurements") or {}
    if prof.get("n"):
        by = prof.get("by_label") or {}
        parts = ", ".join(f"{k} {v}" for k, v in by.items() if v)
        if prof.get("n_measured"):
            blocks = facts.get("blocks") or []
            at = f", bloc {blocks[0]}" if len(blocks) == 1 else ""
            L.append(f"mesures: {prof['n']} ({parts}) — bps min {prof.get('bps_min')}, "
                     f"median {prof.get('bps_median')}, max {prof.get('bps_max')}{at}")
            if prof.get("flat"):
                L.append("profil: plat (toutes les mesures <= 1 bps, indistinguable du bruit d'arrondi)")
        else:
            L.append(f"mesures: {prof['n']} ({parts}) — aucune MEASURED, "
                     f"donc AUCUN bps : ce n'est pas 0 bps, c'est 'on n'a pas su coter'")
    else:
        L.append("mesures: aucune dans le graphe (jamais tente, pas 'zero prelevement')")

    bc = facts.get("bytecode") or {}
    if bc.get("status") == "CODE":
        tw = bc.get("twins") or []
        shown = ", ".join(_short(t) for t in tw[:max_twins])
        more = f" (+{len(tw) - max_twins})" if len(tw) > max_twins else ""
        if tw:
            L.append(f"jumeaux (meme bytecode {_short(bc.get('code_hash'))}, "
                     f"{bc.get('code_size')} octets): {bc.get('n_twins')} — {shown}{more}")
        else:
            L.append(f"jumeaux: aucun — bytecode {_short(bc.get('code_hash'))} "
                     f"({bc.get('code_size')} octets) unique dans le graphe")
    else:
        L.append(f"bytecode: NON LU ({bc.get('status')}) — "
                 f"donc les jumeaux sont inconnus, pas absents")

    dep = facts.get("deployer") or {}
    if dep.get("status") == "CODE" and dep.get("addresses"):
        addrs = ", ".join(_short(d) for d in dep["addresses"] if d)
        L.append(f"deployeur: {addrs} — {dep.get('n_siblings')} hook(s) frere(s), "
                 f"{dep.get('n_cross_chain')} homonyme(s) sur une autre chaine")
        sib = [s for s in (dep.get("siblings") or []) if s][:max_twins]
        if sib:
            L.append("freres: " + ", ".join(_short(s) for s in sib))
    else:
        L.append("deployeur: NON LU — donc les freres sont inconnus, pas absents")

    flags = facts.get("address_flags") or []
    if flags:
        L.append("drapeaux d'adresse: " + ", ".join(flags))
    n_reg = facts.get("n_registry_entries") or 0
    if n_reg > 1:
        L.append(f"fiches de registre: {n_reg} — ce hook est decrit plusieurs fois "
                 f"(voir /graph/contradictions)")
    return "\n".join(L)


def render_absent_header(address: Optional[str], chain_id: Optional[int],
                         name: Optional[str], chain: Optional[str]) -> str:
    """Quand le hook n'est pas dans le graphe. On ne fabrique pas de faits : on
    dit que le graphe ne le connait pas, et pourquoi c'est possible."""
    return "\n".join([
        f"HOOK {name or 'hook'}  {address}  chaine {chain or '?'} ({chain_id})",
        "graphe: ABSENT — ce hook n'a aucun noeud dans le graphe TARE.",
        "consequence: pools, jumeaux, deployeur et bps sont INCONNUS pour lui, "
        "pas nuls. Le graphe est construit a partir des 995 mesures Base au bloc "
        "50614000, du registre et de eth_getCode ; un hook d'une autre chaine ou "
        "sans pool liquide mesure n'y figure pas.",
    ])


def render_doc_header(title: str, rel_path: str, line_start: int, line_end: int,
                      cited: Optional[List[Dict[str, Any]]] = None) -> str:
    """L'en-tete d'un morceau de prose. Un document n'a pas de noeud dans le
    graphe, mais il CITE des adresses : quand il en cite, on accroche ce que le
    graphe sait d'elles. C'est ce qui fait remonter METHOD.md sur une question
    posee en termes de bps alors que METHOD.md ne contient pas le nombre."""
    L = [f"DOCUMENT {rel_path} — section « {title} »",
         f"lignes {line_start}-{line_end}, rejeu: sed -n '{line_start},{line_end}p' {rel_path}"]
    for c in (cited or []):
        L.append("cite " + c["one_line"])
    return "\n".join(L)


def one_line_hook(facts: Dict[str, Any]) -> str:
    prof = facts.get("measurements") or {}
    bc = facts.get("bytecode") or {}
    bits = [f"{facts.get('label') or 'hook'} {facts.get('address')}",
            f"{facts.get('n_pools')} pool(s)"]
    if prof.get("n_measured"):
        bits.append(f"bps max {prof.get('bps_max')}")
    elif prof.get("n"):
        bits.append("aucune mesure MEASURED")
    if bc.get("status") == "CODE":
        bits.append(f"{bc.get('n_twins')} jumeau(x)")
    else:
        bits.append("bytecode non lu")
    return ", ".join(bits)


# ------------------------------------------------------------------ chargement

def load_graph_index(graph_json: Optional[Path] = None,
                     hooklist: Optional[Path] = None) -> GraphIndex:
    """Deux facons d'obtenir le graphe qui nourrit l'index.

    * `hooklist=<registre vivant>` : on RECONSTRUIT le graphe en memoire avec ce
      registre, pour que les 978 fiches aient toutes un en-tete. Rien n'est
      ecrit sur disque — engine/tare/graph/data/graph.json, qui sert les routes
      /graph et les fixtures de test, n'est pas touche.
    * sinon : on lit graph.json tel qu'il est publie.
    """
    if hooklist is not None:
        g = build_tare_graph(hooklist=Path(hooklist))
        return GraphIndex(g, source=f"build_tare_graph(hooklist={Path(hooklist).name})")
    path = Path(graph_json or DEFAULT_GRAPH)
    import json as _json

    payload = _json.loads(path.read_text())
    g = from_json(payload)
    return GraphIndex(g, meta=payload.get("meta"), source=str(path))
