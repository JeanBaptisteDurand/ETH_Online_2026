"""tare — command line.

    python3 -m tare.cli sweep    --rpc http://127.0.0.1:8545 [--limit N] [--restart]
    python3 -m tare.cli measure  --hook 0x... --rpc http://127.0.0.1:8545
    python3 -m tare.cli summary  [--in docs/dataset/measurements.jsonl]
    python3 -m tare.cli pools    [--hook 0x...]

Every printed number carries its block, its size and its direction, and every command prints the
one-liner that replays it. A value you cannot replay is a claim, not a measurement.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .sweep import (DEFAULT_OUT, DEFAULT_POOLS, DEFAULT_SUMMARY, SIZES, load_pools,
                    measure_resilient, probe_direction, read_done, read_jsonl, summarise,
                    sweep, write_summary)

BLOCK = 50614000


# ----------------------------------------------------------------------------- sweep

def cmd_sweep(a) -> int:
    pools = load_pools(a.pools)
    if a.hook:
        want = a.hook.lower()
        pools = [p for p in pools if p[0].hooks.lower() == want]
    # Deepest pools first: if the run is cut short, what is on disk is the part that matters.
    pools.sort(key=lambda p: -p[1])
    # Sharding by stride, not by slice, so every worker gets a mix of deep and shallow pools and
    # they all finish at roughly the same time. Appends are line-sized and O_APPEND, so several
    # shards can share one output file; `dedupe` absorbs any overlap.
    if a.of > 1:
        pools = [p for i, p in enumerate(pools) if i % a.of == a.shard]
    if a.limit:
        pools = pools[:a.limit]

    out = Path(a.out)
    already = read_done(out) if not a.restart else set()
    if a.restart and out.exists():
        out.unlink()

    print(f"sweep  {len(pools)} pools x {len(SIZES)} tailles  bloc {a.block}  -> {out}")
    print(f"       {len(already)} mesures deja presentes, elles ne seront pas refaites\n")

    stats = sweep(a.rpc, pools, a.block, out_path=out, sizes=SIZES,
                  resume=not a.restart, log=lambda s: print(s, flush=True))

    print(f"\n{stats['written']} mesures ecrites en {stats['seconds']}s "
          f"({stats['pools']} pools traites, {stats['pools_skipped']} deja faits, "
          f"{stats['errors']} erreurs)")
    for label, n in stats["by_label"].items():
        if n:
            print(f"  {label:<16} {n}")

    s = write_summary(out, a.summary, block=a.block)
    print(f"\nresume -> {a.summary}  "
          f"({s['n_measurements']} mesures, {s['n_pools']} pools, {s['n_hooks']} hooks, "
          f"{s['n_non_flat_profiles']} profils non plats)")
    print(f"rejouer : python3 -m tare.cli sweep --rpc {a.rpc} --block {a.block}")
    return 0


# ----------------------------------------------------------------------------- measure

def cmd_measure(a) -> int:
    """Every pool of one hook, at the five sizes, printed rather than stored."""
    pools = [p for p in load_pools(a.pools) if p[0].hooks.lower() == a.hook.lower()]
    if not pools:
        print(f"aucun pool liquide connu pour {a.hook} dans {a.pools}")
        return 1

    print(f"hook {a.hook}  bloc {a.block}  {len(pools)} pool(s)\n")
    print(f"{'pool':<20}{'sens':>6}{'lpFee':>8}" + "".join(f"{s:>12.0e}" for s in SIZES))

    for key, liquidity, _dyn in pools:
        zfo, _probe, infra = probe_direction(a.rpc, key)
        pid = "0x" + key.pool_id().hex()
        if zfo is None:
            # A node that would not answer is not a pool that would not quote.
            verdict = "le noeud n'a pas repondu (NOT_MEASURABLE)" if infra \
                else "aucun sens cotable (NOT_QUOTABLE)"
            print(f"{pid[:18]:<20}{'—':>6}{'—':>8}   {verdict}")
            continue
        cells, lp = [], None
        for size in SIZES:
            m = measure_resilient(a.rpc, key, zfo, size, a.block)
            lp = m.stored_lp_fee
            cells.append(f"{m.bps:12.2f}" if m.bps is not None
                         else f"{m.label.replace('NOT_', 'n/'):>12}")
        print(f"{pid[:18]:<20}{('0->1' if zfo else '1->0'):>6}{str(lp):>8}" + "".join(cells))

    print(f"\nrejouer : python3 -m tare.cli measure --hook {a.hook} "
          f"--rpc {a.rpc} --block {a.block}")
    return 0


# ----------------------------------------------------------------------------- summary

def cmd_summary(a) -> int:
    rows = read_jsonl(a.infile)
    if not rows:
        print(f"{a.infile} est vide — lance d'abord `python3 -m tare.cli sweep --rpc ...`")
        return 1
    s = summarise(rows, block=a.block)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(s, indent=1) + "\n")

    print(f"{s['n_measurements']} mesures  {s['n_pools']} pools  {s['n_hooks']} hooks  "
          f"bloc {s['block_number']}")
    for label, n in s["by_label"].items():
        print(f"  {label:<16} {n}")
    print(f"\nbps mesures : min {s['bps_min']}  mediane {s['bps_median']}  max {s['bps_max']}")
    print(f"> 1 bps avec stored_lp_fee == 0 : {s['n_gt_1bps_at_zero_stored_lp_fee']} mesures "
          f"sur {s['n_pools_gt_1bps_at_zero_stored_lp_fee']} pools "
          f"/ {s['n_hooks_gt_1bps_at_zero_stored_lp_fee']} hooks")
    print(f"\nprofils non plats (amplitude >= {s['non_flat_threshold_bps']} bps) : "
          f"{s['n_non_flat_profiles']}")
    for p in s["non_flat_profiles"][:15]:
        print(f"  {p['pool_id'][:18]}  hook {p['hook'][:12]}  "
              f"{p['bps_at_min_size']:8.2f} -> {p['bps_at_max_size']:8.2f}  "
              f"amplitude {p['amplitude_bps']:8.2f}")
    print(f"\necrit dans {a.out}")
    return 0


# ----------------------------------------------------------------------------- pools

def cmd_pools(a) -> int:
    pools = load_pools(a.pools)
    if a.hook:
        pools = [p for p in pools if p[0].hooks.lower() == a.hook.lower()]
    pools.sort(key=lambda p: -p[1])
    print(f"{len(pools)} pools liquides")
    for key, liq, dyn in pools[:a.limit or len(pools)]:
        print(f"  {'0x' + key.pool_id().hex()[:16]}  hook {key.hooks}  "
              f"fee {key.fee:>8}  ts {key.tick_spacing:>4}  "
              f"{'dyn' if dyn else '   '}  liq {liq}")
    return 0


# ----------------------------------------------------------------------------- entry

def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="tare", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p):
        p.add_argument("--rpc", default="http://127.0.0.1:8545")
        p.add_argument("--block", type=int, default=BLOCK)
        p.add_argument("--pools", default=str(DEFAULT_POOLS))

    s = sub.add_parser("sweep", help="mesurer tous les pools liquides, en JSONL reprenable")
    common(s)
    s.add_argument("--out", default=str(DEFAULT_OUT))
    s.add_argument("--summary", default=str(DEFAULT_SUMMARY))
    s.add_argument("--limit", type=int, default=0)
    s.add_argument("--hook", default=None)
    s.add_argument("--shard", type=int, default=0, help="index de ce worker (0-based)")
    s.add_argument("--of", type=int, default=1, help="nombre total de workers")
    s.add_argument("--restart", action="store_true", help="repartir de zero (efface la sortie)")
    s.set_defaults(fn=cmd_sweep)

    m = sub.add_parser("measure", help="les pools d'un hook, aux cinq tailles")
    common(m)
    m.add_argument("--hook", required=True)
    m.set_defaults(fn=cmd_measure)

    r = sub.add_parser("summary", help="recalculer docs/dataset/summary.json")
    r.add_argument("--in", dest="infile", default=str(DEFAULT_OUT))
    r.add_argument("--out", default=str(DEFAULT_SUMMARY))
    r.add_argument("--block", type=int, default=None)
    r.set_defaults(fn=cmd_summary)

    p = sub.add_parser("pools", help="lister les pools liquides connus")
    p.add_argument("--pools", default=str(DEFAULT_POOLS))
    p.add_argument("--hook", default=None)
    p.add_argument("--limit", type=int, default=0)
    p.set_defaults(fn=cmd_pools)
    return ap


def main(argv=None) -> int:
    a = build_parser().parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
