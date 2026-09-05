"""Le bloc « What the graph reveals » du README, recalcule depuis le graphe publie.

Pourquoi ce module existe. La section a porte pendant plusieurs jours des nombres tapes a la
main — 2 931 noeuds, 199 pools, 995 mesures, 613 fiches. Ils etaient exacts le jour ou ils ont
ete ecrits et faux le lendemain : le corpus a grandi d'un facteur onze pendant la semaine, le
registre est passe de 613 a 978 fiches, et la prose est restee. C'est exactement le defaut que
ce projet reproche au registre — un champ decrit sans etre mesure — applique a son propre
README.

Ce bloc se regenere donc, comme celui de `tare.dataset.stats` :

    PYTHONPATH=engine python3 -m tare.graph.readme --write-readme

Les mesures de temps de la section suivante ne sont PAS engendrees ici : elles dependent de la
machine, elles sont annoncees comme telles, et `tare.graph.cachebench` les imprime.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Dict, List

from . import queries as Q
from .store import load_store

REPO_ROOT = Path(__file__).resolve().parents[3]
README = REPO_ROOT / "README.md"
MARK_START = "<!-- FACTS:graph -->"
MARK_END = "<!-- /FACTS:graph -->"

KIND_LABEL = {
    "Hook": "hooks", "Pool": "pools", "Token": "tokens", "Bytecode": "distinct bytecodes",
    "Deployer": "deployers", "Measurement": "measurements", "RegistryEntry": "registry entries",
}


def _counts(g) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for _, d in g.nodes(data=True):
        k = d.get("kind")
        if k:
            out[k] = out.get(k, 0) + 1
    return out


def _n(x: Any) -> str:
    return f"{x:,}" if isinstance(x, int) else str(x)


def render(path: Path | None = None) -> str:
    store = load_store(path) if path else load_store()
    g = store.g
    c = _counts(g)
    n_nodes, n_edges = g.number_of_nodes(), g.number_of_edges()

    clusters = Q.bytecode_clusters(g, min_size=2)
    n_hooks_clustered = sum(len(x.get("hooks") or []) for x in clusters)
    orph = Q.orphans(g)
    contr = Q.contradictions(g)
    disag = Q.disagreement(g)

    # Un amas dont aucun hook n'a de pool mesure : le code est deploye, pas encore echange.
    muets = [x for x in clusters
             if not any(Q.pools_of(g, h) for h in (x.get("hooks") or []))]

    ordre = ["Hook", "Pool", "Token", "Bytecode", "Deployer", "Measurement", "RegistryEntry"]
    repartition = ", ".join(
        f"{_n(c[k])} {KIND_LABEL[k]}" for k in ordre if c.get(k))

    d_count = disag["n_registry_says_active_measure_says_flat"]
    d_rows = disag["registry_says_active_measure_says_flat"]
    d_inverse = disag["n_registry_says_vanilla_measure_says_active"]
    nc = disag["n_not_comparable"]

    L: List[str] = [MARK_START, ""]
    # D'ou viennent les mesures. Le tableau « what we found » plus haut ne compte que le
    # balayage principal ; le graphe voit aussi le balayage des paires contestees. Deux
    # nombres differents dans un meme README sans explication se lisent comme une erreur,
    # alors qu'ils repondent a deux questions. On nomme donc les fichiers et leur total.
    from . import sources as S
    fichiers = [(S.DEFAULT_MEASUREMENTS, len(S.read_measurements(S.DEFAULT_MEASUREMENTS, ())))]
    for extra in S.EXTRA_MEASUREMENTS:
        if extra.exists():
            fichiers.append((extra, len(S.read_measurements(extra, ()))))
    provenance = " + ".join(
        f"`docs/dataset/{f.name}` ({_n(k)})" for f, k in fichiers)

    L.append(
        f"`engine/tare/graph/` joins the three sources into one graph — **{_n(n_nodes)} nodes, "
        f"{_n(n_edges)} edges** — and `apps/api/src/graph-routes.ts` serves it. "
        f"Nodes: {repartition}. Every number below is a traversal, not a model output, and each "
        f"replays with one command.")
    L.append("")
    L.append(
        f"Its measurements are every one this repository publishes — {provenance} — against "
        f"`docs/{S.DEFAULT_HOOKLIST.name}`. The table above counts the main sweep only, which is "
        f"why its total is the smaller of the two.")
    L.append("")
    L.append("| What the traversal asks | What it finds |")
    L.append("|---|---|")

    if clusters:
        gros = ", ".join(
            f"`{x['code_hash'][:10]}…` ({_n(x.get('code_size') or 0)} bytes, "
            f"{len(x.get('hooks') or [])} hooks)"
            for x in clusters[:2])
        muet_txt = (f" {len(muets)} of the {len(clusters)} clusters have no measured pool at all: "
                    f"the duplicated code is deployed, not yet traded." if muets else "")
        L.append(
            f"| **Clone clusters** — hooks sharing a `keccak(eth_getCode)` | "
            f"**{len(clusters)} clusters, {n_hooks_clustered} hooks.** {gros}.{muet_txt} |")
    else:
        L.append("| **Clone clusters** — hooks sharing a `keccak(eth_getCode)` | **none** |")

    o_n = orph["n_orphans"]
    o_tot = orph["n_listed"]
    o_code = sum(1 for x in orph["orphans"] if x.get("bytecode_status") == "CODE")
    code_txt = (f" {_n(o_code)} of them have `bytecode_status = CODE` — they exist on-chain."
                if o_code else "")
    L.append(
        f"| **Orphans** — registry hooks on Base with no liquid pool we could measure | "
        f"**{_n(o_n)} of {_n(o_tot)}.**{code_txt} "
        f"The registry lists far more hooks than anyone routes a swap through. |")

    c_n = contr["n_contradictory"]
    c_tot = contr["n_hooks_with_multiple_entries"]
    # Les champs en desaccord, comptes sur les fiches elles-memes plutot que devines.
    champs: Dict[str, int] = {}
    for x in contr["contradictions"]:
        for f in x.get("fields") or []:
            court = f.split(".")[-1]
            champs[court] = champs.get(court, 0) + 1
    champs_txt = ", ".join(f"`{k}` ({v})" for k, v in
                           sorted(champs.items(), key=lambda t: (-t[1], t[0]))[:4])
    # `vanillaSwap` est le champ contre lequel TARE se compare : on le nomme s'il diverge.
    vanilla = champs.get("vanillaSwap")
    pointe = (f" — and on **`vanillaSwap` itself, {vanilla} times**" if vanilla else "")
    L.append(
        f"| **Contradictions** — one hook, two registry entries that disagree | "
        f"**{_n(c_n)} of the {_n(c_tot)} hooks that carry more than one entry.** "
        f"They differ on {champs_txt}{pointe}. |")

    ex = ""
    if d_rows:
        r = d_rows[0]
        prof = r.get("profile") or {}
        peak, n_m, n_p = prof.get("bps_max"), prof.get("n_measured"), r.get("n_pools")
        if peak is not None:
            ex = (f" `{r['address'][:10]}…` ({r.get('label') or 'unnamed'}): the entry says the "
                  f"hook touches the swap; {n_m} `MEASURED` across {n_p} pools peak at "
                  f"**{peak} bps**, under the 1 bps rounding floor.")
    # L'autre sens compte autant : declare inoffensif, mesure preleveur. On le publie meme a zero.
    L.append(
        f"| **Disagreement** — registry says `vanillaSwap=false`, measurement finds ~0 bps | "
        f"**{_n(d_count)}.**{ex} The other direction — declared vanilla, measured extracting — "
        f"is **{_n(d_inverse)}**. |")
    if nc:
        L.append(
            f"| **Not comparable** | **{_n(nc)} hooks.** They carry a `vanillaSwap` claim and no "
            f"`MEASURED` measurement. They are listed as such and never counted as agreement. |")

    L.append("")
    if nc:
        L.append(f"That last row is the point: **{_n(nc)} registry claims that no one, including "
                 f"us, has checked.**")
        L.append("")
    L.append("```bash")
    L.append("curl localhost:8787/graph                                # every count above")
    L.append("PYTHONPATH=engine python3 -m tare.graph.cli disagreement  # the same, offline")
    L.append("```")
    L.append("")
    L.append(MARK_END)
    return "\n".join(L)


def splice(readme: Path, block: str) -> bool:
    text = readme.read_text()
    i, j = text.find(MARK_START), text.find(MARK_END)
    if i < 0 or j < 0:
        raise ValueError(f"marqueurs absents de {readme} — attendus {MARK_START} ... {MARK_END}")
    new = text[:i] + block + text[j + len(MARK_END):]
    if new == text:
        return False
    readme.write_text(new)
    return True


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="tare.graph.readme")
    ap.add_argument("--graph", type=Path, default=None)
    ap.add_argument("--write-readme", action="store_true")
    a = ap.parse_args(argv)
    block = render(a.graph)
    if a.write_readme:
        changed = splice(README, block)
        print(f"README {'mis a jour' if changed else 'deja a jour'}", file=sys.stderr)
    else:
        print(block)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
