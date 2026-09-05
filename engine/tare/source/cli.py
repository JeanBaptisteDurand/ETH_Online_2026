"""python3 -m tare.source.cli {fetch|analyze|report} — LOT P end to end.

    # 1. pull the verified Solidity of every hook the corpus measured
    python3 -m tare.source.cli fetch

    # 2. read each hook's own declared rate on chain at the pinned block and compare
    python3 -m tare.source.cli analyze --rpc "$BASE_RPC_URL"

    # 3. write docs/hooks-source/ANALYSIS.md from that JSON
    python3 -m tare.source.cli report

Step 2 is the only one that needs a network key, and it is idempotent: every eth_call it makes is
cached in docs/hooks-source/_calls-cache.json, so a rerun is free and a rate limit costs one call.
"""
import argparse
import hashlib
import json
import os
import sys

from . import classify as classify_mod
from . import fetch as fetch_mod
from . import profiles as prof_mod
from . import report as report_mod

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DEFAULT_SOURCES = os.path.join(REPO, "docs", "hooks-source")
DEFAULT_MEASUREMENTS = os.path.join(REPO, "docs", "dataset", "measurements.jsonl")
DEFAULT_REGISTRY = os.path.join(REPO, "docs", "hooklist-live-20260905.json")
DEFAULT_BLOCK = 50_614_000
CHAIN_ID = 8453


def measured_hooks(path: str) -> list:
    seen = []
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            hook = json.loads(line)["hook"].lower()
            if hook not in seen:
                seen.append(hook)
    return sorted(seen)


def registry_names(path: str, chain_id: int = CHAIN_ID) -> dict:
    """address -> name, restricted to this chain's entry (false result #6 in HONESTY.md)."""
    if not os.path.exists(path):
        return {}
    with open(path) as fh:
        entries = json.load(fh)
    out = {}
    for entry in entries:
        hook = entry.get("hook", {})
        if hook.get("chainId") != chain_id:
            continue
        out[hook["address"].lower()] = hook.get("name")
    return out


def cmd_fetch(args):
    hooks = [h.lower() for h in args.hooks.split(",")] if args.hooks else measured_hooks(args.measurements)
    os.makedirs(args.out, exist_ok=True)
    found = 0
    for hook in hooks:
        prov = fetch_mod.fetch_hook(hook, args.out, chain_id=args.chain_id,
                                    timeout=args.timeout, allow_etherscan=not args.no_fallback)
        status = prov["source_status"]
        if status == fetch_mod.FOUND:
            found += 1
        print(f"{hook}  {status:<16} files={prov['file_count']:<4} own={prov['own_file_count']:<3} "
              f"bytes={prov['total_bytes']:<8} match={prov.get('match')}")
    print(f"\n{found} sur {len(hooks)} hooks ont un source verifie recupere.")
    return 0 if found or not hooks else 1


def cmd_analyze(args):
    rows_by_hook = classify_mod.load_measurements(args.measurements)
    names = registry_names(args.registry, args.chain_id)
    chain = None
    if args.rpc:
        from .declared import Chain
        chain = Chain(args.rpc, args.block, pace_s=args.pace,
                      cache_path=os.path.join(args.out, "_calls-cache.json"))
    records = []
    for hook in sorted(rows_by_hook):
        rec = classify_mod.classify_hook(hook, rows_by_hook[hook], args.out, chain=chain,
                                         registry_name=names.get(hook))
        records.append(rec)
        conc = (rec.get("concordance") or {}).get("label", "-")
        print(f"{hook}  read={str(rec['read']):<5} {rec.get('classification') or UNREAD_PAD:<20} "
              f"concordance={conc}")
        if chain:
            chain.save()
    if chain:
        chain.save()
    # The corpus is a moving file while the sweep is still running, so pin exactly which bytes
    # this analysis was computed from. A report that cannot name its input is a report that cannot
    # be checked.
    with open(args.measurements, "rb") as fh:
        corpus = fh.read()
    out = {
        "generated_by": "tare.source.cli analyze",
        "chain_id": args.chain_id,
        "block_number": args.block,
        "measurements": os.path.relpath(args.measurements, REPO),
        "measurements_sha256": hashlib.sha256(corpus).hexdigest(),
        "measurements_rows": corpus.count(b"\n"),
        "measurements_bytes": len(corpus),
        "tolerance_bps": classify_mod.TOL_BPS,
        "quantization_fraction": classify_mod.QUANT_FRACTION,
        "saturation_elasticity": classify_mod.SATURATION_ELASTICITY,
        "hooks": records,
    }
    path = args.json or os.path.join(args.out, "analysis.json")
    with open(path, "w") as fh:
        json.dump(out, fh, indent=2, sort_keys=False)
        fh.write("\n")
    print(f"\n-> {path}")
    return 0


UNREAD_PAD = "(non lu)"


def cmd_report(args):
    path = args.json or os.path.join(args.out, "analysis.json")
    with open(path) as fh:
        analysis = json.load(fh)
    md = report_mod.render(analysis)
    dest = args.md or os.path.join(args.out, "ANALYSIS.md")
    with open(dest, "w") as fh:
        fh.write(md)
    print(f"-> {dest}  ({len(md)} bytes)")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="tare.source.cli", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=DEFAULT_SOURCES, help="docs/hooks-source")
    ap.add_argument("--measurements", default=DEFAULT_MEASUREMENTS)
    ap.add_argument("--registry", default=DEFAULT_REGISTRY)
    ap.add_argument("--chain-id", type=int, default=CHAIN_ID)
    sub = ap.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("fetch", help="pull verified Solidity into docs/hooks-source/")
    f.add_argument("--hooks", help="comma-separated addresses; default: every hook in the corpus")
    f.add_argument("--timeout", type=int, default=90)
    f.add_argument("--no-fallback", action="store_true", help="Sourcify only")
    f.set_defaults(func=cmd_fetch)

    a = sub.add_parser("analyze", help="read declared rates on chain and compare to the corpus")
    a.add_argument("--rpc", default=os.environ.get("BASE_RPC_URL"))
    a.add_argument("--block", type=int, default=DEFAULT_BLOCK)
    a.add_argument("--pace", type=float, default=0.35)
    a.add_argument("--json", help="output path (default docs/hooks-source/analysis.json)")
    a.set_defaults(func=cmd_analyze)

    r = sub.add_parser("report", help="render ANALYSIS.md from analysis.json")
    r.add_argument("--json")
    r.add_argument("--md")
    r.set_defaults(func=cmd_report)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
