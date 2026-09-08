# TARE

**Measures what a Uniswap v4 hook actually takes from your swap.**

Uniswap asks hooks to declare what they charge, through the `HookSwap` and `HookFee` events its own
developer guide recommends. Of the **84 hooks deployed in the last 24,000 Base blocks, zero emit
either one**. The official registry describes 978 hooks with 19 fields — 14 permission booleans, 4
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

**39 hooks take between 0% and 18% of your swap on pools whose LP fee, read on-chain, is zero.**

| | |
|---|---|
| Published measurements | **125072** across **7817 pools** and **112 hooks**, block **50,614,000** (Base) |
| of which | **63156** `MEASURED` · **61466** `NOT_QUOTABLE` · **450** `NOT_MEASURABLE` |
| `MEASURED` above 1 bps on pools with `stored_lp_fee == 0` | **38857**, across **3715 pools** and **39 hooks** |
| min / median / max on those | **1.38 / 100.00 / 1800.99 bps** |

Per hook, worst first — every row is `MEASURED`, on pools whose stored LP fee is zero:

| Hook | n / pools | min · median · max (bps) | Registry says |
|---|---|---|---|
| `0xf6ee4dc7…` (unnamed) | 4 / 1 | 1697.89 · 1788.15 · **1800.99** | **not in the registry at all** |
| `0xb429d62f…` Clanker Static Fee Hook v2 (Base) | 3246 / 457 | 2.45 · 119.70 · **1176.47** | `vanillaSwap=false`, `swapAccess=none`, **no audit link** |
| `0x963e91a4…` Bonker Dynamic Fee Hook (Base) | 48 / 6 | 119.75 · 123.09 · **784.22** | `vanillaSwap=false`, `swapAccess=none`, **audit link** |
| `0x1aea38f0…` ClankerHookStaticFeeV2 | 88 / 11 | 11.89 · 99.93 · **690.00** | `vanillaSwap=false`, `swapAccess=none`, **no audit link** |
| `0xd60d6b21…` Clanker Dynamic Fee Hook v2 (Base) | 160 / 20 | 119.75 · 119.81 · **542.57** | `vanillaSwap=false`, `swapAccess=none`, **no audit link** |
| `0x4db26380…` (unnamed) | 16 / 1 | 76.70 · 300.00 · **300.20** | **not in the registry at all** |
| `0xdc786b62…` (unnamed) | 15 / 1 | 1.38 · 299.99 · **300.00** | **not in the registry at all** |
| `0x2cfa8e22…` (unnamed) | 14 / 1 | 4.20 · 299.99 · **300.00** | **not in the registry at all** |
| `0x9d88b5c5…` (unnamed) | 15 / 1 | 4.23 · 300.00 · **300.00** | **not in the registry at all** |
| `0xc90eddf5…` (unnamed) | 14 / 1 | 3.18 · 299.92 · **300.00** | **not in the registry at all** |
| `0xd3200486…` (unnamed) | 8 / 1 | 35.48 · 298.78 · **300.00** | **not in the registry at all** |
| `0x331c79a4…` (unnamed) | 8 / 1 | 35.31 · 298.77 · **300.00** | **not in the registry at all** |
| `0x78a9763f…` (unnamed) | 16 / 1 | 25.04 · 149.95 · **250.00** | **not in the registry at all** |
| `0x802b438d…` (unnamed) | 8 / 1 | 249.90 · 250.00 · **250.00** | **not in the registry at all** |
| `0xfdc5cb0b…` (unnamed) | 15 / 1 | 45.47 · 249.90 · **250.00** | **not in the registry at all** |
| `0x0469a4bd…` Zora Hook | 18808 / 1594 | 2.08 · 100.00 · **250.00** | `vanillaSwap=false`, `swapAccess=none`, **no audit link** |
| `0x5f3e9830…` (unnamed) | 16 / 1 | 25.04 · 149.95 · **250.00** | **not in the registry at all** |
| `0xcee1c806…` (unnamed) | 9 / 1 | 248.35 · 250.00 · **250.00** | **not in the registry at all** |
| `0xbdf93814…` DopplerHookInitializer | 3680 / 386 | 100.00 · 150.00 · **200.00** | `vanillaSwap=false`, `swapAccess=none`, **no audit link** |
| `0xa7456286…` (unnamed) | 16 / 1 | 18.69 · 199.94 · **200.00** | **not in the registry at all** |
| `0xc75a2eb1…` (unnamed) | 16 / 1 | 182.64 · 199.00 · **199.00** | **not in the registry at all** |
| `0x9811f10c…` Liquid Static Fee Hook V2 | 48 / 6 | 12.00 · 119.72 · **179.46** | `vanillaSwap=false`, `swapAccess=none`, **no audit link** |
| `0x80e2f7dc…` Liquid Dynamic Fee Hook V2 | 88 / 11 | 64.54 · 119.70 · **119.76** | `vanillaSwap=false`, `swapAccess=none`, **no audit link** |
| `0x6e4e217a…` (unnamed) | 6 / 1 | 98.44 · 100.00 · **103.61** | **not in the registry at all** |
| `0x588c683e…` (unnamed) | 15 / 1 | 99.68 · 100.00 · **100.09** | **not in the registry at all** |
| `0x985c14ba…` LaunchHook | 11890 / 1159 | 1.61 · 99.96 · **100.00** | `vanillaSwap=false`, `swapAccess=temporal`, **no audit link** |
| `0xdda9bc41…` (unnamed) | 128 / 10 | 13.84 · 99.99 · **100.00** | **not in the registry at all** |
| `0x4951d0e1…` (unnamed) | 8 / 1 | 100.00 · 100.00 · **100.00** | **not in the registry at all** |
| `0xc783f473…` (unnamed) | 16 / 1 | 100.00 · 100.00 · **100.00** | **not in the registry at all** |
| `0xacf358b1…` ZNS Launchpad | 48 / 6 | 35.98 · 99.90 · **100.00** | `vanillaSwap=false`, `swapAccess=none`, **no audit link** |
| `0x23321f11…` Flaunch POSM v4 (Base) | 135 / 9 | 93.46 · 99.95 · **100.00** | `vanillaSwap=false`, `swapAccess=none`, **no audit link** |
| `0x1f91c998…` (unnamed) | 56 / 5 | 14.33 · 99.94 · **100.00** | **not in the registry at all** |
| `0x99a680fb…` (unnamed) | 8 / 1 | 96.86 · 100.00 · **100.00** | **not in the registry at all** |
| `0xf85f1f30…` (unnamed) | 130 / 9 | 9.21 · 99.97 · **100.00** | **not in the registry at all** |
| `0x7f1d86c9…` (unnamed) | 8 / 1 | 95.76 · 100.00 · **100.00** | **not in the registry at all** |
| `0xbd00cfb2…` (unnamed) | 8 / 1 | 99.44 · 100.00 · **100.00** | **not in the registry at all** |
| `0x82ff9706…` (unnamed) | 8 / 1 | 100.00 · 100.00 · **100.00** | **not in the registry at all** |
| `0x27e626d1…` (unnamed) | 5 / 1 | 37.41 · 41.11 · **52.08** | **not in the registry at all** |
| `0x8f29bd5c…` Aegis | 32 / 2 | 8.63 · 29.96 · **29.97** | `vanillaSwap=false`, `swapAccess=none`, **no audit link** |

12 of the 39 are described by the registry — every one of them as `vanillaSwap: false` — and they take **1176 / 784 / 690 / 543 / 250 / 200 / 179 / 120 / 100 / 100 / 100 / 30 bps**. The remaining 27 are not described at all.

The registry has two failure modes and this table shows both: **it describes without quantifying, and
it does not see everything.**

```bash
PYTHONPATH=engine python3 -m tare.dataset.stats --lp-fee-zero --above-bps 1   # the table above
```

<!-- /FACTS:what-we-found -->

## What the graph reveals

<!-- FACTS:graph -->

`engine/tare/graph/` joins the three sources into one graph — **143,788 nodes, 149,904 edges** — and `apps/api/src/graph-routes.ts` serves it. Nodes: 1,019 hooks, 7,817 pools, 8,586 tokens, 158 distinct bytecodes, 158 deployers, 125,072 measurements, 978 registry entries. Every number below is a traversal, not a model output, and each replays with one command.

Its measurements are every one this repository publishes — `docs/dataset/measurements.jsonl` (125,072) + `docs/dataset/measurements-contestes.jsonl` (368) — against `docs/hooklist-live-20260905.json`. The table above counts the main sweep only, which is why its total is the smaller of the two.

| What the traversal asks | What it finds |
|---|---|
| **Clone clusters** — hooks sharing a `keccak(eth_getCode)` | **2 clusters, 4 hooks.** `0x28efbe4b…` (15,161 bytes, 2 hooks), `0x6802c0ce…` (23,240 bytes, 2 hooks). 2 of the 2 clusters have no measured pool at all: the duplicated code is deployed, not yet traded. |
| **Orphans** — registry hooks on Base with no liquid pool we could measure | **238 of 272.** 138 of them have `bytecode_status = CODE` — they exist on-chain. The registry lists far more hooks than anyone routes a swap through. |
| **Contradictions** — one hook, two registry entries that disagree | **33 of the 37 hooks that carry more than one entry.** They differ on `name` (23), `declared_deployer` (12), `auditUrl` (9), `swapAccess` (8) — and on **`vanillaSwap` itself, 2 times**. |
| **Disagreement** — registry says `vanillaSwap=false`, measurement finds ~0 bps | **5.** `0x3b2b979d…` (LaunchHook): the entry says the hook touches the swap; 2446 `MEASURED` across 280 pools peak at **0.3134 bps**, under the 1 bps rounding floor. The other direction — declared vanilla, measured extracting — is **0**. |
| **Not comparable** | **241 hooks.** They carry a `vanillaSwap` claim and no `MEASURED` measurement. They are listed as such and never counted as agreement. |

That last row is the point: **241 registry claims that no one, including us, has checked.**

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

## What each piece is for

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) answers one question per section: why a technology
is here and what would be lost without it. It carries the three diagrams — the chain from an
`Initialize` log to a refused signature, the three Hedera layers, and which panels are reading,
which are user actions, and which touch a chain. It also says plainly which two panels are
missing.

## From a fresh clone

The repository ships the **evidence** — `docs/dataset/measurements.jsonl`, 125,072 measurements,
86 MB — and the code that produced it. It does not ship what that evidence generates: the graph
(189 MB), the guard's lookup table (21 MB) and the instrument's bundled dataset (87 MB) are
recomputed, not versioned. One of them is over GitHub's file limit, and versioning a derived file
is how the graph once came to carry ten numbers the dataset had already retracted.

```bash
bash scripts/regenerate.sh      # rebuilds all three, in dependency order, then runs every suite
```

It refuses to run while a sweep is writing to the corpus: artefacts built from a moving dataset
disagree with each other, which is worse than artefacts that are merely old.

To rebuild just one:

```bash
cd engine && python3 -m tare.graph.cli build          # the graph
cd packages/guard && npm run build:table              # the guard's table
node apps/web/scripts/build-dataset.mjs               # the instrument's data
```

The two published surfaces need none of this: `apps/web` and `apps/landing` regenerate their own
data as the first step of `npm run build`, which is why GitHub Pages deploys from a clean checkout.

## Reproduce any number

```bash
docker compose up -d
make replay POOL=0x010d0023c9e072f62720b6627a13973b9505a3d80dccd59acdb2ca803826c538 \
           SIZE=100000000000000 DIR='0>1'
# -> 99.9942 bps, identical to the wei, in about six seconds
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
| **The gate that executes a real swap** — quote against execution, both legs | [`engine/tare/gates/a4.py`](engine/tare/gates/a4.py) — `make gate-a4` |
| **The gate that cannot be faked** — reproduces five known bps on every run | [`engine/tare/gates/a3.py`](engine/tare/gates/a3.py) |
| **The x402 resource server on Hedera** | [`apps/api/src/x402.ts`](apps/api/src/x402.ts) |
| **The client that actually pays**, and the four steps it keeps visible | [`apps/api/src/pay/client.ts`](apps/api/src/pay/client.ts) — settled transfers in [`docs/x402-settlements.jsonl`](docs/x402-settlements.jsonl) |
| **Billing by measurement, not by request** | [`apps/api/src/metering/ledger.ts`](apps/api/src/metering/ledger.ts) |
| **A paid unit the engine then calls unmeasurable is a credit, not a zero** | [`apps/api/src/metering/ledger.ts`](apps/api/src/metering/ledger.ts) — `totals()`, and [`X402.md`](X402.md) |
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

## What we could not do, and where the fix belongs upstream

The guard's hardware leg stops one step short of a Ledger screen, and the step is not ours to take
alone: the Ethereum app displays an arbitrary EIP-712 struct field by field only when Ledger holds
filter descriptors for that schema. Ours is new, so the device offers blind signing instead — which
this project refuses. Run against Speculos with the official app 1.22.3, the screen says so in its
own words. [`OPEN-SOURCE.md`](OPEN-SOURCE.md) is the write-up, with what could be
contributed upstream and where. [`EIP712.md`](EIP712.md) is the full clear-signing
experiment, screen by screen.

The x402 service is **not hosted**: every settled payment in [`X402.md`](X402.md) was made
against a local instance. The track asks for a live service; that part is not done.

## License

Apache-2.0
