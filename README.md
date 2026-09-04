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

## AI attribution

Built with Claude Code. Prompts, specs and the full decision trail are committed under `docs/`.

## License

Apache-2.0
