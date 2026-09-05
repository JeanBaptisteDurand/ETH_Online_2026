"""tare — command line.

    python3 -m tare.cli sweep    --rpc http://127.0.0.1:8545 [--limit N] [--restart]
    python3 -m tare.cli measure  --hook 0x... --rpc http://127.0.0.1:8545
    python3 -m tare.cli verify   --rpc http://127.0.0.1:8545 [--sample 20]
    python3 -m tare.cli summary  [--in docs/dataset/measurements.jsonl]
    python3 -m tare.cli compact  [--in docs/dataset/measurements.jsonl]
    python3 -m tare.cli pools    [--hook 0x...]

Every printed number carries its block, its size and its direction, and every command prints the
one-liner that replays it. A value you cannot replay is a claim, not a measurement.

To go faster, run one shard per fork — never two processes against one anvil, because measuring
rewrites the hook's code on the node and the two would read each other's stub:

    anvil --fork-url $RPC --fork-block-number 50614000 --port 8545 &   # and 8546, 8547, 8548
    for i in 0 1 2 3; do
      python3 -m tare.cli sweep --rpc http://127.0.0.1:854$((5+i)) --shard $i --of 4 &
    done

The shards share one JSONL: appends are one line each and O_APPEND, and `dedupe` absorbs the
overlap between resume sets taken at different moments.
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

from .sweep import (DEFAULT_OUT, DEFAULT_POOLS, DEFAULT_SUMMARY, DIRECTIONS, SIZES, dedupe,
                    discovery_provenance, load_pools,
                    measure_resilient, probe_direction, read_done, read_jsonl, summarise,
                    sweep, write_summary)

from .poolid import PoolKey

BLOCK = 50614000


# ----------------------------------------------------------------------------- sweep

def cmd_sweep(a) -> int:
    if a.of < 1 or not (0 <= a.shard < a.of):
        print(f"--shard doit etre dans [0, {a.of}) ; recu --shard {a.shard} --of {a.of}")
        return 2
    pools = load_pools(a.pools)
    if a.hook:
        want = a.hook.lower()
        pools = [p for p in pools if p[0].hooks.lower() == want]
    # Deepest pools first: if the run is cut short, what is on disk is the part that matters.
    pools.sort(key=lambda p: -p[1])
    # Sharding by stride, not by slice, so every worker gets a mix of deep and shallow pools and
    # they all finish at roughly the same time. Appends are line-sized and O_APPEND, so several
    # shards can share one output file; `dedupe` absorbs any overlap.
    if a.of > 1:
        pools = [p for i, p in enumerate(pools) if i % a.of == a.shard]
    if a.limit:
        pools = pools[:a.limit]

    out = Path(a.out)
    already = read_done(out) if not a.restart else set()
    if a.restart and out.exists():
        out.unlink()

    print(f"sweep  {len(pools)} pools x {len(SIZES)} tailles x {len(DIRECTIONS)} sens "
          f"= {len(pools) * len(SIZES) * len(DIRECTIONS)} cellules  bloc {a.block}  -> {out}")
    print(f"       {len(already)} mesures deja presentes, elles ne seront pas refaites\n")

    stats = sweep(a.rpc, pools, a.block, out_path=out, sizes=SIZES,
                  resume=not a.restart, log=lambda s: print(s, flush=True))

    print(f"\n{stats['written']} mesures ecrites en {stats['seconds']}s "
          f"({stats['pools']} pools traites, {stats['pools_skipped']} deja faits, "
          f"{stats['errors']} erreurs)")
    for label, n in stats["by_label"].items():
        if n:
            print(f"  {label:<16} {n}")

    s = write_summary(out, a.summary, block=a.block)
    print(f"\nresume -> {a.summary}  "
          f"({s['n_measurements']} mesures, {s['n_pools']} pools, {s['n_hooks']} hooks, "
          f"{s['n_non_flat_profiles']} profils non plats)")
    print(f"rejouer : python3 -m tare.cli sweep --rpc {a.rpc} --block {a.block}")
    return 0


# ----------------------------------------------------------------------------- measure

def cmd_measure(a) -> int:
    """Every pool of one hook, at the five sizes, printed rather than stored."""
    pools = [p for p in load_pools(a.pools) if p[0].hooks.lower() == a.hook.lower()]
    if not pools:
        print(f"aucun pool liquide connu pour {a.hook} dans {a.pools}")
        return 1

    print(f"hook {a.hook}  bloc {a.block}  {len(pools)} pool(s)\n")
    print(f"{'pool':<20}{'sens':>6}{'lpFee':>8}" + "".join(f"{s:>12.0e}" for s in SIZES))

    for key, liquidity, _dyn in pools:
        zfo, _probe, infra = probe_direction(a.rpc, key)
        pid = "0x" + key.pool_id().hex()
        if zfo is None:
            # A node that would not answer is not a pool that would not quote.
            verdict = "le noeud n'a pas repondu (NOT_MEASURABLE)" if infra \
                else "aucun sens cotable (NOT_QUOTABLE)"
            print(f"{pid[:18]:<20}{'—':>6}{'—':>8}   {verdict}")
            continue
        cells, lp = [], None
        for size in SIZES:
            m = measure_resilient(a.rpc, key, zfo, size, a.block)
            lp = m.stored_lp_fee
            cells.append(f"{m.bps:12.2f}" if m.bps is not None
                         else f"{m.label.replace('NOT_', 'n/'):>12}")
        print(f"{pid[:18]:<20}{('0->1' if zfo else '1->0'):>6}{str(lp):>8}" + "".join(cells))

    print(f"\nrejouer : python3 -m tare.cli measure --hook {a.hook} "
          f"--rpc {a.rpc} --block {a.block}")
    return 0


# ----------------------------------------------------------------------------- verify

def cmd_verify(a) -> int:
    """Re-measure a random sample of the file and compare, line by line.

    This exists because a dataset that cannot be replayed is a set of claims. It is also the
    check that caught the worst bug this sweep produced: a replay run against the same anvil a
    shard was still sweeping left the stub installed on a hook, and 100.00 bps became 0.00 for
    every later row on that fork. Run it on an **idle** fork — the guard in `measure_resilient`
    will refuse rather than lie, but a busy fork simply cannot answer this question.
    """
    rows = [r for r in read_jsonl(a.infile) if r["label"] == "MEASURED" and r["bps"] is not None]
    if not rows:
        print(f"aucune mesure a verifier dans {a.infile}")
        return 1
    keys = {"0x" + k.pool_id().hex(): k for k, _l, _d in load_pools(a.pools)}

    random.seed(a.seed)
    sample = random.sample(rows, min(a.sample, len(rows)))
    print(f"rejeu de {len(sample)} mesures sur {len(rows)}  bloc {a.block}  "
          f"fork {a.rpc}  graine {a.seed}\n")
    print(f"{'pool':<20}{'taille':>9}{'fichier':>12}{'rejeu':>12}  verdict")

    agree, differ, blocked = 0, [], 0
    for r in sample:
        key = keys.get(r["pool_id"])
        if key is None:
            blocked += 1
            continue
        m = measure_resilient(a.rpc, key, r["zero_for_one"], int(r["amount_in"]),
                              r["block_number"])
        if m.bps is None:
            blocked += 1
            verdict, got = f"NON REJOUABLE ({m.label})", "—"
        elif m.bps == r["bps"] and m.out_with == r["out_with"]:
            agree += 1
            verdict, got = "identique", f"{m.bps:.4f}"
        else:
            differ.append((r, m))
            verdict, got = "DIFFERENT", f"{m.bps:.4f}"
        print(f"{r['pool_id'][:18]:<20}{int(r['amount_in']):>9.0e}"
              f"{r['bps']:>12.4f}{got:>12}  {verdict}")

    print(f"\n{agree} identiques, {len(differ)} differentes, {blocked} non rejouables")
    if differ:
        print("\nUn ecart signifie que le fichier ou le fork ment. Ne publie rien avant "
              "d'avoir trouve lequel.")
    print(f"rejouer : python3 -m tare.cli verify --rpc {a.rpc} --sample {a.sample} "
          f"--seed {a.seed}")
    return 0 if not differ else 1



# ----------------------------------------------------------------------------- replay

def cmd_replay(a) -> int:
    """Rejouer UNE mesure nommee, et rien d'autre.

    Ce projet promet sur chaque ligne que la valeur « se rejoue en une commande ». La commande
    publiee etait `make measure HOOK=0x...`, qui remesure TOUS les pools du hook : pour Zora
    cela fait 1 471 pools, huit tailles, deux sens — plus de vingt mille cotations, des heures.
    La promesse etait vraie et inutilisable, ce qui revient a ne pas la tenir.

    Ici on rejoue exactement la cellule demandee. La `PoolKey` est DANS la ligne (currency0,
    currency1, key_fee, tick_spacing, hook) : il n'y a aucun recensement a charger, aucune
    correspondance a deviner. Le programme sort en 1 si la valeur differe — un rejeu qui ne
    peut pas echouer ne prouve rien.
    """
    # On filtre EN LISANT. Charger les 80 000 lignes pour en garder une coutait onze
    # secondes sur les quinze de la commande — pour un outil dont l'unique raison d'etre
    # est qu'on l'utilise sans y penser, c'etait la moitie du prix.
    want = None if a.direction is None else a.direction in ("0>1", "0-1", "zeroForOne", "true")
    taille = None if a.size is None else str(a.size)
    sel = []
    with open(a.infile) as fh:
        for line in fh:
            if a.pool not in line:          # test bon marche avant de payer le JSON
                continue
            r = json.loads(line)
            if r["pool_id"] != a.pool:
                continue
            if taille is not None and str(r["amount_in"]) != taille:
                continue
            if want is not None and bool(r["zero_for_one"]) is not want:
                continue
            sel.append(r)
    if not sel:
        print(f"aucune ligne pour pool={a.pool} taille={a.size} sens={a.direction} "
              f"dans {a.infile}", file=sys.stderr)
        return 2
    if len(sel) > 1 and not a.all:
        print(f"{len(sel)} lignes correspondent — precise --size et --direction, "
              f"ou passe --all", file=sys.stderr)
        for r in sel[:8]:
            print(f"   taille {r['amount_in']:>22}  "
                  f"{'0>1' if r['zero_for_one'] else '1>0'}  {r['label']}  {r['bps']}",
                  file=sys.stderr)
        return 2

    ecarts = 0
    print(f"{'taille':>22} {'sens':<5} {'fichier':>12} {'rejeu':>12}  verdict")
    for r in sel:
        key = PoolKey(r["currency0"], r["currency1"], r["key_fee"], r["tick_spacing"], r["hook"])
        # La cle se re-derive : si le pool_id recalcule ne retombe pas sur celui du fichier,
        # la ligne decrit un autre pool que celui qu'elle nomme, et on s'arrete la.
        recalc = "0x" + key.pool_id().hex()
        if recalc != r["pool_id"]:
            print(f"pool_id incoherent : la ligne dit {r['pool_id']}, sa PoolKey donne {recalc}",
                  file=sys.stderr)
            return 1
        m = measure_resilient(a.rpc, key, r["zero_for_one"], int(r["amount_in"]),
                              r["block_number"])
        sens = "0>1" if r["zero_for_one"] else "1>0"
        av = "—" if r["bps"] is None else f"{r['bps']:.4f}"
        ap = "—" if m.bps is None else f"{m.bps:.4f}"
        if m.label != r["label"]:
            verdict = f"ETIQUETTE DIFFERENTE ({r['label']} -> {m.label})"
            ecarts += 1
        elif m.bps == r["bps"] and m.out_with == r["out_with"] and m.out_without == r["out_without"]:
            verdict = "identique, au wei pres"
        else:
            verdict = "DIFFERENT"
            ecarts += 1
        print(f"{r['amount_in']:>22} {sens:<5} {av:>12} {ap:>12}  {verdict}")
        if a.verbose:
            print(f"{'':>22} out_avec  fichier={r['out_with']}  rejeu={m.out_with}")
            print(f"{'':>22} out_sans  fichier={r['out_without']}  rejeu={m.out_without}")
            print(f"{'':>22} talon     {m.stub_hash}")

    if ecarts:
        print(f"\n{ecarts} ecart(s). Le fichier ou le fork ment ; trouve lequel avant de "
              f"publier quoi que ce soit.", file=sys.stderr)
    return 1 if ecarts else 0


# ----------------------------------------------------------------------------- summary

def cmd_summary(a) -> int:
    rows = read_jsonl(a.infile)
    if not rows:
        print(f"{a.infile} est vide — lance d'abord `python3 -m tare.cli sweep --rpc ...`")
        return 1
    # La provenance de la decouverte n'est pas un compte des lignes : c'est la forme de la
    # recherche qui a produit la liste de pools. Sans elle, un lecteur prend l'echantillon pour
    # la population.
    s = summarise(rows, block=a.block,
                  discovery=discovery_provenance(a.logs_manifest, a.pool_census))
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(s, indent=1) + "\n")

    print(f"{s['n_measurements']} mesures  {s['n_pools']} pools  {s['n_hooks']} hooks  "
          f"bloc {s['block_number']}")
    for label, n in s["by_label"].items():
        print(f"  {label:<16} {n}")
    print(f"\nbps mesures : min {s['bps_min']}  mediane {s['bps_median']}  max {s['bps_max']}")
    print(f"> 1 bps avec stored_lp_fee == 0 : {s['n_gt_1bps_at_zero_stored_lp_fee']} mesures "
          f"sur {s['n_pools_gt_1bps_at_zero_stored_lp_fee']} pools "
          f"/ {s['n_hooks_gt_1bps_at_zero_stored_lp_fee']} hooks")
    print(f"\nprofils non plats (amplitude >= {s['non_flat_threshold_bps']} bps) : "
          f"{s['n_non_flat_profiles']}")
    for p in s["non_flat_profiles"][:15]:
        print(f"  {p['pool_id'][:18]}  hook {p['hook'][:12]}  "
              f"{p['bps_at_min_size']:8.2f} -> {p['bps_at_max_size']:8.2f}  "
              f"amplitude {p['amplitude_bps']:8.2f}")
    print(f"\necrit dans {a.out}")
    return 0


# ----------------------------------------------------------------------------- compact

def cmd_compact(a) -> int:
    """Collapse the append log into one canonical line per measurement.

    The sweep appends: a retry after a node outage leaves the failed row above the real one, and
    parallel shards can overlap. `dedupe` already resolves that for the summary, but the file is
    read by the API and the instrument too, and they should not each have to know the rule. This
    rewrites it sorted and deduplicated so a naive reader gets exactly the dataset.
    """
    rows = read_jsonl(a.infile)
    # Direction is in the sort key because it is in the identity: since the sweep measures both
    # sides, (hook, pool, size) names two lines, and a tie broken by whatever order the shards
    # happened to append in makes the committed file churn on every run for no change in content.
    kept = sorted(dedupe(rows),
                  key=lambda r: (r["hook"], r["pool_id"], int(r["amount_in"]),
                                 not r["zero_for_one"]))
    tmp = Path(str(a.infile) + ".tmp")
    with tmp.open("w") as fh:
        for r in kept:
            fh.write(json.dumps(r, separators=(",", ":")) + "\n")
    tmp.replace(a.infile)
    print(f"{len(rows)} lignes -> {len(kept)} mesures ({len(rows) - len(kept)} superposees), "
          f"triees par hook, pool, taille")
    print(f"rejouer : python3 -m tare.cli compact --in {a.infile}")
    return 0


# ----------------------------------------------------------------------------- pools

def cmd_pools(a) -> int:
    pools = load_pools(a.pools)
    if a.hook:
        pools = [p for p in pools if p[0].hooks.lower() == a.hook.lower()]
    pools.sort(key=lambda p: -p[1])
    print(f"{len(pools)} pools liquides")
    for key, liq, dyn in pools[:a.limit or len(pools)]:
        print(f"  {'0x' + key.pool_id().hex()[:16]}  hook {key.hooks}  "
              f"fee {key.fee:>8}  ts {key.tick_spacing:>4}  "
              f"{'dyn' if dyn else '   '}  liq {liq}")
    return 0


# ----------------------------------------------------------------------------- entry

def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="tare", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p):
        p.add_argument("--rpc", default="http://127.0.0.1:8545")
        p.add_argument("--block", type=int, default=BLOCK)
        p.add_argument("--pools", default=str(DEFAULT_POOLS))

    s = sub.add_parser("sweep", help="mesurer tous les pools liquides, en JSONL reprenable")
    common(s)
    s.add_argument("--out", default=str(DEFAULT_OUT))
    s.add_argument("--summary", default=str(DEFAULT_SUMMARY))
    s.add_argument("--limit", type=int, default=0)
    s.add_argument("--hook", default=None)
    s.add_argument("--shard", type=int, default=0, help="index de ce worker (0-based)")
    s.add_argument("--of", type=int, default=1, help="nombre total de workers")
    s.add_argument("--restart", action="store_true", help="repartir de zero (efface la sortie)")
    s.set_defaults(fn=cmd_sweep)

    m = sub.add_parser("measure", help="les pools d'un hook, aux cinq tailles")
    common(m)
    m.add_argument("--hook", required=True)
    m.set_defaults(fn=cmd_measure)

    rp = sub.add_parser("replay", help="rejouer UNE mesure nommee et comparer au fichier")
    rp.add_argument("--pool", required=True, help="pool_id de la ligne a rejouer")
    rp.add_argument("--size", default=None, help="amount_in en wei")
    rp.add_argument("--direction", default=None, choices=["0>1", "1>0"])
    rp.add_argument("--all", action="store_true", help="rejouer toutes les lignes du pool")
    rp.add_argument("--verbose", action="store_true", help="montrer les sorties brutes")
    rp.add_argument("--rpc", default="http://127.0.0.1:8545")
    rp.add_argument("--in", dest="infile", default=str(DEFAULT_OUT))
    rp.set_defaults(fn=cmd_replay)

    v = sub.add_parser("verify", help="rejouer un echantillon du fichier et comparer")
    common(v)
    v.add_argument("--in", dest="infile", default=str(DEFAULT_OUT))
    v.add_argument("--sample", type=int, default=20)
    v.add_argument("--seed", type=int, default=1)
    v.set_defaults(fn=cmd_verify)

    r = sub.add_parser("summary", help="recalculer docs/dataset/summary.json")
    r.add_argument("--in", dest="infile", default=str(DEFAULT_OUT))
    r.add_argument("--out", default=str(DEFAULT_SUMMARY))
    r.add_argument("--block", type=int, default=None)
    r.add_argument("--logs-manifest", default=None,
                   help="<init-logs>.manifest.json : fenetre balayee et tranches jamais lues")
    r.add_argument("--pool-census", default=None,
                   help="<pools>.scan.json : lisibles / vides / ILLISIBLES")
    r.set_defaults(fn=cmd_summary)

    k = sub.add_parser("compact", help="dedupliquer et trier le JSONL en place")
    k.add_argument("--in", dest="infile", default=str(DEFAULT_OUT))
    k.set_defaults(fn=cmd_compact)

    p = sub.add_parser("pools", help="lister les pools liquides connus")
    p.add_argument("--pools", default=str(DEFAULT_POOLS))
    p.add_argument("--hook", default=None)
    p.add_argument("--limit", type=int, default=0)
    p.set_defaults(fn=cmd_pools)
    return ap


def main(argv=None) -> int:
    a = build_parser().parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
