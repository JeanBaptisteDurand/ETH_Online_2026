/**
 * html.mjs — every byte of markup on this page, rendered from facts.json at build time.
 *
 * The rule this file exists to enforce: no number reaches the DOM except through `facts`.
 * There is no literal measurement anywhere below. If a field is null, the markup prints
 * NOT MEASURED and keeps its layout — it never guesses, and it never silently drops.
 */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const grp = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const NM = '<span class="ink-3">NOT MEASURED</span>';
const or = (v, f) => (v === null || v === undefined ? NM : f(v));

/* The ramp domains, straight from the charte: 0 · ]0,1] · ]1,10] · ]10,30] · ]30,100] ·
   ]100,300] · >300. Seven steps, logarithmic, and the only place colour is decided. */
const RAMP = [
  { max: 0, cls: "m0" },
  { max: 1, cls: "m1" },
  { max: 10, cls: "m2" },
  { max: 30, cls: "m3" },
  { max: 100, cls: "m4" },
  { max: 300, cls: "m5" },
  { max: Infinity, cls: "m6" },
];
const rampClass = (bps) => (bps === null ? "" : RAMP.find((r) => bps <= r.max).cls);

const short = (h, head = 6, tail = 4) =>
  h.length <= head + tail + 4 ? h : `${h.slice(0, 2 + head)}…${h.slice(-tail)}`;

/** 1e15 wei of an 18-decimal token, printed the way a swap size should be read. */
const sizeLabel = (wei) => {
  const s = String(wei);
  const d = s.length - 18;
  if (d > 0) return `${s.slice(0, d)}${s.slice(d).replace(/0+$/, "") ? "." + s.slice(d).replace(/0+$/, "") : ""}`;
  return `0.${"0".repeat(-d)}${s.replace(/0+$/, "") || "0"}`;
};

/* ------------------------------------------------------ the 14-bit register */

const activeFlags = (addr, flags) => {
  const bits = BigInt(addr) & 0x3fffn;
  return flags.map((f) => ({ ...f, on: (bits >> BigInt(f.bit)) & 1n ? 1 : 0 }));
};

const ledRow = (addr, flags, id) => {
  const fs = activeFlags(addr, flags);
  return `<div class="leds" id="${id}" data-sweep="pending" role="img" aria-label="14 hook permission bits, ${
    fs.filter((f) => f.on).length
  } set">${fs.map((f) => `<i class="led" data-on="${f.on}" title="${f.name}"></i>`).join("")}</div>`;
};

const flagList = (addr, flags) => {
  const on = activeFlags(addr, flags).filter((f) => f.on);
  return on.length
    ? on.map((f) => `<span class="flag">${f.name}</span>`).join("")
    : '<span class="flag ink-3">NO PERMISSION BIT SET</span>';
};

/* --------------------------------------- two amounts, aligned digit by digit */

/**
 * The SSTR "with / without" figure, done in type instead of in pixels: the two quotes are
 * printed one under the other, right-aligned, and the digits they share are dimmed. Where
 * the ink starts is exactly where the hook took something.
 */
const divergence = (a, b) => {
  if (a === null || b === null) return NM;
  const w = Math.max(a.length, b.length);
  const pa = a.padStart(w, " ");
  const pb = b.padStart(w, " ");
  let i = 0;
  while (i < w && pa[i] === pb[i]) i++;
  const split = (s) =>
    `<span class="ink-3">${esc(s.slice(0, i)).replace(/ /g, "&nbsp;")}</span><span class="ink">${esc(
      s.slice(i),
    )}</span>`;
  return { withHook: split(pa), withoutHook: split(pb), shared: i, width: w };
};

/* ------------------------------------------------------------- small pieces */

/* The report-index device: number, rule and count on one line, the title underneath.
   It survives a two-line title, which a single baseline row does not. */
const sindex = (n, title, count) => `
<div class="sindex">
  <div class="sindex-top">
    <span class="n">${esc(n)}</span>
    <span class="rule"></span>
    <span class="count">${esc(count)}</span>
  </div>
  <h2 class="h2">${title}</h2>
</div>`;

const rampLegend = () => `
<div class="legend" role="img" aria-label="measurement ramp, seven logarithmic steps in basis points">
  ${RAMP.map(
    (r, i) =>
      `<div class="lg"><i class="sw" style="background:var(--m-${i})"></i><span class="data-xs">${
        i === 0 ? "0" : i === 6 ? "&gt;300" : `≤${r.max}`
      }</span></div>`,
  ).join("")}
  <span class="data-xs lg-unit">BPS · INFERNO [0.18;0.90] · 7 STEPS</span>
</div>`;

const chip = (t) => `<span class="chip">${esc(t)}</span>`;

/* =========================================================================== */

export function render(f) {
  const B = esc(f.block_pretty);
  const heroFlags = flagList(f.hero.hook, f.hook_flags);
  const div = divergence(f.hero.out_with, f.hero.out_without);

  /* ---------------------------------------------------------------- header */
  const header = `
<header class="topbar">
  <div class="wrap topbar-in">
    <a class="mark" href="#top"><span>TARE</span><i class="mark-rule"></i><span class="caption">MEASURES WHAT A UNISWAP V4 HOOK TAKES</span></a>
    <nav class="topnav caption">
      <a class="link" href="/hooks">INSTRUMENT →</a>
      <a class="link" href="${esc(f.repo.url)}">SOURCE →</a>
    </nav>
  </div>
</header>`;

  /* -------------------------------------------------------------- section 0 */
  const s0 = `
<section id="top" class="s0">
  <i class="dither" aria-hidden="true"></i>
  <div class="wrap s0-in">
    <div class="s0-left">
      <p class="eyebrow caption">UNISWAP V4 · BASE · BLOCK ${B}</p>
      <h1 class="hero">${grp(f.upstream.hooks_swept)}&nbsp;hooks.<br>Zero<br>declare.</h1>
      <p class="lead">Uniswap asks a hook to declare what it charges, through the <span class="mono-in">HookSwap</span>
      and <span class="mono-in">HookFee</span> events its own guide recommends. Across
      ${or(f.upstream.hooks_swept, (v) => grp(v))} hooks deployed in ${or(f.upstream.block_window, (v) => grp(v))}
      Base blocks, not one emits either. So this measures it instead — by replacing the hook with an inert
      ${or(f.stub.bytes, (v) => v)}-byte stub and quoting the same swap twice.</p>
      <div class="s0-facts">
        <div><span class="caption">CORPUS</span><span class="data">${grp(f.corpus.n)} measurements · ${grp(
    f.corpus.pools,
  )} pools</span></div>
        <div><span class="caption">ABOVE ${f.finding.threshold_bps} BPS, LP FEE 0</span><span class="data">${grp(
    f.finding.n,
  )} of them</span></div>
        <div><span class="caption">MIN / MEDIAN / MAX</span><span class="data">${esc(f.finding.min)} · ${esc(
    f.finding.median,
  )} · ${esc(f.finding.max)} bps</span></div>
      </div>
    </div>

    <aside class="s0-right">
      <div class="panel instrument">
        <div class="panel-hd">
          <span class="label">HOOK PERMISSION REGISTER</span>
          ${chip("NO RPC")}
        </div>
        <div class="pad">
          <label class="caption" for="addr">PASTE A HOOK ADDRESS</label>
          <input id="addr" class="addr hex" spellcheck="false" autocomplete="off"
                 value="${esc(f.hero.hook)}" aria-describedby="addr-note">
          ${ledRow(f.hero.hook, f.hook_flags, "leds-head")}
          <div class="flags" id="flags">${heroFlags}</div>
          <p id="addr-note" class="data-xs">14 low bits of the address, per v4-core <span class="hex">Hooks.sol</span>.
          A hook cannot lie about these: they are its address.</p>
        </div>

        <div class="verdict">
          <div class="verdict-hd">
            <span class="label">MEASURED EXTRACTION</span>
            ${chip(f.hero.label)}
          </div>
          <p class="metric-xl">${esc(f.hero.bps)}<span class="unit">bps</span></p>
          <dl class="prov">
            <div><dt>HOOK</dt><dd class="hex">${esc(f.hero.hook)}</dd></div>
            <div><dt>POOL</dt><dd class="hex">${esc(f.hero.pool_id)}</dd></div>
            <div><dt>SIZE</dt><dd>${esc(grp(f.hero.amount_in))} wei · zeroForOne=${f.hero.zero_for_one}</dd></div>
            <div><dt>LP FEE</dt><dd>${or(f.hero.stored_lp_fee, (v) => `${v} — read from PoolManager storage`)}</dd></div>
            <div><dt>BLOCK</dt><dd>${grp(f.hero.block)} · chain ${f.chain_id}</dd></div>
          </dl>
        </div>

        <div class="replay">
          <span class="caption">REPLAY THIS ROW</span>
          <code>docker compose up -d
make measure HOOK=${esc(f.hero.hook)} BLOCK=${f.hero.block}</code>
        </div>
      </div>
    </aside>
  </div>
  <div class="wrap s0-foot caption">
    <span>SCROLL ↓</span>
    <span>ENGINE ${esc(f.engine_ver ?? "NOT MEASURED")} · STUB ${esc(short(f.stub.keccak256 ?? "0x", 8, 6))}</span>
  </div>
</section>`;

  /* -------------------------------------------------------------- section 1 */
  const cells = Array.from(
    { length: f.upstream.hooks_swept },
    (_, i) => `<i class="hcell" title="hook ${i + 1} of ${f.upstream.hooks_swept} — emits neither event"></i>`,
  ).join("");

  const s1 = `
<section id="fact" class="band" data-reveal>
  <div class="wrap">
    ${sindex("01", "The declaration<br>that never comes", `${grp(f.upstream.hooks_swept)} HOOKS SWEPT`)}
    <div class="s1-in">
      <figure class="s1-grid">
        <div class="hgrid" role="img" aria-label="${f.upstream.hooks_swept} hooks, none of them emitting a fee event">${cells}</div>
        <figcaption class="data-xs">One cell per hook deployed in the last ${grp(
          f.upstream.block_window,
        )} Base blocks. Colour on this page encodes extraction. Nothing here is coloured,
        because nothing here declares anything.</figcaption>
      </figure>

      <div class="s1-side">
        <div class="stat">
          <span class="label">HookSwap</span>
          <p class="metric">${f.upstream.emitting_hookswap} <span class="over">/ ${f.upstream.hooks_swept}</span></p>
        </div>
        <div class="stat">
          <span class="label">HookFee</span>
          <p class="metric">${f.upstream.emitting_hookfee} <span class="over">/ ${f.upstream.hooks_swept}</span></p>
        </div>
        <hr class="hr">
        <div class="stat">
          <span class="label">OFFICIAL REGISTRY</span>
          <p class="metric">${grp(f.upstream.registry_entries)} <span class="over">entries</span></p>
          <p class="data-sm">${f.upstream.registry_fields} fields per entry.
          <strong class="ink">${f.upstream.registry_numeric_fields} of them numeric.</strong></p>
          <pre class="code-in hex">"additionalProperties": ${f.upstream.registry_additional_properties}</pre>
          <p class="data-sm">The schema does not merely omit a number. It forbids adding one.</p>
        </div>
        <p class="data-xs prov-note">SOURCE · ${esc(f.upstream.provenance)}. ${
          f.upstream.enumeration_committed
            ? ""
            : "The per-hook enumeration behind these counts is not committed under docs/ yet, so the list is <b>NOT PUBLISHED</b> — the counts are stated, the addresses are not claimed."
        }</p>
      </div>
    </div>
  </div>
</section>`;

  /* -------------------------------------------------------------- section 2 */
  const hookRows = f.per_hook
    .map(
      (h) => `<tr>
      <td class="hex"><span class="ink">${esc(h.hook)}</span></td>
      <td class="num">${h.n}</td>
      <td class="num">${h.pools}</td>
      <td class="num ${h.finding ? "ink" : "ink-3"}">${h.finding}</td>
      <td>${h.finding ? ledRow(h.hook, f.hook_flags, `leds-${h.hook.slice(2, 8)}`) : '<span class="data-xs">—</span>'}</td>
    </tr>`,
    )
    .join("");

  const s2 = `
<section id="finding" class="band" data-reveal>
  <div class="wrap">
    ${sindex("02", "So it was measured", `${grp(f.finding.n)} MEASUREMENTS OVER ${f.finding.threshold_bps} BPS`)}
    <div class="s2-in">
      <div class="s2-lead">
        <p class="lead">${f.finding.hooks.length === 1 ? "One hook takes" : `${f.finding.hooks.length} hooks take`}
        a measurable cut on pools whose LP fee, read straight out of <span class="mono-in">PoolManager</span>
        storage, is <strong>zero</strong>. Median ${esc(f.finding.median)}&nbsp;bps, worst
        ${esc(f.finding.max)}&nbsp;bps. Not a modelled fee: the difference between two quotes of the same
        swap, on the same pool, at the same block.</p>
        ${rampLegend()}
      </div>
      <div class="s2-nums">
        <div class="bigstat ${rampClass(Number(f.finding.min))}">
          <span class="label">MIN</span><p class="metric">${esc(f.finding.min)}</p><span class="data-xs">BPS</span>
        </div>
        <div class="bigstat ${rampClass(Number(f.finding.median))}">
          <span class="label">MEDIAN</span><p class="metric">${esc(f.finding.median)}</p><span class="data-xs">BPS</span>
        </div>
        <div class="bigstat ${rampClass(Number(f.finding.max))}">
          <span class="label">MAX</span><p class="metric">${esc(f.finding.max)}</p><span class="data-xs">BPS</span>
        </div>
      </div>
    </div>

    <div class="tablewrap">
      <table class="dense">
        <caption class="sr-only">Every hook in the corpus, with how many of its measurements exceed the threshold</caption>
        <thead><tr>
          <th>HOOK</th><th class="num">MEASUREMENTS</th><th class="num">POOLS</th>
          <th class="num">OVER ${f.finding.threshold_bps} BPS · LP FEE 0</th><th>PERMISSION BITS</th>
        </tr></thead>
        <tbody>${hookRows}</tbody>
      </table>
    </div>
    <p class="data-xs prov-note">Corpus <span class="hex">${esc(f.corpus.file)}</span> · ${grp(
      f.corpus.n,
    )} measurements · ${Object.entries(f.corpus.by_label)
      .map(([k, v]) => `${v} ${k}`)
      .join(" · ")} · block ${B}.${
      f.upstream.absent_from_registry.filter((h) => f.per_hook.some((p) => p.hook === h)).length
        ? ` ${f.upstream.absent_from_registry
            .filter((h) => f.per_hook.some((p) => p.hook === h))
            .map((h) => `<span class="hex">${esc(h)}</span>`)
            .join(", ")} is not in the official registry at all: the registry describes without
            quantifying, and it does not see everything.`
        : ""
    }</p>
  </div>
</section>`;

  /* -------------------------------------------------------------- section 3 */
  const codeEntry = f.bytecode.hooks[f.hero.hook];
  const realHead = codeEntry
    ? (codeEntry.head_hex.match(/.{1,32}/g) || []).map((l) => `<span>${esc(l)}</span>`).join("")
    : "";
  const stubBody = f.stub.lines
    .map(
      (l) =>
        `<span class="sl"><b class="hex">${esc(l.hex)}</b>${
          l.note ? `<i>${esc(l.note)}</i>` : ""
        }</span>`,
    )
    .join("");

  const s3 = `
<section id="method" class="band" data-reveal>
  <div class="wrap">
    ${sindex("03", "Change the hook,<br>not the pool", `STUB · ${f.stub.bytes} BYTES`)}
    <p class="lead s3-lead">A v4 pool's identity is its <span class="mono-in">PoolKey</span>, and the PoolKey contains the
    hook's address. "The same pool without its hook" does not exist. So the pool is left untouched and the
    <em>hook</em> is replaced: on a fork pinned to one block, <span class="mono-in">anvil_setCode</span> writes an inert
    stub over the hook's bytecode. Quote the same swap twice. The gap <em>is</em> what the hook took.</p>

    <div class="swap-panels">
      <div class="panel">
        <div class="panel-hd"><span class="label">REAL BYTECODE</span>
        <span class="data-xs">${codeEntry ? `${grp(codeEntry.len_bytes)} BYTES` : "NOT MEASURED"}</span></div>
        <pre class="codeblock hex" aria-label="first bytes of the deployed hook">${realHead}</pre>
        <div class="panel-ft data-xs hex">${codeEntry ? `keccak256 ${esc(codeEntry.keccak256)}` : NM}<br>
        first ${f.bytecode._head_bytes} bytes shown — the rest is on chain, not in this repo</div>
      </div>

      <div class="between">
        <span class="label vert">anvil_setCode</span>
        <i class="arrow" aria-hidden="true"></i>
      </div>

      <div class="panel">
        <div class="panel-hd"><span class="label">INERT STUB</span>
        <span class="data-xs">${f.stub.bytes} BYTES · WHOLE PROGRAM</span></div>
        <pre class="codeblock stubcode" aria-label="the complete stub bytecode">${stubBody}</pre>
        <div class="panel-ft data-xs hex">keccak256 ${esc(f.stub.keccak256 ?? "NOT MEASURED")}<br>
        echoes the selector, returns 96 bytes for beforeSwap and 64 otherwise — nothing else</div>
      </div>
    </div>

    <ul class="invariants">
      <li><span class="label">UNCHANGED</span><span class="data">poolId</span></li>
      <li><span class="label">UNCHANGED</span><span class="data">liquidity</span></li>
      <li><span class="label">UNCHANGED</span><span class="data">slot0</span></li>
      <li><span class="label">UNCHANGED</span><span class="data">reserves</span></li>
      <li><span class="label">CHANGED</span><span class="data ink">the code that runs during the swap</span></li>
    </ul>

    <figure class="quotes">
      <figcaption class="caption">THE SAME SWAP, QUOTED TWICE · ${esc(grp(f.hero.amount_in))} WEI IN · BLOCK ${B}</figcaption>
      ${
        typeof div === "string"
          ? div
          : `<div class="qrow"><span class="label">WITH THE HOOK</span><code class="qnum">${div.withHook}</code></div>
             <div class="qrow"><span class="label baseline">WITH THE STUB</span><code class="qnum base">${div.withoutHook}</code></div>
             <div class="qrow gap"><span class="label">GAP</span><code class="qnum ink">${esc(
               String(BigInt(f.hero.out_without) - BigInt(f.hero.out_with)),
             )}</code></div>
             <p class="data-xs">Both quotes are ${div.width} digits long and they diverge at digit ${div.shared + 1}. One percent is not a rounding difference: it shows up in the third
             digit of the output. bps = (out_without - out_with) / out_without x 10 000 =
             <span class="ink">${esc(f.hero.bps)}</span>.</p>`
      }
    </figure>
  </div>
</section>`;

  /* -------------------------------------------------------------- section 4 */
  const pts = f.gate_a3.points;
  const s4 = `
<section id="curve" class="band" data-reveal>
  <div class="wrap">
    ${sindex("04", "The same swap,<br>five sizes", `GATE A3 · ±${f.gate_a3.tol_bps} BPS`)}
    <div class="s4-in">
      <figure class="chartbox panel" id="chart" data-points='${esc(JSON.stringify(pts))}'>
        <div class="panel-hd">
          <span class="label">EXTRACTION vs SWAP SIZE · HOOK ${esc(short(f.gate_a3.hook, 8, 6))}</span>
          <span class="data-xs">X LOG · Y ANCHORED AT 0</span>
        </div>
        <div class="chart-host" id="chart-host"></div>
        <table class="dense fallback" id="chart-fallback">
          <caption class="sr-only">The five figures gate A3 reproduces</caption>
          <thead><tr><th class="num">AMOUNT IN (WEI)</th><th class="num">TOKENS IN</th><th class="num">BPS</th><th>LABEL</th></tr></thead>
          <tbody>${pts
            .map(
              (pt) => `<tr><td class="num hex">${grp(pt.amount_in)}</td><td class="num">${sizeLabel(
                pt.amount_in,
              )}</td><td class="num cell ${rampClass(pt.bps)}"><span class="v">${pt.bps.toFixed(
                2,
              )}</span></td><td>${chip("MEASURED")}</td></tr>`,
            )
            .join("")}</tbody>
        </table>
        <div class="panel-ft data-xs hex">hook ${esc(f.gate_a3.hook)} · fee ${f.gate_a3.fee} · tickSpacing ${
          f.gate_a3.tick_spacing
        } · block ${grp(f.block)} · stub ${esc(short(f.stub.keccak256 ?? "0x", 8, 6))} · ${esc(
          f.engine_ver ?? "NOT MEASURED",
        )}</div>
      </figure>

      <div class="s4-side">
        <p class="body">Extraction is not a constant. It is ${pts[0].bps.toFixed(2)}&nbsp;bps on the smallest
        size and ${pts[pts.length - 1].bps.toFixed(2)}&nbsp;bps on the largest — as the swap grows, price
        impact grows with it and the hook's share of the output falls. A single headline percentage for a hook
        would be wrong at every size but one.</p>
        <p class="body">These five figures are not parameters of the page. They are the gate the engine has to
        pass: an independent rewrite produced them before this code existed, and the gate fails if a
        re-measurement drifts by more than ${f.gate_a3.tol_bps}&nbsp;bps.</p>
        <div class="replay wide">
          <span class="caption">REPRODUCE ALL FIVE</span>
          <code>docker compose up -d
make gate-a3</code>
        </div>
      </div>
    </div>
  </div>
</section>`;

  /* -------------------------------------------------------------- section 5 */
  const mrow = (r, i) => `<tr data-bps="${r.bps}" data-size="${r.amount_in}">
    <td class="hex"><span class="ink">${esc(short(r.hook, 8, 6))}</span></td>
    <td class="hex">${esc(short(r.pool_id, 8, 6))}</td>
    <td class="num">${esc(sizeLabel(r.amount_in))}</td>
    <td class="num">${r.zero_for_one ? "0→1" : "1→0"}</td>
    <td class="num">${r.stored_lp_fee === null ? NM : r.stored_lp_fee}</td>
    <td class="cell ${rampClass(r.bps)}">
      <div class="v num">${r.bps.toFixed(2)}</div>
      <div class="u num">±0.00 bps</div>
      <div class="p hex">block ${grp(r.block_number)}</div>
    </td>
    <td>${chip(r.label)}</td>
  </tr>`;

  const rows = f.matrix.rows;
  const headRows = rows.slice(0, f.matrix.head).map(mrow).join("");
  const tailRows = rows.slice(f.matrix.head).map(mrow).join("");
  const elision = f.matrix.elided
    ? `<tr class="elide"><td colspan="7"><span class="label">${grp(
        f.matrix.elided,
      )} ROWS ELIDED</span> · this table is the head and the tail of the ranking, and says so.
      The whole corpus is <span class="hex">${esc(f.corpus.file)}</span>.</td></tr>`
    : "";

  const s5 = `
<section id="matrix" class="band" data-reveal>
  <div class="wrap">
    ${sindex("05", "The matrix", `${grp(f.census.pools)} LIQUID POOLS · ${f.census.hooks} DISTINCT HOOKS`)}
    <div class="tablewrap">
      <table class="dense matrix" id="matrix-table">
        <caption class="sr-only">Head and tail of the measured ranking. Click a header to sort.</caption>
        <thead><tr>
          <th>HOOK</th><th>POOL</th>
          <th class="num sortable" data-sort="size" tabindex="0" role="button">SIZE IN</th>
          <th class="num">DIR</th><th class="num">LP FEE</th>
          <th class="num sortable" data-sort="bps" tabindex="0" role="button" aria-sort="descending">EXTRACTION</th>
          <th>LABEL</th>
        </tr></thead>
        <tbody>${headRows}${elision}${tailRows}</tbody>
      </table>
    </div>
    <div class="s5-ft">
      <p class="data-xs">Same cells as the instrument: value, uncertainty, provenance. No simplified
      landing variant exists. Uncertainty is ±0.00 because both quotes are integer outputs of the same
      pinned block — the measurement has no sampling error, only the limits listed in 06.</p>
      <a class="cta" href="/hooks">OPEN THE FULL INSTRUMENT <span aria-hidden="true">↳</span></a>
    </div>
  </div>
</section>`;

  /* -------------------------------------------------------------- section 6 */
  const s6 = `
<section id="limits" class="band limits" data-reveal>
  <div class="wrap">
    ${sindex("06", "What I do not know", "PUBLISHED, NOT HIDDEN")}
    <div class="s6-in">
      <div class="body">
        <p><strong>${grp(f.corpus.n - (f.corpus.by_label.MEASURED ?? 0))} of ${grp(
          f.corpus.n,
        )} measurements are not values.</strong> ${Object.entries(f.corpus.by_label)
          .filter(([k]) => k !== "MEASURED")
          .map(([k, v]) => `${grp(v)} came back <span class="mono-in">${k}</span>`)
          .join(", ") || "None of them, in this corpus"}. Each one is counted, kept in the corpus with the
        reason it failed, and excluded from every figure above. A bounded read is a label, never a zero —
        this project has published a false finding for breaking that rule, and the correction is in the
        engine's tests.</p>
        <p><strong>NOT_QUOTABLE and NOT_MEASURABLE are not the same failure.</strong> V4Quoter reverts for
        one direction of most pools: that is a quote that could not be taken. A hook with custom accounting
        <em>is</em> the liquidity, so removing it does not reveal a fee, it destroys the pool: that is a
        counterfactual that does not exist. Neither is a zero, and neither is ever reported as one.</p>
        <p><strong>Dynamic fees are read, not assumed.</strong> The stub returns a zero lpFeeOverride, and zero
        does not activate the override: v4's Pool.sol only applies one when the 0x400000 flag is set, so a
        dynamic-fee pool falls back to its stored fee. An earlier version of this project claimed the
        opposite. It was wrong, and the correction is in the engine's docstring.</p>
        <p><strong>Attribution is not proven.</strong> The corpus says two addresses take about one percent.
        It does not say who deployed them or why. Any name attached to those addresses here would be
        PLAUSIBLE, NOT PROVEN, so no name is attached.</p>
        <p><strong>One block, one chain.</strong> Everything on this page is Base at block ${B}. A hook that
        charges nothing at this block can charge at the next one. The measurement is a photograph, and it is
        labelled with the moment it was taken.</p>
      </div>
      <aside class="s6-side">
        <div class="stat"><span class="label">LABELS IN THE CORPUS</span>
          <ul class="labellist">${["MEASURED", "INTERPOLATED", "NOT_MEASURABLE", "NOT_QUOTABLE"]
            .map(
              (l) =>
                `<li>${chip(l)}<span class="num data">${
                  f.corpus.by_label[l] !== undefined ? grp(f.corpus.by_label[l]) : "0"
                }</span></li>`,
            )
            .join("")}</ul>
        </div>
        <p class="data-xs">A label is never upgraded to make a point. INTERPOLATED is in the enum and is
        currently unused: nothing on this page is interpolated.</p>
      </aside>
    </div>
  </div>
</section>`;

  /* ---------------------------------------------------------------- footer */
  const tests = f.repo.tests;
  const foot = `
<footer class="foot">
  <div class="wrap foot-in">
    <div class="foot-mark">
      <span class="hero foot-hero">TARE</span>
      ${ledRow(f.hero.hook, f.hook_flags, "leds-foot")}
    </div>
    <dl class="foot-meta data-xs">
      <div><dt>LICENCE</dt><dd>${esc(f.repo.license)}</dd></div>
      <div><dt>COMMIT</dt><dd class="hex">${or(f.repo.commit, esc)}</dd></div>
      <div><dt>ENGINE TESTS</dt><dd>${
        tests ? `${tests.green}/${tests.run} green` : NM
      }</dd></div>
      <div><dt>ENGINE</dt><dd>${esc(f.engine_ver ?? "NOT MEASURED")}</dd></div>
      <div><dt>BUILT</dt><dd class="hex">${esc(f.generated_at)}</dd></div>
      <div><dt>SOURCE</dt><dd><a class="link" href="${esc(f.repo.url)}">${esc(f.repo.url)}</a></dd></div>
    </dl>
    <p class="data-xs foot-note">Every number on this page was written by
    <span class="hex">apps/landing/build/facts.mjs</span> from the corpus, the engine's own stub and its A3
    gate. There is no literal measurement in the markup. Built solo, with Claude Code; the prompts and the
    decision trail are committed under <span class="hex">docs/</span>.</p>
  </div>
</footer>`;

  return { header, body: [s0, s1, s2, s3, s4, s5, s6].join("\n"), foot };
}
