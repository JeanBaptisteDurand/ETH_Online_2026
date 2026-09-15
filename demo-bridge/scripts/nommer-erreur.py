#!/usr/bin/env python3
"""Lit une reponse eth_call et nomme l'erreur, au lieu de rendre un selecteur nu.

Un jury ne lit pas « 0x5bf6f916 ». Un presentateur non plus, et c'est ce selecteur-la qui a
casse une repetition : MetaMask affichait « Custom error: 0x5bf6f916 » sans dire que c'etait
l'echeance du swap. Les quatre premiers octets sont keccak256 de la signature de l'erreur ;
les traduire n'est pas du confort, c'est la difference entre un diagnostic et un mystere.
"""
import json
import sys

CONNUES = {
    "0x5bf6f916": "TransactionDeadlinePassed() — l'echeance du swap est depassee",
    "0x8b063d73": "V4TooLittleReceived(uint256,uint256) — le plancher de sortie n'est pas atteint",
    "0x7a5ed734": "NotEnoughLiquidity() — le pool ne peut pas servir ce swap",
    "0xf4b3b1bc": "DeltaNotPositive()",
    "0xbfb22adf": "DeltaNotNegative()",
    "0x675cae38": "InvalidEthSender()",
}

try:
    d = json.load(sys.stdin)
except Exception as e:  # noqa: BLE001
    print("reponse illisible du noeud : " + str(e)[:80])
    raise SystemExit(0)

err = d.get("error")
if not err:
    print("OK")
    raise SystemExit(0)

brut = str(err.get("data") or err.get("message") or "")
for selecteur, nom in CONNUES.items():
    if selecteur in brut:
        print("REVERT %s = %s" % (selecteur, nom))
        raise SystemExit(0)
print("REVERT " + brut[:120])
