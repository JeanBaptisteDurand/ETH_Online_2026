"""Le schema du graphe TARE : sept sortes de noeuds, six sortes d'aretes.

Deux choix de modelisation portent une these et ne sont pas negociables.

1. MEASURED_AS part du POOL, pas du HOOK.
   Le meme hook preleve 0 bps sur un pool et 689 bps sur un autre (voir
   docs/dataset/summary.json). Le prelevement n'est donc pas une propriete du
   hook : c'est une propriete du COUPLE (hook, pool). Accrocher la mesure au
   hook produirait une moyenne qui n'existe nulle part. On la range sous le
   pool, et on remonte au hook par ATTACHED_TO quand — et seulement quand — on
   veut agreger explicitement.

2. RegistryEntry est un NOEUD, pas un paquet de proprietes sur le Hook.
   Le registre officiel contient 613 fiches pour 576 couples (adresse, chainId)
   distincts : 37 couples portent DEUX fiches. Si les fiches etaient des
   attributs du hook, la deuxieme ecraserait la premiere en silence et la
   requete contradictions() n'aurait rien a montrer. En noeuds, les deux fiches
   coexistent et le desaccord devient une donnee.

Un troisieme choix est une question de cout et non de these : Bytecode est un
noeud en ETOILE. Relier entre eux les hooks au meme bytecode par des aretes
formerait une clique — n*(n-1) aretes pour n clones. Un noeud Bytecode central
donne n aretes. Le banc de engine/tests/test_graph_bench.py chiffre l'ecart sur
les donnees reelles.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Tuple


class NodeKind:
    HOOK = "Hook"
    BYTECODE = "Bytecode"
    POOL = "Pool"
    TOKEN = "Token"
    DEPLOYER = "Deployer"
    MEASUREMENT = "Measurement"
    REGISTRY_ENTRY = "RegistryEntry"


class EdgeKind:
    ATTACHED_TO = "ATTACHED_TO"    # Hook  -> Pool
    HOLDS = "HOLDS"                # Pool  -> Token
    DEPLOYED_BY = "DEPLOYED_BY"    # Hook  -> Deployer
    HAS_BYTECODE = "HAS_BYTECODE"  # Hook  -> Bytecode   (etoile, pas clique)
    MEASURED_AS = "MEASURED_AS"    # Pool  -> Measurement (PAS Hook -> Measurement)
    LISTED_IN = "LISTED_IN"        # Hook  -> RegistryEntry


# Le prefixe de l'identifiant est le type. Un noeud cite dans une arete sans
# avoir ete declare est synthetise a partir de son prefixe, jamais laisse
# sans type (repris de cobol-explorer/ingestion/graph/build.py).
PREFIX_TO_KIND = {
    "hook": NodeKind.HOOK,
    "code": NodeKind.BYTECODE,
    "pool": NodeKind.POOL,
    "token": NodeKind.TOKEN,
    "dep": NodeKind.DEPLOYER,
    "meas": NodeKind.MEASUREMENT,
    "reg": NodeKind.REGISTRY_ENTRY,
}

# Les quatre etiquettes d'honnetete du moteur. Jamais promues, jamais inventees.
LABELS = ("MEASURED", "INTERPOLATED", "NOT_MEASURABLE", "NOT_QUOTABLE")

# Une etiquette de plus, propre au graphe : ce que la chaine n'a pas voulu dire.
# Un eth_getCode qui timeout ou qu'un rate-limit tronque ne donne PAS un
# bytecode vide — il ne donne rien du tout, et le noeud Bytecode n'est pas cree.
UNAVAILABLE = "UNAVAILABLE"


def _norm(addr: str) -> str:
    a = (addr or "").strip().lower()
    return a if a.startswith("0x") else "0x" + a


def hook_id(chain_id: int, address: str) -> str:
    return f"hook:{int(chain_id)}:{_norm(address)}"


def pool_node_id(chain_id: int, pool_id: str) -> str:
    return f"pool:{int(chain_id)}:{_norm(pool_id)}"


def token_id(chain_id: int, address: str) -> str:
    return f"token:{int(chain_id)}:{_norm(address)}"


def deployer_id(chain_id: int, address: str) -> str:
    return f"dep:{int(chain_id)}:{_norm(address)}"


def bytecode_id(code_hash: str) -> str:
    return f"code:{_norm(code_hash)}"


def registry_id(chain_id: int, address: str, ordinal: int) -> str:
    """Deux fiches pour un meme couple -> reg:...#0 et reg:...#1. L'ordinal est
    la position d'apparition dans hooklist.json : il rend la fiche citable."""
    return f"reg:{int(chain_id)}:{_norm(address)}#{int(ordinal)}"


def measurement_id(pool_id: str, zero_for_one: bool, amount_in: str, block_number: int) -> str:
    """Une mesure est identifiee par ce qui la rejoue : le pool, le sens, la
    taille, le bloc. Deux lignes du JSONL qui partagent ces quatre valeurs sont
    la MEME mesure (le sweep peut les avoir ecrites deux fois : voir dedupe)."""
    d = "0for1" if zero_for_one else "1for0"
    return f"meas:{_norm(pool_id)}:{d}:{amount_in}:{int(block_number)}"


def split_id(node_id: str) -> Tuple[str, str]:
    """('hook:8453:0xabc') -> ('hook', '8453:0xabc'). Un id sans prefixe connu
    renvoie ('', id) plutot que de lever : le graphe tolere l'inconnu, il ne le
    deguise pas."""
    if ":" not in node_id:
        return "", node_id
    prefix, rest = node_id.split(":", 1)
    return (prefix, rest) if prefix in PREFIX_TO_KIND else ("", node_id)


def chain_of(node_id: str) -> Optional[int]:
    """8453 pour 'hook:8453:0x..'. None pour un noeud sans chaine (code:0x..)."""
    prefix, rest = split_id(node_id)
    if not prefix:
        return None
    head = rest.split(":", 1)[0]
    try:
        return int(head)
    except ValueError:
        return None


def address_of(node_id: str) -> Optional[str]:
    """L'adresse portee par l'id, sans l'ordinal des fiches de registre."""
    prefix, rest = split_id(node_id)
    if not prefix:
        return None
    parts = rest.split(":")
    tail = parts[-1].split("#", 1)[0]
    return tail if tail.startswith("0x") else None


@dataclass(frozen=True)
class Node:
    id: str
    kind: str
    label: str
    attrs: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Edge:
    src: str
    dst: str
    kind: str
    evidence: Dict[str, Any] = field(default_factory=dict)
