# apps/landing — the presentation surface

The page a judge sees first. It is not a page that leads to a measurement: **the first screen is
one**, written into the HTML at build time from the corpus the engine produced.

```bash
npm install
npm run build      # regenerates the facts, then builds dist/
npm run budget     # measures dist/ against the acceptance criteria, exits non-zero on a break
npm run dev        # http://localhost:5174
```

`npm run build` runs `build/facts.mjs` first. That script reads the measurement corpus, the
liquid-pool census, the **full census and its scan report** (`docs/dataset/pools-liquides-full.json`
and its `.scan.json`), the **contested-pairs corpus** (`docs/dataset/measurements-contestes.jsonl`),
`engine/tare/stub.py` and `engine/tare/gates/a3.py`, runs the engine's test suite and
`git rev-parse`, and writes `src/generated/facts.json`. **The build fails rather than
render a page with no data, a corpus spanning two blocks, or a label it does not recognise.**

## What is measured about the page itself

```
$ npm run budget

> Les poids ci-dessous ont ete releves a un instant donne. Ils bougent avec le corpus,
> qui grandit : ne les recopiez pas, relancez `npm run budget`, qui les recalcule et
> refuse la page si un critere saute. Un chiffre de poids fige dans une doc devient
> faux au build suivant — c'est le defaut que ce projet reproche partout ailleurs.

  PASS  verdict readable with zero JavaScript          the measured value is a literal in index.html
  PASS  no render-blocking stylesheet                  all CSS inlined in <head>
  PASS  critical document under 15 kB gzip             14.31 kB gzip
  PASS  JS on the first screen under 2 kB gzip         1.74 kB gzip
  PASS  total JS under 160 kB gzip                     26.48 kB gzip across 3 chunks
  PASS  fonts self-hosted, latin only, under 72 kB     2 files, 68.84 kB
  PASS  no third-party origin referenced at runtime    only the source link, and only on click
  PASS  no non-zero border-radius anywhere             radius 0
```

## Layout

```
index.html              the shell: <head>, three injection points, one deferred module
build/facts.mjs         the only place a number enters this page
build/html.mjs          every byte of markup, rendered from facts.json
build/budget.mjs        the acceptance criteria, measured on dist/
build/serve.mjs         a 40-line static server, so dist/ can be checked the way a visitor sees it
vite.config.ts          bakes the sections into index.html, inlines the CSS
data/hook-bytecode.json eth_getCode at the pinned block, read twice, stub-checked
src/boot.ts             the 14-bit register, the reveal, the two import() gates  (1.74 kB gz)
src/sections/curve.ts   uPlot, loaded at the viewport                            (24.3 kB gz)
src/sections/matrix.ts  the sort, loaded at the viewport                         (0.63 kB gz)
src/styles/             tokens · base · sections · uplot (vendored MIT, shipped in the chart's chunk)
public/fonts/           JetBrains Mono + Instrument Sans, latin, SIL OFL 1.1
DESIGN.md               the design system, the references, and every departure from the brief
```

## Sections

```
00  the verdict                 static HTML, the measured value baked in, a live permission decoder
01  the declaration that never comes   84 grey cells, and a registry with no numeric field
02  so it was measured          the finding, the distribution, every hook in the corpus
03  nowhere else to go          how many pairs have a second pool, and what every pool of the eight takes
04  change the hook, not the pool      real bytecode against the 89-byte stub, the two quotes
05  the same swap, five sizes   gate A3's five figures, X log, Y anchored at 0     import()
06  the matrix                  head and tail of the ranking, with the elision counted  import()
07  what I do not know          the labels that are not values, and why
```

## Third party

| package | licence |
|---|---|
| `uplot` 1.6.32 | MIT — © 2024 Leon Sorokin. Its stylesheet is vendored and trimmed in `src/styles/uplot.css` |
| `@fontsource-variable/jetbrains-mono` | SIL OFL 1.1 — `public/fonts/LICENSE-jetbrains-mono.txt` |
| `@fontsource-variable/instrument-sans` | SIL OFL 1.1 — `public/fonts/LICENSE-instrument-sans.txt` |
| `vite`, `typescript` | MIT, build-time only |

`--focus #3376F6` is the `Ansi 12` value of the RETICLE theme in `usgraphics/usgc-themes`
(BSD-3-Clause). The measurement ramp is matplotlib's `inferno`, public domain.

## Known limits

- **The light palette is complete in `tokens.css` but never activated.** Honouring a stored theme
  preference needs JavaScript before the first paint, which is the one thing this page's budget
  forbids. Those tokens are therefore **NOT VERIFIED** in a browser.
- **Two figures have no committed enumeration** — the 84-hook event sweep and the 613-entry
  registry read. Section 01 says so on the same line as the numbers.
- **The critical document is close to its ceiling.** `npm run budget` measures **13.88 kB gzip**
  against the 15 kB criterion, and the figure grows slowly on its own: the label counts, the
  ranking and the hook table are rendered from a corpus that four sweeps are still appending to.
  The next section added here has to buy its bytes from an existing one — section 03 did (DESIGN.md
  §0), and no criterion was relaxed to make room.
- **No Lighthouse run.** The budgets above were measured directly on `dist/`; LCP and the
  Lighthouse accessibility score have **NOT** been measured. Contrast was computed by hand for
  every ink/surface pair and is reported in `DESIGN.md` §2, including the token that failed and
  was changed.
