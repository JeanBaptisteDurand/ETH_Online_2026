# HONESTY — the four labels, what we refuse to say, and every false result we produced

Two halves. The first says what a TARE number is allowed to claim. The second is the list of times
this project claimed something false, how each one was caught, and what makes it impossible now.
The second half is the reason to trust the first.

How a number is produced: [`METHOD.md`](METHOD.md). What it cannot say: [`LIMITS.md`](LIMITS.md).

---

# Part I — the four labels

Every number TARE prints carries one of four labels. A label is a statement about **how we know**,
not about how the number looks. It is decided by the code that produced the row and it is **never
promoted** afterwards — no aggregation, no display layer, no model may turn one label into a better
one.

The enum is declared once per runtime and the runtimes are checked against each other:

| runtime | file | line |
|---|---|---|
| engine (Python) | [`engine/tare/sweep.py`](../engine/tare/sweep.py) | 72 |
| API (TypeScript) | [`apps/api/src/labels.ts`](../apps/api/src/labels.ts) | 12 |
| MCP (TypeScript) | [`apps/mcp/src/labels.ts`](../apps/mcp/src/labels.ts) | 14 |

Only two of the four may ever carry a number
([`apps/api/src/labels.ts:15-16`](../apps/api/src/labels.ts), `NUMERIC_LABELS`).

## `MEASURED`

**What it means.** The counterfactual ran. The same swap — same pool, same size, same direction,
same block — was quoted twice against the same pinned fork: once with the hook's real bytecode, once
with the hook's address holding the 89-byte inert stub. Both quotes returned an amount. The label
carries the difference.

**What produced it.** [`engine/tare/measure.py:96-102`](../engine/tare/measure.py).

**What it does not mean.** It does not mean "this hook charges this fee". It means: at this block,
on this pool, for this size and this direction, replacing the hook's code with a compliant no-op
changed the quote by this much. Attributing that difference to a fee, to a rebate, to routing, or to
custom accounting is an **interpretation**, and we have not read the hooks' code
([`LIMITS.md`](LIMITS.md), section 6).

## `INTERPOLATED`

**What it means.** No measurement exists at the requested size, but two `MEASURED` points bracket it
on the same pool, same direction, same block, and the value between them was computed rather than
observed.

**What produced it.** [`apps/mcp/src/interpolate.ts:23`](../apps/mcp/src/interpolate.ts). It refuses
to extrapolate: a target outside the measured range returns a reason, not a number
([`apps/mcp/src/interpolate.ts:29-31`](../apps/mcp/src/interpolate.ts)).

**What it does not mean.** It is not a measurement and it never becomes one. It is displayed with the
two endpoints it was computed from, so the reader can see the span. When those endpoints are far
apart — 63 of the profiles in the corpus are not flat, the sharpest running from 689.95 bps at 1e14
down to 406.64 bps at 1e18 ([`summary.json`](dataset/summary.json), `non_flat_profiles[0]`) — an
interpolated value between them is a guess with a shape, not a reading.

**There are zero `INTERPOLATED` rows in the committed corpus.** Every number in
`measurements.jsonl` was observed.

## `NOT_QUOTABLE`

**What it means.** We asked and **the pool said no**. `V4Quoter` reverted with a v4 custom error —
in practice almost always `NotEnoughLiquidity` — for that size and that direction. The row carries
the reason string.

**What produced it.** [`engine/tare/measure.py:81-83`](../engine/tare/measure.py), classified by
[`engine/tare/sweep.py:108-119`](../engine/tare/sweep.py).

**What it does not mean.** It does not mean the pool is dead and it does not mean the hook takes
nothing. On the 199-pool sample measured separately, 140 pools quote in exactly one direction
([`docs/feedback-evidence/quote-direction.json`](feedback-evidence/quote-direction.json)); the other
side of every one of them is a `NOT_QUOTABLE` that says nothing whatsoever about the hook. In the
current corpus, **2,071 of 7,817 pools produced nothing but `NOT_QUOTABLE`**.

**61,466 rows** in the corpus: 35,883 `NOT_ENOUGH_LIQUIDITY`, 23,699 raw node reverts,
1,884 `ZERO_OUT`. That is 49 % of every row ever written here — and none of them is a zero.

## `NOT_MEASURABLE`

**What it means.** **We could not look**, or we looked and the counterfactual is meaningless here.
Three distinct situations share this label, and the `reason` field always says which:

1. `rpc_unavailable: …` — the node failed. Rate limit, timeout, a slot anvil could not backfill.
   **The instrument broke, not the subject.** Retried first
   ([`engine/tare/sweep.py:167-207`](../engine/tare/sweep.py), `measure_resilient`); if it survives
   four attempts it stays here forever rather than becoming a verdict about the pool.
2. `concurrent_measurer: …` — the stub was already installed on this hook when we arrived, so
   another measuring process owns this fork and anything we quote describes *its* stub
   ([`engine/tare/sweep.py:137-142`](../engine/tare/sweep.py),
   [`:181-189`](../engine/tare/sweep.py)).
3. `custom accounting` — the stub quote came back **better** than the real one by more than 100 bps.
   The hook is not taking a cut off a pool; the hook **is** the liquidity. Removing it does not
   reveal a fee, it destroys the venue
   ([`engine/tare/measure.py:97-99`](../engine/tare/measure.py)). 10 rows, 2 pools, 1 hook.

**What it does not mean.** It is not zero. It is not "no fee". It is the **absence of a reading**,
and the corpus keeps the row so that the absence occupies its line instead of silently shrinking the
denominator of every statistic computed later
([`engine/tare/sweep.py:145-152`](../engine/tare/sweep.py)). Rows of kinds 1 and 2 are also excluded
from the resume set ([`engine/tare/sweep.py:246-254`](../engine/tare/sweep.py), `is_observation`), so
a five-minute outage does not freeze a permanent hole no later run would ever fill.

---

## What we refuse to say

**We do not say "this hook charges X %".** We say: at block 50,614,000, on pool `0x…`, swapping
1e15 wei of currency0 for currency1, replacing the hook's bytecode with the inert stub moved the
quote by X bps. Every one of those qualifiers changes the number — 63 profiles in this corpus move by
more than 5 bps across the size ramp, one by 283 bps.

**We do not say "fee", "extraction" or "skim" about a hook whose code we have not read.** We have
read none of them. A publicly advertised 1 % launch fee and a silent 1 % skim produce the identical
reading, and 410 of the 545 above-1-bps-at-zero-lpFee rows sit on pools whose `PoolKey` carries the
dynamic-fee flag — the protocol's own sanctioned mechanism. [`LIMITS.md`](LIMITS.md), section 6.

**We do not turn a failed read into a value.** A truncated body, a timed-out call, a rate-limited
node, a short return — all of them are `NOT_MEASURABLE`. Every false result in Part II that produced
a *number* came from breaking this rule.

**We do not let the model produce a number.** The model picks what to query and explains what came
back. Numbers come from the engine, the API and the committed corpus, and every one replays with a
single command. Enforced in the tool descriptions
([`apps/mcp/src/server.ts:26`](../apps/mcp/src/server.ts), `NEVER_INVENT`;
[`:39`](../apps/mcp/src/server.ts)) and pinned by `apps/mcp/test/honesty.test.ts`.

**We do not aggregate what has no common unit.** `tare_impact` reports liquidity per pool and never
sums it: in-range `uint128` liquidity from different token pairs has no shared denomination. It
reports min / median / max of the measured subset together with the full list of values the median
was computed from, and it says how much of the hook's surface is *not* measured.

**We do not claim the corpus is the population.** 7,634 rows, 605 pools, 16 hooks, one chain, one
block. Everything outside that is unmeasured, and unmeasured is not zero.

**We do not upgrade a label to make a point.** The single largest reading in the corpus,
1800.99 bps, sits next to **61,466 `NOT_QUOTABLE` rows and 450 `NOT_MEASURABLE` rows** in the same
file, at the same weight, in the same schema.

---

# Part II — every false result this project produced

Eight. Six are on the project's own record from before and during this repository; two more were
found inside this repository and are reproducible here. Each is written out because each is a *class*
of error that a reader should assume is present in any measurement pipeline that does not name it.

**Five of the nine are the same mistake:** a read was bounded, the bound was invisible, and the
truncated result **parsed cleanly**. None of them raised an exception. All of them produced a number
or a verdict. That is why honesty rule 3 is stated as an absolute rather than a preference:

> A bounded read, a timeout, a rate limit → `NOT_MEASURABLE`. Never a value. Never a zero.

A note on provenance, because it is the point of this document: results **1 to 4** happened in this
team's earlier work (a grid-data pipeline, and an x402 ecosystem scan) before the TARE engine
existed, so their original figures are **not recomputable from this repository**. What *is* in this
repository is the guard that now prevents each class, cited by line, and in two cases a comment left
at the crime scene. Results **5 to 8** are TARE's own and are fully reproducible here.

---

### #1 — the `sorted(...)[:3]` that fabricated a divergence

**What was asserted.** A comparison run reported a specific, named example of divergence between two
data sources, with counts.

**Why it was false.** A `sorted(...)[:3]` slice, added while debugging to keep the output readable,
stayed in the data path. Everything downstream — the counts, the "worst offender", the example
itself — was computed over **three items** and reported as a total. The example of divergence was an
artefact of the slice: it was the top of a three-element list, not of the population.

**How we knew.** The numbers were plausible, which is why it survived; it was caught by re-running
the same comparison with the slice removed and getting a different "worst offender".

**Class.** *A debugging bound left in the data path.*

**What prevents it now.** Enumeration is complete or the row is `NOT_MEASURABLE`. Nothing in the
pipeline silently limits a set: the sweep writes one line per `(pool, size)` whether or not it
succeeded ([`engine/tare/sweep.py:145-164`](../engine/tare/sweep.py), `unmeasurable`;
[`:402-412`](../engine/tare/sweep.py) for the exception path), so a shrinking denominator is
impossible to hide. The only limiting flags are explicit CLI arguments (`--limit`, `--shard`) and
sharding is by **stride, not slice**, so no worker ever sees a prefix
([`engine/tare/cli.py:51-57`](../engine/tare/cli.py)).

### #2 — HTTP bodies read to 2,000 bytes: **17.3 % reported instead of 44.3 %**

**What was asserted.** That a given property held for **17.3 %** of an ecosystem's endpoints.

**Why it was false.** The HTTP reader capped response bodies at 2,000 bytes. Longer responses did not
fail — the parser parsed the prefix, found no match, and returned "absent". Every endpoint whose
relevant field sat past byte 2,000 was silently counted as a negative. The true figure was
**44.3 %**: more than two and a half times the number that was published.

**How we knew.** One endpoint that was known by hand to have the property was reported as not having
it. Reading its raw body showed the field at byte ~3,100.

**Class.** *A truncated body that parses cleanly.* A partial JSON read that happens to be valid is
the most dangerous kind of failure, because it never reaches an error handler.

**What prevents it now.** In the engine: [`engine/tare/rpc.py:49`](../engine/tare/rpc.py) parses the
**whole** body, with the comment `# full body, never truncated`, and the module docstring at
[`:1-6`](../engine/tare/rpc.py) says why. In the MCP server:
[`apps/mcp/src/rpc.ts:1-7`](../apps/mcp/src/rpc.ts) — `res.text()` then `JSON.parse`, "never a
bounded read, never a stream slice", because a truncated `eth_getCode` would keccak to a
wrong-but-plausible codehash and **invent a twin**. That specific failure is caught rather than
tolerated: an odd-length hex body returns `code_hex_has_odd_length_truncated_read`, never a hash
([`apps/mcp/src/tools/twins.ts:66`](../apps/mcp/src/tools/twins.ts), asserted at
[`apps/mcp/test/tools.test.ts:140-142`](../apps/mcp/test/tools.test.ts)).

### #3 — `head -c 220`: the false alert "Blocky402 does not do testnet"

**What was asserted.** That the x402 facilitator `api.testnet.blocky402.com` did not support a
testnet network — reported as a blocking finding.

**Why it was false.** A shell probe piped the facilitator's `/supported` response through
`head -c 220` to keep the terminal readable, and the truncated output was then read as **the
result**. The `hedera:testnet` entry sat past the cutoff. A display bound became a data bound, and a
working service was declared broken.

**How we knew.** Re-running the same `curl` without the pipe. The service had always answered.

**Class.** *A display bound mistaken for a data bound.* The bug was not in any program — it was in
the act of reading a program's output through a pager.

**What prevents it now.** No verdict is ever taken from a shell one-liner. Every value in the corpus
is produced by [`engine/tare/measure.py`](../engine/tare/measure.py) and written by
[`engine/tare/sweep.py`](../engine/tare/sweep.py). And the specific response is now **copied into a
fixture rather than remembered**: [`apps/api/test/helpers.ts:5-25`](../apps/api/test/helpers.ts)
returns exactly what `https://api.testnet.blocky402.com/supported` returned for Hedera on
2026-09-05, with the comment "la reponse est recopiee, pas inventee, sinon le test ne prouverait rien
du vrai protocole" — and it does contain `hedera:testnet`.

### #4 — a rate-limited RPC counted as an empty pool: **three chains declared to have no v4 activity**

**What was asserted.** That three chains had **no Uniswap v4 activity at all**.

**Why it was false.** The RPC client treated HTTP 429 like any other non-answer. A rate limit is not
a refusal — the node did not say "there is nothing", it said "not now". Counted as an absence, and
repeated across a scan, it emptied three chains.

**How we knew.** Re-running one of the three chains slowly, with backoff, returned pools.

**Class.** *Instrument failure attributed to the subject.* Structurally identical to #5 below, and
the reason both are written down separately.

**What prevents it now.** Three layers, and a comment left at the crime scene:

1. 429 / 502 / 503 / 504 raise a **distinct** exception, `RateLimited`, which is retried with
   exponential backoff and jitter ([`engine/tare/rpc.py:12-29`](../engine/tare/rpc.py)). Its
   docstring is the confession: *"A rate limit is not an answer. Treating one as an absence is how
   this project once concluded that three chains had no v4 activity at all."*
   ([`engine/tare/rpc.py:18-20`](../engine/tare/rpc.py)).
2. The transport is asked what actually happened rather than guessed at from an empty body —
   `curl -w '%{http_code}'`, because an unresolvable host also returns nothing
   ([`engine/tare/rpc.py:33-46`](../engine/tare/rpc.py)).
3. A failure that survives every retry is classified before it is labelled. Twenty infrastructure
   markers route it to `NOT_MEASURABLE` with an `rpc_unavailable:` reason — *we could not look* —
   and **never** to `NOT_QUOTABLE`, which means *the pool said no*
   ([`engine/tare/sweep.py:88-119`](../engine/tare/sweep.py)). The liquidity scan obeys the same
   rule: an unreadable pool is `UNKNOWN`, never `0`
   ([`engine/tare/rescan.py:41-49`](../engine/tare/rescan.py)).

This one also has a TARE-native recurrence, which is why layer 3 exists: the first real sweep
produced **ten `NOT_QUOTABLE` rows for two perfectly healthy pools**, with `reason` =
`failed to get storage for 0x498…`. The upstream archive node was rate-limiting anvil, anvil could
not backfill the pool's slots, and the quote reverted. Written down as a property of the pool it
would have said "this pool cannot be swapped" about two pools that swap fine — and it would have been
indistinguishable from a real refusal in every statistic computed afterwards. The narrative is kept
in the source, [`engine/tare/sweep.py:75-86`](../engine/tare/sweep.py).

### #5 — two measurers on one fork: **100 bps became 0.00**

The most dangerous of all, because it does not produce an error. It produces a **clean, plausible,
wrong number**.

**What was asserted.** That a hook took **0.00 bps** on pools where it takes 100.

**Why it was false.** `measure` installs the stub, quotes, and restores the original — global mutable
state on the node. With two processes on one anvil: A installs the stub; B quotes "with hook" and
gets A's stubbed pool; B computes `out_with == out_without`; B publishes 0.00 bps for a hook that
takes 100.

**How we knew.** Not by reasoning — by replay. Three rows of the first dataset were re-measured
against an anvil that a shard was still sweeping: one reproduced, and **two were destroyed**,
100.00 bps coming back as 0.00. The `verify` command exists to run exactly that check on a random
sample ([`engine/tare/cli.py:121-126`](../engine/tare/cli.py)).

**Class.** *Shared mutable state producing a valid-looking measurement.*

**What prevents it now.** One measuring process per fork, and a guard that makes a violation **loud
instead of numeric**. Before each measurement, `stub_is_installed` checks whether the hook already
wears the stub ([`engine/tare/sweep.py:137-142`](../engine/tare/sweep.py)); if it still does after a
backoff, the row is `NOT_MEASURABLE` with reason `concurrent_measurer:` and **no number at all**
([`:181-189`](../engine/tare/sweep.py)). The rule is repeated at the top of the CLI
([`engine/tare/cli.py:13-22`](../engine/tare/cli.py)) and in the sweep's module docstring
([`engine/tare/sweep.py:23-27`](../engine/tare/sweep.py)), and the reasoning is preserved at
[`engine/tare/sweep.py:122-132`](../engine/tare/sweep.py).

### #6 — a registry entry from the wrong chain attached to a Base measurement

**What was asserted.** A hook measured on Base was presented alongside a registry description —
name, properties, audit status — belonging to a **deployment on Ethereum**.

**Why it was false.** A hook's address encodes its permission bits, so it is CREATE2-mined — and the
*same address* is redeployed on other chains. The registry index was keyed by address alone and kept
whichever entry it met first. **27 of 866 registry addresses are declared on several chains, one on
eighteen.** Our own `0xbdf938149ac6a781f94faa0ed45e6a0e984c6544` exists on both `base` and
`ethereum`, and the Ethereum card was being attached to a Base reading.

A second, compounding bug: the registry file was picked **alphabetically**. That happened to select
the right file, by luck rather than by rule — until a newer snapshot broke the ordering.

**How we knew.** The assistant's own test caught it before it reached a user.

**Class.** *A key that is not unique for the thing it identifies.* No read was truncated and no node
failed; the identifier was simply not an identifier.

**What prevents it now.** The chain is decided at **collect** time, not lookup time, so the map stays
keyed by address and the composite key cannot leak into code that treats keys as addresses
(`decodeFlags`): between two entries for one address, the one whose `chainId` is the measured chain
wins ([`apps/api/src/dataset.ts:213-222`](../apps/api/src/dataset.ts), with
`MEASURED_CHAIN_ID = 8453` at [`:172`](../apps/api/src/dataset.ts)). Registry file selection is by
**mtime**, not alphabetical luck ([`apps/api/src/dataset.ts:230-240`](../apps/api/src/dataset.ts)).
The test's invariant became the stronger one — several chains may declare a hook, but the entry we
attach must be the measured chain's
([`apps/api/src/assistant/__tests__/assistant.test.ts:45-67`](../apps/api/src/assistant/__tests__/assistant.test.ts)).
Commit `3345141`.

### #7 — the 200-character error string, and the selector at byte 68

The sharpest of the eight, because the cutoff was *almost* long enough. Fully reproducible in this
repository.

**What was asserted.** That every unquotable pool failed for an opaque, unclassifiable reason — and
so those pools were discarded from the sweep, rather than recorded as "not enough liquidity, try the
other direction".

**Why it was false.** `V4Quoter` does not surface `NotEnoughLiquidity` directly.
`BaseV4Quoter.sol:16` declares `error NotEnoughLiquidity(PoolId)`; the revert bubbles through
`QuoterRevert.bubbleReason`, and `QuoterRevert.parseQuoteAmount` re-wraps any reason that is not
`QuoteSwap` inside `UnexpectedRevertBytes(bytes)`. The wire format is therefore:

```
0x6190b2b0                          selector UnexpectedRevertBytes   (4 bytes)
  0000…0020                         offset of the bytes              (32 bytes)
  0000…0024                         length = 36                      (32 bytes)
  7a5ed734 706140c9…                NotEnoughLiquidity + poolId
  ^ byte 68 of the revert data
```

`rpc.py` truncated error strings to 200 characters. In the real revert captured from a Base fork, the
selector `7a5ed734` **starts at index 197** of the error string and is 8 characters long — so a
200-character cutoff sliced it in half, the substring match never fired, and every unquotable pool
came back opaque.

**How we knew.** By capturing one real revert to a file and looking at the whole of it.

**Class.** *A bound that lands inside the identifying token.* Not a truncation that loses data at the
end — one that lands in the middle of the eight characters that carry the meaning.

**What prevents it now.** The truncation is gone
([`engine/tare/rpc.py:49-51`](../engine/tare/rpc.py)) and the regression is pinned to the **real
captured revert**, not a reconstruction:
[`engine/tests/test_quote.py:45-82`](../engine/tests/test_quote.py) with
[`engine/tests/fixture_revert.txt`](../engine/tests/fixture_revert.txt). Five assertions, including
one that reads `rpc.py`'s own source and fails if it contains `[:200]`
([`engine/tests/test_quote.py:78-82`](../engine/tests/test_quote.py)), and two that pin the exact
geometry of the bug: the selector starts before index 200 and ends after it
([`:67-70`](../engine/tests/test_quote.py)).

```bash
cd engine && python3 -m unittest tests.test_quote -v
```

### #8 — the fixture that was hand-typed instead of captured

Caught before it produced a finding, and recorded because "caught in time" is not "did not happen".

**What was asserted.** Nothing publicly. An earlier version of the #7 regression test hand-typed an
*approximation* of the revert string and asserted the wrong thing about it — it would have passed
against a reconstruction while the real revert still broke.

**Why it was false.** A test written against a remembered artefact tests the memory, not the
artefact.

**How we knew.** Capturing the real revert to a file and running the same assertions against it.

**Class.** *Evidence reconstructed from memory rather than captured.*

**What prevents it now.** The fixture is the real 605-byte string, on disk
([`engine/tests/fixture_revert.txt`](../engine/tests/fixture_revert.txt)), and the test asserts the
fixture is real before it asserts anything with it: it must contain `6190b2b0` and be longer than 500
characters ([`engine/tests/test_quote.py:63-65`](../engine/tests/test_quote.py)). The same discipline
appears elsewhere: the x402 facilitator fixture is copied, not invented
([`apps/api/test/helpers.ts:5-10`](../apps/api/test/helpers.ts)).

---

### #9 — a benchmark that measured nothing, then a benchmark that flattered itself

**What it said.** `engine/tare/rag/data/header-lift.json` reported `mean_hits_at_k` of **0.0 for
both arms** and `questions_unchanged: 10`. Read quickly, that says *the graph-derived header on each
chunk neither helps nor hurts retrieval* — a tidy null result, and a reason to delete the header.

**Why it was false.** Both arms scored zero because **neither could have scored anything**. All ten
questions are numeric or topological predicates — *which hook takes the largest cut*, *how many
pools* — and no embedding model compares numbers. Worse, registry cards describe their fees in
prose, so similarity retrieves the hooks that *talk* about fees, not the ones measured as taking
them. The benchmark was asking the vector index to do the graph's job. Zero was not a verdict on the
header; it was a verdict on the question set.

**Then the fix was worse.** Re-running over the full haystack — registry cards *and* the fetched
Solidity — lifted recall to **0.07** and looked like progress. It was an artefact: one measured hook
contributes ~50 source chunks, each inheriting that hook's graph facts, so a truth set defined at
chunk level swelled to **611 of 1,884 chunks — a third of the corpus.** Retrieving 6 of the top 10
from a set covering a third of everything is chance wearing a number.

**How we knew.** Printing the truth-set size per question. `verite=611`, `verite=372`, `verite=331`
on a corpus of 1,884 is not a gold set, it is a majority.

**Class.** *A measurement whose unit is not the thing being measured.*

**What prevents it now.** [`engine/tare/rag/split.py`](../engine/tare/rag/split.py) scores
structural questions **per hook, not per chunk** (`_entity_scores`), and runs three retrievers over
two question classes instead of two retrievers over one. The result is no longer a null: on the ten
structural questions the graph answers **1.000** and the vector index **0.055**; on six semantic
questions — *why does the stub return data instead of halting* — the vector index answers **0.417**
and the graph **0.000**, because it indexes no prose. Each retriever is mute on the other's class,
which is the measured argument for shipping both.
[`engine/tare/rag/data/retriever-split.json`](../engine/tare/rag/data/retriever-split.json), replay
`cd engine && python3 -m tare.rag.split`.

---

## What the nine have in common

Five of the nine are one mistake: **a read was bounded, the bound was invisible, and the truncated
result parsed cleanly** (#1, #2, #3, #7, #8). None raised an exception. All produced a number or a
verdict.

Two more are the other half of the same problem: **the instrument's own failure attributed to the
subject** (#4 — a rate limit read as an empty chain, then as an empty pool) and **two instruments
colliding** (#5 — a stub read as a hook). Neither raised an exception either.

The last one, #6, is neither: a key that was not unique for the thing it identified. It is here
because it is the one that was caught by a test rather than by a human noticing an odd number, which
is the only one of the eight detection stories worth wanting.

One last note about this document. An earlier draft of it counted five, and retold #2 and #3 with
consequences it could not source from anything in this repository. Those retellings were removed and
replaced with the record above plus the guard that prevents each class, cited by line. A document
about false findings is a bad place to keep an unverified one.
