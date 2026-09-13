# Agent identity — HCS-14

TARE's payment trail already lives on an HCS topic: every batch of measurements deposits its
digest, its unit count and its settlement hash there. One thing was missing — **who** produced
those measurements. "The account `0.0.10367920`" answers *who paid*, not *which service*.

[HCS-14](https://hol.org/docs/standards/hcs-14/) gives that answer in a form a third party can
**recompute** instead of taking our word for it: an identifier derived from the agent's fields,
not assigned by a directory.

## The identifier, and it is published

```
uaid:aid:9gmr4c6opC3zeSWSZzv23pjXkfbTvEeRHKdXkgMJqX7FG9133ocwFuCXL6uwBWiTHY;registry=self;proto=mcp;nativeId=hedera:testnet:0.0.10367920;uid=0
```

| | |
|---|---|
| Announcement | message **#12** of topic **`0.0.10371106`** (Hedera testnet) |
| Transaction | `0.0.10367920@1788963789.956383767` |
| Consensus timestamp | `1788963795.977788104` |
| Observed cost | **433,840 tinybar** (353 bytes), i.e. ~0.0043 HBAR |
| State | `ANNOUNCED` — the mirror node returns the message **byte for byte** |
| HashScan | <https://hashscan.io/testnet/topic/0.0.10371106> |

The published message carries the identifier **and the six fields that produced it**, so that
the reader can redo the computation:

```json
{"v":"tare.agent.v1",
 "uaid":"uaid:aid:9gmr4c6opC3zeSWSZzv23pjXkfbTvEeRHKdXkgMJqX7FG9133ocwFuCXL6uwBWiTHY;registry=self;proto=mcp;nativeId=hedera:testnet:0.0.10367920;uid=0",
 "canonical":{"name":"TARE","nativeId":"hedera:testnet:0.0.10367920","protocol":"mcp",
              "registry":"self","skills":[10,17,21,33,39],"version":"0.1.0"},
 "ts":"2026-09-09T14:23:15.547Z"}
```

It is the **same topic** as the payment trail, and that is deliberate: the identity's `nativeId`
is the account that appears as `payer` in the rows of the log. The two cross-check each other
without anyone having to link them by hand.

## The six fields, and the justification for each

| field | value | why |
|---|---|---|
| `registry` | `self` | The standard: *"for self-sovereign agents lacking a specific registry, the registry field shall be set to `self`"*. TARE is listed in **no** agent directory; writing `hol` or `hedera` would claim a listing that does not exist |
| `name` | `TARE` | |
| `version` | `0.1.0` | the one in `apps/api/package.json` — a test compares it against that, so it does not drift silently |
| `protocol` | `mcp` | we expose a real MCP server (`apps/mcp`, four tools, 33 tests). **Not** `hcs-10`: we do not implement that protocol |
| `nativeId` | `hedera:testnet:0.0.10367920` | the account that pays for the anchors and created the topic |
| `skills` | `[10, 17, 21, 33, 39]` | see below |

Each code corresponds to something that **runs** in this repository:

| | | |
|---|---|---|
| 10 | Transaction Analytics | the counterfactual: 125,072 swap measurements on Base |
| 17 | API Integration | `apps/api`, x402 on Hedera, per-measurement toll |
| 21 | Tool Provider | `apps/mcp`, four tools exposed to an agent |
| 33 | Blockchain Integration | pinned Base fork, `anvil_setCode`, on-chain reads |
| 39 | Trust Attestation | `contracts/`: 99 hooks and their extraction, readable on-chain |

And **deliberately not claimed**, tempting though they were:

| | | |
|---|---|---|
| 11 | Smart Contract Audit | we read verified source, we do not audit |
| 34 | Consensus Participation | we **write** to HCS, we do not take part in consensus |
| 7 | Knowledge Retrieval | the assistant searches, but it produces no number |

## What the standard does not give, and what has to be said

1. **No complete test vector.** The specification publishes two examples **with their inputs
   but without their digests**. There is therefore no reference result to compare against.
   Our tests validate base58 against the standard Bitcoin vectors **and** against
   `bs58@4.0.1` (an independent implementation, present in
   `packages/keyring/node_modules`), and canonicalisation rule by rule against the
   pseudo-code. What they cannot validate is that our reading is the one another
   implementer would make. **That is a real limitation**, and it is written into the
   response of `GET /agent`, not only here.
2. **The text contradicts itself.** Its "canonical JSON" example shows the keys in the order
   `skills, name, nativeId, protocol, registry, version` — so **not sorted**. Its pseudo-code
   does `JSON.stringify(canonical, Object.keys(canonical).sort())`, which **does sort**. We
   follow the pseudo-code, because that is the one that is executable.
3. **The base58 variant is not named.** We take the Bitcoin alphabet, the only one that
   "Base58" designates without a qualifier.

## The traps held down by tests

- **Sort the skills as numbers, not as strings.** `[0, 17, 9].sort()` returns `[0, 17, 9]`
  and not `[0, 9, 17]`: two agents with the same skills would have two identities.
- **The leading zeros of base58.** Going through a `BigInt` would swallow them, and two
  different digests would read the same. The implementation does the division by hand.
- **Routing parameters do not enter the digest.** The standard is explicit:
  *"Communication details are NOT included in the hash"*. Changing `uid` changes the final
  string but **not** the hash.
- **An empty required field throws** instead of being replaced by emptiness.
- **An identity already announced is never republished** — every message costs HBAR, and a
  trail in which the same announcement appears twice is no longer a trail. If the read of the
  topic is incomplete, `publish` **stops** rather than risk a permanent duplicate.

## Routes

```
GET /agent        the identity, its method, and what it takes to recompute it without us
GET /agent/hcs    the announcements as they are READ on the topic
                  (404 NOT_ANNOUNCED if the topic carries none,
                   503 NOT_READABLE if the mirror's pagination breaks off)
```

## Commands

```bash
cd apps/api
npx vitest run test/agent.test.ts     # 28 tests
npx tsx src/agent/cli.ts show         # computes the identifier, without the network
npx tsx src/agent/cli.ts read         # the announcements already on the topic
npx tsx src/agent/cli.ts publish      # publishes, then reads back on the mirror node
```
