"""Do hooks DECLARE what they charge? The scan behind « 0 of N ».

Uniswap's developer guide asks hooks to announce their take through two events, `HookSwap` and
`HookFee`. The claim that *no* hook emits either is the reason this whole project exists — and
until now it was PROSE. It appeared in `docs/SUBMISSION.md`, in the dossier and in the planning
notes as « 0 of 84 over 24,000 blocks », with no script, no artefact and no way to re-run it.

Worse, the number was stale. That 84 came from the first corpus, when a public RPC could not
serve more than 24,000 blocks. `docs/dataset/init-logs-200k.json` now covers **200,000 blocks**
and carries **1,559 distinct hooks**. Publishing 84 while holding 1,559 on disk understates our
own evidence by a factor of eighteen.

    python3 -m tare.declare                  # the offline half: how many hooks, from the logs
    python3 -m tare.declare --scan            # + eth_getLogs for the two events (paid calls)
    python3 -m tare.declare --scan --write    # + write docs/dataset/declarations.json

THE OFFLINE HALF COSTS NOTHING. The hooks come from Initialize logs already on disk, and the two
topic0 values are computed here from their signatures — never copied, so a typo in a signature
cannot silently scan for the wrong event.

THE SCAN COSTS 20 REQUESTS at 10,000 blocks per chunk. It is not run by the test suite, and the
artefact it writes carries the window, both topics, the chunk size and every range that failed.
A run that could not read a range does NOT publish « zero »: an unread block is not an absence
of events, and `couverture < 1` says so.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from tare.keccak import keccak256
from tare.rpc import call, RpcError

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOGS = os.path.join(RACINE, "docs", "dataset", "init-logs-200k.json")
SORTIE = os.path.join(RACINE, "docs", "dataset", "declarations.json")

# Les signatures telles que le guide Uniswap les donne. Le topic0 est CALCULE : recopie, une
# faute de frappe ferait scanner un evenement qui n'existe pas et rendrait « zero » a coup sur.
SIGNATURES = {
    "HookSwap": "HookSwap(bytes32,address,int128,int128,uint128,uint128)",
    "HookFee": "HookFee(bytes32,address,uint128,uint128)",
}

CHUNK = int(os.environ.get("TARE_DECLARE_CHUNK", "10000"))


def topic0(signature: str) -> str:
    return "0x" + keccak256(signature.encode()).hex()


def hooks_des_logs(chemin: str):
    """Les hooks distincts vus dans les Initialize deja collectes, et la fenetre couverte.

    `hooks` est le TROISIEME mot non indexe de l'evenement :
        Initialize(bytes32 indexed id, address indexed c0, address indexed c1,
                   uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)
    donc data = [fee, tickSpacing, hooks, sqrtPriceX96, tick] et hooks est a l'offset 2.
    """
    with open(chemin) as f:
        evenements = json.load(f)
    manifeste_p = chemin + ".manifest.json"
    manifeste = {}
    if os.path.exists(manifeste_p):
        with open(manifeste_p) as f:
            manifeste = json.load(f)

    hooks, illisibles = set(), 0
    for e in evenements:
        data = (e.get("data") or "0x")[2:]
        if len(data) < 3 * 64:
            illisibles += 1
            continue
        mot = data[2 * 64 : 3 * 64]
        hooks.add("0x" + mot[-40:].lower())
    # L'adresse nulle n'est pas un hook : c'est un pool SANS hook.
    hooks.discard("0x" + "0" * 40)
    return {
        "fichier": os.path.relpath(chemin, RACINE),
        "n_evenements": len(evenements),
        "n_illisibles": illisibles,
        "hooks": sorted(hooks),
        "n_hooks": len(hooks),
        "bloc_debut": manifeste.get("start_block"),
        "bloc_fin": manifeste.get("end_block"),
        "span_blocs": manifeste.get("span_blocks"),
        "couverture_des_logs": manifeste.get("coverage"),
        "rejeu_des_logs": manifeste.get("replay"),
    }


def scanner(rpc: str, topic: str, debut: int, fin: int, chunk: int = CHUNK):
    """Tous les logs portant ce topic0, sur toute la fenetre. Une tranche non lue est DITE."""
    emetteurs, n, echecs = {}, 0, []
    a = debut
    while a <= fin:
        b = min(a + chunk - 1, fin)
        try:
            logs = call(
                rpc,
                "eth_getLogs",
                [{"fromBlock": hex(a), "toBlock": hex(b), "topics": [topic]}],
            )
        except RpcError as e:
            # On n'avale pas : une tranche non lue n'est pas une tranche sans evenement.
            echecs.append({"de": a, "a": b, "erreur": str(e)[:160]})
            a = b + 1
            continue
        for l in logs or []:
            adr = (l.get("address") or "").lower()
            emetteurs.setdefault(adr, 0)
            emetteurs[adr] += 1
            n += 1
        a = b + 1
    blocs_lus = (fin - debut + 1) - sum(x["a"] - x["de"] + 1 for x in echecs)
    return {
        "topic0": topic,
        "n_logs": n,
        "emetteurs": dict(sorted(emetteurs.items())),
        "n_emetteurs": len(emetteurs),
        "tranches_en_echec": echecs,
        "couverture": round(blocs_lus / (fin - debut + 1), 6),
    }


def main() -> int:
    scan = "--scan" in sys.argv
    ecrire = "--write" in sys.argv

    topics = {nom: topic0(sig) for nom, sig in SIGNATURES.items()}
    print("les deux topic0, calcules depuis leur signature :")
    for nom, sig in SIGNATURES.items():
        print(f"  {nom:9} {topics[nom]}  {sig}")

    if not os.path.exists(LOGS):
        print(f"\n{os.path.relpath(LOGS, RACINE)} absent — relance la collecte :", file=sys.stderr)
        print("  python3 -m tare.collect 50614000 200000 docs/dataset/init-logs-200k.json", file=sys.stderr)
        return 1

    d = hooks_des_logs(LOGS)
    print(
        f"\nInitialize deja collectes : {d['n_evenements']} evenements sur "
        f"{d['span_blocs']} blocs ({d['bloc_debut']} -> {d['bloc_fin']}), "
        f"couverture {d['couverture_des_logs']}"
    )
    print(f"hooks distincts           : {d['n_hooks']}")
    if d["n_illisibles"]:
        print(f"evenements illisibles     : {d['n_illisibles']} (comptes, jamais avales)")

    releve = {
        "schema": "tare-declarations/1",
        "quoi": (
            "Les hooks emettent-ils HookSwap ou HookFee, les deux evenements par lesquels le "
            "guide Uniswap leur demande de declarer ce qu'ils prelevent ?"
        ),
        "signatures": SIGNATURES,
        "topics": topics,
        "initialize": {k: v for k, v in d.items() if k != "hooks"},
        "hooks": d["hooks"],
        "scan": None,
        "conclusion": None,
        "rejeu": "python3 -m tare.declare --scan --write",
    }

    if not scan:
        print(
            "\nLa moitie hors ligne s'arrete ici, et elle n'a coute AUCUNE requete.\n"
            "Pour la seconde moitie — les deux eth_getLogs sur la meme fenetre, "
            f"{(d['span_blocs'] or 0) // CHUNK * 2} requetes environ :\n"
            "  python3 -m tare.declare --scan --write"
        )
        return 0

    rpc = os.environ.get("RPC") or os.environ.get("TARE_UPSTREAM_RPC") or ""
    if not rpc:
        print("\nRPC= manquant : le scan a besoin d'un noeud d'archive.", file=sys.stderr)
        return 1
    debut, fin = d["bloc_debut"], d["bloc_fin"]
    if debut is None or fin is None:
        print("\nle manifeste des logs ne porte pas la fenetre : rien a scanner", file=sys.stderr)
        return 1

    scans, tous_emetteurs, couverture_min = {}, set(), 1.0
    for nom, t in topics.items():
        print(f"\nscan {nom} sur [{debut}, {fin}] par tranches de {CHUNK}…")
        s = scanner(rpc, t, debut, fin)
        scans[nom] = s
        tous_emetteurs |= set(s["emetteurs"])
        couverture_min = min(couverture_min, s["couverture"])
        print(
            f"  {s['n_logs']} log(s), {s['n_emetteurs']} emetteur(s) distinct(s), "
            f"couverture {s['couverture']}"
        )
        for e in s["tranches_en_echec"][:3]:
            print(f"  NON LU [{e['de']}, {e['a']}] : {e['erreur'][:90]}")

    hooks = set(d["hooks"])
    qui_declare = sorted(hooks & tous_emetteurs)
    releve["scan"] = {
        "par_evenement": scans,
        "n_emetteurs_tous_contrats": len(tous_emetteurs),
        "emetteurs_tous_contrats": sorted(tous_emetteurs),
        "couverture_min": couverture_min,
    }

    # UN ZERO N'EST PUBLIABLE QUE SI TOUTE LA FENETRE A ETE LUE. Un bloc non lu n'est pas un
    # bloc sans evenement : c'est exactement la distinction que le corpus fait entre
    # NON_MESURABLE et 0,00 bps, et elle vaut ici aussi.
    if couverture_min < 1.0:
        releve["conclusion"] = {
            "publiable": False,
            "raison": (
                f"couverture {couverture_min} < 1 : des tranches n'ont pas repondu. Un bloc non lu "
                "n'est pas un bloc sans evenement, donc « zero » n'est pas affirmable"
            ),
        }
        print(f"\nNON PUBLIABLE : couverture {couverture_min}. Rejoue les tranches en echec.")
    else:
        releve["conclusion"] = {
            "publiable": True,
            "n_hooks": len(hooks),
            "n_hooks_qui_declarent": len(qui_declare),
            "hooks_qui_declarent": qui_declare,
            "phrase": (
                f"Sur les {len(hooks)} hooks distincts vus dans les {d['n_evenements']} evenements "
                f"Initialize des blocs {debut} a {fin}, {len(qui_declare)} emet HookSwap ou HookFee. "
                f"Dans la meme fenetre, {len(tous_emetteurs)} contrat(s) au total en emet(tent) un."
            ),
        }
        print(f"\n{releve['conclusion']['phrase']}")
        if qui_declare:
            for h in qui_declare:
                print(f"  declare : {h}")

    if ecrire:
        with open(SORTIE, "w") as f:
            json.dump(releve, f, indent=2)
            f.write("\n")
        print(f"\necrit : {os.path.relpath(SORTIE, RACINE)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
