# `@tare/guard`

Reads a Uniswap v4 swap **before you sign it**, decodes the `PoolKey` out of the Universal Router
calldata, looks the pool up in the pre-computed TARE table, and says what the hook took the last
time it was measured — with the block, the size, the direction and the command that replays it.

It measures nothing at signing time. Measuring takes ~9 s cold and demands **one measurer per anvil**
([`src/guard.ts`](src/guard.ts) header, [`docs/LIMITS.md` §9](../../docs/LIMITS.md)); the guard is a
*lookup*, and every number it shows carries the block it came from.

```ts
import { tareGuard, gate, confirmApprover } from "@tare/guard";

const report = tareGuard(txRequest);          // never throws, never guesses a number
const decision = await gate(report, confirmApprover);
if (!decision.approved) throw new Error(decision.reason);
```

Entry points: `@tare/guard` (library), `@tare/guard/browser` (EIP-1193 interception),
`@tare/guard/ledger` (the Ledger path below), `@tare/guard/table` (the raw table JSON).

The table is built from the dataset, not written by hand: `npm run build:table` regenerates
`data/table.json` from `docs/dataset/measurements.jsonl` and stamps its own `n_measurements`,
`n_hooks`, `n_pools`, `block_number`, `engine_ver` and `stub_hash` into the file. Every count the
guard displays is read back out of that file at runtime — there is no count hard-coded anywhere in
`src/`.

## Labels, and the one rule that matters

`MEASURED` · `INTERPOLATED` · `NOT_MEASURABLE` · `NOT_QUOTABLE` — never promoted, never collapsed
into a boolean. A pool the corpus could not quote yields `NOT_QUOTABLE` and **no number**. A size
that was not measured yields no number. *Not measured is not zero*, and the guard is written so that
the difference survives all the way onto the screen you sign from.

---

## The Ledger path

`src/approver.ts` has always declared a `LedgerTransport` interface and refused every approval while
none was supplied. `src/ledger.ts` is the implementation that was missing: it opens a device over
WebHID, instantiates `@ledgerhq/hw-app-eth`, and asks it to sign an **EIP-712 typed message** whose
fields are the substance of the guard report.

```ts
import { installTareGuard } from "@tare/guard/browser";
import { ledgerEip712Approver } from "@tare/guard/ledger";

installTareGuard({ approver: ledgerEip712Approver({ path: "44'/60'/0'/0/0" }) });
```

### Why typed data and not a message blob

`signPersonalMessage` would put a wall of text — or worse, a hash — on a screen the size of a
postage stamp. A typed message puts **fields** there. The schema is `TARE_GUARD_TYPES` in
[`src/ledger.ts`](src/ledger.ts):

| field | carries |
|---|---|
| `verdict` | `OK` / `WARN` / `BLOCK` |
| `summary` | the one-line headline, verbatim: *"Ce hook prend 689.95 bps a ta taille, mesure au bloc 50614000. Continuer ?"* |
| `swaps[]` | one `TareSwap` per v4 leg found in the calldata |
| `swaps[].hook` | the hook, declared `address` rather than a string, so the renderer gets a typed address |
| `swaps[].poolId` | `bytes32`, the same derivation as `engine/tare/poolid.py` |
| `swaps[].take` | `"689.95 bps"` — or `"non mesure — ce n'est pas zero"`, never `0.00` |
| `swaps[].label` | the label, with its reason |
| `swaps[].size` | the size the calldata fixes, or the fact that it fixes none (`OPEN_DELTA`) |
| `swaps[].direction` | `0->1` / `1->0` |
| `dataset` | measurement / hook / pool counts, chain, engine version, stub hash — read from the table |
| `measuredAtBlock` | `uint256`, the block the numbers were measured at |
| `freshness` | how far behind the chain the table is, or that the caller did not say |
| `warnings` | half-read calldata, router not on the list, stale table — or `"aucun"` |
| `promptDigest` | `bytes32`, `keccak256` of the full `renderPrompt()` text, replay command included |

`promptDigest` is what keeps the long-form evidence inside the signature without putting it on the
screen: the device shows the fields, the signature commits to the fields *and* to the sentence and
`measure_one.py` command that produced them.

The EIP-712 domain declares `name`, `version` and `chainId` and **no `verifyingContract`** — no
contract verifies this signature, and naming one would imply a reach it does not have.

### What the signature attests

`decision.attestation` is `r || s || v`, 65 bytes, exactly as the device returned them (`v` is
**not** normalised — deciding between 0/1 and 27/28 is an interpretation, and silent interpretations
are what this project exists to complain about).

It attests to one thing: **this device displayed these fields and a human pressed approve.** It does
not attest that the bps figure is correct, that the hook still behaves that way, that the
transaction was broadcast, or that the human read what was on the screen.

### No Nano S fallback, on purpose

`hw-app-eth` offers `signEIP712HashedMessage` for devices that cannot render full typed data. It
shows two hashes. Two hashes are precisely the blob this file exists to avoid, so there is no
fallback: on a device that cannot display the fields, the guard **refuses**. A guard that fails to
"yes" guards nothing, and a guard that fails to "sign this hash" guards no better.

### Every failure path answers no

| what happens | `approved` | `reason` |
|---|---|---|
| no transport wired | `false` | `ledger_non_cable:transport_absent` |
| `navigator.hid` absent (Node, Firefox, Safari, insecure context) | `false` | `ledger_en_erreur:webhid_indisponible…` |
| anything thrown while opening or signing | `false` | `ledger_en_erreur:<the error's own message>` |
| human rejects on the device (`0x6985`) | `false` | `appareil_a_refuse` |
| device returns something that is not a signature | `false` | `ledger_en_erreur:signature_illisible…` |
| called with text but no report | `false` | `ledger_en_erreur:ledger_sans_rapport…` |

The device is closed in a `finally`, and a failing `close()` never flips a decision that was already
taken. The catch-all row covers the real causes a user hits — device locked, Ethereum app not open,
cable pulled, device too old for full typed data — but the fake device raises a generic `Error`:
**none of those real causes has been produced**, only the code path they share.

### Cost to everyone who does not own a Ledger: none

`@ledgerhq/hw-transport-webhid` and `@ledgerhq/hw-app-eth` are loaded by **dynamic `import()`**,
inside `openWebHidDevice()`, and nowhere else. Measured with esbuild on 2026-09-05:

- bundling `src/index.ts` (`--format=esm --splitting`) puts the Ledger code in lazily loaded chunks
  — `Eth-*.js` 630,022 B, `TransportWebHID-*.js` 57,122 B, shared chunk 65,566 B — and the entry
  chunk `index.js` (255,244 B) contains **zero** occurrences of `ledgerhq`;
- re-running the `build:extension` esbuild command produces an `extension/inject.js` **byte-identical**
  to the committed one (254,793 B), with zero occurrences of `ledgerhq`.

There is a second, harder reason for the dynamic import: the two packages' ESM builds use
extension-less relative imports, so **Node's own ESM resolver cannot load them**
(`Cannot find module …/lib-es/errors imported from …/lib-es/Eth.js`). A top-level import would break
every server-side `import "@tare/guard"`, Ledger or no Ledger. Bundlers (esbuild, Vite) resolve them
fine; `require()` works too.

### Installed versions

`@ledgerhq/hw-transport-webhid@6.36.0` and `@ledgerhq/hw-app-eth@7.8.16` — both checked with
`npm view <pkg> version` on 2026-09-05 rather than assumed, and both `latest` on that date.

---

## What has never been run

**The Ledger path has never been executed against a physical device, and never against Speculos.**
It is verified against a fake device only ([`test/ledger.test.ts`](test/ledger.test.ts)). Nobody has
seen these fields on a real screen. That is limitation §11 in
[`docs/LIMITS.md`](../../docs/LIMITS.md), and it is written there for the same reason it is written
here: hiding it would cost more than admitting it.

Specifically unverified:

- how the Ledger Ethereum app renders these field names and the `TareSwap[]` array on the device
  screen, including whether long values (`dataset` carries the 66-character stub hash) are
  truncated or paged;
- whether a report with zero findings (empty `swaps` array) is accepted by the device's EIP-712
  implementation;
- the value of `v` a real device returns for `signEIP712Message`;
- the `openConnected()` → `request()` sequence against real browser WebHID permission state;
- no **ERC-7730** clear-signing descriptor has been written or submitted to Ledger's registry, so
  the display is whatever the generic EIP-712 renderer does with these field names.

## Tests

```bash
cd packages/guard && npm install && npm run typecheck && npm test
```

`test/ledger.test.ts` covers the typed-data builder field by field, the signature encoder, and the
four transport outcomes — confirm, human rejection, device failure, no transport — asserting
`approved === false` on every failing path. Two of its tests import the real `@ledgerhq` packages,
without touching a device, purely to check that the methods `ledger.ts` depends on still exist under
the installed versions; they carry an explicit 60 s timeout because Vite has ~700 KB of third-party
code to transform for them.

One flake worth naming, because it will be met: `test/encode.test.ts` ("retrouve la PoolKey et le
pool_id des 199 pools du jeu") re-derives 199 pool ids with the pure-TypeScript keccak and takes
~1.5 s on an idle machine. Against vitest's 5 s default it times out under load. Measured on
2026-09-05 with five sweeps running on the same box: **3 of 5 runs of the pre-existing 71-test suite
failed that way, and 3 of 5 runs of the full 103-test suite passed** — so the flake predates the
Ledger work and is not caused by it. It is left alone here rather than silently retimed, because it
is not this changeset's test.
