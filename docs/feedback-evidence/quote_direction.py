"""Combien de pools v4 le V4Quoter cote-t-il dans UN SEUL sens ?

Chaque pool du corpus est sonde dans les deux sens, aux cinq tailles du sweep, au bloc epingle.
Un pool compte comme cotable dans un sens des qu'UNE des cinq tailles renvoie un montant non nul.

    python3 docs/feedback-evidence/quote_direction.py            # les 199 pools
    python3 docs/feedback-evidence/quote_direction.py 40         # les 40 plus profonds

LECTURE SEULE. Uniquement des `eth_call` au bloc epingle, adresses directement a l'archive Base.
Aucun `anvil_setCode`, aucun etat ecrit, aucun anvil touche : ce script peut tourner pendant qu'un
sweep mesure ailleurs (regle : un seul mesureur par fork, mais autant de lecteurs qu'on veut).

REGLE 3. Une erreur d'infrastructure ne devient jamais "ce pool ne cote pas". Le pool est compte
`indetermine_infra` et le fichier de sortie le porte. Le corps de la reponse RPC est lu en entier :
`NotEnoughLiquidity` (0x7a5ed734) vit a l'octet 69 de la donnee de revert, enveloppe dans
`UnexpectedRevertBytes` (0x6190b2b0), et toute lecture bornee avant cet offset detruit la detection.
"""
import json
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "engine"))

from tare.consts import V4_QUOTER                      # noqa: E402
from tare.poolid import PoolKey                        # noqa: E402
from tare.quote import NOT_ENOUGH_LIQUIDITY, encode    # noqa: E402

BLOCK = 50614000
SIZES = [10**14, 10**15, 10**16, 10**17, 10**18]
POOLS = REPO / "docs" / "pools-liquides.json"
OUT = Path(__file__).with_name("quote-direction.json")


def rpc_url() -> str:
    for line in (REPO / ".env").read_text().splitlines():
        if line.startswith("BASE_RPC_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("BASE_RPC_URL absent de .env")


def eth_call(url: str, to: str, data: str):
    """(resultat, erreur_pool, erreur_infra) — le corps est lu en entier, jamais tronque."""
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_call",
                          "params": [{"to": to, "data": data}, hex(BLOCK)]})
    proc = subprocess.run(
        ["curl", "-s", "-m", "45", "-X", "POST",
         "-H", "Content-Type: application/json", "-d", payload, url],
        capture_output=True, text=True, timeout=60)
    if not proc.stdout:
        return None, None, "reponse vide"
    body = json.loads(proc.stdout)
    if "error" in body:
        msg = json.dumps(body["error"])
        if NOT_ENOUGH_LIQUIDITY in msg or "6190b2b0" in msg or "revert" in msg.lower():
            return None, msg, None            # le pool a dit non
        return None, None, msg                # le noeud a dit non
    return body.get("result"), None, None


def call_with_retry(url: str, data: str, attempts: int = 6):
    """Un echec du noeud est reessaye ; un refus du pool est une reponse, pas une panne."""
    infra = None
    for i in range(attempts):
        raw, pool_err, infra = eth_call(url, V4_QUOTER, data)
        if infra is None:
            return raw, pool_err, None
        time.sleep(2.5 * (i + 1))
    return None, None, infra


def quotable(url: str, key: PoolKey, zero_for_one: bool):
    """True/False si on a pu conclure, None si l'infrastructure a echoue."""
    for size in SIZES:
        raw, _pool_err, infra = call_with_retry(url, encode(key, zero_for_one, size))
        if infra:
            return None
        if raw and len(raw) >= 66 and int(raw[2:66], 16) > 0:
            return True
        time.sleep(0.05)
    return False


def main() -> int:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    url = rpc_url()
    pools = json.loads(POOLS.read_text())
    pools.sort(key=lambda e: -int(e[2]))
    if n:
        pools = pools[:n]

    both = one = none = undetermined = 0
    for entry in pools:
        c0, c1, fee, spacing, hook = entry[1]
        key = PoolKey(c0, c1, int(fee), int(spacing), hook)
        verdicts = []
        for zfo in (True, False):
            v = quotable(url, key, zfo)
            if v is None:
                verdicts = None
                break
            verdicts.append(v)
        if verdicts is None:
            undetermined += 1
            continue
        hits = sum(verdicts)
        both += hits == 2
        one += hits == 1
        none += hits == 0

    result = {
        "_what": "sens de cotation disponibles par pool, V4Quoter.quoteExactInputSingle",
        "_replay": f"python3 docs/feedback-evidence/quote_direction.py {n or ''}".strip(),
        "_source_pools": "docs/pools-liquides.json",
        "quoter": V4_QUOTER,
        "chain_id": 8453,
        "block_number": BLOCK,
        "sizes_wei": [str(s) for s in SIZES],
        "pools_testes": len(pools),
        "cotent_dans_les_deux_sens": both,
        "cotent_dans_un_seul_sens": one,
        "ne_cotent_dans_aucun_sens": none,
        "indetermine_infra": undetermined,
        "pct_un_seul_sens": round(one / len(pools) * 100, 1) if pools else None,
    }
    OUT.write_text(json.dumps(result, indent=1) + "\n")
    print(json.dumps(result, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
