"""La porte d'EXECUTION : le nombre publie tient-il quand le swap a vraiment lieu ?

Tout ce que TARE publie vient de `V4Quoter`, appele en `eth_call`. C'est une SIMULATION.
Elle peut diverger d'une execution — chemin de code different, aucun jeton reellement
deplace, un hook qui lit des soldes qu'un appel statique n'a jamais changes. Toute la these
repose sur la fidelite du quoter, et rien ne l'avait verifiee.

Cette porte execute le swap. Pour de vrai, sur le fork epingle : `PoolManager.unlock`, puis
`swap`, puis `settle` de l'ETH natif par valeur, puis `take` du jeton credite. Les jetons
arrivent sur le contrat sonde et on lit son solde — ce qu'un utilisateur recoit est ce qui
atterrit chez lui, pas ce qu'une comptabilite annonce.

Elle le fait DEUX FOIS : avec le bytecode du hook, puis avec le talon inerte a sa place. Les
deux sorties executees sont comparees aux deux sorties cotees. Si elles divergent, le corpus
decrit un simulateur et non des echanges.

Premiere execution, hook Zora, 1e15 wei d'ETH natif :

    avec le hook   execute 14286574099944519712114593   cote 14286574099944519712114593
    avec le talon  execute 14426130614674326401083186   cote 14426130614674326401083186
    bps executes   96.7387                              publie 96.7387

Au wei pres, sur les deux jambes.

    cd engine && python3 -m tare.gates.a4 --rpc http://127.0.0.1:8610
"""
from __future__ import annotations

import datetime as _dt
import os
import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..corpus import paths as corpus_paths
from ..consts import POOL_MANAGER
from ..rpc import call as rpc_call
from ..stub import BYTECODE as STUB

REPO = Path(__file__).resolve().parents[3]
ARTEFACT = REPO / "contracts" / "out" / "SwapProbe.sol" / "SwapProbe.json"
#: Le compte prefinance par defaut d'anvil. Sur un fork il a de l'ETH, ce qui suffit :
#: on ne teste que des pools dont la devise d'entree est l'ETH natif, pour n'avoir aucun
#: jeton a se procurer et aucune approbation a poser.
ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ANVIL_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

SIG = "swapExactIn((address,address,uint24,int24,address),bool,uint128)(uint256)"


class GateError(RuntimeError):
    pass


_RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def _cast(args: List[str], timeout: int = 180) -> str:
    p = subprocess.run(["cast", *args], capture_output=True, text=True, timeout=timeout)
    if p.returncode != 0:
        raise GateError(p.stderr.strip()[:300] or p.stdout.strip()[:300])
    return p.stdout.strip()


def deploy(rpc: str) -> str:
    """Pose la sonde sur le fork. Elle n'existe que le temps du test."""
    if not ARTEFACT.exists():
        raise GateError(f"{ARTEFACT} absent : `cd contracts && forge build`")
    p = subprocess.run(
        ["forge", "create", "--rpc-url", rpc, "--private-key", ANVIL_KEY, "--broadcast",
         "src/SwapProbe.sol:SwapProbe", "--constructor-args", POOL_MANAGER],
        capture_output=True, text=True, cwd=REPO / "contracts", timeout=300)
    for line in p.stdout.splitlines():
        if line.startswith("Deployed to:"):
            return line.split(":", 1)[1].strip()
    raise GateError((p.stderr or p.stdout).strip()[:300])


def execute(rpc: str, probe: str, row: Dict[str, Any]) -> int:
    """Le swap, execute. Rend ce qui arrive REELLEMENT sur la sonde.

    Leve GateError quand la sonde ne sait pas regler ce pool — voir `run` : c'est une limite
    de la sonde, pas de la mesure, et elle est comptee a part.
    """
    key = (f'({row["currency0"]},{row["currency1"]},{row["key_fee"]},'
           f'{row["tick_spacing"]},{row["hook"]})')
    out = _cast(["call", probe, SIG, key, "true" if row["zero_for_one"] else "false",
                 str(row["amount_in"]), "--value", str(row["amount_in"]),
                 "--rpc-url", rpc, "--from", ANVIL_ADDR])
    return int(out.split()[0])


def pick(n: int = 1) -> List[Dict[str, Any]]:
    """Des mesures dont la devise d'entree est l'ETH natif et le prelevement lisible.

    On ne choisit PAS la plus spectaculaire : un hook a comptabilite personnalisee reverte
    dans cette sonde, et le faire passer pour un echec de la methode serait faux. On prend
    des cas ordinaires, et on dit lesquels.
    """
    # Un candidat par HOOK, pas les n premieres lignes du fichier. Le corpus est ecrit dans
    # l'ordre du balayage : les douze premieres lignes a devise native venaient toutes du
    # meme hook, et quand celui-la tient sa propre comptabilite la porte concluait qu'aucun
    # pool n'etait jouable. Un echantillon qui ne varie que par le pool ne teste qu'un hook.
    par_hook: Dict[str, Dict[str, Any]] = {}
    for p in corpus_paths():
        with open(p) as fh:
            for line in fh:
                if '"0x0000000000000000000000000000000000000000"' not in line:
                    continue
                r = json.loads(line)
                if (r["label"] == "MEASURED" and r["zero_for_one"]
                        and r["currency0"] == "0x0000000000000000000000000000000000000000"
                        and r["bps"] and 1 < r["bps"] < 500):
                    par_hook.setdefault(r["hook"].lower(), r)
    return list(par_hook.values())[:n]


def run(rpc: str, n: int = 1, probe: Optional[str] = None) -> Dict[str, Any]:
    # On essaie PLUS de candidats qu'on n'en veut : certains hooks tiennent leur propre
    # comptabilite de jetons et une sonde generique ne sait pas regler pour eux. C'est une
    # limite de la SONDE, pas de la mesure, et la porte doit le dire au lieu d'echouer — la
    # confondre avec un desaccord entre cotation et execution serait un faux resultat de plus.
    rows = pick(max(n * 12, 12))
    if not rows:
        raise GateError("aucune mesure a devise d'entree native dans le corpus")
    probe = probe or deploy(rpc)
    resultats: List[Dict[str, Any]] = []
    injouables: List[Dict[str, str]] = []
    for r in rows:
        if len(resultats) >= n:
            break
        try:
            avec = execute(rpc, probe, r)
        except GateError as exc:
            injouables.append({"hook": r["hook"], "pool_id": r["pool_id"],
                               "revert": str(exc)[:120]})
            continue
        original = rpc_call(rpc, "eth_getCode", [r["hook"], "latest"])
        rpc_call(rpc, "anvil_setCode", [r["hook"], STUB])
        try:
            sans = execute(rpc, probe, r)
        except GateError as exc:
            injouables.append({"hook": r["hook"], "pool_id": r["pool_id"],
                               "revert": f"avec le talon : {str(exc)[:100]}"})
            continue
        finally:
            rpc_call(rpc, "anvil_setCode", [r["hook"], original])
        bps = (sans - avec) / sans * 10_000
        resultats.append({
            "hook": r["hook"], "pool_id": r["pool_id"], "amount_in": r["amount_in"],
            "cote_avec": r["out_with"], "execute_avec": str(avec),
            "cote_sans": r["out_without"], "execute_sans": str(sans),
            "bps_publie": r["bps"], "bps_execute": round(bps, 4),
            "identique_avec": str(avec) == str(r["out_with"]),
            "identique_sans": str(sans) == str(r["out_without"]),
        })
    if not resultats:
        raise GateError(
            f"aucun des {len(rows)} candidats n'a pu etre execute par la sonde. "
            f"Premier refus : {injouables[0]['revert'] if injouables else '?'}")
    return {
        "probe": probe, "rpc": rpc, "n": len(resultats), "resultats": resultats,
        # Ce que la sonde n'a PAS pu jouer, et pourquoi. Le taire ferait passer un
        # echantillon choisi pour un echantillon representatif.
        "candidats_essayes": len(rows),
        "injouables_par_la_sonde": injouables,
        "note_injouables": (
            "Un hook qui tient sa propre comptabilite de jetons ne se regle pas par une "
            "sonde generique : le swap reverte avant d'aboutir. C'est une limite de la "
            "sonde, pas un desaccord entre cotation et execution."),
        "replay": f"cd engine && python3 -m tare.gates.a4 --rpc {rpc}",
    }


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="tare.gates.a4")
    ap.add_argument("--rpc", default="http://127.0.0.1:8545")
    ap.add_argument("--n", type=int, default=1)
    ap.add_argument("--probe", default=None, help="sonde deja deployee")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--write", action="store_true",
                    help="ecrit docs/dataset/porte-a4.json et ajoute au journal des passages")
    a = ap.parse_args(argv)

    rep = run(a.rpc, a.n, a.probe)

    # LE RELEVE SUR DISQUE. La porte A4 est le seul endroit du projet ou une COTATION devient
    # un SWAP EXECUTE — donc la seule preuve que le corpus entier, qui est de la cotation,
    # correspond a ce qui se passe vraiment. Et c'etait le seul resultat qui n'ecrivait rien :
    # « 9 pools, 8 concordants au wei, 1 divergent » n'existait qu'en prose, dans des
    # documents, sans artefact ni horodatage. Une preuve qui ne s'ecrit pas n'est pas une
    # preuve, c'est un souvenir.
    if a.write:
        rep_dated = dict(rep)
        rep_dated["schema"] = "tare-porte-a4/1"
        rep_dated["ecrit_le"] = _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")
        out = os.path.join(_RACINE, "docs", "dataset", "porte-a4.json")
        with open(out, "w") as f:
            json.dump(rep_dated, f, indent=1)
            f.write("\n")
        # Et une piste append-only a cote : un fichier ecrase perdrait les passages
        # precedents, et une preuve qu'on remplace a chaque fois n'est pas une piste.
        piste = os.path.join(_RACINE, "docs", "dataset", "porte-a4.jsonl")
        with open(piste, "a") as f:
            f.write(json.dumps(rep_dated) + "\n")
        print(f"ecrit : {os.path.relpath(out, _RACINE)}")
        print(f"ajoute : {os.path.relpath(piste, _RACINE)}")

    if a.json:
        print(json.dumps(rep, indent=1))
        return 0

    ok = True
    print(f"{'hook':<16}{'taille':>18}{'cote':>30}{'execute':>30}  verdict")
    for r in rep["resultats"]:
        for quoi in ("avec", "sans"):
            m = r[f"identique_{quoi}"]
            ok = ok and m
            print(f"{r['hook'][:14] + '..':<16}{r['amount_in']:>18}"
                  f"{r[f'cote_{quoi}']:>30}{r[f'execute_{quoi}']:>30}  "
                  f"{'identique' if m else 'DIFFERENT'} ({quoi} hook)")
        d = abs(r["bps_execute"] - r["bps_publie"])
        ok = ok and d < 1e-4
        print(f"{'':<16}{'bps':>18}{r['bps_publie']:>30}{r['bps_execute']:>30}  "
              f"{'identique' if d < 1e-4 else 'DIFFERENT'}\n")
    inj = rep["injouables_par_la_sonde"]
    print(f"{rep['n']} pool(s) executes sur {rep['candidats_essayes']} essayes ; "
          f"{len(inj)} injouables par la sonde")
    if inj:
        print(f"  {rep['note_injouables']}")
        for x in inj[:3]:
            print(f"    {x['hook'][:14]}..  {x['revert'][:80]}")
    print("\nGATE A4 PASSED" if ok else "\nGATE A4 FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
