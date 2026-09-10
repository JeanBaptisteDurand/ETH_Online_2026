<!-- Engendre par `python3 -m tare.video --write`. Ne pas editer a la main :
     la version precedente citait 7 900 mesures quand le corpus en portait 125 072, et
     « 0 des 84 hooks » quand la reponse est 9 sur 1 559. Un chiffre faux qu'on a ENREGISTRE
     ne se corrige plus. -->

# The demo video — shot list

**Target: 3:30.** Judges watch dozens; the first fifteen seconds decide whether they
watch the rest. No logo animation, no music under speech, no "hi everyone".

Every screen below is real. Where a command appears, it is the command that produces what you see,
and it is in the repository. Every figure is generated from the corpus — if you re-run
`python3 -m tare.video --write` after a sweep, the numbers in this script change with it.

---

## 0:00 – 0:23 · The question, asked with a number

**Screen.** Terminal, one command already typed, you press return:

```bash
cd engine && python3 -m tare.declare
```

**Say.** "A Uniswap v4 hook can take a cut of your swap. Uniswap's guide asks hooks to announce
it. I scanned two hundred thousand Base blocks: 1,559 hooks,
**9 of them do** — nought point five eight percent — and those nine announce an absolute amount on one past swap, not the rate at your
size."

**Cut on:** the line `hooks distincts : 1559` appearing.

> **Do not say "none".** An earlier cut of this script did, and it was wrong.

---

## 0:23 – 0:34 · The registry cannot help either

**Screen.** `docs/dataset/registre-couverture.json`.

**Say.** "The registry meant to describe them has 19 fields and **not one can
hold a quantity** — and it is missing 78 of the 112 hooks
I measured."

---

## 0:34 – 0:49 · Why nobody has this number

**Screen.** `docs/METHOD.md` open at `## 1. The wall`, the `PoolKey` struct highlighted.

**Say.** "And you cannot compare a pool to itself without its hook: the `PoolKey` *contains* the
hook's address. Remove it and it is a different pool, different liquidity, different price. That
is why this number exists nowhere."

---

## 0:49 – 1:17 · The trick, shown not claimed

**Screen.** Split: left `engine/tare/stub.py`, right a terminal running

```bash
cd engine && python3 -m tare.gates.a3
```

**Say.** "So don't change the pool — change the **hook**. On a pinned fork, `anvil_setCode`
rewrites the bytecode at the hook's address. Pool id, liquidity, price: byte-identical. Quote the
same swap twice — once with the real hook, once with an eighty-nine-byte inert stub — and the
difference **is** what the hook took."

**Screen, second half of this section.** Gate A3 prints its reproduced figures, green.

**Say.** "This gate replays recorded values against numbers an independent implementation
produced before this code existed."

---

## 1:17 – 1:43 · The instrument, on real data

**Screen.** The web app. Sort by bps descending. The table fills; no number animates its value.

**Say.** "125,072 measurements. 7,817 pools, 112 hooks, 8 sizes,
both directions, block 50,614,000."

**Screen.** Click the largest row: block, size, direction, stub hash, the replay command.

**Say.** "Every row carries what would disprove it. Copy the line, run it — or don't, and tell
me."

**Screen, second half of this section.** Filter to `stored_lp_fee = 0` **and static-fee pools**.

**Say.** "12,547 of them sit on pools whose LP fee, read from storage, is exactly
zero and not dynamic — so that zero really advertises free. Median 100 basis
points, worst case 300."

> **The number you must NOT say is 38,857.** That is the count without the filter, and
> 68 % of it sits on dynamic-fee pools, where
> `stored_lp_fee = 0` means "the hook sets the price per swap", not "free". Saying the big number
> is the one trap this project sets for itself, and a judge finds it in a minute.

---

## 1:43 – 2:04 · The part that makes it true, not just striking

**Screen.** `docs/hooks-source/ANALYSIS.md`, the concordance table.

**Say.** "A number without a cause is an accusation. So I read the verified source of
42 of the 112. Where source and measurement compare, they agree
across 1,185 pools — worst deviation **0.0005 of a basis
point**. Which corrected me: the problem was never secrecy. The metadata layer cannot carry a
quantity."

---

## 2:04 – 2:21 · Before you sign

**Screen.** Browser, a real Uniswap swap ready to sign. The extension badge is amber.

**Say.** "The last mile. The extension decodes the hook out of your swap calldata before you
sign — offline, no request, no account. With nothing on that pool it says *not measured*, never
zero. A guard that fails to 'yes' guards nothing."

**Screen.** The panel, then click **Reject**.

---

## 2:21 – 2:42 · And elsewhere?

**Screen.** Panel 16. Click **comparer**. The header reads **0 appel(s) RPC**.

**Say.** "Is there a cheaper door? For 99.7 percent of the corpus: *there is only
one* — an answer, not a failed search. In the
15 cases where there is one, it builds the replacement
transaction: floor from a live quote, real deadline. And it does not send it. That is yours."

**Screen.** The button **signer et envoyer**, active. Do not click it.

---

## 2:42 – 3:00 · Who pays, and who is asking

**Screen.** Terminal: `npx tsx apps/api/src/pay/cli.ts payer`, then the HashScan link it prints.

**Say.** "The API is metered with x402 on Hedera — 5 settlements confirmed on the
mirror node, not by my server. The signing key lives in a Ledger, and the agent has an on-chain
HCS-14 identity, so a caller can check who it calls."

---

## 3:00 – 3:30 · What it refuses to do

**Screen.** `docs/HONESTY.md`, scrolling the numbered false results.

**Say.** "Every false result this project produced is written down with its cause. A bounded read
is `NOT_MEASURABLE` — never a value, never a zero."

**Screen.** The landing page, URL legible.

**Say.** "TARE. Every number replayable, every failure labelled."

---

## Recording notes

- **Terminal**: 16 px JetBrains Mono, black on `#0B0B0C`. No prompt vanity — `$` and the command.
- **Never** show a spinner for more than 2 s: pre-warm the fork, the dataset and the API before
  recording. `POST /alternative` makes up to three `eth_call`s; run it once before the take so the
  fork cache is warm.
- Speak at ~145 words/minute. This script is **466 words**, which is 3:13 of speech
  for a 3:30 video — the rest is silence and what the screen says on its own.
- **Do not** say "we". One person built this. Say "I".
- **The MCP server is NOT in this cut**, and that is a choice: it is the fourth access by order
  of visit, and showing a tool call inside a model's transcript costs twenty seconds to explain
  for an audience that mostly will not use it. It is in the written submission. If you want it,
  the cleanest place is after "And elsewhere?" — and you must then cut something else, because
  this script already uses 3:13 of the 3:30.
- The one sentence to land, because it is the whole argument: **19 fields,
  zero quantities.**
- Two numbers not to misspeak: **125,072** measurements, and **12,547** rows
  on pools that advertise free — not 38,857.
