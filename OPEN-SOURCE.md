# One misleading sentence on a hardware wallet

This file exists because of a single screen, and the thing worth reporting upstream turned out to
be the opposite of what we first thought. Everything below was observed against Ledger's own
emulator, and the commands that reproduce it are at the bottom.

## What we were doing

TARE's browser guard stops a Uniswap v4 swap before you sign and states what the pool's hook takes.
The last mile is a hardware confirmation: the numbers must appear **on the device**, because a
screen that malware can repaint is not a confirmation.

So the guard builds an EIP-712 message whose fields are its own findings — `hook`, `poolId`,
`take`, `label`, `size`, `direction`, `measuredAtBlock`, `dataset`, `freshness`, `warnings`,
`promptDigest` — under the primary type `TareGuardApproval`, and asks the device to display it.

## What happens

Run against **Speculos** with the official **Ethereum app 1.22.3** for Nano X, the device shows
every field and signs. Sixteen screens, verbatim, in
[`docs/ledger/ECRANS.md`](docs/ledger/ECRANS.md):

```
take 689.95 bps
label MEASURED
size 100000000000000 en entree
direction 1->0
measuredAtBlock 50614000
```

**It works.** That is the headline, and we were wrong to assume otherwise before testing.

## The gap

It works **only** when the app setting **"Raw messages — Displays raw content of EIP712 messages"**
is enabled. That setting is off by default, which is a defensible choice.

What is not defensible is the message a developer meets first. Request the filtered display path
and the screen reads:

> **Blind signing must be enabled in settings**

That sentence names the wrong setting.

- **Blind signing** makes the device sign a **hash**. The user sees no fields. For a security tool
  whose entire purpose is that a human reads `take 689.95 bps` before approving, enabling it
  destroys the feature it appears to fix.
- **Raw messages** is what produces the sixteen readable screens. Nothing in the error mentions it.

A developer who follows the instruction literally enables blind signing, gets a hash on screen,
and concludes that clear signing is unavailable for custom schemas. It is available. The error sent
them to the wrong switch.

We spent an evening on this. The message cost us the time, and it will cost it to everyone who
builds a custom EIP-712 flow, which is every security tool that wants its numbers on the device
rather than in the page.

## What we would file

**One issue, small and specific:** when an EIP-712 struct cannot be rendered through the filtered
path, say so, and name **Raw messages** as the setting that renders it raw. `app-ethereum` for the
screen text; `ledgerjs` for surfacing the cause instead of a bare `0x6a80` status word.

That is the whole contribution. It is not a feature request and not a redesign — it is a sentence
that currently points the wrong way.

**NOT VERIFIED, and deliberately not claimed here:** whether registering EIP-712 filter descriptors
for `TareGuardApproval` would make the filtered path work without any setting. We have not walked
Ledger's submission process, so we do not describe it.

## What Speculos itself lacked

Nothing. It emulated the app faithfully, exposed the screens over HTTP, and let us drive the buttons
to reach the setting. It is the reason any of this can be stated rather than guessed, and it is why
"never tested against hardware" stopped being an acceptable answer.

The one rough edge is that reaching an app setting means walking a menu blind — press right, read
the screen, decide. A named endpoint for "set this app setting" would make testing these paths
scriptable. That is a convenience, not a defect, and we would not file it as one.

## Reproduce it

```bash
curl -sL https://github.com/LedgerHQ/app-ethereum/releases/download/1.22.3/app-1.22.3-nanox.elf \
  -o eth.elf
docker run -d --name speculos -p 5010:5000 -v "$PWD":/apps \
  ghcr.io/ledgerhq/speculos:latest --model nanox --display headless --api-port 5000 /apps/eth.elf

# Settings -> Raw messages -> Enabled  (press right/both, read /events between presses)
curl -s "http://127.0.0.1:5010/events?currentscreenonly=true"
curl -sX POST http://127.0.0.1:5010/button/right -d '{"action":"press-and-release"}'

cd packages/guard && npm i --no-save @ledgerhq/hw-transport-node-speculos-http
# then: buildGuardTypedData(report) -> eth.signEIP712Message(path, typed, false)
```

`fullImplem: false` matters. `true` asks for the filtered path, which is the one that has no
descriptors for our schema and produces the misleading message.

## Repositories this concerns

| repo | what would change |
|---|---|
| [`LedgerHQ/app-ethereum`](https://github.com/LedgerHQ/app-ethereum) | the sentence: name **Raw messages**, not blind signing |
| [`LedgerHQ/ledgerjs`](https://github.com/LedgerHQ/ledgerjs) | surface that cause through `hw-app-eth` rather than a bare `0x6a80` |
| [`LedgerHQ/speculos`](https://github.com/LedgerHQ/speculos) | nothing to fix — optionally, an endpoint to set an app setting without walking the menu |

Nothing is filed yet. This is the write-up that would go with it.
