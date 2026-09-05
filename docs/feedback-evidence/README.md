# Evidence for `FEEDBACK.md`

Every figure in [`../../FEEDBACK.md`](../../FEEDBACK.md) that is not read straight out of
[`../dataset/measurements.jsonl`](../dataset/measurements.jsonl) is produced by one of the two
scripts here. Both write their own JSON output, both carry their replay command in the output, and
both refuse to conclude on a failed read.

| script | what it establishes | output |
|---|---|---|
| [`quote_direction.py`](quote_direction.py) | how many pools `V4Quoter` quotes in one direction only | [`quote-direction.json`](quote-direction.json) |
| [`routing_allowlist.py`](routing_allowlist.py) | which measured hooks are on Uniswap's routing allowlist and in the registry; the registry's field census | [`routing-allowlist.json`](routing-allowlist.json) |

## `quote_direction.py`

```bash
python3 docs/feedback-evidence/quote_direction.py        # all 199 pools of the corpus
python3 docs/feedback-evidence/quote_direction.py 40     # the 40 deepest
```

Probes each pool of [`../pools-liquides.json`](../pools-liquides.json) in both directions, at the
five sweep sizes, at block 50,614,000. A pool counts as quotable in a direction as soon as one of
the five sizes returns a non-zero amount.

**Read-only.** Nothing but `eth_call` at a pinned block, addressed straight at the Base archive
node. No `anvil_setCode`, no state written, no anvil touched — so it can run while a sweep is
measuring elsewhere. (Measuring is different: one measurer per fork, always.)

**It never turns a node failure into a pool verdict.** A call that fails for infrastructure reasons
is retried six times with growing backoff; if it still fails the pool is counted under
`indetermine_infra` and the output says so. The committed run has `indetermine_infra: 0`.

Reads the RPC body in full: `NotEnoughLiquidity` (`0x7a5ed734`) lives at **byte 68** of the revert
data, wrapped in `UnexpectedRevertBytes` (`0x6190b2b0`), and any bounded read before that offset
destroys the detection. Requires `BASE_RPC_URL` in the repository's `.env`.

## `routing_allowlist.py`

```bash
python3 docs/feedback-evidence/routing_allowlist.py
```

Downloads three upstream files, each **pinned to a commit** rather than to `main`, so the numbers
mean the same thing in six months:

- `Uniswap/routing-api` @ `f5a8189` — `lib/util/hooksAddressesAllowlist.ts`
- `Uniswap/hooklist` @ `8623037` — `hooklist.json` and `schema.json`

It resolves `HOOKS_ADDRESSES_ALLOWLIST[ChainId.BASE]` through the file's own address constants —
and **aborts rather than guessing** if any constant fails to resolve — then joins the result against
the 995 measurements and the registry.

A hook with no `MEASURED` row comes out with `bps_median: null`. Never `0`.
