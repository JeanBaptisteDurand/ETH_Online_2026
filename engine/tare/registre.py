"""Le registre officiel voit-il ce qu'on mesure ? Le compte, et la liste.

Le registre Uniswap decrit des hooks sans les quantifier — c'est le premier fait de ce
projet. Le second est moins connu et plus dur : **il n'en voit meme pas la plupart.** Sur les
112 hooks du corpus, 78 en sont absents.

Ce chiffre etait publie de trois facons contradictoires. La landing portait UNE adresse
ecrite a la main sous la phrase « one hook is not in the official registry at all » ;
docs/LIMITS.md annoncait « two of the 12 hooks », d'un corpus de 128 mesures ; le dossier, lui,
avait 70 % — et c'est lui qui avait raison.

    python3 -m tare.registre            affiche le compte
    python3 -m tare.registre --write    ecrit docs/dataset/registre-couverture.json

POURQUOI UN FICHIER COMMITE ET PAS UN CALCUL DANS LA PAGE. La landing recalcule ce compte a
chaque construction, et c'est bien ; mais son `facts.json` est gitignore — un artefact de
build. Le README citait ce fichier pour les 78 adresses : sur un clone frais, la citation ne
menait nulle part. Une citation qui ne resout pas est pire qu'aucune citation.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MESURES = os.path.join(RACINE, "docs", "dataset", "measurements.jsonl")
REGISTRE = os.path.join(RACINE, "docs", "hooklist-live-20260905.json")
SORTIE = os.path.join(RACINE, "docs", "dataset", "registre-couverture.json")


def lire_registre(chemin: str):
    brut = json.load(open(chemin))
    lignes = brut if isinstance(brut, list) else brut.get("hooks", [])
    adresses, par_adresse = [], {}
    for e in lignes:
        a = ((e.get("hook") or {}).get("address") or "").lower()
        if not a:
            continue
        adresses.append(a)
        par_adresse.setdefault(a, []).append((e.get("hook") or {}).get("chainId"))
    return lignes, adresses, par_adresse


def hooks_mesures(chemin: str):
    vus, rejetees = set(), 0
    for l in open(chemin):
        l = l.strip()
        if not l:
            continue
        try:
            vus.add(json.loads(l)["hook"].lower())
        except Exception:
            rejetees += 1
    return sorted(vus), rejetees


def releve():
    lignes, adresses, par_adresse = lire_registre(REGISTRE)
    listees = set(adresses)
    mesures, rejetees = hooks_mesures(MESURES)
    absents = [h for h in mesures if h not in listees]
    # Une adresse declaree sur plusieurs chaines compte une fois comme adresse et n fois
    # comme entree. Publier « 978 hooks » confond les deux ; on rend les deux nombres.
    multi = {a: c for a, c in par_adresse.items() if len(c) > 1}
    return {
        "schema": "tare-registre-couverture/1",
        "quoi": (
            "Le registre officiel des hooks voit-il les hooks qu'on a mesures ? Le compte est "
            "derive des deux fichiers, jamais ecrit a la main."
        ),
        "registre": {
            "fichier": os.path.relpath(REGISTRE, RACINE),
            "entrees": len(lignes),
            "adresses_distinctes": len(listees),
            "adresses_sur_plusieurs_chaines": len(multi),
            "chaines_max_pour_une_adresse": max((len(c) for c in par_adresse.values()), default=0),
        },
        "corpus": {
            "fichier": os.path.relpath(MESURES, RACINE),
            "hooks_mesures": len(mesures),
            "lignes_rejetees": rejetees,
        },
        "couverture": {
            "listes": len(mesures) - len(absents),
            "absents": len(absents),
            "part_absente_pct": round(len(absents) / len(mesures) * 100, 2) if mesures else None,
        },
        "absents": absents,
        "rejeu": "python3 -m tare.registre --write",
    }


def main() -> int:
    if not os.path.exists(REGISTRE):
        print(f"{os.path.relpath(REGISTRE, RACINE)} absent", file=sys.stderr)
        return 1
    r = releve()
    c, g, m = r["couverture"], r["registre"], r["corpus"]
    print(f"registre  {g['entrees']} entrees, {g['adresses_distinctes']} adresses distinctes")
    print(f"          {g['adresses_sur_plusieurs_chaines']} adresses declarees sur plusieurs chaines "
          f"(jusqu'a {g['chaines_max_pour_une_adresse']})")
    print(f"corpus    {m['hooks_mesures']} hooks mesures")
    print(f"couverture {c['listes']} listes, {c['absents']} ABSENTS — {c['part_absente_pct']} %")
    if "--write" in sys.argv:
        with open(SORTIE, "w") as f:
            json.dump(r, f, indent=1)
            f.write("\n")
        print(f"\necrit : {os.path.relpath(SORTIE, RACINE)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
