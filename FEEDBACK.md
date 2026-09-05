# Developer feedback on the Uniswap v4 stack

**Project:** TARE — measures what a v4 hook actually takes from a swap, by replacing the hook's
bytecode with an inert 89-byte stub on a pinned fork and quoting the same swap twice.
**Author:** solo, ETHOnline 2026.
**Repository:** https://github.com/JeanBaptisteDurand/ETH_Online_2026
**Surface exercised:** `PoolManager` storage reads (`extsload`, `slot0`, `liquidity`),
`V4Quoter.quoteExactInputSingle`, `Hooks.sol` return-shape validation, the `Uniswap/hooklist`
registry and its `schema.json`, and the `Uniswap/routing-api` hook allowlist.
**Evidence:** 995 measurements over 199 pools and 12 hooks on Base at block **50,614,000**
([`docs/dataset/measurements.jsonl`](docs/dataset/measurements.jsonl)), plus two replayable probes
under [`docs/feedback-evidence/`](docs/feedback-evidence/).

Everything below is a number I can replay. Where I could not verify something, I say so instead of
asserting it.

---

## What worked, and worked well

**The address *is* the permission set, and `PoolManager` enforces it.** The low 14 bits of a hook's
address are its callback permissions, checked on-chain, non-forgeable, readable with zero RPC calls.
I decoded all 613 entries of the registry snapshot against `Hooks.sol` bit order and got 8,582 bit
comparisons with **zero disagreements** (`make test`, `test_flags.py`). This is the single best
design decision in v4 for anyone building analysis tools: it is the one hook property that cannot
lie.

**`Hooks.sol` validates return *shape*, not behaviour — which is what made this project possible.**
Because `Hooks.sol` only requires that a hook echo the called selector and return 96 bytes for
`beforeSwap` / 64 elsewhere, a compliant no-op hook fits in **89 bytes**
([`engine/tare/stub.py:25–36`](engine/tare/stub.py)). Swapping a real hook for that stub with
`anvil_setCode` keeps the `PoolKey` — and therefore the `poolId`, `slot0`, liquidity and reserves —
byte-identical, so the delta between two quotes is attributable to exactly one variable. A protocol
that validated behaviour instead of shape would have no such counterfactual.

**`extsload` on `PoolManager`.** Reading `slot0` and `liquidity` from a singleton with one generic
getter is far nicer to integrate against than per-pool contracts. Pool state slot 6, `Pool.State`
offsets 0 and 3, and the packing in `Slot0.sol` were all exactly as documented
([`engine/tare/consts.py:8–19`](engine/tare/consts.py)).

**`Uniswap/hooklist` exists, is machine-readable, and has a schema.** Most ecosystems do not have
this. Everything in section 3 below is a request to extend it, not to replace it.

---

## 1. `V4Quoter` quotes in one direction only for 7 pools out of 10, and there is no way to ask which

**Measured.** Every one of the 199 pools in my corpus, probed in both directions at five sizes
(1e14 → 1e18 wei), at block 50,614,000, read-only against a Base archive node:

| | pools |
|---|---|
| quote in **exactly one** direction | **140** (70.4 %) |
| quote in both directions | 56 |
| quote in neither | 3 |
| undetermined (node failure) | 0 |

Replay: `python3 docs/feedback-evidence/quote_direction.py` →
[`docs/feedback-evidence/quote-direction.json`](docs/feedback-evidence/quote-direction.json).

**Why it bit.** The obvious integration is: call `quoteExactInputSingle` with `zeroForOne = true`,
and if it reverts, the pool has no liquidity for this trade. That integration is wrong for 70 % of
v4 pools. My first sweep did exactly this and **discarded 77.6 % of the pools it touched** before I
worked out that the revert was direction-dependent, not pool-dependent
([`engine/tare/sweep.py:5–9`](engine/tare/sweep.py)). The fix is to probe both sides at several
sizes before calling a pool dead ([`engine/tare/quote.py:38–44`](engine/tare/quote.py)) — four extra
round trips per pool, times 199 pools, on a cold fork where the first touch of a pool costs 30–120 s.

**What would help.** Either of these, in order of preference:

1. A view that answers the question directly — `quotableDirections(PoolKey) → (bool zeroForOne, bool oneForZero)`,
   or an `exactInputSingle` variant that returns a status rather than reverting.
2. Failing that, one sentence in the `V4Quoter` docs: *a revert on one direction says nothing about
   the other; probe both.* This is the single most expensive thing I did not know, and it is not
   written anywhere I could find.

---

## 2. `NotEnoughLiquidity` is re-wrapped, and its selector lands at byte 68 of the revert data

**What happens.** `BaseV4Quoter.sol:16` declares `error NotEnoughLiquidity(PoolId poolId)`. The
revert bubbles through `QuoterRevert.bubbleReason`, and then
[`QuoterRevert.parseQuoteAmount`](https://github.com/Uniswap/v4-periphery/blob/main/src/libraries/QuoterRevert.sol#L35-L40)
re-wraps **any** reason that is not `QuoteSwap` inside `UnexpectedRevertBytes(bytes)`. So the caller
receives:

```
0x6190b2b0                                          UnexpectedRevertBytes            4 bytes
  00…0020                                           offset                          32 bytes
  00…0024                                           length = 36                     32 bytes
  7a5ed734 706140c9…                                NotEnoughLiquidity + poolId
  ^ byte 68
```

Every distinguishable v4 quoter failure therefore arrives behind the **same** outer selector, and
the byte that tells them apart sits 68 bytes in. Captured revert:
[`engine/tests/fixture_revert.txt`](engine/tests/fixture_revert.txt).

**Why it bit.** My RPC layer truncated error strings to 200 characters. In the real revert, the
selector `7a5ed734` **starts at index 197** and is 8 characters long, so the cutoff sliced it in
half. The substring match never fired, every unquotable pool came back opaque, and the sweep
discarded pools that were telling me precisely why they had refused. This is one of five false
findings this project produced and corrected; all five are documented in
[`docs/METHOD.md`](docs/METHOD.md). The regression is now pinned against the real captured revert
rather than a reconstruction ([`engine/tests/test_quote.py:45–82`](engine/tests/test_quote.py)).

**What would help.**

1. Make the wrapper self-describing: `UnexpectedRevertBytes(bytes4 innerSelector, bytes innerData)`.
   One extra word, and the discriminating information moves into the ABI where a decoder finds it,
   instead of into an offset a human has to know.
2. Or do not re-wrap the quoter's own declared errors. `NotEnoughLiquidity` is declared in
   `BaseV4Quoter` itself; re-wrapping a contract's own error inside a generic "unexpected" wrapper
   is what makes it look unexpected.
3. Either way: document the offset. `parseQuoteAmount` is a two-line function whose consequence is
   that no off-chain caller can identify a quoter failure with a naive substring check on a bounded
   error string.

---

## 3. The registry describes hooks but never quantifies them: 27 fields, 19 booleans, one integer, zero magnitudes

**Measured**, against `Uniswap/hooklist` pinned at commit
[`8623037`](https://github.com/Uniswap/hooklist/tree/862303733d34aa36fad0d8c5275163c387be80d6):

| | |
|---|---|
| Entries | 869 (234 distinct addresses on Base) |
| Leaf fields per entry | 27 |
| Boolean fields | 19 |
| Numeric fields | **1** — `hook.chainId`, a network identifier |
| Fields expressing a magnitude | **0** |
| Entries with a non-empty `auditUrl` | 30 (3.5 %) |
| `additionalProperties: false` in `schema.json` | 4 (lines 10, 21, 99, 154) |

Replay: `python3 docs/feedback-evidence/routing_allowlist.py` →
[`docs/feedback-evidence/routing-allowlist.json`](docs/feedback-evidence/routing-allowlist.json).

**What the gap costs.** `properties.dynamicFee: true` says the hook sets the price per swap. It does
not say how much. On the same hooks, on the same chain, my counterfactual reads:

| | |
|---|---|
| Rows above 1 bps on pools whose stored `lpFee` is **0** | **545**, across 109 pools and 6 hooks |
| Median | 100.00 bps |
| Max | **1176.46 bps** (11.76 % of the swap) |
| Profiles that move by more than 5 bps across the size ramp | 63 |
| Sharpest profile | 689.95 bps at 1e14 → 406.64 bps at 1e18 |

Between `dynamicFee: true` and "median 100 bps, max 1176 bps, and it moves 283 bps with size" there
is everything a user needs and nothing the registry can express. And because `schema.json` sets
`additionalProperties: false` in four places, a contributor **cannot** add such a field in their own
entry — it has to be declared centrally, in the schema.

**What would help.** I have written the patch:
[`docs/pr-hooklist/`](docs/pr-hooklist/) — an optional `measuredExtraction` object carrying
`{ bps, block, method, sourceUrl }`, plus the four schema hunks, the PR body, and the numbers
justifying it. Optional, so no existing entry breaks; carrying its block and its method, so it is
falsifiable rather than a marketing field.

**Two smaller things in the same schema:**

- **`verifiedSource` is `true` for 869 entries out of 869.** The ingestion pipeline starts by
  fetching verified source from Etherscan (repo README, "How It Works" step 1), so an unverified
  hook cannot enter. The field is therefore structurally constant: it costs a field and carries
  zero bits. Worse, the population it silently excludes — hooks whose source is not verified — is
  exactly the population a risk-facing registry most needs to describe. Consider either dropping the
  field or admitting unverified hooks with `verifiedSource: false`, which is the only way the
  boolean becomes informative.
- **The schema has no time in it.** No `updatedAt`, no `asOfBlock`, no `lastCheckedAt` — the 27 leaf
  fields contain no date of any kind. I hit this concretely today: hook
  `0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc` was **absent** from the snapshot I fetched in the
  morning (613 entries, [`docs/hooklist.json`](docs/hooklist.json)) and **present** in the snapshot I
  fetched in the evening (869 entries, commit `8623037`) — same day. "Absent from the registry" is
  therefore not a property a consumer can cache, diff, or reason about, and `upgradeable: true`
  entries describe contracts whose code can change with no field recording when the description was
  last true.

---

## 4. The routing allowlist is 117 hand-written addresses, has no denylist, and no quantitative criterion

**Measured**, `Uniswap/routing-api` pinned at commit
[`f5a8189`](https://github.com/Uniswap/routing-api/tree/f5a81893b812b6745b1f8b7fa3a55a714cb9d89b),
file [`lib/util/hooksAddressesAllowlist.ts`](https://github.com/Uniswap/routing-api/blob/f5a81893b812b6745b1f8b7fa3a55a714cb9d89b/lib/util/hooksAddressesAllowlist.ts):

| | |
|---|---|
| File length | 395 lines |
| Hand-written address constants | **117** |
| `HOOKS_ADDRESSES_ALLOWLIST` declared | line 238 |
| `[ChainId.BASE]` block | line 301, 59 entries (58 addresses + `ADDRESS_ZERO`) |
| Occurrences of "deny" anywhere in the file | **0** |
| Documented entry route | a HubSpot form, linked from the `hooklist` README |

**The finding that makes this concrete.** One hook is on the Base routing allowlist *and* in my
corpus:

> **`0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc`**
> — `CLANKER_STATIC_FEE_HOOKS_ADDRESS_ON_BASE_v2`, `hooksAddressesAllowlist.ts:25`, routed on Base.
> — Registry: `"Clanker Static Fee Hook v2 (Base)"`, `verifiedSource: true`, `auditUrl: ""`,
>   `dynamicFee: true`, `swapAccess: "none"`.
> — TARE at block 50,614,000: **95 rows above 1 bps on pools whose stored `lpFee` reads 0**,
>   **median 119.70 bps**, **max 1176.46 bps**.

I am not alleging misconduct: the pools carry `fee = 0x800000`, the dynamic-fee flag, so the hook
setting the price per swap is exactly what the protocol intends and `slot0.lpFee` reading zero is
exactly what the protocol specifies. The point is narrower and, I think, harder to dismiss:
**a hook can be verified, registered, described, allowlisted for routing, and there is still no
field anywhere in the Uniswap stack that records how much it takes.** A router reading
`slot0.lpFee` sees `0`.

**In the filtering code itself** —
[`lib/util/v4HooksPoolsFiltering.ts`](https://github.com/Uniswap/routing-api/blob/f5a81893b812b6745b1f8b7fa3a55a714cb9d89b/lib/util/v4HooksPoolsFiltering.ts):

- `isHooksPoolRoutable` (lines 65–125) has its entire 15-line routability expression **duplicated
  verbatim** between the `try` (lines 78–92) and the `catch` (lines 109–123). The only difference is
  hard-coded 18-decimals in the fallback. Any change to the routability rule has to be made twice,
  identically, or the two paths silently disagree. Extracting the predicate into one function taking
  `(tokenA, tokenB, pool)` would remove the hazard without changing behaviour.
- The routability test is purely structural: `!Hook.hasSwapPermissions(pool.hooks)`, plus a fee-tier
  bound and a dynamic-fee back-check. A hook with no swap permission bits is routed regardless of
  what it does elsewhere; a hook with them is routed only if it is on the hand-written list.
- The only quantitative gates in the whole file are `pool.tvlETH <= 0.001`, hard-coded twice, once
  for Zora (line 221) and once for Clanker (line 228). Both are TVL floors. Neither is about what
  the hook takes, and both are per-project constants rather than a policy.

**What would help.**

1. **Publish the criterion.** The `hooklist` README is admirably explicit that registry inclusion
   ≠ routing, and points at a HubSpot form. But no criterion, no diff, and no removal path is
   published. From outside, the list is an oracle.
2. **Add a denylist path.** With an allowlist and no denylist, "on the list" is monotonic. There is
   no mechanism in the file for a hook that was fine and stopped being fine — and an `upgradeable`
   hook can become a different program at the same address.
3. **Make the gate readable.** Once a numeric field exists (section 3), the router could read it and
   the allowlist could shrink towards a policy instead of a roster.

---

## 5. The protocol recommends declaring fees through events, and offers no read path

The v4 developer guidance recommends hooks emit `HookSwap` / `HookFee` so that integrators can see
what a hook charged. Two problems for anyone building on that:

- Events are **post-hoc**. A router deciding where to send a swap, or a UI quoting a user, needs the
  magnitude *before* the swap. There is no view function in `IHooks` that a caller can ask, and
  `slot0.lpFee` reads `0` for every dynamic-fee pool until the hook overrides it inside the swap.
- Emission is voluntary and unenforced, so absence of the event is not absence of a fee. I did not
  commit an enumeration of how many deployed hooks emit these events, so **I make no claim about the
  adoption rate** — the honest statement is only that nothing in the protocol requires it and nothing
  in the registry records it.

This is the gap TARE fills by brute force: since no one has to declare the magnitude and no one can
read it, measure it. `anvil_setCode` + the 89-byte stub + two quotes. It works, and it should not
have to.

**What would help.** An optional view on `IHooks` — even advisory, even non-binding —
`quoteHookFee(PoolKey, SwapParams) → int256`, would let routers and UIs surface the number before
the trade instead of reconstructing it after. A hook that refuses to implement it is then making a
statement, which is itself information.

---

## Summary of asks

| # | Ask | Where |
|---|---|---|
| 1 | Say that a `V4Quoter` revert on one direction says nothing about the other; ideally expose which directions quote | `V4Quoter` docs / periphery |
| 2 | Put the inner selector in the ABI: `UnexpectedRevertBytes(bytes4, bytes)`, or stop re-wrapping the quoter's own errors | `QuoterRevert.sol:35–40` |
| 3 | Add one optional numeric field to the registry — patch attached | `Uniswap/hooklist`, `schema.json` |
| 4 | Drop `verifiedSource` or let it be `false`; add a timestamp to the schema | `Uniswap/hooklist`, `schema.json` |
| 5 | Publish the routing-allowlist criterion; add a denylist path; de-duplicate `isHooksPoolRoutable` | `Uniswap/routing-api` |
| 6 | An advisory pre-swap fee view on `IHooks` | `v4-core` |

The patch for ask #3 is ready to open as a PR: [`docs/pr-hooklist/`](docs/pr-hooklist/).

Method and limits: [`docs/METHOD.md`](docs/METHOD.md). What each label means and what we refuse to
claim: [`docs/HONESTY.md`](docs/HONESTY.md).
