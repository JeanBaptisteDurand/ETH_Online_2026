# LIMITS — what this method cannot tell you

[`METHOD.md`](METHOD.md) says how the number is produced. This file says what the number is not.
Every figure below was recomputed from [`docs/dataset/measurements.jsonl`](dataset/measurements.jsonl)
and [`docs/dataset/summary.json`](dataset/summary.json) before it was written down.

**The short version.** TARE reads *how much a quote moves when a hook's code is replaced by an inert
stub*. It does not read intent, it does not read the hook's source, it does not read the swap a user
would actually get, and it says nothing at all about the hooks, pools, sizes, directions, blocks and
chains it did not touch.

---

## 1. One block, one chain, one quoter

Everything in the corpus is **block 50,614,000 on Base (chain 8453)**, quoted through
`V4Quoter` at `0x0d5e0f97…` ([`engine/tare/consts.py:4-6`](../engine/tare/consts.py)).

A hook with a time-decaying or volume-dependent fee reads differently at another block. Gate A3's own
hook, `0x1aea38f0…` (`ClankerHookStaticFeeV2` in the registry), already reads 99.99 bps at 1e14 and
57.44 bps at 1e18 *at one block* — nothing in this corpus says what it does at the next one.

The block, the chain, the size and the direction are fields of **every row**
([`engine/tare/measure.py:71-77`](../engine/tare/measure.py)) precisely so that a number cannot
travel without them.

## 2. 199 pools is not the population, and it is not even a clean sample

`docs/pools-liquides.json` holds 199 pools. That number is a **survivor count**, not a census, and
the code that produced it says so in its own docstring:

> "The first attempt at this returned 1,835 failures out of 2,286 and I kept the 451 that answered —
> which is how `docs/pools-liquides.json` ended up with 199 pools instead of the real number."
> — [`engine/tare/rescan.py:1-6`](../engine/tare/rescan.py)

Upstream of that, the `Initialize` log collection covers a **window**, not the chain: the first
corpus covered 24,000 blocks because a public RPC could not serve more
([`engine/tare/collect.py:1-6`](../engine/tare/collect.py)).

So: 12 hooks are in the corpus. There are **978 in the official registry alone**
(`docs/hooklist-live-20260905.json`), and the registry does not see everything either — see
section 7. Silence about the other hooks is silence, **not a zero**.

What the code does guarantee is that the gap is *visible*: a pool the node could not read is
`UNKNOWN`, never `0` ([`engine/tare/rescan.py:41-49`](../engine/tare/rescan.py)), and every failed
log chunk is printed with the real coverage percentage
([`engine/tare/collect.py:46-48`](../engine/tare/collect.py)).

## 3. 265 rows where the pool refused, and 53 pools where it always refused

| `NOT_QUOTABLE` reason | rows |
|---|---|
| `NOT_ENOUGH_LIQUIDITY` | 250 |
| raw `execution reverted` from the node | 10 |
| `ZERO_OUT` (the quote returned zero out) | 5 |
| **total** | **265** |

**53 of the 199 pools produced only `NOT_QUOTABLE` rows.** Nothing is known about their hooks'
behaviour from this corpus.

Direction asymmetry is the dominant cause, and it is measured separately
([`docs/feedback-evidence/quote-direction.json`](feedback-evidence/quote-direction.json), replayable
with `python3 docs/feedback-evidence/quote_direction.py`):

```
pools tested                199
quote in both directions     56
quote in exactly one         140      (70.4 %)
quote in neither               3
```

The corpus records the direction it could read. **The other side is unmeasured, not zero.** A
`NOT_QUOTABLE` says the quoter refused this pool, this direction, this size, at this block — it does
not say the pool is dead and it does not say the hook takes nothing.

## 4. Custom accounting: the counterfactual is meaningless, by construction

When a hook *is* the liquidity — it computes the swap internally rather than sitting on top of a
concentrated-liquidity curve — removing its code does not expose a fee. It removes the venue. The
stub quote then comes back **better** than the real one, and the difference measures the destruction
rather than the extraction.

Below −100 bps the row is `NOT_MEASURABLE` with reason `custom accounting` and **carries no number**
([`engine/tare/measure.py:28`](../engine/tare/measure.py) for the threshold,
[`:97-99`](../engine/tare/measure.py) for the branch).

In this corpus: **10 rows, on 2 pools, on 1 hook** — `0xbb7784a4d481184283ed89619a3e3ed143e1adc0`,
which the registry names `DecayMulticurveInitializerHook`. Its 15 rows are 10 `NOT_MEASURABLE`
(`custom accounting`) and 5 `NOT_QUOTABLE` (`NOT_ENOUGH_LIQUIDITY`): **it is the one hook of the
twelve with no measurement at all** — which is exactly the gap between `n_hooks` 12 and
`n_hooks_measured` 11 in [`summary.json`](dataset/summary.json).

This is not a bug to be fixed later. It is the boundary of the method: **any hook whose swap math
replaces the pool's own is outside what a code-swap counterfactual can measure.** The registry's
`vanillaSwap: false` property is a rough proxy for that class, and 833 of 978 entries carry it
([`FEEDBACK.md`](../FEEDBACK.md), §"vanillaSwap"), so the class is large.

## 5. A quote is not a swap

`V4Quoter` simulates. It does not pay gas. It does not cross a mempool. It does not experience the
ordering, the sandwiching, the MEV or the slippage a live swap experiences. It also runs on a **local
fork with one caller**, so any hook behaviour that depends on `tx.origin`, on a per-block counter, on
an oracle update, or on being the second swap of the block, is not exercised.

What TARE measures is **the price the protocol would quote** — which is what a router reads and what
a user is shown before they sign. That is a real and useful quantity. It is not the fill.

Relatedly: the corpus has **0 `INTERPOLATED` rows**. Interpolation exists in the MCP server
([`apps/mcp/src/interpolate.ts:23`](../apps/mcp/src/interpolate.ts)) and it never extrapolates
outside the measured range — but nothing in this dataset was produced by it.

## 6. A high bps is not an abuse — and we have not read the hooks' code

**This is the limit that matters most, and the one most likely to be ignored by someone quoting a
number from this corpus.**

The measurement is a **magnitude**. It is silent about legitimacy. An openly advertised 1 % launch
fee and a silent 1 % skim produce **exactly the same reading**, because the instrument compares
bytecode against no-bytecode and has no opinion about what the bytecode was entitled to do.

Three facts from this corpus, all recomputed:

**(a) Most of the "hidden fee" rows sit on pools where the protocol expects a hook-set fee.** Of the
545 rows above 1 bps whose `stored_lp_fee` is zero, **410 are on a `PoolKey` carrying the dynamic-fee
flag `0x800000`** ([`engine/tare/consts.py:22`](../engine/tare/consts.py)). On those pools
`slot0.lpFee` reading zero is not an anomaly — it is the documented design. The interesting thing is
not that the field is zero; it is that **no field anywhere records the magnitude**, which is why this
corpus exists.

**(b) The six hooks are named, public launchpad infrastructure.** Cross-referenced against
`docs/hooklist-live-20260905.json`, restricted to the Base entry (see false result #6 in
[`HONESTY.md`](HONESTY.md)):

| hook | registry name | rows > 1 bps @ lpFee 0 | pools | median bps |
|---|---|---|---|---|
| `0x0469a4bd…` | Zora Hook | 255 | 51 | 100.00 |
| `0x985c14ba…` | LaunchHook | 125 | 25 | 99.56 |
| `0xb429d62f…` | Clanker Static Fee Hook v2 | 95 | 19 | 119.70 |
| `0xbdf93814…` | DopplerHookInitializer | 50 | 10 | 150.00 |
| `0x1aea38f0…` | ClankerHookStaticFeeV2 | 10 | 2 | 253.31 |
| `0xdda9bc41…` | LaunchHook | 10 | 2 | 99.38 |

A median of 100.00 bps is **1 %** — a completely ordinary, publicly documented launchpad fee. Reading
"1 % is being extracted" as "1 % is being stolen" is a category error, and this document exists partly
to make that error harder to make.

**(c) We have not read a single line of any hook's source.** Not one. The corpus was produced by
`anvil_setCode` and `eth_call`; no decompilation, no audit, no source fetch, no `verifiedSource`
check beyond copying the registry's boolean.

Therefore:

> **Never write "fee charged", "fee extracted", "the hook takes", "skim" or "hidden fee" about a
> TARE number without having read that hook's code.**
>
> The sentence the corpus supports is: *at block 50,614,000, on pool `0x…`, swapping 1e15 wei of
> currency0 for currency1, replacing the hook's bytecode with a compliant no-op moved the quote by
> X bps.* Every qualifier in that sentence changes the number.

That is not a stylistic preference. 63 profiles in this corpus move more than 5 bps across the size
ramp and one moves by 283 bps (`n_non_flat_profiles`, `non_flat_profiles[0].amplitude_bps` in
[`summary.json`](dataset/summary.json)), so a number stripped of its size is already wrong before
anyone interprets it.

## 7. The registry is a description, not a ground truth

The official hook registry has 19 fields — 14 permission booleans, 4 property booleans, one enum, and
`chainId`. **Not one of them is a quantity** ([`FEEDBACK.md`](../FEEDBACK.md)). It can tell you a hook
*can* run `beforeSwap`; it cannot tell you what that costs.

It is also incomplete and it is keyed in a way that misleads:

- **Two of the 12 hooks in this corpus are absent from the 978-entry live registry** —
  `0xb995b9efcc8021300bdc93fbd0c156e9a5ca0088` and `0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000`.
- **The registry has 978 entries but only 866 distinct addresses.** 27 addresses are declared on
  several chains, one on eighteen — hooks are CREATE2-mined for their permission bits, so the same
  address redeploys elsewhere. One of our own measured hooks, `0xbdf938149a…`, exists on both `base`
  and `ethereum`. An address-keyed index attaches whichever entry it met first. That produced false
  result #6; the fix is [`apps/api/src/dataset.ts:213-222`](../apps/api/src/dataset.ts).

Conversely, the 14 permission bits **are** ground truth, because they are the address:
[`engine/tests/test_flags.py:30-52`](../engine/tests/test_flags.py) compares 13,692 bits over 978 hooks
with zero deviation, and 13,692 bits over the 978-entry live snapshot, also zero. Permissions are
exact. Magnitudes are measured. The registry supplies neither.

## 8. The stub is a counterfactual, not an option

Nobody can remove a hook from a live pool. The comparison TARE draws is between the world and a world
that cannot be reached. That is what makes it a clean *measurement* — the two quotes differ in
exactly one variable — and it is also why the result should never be phrased as "you would save X by
avoiding this hook". You cannot avoid it and keep the pool; the pool **is** the hook.

The stub also has to be a *compliant* no-op, not an empty account: an address with no code fails
`Hooks.sol`'s return-shape checks and the quote reverts instead of succeeding. The 89 bytes exist to
make the counterfactual reachable at all ([`METHOD.md`](METHOD.md), section 3).

## 9. One measurer per anvil, or the numbers are fiction

The stub is **global mutable state on the node**. Two measuring processes on one anvil read each
other's stub, and the failure mode is not an error — it is a clean, plausible, wrong number: 100 bps
becomes 0.00. This actually happened (false result #5 in [`HONESTY.md`](HONESTY.md)).

Anyone re-running the sweep must run **one process per fork**:

```bash
anvil --fork-url $RPC --fork-block-number 50614000 --port 8545 &   # and 8546, 8547, 8548
for i in 0 1 2 3; do
  python3 -m tare.cli sweep --rpc http://127.0.0.1:854$((5+i)) --shard $i --of 4 &
done
```

[`engine/tare/cli.py:13-22`](../engine/tare/cli.py). The guard that turns a violation into a refusal
rather than a number is [`engine/tare/sweep.py:137-142`](../engine/tare/sweep.py) and
[`:181-189`](../engine/tare/sweep.py).

## 10. What is not in scope at all

- **Gas.** TARE never measures what a hook costs to execute.
- **Liquidity provision.** `beforeAddLiquidity` / `afterAddLiquidity` behaviour is untouched; only
  swaps are quoted.
- **Multi-hop routes.** Only `quoteExactInputSingle`. A route's total is not the sum of its hops.
- **Exact-output swaps.** Only exact-input.
- **`hookData`.** Every quote passes an empty `hookData`
  ([`engine/tare/quote.py:35-36`](../engine/tare/quote.py)). A hook whose behaviour is driven by
  router-supplied data is measured only in its default branch.
- **Who receives anything.** The counterfactual measures a difference in output. It does not follow
  a token to a recipient and it cannot distinguish a fee taken by the hook from output diverted
  anywhere else.

## 11. The Ledger approval has never touched a Ledger

The guard can ask a Ledger device to approve a swap: `packages/guard/src/ledger.ts` opens a device
over WebHID, builds an EIP-712 message whose fields are the pool, the hook, the measured bps, the
label, the size, the direction and the measurement block, and calls `signEIP712Message` through
`@ledgerhq/hw-app-eth@7.8.16` / `@ledgerhq/hw-transport-webhid@6.36.0`.

**That code has never been executed against a physical device, and never against Speculos.** Every
test it has is against a fake device object ([`packages/guard/test/ledger.test.ts`](../packages/guard/test/ledger.test.ts));
nobody involved in this project has seen these fields rendered on a real screen. Reproduce what
*is* verified with `cd packages/guard && npm install && npm run typecheck && npm test`.

What is therefore unknown: how the Ledger Ethereum app lays out these field names on the device
screen, whether long string values are truncated or paged, how it renders the `TareSwap[]` array or
an empty one, and which `v` a real device returns. No **ERC-7730** clear-signing descriptor has
been written or submitted to Ledger's registry, so the rendering is whatever the generic EIP-712
renderer does.

What *is* verified, and is the property that matters: **every failure path answers no.** No
transport, no `navigator.hid`, a device that will not open, any error raised while signing, a
human rejection (`0x6985`), an unreadable signature, a call carrying text but no report — each
returns `approved: false` with a reason naming the cause. Note the honest edge of that list: the
real-world reasons a signature fails — device locked, Ethereum app not open, cable pulled — all
share one `catch`, and it is that code path that has been exercised, not the causes themselves.

There is deliberately no `signEIP712HashedMessage` fallback for devices too old for full typed
data: that call displays two hashes, which is the blind blob the whole design exists to refuse, so
an incapable device gets a refusal instead of a signature.

And when it does work, the attestation is bounded: a signature says *this device displayed these
fields and a human approved*. It says nothing about whether the bps figure is right, whether the
hook still behaves that way at the current block, or what happened to the transaction afterwards.

---

Labels and their exact meanings: [`HONESTY.md`](HONESTY.md). How the number is produced:
[`METHOD.md`](METHOD.md). Feedback to the Uniswap stack: [`../FEEDBACK.md`](../FEEDBACK.md).
