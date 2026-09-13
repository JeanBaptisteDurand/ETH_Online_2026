> **Internal working document, kept for the record.**
>
> What it is: the brief handed to the developer who took over the front-end on 12 September 2026 — what the product is, which dataset feeds which tool, and in what order to present them to a jury.
>
> It is a brief, not documentation, and parts of it have been overtaken: it still says the site deploys from GitHub Pages (it is now served from <https://tare-hooks.tech>) and it quotes a test count from that day. The figures that must stay true are the ones in the [root `README.md`](../../README.md), where a test recomputes them.

---

# TARE — the front-end brief

> This file is written for **JB's friend's Claude**, who is taking over the front-end. It says
> what the product is, which dataset serves which tool, and in what order to present them to a
> jury.
>
> It does not ask for the existing work to be redone. The plumbing is finished: the data is
> typed, the computations are pure and tested, the surfaces exist. What is missing is the
> **design**.

---

## 0. Where the project is going — read this before all the rest

**The product is frozen.** What it does, what it measures, the fourteen tools, the twenty-seven
datasets, the five ways in and the words used: that is decided, written, tested. The question
"what if we added…" is no longer open. What is left is **the design**, and nothing else.

**The context.** A submission to ETHOnline 2026. The repository is public:
`https://github.com/JeanBaptisteDurand/ETH_Online_2026`. The full suite is green — **1,218 tests**
(`bash scripts/test-all.sh`). The site deploys through GitHub Pages from `main`.

**What is yours:** `apps/web/src/components/`, `apps/web/src/styles/`, `apps/landing/`.
The design, the layout, the motion, the responsive behaviour.

**What is NOT yours, and must not be touched:**

| do not touch it | why |
|---|---|
| `engine/`, `contracts/`, `apps/api/`, `packages/` | the engine, the contracts and the surfaces are measured and tested; changing them invalidates the published figures |
| `apps/web/src/lib/` | pure, tested computations — `portes.ts`, `exit.ts`, `outils.ts`, `donnees.ts` |
| `apps/web/src/data/facts.json`, `dataset.json` | **generated** by `npm run data`. Editing them by hand introduces a figure that lies |
| the named states and the refusals | `AUCUNE_MESUREE`, `PORTE_UNIQUE`, `NON_MESURABLE`… A reasoned refusal is a feature, not a hole to fill |

**The rule that sums it all up:** *no number written by hand in a component.* Everything comes
from `facts.json`, from `dataset.ts` or from `donnees.ts`. `src/lib/facts.test.ts` brings the
suite down if a figure is hard-coded into a screen.

**What stays in JB's hands** (so neither yours nor your Claude's): enabling GitHub Pages,
deploying the subscription contract to a public network, shooting the video, opening the
`Uniswap/hooklist` PR. If a screen says "pending", that is what it is waiting for — it is not a
bug to fix.

---

## 1. What the product is, in one sentence

Uniswap v4 lets a "hook" run on every swap, and it can take a cut. **Nobody publishes how
much.** The official registry has 27 fields, 19 booleans, and its schema forbids adding a
quantity. Out of 1,559 hooks seen across 200,000 Base blocks, **9 declare anything at all** — and
what they emit is an absolute amount on a past swap, not the rate you would pay.

Comparing is impossible: a v4 pool's key **contains** the hook's address, so "the same pool
without its hook" does not exist. So we do not change the pool — **we change the hook's code**. On
a pinned fork, `anvil_setCode` replaces its bytecode with 89 inert bytes, the same swap is quoted
twice, and **the gap is the toll**.

**125,072 measurements · 7,817 pools · 112 hooks · 8 sizes · both directions.** Every row replays
in one command.

---

## 2. The central tool, and the other thirteen

The central tool is **1 · Measure**: it is the only one that produces data that did not exist.
Everything else reads what it produced, or acts on it.

The fourteen sort into **three families**, and the colour is already set in the code
(`src/lib/outils.ts`):

| family | colour | what it does | tools |
|---|---|---|---|
| **collection** | blue `--focus` | goes and fetches data that did not exist | 1, 8, 10 |
| **analysis** | yellow `--m-6` | reads what has been measured and draws an answer from it | 2, 3, 4, 5, 6 |
| **action** | orange `--m-4` | **changes something** — transaction, session, on-chain write | 7, 9, 11, 12, 13, 14 |

Orange is the only family that touches somebody's money. It has to be spotted without reading.

---

## 3. The tools, ranked by importance to the jury

The criterion: **what, shown for thirty seconds, makes someone understand that this project
exists?**

| rank | tool | family | why it goes first | where it already is |
|---|---|---|---|---|
| **1** | **1 · Measure** | collection | This is **the** find. The counterfactual on the code and not on the key, the 89-byte stub, the two quotes. Without it there is no project. Show the two paired outputs and the gap. | tool page 1 |
| **2** | **7 · Substitute** | action | Turns a verdict into a **decision**. Permit2, one signature instead of two transactions, and **we never send**. It is what separates a dashboard from a product. | tool page 7, panel 16 |
| **3** | **3 · Gauge** | analysis | A human's question: "I put in 100 €, how much is left?" It is the way in at zero cost. | panel 00 |
| **4** | **6 · Propose another door** | analysis | The counter-intuitive fact: **99.71 % of the time there is only one door**, and saying so is an answer. No aggregator says it. | tool page 6, panel 16 |
| **5** | **10 · Pay per call** | collection | x402 on Hedera, 5 settlements re-read **on the mirror node**, not on our word. It is the track's requirement and a third party can check it. | panel 09 |
| **6** | **8 · Intercept** | collection | The right moment is not "when you are searching", it is **three seconds before signing**. 12 KB of script, offline table. | not on screen yet |
| **7** | **14 · Attest** | action | **Another contract** reads our measurements. The only surface a machine consumes without asking us. 16 written out of 99 computed — and we say so. | panel 11 |
| **8** | **13 · Prove** | action | An HCS-14 identity anyone can recompute from six fields. A caller knows **who** it is calling. | panels 10, 13 |
| **9** | **4 · Understand** | analysis | The clusters of identical bytecode and the registry/measurement contradictions. Impressive but it needs an API. | panel 08 |
| **10** | **9 · Approve** | action | The report rendered **field by field** on a Ledger: you do not sign an opaque hash. | panel 14 |
| **11** | **5 · Decide** | analysis | The ranking of a pair's doors. Useful, but it overlaps 6. | panel 03 |
| **12** | **2 · Look up** | analysis | The raw corpus. Indispensable, not spectacular. | panels 02, 05–07 |
| **13** | **12 · Authenticate** | action | Sign-in by signature, no password. Expected, not a differentiator. | panel 15 |
| **14** | **11 · Subscribe** | action | The contract exists and passes 20 tests **but is not deployed**. To be shown last, and announced as such. | panel 15 |

---

## 4. The data, ranked by importance to the jury

The criterion: **what can a judge find nowhere else?**

> **The thirteen rows below are the strongest, not the only ones.** The repository carries
> **27 datasets**, all listed in `apps/web/src/lib/donnees.ts` with what they contain, the
> command that produced them, and **the tools that read or write them**. The full table is
> displayed on the site, panel **18 · which dataset serves which tool**.
> Their size is nowhere written by hand: it is *statted at build time* and lives in
> `facts.inventaire`. And `src/lib/outils.test.ts` **refuses** to let a git-tracked file under
> `docs/dataset/` or `packages/guard/data/` be missing from that list — the omission brings a
> test down instead of sleeping in a corner.

| rank | dataset | size | why it matters | file |
|---|---|---|---|---|
| **1** | **The measurement corpus** | 125,072 rows | The thing nobody else has. Every row carries its block, its size, its direction, its label and its replay command. | `docs/dataset/measurements.jsonl` → `src/data/dataset.json` |
| **2** | **The 6 one-way pools** | 6 pools | **In at 0.00 bps, out at 9,999.** None of them has public source code: **no reading of code could have found them.** It is the proof that measurement finds what auditing does not. | `docs/dataset/one-way.json` |
| **3** | **The declarations sweep** | 1,559 hooks, 200,000 blocks | 9 declare — 0.58 %. Coverage 1, both `topic0` computed from their signature. | `docs/dataset/declarations.json` |
| **4** | **The registry's coverage** | 78 absent / 112 | The official registry **does not see 70 %** of the hooks we measured. | `docs/dataset/registre-couverture.json` |
| **5** | **The source ↔ measurement agreement** | 4,801 agreeing, 94 diverging | Where the published code announces a rate, the measurement confirms it — **maximum gap 0.0005 bps**. And 94 cases where it diverges, up to **9,979 bps**. It is what makes the rest credible. | `docs/hooks-source/analysis.json` |
| **6** | **Door A4 — quote vs execution** | 3 executed, 1 diverging | The only place where a **quote** becomes an **executed swap**. We publish the pool where it does not match. | `docs/dataset/porte-a4.json` |
| **7** | **The x402 settlements** | 5 settled | Re-read on the **Hedera mirror node**, not on our word. A track requirement. | `docs/x402-settlements.jsonl` |
| **8** | **The replacement-door figures** | 15 proposals / 125,072 | 99.71 % "only one door". The counter-intuitive fact that keeps us from overselling. | `packages/guard/data/chiffres-alternative.json` |
| **9** | **The on-chain attestations** | 16 written / 99 computed | Readable by another contract. The gap is published. | `docs/dataset/attestations.json` |
| **10** | **The HCS-14 agent identity** | 1 | Recomputable from six fields. | `docs/dataset/agent-identity.json` |
| **11** | **The pool census** | 7,817 pools | The denominator: without it, "112 hooks" means nothing. | `docs/dataset/pools-liquides-full.json` |
| **12** | **The full chain** | 6/6 in 13.7 s | A real transaction → decoded → another door? → measurement paid for → anchored → signed. | `docs/dataset/chaine-complete.json` |
| **13** | **The graph** | 198 MB, rebuilt | Bytecode clusters, orphans, contradictions. **Absent from a clone**: it rebuilds itself. | `engine/tare/graph/data/graph.json` |

---

## 4 bis. The anatomy of a tool page: input → execution → output

Every tool page carries **three movements**, in this order, and the words change with the family
because the three families do not do the same thing:

| family | 1st movement | 2nd movement | 3rd movement |
|---|---|---|---|
| **collection** (blue) | *what it goes to fetch* | *it runs* | *what it brings back* |
| **analysis** (yellow) | *input data* | *it runs* | *output data* |
| **action** (orange) | *what it reads before acting* | *the action* | *what changes* |

What each movement contains, and where it comes from — you have nothing to write, only to lay
out:

1. **The input.** First what is **not** a file (`outil.entree`: a pasted address, an intercepted
   calldata, a state read on chain). Then the **files**, drawn from `donnees.ts`: name, size,
   what they contain, the command that produced them. For the six tools that read the corpus, a
   **real sample** of five rows, with the total count displayed so that the truncation is
   visible.
2. **The execution.** `outil.execute`: three to five numbered steps, in the order they happen,
   plus `outil.cout`. For the `action` family, the last step names **what changes** — a test
   checks it.
3. **The output.** `outil.sortie`: the fields returned, **under their real names** (`out_with`,
   `bps`, `label`, `to / data / value`, `abonneJusquA`…) with what each one is worth. Then the
   datasets the tool **writes**, if it writes any. Then, for eight tools, the **real output**:
   the fork's paired quotes, the re-read settlements, the Ledger screens, Permit2's nine states.

Before this work, six pages out of fourteen displayed no named output at all. That is fixed, and
`outils.test.ts` now requires ≥ 1 input, ≥ 3 steps and ≥ 2 output fields per tool.

---

## 5. What already exists on the code side, and that you do not have to redo

| piece | what it does | where |
|---|---|---|
| `src/lib/outils.ts` | **the map**: 14 tools × family, question, data, routes, panels, ways in, cost, state | typed, no dependency |
| `src/lib/donnees.ts` | **the census**: 27 datasets × what they contain × who reads or writes them | typed, tested |
| `src/lib/outils.test.ts` | the guard rail: no orphaned data file, no invented code path | `node --test src/lib/*.test.ts` |
| `src/lib/portes.ts` | "where to buy this token" — pure, offline, grouped by the currency spent | tested |
| `src/lib/dataset.ts` | the 125,072 measurements, encoded by column (7.9 MB) | already in the bundle |
| `src/data/facts.json` | 11 groups of facts, assembled from the repository | regenerated by `npm run data` |
| `src/compte/api.ts` | the account's 9 routes, EIP-6963, signature, subscription read on chain | typed |
| `src/compte/substitution.ts` | `POST /alternative`, the 6 + 10 named states | typed |
| `src/components/Prim.tsx` | `Panel`, `Copy`, `Replay`, `NonLu`, `Chip` | the house style |

**Three routes** in the app (fragment router, no dependency):

```
#/              the operation: paste a token → where to buy it
                then 17 · the five ways in, and 18 · which dataset serves which tool
#/outil/<n>     one page per tool: what it ingests → it runs → what it returns
#/instrument    the 17 analysis panels
```

---

## 6. The honesty rules — they are not negotiable

They are the project's argument. A screen that breaks them breaks the project.

1. **Four labels, never promoted**: `MESURE`, `INTERPOLE`, `NON_MESURABLE`, `NON_COTABLE`.
   A reading that fails is `NON_MESURABLE` — **never a zero**, never a blank.
2. **A blank reads as "nothing", and "nothing" reads as "zero".** Use `<NonLu>`.
3. **Every number carries its block, its size, its direction and its replay command.**
4. **A truncated list says so**, with the count of what is missing.
5. **We never say "subscribed" because a transaction went out**: only the on-chain re-read
   settles it.
6. **The substitution is built, never sent.** The button is active only on `PRÊT`.

---

## 7. What is left to do, and is yours

- **The design.** The tool pages have one accent per family and one output per tool, but they
  look alike. Each family deserves its own shape: collection shows an **execution** (two paired
  quotes, a log scrolling past), analysis shows a **distribution**, action shows a **state** and
  a button.
- **Tool page 1 (Measure)** is the most important: show the fork's two outputs side by side and
  the gap between them. It is the project's idea in one image.
- **The animation.** One per family, not one per page — fourteen different animations are tiring.
- **The responsive behaviour.** The tables already have `overflow-x: auto` on their container;
  check at 400 px.
- **English.** The instrument is in French. That is JB's decision, not an oversight.
