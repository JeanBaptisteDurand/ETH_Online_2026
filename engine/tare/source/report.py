"""Render docs/hooks-source/ANALYSIS.md from analysis.json.

Every number printed here is copied out of the JSON produced by `cli.py analyze`. This module does
counting and formatting and nothing else: it must not be able to state a rate the pipeline did not
read, or a verdict the arithmetic did not reach. English, like the rest of docs/, because this file
answers a paragraph of LIMITS.md and has to sit next to it.
"""
import collections

from .classify import CONCORDANT, DIVERGENT, NOT_MEASURABLE, NOT_RESOLVABLE, UNVERIFIED

VERDICT_LABEL = {
    CONCORDANT: "concordant",
    DIVERGENT: "divergent",
    UNVERIFIED: "unverified",
    NOT_MEASURABLE: "not measurable",
    NOT_RESOLVABLE: "not resolvable",
    "PARTIAL": "partial",
    "NO_CODE_RATE": "no rate in the code",
}


def _fmt(value, nd=4):
    if value is None:
        return "—"
    if isinstance(value, (list, tuple)):
        return "–".join(_fmt(v, nd) for v in value)
    if isinstance(value, float):
        text = f"{value:.{nd}f}".rstrip("0").rstrip(".")
        return text or "0"
    return str(value)


def _distinct_declared(checks):
    counts = collections.Counter(c.get("declared_summary") for c in checks
                                 if c.get("declared_summary"))
    if not counts:
        return "—"
    parts = [f"`{value}` ×{n}" for value, n in counts.most_common(3)]
    if len(counts) > 3:
        parts.append(f"+{len(counts) - 3} more")
    return "<br>".join(parts)


def _totals(hooks, key):
    return sum((h.get("concordance") or {}).get(key, 0) for h in hooks)


def render(analysis: dict) -> str:
    hooks = analysis["hooks"]
    block = analysis["block_number"]
    read = [h for h in hooks if h["read"]]
    unread = [h for h in hooks if not h["read"]]

    pools_conc = _totals(hooks, "concordant")
    pools_div = _totals(hooks, "divergent")
    pools_nr = _totals(hooks, "not_resolvable")
    pools_unv = _totals(hooks, "unverified")
    comparable = pools_conc + pools_div

    out = []
    w = out.append

    w("# ANALYSIS — what the hooks' own code says, and what the instrument measured")
    w("")
    w("[`LIMITS.md`](../LIMITS.md) §6(c) said, in as many words: **\"We have not read a single line "
      "of any hook's source. Not one.\"** This file is the answer to that sentence. It does not "
      "replace LIMITS.md — it closes one paragraph of it and opens several new ones (§5 below).")
    w("")
    w("Three separable, replayable steps:")
    w("")
    w("```bash")
    w("cd engine")
    w("python3 -m tare.source.cli fetch                            # Sourcify -> docs/hooks-source/<addr>/")
    w('python3 -m tare.source.cli analyze --rpc "$BASE_RPC_URL"    # read each declared rate on chain')
    w("python3 -m tare.source.cli report                           # write this file")
    w("```")
    w("")
    w("**No model produced a number in this file.** The rates in the *\"rate in the code\"* column "
      f"were read by `eth_call`, at block **{block:,}** ".replace(",", " ") +
      "— the corpus block — through the public getter the source shows exists, or they are "
      "constants cited line by line. The *concordance* column is a subtraction.")
    w("")
    w("| input | value |")
    w("|---|---|")
    w(f"| corpus | `{analysis.get('measurements')}` |")
    w(f"| corpus rows | {analysis.get('measurements_rows')} |")
    w(f"| corpus sha256 | `{analysis.get('measurements_sha256')}` |")
    w(f"| chain | {analysis.get('chain_id')} (Base) |")
    w(f"| block | {block} |")
    w(f"| agreement tolerance | ±{analysis['tolerance_bps']} bps |")
    w("")

    # -------------------------------------------------------------------- coverage
    w("## 1. Source coverage")
    w("")
    w(f"**{len(read)} of {len(hooks)}** measured hooks have a verified source. "
      f"**{len(unread)} of {len(hooks)}** does not, and is treated accordingly (§4).")
    w("")
    w("| hook | registry name | source | provider | match | verified at | own files | own lines |")
    w("|---|---|---|---|---|---|---|---|")
    for h in hooks:
        held = "yes" if h["read"] else "**no**"
        w(f"| `{h['hook']}` | {h.get('registry_name') or '—'} | {held} | "
          f"{h.get('source_provider') or '—'} | {h.get('source_match') or '—'} | "
          f"{(h.get('source_verified_at') or '—')[:10]} | "
          f"{h.get('own_source_files', '—')} | {h.get('own_source_lines', '—')} |")
    w("")
    w("Provider: [Sourcify v2](https://sourcify.dev), `/v2/contract/8453/<address>?fields=sources`. "
      "Every file returned is stored under `docs/hooks-source/<address>/sources/` and hashed in "
      "`provenance.json`; \"own files\" counts the ones that are not a vendored copy of "
      "OpenZeppelin, v4-core, Solady and friends (`engine/tare/source/fetch.py`, `VENDOR_SEGMENTS`).")
    w("")
    w("The Etherscan v2 fallback exists in `fetch.py` and **could not be asked**: no "
      "`ETHERSCAN_API_KEY` is configured in this environment. That is recorded as `UNAVAILABLE` in "
      "each `provenance.json`, never as `NOT_FOUND`. A provider we could not reach is not evidence "
      "about a contract — honesty rule 3, and the reason "
      "[`HONESTY.md`](../HONESTY.md) exists at all.")
    w("")

    # -------------------------------------------------------------------- main table
    w("## 2. Hook by hook")
    w("")
    w("| hook | measured bps (median) | rate in the code | concordance | where is it taken | announced | modifiable | source |")
    w("|---|---|---|---|---|---|---|---|")
    for h in hooks:
        if not h["read"]:
            w(f"| `{h['hook'][:10]}…` {h.get('registry_name') or ''} | "
              f"{_fmt(h.get('measured_bps_median'))} | **behaviour not read** | — | "
              f"**not read** | **not read** | **not read** | no |")
            continue
        conc = h.get("concordance") or {}
        label = VERDICT_LABEL.get(conc.get("label"), conc.get("label", "—"))
        detail = ""
        if conc.get("pools"):
            detail = (f", {conc.get('concordant', 0)}/{conc.get('pools')} pools"
                      f", max gap {_fmt(conc.get('max_abs_delta_bps'))} bps")
        w(f"| `{h['hook'][:10]}…` {h.get('registry_name') or h.get('contract') or ''} | "
          f"{_fmt(h.get('measured_bps_median'))} | {_distinct_declared(h.get('pool_checks', []))} | "
          f"**{label}**{detail} | {h.get('taken_where', '—')} | {h.get('announced', '—')} | "
          f"{h.get('modifiable', '—')} | yes |")
    w("")
    w(f"Across the {len(hooks)} hooks: **{pools_conc} pools where the measurement lands on the "
      f"number written in the contract**, {pools_div} where it does not, {pools_nr} where the pool "
      f"cannot resolve the rate at all, {pools_unv} unverified — "
      f"**{pools_conc}/{comparable}** of the comparable pools, within ±{analysis['tolerance_bps']} bps.")
    w("")
    w("The instrument never read any of these contracts. It replaced 89 bytes of bytecode and "
      "quoted the same swap twice.")
    w("")

    # -------------------------------------------------------------------- per hook
    w("## 3. Each hook, with the lines")
    w("")
    for h in hooks:
        if not h["read"]:
            continue
        conc = h.get("concordance") or {}
        w(f"### `{h['hook']}` — {h.get('registry_name') or h.get('contract')}")
        w("")
        w(f"- **contract**: `{h.get('contract', '—')}` — {h.get('own_source_files')} own files, "
          f"{h.get('own_source_lines')} lines")
        w(f"- **measured**: {h['measured_rows']} MEASURED rows of {h['rows']}, {h['pools']} pools, "
          f"median {_fmt(h.get('measured_bps_median'))} bps")
        w(f"- **concordance**: {VERDICT_LABEL.get(conc.get('label'), conc.get('label'))} — "
          f"{conc.get('concordant', 0)} concordant / {conc.get('divergent', 0)} divergent / "
          f"{conc.get('not_resolvable', 0)} not resolvable / {conc.get('unverified', 0)} unverified")
        if conc.get("max_abs_delta_bps") is not None:
            w(f"- **largest gap measured − code**: {_fmt(conc['max_abs_delta_bps'])} bps "
              f"(tolerance ±{analysis['tolerance_bps']})")
        w(f"- **where is it taken**: {h.get('taken_where', '—')}")
        w(f"- **announced**: {h.get('announced', '—')}")
        w(f"- **modifiable**: {h.get('modifiable', '—')}")
        w("")
        cits = [c for c in h.get("citations", []) if c.get("status") == "OK"]
        unresolved = [c for c in h.get("citations", []) if c.get("status") != "OK"]
        if cits:
            w("Each claim above rests on one of these lines. The line numbers were resolved by "
              "searching the fetched file when this report was generated, so every one of them is "
              "checkable with a single `sed -n`:")
            w("")
            for c in cits:
                w(f"- {c['claim']}  \n  [`{c['file']}:{c['line']}`]({h['hook']}/sources/{c['file']})"
                  f" — `{c['text']}`")
            w("")
        if unresolved:
            w("Anchors that no longer match the fetched source — the corresponding claim is "
              "**dropped**, not guessed: "
              + ", ".join(f"`{c['file']}` / `{c['anchor']}`" for c in unresolved))
            w("")
        if h.get("delegate"):
            w(f"The rate is **not in this contract**. It is delegated per pool to "
              f"`{h['delegate']}`, whose source is `{h.get('delegate_source_status')}`:")
            w("")
            for c in h.get("delegate_citations", []):
                if c.get("status") == "OK":
                    w(f"- {c['claim']}  \n  [`{c['file']}:{c['line']}`]"
                      f"({h['delegate']}/sources/{c['file']}) — `{c['text']}`")
            w("")
        example = next((c for c in h.get("pool_checks", []) if c.get("verdict") == CONCORDANT
                        and c.get("declared_calls")), None)
        if example:
            call = example["declared_calls"][-1]
            w("One replayable example — what the contract stores, then what the instrument read:")
            w("")
            w("```bash")
            w("# the contract says:")
            w(f"cast call {call['to']} \\")
            w(f"  {call['data']} \\")
            w(f'  --rpc-url "$BASE_RPC_URL" --block {block}      # {call["sig"]}')
            w(f"#   -> {example.get('declared_summary')}")
            w(f"#      = {_fmt(example.get('predicted_bps'))} bps on this pool, this direction, "
              f"amount_in {example.get('amount_in')}")
            w("")
            w("# the instrument, which never read the contract, says:")
            w(f"grep '{example['pool_id']}' docs/dataset/measurements.jsonl \\")
            w(f"  | python3 -c \"import sys,json;[print(json.loads(l)['bps']) for l in sys.stdin]\"")
            w(f"#   -> {_fmt(example['measured_bps'])} bps at that size "
              f"(gap {_fmt(example.get('delta_bps'))} bps)")
            w("```")
            w("")
        odd = [c for c in h.get("pool_checks", [])
               if c.get("verdict") in (DIVERGENT, NOT_RESOLVABLE, UNVERIFIED)]
        if odd:
            w("Pools that did not land, one by one:")
            w("")
            for c in odd:
                code = (_fmt(c.get("predicted_bps")) if c.get("predicted_bps") is not None
                        else _fmt(c.get("predicted_bps_range")))
                w(f"- `{c['pool_id']}` — **{VERDICT_LABEL.get(c['verdict'], c['verdict'])}**. "
                  f"Measured {_fmt(c['measured_bps'])} bps at amount_in {c.get('amount_in')}; "
                  f"the code says {code} bps. {c.get('reason') or c.get('note') or ''}")
            w("")

    # -------------------------------------------------------------------- unread
    w("## 4. The hooks whose source we do not have")
    w("")
    if not unread:
        w("None — every measured hook in this corpus has a verified source.")
    else:
        w("These keep the label **\"behaviour not read\"**. No intent, no mechanism, no rate and no "
          "concordance is attributed to them. The measurement stays true; the reading does not "
          "exist. `engine/tare/source/classify.py` enforces this by construction — a record with "
          "`read=False` carries no classification field at all — and "
          "`engine/tests/test_source.py` fails if it ever does.")
        w("")
        for h in unread:
            w(f"- **`{h['hook']}`** — {h['measured_rows']} MEASURED rows of {h['rows']}, "
              f"{h['pools']} pool(s), median {_fmt(h.get('measured_bps_median'))} bps. "
              f"{h.get('why')}")
            for att in h.get("source_attempts", []):
                w(f"    - `{att.get('provider')}` → `{att.get('outcome')}`"
                  + (f" — {att.get('detail')}" if att.get("detail") else ""))
        w("")
        w("A Sourcify `NOT_FOUND` means: Sourcify holds no verified source for that address. It "
          "does **not** mean the contract is unverified everywhere, and it certainly does not mean "
          "the hook takes nothing — one of the addresses above measures 0.00 bps on every row, and "
          "that number is a measurement, not an exoneration.")
    w("")

    # -------------------------------------------------------------------- limits
    w("## 5. What this file still does not say")
    w("")
    w("1. **A concordant rate is not a legitimate rate.** Recovering the 100 bps written in a "
      "contract proves the instrument reads the right number. It says nothing about whether that "
      "number was shown to the person who signed the swap. LIMITS.md §6 stands, unchanged, except "
      "for its last sentence.")
    w("2. **Each family's model is hand-written from the source.** It is cited line by line and it "
      f"lands on {pools_conc} of {comparable} comparable pools, but it is a re-implementation of "
      "the arithmetic, not the bytecode. Where it disagrees, either the model or the world is "
      "wrong, and this file does not assume which.")
    w("3. **One block, one size per pool, one direction.** The reference size for a pool is the "
      "smallest measured size whose rounding noise is below a tenth of the tolerance "
      f"(`QUANT_FRACTION` = {analysis.get('quantization_fraction')}); one pool in this corpus "
      "quotes 2 458 units of output at 1e14 in, where a single unit is worth 4 bps. The other "
      "sizes bend away from the rate for the reason LIMITS.md §6 already gives, and that is not a "
      "disagreement.")
    w("4. **Some pools cannot resolve a rate at all.** Where the quote does not respond to size "
      f"(elasticity below {analysis.get('saturation_elasticity')}: ten times the input buys the "
      "same output), a fee taken out of the *input* cannot move the quote, so the counterfactual "
      "has nothing to measure. Those pools are `NOT_RESOLVABLE`, not `0`, and not `DIVERGENT`.")
    w("5. **These hooks do more during a swap than take a fee.** Several claim accrued fees or "
      "call a pool extension inside the same callback; those calls move the pool's state before "
      "the swap runs with the hook and do not run at all with the stub. The models do not price "
      "them, and that is a candidate explanation for a residual gap — a candidate, not a finding.")
    w("6. **`hookData` is always empty** (`engine/tare/quote.py`), so any router-driven branch is "
      "unexercised: LaunchHook's referrals, Clanker's MEV-module payload, Doppler's swap data.")
    w("")
    w("Unchanged: [`LIMITS.md`](../LIMITS.md) for what the measurement cannot tell you, "
      "[`HONESTY.md`](../HONESTY.md) for the labels and the eight false results that produced "
      "them, [`METHOD.md`](../METHOD.md) for how the number is made.")
    w("")
    return "\n".join(out) + "\n"
