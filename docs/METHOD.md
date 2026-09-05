# METHOD — from an `Initialize` log to a basis point

Every claim in this file names a file **and a line**. If a line number does not say what this file
says it says, this file is wrong and the code is right.

Companion documents: what the method **cannot** say is [`LIMITS.md`](LIMITS.md); the four labels and
the eight false results this project produced are [`HONESTY.md`](HONESTY.md).

---

## 1. The wall

A Uniswap v4 pool's identity is its `PoolKey`, and the hook's address is one of the five fields
inside it:

```
poolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
                                                             ^^^^^^^^^^^^^^ the hook
```

[`engine/tare/poolid.py:33-37`](../engine/tare/poolid.py).

So **"this pool without its hook" is not a pool that exists.** Change the `hooks` field and you get a
different `poolId`, which addresses different storage, holds different liquidity, and quotes a
different price. That is pinned as a test rather than asserted:
[`engine/tests/test_poolid.py:37-40`](../engine/tests/test_poolid.py) —
`test_hook_address_changes_pool_id`.

Any tool that compares a hooked pool against "the same pool without a hook" is comparing two
different venues and calling the difference a fee.

## 2. The trick

TARE does not change the pool. **It changes the hook.**

```
              fork pinned at block 50,614,000 (Base, chain 8453)
                                  |
        quote #1 ─────────────────┴───────────────── quote #2
   hook bytecode = real                     hook bytecode = 89-byte inert stub
              \                                          /
               \                                        /
      same PoolKey · same poolId · same slot0 · same liquidity · same reserves
                 the only difference is the code that runs
```

`anvil_setCode` rewrites the bytecode **at the hook's address**
([`engine/tare/rpc.py:61-62`](../engine/tare/rpc.py)). The `PoolKey` is untouched, so the `poolId` is
byte-identical; `slot0`, the tick, the fee fields and the position map are untouched, so the pool is
the same pool. Two calls to `V4Quoter.quoteExactInputSingle` with identical arguments then differ by
exactly one thing.

```
bps = (out_without − out_with) / out_without × 10 000
```

[`engine/tare/measure.py:96`](../engine/tare/measure.py). The original bytecode is captured before
the write and restored in a `finally`
([`engine/tare/measure.py:85-90`](../engine/tare/measure.py)), so a crash mid-quote cannot leave a
hook stubbed.

A negative result is **not** negative extraction. Below −100 bps the row is `NOT_MEASURABLE` with
reason `custom accounting` and carries no number at all
([`engine/tare/measure.py:28`](../engine/tare/measure.py) for the threshold,
[`:97-99`](../engine/tare/measure.py) for the branch). Why, in [`LIMITS.md`](LIMITS.md), section 4.

## 3. The stub, and the invariants it has to satisfy

`v4-core/src/libraries/Hooks.sol` does not check what a hook *does*. It checks what a hook
*returns*:

| invariant | upstream | what the stub does |
|---|---|---|
| every hook call returns ≥ 32 bytes, word 0 = the selector called | `Hooks.sol:153` | masks `CALLDATALOAD 0`, `MSTORE` at 0 |
| `beforeSwap` returns exactly 96 bytes — selector, `BeforeSwapDelta`, `lpFeeOverride` | `Hooks.sol:166` | `60606000f3` |
| the delta-returning path requires exactly 64 bytes | `Hooks.sol:259` | `60406000f3` |

The smallest program satisfying the protocol while doing nothing is therefore: read the incoming
selector, echo it in word 0, return 96 bytes for `beforeSwap` and 64 otherwise. That is **89 bytes**
of EVM, written out opcode by opcode in
[`engine/tare/stub.py:25-36`](../engine/tare/stub.py) and taken apart assertion by assertion in
[`engine/tests/test_stub.py:6-35`](../engine/tests/test_stub.py).

> `v4-core` is **not vendored in this repository**. The three `Hooks.sol` line numbers above are
> upstream references and are not verified by this repo's test suite. What *is* verified here is the
> stub's own byte sequences and its size and hash
> ([`engine/tests/test_stub.py:10-28`](../engine/tests/test_stub.py)).

`keccak256` of the stub is

```
0x8e39b2ad4344342b4f7dc5cf31df0aec9bd5b5f8ec7fccd241256cf1fda637a4
```

([`engine/tare/stub.py:41-42`](../engine/tare/stub.py), pinned at
[`engine/tests/test_stub.py:14-16`](../engine/tests/test_stub.py)) and **every row of the corpus
carries it** in its `stub_hash` field
([`engine/tare/measure.py:76`](../engine/tare/measure.py)). Changing the stub invalidates the corpus
visibly instead of silently.

### The one subtlety, and it was checked because an earlier version got it backwards

The stub returns `lpFeeOverride = 0`, and **zero does not mean "zero fee"**. `Pool.sol` only applies
the override when the `0x400000` flag is set, so a dynamic-fee pool quoted against the stub falls
back to `slot0.lpFee` — the *stored* fee — not to nothing. The note lives with the code that depends
on it, [`engine/tare/stub.py:16-19`](../engine/tare/stub.py). (`Pool.sol` is likewise upstream and
not vendored here.)

### The stub has to actually be there, and that is checked twice

`anvil_setCode` returning cleanly does not prove the code was written. If the write is accepted and
not applied — or if a second process restores the hook between the write and the quote, which is
exactly [false finding #5](HONESTY.md) — then the "without hook" quote runs against the **real
hook**. The two quotes are identical, the difference is exactly zero, and the row is published as
`MEASURED 0.00 bps`.

That is the worst shape a failure can take here, because it is indistinguishable from a true result:
hooks that take nothing do exist. Four of them sit on ETH/USDC, with `BEFORE_SWAP`, `AFTER_SWAP` and
`AFTER_SWAP_RETURNS_DELTA` all set — permitted to take, and taking nothing.

So the code at the hook's address is read back **after the write and again after the quote**
([`engine/tare/measure.py:82-110`](../engine/tare/measure.py)). If it is not the stub, byte for
byte, the row is `NOT_MEASURABLE` and carries which of the two checks failed — never a zero.

The guard was added after 8,681 `MEASURED` rows had already been published, 51 of them exactly
`0.0000`. Three hooks were zero across every one of their measurements — the profile a silent stub
failure would produce. **All 26 of those rows were replayed with the guard active and reproduced
identically**, so no published zero was an artefact. The check is there for the next run, not to
repair this one.

```bash
cd engine && python3 -m unittest tests.test_measure.TestLeTalonDoitEtreLa -v
```


## 4. From the log to the pool list

```
eth_getLogs(PoolManager, topic0 = Initialize)          collect.py:26-28   consts.py:25
        │
        ├─ decode the PoolKey out of the log            rescan.py:27-34
        │      topics[2] = currency0   topics[3] = currency1
        │      data[0:64] = fee   data[64:128] = tickSpacing (signed)   data[128+24:192] = hook
        │
        ├─ poolId  = keccak256(abi.encode(key))         poolid.py:33-37
        ├─ stateSlot = keccak256(poolId ‖ uint256(6))   poolid.py:39-43
        ├─ liquidity = extsload(stateSlot + 3)          poolid.py:48-49, rescan.py:41-49
        │
        └─ liquidity > 0  ->  docs/pools-liquides.json  (199 pools)      rescan.py:76-78
```

**Slot 6.** `PoolManager` holds `mapping(PoolId => Pool.State) pools` at storage slot 6; within
`Pool.State`, `slot0` is at `+0`, `feeGrowthGlobal0` at `+1`, `feeGrowthGlobal1` at `+2` and
`liquidity` at `+3`. The three constants are
[`engine/tare/consts.py:10-12`](../engine/tare/consts.py); the derivation is
[`engine/tare/poolid.py:39-49`](../engine/tare/poolid.py).

**`extsload`.** `PoolManager` exposes raw storage through `extsload(bytes32)`. The selector is
computed, not typed: `keccak256("extsload(bytes32)")[:4]`
([`engine/tare/measure.py:25`](../engine/tare/measure.py)).

**Why this is checked against a live pool and not against itself.** A wrong slot derivation returns
a plausible **zero**, not an error — which is exactly how an earlier version of this project
concluded that 100 % of pools were empty. So the derivation is pinned to a real Base pool whose
`poolId` was read off the chain: [`engine/tests/test_poolid.py:6-24`](../engine/tests/test_poolid.py)
asserts both the `poolId` and that `liquidity_slot − slot0 == 3`.

**A failure is never a zero.** `rescan.read` returns `None` (UNKNOWN) on an RPC error or an empty
return, never `0` ([`engine/tare/rescan.py:41-49`](../engine/tare/rescan.py)), and the scan prints
the unreadable count next to the result
([`engine/tare/rescan.py:71-73`](../engine/tare/rescan.py)). The log collector does the same with
its window: every failed chunk is reported and the real coverage is printed
([`engine/tare/collect.py:46-48`](../engine/tare/collect.py)).

## 5. The stored fee — lpFee at bits 208-231

Every measured row records what the pool's fee field says on-chain, so that a reader can put the
measurement next to the declaration.

`slot0` is one packed word (v4-core `Slot0.sol`), read from the low end:

```
 bits   0..159   sqrtPriceX96
 bits 160..183   tick
 bits 184..207   protocolFee
 bits 208..231   lpFee          <- the pool's stored LP fee, uint24
```

[`engine/tare/consts.py:14-19`](../engine/tare/consts.py). The read is one `extsload` at
`stateSlot + 0`, shifted and masked to 24 bits:
[`engine/tare/measure.py:57-62`](../engine/tare/measure.py). It lands in the row as
`stored_lp_fee` / `stored_protocol_fee`
([`engine/tare/measure.py:74`](../engine/tare/measure.py)), and it is `None` — not `0` — whenever the
node could not serve it ([`engine/tare/sweep.py:154-158`](../engine/tare/sweep.py); the docstring at
[`:148-152`](../engine/tare/sweep.py) says why a zero there would fabricate a hidden fee).

Separately, the `fee` field **of the PoolKey** carries `0x800000` when the hook is meant to set the
price per swap ([`engine/tare/consts.py:22`](../engine/tare/consts.py),
[`engine/tare/poolid.py:29-31`](../engine/tare/poolid.py)). That flag is recorded per row as
`fee_is_dynamic`. It is the difference between "the fee field reads zero because nothing was set"
and "the fee field reads zero because the protocol expects the hook to set it" — see
[`LIMITS.md`](LIMITS.md), section 6.

## 6. The quote

```
quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))
```

Selector `aa9d21cb` ([`engine/tare/quote.py:12`](../engine/tare/quote.py), checked against
`cast sig`). One dynamic member (`hookData`) makes the outer tuple dynamic, so the head is a single
`0x20` offset followed by the struct: [`engine/tare/quote.py:28-36`](../engine/tare/quote.py).

A quote either returns an amount or reverts. `V4Quoter` does **not** surface `NotEnoughLiquidity`
directly: it re-wraps any non-`QuoteSwap` reason inside `UnexpectedRevertBytes(bytes)`, so the
identifying selector sits deep inside the error string. Both selectors are constants
([`engine/tare/quote.py:15`](../engine/tare/quote.py) and
[`:20`](../engine/tare/quote.py)) and the second is derived from its signature in a test rather than
trusted ([`engine/tests/test_quote.py:40-42`](../engine/tests/test_quote.py)). The full wire format,
and the false finding it produced, are in
[`HONESTY.md`](HONESTY.md), false result #7.

## 7. The sweep

The corpus is one measurement repeated. Six facts about the fork drive the design, and all six are
stated in [`engine/tare/sweep.py:1-46`](../engine/tare/sweep.py):

1. **A pool usually quotes in one direction only.** `V4Quoter` reverts with `NotEnoughLiquidity`
   for the other side, and the first version of this sweep read that revert as "dead pool" — it
   discarded 77.6% of the pools it touched. The fix was to *probe* for a quotable side
   ([`engine/tare/sweep.py:358-382`](../engine/tare/sweep.py)); fact 5 replaced the probe with
   something better.
2. **The first RPC touch of a pool is expensive, the next ones are free** — anvil backfills the
   pool's slots once. So the sweep is grouped **by pool**: every size, both directions, back to
   back ([`engine/tare/sweep.py:385-426`](../engine/tare/sweep.py)).
3. **A run gets interrupted.** Output is JSONL, one row per line, `flush` + `fsync` per row
   ([`engine/tare/sweep.py:330-337`](../engine/tare/sweep.py)). The resume key is
   `(pool_id, block_number, amount_in, zero_for_one)`
   ([`engine/tare/sweep.py:269-281`](../engine/tare/sweep.py)). A row that only records a node
   failure does **not** count as done ([`:294-302`](../engine/tare/sweep.py)).
4. **A fork holds exactly one measurer.** The stub is global mutable state on the node. Parallelism
   means several *forks*, one process each: `--shard i --of n`, one `--rpc` per shard
   ([`engine/tare/cli.py:13-22`](../engine/tare/cli.py)). Before each measurement,
   `stub_is_installed` checks whether the hook already wears the stub
   ([`engine/tare/sweep.py:176-181`](../engine/tare/sweep.py)); if it still does after a backoff the
   row is `NOT_MEASURABLE` with reason `concurrent_measurer:` and **no number**
   ([`:220-229`](../engine/tare/sweep.py)). This is false result #5 in [`HONESTY.md`](HONESTY.md).
5. **One direction per pool was a sampling decision, not a fact about the pool.** The probe of
   fact 1 recovered the pools an earlier sweep had thrown away, but it also meant the corpus could
   never answer *does this hook take the same cut both ways?* — and it can differ, because
   `beforeSwap` is handed `zeroForOne`. The sweep now measures **both** directions
   ([`engine/tare/sweep.py:76`](../engine/tare/sweep.py),
   [`:385-426`](../engine/tare/sweep.py)) and the direction is part of the resume key: without it
   `dedupe` would keep one line of the two and a pool that charges differently each way would be
   published with whichever number was written last.
6. **A hook can read `tx.origin`.** Through `eth_call`, `from` sets the origin of the whole call.
   It does *not* reach the hook as `sender` — v4 passes whoever called `PoolManager.swap`, which
   for a quote is always the quoter — so the only channel from the caller to the hook is
   `tx.origin`. `sweep_callers` quotes the identical swap from several origins and reports whether
   the output moves ([`engine/tare/sweep.py:775-818`](../engine/tare/sweep.py)); the verdict rules
   are [`:830-872`](../engine/tare/sweep.py). Section 7b says what that can and cannot see.

Sizes: `1e12 · 1e13 · 1e14 · 1e15 · 1e16 · 1e17 · 1e18 · 1e19` wei of currency-in
([`engine/tare/sweep.py:72`](../engine/tare/sweep.py)) — eight decades, in both directions, so one
pool is 16 cells. Gate A3 keeps its own five decades on purpose: it reproduces numbers that predate
this file and must not move when the grid does
([`engine/tare/gates/a3.py:16`](../engine/tare/gates/a3.py)).

Nothing invents a value and nothing disappears. Every (pool, size, direction) cell gets exactly one
line: a pool that refuses the swap gets `NOT_QUOTABLE` carrying the revert reason, a pool the node
could not serve gets `NOT_MEASURABLE` saying so. Never zero lines, and never a zero
([`engine/tare/sweep.py:184-203`](../engine/tare/sweep.py),
[`:478-483`](../engine/tare/sweep.py)).

**An instrument failure is not a pool verdict, and the list of what counts as one is exhaustive or
it is decorative.** `INFRA_MARKERS` ([`engine/tare/sweep.py:120-145`](../engine/tare/sweep.py))
knew `failed to get storage` but not the three wordings `rpc.py` raises itself — `transport
failure`, `empty body`, `HTTP 429`. Widening the size grid made the sweep touch pools cold enough
that the first quote outlives curl's timeout, and every one of those came back labelled
`NOT_QUOTABLE`: the instrument's clock published as the pool's answer. Caught on the first real run
of the wider grid and fixed before publication; the corpus carries none of them, checked line by
line. Three tests now copy the exact strings from the three `raise` sites in `rpc.py`.

## 7b. The caller axis

A separate file with a separate schema, because it answers a separate — and narrower — question:
**does the quoted output of the identical swap move when `tx.origin` moves?**

Four origins ([`engine/tare/sweep.py:705-710`](../engine/tare/sweep.py)), two sizes, both
directions, one line per reading in [`docs/dataset/callers.jsonl`](dataset/callers.jsonl), folded
into [`docs/dataset/callers-summary.json`](dataset/callers-summary.json). Whether each origin
carries code is read off the fork at run time and written into the summary rather than assumed.

    ORIGIN_SENSITIVE   at least one cell where the origins disagree — a different amount out, or
                       one origin quoting where another reverts
    ORIGIN_INVARIANT   every readable cell gave every origin the same answer
    NOT_QUOTABLE       no origin got a quote anywhere, and the pool is what said no
    NOT_MEASURABLE     the node is what said no, so nothing was established

**What this cannot see, stated in the summary itself** (`caveat`): `ORIGIN_INVARIANT` means "does
not branch on `tx.origin`", *not* "treats every caller alike". A hook can still branch on
`hookData`, on a router it recognises as `sender`, or on state that only exists inside a real
transaction. A cell where any origin hit the node instead of the pool is not compared at all —
comparing an origin that answered against one that could not be read is how a rate limit becomes a
discrimination finding.

    python3 -m tare.sweep callers --rpc http://127.0.0.1:8600 \
        --pools docs/dataset/pools-liquides-full.json --block 50614000

The summary is recomputed from the rows every time, never carried over
([`engine/tare/sweep.py:591-666`](../engine/tare/sweep.py)), after de-duplicating on the resume key —
overlapping shards would otherwise inflate every figure
([`engine/tare/sweep.py:572-588`](../engine/tare/sweep.py)). Instrument health is reported *next to*
the results, not behind them: `n_rpc_unavailable` counts every line that describes the instrument
instead of a pool ([`engine/tare/sweep.py:623`](../engine/tare/sweep.py)).

A pool is now **two curves**, not one. `profile` refuses a mixture of directions and raises rather
than interleave two series into one invented slope
([`engine/tare/sweep.py:495-526`](../engine/tare/sweep.py)); `profiles_of` splits on
`(pool_id, zero_for_one)` ([`:529-534`](../engine/tare/sweep.py)). `asymmetries`
([`:537-569`](../engine/tare/sweep.py)) differences the two sides **only where both were measured
at the same size** — one side at 1e12 against the other at 1e19 is not a comparison, it is the size
curve — and a side that simply does not quote is not listed at all, because that is a liquidity
fact and it already has its own `NOT_QUOTABLE` rows.

## 8. The corpus

| | |
|---|---|
| Rows | **995** — 720 `MEASURED`, 265 `NOT_QUOTABLE`, 10 `NOT_MEASURABLE`, 0 `INTERPOLATED` |
| Pools | 199 discovered with non-zero liquidity, 144 with at least one reading |
| Hooks | 12 present, 11 with at least one reading |
| Chain / block | Base (8453), block **50,614,000**, pinned |
| Sizes | 1e14 · 1e15 · 1e16 · 1e17 · 1e18 wei of currency-in |
| Engine | `tare-engine/0.3.0`, stub `0x8e39b2ad…37a4` |

Every figure in this table is a field of [`docs/dataset/summary.json`](dataset/summary.json), which
is itself recomputed from [`docs/dataset/measurements.jsonl`](dataset/measurements.jsonl) — 21 fields
per row ([`engine/tare/sweep.py:65-70`](../engine/tare/sweep.py)).

**The reading this corpus exists to support.** 545 rows read above 1 bps on pools whose LP fee, taken
straight out of `PoolManager` storage, is **zero** — across 109 pools and 6 hooks
(`n_gt_1bps_at_zero_stored_lp_fee`, `n_pools_…`, `n_hooks_…` in
[`summary.json`](dataset/summary.json); the filter is
[`engine/tare/sweep.py:494`](../engine/tare/sweep.py)). Median 100.00 bps, max 1176.46 bps. 63
profiles travel more than 5 bps across the size ramp; the sharpest runs 689.95 bps at 1e14 down to
406.64 bps at 1e18 (`non_flat_profiles[0]`).

**These are readings, not accusations.** 410 of those 545 rows sit on a `PoolKey` that carries the
dynamic-fee flag, which means the protocol *expects* the hook to set the price and `slot0.lpFee` is
*supposed* to read zero. That is the point rather than a caveat: the protocol has a legitimate
mechanism whose magnitude nothing anywhere records, and this corpus is a reading of the magnitude.
What that does and does not license you to say is [`LIMITS.md`](LIMITS.md), section 6.

## 9. Replay

Every number replays with one command.

```bash
docker compose up -d                              # anvil, forked and pinned

make gate-a3                                      # reproduces five known bps — cannot be faked
make measure HOOK=0x985c14baa2a18316ffda0aefb3a632fadfca2acc BLOCK=50614000
cd engine && python3 -m tare.cli sweep --rpc http://127.0.0.1:8545 --block 50614000
cd engine && python3 -m tare.cli summary
```

`make gate-a3` ([`Makefile:17-19`](../Makefile)) is the one an agent cannot fake. It re-measures hook
`0x1aea38f0…` on a named pool at the five sizes and compares against five values that are **not
parameters**: they were produced by an independent rewrite of this engine before the current code
existed, and the tolerance is 0.05 bps
([`engine/tare/gates/a3.py:11-17`](../engine/tare/gates/a3.py)).

```
        1e14  expected  99.99      1e17  expected  93.10
        1e15  expected  99.93      1e18  expected  57.44
        1e16  expected  99.26
```

Every CLI command prints the one-liner that replays it
([`engine/tare/cli.py:10-11`](../engine/tare/cli.py),
[`engine/tare/cli.py:81`](../engine/tare/cli.py)). A value you cannot replay is a claim, not a
measurement.

**The 14-bit decoder replays too.** A hook's permissions are not stored anywhere — they *are* the low
14 bits of its address, which is why hooks are CREATE2-mined
([`engine/tare/flags.py:8-46`](../engine/tare/flags.py)). Decoded addresses are compared bit by bit
against the registry's own booleans:
[`engine/tests/test_flags.py:30-52`](../engine/tests/test_flags.py) prints
`8582 comparaisons de bits, 0 écart` over the 613-entry `docs/hooklist.json`. Re-run against the
978-entry live snapshot `docs/hooklist-live-20260905.json`, the same decoder gives **13 692
comparisons, 0 deviation** (978 × 14).

```bash
cd engine && python3 -m unittest discover -s tests -t .     # 168/168
```
