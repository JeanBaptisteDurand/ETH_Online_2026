# Putting the service online

The Hedera *AI & Agentic Payments* track asks for two things the code alone does not give:

> *"Host a **live** x402-gated service on Hedera testnet or mainnet, settled through the
> Blocky402 facilitator"*
> *"…completes **at least one real paid request** end to end"*

The second is done, and proven: 5 real settlements — counted in the ledger, not asserted — in
[`docs/x402-settlements.jsonl`](docs/x402-settlements.jsonl), each re-read on the mirror node.
The first needs a machine that is switched on.

## Where this stands today

<https://tare-hooks.tech> is live, with a valid Let's Encrypt certificate. **It serves the two
static surfaces and nothing else** — the instrument at the root, the landing page under
`/landing/`. Every API path falls through to the page: there is no `db`, no `anvil` and no `api`
container behind that domain. So the x402 service is still **not hosted**, and the track
requirement is still **not** met.

## What is already verified

The image builds, runs, and **has been paid** — the last settlement in `x402-settlements.jsonl`
was served by the container, not by a development process:

```
POST /measure (container)  ->  402
PAYMENT-SIGNATURE          ->  200 in 5.5 s
mirror node                ->  SUCCESS, 0.001 USDC, 0.0.7162784@1788856311.146171915
```

What is missing is the hosting itself: a domain and a machine pointed at the compose file below.

## One command

```bash
# on the server, repository cloned, .env filled in
TARE_DOMAIN=tare.example.com ./scripts/deploy.sh
```

`scripts/deploy.sh` **refuses to start** on a configuration that would produce a service that
looks healthy and is wrong: without `BASE_RPC_URL` there is no fork, so no measurement, only a
dataset to read back; without `HEDERA_PAY_TO` the toll would collect into someone else's account.
Better not to start than to serve 402s that lead nowhere.

## The five containers, and why none of them is spare

| | role | why it is indispensable |
|---|---|---|
| `db` | Postgres (pgvector/pg16) | the **twelve** account routes depend on it: wallet login, the session, API keys, history, downloads. Without it they answer 503 — and this file used to ship none of them. **No port is published**: a database reachable from the public internet with the development password is a database open to everyone |
| `anvil` | Base fork pinned to block 50,614,000 | this is what makes the measurement possible at all: `anvil_setCode` replaces the hook's bytecode with the inert 89-byte stub. No fork, no counterfactual |
| `api` | the x402 API plus the Python engine | inseparable: `POST /measure` runs `measure_one.py` and reads its output |
| `assistant` | the second server, port 8788 | same image, different entry point. **Nothing used to launch it**, so the site's conversation panel pointed at a service that did not exist. Caddy routes `/assistant*` to it |
| `caddy` | automatic TLS | a service that is "live" without TLS is not a service, it is a demo |

### The variables the script demands, and why it refuses without them

| variable | without it |
|---|---|
| `TARE_DOMAIN` | Caddy cannot request a certificate |
| `BASE_RPC_URL` | no fork, so no counterfactual: only a dataset to read back |
| `HEDERA_PAY_TO` | the toll would collect into someone else's account |
| `HEDERA_FEE_PAYER` | the facilitator does not know who is announcing the payment |
| `TARE_DB_PASSWORD` | Postgres would start with the development password, **on a public machine** |

And three **optional** ones, whose absence is announced rather than silent:
`TARE_ABONNEMENT_CONTRAT` / `_RPC` (without them `GET /compte` answers "subscription unverified,
therefore not active" — a stated refusal, but a refusal: no key and no download is issued) and
`TARE_SUBSTITUTION_RPC` (without it `POST /alternative` cannot quote live, so there is no output
floor, so there is no sendable transaction — the fork is pinned to a block and cannot quote "now").

Anvil's cache volume is not a refinement: a cold quote against a public RPC was measured at
**8.96 s**, and at **0.01 s** once the state was local.

## Two traps already paid for

**Compose splits a command written as a string.** The Foundry image's `ENTRYPOINT` is
`["/bin/sh","-c"]`: the command has to reach it as **one single argument**. With a YAML string,
`sh -c` takes `anvil` for the whole script and every option becomes `$0`, `$1`… A bare anvil
starts — **with no fork**, and listening on `127.0.0.1` *inside* the container, so the published
port answers nothing. A one-element list is the only correct form. This bug lived in the
repository until 8 September.

**x402 lives in the headers.** `PAYMENT-REQUIRED` on the 402, `PAYMENT-SIGNATURE` on the paid
request, `PAYMENT-RESPONSE` on the response. A proxy that swallows them breaks the protocol
silently: the client pays and never sees the receipt. The [`Caddyfile`](infra/Caddyfile) lets them
through **and** exposes them to the browser.

The proxy timeout was raised to 300 s for the same reason: five sizes × two directions took 9.4 s
locally, and the 30 s default would cut a **paid** request off just before its answer. The client
would have paid for nothing — that is the worst case, so it is the one we plan for.

## The payment key, in production

The Ledger keyring is mounted **read-only** in the container (`./var:/srv/tare/var:ro`): the
service opens it, it never modifies it.

If it is absent, the service falls back to `HEDERA_PAYER_PRIVATE_KEY` in the clear — and
`scripts/deploy.sh` **says so out loud** instead of leaving that to be discovered later. To seal
it, see [`packages/keyring/`](packages/keyring/).

## Checking from outside

```bash
# the toll must answer 402, with its price
curl -i -X POST https://tare.example.com/measure \
  -H 'content-type: application/json' \
  -d '{"hook":"0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc","sizes":["1000000000000"]}'

# then pay for real
TARE_API_URL=https://tare.example.com/measure npx tsx apps/api/src/pay/cli.ts payer
```

## If Docker gives out on the day — the escape hatch

Measured on 10 September on the development machine: **the same state read costs 0.029 s against
a native `anvil` and 45 s — that is, a timeout — through the Docker container.** The `docker`
commands themselves took over five minutes to return. The container answered local methods
(`eth_chainId`, `eth_blockNumber`, served from memory) and failed on **everything** that needs an
upstream read. Neither the RPC key — Alchemy returns the same slot in 0.12 s — nor the archive
state at the pinned block, still being served, was the cause: it was Docker's networking.

The practical consequence: `make replay` returned `NOT_MEASURABLE` instead of 99.9942 bps. The
engine behaved correctly — a bounded read is a label, never a number — but the demonstration
looked broken.

**The fork does not need Docker.** If `anvil` is installed:

```bash
anvil --fork-url $BASE_RPC_URL --fork-block-number 50614000 \
      --host 127.0.0.1 --port 8545 --compute-units-per-second 200000 --silent
```

Verified under those conditions, the replay returns **`99.9942` against `99.9942`, identical to
the wei**. The `api` and `caddy` containers stay useful for hosting; `anvil` is the one you can do
without, and it is the one that breaks.

**To run before any demonstration, in this order:**

```bash
curl -s -m 10 -X POST http://127.0.0.1:8545 \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getStorageAt","params":["0x498581ff718922c3f8e6a244956af099b2652b2b","0x0","latest"]}' \
  -w ' [%{time_total}s]'
```

Past one second, the fork will serve no measurement: restart `anvil` natively before you begin,
not during.

## What is not done

**No machine hosts the x402 service yet.** A domain now answers — <https://tare-hooks.tech> — but
it serves the static instrument and the landing page, not the API. Everything above is verified
locally, container included, and the deployment fits in one command; but until that command is run
against a machine and an API endpoint answers, the track requirement is **not** met.
