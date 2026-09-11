<!-- Engendre par `python3 -m tare.submission.build --write`. Ne pas editer a la main :
     chacun de ces nombres a deja ete faux une fois, ecrit a la main quelque part. -->

# The three fields a judge reads first

## Title

**TARE — what a Uniswap v4 hook actually takes from your swap**

*Why this framing.* Not "hook analytics" and not "a hook registry": both describe. The verb is
**takes**, because the deliverable is a quantity — 125,072 of them — and no existing surface
publishes one.

## Short description

> Uniswap asks hooks to declare what they charge. 9 of the 1,559 hooks do.
> TARE measures it instead: on a fork pinned to block 50,614,000, it replaces the hook's bytecode
> with an inert stub and quotes the same swap twice. The gap **is** the take.
> 125,072 measurements, each with its block, its size, its direction and a command that
> reproduces it. Paste a token address and read what comes back out of 100.

## What it does

**The wall.** A v4 pool's identity — its `PoolKey` — contains the hook's address. "The same pool
without its hook" therefore does not exist: it would be a different pool, with different liquidity
and a different price. That is why nobody publishes this number, and why the official registry
describes 978 entries with 27 fields each — 19 of
them booleans — of which **none is a quantity**. The only number in the record is `chainId`, and it
names a network. 78 of the 112 hooks it measured are absent from that registry entirely — 69.64 %.

**What TARE does.** It does not change the pool. It changes the **hook** — `anvil_setCode` rewrites
the bytecode at the hook's address on a pinned fork, so `poolId`, liquidity and `slot0` stay
byte-identical, and the only thing that changed is the code that runs during the swap. Two quotes
through `V4Quoter`, and the difference is what the hook took.

**What you get.**

- **Paste a token address**, read what 100 units come back as. 125,072 measurements across
  7,817 pools and 112 hooks, at block 50,614,000 on Base — in the page, with no
  wallet and no request.
- **Before you sign.** A browser extension reads the `PoolKey` out of your swap calldata and tells
  you what that hook took, at your size, from a table it carries offline. 12 KB of content script;
  the measurements live in its service worker.
- **And elsewhere?** For a given exchange, TARE compares every other pool measured at **the same
  size, in the same currencies, in the same direction** — and answers "there is only one door" for
  **99.71 %** of the corpus, because that is the truth — 15 proposals in the whole corpus, worth at most 78.67 bps. When there is a cheaper
  measured door, it builds the replacement transaction, with a floor taken from a live quote and a
  real deadline. It never sends it.
- **Pay per measurement, with no account.** The API is gated by x402 on Hedera:
  5 settlements confirmed on the mirror node, at 0.001 USDC each. The agent has an
  HCS-14 identity, announced on a Hedera topic and recomputable from six canonical fields — an
  agent that calls TARE knows *who* it is calling, and can check.
- **Or subscribe, and get the tools.** Sign in with a wallet — one signature, no password, the
  message comes from the server and is never rebuilt by the client. The subscription lives in a contract — 182 lines of Solidity, 20 forge tests, and checked against a local fork where 1.5x the price buys exactly 45.00 days — **not yet deployed to a public testnet at the time this text was generated**. The API reads it with `eth_call` and refuses when the read does not complete, so an undeployed contract means a refusal with a reason, never an assumed subscription. The account
  issues one API key per surface, downloads the extension and the MCP server, and shows the history
  of what they did: every verdict, every size, every substitution.
- **For an agent, not a human.** The MCP server exposes four tools over the same corpus. It reads
  125,072 measurements from disk and answers offline; the key only decides whether the call
  lands in your history. Every answer carries its label, its block and the command that reproduces
  it, and the tool descriptions tell the model, in those words, never to state a number the tool did
  not return.

**What it refuses to do.** Four labels, never promoted: `MEASURED`, `INTERPOLATED`,
`NOT_MEASURABLE`, `NOT_QUOTABLE`. A read that did not complete is a stated refusal, never a zero —
61,466 rows in this corpus carry no number at all, and they say so.
The whole corpus is **quoted**, not executed; one gate executes real swaps through a probe contract
to check that quoting matches doing, and it published the one pool where it does **not**.

## The two fields that are not prose

**`sourceCode`** — `https://github.com/JeanBaptisteDurand/ETH_Online_2026`, public.

**`demo`** — **NOT SET AT GENERATION TIME.** Activate GitHub Pages (Settings -> Pages -> Source: GitHub Actions), then regenerate with `TARE_DEMO_URL=https://... python3 -m tare.submission.build --write`

> **26 of the 27 async finalists put a LIVE URL in this field. The one exception was LPLens,
> which put a GitHub link there — while `lplens.xyz` existed, ran, and still runs.** It won
> Finalist anyway, on the strength of its writing, but it violated the only universal
> characteristic of the set. In the first async round no judge sees the author: there is the
> text, the repository, and this field.
>
> It costs nothing and it is the last thing anyone remembers to do.

---

*Every figure above is generated from the corpus and the committed artefacts. The ones that used to
be typed by hand were wrong: "0 of 84 hooks declare" (really 9 of the 1,559 hooks), "300.00 → 0.03 bps" on the
replacement door (really 295.59 → 216.92), "one hook absent from the registry" (really
78). That is why this file has a generator.*
