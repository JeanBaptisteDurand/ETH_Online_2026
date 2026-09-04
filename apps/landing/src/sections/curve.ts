/**
 * Section 04 — the curve. Loaded with import() when the section comes within a screen.
 *
 * Rules it has to obey, and the reason for each:
 *  - X is logarithmic, because the sizes span four decades and a linear axis would put four
 *    of the five measurements on top of each other.
 *  - Y is anchored at 0. A truncated Y axis makes a 6 bps spread look like a collapse.
 *  - The five measurements stay points. They are five observations, not a function, and a
 *    spline through them would draw values nobody measured.
 *  - The counterfactual series is grey. It has no magnitude, so it has no colour.
 */
import uPlot from "uplot";
import "../styles/uplot.css";

type Point = { amount_in: string; bps: number };

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/* Same seven-step ramp as the rest of the page, same domains. */
const RAMP: [number, string][] = [
  [0, "--m-0"], [1, "--m-1"], [10, "--m-2"], [30, "--m-3"],
  [100, "--m-4"], [300, "--m-5"], [Infinity, "--m-6"],
];
const rampVar = (bps: number) => RAMP.find(([max]) => bps <= max)![1];

export function mount(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>("#chart-host");
  const raw = root.dataset.points;
  if (!host || !raw) return;

  const points: Point[] = JSON.parse(raw);
  if (points.length < 2) return;

  const xs = points.map((p) => Number(p.amount_in));
  const ys = points.map((p) => p.bps);
  const zeros = points.map(() => 0);

  const ink = css("--ink", "#e8eaed");
  const ink3 = css("--ink-3", "#6b7178");
  const ink4 = css("--ink-4", "#454a50");
  const line = css("--line", "#24272b");
  const baseline = css("--baseline", "#6b7178");
  const hot = css(rampVar(Math.max(...ys)), "#eb6628");
  const mono = css("--mono", "monospace");

  /* Tick where a measurement exists, and nowhere else. uPlot's default log splits label
     decades nobody swapped at, which is a grid pretending to be data. */
  const fmtSize = (v: number) => `1e${Math.round(Math.log10(v))}`;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let u: uPlot | null = null;
  const build = (w: number) => {
    const h = Math.max(240, Math.min(420, Math.round(w * 0.42)));
    const opts: uPlot.Options = {
      width: w,
      height: h,
      padding: [20, 16, 4, 4],
      legend: { show: false },
      cursor: {
        y: false,
        points: { size: 9, width: 1, stroke: () => ink, fill: () => "transparent" },
        drag: { x: false, y: false },
      },
      scales: {
        x: { distr: 3, time: false },
        /* anchored at 0, always. The headroom above the top point is 12%, never below zero. */
        y: { range: (_u, _min, max) => [0, max * 1.12] },
      },
      axes: [
        {
          stroke: ink3, grid: { stroke: line, width: 1, dash: [1, 3] },
          ticks: { stroke: ink4, width: 1, size: 4 },
          font: `10px ${mono}`, labelFont: `11px ${mono}`,
          label: "AMOUNT IN · WEI · LOG", labelSize: 26, labelGap: 6,
          splits: () => xs,
          values: (_u, splits) => splits.map((v) => (v > 0 ? fmtSize(v) : "")),
        },
        {
          stroke: ink3, grid: { stroke: line, width: 1, dash: [1, 3] },
          ticks: { stroke: ink4, width: 1, size: 4 },
          font: `10px ${mono}`, labelFont: `11px ${mono}`,
          label: "EXTRACTION · BPS", labelSize: 26, labelGap: 6,
          size: 52,
        },
      ],
      series: [
        { label: "AMOUNT IN" },
        {
          /* the counterfactual: the same swap with the stub in place of the hook */
          label: "WITH THE STUB",
          stroke: baseline, width: 1, dash: [4, 4], spanGaps: true,
          points: { show: true, size: 5, stroke: baseline, fill: "transparent", width: 1 },
        },
        {
          label: "WITH THE HOOK",
          stroke: hot, width: 1.5, spanGaps: true,
          points: { show: true, size: 7, stroke: hot, fill: hot, width: 1 },
        },
      ],
      hooks: {
        /* the sweep, one time only: a hard edge crossing the plot left to right in 320 ms */
        ready: [
          (self) => {
            if (reduced) return;
            const over = self.root.querySelector<HTMLElement>(".u-over");
            if (!over) return;
            over.animate(
              [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
              { duration: 320, easing: "cubic-bezier(0.16,1,0.30,1)", fill: "backwards" },
            );
          },
        ],
      },
    };
    return new uPlot(opts, [xs, zeros, ys], host);
  };

  const draw = () => {
    const w = Math.max(280, host.clientWidth || root.clientWidth);
    if (u) {
      u.setSize({ width: w, height: Math.max(240, Math.min(420, Math.round(w * 0.42))) });
    } else {
      u = build(w);
      root.dataset.enhanced = "yes";
    }
  };

  draw();

  let t: number | undefined;
  addEventListener("resize", () => {
    clearTimeout(t);
    t = window.setTimeout(draw, 120);
  });

  /* The legend is two swatches and a monospace label — the SSTR device, in DOM, not on canvas. */
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  legend.innerHTML =
    `<span class="cl"><i class="sw" style="background:${hot}"></i>WITH THE HOOK</span>` +
    `<span class="cl"><i class="sw base" style="background:${baseline}"></i>WITH THE STUB · 0 BPS BY CONSTRUCTION</span>` +
    `<span class="cl ink-3">±0.05 BPS GATE TOLERANCE · SMALLER THAN ONE PIXEL HERE</span>`;
  host.after(legend);
}
