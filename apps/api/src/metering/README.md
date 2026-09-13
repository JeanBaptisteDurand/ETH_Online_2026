# LOT G — the per-measurement meter and the HCS log

TARE's billed unit is not the request, it is **the measurement**: a pair of quotes
of the same swap, once with the hook, once with the inert 89-byte stub. A
"5 sizes x 2 directions" request is worth **ten** units and writes **ten rows**
to the ledger. This is the Hedera point *pay-per-call inference, data, or
compute metering rather than a flat per-request charge*; without those ten rows,
it would be nothing but a slogan.

Each batch then publishes its **digest** on a Hedera Consensus Service topic —
*verifiable payment audit trails on HCS*.

## The real topic

| | |
|---|---|
| Topic | **`0.0.10371106`** (Hedera testnet) |
| HashScan | <https://hashscan.io/testnet/topic/0.0.10371106> |
| Mirror | <https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10371106/messages> |
| Created by | `0.0.10367920`, tx `0.0.10367920@1788569154.281550684` |
| Submit key | the payer account's key: only TARE writes in its own log |
| Observed cost | **377,528 tinybar** (282-byte message) and **389,763 tinybar** (289 bytes), i.e. **~0.0038 HBAR per message** |

Message no. 1, read back on the mirror node:

```json
{"v":"tare.metering.v1","batch":"b_11d6a668638448db9869","ts":"2026-09-05T00:47:11.371Z",
 "digest":"sha256:af2de094a070a0b2057525758cfb6515e65ea66bec88c52af5960849e820a647",
 "units":2,"unit_price_usd":0.001,"amount_usd":0.002,"payer":"0.0.10367920",
 "settlement":null,"block":50614000}
```
consensus timestamp `1788569234.806167390`, payer `0.0.10367920`.

What goes out on HCS is the batch digest, not the measurements: a non-chunked
HCS message caps at 1024 bytes, and the detail stays in `/usage/log`.

## What was ported, and what changed

Ported from an earlier metering service of ours:

| Source there | Here | What changes |
|---|---|---|
| its prompt-log repository | `ledger.ts` | Prisma/Postgres -> append-only JSONL; one row per **measurement**, no longer per call; `purpose` -> `payer` |
| its usage service | `service.ts` | same window (1st of the month UTC), `byPurpose` -> `byPayer`; + HCS anchoring |
| its usage controller | `router.ts` | Fastify+Zod -> Hono; + `/usage/log`, `/usage/batch/:id`, `/usage/hcs*` |
| its HMAC middleware and the matching client signer | `hmac.ts` | Fastify -> Hono; `x-tare-*` headers; **the signed body is the RAW body** (that earlier service re-serialised `req.body`, so a re-spaced JSON broke the signature); the refusal states its reason instead of a silent 401 |

No dependency added: `@hiero-ledger/sdk` 2.85.0 (formerly `@hashgraph/sdk`) is
already installed, pulled in by `@x402/hedera` 2.23.0.

## The honesty rules, applied to billing

- A `NOT_MEASURABLE` measurement **is not billable**. Bounded read, timeout,
  silent engine: no unit owed. We do not bill a silence.
  (`MEASURED`, `INTERPOLATED`, `NOT_QUOTABLE` are billed: the pair of quotes
  did run, and `NOT_QUOTABLE` is a verdict, not a breakdown.)
- **But x402 collects BEFORE the engine runs.** The price is fixed at the 402,
  the money moves at settlement, the label only exists afterwards: the first
  payment actually settled paid for a `NOT_MEASURABLE` unit. A non-billable unit
  that has already been paid is not free, it is a **credit**. Hence three figures
  instead of one — `amount_usd` (what is owed), `amount_settled_usd` (what was
  REALLY taken on-chain), `credit_usd` (the gap, which the service owes).
  The detail: [`X402.md`](../../../../X402.md) at the root of the repository.
- A batch is `ANCHORED` only if the **mirror node** returns the message, byte for
  byte. Otherwise `NOT_ANCHORED`, with the reason. Never promoted.
- A cost that was not read is `null`, **never 0** — 0 would say "free".
- `readTopic` follows `links.next` all the way; an interrupted pagination returns
  `complete: false`, not a short list presented as complete.

## Routes

```
GET  /usage                    total in measurements, by payer, settlement hashes, HCS state
GET  /usage/rollup             the earlier shape: { since, unit, byPayer }
GET  /usage/log?limit=         one row PER MEASUREMENT, with `truncated`
GET  /usage/batch/:id          the detail of one batch
GET  /usage/hcs                topic, cost, anchors
GET  /usage/hcs/history        each anchor, published message included
GET  /usage/hcs/message/:seq   LIVE read-back by the mirror node (200 VERIFIED / 503 NOT_VERIFIED)
POST /usage/anchor             anchors a batch — HMAC-signed
```

## The wiring, as it stands (and why it is not the one described above)

This batch described a two-line wiring. It is wired — but **not** like that, because
the first payment actually settled showed that this wiring was wrong. See
[`X402.md`](../../../../X402.md) for the full account; in short:

```ts
// one slot PER REQUEST: the settlement hook runs in the same async context,
// so it finds the slot again. A shared variable would attribute one request's
// settlement to another request's batch as soon as two clients pay at once.
const enCours = new AsyncLocalStorage<{ receipt: BatchReceipt | null; block: number | null }>();

const layer = createPaymentLayer(cfg, {
  onSettled: (payer, st) => {
    const slot = enCours.getStore();
    if (!slot?.receipt) return;
    metering.service.attachSettlement(slot.receipt.batch_id, { ...st, payer });
    // AFTER attaching: anchor any earlier and the digest would go out with
    // `settlement: null` and would no longer be a PAYMENT audit trail.
    void metering.service.anchorBatch(slot.receipt, { block: slot.block });
  },
});
app.use("/measure", (c, next) => enCours.run({ receipt: null, block: null }, () => next()));
```

Three traps, all confirmed in use:

1. **The payment header is called `PAYMENT-SIGNATURE` in x402 v2**, not `X-PAYMENT`
   (v1). Reading the wrong name does not break the toll — the library itself reads both —
   but it makes every paid request look unpaid: payer `"(non paye)"`, and a
   premature anchor with no settlement hash.
2. **The payer is not readable from the header** on Hedera: the `exact` payload carries
   a serialised `TransferTransaction`. It is only known at settlement. `anchorBatch`
   therefore takes the one from the ROWS (updated by `attachSettlement`), not the one
   from the receipt.
3. **A batch already anchored is never republished.** Every HCS message costs HBAR, and a
   trail in which the same batch appears twice is no longer a trail.

`app.get("/usage")` has indeed been removed from `src/app.ts` in favour of `metering.router`.

## Variables

```
HEDERA_HCS_TOPIC_ID=0.0.10371106   # without it: no anchoring, and /usage SAYS so
TARE_METERING_LOG=...              # path to the JSONL; absent => in memory
TARE_HMAC_SECRET=...               # absent => the guard steps aside and announces it
TARE_LIVE_HCS=0                    # switches off the network test
```

## Commands

```bash
cd apps/api
npx vitest run --config src/metering/vitest.config.ts   # 50 tests + 1 skipped
npx tsx src/metering/cli.ts topic-create                # once only
npx tsx src/metering/cli.ts anchor                      # publishes a digest and reads it back
npx tsx src/metering/cli.ts usage                       # the full walkthrough, 10 units
npx tsx src/metering/cli.ts read                        # the whole topic, all pages
```
