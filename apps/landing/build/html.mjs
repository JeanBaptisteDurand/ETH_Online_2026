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

/* Ou vit l'instrument, vu depuis la page d'accueil. Sur une page de PROJET GitHub Pages le
   site est servi sous /<depot>/, donc un « /hooks » absolu pointe a cote et rend un 404 —
   c'est-a-dire que le seul lien qui mene au produit ne mene nulle part. */
const BASE = (process.env.BASE_URL ?? "/").replace(/\/*$/, "/");
const INSTRUMENT = `${BASE}hooks/`;

/* The page ships as one response and holds itself to a 14 kB gzip critical document, which
   `npm run budget` measures. The markup below is indented for whoever reads this file; the
   wire does not need that indentation. Runs of whitespace between tags collapse to a single
   space — which is what HTML does with them anyway — except inside <pre> and <code>, where a
   newline is content and is left exactly as it was. Spacing is all this removes. */
const tighten = (html) =>
  html
    .split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)/)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/\n\s*/g, " ")
            .replace(/ {2,}/g, " ")
            /* and the space between two block-level tags, where HTML renders nothing anyway.
               Inline tags are not in this list, because there a space is a word gap. */
            .replace(/(<\/?(?:div|p|section|table|thead|tbody|tr|td|th|caption|ul|li|dl|dt|dd|figure|figcaption|aside|header|footer|nav|main|h1|h2|hr|input)\b[^>]*>) +(?=<)/g, "$1"),
    )
    .join("");

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
      <a class="link" href="${INSTRUMENT}">INSTRUMENT →</a>
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
  /* UNE CASE PAR HOOK, et neuf d'entre elles sont COLOREES.
     Cette section rendait 84 cases toutes vides sous la phrase « nothing here declares
     anything ». Les deux etaient faux : le balayage couvre 200 000 blocs et 1 559 hooks, et
     NEUF declarent. Le corriger donne une image plus forte que celle qu'il remplace — la
     rarete se voit d'autant mieux qu'il y a dix-huit fois plus de cases autour.
     Les neuf positions sont calculees dans facts.mjs sur la liste complete, jamais estimees ;
     seuls les index voyagent, parce que 1 559 adresses couteraient 65 ko a une page qui a un
     budget de 13 ko. */
  const u = f.upstream;

  /* LA GRILLE EN SVG, et pourquoi pas en HTML.
     1 559 elements <i> pesaient 2,5 ko gzip et cassaient le budget de 14 ko du document
     critique — pour dessiner un quadrillage regulier. Un <pattern> tuile les 1 559 cases en
     une centaine d'octets, un rectangle masque la queue de la derniere ligne, et les NEUF
     qui declarent sont neuf rectangles a leur position exacte.
     Rien n'est approxime : les index viennent de facts.mjs, qui les calcule sur la liste
     complete des 1 559 adresses. */
  const COLS = 48;
  const PAS = 13; // 12 px de cellule + 1 px de gouttiere
  const grille = (() => {
    const n = u.hooks_swept ?? 0;
    const lignes = Math.ceil(n / COLS);
    const reste = n - (lignes - 1) * COLS; // cases occupees sur la derniere ligne
    const w = COLS * PAS - 1;
    const h = lignes * PAS - 1;
    /* UN SEUL <path> pour les neuf marques, et non neuf <rect>.
       Le budget du document critique est de 14 ko gzip, et la page etait a 13,99 : neuf
       elements <rect> avec leurs attributs distincts ne compressent pas et le cassaient. Neuf
       sous-chemins « M x y h12 v12 h-12 z » disent la meme chose en un tiers du poids. */
    const d = (u.declaring_indexes ?? [])
      .map((i) => `M${(i % COLS) * PAS} ${Math.floor(i / COLS) * PAS}h12v12h-12z`)
      .join("");
    return `<svg class="hgrid" viewBox="0 0 ${w} ${h}" role="img" aria-label="${grp(n)} hooks, ${
      u.hooks_declaring
    } emitting a fee event"><defs><pattern id="hc" width="${PAS}" height="${PAS}" patternUnits="userSpaceOnUse"><rect width="12" height="12" class="off"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#hc)"/><rect x="${
      reste * PAS
    }" y="${(lignes - 1) * PAS}" width="${(COLS - reste) * PAS}" height="${PAS}" class="mask"/><path class="on" d="${d}"/></svg>`;
  })();

  const s1 = !u.published
    ? `
<section id="fact" class="band" data-reveal>
  <div class="wrap">
    ${sindex("01", "The declaration<br>that never comes", "NOT MEASURED")}
    <div class="s1-in">
      <p class="data-sm">${esc(u.why)}</p>
    </div>
  </div>
</section>`
    : `
<section id="fact" class="band" data-reveal>
  <div class="wrap">
    ${sindex("01", "The declaration<br>that almost never comes", `${grp(u.hooks_declaring)} OF ${grp(u.hooks_swept)} DECLARE`)}
    <div class="s1-in">
      <figure class="s1-grid">
        ${grille}
        <figcaption class="data-xs">One cell per hook initialised in ${grp(
          u.block_window,
        )} Base blocks (to ${grp(u.block_to)}, coverage ${u.coverage}).
        <strong class="ink">${u.hooks_declaring} are lit</strong> — and what they emit is an
        absolute amount on one past swap, not the rate you would pay at your size.</figcaption>
      </figure>

      <div class="s1-side">
        <div class="stat">
          <span class="label">HOOKS THAT DECLARE</span>
          <p class="metric">${u.hooks_declaring} <span class="over">/ ${grp(u.hooks_swept)}</span></p>
          <p class="data-sm">${((u.hooks_declaring / u.hooks_swept) * 100).toFixed(2)} % of the hooks
          in ${grp(u.initialize_events)} <code>Initialize</code> events.
          ${u.emitting_any_contract} contracts emit either event over the same window —
          ${u.emitting_hookswap} <code>HookSwap</code>, ${u.emitting_hookfee} <code>HookFee</code>.</p>
        </div>
        <hr class="hr">
        <div class="stat">
          <span class="label">OFFICIAL REGISTRY</span>
          <p class="metric">${grp(u.registry_entries)} <span class="over">entries</span></p>
          <p class="data-sm">${u.registry_fields} describing fields per entry.
          <strong class="ink">${u.registry_numeric_fields} of them numeric.</strong>
          <code>chainId</code> is a number, but it names a network.</p>
          <pre class="code-in hex">"additionalProperties": ${u.registry_additional_properties}</pre>
          <p class="data-sm">The schema does not merely omit a number. It forbids adding one.</p>
        </div>
        <p class="data-xs prov-note">SOURCE · <code>${esc(u.registry_file ?? "not read")}</code>,
        and <code>${esc(u.provenance)}</code> for the sweep. Both topic0 values are computed from
        their signatures; every declaring address is committed in
        <code>docs/dataset/declarations.json</code>, so the counts are stated <b>and</b> the list
        is published.</p>
      </div>
    </div>
  </div>
</section>`;

  /* -------------------------------------------------------------- section 2 */
  /* Capped, and the cap is stated. The sweep keeps finding hooks; the page must not grow past
     its own critical-document budget without saying that it truncated something. */
  const HOOK_ROWS = 12;
  const hookShown = f.per_hook.slice(0, HOOK_ROWS);
  const hookHidden = f.per_hook.length - hookShown.length;
  const hookRows = hookShown
    .map(
      (h) => `<tr>
      <td class="hex"><span class="ink">${esc(h.hook)}</span></td>
      <td class="num">${h.n}</td>
      <td class="num">${h.pools}</td>
      <td class="num ${h.finding ? "ink" : "ink-3"}">${h.finding}</td>
      <td>${h.finding ? ledRow(h.hook, f.hook_flags, `leds-${h.hook.slice(2, 8)}`) : '<span class="data-xs">—</span>'}</td>
    </tr>`,
    )
    .join("") +
    (hookHidden
      ? `<tr class="elide"><td colspan="5"><span class="label">${grp(hookHidden)} MORE HOOKS</span>
         · sorted by measurements over the threshold, capped at ${HOOK_ROWS} rows here.
         The whole corpus is <span class="hex">${esc(f.corpus.file)}</span>.</td></tr>`
      : "");

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
      /* Cette phrase portait UNE adresse ecrite a la main : « one hook is not in the official
         registry at all ». Le compte reel est de 78 sur 112, et il est bien plus fort — le
         registre officiel ne decrit pas les deux tiers des hooks qu'on a mesures. Les 78
         adresses ne sont PAS rendues : elles couteraient trois kilooctets a un document dont
         le budget est de quinze. Elles sont dans facts.json, donc verifiables. */
      f.registry_coverage
        ? ` Of the ${f.registry_coverage.measured} hooks measured here,
            <strong class="ink">${f.registry_coverage.absent} are not in the official
            registry at all</strong> — ${(
              (f.registry_coverage.absent / f.registry_coverage.measured) *
              100
            ).toFixed(0)} %. It describes without quantifying, and it does not see most of them.
            The ${f.registry_coverage.absent} addresses are in
            <code>docs/dataset/registre-couverture.json</code>.`
        : ""
    }</p>
  </div>
</section>`;

  /* -------------------------------------------------------------- section 3 */
  /* The census counted the doors of every pair; the sweep measured what each door of the
     contested ones takes. Which pair is quoted as the widest gap and which as the counter-
     example are picked by a rule at build time, never by hand — see facts.mjs. The section
     does not render at all when the census is missing: it never guesses a structure.
     Kept deliberately spare: the critical document has a 14 kB gzip budget and this section
     was cut down twice to fit inside it (DESIGN.md 0). */
  const st = f.structure;
  const ct = st?.contested ?? null;
  const byId = (id) => (ct && id ? (ct.pairs.find((x) => x.id === id) ?? null) : null);
  const widest = byId(ct?.widest_id);
  const mostQuoted = byId(ct?.most_quoted_id);
  /* The dearest and the cheapest door of the widest pair, whatever the pair's door count:
     the sentence below must stay true if a third pool appears on it tomorrow. */
  const wq = widest ? widest.gates.filter((g) => g.median !== null) : [];
  const dear = wq[0] ?? null;
  const cheap = wq.length ? wq[wq.length - 1] : null;
  const addr = (a) => esc(short(a, 6, 4));
  /* Le compte des portes qui ne prelevent RIEN. Il lisait `g.median`, qui est la mediane
     ARRONDIE a deux decimales : une porte a 0,004 bps se serait publiee « at 0.00 bps »,
     c'est-a-dire comme ne prenant rien, alors qu'elle prend quelque chose. Un arrondi
     d'affichage ne doit jamais decider d'une affirmation. On lit la mediane BRUTE, et on
     n'appelle zero que ce qui est exactement zero. */
  const nZero = (x) =>
    x.gates.filter((g) => g.median_raw !== null && g.median_raw === 0).length;

  /* A door with no measured value gets no ramp step: colour here is a magnitude, and not
     measured is not zero. It keeps the flat ground and carries the engine's own labels in
     place of a number — which is the whole point of having four of them. */
  const door = (g) =>
    g.median === null
      ? `<div class="cell na"><div class="p">${Object.keys(g.labels).map(esc).join(" · ")}</div></div>`
      : `<div class="cell ${rampClass(Number(g.median))}"><div class="v num">${esc(g.median)}</div></div>`;

  /* Deux portes qui portent LE MEME hook restent deux portes — mais le choix ne se fait
     alors pas entre deux hooks, et cette section parle de hooks. Le taire laisserait lire
     « deux hooks prennent des montants differents » la ou un seul hook sert deux pools. */
  const pairRow = (x) =>
    `<tr><td class="hex"><span class="ink">${addr(x.currency0)}</span><br>${addr(
      x.currency1,
    )}${
      x.one_hook_several_pools
        ? '<br><span class="p">un seul hook, deux pools</span>'
        : ""
    }</td><td><div class="doors">${x.gates.map(door).join("")}</div></td></tr>`;

  const s3 = !st
    ? ""
    : `
<section id="structure" class="band" data-reveal>
  <div class="wrap">
    ${sindex("03", "Nowhere else<br>to go", `${grp(st.pairs)} PAIRS · ${st.pairs_multi} WITH A SECOND POOL`)}
    <p class="lead section-lead">A cut is a price only when it can be refused. This census holds every v4 pool that
    was opened with a hook${
      st.window ? `, in a window of ${esc(st.window.span_pretty)} Base blocks,` : ""
    } with liquidity, and <strong class="ink">${grp(st.pairs_single)} of its ${grp(
      st.pairs,
    )} token pairs hold exactly one</strong>: no second door, and no one to quote against.${
      ct ? ` The other ${st.pairs_multi}, and all ${st.gates_in_multi} of their pools, are below.` : ""
    }</p>
    <div class="stat s3-nums">
      <span class="label">PAIRS WITH A SECOND POOL</span>
      <p class="metric">${st.pairs_multi} <span class="over">/ ${grp(st.pairs)} PAIRS · ${esc(st.pct_multi)} %</span></p>
      <span class="data-xs">A LOWER BOUND: ${st.unknown_pools} pools of the census could not be read (${
        (st.unknown_causes ?? []).map((c) => esc(c.cause)).join(" · ") || "cause not recorded"
      })${
        st.unknown_keys_known ? "" : ", with their PoolKeys unrecorded"
      }: a pair whose second pool is one of them is counted here as holding one.</span>
    </div>
    ${
      !ct
        ? `<p class="data-xs prov-note">${NM} — the pools of those pairs have not been swept yet.</p>`
        : `<div class="tablewrap"><table class="dense">
      <caption class="sr-only">Every pair with more than one pool, and what each of its pools takes</caption>
      <thead><tr><th>PAIR · CURRENCY0 / CURRENCY1</th><th>EACH POOL · MEDIAN HOOK EXTRACTION, BPS</th></tr></thead>
      <tbody>${ct.pairs.map(pairRow).join("")}</tbody></table></div>
    <p class="data-xs prov-note">Doors and unread pools from <span class="hex">${esc(st.census_file)}</span>
    and its scan report; extraction from <span class="hex">${esc(ct.file)}</span> — ${grp(ct.n)} measurements,
    ${ct.pools} pools, ${ct.hooks} hooks, ${ct.sizes} sizes both ways, block ${B}, ${esc(ct.engine_ver)}. A door is
    the <b>median of its MEASURED rows</b>, hook only, 2 decimals. ${Object.entries(
      ct.by_label,
    )
      .filter(([k]) => k !== "MEASURED")
      .map(([k, v]) => `${v} ${esc(k)}`)
      .join(" and ")} rows are counted, never read as zero.${
      st.window
        ? ` The census is ${grp(st.window.events)} <span class="mono-in">Initialize</span> events over
    ${esc(st.window.span_pretty)} blocks${
      st.window.coverage === 1 ? " with no chunk missed" : `, coverage ${st.window.coverage}`
    }, kept when the PoolKey names a hook: an older pool, a hookless one or an empty one is not in it.`
        : ""
    }</p>`
    }
    ${
      !ct || !widest || !mostQuoted || !dear || !cheap
        ? ""
        : `<div class="s2-in s3-reads">
      <div><p class="label">WHERE THE SECOND DOOR CHANGES THE PRICE</p>
      <p class="body"><span class="hex ink">${addr(widest.currency0)} / ${addr(widest.currency1)}</span>:
      ${widest.doors} pools, ${widest.hooks} hooks${
        widest.same_lp_fee === null ? "" : `, the same stored LP fee on both — ${widest.same_lp_fee}`
      }. Its dearest door takes a median <strong>${esc(dear.median)}</strong>&nbsp;bps, its cheapest
      <strong>${esc(cheap.median)}</strong>: <strong>${esc(
        widest.spread,
      )}&nbsp;bps apart</strong> over the same size grid at the same block${
        widest.same_lp_fee === null ? "" : ", so the gap is the hook alone"
      }.</p></div>
      <div><p class="label">AND WHERE IT CHANGES ALMOST NOTHING</p>
      <p class="body"><span class="hex ink">${addr(mostQuoted.currency0)} / ${addr(
        mostQuoted.currency1,
      )}</span>: ${mostQuoted.quoted} of ${mostQuoted.doors} pools answered, ${
        mostQuoted.hooks
      } hooks, ${nZero(mostQuoted)} of them at <strong>0.00</strong>&nbsp;bps and the widest at
      <strong>${esc(mostQuoted.worst)}</strong>. Where the doors are most numerous, the hooks take almost
      nothing.</p></div>
    </div>`
    }
  </div>
</section>`;

  /* -------------------------------------------------------------- section 4 */
  /* Whose bytecode this panel shows. The hero's, when it is cached at this block; otherwise
     the highest-extraction hook that is. The panel names it either way — an anonymous hex dump
     labelled "real bytecode" would be an illustration, and this page does not use illustrations. */
  const codeHook =
    (f.bytecode.hooks[f.hero.hook] && f.hero.hook) ||
    f.per_hook.map((h) => h.hook).find((h) => f.bytecode.hooks[h]) ||
    Object.keys(f.bytecode.hooks)[0] ||
    null;
  const codeEntry = codeHook ? f.bytecode.hooks[codeHook] : null;
  const realHead = codeEntry
    ? (codeEntry.head_hex.match(/.{1,32}/g) || []).map((l) => `<span>${esc(l)}</span>`).join("")
    : "";
  const codeIsHero = codeHook === f.hero.hook;
  const stubBody = f.stub.lines
    .map(
      (l) =>
        `<span class="sl"><b class="hex">${esc(l.hex)}</b>${
          l.note ? `<i>${esc(l.note)}</i>` : ""
        }</span>`,
    )
    .join("");

  const s4 = `
<section id="method" class="band" data-reveal>
  <div class="wrap">
    ${sindex("04", "Change the hook,<br>not the pool", `STUB · ${f.stub.bytes} BYTES`)}
    <p class="lead section-lead">A v4 pool's identity is its <span class="mono-in">PoolKey</span>, and the PoolKey contains the
    hook's address. "The same pool without its hook" does not exist. So the pool is left untouched and the
    <em>hook</em> is replaced: on a fork pinned to one block, <span class="mono-in">anvil_setCode</span> writes an inert
    stub over the hook's bytecode. Quote the same swap twice. The gap <em>is</em> what the hook took.</p>

    <div class="swap-panels">
      <div class="panel">
        <div class="panel-hd"><span class="label">REAL BYTECODE · <span class="hex">${
          codeHook ? esc(short(codeHook, 8, 6)) : "NOT MEASURED"
        }</span></span>
        <span class="data-xs">${codeEntry ? `${grp(codeEntry.len_bytes)} BYTES` : "NOT MEASURED"}</span></div>
        <pre class="codeblock hex" aria-label="first bytes of the deployed hook">${
          realHead || '<span class="ink-3">NOT MEASURED — no hook bytecode cached for this block</span>'
        }</pre>
        <div class="panel-ft data-xs hex">${codeEntry ? `keccak256 ${esc(codeEntry.keccak256)}` : NM}<br>
        first ${f.bytecode._head_bytes} bytes shown — the rest is on chain, not in this repo${
          codeIsHero ? "" : "<br>this is not the hook quoted in 00: its code was not cached at this block"
        }</div>
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

  /* -------------------------------------------------------------- section 5 */
  const pts = f.gate_a3.points;
  const s5 = `
<section id="curve" class="band" data-reveal>
  <div class="wrap">
    ${sindex("05", "The same swap,<br>five sizes", `GATE A3 · ±${f.gate_a3.tol_bps} BPS`)}
    <div class="s5-in">
      <figure class="chartbox panel" id="chart" data-points='${esc(JSON.stringify(pts))}'>
        <div class="panel-hd">
          <span class="label">EXTRACTION vs SWAP SIZE · <span class="hex">${esc(short(f.gate_a3.hook, 8, 6))}</span></span>
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

      <div class="s5-side">
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

  /* -------------------------------------------------------------- section 6 */
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

  const s6 = `
<section id="matrix" class="band" data-reveal>
  <div class="wrap">
    ${sindex("06", "The matrix", `${grp(f.census.pools)} LIQUID POOLS · ${f.census.hooks} DISTINCT HOOKS`)}
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
    <div class="s6-ft">
      <p class="data-xs">Same cells as the instrument: value, uncertainty, provenance. No simplified
      landing variant exists. Uncertainty is ±0.00 because both quotes are integer outputs of the same
      pinned block — the measurement has no sampling error, only the limits listed in 07.
      The census above is counted from <code>${esc(f.census.file)}</code>: the heading used to read
      199 pools and 12 hooks, from a sample, while this page's own per-hook table showed 112.</p>
      <p class="data-xs">It opens on one question — <strong>paste a token address, read what comes
      back out of 100</strong> — then fifteen panels: every door of a pair priced, the API settled on
      Hedera and read back on the mirror node, the agent identity on that same topic, the attestations
      written on-chain, an independent count from The Graph, and an executed swap matching the quote
      to the wei. Two panels need a local engine and say so.</p>
      <a class="cta" href="${INSTRUMENT}">OPEN THE FULL INSTRUMENT <span aria-hidden="true">↳</span></a>
    </div>
  </div>
</section>`;

  /* -------------------------------------------------------------- section 7 */
  const s7 = `
<section id="limits" class="band limits" data-reveal>
  <div class="wrap">
    ${sindex("07", "What I do not know", "PUBLISHED, NOT HIDDEN")}
    <div class="s7-in">
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
      <aside class="s7-side">
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

  return {
    header: tighten(header),
    body: tighten([s0, s1, s2, s3, s4, s5, s6, s7].join("\n")),
    foot: tighten(foot),
  };
}
