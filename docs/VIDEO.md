# The demo video — shot list

**Target: 3 min 00 s.** ETHGlobal judges watch dozens; the first fifteen seconds decide whether
they watch the rest. No logo animation, no music bed under speech, no "hi everyone".

Everything below is a real screen. Nothing is mocked. Where a command appears, it is the command
that produces what you see, and it is in the repository.

---

## 0:00 – 0:15 · The question, asked with a number

**Screen.** Terminal, one command already typed, you press return:

```bash
cast logs --from-block 50590000 --to-block 50614000 \
  --address 0x498581ff718922c3f8e6a244956af099b2652b2b \
  'Initialize(bytes32,address,address,uint24,int24,address)' | grep -c .
```

**Say.** "Uniswap v4 lets a hook take a cut of your swap. Uniswap's own guide asks hooks to
announce it with an event. I scanned twenty-four thousand blocks on Base. Eighty-four hooks
initialised pools. **Five contracts in total emit that event, and none of the eighty-four is one
of them.**"

**Cut on:** the count appearing.

---

## 0:15 – 0:35 · Why nobody has this number

**Screen.** `docs/METHOD.md` open at `## 1. The wall`, the `PoolKey` struct highlighted.

**Say.** "You cannot just compare a pool to itself without its hook. The pool's identity contains
the hook's address. Remove the hook and it is a different pool, with different liquidity and a
different price. That is why this number does not exist anywhere."

---

## 0:35 – 1:05 · The trick, shown not claimed

**Screen.** Split: left `engine/tare/stub.py`, right a terminal running

```bash
cd engine && python3 -m tare.gates.a3
```

**Say.** "So don't change the pool — change the hook. On a fork pinned to one block,
`anvil_setCode` rewrites the bytecode *at the hook's address*. The pool id, the liquidity, the
price: byte-identical. Only the code that runs during the swap has changed. Quote the same swap
twice — once with the real hook, once with an eighty-nine-byte stub that returns exactly what the
protocol validates and nothing else — and the difference **is** what the hook took."

**Screen at 1:00.** Gate A3 prints its five reproduced figures, green.

**Say.** "This gate replays five recorded values on every run, against numbers an independent
implementation produced before this code existed. It is the one check I cannot talk my way past."

---

## 1:05 – 1:45 · The instrument, on real data

**Screen.** The web app. Sort by bps descending. The table fills; no number animates its value.

**Say.** "Seven thousand nine hundred measurements. Six hundred and twenty-four pools. Sixteen
hooks. Eight swap sizes across eight decades, both directions, one pinned block."

**Screen.** Click the largest row. The detail panel opens: block, size, direction, stub hash,
the replay command.

**Say.** "Every row carries what would let you disprove it. Copy this line, run it, get the same
number — or don't, and tell me."

**Screen at 1:30.** Filter to `stored_lp_fee = 0`.

**Say.** "Three thousand one hundred of these sit on pools whose LP fee, read straight from
`slot0`, is exactly zero. The pool advertises free. The measurement says up to eleven hundred
basis points."

---

## 1:45 – 2:10 · The part that makes it true, not just striking

**Screen.** `docs/hooks-source/ANALYSIS.md`, the concordance table.

**Say.** "A number without a cause is an accusation. So I fetched the verified source of fourteen
of the sixteen and read what each contract declares. Seven agree with what the counterfactual
measured across a hundred and ninety-one pools — and the worst deviation of all of them, not the
best, is **five ten-thousandths of a basis point**."

**Say.** "Which corrected me. These fees are announced. Zora says one percent in a comment.
LaunchHook emits the rate. The problem was never that hooks take money quietly. It is that the
registry meant to describe them has **fourteen permission booleans and not one field that can hold
a quantity** — so two hooks it describes identically can charge nothing and eleven percent."

---

## 2:10 – 2:35 · The action

**Screen.** Browser, a real Uniswap swap ready to sign. The extension badge is amber.

**Say.** "So the last mile is the only one that matters. The guard decodes the hook out of
Universal Router calldata before you sign, looks it up in the measured table, and tells you what
this pool took from a swap this size at this block."

**Screen.** The panel. Then click **Reject**.

**Say.** "And when the table has nothing on that pool, it says *not measured* — never zero.
A guard that fails to 'yes' guards nothing."

---

## 2:35 – 2:55 · What it refuses to do

**Screen.** `docs/HONESTY.md`, scrolling through the numbered false results.

**Say.** "Nine false results this project produced before its rules were absolute, written down
with what caused each one. Five were the same mistake: a read was bounded, the bound was
invisible, and the truncated answer parsed cleanly. None raised an exception. All produced a
plausible number."

**Say.** "That is the whole discipline. A bounded read, a timeout, a rate limit is
`NOT_MEASURABLE` — never a value, never a zero."

---

## 2:55 – 3:00 · Close

**Screen.** The landing page, URL legible.

**Say.** "TARE. Every number replayable, every failure labelled, and the code for both."

---

## Recording notes

- **Terminal**: 16 px JetBrains Mono, black on `#0B0B0C`. No prompt vanity — `$` and the command.
- **Never** show a spinner for more than 2 s: pre-warm forks and the dataset before recording.
- Speak at ~145 words/minute. The script above is ~430 words for 180 s, which fits with pauses.
- Record 4K, deliver 1080p; judges often watch in a small window — font sizes matter more than
  resolution.
- **Do not** say "we". One person built this. Say "I".
- The one number to repeat twice, because it is the whole argument: **fourteen booleans, zero
  quantities.**
