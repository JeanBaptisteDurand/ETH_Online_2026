/**
 * boot.ts — everything the page needs before it is interactive, and nothing more.
 *
 * The verdict is already painted when this runs: sections 00-06 are static HTML with the
 * measurements baked in at build time. This file only adds behaviour that could not exist
 * in markup, and it loads the two heavy sections with import() when they come into view.
 */
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/sections.css";

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* -------------------------------------------------- the 14-bit permission register */

/* Order verified against Uniswap/v4-core@main src/libraries/Hooks.sol lines 29-46.
   No RPC: a hook's permissions are the low 14 bits of its own address. */
const FLAGS = [
  "BEFORE_INITIALIZE",
  "AFTER_INITIALIZE",
  "BEFORE_ADD_LIQUIDITY",
  "AFTER_ADD_LIQUIDITY",
  "BEFORE_REMOVE_LIQUIDITY",
  "AFTER_REMOVE_LIQUIDITY",
  "BEFORE_SWAP",
  "AFTER_SWAP",
  "BEFORE_DONATE",
  "AFTER_DONATE",
  "BEFORE_SWAP_RETURNS_DELTA",
  "AFTER_SWAP_RETURNS_DELTA",
  "AFTER_ADD_LIQ_RETURNS_DELTA",
  "AFTER_REMOVE_LIQ_RETURNS_DELTA",
] as const;

const bitOf = (i: number) => BigInt(13 - i);

const input = document.querySelector<HTMLInputElement>("#addr");
const ledsHead = document.querySelector<HTMLElement>("#leds-head");
const flagBox = document.querySelector<HTMLElement>("#flags");

function applyAddress(raw: string): void {
  if (!ledsHead || !flagBox) return;
  const hex = raw.trim().toLowerCase();
  const valid = /^0x[0-9a-f]{40}$/.test(hex);
  input?.setAttribute("aria-invalid", valid ? "false" : "true");
  if (!valid) {
    flagBox.textContent = "";
    flagBox.append(el("span", "flag ink-3", "NOT A 20-BYTE ADDRESS — NOTHING DECODED"));
    ledsHead.querySelectorAll<HTMLElement>(".led").forEach((n) => (n.dataset.on = "0"));
    return;
  }
  const bits = BigInt(hex) & 0x3fffn;
  const on: string[] = [];
  ledsHead.querySelectorAll<HTMLElement>(".led").forEach((node, i) => {
    const set = (bits >> bitOf(i)) & 1n ? 1 : 0;
    node.dataset.on = String(set);
    node.title = FLAGS[i];
    if (set) on.push(FLAGS[i]);
  });
  flagBox.textContent = "";
  if (on.length) on.forEach((n) => flagBox.append(el("span", "flag", n)));
  else flagBox.append(el("span", "flag ink-3", "NO PERMISSION BIT SET"));
}

function el(tag: string, cls: string, text: string): HTMLElement {
  const n = document.createElement(tag);
  n.className = cls;
  n.textContent = text;
  return n;
}

input?.addEventListener("input", () => applyAddress(input.value));

/* ------------------------------------------------------------ the one effect family */

/* A hard edge sweeping across a region, revealing state that was already decided.
   Registers light bit by bit; sections fade as a block; the curve draws left to right.
   24 ms between elements, 5 elements at most, 120 ms ceiling. Nothing else moves. */
function sweep(node: HTMLElement): void {
  if (node.dataset.sweep === "run") return;
  const leds = [...node.querySelectorAll<HTMLElement>(".led")];
  if (REDUCED) {
    node.dataset.sweep = "run";
    leds.forEach((l) => (l.style.animation = "none"));
    return;
  }
  const step = Math.min(24, 120 / Math.max(1, leds.length));
  leds.forEach((l, i) => (l.style.animationDelay = `${Math.min(120, i * step)}ms`));
  node.dataset.sweep = "run";
}

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const t = e.target as HTMLElement;
      io.unobserve(t);
      if (t.classList.contains("leds")) sweep(t);
      else t.dataset.reveal = "in";
    }
  },
  { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
);

document.querySelectorAll<HTMLElement>(".leds, [data-reveal]").forEach((n) => io.observe(n));

/* Failsafe. A register that is still dark after three seconds is a bug in the reveal, not a
   design choice, and hidden content is never acceptable on this page. */
setTimeout(() => {
  document.querySelectorAll<HTMLElement>('.leds[data-sweep="pending"]').forEach(sweep);
  document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-reveal=in])").forEach((n) => {
    n.dataset.reveal = "in";
  });
}, 3000);

/* The head register is above the fold: it lights on its own at t+150 ms, never on scroll. */
if (ledsHead) {
  io.unobserve(ledsHead);
  setTimeout(() => sweep(ledsHead), REDUCED ? 0 : 150);
}

/* ------------------------------------------------- the two deferred sections */

/* Loaded when they come within a screen of the viewport, never before. Section 04 pulls
   uPlot; section 05 pulls its own sorter. Neither is on the path to the verdict. */
function lazy(selector: string, load: () => Promise<{ mount: (root: HTMLElement) => void }>): void {
  const root = document.querySelector<HTMLElement>(selector);
  if (!root) return;
  const obs = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      load()
        .then((m) => m.mount(root))
        .catch((err) => {
          /* A section that fails to enhance must not remove what is already readable. */
          root.dataset.enhanced = "failed";
          console.error("[tare] deferred section failed to load", err);
        });
    },
    { rootMargin: "100% 0px" },
  );
  obs.observe(root);
}

lazy("#chart", () => import("./sections/curve"));
lazy("#matrix-table", () => import("./sections/matrix"));

applyAddress(input?.value ?? "");
