#!/usr/bin/env python3
"""Pont entre l'API et le moteur TARE. N'implemente aucune mesure : il importe le moteur.

Deux modes :

  --plan-stdin   lit sur stdin un tableau JSON de plans et ecrit un tableau JSON de mesures
  (defaut)       une seule mesure decrite par les options de la ligne de commande

Le mode ligne de commande est celui qui apparait dans `replay.command_exact` de l'API :
il doit donc rester rejouable tel quel, a la main.

Une erreur RPC n'est jamais une valeur : elle sort etiquetee NOT_MEASURABLE avec sa raison.
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(REPO, "engine"))

from tare.poolid import PoolKey          # noqa: E402
from tare.measure import measure         # noqa: E402
from tare.rpc import call as rpc_call    # noqa: E402
from tare.stub import digest as stub_digest, size as stub_size  # noqa: E402


def _bool(v):
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in ("1", "true", "yes", "y", "on")


def run_one(rpc, block, plan):
    key = PoolKey(
        plan["currency0"], plan["currency1"],
        int(plan["fee"]), int(plan["tick_spacing"]), plan["hooks"],
    )
    zfo = _bool(plan["zero_for_one"])
    amount = int(plan["amount_in"])
    try:
        return measure(rpc, key, zfo, amount, int(block)).dict()
    except Exception as exc:                      # RPC mort, fork au mauvais bloc, etc.
        return {
            "hook": key.hooks.lower(),
            "pool_id": "0x" + key.pool_id().hex(),
            "chain_id": 8453,
            "block_number": int(block),
            "currency0": key.currency0, "currency1": key.currency1,
            "key_fee": key.fee, "tick_spacing": key.tick_spacing,
            "fee_is_dynamic": key.is_dynamic_fee,
            "stored_lp_fee": None, "stored_protocol_fee": None,
            "zero_for_one": zfo, "amount_in": str(amount),
            "out_with": None, "out_without": None, "bps": None,
            "label": "NOT_MEASURABLE",
            "reason": "engine_error:" + str(exc)[:200],
            "stub_hash": stub_digest(), "engine_ver": None, "observed_at": None,
        }


def check(rpc):
    """Le fork est-il joignable, et est-ce bien un anvil ? Aucune mesure ici.

    On interroge `anvil_nodeInfo` plutot que de tenter un `anvil_setCode` sonde :
    sur un fork, ecrire du code a une adresse jamais lue force anvil a aller
    chercher le compte en amont, et un RPC amont limite en debit fait echouer la
    sonde alors que le noeud, lui, va parfaitement bien.
    """
    out = {"rpc": rpc, "reachable": False, "chain_id": None, "block_number": None,
           "is_anvil": False, "fork": None, "stub_bytes": stub_size(),
           "stub_hash": stub_digest(), "error": None}
    try:
        out["chain_id"] = int(rpc_call(rpc, "eth_chainId", [], timeout=5), 16)
        out["block_number"] = int(rpc_call(rpc, "eth_blockNumber", [], timeout=5), 16)
        out["reachable"] = True
    except Exception as exc:
        out["error"] = str(exc)[:200]
        return out
    try:
        info = rpc_call(rpc, "anvil_nodeInfo", [], timeout=5) or {}
        out["is_anvil"] = True
        fork = info.get("forkConfig") or {}
        out["fork"] = {"block_number": fork.get("forkBlockNumber")}
    except Exception as exc:
        out["error"] = "not_anvil:" + str(exc)[:160]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rpc", required=True)
    ap.add_argument("--block", type=int, default=50614000)
    ap.add_argument("--plan-stdin", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--currency0")
    ap.add_argument("--currency1")
    ap.add_argument("--fee", type=int)
    ap.add_argument("--tick-spacing", type=int)
    ap.add_argument("--hooks")
    ap.add_argument("--zero-for-one", default="true")
    ap.add_argument("--amount-in", default="1000000000000000")
    a = ap.parse_args()

    if a.check:
        print(json.dumps(check(a.rpc)))
        return 0

    if a.plan_stdin:
        plans = json.loads(sys.stdin.read())
        print(json.dumps([run_one(a.rpc, a.block, p) for p in plans]))
        return 0

    missing = [n for n, v in (("--currency0", a.currency0), ("--currency1", a.currency1),
                              ("--fee", a.fee), ("--tick-spacing", a.tick_spacing),
                              ("--hooks", a.hooks)) if v is None]
    if missing:
        print("options manquantes : " + ", ".join(missing), file=sys.stderr)
        return 2

    plan = {"currency0": a.currency0, "currency1": a.currency1, "fee": a.fee,
            "tick_spacing": a.tick_spacing, "hooks": a.hooks,
            "zero_for_one": a.zero_for_one, "amount_in": a.amount_in}
    print(json.dumps(run_one(a.rpc, a.block, plan), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
