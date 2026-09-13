# 22 — THE ASYNC FINALIST PROFILE (the right sample, at last)

> **Major correction.** Docs 12, 18, 20 and 21 reasoned on the **20 in-person finalists**
> (Cannes, New York). ETHOnline is **async**. The devil's advocate found the Finalist prize marker
> in the listings (sponsor uuid `xdat5`, 20/20 precision), which unlocks **27 async finalists**
> never analysed — Open Agents 7 · HackMoney 2026 10 · ETHOnline 2025 10. Their full entries have
> been retrieved: `research/win-async-finalists.json`.
> **JB's LPLens is one of the 27, and it has the best automatic scores of the set (o8 p8 t9).**

## 1. The 27 async finalists

| Event | Projects |
|---|---|
| **ETHOnline 2025** | CronPay · WannaBet · DeFlow · ChronoVault · EthVaultPQ · Siphon Protocol · SafeSend · Common-Lobbyist · Sippy · OpenPayAI |
| **HackMoney 2026** | AutoPay · Blip Market · PulsePlay · claw2claw · GrimSwap · BorrowBot · Xpack · Oikonomos · router402 · Magnee |
| **Open Agents 2026** | Clan World · Mnemosyne · Aegis402 · DAIO · Slopstock · Common OS · **LPLens** |

## 2. Async ≠ IRL: the measured gaps

| | **Async (27)** | IRL (20) | Reading |
|---|---|---|---|
| `howItsMade` median | **1,764 chars** | 975 | **+81%** — the writing carries the demo |
| several repos | **33%** | 15% | more surface, not less |
| mentions tests | **30%** | 10% | ×3 |
| **live demo URL** | **27/27 (100%)** | 18/20 | **unanimous** |
| payment / subscription / billing | **52%** | 40% | the dominant theme |
| extension · mobile · WhatsApp · mini-app | **37%** | 25% | the accessible surface |
| mainnet | 26% | 20% | |
| MCP | 11% | 5% | |
| **median number of prizes** | **1** | 2 | **the Finalist and nothing else** |

## 3. What this implies, concretely

**a) Async judging is judging on the record alone.** Asynchronous first round: no judge sees you,
asks you a question, or is carried along by your energy. What is left is **your text, your repo and
your URL**. Hence the 1,764 characters of "how it's made": async finalists **write their depth**.
It is a deliverable, not a formality.

**b) The clickable URL is not a bonus, it is the entry ticket.** 27 out of 27. Combined with the
devil's advocate test (27/27 async finalists against 58/80 of the other prize winners, **p = 0.001**),
it is the only statistically established signal in this whole dossier.

**c) Aiming at 3 sponsors is a mistake for the async Finalist.** The median number of prizes is **1**.
Async finalists win the Finalist **alone**. The "3 compounded partner slots" strategy of docs 05 to 20
was optimising the wrong thing.

**d) The winning lexical field is payment and access.** *"Send PYUSD over WhatsApp — no wallet,
no gas, just your number"* (Sippy) · *"Stripe for crypto subscriptions"* (AutoPay) ·
*"Let sites charge AI crawlers"* (OpenPayAI) · *"Installs that finally pay"* (Xpack) ·
*"A payment interceptor, as a browser extension"* (Magnee) · *"One API, several LLMs, real
pay-per-use"* (router402).

## 3 bis. 🔴 The free box LPLens did not tick

**26 of the 27 async finalists have a LIVE demo URL in the "demo" field of their submission.
The single exception is LPLens** — which put `https://github.com/JeanBaptisteDurand/Open_Agent_2026`
there, while **lplens.xyz existed, was running, and is still running**.

The other 26: `magn.ee` · `sippy.lat` · `router402.xyz` · `cronpay.xyz` · `grimswap.com` ·
`autopayprotocol.com` · `blipmarkets.com` · `app.clan-world.com` · `opendaio.com` · `claw2claw.2bb.dev` ·
`borrowbot.kibalabs.com` · `ethvault.qkey.co` · `mnemosyne-protocol.vercel.app` · … all clickable.

LPLens therefore took the Finalist **while violating the only universal characteristic of async
finalists**, offset by the depth of its writing (3,252 characters of `howItsMade`, against a median
of 1,764) and by the best automatic scores of the 27 (o8 p8 t9).

→ **Zero-cost action for ETHOnline 2026: put the live URL in the demo field.** This is not a matter
of form: in the first round, the judge sees only the text, the repo and this field.

## 4. The diagnosis on LPLens, precise at last

LPLens ticks **almost all** of the profile: deployed and live, a very substantial `howItsMade`,
monorepo, acceptance tests, MCP, best automatic scores of the 27. And it **is** a finalist.

What it did not tick: **the accessible surface**. It took a wallet, an existing LP position, and an
understanding of impermanent loss to do anything at all with it. 37% of async finalists can be tried
without installing or connecting anything.

→ **The formula is not "do something other than LPLens". It is "redo LPLens, with a front door that
anyone pushes open in 5 seconds".**

## 5. The errors in this dossier, listed

1. **Docs 12/18/20**: pattern inferred from 20 **100% in-person** finalists for an async event.
2. **Doc 18**: the "borrowed category" filter **predicts nothing** (78% vs 78% in async, Fisher p = 1.000).
3. **Doc 21**: benchmark against ENShell and npmguard — **in-person** finalists. The right reference
   is Sippy, Magnee, router402 and LPLens.
4. **Docs 05→20**: optimising 3 partner slots, when the median async finalist has only one.
5. **Doc 03**: corpus counted at 1,755 instead of 2,388.
