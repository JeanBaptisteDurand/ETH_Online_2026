# TARE

**Measures what a Uniswap v4 hook actually takes from your swap.**

Uniswap asks hooks to declare what they charge, through the `HookSwap` and `HookFee` events its own
developer guide recommends. Of the **84 hooks deployed in the last 24,000 Base blocks, zero emit
either one**. The official registry describes 613 hooks with 19 fields — 14 permission booleans, 4
property booleans, one enum, and `chainId`. **Not one of them is a quantity.**

So TARE measures it.

A v4 pool's identity — its `PoolKey` — contains the hook's address, so "the same pool without its
hook" does not exist. TARE does not change the pool: **it changes the hook.** On a fork pinned to a
block, `anvil_setCode` replaces the hook's bytecode with an inert stub. The `poolId`, the liquidity,
`slot0` and the reserves are byte-identical; the only thing that changed in the observable universe is
the code that runs during the swap. Quote the same swap twice — once with the real hook, once with the
stub — and the difference **is** what the hook took.

## What we found

**Two hooks take ~1% of your swap on pools whose LP fee, read on-chain, is zero.**

| | |
|---|---|
| Measurements | **128** across **32 pools**, block **50,614,000** (Base) |
| Measurements above 1 bps on pools with `stored_lp_fee == 0` | **60** |
| min / median / max on those | **94.14 / 99.96 / 100.00 bps** |
| Hooks | `0x985c14baa2…` (52 measurements / 25 pools) · `0xdda9bc41e3…` (8 / 2) |

`0x985c14baa2…` is in the official registry — flagged `vanillaSwap=false`, `dynamicFee=false`,
`swapAccess=temporal`, **no audit link**. `0xdda9bc41e3…` **is not in the registry at all.**

The registry has two failure modes and one figure shows both: **it describes without quantifying, and
it does not see everything.**

## What the graph reveals

`engine/tare/graph/` joins the three sources into one graph — 2,931 nodes, 2,579 edges — and
`apps/api/src/graph-routes.ts` serves it. Nodes: 579 hooks, 199 pools, 240 tokens, 158 distinct
bytecodes, 147 deployers, 995 measurements, 613 registry entries. Sources: the published measurements
at block **50,614,000**, `docs/hooklist.json` (613 entries), and 160 `eth_getCode` reads at that same
block. Every number below is a traversal, not a model output, and each replays with one command.

| What the traversal asks | What it finds |
|---|---|
| **Clone clusters** — hooks sharing a `keccak(eth_getCode)` | **2 clusters, 4 hooks.** `0x28efbe4b…` (15,161 bytes, 2 hooks) and `0x6802c0ce…` (23,240 bytes, 2 hooks). Neither cluster has a single measured pool: the duplicated code is deployed, not yet traded. |
| **Orphans** — registry hooks on Base with no liquid pool we could measure | **148 of 157.** All 148 have `bytecode_status = CODE` — they exist on-chain. The registry lists far more hooks than anyone routes a swap through. |
| **Contradictions** — one hook, two registry entries that disagree | **33 of the 37 hooks that carry two entries.** They differ on `name` (23), `declared_deployer` (12), `auditUrl` (9), `swapAccess` (8) — and on **`vanillaSwap` itself, twice**. The field TARE compares against is a field the registry contradicts itself on. |
| **Disagreement** — registry says `vanillaSwap=false`, measurement finds ~0 bps | **1.** `0x3b2b979d…` (LaunchHook): the entry says the hook touches the swap; 20 `MEASURED` measurements across 4 pools peak at **0.0019 bps**, under the 1 bps rounding floor. The other direction — declared vanilla, measured extracting — is **0**. |
| **Not comparable** | **149 hooks.** They have a `vanillaSwap` claim and no `MEASURED` measurement. They are listed as such and never counted as agreement. |

That last row is the point: 149 registry claims that no one, including us, has checked.

```bash
curl localhost:8787/graph                                             # every count above
curl localhost:8787/graph/impact/0x3b2b979df21036cee51b8debb13100e2cb8deacc
PYTHONPATH=engine python3 -m tare.graph.cli disagreement               # the same, offline
```

The graph is loaded **once**, keyed by `(path, mtime_ns, size)`, and its scans are memoised. Measured
on this dataset: 50.8 ms to read and index, then 0.02 ms to hand back, 0.19 ms for `impact` on a
31-pool hook, 0.0001 ms for a memoised aggregate. Rebuilding per request costs 21.7 ms — the mistake
this cache exists to avoid.

## The honesty rules

These are enforced, not aspirational.

1. **The model never produces a number.** It chooses what to query and explains what came back. Every
   value on screen carries its block, its size and its direction, and replays with one command.
2. **Every measurement is labelled** — `MEASURED` · `INTERPOLATED` · `NOT_MEASURABLE` · `NOT_QUOTABLE`
   — and a label is never upgraded to make a point.
3. **Never conclude on a truncated response.** This project has produced three false findings that
   way (a `[:3]` slice, a 2,000-byte body read, a `head -c 220`). Readers are bounded, and a bounded
   read is a `NOT_MEASURABLE`, never a value.
4. **Known limits are published, not hidden.** A hook with custom accounting *is* the liquidity;
   removing it does not measure what it takes, it destroys the pool. Those are `NOT_MEASURABLE`.

## Reproduce any number

```bash
docker compose up -d
make measure HOOK=0x985c14baa2a18316ffda0aefb3a632fadfca2acc BLOCK=50614000
```

## Layout

```
engine/     Python — discovery, liquidity, the stub, the counterfactual, the graph
apps/api    Hono — the x402-gated measurement API on Hedera
apps/web    Vite + React — the instrument
packages/   shared Zod contracts
docs/       method, limits, and the corrections this project had to make
```


## Where to look in the code

Uniswap Foundation asks that a README point at the lines that make the integration verifiable. These
are those lines.

| What | Where |
|---|---|
| **The inert stub**, and why it is shaped that way | [`engine/tare/stub.py`](engine/tare/stub.py) — the `Hooks.sol` return-size invariants it satisfies are named in the module docstring |
| **The counterfactual**: quote, swap the hook's code, quote again, restore | [`engine/tare/measure.py:96-140`](engine/tare/measure.py#L96-L140) |
| **Why a negative result is not negative extraction** | [`engine/tare/measure.py:26`](engine/tare/measure.py#L26) — `CUSTOM_ACCOUNTING_BPS` |
| **`PoolKey` → `poolId` → storage slots** (`pools` at slot 6, `liquidity` at +3) | [`engine/tare/poolid.py`](engine/tare/poolid.py) |
| **`slot0.lpFee` at bits 208–231** — the stored fee the counterfactual falls back to | [`engine/tare/consts.py`](engine/tare/consts.py) |
| **`V4Quoter` calldata**, and the direction-dependent revert | [`engine/tare/quote.py`](engine/tare/quote.py) — `NOT_ENOUGH_LIQUIDITY`, `first_quotable_direction` |
| **The 14 permission bits are the hook's own address** | [`packages/hookflags/src/index.ts`](packages/hookflags/src/index.ts), proven over the whole registry in [`engine/tests/test_flags.py`](engine/tests/test_flags.py) |
| **The gate that cannot be faked** — reproduces five known bps on every run | [`engine/tare/gates/a3.py`](engine/tare/gates/a3.py) |
| **The x402 resource server on Hedera** | [`apps/api/src/x402.ts`](apps/api/src/x402.ts) |
| **Billing by measurement, not by request** | [`apps/api/src/metering/ledger.ts`](apps/api/src/metering/ledger.ts) |
| **The guard that reads the hook out of Universal Router calldata** | [`packages/guard/src/calldata.ts`](packages/guard/src/calldata.ts) |
| **Never truncate an error body** — the bug that hid a revert selector four times | [`engine/tare/rpc.py`](engine/tare/rpc.py) |

## Prompts, specs and planning artifacts

Every brief given to every agent, and the documents they were planned against, are committed under
[`docs/prompts/`](docs/prompts/) and [`docs/planning/`](docs/planning/). See
[`docs/prompts/README.md`](docs/prompts/README.md).

## AI attribution

Built with Claude Code. Every prompt, spec and planning artifact is committed under
[`docs/prompts/`](docs/prompts/) and [`docs/planning/`](docs/planning/) — including
[`docs/planning/01-adversarial-audit.md`](docs/planning/01-adversarial-audit.md), the record of an
earlier direction being abandoned after its own figures failed review.

What is not AI-generated is the measurement: every number in `docs/dataset/` comes from an EVM fork,
and [`engine/tare/gates/a3.py`](engine/tare/gates/a3.py) recomputes five of them on every run.

## License

Apache-2.0
