# The field the registry does not have

Uniswap's official hook registry describes a hook with **fourteen permission booleans, four
property booleans, an enum and a chain id**. Not one of those fields is a quantity. Two hooks it
describes identically can take nothing and eleven percent, and a consumer choosing between them
has nothing to go on. That is the problem this project opened with.

Measuring the quantity cannot happen on-chain. A counterfactual needs a fork: the hook's bytecode
is replaced by an inert stub and the same swap is quoted twice. No mainnet can do that. But the
**result** can live on a chain, where a router, a wallet or another contract can read it.

## What is deployed

| | |
|---|---|
| contract | [`0x67A564B64393A5f690A21a26391dEd1D012b297e`](https://hashscan.io/testnet/contract/0x67A564B64393A5f690A21a26391dEd1D012b297e) |
| network | Hedera testnet (EVM, chain id 296) |
| deploy tx | `0xee0afe543dae780eca19d777c2cba2a3d4db98ea8695c46e29b94465126c4564` |
| attester | `0xe7fe2A06321376F14996189E859CA747A8c048ce` (Hedera account `0.0.10367920`) |
| source | [`contracts/src/HookRateAttestations.sol`](../contracts/src/HookRateAttestations.sol) |

Each record carries the hook, the chain it was measured on, the pinned block, the median and the
maximum in basis points **scaled by 10,000** — so `99.9942 bps` survives as `999942`, because the
concordance work depends on those four decimals — the number of `MEASURED` rows, the number that
produced no value, the pool count, the **sha256 of the corpus**, the **keccak of the 89-byte stub**,
the attester and the engine version.

Read one back:

```bash
cast call 0x67A564B64393A5f690A21a26391dEd1D012b297e \
  "latest(address,address)((address,uint32,uint64,uint64,uint64,uint32,uint32,uint32,bytes32,bytes32,address,uint64,string))" \
  0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc \
  0xe7fe2A06321376F14996189E859CA747A8c048ce \
  --rpc-url https://testnet.hashio.io/api
```

## What it is not

**It is not an oracle and it is not authoritative.** Every record is an attestation: a named
address states that at a named block, on a corpus whose digest is stored, it measured these
figures. Anyone can attest, every write emits an event, and nothing is revised in silence — the
earlier record stays in the log. A reader who trusts a figure here trusts the attester, and the
contract makes that dependency explicit instead of hiding it behind the word "oracle".

## What it refuses

**A hook with no measurement is absent, never present at zero.** `nMeasured == 0` reverts. This is
the project's founding rule in its on-chain form: a read that did not happen is never a zero. Of
the hooks in the corpus, **13 have no `MEASURED` row at all** — every attempt returned
`NOT_QUOTABLE` or `NOT_MEASURABLE`. They are not written. Writing them at zero would tell a router
"this one takes nothing", which is the precise lie this project exists to prevent, carved into
state nobody could correct.

`latest()` **reverts** rather than returning a zero-filled struct, for the same reason: a caller
reading zeros cannot tell *measured zero* from *never measured*. `hasAttestation()` answers that
question with a boolean and never reverts.

It also refuses a figure with no corpus digest and a figure with no stub hash. A number that
cannot be replayed is an opinion, and a number without its method is worse than none.

## Reproduce it

```bash
cd engine && python3 -m tare.attest --plan          # what would be written, and what is excluded
cd contracts && forge test                          # ten tests, five of them on what it refuses
```

`engine/tare/attest.py` derives every figure from the published corpus at call time. Nothing in
this document or in the contract is typed by hand.
