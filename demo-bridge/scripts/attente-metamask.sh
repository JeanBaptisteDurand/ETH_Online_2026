#!/usr/bin/env bash
#
# LA CONDITION REELLE : preparer, PARLER, puis envoyer.
#
# Ce qui a casse une repetition : MetaMask SIMULE la transaction avant de l'afficher, et
# annoncait « This transaction is likely to fail — Custom error: 0x5bf6f916 », soit
# `TransactionDeadlinePassed()`. Nos envois directs passaient parce qu'ils suivaient le
# rembobinage de pres ; devant un jury, on prepare puis on parle.
#
# Ce script reproduit les deux choses que rien ne testait :
#   1. L'ATTENTE. On prepare, on attend (120 s par defaut), puis on envoie.
#   2. LA SIMULATION DE METAMASK. `eth_call` sur la transaction au bloc « pending » — c'est
#      exactement ce que le portefeuille fait avant d'afficher son avertissement.
#
#   scripts/attente-metamask.sh [stop|substitution|queue] [transaction|remplacement] [secondes]
set -uo pipefail
ACTE="${1:-substitution}"
QUOI="${2:-remplacement}"
ATTENTE="${3:-120}"
P="${DEMO_BASE:-http://127.0.0.1:8790}"
R="${DEMO_RPC:-http://127.0.0.1:8546}"
A="${ADRESSE:-0x7d85bF7a82470837A1d832e4fa503a7ebF20ca97}"

rpc() { curl -s -m 30 -X POST -H 'content-type: application/json' --data "$1" "$R"; }
# Les erreurs personnalisees que le jury pourrait voir, decodees par leur selecteur.
nommer() { python3 -c "
import sys
s=sys.argv[1]
connus={'0x5bf6f916':'TransactionDeadlinePassed()','0x8b063d73':'V4TooLittleReceived(uint256,uint256)',
        '0x7a5ed734':'NotEnoughLiquidity()','0xf4b3b1bc':'DeltaNotPositive()','0xbfb22adf':'DeltaNotNegative()'}
for k,v in connus.items():
    if k in s: print('%s = %s' % (k,v)); raise SystemExit
print(s[:120] if s else '(aucune)')" "$1"; }

echo "acte=$ACTE  quoi=$QUOI  attente=${ATTENTE}s  adresse=$A"
curl -s -m 60 -X POST "$P/demo/revenir" >/dev/null
P0="$(curl -s -m 60 -X POST -H 'content-type: application/json' -d "{\"adresse\":\"$A\",\"acte\":\"$ACTE\"}" "$P/demo/preparer")"
CLE="transaction"; [ "$QUOI" = "remplacement" ] && CLE="transaction_remplacement"
read -r TO DATA VAL ECH ECHISO HOR <<< "$(printf '%s' "$P0" | python3 -c "
import json,sys;d=json.load(sys.stdin);t=d['$CLE']
print(t['to'],t['data'],t['value'],d['echeance'],d['echeance_iso'],d['horodatage_chaine'])")"
echo "  echeance inscrite : $ECH ($ECHISO)   horodatage du bloc : $HOR"

simuler() {
  rpc '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"from":"'"$A"'","to":"'"$TO"'","data":"'"$DATA"'","value":"'"$VAL"'"},"'"$1"'"]}' \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
e=d.get('error')
print('REVERT ' + str((e.get('data') or e.get('message') or ''))[:90] if e else 'OK')"
}
echo "  simulation MetaMask, tout de suite (pending) : $(simuler pending)"
echo "  ... on attend ${ATTENTE} s, comme on parlerait devant un jury ..."
sleep "$ATTENTE"
S1="$(simuler pending)"
echo "  simulation MetaMask, apres ${ATTENTE} s        : $S1"
case "$S1" in REVERT*) echo "    -> $(nommer "$S1")";; esac

rpc '{"jsonrpc":"2.0","id":1,"method":"anvil_impersonateAccount","params":["'"$A"'"]}' >/dev/null
H="$(rpc '{"jsonrpc":"2.0","id":1,"method":"eth_sendTransaction","params":[{"from":"'"$A"'","to":"'"$TO"'","data":"'"$DATA"'","value":"'"$VAL"'","gas":"0x7a120"}]}' | python3 -c "import json,sys;print(json.load(sys.stdin).get('result') or '')")"
ST=""; for _ in $(seq 1 40); do
  ST="$(rpc '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["'"$H"'"]}' | python3 -c "
import json,sys;d=json.load(sys.stdin).get('result');print(d.get('status','') if d else '')")"
  [ -n "$ST" ] && break; sleep 0.25
done
rpc '{"jsonrpc":"2.0","id":1,"method":"anvil_stopImpersonatingAccount","params":["'"$A"'"]}' >/dev/null
echo "  ENVOI REEL apres ${ATTENTE} s : status ${ST:-(pas de recu)}"
if [ "$ST" != "0x1" ]; then
  # AUTOPSIE. On rejoue la transaction sur l etat qui vient de la refuser : c est la seule
  # facon d obtenir la raison, un recu en status 0x0 ne la porte pas.
  M="$(simuler latest)"
  echo "    autopsie (eth_call sur l etat d apres) : $M"
  case "$M" in REVERT*) echo "    -> $(nommer "$M")";; esac
  echo "    bloc courant : $(rpc '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' | python3 -c "import json,sys;print(int(json.load(sys.stdin)['result'],16))")"
fi
curl -s -m 60 -X POST "$P/demo/revenir" >/dev/null
if [ "$S1" = "OK" ] && [ "$ST" = "0x1" ]; then echo "  >>> VERT : MetaMask ne predit pas d echec, et l envoi passe."; exit 0; fi
echo "  >>> ROUGE"; exit 1
