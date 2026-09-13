> **Internal working document, kept for the record.**
>
> What it is: the literal prompt given to the agent that redesigned the front-end, on 12 September 2026. It is committed for the same reason as everything under [`docs/prompts/`](../prompts/): ETHGlobal asks submissions to include the prompts and planning artifacts they were built from.
>
> It is an instruction to an agent, not documentation. The state of the product is in the [root `README.md`](../../README.md).

---

# The prompt to give to the Claude doing the front-end

> Copy everything between the two rules. Nothing else.

---

You are taking over the front-end of a project that is **finished and frozen**. Do not go looking
for what the product is missing: nothing is missing. The engine, the data, the contracts and the
fourteen tools are written, measured and tested — **1,218 tests green**. What is missing is the
**design**, and that is all we are asking of you.

**The context, so you do not have to wonder:** this is a submission to ETHOnline 2026. The
repository is public: `https://github.com/JeanBaptisteDurand/ETH_Online_2026`. The product
measures what a Uniswap v4 hook really takes on a swap, by replacing its bytecode with
89 inert bytes on a pinned fork and quoting the same swap twice. **125,072 measurements.** The
rest of the product reads that, or acts on it.

**Start with this, in this order:**

1. `git pull origin main`
2. Read **`docs/internal/FRONT-BRIEF.md`** in full. Its **section 0** says what is frozen, what is
   yours, and what must not be touched. The rest contains: the 14 tools sorted into
   3 colour-coded families, **two priority tables** (which tool and which dataset to show a jury
   first), the anatomy of a tool page, what already exists, and the six honesty rules that are
   not negotiable.
3. `cd apps/web && npm install && npm run data && npm run dev`
4. Open the three routes and watch them run:
   - `#/` — **the operation**: you paste a token address, you read which pool to buy it through
     and what that costs. Everything is computed inside the page, over 125,072 embedded
     measurements, without a single request. Then **17 · the five ways into the product and why
     each one exists** — the site, the extension, the MCP, x402 live on Hedera, the account. Then
     **18 · which dataset serves which tool**, the repository's 27 datasets with their size and
     the tools that read them.
   - `#/outil/1` … `#/outil/14` — **one page per tool**, built on three movements:
     **what goes in** (what is not a file, then the files with their size, then a real sample
     from the corpus) → **it runs** (the numbered steps, and what it costs)
     → **what comes out** (the fields returned under their real names, then the real output: the
     fork's two quotes for Measure, the re-read settlements for Pay, the Ledger screens for
     Approve, Permit2's nine states for Substitute).
     The three labels **change with the family**: an action tool does not say "output data",
     it says **what changes**.
   - `#/instrument` — the 17 analysis panels already built.
5. Read **`src/lib/outils.ts`** and **`src/lib/donnees.ts`**. They are **the map**: for each
   tool, the user's question, what goes in, the steps, the output fields, the code that
   implements it, the routes, its cost and its state; and for each dataset, what it contains,
   the command that produced it and the tools that read it. **You have nothing to guess.**

**What you must produce:**

The design, with your own system. Three constraints, and they come from the product:

- **The three families have a colour** and it carries information: blue = goes and fetches a
  piece of data, yellow = interprets, orange = **changes something**. Orange is the only family
  that touches somebody's money; it has to be spotted without reading.
- **The central tool is 1 (Measure)**, and its page is the most important on the site: two
  quotes of the same swap — one with the hook, one with an inert 89-byte stub at its address —
  and the gap between them. It is the project's idea in one image. Give it the form it
  deserves.
- **Tool 7 (Substitute)** is what separates a dashboard from a product: it builds the
  replacement transaction and has it signed through **Permit2** — one off-chain signature
  instead of two transactions — and **it never sends it**. The button is active only on the
  `PRÊT` state; the eight other states stay visible and greyed out with their reason.

**What you do not touch** (section 0 of the brief): `engine/`, `contracts/`, `apps/api/`,
`packages/`, `apps/web/src/lib/`, and the **generated** files `src/data/facts.json` and
`src/data/dataset.json`. The rule that sums it all up: **no number written by hand in a
component** — everything comes from `facts.json`, `dataset.ts` or `donnees.ts`, and a test brings
the suite down if a figure is hard-coded into a screen.

**The six honesty rules** (section 6 of the brief) are the project's argument. A screen that
breaks them breaks the project. The most important one: **a reading that fails is
`NON_MESURABLE`, never a zero and never a blank** — a blank reads as "nothing", and "nothing"
reads as "zero". The `<NonLu>` component exists for that. And a **reasoned refusal is a
feature**: when the screen says "no door measured at this size", that is not a hole to fill, it
is the answer.

One animation **per family**, not one per page: fourteen different animations are tiring.

Check at 400 px wide. The tables already have `overflow-x: auto` on their container.

Before you hand it back: `cd apps/web && node --test src/lib/*.test.ts` must stay at 114/114, and
`npm run build` must pass.

The instrument is in **French** — that is a decision, not an oversight.

---
