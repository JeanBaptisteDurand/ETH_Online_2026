# TARE — MCP server

Four tools that tell a model **what a Uniswap v4 hook actually takes from a swap**, and refuse to
tell it anything else.

The model never produces a number. It chooses what to query; the server reads the value from the
committed dataset, from the LOT B API, or from the Python engine's own stdout, and hands it back
with its block, its size, its direction, its label and a command that reproduces it.

## Plug it into Claude Desktop (3 lines)

```bash
cd /Users/beorlor/Documents/ethonline/ETH_Online_2026/apps/mcp && npm install && npm run build
```

Then add this to `~/Library/Application Support/Claude/claude_desktop_config.json`
(`%APPDATA%\Claude\claude_desktop_config.json` on Windows) and restart Claude Desktop:

```json
{
  "mcpServers": {
    "tare": {
      "command": "node",
      "args": ["/Users/beorlor/Documents/ethonline/ETH_Online_2026/apps/mcp/dist/src/index.js"]
    }
  }
}
```

Claude Code, same thing in one line:

```bash
claude mcp add tare -- node /Users/beorlor/Documents/ethonline/ETH_Online_2026/apps/mcp/dist/src/index.js
```

Nothing else is required. With no fork, no API and no network the server still answers from the
128 committed measurements — it just labels what it cannot measure `NOT_MEASURABLE`.

**To also measure swaps that are not in the dataset**, bring the pinned fork up first:

```bash
docker compose up -d anvil
```

## The four tools

| tool | question | needs the fork? |
|---|---|---|
| `tare_measure(hook, pool, size, direction, block?)` | what does this hook take on *this* swap? | only for swaps absent from the dataset |
| `tare_lookup(hook)` | everything already recorded about this hook, labelled | no |
| `tare_impact(hook)` | blast radius: which pools, which tokens, how much is actually measured | no |
| `tare_twins(hook)` | same bytecode, same declared permissions, same hand | only for bytecode twins |

### `tare_measure` — the measurement, on demand

Resolution order, and the label each step can produce:

1. the committed dataset, exact row → `MEASURED` / `NOT_QUOTABLE` / `NOT_MEASURABLE`
2. the LOT B API, if it answers → re-validated here before being repeated
3. **the live counterfactual against the pinned fork** → `MEASURED` / `NOT_QUOTABLE` / `NOT_MEASURABLE`
4. interpolation between two `MEASURED` sizes → `INTERPOLATED`, citing both endpoints
5. nothing → `NOT_MEASURABLE`, with the reason and the resolution path

Step 3 is the product. `anvil_setCode` replaces the hook's bytecode with an inert 89-byte stub;
the `PoolKey` — which contains the hook's address — is untouched, so `poolId`, liquidity, `slot0`
and reserves are byte-identical. The same swap is quoted twice. The difference **is** what the
hook took. The arithmetic is done by `engine/tare`, never by this process:
`bin/tare_measure.py` imports the engine and prints one JSON object, and the server prints what
came back.

If the fork's head is not the block that was asked for, the answer is `NOT_MEASURABLE` with
`fork_block_mismatch`, never a number stamped with a block it was not taken at.

### `tare_twins` — three relations, three levels of evidence

* **permission twins** — exact, offline, free. A v4 hook's permissions are the low 14 bits of its
  own address (`Hooks.sol`), so two hooks with the same 14 bits declare the same rights. A
  declaration, not a behaviour: a lead, not a verdict.
* **bytecode twins** — exact, but needs the fork: `eth_getCode` on every known hook at the pinned
  block, keccak of the *full* body, compare. `NOT_MEASURABLE` when the fork is down.
* **deployer twins** — `NOT_MEASURABLE`. This checkout ships no creation-trace index, and TARE
  does not infer a deployer from an address prefix or a CREATE2 salt it has not verified.

A twin can only be found inside the set that is probed. Drop a JSON array of addresses at
`docs/hooks-universe.json`, or point `TARE_HOOK_UNIVERSE` at one, and they are probed too. The
default universe is the 12 hook addresses that appear in the committed evidence.

## The rules this server enforces

1. **No number is invented.** Every figure comes from the dataset, the API, or the engine's
   stdout. The only figures the server computes are counts of its own rows and the
   min / median / max of a list it prints in full in the same answer.
2. **Four labels, never upgraded** — `MEASURED`, `INTERPOLATED`, `NOT_MEASURABLE`, `NOT_QUOTABLE`.
   A label that carries no number never carries one; `test/honesty.test.ts` walks every payload of
   every tool and asserts it.
3. **Never conclude on a truncated read.** Bodies are read whole (`res.text()`, then parse).
   A code string of odd length is `code_hex_has_odd_length_truncated_read`, not a codehash. An
   engine that prints nothing is `NOT_MEASURABLE`, not zero.
4. **Every value replays in one command.** Printed next to it, with the repository path baked in.

One more, specific to this process: `docs/pools-liquides.json` stores uint128 liquidity as a bare
JSON number, and `6242907904062804350752` does not survive an IEEE double. Every integer literal
of 16 digits or more is quoted before parsing and stays a string forever after. A silently
rounded liquidity would be a fabricated number.

## Configuration

Every one of these is optional.

| variable | default | what it does |
|---|---|---|
| `TARE_RPC_URL` | `http://127.0.0.1:8545` | the pinned fork |
| `TARE_API_URL` | `http://127.0.0.1:8787` | LOT B's API; absence is reported, never hidden |
| `TARE_BLOCK` | `50614000` | the block the committed dataset was taken at |
| `TARE_LIVE` | `1` | `0` forbids the server from touching the fork at all |
| `TARE_ENGINE_TIMEOUT_MS` | `60000` | budget for one live measurement |
| `TARE_API_TIMEOUT_MS` | `1200` | budget for a probe of the optional API |
| `TARE_HOOK_UNIVERSE` | `docs/hooks-universe.json` | extra addresses for `tare_twins` |
| `TARE_REPO_ROOT` | auto-detected | where the checkout is, if this package was moved |
| `TARE_PYTHON` | `python3` | interpreter used for `bin/tare_measure.py` |

No secret is read by this process. The upstream RPC key lives in the repository's `.env` and is
used only by `docker compose` to start the fork.

## Tests

```bash
cd /Users/beorlor/Documents/ethonline/ETH_Online_2026/apps/mcp && npm test
```

37 tests. Among them:

* **a real MCP round trip** — `dist/src/index.js` is spawned over stdio exactly as Claude Desktop
  spawns it, `initialize` is performed, `tools/list` returns the four tools with their schemas,
  and `tools/call` returns the recorded measurement (`test/mcp.test.ts`);
* **the live counterfactual reproduces the committed row quote leg for quote leg** — not "close
  to": the same integers, and the same stub hash (`test/live.test.ts`, skipped when the fork is
  not at block 50,614,000);
* **the permission decoding is cross-checked against the measurements** — a hook whose address
  grants neither `beforeSwap` nor `afterSwap` cannot run during a swap, so replacing it with the
  stub must change nothing. Both such hooks in the dataset measure exactly `0.00` bps
  (`test/hookflags.test.ts`);
* **the TypeScript `poolId` agrees with the Python engine** on all 32 measured pools
  (`test/poolid.test.ts`);
* **uint128 liquidity survives the parse exactly**, and plain `JSON.parse` is shown not to
  (`test/dataset.test.ts`);
* **no label carries a number it should not**, across every payload of every tool
  (`test/honesty.test.ts`).

## Layout

```
bin/tare_measure.py   thin bridge: imports engine/tare, prints one JSON object
src/dataset.ts        the evidence, loaded whole, fingerprinted, big-integer safe
src/store.ts          indexes and lookups — no estimation anywhere
src/engine.ts         spawns the bridge, refuses partial output
src/api.ts            LOT B client, optional by design
src/interpolate.ts    the only sanctioned non-measurement, and it will not extrapolate
src/hookflags.ts      permissions from the low 14 bits of the address
src/replay.ts         the one command that reproduces each value
src/tools/            measure · lookup · impact · twins
src/server.ts         the four MCP tools
```
