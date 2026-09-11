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

/* LE RECENSEMENT COMPLET quand il est la, l'echantillon sinon — et on DIT lequel.
   Section 06 titrait « 199 LIQUID POOLS · 12 DISTINCT HOOKS » depuis docs/pools-liquides.json,
   un echantillon, alors que docs/dataset/pools-liquides-full.json en porte 7 817 et que la
   table par hook de cette meme page en montre 112. La page se contredisait elle-meme.
   Le fichier complet etait DEJA lu quelques lignes plus bas, avec ses controles croises
   contre le rapport de balayage et le manifeste des logs ; seul le chiffre AFFICHE lisait
   encore le petit. */
const CENSUS_FULL = "docs/dataset/pools-liquides-full.json";
const CENSUS_FILE = existsSync(p(CENSUS_FULL)) ? CENSUS_FULL : "docs/pools-liquides.json";
const POOLS = readJson(p(CENSUS_FILE));
const censusHooks = [...new Set(POOLS.map((r) => r[1][4]))];

/* ------------------------------- 2b. the structure of the census: how many doors */

/* The question that decides how every bps on this page should be read: for a given pair of
   currencies, is there a second pool? Where there is not, the hook on the only pool is not
   quoting against anyone, and its cut cannot be refused by going elsewhere. Both counts are
   derived from the full census below; neither is asserted anywhere in the markup. */
const FULL_FILE = "docs/dataset/pools-liquides-full.json";
const SCAN_FILE = `${FULL_FILE}.scan.json`;
const CONTESTED_FILE = "docs/dataset/measurements-contestes.jsonl";

let STRUCTURE = null;
if (existsSync(p(FULL_FILE)) && existsSync(p(SCAN_FILE))) {
  const FULL = readJson(p(FULL_FILE));
  const SCAN = readJson(p(SCAN_FILE));
  if (SCAN.block_number !== BLOCK)
    throw new Error(`census scanned block ${SCAN.block_number}, the corpus is at ${BLOCK}`);
  if (SCAN.n_liquid !== FULL.length)
    throw new Error("the census file and its scan report disagree on how many pools it holds");

  /* What the census can and cannot see, read from the log collector's own manifest rather than
     described from memory: it is one window of Initialize events, and only the pools whose
     PoolKey names a hook. A pool older than the window, or one with no hook at all, is not in
     this file — so "one pool" below means one pool OF THIS CENSUS, and the page says so. */
  const MANIFEST = `${SCAN.source_logs.split("/").pop()}.manifest.json`;
  const MAN = existsSync(p("docs/dataset", MANIFEST)) ? readJson(p("docs/dataset", MANIFEST)) : null;
  if (MAN && MAN.end_block !== BLOCK)
    throw new Error(`the census log window ends at ${MAN.end_block}, the corpus is at ${BLOCK}`);
  if (MAN && MAN.n_hooked !== SCAN.n_hooked_pools)
    throw new Error("the log manifest and the scan report disagree on how many hooked pools were seen");

  /* v4 sorts the two currencies inside the PoolKey, so [currency0, currency1] is already the
     canonical identity of a pair: nothing is normalised here, and nothing is guessed. */
  const pairSize = new Map();
  for (const [, key] of FULL) {
    const id = `${key[0]}/${key[1]}`;
    pairSize.set(id, (pairSize.get(id) ?? 0) + 1);
  }
  const multi = [...pairSize].filter(([, n]) => n > 1);
  const gatesInMulti = multi.reduce((a, [, n]) => a + n, 0);

  /* The scan records its rate-limited endpoint with the API key inside the URL. Only the
     cause class ("HTTP 429") is carried onto the page — never the endpoint. */
  const causes = (SCAN.unknown_causes ?? []).map(([why, n]) => ({
    cause: String(why).split(" from ")[0],
    n,
  }));

  /* Those pools are absent from the census, and the scan does not record their PoolKey, so a
     pair whose second pool is one of them is counted here as having exactly one. That is why
     the multi count is a LOWER BOUND, and why the page prints the reserve next to it. */
  const unknownKeysKnown = (SCAN.unknown_pools ?? []).some((u) => u.currency0 || u.key);

  let contested = null;
  if (existsSync(p(CONTESTED_FILE))) {
    const rows = readFileSync(p(CONTESTED_FILE), "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
    const cBlocks = [...new Set(rows.map((m) => m.block_number))];
    if (cBlocks.length !== 1 || cBlocks[0] !== BLOCK)
      throw new Error("the contested corpus is not at the block this page states");
    if (rows.some((m) => m.chain_id !== chains[0]))
      throw new Error("the contested corpus is not on the chain this page states");

    const pairs = new Map();
    for (const m of rows) {
      const id = `${m.currency0}/${m.currency1}`;
      const pair =
        pairs.get(id) ?? { id, currency0: m.currency0, currency1: m.currency1, gates: new Map() };
      const g =
        pair.gates.get(m.pool_id) ??
        { pool_id: m.pool_id, hook: m.hook, key_fee: m.key_fee, n: 0, measured: 0, bps: [], labels: {}, lp: new Set() };
      g.n++;
      const l = label(m);
      g.labels[l] = (g.labels[l] ?? 0) + 1;
      /* Un stored_lp_fee absent est une LECTURE QUI A ECHOUE, pas une valeur de moins.
         L'ignorer faisait passer une porte dont une seule ligne avait ete lue pour une porte
         dont toutes les lignes s'accordent, et le commentaire d'a cote promettait l'inverse.
         On l'ajoute donc comme valeur distincte : g.lp.size > 1 signalera le desaccord. */
      g.lp.add(m.stored_lp_fee ?? null);
      if (l === "MEASURED" && m.bps !== null) {
        g.measured++;
        g.bps.push(m.bps);
      }
      pair.gates.set(m.pool_id, g);
      pairs.set(id, pair);
    }

    /* The census decides which pairs have several pools; the sweep decides what each of those
       pools takes. If the two disagree — on the set of pairs, or on how many pools a pair has —
       the page would be describing a set that neither file contains. Refuse instead. */
    /* Deux pools d'une meme paire peuvent porter LE MEME hook : deux portes existent bien,
       mais le choix ne se fait pas entre deux hooks. Presenter ces deux-la comme la preuve
       que « des hooks differents prennent des montants differents » serait exactement la
       faute que cette section existe pour eviter. On marque le cas, la page le dit. */
    for (const pair of pairs.values()) {
      const hooks = new Set([...pair.gates.values()].map((g) => g.hook.toLowerCase()));
      pair.n_hooks = hooks.size;
      pair.one_hook_several_pools = hooks.size === 1 && pair.gates.size > 1;
    }

    const censusMulti = new Map(multi);
    if (pairs.size !== censusMulti.size)
      throw new Error(
        `census counts ${censusMulti.size} pairs with several pools, the contested corpus covers ${pairs.size}`,
      );
    for (const [id, pair] of pairs) {
      if (censusMulti.get(id) !== pair.gates.size)
        throw new Error(
          `pair ${id}: census counts ${censusMulti.get(id)} pools, the sweep measured ${pair.gates.size}`,
        );
    }

    const shaped = [...pairs.values()]
      .map((pair) => {
        const gates = [...pair.gates.values()]
          .map((g) => ({
            pool_id: g.pool_id,
            hook: g.hook,
            key_fee: g.key_fee,
            /* One stored_lp_fee per gate only when every row of that gate read the same one. A
               slot0 read that failed leaves null, and null is never folded into a number. */
            stored_lp_fee: g.lp.size === 1 ? [...g.lp][0] : null,
            lp_values_seen: [...g.lp],
            n: g.n,
            measured: g.measured,
            /* The median of the MEASURED rows of this gate, over every size and both directions
               the sweep ran. It is a summary of this corpus, not the cost of one swap: the API's
               /route picks the row at the requested size instead, and names it. */
            median: g.bps.length ? fixed(median(g.bps)) : null,
            /* The same median, unrounded: the spread below is a difference of measurements,
               never a difference of two rounded strings. */
            median_raw: g.bps.length ? median(g.bps) : null,
            min: g.bps.length ? fixed(Math.min(...g.bps)) : null,
            max: g.bps.length ? fixed(Math.max(...g.bps)) : null,
            labels: g.labels,
          }))
          .sort(
            (a, b) =>
              (a.median === null ? 1 : 0) - (b.median === null ? 1 : 0) ||
              Number(b.median) - Number(a.median),
          );
        const quoted = gates.filter((g) => g.median !== null);
        const meds = quoted.map((g) => g.median_raw);
        const lps = new Set(quoted.map((g) => g.stored_lp_fee));
        return {
          id: pair.id,
          currency0: pair.currency0,
          currency1: pair.currency1,
          doors: gates.length,
          hooks: new Set(gates.map((g) => g.hook)).size,
          quoted: quoted.length,
          /* A gap between a number and a non-number does not exist: no quote, no spread. */
          spread: meds.length >= 2 ? fixed(Math.max(...meds) - Math.min(...meds)) : null,
          worst: meds.length ? fixed(Math.max(...meds)) : null,
          /* Non-null only when every quoted door of the pair read the SAME stored LP fee. When
             it holds, the spread between the doors is the hook and nothing else. */
          same_lp_fee: meds.length >= 2 && lps.size === 1 && !lps.has(null) ? [...lps][0] : null,
          gates,
        };
      })
      .sort(
        (a, b) =>
          (a.spread === null ? 1 : 0) - (b.spread === null ? 1 : 0) ||
          Number(b.spread) - Number(a.spread) ||
          b.doors - a.doors,
      );

    const cLabels = {};
    for (const m of rows) cLabels[label(m)] = (cLabels[label(m)] || 0) + 1;

    contested = {
      file: CONTESTED_FILE,
      n: rows.length,
      hooks: new Set(rows.map((m) => m.hook)).size,
      pools: new Set(rows.map((m) => m.pool_id)).size,
      sizes: new Set(rows.map((m) => m.amount_in)).size,
      by_label: cLabels,
      engine_ver: [...new Set(rows.map((m) => m.engine_ver))].join(" · "),
      pairs: shaped,
      /* Sorted by spread, so the first row is the widest measured gap between two doors of the
         same pair. Both picks are rules, not choices: they are recomputed at every build. */
      widest_id: shaped.find((x) => x.spread !== null)?.id ?? null,
      most_quoted_id:
        shaped
          .slice()
          .sort((a, b) => b.quoted - a.quoted || Number(a.worst) - Number(b.worst))[0]?.id ?? null,
    };
  }

  STRUCTURE = {
    census_file: FULL_FILE,
    scan_file: SCAN_FILE,
    pools: FULL.length,
    pairs: pairSize.size,
    pairs_multi: multi.length,
    pairs_single: pairSize.size - multi.length,
    gates_in_multi: gatesInMulti,
    pct_multi: ((100 * multi.length) / pairSize.size).toFixed(2),
    hooked_pools_seen: SCAN.n_hooked_pools ?? null,
    window: MAN
      ? {
          source: MAN.source,
          span_blocks: MAN.span_blocks,
          span_pretty: grp(MAN.span_blocks),
          start_block: MAN.start_block,
          end_block: MAN.end_block,
          events: MAN.n_events,
          hooked: MAN.n_hooked,
          coverage: MAN.coverage,
        }
      : null,
    unknown_pools: SCAN.n_unknown ?? null,
    unknown_causes: causes,
    unknown_keys_known: unknownKeysKnown,
    contested,
  };
}

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
// Le compteur ecrit une ligne de diagnostic AVANT son resultat ; l'ancienne lecture prenait
// la sortie entiere et le motif ne collait jamais, donc la page affichait « NOT MEASURED »
// alors que les tests etaient verts. On prend la DERNIERE ligne, comme scripts/test-all.sh.
const testLast = testOut ? testOut.split("\n").pop().trim() : null;
if (testLast && /^\d+ \d+$/.test(testLast)) {
  const [green, run] = testLast.split(" ").map(Number);
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

/* DERIVED, NOT TYPED. Every figure below used to be a literal, under a comment saying the
   enumeration behind it "has not been committed into docs/ yet". It has now, so the page
   reads it — and the numbers turn out to be very different from the ones it published:

     hooks swept      84       ->  1 559
     block window     24 000   ->  200 000
     emitting either  0        ->  9
     registry         613      ->  978 entries

   The 84 came from the first corpus, when a public RPC could not serve a wider window. The
   613 is a real count of docs/hooklist.json — an OLDER snapshot than the one the README and
   the submission text read. Two totals published side by side without naming the file each
   came from is how a reader concludes that one of them is wrong. The file is now named on
   the page.

   A number whose file is not on the page is a claim, not a measurement. That rule is why
   this block exists at all; it just was not applied to the block itself. */

const DECL = resolve(REPO, "docs/dataset/declarations.json");
const REGISTRY = resolve(REPO, "docs/hooklist-live-20260905.json");

function upstream() {
  /* No scan on disk means no figure. We say so instead of falling back to the old literals:
     a stale number that looks fresh is worse than an absent one. */
  if (!existsSync(DECL)) {
    return {
      published: false,
      why:
        "docs/dataset/declarations.json is absent — run `python3 -m tare.declare --scan --write`. " +
        "No count is stated rather than restating an old one.",
      provenance: "not run",
      enumeration_committed: false,
    };
  }
  const d = JSON.parse(readFileSync(DECL, "utf8"));
  const c = d.conclusion ?? {};
  if (!c.publiable) {
    return {
      published: false,
      why: `the scan did not cover its whole window: ${c.raison ?? "unknown"}`,
      provenance: d.rejeu ?? "tare.declare",
      enumeration_committed: false,
    };
  }
  const perEvent = d.scan?.par_evenement ?? {};

  /* The registry, counted from the file — and the file is named. Its FIELDS are counted too,
     from the entries themselves, so "19 fields, 0 of them numeric" is a reading and not a
     memory. `chainId` is a number but it identifies a network; it is excluded from the 19 and
     the page says which. */
  let reg = { entries: null, fields: null, numeric: null, file: null };
  if (existsSync(REGISTRY)) {
    const raw = JSON.parse(readFileSync(REGISTRY, "utf8"));
    const rows = Array.isArray(raw) ? raw : (raw.hooks ?? []);
    /* TROIS COMPTES, et ils ne disent pas la meme chose.
     *
     * La page annoncait « 19 describing fields » — flags + properties. Le dossier annonce
     * « 27 champs, 19 booleens ». Les deux sont vrais et ce n'est pas le meme enonce : un
     * lecteur qui compare les deux surfaces voit 27 d'un cote, 19 de l'autre, et conclut que
     * l'une des deux se trompe. On publie donc les trois nombres, comptes depuis les fiches :
     *
     *   fields   TOUT ce qu'une fiche porte : identite + flags + properties
     *   booleans combien sont des booleens, ou qu'ils soient
     *   numeric  combien sont des quantites — et `chainId` n'en est pas une, il nomme un
     *            reseau. C'est le seul nombre du fichier, et il identifie au lieu de mesurer.
     */
    const cles = { identite: new Set(), flags: new Set(), props: new Set() };
    let booleens = 0;
    const numeriques = new Set();
    const vus = new Set();
    for (const r of rows) {
      for (const [groupe, obj] of [
        ["identite", r.hook ?? {}],
        ["flags", r.flags ?? {}],
        ["props", r.properties ?? {}],
      ]) {
        for (const [k, v] of Object.entries(obj)) {
          cles[groupe].add(k);
          const id = `${groupe}.${k}`;
          if (vus.has(id)) continue;
          vus.add(id);
          if (typeof v === "boolean") booleens += 1;
          else if (typeof v === "number") numeriques.add(k);
        }
      }
    }
    reg = {
      entries: rows.length,
      fields: cles.identite.size + cles.flags.size + cles.props.size,
      booleans: booleens,
      /* `chainId` mis a part : il identifie un reseau, il ne mesure rien. */
      numeric: [...numeriques].filter((k) => k !== "chainId").length,
      numeric_identifiers: [...numeriques],
      file: "docs/hooklist-live-20260905.json",
    };
  }

  return {
    published: true,
    hooks_swept: c.n_hooks,
    hooks_declaring: c.n_hooks_qui_declarent,
    block_window: d.initialize?.span_blocs ?? null,
    block_from: d.initialize?.bloc_debut ?? null,
    block_to: d.initialize?.bloc_fin ?? null,
    initialize_events: d.initialize?.n_evenements ?? null,
    coverage: d.scan?.couverture_min ?? null,
    emitting_hookswap: perEvent.HookSwap?.n_emetteurs ?? null,
    emitting_hookfee: perEvent.HookFee?.n_emetteurs ?? null,
    emitting_any_contract: d.scan?.n_emetteurs_tous_contrats ?? null,
    registry_entries: reg.entries,
    registry_fields: reg.fields,
    registry_booleans: reg.booleans,
    registry_numeric_fields: reg.numeric,
    registry_numeric_identifiers: reg.numeric_identifiers,
    registry_file: reg.file,
    registry_additional_properties: false,
    provenance: d.rejeu ?? "python3 -m tare.declare --scan --write",
    /* It IS committed now: docs/dataset/declarations.json carries every declaring address. */
    enumeration_committed: true,
    declaring_addresses: c.hooks_qui_declarent ?? [],
    /* OU ces neuf-la tombent dans la liste triee des 1 559.
       La grille de la section 01 rend une case par hook. Expedier les 1 559 adresses
       couterait ~65 ko a une page qui a un budget de 13 ko gzip ; expedier neuf INDEX coute
       une centaine d'octets et dit exactement la meme chose. Ils sont calcules ici, ou la
       liste complete est disponible, jamais estimes. */
    declaring_indexes: (c.hooks_qui_declarent ?? [])
      .map((h) => (d.hooks ?? []).indexOf(h))
      .filter((i) => i >= 0),
    /* La couverture du registre ne vit PAS ici : c'est un fait independant du balayage
       d'evenements, et `upstream()` sort tot quand le releve du scan manque. Repliee dedans,
       elle disparaissait avec lui — deux faits qui n'ont rien a voir, couples par accident.
       Voir `REGISTRY_COVERAGE`, plus bas, rendu a la racine des faits. */
  };
}

/**
 * Ce que le registre officiel couvre du corpus mesure. Deux ensembles, une intersection.
 *
 * Les adresses absentes ne sont PAS rendues sur la page : soixante-dix-huit adresses
 * couteraient trois kilooctets a un document dont le budget est de quinze. Le compte est
 * affiche, la liste est ecrite dans facts.json — donc verifiable — et le fichier lu est nomme.
 */
function registryCoverage() {
  if (!existsSync(REGISTRY)) return null;
  const raw = JSON.parse(readFileSync(REGISTRY, "utf8"));
  const rows = Array.isArray(raw) ? raw : (raw.hooks ?? []);
  const listees = new Set(rows.map((e) => (e.hook?.address ?? "").toLowerCase()));
  // TOUS les hooks mesures, pas seulement ceux qui prelevent : la question est « le
  // registre les decrit-il ? », et un hook a 0,00 bps compte autant qu'un autre.
  const mesures = [...new Set(MEAS.map((m) => m.hook.toLowerCase()))].sort();
  const absents = mesures.filter((h) => !listees.has(h));
  return {
    measured: mesures.length,
    listed: mesures.length - absents.length,
    absent: absents.length,
    /* La liste complete est ECRITE PAR L'ENGIN dans docs/dataset/registre-couverture.json,
       qui est commite ; facts.json est un artefact de build et gitignore, donc le citer
       envoyait un lecteur vers un fichier qu'un clone frais n'a pas. On garde la liste ici
       pour que le test la recompte, et la page cite le fichier commite. */
    absent_addresses: absents,
  };
}

const UPSTREAM = upstream();
const REGISTRY_COVERAGE = registryCoverage();

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
  census: { pools: POOLS.length, hooks: censusHooks.length, file: CENSUS_FILE },
  /* Independant du balayage d'evenements : voir la note dans upstream(). */
  registry_coverage: REGISTRY_COVERAGE,
  structure: STRUCTURE,
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
    // Le depot REEL. L'ancienne valeur — github.com/beorlor/tare — rendait 404 : le lien
    // « SOURCE » de la landing, c'est-a-dire le premier que clique quelqu'un qui veut
    // verifier au lieu de croire, ne menait nulle part.
    url: "https://github.com/JeanBaptisteDurand/ETH_Online_2026",
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
w(
  "structure",
  STRUCTURE
    ? `${grp(STRUCTURE.pairs)} pairs / ${STRUCTURE.pairs_multi} with several pools (${STRUCTURE.pct_multi} %) · ${STRUCTURE.unknown_pools} pools unread`
    : "NOT MEASURED",
);
w(
  "contested",
  STRUCTURE?.contested
    ? `${STRUCTURE.contested.n} measurements / ${STRUCTURE.contested.pools} pools / ${STRUCTURE.contested.hooks} hooks · widest spread ${
        STRUCTURE.contested.pairs.find((x) => x.id === STRUCTURE.contested.widest_id)?.spread
      } bps`
    : "NOT MEASURED",
);
w("tests", tests ? `${tests.green}/${tests.run}` : "NOT MEASURED");
w("commit", commit ?? "NOT MEASURED");
if (!existsSync(OUT)) process.exit(1);
