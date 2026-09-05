# Method, limits, and the five false findings

## 1. The counterfactual

A Uniswap v4 pool's identity is its `PoolKey`, and the hook's address is one of the five fields
inside it. `poolId = keccak256(abi.encode(key))`. So "this pool without its hook" is not a pool that
exists, cannot be constructed, and cannot be quoted. Any comparison against a hookless pool compares
two different venues with different liquidity and calls the difference a fee.

TARE does not change the pool. **It changes the hook.**

```
                fork pinned at block 50,614,000 (Base, chain 8453)
                          |
      quote #1 -----------+----------- quote #2
   hook bytecode = real            hook bytecode = 89-byte inert stub
             \                            /
              \                          /
        same PoolKey, same poolId, same slot0, same liquidity, same reserves
                  the only difference is the code that runs
```

`anvil_setCode` rewrites the bytecode at the hook's address. The `PoolKey` is untouched, so the
`poolId` is byte-identical; `slot0`, the tick, the fee fields and the position map are untouched, so
the pool is the same pool. Two calls to `V4Quoter.quoteExactInputSingle` with identical arguments
then differ by exactly one thing.

```
bps = (out_without − out_with) / out_without × 10 000
```

Implementation: [`engine/tare/measure.py:68–102`](../engine/tare/measure.py). The original bytecode
is captured before the write and restored in a `finally`
([`engine/tare/measure.py:85–90`](../engine/tare/measure.py)), so a crash mid-quote cannot leave a
hook stubbed.

### The stub

`v4-core/src/libraries/Hooks.sol` does not check what a hook *does*. It checks what a hook
*returns*: every hook call must return at least 32 bytes whose first word is the selector that was
called; `beforeSwap` must return exactly 96 bytes; the delta-returning path requires exactly 64.

The smallest program satisfying the protocol while doing nothing is therefore: read the incoming
selector, echo it in word 0, return 96 bytes for `beforeSwap` and 64 otherwise. That is 89 bytes of
EVM, written out opcode by opcode in [`engine/tare/stub.py:25–36`](../engine/tare/stub.py).

`keccak256` of the stub is
`0x8e39b2ad4344342b4f7dc5cf31df0aec9bd5b5f8ec7fccd241256cf1fda637a4`, and **every row of the corpus
carries it** in its `stub_hash` field. A change to the stub invalidates the corpus visibly instead
of silently.

One subtlety, and it was checked because an earlier version of this project got it backwards: the
stub returns `lpFeeOverride = 0`, and zero does **not** mean "zero fee". `Pool.sol` only applies the
override when the `0x400000` flag is set, so a dynamic-fee pool quoted against the stub falls back
to `slot0.lpFee` — the stored fee — not to nothing.

### Replay

Every number replays with one command:

```bash
make gate-a3                                   # reproduces five known bps, cannot be faked
make measure HOOK=0x985c14baa2a18316ffda0aefb3a632fadfca2acc BLOCK=50614000
python3 -m tare.cli sweep --rpc http://127.0.0.1:8545 --block 50614000
```

`make gate-a3` is the one an agent cannot fake: the five expected values in
[`engine/tare/gates/a3.py:16`](../engine/tare/gates/a3.py) were produced by an independent rewrite of
this engine before the current code existed, and the tolerance is 0.05 bps.

---

## 2. The corpus

| | |
|---|---|
| Rows | **995** — 720 `MEASURED`, 265 `NOT_QUOTABLE`, 10 `NOT_MEASURABLE`, 0 `INTERPOLATED` |
| Pools | 199 discovered, 144 with at least one reading |
| Hooks | 12 |
| Chain / block | Base (8453), block **50,614,000**, pinned |
| Sizes | 1e14 · 1e15 · 1e16 · 1e17 · 1e18 wei of currency-in |
| Engine | `tare-engine/0.3.0`, stub `0x8e39b2ad…37a4` |

File: [`docs/dataset/measurements.jsonl`](dataset/measurements.jsonl) — one JSON object per line,
21 fields, flushed and `fsync`ed per row. Summary:
[`docs/dataset/summary.json`](dataset/summary.json).

**The finding.** 545 rows read above 1 bps on pools whose LP fee, read straight out of
`PoolManager` storage, is **zero** — across 109 pools and 6 hooks. Median 100.00 bps, max
1176.46 bps. 63 profiles are not flat across the size ramp; the sharpest runs 689.95 bps at 1e14
down to 406.64 bps at 1e18.

These are not accusations. Most of those pools carry `fee = 0x800000`, the dynamic-fee flag, which
means the hook is *supposed* to set the price per swap and `slot0.lpFee` is *supposed* to read zero.
That is exactly the point: the protocol has a legitimate mechanism whose magnitude nothing anywhere
records, and this corpus is a reading of the magnitude.

---

## 3. Known limits

**One block.** Everything here is block 50,614,000. A hook with a time-decaying fee — and at least
one in this corpus is described that way in the registry — reads differently at another block. The
block is in every row for that reason.

**One chain.** Base. 8453 is in every row.

**Five sizes, two directions, and only the quotable one.** 140 of the 199 pools quote in exactly one
direction ([`docs/feedback-evidence/quote-direction.json`](feedback-evidence/quote-direction.json)).
The corpus records the direction it could read. The other side is unmeasured, not zero.

**Custom accounting is out of reach, by construction.** When a hook *is* the liquidity, removing it
does not expose a fee, it removes the venue. The stub quote then comes back better than the real
one, and the counterfactual measures the destruction rather than the extraction. Those rows are
`NOT_MEASURABLE` with reason `custom accounting`
([`engine/tare/measure.py:97–99`](../engine/tare/measure.py)). 10 rows.

**A quote is not a swap.** `V4Quoter` simulates. It does not pay gas, does not cross a real
mempool, and does not experience the ordering a live swap experiences. What TARE measures is the
price the protocol would quote, which is what a router reads and what a user is shown.

**Coverage is not the population.** 12 hooks. There are hundreds deployed on Base alone. Silence
about the rest is silence, not a zero.

**One measurer per fork.** `measure` writes global state on the node. Two processes on one anvil
read each other's stub. Parallelism means several forks, one process each
(`--shard i --of n`, one `--rpc` per shard). The guard is
[`engine/tare/sweep.py:137–142`](../engine/tare/sweep.py) and it refuses a reading rather than
publishing a contended one. See false finding #5 below.

---

## 4. The five false findings

This project produced five wrong results and corrected all five. Each one is written here because
each one is a class of error that a reader should assume is present in any measurement pipeline that
does not name it, and because four of the five have the same shape: **a bounded read treated as a
complete one**.

### #1 — the `[:3]` slice

An early discovery pass sliced a list of candidate pools to its first three entries while debugging,
and the slice stayed. The counts printed afterwards — pools per hook, hooks per token — were all
computed over three items and were all reported as totals. The numbers looked plausible, which is
why it survived.

**Class.** A debugging bound left in the data path.
**Correction.** Enumeration is complete or the row is `NOT_MEASURABLE`; nothing in the pipeline
silently limits a set. The sweep writes one line per (pool, size) whether or not it succeeded
([`engine/tare/sweep.py:145–164`](../engine/tare/sweep.py), `unmeasurable`) so that a shrinking denominator is
impossible to hide.

### #2 — the 2,000-byte body

An HTTP reader capped response bodies at 2,000 bytes. A registry page and an RPC response both came
back longer than that. The parser did not fail — it parsed the prefix, found no match, and returned
"absent". Two hooks were reported as absent from the registry when they were in it, past the cutoff.

**Class.** A truncated body that parses cleanly.
**Correction.** [`engine/tare/rpc.py:19–27`](../engine/tare/rpc.py) reads the whole body and never
truncates; the comment above it says why.

### #3 — the `head -c 220`

A shell probe piped an RPC response through `head -c 220` to keep the terminal readable. The
truncated output was then read as the result. It reported an empty error field, and the run was
recorded as "no revert, quote succeeded, zero difference" for pools that had in fact reverted.

**Class.** A display bound mistaken for a data bound.
**Correction.** No verdict is ever taken from a shell one-liner. Every value in the corpus is
produced by [`engine/tare/measure.py`](../engine/tare/measure.py) and written by
[`engine/tare/sweep.py`](../engine/tare/sweep.py).

### #4 — the 200-character error string, and the selector at byte 68

This is the sharpest of the five, because the cutoff was *almost* long enough.

`V4Quoter` does not surface `NotEnoughLiquidity` directly. `BaseV4Quoter.sol:16` declares
`error NotEnoughLiquidity(PoolId)`; the revert bubbles up through
`QuoterRevert.bubbleReason`, and `QuoterRevert.parseQuoteAmount`
([`QuoterRevert.sol:35–40`](https://github.com/Uniswap/v4-periphery/blob/main/src/libraries/QuoterRevert.sol#L35-L40))
re-wraps any reason that is not `QuoteSwap` inside `UnexpectedRevertBytes(bytes)`. The wire format
is therefore:

```
0x6190b2b0                                                          selector UnexpectedRevertBytes  (4 bytes)
  0000…0020                                                         offset of the bytes             (32 bytes)
  0000…0024                                                         length = 36                     (32 bytes)
  7a5ed734 706140c9…                                                NotEnoughLiquidity + poolId
  ^ byte 68 of the revert data
```

`rpc.py` truncated error strings to 200 characters. In the real revert captured from a Base fork,
the selector `7a5ed734` **starts at index 197** of the error string and is 8 characters long — so a
200-character cutoff sliced it in half, the substring match never fired, and every unquotable pool
came back with an opaque reason. Pools that had said "not enough liquidity, try the other
direction" were recorded as generic failures, and the sweep discarded them.

**Class.** A bound that lands inside the identifying token.
**Correction.** The truncation is gone, and the regression is pinned to the **real captured
revert**, not a reconstruction:
[`engine/tests/test_quote.py:45–82`](../engine/tests/test_quote.py) with
[`engine/tests/fixture_revert.txt`](../engine/tests/fixture_revert.txt). One of the five assertions
verifies that `rpc.py`'s own source contains no `[:200]`. An earlier version of that test hand-typed
an approximation of the revert and asserted the wrong thing about it — which is a sixth mistake,
caught before it produced a finding.

### #5 — a rate limit recorded as a property of the pool

The first real sweep produced ten `NOT_QUOTABLE` rows for two perfectly healthy pools. The `reason`
field held `failed to get storage for 0x498…`: the upstream archive node behind the fork was
rate-limiting anvil, anvil could not backfill the pool's storage slots, and the quote reverted.

`NOT_QUOTABLE` means *the pool said no*. What had happened is that **the instrument broke**. Written
down as a property of the pool, it would have said "this pool cannot be swapped" about two pools
that swap fine — and worse, it would have been indistinguishable from a real refusal in every
statistic computed afterwards.

**Class.** Instrument failure attributed to the subject.
**Correction.** Every failure is classified before it is labelled
([`engine/tare/sweep.py:88–119`](../engine/tare/sweep.py)). Twenty infrastructure markers route a
failure to a retry; a failure that survives four attempts becomes `NOT_MEASURABLE` with an
`rpc_unavailable:` reason, which says *we could not look*, and never `NOT_QUOTABLE`, which says
*the pool said no*. Those rows are also excluded from the resume set
([`engine/tare/sweep.py:246–254`](../engine/tare/sweep.py), `is_observation`), so a five-minute outage does not freeze
a permanent hole that no later run would ever fill.

### #6 — two measurers on one fork

Not on the original list of five, and found last, and the most dangerous of all, because it does not
produce an error — it produces a **clean, plausible, wrong number**.

`measure` installs the stub, quotes, and restores the original. That is global mutable state on the
node. With two processes on one anvil: A installs the stub, B quotes "with hook" and gets A's
stubbed pool, B computes `out_with == out_without`, and B publishes **0.00 bps for a hook that takes
100**.

This was not hypothetical. Replaying three rows of the first dataset against an anvil that a shard
was still sweeping reproduced one of them and destroyed the other two: 100.00 bps came back
as 0.00.

**Class.** Shared mutable state producing a valid-looking measurement.
**Correction.** One measuring process per fork, and a guard that makes a violation loud instead of
numeric: before each measurement, `stub_is_installed` checks whether the hook already wears the stub
([`engine/tare/sweep.py:137–142`](../engine/tare/sweep.py)); if it does after a backoff, the row is
`NOT_MEASURABLE` with reason `concurrent_measurer:` and no number at all
([`engine/tare/sweep.py:181–189`](../engine/tare/sweep.py)). The same rule is stated at the top of
the CLI ([`engine/tare/cli.py:13–19`](../engine/tare/cli.py)) and in the module docstring
([`engine/tare/sweep.py:23–27`](../engine/tare/sweep.py)).

---

## 5. What the five have in common

Four of the six are the same mistake: **a read was bounded, the bound was invisible, and the
truncated result parsed cleanly.** None of them raised an exception. All of them produced a number.
That is why honesty rule 3 is stated as an absolute rather than as a preference:

> A bounded read, a timeout, a rate limit → `NOT_MEASURABLE`. Never a value. Never a zero.

The remaining two are the other half of the same problem: a failure of the instrument, and a
collision between instruments, both silently attributed to the subject.

Labels: [`HONESTY.md`](HONESTY.md). Feedback to the Uniswap stack: [`../FEEDBACK.md`](../FEEDBACK.md).
