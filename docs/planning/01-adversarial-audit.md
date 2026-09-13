# 27 — ADVERSARIAL AUDIT: what is FALSE in documents 23 and 24

> A technical prosecutor attacked Assay. **He was right on the essentials.** I re-checked every
> accusation myself before writing this document. The figures below are mine, not his.
>
> This is the second time I have built an angle on an unchecked figure (the first:
> `08-CORRECTION-AT2.md`). The difference, this time, is that the error was found on 28 August and
> not on 11 September.

---

## 🔴 FALSE #1 — the "gridpulse" example is manufactured by my own code

It is in `24-NOYAU-TECHNIQUE.md` §4, in `23-LE-PROJET.md` §3.5 ter, **and in the draft of
`howItsMade`**, where it serves as the second proof: *"an agent following the registry would build a
transaction on the wrong chain"*.

**Live check of 28/08:**

```
DEMANDED  scheme=exact network=base          asset=0x833589fC…2913  amount=10000
DECLARED  scheme=exact network=eip155:8453   asset=0x833589fC…2913  amount=10000   ← 1st offer
```

**Same chain, same token, same amount.** Only the spelling of the network differs.
This is not a divergence, it is a CAIP-2 alias.

Why my dossier displayed Algorand: `tools/x402full.py` line 34 stores `sorted(adv)[:3]`.
gridpulse declares **13 offers**; alphabetical sorting puts `algorand:…` first and **the Base
line disappears from the proof**. The truncation did not hide the example: it **manufactured** it.

---

## 🔴 FALSE #2 — my comparator counts network aliases as divergences

`norm()` compares `network` as a raw string. But the registry contains both spellings:

| short spelling | occurrences | CAIP-2 spelling | occurrences |
|---|---|---|---|
| `base` | **303** | `eip155:8453` | 16,630 |
| `solana` | 18 | `solana:5eykt4Us…` | 5,352 |
| `algorand:…73ktiC1qzkkit8=` | **160** | `algorand:…73k` | 877 |
| `base-sepolia` | 13 | `eip155:84532` | 144 |
| `polygon` / `arbitrum` | 1 / 1 | `eip155:137` / `eip155:42161` | 1,861 / 1,752 |

The prosecutor, replaying with an alias table and a numeric comparison of amounts, gets
**882 of the 2,626 that become COMPLIANT again**, plus **441** where the server offers a *superset* of
what is declared (the agent's plan holds) — that is **1,323 / 2,626 = 50.4% of the headline figure
evaporating**. I could not replay the full calculation myself: `research/x402-conform.json` only
stores 3 offers per resource (see FALSE #4), so **the recalculation requires re-probing**. That is the
first task to do, and the 40% figure must not be reused before then.

---

## 🔴 FALSE #3 — the amount comparison has no unit

`tools/x402full.py` line 11: `str(a.get("maxAmountRequired") or a.get("amount") or "")`.
A comparison of **strings**, never a read of `decimals()`.

**881 offers carry an amount in human decimal units**: `'0.1'` ×266, `'0.15'` ×145,
`'0.08'` ×133, `'0.25'` ×56, `'0.2'` ×54, `'0.05'` ×51. gridpulse itself declares `xrpl:0 / RLUSD / 0.01`.

Consequence: the biggest "overcharges" in the corpus are absurd orders of magnitude
(×3.3·10¹⁴ at `aegis-ai.xyz`) that are decimals compared against base units, not abuses.

Of the 1,055 "amount divergences": **862 (82%) have the same maximum on both sides**,
106 see the server ask for **less**, and **only 87 see it ask for more**.
My example `api.loyalspark.online` (declared 5,000, demanded 1,000) is **a price cut**
presented as a defect.

**What survives:** `api.hyperextend.xyz/v1/liquidations/BTC` — declared 11,000, demanded 111,000,
and the ×10 ratio is consistent on both rails (`0.011 → 0.111` on hyperliquid). That one holds.

---

## 🔴 FALSE #4 — the stored proof is cut short for a third of the flagged cases

`x402full.py` line 34: `o["declare"]=sorted(adv)[:3]; o["demande"]=sorted(real)[:3]`.

**910 of the 2,626 DIVERGENT/PARTIAL (34.7%) declare more than 3 offers.**
Actual distribution: 767 resources declare **13** offers, 180 declare **14**.
For all of those, the dossier's proof is incomplete and can flip the verdict, as it did for gridpulse.

Aggravating factor: **no timestamp anywhere**. The keys of `research/x402-live.json` are
`['accepts_n','host','parsed','resource','status','x402Version']` — no `observed_at`. And every
run **overwrites** the file. The product promises "observed on …" and "a resource that dies
shows its date of death": none of that exists.

---

## 🔴 FALSE #5 — the `howItsMade` lies about the tech stack

It announces *"Python probe workers (asyncio/ThreadPoolExecutor, 48–64 concurrent)"*.
**`asyncio` appears in none of the scripts.** `grep -n "asyncio" tools/x402*.py` → no occurrence.
It announces Postgres: there are only `json.dump` calls.

---

## 🔴 FALSE #6 — "0 Hedera resources" is not a discovery

It is **the sponsor's published premise**, word for word in its own brief
(`tools/raw-prizes-ethonline2026.txt`):

> "Hedera is built for this, but **x402 on Hedera is still short of one thing: actual services you
> can pay for.**"

Presenting it as "the fact that makes the headline" to a Hedera judge is the worst possible angle:
we are reciting their own text back to them. The fact remains true and useful as *context*, never as a *finding*.

---

## 🔴 FALSE #7 — TLS disabled in all five probes

`ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE` in
`tools/x402live.py`, `x402full.py`, `x402post.py`, `x402conform.py`, `x402recheck.py`.

An instrument whose entire value is *"I tell you what the server really answered"*
collects its evidence over an unauthenticated channel — and publicly names 264 hosts on that basis.
It is indefensible and it is trivial to fix.

---

## 🔴 FALSE #8 — the HONORED level does not exist, and it is the sponsor's hard requirement

None of the scripts contains a signature, an `X-PAYMENT` header, EIP-3009 in a payment path,
or a facilitator call. Yet the Hedera brief **requires**:

> "Host a live x402-gated service on Hedera testnet or mainnet, settled through the Blocky402 facilitator."
> "Build a platform or agent that consumes that service and **completes at least one real paid request end to end**."

And HONORED is also the only line of separation claimed against x402scan (`23-LE-PROJET.md` §3.5 bis).
The three levels that do exist are: "the line is in a JSON", "a `urlopen` answered", and
the faulty string equality of FALSE #2.

---

## ✅ WHAT SURVIVES THE AUDIT, AND IS SOLID

1. **The 5,109 `SANS_ACCEPTS` (43% of the 402s).** Independent of the comparator: it is the absence of a
   usable `accepts` array, not a comparison. **To be re-checked anyway**: my test read
   the whole body, but the classification deserves to be replayed cleanly.
2. **`api.hyperextend.xyz`: 11,000 declared, 111,000 demanded.** Re-probed, consistent on two rails.
3. **🏆 THE EIP-712 LAYER — intact, and it is what carries everything.**
   It depends neither on network aliases, nor on amount units, nor on truncation: it compares
   `extra.name`/`extra.version` against `name()`/`version()` read on-chain, and **it is demonstrated by
   experiment** on a Base fork (`tools/preuve-eip712.sh`, doc 24 §9):
   correct domain → payment accepted; `GatewayWalletBatched`/`1`, declared by **963 resources** →
   `FiatTokenV2: invalid signature`, no funds moved.
   My method was validated against a transaction **actually accepted on-chain**
   (`0x59d4a95e…`, block 50,539,359) before any conclusion.
4. **The EIP-7702 discovery**: a delegated payer switches verification over to EIP-1271;
   `0x70997970…` carries `0xef0100b2c460…` on Base. Verified.
5. **The raw inventory**: 14,833 resources, 1,622 hosts, 9 schemes, 43 networks, top 1% = 76% of calls.

---

## THE CONCLUSION THAT MATTERS

**The project does not die — its thesis changes layer.**

The "declared vs demanded" layer (HTTP, character strings) is **fragile, half false, and it
was the scraper**. The "cryptographic satisfiability" layer (EIP-712, EIP-3009, EIP-7702,
proxies) is **intact, demonstrated by experiment, and it is the one worth 5/5 in Technicality**.

> **The headline is no longer "the registry announces one price, the server demands another".**
> **It becomes: "963 x402 services declare a signature domain that makes their own
> payment impossible — and here is the fork where the contract rejects them."**

It is narrower, it is harder, and it is true.

### What must be done before writing one more line

1. Re-probe **storing the complete offers + a timestamp**, with TLS **verified**.
2. Recompute "declared vs demanded" with a **CAIP-2 alias table** and a **numeric comparison after
   reading `decimals()`**. Publish the new figure, whatever it is.
3. **Build the HONORED level** — it is the sponsor's requirement and the only real separation from x402scan.
4. Remove `asyncio`, Postgres, gridpulse and loyalspark from the `howItsMade`.
5. Never again present "0 Hedera resources" as a finding.

---

# 🔴 FALSE #9 — THE EIP-712 PROOF TOO. The pillar I thought was intact.

**I had ignored a field.** The 963 accepts that declare `extra.name="GatewayWalletBatched"`
also declare, in the same object:

```json
"extra": { "name": "GatewayWalletBatched",
           "verifyingContract": "0x77777777dcc4d5a8b6e418fd04d8997ef11000ee",
           "version": "1" }
```

**961 of the 963 carry this `verifyingContract`** (the other 2 point to `0x0077777d7eba…`).
The EIP-712 domain is therefore **not** the token's: it is the domain of **Circle's Gateway wallet**,
declared explicitly by the seller. The sellers are not misconfigured — **I am the one who
did not read their declaration in full.**

My fork experiment (`24-NOYAU-TECHNIQUE.md` §9) signed with USDC as the `verifyingContract`.
It failed for the only reason it **had** to fail: the seller never claimed that
the token was the verifying contract. The experiment was sound; **the hypothesis it tested
was mine, not the registry's.**

> **Consequence: "963 services declare a signature domain that makes their payment
> impossible" is FALSE. The project's headline no longer exists.**

What remains true of the layer: the reconstruction method (validated against the real transaction
`0x59d4a95e…`), the EIP-7702 discovery, and the fact that a satisfiability checker **must read
`extra.verifyingContract`** — which nobody, myself included, was doing.

### A point of fairness towards the registry

The prosecutor claimed that the 963 are "94.8% a single operator (`theaslangroupllc.com`)".
**That is false too, and I measured it:** 80 distinct hosts, the top one
(`www.watchevelive.com`) weighs only **4.6%**, `theaslangroupllc.com` cumulatively ~10%.
I do not charge the registry with a defect it does not have.

---

# BOTTOM LINE: ASSAY'S THREE PILLARS HAVE FALLEN

| Pillar | Fate |
|---|---|
| "40% of requirements diverge" | ✗ artefact of CAIP-2 aliases + amounts without units |
| "gridpulse points to the wrong chain" | ✗ manufactured by my `[:3]` truncation |
| "963 false EIP-712 domains" | ✗ I ignored `extra.verifyingContract` |

**Assay is dead as a thesis.** What survives is not a product, it is a lesson in method and
a corpus of 14,833 resources.

## What was measured and HOLDS, among the alternatives

| Project | Technical | Selling | What is verified |
|---|---|---|---|
| **Hookproof** (Uniswap, brief **published**) | 4/10 as it stands | **7/10** | Census **redone blind**: 2,052 Base hooks over 7 d (me: 2,008), 157 registry entries (**exact**), intersection 27 (**exact**), Sourcify 2/80. Nothing is bluffed. What does not hold is everything that comes *after* the enumeration. |
| **Meter991** (Hedera, brief **published**) | 4/10 | 6/10 | HIP-991 active and usable, a real topic with 26 billed messages. But a **fixed per-message** fee: consensus counts nothing, it collects. And **$0.05/message = 62× a normal HCS, 50× the price of an entire inference.** |
| **Touchstone** (EIP-7702, sponsor not published) | 5/5 claimed | — | Census **contradicted**: the agent announces 4.72% delegated accounts on Base; my independent measurement over 12 blocks / 1,093 unique senders gives **0.09%** (only 1). On Ethereum we agree (5.86% vs 6.24%). **Base is precisely the chain that carries 16,630 of the accepts.** Gap NOT RESOLVED. |

## The two most solid replacement cores to come out of the exercise

1. **Hookproof → THE COUNTERFACTUAL.** Throw away the census and the risk labels. Keep
   only one thing: **a hook's real take, in basis points, measured.** On an anvil fork at a
   pinned block, quote the real pool via `V4Quoter`, compare against the same pool without a hook. Free filter:
   `StateView.getLiquidity` (~250 candidate hooks on Base, keep 40 to 60). It is not in
   the original entry, it is new, and it is hard.
2. **Meter991 → INVERT THE SUBJECT.** Make the $0.05 the subject and not the blind spot:
   *"Hedera shipped a primitive where the network itself collects. Eighteen months later, nobody
   uses it — 0 out of 12,000 recent HCS submissions, 1 topic out of 2,984 testnet creations, 0 out of 64
   on mainnet. Here is why, measured, and here is the exact threshold above which it becomes the
   cheapest rail again."*
