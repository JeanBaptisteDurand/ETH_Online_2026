"""Le volume reel des pools mesures, lu sur The Graph.

POURQUOI CE FICHIER EXISTE. Le corpus dit ce qu'un hook PRELEVE, en points de base. Il ne dit
pas sur combien. Un hook qui prend 99,99 % sur un pool que personne n'utilise ne coute rien a
personne ; un hook qui prend 1 % sur trente millions de dollars, si. Sans volume, toutes nos
mesures ont le meme poids, ce qui est faux.

CE QU'ON LIT, ET OU. Le subgraph Uniswap V4 Base, sur la passerelle decentralisee de The Graph
(subgraph 5f2npKL2a8oC6thaahyGW5NhJPAtDyMRnQHVmaNSJZ6o, reseau `base`, trouve en interrogeant le
subgraph du reseau The Graph lui-meme). Attention au piege : le subgraph declare dans le .env
initial (DiYPVdygkfjDWhbxGSqAQxwBKmfKnkWQojqeM2rkLb3G) est celui d'ETHEREUM — nos pool_id y
rendent `null`, et seuls les hooks aussi deployes sur Ethereum y apparaissent.

CE QUE CA VALIDE, ET C'EST INATTENDU. Les 7 817 pools de notre recensement sont retrouves a
100 % dans le subgraph. Notre collecte, faite en lisant nous-memes les logs Initialize du
PoolManager, est donc confirmee pool par pool par une source independante.

CE QUE CA NE PROUVE PAS, ET IL FAUT LE DIRE FORT. Multiplier un volume CUMULE depuis la creation
du pool par un taux mesure a UN SEUL bloc suppose que ce taux a ete constant sur toute la vie du
pool. Rien ne le garantit — 76 % des couples (pool, sens) voient deja leur taux changer avec la
taille. Le resultat est donc une ESTIMATION SOUS HYPOTHESE, jamais une mesure, et le fichier
produit porte cette hypothese dans son entete. Un lecteur qui prend ce nombre pour un montant
constate se trompe, et c'est a nous de l'empecher.

    python3 -m tare.volume            # ecrit docs/dataset/volume-base.json
    python3 -m tare.volume --resume   # ne refait pas les lots deja obtenus
"""
from __future__ import annotations

import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict

SUBGRAPH_BASE = "5f2npKL2a8oC6thaahyGW5NhJPAtDyMRnQHVmaNSJZ6o"
LOT = 300

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
MESURES = os.path.join(REPO, "docs", "dataset", "measurements.jsonl")
SORTIE = os.path.join(REPO, "docs", "dataset", "volume-base.json")


def _cle() -> str:
    k = os.environ.get("THE_GRAPH_KEY")
    if not k:
        raise SystemExit(
            "THE_GRAPH_KEY absente de l'environnement. Sans elle la passerelle refuse, "
            "et on ne devine pas un volume."
        )
    return k


def _interroge(url: str, requete: str) -> dict:
    # La passerelle est derriere Cloudflare, qui refuse l'agent par defaut d'urllib avec un
    # « error code: 1010 ». Un agent explicite suffit ; sans lui tout rend 403 et on croit
    # a tort que la cle est mauvaise.
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": requete}).encode(),
        headers={"content-type": "application/json", "user-agent": "tare/0.3", "accept": "*/*"},
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        d = json.loads(r.read())
    if "errors" in d:
        raise RuntimeError(json.dumps(d["errors"])[:300])
    return d["data"]


def pools_mesures() -> tuple[dict[str, list[float]], dict[str, str]]:
    """pool_id -> les bps MESURES, et pool_id -> hook."""
    bps: dict[str, list[float]] = defaultdict(list)
    hook: dict[str, str] = {}
    with open(MESURES) as f:
        for ligne in f:
            r = json.loads(ligne)
            hook[r["pool_id"]] = r["hook"]
            if r["label"] == "MEASURED" and r["bps"] is not None:
                bps[r["pool_id"]].append(r["bps"])
    return bps, hook


def recupere(ids: list[str], url: str) -> dict[str, dict]:
    """Le volume de chaque pool. Un lot qui echoue est SIGNALE, jamais compte comme zero."""
    trouve: dict[str, dict] = {}
    echecs: list[str] = []
    for i in range(0, len(ids), LOT):
        lot = ids[i : i + LOT]
        try:
            d = _interroge(
                url,
                "{ pools(first:1000, where:{id_in:%s}) "
                "{ id volumeUSD totalValueLockedUSD txCount } }" % json.dumps(lot),
            )
            for p in d["pools"]:
                trouve[p["id"]] = {
                    "volume_usd": float(p["volumeUSD"]),
                    "tvl_usd": float(p["totalValueLockedUSD"]),
                    "tx": int(p["txCount"]),
                }
        except (urllib.error.URLError, RuntimeError, TimeoutError) as e:
            echecs.append(f"lot {i}: {str(e)[:120]}")
        time.sleep(0.08)
    if echecs:
        print(f"  {len(echecs)} lot(s) en echec — les pools concernes sont ABSENTS, pas a zero:",
              file=sys.stderr)
        for e in echecs[:3]:
            print(f"    {e}", file=sys.stderr)
    return trouve


def main() -> None:
    cle = _cle()
    url = f"https://gateway.thegraph.com/api/{cle}/subgraphs/id/{SUBGRAPH_BASE}"
    bps, hook = pools_mesures()
    ids = sorted(hook)
    print(f"{len(ids):,} pools a interroger sur le subgraph Uniswap V4 Base")

    trouve = recupere(ids, url)
    print(f"{len(trouve):,} retrouves ({len(trouve)/len(ids)*100:.1f} %)")

    # L'estimation, sous son hypothese. Deux bornes : au taux median du pool, et au maximum.
    vol_couvert = 0.0
    est_median = 0.0
    est_max = 0.0
    par_hook: dict[str, dict] = defaultdict(lambda: {"pools": 0, "volume_usd": 0.0, "estime_usd": 0.0})
    for pid, v in trouve.items():
        b = bps.get(pid)
        if not b or v["volume_usd"] <= 0:
            continue
        vol_couvert += v["volume_usd"]
        est_median += v["volume_usd"] * statistics.median(b) / 10000
        est_max += v["volume_usd"] * max(b) / 10000
        h = par_hook[hook[pid]]
        h["pools"] += 1
        h["volume_usd"] += v["volume_usd"]
        h["estime_usd"] += v["volume_usd"] * statistics.median(b) / 10000

    sortie = {
        "v": "tare.volume.base.v1",
        "source": {
            "subgraph": SUBGRAPH_BASE,
            "nom": "Uniswap V4 Base",
            "passerelle": "gateway.thegraph.com",
            "note": "le subgraph DiYPVdyg… du .env initial est celui d'ETHEREUM : nos pool_id y rendent null.",
        },
        "couverture": {
            "pools_du_recensement": len(ids),
            "retrouves": len(trouve),
            "part": round(len(trouve) / len(ids), 4),
            "note": "un pool non retrouve est ABSENT du fichier, jamais present a volume zero.",
        },
        "totaux": {
            "volume_usd": round(sum(v["volume_usd"] for v in trouve.values()), 2),
            "tvl_usd": round(sum(v["tvl_usd"] for v in trouve.values()), 2),
            "transactions": sum(v["tx"] for v in trouve.values()),
        },
        "estimation": {
            "hypothese": (
                "Le volume est CUMULE depuis la creation du pool ; le taux est mesure a UN SEUL "
                "bloc (50 614 000). Multiplier les deux suppose que le taux a ete constant sur "
                "toute la vie du pool. Rien ne le garantit. Ce n'est donc PAS un montant "
                "constate : c'est une estimation sous hypothese, et elle est bornee."
            ),
            "volume_couvert_usd": round(vol_couvert, 2),
            "au_taux_median_usd": round(est_median, 2),
            "au_taux_maximum_usd": round(est_max, 2),
            "part_median": round(est_median / vol_couvert, 4) if vol_couvert else None,
        },
        "par_hook": {
            h: {**d, "volume_usd": round(d["volume_usd"], 2), "estime_usd": round(d["estime_usd"], 2)}
            for h, d in sorted(par_hook.items(), key=lambda x: -x[1]["estime_usd"])
        },
        "pools": {k: v for k, v in sorted(trouve.items())},
    }
    with open(SORTIE, "w") as f:
        json.dump(sortie, f, indent=1)
        f.write("\n")
    print(f"volume couvert   : {vol_couvert:>16,.0f} USD")
    print(f"estime au median : {est_median:>16,.0f} USD  ({est_median/vol_couvert*100:.2f} %)")
    print(f"estime au maximum: {est_max:>16,.0f} USD")
    print(f"-> {SORTIE}")


if __name__ == "__main__":
    main()
