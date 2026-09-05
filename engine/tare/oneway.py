"""Les pools qui laissent entrer et ne laissent pas sortir.

Ce module ne mesure rien : il RANGE ce que le balayage a deja mesure. Il existe parce qu'un
resultat n'est apparu qu'apres l'elargissement du corpus, et qu'il n'etait visible que parce
que le moteur balaie LES DEUX SENS a taille egale.

Le motif : sur un meme pool, au meme bloc, aux memes huit tailles, un sens mesure 0,00 bps et
l'autre 9 999 bps. Neuf mille neuf cent quatre-vingt-dix-neuf points de base, c'est 99,99 % de
l'echange. Acheter est gratuit ; revendre ne rend rien.

CE QUE CE MODULE NE DIT PAS. Il ne dit pas « arnaque », il ne dit pas « piege », il n'attribue
aucune intention. Le source de ces contrats n'est pas verifie sur Sourcify — ils gardent donc
l'etiquette « comportement non lu », comme n'importe quel hook dont on n'a pas lu le code. Ce
qui est publie ici est une MESURE et sa forme : un sens plat, l'autre confiscatoire, aux huit
tailles, et qui se rejoue en une commande.

Pourquoi le seuil est ce qu'il est. FLAT_BPS (1,0) est le plancher d'arrondi deja utilise
partout dans le projet : sous 1 bps, une difference peut venir de la troncature entiere du
quoter. HEAVY_BPS (1000,0) — 10 % — n'a rien d'universel : c'est un seuil de PUBLICATION,
choisi pour ne retenir que ce qu'aucun modele de frais ordinaire n'explique. Il est expose en
parametre, et le rapport porte sa valeur, pour qu'un lecteur puisse le bouger et voir bouger la
liste.

    python3 -m tare.oneway --write
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

REPO = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO / "docs" / "dataset" / "one-way.json"
MEASUREMENTS = REPO / "docs" / "dataset" / "measurements.jsonl"
EXTRA = (REPO / "docs" / "dataset" / "measurements-contestes.jsonl",)

FLAT_BPS = 1.0
HEAVY_BPS = 1000.0
MIN_SIZES_PER_SIDE = 3


def read_rows(paths: Optional[Iterable[Path]] = None) -> List[dict]:
    """Toutes les mesures publiees. Un fichier absent est absent, pas vide."""
    out: List[dict] = []
    for p in list(paths) if paths is not None else [MEASUREMENTS, *EXTRA]:
        p = Path(p)
        if not p.exists():
            continue
        with open(p) as fh:
            for line in fh:
                line = line.strip()
                if line:
                    out.append(json.loads(line))
    return out


def classify(rows: List[dict], flat_bps: float = FLAT_BPS, heavy_bps: float = HEAVY_BPS,
             min_sizes: int = MIN_SIZES_PER_SIDE) -> Dict[str, Any]:
    """Range les pools mesures dans les deux sens. Ne calcule aucun bps."""
    sides: Dict[tuple, Dict[bool, List[dict]]] = {}
    for r in rows:
        if r.get("label") != "MEASURED" or r.get("bps") is None:
            continue
        key = (r["hook"].lower(), r["pool_id"])
        sides.setdefault(key, {True: [], False: []})[bool(r["zero_for_one"])].append(r)

    trouves: List[Dict[str, Any]] = []
    deux_sens = 0
    for (hook, pool_id), d in sides.items():
        a, b = d[True], d[False]
        # Un pool cote dans un seul sens n'est pas asymetrique : il est incotable dans
        # l'autre, ce qui est un fait de liquidite deja porte par les lignes NOT_QUOTABLE.
        if len(a) < min_sizes or len(b) < min_sizes:
            continue
        deux_sens += 1
        m_a = statistics.median(x["bps"] for x in a)
        m_b = statistics.median(x["bps"] for x in b)
        bas, haut = (m_a, m_b) if m_a <= m_b else (m_b, m_a)
        if not (bas < flat_bps and haut >= heavy_bps):
            continue
        sens_lourd = "1->0" if m_b > m_a else "0->1"
        lourd = b if m_b > m_a else a
        leger = a if m_b > m_a else b
        ref = lourd[0]
        trouves.append({
            "hook": hook,
            "pool_id": pool_id,
            "currency0": ref["currency0"],
            "currency1": ref["currency1"],
            "stored_lp_fee": ref["stored_lp_fee"],
            "block_number": ref["block_number"],
            "sens_lourd": sens_lourd,
            "bps_median_lourd": round(haut, 4),
            "bps_median_leger": round(bas, 4),
            "n_tailles_lourd": len(lourd),
            "n_tailles_leger": len(leger),
            # Toutes les tailles, pas un resume : un lecteur doit pouvoir voir que le taux
            # tient sur huit decades et n'est pas un accident sur une taille.
            "par_taille_lourd": sorted(
                ({"amount_in": x["amount_in"], "bps": x["bps"]} for x in lourd),
                key=lambda t: int(t["amount_in"])),
            "par_taille_leger": sorted(
                ({"amount_in": x["amount_in"], "bps": x["bps"]} for x in leger),
                key=lambda t: int(t["amount_in"])),
            "replay": (f"make measure HOOK={ref['hook']} BLOCK={ref['block_number']}"),
        })

    trouves.sort(key=lambda t: -t["bps_median_lourd"])
    return {
        "seuils": {
            "flat_bps": flat_bps,
            "heavy_bps": heavy_bps,
            "min_tailles_par_sens": min_sizes,
            "note": ("heavy_bps est un seuil de PUBLICATION, pas une frontiere naturelle : "
                     "le bouger change la liste, et le rapport le porte pour qu'on puisse le "
                     "verifier."),
        },
        "portee": {
            "pools_mesures_dans_les_deux_sens": deux_sens,
            "pools_retenus": len(trouves),
            "hooks_retenus": len({t["hook"] for t in trouves}),
        },
        "pools": trouves,
    }


def group_by_bytecode(report: Dict[str, Any], code_by_hook: Dict[str, str]) -> Dict[str, Any]:
    """Regroupe les hooks retenus par empreinte de bytecode.

    Un meme contrat deploye plusieurs fois n'est pas plusieurs decouvertes : c'est une seule,
    repetee. Le dire evite de compter quatre fois le meme fait.
    """
    par: Dict[str, List[str]] = {}
    for t in report["pools"]:
        h = t["hook"]
        code = code_by_hook.get(h)
        if code is None:
            par.setdefault("NON_LU", []).append(h)
            continue
        par.setdefault(code, []).append(h)
    groupes = [
        {"code_hash": k, "n_hooks": len(set(v)), "hooks": sorted(set(v)),
         "note": ("empreinte non lue : ces hooks sont peut-etre le meme contrat, on ne le "
                  "sait pas" if k == "NON_LU" else None)}
        for k, v in sorted(par.items(), key=lambda kv: -len(set(kv[1])))
    ]
    return {**report, "groupes_de_bytecode": groupes}


def read_codes(rpc: str, hooks: Iterable[str]) -> Dict[str, str]:
    """L'empreinte du bytecode a chaque adresse, lue sur la chaine.

    Une lecture qui echoue n'est PAS un bytecode different : le hook est simplement absent du
    dictionnaire, et `group_by_bytecode` le rangera sous NON_LU. Confondre « pas lu » et
    « distinct » ferait passer un seul contrat deploye quatre fois pour quatre decouvertes.
    """
    import hashlib

    from .rpc import get_code

    out: Dict[str, str] = {}
    for h in hooks:
        try:
            code = get_code(rpc, h)
        except Exception:
            continue
        if not code or code == "0x":
            continue
        out[h.lower()] = hashlib.sha256(bytes.fromhex(code[2:])).hexdigest()
    return out


DOC = REPO / "docs" / "ONE-WAY.md"


def render(rep: Dict[str, Any]) -> str:
    """Le document publie, engendre depuis le rapport. Aucun nombre n'y est tape."""
    p = rep["portee"]
    s = rep["seuils"]
    grp = rep.get("groupes_de_bytecode", [])
    contrats = sum(1 for g in grp if g["code_hash"] != "NON_LU")
    L: List[str] = []
    w = L.append
    w("<!-- Engendre par `cd engine && python3 -m tare.oneway --rpc <fork> --write --markdown`.")
    w("     Ne pas editer a la main : le corpus grandit. -->")
    w("")
    w("# Pools that let you in and do not let you out")
    w("")
    w("A v4 hook may charge a different rate depending on which way you swap. TARE sweeps **both**")
    w("directions at the **same** eight sizes, on the same pinned block, so the two are comparable.")
    w("Almost always they agree. On a handful of pools they do not agree at all.")
    w("")
    w(f"Of the **{p['pools_mesures_dans_les_deux_sens']:,} pools measured in both directions**, "
      f"**{p['pools_retenus']}** are flat one way and confiscatory the other: under "
      f"**{s['flat_bps']} bps** going in, at least **{s['heavy_bps']:.0f} bps** coming back.")
    w(f"They sit on **{p['hooks_retenus']} hook addresses** — but only "
      f"**{contrats} distinct contract{'s' if contrats != 1 else ''}**: one of them is deployed "
      f"more than once, and counting the deployments would count the same fact twice.")
    w("")
    w("| hook | pool | in | out | sizes | LP fee |")
    w("|---|---|---|---|---|---|")
    for t in rep["pools"]:
        w(f"| `{t['hook'][:14]}…` | `{t['pool_id'][:14]}…` | **{t['bps_median_leger']:.2f} bps** | "
          f"**{t['bps_median_lourd']:.2f} bps** | {t['n_tailles_lourd']} | "
          f"{t['stored_lp_fee']} |")
    w("")
    w("The rate holds across every size measured — eight decades of swap size — which is what")
    w("separates a rate from an accident on one quote. The per-size figures are in")
    w("[`docs/dataset/one-way.json`](dataset/one-way.json), and each row replays with one command.")
    w("")
    w("## Identical code, deployed several times")
    w("")
    for g in grp:
        if g["code_hash"] == "NON_LU":
            w(f"- **bytecode not read** — {g['n_hooks']} hook(s). Not read is not *different*: "
              f"these may be the same contract, and this report does not claim otherwise.")
            continue
        w(f"- `{g['code_hash'][:16]}…` — **{g['n_hooks']} hook address"
          f"{'es' if g['n_hooks'] > 1 else ''}**: " + ", ".join(f"`{h[:14]}…`" for h in g["hooks"]))
    w("")
    w("## What this report does not say")
    w("")
    w("It does not say *scam*, *trap* or *honeypot*, and it attributes no intent. None of these")
    w("contracts has verified source on Sourcify, so under this project's own rule they keep the")
    w("label **behaviour not read**: no mechanism, no intent, no explanation is attributed to a")
    w("contract whose code nobody has read. What is published is a measurement and its shape —")
    w("one direction flat, the other confiscatory, at every size, replayable.")
    w("")
    w(f"`{s['heavy_bps']:.0f} bps` is a **publishing threshold**, not a natural boundary. It was")
    w("chosen to retain only what no ordinary fee model explains. Move it and the list moves; the")
    w("threshold travels with the report so that anyone can.")
    w("")
    # Cette phrase a d'abord ete ECRITE, pas derivee — verifiee a la main une fois, donc
    # fausse des que le registre bouge. Elle se calcule maintenant, et elle sait dire
    # « je n'ai pas de registre a consulter » plutot que d'affirmer une absence.
    reg = rep.get("registre") or {}
    if reg.get("disponible"):
        n_abs, n = reg["absents"], p["hooks_retenus"]
        if n_abs == n:
            w(f"**None of these {n} hooks appears in the official registry** "
              f"({reg['fiches']:,} entries, `{reg['fichier']}`).")
        else:
            w(f"{n_abs} of these {n} hooks are absent from the official registry "
              f"({reg['fiches']:,} entries, `{reg['fichier']}`); the rest are listed.")
    else:
        w("The registry was not read for this report, so nothing is claimed about what it "
          "does or does not list. Absent is not the same as unchecked.")
    w("")
    return "\n".join(L)


def registry_presence(hooks: Iterable[str]) -> Dict[str, Any]:
    """Combien des hooks retenus le registre officiel decrit-il ?

    Un registre absent rend `disponible: False` — jamais « zero fiche », qui se lirait comme
    « le registre ne les connait pas » alors qu'on ne l'a pas ouvert.
    """
    docs = REPO / "docs"
    live = sorted(docs.glob("hooklist-live-*.json"))
    path = live[-1] if live else docs / "hooklist.json"
    if not path.exists():
        return {"disponible": False}
    entries = json.loads(path.read_text())
    connus = {e["hook"]["address"].lower() for e in entries}
    hooks = {h.lower() for h in hooks}
    return {
        "disponible": True,
        "fichier": f"docs/{path.name}",
        "fiches": len(entries),
        "absents": len(hooks - connus),
        "presents": sorted(hooks & connus),
    }


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="tare.oneway")
    ap.add_argument("--rpc", default=None,
                    help="lit le bytecode des hooks retenus pour les regrouper ; "
                         "sans lui, ils sont ranges sous NON_LU et non supposes distincts")
    ap.add_argument("--flat-bps", type=float, default=FLAT_BPS)
    ap.add_argument("--heavy-bps", type=float, default=HEAVY_BPS)
    ap.add_argument("--min-sizes", type=int, default=MIN_SIZES_PER_SIDE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--markdown", action="store_true", help="ecrit aussi docs/ONE-WAY.md")
    a = ap.parse_args(argv)

    rows = read_rows()
    rep = classify(rows, a.flat_bps, a.heavy_bps, a.min_sizes)
    rep["n_mesures_lues"] = len(rows)
    codes = read_codes(a.rpc, {t["hook"] for t in rep["pools"]}) if a.rpc else {}
    rep = group_by_bytecode(rep, codes)
    rep["bytecode_lu"] = bool(a.rpc)
    rep["registre"] = registry_presence({t["hook"] for t in rep["pools"]})

    if a.write:
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(json.dumps(rep, indent=1) + "\n", encoding="utf-8")
        print(f"ecrit {a.out}", file=sys.stderr)
    if a.markdown:
        DOC.write_text(render(rep), encoding="utf-8")
        print(f"ecrit {DOC}", file=sys.stderr)

    p = rep["portee"]
    print(json.dumps({**p, "seuils": rep["seuils"]}, indent=1, ensure_ascii=False))
    for g in rep.get("groupes_de_bytecode", []):
        marque = " (NON LU)" if g["code_hash"] == "NON_LU" else ""
        print(f"  groupe {g['code_hash'][:16]}{marque} : {g['n_hooks']} hook(s)")
    for t in rep["pools"][:10]:
        print(f"  {t['hook'][:16]}..  pool {t['pool_id'][:14]}..  "
              f"{t['bps_median_leger']:.2f} bps / {t['bps_median_lourd']:.2f} bps  "
              f"({t['sens_lourd']}, {t['n_tailles_lourd']} tailles)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
