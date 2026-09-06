"""Des trois sources vers des noeuds et des aretes.

  measurements.jsonl -> Pool, Token, Measurement, Hook   + ATTACHED_TO, HOLDS, MEASURED_AS
  hooklist.json      -> RegistryEntry, Hook              + LISTED_IN
  chain-cache.json   -> Bytecode, Deployer               + HAS_BYTECODE, DEPLOYED_BY

Aucune de ces fonctions n'invente. Une valeur absente reste absente ; une
mesure NOT_QUOTABLE reste un noeud Measurement etiquete NOT_QUOTABLE, avec sa
raison, parce que "ce pool n'a pas cote a cette taille" est une information et
pas un trou. C'est ce qui permet a impact() de distinguer un hook qui ne
preleve rien d'un hook qu'on n'a pas su coter.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from ..flags import REGISTRY_NAME, decode_flags
from .schema import (Edge, EdgeKind, LABELS, Node, NodeKind, bytecode_id, deployer_id, hook_id,
                     measurement_id, pool_node_id, registry_id, token_id)

REPO = Path(__file__).resolve().parents[3]
DEFAULT_MEASUREMENTS = REPO / "docs" / "dataset" / "measurements.jsonl"
# Le balayage des paires contestees vit dans son propre fichier — il vise 23 pools choisis
# pour une raison precise (les seules paires ou plusieurs pools existent), pas la population.
# Mais ses mesures sont des mesures : le graphe doit les voir, sinon il decrit un corpus que
# le depot ne publie pas. Un fichier absent est ignore en silence, jamais invente.
EXTRA_MEASUREMENTS = (REPO / "docs" / "dataset" / "measurements-contestes.jsonl",)
def _latest_hooklist() -> Path:
    """Le registre le plus recent, meme regle que `tare.rag.corpus.registry_path`.

    Le graphe a longtemps ete construit sur docs/hooklist.json (613 fiches) pendant que le
    RAG indexait l'instantane vivant (978). Deux sous-systemes du meme projet decrivaient
    donc deux registres differents, et le README citait les deux nombres sans le dire. Une
    seule regle, partagee, plutot que deux constantes qui derivent."""
    docs = REPO / "docs"
    live = sorted(docs.glob("hooklist-live-*.json"))
    return live[-1] if live else docs / "hooklist.json"


DEFAULT_HOOKLIST = _latest_hooklist()

# Les proprietes du registre que l'on compare d'une fiche a l'autre.
REGISTRY_PROPERTIES = ("dynamicFee", "upgradeable", "requiresCustomSwapData",
                       "vanillaSwap", "swapAccess")


def read_measurements(path: Path = DEFAULT_MEASUREMENTS,
                      extra: Iterable[Path] = EXTRA_MEASUREMENTS) -> List[dict]:
    """Toutes les mesures publiees, jamais un sous-ensemble choisi.

    `extra` n'est lu que si le chemin existe : un fichier absent est une absence, pas une
    erreur, et surtout pas un zero. Quand l'appelant donne un `path` explicite (un instantane
    fige, par exemple), il donne aussi `extra` explicitement — sinon on melangerait un
    instantane et un fichier vivant, et les deux nombres du README se contrediraient.
    """
    paths = [Path(path)]
    if path == DEFAULT_MEASUREMENTS:
        paths += [Path(p) for p in extra if Path(p).exists()]
    rows = []
    for p in paths:
        with open(p) as fh:
            for line in fh:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))

    # LA MEME regle de deduplication que le moteur, pas une seconde ecrite ici.
    #
    # Le fichier est en ajout seul : une cellule mesuree deux fois y figure deux fois. Le
    # moteur tranche avec `sweep.dedupe`, qui prefere une OBSERVATION a un enregistrement de
    # panne — une ligne « le nud etait injoignable » ne doit pas effacer une mesure reussie.
    # Le graphe, lui, gardait simplement la derniere ligne lue. Les deux regles divergeaient
    # sur treize cellules : le graphe publiait dix nombres MEASURED que le jeu, lui, avait
    # depuis retracte en NOT_MEASURABLE. Un graphe qui affirme ce que sa source ne soutient
    # plus est pire qu'un graphe perime, parce que rien ne le signale.
    from ..sweep import dedupe

    return dedupe(rows)


def read_registry(path: Path = DEFAULT_HOOKLIST) -> List[dict]:
    return json.loads(Path(path).read_text())


def replay_command(row: dict) -> str:
    """Regle 4 : chaque valeur se rejoue en une commande — et en quelques secondes.

    La commande publiee ici a longtemps ete `make measure HOOK=0x...`, qui remesure TOUS les
    pools du hook. Pour Zora cela fait 1 471 pools, huit tailles, deux sens : la commande
    depassait dix minutes et personne ne l'a jamais lancee. Une promesse qu'on ne peut pas
    tenir en pratique n'est pas tenue. Celle-ci rejoue exactement LA cellule, en sept
    secondes, et sort en 1 si la valeur differe.
    """
    sens = "0>1" if row["zero_for_one"] else "1>0"
    return (f"make replay POOL={row['pool_id']} SIZE={row['amount_in']} DIR={sens}"
            f"   # {row['bps']} bps au bloc {row['block_number']}")


# --------------------------------------------------------------- measurements

def from_measurements(rows: Iterable[dict]) -> Tuple[List[Node], List[Edge]]:
    nodes: List[Node] = []
    edges: List[Edge] = []
    seen_hook: set = set()
    seen_pool: set = set()
    seen_token: set = set()

    for row in rows:
        cid = int(row["chain_id"])
        h = hook_id(cid, row["hook"])
        p = pool_node_id(cid, row["pool_id"])
        blk = int(row["block_number"])

        if h not in seen_hook:
            seen_hook.add(h)
            lo, flag_names = decode_flags(row["hook"])
            nodes.append(Node(h, NodeKind.HOOK, row["hook"].lower(), {
                "chain_id": cid, "address": row["hook"].lower(),
                "flag_bits": lo, "address_flags": sorted(flag_names),
                "seen_in": "measurements",
            }))
        if p not in seen_pool:
            seen_pool.add(p)
            nodes.append(Node(p, NodeKind.POOL, row["pool_id"], {
                "chain_id": cid, "pool_id": row["pool_id"], "hook": row["hook"].lower(),
                "currency0": row["currency0"], "currency1": row["currency1"],
                "key_fee": row["key_fee"], "tick_spacing": row["tick_spacing"],
                "fee_is_dynamic": row["fee_is_dynamic"],
                "stored_lp_fee": row.get("stored_lp_fee"),
                "stored_protocol_fee": row.get("stored_protocol_fee"),
                "block_number": blk,
            }))
            edges.append(Edge(h, p, EdgeKind.ATTACHED_TO,
                              {"block": blk, "source": "measurements.jsonl"}))
            for slot in ("currency0", "currency1"):
                t = token_id(cid, row[slot])
                if t not in seen_token:
                    seen_token.add(t)
                    nodes.append(Node(t, NodeKind.TOKEN, row[slot].lower(),
                                      {"chain_id": cid, "address": row[slot].lower()}))
                edges.append(Edge(p, t, EdgeKind.HOLDS, {"slot": slot, "block": blk}))

        label = row["label"]
        if label not in LABELS:
            raise ValueError(f"etiquette inconnue {label!r} — les etiquettes ne s'inventent pas")
        m = measurement_id(row["pool_id"], row["zero_for_one"], row["amount_in"], blk)
        nodes.append(Node(m, NodeKind.MEASUREMENT, f"{label} {row.get('bps')}", {
            "hook": row["hook"].lower(), "pool_id": row["pool_id"], "chain_id": cid,
            "block_number": blk, "zero_for_one": row["zero_for_one"],
            "amount_in": row["amount_in"], "bps": row.get("bps"), "label": label,
            "reason": row.get("reason"),
            "out_with": row.get("out_with"), "out_without": row.get("out_without"),
            "stored_lp_fee": row.get("stored_lp_fee"),
            "stub_hash": row.get("stub_hash"), "engine_ver": row.get("engine_ver"),
            "observed_at": row.get("observed_at"),
            "replay": replay_command(row),
        }))
        edges.append(Edge(p, m, EdgeKind.MEASURED_AS,
                          {"label": label, "block": blk, "refs": [m]}))
    return nodes, edges


# ------------------------------------------------------------------ registry

def from_registry(entries: Iterable[dict]) -> Tuple[List[Node], List[Edge]]:
    nodes: List[Node] = []
    edges: List[Edge] = []
    ordinals: Dict[str, int] = {}
    seen_hook: set = set()

    for idx, entry in enumerate(entries):
        hk = entry["hook"]
        cid = int(hk["chainId"])
        addr = hk["address"].lower()
        h = hook_id(cid, addr)
        ordinal = ordinals.get(h, 0)
        ordinals[h] = ordinal + 1
        r = registry_id(cid, addr, ordinal)

        if h not in seen_hook:
            seen_hook.add(h)
            lo, flag_names = decode_flags(addr)
            nodes.append(Node(h, NodeKind.HOOK, hk.get("name") or addr, {
                "chain_id": cid, "address": addr, "chain": hk.get("chain"),
                "flag_bits": lo, "address_flags": sorted(flag_names),
                "seen_in": "registry",
            }))

        nodes.append(Node(r, NodeKind.REGISTRY_ENTRY, hk.get("name") or addr, {
            "chain_id": cid, "address": addr, "ordinal": ordinal, "index": idx,
            "name": hk.get("name"), "chain": hk.get("chain"),
            "description": hk.get("description"),
            "declared_deployer": (hk.get("deployer") or "").lower() or None,
            "verifiedSource": hk.get("verifiedSource"),
            "auditUrl": hk.get("auditUrl") or None,
            "flags": dict(entry.get("flags") or {}),
            "properties": dict(entry.get("properties") or {}),
            "source": "docs/hooklist.json",
        }))
        edges.append(Edge(h, r, EdgeKind.LISTED_IN,
                          {"ordinal": ordinal, "refs": [idx], "source": "docs/hooklist.json"}))

        declared = (hk.get("deployer") or "").lower()
        if declared.startswith("0x") and len(declared) == 42:
            d = deployer_id(cid, declared)
            nodes.append(Node(d, NodeKind.DEPLOYER, declared,
                              {"chain_id": cid, "address": declared}))
            edges.append(Edge(h, d, EdgeKind.DEPLOYED_BY,
                              {"source": "registry", "refs": [idx]}))
    return nodes, edges


def registry_flags_match_address(entry: dict) -> bool:
    """Le registre declare 14 booleens ; l'adresse du hook les encode dans ses
    14 bits de poids faible. Les deux doivent coincider — sinon la fiche ment
    sur ce que le contrat a le DROIT de faire."""
    _lo, names = decode_flags(entry["hook"]["address"])
    declared = entry.get("flags") or {}
    live = {REGISTRY_NAME[n] for n in names}
    for const, key in REGISTRY_NAME.items():
        if bool(declared.get(key)) != (key in live):
            return False
    return True


# --------------------------------------------------------------------- chain

def from_chain(cache: dict, chain_id: Optional[int] = None) -> Tuple[List[Node], List[Edge]]:
    """Bytecode en ETOILE : un noeud par keccak, une arete par hook. Pas de
    clique. Et rien du tout pour un statut UNAVAILABLE — regle 3."""
    nodes: List[Node] = []
    edges: List[Edge] = []
    cid = int(chain_id if chain_id is not None else cache.get("chain_id", 8453))
    seen_code: set = set()
    seen_dep: set = set()

    for addr, entry in sorted((cache.get("entries") or {}).items()):
        h = hook_id(cid, addr)
        code = entry.get("code") or {}
        creation = entry.get("creation") or {}

        if code.get("status") == "CODE" and code.get("code_hash"):
            c = bytecode_id(code["code_hash"])
            if c not in seen_code:
                seen_code.add(c)
                nodes.append(Node(c, NodeKind.BYTECODE, code["code_hash"][:18],
                                  {"code_hash": code["code_hash"],
                                   "code_size": code.get("code_size")}))
            edges.append(Edge(h, c, EdgeKind.HAS_BYTECODE, {
                "block": code.get("code_block"), "code_size": code.get("code_size"),
                "source": "eth_getCode",
                "after_pinned_block": code.get("after_pinned_block") or None,
            }))
        # Le statut de lecture est porte par le hook : "pas de clone" et "pas lu"
        # ne doivent jamais se confondre dans twins().
        nodes.append(Node(h, NodeKind.HOOK, addr, {
            "chain_id": cid, "address": addr,
            "bytecode_status": code.get("status", "UNAVAILABLE"),
            "bytecode_reason": code.get("reason"),
            "code_size": code.get("code_size"),
        }))

        creator = creation.get("creator")
        if creator:
            d = deployer_id(cid, creator)
            if d not in seen_dep:
                seen_dep.add(d)
                nodes.append(Node(d, NodeKind.DEPLOYER, creator,
                                  {"chain_id": cid, "address": creator}))
            edges.append(Edge(h, d, EdgeKind.DEPLOYED_BY, {
                "source": creation.get("source", "mirror"),
                "factory": creation.get("factory"),
                "block": creation.get("creation_block"),
                "tx": creation.get("creation_tx"),
            }))
        nodes.append(Node(h, NodeKind.HOOK, addr, {
            "deployer_status": creation.get("status", "UNAVAILABLE"),
            "deployer_reason": creation.get("reason"),
            "creation_block": creation.get("creation_block"),
            "factory": creation.get("factory"),
        }))
    return nodes, edges


def chain_addresses(rows: Iterable[dict], entries: Iterable[dict], chain_id: int = 8453) -> List[str]:
    """Les adresses qui valent un appel RPC : tous les hooks mesures, plus tous
    les hooks que le registre place sur cette chaine."""
    out = {r["hook"].lower() for r in rows if int(r["chain_id"]) == chain_id}
    out |= {e["hook"]["address"].lower() for e in entries if int(e["hook"]["chainId"]) == chain_id}
    return sorted(out)
