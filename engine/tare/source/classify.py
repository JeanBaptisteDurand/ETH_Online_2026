"""Turn fetched source + on-chain declared rates + TARE measurements into one record per hook.

The invariant this module exists to enforce, and that tests/test_source.py checks:

    A hook whose source we do not hold gets `read=False`, `classification=None`, and NOT ONE of the
    classification fields — no `taken_where`, no `announced`, no `modifiable`, no rate, no
    concordance. Its only verdict is the string "comportement non lu".

"We do not hold it" covers both a provider that said NOT_FOUND and a provider we could not reach
(FETCH_FAILED / UNAVAILABLE): the second is not evidence of anything, so it must not licence a
classification either.

Concordance is arithmetic. `predicted_bps` comes from profiles.py fed by declared.py; `measured_bps`
comes from the corpus; the label is a comparison against TOL_BPS at the reference size.
"""
import json
import os

from . import profiles as prof_mod
from . import scan as scan_mod

# The reference row for a pool is its SMALLEST measured size: the curve's price impact is smallest
# there, so it is the cleanest place to hold a rate against a quote. Bigger sizes bend away from the
# rate for a reason the corpus already documents (LIMITS.md §6) and that is not a disagreement.
TOL_BPS = 0.5

UNREAD = "comportement non lu"

CONCORDANT = "CONCORDANT"
DIVERGENT = "DIVERGENT"
UNVERIFIED = "UNVERIFIED"
NOT_MEASURABLE = "NOT_MEASURABLE"
NO_CODE_RATE = "NO_CODE_RATE"
PARTIAL = "PARTIAL"


def load_measurements(path: str) -> dict:
    """hook -> list of rows, in file order."""
    by_hook = {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            by_hook.setdefault(row["hook"].lower(), []).append(row)
    return by_hook


def reference_rows(rows: list) -> list:
    """One row per pool: the smallest MEASURED size. Pools with no MEASURED row are skipped."""
    best = {}
    for row in rows:
        if row.get("label") != "MEASURED":
            continue
        key = row["pool_id"]
        if key not in best or int(row["amount_in"]) < int(best[key]["amount_in"]):
            best[key] = row
    return [best[k] for k in sorted(best)]


def read_provenance(hook_dir: str):
    path = os.path.join(hook_dir, "provenance.json")
    if not os.path.exists(path):
        return None
    with open(path) as fh:
        return json.load(fh)


def source_is_held(prov) -> bool:
    """Only an actual FOUND counts. NOT_FOUND, FETCH_FAILED and UNAVAILABLE all mean: unread."""
    return bool(prov) and prov.get("source_status") == "FOUND" and prov.get("file_count", 0) > 0


def resolve_citations(hook_dir: str, citations: list) -> list:
    """Turn each {file, anchor} into {file, line, text} by searching the fetched file.

    A citation that no longer matches becomes `line: None, status: "UNRESOLVED"` and callers must
    drop the claim: a report may not quote a line number it did not find.
    """
    out = []
    cache = {}
    for cit in citations or []:
        rel = cit["file"]
        if rel not in cache:
            path = os.path.join(hook_dir, "sources", rel)
            cache[rel] = open(path, errors="replace").read().splitlines() if os.path.exists(path) else None
        lines = cache[rel]
        rec = {"claim": cit["claim"], "file": rel, "anchor": cit["anchor"]}
        if lines is None:
            rec.update(line=None, status="FILE_MISSING")
            out.append(rec)
            continue
        hit = next((i for i, ln in enumerate(lines) if cit["anchor"] in ln), None)
        if hit is None:
            rec.update(line=None, status="UNRESOLVED")
        else:
            rec.update(line=hit + 1, text=lines[hit].strip()[:220], status="OK")
            if "asserts_value" in cit:
                # A citation may assert the literal it points at; if the file no longer contains it,
                # the model's constant is stale and must not be used.
                rec["asserts_value"] = cit["asserts_value"]
                rec["value_present"] = str(cit["asserts_value"]).replace(",", "") in \
                    lines[hit].replace("_", "").replace(",", "")
        out.append(rec)
    return out


def concordance_for_pool(prediction: dict, row: dict, tol: float = TOL_BPS) -> dict:
    """Compare one prediction to one measured row. Pure arithmetic, no interpretation."""
    measured = float(row["bps"])
    rec = {"pool_id": row["pool_id"], "amount_in": row["amount_in"],
           "zero_for_one": row["zero_for_one"], "stored_lp_fee": row["stored_lp_fee"],
           "measured_bps": measured}
    if prediction is None:
        rec.update(predicted_bps=None, verdict=UNVERIFIED, reason="no prediction was produced")
        return rec
    rec["note"] = prediction.get("note")
    rec["detail"] = prediction.get("detail")
    if prediction.get("predicted_bps") is not None:
        pred = float(prediction["predicted_bps"])
        rec.update(predicted_bps=pred, delta_bps=round(measured - pred, 4),
                   verdict=CONCORDANT if abs(measured - pred) <= tol else DIVERGENT)
        return rec
    span = prediction.get("predicted_bps_range")
    if span:
        lo, hi = float(span[0]), float(span[1])
        rec.update(predicted_bps=None, predicted_bps_range=[lo, hi],
                   delta_bps=round(min(abs(measured - lo), abs(measured - hi)), 4),
                   verdict=CONCORDANT if (lo - tol) <= measured <= (hi + tol) else DIVERGENT)
        return rec
    rec.update(predicted_bps=None, verdict=UNVERIFIED, reason=prediction.get("note"))
    return rec


def summarise(pool_records: list) -> dict:
    verdicts = [r["verdict"] for r in pool_records]
    n = len(verdicts)
    n_conc = verdicts.count(CONCORDANT)
    n_div = verdicts.count(DIVERGENT)
    n_unv = verdicts.count(UNVERIFIED)
    if n == 0:
        label = NOT_MEASURABLE
    elif n_conc == n:
        label = CONCORDANT
    elif n_conc == 0 and n_div == 0:
        label = UNVERIFIED
    elif n_conc == 0:
        label = DIVERGENT
    else:
        label = PARTIAL
    deltas = [abs(r["delta_bps"]) for r in pool_records if r.get("delta_bps") is not None]
    return {"label": label, "pools": n, "concordant": n_conc, "divergent": n_div,
            "unverified": n_unv,
            "max_abs_delta_bps": round(max(deltas), 4) if deltas else None,
            "tolerance_bps": TOL_BPS}


def classify_hook(address: str, rows: list, sources_root: str, chain=None,
                  registry_name: str = None) -> dict:
    """One hook -> one record. `chain` may be None: then the code is read but no rate is declared."""
    address = address.lower()
    hook_dir = os.path.join(sources_root, address)
    prov = read_provenance(hook_dir)
    measured = [r for r in rows if r.get("label") == "MEASURED"]
    base = {
        "hook": address,
        "registry_name": registry_name,
        "rows": len(rows),
        "pools": len({r["pool_id"] for r in rows}),
        "measured_rows": len(measured),
        "measured_bps_median": _median([float(r["bps"]) for r in measured]),
        "source_status": (prov or {}).get("source_status", "NOT_FETCHED"),
        "source_provider": (prov or {}).get("provider"),
        "source_match": (prov or {}).get("match"),
        "source_verified_at": (prov or {}).get("verified_at"),
        "source_attempts": (prov or {}).get("attempts", []),
    }

    if not source_is_held(prov):
        # THE INVARIANT. Nothing about behaviour, intent, rate, or venue may appear below this line.
        base.update({
            "read": False,
            "classification": None,
            "verdict": UNREAD,
            "why": _unread_reason(prov),
        })
        return base

    findings = scan_mod.scan_hook(hook_dir)
    profile = prof_mod.profile_for(address)
    base.update({
        "read": True,
        "own_source_files": len(findings["files"]),
        "own_source_lines": sum(f["lines"] for f in findings["files"]),
        "swap_path_take_sites": len(scan_mod.swap_path_takes(findings)),
        "take_kinds": findings["take_kinds"],
        "announced_symbols": [
            {"kind": a["kind"], "name": a.get("name"), "file": a["file"], "line": a["line"]}
            for a in findings["announced"]
        ][:40],
        "authority_kinds": findings["authority_kinds"],
    })

    if profile is None:
        base.update({
            "classification": "READ_UNPROFILED",
            "verdict": "source lu, aucun modele de taux ecrit pour ce hook",
            "concordance": {"label": NO_CODE_RATE, "pools": 0, "concordant": 0,
                            "divergent": 0, "unverified": 0, "max_abs_delta_bps": None,
                            "tolerance_bps": TOL_BPS},
            "pool_checks": [],
        })
        return base

    base.update({
        "classification": profile["key"],
        "contract": profile["contract"],
        "taken_where": profile["taken_where"],
        "announced": profile["announced"],
        "modifiable": profile["modifiable"],
        "rate_unit": profile["rate_unit"],
        "citations": resolve_citations(hook_dir, profile.get("citations")),
    })

    refs = reference_rows(rows)
    checks = []
    delegate_dir = None
    if profile.get("predict") is None or not refs:
        base["concordance"] = {"label": NOT_MEASURABLE, "pools": 0, "concordant": 0,
                               "divergent": 0, "unverified": 0, "max_abs_delta_bps": None,
                               "tolerance_bps": TOL_BPS}
        base["pool_checks"] = []
        base["verdict"] = ("source lu ; aucune ligne MEASURED pour ce hook "
                           "(voir LIMITS.md §4)") if not refs else "source lu"
        return base

    for row in refs:
        if chain is None:
            checks.append({"pool_id": row["pool_id"], "measured_bps": float(row["bps"]),
                           "predicted_bps": None, "verdict": UNVERIFIED,
                           "reason": "no RPC was supplied, so no declared rate was read"})
            continue
        declared = _read_declared(chain, profile, address, row)
        if not declared["ok"]:
            checks.append({"pool_id": row["pool_id"], "measured_bps": float(row["bps"]),
                           "predicted_bps": None, "verdict": UNVERIFIED,
                           "reason": declared["reason"]})
            continue
        prediction = profile["predict"](declared["values"], row)
        rec = concordance_for_pool(prediction, row)
        rec["declared_calls"] = declared["calls"]
        checks.append(rec)
        if declared["values"].get("delegate"):
            delegate_dir = declared["values"]["delegate"].lower()

    base["pool_checks"] = checks
    base["concordance"] = summarise(checks)
    if delegate_dir:
        base["delegate"] = delegate_dir
        dpath = os.path.join(sources_root, delegate_dir)
        dprov = read_provenance(dpath)
        base["delegate_source_status"] = (dprov or {}).get("source_status", "NOT_FETCHED")
        if source_is_held(dprov):
            base["delegate_citations"] = resolve_citations(dpath, profile.get("delegate_citations"))
    return base


def _read_declared(chain, profile, address, row):
    from . import declared as declared_mod
    try:
        return declared_mod.read_declared(chain, profile, address, row)
    except Exception as exc:                                       # noqa: BLE001
        return {"ok": False, "values": {}, "calls": [],
                "reason": f"{type(exc).__name__}: {exc}"}


def _unread_reason(prov) -> str:
    if not prov:
        return "no fetch was attempted for this address"
    status = prov.get("source_status", "")
    if status.startswith("FETCH_FAILED"):
        return (f"every provider attempt failed to answer ({status}); this says nothing about "
                "whether the contract is verified")
    if status == "UNAVAILABLE":
        return "no provider could be queried (missing API key); this is not evidence of anything"
    attempts = prov.get("attempts") or []
    detail = "; ".join(f"{a.get('provider')}={a.get('outcome')}" for a in attempts) or status
    return f"no provider holds a verified source for this address ({detail})"


def _median(values):
    if not values:
        return None
    ordered = sorted(values)
    n = len(ordered)
    mid = n // 2
    return round(ordered[mid] if n % 2 else (ordered[mid - 1] + ordered[mid]) / 2, 4)
