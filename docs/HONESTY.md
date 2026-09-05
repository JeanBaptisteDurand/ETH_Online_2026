# The four labels

Every number TARE prints carries one of four labels. A label is a statement about **how we know**,
not about how the number looks. It is decided by the code that produced the row and it is never
promoted afterwards — no aggregation, no display layer, no model is allowed to turn one label into
a better one.

The enum is declared in one place per runtime and the runtimes are checked against each other:

| runtime | file | line |
|---|---|---|
| engine (Python) | [`engine/tare/sweep.py`](../engine/tare/sweep.py) | 72 |
| API (TypeScript) | [`apps/api/src/labels.ts`](../apps/api/src/labels.ts) | 12 |
| MCP (TypeScript) | [`apps/mcp/src/labels.ts`](../apps/mcp/src/labels.ts) | 14 |

---

## `MEASURED`

**What it means.** The counterfactual ran. The same swap — same pool, same size, same direction,
same block — was quoted twice against the same pinned fork: once with the hook's real bytecode, once
with the hook's address holding the 89-byte inert stub. Both quotes returned an amount. The label
carries the difference.

**What produced it.** [`engine/tare/measure.py:96–102`](../engine/tare/measure.py).

**What it does not mean.** It does not mean "this hook charges this fee". It means: at this block,
on this pool, for this size and this direction, replacing the hook's code with a compliant no-op
changed the quote by this much. Attributing that difference to a fee, to a rebate, to routing, or to
custom accounting is an interpretation, and TARE labels the interpretation separately.

## `INTERPOLATED`

**What it means.** No measurement exists at the requested size, but two `MEASURED` points bracket it
on the same pool, same direction, same block, and the value between them was computed rather than
observed.

**What produced it.** [`apps/mcp/src/interpolate.ts:23`](../apps/mcp/src/interpolate.ts).

**What it does not mean.** It is not a measurement, and it never becomes one. It is displayed with
the two endpoints it was computed from, so the reader can see the span. When the two endpoints are
far apart — and 63 of the profiles in the corpus are not flat, the sharpest running from 689.95 bps
at 1e14 down to 406.64 bps at 1e18
([`docs/dataset/summary.json`](dataset/summary.json), `non_flat_profiles[0]`) — an interpolated
value between them is a guess with a shape, not a reading.

## `NOT_QUOTABLE`

**What it means.** We asked and **the pool said no**. `V4Quoter` reverted with a v4 custom error —
in practice almost always `NotEnoughLiquidity` — for that size and that direction. The row carries
the reason string.

**What produced it.** [`engine/tare/measure.py:81–83`](../engine/tare/measure.py), classified by
[`engine/tare/sweep.py:108–119`](../engine/tare/sweep.py).

**What it does not mean.** It does not mean the pool is dead, and it does not mean the hook takes
nothing. 140 of the 199 pools in this corpus quote in exactly one direction
([`docs/feedback-evidence/quote-direction.json`](feedback-evidence/quote-direction.json)); the other
side of every one of them is a `NOT_QUOTABLE` that says nothing about the hook.

## `NOT_MEASURABLE`

**What it means.** **We could not look**, or we looked and the counterfactual is meaningless here.
Three distinct situations share this label, and the `reason` field always says which:

1. `rpc_unavailable: …` — the node failed. Rate limit, timeout, a slot anvil could not backfill.
   The instrument broke, not the subject. Retried first
   ([`engine/tare/sweep.py:167–207`](../engine/tare/sweep.py), `measure_resilient`); if it survives the retries it stays
   here forever rather than becoming a verdict about the pool.
2. `concurrent_measurer: …` — the stub was already installed on this hook when we arrived, so
   another measuring process owns this fork and anything we quote describes *its* stub
   ([`engine/tare/sweep.py:137–142`](../engine/tare/sweep.py)).
3. `custom accounting` — the stub quote came back **better** than the real one by more than
   100 bps. The hook is not taking a cut off a pool; the hook **is** the liquidity. Removing it does
   not reveal a fee, it destroys the venue, and the difference measures the destruction rather than
   the extraction ([`engine/tare/measure.py:97–99`](../engine/tare/measure.py)). 10 rows in the
   corpus are here.

**What it does not mean.** It is not zero. It is not "no fee". It is the absence of a reading, and
the corpus keeps the row so that the absence occupies its line instead of silently shrinking the
denominator of every statistic computed later
([`engine/tare/sweep.py:145–152`](../engine/tare/sweep.py)).

---

## What we refuse to say

**We do not say "this hook charges X%".** We say: at block 50,614,000, on pool `0x…`, swapping
1e15 wei of currency0 for currency1, replacing the hook's bytecode with the inert stub moved the
quote by X bps. Every one of those qualifiers changes the number. 63 profiles in this corpus move
by more than 5 bps across the size ramp; one moves by 283 bps.

**We do not turn a failed read into a value.** A truncated body, a timed-out call, a rate-limited
node, a short return — all of them are `NOT_MEASURABLE`. This project produced five false findings
by not obeying that rule, and they are all written down in [`METHOD.md`](METHOD.md).

**We do not let the model produce a number.** The model picks what to query and explains what came
back. Numbers come from the engine, the API and the committed corpus, and every one of them replays
with a single command. This is enforced in the tool descriptions
([`apps/mcp/src/server.ts:26`](../apps/mcp/src/server.ts), `NEVER_INVENT`) and pinned by
`apps/mcp/test/honesty.test.ts`.

**We do not aggregate what has no common unit.** `tare_impact` reports liquidity per pool and never
sums it: in-range `uint128` liquidity from different token pairs has no shared denomination. It
reports min / median / max of the measured subset together with the full list of values the median
was computed from, and it says how much of the hook's surface is *not* measured.

**We do not claim the corpus is the population.** 995 rows, 199 pools, 12 hooks, one chain, one
block. Everything outside that is unmeasured, and unmeasured is not zero.

**We do not upgrade a label to make a point.** The single largest reading in the corpus,
1176.46 bps, sits next to 265 `NOT_QUOTABLE` rows and 10 `NOT_MEASURABLE` rows in the same file, at
the same weight, in the same schema.
