"""The sweep — turning one measurement into coverage.

Six facts about the fork drive every design decision in this file.

1. **A pool usually quotes in one direction only.** `V4Quoter` reverts with `NotEnoughLiquidity`
   for the other side, and the first version of this sweep read that revert as "dead pool". It
   discarded 77.6% of the pools it touched. So the direction is *probed*, not assumed, and it is
   probed at several sizes before a pool is called unquotable — a pool that cannot move 1e14 can
   still quote 1e18.

2. **The first RPC touch of a pool is expensive and the next ones are free.** anvil fetches the
   pool's storage slots and the token contracts from the upstream archive node once, then serves
   them locally. Measured on this fork: a cold pool took 30-120 s, the same pool on a second pass
   took 0.5-9 s. So the sweep is grouped **by pool** — every size and both directions back to
   back, paying the cold cost once instead of sixteen times.

3. **A run gets interrupted.** The output is JSONL — one measurement per line, flushed and fsynced
   as it is produced — and a restart reads back what is already there and skips it. The resume key
   is `(pool_id, block_number, amount_in, zero_for_one)`: the fork is pinned, so re-measuring one
   of those adds nothing. Direction is part of the key since fact 5 below — while the sweep only
   ever measured one side per pool it had to be left out, or a resumed run would have re-measured
   every pool whose probe happened to land on the other side.

4. **A fork can hold exactly one measurer.** `measure` installs the stub over the hook's code,
   quotes, and puts the original back — global mutable state on the node. Two processes sharing
   one anvil interleave and read each other's stub as if it were the hook. Parallelism therefore
   means several *forks*, one process each (`--shard i --of n`, one `--rpc` per shard), and
   `stub_is_installed` refuses a reading rather than publishing a contended one.

5. **One direction per pool was a sampling decision, not a fact about the pool.** Fact 1 above
   made the sweep *probe* for a quotable side and then measure only that side. That recovered the
   pools an earlier sweep had thrown away, but it also meant the corpus could never answer "does
   this hook take the same cut both ways?" — and a v4 hook is free to charge asymmetrically,
   because `beforeSwap` receives `zeroForOne`. So the sweep now measures **both** directions and
   `resume_key` carries the direction. A row for a side that does not quote is still written,
   labelled, and carries the revert: the asymmetry is in the data instead of hidden by the probe.

6. **A hook can read `tx.origin`.** Through `eth_call`, the `from` field sets the origin of the
   whole call. It does *not* reach the hook as `sender` — v4 passes the address that called
   `PoolManager.swap`, which is always the quoter — so the only channel from the caller to the
   hook is `tx.origin`. `sweep_callers` quotes the identical swap from several origins and reports
   whether the output moves. That is a narrower question than "does the hook price me differently",
   and it is written down as the narrow one it is, in a separate file with its own schema.

Nothing here invents a value, and nothing here disappears. Every (pool, size, direction) cell
gets exactly one line: a pool that refuses the swap gets NOT_QUOTABLE carrying the revert reason,
a pool the node could not serve gets NOT_MEASURABLE saying so. Never zero lines, and never a zero.
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
from .consts import V4_QUOTER
from .measure import Measurement, measure
from .poolid import PoolKey
from .quote import NOT_ENOUGH_LIQUIDITY, encode, first_quotable_direction, quote
from .rpc import RpcError, call, get_code
from .stub import BYTECODE as STUB, digest as stub_digest

# The size grid, in wei of currency-in. Gate A3 pins its own five decades (1e14..1e18) and is
# deliberately left alone — it reproduces numbers that predate this file. The sweep runs wider:
# 1e12 is a dust swap that some hooks let through free and others round to nothing, and 1e19 is
# large enough to walk out of the first tick range on a shallow pool. Eight decades, so a curve
# has enough points to show a knee rather than a slope.
SIZES = [10**e for e in range(12, 20)]

# Both sides of every pool. `beforeSwap` is handed `zeroForOne`, so a hook may charge one way and
# not the other; measuring one side and calling it "the" fee assumed it could not.
DIRECTIONS = (True, False)

# Two measurements of one pool at one size differ by more than this, one way versus the other,
# and the hook is doing something direction-dependent. Chosen an order of magnitude above the
# quoter's rounding: an exact-input quote of 1e12 wei rounds at well under a tenth of a bp.
ASYMMETRY_BPS = 1.0

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
    # The three wordings rpc.py itself produces when the transport, not the chain, is what
    # failed. They were missing, and the cost of missing them is precise: widening the size grid
    # made the sweep touch cold pools whose first quote takes longer than curl's timeout, and
    # every one of those came back labelled NOT_QUOTABLE — the node's clock recorded as the
    # pool's refusal. Caught on the first real run of the wider grid, before anything was
    # published; the corpus in docs/dataset carries none of them (checked line by line).
    "transport failure",            # rpc.py: curl exited non-zero, or HTTP status 000
    "empty body",                   # rpc.py: a status arrived, a body did not
    "http 429",
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

    `row` is a dict or a Measurement. Direction belongs in the key: the sweep measures both sides
    of every pool, so `(pool, block, size)` names two distinct observations and collapsing them
    would let `dedupe` silently throw one away — turning "this hook charges 30 bps one way and
    100 the other" into whichever line happened to be written last.

    Rows written before the two-direction sweep carry a direction too, so they keep their identity
    and are not re-measured; only the side that was never looked at is.
    """
    d = row.dict() if isinstance(row, Measurement) else row
    return (d["pool_id"], int(d["block_number"]), str(d["amount_in"]), bool(d["zero_for_one"]))


def cell_key(pool_id: str, block: int, amount_in, zero_for_one: bool) -> tuple:
    """`resume_key` from loose parts, so callers cannot get the tuple shape wrong."""
    return (pool_id, int(block), str(amount_in), bool(zero_for_one))


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

def pool_cells(pool_id: str, block: int, sizes=SIZES, directions=DIRECTIONS) -> list:
    """Every (direction, size) cell of one pool, in the order the sweep visits them.

    Directions outermost: `measure` rewrites the hook's code around each quote, and walking a
    whole direction before switching keeps the quoter's own warm path stable. Sizes ascending
    inside a direction, so an interrupted run leaves a curve that starts at the left.
    """
    return [(zfo, size, cell_key(pool_id, block, size, zfo))
            for zfo in directions for size in sizes]


def sweep_pool(url: str, key: PoolKey, block: int, sizes=SIZES, done=None, on_row=None,
               directions=DIRECTIONS) -> list:
    """Measure one pool at every size **in both directions**, in one go, reusing anvil's cache.

    `done` is the resume set; cells already in it are skipped. `on_row` is called with each fresh
    Measurement (that is where persistence happens) so an interruption loses nothing.

    There is no direction probe any more. The probe existed to pick the one side worth spending
    the sweep's budget on; now both sides are in the budget, so the choice is gone and with it the
    silent loss of whatever the other side would have said. The probe's *other* job — never
    reading a node failure as a pool verdict — is done by `measure_resilient`, which retries an
    infrastructure failure and relabels a survivor NOT_MEASURABLE rather than NOT_QUOTABLE.
    """
    done = done if done is not None else set()
    pool_id = "0x" + key.pool_id().hex()

    out = []
    for zfo, size, k in pool_cells(pool_id, block, sizes, directions):
        if k in done:
            continue
        m = measure_resilient(url, key, zfo, size, block)
        # The cell we asked for is what gets marked done, not the cell the row claims to be.
        # They are the same today — `measure` echoes its argument — but keying the resume set off
        # the answer instead of the question means one mislabelled row makes the sweep ask for
        # that cell again on every run, for ever.
        done.add(k)
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


def _line(rows) -> str:
    """The progress line, split by direction so the two curves stay readable side by side."""
    parts = []
    for zfo, tag in ((True, "0>1"), (False, "1>0")):
        side = [m for m in rows if m.zero_for_one is zfo]
        if side:
            parts.append(tag + " " + " ".join(f"{_cell(m):>7}" for m in side))
    return "  |  ".join(parts)


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
        cells = pool_cells(pool_id, block, sizes)
        if all(k in done for _z, _s, k in cells):
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
            rows = [unmeasurable(key, zfo, size, block,
                                 f"{RPC_UNAVAILABLE} sweep {type(exc).__name__}: {exc}")
                    for zfo, size, k in cells if k not in done]
            for m in rows:
                append_jsonl(out_path, m)

        for m in rows:
            done.add(resume_key(m))
            stats["written"] += 1
            stats["by_label"][m.label] = stats["by_label"].get(m.label, 0) + 1
        if log:
            log(f"[{i}/{len(pools)}] {pool_id[:18]} hook={key.hooks[:10]} "
                f"{time.time() - t:5.1f}s  " + _line(rows) + note)

    stats["seconds"] = round(time.time() - t0, 1)
    return stats


# ----------------------------------------------------------------------------- summary

def profile(rows) -> dict:
    """bps as a function of size for one pool **in one direction**, and how far it travels.

    A hook whose take is the same at the smallest and the largest swap is a flat fee wearing a
    hook. One whose take collapses (or explodes) with size is doing something the fee field cannot
    say. `amplitude_bps` is the gap between the two ends of the curve; `spread_bps` is the full
    max-min travel, which is larger when the curve is not monotone.

    `rows` must already be one direction of one pool — mixing the two sides would interleave two
    curves into one and invent a slope that neither of them has. `profiles_of` does that split.
    """
    ms = sorted((r for r in rows if r["label"] == "MEASURED" and r["bps"] is not None),
                key=lambda r: int(r["amount_in"]))
    if len(ms) < 2:
        return {}
    if len({bool(r["zero_for_one"]) for r in ms}) > 1:
        raise ValueError("profile() a recu les deux sens d'un pool : ce sont deux courbes")
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


def profiles_of(rows) -> list:
    """One profile per (pool, direction). Never one per pool: see `profile`."""
    by_curve = {}
    for r in rows:
        by_curve.setdefault((r["pool_id"], bool(r["zero_for_one"])), []).append(r)
    return [p for p in (profile(v) for v in by_curve.values()) if p]


def asymmetries(rows) -> list:
    """Pools that charge differently depending on which way you swap.

    Only cells measured on **both** sides at the **same** size count: comparing 1e15 one way with
    1e18 the other would report the size curve as an asymmetry. A pool that quotes one way and
    reverts the other is not listed here — that is a liquidity fact, not a pricing one, and it is
    already visible in the NOT_QUOTABLE rows.
    """
    cells = {}
    for r in rows:
        if r["label"] != "MEASURED" or r["bps"] is None:
            continue
        cells.setdefault((r["pool_id"], str(r["amount_in"])), {})[bool(r["zero_for_one"])] = r

    out = {}
    for (pool_id, size), sides in cells.items():
        if True not in sides or False not in sides:
            continue
        a, b = sides[True], sides[False]
        gap = round(abs(a["bps"] - b["bps"]), 4)
        cur = out.setdefault(pool_id, {
            "hook": a["hook"], "pool_id": pool_id,
            "currency0": a["currency0"], "currency1": a["currency1"],
            "stored_lp_fee": a["stored_lp_fee"],
            "sizes_compared": 0, "max_gap_bps": 0.0, "at_size": None,
            "bps_zero_for_one": None, "bps_one_for_zero": None,
        })
        cur["sizes_compared"] += 1
        if gap > cur["max_gap_bps"]:
            cur.update(max_gap_bps=gap, at_size=size,
                       bps_zero_for_one=a["bps"], bps_one_for_zero=b["bps"])
    return sorted((v for v in out.values() if v["max_gap_bps"] >= ASYMMETRY_BPS),
                  key=lambda v: -v["max_gap_bps"])


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

    profiles = profiles_of(rows)
    non_flat = sorted((p for p in profiles if p["amplitude_bps"] >= NON_FLAT_BPS),
                      key=lambda p: -p["amplitude_bps"])
    asym = asymmetries(rows)

    # Coverage of the two-direction grid, counted rather than assumed: a pool is "both sides
    # measured" only when a MEASURED row exists for each side.
    sides = {}
    for r in measured:
        sides.setdefault(r["pool_id"], set()).add(bool(r["zero_for_one"]))
    both_sides = [p for p, v in sides.items() if len(v) == 2]
    one_side = [p for p, v in sides.items() if len(v) == 1]

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
        "sizes_present": sorted({str(r["amount_in"]) for r in rows}, key=int),
        "directions": ["zero_for_one", "one_for_zero"],
        "non_flat_threshold_bps": NON_FLAT_BPS,
        "asymmetry_threshold_bps": ASYMMETRY_BPS,

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

        "n_measured_zero_for_one": sum(1 for r in measured if r["zero_for_one"]),
        "n_measured_one_for_zero": sum(1 for r in measured if not r["zero_for_one"]),
        "n_pools_measured_both_sides": len(both_sides),
        "n_pools_measured_one_side": len(one_side),

        "n_profiles": len(profiles),
        "n_non_flat_profiles": len(non_flat),
        "n_asymmetric_pools": len(asym),
        "asymmetric_pools": asym,
        "non_flat_profiles": non_flat,
    }


def write_summary(in_path=DEFAULT_OUT, out_path=DEFAULT_SUMMARY, block=None) -> dict:
    s = summarise(read_jsonl(in_path), block=block)
    p = Path(out_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(s, indent=1) + "\n")
    return s


# ============================================================================== the caller axis
#
# Does a hook treat one address differently from another? The honest form of that question is
# narrower than it sounds, and the narrow form is the one this file answers.
#
# `eth_call` lets us set `from`. On a v4 swap that address becomes `tx.origin`, and *only*
# `tx.origin`: the `sender` argument `beforeSwap` receives is whoever called
# `PoolManager.swap`, which for a quote is always the V4Quoter, no matter who signed. `msg.sender`
# inside the hook is the PoolManager. So the single channel between the caller and the hook is
# `tx.origin`, and the measurable question is:
#
#     does the quoted output of the identical swap move when `tx.origin` moves?
#
# A yes is a real finding — the hook branches on the origin, which is how allow-lists and
# anti-MEV carve-outs are usually written. A no is *not* proof that the hook treats everyone
# alike: it could branch on `hookData`, on a router it recognises as `sender`, or on state it
# only sees in a real transaction. `NOT_MEASURABLE` is the label for everything this method
# cannot see, and the summary says so in `caveat`.
#
# The stub is never installed here. This axis compares the hook against itself, so there is no
# counterfactual to set up — which also means several caller sweeps could share one fork. They
# still do not: the guard exists so that nobody has to remember which sweep is which.

CALLER_SIZES = [10**15, 10**18]

# Four origins, chosen to be distinguishable and replayable rather than meaningful. Whether each
# one carries code is read off the fork at run time and written into the summary; nothing here
# assumes it.
CALLERS = (
    ("zero",   "0x0000000000000000000000000000000000000000"),
    ("eoa_a",  "0x00000000000000000000000000000000000000a1"),
    ("eoa_b",  "0x00000000000000000000000000000000000000b2"),
    ("router", "0x6ff5693b99212da76ad316178a184ab56d299b43"),
)

DEFAULT_CALLERS_OUT = REPO / "docs" / "dataset" / "callers.jsonl"
DEFAULT_CALLERS_SUMMARY = REPO / "docs" / "dataset" / "callers-summary.json"

CALLER_FIELDS = (
    "hook", "pool_id", "chain_id", "block_number", "zero_for_one", "amount_in",
    "caller", "caller_name", "out", "label", "reason", "engine_ver", "observed_at",
)


def quote_as(url: str, key: PoolKey, zero_for_one: bool, amount_in: int, caller: str):
    """`quote`, with `from` set. Returns (amount_out, None) or (None, reason).

    Deliberately a separate function rather than a keyword on `quote`: every other reading in this
    project is taken with the default origin, and a parameter that silently changes what a
    published bps means is not worth the four saved lines.
    """
    try:
        raw = call(url, "eth_call",
                   [{"to": V4_QUOTER, "from": caller,
                     "data": encode(key, zero_for_one, amount_in)}, "latest"])
    except RpcError as e:
        msg = str(e)
        return None, ("NOT_ENOUGH_LIQUIDITY" if NOT_ENOUGH_LIQUIDITY in msg else msg[:120])
    if not raw or len(raw) < 66:
        return None, "SHORT_RETURN"
    out = int(raw[2:66], 16)
    return (out, None) if out > 0 else (None, "ZERO_OUT")


def caller_row(key: PoolKey, zero_for_one: bool, amount_in: int, block: int,
               name: str, caller: str, out, reason) -> dict:
    """One reading of one origin. A failure keeps its line and its reason, never a zero."""
    if out is not None:
        label = "MEASURED"
    elif is_infra(reason):
        label, reason = "NOT_MEASURABLE", f"{RPC_UNAVAILABLE} {reason}"
    else:
        label = "NOT_QUOTABLE"
    return {
        "hook": key.hooks, "pool_id": "0x" + key.pool_id().hex(), "chain_id": 8453,
        "block_number": block, "zero_for_one": zero_for_one, "amount_in": str(amount_in),
        "caller": caller, "caller_name": name,
        "out": None if out is None else str(out),
        "label": label, "reason": None if reason is None else str(reason)[:300],
        "engine_ver": f"tare-engine/{__version__}",
        "observed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def caller_key(row) -> tuple:
    return (row["pool_id"], int(row["block_number"]), str(row["amount_in"]),
            bool(row["zero_for_one"]), row["caller"].lower())


def read_callers_done(path) -> set:
    done = set()
    for r in read_jsonl(path):
        if all(f in r for f in ("pool_id", "block_number", "amount_in", "zero_for_one", "caller")):
            if not (r.get("reason") or "").startswith(NOT_LOOKED):
                done.add(caller_key(r))
    return done


def sweep_callers(url: str, pools, block: int, out_path=DEFAULT_CALLERS_OUT,
                  sizes=CALLER_SIZES, callers=CALLERS, resume=True, log=None) -> dict:
    """Quote the same swap from several origins, for every pool, both directions.

    Writes one JSONL line per (pool, direction, size, origin) — including the ones that revert,
    because "this origin cannot swap here and that one can" is exactly the finding this axis is
    for, and it only exists if both lines are on disk.
    """
    done = read_callers_done(out_path) if resume else set()
    stats = {"pools": 0, "written": 0, "by_label": {l: 0 for l in LABELS}, "n_pools_differ": 0}
    t0 = time.time()

    for i, (key, _liq, _dyn) in enumerate(pools, 1):
        pool_id = "0x" + key.pool_id().hex()
        rows, t = [], time.time()
        for zfo in DIRECTIONS:
            for size in sizes:
                for name, addr in callers:
                    k = (pool_id, int(block), str(size), bool(zfo), addr.lower())
                    if k in done:
                        continue
                    try:
                        out, reason = quote_as(url, key, zfo, size, addr)
                    except Exception as exc:            # the node, not the pool
                        out, reason = None, f"{type(exc).__name__}: {exc}"
                    r = caller_row(key, zfo, size, block, name, addr, out, reason)
                    append_jsonl_dict(out_path, r)
                    done.add(k)
                    rows.append(r)
        if not rows:
            continue
        stats["pools"] += 1
        stats["written"] += len(rows)
        for r in rows:
            stats["by_label"][r["label"]] = stats["by_label"].get(r["label"], 0) + 1
        v = caller_verdict(rows)
        if v["verdict"] == "ORIGIN_SENSITIVE":
            stats["n_pools_differ"] += 1
        if log:
            log(f"[{i}/{len(pools)}] {pool_id[:18]} hook={key.hooks[:10]} "
                f"{time.time() - t:5.1f}s  {len(rows):>3} lectures  {v['verdict']}")

    stats["seconds"] = round(time.time() - t0, 1)
    return stats


def append_jsonl_dict(path, row: dict) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a") as fh:
        fh.write(json.dumps(row, separators=(",", ":")) + "\n")
        fh.flush()
        os.fsync(fh.fileno())


def caller_verdict(rows) -> dict:
    """What the origins said about one pool.

    ORIGIN_SENSITIVE   at least one (direction, size) cell where the origins disagree — either a
                       different amount out, or one origin quoting where another reverts.
    ORIGIN_INVARIANT   every cell that could be read gave every origin the same answer.
    NOT_QUOTABLE       no origin got a quote anywhere, and the pool is what said no.
    NOT_MEASURABLE     the node is what said no, so nothing was established.
    """
    cells = {}
    for r in rows:
        cells.setdefault((str(r["amount_in"]), bool(r["zero_for_one"])), []).append(r)

    diverging, comparable, infra, quotable = [], 0, False, False
    for (size, zfo), group in cells.items():
        if any(r["label"] == "NOT_MEASURABLE" for r in group):
            infra = True
            continue                                  # a cell we could not read says nothing
        comparable += 1
        answers = {(r["out"], r["label"]) for r in group}
        quotable |= any(r["label"] == "MEASURED" for r in group)
        if len(answers) > 1:
            diverging.append({
                "amount_in": size, "zero_for_one": zfo,
                "by_caller": {r["caller_name"]: (r["out"] or r["reason"]) for r in group},
            })

    if diverging:
        verdict = "ORIGIN_SENSITIVE"
    elif not comparable:
        verdict = "NOT_MEASURABLE"
    elif quotable:
        verdict = "ORIGIN_INVARIANT"
    else:
        verdict = "NOT_QUOTABLE"
    return {
        "hook": rows[0]["hook"], "pool_id": rows[0]["pool_id"],
        "verdict": verdict, "cells_compared": comparable,
        "cells_unreadable": len(cells) - comparable,
        "n_callers": len({r["caller"].lower() for r in rows}),
        "diverging_cells": diverging,
        "rpc_blocked": infra,
    }


def summarise_callers(rows, block=None, code_by_caller=None) -> dict:
    """Fold the caller readings into one verdict per pool and one per hook.

    A hook is ORIGIN_SENSITIVE if *any* of its pools is: one branch on the origin is enough to
    make the statement true. It is ORIGIN_INVARIANT only when at least one of its pools was
    actually comparable and none diverged — never by default, and never because we could not look.
    """
    seen = {}
    for r in rows:
        seen[caller_key(r)] = r
    rows = list(seen.values())

    by_pool = {}
    for r in rows:
        by_pool.setdefault(r["pool_id"], []).append(r)
    verdicts = [caller_verdict(v) for v in by_pool.values()]

    by_hook = {}
    for v in verdicts:
        by_hook.setdefault(v["hook"], []).append(v["verdict"])
    hook_verdict = {}
    for h, vs in by_hook.items():
        hook_verdict[h] = ("ORIGIN_SENSITIVE" if "ORIGIN_SENSITIVE" in vs
                           else "ORIGIN_INVARIANT" if "ORIGIN_INVARIANT" in vs
                           else "NOT_QUOTABLE" if "NOT_QUOTABLE" in vs
                           else "NOT_MEASURABLE")
    tally = lambda want: sum(1 for v in verdicts if v["verdict"] == want)
    blocks = sorted({r["block_number"] for r in rows})
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "engine_ver": f"tare-engine/{__version__}",
        "chain_id": rows[0]["chain_id"] if rows else None,
        "block_number": block if block is not None else (blocks[0] if len(blocks) == 1 else None),
        "question": "does the quoted output of the identical swap move when tx.origin moves?",
        "caveat": ("eth_call `from` reaches a v4 hook only as tx.origin: the `sender` argument of "
                   "beforeSwap is the V4Quoter and msg.sender is the PoolManager. ORIGIN_INVARIANT "
                   "therefore means 'does not branch on tx.origin', not 'treats every caller "
                   "alike' — a hook can still branch on hookData, on a router it recognises as "
                   "sender, or on state that only exists inside a real transaction."),
        "callers": [{"name": n, "address": a,
                     "has_code_on_fork": (code_by_caller or {}).get(a.lower())}
                    for n, a in CALLERS],
        "sizes": [str(s) for s in CALLER_SIZES],
        "n_readings": len(rows),
        "by_label": {l: sum(1 for r in rows if r["label"] == l) for l in LABELS},
        "n_pools": len(by_pool),
        "n_hooks": len(by_hook),
        "n_pools_origin_sensitive": tally("ORIGIN_SENSITIVE"),
        "n_pools_origin_invariant": tally("ORIGIN_INVARIANT"),
        "n_pools_not_quotable": tally("NOT_QUOTABLE"),
        "n_pools_not_measurable": tally("NOT_MEASURABLE"),
        "n_hooks_origin_sensitive": sum(1 for v in hook_verdict.values()
                                        if v == "ORIGIN_SENSITIVE"),
        "hook_verdicts": dict(sorted(hook_verdict.items())),
        "origin_sensitive_pools": [v for v in verdicts if v["verdict"] == "ORIGIN_SENSITIVE"],
    }


def write_callers_summary(in_path=DEFAULT_CALLERS_OUT, out_path=DEFAULT_CALLERS_SUMMARY,
                          block=None, code_by_caller=None) -> dict:
    s = summarise_callers(read_jsonl(in_path), block=block, code_by_caller=code_by_caller)
    p = Path(out_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(s, indent=1) + "\n")
    return s


# ----------------------------------------------------------------------------- one command
#
# The caller axis has its own schema and its own output, so it gets its own entry point rather
# than a flag on `tare.cli sweep` that would make two unrelated files look like one command.
#
#   python3 -m tare.sweep callers --rpc http://127.0.0.1:8545 --pools docs/dataset/pools.json \
#                                 --out docs/dataset/callers.jsonl --shard 0 --of 4

def main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(prog="tare.sweep", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("callers", help="le meme swap depuis plusieurs tx.origin")
    c.add_argument("--rpc", default="http://127.0.0.1:8545")
    c.add_argument("--block", type=int, default=50614000)
    c.add_argument("--pools", default=str(DEFAULT_POOLS))
    c.add_argument("--out", default=str(DEFAULT_CALLERS_OUT))
    c.add_argument("--summary", default=str(DEFAULT_CALLERS_SUMMARY))
    c.add_argument("--limit", type=int, default=0)
    c.add_argument("--shard", type=int, default=0)
    c.add_argument("--of", type=int, default=1)
    a = ap.parse_args(argv)

    if a.of < 1 or not (0 <= a.shard < a.of):
        print(f"--shard doit etre dans [0, {a.of}) ; recu --shard {a.shard} --of {a.of}")
        return 2

    pools = load_pools(a.pools)
    pools.sort(key=lambda p: -p[1])
    if a.of > 1:
        pools = [p for i, p in enumerate(pools) if i % a.of == a.shard]
    if a.limit:
        pools = pools[:a.limit]

    print(f"axe appelant : {len(pools)} pools x {len(DIRECTIONS)} sens x {len(CALLER_SIZES)} "
          f"tailles x {len(CALLERS)} origines  bloc {a.block}  -> {a.out}")
    stats = sweep_callers(a.rpc, pools, a.block, out_path=a.out,
                          log=lambda s: print(s, flush=True))
    print(f"\n{stats['written']} lectures en {stats['seconds']}s, "
          f"{stats['n_pools_differ']} pools ou les origines divergent")

    code = {}
    for _n, addr in CALLERS:
        try:
            code[addr.lower()] = bool((get_code(a.rpc, addr) or "0x") != "0x")
        except Exception:
            code[addr.lower()] = None          # inconnu, jamais False par defaut
    s = write_callers_summary(a.out, a.summary, block=a.block, code_by_caller=code)
    print(f"resume -> {a.summary}  ({s['n_readings']} lectures, {s['n_pools']} pools, "
          f"{s['n_pools_origin_sensitive']} sensibles a tx.origin, "
          f"{s['n_pools_origin_invariant']} invariants, "
          f"{s['n_pools_not_measurable']} non mesurables)")
    print(f"rejouer : python3 -m tare.sweep callers --rpc {a.rpc} --block {a.block} "
          f"--pools {a.pools} --out {a.out}")
    return 0


if __name__ == "__main__":
    import sys as _sys
    _sys.exit(main())
