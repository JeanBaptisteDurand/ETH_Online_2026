# DESIGN.md — TARE, the presentation surface

> This file is the design system of `apps/landing` and nothing else. The instrument
> (`apps/web`) inherits the tokens and overrides none of them.
>
> Everything below is either a value that exists in `src/styles/tokens.css`, a measurement I
> took, or a source I opened. Anything I did not check myself is marked **NOT VERIFIED** and is
> not used as an argument.

---

## 0. The one constraint that outranks the aesthetics

**The page is the verdict.**

Not a page that leads to a measurement — a page whose first screen *is* one. Section 00 is static
HTML with the measured value written into the markup at build time. No JavaScript is required to
read it, no font has to load, no request has to come back. The rest of the page is bytes that
happened to arrive in the same document.

Measured on `dist/`, printed by `npm run budget`:

> Les poids ci-dessous ont ete releves a un instant donne. Ils bougent avec le corpus,
> qui grandit : ne les recopiez pas, relancez `npm run budget`, qui les recalcule et
> refuse la page si un critere saute. Un chiffre de poids fige dans une doc devient
> faux au build suivant — c'est le defaut que ce projet reproche partout ailleurs.

| criterion | budget | measured |
|---|---|---|
| verdict readable with JS disabled | required | the value is a literal in `index.html` |
| render-blocking stylesheets | 0 | 0 — all CSS inlined in `<head>` |
| critical document, gzip | < 14 kB | **13.88 kB** |
| JS that can run before the fold | < 2 kB gzip | **1.74 kB** |
| total JS, all chunks | < 160 kB gzip | **26.5 kB** |
| fonts | 2 files, latin only | **68.8 kB**, self-hosted, preloaded |
| third-party origins at runtime | 0 | 0 |
| non-zero `border-radius` in shipped bytes | 0 | 0 |

`npm run budget` exits non-zero when any of these breaks, so a regression fails a build instead of
being noticed in review. The last row is a grep over the shipped bytes, not over the source: that
is why uPlot's stylesheet is vendored (§7) rather than overridden.

### What this constraint cost

- **No theme toggle.** The light palette in `tokens.css` is complete and re-anchors the ramp to
  `YlOrRd`, but honouring a stored preference needs JavaScript that runs *before* the first paint.
  That is the one thing this page may not have. Dark is not a default here, it is the only mode.
  *(The light tokens are therefore shipped but unexercised: **NOT VERIFIED** in a browser.)*
- **No React.** §7.
- **Section 03 was written to what was left of the budget, and it shows.** The page is 12.68 kB
  gzip without it and **13.88 kB with it**, against a 14 kB criterion, so the section lost, in this
  order: a SPREAD column, the stored LP fee under every door, the per-door count of MEASURED rows,
  and the per-door hook address. All four are in `docs/dataset/measurements-contestes.jsonl`, which
  the section names on the page, and the one figure the cuts were about — the gap between two doors
  of the same pair — is stated in the prose under the table. The criterion was not raised.

Two of the savings were taken on the shipped bytes instead of on the content, and neither removes a
character a reader would have seen. `build/html.mjs` collapses runs of whitespace outside `<pre>`
and `<code>` before the markup is baked in — HTML collapses them anyway — and uPlot's stylesheet
moved out of the inlined `<head>` into the chart's deferred chunk (§7, Departure 2). Measured by
building the same corpus with and without each change and reading `npm run budget`: **14.30 → 13.88
kB** for the whitespace, **14.11 → 13.88 kB** for the stylesheet.

---

## 1. The references, and the exact device taken from each

Five sites, opened and read. What follows is what was taken, not a mood board.

### 1.1 SSTR — Friction Reduction · https://sstr.tech/en/
*Awwwards Site of the Day, 16 Aug 2026 · Dev Award 7.58 · one credited author, zero real-time 3D.*

Its scatter plot — `WITH FRS` in orange against `WITHOUT FRS` in grey, monospace capital axes,
dotted grid, a legend made of two swatches and a monospace label — is literally the TARE figure:
the same quantity measured twice, the treated series in colour, the reference series in grey.

**Taken.** Section 04's chart, rule for rule: the measured series carries the ramp colour, the
counterfactual is `--baseline`, a grey, and the legend is two swatches plus a monospace label.
Also its 1 px full-width modular rules, and the `▪ EYEBROW` device (here a 32 px lead-in rule
before a monospace capital label).

**Not taken.** Its preloader. `// PLEASE WAIT` / `50 %` before anything paints is the exact
inverse of §0.

### 1.2 `.txt` — https://dottxt.ai
*Awwwards Nominee, 24 Aug 2026 · community design 8.0 / usability 8.6 · `border-radius: 0`, base 4,
h1 267 px against body 12 px.*

**Taken.** One idea, and it shapes the whole first screen: **the hero object is the real tool and
its real output**, not a picture of either. Their panel shows `$ dottxt generate --schema …` and
below it the actual `{"valid": true}`. Section 00's right-hand panel is a working 14-bit
permission decoder, the measured value, its provenance, and the command that replays it. Also the
**1-bit checkerboard** used as texture instead of a gradient — here two 45° `linear-gradient`
layers at 6 px, 4 % opacity, about 120 bytes and zero requests.

**Not taken.** The full-screen cookie banner over the hero — same fault as the preloader. And the
bitmap display face: one display font used for one thing is a signature, and copying a signature
is not designing.

### 1.3 Where the Shadow Fell — https://eclipses.bogachev.fr
*Awwwards Nominee, 22 Aug 2026 · tagged Data Visualization · Space Grotesk + Space Mono, both
SIL OFL 1.1.*

**Taken.** The proof that an award-winning data-visualisation site runs on two free faces, and the
**role split**: a grotesque for prose, a monospace for every number, identifier and label. Never
the other way round. §3.

**Not taken.** The Three.js globe. TARE has no spatial data.

### 1.4 WC 2026 Data Portraits — https://wc26.bogachev.fr
*Awwwards Nominee, 27 Jul 2026, average 7.48. The submission says "Coded solo."*

**Taken.** The section index: a small monospace ordinal, a 1 px rule that eats the remaining width,
a right-aligned count, then the title underneath. It is the table of contents of a technical
report and it costs nothing. (Upstream baselines all three on one line; a two-line title breaks
that, so here the rule row sits above the title. Same device, one fix.)

**Not taken.** The gradient terrain. Their own copy calls it "an impression, but one built from
data". TARE is the product that objects to embellished numbers; an impressionistic rendering of a
measurement would contradict the thesis.

### 1.5 Lidar Drone Scanning — https://drone.riotters.com
*Awwwards Nominee, 29 Aug 2026 · h2 240 px against body 14 px · base 8 px · radius 0.*

**Taken.** Two things. The **editorial framing of a measuring instrument** — a site that presents a
raw physical measurement and does not apologise for being technical. And its **animation budget**:
the submission lists four named motions for the entire site. This page has one family (§5).

**Not taken.** The point cloud — 3D rendering of 3D data is legitimate there and dishonest here.
**And its typography:** Switzer ships under the ITF Free Font License, which forbids distribution
*"through … a repository"* and forbids subsetting. It cannot enter an open-source repo. §3.3.

### 1.6 The negative benchmark — Cerebrium, https://cerebrium.ai
*Awwwards Nominee, 5 Aug 2026 · eight credited authors · GSAP + Three.js + Cinema 4D + Lottie.*

Eight people and four heavy libraries: **Nominee**. SSTR, one person and no real-time 3D: **Site of
the Day** plus a 7.58 Dev Award. On Awwwards, 3D does not substitute for editorial direction. For
a solo build on a deadline that is the most useful fact in the whole survey, and it is why this
page contains no WebGL, no canvas beyond the 53 kB chart, and no 3D of any kind.

### 1.7 Also consulted

- **stateofaidesign.com** (Site of the Day, 26 Aug 2026) — the hairline monospace legend chip
  anchored in a panel corner. It is exactly the component needed to carry
  `MEASURED` / `INTERPOLATED` / `NOT_MEASURABLE` / `NOT_QUOTABLE` without colour. See `.chip`.
- **web3.esqrd.co** (CSSDA) — a web3 site on `#101010`, radius 0, fully desaturated, no crypto
  purple, no gradient. Proof by example that the genre does not require the genre's clichés.

---

## 2. Colour — one family, and it encodes one quantity

1. **The measurement ramp is the only chromatic family on the page.** It encodes basis points and
   nothing else.
2. **Everything else is achromatic.** Surfaces, rules and inks are neutral greys.
3. **One non-quantitative colour exists**, `--focus #3376F6`, for focus rings and links. It is
   cold, so it can never be mistaken for the ramp, which is warm. Warm says *this is large*; blue
   says *you can act*. Nothing else speaks in colour.
4. **Qualitative labels are never coloured.** The four labels are typographic: 10 px monospace
   capitals, 1 px rule, radius 0. Colouring a label would claim a magnitude it does not have.
5. **The brand colour is the top of the ramp**, `--m-6 #F6D746`. The product has no decorative
   colour: *its identity colour is its alarm colour.* The only place it appears outside a
   measurement is the single call to action, and that is deliberate — the button is the same
   yellow as an extreme reading.

### The ramp

Not chosen from a generator. It is matplotlib's **inferno** — perceptually uniform, published,
colour-vision-deficiency safe, public domain — truncated to `[0.18 ; 0.90]` and sampled at seven
logarithmic steps.

| step | domain (bps) | hex | cell ground (22 % on `--bg-1`) | `--ink` contrast |
|---|---|---|---|---|
| `m0` | 0 | `#390963` | `#191025` | **15.25** |
| `m1` | ]0 ; 1] | `#6A176E` | `#241328` | 14.53 |
| `m2` | ]1 ; 10] | `#9B2964` | `#2F1726` | 13.70 |
| `m3` | ]10 ; 30] | `#CA404A` | `#391C20` | 12.80 |
| `m4` | ]30 ; 100] | `#EB6628` | `#402418` | 11.74 |
| `m5` | ]100 ; 300] | `#FB9B06` | `#443011` | 10.39 |
| `m6` | > 300 | `#F6D746` | `#433D1F` | **9.05** |

A cell is `color-mix(in srgb, var(--m-N) 22%, var(--bg-1))` plus `inset 3px 0 0 var(--m-N)`: the
saturated bar carries the signal, the ground carries the order, **and the value's ink never
changes**. An ink that shifted with the ground would vary the contrast without encoding anything.

Contrast decreases monotonically with the value — 15.25 down to 9.05 — so it never contradicts the
encoding, it doubles it. All seven hold AAA (7:1). I recomputed every figure in this table from
the hex values rather than copying them.

### Contrast, measured, including where it failed

I computed the WCAG ratio of every ink against every surface. **`--ink-3` as originally specified
(`#6B7178`) came out at 3.28–4.04:1 — below AA — and it carries the captions, units and
provenance lines, which is most of the small type on the page.** It was raised to `#868D96`.

| token | on `--bg` | on `--bg-3` | role |
|---|---|---|---|
| `--ink` `#E8EAED` | 16.53 | 13.41 | every measured value — AAA everywhere, 9.05 worst case on a ramp cell |
| `--ink-2` `#A2A9B0` | 8.39 | 6.80 | labels, column heads |
| `--ink-3` `#868D96` | 5.94 | 4.82 | units, provenance, captions — AA with margin |
| `--ink-cell-2` `#AEB4BB` | — | 4.59 on `m6` | second and third storey **inside** a ramp cell |
| `--ink-4` `#454A50` | 2.23 | 1.81 | **non-text only** — axis ticks and hairlines, never a glyph |

Two consequences worth stating plainly:

- **`--ink-4` is not a text colour.** The original storyboard used it for the section ordinal and
  for `<dt>` labels. At 2.2:1 that is unreadable. Those now use `--ink-3`.
- **Inside a ramp cell the secondary ink steps up** to `--ink-cell-2`, because the ground is
  lighter there. This does not break the "the ink never changes" rule: that rule is about the
  *value*, and the value's ink is `--ink` on every cell of every step.

**Honest limit: 7:1 for all text is not achievable** with four distinguishable grey levels on a
near-black canvas. What holds is: **AAA for every measured value, everywhere, including on the
ramp; AA with margin for everything else that is text; and no glyph on a colour that fails AA.**

---

## 3. Type

| role | face | licence | weight on the wire |
|---|---|---|---|
| structure, numbers, labels, tables **and the hero** | **JetBrains Mono Variable** 100–800 | SIL OFL 1.1 | **39.5 kB**, preloaded |
| prose only | **Instrument Sans Variable** 400–700 | SIL OFL 1.1 | **29.4 kB**, `font-display: swap` |

Self-hosted from `@fontsource-variable/*`, copied into `public/fonts/`, **never loaded through the
Google Fonts API**: a third-party request at runtime is indefensible on a page whose argument is
that you should check what runs.

**The hero is set in the table's font at thirteen times the table's size.** Not in a display face.
Three reasons: a fixed advance width at 132 px produces the engraved plate of a measuring
instrument, which is the register this page wants; it costs zero extra bytes; and the page then
has exactly one voice.

**Not Inter, not Geist.** Both are the default output of AI-generated sites in 2026 and a judge
reads them as such — the precise criticism this work has to avoid. Instrument Sans is a lighter
OFL neo-grotesque, and its name is a gift to a product that is an instrument.

Scale, measured against the references' 17:1 and 22:1:

| token | value | face |
|---|---|---|
| `hero` | `clamp(44px, 15vw, 132px)` / lh 0.86 / ls −0.045em / 800 — `9.2vw` above 1024 px, where the grid narrows to 7 of 12 columns | JetBrains Mono |
| `metric-xl` | `clamp(72px, 16vw, 240px)` / lh 0.82 / ls −0.05em / 800 | JetBrains Mono |
| `h2` | `clamp(28px, 4.2vw, 56px)` / lh 1.0 / ls −0.03em / 700 | JetBrains Mono |
| `lead` | `clamp(17px, 1.4vw, 21px)` / lh 1.5 | Instrument Sans |
| `body` | 16 / lh 1.6, measure 68ch | Instrument Sans |
| `data` · `data-sm` · `data-xs` | 13/18 · 11/16 · 10/14 | JetBrains Mono |
| `caption` · `label` | 11 / ls +0.10em / capitals | JetBrains Mono |

`font-variant-numeric: tabular-nums` globally; `font-feature-settings: "zero" 1` on every
hexadecimal string, because an address without a slashed zero is a reading trap.

### 3.1 The closest free equivalent to Berkeley Mono, and why it is not shipped

**Ioskeley Mono** (github.com/ahatem/IoskeleyMono, SIL OFL 1.1) is an Iosevka reconstruction whose
`private-build-plans.toml` publishes the target metrics: advance 600, x-height 520, cap 690, dotted
zero, square dots — identical to the target on every axis. It is the correct answer to
*"what is the nearest free equivalent?"*

It is not shipped because it has no variable build: ~94–96 kB per cut, so ~190 kB for two weights,
against 39.5 kB for one variable file covering 100–800. On a page whose acceptance criterion is a
12.9 kB critical document, that is not a close call. The only legitimate trigger for reversing this
is abandoning the performance budget.

Compensation for the substitution, because the difference is real: JetBrains Mono has x-height 550
against 520 and cap 730 against 690, so at equal size it reads about 6 % larger. Table body drops
1 px and label tracking opens by +0.02em.

### 3.2 Berkeley Mono is disqualified twice over

usgraphics.com/products/berkeley-mono states, verbatim:

> *"Commercial licenses are not compatible with open-source apps."*

It is not merely paid. It is explicitly incompatible with the open-source repository this track
requires. The 7-day trial (`FX-050`) is not a way round it either: evaluation only, no commercial
use, and `/`↔`\` and `*`↔`#` are deliberately swapped in the glyph set.

The clean answer to *"but the reference aesthetic is Berkeley"*: **US Graphics publishes its
colours under BSD-3-Clause even though its fonts are proprietary.** `--focus #3376F6` is the
`Ansi 12` value of the RETICLE theme in `usgraphics/usgc-themes`. Take the colours at the source,
under licence, without buying the face.

### 3.3 Fontshare is also disqualified

Satoshi, General Sans and Switzer are marked "Closed Source" on Fontshare and governed by the ITF
Free Font License v2.0, which says the software may not

> *"be distributed … This includes distributing the Font Software through another font website,
> font library, marketplace, **repository**, download service, application or platform"*

and separately forbids *"modifying or replacing glyphs, **subsetting**, format conversion"*.
Committing such a `.woff2` to a public GitHub repository violates the licence by name.

---

## 4. Geometry

```css
--radius: 0;                                     /* everywhere, no exception */
--border: 1px solid var(--line);
--focus-ring: 0 0 0 2px var(--bg), 0 0 0 4px var(--focus);
```

- **Radius 0, measured, not asserted.** Computed CSS was read on six awarded sites — sstr.tech,
  dottxt.ai, eclipses.bogachev.fr, drone.riotters.com, web3.esqrd.co,
  marketing.pinelabs.com/signaliq. All six: `border-radius: 0px`. `npm run budget` greps the
  shipped bytes to keep it true.
- **No drop shadows, ever.** Depth is the surface step `--bg → --bg-1 → --bg-2 → --bg-3` plus a
  1 px rule.
- **No gradient on any interface element.** A gradient on a surface is a phantom encoding. The only
  gradient permitted is the ramp, where it encodes. (The checkerboard is two `linear-gradient`
  layers used as a hard 1-bit halftone, not a fade.)
- **One shaped element on the whole page**, and it is a chamfer, not a radius: the single call to
  action, `clip-path: polygon(10px 0, …)`. The edges stay sharp.
- Space base 4: `4 8 12 16 24 32 48 64 96 128 192`. Container 1440, 12 columns, 24 px gutter,
  side margin `clamp(16px, 4vw, 64px)`. Breakpoints 375 · 768 · 1024 · 1280 · 1440.

---

## 5. Motion — one family, and it is the sweep

> **R1. Nothing may delay the verdict.** No preloader, no blocking banner, no hijacked scroll, no
> entrance animation on the hero content.
>
> **R2. A number never animates its value.** A counter climbing to 1 176 displays *wrong numbers*
> for 800 ms, and a spring overshoots the target, which means it displays a value that was never
> measured. This is the exact dishonesty the product exists to expose. A number may move or fade
> in. It is never computed on screen.

**One family: a hard edge crossing a region, revealing state that was already decided.**

| where | what sweeps |
|---|---|
| the 14-bit register, head and foot | bits light in sequence, 24 ms apart, capped at 120 ms |
| sections 01–07 | the block fades in as one, 280 ms, no per-element stagger |
| section 04's curve | the plot is revealed left to right in 320 ms, once, via `clip-path` |
| the matrix, on sort | the rows that moved settle in 180 ms on `--e-move` |

Nothing else moves. No parallax, no custom cursor, no infinite loop.

```css
--t-feedback: 90ms;  --t-element: 180ms;  --t-view: 280ms;  --t-data: 320ms;  /* hard ceiling 400ms */
--e-enter: cubic-bezier(0.16, 1, 0.30, 1);
--e-exit:  cubic-bezier(0.40, 0, 1, 1);
--e-move:  cubic-bezier(0.20, 0, 0, 1);
```

`prefers-reduced-motion: reduce` drops the durations to `0.01ms` and skips the register sweep and
the curve reveal entirely.

**The reveal can never hide content.** A `<noscript>` rule forces every swept element visible, and
a 3 s timer in `boot.ts` forces any element the observer missed. A register still dark after three
seconds is a bug, not a design choice.

---

## 6. Where the numbers on this page come from

**There is no literal measurement anywhere in the markup.** `build/facts.mjs` derives every figure
and writes `src/generated/facts.json`; `build/html.mjs` renders the page from that file only; a
Vite plugin bakes the result into `index.html` at build time.

| shown on the page | derived from |
|---|---|
| corpus size, pool count, label counts, min/median/max, the hero row | `docs/dataset/measurements.jsonl`, or `docs/measurements-v1.json` if the sweep has not run |
| the 5-point curve in section 04 | **parsed out of `engine/tare/gates/a3.py`** — `SIZES`, `EXPECTED`, `TOL`, `HOOK`, `KEY` |
| the 89-byte stub, its assembly comments, its keccak | **parsed out of `engine/tare/stub.py`** |
| liquid pools, distinct hooks | `docs/pools-liquides.json` |
| section 03: pairs, pairs with a second pool, the share, the unread pools and their cause | `docs/dataset/pools-liquides-full.json` and its `.scan.json` — pairs counted from the PoolKeys; the rate-limited endpoint's URL is deliberately left behind, only the cause class travels |
| section 03: what each pool of those pairs takes | `docs/dataset/measurements-contestes.jsonl` — the median of a pool's MEASURED rows, and **which pair is quoted as the widest gap and which as the counter-example is decided by a rule in `facts.mjs`**, recomputed at every build |
| the real hook bytecode in section 03 | `data/hook-bytecode.json` — `eth_getCode` at the pinned block, §6.1 |
| the 14 permission bits | `BigInt(address) & 0x3FFFn`, no RPC at all, §6.2 |
| commit, engine version, `N/N` tests | `git rev-parse` and the engine's own unittest run at build time |

Rules the generator enforces, so they cannot be forgotten:

- **A missing source becomes `NOT MEASURED` in the layout**, never a plausible-looking value.
- **An unknown label throws.** `facts.mjs` refuses to guess at an enum it does not recognise.
- **A corpus spanning more than one block throws.** The page states one block; it must be true.
- **The two corpora are never merged.** Whichever holds more rows wins, and the page prints which
  file it read. Merging two sources that can disagree would hide the disagreement.
- **The matrix is the head and the tail of the ranking, and says so** — `N ROWS ELIDED` sits
  between them with the count. A truncated view is labelled as truncated. This project has
  published false findings by concluding on a truncated read; the table now shows its own cut.

### 6.1 The bytecode cache, and the race it caught

`data/hook-bytecode.json` holds, per hook, the byte length, the keccak256 of the full code, and the
first 160 bytes — fetched with `eth_getCode` at block 50 614 000, read **twice**, and rejected if
the two reads disagree, if the result is empty, or if the result equals the stub. The three hooks
first fetched from `https://mainnet.base.org` were re-read from the pinned local fork and the
keccaks matched.

That check earned its keep immediately: one hook came back **as the stub**, because the engine's
sweep was mid-measurement on the same fork and `anvil_setCode` had it swapped out at that instant.
It was refused rather than cached. When a hook's real code is not available, section 03 shows the
code of a hook that is, **names that hook in the panel header**, and says on the same line that it
is not the hook quoted in section 00.

### 6.2 The permission register needs no network

A v4 hook's permissions are not a claim it makes: they are the low 14 bits of its own address, and
the PoolManager enforces the match. `BigInt(addr) & 0x3FFFn`, 14 squares of 10 px, about 30 lines,
zero dependencies, zero RPC. Paste any address and it decodes live.

Bit order verified against `Uniswap/v4-core@main`, `src/libraries/Hooks.sol` lines 29–46, read this
session — bit 13 `BEFORE_INITIALIZE` down to bit 0 `AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA`.

### 6.3 Two figures whose enumeration is not in this repo

`84 hooks / 0 HookSwap / 0 HookFee` and `613 registry entries / 19 fields / 0 numeric` come from the
engine's event sweep and its registry reader. Those runs have not committed their per-hook lists
under `docs/` yet, so **section 01 prints that on the same line as the figures**: the counts are
stated, the addresses are not claimed. A number without its file is a claim, and this page's whole
argument is about the difference.

---

## 7. Stack, and the two places it departs from the brief

```
vite 7 · typescript 5 · uplot 1.6.32 (MIT)
@fontsource-variable/jetbrains-mono · @fontsource-variable/instrument-sans (both SIL OFL 1.1)
```

Every runtime dependency is MIT, Apache-2.0, BSD or ISC. The repository is open source for the
Uniswap track; a Commons Clause anywhere is an immediate refusal.

**Departure 1 — no React, no `@tanstack/react-table`, no `motion`.** The brief's stack costs about
120 kB gzip. What it would buy on this page is a sortable twelve-row table and a fade. Those are
1.07 kB of vanilla TypeScript and four CSS transitions here. React was justified in the brief by
chunk sharing with `/hooks`, but `apps/landing` is a separate build from `apps/web` and shares
nothing with it, so the saving does not exist. **Total JS is 26.1 kB gzip instead of ~158 kB, and
1.74 kB of that can run before the fold.** This is exactly the trade this product claims to be able
to make, and it is the one place the page can demonstrate it on itself.

**Departure 2 — uPlot's stylesheet is vendored** into `src/styles/uplot.css` rather than imported.
Two reasons, both rules rather than taste: it ships `border-radius: 50%` on the cursor point, and
this page is radius 0 in the *shipped bytes*, which is what `npm run budget` greps; and its
`.u-legend` table never renders, because the legend here is our own DOM — two swatches and a
monospace label, the SSTR device. Attribution and the MIT notice are at the top of the file.

It is also imported `?inline` by `src/sections/curve.ts` and injected as a `<style>` the first time
the chart mounts, so it travels in the chart's deferred chunk instead of the inlined `<head>`. It
used to sit in every visit's critical document, including the visits that never scroll as far as the
chart. Same trade as Departure 1, applied to a stylesheet.

**Departure 3 — the page is in English.** The storyboard is in French; the README, the submission
and the judges are not. The four labels use the canonical engine enum —
`MEASURED` / `INTERPOLATED` / `NOT_MEASURABLE` / `NOT_QUOTABLE` — and `facts.mjs` maps the older
French enum in the frozen corpus onto it rather than renaming anything in place.

### Not used, and why

| considered | verdict |
|---|---|
| react-bits | Commons Clause — incompatible with the open-source repo the track requires |
| unicorn.studio | watermark on the free plan |
| Spline | `license: None` on npm, and web exports are watermarked below $12/mo |
| Rive | runtime is MIT, but the free plan cannot export `.riv` at all |
| ShaderGradient | no `LICENSE` file in the repo, and ~283 kB gzip of peer dependencies for a gradient |
| Paper Shaders | genuinely clean (Apache-2.0, 59.9 kB, zero deps) — **and cut anyway.** The product sells the absence of ornament. The 1-bit checkerboard says "this is an instrument" for about 120 bytes |
| Lottie | 33 kB of runtime and a second licence to document, for motion CSS already does |
| getdesign.md files | *"free to use in your projects"* is not a grant of redistribution, and every card carries a trademark notice. Read them; do not commit them. This file is written for TARE and carries TARE's own values |
| any 3D | there is no spatial data in this product |

---

## 8. What section 04's chart is allowed to do

- **X is logarithmic.** The sizes span four decades; a linear axis would stack four of the five
  measurements on one pixel column.
- **X ticks sit on the measured sizes and nowhere else.** uPlot's default log splits label decades
  nobody swapped at — a grid pretending to be data.
- **Y is anchored at 0.** A truncated Y axis turns a 6 bps spread into a cliff. Zoom may exist, but
  it has to carry the label `ZOOM · Y NOT ANCHORED`.
- **The five measurements stay points**, `r = 3`, no spline. They are five observations, not a
  function; a curve through them would draw values nobody measured.
- **The counterfactual series is grey.** It has no magnitude, so it has no colour.
- **The uncertainty is stated, not faked.** The gate's tolerance is ±0.05 bps, which is smaller than
  one pixel at this scale, so the legend says so in words instead of drawing an invisible bar.
- **The same five figures are printed as a table underneath**, so the section is complete with
  JavaScript disabled and with a screen reader.

---

## 9. Deliberately absent

No preloader. No blocking cookie banner. No "Connect Wallet". No partner-logo carousel. No
testimonials. No pricing block. No custom cursor. No parallax. No 3D. No count-up. No emoji, and
no decorative icon — the only glyphs are functional. No centred text beyond one line. And no
invented value anywhere: a missing figure prints `NOT MEASURED` and keeps its slot.
