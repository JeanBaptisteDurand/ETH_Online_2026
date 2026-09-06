"""Publier on-chain la quantite que le registre ne sait pas porter.

Le registre officiel decrit un hook avec quatorze booleens de permission, quatre booleens de
propriete, un enum et un chainId. Aucun de ces champs n'est une quantite. Deux hooks qu'il
decrit a l'identique peuvent prendre zero et onze pour cent.

TARE mesure cette quantite hors chaine — un contrefactuel exige un fork, ce n'est pas
negociable. Mais son RESULTAT peut vivre sur une chaine, la ou un routeur, un portefeuille ou
un autre contrat peut le lire. C'est ce que fait ce module : il calcule, par hook, ce que le
corpus PUBLIE contient, et l'ecrit dans HookRateAttestations.

Trois refus, qui sont la raison d'etre du contrat autant que de ce script :
  - un hook sans aucune ligne MEASURED n'est pas ecrit. Pas a zero, pas du tout. Le contrat
    le refuserait de toute facon ; on ne lui envoie meme pas la transaction, et on dit
    combien de hooks ont ete ecartes pour cette raison ;
  - l'empreinte du corpus accompagne chaque figure, pour qu'on puisse rejouer la ligne exacte
    qui l'a produite ;
  - l'empreinte du talon accompagne l'empreinte du corpus, parce qu'un nombre sans sa methode
    est une opinion.

    python3 -m tare.attest --plan            # ce qui serait ecrit, sans rien envoyer
    python3 -m tare.attest --send --limit 5  # ecrire pour de vrai
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import statistics
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional

REPO = Path(__file__).resolve().parents[2]
CORPUS = REPO / "docs" / "dataset" / "measurements.jsonl"
EXTRA = REPO / "docs" / "dataset" / "measurements-contestes.jsonl"
BPS_SCALE = 10_000
DEFAULT_RPC = "https://testnet.hashio.io/api"


def corpus_digest(paths: List[Path]) -> str:
    """sha256 des fichiers publies, dans l'ordre, comme un seul flux."""
    h = hashlib.sha256()
    for p in paths:
        with open(p, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
    return "0x" + h.hexdigest()


def profiles(paths: List[Path]) -> Dict[str, Dict[str, Any]]:
    """Par hook : ce que le corpus contient, sans rien completer."""
    par: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {"bps": [], "pools": set(), "n_unmeasurable": 0, "block": None,
                 "chain": None, "stub": None, "engine": None})
    for p in paths:
        if not p.exists():
            continue
        with open(p) as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                d = par[r["hook"].lower()]
                d["pools"].add(r["pool_id"])
                d["block"] = d["block"] or r["block_number"]
                d["chain"] = d["chain"] or r["chain_id"]
                d["stub"] = d["stub"] or r.get("stub_hash")
                d["engine"] = d["engine"] or r.get("engine_ver")
                if r["label"] == "MEASURED" and r["bps"] is not None:
                    d["bps"].append(r["bps"])
                else:
                    d["n_unmeasurable"] += 1
    return par


def plan(paths: List[Path]) -> Dict[str, Any]:
    par = profiles(paths)
    ecrits, ecartes = [], []
    for hook, d in sorted(par.items()):
        if not d["bps"]:
            # AUCUNE mesure aboutie. On ne l'ecrit pas — ni a zero, ni du tout.
            ecartes.append({"hook": hook, "raison": "aucune ligne MEASURED",
                            "n_tentees": d["n_unmeasurable"]})
            continue
        med = statistics.median(d["bps"])
        mx = max(d["bps"])
        ecrits.append({
            "hook": hook,
            "measuredChainId": d["chain"],
            "blockNumber": d["block"],
            "medianBpsScaled": int(round(med * BPS_SCALE)),
            "maxBpsScaled": int(round(mx * BPS_SCALE)),
            "median_bps": round(med, 4),
            "max_bps": round(mx, 4),
            "nMeasured": len(d["bps"]),
            "nUnmeasurable": d["n_unmeasurable"],
            "nPools": len(d["pools"]),
            "stubHash": d["stub"],
            "engineVersion": d["engine"] or "tare-engine/unknown",
        })
    ecrits.sort(key=lambda x: -x["maxBpsScaled"])
    return {
        "corpus": [str(p.relative_to(REPO)) for p in paths if p.exists()],
        "corpusDigest": corpus_digest([p for p in paths if p.exists()]),
        "a_ecrire": ecrits,
        "ecartes_faute_de_mesure": ecartes,
        "n_a_ecrire": len(ecrits),
        "n_ecartes": len(ecartes),
    }


def send(entry: Dict[str, Any], digest: str, contract: str, rpc: str, key: str) -> Dict[str, Any]:
    cmd = [
        "cast", "send", contract,
        "attest(address,uint32,uint64,uint64,uint64,uint32,uint32,uint32,bytes32,bytes32,string)",
        entry["hook"], str(entry["measuredChainId"]), str(entry["blockNumber"]),
        str(entry["medianBpsScaled"]), str(entry["maxBpsScaled"]),
        str(entry["nMeasured"]), str(entry["nUnmeasurable"]), str(entry["nPools"]),
        digest, entry["stubHash"], entry["engineVersion"],
        "--rpc-url", rpc, "--private-key", key, "--json",
    ]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if p.returncode != 0:
        return {"hook": entry["hook"], "ok": False, "erreur": p.stderr.strip()[:300]}
    try:
        r = json.loads(p.stdout)
    except json.JSONDecodeError:
        return {"hook": entry["hook"], "ok": False, "erreur": p.stdout.strip()[:300]}
    return {"hook": entry["hook"], "ok": r.get("status") in ("0x1", 1, "success"),
            "tx": r.get("transactionHash"), "gas": r.get("gasUsed")}


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="tare.attest")
    ap.add_argument("--plan", action="store_true", help="montrer sans rien envoyer")
    ap.add_argument("--send", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--contract", default=os.environ.get("TARE_ATTESTATIONS"))
    ap.add_argument("--rpc", default=os.environ.get("HEDERA_EVM_RPC", DEFAULT_RPC))
    ap.add_argument("--out", type=Path, default=REPO / "docs" / "dataset" / "attestations.json")
    a = ap.parse_args(argv)

    p = plan([CORPUS, EXTRA])
    print(f"corpus : {', '.join(p['corpus'])}", file=sys.stderr)
    print(f"empreinte : {p['corpusDigest']}", file=sys.stderr)
    print(f"a ecrire : {p['n_a_ecrire']} hooks   ecartes faute de mesure : {p['n_ecartes']}",
          file=sys.stderr)

    if not a.send:
        print(json.dumps({**p, "a_ecrire": p["a_ecrire"][: a.limit or 10]}, indent=1))
        return 0

    key = os.environ.get("HEDERA_PAYER_PRIVATE_KEY")
    if not key or not a.contract:
        print("HEDERA_PAYER_PRIVATE_KEY et --contract (ou TARE_ATTESTATIONS) requis",
              file=sys.stderr)
        return 2
    if not key.startswith("0x"):
        key = "0x" + key

    envoyes = []
    cibles = p["a_ecrire"][: a.limit] if a.limit else p["a_ecrire"]
    for i, e in enumerate(cibles, 1):
        r = send(e, p["corpusDigest"], a.contract, a.rpc, key)
        envoyes.append({**r, "median_bps": e["median_bps"], "max_bps": e["max_bps"]})
        etat = "OK" if r["ok"] else "ECHEC"
        print(f"  [{i}/{len(cibles)}] {e['hook'][:14]}..  {e['max_bps']:>9} bps max  {etat}"
              f"  {r.get('tx') or r.get('erreur','')[:80]}", file=sys.stderr)

    out = {**p, "contract": a.contract, "rpc": a.rpc, "envoyes": envoyes,
           "n_envoyes": sum(1 for x in envoyes if x["ok"])}
    a.out.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    print(f"ecrit {a.out}", file=sys.stderr)
    return 0 if all(x["ok"] for x in envoyes) else 1


if __name__ == "__main__":
    raise SystemExit(main())
