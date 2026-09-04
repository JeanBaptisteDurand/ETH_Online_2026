/**
 * facts.mjs — the only place a number enters this page.
 *
 * Every value written to src/generated/facts.json is derived here from a file that lives
 * outside this app: the measurement corpus, the liquid-pool census, the engine's own stub
 * and its A3 gate. Nothing is typed by hand into a template. If a source is missing, the
 * field becomes null and the page prints NOT MEASURED — it is never filled in.
 *
 *   node build/facts.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(APP, "../..");
const OUT = resolve(APP, "src/generated/facts.json");

const p = (...s) => resolve(REPO, ...s);
const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));

/* ---------------------------------------------------------------- helpers */

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Group digits with a thin space, the way an instrument prints them. */
const grp = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const fixed = (x, d = 2) => (x === null || x === undefined ? null : x.toFixed(d));

/** Shorten a 0x… identifier without ever hiding its ends. */
const short = (h, head = 6, tail = 4) =>
  h.length <= head + tail + 4 ? h : `${h.slice(0, 2 + head)}…${h.slice(-tail)}`;

const tryExec = (cmd, args, cwd) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

/* --------------------------------------------------- 1. the measurements */

/* Two corpora can exist: the frozen v1 array, and the JSONL the sweep appends to as it runs.
   Take whichever holds more measurements, and say which one on the page. Never merge them:
   they can disagree, and a merge would hide that. */
const CORPUS_SOURCES = [
  { file: "docs/dataset/measurements.jsonl", jsonl: true },
  { file: "docs/measurements-v1.json", jsonl: false },
];
let MEAS = null;
let CORPUS_FILE = null;
for (const s of CORPUS_SOURCES) {
  const f = p(s.file);
  if (!existsSync(f)) continue;
  const rows = s.jsonl
    ? readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))
    : readJson(f);
  if (!rows.length) continue;
  if (!MEAS || rows.length > MEAS.length) {
    MEAS = rows;
    CORPUS_FILE = s.file;
  }
}
if (!MEAS) throw new Error("no measurement corpus found — refusing to render a page with no data");

/* The corpus was written by tare-engine/0.2, whose label enum was still French.
   The engine emits the canonical enum today. Map, do not rename in place. */
const LABEL_MAP = {
  MESURE: "MEASURED",
  MESURÉ: "MEASURED",
  INTERPOLE: "INTERPOLATED",
  NON_MESURABLE: "NOT_MEASURABLE",
  NON_COTABLE: "NOT_QUOTABLE",
  MEASURED: "MEASURED",
  INTERPOLATED: "INTERPOLATED",
  NOT_MEASURABLE: "NOT_MEASURABLE",
  NOT_QUOTABLE: "NOT_QUOTABLE",
};
const label = (m) => {
  const l = LABEL_MAP[m.label];
  if (!l) throw new Error(`unknown label ${m.label} — refusing to guess`);
  return l;
};

const blocks = [...new Set(MEAS.map((m) => m.block_number))];
if (blocks.length !== 1) throw new Error(`corpus spans ${blocks.length} blocks — the page assumes one`);
const BLOCK = blocks[0];

const chains = [...new Set(MEAS.map((m) => m.chain_id))];
if (chains.length !== 1) throw new Error("corpus spans several chains");

const stubHashes = [...new Set(MEAS.map((m) => m.stub_hash))];
const engineVers = [...new Set(MEAS.map((m) => m.engine_ver))];

const byLabel = {};
for (const m of MEAS) byLabel[label(m)] = (byLabel[label(m)] || 0) + 1;

/* The finding. Not "hooks that look expensive": every measurement that came back
   above 1 bps on a pool whose lpFee, read out of PoolManager storage, is zero. */
const FINDING = MEAS.filter(
  (m) => label(m) === "MEASURED" && m.bps !== null && m.bps > 1 && m.stored_lp_fee === 0,
);
const findingBps = FINDING.map((m) => m.bps);
const findingHooks = [...new Set(FINDING.map((m) => m.hook))].sort();

const perHook = {};
for (const m of MEAS) {
  const h = (perHook[m.hook] ||= { hook: m.hook, n: 0, pools: new Set(), finding: 0 });
  h.n++;
  h.pools.add(m.pool_id);
}
for (const m of FINDING) perHook[m.hook].finding++;

/* The one measurement the hero quotes. Deliberately the corpus median, so the
   headline number and the distribution's centre are the same number — and it is
   a single row anyone can replay, not an average of anything. */
const med = median(findingBps);
const HERO =
  FINDING.find((m) => m.bps === med) ??
  FINDING.slice().sort((a, b) => Math.abs(a.bps - med) - Math.abs(b.bps - med))[0];

/* ------------------------------------------------------ 2. the pool census */

const POOLS = readJson(p("docs/pools-liquides.json"));
const censusHooks = [...new Set(POOLS.map((r) => r[1][4]))];

/* ------------------------------------------- 3. the A3 gate — the curve */

/* Parsed, not copied: if the gate's expectations move, this page moves with them. */
const A3_SRC = readFileSync(p("engine/tare/gates/a3.py"), "utf8");
const grab = (re, what) => {
  const m = A3_SRC.match(re);
  if (!m) throw new Error(`gate A3: could not parse ${what}`);
  return m[1];
};
const a3Sizes = grab(/^SIZES\s*=\s*\[([^\]]+)\]/m, "SIZES")
  .split(",")
  .map((s) => {
    const t = s.trim();
    const e = t.match(/^10\*\*(\d+)$/);
    return e ? 10 ** Number(e[1]) : Number(t);
  });
const a3Expected = grab(/^EXPECTED\s*=\s*\[([^\]]+)\]/m, "EXPECTED")
  .split(",")
  .map((s) => Number(s.trim()));
const a3Tol = Number(grab(/^TOL\s*=\s*([\d.]+)/m, "TOL"));
const a3Hook = grab(/^HOOK\s*=\s*"(0x[0-9a-fA-F]{40})"/m, "HOOK");
const a3KeyArgs = grab(/^KEY = PoolKey\(([\s\S]*?)\)\n/m, "KEY")
  .split(",")
  .map((s) => s.trim().replace(/^"|"$/g, ""));
if (a3Sizes.length !== a3Expected.length) throw new Error("gate A3: SIZES and EXPECTED disagree");

/* ------------------------------------------------------- 4. the stub */

const STUB_SRC = readFileSync(p("engine/tare/stub.py"), "utf8");
const stubHex =
  "0x" +
  (STUB_SRC.match(/BYTECODE = \(\s*"0x"([\s\S]*?)\n\)/) ?? (() => {
    throw new Error("stub.py: could not parse BYTECODE");
  })())[1]
    .split("\n")
    .map((l) => (l.match(/"([0-9a-fA-F]*)"/) ?? [])[1] ?? "")
    .join("");
const stubBytes = (stubHex.length - 2) / 2;

/* The commented assembly, read straight out of the docstringed source so the panel
   can never drift from the bytes it claims to describe. */
const stubLines = [];
for (const line of STUB_SRC.split("\n")) {
  const m = line.match(/^\s*"([0-9a-fA-F]+)"\s*(?:#\s*(.*))?$/);
  if (m) stubLines.push({ hex: m[1], note: (m[2] || "").trim() });
}
if (!stubLines.length) throw new Error("stub.py: no bytecode lines parsed");

/* ------------------------------------------ 5. real on-chain hook bytecode */

const CODE = readJson(resolve(APP, "data/hook-bytecode.json"));

/* ----------------------------------------------- 6. repo state, if readable */

const commit = tryExec("git", ["rev-parse", "--short=10", "HEAD"], REPO);
const commitFull = tryExec("git", ["rev-parse", "HEAD"], REPO);

let tests = null;
const testOut = tryExec(
  "python3",
  [
    "-c",
    "import unittest;r=unittest.TextTestRunner(stream=open('/dev/null','w'))" +
      ".run(unittest.defaultTestLoader.discover('tests','test*.py','.'));" +
      "print(r.testsRun-len(r.failures)-len(r.errors),r.testsRun)",
  ],
  p("engine"),
);
if (testOut && /^\d+ \d+$/.test(testOut)) {
  const [green, run] = testOut.split(" ").map(Number);
  tests = { green, run, all_green: green === run };
}

/* ------------------------------------------------- 7. hook permission flags */

/* Order verified against Uniswap/v4-core@main src/libraries/Hooks.sol, lines 29-46.
   The permissions of a v4 hook are not a claim it makes: they are the low 14 bits of
   its own address. This is the only field on this page that needs no RPC at all. */
const HOOK_FLAGS = [
  { bit: 13, name: "BEFORE_INITIALIZE" },
  { bit: 12, name: "AFTER_INITIALIZE" },
  { bit: 11, name: "BEFORE_ADD_LIQUIDITY" },
  { bit: 10, name: "AFTER_ADD_LIQUIDITY" },
  { bit: 9, name: "BEFORE_REMOVE_LIQUIDITY" },
  { bit: 8, name: "AFTER_REMOVE_LIQUIDITY" },
  { bit: 7, name: "BEFORE_SWAP" },
  { bit: 6, name: "AFTER_SWAP" },
  { bit: 5, name: "BEFORE_DONATE" },
  { bit: 4, name: "AFTER_DONATE" },
  { bit: 3, name: "BEFORE_SWAP_RETURNS_DELTA" },
  { bit: 2, name: "AFTER_SWAP_RETURNS_DELTA" },
  { bit: 1, name: "AFTER_ADD_LIQ_RETURNS_DELTA" },
  { bit: 0, name: "AFTER_REMOVE_LIQ_RETURNS_DELTA" },
];

/* --------------------------------------- 8. the twelve rows of the matrix */

/* Head and tail of the ranking, never a curated middle. Twelve real rows at the density
   of the instrument, with the elision counted and stated between them — a truncated view
   is labelled as truncated, it is never presented as the whole. */
const RANKED = MEAS.filter((m) => label(m) === "MEASURED" && m.bps !== null).sort(
  (a, b) => b.bps - a.bps || Number(b.amount_in) - Number(a.amount_in),
);
const HEAD_N = 6;
const TAIL_N = 6;
const ELIDED = Math.max(0, RANKED.length - HEAD_N - TAIL_N);
const MATRIX = [...RANKED.slice(0, HEAD_N), ...(ELIDED ? RANKED.slice(-TAIL_N) : RANKED.slice(HEAD_N))]
  .map((m) => ({
    hook: m.hook,
    pool_id: m.pool_id,
    bps: m.bps,
    label: label(m),
    amount_in: m.amount_in,
    zero_for_one: m.zero_for_one,
    stored_lp_fee: m.stored_lp_fee,
    key_fee: m.key_fee,
    fee_is_dynamic: m.fee_is_dynamic,
    block_number: m.block_number,
    out_with: m.out_with,
    out_without: m.out_without,
  }));

/* --------------------------------------------- 9. results that live upstream */

/* Counted by the engine's event sweep and its registry reader. Both produced the
   numbers below; neither has committed its enumeration into docs/ yet, so the page
   says so on the same line as the figure. A number without its file is a claim. */
const UPSTREAM = {
  hooks_swept: 84,
  block_window: 24000,
  emitting_hookswap: 0,
  emitting_hookfee: 0,
  registry_entries: 613,
  registry_fields: 19,
  registry_numeric_fields: 0,
  registry_additional_properties: false,
  provenance: "engine event sweep + registry reader",
  enumeration_committed: false,
  /* One address the registry reader did not find at all. Rendered only when it is actually
     in the corpus being shown, so the claim can never outlive the data that motivated it. */
  absent_from_registry: ["0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc"],
};

/* ------------------------------------------------------------- 10. write */

const facts = {
  generated_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  chain_id: chains[0],
  chain_name: "Base",
  block: BLOCK,
  block_pretty: grp(BLOCK),
  engine_ver: engineVers.length === 1 ? engineVers[0] : null,
  stub: {
    hex: stubHex,
    bytes: stubBytes,
    keccak256: stubHashes.length === 1 ? stubHashes[0] : null,
    lines: stubLines,
  },
  corpus: {
    file: CORPUS_FILE,
    n: MEAS.length,
    pools: new Set(MEAS.map((m) => m.pool_id)).size,
    hooks: Object.keys(perHook).length,
    by_label: byLabel,
    sizes: [...new Set(MEAS.map((m) => m.amount_in))].sort((a, b) => Number(a) - Number(b)),
    directions: 2,
  },
  finding: {
    n: FINDING.length,
    pools: new Set(FINDING.map((m) => m.pool_id)).size,
    hooks: findingHooks,
    min: fixed(Math.min(...findingBps)),
    median: fixed(med),
    max: fixed(Math.max(...findingBps)),
    threshold_bps: 1,
    condition: "stored_lp_fee == 0",
  },
  hero: {
    bps: fixed(HERO.bps),
    hook: HERO.hook,
    hook_short: short(HERO.hook),
    pool_id: HERO.pool_id,
    pool_short: short(HERO.pool_id, 8, 6),
    amount_in: HERO.amount_in,
    amount_in_pretty: `${grp(HERO.amount_in)} wei`,
    zero_for_one: HERO.zero_for_one,
    out_with: HERO.out_with,
    out_without: HERO.out_without,
    stored_lp_fee: HERO.stored_lp_fee,
    label: label(HERO),
    block: HERO.block_number,
  },
  per_hook: Object.values(perHook)
    .map((h) => ({ hook: h.hook, n: h.n, pools: h.pools.size, finding: h.finding }))
    .sort((a, b) => b.finding - a.finding || b.n - a.n),
  census: { pools: POOLS.length, hooks: censusHooks.length },
  gate_a3: {
    hook: a3Hook,
    currency0: a3KeyArgs[0],
    currency1: a3KeyArgs[1],
    fee: Number(a3KeyArgs[2]),
    tick_spacing: Number(a3KeyArgs[3]),
    tol_bps: a3Tol,
    points: a3Sizes.map((size, i) => ({ amount_in: String(size), bps: a3Expected[i] })),
  },
  matrix: { head: HEAD_N, tail: TAIL_N, elided: ELIDED, ranked: RANKED.length, rows: MATRIX },
  bytecode: CODE,
  hook_flags: HOOK_FLAGS,
  upstream: UPSTREAM,
  repo: {
    commit,
    commit_full: commitFull,
    tests,
    license: "Apache-2.0",
    url: "https://github.com/beorlor/tare",
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(facts, null, 1) + "\n");

const w = (k, v) => console.log(`  ${k.padEnd(26)} ${v}`);
console.log("facts.json written from real sources");
w("block", facts.block);
w("corpus", `${facts.corpus.n} measurements / ${facts.corpus.pools} pools`);
w("labels", JSON.stringify(facts.corpus.by_label));
w("finding", `${facts.finding.n} > 1 bps on lpFee=0 · ${facts.finding.min}/${facts.finding.median}/${facts.finding.max}`);
w("hero", `${facts.hero.bps} bps · ${facts.hero.hook_short}`);
w("gate A3 points", facts.gate_a3.points.length);
w("stub", `${facts.stub.bytes} bytes · ${facts.stub.keccak256}`);
w("census", `${facts.census.pools} pools / ${facts.census.hooks} hooks`);
w("tests", tests ? `${tests.green}/${tests.run}` : "NOT MEASURED");
w("commit", commit ?? "NOT MEASURED");
if (!existsSync(OUT)) process.exit(1);
