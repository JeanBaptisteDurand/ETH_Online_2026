---
name: tare
description: Measure what a Uniswap v4 hook actually takes from a swap on Base, and report it with its label, block, size, direction and replay command. Use when asked what a hook charges, whether a pool's fee is really zero, which pools and tokens a hook is exposed to, or whether two hooks share code. Never state a fee figure for a v4 hook without calling these tools.
---

# TARE

A v4 pool's identity — its `PoolKey` — contains the hook's address, so "the same pool without its
hook" does not exist. TARE does not change the pool: **it changes the hook.** On a fork pinned to
a block, `anvil_setCode` replaces the hook's bytecode with an inert 89-byte stub that satisfies
`Hooks.sol` and does nothing. `poolId`, liquidity, `slot0` and reserves are byte-identical; the
only thing that changed is the code that runs during the swap. The same swap is quoted twice.
**The difference is what the hook took.**

## Setup

```bash
cd /Users/beorlor/Documents/ethonline/ETH_Online_2026/apps/mcp && npm install && npm run build
claude mcp add tare -- node /Users/beorlor/Documents/ethonline/ETH_Online_2026/apps/mcp/dist/src/index.js
docker compose up -d anvil   # optional: only needed to measure swaps absent from the dataset
```

Claude Desktop instead of Claude Code: put the same command and args under `mcpServers.tare` in
`claude_desktop_config.json` and restart.

## The one rule

**You do not produce numbers. The tools do.**

Every answer arrives with a label, a block, a size, a direction and a replay command. Repeat them.
Do not compute, round, convert to a percentage, average across pools, or fill a gap with a number
the tool did not return. If a tool says `NOT_MEASURABLE`, that is the answer — say so, say why,
and say what would make it measurable. A `NOT_MEASURABLE` is a result, not an obstacle to route
around.

| label | what it means | may you state a number? |
|---|---|---|
| `MEASURED` | both quotes came back; the difference is the number | yes, verbatim |
| `INTERPOLATED` | read off two measured points, in log(size); both are cited | yes, verbatim, and say it is interpolated |
| `NOT_MEASURABLE` | the counterfactual could not be built (custom accounting, stub reverted, fork down, block mismatch) | **no** |
| `NOT_QUOTABLE` | the quoter itself refused this pool, direction or size | **no** |

`NOT_QUOTABLE` is very often direction-dependent: a pool that will not quote one way frequently
quotes the other. When you hit one, try the opposite direction before concluding anything.

## The tools

### `tare_measure(hook, pool, size, direction, block?)`

One swap. `pool` is a 32-byte `poolId` — get it from `tare_impact` or `tare_lookup` first.
`size` is a **decimal integer string** in the smallest unit of the input token
(`"1000000000000000"` = 1e15); never pass `1e18`, a float loses the value.
`direction` is `"0to1"` or `"1to0"`. `block` defaults to 50,614,000.

The answer carries a **resolution path** showing which source produced it: `dataset`, `api`,
`engine` (the live counterfactual), or `interpolation`. Quote the source when you report the
value. Extraction is strongly size-dependent — one hook goes from 99.99 bps at 1e14 to 57.44 bps
at 1e18 on the same pool — so **a number without its size is meaningless**. Never generalise one
size to "this hook charges X".

### `tare_lookup(hook)`

Everything already recorded: each pool the hook carries, every measurement by size and direction
with its label, the on-chain `stored_lp_fee`, and the pools that were **never** measured, listed
explicitly as `NOT_MEASURABLE`. Never measures. Start here.

Watch for the headline finding: pools whose `stored_lp_fee` read on-chain is **zero** while the
measured extraction is ~100 bps. The stored fee is not the fee.

### `tare_impact(hook)`

Blast radius: how many pools carry this hook, how many were actually measured, which tokens are
exposed, and the min / median / max extraction over the measured subset with the full list of
values it was computed from. Liquidity is given per pool and is **never summed** — in-range
uint128 liquidity from different pairs has no common unit, so do not add it either.

### `tare_twins(hook)`

* **permission twins** — exact and offline, from the low 14 bits of the address. Identical
  declared rights, *not* identical behaviour. Present it as a lead.
* **bytecode twins** — exact, needs the fork. Identical keccak of the full `eth_getCode` body at
  the pinned block.
* **deployer twins** — always `NOT_MEASURABLE` here. Do not substitute a guess.

## A worked path

> "Is 0x985c14baa2a18316ffda0aefb3a632fadfca2acc charging anything on its pools?"

1. `tare_lookup` — read the recorded profile and the per-pool `stored_lp_fee`.
2. `tare_impact` — how wide the exposure is, and how much of it is actually measured.
3. `tare_measure` on one pool at two sizes — show that the figure moves with size.
4. Report each number with its label, block, size, direction and replay command, and name the
   pools that came back `NOT_MEASURABLE` or `NOT_QUOTABLE` instead of quietly dropping them.

## What TARE does not know

* It does not know whether a hook is in the official Uniswap registry: no registry snapshot is
  committed in this checkout, and `tare_lookup` says `registry: UNAVAILABLE` rather than guess.
* It does not know who deployed anything.
* It does not know what a hook *does* with what it takes.
* It knows one chain (Base, 8453) and, without the fork running, one block (50,614,000).

Say so when it matters. The point of this instrument is that its limits are printed next to its
numbers.
