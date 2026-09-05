"""Croise l'allowlist de routage d'Uniswap avec ce que TARE a mesure.

    python3 docs/feedback-evidence/routing_allowlist.py

Trois sources, toutes epinglees a un commit :

  * `Uniswap/routing-api`, `lib/util/hooksAddressesAllowlist.ts` — la liste des hooks que
    l'algorithme de routage d'Uniswap accepte de traverser.
  * `Uniswap/hooklist`, `hooklist.json` + `schema.json` — le registre public et son schema.
  * `docs/dataset/measurements.jsonl` — 995 mesures TARE au bloc 50 614 000 sur Base.

Ce que le script etablit, et rien de plus : pour chaque hook que TARE a touche, s'il figure dans
l'allowlist de routage Base, s'il figure au registre, et ce que la contrefactuelle a lu sur lui.
Aucune valeur n'est inventee : un hook sans ligne MEASURED sort avec `bps_median: null`, jamais 0.

Reseau requis (trois GET bruts sur raw.githubusercontent.com). En cas d'echec, le script s'arrete
sans ecrire : un fichier de preuve partiel est pire que pas de fichier.
"""
import json
import re
import statistics
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = Path(__file__).with_name("routing-allowlist.json")

ROUTING_API_SHA = "f5a81893b812b6745b1f8b7fa3a55a714cb9d89b"
HOOKLIST_SHA = "862303733d34aa36fad0d8c5275163c387be80d6"
ALLOWLIST_PATH = "lib/util/hooksAddressesAllowlist.ts"

RAW = "https://raw.githubusercontent.com"
SOURCES = {
    "allowlist": f"{RAW}/Uniswap/routing-api/{ROUTING_API_SHA}/{ALLOWLIST_PATH}",
    "hooklist": f"{RAW}/Uniswap/hooklist/{HOOKLIST_SHA}/hooklist.json",
    "schema": f"{RAW}/Uniswap/hooklist/{HOOKLIST_SHA}/schema.json",
}
CHAIN_ID = 8453


def fetch(url: str) -> str:
    proc = subprocess.run(["curl", "-sSfL", "-m", "60", url],
                          capture_output=True, text=True, timeout=90)
    if proc.returncode != 0 or not proc.stdout:
        raise SystemExit(f"echec du telechargement de {url}: {proc.stderr.strip()[:200]}")
    return proc.stdout


def parse_allowlist(ts: str, chain: str = "BASE"):
    """Resout `[ChainId.BASE]: [...]` en adresses minuscules via les constantes du fichier."""
    consts = {m.group(1): m.group(2).lower()
              for m in re.finditer(r"export const (\w+) = '(0x[0-9a-fA-F]{40})'", ts)}
    block = re.search(rf"\[ChainId\.{chain}\]: \[(.*?)\]", ts, re.S)
    if not block:
        raise SystemExit(f"bloc ChainId.{chain} introuvable dans {ALLOWLIST_PATH}")
    names = [n.strip() for n in block.group(1).split(",") if n.strip()]
    addresses, unresolved = set(), []
    for name in names:
        if name == "ADDRESS_ZERO":
            addresses.add("0x" + "0" * 40)
        elif name in consts:
            addresses.add(consts[name])
        else:
            unresolved.append(name)
    if unresolved:
        raise SystemExit(f"constantes non resolues, refus de conclure: {unresolved}")
    line = ts[:block.start()].count("\n") + 1
    return addresses, {
        "entries": len(names),
        "address_constants_in_file": len(consts),
        "file_lines": ts.count("\n"),
        "chain_block_line": line,
        "denylist_occurrences": len(re.findall(r"deny", ts, re.I)),
    }


def leaf_census(obj, prefix="", out=None):
    out = {} if out is None else out
    if isinstance(obj, dict):
        for k, v in obj.items():
            leaf_census(v, f"{prefix}.{k}" if prefix else k, out)
    else:
        out.setdefault(prefix, set()).add(type(obj).__name__)
    return out


def main() -> int:
    allow_ts = fetch(SOURCES["allowlist"])
    hooklist = json.loads(fetch(SOURCES["hooklist"]))
    schema = json.loads(fetch(SOURCES["schema"]))

    allow_base, allow_stats = parse_allowlist(allow_ts)

    census = {}
    for entry in hooklist:
        leaf_census(entry, out=census)
    numeric = sorted(p for p, t in census.items() if t & {"int", "float"})
    boolean = sorted(p for p, t in census.items() if "bool" in t)

    registry_base = {e["hook"]["address"].lower()
                     for e in hooklist if e["hook"].get("chainId") == CHAIN_ID}
    registry_by_addr = {e["hook"]["address"].lower(): e
                        for e in hooklist if e["hook"].get("chainId") == CHAIN_ID}

    rows = [json.loads(l) for l in
            (REPO / "docs" / "dataset" / "measurements.jsonl").read_text().splitlines() if l.strip()]
    by_hook = defaultdict(list)
    for r in rows:
        by_hook[r["hook"]].append(r)

    hooks = []
    for hook in sorted(by_hook):
        rs = by_hook[hook]
        measured = [r for r in rs if r["label"] == "MEASURED" and r["bps"] is not None]
        finding = [r for r in measured if r["bps"] > 1 and r["stored_lp_fee"] == 0]
        bps = [r["bps"] for r in finding]
        reg = registry_by_addr.get(hook)
        hooks.append({
            "hook": hook,
            "rows": len(rs),
            "measured": len(measured),
            "rows_over_1bps_at_zero_stored_lp_fee": len(finding),
            "bps_median": round(statistics.median(bps), 2) if bps else None,
            "bps_max": round(max(bps), 2) if bps else None,
            "in_routing_allowlist_base": hook in allow_base,
            "in_registry_base": hook in registry_base,
            "registry_name": reg["hook"]["name"] if reg else None,
            "registry_auditUrl": reg["hook"]["auditUrl"] if reg else None,
            "registry_swapAccess": reg["properties"]["swapAccess"] if reg else None,
        })

    routed_and_extracting = [h for h in hooks
                             if h["in_routing_allowlist_base"]
                             and h["rows_over_1bps_at_zero_stored_lp_fee"] > 0]

    result = {
        "_what": "hooks mesures par TARE, croises avec l'allowlist de routage et le registre",
        "_replay": "python3 docs/feedback-evidence/routing_allowlist.py",
        "_sources": SOURCES,
        "measurements": {
            "file": "docs/dataset/measurements.jsonl",
            "rows": len(rows),
            "chain_id": CHAIN_ID,
            "block_number": rows[0]["block_number"] if rows else None,
        },
        "routing_allowlist_base": dict(allow_stats, resolved_addresses=len(allow_base)),
        "registry": {
            "entries": len(hooklist),
            "entries_chain_8453": len(registry_base),
            "verifiedSource_true": sum(1 for e in hooklist if e["hook"].get("verifiedSource")),
            "auditUrl_non_empty": sum(1 for e in hooklist if e["hook"].get("auditUrl")),
            "leaf_fields": len(census),
            "numeric_fields": numeric,
            "boolean_fields": len(boolean),
            "quantitative_fields": [f for f in numeric if not f.endswith("chainId")],
            "schema_additionalProperties_false": json.dumps(schema).count(
                '"additionalProperties": false'),
        },
        "hooks": hooks,
        "hooks_routed_and_extracting_over_1bps_at_zero_stored_lp_fee":
            [h["hook"] for h in routed_and_extracting],
    }
    OUT.write_text(json.dumps(result, indent=1) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "hooks"}, indent=1))
    print(f"\n{'hook':44s} {'>1bps@0':>8} {'median':>8} {'max':>9}  route  registre")
    for h in hooks:
        print(f"{h['hook']} {h['rows_over_1bps_at_zero_stored_lp_fee']:8d} "
              f"{str(h['bps_median']):>8} {str(h['bps_max']):>9}  "
              f"{'OUI' if h['in_routing_allowlist_base'] else 'non':5s}  "
              f"{'OUI' if h['in_registry_base'] else 'NON'}")
    print(f"\n-> {OUT.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
