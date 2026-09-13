# The demo video — shooting script, beat by beat

> **What this file is.**
>
> It is the shot list for the demo video: what is on screen, what is said, and when to move.
> Everything you *do* is in the headings, the timings, the stage directions and the checks. The
> lines inside the quoted blocks are what is **spoken on camera**, in the exact words they will
> be said in: the text you rehearse is the text you speak.
>
> **The route it follows is the deck**, in order: `#/deck` in presenter mode (`?presenter=1`),
> with two cuts out to the live instrument to show it really runs. The deck carries **nine
> beats**; every stage direction below names the beat by its number in that sequence.
>
> **The rule that holds the whole script together:** no figure is spoken that is not on screen
> at the moment it is spoken. It is the project's own argument, and it is what makes the video
> impossible to contradict.
>
> **Length — read this before recording.** ETHGlobal's ceiling is **4:00, hard** — speeding a
> video up disqualifies the submission, and it is checked by hand. The spoken lines below count
> **694 words**. That is **173 words a minute**: brisk, but intelligible when the script is
> rehearsed. It leaves no room for a pause that is not planned. The deck's presenter clock counts
> down from **5:00** — treat it as a ceiling, not as the target.
>
> If a take lands over 4:00, the Plan B table at the end names the paragraph to drop first.
>
> **The script is spoken in English.** The site, the deck and the repository are in English; a
> French narration over English boards is the one flaw in this project a judge cannot work
> around.
>
> Recount it any time — this reads the eleven spoken blocks and nothing else:
>
> ```bash
> python3 -c "import re; b=re.findall(r'as it will be spoken:\n\n((?:>.*\n)+)', open('docs/VOD.md').read()); print(len(b),'blocks;',len(re.sub(r'^> ?','',''.join(b),flags=re.M).split()),'words')"
> ```
>
> It prints `11 blocks; 708 words` today — 708 raw tokens, **694 spoken words** once the lone
> dashes and ellipses are dropped. Recount after every edit: the figure above is the only
> thing standing between a rehearsed take and a disqualified one.

---

## Before you record

| | |
|---|---|
| URL | `https://tare-hooks.tech/#/deck?presenter=1` — the clock, the beat counter and the shortcuts exist only with that parameter |
| Keys | **space**, **→**, **↓** or **PageDown** to advance · **←**, **↑** or **PageUp** to go back · **f** fullscreen · **r** resets the clock · **p** pauses it. There are no number keys: to jump to a beat, click it in the rail |
| Clock | counts **down from 5:00**. It is not the 4:00 target — see the note above |
| Window | 1440 × 900, dark theme, zoom 100 % |
| Have ready | a second tab on `#/` with a token address **already pasted** but not submitted — it saves eight seconds |
| Turn off | notifications, a shaky cursor, and the sound of the keyboard |
| Sound | one take if you can. Editing shows, and this project is sold on trust |

---

## 00:00 → 00:28 · The hook — someone, a problem, us

**On screen** — the deck, **beat 1**, but you speak *before* showing the figures. Open on the instrument at `#/` with an address already pasted, cursor in the field, nothing submitted.

**What you say** — as it will be spoken:

> Michel runs a small company. He holds treasury in tokens, and today he wants to swap some for
> ETH. He opens an exchange, sees a price, signs.
> What he cannot see is the **hook**: a program attached to the pool, which runs during his swap
> and can take a cut. On some pools, tenths of a percent. On others — and we will show you —
> **almost everything.** He cannot know before he signs. Nobody can.
>
> **TARE measures what hooks actually take, and publishes it.** A hundred and twenty-five
> thousand measurements, seven thousand eight hundred pools, a hundred and twelve hooks.

**Cue** — on "and publishes it", space → the deck, beat 1.

**Tone** — Michel is there for a reason, not for a laugh. He makes concrete a problem that is otherwise a protocol abstraction. Say his name once, then forget him: the rest is about measurement, not about a character.

---

## 00:28 → 00:48 · The problem, in one figure

**On screen** — deck, **beat 1**. The three large figures: `9 / 1 559`, `0`, `78 / 112`.

**What you say** — as it will be spoken:

> Uniswap asks these hooks to declare what they charge. Out of one thousand five hundred and
> fifty-nine hooks seen across two hundred thousand blocks, **nine** do. Nine.

**Cue** — nothing. Let the three numbers breathe for two seconds.

---

## 00:48 → 01:10 · The registry cannot answer

**On screen** — still **beat 1**, scrolled down to the paragraph. `"additionalProperties": false` is visible.

**What you say** — as it will be spoken:

> There is an official hook registry. Twenty-seven fields per entry, nineteen booleans.
> **Not one is a quantity.** And the schema is closed: it does not merely omit a rate, it
> **forbids adding the field** that would carry one. Worse: of the hundred and twelve hooks we
> measured, **seventy-eight are absent from it.**

**Cue** — space → beat 2.

---

## 01:10 → 01:45 · The method — the technical core

**On screen** — deck, **beat 2**. `125 072` · `7 817` · `112` · `89`.

**What you say** — as it will be spoken:

> So we measured it. And the obvious measurement is **impossible**: a v4 pool's identity — its
> `PoolKey` — **contains the hook's address.** "The same pool without its hook" cannot be
> addressed.
> So we do not change the pool. **We change the hook's code.** On a fork pinned to one block, we
> swap its bytecode for an inert **eighty-nine byte** stub. The `poolId`, the liquidity, the
> `slot0`: identical to the bit. The only thing that changed is the code that runs during the
> swap. Quote the same swap twice — **the gap is what the hook took.**

**Cue** — on "the gap is what the hook took", space → beat 3.

---

## 01:45 → 02:05 · The proof

**On screen** — deck, **beat 3**. `96,74` executed against `96,74` announced.

**What you say** — as it will be spoken:

> The objection comes immediately: what is a quote on a fork worth? So we **executed the swap
> for real**, and matched the result against what the quote announced. **To the wei.** And we
> also publish the pool where it does **not** match — one in three. Every row replays on your
> machine in one command.

**Cue** — switch to the `#/` tab of the instrument.

---

## 02:05 → 02:28 · The instrument — Michel's answer

**On screen** — `#/`, the address already pasted. You submit it **during** the sentence.

Beat 4 of the deck now runs the real app inside the board, so this cut is a choice, not a necessity: a live tab is more convincing, beat 4 is safer if the machine is slow.

**What you say** — as it will be spoken:

> Back to Michel. I paste his token's address…
> and I get the doors I can buy it through, ranked: the pool fee, **plus** the measured hook take,
> and what is left of a hundred. Computed **inside the page** — **zero network requests.** And
> when a door is not measured, the screen does not say zero. It says **unknown.**

**Cue** — back to the deck, **beat 6** (the extension). Click it in the rail: you are deliberately skipping beat 4 (the instrument board, just shown live) and beat 5 (MCP), which comes next.

---

## 02:28 → 02:52 · The extension — the right moment

**On screen** — deck, **beat 6**. Click **there is a better one**, let it play, then click **there is only one door** — the deck's own two outcomes, in its own words.

**What you say** — as it will be spoken:

> But the right moment to know what a hook takes is not when you search. It is **three seconds
> before you sign.** The extension sits between the exchange and the wallet, reads the calldata,
> and returns its verdict before the signature. If a cheaper door exists, it builds the
> replacement and has it signed through **Permit2** — one off-chain signature, not an approval
> transaction. And **it never sends it.** If there is nothing better — **ninety-nine times out of
> a hundred** — it says so. Inventing an alternative would be worse than silence.

**Cue** — ← once, back to beat 5.

---

## 02:52 → 03:12 · MCP — for agents

**On screen** — deck, **beat 5**. Click the second ready-made question.

**What you say** — as it will be spoken:

> And for agents. Ask a model what a hook takes, and it **invents a plausible number.** Our four
> MCP tools carry, in their own description, the ban on stating one. Here the model does not
> invent: it calls the tool, and the tool answers with its block, its size, its label — and the
> command that replays it.

**Cue** — jump to **beat 7** while the typing finishes (click it in the rail: → alone would land back on the extension).

---

## 03:12 → 03:30 · The device, the toll, the proof

**On screen** — deck, **beat 7**, the Speculos screens lighting up one by one.

**What you say** — as it will be spoken:

> The verdict is rendered **field by field** on a Ledger: you do not sign an opaque digest, you
> read what you sign, and declining sends nothing. A fresh measurement costs **one thousandth of
> a dollar in x402 on Hedera**, read back on the mirror node — not on our word. The answering
> agent carries an **HCS-14** identity the caller recomputes.

**Cue** — space → beat 8.

---

## 03:30 → 03:48 · What we do not know

**On screen** — deck, **beat 8**. `63 156` · `61 466` · `450` · `0`.

**What you say** — as it will be spoken:

> And then there is this, displayed as large as everything else. Out of a hundred and twenty-five
> thousand measurements, **sixty-one thousand four hundred and sixty-six are not values.** We keep
> them, with their reason — because a blank reads as "nothing", and "nothing" reads as "zero".
> Sixteen attestations out of **ninety-nine computed**: we publish the gap, not the flattering
> figure. And **nine** past mistakes of our own, with their correction.

**Cue** — space → beat 9.

---

## 03:48 → 04:00 · The close

**On screen** — deck, **beat 9**. The fourteen tools, the five ways in.

**What you say** — as it will be spoken:

> Fourteen tools, twenty-seven datasets, five ways in: the site, the extension, the MCP server,
> the x402 toll, the account. Everything is published — the corpus, the replay commands, and what
> we do not know. **Go and contradict it.**

**Cue** — hold the last screen for a full second before cutting.

---

## Plan B, if something breaks

| what breaks | what you do |
|---|---|
| the instrument will not load | stay on the deck: beat 2 carries the same figures |
| the MCP demo will not start | click **↻ reset**, or skip it — beat 6 is the stronger one |
| the clock runs away | **r** resets it without leaving the beat you are on |
| you are behind at 3:00 | cut the toll paragraph (03:12): keep Speculos, and say "and the x402 toll is settled on Hedera" in one line |
| you are ahead | add, on beat 2: "eight sizes, both directions, one pinned block — because a single rate would be wrong at every size but one" |
| you need to cut 250 words | the first scene (153 words) and the method scene (120) are the two longest. Trim there before touching the figures |

---

## Every figure the script says, and where it shows

None is spoken without being on screen. Check them before the take — they are all generated, so
they move when the corpus moves.

| said | on screen | source |
|---|---|---|
| 9 out of 1,559 | beat 1 | `docs/dataset/declarations.json` |
| 27 fields, 19 booleans, 0 quantities | beat 1 | `apps/web/public/data/hooklist.snapshot.json` |
| 78 of 112 absent | beat 1 | `docs/dataset/registre-couverture.json` |
| 125,072 · 7,817 · 112 · 89 bytes | beat 2 | `dataset.totals`, `engine/tare/stub.py` |
| 96.74 bps executed = announced | beat 3 | `docs/dataset/porte-a4.json` |
| 99.71 % — only one door | beat 6 | `packages/guard/data/chiffres-alternative.json` |
| 63,156 / 61,466 / 450 / 0 | beat 8 | `docs/dataset/summary.json` |
| 16 attestations out of 99 | **beat 8 only** | `docs/dataset/attestations.json` |
| 14 tools · 27 datasets · 5 ways in | beat 9 | `apps/web/src/lib/outils.ts`, `donnees.ts` |

---

## What we do not say, and why

- **"the first global measurement of hooks on EVM"** — it may well be true, and it is exactly the
  kind of sentence a judge cannot check: nobody can prove no team ever did it. The whole project
  rests on **every claim being checkable**. One unverifiable boast in the middle of twenty
  verifiable figures weakens all twenty.
  **Say instead what can be checked in thirty seconds**, which is stronger:
  "a hundred and twenty-five thousand measurements published, across seven thousand eight hundred
  pools, each one replayable in one command — go and find another one." The challenge does the
  same work as the superlative, and it cannot be turned against us.
- **"the first", "the only", "revolutionary"** — same reason.
- **"real time"** — it is false: the measurement is a photograph, at one block, on one chain.
  Saying it would be the exact mistake we accuse others of.
- **"subscription"** — the contract exists and passes twenty tests, but it is not deployed on a
  public network. If it is shown, say "written, not deployed".
- **the test count** — it is true and it interests nobody on video. It lives in the README, where
  a judge who wants to check will go and read it.
