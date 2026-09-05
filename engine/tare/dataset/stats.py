"""Le tableau « What we found » du README, recalcule depuis le jeu publie.

    PYTHONPATH=engine python3 -m tare.dataset.stats --lp-fee-zero --above-bps 1

Pourquoi ce module existe. Le README a porte pendant plusieurs jours un tableau
qui decrivait `docs/measurements-v1.json` (128 lignes, 32 pools, deux hooks)
alors que le depot publiait `docs/dataset/measurements.jsonl` (995 lignes, 199
pools, douze hooks). Aucun des deux chiffres n'etait invente — le premier avait
simplement cesse d'etre le jeu. Un chiffre recopie a la main ne vieillit pas, il
se trompe silencieusement, et c'est precisement le reproche que ce projet fait
au registre.

Ce que ce module garantit :

  * il ne lit QUE des lignes deja ecrites, il ne cote rien et ne touche a aucun
    noeud. Il ne peut donc pas produire une valeur qui n'a pas ete mesuree ;
  * il ne compte comme extraction que les lignes `MEASURED`. Une `NOT_QUOTABLE`
    ou une `NOT_MEASURABLE` n'a pas de `bps` et n'en recevra pas ici ;
  * un `bps` absent est ignore, jamais lu comme zero. C'est la regle 3 : une
    valeur manquante n'est pas une valeur nulle ;
  * la mediane vient de `statistics.median` sur les valeurs retenues, sans
    arrondi intermediaire. L'arrondi n'a lieu qu'a l'impression.

Le seuil `--above-bps` est un plancher d'arrondi, pas un jugement : sous 1 bps,
la difference entre deux cotations tient dans le bruit de la derniere unite du
montant de sortie, et on ne publie pas un bruit comme un prelevement.
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional

REPO = Path(__file__).resolve().parents[3]
DEFAULT_DATASET = REPO / "docs" / "dataset" / "measurements.jsonl"
DEFAULT_REGISTRY = REPO / "docs" / "hooklist.json"

MEASURED = "MEASURED"


def read_rows(path: Path = DEFAULT_DATASET) -> List[dict]:
    """Une ligne JSON par mesure. Une ligne illisible leve : on ne l'escamote pas."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"{path} absent")
    rows = []
    for n, line in enumerate(path.read_text().splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{n} illisible — un jeu tronque n'est pas un jeu") from exc
    return rows


def read_registry(path: Path = DEFAULT_REGISTRY) -> Dict[str, dict]:
    """address -> premiere fiche. Absent est un resultat, pas une erreur."""
    path = Path(path)
    if not path.exists():
        return {}
    raw = json.loads(path.read_text())
    entries = raw if isinstance(raw, list) else raw.get("hooks", [])
    by_addr: Dict[str, dict] = {}
    for e in entries:
        addr = ((e.get("hook") or {}).get("address") or "").lower()
        if addr and addr not in by_addr:
            by_addr[addr] = e
    return by_addr


def _describe(entry: Optional[dict]) -> str:
    if entry is None:
        return "not in the registry at all"
    props = entry.get("properties") or {}
    hook = entry.get("hook") or {}
    bits = [f"vanillaSwap={str(props.get('vanillaSwap')).lower()}",
            f"swapAccess={props.get('swapAccess')}"]
    bits.append("audit link" if hook.get("auditUrl") else "no audit link")
    return ", ".join(bits)


def _name(entry: Optional[dict]) -> str:
    return ((entry or {}).get("hook") or {}).get("name") or "—"


def lp_fee_zero_table(rows: List[dict], above_bps: float = 1.0,
                      lp_fee_zero: bool = True,
                      registry: Optional[Dict[str, dict]] = None) -> dict:
    """Les hooks qui prelevent, tries du pire au moins pire.

    `lp_fee_zero` restreint aux pools dont le `stored_lp_fee` lu on-chain vaut 0 :
    sur ceux-la, ce que le hook prend ne peut pas etre confondu avec le frais LP
    du pool, parce qu'il n'y en a pas.
    """
    registry = read_registry() if registry is None else registry

    kept = []
    for r in rows:
        if r.get("label") != MEASURED:
            continue
        bps = r.get("bps")
        if bps is None:                      # regle 3 : absent n'est pas zero
            continue
        if lp_fee_zero and r.get("stored_lp_fee") != 0:
            continue
        if bps <= above_bps:
            continue
        kept.append(r)

    by_hook: Dict[str, List[dict]] = defaultdict(list)
    for r in kept:
        by_hook[r["hook"]].append(r)

    hooks = []
    for addr, hrows in by_hook.items():
        vals = sorted(x["bps"] for x in hrows)
        entry = registry.get(addr.lower())
        hooks.append({
            "hook": addr,
            "name": _name(entry),
            "in_registry": entry is not None,
            "registry_says": _describe(entry),
            "n": len(hrows),
            "pools": len({x["pool_id"] for x in hrows}),
            "min_bps": vals[0],
            "median_bps": statistics.median(vals),
            "max_bps": vals[-1],
        })
    hooks.sort(key=lambda h: -h["max_bps"])

    all_vals = sorted(r["bps"] for r in kept)
    labels: Dict[str, int] = defaultdict(int)
    for r in rows:
        labels[r.get("label") or "?"] += 1
    blocks = sorted({r.get("block_number") for r in rows if r.get("block_number")})

    return {
        "dataset": str(DEFAULT_DATASET),
        "rows": len(rows),
        "pools": len({r.get("pool_id") for r in rows}),
        "hooks": len({r.get("hook") for r in rows}),
        "blocks": blocks,
        "labels": dict(labels),
        "filter": {"label": MEASURED, "stored_lp_fee": 0 if lp_fee_zero else "any",
                   "above_bps": above_bps},
        "n": len(kept),
        "n_pools": len({r["pool_id"] for r in kept}),
        "n_hooks": len(by_hook),
        "min_bps": all_vals[0] if all_vals else None,
        "median_bps": statistics.median(all_vals) if all_vals else None,
        "max_bps": all_vals[-1] if all_vals else None,
        "by_hook": hooks,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="tare.dataset.stats", description=__doc__.split("\n")[0])
    ap.add_argument("--in", dest="path", default=str(DEFAULT_DATASET))
    ap.add_argument("--lp-fee-zero", action="store_true",
                    help="ne garder que les pools dont le stored_lp_fee lu on-chain vaut 0")
    ap.add_argument("--above-bps", type=float, default=1.0,
                    help="plancher d'arrondi, en bps (defaut 1.0)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)

    rows = read_rows(Path(a.path))
    t = lp_fee_zero_table(rows, above_bps=a.above_bps, lp_fee_zero=a.lp_fee_zero)

    if a.json:
        print(json.dumps(t, indent=1))
        return 0

    blocks = ", ".join(str(b) for b in t["blocks"]) or "aucun"
    lab = " · ".join(f"{v} {k}" for k, v in sorted(t["labels"].items(), key=lambda kv: -kv[1]))
    print(f"{t['dataset']}")
    print(f"{t['rows']} mesures publiees, {t['pools']} pools, {t['hooks']} hooks, bloc {blocks}")
    print(f"  {lab}\n")
    scope = "stored_lp_fee == 0" if a.lp_fee_zero else "tous les pools"
    print(f"filtre : label={MEASURED}, {scope}, bps > {a.above_bps}")
    if t["n"] == 0:
        print("  aucune ligne ne passe le filtre — rien a montrer, et surtout aucun zero")
        return 0
    print(f"  {t['n']} mesures, {t['n_pools']} pools, {t['n_hooks']} hooks")
    print(f"  min {t['min_bps']:.2f} · mediane {t['median_bps']:.2f} · max {t['max_bps']:.2f} bps\n")
    print(f"  {'hook':44} {'n':>4} {'pools':>6} {'min':>9} {'med':>9} {'max':>9}  registre")
    for h in t["by_hook"]:
        print(f"  {h['hook']:44} {h['n']:4d} {h['pools']:6d} "
              f"{h['min_bps']:9.2f} {h['median_bps']:9.2f} {h['max_bps']:9.2f}  "
              f"{h['name']} — {h['registry_says']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
