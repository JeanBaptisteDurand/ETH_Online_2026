# TARE — the instrument (`apps/web`)

The dense surface. Not the landing page.

**The absolute rule:** a useful verdict on screen in under 5 seconds, with no wallet, no click,
no sign-up. The table **is** the result; it renders on load. The measured data ships inside the
JavaScript bundle: reading the verdict requires no network request.

```bash
npm install
npm run build     # data -> verify -> tsc -> vite build
npm run preview   # http://localhost:4181
npm run dev
```

## What the page contains

| # | panel | what it does |
|---|---------|----------------|
| 01 | the verdict | four numbers, written and not animated, each recounted at build time |
| 02 | the table | one row per hook. `WHAT THE REGISTRY SAYS` **≠** `WHAT THE MEASUREMENT SAYS` |
| 03 | 14 LEDs | paste an address, 14 LEDs light up. Zero RPC, zero backend, zero latency |
| 04 | the entry | the address, the registry entry, and the disagreement sentence |
| 05 | the curve | size → bps profile. Bare Canvas, logarithmic X, Y anchored at 0 |
| 06 | the raw rows | every measurement, its label, and **its replay command** |

## The three claims, and how they are checked

`npm run verify` exits with code 1 as soon as a claim no longer holds, and it is wired **into**
`npm run build`. An invalidated claim breaks the chain; it does not get displayed anyway.

1. **A hook's 14 permissions ARE the 14 low-order bits of its address.**
   Checked against the snapshot of the official `Uniswap/hooklist` registry: **757 entries out of
   757, 10,598 bit comparisons, zero discrepancy.** The bit order used for the check is **read
   from `src/lib/flags.ts`** — the file shipped to the browser — and not copied into the script.
2. **The registry is qualitative.** Field census: **27 leaf fields, 19 booleans,
   1 numeric (`hook.chainId`, a network identifier), 0 quantitative field.** No field can
   contradict the right-hand column, because no field puts a number on anything.
3. **The derived dataset invents nothing.** `bpsMax`, the pool count, the row count
   and the 60 measurements above 1 bps on `stored_lp_fee = 0` are recounted from
   `docs/measurements-v1.json` at every build. And: no row carries a number without
   the `MESURE` label, and no `MESURE` is without a number.

## The four product rules, in the code

1. **The model never produces a number.** No displayed number is computed client-side:
   they all come from `docs/measurements-v1.json` or from a recount at build time.
2. **Every measurement carries a label** — `MESURE` / `INTERPOLE` / `NON_MESURABLE` /
   `NON_COTABLE`. A hook's label is the **strongest one present**, never an average.
   A label is **never colored**: coloring a label suggests a magnitude.
3. **No conclusion from a truncated response.** A bounded read is a `NON_MESURABLE`,
   never a value. The 58 `NON_COTABLE` rows display `—`, with no ramp background, with their
   revert selector (`7a5ed734` → `NotEnoughLiquidity`).
4. **Every value carries its block, its size and its direction, and replays in one command.**
   The replay command is real and has been run against the fork:

   ```
   cd engine && python3 -c "from tare.poolid import PoolKey; from tare.measure import measure; print(measure('http://127.0.0.1:8545', PoolKey('0x0000000000000000000000000000000000000000','0xb200000000000000000000d7a3d02bfaccc0d601',0,200,'0x985c14baa2a18316ffda0aefb3a632fadfca2acc'), True, 1000000000000000, 50614000))"
   ```

   → `out_with=442747808421317694054679`, `out_without=447218008457966041360433`,
   `bps=99.9557`, `label=MEASURED` — **identical** to row 0 of `docs/measurements-v1.json`.
   A `NON_COTABLE` row was replayed too: same verdict, `NOT_QUOTABLE / NotEnoughLiquidity`.

## The design charter, applied

`border-radius: 0` everywhere · JetBrains Mono Variable (39.5 kB) for everything that is
structure and figures · Instrument Sans Variable (29.4 kB) for prose · **a single chromatic
family**, the `inferno` ramp truncated to `[0.18, 0.90]` over 7 steps, which encodes `bps` and
nothing else · three-tier cell, background at 22% and a 3 px inner left bar, **the ink never
changes** · light mode with the `YlOrRd` ramp re-anchored · no drop shadows, no interface
gradients, no animated numbers · `prefers-reduced-motion` honored.

**The curve** (`src/components/Curve.tsx`, bare Canvas, no charting library): logarithmic X
axis, Y axis **anchored at 0 by default**, zoom available but labeled `ZOOM · Y NON ANCRE`,
points at `r = 3 px` **never spline-smoothed**, the reference series — the stub — **always
grey**, at 0 bps by construction. Opacity encodes the density of overlapping series; **no point
is moved** in order to make it visible.

## Data

| file | role | kept up to date by |
|---|---|---|
| `../../docs/measurements-v1.json` | 128 real measurements, Base, block 50,614,000 | the engine (`engine/`) |
| `public/data/hooklist.snapshot.json` | snapshot of the official registry, pinned to a commit | `npm run registry` (network) |
| `src/data/dataset.json` | derived at build time from the two above | `npm run data` |

`npm run registry` is the only script that needs the network; it is **not** called by the build.

## What I do not know — NOT VERIFIED

- **The size profile only contains 2 sizes**, not 5. `docs/measurements-v1.json` contains
  only `1e15` and `1e17`. The interface spells this out under the curve and plots only the
  points that exist. It does not manufacture the other three.
- **A single block** (50,614,000) and **a single chain** (Base). Nothing here is a time series.
- **`bpsMax` is an observed maximum**, not a possible maximum: it depends on the sizes quoted.
- The LOT B API is not wired in; the data is read at build time from the repository.
- The number of registry entries moves: it was 737, then 757, within an hour. The commit is
  shown in the header and in the footer so the figure can always be traced back.

## Screenshots

`docs/instrument-full.png` (full page, dark) · `docs/instrument-light.png` (light mode) ·
`docs/instrument-zoom.png` (the curve with `ZOOM · Y NON ANCRE` — the exaggeration becomes
visible, which is exactly why the zoom carries a label).
