# @tare/keyring — the Ledger Key Ring, without a physical device

## The problem this package solves

TARE pays for its own requests. Every `POST /measure` call is settled over x402 by a Hedera
`TransferTransaction` signed with `HEDERA_PAYER_PRIVATE_KEY` — and that key is **in clear
text in `.env`**. An autonomous agent that handles money keeps its private key in a text
file, readable by any process on the machine.

That is the problem the **Ledger Key Ring Protocol** (LKRP) exists to solve:
*"Secrets, not coins"* — a secret encrypted under a key derived from the Ledger seed, one
validation on the device at install time, then **none at all** afterwards. A headless
agent keeps decrypting; someone reading the disk no longer finds the key, only a revocable
member. What this protects exactly, and what it does not protect, is written
below — without rounding off.

## What runs, end to end

The CLI package (`@ledgerhq/wallet-cli ring init`) requires a **physical** device: it
builds its Device Management Kit with a single USB transport, hard-coded. Four attempts
confirm it — with nothing attached, with Speculos running and `SPECULOS_API_PORT`, and with the
undocumented variable `WALLET_CLI_MOCK=1` (which mocks the trustchain backend, not the device):

```
{"ok":false,"error":{"command":"ring init","message":"No Ledger device found."}}
```

**But the CLI is not the protocol.** Underneath, `@ledgerhq/ledger-key-ring-protocol`
takes a `WithDevice` that you supply, and `@ledgerhq/hw-ledger-key-ring-protocol` exposes
`device.apdu(transport)` with **any** `@ledgerhq/hw-transport`. All it took was
building the right application: LKRP does not talk to the Ethereum app but to **"Ledger
Sync"** (`TRUSTCHAIN_APP_NAME`), whose repository `LedgerHQ/app-ledger-sync` is public.

The complete cycle, obtained against Speculos serving Ledger Sync **1.2.2** for Nano X:

| step | result |
|---|---|
| LKRP challenge | `trustchain-backend.api.aws.stg.ldg-tech.com/v1/challenge`, 183-byte TLV signed by Ledger |
| seed ID | the device signs: `031fbef68de38f9facd182c1bc60c3f17290c294cc0d197f57eb645aa43733440a`, with attestation |
| trustchain | created — `00914e888507dbcb06b27d5fd3e50f3465d632d63fde0b07b587f7ebb99cfae281` |
| encryption | the real `HEDERA_PAYER_PRIVATE_KEY`, sealed into 132 bytes |
| **opening** | **Speculos off, port dead, transport forbidden — the secret comes out** |
| **payment** | a real x402 request settled with that key: `0.0.7162784@1788855729.911769704` |

The screens, in order — there are **two** approvals, not one:

```
Connect to Ledger Sync?  ->  Connect                      <- double press
Connection requested
Turn on sync for Ledger Wallet?
Ledger Wallet will be able to view and update your synced accounts.
                         ->  Turn On sync                 <- double press
Sync requested
```

## What this protects, and what it does not protect

On the disk (`var/keyring.json`, mode 0600) there is: the **member's** private key, the
`rootId`, and the **sealed** secret. The encryption key is **not** there — the member
recovers it by authenticating with Ledger's backend, which returns the resolved stream of the
trustchain (`restoreTrustchain`). A test verifies this, and `parseRing` **refuses** a file
that would contain one: such a file would protect nothing.

What we gain, exactly:

- the payment key is no longer **in clear text** on the disk;
- access is **revocable** — `removeMember` cuts this machine off without touching the seed,
  the other members, or the secret;
- access is **attributable** to a named machine;
- the bootstrap required a **hardware approval**.

What we do not gain: an attacker who steals the member file **and** can reach Ledger's
backend can decrypt. This is not a vault, it is a **revocable delegation**. It is already
far above a line in `.env`, and it is not a vault.

## Where this plugs into TARE

`apps/api/src/pay/secret.ts` resolves the key: keyring if it exists, environment otherwise —
and it **always says which**, all the way into the settlement proof
(`docs/x402-settlements.jsonl`, field `source_de_la_cle`). The fallback exists so that the
project stays usable without a Speculos container, but it announces itself: "it works" and "it
is protected" are not the same sentence.

## Replay

```bash
scripts/ledger/build-app.sh ledger-sync       # builds from LedgerHQ/app-ledger-sync
scripts/ledger/run-speculos.sh ledger-sync    # Speculos on http://127.0.0.1:5011

npx tsx packages/keyring/scripts/seed-id.ts   # the challenge, the screen, the signature
set -a; . ./.env; set +a
npx tsx packages/keyring/scripts/ring.ts seal # seals HEDERA_PAYER_PRIVATE_KEY

docker rm -f tare-speculos-ledger-sync        # we TURN OFF the device
npx tsx packages/keyring/scripts/ring.ts open # and the secret comes out anyway

# and the payment, with the variable removed from the environment:
cd apps/api && env -u HEDERA_PAYER_PRIVATE_KEY \
  TARE_POOL_ID=0x… TARE_DIRECTIONS='1->0' npx tsx src/pay/cli.ts payer
```

## The upstream bug that prevents anyone from installing this package

`npm install @ledgerhq/ledger-key-ring-protocol` **fails for everyone**:

```
ledger-key-ring-protocol@0.15.2
  -> @ledgerhq/speculos-transport@0.10.6
       -> @ledgerhq/live-dmk-speculos@0.10.0     <- absent from npm (the whole name returns 404)
```

`@ledgerhq/live-dmk-speculos` is published at **no** version, and **all** the versions
of `speculos-transport` >= 0.9.6 depend on it. Inside Ledger Live's monorepo the
resolution goes through a workspace link; outside it, it 404s. Yet **no file** of the
protocol loads `speculos-transport`: it is a declared and unused dependency.

Our workaround, in `package.json`, with its reason written next to it:

```json
"overrides": { "@ledgerhq/speculos-transport": "npm:@ledgerhq/logs@6.17.0" }
```

It is ugly, and we own it: the package is aliased onto a module that installs and that
nobody loads. The upstream fix is one line — publish `live-dmk-speculos`, or
remove the dependency — and it is proposed in [`OPEN-SOURCE.md`](../../OPEN-SOURCE.md).

## What is NOT proven

- **No physical device.** Speculos runs the same application binary and the same
  display code — that is why Ledger publishes it — but an emulator is not a
  Nano in a hand.
- **The backend is the STAGING one.** Production refuses our attestation
  ("Attestation is for an unknown application"), and it is right to: our `.elf` is
  compiled locally, therefore not signed by Ledger. A production Nano would go to production.
- The seed is Speculos's default test seed. No real seed has touched this
  machine.
