#!/usr/bin/env python3
"""Lit /demo/message sur l'entree standard et rend les champs ou du FRANCAIS subsiste.

L'ecran de l'appareil est l'objet que le jury fixe pendant trente secondes, sur un site
entierement en anglais. Ce controle existe parce que le contenu de l'EIP-712 etait francais
au moment de l'audit : « prend 9999.53 bps a ta taille », « en entree », « mesures », « aucun ».

Il ne rend rien quand tout est en anglais, et la liste des champs fautifs sinon.
"""
import json
import re
import sys

MOTS = re.compile(
    r"\b(mesures?|chaine|moteur|en entree|aucun|retard|prend|a ta taille|nulle part|"
    r"ce n'est pas zero|taille|sens)\b",
    re.IGNORECASE,
)

try:
    d = json.load(sys.stdin)
except Exception as e:  # noqa: BLE001
    print("__ILLISIBLE__:" + str(e)[:60])
    raise SystemExit(0)

mauvais = []


def voir(cle, valeur):
    if isinstance(valeur, str) and MOTS.search(valeur):
        mauvais.append(cle)


for cle, valeur in (d.get("message") or {}).items():
    if cle == "swaps":
        for swap in valeur or []:
            for k, v in (swap or {}).items():
                voir("swaps." + k, v)
    else:
        voir(cle, valeur)
voir("texte_signe", d.get("texte_signe", ""))

print(",".join(sorted(set(mauvais))))
