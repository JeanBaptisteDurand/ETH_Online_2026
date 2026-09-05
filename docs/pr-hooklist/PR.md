# schema: add an optional `measuredExtraction` to `properties`

*Body of the pull request to open against [`Uniswap/hooklist`](https://github.com/Uniswap/hooklist).*
*Base: commit [`8623037`](https://github.com/Uniswap/hooklist/tree/862303733d34aa36fad0d8c5275163c387be80d6) (869 entries).*
*Files touched: `schema.json` only. Patch: [`schema.patch`](schema.patch). Checks: [`validate.py`](validate.py).*

---

## What this adds

One optional object inside `properties`, next to `dynamicFee` — the boolean it quantifies:

```json
"properties": {
  "dynamicFee": true,
  "upgradeable": false,
  "requiresCustomSwapData": true,
  "vanillaSwap": false,
  "swapAccess": "none",
  "measuredExtraction": {
    "bps": 119.7,
    "block": 50614000,
    "method": "counterfactual",
    "sourceUrl": "https://github.com/JeanBaptisteDurand/ETH_Online_2026/blob/main/docs/dataset/measurements.jsonl"
  }
}
```

Four members, all required **once the object is present**, none required otherwise:

| member | type | why it is mandatory inside the object |
|---|---|---|
| `bps` | number, 0–10000 | the magnitude, in basis points of swap output |
| `block` | integer ≥ 0 | a magnitude with no block is not reproducible; hook fees move with time and with pool state |
| `method` | enum `counterfactual` / `events` / `declared` | a measured number and a self-reported number are not the same claim and must not share a field |
| `sourceUrl` | string, `https://` | the dataset it came from, so a third party can reproduce it or refute it |

`bps` has `minimum: 0` on purpose. A hook that returns *more* than it takes is running custom
accounting — it *is* the liquidity — and a negative number there would describe something else
entirely. That case is out of scope for this field, and saying so in the schema is better than
letting it be encoded ambiguously.

## Why it has to go in `schema.json`

`schema.json` sets `"additionalProperties": false` in four places — lines 10, 21, 99 and 154 of the
current file (root, `hook`, `flags`, `properties`). A contributor therefore **cannot** attach a
number to their own hook entry: any unknown key fails validation. The field has to be declared
centrally or it cannot exist at all.

That is a good design and this PR does not change it. It only adds one declared, optional,
constrained key.

## The gap it closes

I counted every leaf field in every entry of `hooklist.json` at the pinned commit:

| | |
|---|---|
| Entries | 869 |
| Leaf fields per entry | 27 |
| Boolean fields | 19 |
| Numeric fields | **1** — `hook.chainId`, a network identifier |
| Fields expressing a magnitude | **0** |

The registry can say a hook *has* a dynamic fee. It cannot say how large it is. For a user, a
router, or a risk tool, those are not close to the same statement.

## What the number looks like when you measure it

I measured 12 hooks on Base at block 50,614,000, using the counterfactual this PR proposes as the
`counterfactual` method value: on a fork pinned to the block, `anvil_setCode` replaces the hook's
bytecode with an 89-byte no-op that satisfies `Hooks.sol`'s return-shape checks; the `PoolKey`, and
therefore the `poolId`, `slot0`, liquidity and reserves, are byte-identical; the same swap is quoted
twice and the difference is the reading.

995 measurements, 199 pools, five sizes from 1e14 to 1e18 wei, both directions probed:

| | |
|---|---|
| Rows above 1 bps on pools whose stored `lpFee` is **0** | **545**, over 109 pools and 6 hooks |
| Median | 100.00 bps |
| Max | **1176.46 bps** — 11.76 % of the swap |
| Profiles moving more than 5 bps across the size ramp | 63 |
| Sharpest | 689.95 bps at 1e14 → 406.64 bps at 1e18 |

Concretely, for one hook that is already in this registry *and* on Uniswap's routing allowlist:

> `0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc` — this registry: `"Clanker Static Fee Hook v2 (Base)"`,
> `dynamicFee: true`, `auditUrl: ""`, `swapAccess: "none"`.
> Measured: 95 rows above 1 bps on pools reading `lpFee = 0`, **median 119.70 bps, max 1176.46 bps**.

Nothing here is an accusation. Those pools carry `fee = 0x800000`, the dynamic-fee flag, so a hook
pricing the swap itself is exactly what v4 specifies, and `slot0.lpFee` reading `0` is exactly what
v4 specifies. The point is only this: **there is currently no field, anywhere in the Uniswap stack,
that records the magnitude** — and this registry is the natural place for it.

## Checks

`python3 docs/pr-hooklist/validate.py` — no dependencies required; uses `jsonschema` when present
and a built-in draft-07 subset validator otherwise, and fails if the two disagree.

```
0. schema.patch applied to the upstream file  -> identical to the schema tested here
validators active: jsonschema, builtin
1. non-regression : 869/869 upstream entries validate unchanged against the patched schema
   control check  : 869/869 also validate against the upstream schema
2. acceptance     : entry + well-formed measuredExtraction -> VALID
   the upstream schema rejects it (additionalProperties: false), so the patch is necessary
3. rejection      : 11/11 malformed shapes are rejected
   (missing bps / block / method / sourceUrl, negative bps, bps > 10000, bps as a string,
    block as a string, unknown method, http:// source, extra member)
```

- **No existing entry changes.** The field is optional and absent from all 869 entries.
- **No tooling changes.** `hooks/**` files, the aggregation workflow and the issue template are
  untouched; a `measuredExtraction` simply passes through.
- **The diff is one hunk, 38 added lines, 0 removed.**

## What I am not proposing

- **Not making it required.** Most hooks have no published measurement, and a required field would
  either be left empty or be filled with a guess.
- **Not a score, a rating, or a risk grade.** A basis-point figure with a block and a method is a
  fact. A score is an opinion, it needs governance, and this registry should not have to own one.
- **Not automatic ingestion.** The `analyze-hook` workflow reads verified source; it cannot derive
  this number from source, and it should not try. This field is for a maintainer or a contributor
  attaching a public, reproducible measurement.

## Follow-ups I would happily open separately

1. **A timestamp.** The 27 leaf fields contain no date of any kind — no `updatedAt`, no `asOfBlock`.
   I hit this in one day: `0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc` was absent from the snapshot I
   fetched in the morning and present in the evening's. With `upgradeable: true` entries describing
   contracts whose code can change at the same address, a consumer currently has no way to tell how
   stale a description is.
2. **`verifiedSource` is `true` for 869 of 869 entries.** Since ingestion starts by fetching verified
   source from Etherscan, an unverified hook cannot enter, so the boolean is structurally constant
   and carries no information — while the population it excludes is the one a risk-facing registry
   most needs to describe.

---

*Measured with [TARE](https://github.com/JeanBaptisteDurand/ETH_Online_2026), ETHOnline 2026.
Method, limits and the five false results this project produced and corrected:
[`docs/METHOD.md`](https://github.com/JeanBaptisteDurand/ETH_Online_2026/blob/main/docs/METHOD.md).*
