# Developer feedback — Uniswap v4 stack

Submitted for ETHOnline 2026 by the TARE project. Everything below came out of actually building
against v4 for nine days: measuring what deployed hooks take from a swap by forking Base, replacing
a hook's bytecode with an inert stub, and quoting the same swap twice.

Each item says what we hit, where, and what would have saved us time. Line references are to the
commit we built against.

---

## 1. `V4Quoter` reverts are wrapped twice, and the inner selector is what you need

**What happened.** Every failed quote came back as `custom error 0x6190b2b0` — `UnexpectedRevertBytes`
— with the real reason, `NotEnoughLiquidity` (`0x7a5ed734`), buried in its payload. Our first sweep
counted 97 failures out of 252 as "pools that don't work" before we decoded the inner selector and
found they were one single, ordinary condition.

**Why it cost us time.** The wrapper is 605 characters of hex by the time it reaches a JSON-RPC
client. We truncated it to 200 characters for logging, which sliced the inner selector in half at
index 197 — so the detection silently never fired. That is our bug, but the shape of the error made
it easy to write.

**What would help.** Either surface `NotEnoughLiquidity(PoolId)` directly from `BaseV4Quoter`
(`src/base/BaseV4Quoter.sol:16`, condition at :52-56), or document the wrapping in the quoter's
README with the selector table. A one-line "the quoter wraps bubbled-up errors in
`UnexpectedRevertBytes`; decode the inner 4 bytes" would have saved us most of a day.

## 2. A pool that cannot be quoted one way often quotes the other

**What happened.** Our quotability rate looked like **11%**. After sweeping both `zeroForOne`
values it became **54.7–65.3%**. The same pool, same block, same size — one direction reverts with
`NotEnoughLiquidity`, the other returns a number.

**Why it matters.** This is not obvious from the interface: `quoteExactInputSingle` takes
`zeroForOne` as an ordinary field, and nothing suggests that a failure in one direction says
nothing about the other. Anyone benchmarking pool health with a single direction will
under-report by a factor of five, as we did.

**What would help.** A sentence in the quoter docs. Ideally an example in `v4-periphery` that
sweeps both directions.

## 3. The hook registry has no quantitative field, and `additionalProperties: false` makes that
   permanent

**What happened.** `hooklist.json` describes **613 hooks** with **19 fields**: 14 permission
booleans, 4 property booleans, one `swapAccess` enum, and `chainId`. Not one of them is a quantity.
The schema sets `additionalProperties: false` in four places, so a consumer cannot add one either.

**Why it matters.** **570 of 613 entries (93.0%)** carry `vanillaSwap: false` — the registry's way
of saying "this hook changes your swap". It has no way to say *by how much*. We measured four hooks
that the registry describes almost identically — same active flags, `swapAccess: none`, no audit
link — and found they take **1,176 / 175 / 100 / 0 bps** respectively. The boolean does not
discriminate between them.

**What would help.** A numeric field. We have opened a PR proposing
`measuredExtraction: { bps, block, method, sourceUrl }` — optional, provenance-carrying, and
explicitly not a score. Whatever shape you prefer, the schema needs one field that can hold a
measured quantity.

## 4. The registry is structurally blind to unverified hooks

**What happened.** **613 of 613 entries** have `verifiedSource: true`. The ingestion pipeline
(`.claude/prompts/analyze-hook.md`, step 4) stops when Etherscan reports `Verified: False`.

**Why it matters.** On a random sample of 80 hooks deployed on Base outside the registry, **2 were
verified on Sourcify**. So the registry sees roughly the 3% of the population that publishes source.
One of the two hooks we measured taking ~1% on zero-fee pools — `0xdda9bc41e3…` — **is not in the
registry at all**.

**What would help.** Even an entry with `verifiedSource: false` and only the address-derived flags
would be more useful than absence, because the 14 permission bits are readable from the address
without any source at all.

## 5. `HookSwap` / `HookFee` have no adoption, and nothing detects that

**What happened.** The Foundation's own developer guide recommends hooks emit `HookSwap` and
`HookFee` to declare what they charge. We computed both topic0 values and scanned 24,000 Base
blocks: **5 contracts in total emit either event**. In the same window the PoolManager emitted
**1,892 `Initialize` events covering 84 distinct hooks — and none of those 84 emit either one.**

**What would help.** Surfacing adoption in the registry (a `declaresFees` boolean) would at least
make the gap visible. Right now a consumer cannot distinguish "this hook charges nothing" from
"this hook does not say".

## 6. The production router excludes hooked pools by default, and the denylist is empty

**What happened.** In `uniroute-public`, `v4HooksPoolsFiltering.ts:160-166` admits a v4 pool into
the default candidate set only when `pool.hooks === ADDRESS_ZERO` or the hook has no swap
permissions. The bypass is `hooksAddressesAllowlist.ts` — **348 hand-written addresses across 38
chain keys**. `hooksAddressesDenylist.ts` is entirely empty: `[]` for all 12 chains listed.

**Why we mention it.** This is a reasonable safe default, and open-sourcing the router was
genuinely useful to us — it is the clearest statement anywhere of what Uniswap considers safe. But
the admission criterion is curation, not measurement, and there is no documented path for a hook to
earn its way in. A measured extraction figure is exactly the input that criterion is missing.

## 7. Smaller things

- **`extsload` slot layout is undocumented outside the source.** We derived
  `pools` at slot 6, `Pool.State.liquidity` at offset +3, `slot0.lpFee` at bits 208-231. Getting it
  wrong returns a plausible **zero**, not an error — our first liquidity scan reported 100% of pools
  empty. A short storage-layout note in the docs would prevent a whole class of silent errors.
- **`lpFeeOverride = 0` does not mean "zero fee".** `Pool.sol:303-305` only applies an override when
  the `0x400000` flag is set. We briefly believed the opposite and nearly discarded a correct
  dataset. Worth one sentence in the hooks guide, since anyone writing a no-op hook will return 0.
- **Hook mining direction.** `vm.etch` is documented for *placing* a hook at a permission-encoding
  address. The inverse — etching an inert stub over a deployed hook to obtain a hookless baseline —
  is not documented anywhere we could find, and it turns out to be a clean way to isolate a hook's
  effect while holding the pool fixed. It may be worth a recipe in `v4-periphery`.

---

## What worked well

The 14-bit permission encoding is excellent. We verified it across the entire registry — **8,582 bit
comparisons over 613 hooks, zero deviation** — which means a client can state a hook's permissions
from its address alone, with no RPC and no trust. That property carried a whole feature of our
product.

`V4Quoter` on a pinned fork is fast and deterministic once the state is warm: 0.01 s per quote
against 8.96 s cold. The counterfactual we built would not exist without it.

---

*Contact: the TARE repository, `README.md`. Method and limitations: `docs/METHOD.md`.*
