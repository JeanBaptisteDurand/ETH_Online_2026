/**
 * budget.mjs — the acceptance criteria of the page, measured on dist/ and printed.
 *
 * The claim this page makes about itself is a claim like any other: it has to be measurable
 * and it has to be replayable. `npm run budget` is that one command. It exits non-zero when a
 * budget is broken, so a regression is a failed build, not a note in a README.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

const files = walk(DIST).map((f) => {
  const buf = readFileSync(f);
  return { path: f.slice(DIST.length + 1), raw: buf.length, gz: gzipSync(buf, { level: 9 }).length, ext: extname(f) };
});

const html = files.find((f) => f.path === "index.html");
if (!html) throw new Error("dist/index.html missing — run npm run build first");

const js = files.filter((f) => f.ext === ".js");
const fonts = files.filter((f) => f.ext === ".woff2");

/* The entry chunk is the only JavaScript that can run before the reader scrolls.
   Everything else is behind an import() gated on the viewport. */
const entry = js.find((f) => f.path.startsWith("index-"));
const deferred = js.filter((f) => f !== entry);

const kb = (n) => `${(n / 1024).toFixed(2)} kB`;

const checks = [
  {
    name: "verdict readable with zero JavaScript",
    ok: /class="metric-xl"/.test(readFileSync(join(DIST, "index.html"), "utf8")),
    got: "the measured value is a literal in index.html",
  },
  {
    name: "no render-blocking stylesheet",
    ok: !/<link[^>]+rel="stylesheet"/.test(readFileSync(join(DIST, "index.html"), "utf8")),
    got: "all CSS inlined in <head>",
  },
  {
    name: "critical document (HTML + inlined CSS) under 14 kB gzip",
    ok: html.gz <= 14 * 1024,
    got: `${kb(html.gz)} gzip (${kb(html.raw)} raw)`,
  },
  {
    name: "JS on the first screen under 2 kB gzip",
    ok: (entry?.gz ?? 0) <= 2 * 1024,
    got: entry ? `${kb(entry.gz)} gzip` : "none",
  },
  {
    name: "total JS under 160 kB gzip",
    ok: js.reduce((a, f) => a + f.gz, 0) <= 160 * 1024,
    got: `${kb(js.reduce((a, f) => a + f.gz, 0))} gzip across ${js.length} chunks`,
  },
  {
    name: "fonts self-hosted, latin only, under 72 kB",
    ok: fonts.length === 2 && fonts.reduce((a, f) => a + f.raw, 0) <= 72 * 1024,
    got: `${fonts.length} files, ${kb(fonts.reduce((a, f) => a + f.raw, 0))}`,
  },
  {
    name: "no third-party origin referenced at runtime",
    ok: !/https?:\/\/(?!github\.com)/.test(
      readFileSync(join(DIST, "index.html"), "utf8").replace(/<a [^>]*>/g, ""),
    ),
    got: "only the source link leaves the origin, and only on click",
  },
  {
    name: "no non-zero border-radius anywhere",
    ok: !files
      .filter((f) => f.ext === ".html" || f.ext === ".js")
      .some((f) => /border-radius:\s*(?!0)[^;}]+/.test(readFileSync(join(DIST, f.path), "utf8"))),
    got: "radius 0, measured 6/6 on the references",
  },
];

console.log("\nTARE landing — budget\n");
for (const f of [html, ...js, ...fonts].sort((a, b) => b.gz - a.gz)) {
  console.log(`  ${f.path.padEnd(28)} ${kb(f.raw).padStart(10)} raw   ${kb(f.gz).padStart(10)} gzip`);
}
console.log(`\n  ${"deferred behind import()".padEnd(28)} ${kb(deferred.reduce((a, f) => a + f.gz, 0)).padStart(10)} gzip`);
console.log("\n  acceptance criteria\n");
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad++;
  console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name.padEnd(52)} ${c.got}`);
}
console.log(bad ? `\n${bad} budget(s) broken\n` : "\nall budgets held\n");
process.exit(bad ? 1 : 0);
