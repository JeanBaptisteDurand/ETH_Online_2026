"""Ce que la chaine ajoute au graphe : le bytecode et le deployeur.

Deux faits que ni measurements.jsonl ni hooklist.json ne contiennent, et sans
lesquels twins() et deployer_cluster() n'ont rien a chercher :

  * le bytecode d'execution du hook, lu par eth_getCode au bloc epingle, reduit
    a son keccak-256 — c'est l'identite du code. Deux hooks au meme keccak sont
    le meme contrat deploye deux fois.
  * la transaction de creation, lue chez le mirror Blockscout (l'API publique
    de Base), qui donne le createur (l'EOA qui a signe) et la fabrique (le
    contrat CREATE2 qui a pose le code). Le RPC seul ne peut pas repondre :
    trace_block est derriere l'offre payante d'Alchemy, et un deploiement
    CREATE2 depuis une fabrique ne laisse ni tx `to: null` ni receipt.contractAddress.

REGLE 3, appliquee ici sans exception. Un appel qui timeout, une reponse vide,
un 429 : cela ne produit PAS un bytecode vide, PAS un deployeur nul, PAS un
zero. Cela produit le statut UNAVAILABLE avec sa raison, et le noeud Bytecode
n'est simplement pas cree. Un hook sans bytecode connu ne sera jamais compte
comme "hook sans clone" : il sera compte comme hook non lu.

Le resultat est mis en cache sur disque (data/chain-cache.json). La construction
du graphe est alors reproductible hors ligne, et `make test` ne depend d'aucun
reseau.
"""
from __future__ import annotations

import json
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional

from ..keccak import keccak256
from ..rpc import RpcError, call as rpc_call, get_code

DATA_DIR = Path(__file__).resolve().parent / "data"
DEFAULT_CACHE = DATA_DIR / "chain-cache.json"

# L'API publique de Blockscout pour Base. Pas de cle, pas de compte.
# On utilise /api/v2/addresses/<addr>, qui donne la TX de creation. Le formulaire
# v1 ?action=getcontractcreation existe aussi et donne directement le createur,
# mais il est limite a une poignee d'appels par heure et repond alors HTTP 200
# avec status=0 — un piege a faux negatifs (voir _mirror_address).
DEFAULT_MIRROR = "https://base.blockscout.com/api/v2"

STATUS_CODE = "CODE"              # le noeud a repondu, il y a du bytecode
STATUS_ABSENT = "ABSENT"          # le noeud a repondu, il n'y a rien a cette adresse
STATUS_UNAVAILABLE = "UNAVAILABLE"  # le noeud n'a pas repondu — on ne sait pas

# Blockscout accepte plusieurs adresses par appel ; au-dela il tronque en silence.
CODE_RETRIES = 4      # un rate-limit RPC n'est pas une adresse vide
CODE_BACKOFF = 1.5    # s, multiplie a chaque tentative
MIRROR_PAUSE = 0.12   # s entre deux appels : l'API publique limite le debit
MIRROR_RETRIES = 3    # un 429 n'est pas une reponse, c'est un refus de repondre
MIRROR_BACKOFF = 2.0  # s, multiplie a chaque tentative


def code_hash(code_hex: str) -> str:
    """keccak-256 du bytecode d'execution, verifiable a la main :
        cast keccak $(cast code <addr> --rpc-url $RPC --block <n>)"""
    raw = code_hex[2:] if code_hex.startswith("0x") else code_hex
    return "0x" + keccak256(bytes.fromhex(raw)).hex()


# ------------------------------------------------------------------ bytecode

def _get_code_retry(rpc_url: str, addr: str, block_hex: str, retries: int = CODE_RETRIES) -> str:
    """eth_getCode, avec reprise. Un 429 ou un timeout n'est PAS "0x" : c'est
    une absence de reponse, et elle doit remonter en exception pour finir en
    UNAVAILABLE plutot qu'en "adresse vide"."""
    last = None
    for attempt in range(retries):
        try:
            return get_code(rpc_url, addr, block_hex)
        except (RpcError, ValueError, OSError, subprocess.SubprocessError) as exc:
            last = exc
            time.sleep(CODE_BACKOFF * (attempt + 1))
    raise RpcError(str(last))


def fetch_code_one(rpc_url: str, addr: str, block: int, timeout: int = 30) -> Dict[str, Any]:
    """Un eth_getCode au bloc epingle. Si l'adresse est vide a ce bloc, on
    redemande au dernier bloc : le registre liste des hooks deployes APRES le
    bloc de la campagne, et les oublier serait une lacune, pas une prudence.
    Le bloc effectivement lu est toujours reporte."""
    try:
        code = _get_code_retry(rpc_url, addr, hex(int(block)))
    except (RpcError, ValueError, OSError, subprocess.SubprocessError) as exc:
        return {"status": STATUS_UNAVAILABLE, "reason": f"eth_getCode: {exc}"[:200]}
    if code and code not in ("0x", "0x0"):
        return {"status": STATUS_CODE, "code_block": int(block),
                "code_size": (len(code) - 2) // 2, "code_hash": code_hash(code)}
    # Vide au bloc epingle : deuxieme chance au dernier bloc.
    try:
        head = int(rpc_call(rpc_url, "eth_blockNumber", [], timeout=timeout), 16)
        code = _get_code_retry(rpc_url, addr, hex(head))
    except (RpcError, ValueError, TypeError, OSError, subprocess.SubprocessError) as exc:
        return {"status": STATUS_UNAVAILABLE, "reason": f"eth_getCode@latest: {exc}"[:200]}
    if code and code not in ("0x", "0x0"):
        return {"status": STATUS_CODE, "code_block": head, "code_size": (len(code) - 2) // 2,
                "code_hash": code_hash(code), "after_pinned_block": True}
    return {"status": STATUS_ABSENT, "code_block": head,
            "reason": f"aucun code a cette adresse au bloc {block} ni au bloc {head}"}


def fetch_codes(rpc_url: str, addrs: Iterable[str], block: int, threads: int = 6,
                log: Optional[Callable[[str], None]] = None) -> Dict[str, Dict[str, Any]]:
    addrs = list(dict.fromkeys(a.lower() for a in addrs))
    out: Dict[str, Dict[str, Any]] = {}
    done = [0]

    def one(a: str):
        r = fetch_code_one(rpc_url, a, block)
        done[0] += 1
        if log and done[0] % 20 == 0:
            log(f"  eth_getCode {done[0]}/{len(addrs)}")
        return a, r

    with ThreadPoolExecutor(max(1, threads)) as ex:
        for a, r in ex.map(one, addrs):
            out[a] = r
    return out


# ------------------------------------------------------------------ creation

def _http_get_json(url: str, timeout: int = 25) -> Any:
    proc = subprocess.run(["curl", "-s", "-m", str(timeout), "-H", "Accept: application/json", url],
                          capture_output=True, text=True, timeout=timeout + 10)
    if not proc.stdout:
        raise RpcError(f"reponse vide de {url.split('?')[0]}")
    return json.loads(proc.stdout)  # corps entier, jamais tronque


def _mirror_address(mirror: str, addr: str) -> Dict[str, Any]:
    """La fiche d'une adresse chez le mirror. Leve RpcError sur tout ce qui
    n'est pas une reponse.

    C'est le piege qui a deja produit cinq faux resultats dans ce projet : le
    mirror repond HTTP 200 avec {"message": "Too many requests"} et rien
    d'autre. Lu naivement, l'absence de createur dans ce corps devient "ce
    contrat n'a pas de createur connu", et 142 adresses sur 160 sortent
    faussement bredouilles. Un corps sans la cle `hash` n'est donc pas une
    reponse : c'est un refus, et il remonte en exception.
    """
    body = _http_get_json(f"{mirror}/addresses/{addr}")
    if not isinstance(body, dict) or "hash" not in body:
        msg = body.get("message") if isinstance(body, dict) else str(body)[:120]
        raise RpcError(f"mirror n'a pas repondu pour {addr}: {msg!r}")
    return body


def fetch_creation(addrs: Iterable[str], mirror: str = DEFAULT_MIRROR,
                   rpc_url: Optional[str] = None,
                   log: Optional[Callable[[str], None]] = None,
                   retries: int = MIRROR_RETRIES) -> Dict[str, Dict[str, Any]]:
    """Createur, fabrique et bloc de creation.

    Le mirror ne sert qu'a une chose : donner le HASH de la transaction de
    creation, que le RPC ne sait pas retrouver (trace_block est payant, et un
    deploiement CREATE2 depuis une fabrique ne laisse ni tx `to: null` ni
    receipt.contractAddress). Le createur lui-meme est ensuite lu par
    eth_getTransactionByHash : `from` est l'EOA qui a signe, `to` la fabrique
    qui a pose le code. Sans rpc_url on se rabat sur creator_address_hash, qui
    est le createur IMMEDIAT — souvent la fabrique, pas l'EOA — et la source
    l'annonce (`blockscout:immediate`).

    Trois issues, jamais confondues :
      * tx de creation trouvee et lue          -> CODE
      * le mirror repond, il ne la connait pas -> ABSENT
      * le mirror ou le RPC n'a pas repondu    -> UNAVAILABLE
    """
    addrs = list(dict.fromkeys(a.lower() for a in addrs))
    out: Dict[str, Dict[str, Any]] = {}
    for i, addr in enumerate(addrs, 1):
        body, err = None, None
        for attempt in range(retries):
            try:
                body = _mirror_address(mirror, addr)
                break
            except (RpcError, ValueError, OSError, subprocess.SubprocessError) as exc:
                err = str(exc)[:200]
                time.sleep(MIRROR_BACKOFF * (attempt + 1))
        if body is None:
            out[addr] = {"status": STATUS_UNAVAILABLE, "source": "blockscout",
                         "reason": f"le mirror n'a pas repondu apres {retries} tentatives: {err}"}
            if log:
                log(f"  mirror {i}/{len(addrs)} UNAVAILABLE ({err})")
            time.sleep(MIRROR_PAUSE)
            continue

        tx_hash = body.get("creation_transaction_hash")
        immediate = (body.get("creator_address_hash") or "").lower() or None
        rec: Dict[str, Any] = {"creation_tx": tx_hash, "immediate_creator": immediate,
                               "source": "blockscout"}
        if not tx_hash:
            rec.update({"status": STATUS_ABSENT,
                        "reason": "le mirror ne connait pas la tx de creation de ce contrat"})
            if immediate:
                rec.update({"status": STATUS_CODE, "creator": immediate,
                            "source": "blockscout:immediate",
                            "reason": "createur immediat du mirror, non confirme par la tx"})
        elif rpc_url:
            try:
                tx = rpc_call(rpc_url, "eth_getTransactionByHash", [tx_hash])
                if not isinstance(tx, dict) or not tx.get("from"):
                    raise RpcError(f"tx {tx_hash} introuvable au RPC")
                rec.update({
                    "status": STATUS_CODE,
                    "creator": tx["from"].lower(),
                    "factory": (tx.get("to") or "").lower() or None,
                    "creation_block": int(tx["blockNumber"], 16) if tx.get("blockNumber") else None,
                    "source": "blockscout+eth_getTransactionByHash",
                })
            except (RpcError, ValueError, TypeError, OSError, subprocess.SubprocessError) as exc:
                rec.update({"status": STATUS_UNAVAILABLE,
                            "reason": f"tx de creation connue mais illisible: {exc}"[:200]})
        else:
            rec.update({"status": STATUS_CODE if immediate else STATUS_ABSENT,
                        "creator": immediate, "source": "blockscout:immediate",
                        "reason": "createur immediat du mirror (souvent la fabrique CREATE2)"})
        out[addr] = rec
        if log and i % 20 == 0:
            log(f"  mirror {i}/{len(addrs)}")
        time.sleep(MIRROR_PAUSE)
    return out


# ------------------------------------------------------------------ cache

def enrich(rpc_url: str, addrs: Iterable[str], block: int, chain_id: int = 8453,
           mirror: str = DEFAULT_MIRROR, threads: int = 6,
           previous: Optional[Dict[str, Any]] = None,
           log: Optional[Callable[[str], None]] = None) -> Dict[str, Any]:
    """Lit la chaine pour `addrs`, en reprenant un cache precedent.

    Une entree deja resolue (CODE ou ABSENT — le noeud a repondu) n'est pas
    re-interrogee. Une entree UNAVAILABLE l'est : elle n'a jamais eu de reponse,
    et la garder en l'etat serait transformer un rate-limit en fait etabli.
    """
    addrs = sorted(dict.fromkeys(a.lower() for a in addrs))
    kept = (previous or {}).get("entries") or {}
    need_code = [a for a in addrs
                 if (kept.get(a, {}).get("code") or {}).get("status") not in (STATUS_CODE, STATUS_ABSENT)]
    need_creation = [a for a in addrs
                     if (kept.get(a, {}).get("creation") or {}).get("status") not in (STATUS_CODE, STATUS_ABSENT)]
    if log:
        log(f"eth_getCode sur {len(need_code)}/{len(addrs)} adresses, bloc {block}"
            + (f" ({len(addrs) - len(need_code)} deja resolues)" if kept else ""))
    codes = fetch_codes(rpc_url, need_code, block, threads=threads, log=log) if need_code else {}
    if log:
        log(f"tx de creation sur {len(need_creation)}/{len(addrs)} adresses, mirror {mirror}")
    creations = fetch_creation(need_creation, mirror=mirror, rpc_url=rpc_url, log=log) if need_creation else {}

    entries: Dict[str, Any] = {}
    for a in addrs:
        prev = kept.get(a, {})
        entries[a] = {
            "address": a,
            "code": codes.get(a) or prev.get("code") or {"status": STATUS_UNAVAILABLE,
                                                         "reason": "non interroge"},
            "creation": creations.get(a) or prev.get("creation") or {"status": STATUS_UNAVAILABLE,
                                                                     "reason": "non interroge"},
        }
    n_code = sum(1 for e in entries.values() if e["code"]["status"] == STATUS_CODE)
    n_creator = sum(1 for e in entries.values() if e["creation"].get("creator"))
    n_unavail = sum(1 for e in entries.values() if e["code"]["status"] == STATUS_UNAVAILABLE)
    return {
        "chain_id": chain_id,
        "block_number": int(block),
        "mirror": mirror,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
        "n_addresses": len(addrs),
        "n_with_code": n_code,
        "n_with_creator": n_creator,
        "n_code_unavailable": n_unavail,
        "entries": entries,
    }


def write_cache(cache: Dict[str, Any], path: Path = DEFAULT_CACHE) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache, indent=1, sort_keys=True) + "\n")
    return path


def load_cache(path: Path = DEFAULT_CACHE) -> Dict[str, Any]:
    """Un cache absent n'est pas une erreur : le graphe se construit sans les
    noeuds Bytecode et Deployer, et le dit dans ses meta."""
    path = Path(path)
    if not path.exists():
        return {"entries": {}, "missing": True, "path": str(path)}
    return json.loads(path.read_text())
