# What we could not do, and where the fix belongs upstream

This file exists because of one screen. Everything below was observed, not read about, and the
commands that reproduce it are at the bottom.

## The observation

TARE's browser guard stops a Uniswap v4 swap before you sign it and states what the pool's hook
takes. The last mile is a hardware confirmation: the numbers should appear **on the device**, not
only in the page, because a screen the malware controls is not a confirmation.

So the guard builds an EIP-712 message whose fields are the guard's own findings —
`verdict`, `summary`, `swaps`, `dataset`, `measuredAtBlock`, `freshness`, `warnings`,
`promptDigest` — under the primary type `TareGuardApproval`, and asks the device to display it.

We ran it against **Speculos**, Ledger's own emulator, running the **official Ethereum app
1.22.3** for Nano X, downloaded from `LedgerHQ/app-ethereum` releases. The transport connects. The
device answers `getAddress` with `0xDad77910DbDFdE764fC21FCD4E74D71bBACA6D8D`. The typed data
reaches it.

And the screen says, word for word:

> **Blind signing must be enabled in settings**

Status word `0x6a80` — *invalid data received*.

## What that means

The Ethereum app renders an arbitrary EIP-712 struct **field by field** only when it holds
**filter descriptors** for that schema: the clear-signing metadata that says which fields to show,
under what label, formatted how. Ledger curates those descriptors. `TareGuardApproval` is ours,
Ledger has never seen it, so the app offers the only thing it can — signing a hash blind.

We refuse that, and the refusal is the point. A blind signature attests that *a hash* was
approved. It does not attest that a human read **"this hook takes 689.95 bps"**. Our approver has
no `signEIP712HashedMessage` fallback ([`packages/guard/src/ledger.ts:20`](packages/guard/src/ledger.ts))
precisely so that this path ends in a refusal rather than in a signature that means less than it
appears to.

**So the guard's hardware leg stops one step short, and the step is not ours to take alone.**

## Where the fix belongs

Three places, in increasing order of how much they would help everyone rather than only us.

**1. Register descriptors for our own schema.** The normal path: submit the EIP-712 filters for
`TareGuardApproval` to Ledger, as any dApp does. It fixes TARE and nothing else. **NOT VERIFIED:**
we have not walked this process, so we cannot state its steps or its latency — only that it exists
and that the app's behaviour implies it.

**2. Make the failure legible.** Today a developer meets `0x6a80` and a screen telling the *user*
to change a setting. Neither says *"this schema has no filters; here is where to submit them"*. A
clearer error — in `app-ethereum`, or surfaced by `@ledgerhq/hw-app-eth` — would save every team
that hits this the hours it cost us. That is a small, well-bounded contribution to a repository
that accepts them.

**3. The general problem, which is the interesting one.** Clear signing today is a **curated
allowlist**: a message is displayed if someone registered it in advance. That works for the long
tail of known contracts and fails for exactly the case a security tool needs — a schema authored
for one purpose, by one project, that no registry will ever contain. A *generic* renderer, showing
field names and values with an explicit "unverified schema" banner, would be strictly better than
blind signing for that case. It is a design question, not a patch, and it is worth raising as an
issue before writing code.

## Why we published this instead of quietly cutting the feature

The honest options were to drop the Ledger leg, to claim it works, or to say exactly where it
stops. The first hides a real limitation of the ecosystem; the second is the kind of statement this
whole project exists to make impossible. The third costs a paragraph and tells the next team what
we learned.

[`docs/LIMITS.md`](docs/LIMITS.md) §11 carries the same finding in the project's own limits, next
to the fifteen other things TARE cannot do.

## Reproduce it

```bash
curl -sL https://github.com/LedgerHQ/app-ethereum/releases/download/1.22.3/app-1.22.3-nanox.elf \
  -o eth.elf
docker run -d --name speculos -p 5010:5000 -v "$PWD":/apps \
  ghcr.io/ledgerhq/speculos:latest --model nanox --display headless --api-port 5000 /apps/eth.elf
cd packages/guard && npm i --no-save @ledgerhq/hw-transport-node-speculos-http
# then build a GuardReport, call buildGuardTypedData(), and signEIP712Message(path, typed, true)
curl -s http://127.0.0.1:5010/events   # the device's own words
```

## The repositories this concerns

| repo | what it would change |
|---|---|
| [`LedgerHQ/app-ethereum`](https://github.com/LedgerHQ/app-ethereum) | the error a developer sees when a schema has no filters |
| [`LedgerHQ/ledgerjs`](https://github.com/LedgerHQ/ledgerjs) | surfacing that cause through `hw-app-eth` instead of a bare `0x6a80` |
| [`LedgerHQ/speculos`](https://github.com/LedgerHQ/speculos) | nothing — it did its job, and it is the reason we can state any of this |

Nothing here is filed yet. This document is the write-up that would go with it.
