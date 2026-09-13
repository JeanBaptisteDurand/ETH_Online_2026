# 35 — TARE: DESIGN CHARTER AND PRESENTATION PAGE

> Working document. It completes `34-TARE-FINAL.md`, it does not replace it.
> Scope: **`tare.xyz` (surface 1, the presentation page)** + **the charter common to both surfaces**.
> `tare.xyz/hooks` (surface 2, the instrument) is not re-scoped here; it inherits the charter.
> Anything that was not opened is marked **UNVERIFIED**.

---

## 0. WHAT WAS ACTUALLY OPENED, AND WHAT WAS NOT

**Opened and verified** — Awwwards (`/websites/webgl/`, `/websites/3d/`, `/websites/data-visualization/`,
`/websites/technology/`, `/websites/sites_of_the_day/` + 9 detail entries) · CSS Design Awards
(`/website-gallery`, `/wotd-award-nominees`) · 6 reference sites live, 4 of them via screenshot
(SSTR, wc26, stateofaidesign, dottxt) · 29 tools from the toolbox · `getdesign.md` (catalogue,
URL scheme, 2 complete entries, terms of service) · usgraphics.com (shop, extras, GitHub repositories) ·
the real npm sizes via the Bundlephobia API · the raw `LICENSE` files on `raw.githubusercontent.com` ·
the actual Latin woff2 files served by `fonts.gstatic.com`.

**UNVERIFIED, and therefore not judged here** — the usgraphics manifesto quoted in §10 of doc 34
(*“Expose state and inner workings”*, *“Dense, not sparse”*, *“Verbosity over opacity”*…):
`usgraphics.com/manifesto` returns **404**, the site's full sitemap contains **no manifesto page**,
and a search on the exact phrases turns up nothing. **The source of these quotes cannot be found.**
Do not paste them at the top of a public `DESIGN.md` without having found where they are published: a judge who
goes looking for the quote will not find it either. *(What follows replaces those quotes with verifiable
sources taken from the US Graphics open source repositories — see §1.9 and §4.)*

**Factual correction to doc 34, §9.** The sentence *“Awwwards' Data Visualization category
proves it — 3 of the 4 entries opened are Framer landings”* does not generalise. Page 1 of that
category contains **31 sites** (`awwwards.com/websites/data-visualization/`), not 4, and it is paginated
across 5 pages. Of those 31, only one entry among those I opened is in fact Framer
(HydraDB, tags `Figma` / `Framer`). The “discard Awwwards” verdict rested on a sample of 4.

---

# PART I — AWWWARDS AND CSSDA, ACTUALLY EXPLORED

## 1.0 The cross-cutting result, before the entries

I extracted the real design tokens (typeface, colours, `border-radius`, spacing unit) from
**six** award-winning sites, via Firecrawl's `branding` format, which reads the computed CSS:

| Site | `border-radius` | base unit | actual typefaces |
|---|---|---|---|
| sstr.tech | **0px** | 4 | ABC Monument Grotesk |
| dottxt.ai | **0px** | 4 | PP Neue Montreal + PP Neue Montreal Mono + neueBit |
| eclipses.bogachev.fr | **0px** | — | **Space Grotesk + Space Mono** |
| drone.riotters.com | **0px** | 8 | Switzer + ProtoMono |
| web3.esqrd.co | **0px** | 4 | Play + Roboto |
| marketing.pinelabs.com/signaliq | **0px** | 4 | PP Telegraf |

> **Six out of six: `border-radius: 0`.** This is not a matter of taste, it is a measurement.
> The TARE charter sets the radius to **0 everywhere, without exception** (§4.5).

Second regularity: **the typographic scale ratio is extreme.** dottxt.ai: h1 **267px**
against body **12px** (22:1). drone.riotters.com: h2 **240px** against body **14px** (17:1).
esqrd: h1 110px. Where a “corporate” site tops out at 3:1, these sites push to 17–22:1.
**It is the cheapest Awwwards lever there is: it does not cost one kilobyte.**

## 1.1 SSTR — Friction Reduction · **reference no. 1**

- Entry: https://www.awwwards.com/sites/sstr-friction-reduction — **Site of the Day, August 16, 2026**
- Live: https://sstr.tech/en/
- Scores: overall **7.17** (design 7.16 · usability 7.28 · creativity 6.98 · content 7.17) · **Dev Award 7.58**
- Declared stack: **GSAP · BARBA.js · Astro** · announced palette `#FE5B2A` / `#18191B`
- Verbatim description: *“Brand, site and 3D for a friction-reduction company in oil drilling.
  **Editorial minimalism that speaks the engineer's language: a modular grid, motion tuned to the hardware.**”*

**What we take from it, precisely.** One section, seen in a screenshot: a scatter plot of **`WITH FRS` in
orange against `WITHOUT FRS` in grey**, axes in uppercase monospace (`DEPTH`, `HOOK LOAD, T`), dotted
grid, a legend made of **two swatch bars followed by a monospace label**, and on the right the
figure `-231` at very large size with the caption `Hook load on POOH`. This is **literally the TARE figure**:
the same quantity measured twice, the treated version in colour, the reference version in grey.
The section heading is *“FRICTION REDUCTION WHILE DRILLING. PROVEN BY DATA.”*
We also take: the **2×2 module layout with full-width 1px hairlines**, the `▪ PROCESS`
eyebrow (6px orange square + letter-spaced uppercase monospace label), and the **chamfered-corner button**
(an octagon, not a radius) with the `↳` glyph.

**What we do not take from it.** Its **preloader**: the page shows `// PLEASE WAIT` / `// LOADING..` and
a `50 %` counter before showing anything at all. That is exactly TARE's ban no. 1. Nor its
full-frame 3D product renders — TARE has no object to photograph.

## 1.2 `.txt` (dottxt.ai) — **the best score in my whole sample**

- Entry: https://www.awwwards.com/sites/txt — Nominee, **August 24, 2026**
- Live: https://dottxt.ai
- Community scores: design **8.0** · usability **8.6** · creativity 7.8 · content 8.4 → **≈ 8.2**
- Stack: React · Three.js · Sanity · tags `Retro`, `Transitions`, `Microinteractions`
- Verbatim description: *“Structured generation libraries for developers and AI teams. Build reliable
  LLM-driven applications with schema-compliant, predictable outputs.”*
- Actual tokens: background `#F3F3F3`, ink `#000000`, `border-radius: 0px`, base 4, **h1 267px / body 12px**

**What we take from it.** Three devices, all at zero cost:
1. **The hero object is the real command and its real output.** A floating panel with retro window
   chrome (hairline title bar, `☒` close box) containing `$ dottxt generate --model … --schema '{"valid":"boolean"}'`
   and then, below it, `{"valid": true}`. Not an illustration of the promise: **the promise executed.**
   For TARE: the hero panel contains the two quotes and the delta, not a picture of the delta.
2. **The numbered eyebrow**: a grey `01` chip followed by `BY THE TEAM BEHIND OUTLINES (65M+ DOWNLOADS)`
   in uppercase monospace. Number the sections, put a figure on the claim.
3. **The keyboard-shortcut chip** in every nav item and every button: `P Products`,
   `D Documentation`, `Try the API [A]`. An 18px square, coloured background, monospace letter.
   It says “this is an instrument, not a brochure” in 12 lines of CSS.
   And the **1-bit checkerboard pattern** used as a texture instead of a gradient.

**What we do not take from it.** Its full-screen **cookie banner**, which covers the hero on arrival —
the same fault as SSTR's preloader. And its bitmap display typeface (`neueBit`) is an author's
signature; TARE must not copy it, only keep the principle: *a single display typeface,
radically different from the body face, reserved for a single use.*

## 1.3 Where the Shadow Fell — **the only reference with entirely free typefaces**

- Entry: https://www.awwwards.com/sites/where-the-shadow-fell — Nominee, **August 22, 2026**
- Live: https://eclipses.bogachev.fr — author `aleksandr-bogachev` (the same as wc26)
- Scores: design 7.6 · usability 7.6 · creativity 7.6 · content 7.9
- Stack: WebGL · Three.js · JavaScript · tag `Data Visualization`
- Verbatim description: *“Every solar eclipse from 2000 BCE to 3000 CE on one globe. Pick any city and
  watch the eclipse from inside it, the sky exactly as it stood over that street.”*
- **Actual tokens: `Space Grotesk` (body + headings) + `Space Mono` (figures and metadata).
  Both are on Google Fonts under SIL OFL 1.1.**

**What we take from it.** The proof that **an Awwwards data-visualisation site runs on two
free typefaces**. It is the direct answer to “Berkeley Mono costs money”. And the **division of
roles**: a grotesque for prose, a monospace for everything that is a figure, an identifier or
a label. Never the reverse.

**What we do not take from it.** The Three.js globe. TARE has **no spatial data** (doc 34, §11).

## 1.4 WC 2026 — Data Portraits

- Entry: https://www.awwwards.com/sites/wc-2026-data-portraits — Nominee, **July 27, 2026**, average **7.48**
- Live: https://wc26.bogachev.fr
- Stack: WebGL · Three.js · **GLSL**
- Verbatim description: *“Every FIFA World Cup 2026 match rebuilt in 3D from real data — ~1,500 events
  a game become readable terrain. Real-time WebGL, data-driven crowd sound, live scorer cards. **Coded solo.**”*

**What we take from it.** Three things seen in a screenshot. (a) The **eyebrow preceded by a horizontal
hairline**: `—— FIFA WORLD CUP 2026` in very widely letter-spaced monospace. (b) The **section index in very
large low-contrast monospace**: `01  Knockout`, with the count aligned right (`32 MATCHES`) and a **horizontal
rule under the whole thing**. It is the table-of-contents structure of a technical report, and it is free.
(c) The mention **“Coded solo”** in the Awwwards description itself: that is a jury argument, and
TARE is also a solo project. Write it down.

**What we do not take from it.** The gradient-coloured terrain. The page admits it itself:
*“It's an impression, but one built entirely from data”*. **TARE is not entitled to an impression.**
This is the product that calls out embellished figures; an “impressionistic” image of the measurement would be
a contradiction at the core.

## 1.5 Lidar Drone Scanning

- Entry: https://www.awwwards.com/sites/lidar-drone-scanning — Nominee, **August 29, 2026** — `DawidRiotters`
- Live: https://drone.riotters.com
- Stack: WebGL · Three.js · **Next.js**
- Verbatim description: *“A Riotters R&D experiment turning raw drone LIDAR scans into a real-time 3D
  point cloud, rendered live in the browser with WebGL.”*
- Actual tokens: `Switzer` + `ProtoMono`, background `#FFFFFF`, ink `#171717`, **base 8px**, `radius 0`,
  **h2 240px / body 14px**

**What we take from it.** The **editorial framing of a measuring instrument**: a site that literally
presents *a raw physical measurement* and does not apologise for its technicality. And the 240/14
scale ratio. And the **8px** spacing unit — more rigid than 4, and therefore harder to soil.
The entry lists its named components: `website scroll`, `content switcher`, `menu transition`,
`terrain scan`. **Four movements for a whole site.** That is the animation budget TARE has to hold to.

**What we do not take from it.** The real-time point cloud: that is a 3D rendering of 3D data. Legitimate
for them, untruthful for us. **Nor its typography:** `Switzer` is distributed by Fontshare under the
**ITF Free Font License**, which explicitly forbids redistribution *“through … a repository”* and
any subsetting (§4.4). It cannot go into the TARE repository.

## 1.6 Signal IQ (Setu by Pine Labs)

- Entry: https://www.awwwards.com/sites/signal-iq-setu-by-pine-labs — **Honorable Mention, July 31, 2026**, average **8.19**
- Live: https://marketing.pinelabs.com/signaliq
- Stack: React · TypeScript · Framer · announced palette `#FD0100` / `#000000`
- Actual tokens: `#00E676` (green), `#FD0100` (red), background `#FFFFFF`, ink `#0A0A0A`, `radius 0`
- Verbatim description: *“India's only AI-powered bank statement analyser that reads UPI transactions,
  **uncovering hidden income, obligations and risk signals** traditional BSAs miss.”*

**What we take from it.** The **positioning**, transposable word for word: *“uncovering hidden … signals
traditional [tools] miss”*. It is TARE's sentence in another domain, and it scored 8.19 with an
Honorable Mention. We also take the **two-signed-colour system**: a green and a red, and nothing
else — one says “detected”, the other says “risk”. No decorative colour.

**What we do not take from it.** Its exact palette: `#00E676` on white is below 3:1, illegible
at small sizes. TARE cannot afford that on a dense table.

## 1.7 AI in Design Report 2026

- Entry: https://www.awwwards.com/sites/ai-in-design-report-2026 — **Site of the Day, August 26, 2026** + Developer Award
- Live: https://stateofaidesign.com

**What we take from it.** A single device, seen in a screenshot, but an excellent one: the **1px-hairline
monospace caption chip anchored in the bottom-left corner of a panel** — `DESIGN ENGINEER`, `PRODUCT DESIGNER`,
`BRAND DESIGNER`, `FREELANCER`. Translucent background, 10px letter-spaced uppercase text, hairline border, radius 0.
**This is exactly the component TARE needs** to carry `MEASURED` / `INTERPOLATED` / `NOT_MEASURABLE` /
`NOT_QUOTABLE` without ever resorting to colour (§4.2). And the title sits in a **solid black block**
that overflows the content — a cartouche, not a floating heading.

**What we do not take from it.** The collage of blurred flowers in the background. This is a data report that
chose to show nothing of its data above the fold. **TARE does the opposite.**

## 1.8 Cerebrium

- Entry: https://www.awwwards.com/sites/cerebrium — Nominee, **August 5, 2026** — a team of 8, including Louis Paquet (PRO)
- Live: https://cerebrium.ai
- Stack: GSAP · Three.js · **Cinema 4D** · WebGL · **Lottie**
- Verbatim description: *“Serverless infrastructure for real-time AI. Deploy voice agents, LLMs, and AI
  workloads with instant scaling, global regions, and **built-in observability**.”*

**What we take from it.** Nothing visual. We keep it as a **quantified negative benchmark**: eight people
credited, Cinema 4D, GSAP, Three.js, Lottie — and the result is *nominated*, not Site of the Day.
SSTR, with **one** person credited (Dmitry Golub) and **zero real-time 3D**, took the SOTD and a
Dev Award of 7.58. **On Awwwards, 3D does not replace editorial direction.** For a solo dev with
seven days, that is the most useful piece of information in Part I.

## 1.9 CSS Design Awards — the honest verdict

Opened: https://www.cssdesignawards.com/website-gallery and https://www.cssdesignawards.com/wotd-award-nominees.
**Of the 18 WOTD nominees displayed (August 24–29, 2026), the vast majority are individual
portfolios or agency sites.** The only non-portfolio candidates are `Xerx` (xerx.io/en),
`Charmling` (charmling.app), `Agent Media` (agent-media.ai) and **`ESQRD — Web3 Development`**
(https://www.cssdesignawards.com/sites/esqrd-web3-development/50048/ → https://web3.esqrd.co).

**ESQRD is the only CSSDA reference I keep**, and for a single measured reason: it is a
**web3** site on a `#101010` background with `border-radius: 0`, an `h1` at **110px** and an entirely
desaturated palette (`#998963`, `#70654A`, `#7C756C`) — **no crypto brand colour**. It proves you can
make an award-winning web3 site without purple, without a neon gradient and without a mascot. That is all we take from it.

> **Conclusion on CSSDA: a weak source for this project.** The CSSDA scoring is more permissive
> (announced threshold “average score above 8.00” from a jury) and the pool is dominated by portfolios.
> **Awwwards is the right source; CSSDA adds nothing that Awwwards does not give better.**

## 1.10 The eight references, one line each

| # | Reference | Live URL | What we take | What we do not take |
|---|---|---|---|---|
| 1 | **SSTR** | sstr.tech/en | *with / without* figure in 2 colours, modular hairline grid, ▪ eyebrow | the preloader |
| 2 | **.txt** | dottxt.ai | hero = the real command + its real output; shortcut chip; 1-bit checkerboard | the cookie banner, the bitmap font |
| 3 | **Where the Shadow Fell** | eclipses.bogachev.fr | Space Grotesk + Space Mono, both OFL; prose/figures division | the Three.js globe |
| 4 | **WC 2026 Data Portraits** | wc26.bogachev.fr | section index `01` + hairline + count on the right | the “impressionistic” terrain |
| 5 | **Lidar Drone Scanning** | drone.riotters.com | 8px base, 240/14 ratio, **4 movements for the whole site** | the 3D cloud, **and its Switzer typeface (Fontshare, non-redistributable)** |
| 6 | **Signal IQ** | marketing.pinelabs.com/signaliq | “uncovering hidden signals traditional tools miss”; 2 signed colours | its exact values (insufficient contrast) |
| 7 | **AI in Design Report** | stateofaidesign.com | the hairline monospace caption chip, corner-anchored | the decorative collage above the fold |
| 8 | **ESQRD** *(CSSDA)* | web3.esqrd.co | award-winning web3, `#101010` background, zero crypto colour | its `Play`/`Roboto` headings |

*One extra negative benchmark kept: **Cerebrium** (cerebrium.ai) — 8 authors, C4D + GSAP + Three + Lottie,
and only nominated.*

---

# PART II — THE UNOPENED TOOLBOX, NOW OPENED

29 tools opened one by one. The “verdict” column = usable in the **open source** repository required by
Uniswap, without a watermark and without a no-redistribution clause.

## 2.1 The finds

| Tool | What it is | Licence / free plan (verified) | gzip size | Verdict |
|---|---|---|---|---|
| **Paper Shaders** — https://github.com/paper-design/shaders | canvas shaders, published by paper.design | **Apache-2.0** (`LICENSE` file read) · npm `@paper-design/shaders` Apache-2.0 · **0 dependencies** · free Paper plan, **no watermark** on the pricing page | **59.9 kB** | **YES**, as an option only (§5) |
| **usgraphics/usgc-themes** — https://github.com/usgraphics/usgc-themes | the **real** US Graphics palettes | **BSD-3-Clause**, 166 ★ | 0 | **YES — the find** |
| **usgraphics/usgc-machine-report** — https://github.com/usgraphics/usgc-machine-report | the TR-100 Machine Report | **BSD-3-Clause**, 583 ★ | 0 | **YES** (doctrine, §4) |
| **Uiverse** — https://uiverse.io | 7,418 community UI elements | **MIT** confirmed by the `LICENSE` of `uiverse-io/galaxy` (12,220 ★): *“Copyright (c) 2023 Uiverse.io”*, attribution *“not mandatory”* | 0 (CSS) | **YES on the licence**, but ~95% of the catalogue is neon/glassmorphism, unusable here |
| **Motion Primitives** — https://motion-primitives.com | copy-paste animated components | **MIT** (`ibelick/motion-primitives`), 6.1k ★ | 0 (+ `motion`) | **YES** |
| **Matter.js** — https://brm.io/matter-js/ | 2D physics engine | **MIT**, 0 dependencies | 25.9 kB | **NO** — TARE has nothing to drop |
| **Haikei** — https://haikei.app | SVG asset generator | *“You can use Haikei for both personal and professional projects”*, *“you do not need to credit Haikei”* | 0 | **YES**, but we have no use for it (no waves, no blobs) |
| **neumorphism.io** — https://neumorphism.io | `box-shadow` generator | **BSD-3-Clause** (`adamgiebl/neumorphism`) | 0 | **NO** — the charter forbids shadows (§4.5) |
| **Khroma** — https://khroma.co | AI palette generator | no terms of service found, free | 0 | **NO** — TARE's palette is **computed**, not chosen (§4.1) |
| **svgl.app** — https://svgl.app | ~666 SVG logos | **MIT** (`pheralb/svgl`) | static | **YES** for the Uniswap / Base / Hedera logos — ⚠️ the trademarks still belong to their owners |
| **Component Gallery** — https://component.gallery | 60 components × 95 design systems | no licence, free to browse | 0 | **YES** as a naming reference |
| **UI Guideline** — https://uiguideline.com | 38 components × 20 design systems, ARIA specs | free site; Spec Packs $9/$149 | 0 | **YES** for free browsing. **Do not pay** |
| **Design Spells** — https://designspells.com | gallery of interface micro-details | no licence, no terms of service | 0 | **YES** as inspiration, **NO** as a source of code |
| **Figma MCP (remote)** — help.figma.com/hc/en-us/articles/32132100833559 | official Figma MCP server | **remote** server: *“all seats and plans”*. Desktop server: *“a Dev or Full seat”* on *“all paid plans”* | 0 | **YES** technically — **NO** in practice: you need a Figma file first, and you will not have the time in 7 days |
| **LottieFiles** — https://lottiefiles.com/page/license | Lottie animations | **Lottie Simple License**: explicit commercial use, *“Use of Files without attributing the creator(s) is permitted”*, **no watermark** — but **share-alike**: each `.json` stays under that licence | 33 kB (dotLottie) | **NO** — 33 kB of runtime for what `motion` already does, plus a second licence to document |
| **Transitions.dev** — https://transitions.dev/terms.html | copy-paste CSS/React transitions | *“unlimited personal and commercial projects”* BUT *“you may not … redistribute the library itself … as a competing … component kit”* | 0 | **⚠️ YES for 3–4 snippets maximum.** An MIT-licensed repository would advertise a redistribution right that this licence does not grant you |

## 2.2 The rejects, with the exact reason

| Tool | Reason — verified |
|---|---|
| **Spline** — spline.design/pricing | **Doubly disqualified.** Free plan: *“Web exports **with watermark**”*; “No watermark on web exports” only arrives at Hobby $12/mo. **And** `@splinetool/react-spline` and `@splinetool/runtime` declare `license: None` on npm — so **all rights reserved by default**. Runtime 35.5 MB uncompressed |
| **Rive** — rive.app/pricing | The `@rive-app/react-canvas` runtime is indeed **MIT**, but the Free plan **does not allow export**: *“FREE TO CREATE · $9/MO TO SHIP”*, and “Export .riv files” is the key feature of the **Cadet $9** plan. Not a watermark — a total block. 55 kB + WASM ~4.8 MB |
| **ShaderGradient** — shadergradient.co | MIT declared on npm and in the README, **but no `LICENSE` file in `ruucm/shadergradient`** (2,153 ★, GitHub API → `license: None`). Above all: peer-deps `three` (182 kB gz) + `@react-three/fiber` (52 kB gz) → **≈ 283 kB gzip for a gradient**. Paper Shaders does the same thing in 60 kB with no dependencies |
| **Intangible** — intangible.ai/pricing | ⚠️ `intangible.studio` **has no DNS**. On the real domain: Free = *“Download images: **Watermarked**”*, *“Download video: **Watermarked**”*, *“3D scene export: ✕”* |
| **Meshy AI** — meshy.ai/pricing | Free: *“we grant you a CC BY 4.0 license instead”* + *“We kindly ask that you credit Meshy”*. And off topic: there is no 3D object in TARE |
| **Rotato** — rotato.app/pricing | **No free plan.** Basic **€79**, Standard €89, Premium €199, “One-time payment”. And it is a mobile-device mockup tool |
| **Mobbin** — mobbin.com/pricing | Proprietary content (screenshots of third-party apps). *“© Mobbin 2018–2026. All rights reserved”*, *“non-exclusive”* licence. Free: no screen downloads. **Private inspiration only** |
| **Screenlane** — screenlane.com | ⚠️ **301 permanent redirect to pageflows.com.** The service no longer exists under that name. Page Flows: **no free plan**, 3-day trial at $2.95 then $13/month |
| **wonjyou.studio** | ⚠️ **Error in the starting list.** This is Won J You's **design coaching and mentoring** site (Calendly + email). Nothing to take from it |
| **Icons8** — Icons8 help center | Free: *“Must embed on their website … at least one visible and clickable link to the website of Icons8”*. **Backlink mandatory** |
| **svgs.app** | ⚠️ **Different from svgl.app.** An AI SVG generator. Terms: *“Users on the free plan are granted a … license to use Generated Content for **personal, non-commercial purposes only**”* |
| **21st.dev** — 21st.dev/terms | **No global licence.** *“are the sole and exclusive property of their respective authors and 21st Labs Inc.”* Importable only component by component, with the individual licence verified |
| **termcn** — termcn.dev | ⚠️ **Major trap.** The name, the `shadcn-labs` org and “works seamlessly with shadcn/ui” suggest a web library with a terminal aesthetic. That is false: *“Built on **Ink and OpenTUI**”* — it renders in a **real terminal (stdout)**, not in the DOM. Cleanly MIT, **zero reusable lines** |
| **Framer** — framer.com/pricing | *“The 'Made in Framer' badge will automatically disappear once you connect a custom domain or upgrade”* → custom domain = paid. And it does not produce an open source repository |
| **Webflow** | Free Starter: `.webflow.io` subdomain, **2 static pages**, “Made in Webflow” badge. Insufficient for two surfaces. *(exact pricing: **UNVERIFIED** live — page inaccessible, figures taken from the help center)* |

## 2.3 The final front-end stack, with the real sizes

Measured against the Bundlephobia API on 2026-08-29, licences read on npm and `raw.githubusercontent.com`:

| Package | Licence | gzip | Role |
|---|---|---|---|
| `uplot` **1.6.32** | **MIT** | **21.3 kB** · 0 deps | the curve |
| `@tanstack/react-table` **9.2.4** | **MIT** | **31.0 kB** | the dense matrix |
| `motion` **13.1.1** | **MIT** — *“Copyright (c) 2024 Motion B.V.”* | **44.3 kB** | table state transitions |
| `d3-scale` **4.0.2** | **ISC** | **15.6 kB** | log / sequential scales |
| `shadcn/ui` | **MIT** — *“Copyright (c) 2023 shadcn”* | copied into the repository | primitives |
| `clsx` 2.1.1 | MIT | 0.3 kB | — |
| *(optional)* `@paper-design/shaders` 0.0.80 | **Apache-2.0** | 59.9 kB · 0 deps | animated hero background |

**Mandatory total excluding React: 112.5 kB gzip.** With React+ReactDOM (~45 kB): **≈ 158 kB**.
With Paper Shaders: **218 kB**. *(→ see §5.9: the shader is lazy-loaded or cut.)*

---

# PART III — `getdesign.md`

## 3.1 What it actually is

https://getdesign.md — a directory of `DESIGN.md` files ready to hand to a coding agent, so that
a generated UI carries an identified visual language instead of the default output.
**URL scheme: `https://getdesign.md/<brand>/design-md`.** Installation announced on every entry:

```
npx getdesign@latest add vercel
```
> *“Run this command from your project root, then ask your AI assistant to use DESIGN.md for UI work.”*

**Verified catalogue (~76 brands)**: Airbnb, Airtable, Apple, Binance, BMW, BMW M, Bugatti, Cal.com,
Claude, Clay, **ClickHouse**, Cohere, Coinbase, Composio, Cursor, Dell (1996), Discord, ElevenLabs, Expo,
Ferrari, Figma, Framer, HashiCorp, HP, **IBM**, Intercom, Kraken, Lamborghini, **Linear**, Lovable,
Mastercard, Meta, MiniMax, Mintlify, Miro, Mistral AI, MongoDB, Mobbin, Nike, Nintendo (2001), Notion,
NVIDIA, Ollama, OpenCode, Pinterest, PlayStation, **PostHog**, **Raycast**, Renault, Replicate, Resend,
Revolut, Runway, Sanity, **Sentry**, Shopify, Slack, SpaceX, Spotify, Starbucks, Stripe, Supabase,
Superhuman, Tesla, **The Verge**, Together AI, Uber, **Vercel**, Vodafone, VoltAgent, **Warp**, Webflow,
**WIRED**, Wise, xAI, Zapier. Plus a second series under `/design-md/<slug>` (Ramp, Kalshi, Steep,
Specify, Basehub, Superlist, Whimsical, Linear…).

## 3.2 ⚠️ The licensing caveat, to read before committing anything at all

Terms of service read on https://getdesign.md/terms:

> *“All DESIGN.md files available in the public directory are free to browse, download, and use in your
> projects. These files are provided 'as is' without warranty”*

> *“All trademarks, brand names, logos, and product names referenced anywhere on the Service … are the
> property of their respective owners”*

And every entry carries the warning:
> *“Independent analysis of publicly observable patterns … **Not affiliated with or endorsed by** ClickHouse;
> ClickHouse and its logo are trademarks of their respective owner.”*

**Operational translation: “free to use in your projects” ≠ a right of redistribution.**
No open source licence is granted on the free files.

> **Rule for TARE: read the file, do not commit it.** TARE's public repository contains a
> `DESIGN.md` **written for TARE**, with the structure of Part IV below and **its own values**.
> Committing `clickhouse/DESIGN.md` into an MIT repository, on a sponsored track, means exposing a
> trademark clause to a judge who reads licences.

## 3.3 Which one would work as a starting point — **ClickHouse**

https://getdesign.md/clickhouse/design-md. Four reasons, not one of them a matter of taste:

**a) It is the only one in the catalogue whose product is a measurement engine.** The file opens on:
> *“A high-performance database interface anchored on **near-pure black canvas with electric yellow as
> the brand voltage**. White typography in confident bold sans, yellow CTAs, and **yellow stat numbers**
> carry the brand voice.”*

**b) It already states TARE's colour rule.** Section “01 — Color Palette”:
> *“**Single-accent system.** Electric yellow handles CTAs, stat numbers, and full-bleed yellow CTA bands.
> **Everything else is black canvas + white type + dark surface cards.**”*

**c) It already states TARE's shadow rule.** Section “12 — Elevation & Depth”:
> *“**No drop shadows.** Depth comes from black-canvas vs surface-card subtle contrast and yellow-vs-black
> extreme contrast.”*
> and *“Subtle hairline 1px `#2a2a2a`”*

**d) Its two typefaces are free.** *“Inter at 700 for display (with -1 to -2.5px tracking), 600 for
sub-titles + buttons, 400 for body. **JetBrains Mono for code**.”* — Inter and JetBrains Mono are both
under **SIL OFL 1.1** (`google/fonts/ofl/inter/OFL.txt`, `google/fonts/ofl/jetbrainsmono/OFL.txt`).
It is the only serious candidate whose typography we can take over **without buying a licence**.

**The surface ramp can be taken over directly** (these are grey values, and not protectable):
`canvas #0a0a0a` → `surface-soft #121212` → `surface-card #1a1a1a` → `surface-elevated #242424` →
`hairline #2a2a2a`. Spacing scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 96`.

**What we reject from ClickHouse:** its `#faff69` yellow (it is a brand colour, and TARE is not
entitled to a decorative brand colour — §4.1) and its radius scale `4 · 6 · 8 · 12 · pill`
(TARE is at 0).

**Second choice, and why it loses.** https://getdesign.md/vercel/design-md is more polished:
*“Vercel's Geist system is an exercise in subtraction: near-black ink on a near-white sheet, where a
single tone carries every heading, CTA, and 1px border”*, a complete type scale
(`display-xl 48px · 600 · lh 48px · ls -2.4px`, `mono-eyebrow 12px · 500 · lh 16px`), spacing scale
`4 → 96`. **It loses for two reasons:** its 100px pill buttons and its 12px-radius cards are
the exact opposite of the measurement in §1.0; and **the Vercel aesthetic has become the default output of
every AI-generated site in 2026** — a judge will read it as “vibe-coded”, which is precisely the
reproach to avoid.

**Not kept, without having judged them visually:** IBM, PostHog, Warp, Sentry, Linear, The Verge, WIRED
— entries that exist (HTTP 200 verified) but **not opened in detail**. **UNVERIFIED.**

---

# PART IV — THE DESIGN CHARTER

> It applies to **both** surfaces. One single difference, stated in §4.1: the instrument only allows
> colour to encode a quantity; the presentation page is allowed to occupy more space
> and to climb higher up the type scale. **It is not allowed to add a colour.**

## 4.1 The colour rule, before the palette

1. **Only one chromatic family exists: the measurement ramp.** It encodes `bps`, and only `bps`.
2. **Everything else in the interface is achromatic** — neutrals only.
3. **Only one non-quantitative colour is tolerated: the interaction blue** (focus, link).
   It is **cold**, and therefore never confusable with the ramp, which is warm.
   → *Warm says “this is large”. Blue says “you can act”. Nothing else speaks in colour.*
4. **Qualitative labels are never coloured.** `MEASURED` / `INTERPOLATED` / `NOT_MEASURABLE` /
   `NOT_QUOTABLE` are **typographic**: 10px uppercase monospace, 1px hairline, radius 0
   (the stateofaidesign.com device, §1.7). Colouring a label makes people believe in a quantity.
5. **TARE's brand colour is the top of the ramp.** The product has no pleasant accent colour:
   **its identity colour is its alarm colour.** That is coherent with the thesis, and it can be told as a story.

## 4.2 The measurement ramp — **computed, not chosen**

It does not come from a palette generator. It is the **`inferno`** colormap (perceptually
uniform, published, safe for colour-vision deficiencies, public domain via matplotlib),
truncated to `[0.18 ; 0.90]` and sampled over **7 logarithmic steps**.
US Graphics also publishes `usgraphics/van-gogh` — *“Perceptually linear colormaps”*, **BSD-3-Clause** —
which is the same doctrine.

| Step | `bps` domain | Hex | Cell background (22% over `--bg-1`) | Ink contrast |
|---|---|---|---|---|
| `m0` | 0 | `#390963` | `#191025` | **15.25** |
| `m1` | ]0 ; 1] | `#6A176E` | `#241328` | 14.53 |
| `m2` | ]1 ; 10] | `#9B2964` | `#2F1726` | 13.70 |
| `m3` | ]10 ; 30] | `#CA404A` | `#391C20` | 12.80 |
| `m4` | ]30 ; 100] | `#EB6628` | `#402418` | 11.74 |
| `m5` | ]100 ; 300] | `#FB9B06` | `#443011` | 10.39 |
| `m6` | > 300 | `#F6D746` | `#433D1F` | **9.05** |

*Contrast computed for the ink `#E8EAED` — **floor 9.05: AAA (7:1) held on every step.***
Contrast decreases **monotonically** with the value: it never contradicts the encoding, it doubles it.

**Building a cell** (identical in light and dark):
`background: color-mix(in srgb, var(--m-N) 22%, var(--bg-1))` **+** `box-shadow: inset 3px 0 0 var(--m-N)`.
The fully saturated bar carries the signal, the background carries the ordering, **the ink never changes**.
> An ink that changed colour with the background would make contrast vary without encoding anything at all.

`m6` **is** TARE's brand colour: **`#F6D746`**.

## 4.3 The complete palette

### Dark mode — **the default**

```css
:root {
  /* surfaces — grey ramp, ClickHouse doctrine §12: depth is a surface step, not a shadow */
  --bg:          #08090A;  /* canvas */
  --bg-1:        #101214;  /* panel, even table row */
  --bg-2:        #17191C;  /* elevated panel, input field */
  --bg-3:        #1E2125;  /* row hover, sticky header */

  /* hairlines — 1px, never 2 except for the header rule */
  --line:        #24272B;
  --line-strong: #383C42;

  /* inks */
  --ink:         #E8EAED;  /* primary text, figures */
  --ink-2:       #A2A9B0;  /* labels, column headers */
  --ink-3:       #6B7178;  /* units, uncertainties, provenance */
  --ink-4:       #454A50;  /* tick marks, axis hairlines */

  /* measurement ramp — the ONLY chromatic family */
  --m-0: #390963; --m-1: #6A176E; --m-2: #9B2964; --m-3: #CA404A;
  --m-4: #EB6628; --m-5: #FB9B06; --m-6: #F6D746;

  /* the only non-quantitative colour — cold, and therefore not confusable */
  --focus:       #3376F6;  /* usgraphics/usgc-themes · RETICLE · Ansi 12 · BSD-3-Clause */

  /* reference series — ALWAYS grey. The counterfactual has no colour. */
  --baseline:    #6B7178;
}
```

**Provenance of the accents.** `#3376F6` is the `Ansi 12 Color` value of the **RETICLE** theme from
`usgraphics/usgc-themes`, under **BSD-3-Clause** — read in
`themes/iterm/USGC-RETICLE-IT.itermcolors`. The complete theme, if you want other values that are
authentically US Graphics and **legally reusable**:
`Background #000000` · `Foreground #459A65` · `Ansi 1 #CD0400` · `Ansi 3 #F6C443` · `Ansi 5 #EA3D8D` ·
`Ansi 8 #484747` · `Ansi 15 #FEFEFF` · `Cursor #868D96`.
> **This is the clean answer to the “Berkeley Mono costs money” problem: US Graphics publishes its colours
> under BSD-3-Clause. We take the colours at the source, under licence, without buying the typeface.**

### Light mode — same system, ramp re-anchored

```css
:root[data-theme="light"] {
  --bg: #F7F7F5; --bg-1: #FFFFFF; --bg-2: #F0F0ED; --bg-3: #E7E7E3;
  --line: #D9D9D4; --line-strong: #B4B4AE;
  --ink: #14171A; --ink-2: #4A4F55; --ink-3: #767C83; --ink-4: #A8ADB3;
  /* YlOrRd [0.05;0.80] — an inverted inferno would be illegible on paper */
  --m-0:#FFF8BB; --m-1:#FFE590; --m-2:#FECA66; --m-3:#FEA446;
  --m-4:#FD7435; --m-5:#F23924; --m-6:#D41020;
  --focus:#1B4FC4; --baseline:#767C83;
}
```
Cell backgrounds computed at **30%** over `#F7F7F5`: ink contrast from **16.67 to 9.94**. AAA held.

**Why dark is the default, and it is not a matter of taste.** The ramp encodes an
extraction. On a black canvas, `0 bps` almost merges with the background and `> 1,000 bps` is incandescent:
luminous intensity runs in the same direction as the quantity. On white paper, a warm ramp has to
start at a yellow that is already visible — **“zero” would have an appearance**. Dark is the mode in which the ramp
lies the least.

## 4.4 Typefaces — real names, real licences, real sizes

### ⛔ Berkeley Mono is doubly disqualified — verified

On https://usgraphics.com/products/berkeley-mono, the licence section says, textually:

> *“**Commercial licenses are not compatible with open-source apps.** Commercial use restricted to UI
> elements only. If you're building an IDE, Terminal app, Text Editor, etc., we generally do not allow it”*

It is not only paid (~$75 for the Developer licence / personal use, catalogue ref. `FX-102`;
*“Commercial use is not covered”*). **It is explicitly incompatible with an open source repository.**

And the free `FX-050` trial is not a way out: https://usgraphics.com/catalog/FX-050 —
*“All trial typeface stock units are valid for 7 days and can be used for evaluation purposes only”*,
**Commercial Use: No**, and the `/`↔`\` and `*`↔`#` glyphs are **deliberately swapped** to make
any real use impossible. The spec sheet for SKU TX-02 (Berkeley Mono v2) carries
*“Proprietary and non-transferrable”*.

> **This sentence deserves to be quoted as is in TARE's `DESIGN.md`.** It explains in one
> line why the project does not carry the typeface of its own aesthetic reference.

### ⛔ And Fontshare too — a non-obvious trap

**Satoshi, General Sans and Switzer are marked “Closed Source” on Fontshare** and governed by
the **ITF Free Font License v2.0** (https://www.fontshare.com/licenses/itf-ffl). Literal quotes:

> *“The Font Software may not … be distributed … or otherwise made available to any other person or
> entity, whether for free or for a fee. **This includes distributing the Font Software through another
> font website, font library, marketplace, repository**, download service, application or platform”*

> *“You may not modify … the Font Software … **This includes modifying or replacing glyphs, subsetting,
> format conversion**”*

**Committing a Satoshi or Switzer `.woff2` into a public GitHub repository violates the licence** — the word
“repository” is named there — **and subsetting is forbidden as well.**
⚠️ **Consequence for reference §1.5: drone.riotters.com is set in Switzer. Its typography
cannot be copied.** We take its scale and its spacing unit, not its typefaces.

Discarded for the same reason, all verified as commercial and non-redistributable: **Söhne**
(klim.co.nz), **Suisse Int'l** (swisstypefaces.com), **Neue Haas Grotesk**, **Nitti** (boldmonday.com),
**Basis Grotesque** (Colophon). *(Exact prices: **UNVERIFIED** — pricing tables loaded in JavaScript.)*

### The free typeface CLOSEST to Berkeley Mono: **Ioskeley Mono**

https://github.com/ahatem/IoskeleyMono — **SIL OFL 1.1** (`Copyright (c) 2025, Ahmed Hatem`,
`LICENSE` file read). It is a reconstruction of Berkeley Mono by the **Iosevka** engine, and its
`private-build-plans.toml` **publishes the target metrics**:

```toml
zero = "dotted"          # DOTTED zero, not slashed
tittle = "square"        # SQUARE tittle on the i
punctuation-dot = "square"
[metricOverride]  xHeight = 520   cap = 690   ascender = 740
# WIDTHS: 100 = Normal → shape 600
```

That is, on 1000 UPM: **advance 600 · x-height 520 · cap height 690 · dotted zero · square dots.**
The repository itself disclaims any affiliation: *“not an official version, is not affiliated with, and
is not endorsed by Berkeley Graphics”*.

**Comparative measurements** (fontTools analysis of the binaries; `o-fill` = area of the `o` / area of its bbox,
a perfect circle is 0.785 — **the higher it is, the squarer the counter**, which is the quantitative
proxy for Berkeley's “squarish” quality):

| Typeface | advance | x-h | cap | `o-fill` | zero | licence |
|---|---|---|---|---|---|---|
| **★ target (Berkeley / TX-02)** | **600** | **520** | **690** | **0.890** | **dotted** | proprietary |
| **Ioskeley Mono** | 600 | 520 | 690 | **0.890** | dotted | **OFL 1.1** |
| **JetBrains Mono** | 600 | 550 | 730 | **0.862** | dotted | **OFL 1.1** |
| IBM Plex Mono | 600 | 516 | 698 | 0.812 | dotted | OFL 1.1 |
| Commit Mono | 600 | 540 | 700 | 0.797 | slashed *(see below)* | OFL 1.1 |
| Geist Mono | 600 | 530 | 710 | 0.810 | slashed | OFL 1.1 |
| Departure Mono | 636 | 545 | 727 | **1.000** | dotted | MIT + OFL 1.1 |
| Martian Mono *(SemiExpanded)* | **700** | 600 | 800 | 0.812 | slashed | OFL 1.1 |
| Space Mono | 612 | 496 | 700 | 0.804 | dotted | OFL 1.1 |

*(Honest caveat: this metric does not capture “character”. Space Mono ranks well and remains
a highly distinctive Colophon display face, visually far from Berkeley.)*

### The decision, and its cost

| | Ioskeley Mono | **JetBrains Mono** |
|---|---|---|
| measured proximity | **identical** | 2nd (0.862 vs 0.890) |
| licence | OFL 1.1 | OFL 1.1 |
| variable | **no** — 40 static files | **yes**, `wght` 100–800, **a single file** |
| CDN / Google Fonts | **no** | yes (Google Fonts, Fontsource, jsDelivr) |
| Latin woff2 size | **≈94–96 kB per cut** → ~190 kB for 2 weights | **39.5 kB for 100→800** |
| maintenance | 2025 project, **single maintainer** | JetBrains, 2020, institutional |

> **Decision: we ship in JetBrains Mono Variable.** 39.5 kB against ~190 kB, one file against two,
> and a continuous weight axis that section 0 needs (800 for the hero, 400 for the table).
> On a page whose acceptance criterion is **LCP < 1.0 s**, an extra 150 kB of fonts is
> indefensible — and that is exactly the kind of trade-off this product claims to know how to make.
>
> **Typesetting correction, because the difference is real:** JetBrains Mono has an x-height of 550
> against 520 and a cap height of 730 against 690. At the same size it looks **~6% larger** and more
> “2020 product” than “1975 technical manual”. **Compensate by dropping the size by 1px on the
> table and opening the letter-spacing by +0.02em on labels.** This is already in the scale in §4.6.
>
> **Ioskeley remains the right answer to the question asked** — *“what is the closest free
> equivalent?”* — and deserves a line in the `DESIGN.md`. Only ship it if you abandon the LCP budget.

*A useful note if you want the Berkeley traits without changing typeface:* **Commit Mono** (OFL 1.1,
`LICENSE-FONT` file in the `eigilnikolajsen/commit-mono` repository) exposes **`cv07` = dotted zero** and
**`cv03` = square dots** in OpenType — `font-feature-settings: 'cv07', 'cv03';` — and its configurator
(commitmono.com, section “07 Customize”) bakes those settings into a variable woff2. The trade-off:
it has the **roundest** counter in the panel (0.797), which is precisely the trait it lacks.

### The prose typeface — **Instrument Sans**, and not Inter

| Role | Typeface | Licence | Source | **measured** Latin woff2 |
|---|---|---|---|---|
| **everything that is structure, figure, label, table, AND the hero headline** | **JetBrains Mono Variable** *(100–800)* | **SIL OFL 1.1** — `google/fonts/ofl/jetbrainsmono/OFL.txt` | `@fontsource-variable/jetbrains-mono` | **39.5 kB** |
| **prose only** (the lead, the “what I do not know” page) | **Instrument Sans Variable** *(400–700, `wdth` axis 75–100)* | **SIL OFL 1.1** — `google/fonts/ofl/instrumentsans/OFL.txt`: *“Copyright 2022 The Instrument Sans Project Authors”* | `@fontsource-variable/instrument-sans` | **29.4 kB** |

**Total 68.9 kB, of which only 39.5 kB is `preload`ed.**

**Why not Inter.** 73 kB as an `opsz+wght` variable against 29.4, and above all: Inter and Geist Sans
**are the default output of every AI-generated site in 2026**. A judge reads them as
“vibe-coded”. That is the exact reproach this work has to avoid. Instrument Sans is an OFL
neo-grotesque, lighter, with a **width axis of 75–100**, and **its very name is a gift** for a product
that calls itself an instrument.

**The hero headline is in JetBrains Mono ExtraBold, not in a display typeface.** Three reasons:
(1) a fixed advance width at 168px produces the engraved plate of a measuring device, exactly the register
we are after; (2) it is **zero additional bytes**; (3) **the page has a single voice — the headline is
set in the typeface of the table, at 13 times its size.** That is an argument you can write into the
submission. *(It is also what usgraphics does: headings are set in the body face, at very large sizes.)*

### The two possible extensions, if you have the budget

| Typeface | Licence | woff2 | What it brings | Cost |
|---|---|---|---|---|
| **Departure Mono** | **MIT** (© 2024 Helena Zhang & Tobias Fried) + OFL 1.1 in the release zip | **22.5 kB** (a single cut) | A **pixel** typeface (UPM 550, `o-fill` 1.000) for **the `TARE` wordmark alone** in the header and the footer — the dottxt device (§1.2) | +22.5 kB, **illegible at text sizes, do not use it anywhere else** |
| **Archivo Variable** *(`wdth` 62–125 + `wght` 100–900)* | OFL 1.1 — `Omnibus-Type/Archivo` | 34.1 kB (`wght` only) / **90.1 kB** with `wdth` | A **real width axis** in a single file: condensing the hero headline to 62% is the editorial lever that separates a generic hero page from an instrument composition | +34 to 90 kB |
| *(off topic but worth knowing)* **Redaction** — redaction.us | **OFL** — *“you can use them freely in your products and projects – print or digital, commercial or otherwise”* | 27.7 kB | A Times/Century hybrid with **pixels in the joins** and **7 grades of degradation** (fax/photocopy), drawn for *The Redaction* exhibition at MoMA PS1 | conceptually magnificent for a “redacted” document, but TARE **reveals**, it does not redact |

**Verdict: only add Departure Mono for the wordmark, and only if section 0 looks flat to you
once it is built. Not before.**

## 4.5 Borders, radii, shadows

```css
--radius: 0;                    /* EVERYWHERE. No exception. Measured 6/6 (§1.0) */
--border: 1px solid var(--line);
--border-strong: 1px solid var(--line-strong);   /* rule under the table header */
--focus-ring: 0 0 0 2px var(--bg), 0 0 0 4px var(--focus);   /* offset, never a glow */
```

- **No drop shadows. Ever.** *“No drop shadows. Depth comes from … subtle contrast”*
  (ClickHouse `DESIGN.md`, §12). Depth is done with the step `--bg` → `--bg-1` → `--bg-2` → `--bg-3`
  and with the 1px hairline. `neumorphism.io` is discarded for that reason, not for its licence.
- **No gradient on an interface element.** A gradient on a surface is a phantom encoding.
  A gradient is only allowed **inside** the measurement ramp, where it encodes something.
- **One single optional exception in shape:** the **chamfer** on the main CTA (the SSTR device,
  §1.1) — `clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)`.
  Zero kilobytes. **One single element in the whole page.** It is not a radius: the edges stay sharp.
- **Everything is aligned to a 1px grid.** No fractional values. An instrument has no half-pixels.

## 4.6 Type scale — quantified

**Instrument** (`tare.xyz/hooks`), base **13px**, all in JetBrains Mono:

| Token | px | line-height | letter-spacing | use |
|---|---|---|---|---|
| `data-xs` | 10 | 14 | +0.04em | uncertainty, unit, provenance (3rd tier of a cell) |
| `data-sm` | 11 | 16 | +0.02em | 2nd tier of a cell (`±0`, `block 50,550,000`) |
| `data` | **13** | 18 | 0 | **table body, the number** |
| `data-lg` | 16 | 22 | −0.01em | highlighted value on an entry |
| `label` | 11 | 12 | **+0.10em** | UPPERCASE: column headers, `MEASURED` chips |
| `title-sm` | 16 | 20 | −0.01em | — |
| `title` | 20 | 24 | −0.02em | panel title |
| `title-lg` | 28 | 32 | −0.02em | hook entry title |
| `metric` | 44 | 40 | −0.03em | the verdict of an entry |

**Presentation page** (`tare.xyz`):

| Token | value | typeface | use |
|---|---|---|---|
| `hero` | `clamp(56px, 11vw, 168px)` / lh **0.88** / ls **−0.045em** / 800 | JetBrains Mono | the hero line |
| `metric-xl` | `clamp(72px, 16vw, 240px)` / lh 0.82 / ls −0.05em / 800 | JetBrains Mono | **the measured number** |
| `h2` | `clamp(28px, 4.2vw, 56px)` / lh 1.0 / ls −0.03em / 700 | JetBrains Mono | section headings |
| `lead` | `clamp(17px, 1.4vw, 21px)` / lh 1.5 | **Instrument Sans** | the paragraph under the hero |
| `body` | 16 / lh 1.6 | **Instrument Sans** | prose, **68ch max** measure |
| `caption` | 11 / lh 1.3 / ls +0.10em / UPPERCASE | JetBrains Mono | eyebrows, captions, `01` index |

**Scale ratio: 240 / 16 = 15:1.** Within the range measured on the references (17:1 at
drone.riotters, 22:1 at dottxt), and **it costs nothing** — it is the only free “Awwwards” gesture.

**Figures:** `font-variant-numeric: tabular-nums;` **globally**, and `font-feature-settings: "zero" 1;`
(slashed zero) on any hexadecimal data. A hook address without a slashed zero is a reading trap.

## 4.7 Spacing scale — quantified

Base **4px** (like Vercel, ClickHouse, SSTR, dottxt, esqrd — measured):

```
s1 4 · s2 8 · s3 12 · s4 16 · s5 24 · s6 32 · s7 48 · s8 64 · s9 96 · s10 128 · s11 192
```

- **Instrument**: row height **28px** (dense) / 36px (comfortable, adjustable) ·
  cell padding `6px 10px` · gutters `16px` · sticky header `32px`.
- **Presentation page**: section band `128px` top and bottom at ≥1024px, `64px` below ·
  container `max-width: 1440px` · **12-column grid, 24px gutter** ·
  side margin `clamp(16px, 4vw, 64px)`.
- **Breakpoints** (taken from ClickHouse §13, consistent with the stack):
  `375 · 768 · 1024 · 1280 · 1440`.

## 4.8 Animation — quantified durations and curves

**The rule first, the values afterwards:**

> **R1. Nothing is allowed to delay the display of the verdict.**
> No preloader *(SSTR's mistake)*. No blocking cookie banner *(dottxt's mistake)*.
> No hijacked scroll. **No entrance animation on the hero content.**
>
> **R2. A number never animates its value.**
> A counter climbing from 0 to 1,176 displays **false numbers for 800 ms**. That is exactly the
> dishonesty the product calls out. **A number may move or appear; it never computes
> itself on screen.** *(To be written into the `DESIGN.md`; it is a jury argument.)*

```css
--t-feedback:   90ms;   /* hover, focus, checkbox */
--t-element:   180ms;   /* row reordering, filter, panel opening */
--t-view:      280ms;   /* view change */
--t-data:      320ms;   /* drawing the curve, once only */
/* ABSOLUTE CEILING: 400ms. Nothing goes beyond. */

--e-enter: cubic-bezier(0.16, 1, 0.30, 1);   /* expo-out: leaves fast, settles slowly */
--e-exit:  cubic-bezier(0.40, 0, 1, 1);      /* accelerates and clears out */
--e-move:  cubic-bezier(0.20, 0, 0, 1);      /* reordering */
```

- **Banned:** `ease-in-out` on data · any spring (`spring`, `bounce`) on a number — a
  spring overshoots the target value, and therefore **displays a false value** · any infinitely looping
  animation outside a real loading indicator · parallax.
- **Stagger (`stagger`): 24 ms, 5 elements maximum, ceiling 120 ms.** The budget of reference §1.5:
  **four movements for the whole site.**
- **`prefers-reduced-motion: reduce`** → all durations to `0.01ms`, except opacity fades at 90 ms.
  Non-negotiable: it is an accessibility criterion a judge can test with a single system toggle.

## 4.9 The rules specific to measurement

**The curve** (taken from doc 34 §12, with the implementation):
- **logarithmic** X axis — `d3.scaleLog()`;
- Y axis **anchored at 0** by default; zoom exists but carries the explicit label `ZOOM · Y NOT ANCHORED`;
- the 5 points **stay points** (`r = 3px`, filled), never smoothed into a spline (`spline: false` in uPlot);
- uncertainty is drawn (1px vertical bar, `--ink-4`);
- **the reference series — the stub — is ALWAYS `--baseline`, a grey.** The counterfactual has no
  colour, because it has no quantity. *(This is SSTR's `WITH FRS` / `WITHOUT FRS` legend, §1.1.)*

**The three-tier cell** (js-framework-benchmark, doc 34 §10):
```
1176            ← data 13px, --ink, tabular-nums
±0              ← data-sm 11px, --ink-3
block 50550000  ← data-xs 10px, --ink-3
```
background = ramp at 22% · 3px inset left bar at full saturation · **`--ink` never changes**.

**The 14-LED widget** (doc 34 §13): 14 squares of **10 × 10 px**, 4px gutter, 1px `--line` hairline,
radius 0. On = solid `--m-6`. Off = `--bg-2`. Label under each LED in vertical 10px `label`.
**Zero RPC, zero dependencies:** `BigInt(addr) & 0x3FFFn`. **~30 lines, 0 kB of library.**

---

# PART V — THE `tare.xyz` STORYBOARD

## 5.0 The constraint, and its only honest resolution

> **A useful verdict on screen in under 5 seconds, with no wallet, with no click.**

There is only one architecture that holds this constraint: **the presentation page *is* the verdict.**
We are not building a marketing page that leads to the instrument; we are building a page whose first screen
already contains a real measurement and a real tool.

**Technical consequence, to be decided before writing a single line: the first screen is static HTML,
with the measured number baked in at build time.** Zero JavaScript is required to read the verdict. JS
only arrives to make the widget interactive, and it is ~1 kB inline. The rest of the bundle
(React, the table, uPlot) is **route-split** and only loads on `/hooks` and for sections 3–4.

**Display budget:** critical HTML+CSS **< 14 kB** (one TCP window) · JetBrains Mono `preload`
39 kB · **target LCP < 1.0 s**, hard ceiling **1.5 s cold** (the doc 34 test, D3).

## 5.1 Section 0 — `HEAD` · 0 → 100vh

**What you see.** `--bg` background. Top left, the `TARE` wordmark in `caption` with a hairline.
Top right, two links only: `INSTRUMENT →` and `SOURCE →`. No menu, no burger.

Left column (7/12):
```
——  UNISWAP V4 · BASE · BLOCK 50,550,000       ← caption, hairline prefix (device §1.4)

84 HOOKS.                                       ← hero, clamp(56,11vw,168), lh 0.88, ls -0.045em
ZERO DECLARE.

Uniswap asks hooks to declare for themselves what they take, through the
HookSwap and HookFee events. Of the 84 hooks deployed over the last
24,000 blocks, zero do. So I measured it.         ← lead, Instrument Sans, 21px
```
Right column (5/12), in a 1px-hairline panel, radius 0 — **the hero object is the tool, not an
image of the tool** (the dottxt device, §1.2):
```
┌ PASTE A HOOK ADDRESS ──────────────────────┐
│ 0x…                                        │   ← input field, JetBrains Mono 13px
│ ▪▪▫▪▫▫▪▫▪▫▫▪▫▪   14 LEDs already lit       │
│ BEFORE_SWAP · AFTER_SWAP · …               │
├────────────────────────────────────────────┤
│ MEASURED          1176 bps                 │   ← metric-xl, baked in at build
│ hook 0xb429d6… · pool 0x… · block 50550000 │   ← data-xs
│ [MEASURED]                                 │   ← hairline chip (§1.7)
└────────────────────────────────────────────┘
```

**What moves.** *Nothing before paint.* At `t+150 ms`, the **14 LEDs light up in sequence, 24 ms
apart, ceiling 120 ms** — and that is the only entrance animation on the whole page. **It is a datum
being displayed, not a decoration.** The field is focusable immediately; pasting an address
recomputes the LEDs in `--t-feedback` (90 ms).

**Which library.** None. CSS + ~30 lines of inline JS. **+0 kB.**

**An option, and I recommend not taking it.** An animated `@paper-design/shaders` background
(**Apache-2.0, 59.9 kB gzip, 0 dependencies**) mounted after first render via `requestIdleCallback`,
cut under `prefers-reduced-motion`. **The 2 kB alternative: dottxt.ai's 1-bit checkerboard pattern**
(§1.2) as a repeated `background-image`, at 4% opacity. It says the same thing — “this is an
instrument” — for **1/30th of the weight**, and it cannot delay the LCP. **Take the checkerboard.**
*(Honest decision: the shader is an ornament, and the product sells the absence of ornament.)*

## 5.2 Section 1 — `THE FACT` · absence made visible

**What you see.** `01  THE STANDARD NOBODY APPLIES` (monospace index + hairline + count on the
right, device §1.4). Below it, **a grid of 84 cells** of 24 × 24 px, 1px hairline, radius 0,
**all in `--bg-2`, none coloured**. On the right, in `metric`:
```
HookSwap   0 / 84
HookFee    0 / 84
```
**The image is the void.** 84 grey squares. On a page whose only chromatic family encodes
“what is taken”, 84 colourless squares say everything. On hover, a cell shows its address
in a hairline tooltip.

**What moves.** The cells fade in on entering the viewport, **120 ms in total,
with no individual stagger**. Nothing else.

**Which library.** CSS grid + `IntersectionObserver`. **+0 kB.**

## 5.3 Section 2 — `THE METHOD` · the stub

**What you see.** `02  WE DO NOT CHANGE THE POOL, WE CHANGE THE HOOK`. Two panels side by side,
separated by a vertical hairline:
- left — `REAL BYTECODE`: the first 8 lines of the bytecode in hex, `data-xs`, `--ink-3`;
- right — `STUB · 89 BYTES`: the **entire** stub, `data-sm`, `--ink`;
- between the two, in `label`: `anvil_setCode`.

Then three lines of invariants: `same poolId` · `same liquidity` · `same slot0`.
Then the two quotes and the delta, in `metric-xl`.

**What moves.** A **scroll-linked wipe**: the left panel is covered by the right one via
`clip-path: inset()` driven by scroll progress. A single animated property,
composited.

**Which library.** `animation-timeline: view()` in native CSS where it is supported; fallback on
`motion`'s `useScroll` — **already in the bundle** for the table. **+0 kB net.**

## 5.4 Section 3 — `THE CURVE`

**What you see.** `03  THE SAME SWAP, TWICE`. The **real** uPlot curve, following the §4.9 rules:
log X, Y anchored at 0, 5 visible points, uncertainty bars, **reference series in grey `--baseline`**,
measured series in the ramp. Legend as two swatch bars + monospace label — **the SSTR device
taken as is** (§1.1). Under the curve, in `data-xs`: `hook · pool · block · stub_hash · engine_ver`.

**What moves.** The line draws itself from left to right in **320 ms, once only**, on entering
the viewport. On hovering a point: a 1px crosshair cursor and a hairline tooltip, in 90 ms.

**Which library.** `uplot` **21.3 kB gzip** + `d3-scale` **15.6 kB**. Loaded via dynamic `import()`
on viewport crossing. **+36.9 kB, off the critical path.**

## 5.5 Section 4 — `THE MATRIX` (preview)

**What you see.** `04  199 POOLS · 12 DISTINCT HOOKS`. **Twelve real rows** from the instrument's
table, the same three-tier cells, the same ramp, the same density — **no “simplified for
the landing” version**. Then a hairline and a single line: `→ OPEN THE FULL INSTRUMENT`.
*(The chamfered CTA from §4.5 is here, and it is the only one on the page.)*

**What moves.** Nothing. The table is real DOM, sortable by clicking a header; sorting reorders
in `--t-element` (180 ms, `--e-move`).

**Which library.** `@tanstack/react-table` **31.0 kB** + `motion` **44.3 kB**, shared with `/hooks`.
**+75.3 kB, in a shared chunk.**

## 5.6 Section 5 — `WHAT I DO NOT KNOW`

**What you see.** `05  THE LIMITS`. On `--bg-1`, in **Instrument Sans, 16px, 68ch measure** — the only zone of
long prose on the page. Dynamic fees (§0.2 of doc 34), the **9 unique observations and not 11**,
the Clanker attribution **PLAUSIBLE, NOT PROVEN**, the 77.6% not quotable. Every claim carries a
`(hook, pool, block)` permalink.

**What moves.** Nothing. **Deliberately.** It is the section that none of the 27 async finalists wrote
(doc 34, part VIII); it has to read like the footnote of an article, not like a sales
argument.

**Which library.** None. **+0 kB.**

## 5.7 Section 6 — `FOOTER`

The `TARE` wordmark, **the same 14-LED sequence as in the header** (the “same intro/outro animation” rule from the
video plan, doc 34, part VIII), the licence, the commit hash, the repository link, the test count
`N/N green`. **+0 kB.**

## 5.8 What the page does not contain, and that is deliberate

No preloader · no blocking cookie banner · no “Connect Wallet” button ·
no partner-logo carousel · no testimonials section · no custom cursor ·
no parallax · no 3D — **there is no spatial data in this product** (doc 34 §11) ·
no count-up counter (§4.8 R2).

## 5.9 The budget, section by section

| Section | JS added (gzip) | Critical path? |
|---|---|---|
| 0 · HEAD | **~1 kB** inline | **YES** — static HTML, number baked in at build |
| 1 · THE FACT | 0 | no |
| 2 · THE METHOD | 0 net | no |
| 3 · THE CURVE | `uplot` 21.3 + `d3-scale` 15.6 = **36.9** | no — `import()` at the viewport |
| 4 · THE MATRIX | `react-table` 31.0 + `motion` 44.3 = **75.3** | no — chunk shared with `/hooks` |
| 5 · LIMITS | 0 | no |
| 6 · FOOTER | 0 | no |
| React + ReactDOM | ~45 | no — deferred hydration |
| **Page total** | **≈ 158 kB gzip** | **of which ~1 kB before the verdict** |
| *(Paper Shaders option)* | *+59.9* | *no — and I recommend cutting it* |
| Fonts | **39.5 kB** preloaded + **29.4 kB** in `swap` = **68.9 kB** | JetBrains Mono alone is preloaded |

---

# PART VI — THE PROMPT FOR CURSOR / CLAUDE CODE

> To be pasted as is. The references are URLs that can be opened, the bans are explicit, the
> constraints are quantified, and the acceptance criterion is measurable.

```
You are building TARE's presentation page: tare.xyz.

TARE measures what a Uniswap v4 hook actually takes on a swap. Method: on a pinned fork,
we replace the hook's bytecode with an inert 89-byte stub via anvil_setCode, and we quote the
same swap twice. The delta is what the hook takes. Headline fact: Uniswap asks hooks to
declare what they take via the HookSwap / HookFee events; of 84 hooks deployed over
24,000 Base blocks, zero do.

MANDATED STACK, NOTHING ELSE
  Vite + React 18 + TypeScript + Tailwind + shadcn/ui (copied into the repository, MIT)
  @tanstack/react-table (MIT, 31.0 kB gz) · uplot (MIT, 21.3 kB gz) · d3-scale (ISC, 15.6 kB gz)
  motion (MIT, 44.3 kB gz)
  DO NOT INSTALL ANY OTHER PACKAGE WITHOUT ASKING ME. The repository is open source (Uniswap track):
  every dependency must be MIT / Apache-2.0 / BSD / ISC. Commons Clause = immediate refusal.

REFERENCES — open them, take these precise devices, nothing else
  https://sstr.tech/en/          the "with / without" figure: measured series in colour, reference
                                 series in GREY; axes in uppercase monospace; legend as two
                                 swatch bars; modular grid with full-width 1px hairlines
  https://dottxt.ai              the hero object is the real tool and its real output, in a hairline
                                 panel; numbered "01" eyebrow + uppercase monospace label;
                                 1-bit checkerboard pattern instead of any gradient
  https://eclipses.bogachev.fr   the division of roles: monospace for every figure, identifier
                                 and label; sans-serif for prose. Never the reverse
  https://wc26.bogachev.fr       the section index: "01 Title" + horizontal hairline + count
                                 aligned right
  https://stateofaidesign.com    the 1px-hairline monospace caption chip anchored in the corner of a
                                 panel — for MEASURED / INTERPOLATED / NOT_MEASURABLE / NOT_QUOTABLE

CHARTER — exact values, do not negotiate them
  border-radius: 0 EVERYWHERE, no exception (measured on 6/6 of the references above)
  No drop shadow, ever. Depth is a surface step + a 1px hairline
  No gradient on an interface element
  Spacing base 4px: 4 8 12 16 24 32 48 64 96 128 192
  Breakpoints: 375 768 1024 1280 1440 · container max 1440px · 12-col grid, 24px gutter

  Surfaces (dark, default): --bg #08090A · --bg-1 #101214 · --bg-2 #17191C · --bg-3 #1E2125
  Hairlines: --line #24272B · --line-strong #383C42
  Inks: --ink #E8EAED · --ink-2 #A2A9B0 · --ink-3 #6B7178 · --ink-4 #454A50
  Measurement ramp (truncated inferno, 7 steps, the ONLY chromatic family on the whole site):
    --m-0 #390963 · --m-1 #6A176E · --m-2 #9B2964 · --m-3 #CA404A
    --m-4 #EB6628 · --m-5 #FB9B06 · --m-6 #F6D746
  Interaction blue (focus/link only, never a quantity): --focus #3376F6
  Reference series (the stub): --baseline #6B7178 — ALWAYS grey
  Light mode under [data-theme="light"]: --bg #F7F7F5 · --bg-1 #FFFFFF · --ink #14171A ·
    YlOrRd ramp #FFF8BB #FFE590 #FECA66 #FEA446 #FD7435 #F23924 #D41020

  Measurement cell: background color-mix(in srgb, var(--m-N) 22%, var(--bg-1))
                  + box-shadow: inset 3px 0 0 var(--m-N). The ink NEVER changes.

  Typefaces — SIL OFL 1.1, self-hosted via @fontsource-variable, NEVER via the Google Fonts API
  (third-party request at runtime):
    @fontsource-variable/jetbrains-mono  (39.5 kB latin) = EVERYTHING: structure, figures, labels,
      table, AND the hero headline at weight 800. DO NOT ADD a display typeface
    @fontsource-variable/instrument-sans (29.4 kB latin) = prose ONLY, 68ch max measure
    Use NEITHER Inter NOR Geist Sans: they are the default output of every AI-generated site
    preload ONLY JetBrains Mono. Instrument Sans with font-display: swap.
    font-variant-numeric: tabular-nums globally
    font-feature-settings: "zero" 1 on any hexadecimal data
  Scale: hero clamp(56px,11vw,168px)/0.88/-0.045em/800 · metric-xl clamp(72px,16vw,240px)/0.82/
    -0.05em/800 · h2 clamp(28px,4.2vw,56px)/1.0/-0.03em · lead clamp(17px,1.4vw,21px)/1.5 (Instrument Sans) ·
    body 16/1.6 (Instrument Sans) · caption 11/1.3/+0.10em UPPERCASE · data 13/18 · label 11/12/+0.10em

  Animation: --t-feedback 90ms · --t-element 180ms · --t-view 280ms · --t-data 320ms
    ABSOLUTE CEILING 400ms, nothing goes beyond
    --e-enter cubic-bezier(0.16,1,0.30,1) · --e-exit cubic-bezier(0.40,0,1,1)
    --e-move cubic-bezier(0.20,0,0,1)
    stagger 24ms, 5 elements max, ceiling 120ms
    prefers-reduced-motion: reduce -> all durations at 0.01ms except opacity fades at 90ms

EXPLICIT BANS — each one is grounds for rejecting the diff
  1.  No non-zero border-radius. No "rounded-lg", no "rounded-md", no pill button
  2.  No box-shadow except the focus ring (0 0 0 2px var(--bg), 0 0 0 4px var(--focus))
  3.  No gradient, no glassmorphism, no backdrop-blur, no glow effect
  4.  No colour outside the variables above. Zero crypto purple, zero blue-violet gradient
  5.  No animated counter, no count-up, no spring on a number. A number never animates
      its value: a spring overshoots the target and therefore displays a false value
  6.  No preloader, no loading screen, no blocking cookie banner,
      no hijacked scroll, no parallax, no custom cursor
  7.  No 3D, no Three.js, no WebGL. There is no spatial data in this product
  8.  No emoji in the interface. No decorative icon. The only icons allowed are
      functional, with a 1px stroke
  9.  No "Connect Wallet" button. No logo carousel. No testimonials. No pricing block
  10. No coloured label. MEASURED / INTERPOLATED / NOT_MEASURABLE / NOT_QUOTABLE are
      typographic: 10px uppercase monospace, 1px hairline, radius 0. Colouring a label would make people
      believe in a quantity
  11. No centred text beyond one line. Everything is left-aligned on the grid
  12. No invented data. If a value is missing, write NOT MEASURED and leave the cell empty

STRUCTURE — 7 sections, in this order
  0 HEAD 100vh      : left, eyebrow "—— UNISWAP V4 · BASE · BLOCK 50,550,000" then the headline
                      "84 HOOKS. / ZERO DECLARE." then the lead in Instrument Sans.
                      Right, a hairline panel containing the 14-LED widget (14 squares 10x10,
                      4px gutter, on = --m-6, off = --bg-2, computed as BigInt(addr) & 0x3FFFn,
                      100% client-side, no RPC, no dependency) and, below it, the measured number in
                      metric-xl with its hook/pool/block provenance line at 10px.
                      The background carries a 1-bit checkerboard pattern at 4% opacity (CSS background-image,
                      not an image). No entrance animation except the 14 LEDs lighting up at t+150ms,
                      24ms apart, ceiling 120ms
  1 THE FACT        : "01" + grid of 84 hairline cells 24x24, ALL grey, none coloured,
                      and on the right "HookSwap 0 / 84" and "HookFee 0 / 84" in metric. The absence of
                      colour IS the image
  2 THE METHOD      : "02" + two panels (real bytecode | 89-byte stub) separated by a vertical
                      hairline, label "anvil_setCode" between them, then the invariants
                      (same poolId, same liquidity, same slot0), then the two quotes and the delta
  3 THE CURVE       : "03" + uPlot chart, logarithmic X, Y ANCHORED AT 0 by default, 5 points visible
                      as points (r=3, spline: false), uncertainty bars, stub series in
                      grey --baseline, measured series in the ramp. Y zoom exists but carries
                      the explicit label "ZOOM · Y NOT ANCHORED". Dynamic import at the viewport
  4 THE MATRIX      : "04" + 12 REAL rows from the instrument's table, three-tier cells
                      (value 13px / uncertainty 11px --ink-3 / provenance 10px --ink-3), same ramp,
                      same density. No simplified version. Then the only CTA on the page
  5 LIMITS          : "05" + prose in Instrument Sans 16px, 68ch: dynamic fees, 9 unique observations
                      (not 11), attribution PLAUSIBLE NOT PROVEN, 77.6% not quotable. No
                      animation, deliberately
  6 FOOTER          : wordmark, the SAME 14-LED sequence as in the header, licence, commit hash,
                      repository link, test count N/N green

PERFORMANCE — acceptance criteria, I will measure them
  - The first screen is static HTML with the measured number baked in at BUILD time.
    Zero JavaScript is required to read the verdict. The LED widget is ~1 kB of inline JS
  - Critical HTML + CSS < 14 kB
  - LCP < 1.0 s, hard ceiling 1.5 s cold
  - Total page JS < 160 kB gzip. Sections 3 and 4 via import() at the viewport only
  - The verdict is readable in under 5 seconds, with no wallet, without a single click
  - Lighthouse Accessibility >= 95, and the page stays fully usable by keyboard
  - Contrast: all text >= 7:1 (AAA). The ramp is already computed to hold 9.05 at minimum

WORKING METHOD
  First write tokens.css with ALL the variables above, then section 0 alone, and
  stop. I validate section 0 before you write section 1. Do not generate the 7 sections
  in one go. Never "fill in" a missing datum: write NOT MEASURED.
```

---

# PART VII — THE FIVE DECISIONS TO SETTLE

1. **Dark mode as the default** (§4.3) — it is the mode in which the ramp lies the least, but it makes
   printing and the video's screenshots harder. If the video takes priority, switch to light
   and invert the ramp; the system is symmetrical, it is a `data-theme`.
2. **JetBrains Mono rather than Ioskeley Mono** (§4.4) — Ioskeley is **the** answer to “the closest
   free equivalent of Berkeley Mono”: the same metrics to the digit (600/520/690, dotted zero,
   square dots), OFL 1.1. But it costs **~190 kB for two static weights** against **39.5 kB
   for one 100–800 variable**, with no CDN, and with a single maintainer. On an LCP budget < 1.0 s, that is
   a no. **Cite it in the `DESIGN.md`, do not ship it.** If you change your mind, the only legitimate
   trigger is having abandoned the performance budget — not a sudden infatuation.
3. **The shader is cut** (§5.1) — Paper Shaders is legally clean (Apache-2.0) and light for
   what it does (59.9 kB, 0 dependencies), but **the product sells the absence of ornament**. The 1-bit
   checkerboard at 2 kB says the same thing without contradiction.
4. **`getdesign.md` is read, not committed** (§3.2) — ClickHouse is the right starting point, but
   TARE's public repository carries a `DESIGN.md` written for TARE.
5. **Find or drop the usgraphics manifesto quotes** (§0) — `usgraphics.com/manifesto` returns
   a 404 and the sitemap contains no trace of it. Verifiable, licensed replacement in
   `usgraphics/usgc-machine-report` (**BSD-3-Clause**), whose README says:
   > *“**Tabular, short, clear and concise.**”* · *“No emojis (except for the one used as a warning
   > sign). **No colors** (as default, might add an option to add colors).”*
   >
   > It is the same doctrine, in one sentence, **and it can be quoted with its URL.**
