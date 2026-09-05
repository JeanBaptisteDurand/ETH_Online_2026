"""The sweep — turning one measurement into coverage.

Four facts about the fork drive every design decision in this file.

1. **A pool usually quotes in one direction only.** `V4Quoter` reverts with `NotEnoughLiquidity`
   for the other side, and the first version of this sweep read that revert as "dead pool". It
   discarded 77.6% of the pools it touched. So the direction is *probed*, not assumed, and it is
   probed at several sizes before a pool is called unquotable — a pool that cannot move 1e14 can
   still quote 1e18.

2. **The first RPC touch of a pool is expensive and the next ones are free.** anvil fetches the
   pool's storage slots and the token contracts from the upstream archive node once, then serves
   them locally. Measured on this fork: a cold pool took 30-120 s, the same pool on a second pass
   took 0.5-9 s. So the sweep is grouped **by pool** — all five sizes back to back, paying the
   cold cost once instead of five times.

3. **A run gets interrupted.** The output is JSONL — one measurement per line, flushed and fsynced
   as it is produced — and a restart reads back what is already there and skips it. The resume key
   is `(pool_id, block_number, amount_in)`: the fork is pinned, so re-measuring one of those adds
   nothing. The direction is deliberately *not* part of the key; it is a derived observation, not
   an input.

4. **A fork can hold exactly one measurer.** `measure` installs the stub over the hook's code,
   quotes, and puts the original back — global mutable state on the node. Two processes sharing
   one anvil interleave and read each other's stub as if it were the hook. Parallelism therefore
   means several *forks*, one process each (`--shard i --of n`, one `--rpc` per shard), and
   `stub_is_installed` refuses a reading rather than publishing a contended one.

Nothing here invents a value, and nothing here disappears. A pool that refuses the swap produces
five lines labelled NOT_QUOTABLE carrying the revert reason; a pool the node could not serve
produces five lines labelled NOT_MEASURABLE saying so. Never zero lines, and never a zero.
"""
from __future__ import annotations      # Python 3.9: PEP 604 unions in annotations

import dataclasses
import json
import os
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path

from . import __version__
from .measure import Measurement, measure
from .poolid import PoolKey
from .quote import first_quotable_direction, quote
from .rpc import get_code
from .stub import BYTECODE as STUB, digest as stub_digest

# The five sizes of gate A3, in wei of currency-in: 0.0001 to 1.0 token.
SIZES = [10**14, 10**15, 10**16, 10**17, 10**18]

# A fee that does not move with size is a flat fee. Five basis points of travel between the
# smallest and the largest swap is the threshold above which the hook is doing something the
# static fee field cannot express.
NON_FLAT_BPS = 5.0

REPO = Path(__file__).resolve().parents[2]
DEFAULT_POOLS = REPO / "docs" / "pools-liquides.json"
DEFAULT_OUT = REPO / "docs" / "dataset" / "measurements.jsonl"
DEFAULT_SUMMARY = REPO / "docs" / "dataset" / "summary.json"

# The exact field list of docs/measurements-v1.json. A line that does not carry all of them is
# not replayable, and this project only publishes replayable numbers.
SCHEMA_FIELDS = (
    "hook", "pool_id", "chain_id", "block_number", "currency0", "currency1",
    "key_fee", "tick_spacing", "fee_is_dynamic", "stored_lp_fee", "stored_protocol_fee",
    "zero_for_one", "amount_in", "out_with", "out_without", "bps", "label", "reason",
    "stub_hash", "engine_ver", "observed_at",
)

LABELS = ("MEASURED", "INTERPOLATED", "NOT_MEASURABLE", "NOT_QUOTABLE")


# --------------------------------------------------------------- the instrument vs. the subject
#
# The first real run of this sweep produced ten NOT_QUOTABLE rows for two perfectly healthy pools.
# The reason field held `failed to get storage for 0x498...`: the upstream archive node behind the
# fork was rate-limiting anvil, so anvil could not fetch the pool's slots and the quote reverted.
# That is the instrument failing, not the pool refusing — and writing it down as a property of the
# pool is the fifth false finding this project would have produced from a failure it did not read
# carefully enough.
#
# So every failure is classified before it is labelled. An infrastructure failure is retried; if
# it survives the retries it becomes NOT_MEASURABLE with an `rpc_unavailable:` reason, which says
# "we could not look", and never NOT_QUOTABLE, which says "the pool said no".

RPC_UNAVAILABLE = "rpc_unavailable:"

INFRA_MARKERS = (
    "failed to get storage",        # anvil could not backfill a slot from upstream
    "failed to get account",
    "failed to get block",
    "failed to fetch",
    "empty response",               # rpc.py: curl returned nothing
    "error sending request",
    "rate limit",
    "too many requests",
    "timed out", "timeout", "deadline",
    "connection", "connect error", "eof",
    "os error",
    "502", "503", "504",
    "internal error",
    "service unavailable",
)


def is_infra(reason) -> bool:
    """True when the failure describes the node, not the pool.

    `NotEnoughLiquidity` and the other v4 custom errors are statements the pool made; anything in
    INFRA_MARKERS is the plumbing. Only the former may become NOT_QUOTABLE.
    """
    if not reason:
        return False
    low = str(reason).lower()
    if "notenoughliquidity" in low or "not_enough_liquidity" in low:
        return False
    return any(m in low for m in INFRA_MARKERS)


# ------------------------------------------------------------------ one measurer per fork
#
# `measure` works by writing the stub over the hook's code with `anvil_setCode`, quoting, then
# writing the original back. That is global mutable state on the node. Two measurers sharing one
# anvil interleave: A installs the stub, B quotes "with hook" and gets the stubbed pool, and B
# records a 0.00 bps hook that in fact takes 100.
#
# This was not hypothetical. Replaying three rows of the first dataset against the same anvil a
# shard was still sweeping reproduced one and destroyed two — 100.00 bps came back as 0.00. The
# rule is one measuring process per fork, and the guard below makes a violation loud instead of
# silently numeric.

CONCURRENT = "concurrent_measurer:"


def stub_is_installed(url: str, hook: str) -> bool:
    """True when the hook already wears the stub — i.e. another measurer is mid-measurement."""
    try:
        return (get_code(url, hook) or "").lower() == STUB.lower()
    except Exception:
        return False        # a node we cannot read is an infra problem, handled elsewhere


def unmeasurable(key: PoolKey, zero_for_one: bool, amount_in: int, block: int,
                 reason: str) -> Measurement:
    """A row for a pool we could not look at.

    Only the fields the fork was not needed for are filled; `stored_lp_fee` stays None, which
    reads as "unknown" rather than the zero that would make this pool look like a hidden fee.
    A pool that produces no row at all silently shrinks the denominator of every later
    statistic, so a failure must still occupy its line.
    """
    return Measurement(
        hook=key.hooks, pool_id="0x" + key.pool_id().hex(), chain_id=8453,
        block_number=block, currency0=key.currency0, currency1=key.currency1,
        key_fee=key.fee, tick_spacing=key.tick_spacing, fee_is_dynamic=key.is_dynamic_fee,
        stored_lp_fee=None, stored_protocol_fee=None,
        zero_for_one=zero_for_one, amount_in=str(amount_in),
        out_with=None, out_without=None, bps=None,
        label="NOT_MEASURABLE", reason=reason[:300],
        stub_hash=stub_digest(), engine_ver=f"tare-engine/{__version__}",
        observed_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )


def measure_resilient(url: str, key: PoolKey, zero_for_one: bool, amount_in: int, block: int,
                      attempts: int = 4, backoff: float = 2.0) -> Measurement:
    """`measure`, retried while the failure is the node's fault.

    A pool verdict is returned immediately — retrying `NotEnoughLiquidity` on a pinned fork would
    just be the same answer four times. An infrastructure failure that survives every attempt is
    relabelled NOT_MEASURABLE: the honest statement is "not looked at", not "nothing there".

    `measure` reads slot0 and the hook's code outside the `quote` wrapper, so a dead node reaches
    us as a raised `RpcError` rather than a reason string. That is the same event and it gets the
    same treatment — never an exception that deletes the pool from the dataset.
    """
    m, raised = None, None
    for i in range(attempts):
        if stub_is_installed(url, key.hooks):
            # Someone else is measuring this hook on this node. Anything we quote now describes
            # their stub, not this hook. Refusing is the only honest answer.
            time.sleep(backoff * (i + 1))
            if stub_is_installed(url, key.hooks):
                return unmeasurable(
                    key, zero_for_one, amount_in, block,
                    f"{CONCURRENT} the stub is already installed at {key.hooks} on {url} — "
                    f"run one measuring process per fork")
        try:
            m = measure(url, key, zero_for_one, amount_in, block)
        except Exception as exc:                      # RpcError, and anything else the node does
            raised = f"{type(exc).__name__}: {exc}"
            if not is_infra(raised):
                break            # not the node: retrying four times just wastes the fork
        else:
            if m.label == "MEASURED" or not is_infra(m.reason):
                return m
            raised = None
        if i < attempts - 1:
            time.sleep(backoff * (i + 1))

    if m is None:
        return unmeasurable(key, zero_for_one, amount_in, block,
                            f"{RPC_UNAVAILABLE} {raised}")
    return dataclasses.replace(m, label="NOT_MEASURABLE",
                               reason=f"{RPC_UNAVAILABLE} {raised or m.reason}"[:300])


# ----------------------------------------------------------------------------- input

def load_pools(path=DEFAULT_POOLS):
    """docs/pools-liquides.json -> [(PoolKey, liquidity, dynamic_flag)].

    Each entry is `[hook, [c0, c1, fee, tickSpacing, hook], liquidity, dynamic]`. The hook is
    repeated outside the key; we read it from the key, which is the one the poolId is derived
    from.
    """
    raw = json.loads(Path(path).read_text())
    pools = []
    for entry in raw:
        _hook, key, liquidity, dynamic = entry[0], entry[1], entry[2], entry[3]
        c0, c1, fee, ts, hooks = key
        pools.append((PoolKey(c0, c1, int(fee), int(ts), hooks), int(liquidity), bool(dynamic)))
    return pools


# ----------------------------------------------------------------------------- resume

def resume_key(row) -> tuple:
    """The identity of a measurement on a pinned fork.

    `row` is a dict or a Measurement. Direction is excluded on purpose: it is observed by the
    sweep, not chosen by it, so keying on it would re-measure a pool whose probe happened to land
    on the other side.
    """
    d = row.dict() if isinstance(row, Measurement) else row
    return (d["pool_id"], int(d["block_number"]), str(d["amount_in"]))


# The two reasons that mean "we did not look", as opposed to "we looked and this is what there
# was". Both must be written down, and neither may ever count as a finished measurement.
NOT_LOOKED = (RPC_UNAVAILABLE, CONCURRENT)


def is_observation(row) -> bool:
    """True when the row records something we actually saw.

    A row whose reason is `rpc_unavailable:` or `concurrent_measurer:` records the opposite — the
    node was down, or another process had the stub installed. Such a row has to be written (a
    missing row silently shrinks every denominator) but it must not count as done, or a
    five-minute outage would freeze a permanent hole that no later run would ever fill.
    """
    return not (row.get("reason") or "").startswith(NOT_LOOKED)


def read_done(path) -> set:
    """Keys already observed in the JSONL.

    A truncated final line is skipped, never guessed, and a row that only records a node failure
    is not treated as done — the next run retries it.
    """
    p = Path(path)
    if not p.exists():
        return set()
    done, failed = set(), set()
    with p.open() as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue                        # interrupted write: drop the fragment
            if not all(f in row for f in ("pool_id", "block_number", "amount_in")):
                continue
            (done if is_observation(row) else failed).add(resume_key(row))
    return done


def append_jsonl(path, measurement: Measurement) -> None:
    """One line, flushed and fsynced: a kill -9 costs at most the line being written."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a") as fh:
        fh.write(json.dumps(measurement.dict(), separators=(",", ":")) + "\n")
        fh.flush()
        os.fsync(fh.fileno())


def read_jsonl(path) -> list:
    p = Path(path)
    if not p.exists():
        return []
    rows = []
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


# ----------------------------------------------------------------------------- direction

def probe_direction(url: str, key: PoolKey, sizes=SIZES):
    """The quotable direction of a pool.

    `first_quotable_direction` tries both sides at one size — that is the fix that recovered the
    77.6% of pools an earlier sweep threw away. Here we walk the sizes too: a swap of 1e14 can be
    below the pool's smallest tick move while 1e18 goes straight through.

    Returns `(zero_for_one, probe_size, infra_reason)`. `zero_for_one` is None when no side
    quoted; `infra_reason` is then non-None if the node — not the pool — is what said no, and the
    caller must not conclude anything about the pool.
    """
    infra = None
    for size in sizes:
        zfo = first_quotable_direction(url, key, size)
        if zfo is not None:
            return zfo, size, None
        # Nothing quoted at this size. Ask again, keeping the reasons this time, so that a
        # rate-limited node is never mistaken for an empty pool.
        for side in (True, False):
            _out, reason = quote(url, key, side, size)
            if is_infra(reason):
                infra = reason
    return None, None, infra


# ----------------------------------------------------------------------------- the sweep

def sweep_pool(url: str, key: PoolKey, block: int, sizes=SIZES, done=None, on_row=None) -> list:
    """Measure one pool at every size, in one go, reusing anvil's warm cache.

    `done` is the resume set; sizes already in it are skipped. `on_row` is called with each
    fresh Measurement (that is where persistence happens) so an interruption loses nothing.
    """
    done = done if done is not None else set()
    pool_id = "0x" + key.pool_id().hex()

    todo = [s for s in sizes
            if (pool_id, int(block), str(s)) not in done]
    if not todo:
        return []

    zfo, _probe, infra = probe_direction(url, key, sizes)
    # No side quotes at any size: still emit a labelled row per size, carrying the reason the node
    # actually returned. `measure_resilient` re-quotes and reports that reason itself, and marks
    # the row NOT_MEASURABLE rather than NOT_QUOTABLE when the probe hit the node, not the pool.
    direction = True if zfo is None else zfo

    out = []
    for size in todo:
        m = measure_resilient(url, key, direction, size, block)
        if zfo is None and infra and m.label == "NOT_QUOTABLE":
            # The probe never got a clean answer from either side. Whatever this last quote says,
            # we did not establish that the pool is unquotable — only that we could not look.
            m = dataclasses.replace(m, label="NOT_MEASURABLE",
                                    reason=f"{RPC_UNAVAILABLE} probe {infra}"[:300])
        out.append(m)
        if on_row is not None:
            on_row(m)
    return out


def _cell(m: Measurement) -> str:
    """One column of the progress line: a number when there is one, else why there is not."""
    if m.bps is not None:
        return f"{m.bps:.2f}"
    if (m.reason or "").startswith(RPC_UNAVAILABLE):
        return "rpc"
    return {"NOT_QUOTABLE": "nq", "NOT_MEASURABLE": "nm"}.get(m.label, m.label[:3].lower())


def sweep(url: str, pools, block: int, out_path=DEFAULT_OUT, sizes=SIZES,
          resume=True, log=None) -> dict:
    """Sweep a list of `(PoolKey, liquidity, dynamic)` and append to `out_path`.

    Returns run counters. Every measurement is written the moment it exists.
    """
    done = read_done(out_path) if resume else set()
    stats = {"pools": 0, "pools_skipped": 0, "written": 0,
             "by_label": {l: 0 for l in LABELS}, "errors": 0}
    t0 = time.time()

    for i, (key, liquidity, _dyn) in enumerate(pools, 1):
        pool_id = "0x" + key.pool_id().hex()
        if all((pool_id, int(block), str(s)) in done for s in sizes):
            stats["pools_skipped"] += 1
            continue
        stats["pools"] += 1
        t = time.time()
        note = ""
        try:
            rows = sweep_pool(url, key, block, sizes, done,
                              on_row=lambda m: append_jsonl(out_path, m))
        except Exception as exc:                      # an RPC that dies must not kill the sweep
            # …and it must not delete the pool either: a pool that produces no row at all
            # silently shrinks the denominator of every statistic drawn from this file.
            stats["errors"] += 1
            note = f"  ERREUR {type(exc).__name__}: {exc}"[:160]
            rows = [unmeasurable(key, True, size, block,
                                 f"{RPC_UNAVAILABLE} sweep {type(exc).__name__}: {exc}")
                    for size in sizes
                    if (pool_id, int(block), str(size)) not in done]
            for m in rows:
                append_jsonl(out_path, m)

        for m in rows:
            done.add(resume_key(m))
            stats["written"] += 1
            stats["by_label"][m.label] = stats["by_label"].get(m.label, 0) + 1
        if log:
            log(f"[{i}/{len(pools)}] {pool_id[:18]} hook={key.hooks[:10]} "
                f"{time.time() - t:5.1f}s  "
                + " ".join(f"{_cell(m):>7}" for m in rows) + note)

    stats["seconds"] = round(time.time() - t0, 1)
    return stats


# ----------------------------------------------------------------------------- summary

def profile(rows) -> dict:
    """Per-pool bps as a function of size, and how far it travels.

    A hook whose take is the same at 1e14 and at 1e18 is a flat fee wearing a hook. One whose take
    collapses (or explodes) with size is doing something the fee field cannot say. `amplitude_bps`
    is the gap between the smallest and the largest size — the two ends of the curve — while
    `spread_bps` is the full max-min travel, which can be larger if the curve is not monotone.
    """
    ms = sorted((r for r in rows if r["label"] == "MEASURED" and r["bps"] is not None),
                key=lambda r: int(r["amount_in"]))
    if len(ms) < 2:
        return {}
    bps = [r["bps"] for r in ms]
    return {
        "hook": ms[0]["hook"],
        "pool_id": ms[0]["pool_id"],
        "currency0": ms[0]["currency0"],
        "currency1": ms[0]["currency1"],
        "zero_for_one": ms[0]["zero_for_one"],
        "stored_lp_fee": ms[0]["stored_lp_fee"],
        "sizes": [r["amount_in"] for r in ms],
        "bps": bps,
        "bps_at_min_size": bps[0],
        "bps_at_max_size": bps[-1],
        "amplitude_bps": round(abs(bps[-1] - bps[0]), 4),
        "spread_bps": round(max(bps) - min(bps), 4),
    }


def dedupe(rows) -> list:
    """One row per `(pool_id, block, size)`, keeping the last written.

    The fork is pinned, so measuring the same pool at the same size twice is the same
    observation, not two. Duplicates appear whenever workers overlap — several shards sweeping in
    parallel each hold a resume set from the moment they started — and counting them twice would
    inflate every figure in the summary.
    """
    seen = {}
    for r in rows:
        k = resume_key(r)
        prev = seen.get(k)
        # A real observation always beats a record of the node being down, whichever came first.
        if prev is not None and is_observation(prev) and not is_observation(r):
            continue
        seen[k] = r
    return list(seen.values())


def summarise(rows, block=None) -> dict:
    """Everything the summary claims is counted from `rows`. Nothing is carried over from a
    previous run, and an empty input produces zeros, not omissions."""
    rows = dedupe(rows)
    measured = [r for r in rows if r["label"] == "MEASURED" and r["bps"] is not None]
    bps = sorted(r["bps"] for r in measured)

    by_pool = {}
    for r in rows:
        by_pool.setdefault(r["pool_id"], []).append(r)

    profiles = [p for p in (profile(v) for v in by_pool.values()) if p]
    non_flat = sorted((p for p in profiles if p["amplitude_bps"] >= NON_FLAT_BPS),
                      key=lambda p: -p["amplitude_bps"])

    # The finding this dataset exists to support: a pool whose fee field reads zero on-chain,
    # taking more than a basis point on a real swap.
    hidden = [r for r in measured if r["bps"] > 1.0 and r["stored_lp_fee"] == 0]

    # Instrument health, reported next to the results rather than hidden behind them: a row we
    # could not look at is not a row about the pool, and a run with many of these is a bad run.
    # `n_rpc_unavailable` counts both node failures and contended readings — every line in this
    # file that describes the instrument instead of a pool.
    unavailable = [r for r in rows if not is_observation(r)]

    blocks = sorted({r["block_number"] for r in rows})
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "engine_ver": f"tare-engine/{__version__}",
        "stub_hash": stub_digest(),
        "chain_id": rows[0]["chain_id"] if rows else None,
        "block_number": block if block is not None else (blocks[0] if len(blocks) == 1 else None),
        "blocks": blocks,
        "sizes": [str(s) for s in SIZES],
        "non_flat_threshold_bps": NON_FLAT_BPS,

        "n_measurements": len(rows),
        "by_label": {l: sum(1 for r in rows if r["label"] == l) for l in LABELS},
        "n_hooks": len({r["hook"] for r in rows}),
        "n_pools": len(by_pool),
        "n_hooks_measured": len({r["hook"] for r in measured}),
        "n_pools_measured": len({r["pool_id"] for r in measured}),
        "n_rpc_unavailable": len(unavailable),
        "n_pools_rpc_unavailable": len({r["pool_id"] for r in unavailable}),

        "n_gt_1bps_at_zero_stored_lp_fee": len(hidden),
        "n_pools_gt_1bps_at_zero_stored_lp_fee": len({r["pool_id"] for r in hidden}),
        "n_hooks_gt_1bps_at_zero_stored_lp_fee": len({r["hook"] for r in hidden}),

        "bps_min": bps[0] if bps else None,
        "bps_median": round(statistics.median(bps), 4) if bps else None,
        "bps_max": bps[-1] if bps else None,

        "n_non_flat_profiles": len(non_flat),
        "non_flat_profiles": non_flat,
    }


def write_summary(in_path=DEFAULT_OUT, out_path=DEFAULT_SUMMARY, block=None) -> dict:
    s = summarise(read_jsonl(in_path), block=block)
    p = Path(out_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(s, indent=1) + "\n")
    return s
