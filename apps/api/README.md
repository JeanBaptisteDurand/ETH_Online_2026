# apps/api — the TARE API

Node + Hono + TypeScript. It serves the extraction measurements of Uniswap v4 hooks and
sells measurement on demand behind an x402 toll on Hedera testnet.

**It computes no bps.** The numbers come either from the published dataset or from the
Python engine (`engine/tare`, 47 tests, gate A3), called by `scripts/measure_one.py`.

**Public instance:** <https://api.tare-hooks.tech>. The x402 toll answers there — an unpaid
`POST /measure` returns 402 with its price. The measurement engine and the account database are
not deployed on that host yet; see [`DEPLOY.md`](../../DEPLOY.md).

## Getting started

```bash
docker compose up -d              # from the repo root: the anvil fork pinned to the block
cd apps/api && npm install
npm start                         # http://127.0.0.1:8787
npm test                          # 30 vitest tests
```

## Routes

| | |
|---|---|
| `GET /hooks` | the ranking: per hook, the maximum bps, the number of pools, the number of measurements, the official registry entry |
| `GET /hook/:address` | all of the hook's profiles: per pool, each point with block, size, direction, label |
| `GET /measurement/:id` | one measurement and **its exact replay command** |
| `POST /measure` | measurement on demand — **paid, x402** |
| `GET /usage` · `GET /usage/log` | the meter: unit = 1 measurement |
| `GET /meta` | sources, engine health, toll |
| `GET /replay/:id` | the replay command, as plain text |

## The toll: billed per measurement, not per request

`@x402/hono` and `@x402/hedera` at **2.23.0** (both exist on npm and install).
Network `hedera:testnet`, facilitator `https://api.testnet.blocky402.com` — whose
`/supported` does announce `{"scheme":"exact","network":"hedera:testnet","extra":{"feePayer":"0.0.7162784"}}`.

The price **is not fixed**: it is a function of the request body
(`price: async (context) => …` in `src/x402.ts`). A request that asks for five
sizes pays five units. Without this dynamic price, "compute metering rather than a
flat per-request charge" would be nothing but a sentence.

```
1 measurement   ->  accepts[0].amount = "1000"   (Hedera USDC, 6 decimals, 0.001 USD)
5 measurements  ->  accepts[0].amount = "5000"
```

The body of the 402 repeats `accepts[]` in the clear: x402 v2 puts it in the
`payment-required` header in base64, unreadable in a `curl`.

## Body of POST /measure

```jsonc
{
  "hook":    "0x…",          // a hook known to docs/pools-liquides.json
  "pool_id": "0x…",          // or a pool already measured
  "pool":    { "currency0": "0x…", "currency1": "0x…", "fee": 8388608,
               "tick_spacing": 200, "hooks": "0x…" },   // or the full PoolKey
  "sizes":      ["100000000000000", "1000000000000000"],
  "directions": ["0->1", "1->0"],
  "block": 50614000
}
```

The plan is validated **before** the toll: a request we would not know how to execute
exits with a 400 without ever asking for payment.

## Evidence (curl, 2026-09-05)

The ranking reproduces the results already obtained:

```
$ curl -s localhost:8787/hooks | jq '.hooks[0] | {hook, max_bps, pools, measurements, labels}'
{ "hook": "0x985c14baa2a18316ffda0aefb3a632fadfca2acc", "max_bps": 100,
  "pools": 25, "measurements": 100, "labels": {"MEASURED": 52, "NOT_QUOTABLE": 48} }
```

The 402, with the real Hedera facilitator:

```
$ curl -s -X POST localhost:8787/measure -H 'content-type: application/json' \
    -d '{"pool_id":"0x56d31…0450","sizes":["1000000000000000"]}'
HTTP/1.1 402 Payment Required
{"x402Version":2,
 "accepts":[{"scheme":"exact","network":"hedera:testnet","amount":"1000",
             "asset":"0.0.429274","payTo":"0.0.7162784","maxTimeoutSeconds":300,
             "extra":{"feePayer":"0.0.7162784"}}],
 "billing":{"unit":"measurement","unit_price_usd":0.001,"units_for_this_request":1}}
```

Measurement on demand, toll switched off (`X402_ENABLED=0`), on the gate A3 pool.
The first four values are the ones the gate expects (99.99 / 99.93 / 99.26 / 93.10):

```
     100000000000000  MEASURED        99.9926
    1000000000000000  MEASURED        99.926
   10000000000000000  MEASURED        99.2644
  100000000000000000  MEASURED        93.1011
 1000000000000000000  NOT_MEASURABLE  engine_error:empty response from http://127.0.0.1:8545
```

The fifth is **not** a zero: the fork's upstream RPC (`https://base.drpc.org`,
public) rate-limited, the read came back empty, and an empty read is a
`NOT_MEASURABLE`. That is rule 3, applied by the code and not by good will.

## What is NOT verified

* ~~**A real Hedera payment has never been settled** end to end.~~ **This has not been
  true since 8 September 2026**, and the sentence is kept struck through because a
  limitation that has been lifted gets struck out, not erased: erasing it would suggest
  it never existed. **5 settlements** went through on `hedera:testnet`, in USDC
  (`0.0.429274`), via the Blocky402 facilitator, each one RE-READ on the mirror node
  before being called settled — a 200 says the server returned the resource, not that
  money moved. The log:
  [`docs/x402-settlements.jsonl`](../../docs/x402-settlements.jsonl), append-only;
  the account: [`X402.md`](../../X402.md). Of these, **3** were signed by a key served
  by the Ledger Key Ring and not by a file. Verification and settlement remain delegated
  to `@x402/hono`, not reimplemented here.
* `payTo` defaults to `HEDERA_FEE_PAYER` (`0.0.7162784`), that is, the facilitator's
  account. **Put a real TARE account in `HEDERA_PAY_TO` before any paid demo.**
* `replay.command` (`make measure HOOK=… BLOCK=…`) is the short form published in the
  root README. `engine/tare/cli.py` appeared during this work package, so the command
  exists — but my only attempt (`make measure HOOK=0x1aea38f0… BLOCK=50614000`) stopped
  on an uncaught `RpcError: empty response`, the fork's upstream RPC being
  rate-limited. **The form that runs today is `replay.command_exact`**
  (`python3 apps/api/scripts/measure_one.py …`), verified by hand and through the API;
  both are served by `/measurement/:id`.
* `docs/pools-liquides.json` stores liquidity as a JSON number: past 2^53 the exact
  value is already lost when the file is read. It only serves to rank the pools of a
  single hook (`liquidity_approx`), never to be displayed as a measurement.
