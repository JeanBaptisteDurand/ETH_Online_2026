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

<!-- FACTS:what-we-found -->

**Eight hooks take between 0.5% and 11.8% of your swap on pools whose LP fee, read on-chain, is zero.**

| | |
|---|---|
| Published measurements | **10964** across **810 pools** and **16 hooks**, block **50,614,000** (Base) |
| of which | **8059** `MEASURED` · **2806** `NOT_QUOTABLE` · **99** `NOT_MEASURABLE` |
| `MEASURED` above 1 bps on pools with `stored_lp_fee == 0` | **6997**, across **629 pools** and **8 hooks** |
| min / median / max on those | **51.40 / 100.00 / 1176.46 bps** |

Per hook, worst first — every row is `MEASURED`, on pools whose stored LP fee is zero:

| Hook | n / pools | min · median · max (bps) | Registry says |
|---|---|---|---|
| `0xb429d62f…` Clanker Static Fee Hook v2 (Base) | 95 / 19 | 79.58 · 119.70 · **1176.46** | `vanillaSwap=false`, `swapAccess=none`, **no audit link** |
| `0x1aea38f0…` ClankerHookStaticFeeV2 | 10 / 2 | 57.44 · 253.31 · **689.95** | `vanillaSwap=false`, `swapAccess=none`, **no audit link** |
| `0xbdf93814…` DopplerHookInitializer | 172 / 20 | 150.00 · 175.00 · **175.00** | `vanillaSwap=false`, `swapAccess=none`, **no audit link** |
| `0x6e4e217a…` (unnamed) | 6 / 1 | 98.44 · 100.00 · **103.61** | **not in the registry at all** |
| `0x0469a4bd…` Zora Hook | 6571 / 559 | 51.40 · 100.00 · **100.00** | `vanillaSwap=false`, `swapAccess=none`, **no audit link** |
| `0x4951d0e1…` (unnamed) | 8 / 1 | 100.00 · 100.00 · **100.00** | **not in the registry at all** |
| `0x985c14ba…` LaunchHook | 125 / 25 | 69.30 · 99.56 · **100.00** | `vanillaSwap=false`, `swapAccess=temporal`, **no audit link** |
| `0xdda9bc41…` (unnamed) | 10 / 2 | 61.64 · 99.38 · **99.99** | **not in the registry at all** |

5 of the 8 are described by the registry — every one of them as `vanillaSwap: false`, with no audit link — and they take **1176 / 690 / 175 / 100 / 100 bps**. The remaining 3 are not described at all.

The registry has two failure modes and this table shows both: **it describes without quantifying, and
it does not see everything.**

```bash
PYTHONPATH=engine python3 -m tare.dataset.stats --lp-fee-zero --above-bps 1   # the table above
```

<!-- /FACTS:what-we-found -->

## What the graph reveals

<!-- FACTS:graph -->

`engine/tare/graph/` joins the three sources into one graph — **15,541 nodes, 15,138 edges** — and `apps/api/src/graph-routes.ts` serves it. Nodes: 961 hooks, 830 pools, 1,189 tokens, 158 distinct bytecodes, 158 deployers, 11,267 measurements, 978 registry entries. Every number below is a traversal, not a model output, and each replays with one command.

Its measurements are every one this repository publishes — `docs/dataset/measurements.jsonl` (10,964) + `docs/dataset/measurements-contestes.jsonl` (309) — against `docs/hooklist-live-20260905.json`. The table above counts the main sweep only, which is why its total is the smaller of the two.

| What the traversal asks | What it finds |
|---|---|
| **Clone clusters** — hooks sharing a `keccak(eth_getCode)` | **2 clusters, 4 hooks.** `0x28efbe4b…` (15,161 bytes, 2 hooks), `0x6802c0ce…` (23,240 bytes, 2 hooks). 2 of the 2 clusters have no measured pool at all: the duplicated code is deployed, not yet traded. |
| **Orphans** — registry hooks on Base with no liquid pool we could measure | **259 of 272.** 148 of them have `bytecode_status = CODE` — they exist on-chain. The registry lists far more hooks than anyone routes a swap through. |
| **Contradictions** — one hook, two registry entries that disagree | **33 of the 37 hooks that carry more than one entry.** They differ on `name` (23), `declared_deployer` (12), `auditUrl` (9), `swapAccess` (8) — and on **`vanillaSwap` itself, 2 times**. |
| **Disagreement** — registry says `vanillaSwap=false`, measurement finds ~0 bps | **1.** `0x3b2b979d…` (LaunchHook): the entry says the hook touches the swap; 20 `MEASURED` across 4 pools peak at **0.0019 bps**, under the 1 bps rounding floor. The other direction — declared vanilla, measured extracting — is **0**. |
| **Not comparable** | **260 hooks.** They carry a `vanillaSwap` claim and no `MEASURED` measurement. They are listed as such and never counted as agreement. |

That last row is the point: **260 registry claims that no one, including us, has checked.**

```bash
curl localhost:8787/graph                                # every count above
PYTHONPATH=engine python3 -m tare.graph.cli disagreement  # the same, offline
```

<!-- /FACTS:graph -->

The graph is loaded **once**, keyed by `(path, mtime_ns, size)`, and its scans are memoised. These are
medians over 21 runs on one laptop, not a constant — the point is the ratio, and the command prints
your own numbers:

| | median |
|---|---|
| cold load — read `graph.json` and index it, paid once | 63.5 ms |
| warm hand-back — every request after that | **0.035 ms** |
| `impact()` on the widest hook in the set (73 pools) | 1.20 ms |
| a memoised aggregate (`contradictions`) | 0.0004 ms |
| rebuilding from sources per request — the mistake this cache exists to avoid | 929 ms |

```bash
PYTHONPATH=engine python3 -m tare.graph.cachebench
```

## The honesty rules

These are enforced, not aspirational.

1. **The model never produces a number.** It chooses what to query and explains what came back. Every
   value on screen carries its block, its size and its direction, and replays with one command.
2. **Every measurement is labelled** — `MEASURED` · `INTERPOLATED` · `NOT_MEASURABLE` · `NOT_QUOTABLE`
   — and a label is never upgraded to make a point.
3. **Never conclude on a truncated response.** This project has produced nine false findings, and
   five of the nine were the same mistake: a read was silently bounded, and the truncated result
   parsed cleanly — a `[:3]` slice, a 2,000-byte body, a `head -c 220`, a 200-character error
   string that cut a revert selector in half. None of them raised an exception; all of them
   produced a plausible number. All nine are written up in [`docs/HONESTY.md`](docs/HONESTY.md) —
   what was claimed, how it was caught, what makes it impossible now. A bounded read is a
   `NOT_MEASURABLE`, never a value, and never a zero.
4. **Known limits are published, not hidden.** A hook with custom accounting *is* the liquidity;
   removing it does not measure what it takes, it destroys the pool. Those are `NOT_MEASURABLE`.

## Reproduce any number

```bash
docker compose up -d
make measure HOOK=0x985c14baa2a18316ffda0aefb3a632fadfca2acc BLOCK=50614000
```

## Layout

```
engine/            Python — discovery, liquidity, the stub, the counterfactual, the graph
apps/api           Hono — the x402-gated measurement API on Hedera, and the assistant
apps/web           Vite + React — the instrument
apps/landing       the one-page verdict, readable with JavaScript off
apps/mcp           four MCP tools, so an agent can ask the same questions
packages/guard     reads the hook out of Universal Router calldata, plus an MV3 extension
packages/hookflags the 14 permission bits, derived from the hook's own address
docs/              method, limits, and the corrections this project had to make
```


## Where to look in the code

Uniswap Foundation asks that a README point at the lines that make the integration verifiable. These
are those lines.

| What | Where |
|---|---|
| **The inert stub**, and why it is shaped that way | [`engine/tare/stub.py`](engine/tare/stub.py) — the `Hooks.sol` return-size invariants it satisfies are named in the module docstring |
| **The counterfactual**: quote, swap the hook's code, quote again, restore | [`engine/tare/measure.py:68-102`](engine/tare/measure.py#L68-L102) — the whole of `measure()` |
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
