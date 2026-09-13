# TARE

**Measures what a Uniswap v4 hook actually takes from your swap.**

Uniswap asks hooks to declare what they charge, through the `HookSwap` and `HookFee` events its own
developer guide recommends. Over the 200,000 Base blocks this corpus is built from, the PoolManager
initialised pools carrying **1,559 distinct hooks — and 9 of them emit either event, 0.58 %**
(16 contracts in total do, hooks or not). And an emitted `HookFee` carries an absolute amount on
one past swap, not the rate you would pay at your size. Re-run it yourself:
`python3 -m tare.declare --scan` — the offline half costs no requests, and the artefact is
[`docs/dataset/declarations.json`](docs/dataset/declarations.json).

The official registry describes 978 entries — 866 distinct addresses, the rest declared on more
than one chain — with **27 fields each, 19 of them booleans**: 14 permission flags, 4 property
booleans, `verifiedSource`, a `swapAccess` enum and eight identity fields. **Not one of the 27 is
a quantity.** The only number in the whole record is `chainId`, and it names a network.

And it does not see most of what takes something. Of the **112 hooks measured here, 78 are absent
from that registry entirely — 69.64 %.** Only 34 are listed. The 78 addresses are enumerated in
[`docs/dataset/registre-couverture.json`](docs/dataset/registre-couverture.json) — counted from
the two files by `python3 -m tare.registre`, never typed.

So TARE measures it.

A v4 pool's identity — its `PoolKey` — contains the hook's address, so "the same pool without its
hook" does not exist. TARE does not change the pool: **it changes the hook.** On a fork pinned to a
block, `anvil_setCode` replaces the hook's bytecode with an inert stub. The `poolId`, the liquidity,
`slot0` and the reserves are byte-identical; the only thing that changed in the observable universe is
the code that runs during the swap. Quote the same swap twice — once with the real hook, once with the
stub — and the difference **is** what the hook took.

Replay the headline number in about six seconds, against your own fork:

```bash
docker compose up -d anvil     # needs BASE_RPC_URL in .env
make replay POOL=0x010d0023c9e072f62720b6627a13973b9505a3d80dccd59acdb2ca803826c538 \
           SIZE=100000000000000 DIR='0>1'
# -> 99.9942 bps, identical to the wei
```

---

## Contents

| | |
|---|---|
| **The findings** | [What we found](#what-we-found) · [What the graph reveals](#what-the-graph-reveals) · [The graph cache](#the-graph-cache) |
| **Running it** | [Run it locally](#run-it-locally) · [What has to be running, and what breaks without it](#what-has-to-be-running-and-what-breaks-without-it) · [Reproduce any number](#reproduce-any-number) |
| **The agent** | [The agent, and its fourteen tools](#the-agent-and-its-fourteen-tools) · [The five ways in](#the-five-ways-in) · [The twenty-seven datasets](#the-twenty-seven-datasets) |
| **The method** | [The honesty rules](#the-honesty-rules) · [What each piece is for](#what-each-piece-is-for) · [Layout](#layout) · [Where to look in the code](#where-to-look-in-the-code) |
| **The record** | [Prompts, specs and planning artifacts](#prompts-specs-and-planning-artifacts) · [AI attribution](#ai-attribution) · [What we could not do, and where the fix belongs upstream](#what-we-could-not-do-and-where-the-fix-belongs-upstream) · [License](#license) |

---

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

---

## What the graph reveals

<!-- FACTS:graph -->

`engine/tare/graph/` joins the three sources into one graph — **143,788 nodes, 149,904 edges** — and `apps/api/src/graph-routes.ts` serves it. Nodes: 1,019 hooks, 7,817 pools, 8,586 tokens, 158 distinct bytecodes, 158 deployers, 125,072 measurements, 978 registry entries. Every number below is a traversal, not a model output, and each replays with one command.

Its measurements are every one this repository publishes — `docs/dataset/measurements.jsonl` (125,072) + `docs/dataset/measurements-contestes.jsonl` (368) — against `docs/hooklist-live-20260905.json`. The 368 contested rows are re-measurements of rows already in the main sweep, so `sweep.dedupe` folds them back in and **both totals are the same 125,072**: the contested file is a second look, not extra data.

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

### The graph cache

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

---

## Run it locally

Python 3 and Node are the only prerequisites for everything except a **new** measurement, which
needs Docker and a Base RPC endpoint. There is no npm workspace root: each app and each package
carries its own `package.json` and its own lockfile, which is why installation is a script and not
one `npm install`.

```bash
git clone https://github.com/JeanBaptisteDurand/ETH_Online_2026.git
cd ETH_Online_2026
cp .env.example .env            # BASE_RPC_URL is the only one needed to measure

bash scripts/install-all.sh     # installs the 7 packages, then builds the 3 derived artefacts
bash scripts/test-all.sh        # every suite, one citable line at the end
```

`scripts/install-all.sh` also builds the three files that are gitignored because they recompute
from the repo with no network and no RPC: `apps/web/src/data/dataset.json`,
`apps/web/src/data/facts.json` and `packages/guard/data/table.json`. Without them the front-end
tests fail and `packages/guard` does not even load — its `data/table.json` is a *static* import.

Run the site:

```bash
cd apps/web && npm run dev      # the instrument; `npm run data` runs first, Vite prints the URL
cd apps/landing && npm run dev  # the one-page verdict, port 5174
```

Nothing above needs a chain. The instrument answers from the corpus embedded in the page.

Run the tests, at three granularities:

```bash
make test                       # the engine suite alone — `engine 358/358`
bash scripts/test-all.sh        # every suite in the repo, counted once
cd packages/guard && npm test   # one package — `apps/api`, `apps/mcp`, `apps/landing`,
                                # `packages/guard` and `packages/keyring` each have `npm test`
```

Without `install-all.sh`, `scripts/test-all.sh` reports **six suites that do not run** rather than
a failure — it distinguishes the two, and says which. A suite that fails to run is never counted
as zero, and a skipped test is never counted as a failure: a missing prerequisite is a state, not
an accusation.

A **new** measurement needs the fork:

```bash
docker compose up -d anvil      # Base fork pinned to FORK_BLOCK (default 50,614,000)
make gate-a3                    # reproduces five known bps for hook 0x1aea38f0 — cannot be faked
make gate-a4                    # executes REAL swaps and compares execution to the quote
make measure HOOK=0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc   # every pool of one hook
```

### Rebuilding the derived artefacts

The repository ships the **evidence** — `docs/dataset/measurements.jsonl`, 125,072 measurements,
86 MB — and the code that produced it. It does not ship what that evidence generates: the graph
(189 MB), the guard's lookup table (21 MB) and the instrument's bundled dataset (7.9 MB) are
recomputed, not versioned. One of them is over GitHub's file limit, and versioning a derived file
is how the graph once came to carry ten numbers the dataset had already retracted.

The instrument's dataset is the same 125,072 rows as the corpus, written **by column** rather than
by object — the same stub hash repeated 125,072 times costs one string, not 125,072. It went from
86 MB to 7.9 MB that way, which is why the page paints in 2.7 s instead of 10.3 s. The encoder
decodes what it just wrote and compares all 125,072 rows before emitting: a codec that is wrong in
silence would turn one measurement into another.

```bash
bash scripts/regenerate.sh      # rebuilds all three, in dependency order, then runs every suite
```

It refuses to run while a sweep is writing to the corpus: artefacts built from a moving dataset
disagree with each other, which is worse than artefacts that are merely old. Without it, the graph
suites **skip** and print the one command that would enable them.

To rebuild just one:

```bash
cd engine && python3 -m tare.graph.cli build          # the graph
cd packages/guard && npm run build:table              # the guard's table
node apps/web/scripts/build-dataset.mjs               # the instrument's data
```

The two published surfaces need none of this: `apps/web` and `apps/landing` regenerate their own
data as the first step of `npm run build`, which is why GitHub Pages deploys from a clean checkout.

---

## What has to be running, and what breaks without it

Nothing here degrades silently. Each surface that needs a dependency **says so** when it is
absent, with the reason and the command that fixes it — a read that failed is never reported as
an empty result.

| you want | you need | without it |
|---|---|---|
| `/hooks`, `/hook/:addr`, `/measurement/:id`, `/route`, the instrument | nothing — the 125,072 measurements are in the repo | works |
| `POST /measure` (a **new** measurement) | `docker compose up -d anvil` + a `BASE_RPC_URL` | `503 moteur indisponible`, never a fabricated number |
| `/graph` and its traversals | nothing — rebuilt by `scripts/regenerate.sh` | says the graph file is missing |
| `/rag/search` (the **vector** retriever) | `docker compose up -d db`, **plus** `ollama serve` with `granite-embedding:278m` | `503 INDEX_UNAVAILABLE`, or `503 DIM_MISMATCH` |
| a settled x402 payment | a funded Hedera account, associated with `0.0.429274` | `402` forever, which is correct |

The **`DIM_MISMATCH`** case is worth naming, because it is the one that would silently poison
answers if it were not checked. The index is built with `granite-embedding:278m` (**768**
dimensions). If ollama is not running, the embedder falls back to OpenAI
`text-embedding-3-small` (**1536**), and the two spaces do not compare — nearest neighbours in
the wrong space are not worse answers, they are meaningless ones. So the route refuses:

```json
{ "status": "DIM_MISMATCH",
  "error": "question en dimension 1536, index en 768 : deux espaces vectoriels ne se comparent pas" }
```

`GET /rag/meta` shows both dimensions, `dimension_match`, and which embedder was chosen and why.

```bash
ollama serve &                        # then: ollama pull granite-embedding:278m
TARE_DB_PORT=55432 docker compose up -d db anvil
cd apps/api && npx tsx src/server.ts
```

---

## Reproduce any number

Every figure on this page replays from one command. The measurement itself:

```bash
docker compose up -d
make replay POOL=0x010d0023c9e072f62720b6627a13973b9505a3d80dccd59acdb2ca803826c538 \
           SIZE=100000000000000 DIR='0>1'
# -> 99.9942 bps, identical to the wei, in about six seconds
```

The aggregates, all offline, all from files already in the repo:

```bash
PYTHONPATH=engine python3 -m tare.dataset.stats --lp-fee-zero --above-bps 1   # the "What we found" table
PYTHONPATH=engine python3 -m tare.graph.cli disagreement                      # the graph traversals
python3 -m tare.registre                                                      # the 78 absent hooks
python3 -m tare.declare --scan                                                # the 9 hooks that declare
make readme                                                                   # regenerate the table, then check it
```

`make readme` is the reason the numbers above cannot rot: it rewrites the `What we found` block
from the published dataset, and `engine/tests/test_readme.py` then fails if any figure the prose
asserts is no longer recomputable — including every per-hook maximum in the table.

---

## The agent, and its fourteen tools

TARE is not a chat window in front of a database. It is fourteen named tools, each with one user
question, one declared input, one declared output and one declared cost —
[`apps/web/src/lib/outils.ts`](apps/web/src/lib/outils.ts) is the single source of truth, and the
site, the MCP server and this table all read it. **The model never produces a number:** it chooses
which tool to call and explains what came back.

The tools fall into three families, and the distinction is not decorative:

- **collect** (3 tools) — it goes and fetches a value that did not exist yet. This is the family
  that costs: an RPC call, a fork, a toll.
- **analyse** (5 tools) — it reads what is already measured and draws an answer out of it. No
  network, no chain: the corpus is in the page.
- **action** (6 tools) — it *changes* something: a transaction, a session, an on-chain write.
  **Only this third family touches anyone's money**, and it is the one where a mistake costs. A
  reader has to be able to spot it without reading, which is why it carries its own colour on the
  site.

Ten of the fourteen are `ready`. Three are `pending` — the code exists and passes its tests, but a
human action is missing, and each one says which. One is `offline by construction`: the browser
extension is installed, not served. A tool whose state is not `ready` must say why; "to be built",
with no reason, is an empty box no one remembers to fill.

| # | Tool | Family | The user question it answers | In → what it runs | Fields it returns | Cost | State |
|---|---|---|---|---|---|---|---|
| 1 | **Measure** (`Mesurer`) | collect | "this hook, on this pool, at this size — what does it actually take?" | a full `PoolKey`, a size, a direction, a block → pins an anvil fork; quotes the swap as-is; rewrites the **hook's** bytecode with an inert 89-byte stub (same address, so same `poolId`, same liquidity, same `slot0`); quotes again; restores | `out_with`, `out_without`, `bps`, `label`, `block_number`, `stub_hash`, `replay` | 0.001 USDC per measurement, settled over x402 on Hedera | ready |
| 2 | **Look up** (`Consulter`) | analyse | "what is already measured on this hook?" | a hook address or a pool id → searches the corpus already in memory; computes nothing and completes nothing; returns the rows as measured, each with its label | `lignes`, `median`/`max` (on `MEASURED` rows only), `n_mesures`, `label` | nothing — the corpus is embedded in the page | ready |
| 3 | **Situate** (`Situer`) | analyse | "I put 100 € into this token — how much is left if I get out?" | a token address, an amount → finds the measured pools carrying it; takes the levy on the way in, **then on the way out**; composes the two instead of adding them; returns an interval, not a point, when the exit varies with size | `entree_bps`, `sortie_bps`, `aller_retour`, `intervalle`, `sens_unique` | nothing | ready |
| 4 | **Understand** (`Comprendre`) | analyse | "is this hook one of a kind, or are there copies?" | a hook address, or nothing at all for the whole picture → confronts the registry with the hooks seen running; confronts the corpus with an independent source (The Graph) and publishes the **divergences**, not the agreements; groups identical bytecodes | `absents`, `divergents`, `declarants`, `grappes` | one API call; the graph is not in the bundle | **pending** — the graph is rebuilt by `tare.graph.cli build`, not shipped. Unreachable, the three cards say "not reachable" and give the command; they never display zero clones |
| 5 | **Decide** (`Décider`) | analyse | "to swap A for B, which pool do I go through?" | two currency addresses (or one), a size → keeps only the gates that really **buy** the token asked for; groups by currency paid, because a price in WETH and a price in USDC do not compare; ranks by total levy, LP fee included; refuses to rank when only one gate is measured | `etat` (`PLUSIEURS_PORTES`, `PORTE_UNIQUE`, `AUCUNE_MESUREE`, `JETON_INCONNU`, `MONNAIE_DE_COTATION`), `groupes`, `total_bps`, `ecart`, `raison` | nothing | ready |
| 6 | **Offer another gate** (`Proposer une autre porte`) | analyse | "and elsewhere, would it be cheaper?" | the transaction about to be signed → looks for **sibling** pools (same currencies, same direction — not "the same token elsewhere", which would compare prices paid in different currencies); compares at equal size, never at an interpolated one; proposes only above a 1 bps threshold | `etat` (one of six named states, including `PORTE_UNIQUE`, which is an answer), `alternative`, `part_porte_unique` | zero RPC calls: the comparison is local | ready |
| 7 | **Substitute the transaction** (`Substituer la transaction`) | **action** | "build me the transaction that goes through the cheapest gate" | the chosen alternative, the user address, the Permit2 state **read on chain**, a live quote → reads the token's allowance to Permit2 then to the router; reads the Permit2 nonce instead of guessing it; quotes the target gate live to set the output floor (−50 bps tolerance), never from the block-pinned corpus; encodes the `0x0a10` command list (`PERMIT2_PERMIT` then `V4_SWAP`); **re-reads its own calldata** and refuses if the re-read does not give back the same values | `to`/`data`/`value`, `etat` (`PRET`, or one of eight states naming what is missing), `plancher`, `echeance` (now + 20 min — the router default was the year 2106), `appels_rpc` | up to three `eth_call`, and only if a cheaper gate exists | ready |
| 8 | **Intercept** (`Intercepter`) | collect | "what am I about to sign?" | the calldata the exchange site is about to have signed, caught **before** the wallet → traps the provider's request method; decodes the Universal Router calldata and extracts the `PoolKey`; **re-derives the `poolId` and rejects the row if it does not come back**; queries the table embedded in its service worker — no request, so nothing to watch leak; gives its verdict before the signature, and leaves the last word to the human | `pool_id` (re-derived, not the one announced), `hook`, `bps`, `verdict`, `delai` | nothing, and no request: the table is in the extension | **offline by construction** — the extension is installed, not served; the API key only files its verdicts into the account history |
| 9 | **Approve** (`Approuver`) | **action** | "do I confirm, or do I cancel?" | the guard's report and a device, when there is one → encodes the report as EIP-712, typed and named; renders it **screen by screen** on the device — you do not sign an opaque hash; waits for the human, with no default; a refusal returns code 4001 and **nothing is called** | `ecrans`, `signature`, `refus` (4001) | one signature | ready |
| 10 | **Pay per unit** (`Payer à l'unité`) | collect | "I want a fresh measurement, with no account" | a measurement request with no account and no key; a Hedera account with test USDC → answers `402` **announcing the price** instead of refusing; takes payment, then runs the measurement; **re-reads the settlement on the Hedera mirror node** — a server that says "paid" is not enough, it is the server being checked; writes the settlement to the ledger only if the mirror node returns it | the `402` payload (price, network, token, payee), `mesure`, `tx_hash`, `relu` | 0.001 USDC per measurement | ready |
| 11 | **Subscribe** (`S'abonner`) | **action** | "I want the extension, the MCP server and my history" | a connected wallet; the expiry **read on the contract**, never the one our database announces → sends the price to the contract, which computes the duration itself (the site sends no calldata); re-reads the expiry on chain after the transaction; refuses to activate anything if that read fails | `abonneJusquA`, `actif` (false until the on-chain read confirms), `surfaces` | the contract's price, read on chain | **pending** — 182 lines of Solidity, 20 forge tests, checked against a local fork where 1.5 × the price buys exactly 45.00 days, but **not deployed** on a public network. Until it is, the account answers "subscription unverified, therefore not active" |
| 12 | **Authenticate** (`Authentifier`) | **action** | "how do I log in, without a password?" | a wallet address found by EIP-6963; a signature over a text the server renders **in full** → asks the server for a nonce; has the user sign a text they can read entirely — you do not sign a hash; verifies server-side and opens a session; writes no password anywhere | `nonce` (single use), `session`, `adresse` — an address, not an email | one signature, free | ready |
| 13 | **Prove** (`Prouver`) | **action** | "who measured this, when, and how do I check it without trusting you?" | nothing — the proof has to verify without asking us → publishes the agent's six canonical fields in canonical order; gives their SHA-384 hash in base58, so the caller **recomputes** the identity instead of believing us; anchors the usage log on a Hedera HCS topic, and re-reads it | `uaid` (HCS-14), `canonical_json`, `topic` + sequence number, `historique` | nothing | ready |
| 14 | **Attest** (`Attester`) | **action** | "can another contract read these measurements?" | the corpus, filtered to hooks with enough measurements → computes median and maximum levy per hook on `MEASURED` rows only; **discards** hooks without enough measurement instead of writing them as zero; writes the retained values into a contract with the corpus digest; publishes the gap between what is computed and what is really written | `median_bps`/`max_bps` (readable on chain by another contract), `corpusDigest`, `ecrits`/`ecartes` | the write gas, already paid for 16 hooks | **pending** — **99 attestations are computed; 16 are actually written** on chain. The rest are waiting on gas, and the gap is published rather than smoothed over |

Tool 14 is the one to read twice. The honest figure is **16 written on chain**, out of 99 computed
and 13 discarded for want of measurement — [`docs/dataset/attestations.json`](docs/dataset/attestations.json)
carries both numbers and the corpus digest they were derived from.

### The five ways in

The same fourteen tools are reachable five ways, and each way exists for a reason the others do not cover.

| Way in | For | Why this one | Prerequisite | Tools |
|---|---|---|---|---|
| **The site** | someone who wants an answer now, with nothing installed | the whole corpus is *in the page*: 125,072 measurements encoded by column, 7.9 MB. Paste an address, read the result — no wallet, no account, not one network request | nothing | 2, 3, 4, 5, 6, 7, 9, 13, 14 |
| **The extension** | someone who already swaps elsewhere and will never come to our site | the right moment to know what a hook takes is not when you are researching: it is **three seconds before signing**, on the site where you swap. It sits between the page and the wallet, reads Universal Router calldata, and rules before the signature. The measurement table lives in its service worker and answers with no request — so it works even if our server is off | install it; an API key only for history | 2, 6, 8, 9 |
| **The MCP server** | an agent, not a human | a model asked "what does this hook take?" **invents a plausible number**. The MCP server gives it four tools whose descriptions say, in as many words, never to state a figure the tool did not return — and every answer carries its label, block, size, direction and replay command. It reads the 125,072 measurements off disk and answers offline | Claude Desktop or any MCP client | 1, 2, 3, 5, 6, 13 |
| **x402, live, on Hedera** | an autonomous agent with no account and no wish for one | an agent does not fill in a signup form. It makes a request, gets a **402 that announces the price**, pays, and gets the measurement — 0.001 USDC, settled and re-read on the Hedera mirror node, not on our word. The signing key is sealed in a Ledger, and the answering agent has an HCS-14 identity published on a topic: the caller can check **who** it is calling before paying | a Hedera account and test USDC | 1, 10, 13 |
| **The account** | someone who uses the product more than once | it adds no measurement — it opens **surfaces**: one API key per surface, the extension and MCP downloads, and the history of what they did. Login is by wallet signature, no password, and the subscription is read **on chain** rather than believed | a wallet, and an active subscription for the keys | 11, 12 |

---

## The twenty-seven datasets

Every file this repository publishes is declared once, in
[`apps/web/src/lib/donnees.ts`](apps/web/src/lib/donnees.ts), with what it holds, the command that
produced it, and which tools read or write it. Two invariants are enforced by a test: **every
git-tracked file under `docs/dataset/` and `packages/guard/data/` has an entry here**, and **every
entry here is read or written by at least one tool**. The first stops a dataset being forgotten;
the second stops one being invented that nothing uses.

Volumes are not typed into that file — they are `stat`ed at build time by
[`apps/web/scripts/build-facts.mjs`](apps/web/scripts/build-facts.mjs) and live in
`facts.inventaire`. Hard-coding "125,072" in a second place would have been one more number left
to rot. If a file disappears its entry becomes `null` and the screen says "not read"; it does not
display zero.

Twenty-five of the twenty-seven are versioned — **123 MiB in the repository**. Two are derived and
gitignored because they recompute from the repo with no network and no RPC.

| Dataset | File | Size | What it holds | Produced by | Read by | Written by |
|---|---|---|---|---|---|---|
| the corpus of measurements | [`docs/dataset/measurements.jsonl`](docs/dataset/measurements.jsonl) | 125,072 rows | one line per counterfactual swap: pool, hook, size, direction, both quotes, the gap in bps, and the label saying whether it is measured, interpolated or not measurable | `python3 -m tare.sweep`, on a pinned anvil fork | 2, 3, 5, 6, 7, 14 | 1 |
| the corpus summary | [`docs/dataset/summary.json`](docs/dataset/summary.json) | 125,072 summarised | thresholds, sizes, directions, stub hash, block, and the count per label — enough to check a published figure really comes from *this* corpus | `python3 -m tare.cli summary` | 2, 4 | 1 |
| the column-encoded corpus | `apps/web/src/data/dataset.json` | *derived*, 7.9 MB | the same corpus, column by column, so it fits in a web page: it is what the site loads, and why the site answers without one network request | `node apps/web/scripts/build-dataset.mjs` | 2, 3, 5, 6 | — |
| the guard's table | `packages/guard/data/table.json` | *derived*, 21 MB | the corpus flattened for lookup by pool key, embedded as-is in the extension and the MCP server — this is what lets them answer offline | `node packages/guard/scripts/build-table.mjs` | 2, 6, 7, 8 | — |
| the alternative-gate figures | [`packages/guard/data/chiffres-alternative.json`](packages/guard/data/chiffres-alternative.json) | 125,072 weighed | the real weight of each state of the alternative search, including the share of cases where the answer is "there is only one gate" — the figure we refused to type by hand | `node packages/guard/scripts/chiffres-alternative.mjs` | 6, 7 | — |
| the one-way pools | [`docs/dataset/one-way.json`](docs/dataset/one-way.json) | 6 pools | pools that let you in free and do not let you back out: zero bps in, up to 9,999 out — the case only a round trip reveals | `python3 -m tare.oneway`, from the corpus | 3, 6 | 1 |
| gate A4 — the swap really executed | [`docs/dataset/porte-a4.json`](docs/dataset/porte-a4.json) | 3 executed swaps | swaps actually run on a fork, set against what the quote announced: the only proof the counterfactual does not lie, divergence included | `python3 -m tare.gates.a4 --write` | 1, 5 | 1 |
| the gate A4 log | [`docs/dataset/porte-a4.jsonl`](docs/dataset/porte-a4.jsonl) | 1 probe | the raw trace of each probe, with its replay command | `python3 -m tare.gates.a4 --write` | 1 | 1 |
| the contested measurements | [`docs/dataset/measurements-contestes.jsonl`](docs/dataset/measurements-contestes.jsonl) | 368 rows | the pools where our measurement and the external source disagree, re-measured one by one instead of dropped | `python3 -m tare.sweep` on the divergence list | 2, 4 | 1 |
| the contested summary | [`docs/dataset/summary-contestes.json`](docs/dataset/summary-contestes.json) | 368 summarised | the same summary as the corpus, restricted to the contested pools | `python3 -m tare.cli summary` | 4 | 1 |
| the contested pool list | [`docs/dataset/pools-contestes.json`](docs/dataset/pools-contestes.json) | 23 pools | which pools were kept for re-measurement, and why each one was | `engine/tare/source/`, set against the corpus | 4 | — |
| the pool census | [`docs/dataset/init-logs-200k.json`](docs/dataset/init-logs-200k.json) | 22,896 `Initialize` events | every `Initialize` event from the PoolManager over 200,000 Base blocks: the starting universe, of which everything else is a subset | `python3 -m tare.collect 50614000 200000 docs/dataset/init-logs-200k.json`, in slices, with its failures declared | 4, 5 | — |
| the census manifest | [`docs/dataset/init-logs-200k.json.manifest.json`](docs/dataset/init-logs-200k.json.manifest.json) | 1,559 distinct hooks | the sweep's coverage: slices asked for, slices that failed, and the count of distinct hooks — without which "1,559 hooks" would not be checkable | written alongside the file by `python3 -m tare.collect` | 4 | — |
| the liquid pools | [`docs/dataset/pools-liquides-full.json`](docs/dataset/pools-liquides-full.json) | 7,817 pools | the census pools that really hold liquidity, with their full `PoolKey` — measuring an empty pool would return a clean, false number | `python3 -m tare.rescan` | 1, 5 | — |
| the liquidity scan | [`docs/dataset/pools-liquides-full.json.scan.json`](docs/dataset/pools-liquides-full.json.scan.json) | 7,817 sorted | the triage counts: how many readable, how many liquid, how many at zero, how many unknown and for what cause | `python3 -m tare.rescan` | 5 | — |
| the hooks' own declarations | [`docs/dataset/declarations.json`](docs/dataset/declarations.json) | 9 hooks that declare | the sweep of the events hooks emit themselves: out of 1,559 hooks, 9 announce what they take. This is the measurement of what self-declaration is worth | `python3 -m tare.declare --scan --write` | 4 | — |
| the registry's coverage | [`docs/dataset/registre-couverture.json`](docs/dataset/registre-couverture.json) | 78 hooks absent | what the official hook registry contains, set against the hooks we actually saw running | `python3 -m tare.registre` | 4 | — |
| the pinned registry | [`apps/web/public/data/hooklist.snapshot.json`](apps/web/public/data/hooklist.snapshot.json) | 720 entries | the dated copy of the official registry, frozen in the repo so the published figure stays checkable even if the list moves tomorrow | `node apps/web/scripts/fetch-registry.mjs` | 4 | — |
| today's registry | [`docs/hooklist-live-20260905.json`](docs/hooklist-live-20260905.json) | 978 entries | the same list read later: the gap with the pinned copy is visible | `node apps/web/scripts/fetch-registry.mjs` | 4 | — |
| volume, against an independent source | [`docs/dataset/volume-base.json`](docs/dataset/volume-base.json) | 7,817 pools cross-checked | volume and TVL for the census pools, read from The Graph: a source we do not control, used to contradict ourselves rather than confirm ourselves | `python3 -m tare.volume` | 4 | — |
| the x402 settlements | [`docs/x402-settlements.jsonl`](docs/x402-settlements.jsonl) | 5 settlements | each measurement payment: amount, hash, and its re-read on the Hedera mirror node — a settlement counts only if the mirror node returns it | `apps/api/src/x402.ts`, at each paid measurement | 13 | 10 |
| the agent's identity | [`docs/dataset/agent-identity.json`](docs/dataset/agent-identity.json) | 5 declared skills | the HCS-14 UAID, the six canonical fields it is the hash of, and the message published on the Hedera topic — a caller can recompute the identity before paying | `npx tsx apps/api/src/agent/cli.ts export`, published on the HCS topic | 10, 13 | 13 |
| the on-chain attestations | [`docs/dataset/attestations.json`](docs/dataset/attestations.json) | **16 written** (99 computed) | median and maximum levy per hook, computed on the corpus, and the real state of their writing: computed, discarded for want of measurement, or actually written | `python3 -m tare.attest`, from the corpus | 2 | 14 |
| the full chain | [`docs/dataset/chaine-complete.json`](docs/dataset/chaine-complete.json) | 6 steps | the six end-to-end steps — real transaction, verdict, gate search, paid measurement, HCS anchor, on-device signature — with their duration and state | `apps/api/src/chaine/run.ts` | 8, 13 | — |
| source ↔ measurement agreement | [`docs/hooks-source/analysis.json`](docs/hooks-source/analysis.json) | 112 hooks | the 112 hooks set against their own source code, where it is public: where the code announces a rate, does the measurement confirm it — and the cases where it does not are published too | `python3 -m tare.source.cli analyze` | 4 | — |
| the bytecode graph cache | [`engine/tare/graph/data/chain-cache.json`](engine/tare/graph/data/chain-cache.json) | 99 KB | what the graph rebuild keeps of the chain: the full graph is not shipped, it is rebuilt, and this cache is what makes rebuilding possible without re-reading everything | `python3 -m tare.graph.cli build` | 4 | — |
| the device's screens | [`docs/ledger/guard-speculos.json`](docs/ledger/guard-speculos.json) | 9 screens | the EIP-712 report exactly as it renders, screen by screen, on the Ledger — you do not sign an opaque hash, you read what you sign | `packages/keyring`, against a Speculos | 9 | 9 |

---

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

---

## What each piece is for

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) answers one question per section: why a technology
is here and what would be lost without it. It carries the three diagrams — the chain from an
`Initialize` log to a refused signature, the three Hedera layers, and which panels are reading,
which are user actions, and which touch a chain. It also says plainly which two panels are
missing.

---

## Layout

```
engine/            Python — discovery, liquidity, the stub, the counterfactual, the graph
apps/api           Hono — the x402-gated measurement API on Hedera, and the assistant
apps/web           Vite + React — the instrument
apps/landing       the one-page verdict, readable with JavaScript off
apps/mcp           four MCP tools, so an agent can ask the same questions
packages/guard     reads the hook out of Universal Router calldata, plus an MV3 extension
packages/hookflags the 14 permission bits, derived from the hook's own address
packages/keyring   the Ledger Key Ring, driven against Speculos
contracts/         HookRateAttestations, and the subscription contract
docs/              method, limits, and the corrections this project had to make
scripts/           install-all.sh, test-all.sh, regenerate.sh, deploy.sh
```

---

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
| **The fourteen tools, declared once** — question, input, output fields, cost, state | [`apps/web/src/lib/outils.ts`](apps/web/src/lib/outils.ts) |
| **The twenty-seven datasets, declared once** — and the two invariants that keep the list honest | [`apps/web/src/lib/donnees.ts`](apps/web/src/lib/donnees.ts) |
| **The Ledger Key Ring, driven without a physical device** | [`packages/keyring/src/ring.ts`](packages/keyring/src/ring.ts) — the seal/open cycle, and [`sdk-node.ts`](packages/keyring/src/sdk-node.ts) for the transport the packaged CLI hardcodes |
| **The payment key is sealed, not in a file** — and the service says which | [`apps/api/src/pay/secret.ts`](apps/api/src/pay/secret.ts) |
| **The x402 resource server on Hedera** | [`apps/api/src/x402.ts`](apps/api/src/x402.ts) |
| **The client that actually pays**, and the four steps it keeps visible | [`apps/api/src/pay/client.ts`](apps/api/src/pay/client.ts) — settled transfers in [`docs/x402-settlements.jsonl`](docs/x402-settlements.jsonl) |
| **Billing by measurement, not by request** | [`apps/api/src/metering/ledger.ts`](apps/api/src/metering/ledger.ts) |
| **A paid unit the engine then calls unmeasurable is a credit, not a zero** | [`apps/api/src/metering/ledger.ts`](apps/api/src/metering/ledger.ts) — `totals()`, and [`X402.md`](X402.md) |
| **The guard that reads the hook out of Universal Router calldata** | [`packages/guard/src/calldata.ts`](packages/guard/src/calldata.ts) |
| **Never truncate an error body** — the bug that hid a revert selector four times | [`engine/tare/rpc.py`](engine/tare/rpc.py) |

---

## Prompts, specs and planning artifacts

Every brief given to every agent, and the documents they were planned against, are committed under
[`docs/prompts/`](docs/prompts/) and [`docs/planning/`](docs/planning/). See
[`docs/prompts/README.md`](docs/prompts/README.md).

---

## AI attribution

Built with Claude Code. Every prompt, spec and planning artifact is committed under
[`docs/prompts/`](docs/prompts/) and [`docs/planning/`](docs/planning/) — including
[`docs/planning/01-adversarial-audit.md`](docs/planning/01-adversarial-audit.md), the record of an
earlier direction being abandoned after its own figures failed review.

What is not AI-generated is the measurement: every number in `docs/dataset/` comes from an EVM fork,
and [`engine/tare/gates/a3.py`](engine/tare/gates/a3.py) recomputes five of them on every run.

---

## What we could not do, and where the fix belongs upstream

The nine findings sent to the Uniswap Foundation are in [`FEEDBACK.md`](FEEDBACK.md) — six
numbered sections and three smaller ones — each naming what produced it, and two of them down to
the file and line in `v4-core` (`Pool.sol:303-305`, `BaseV4Quoter.sol:16`). The schema change that would let
the registry carry a rate at all is written, validated and ready to open as a pull request against
`Uniswap/hooklist`: [`docs/pr-hooklist/`](docs/pr-hooklist/).

The guard's hardware leg stops one step short of a Ledger screen, and the step is not ours to take
alone: the Ethereum app displays an arbitrary EIP-712 struct field by field only when Ledger holds
filter descriptors for that schema. Ours is new, so the device offers blind signing instead — which
this project refuses. Run against Speculos with the official app 1.22.3, the screen says so in its
own words. [`OPEN-SOURCE.md`](OPEN-SOURCE.md) is the write-up, with what could be
contributed upstream and where — including a second finding: `npm install
@ledgerhq/ledger-key-ring-protocol` fails for everyone outside Ledger's monorepo, because a
dependency it never loads is unpublished. [`EIP712.md`](EIP712.md) is the full clear-signing
experiment, screen by screen.

The Ledger **Key Ring** does run here, without a physical device: Speculos serving the
official `Ledger Sync` app, Ledger's own protocol package, and Ledger's staging trustchain.
The payment key that settles every x402 request is sealed under it and opened with no device
attached — [`packages/keyring/`](packages/keyring/). Production refuses a locally-built
app's attestation, correctly, so staging is what this runs against; that limit is stated
there and not smoothed over.

The x402 service is **not hosted yet**: no domain answers. The image is built, runs, and has
been paid — the last settlement in [`docs/x402-settlements.jsonl`](docs/x402-settlements.jsonl)
was served by the container, not by a dev process — and [`scripts/deploy.sh`](scripts/deploy.sh)
brings it up behind TLS in one command ([`DEPLOY.md`](DEPLOY.md)). But one command not yet run
is not a live service, so the track requirement is **not** met.

---

## License

Apache-2.0
