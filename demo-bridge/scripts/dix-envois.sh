#!/usr/bin/env bash
#
# DIX ENVOIS CONSECUTIFS, REMBOBINES ENTRE CHAQUE.
#
# Le calldata de l'acte demande est reellement ENVOYE sur le fork, dix fois, avec un
# rembobinage entre chaque : on veut 10/10, pas « ca a l'air mieux ».
#
# Ce que ce script verifie et que `eth_call` ne verifiait PAS : un bloc MINE. Le revert
# `0x8b063d73` = V4TooLittleReceived(uint256,uint256) ne se voyait qu'ici — eth_call passait
# a chaque fois, parce qu'il s'execute a l'horodatage du bloc courant et non dans un bloc
# nouvellement mine dont anvil a avance l'horloge.
#
#   scripts/dix-envois.sh [stop|substitution|queue] [transaction|remplacement] [n]
#
# Le service NE SIGNE RIEN et N'ENVOIE RIEN : c'est ce script qui envoie, en usurpant
# l'adresse sur le fork (anvil_impersonateAccount), exactement comme le ferait le
# portefeuille de l'utilisateur.
set -uo pipefail
ACTE="${1:-substitution}"
QUOI="${2:-remplacement}"
N="${3:-10}"
PONT="${DEMO_BASE:-http://127.0.0.1:8790}"
RPC="${DEMO_RPC:-http://127.0.0.1:8546}"
A="${ADRESSE:-0xDad77910DbDFdE764fC21FCD4E74D71bBACA6D8D}"
USDC=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913

rpc() { curl -s -m 30 -X POST -H 'content-type: application/json' --data "$1" "$RPC"; }
# Un lecteur de JSON minimal, UNE cle, lue sur l'entree standard. La premiere version
# prenait deux arguments et lisait le second : « jq1 result » cherchait alors une cle vide et
# rendait un statut absent sur des transactions parfaitement reussies. Un faux echec est la
# pire chose qu'un script de verification puisse produire.
jq1() { python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: print(''); sys.exit(0)
v=d
for k in sys.argv[1].split('.'):
    v = v.get(k) if isinstance(v,dict) else None
    if v is None: break
print('' if v is None else v)" "$1"; }

echo "cible  : $PONT   acte=$ACTE  quoi=$QUOI  envois=$N"
rpc '{"jsonrpc":"2.0","id":1,"method":"anvil_impersonateAccount","params":["'"$A"'"]}' >/dev/null

OK=0; KO=0
for i in $(seq 1 "$N"); do
  # 1. rembobiner : le fork doit repartir du bloc epingle
  RB="$(curl -s -m 60 -X POST "$PONT/demo/revenir")"
  BLOC="$(printf '%s' "$RB" | jq1 block_number)"
  CONF="$(printf '%s' "$RB" | jq1 conforme)"
  # 2. preparer : credit + calldata (le snapshot de base ne bouge pas)
  P="$(curl -s -m 60 -X POST -H 'content-type: application/json' -d "{\"adresse\":\"$A\",\"acte\":\"$ACTE\"}" "$PONT/demo/preparer")"
  CLE="transaction"; [ "$QUOI" = "remplacement" ] && CLE="transaction_remplacement"
  TO="$(printf '%s' "$P" | python3 -c "import json,sys;d=json.load(sys.stdin);t=d.get('$CLE');print(t['to'] if t else '')")"
  DATA="$(printf '%s' "$P" | python3 -c "import json,sys;d=json.load(sys.stdin);t=d.get('$CLE');print(t['data'] if t else '')")"
  VAL="$(printf '%s' "$P" | python3 -c "import json,sys;d=json.load(sys.stdin);t=d.get('$CLE');print(t['value'] if t else '')")"
  PLANCHER="$(printf '%s' "$P" | jq1 plancher)"
  if [ -z "$DATA" ]; then echo "  $i : ECHEC — le service n'a pas rendu de calldata ($CLE)"; KO=$((KO+1)); continue; fi
  # 3. envoyer POUR DE VRAI, et miner
  H="$(rpc '{"jsonrpc":"2.0","id":1,"method":"eth_sendTransaction","params":[{"from":"'"$A"'","to":"'"$TO"'","data":"'"$DATA"'","value":"'"$VAL"'","gas":"0x7a120"}]}' | jq1 result)"
  if [ -z "$H" ]; then echo "  $i : ECHEC — envoi refuse par le noeud"; KO=$((KO+1)); continue; fi
  # LE RECU N'EST PAS LA TOUT DE SUITE. anvil rend le hash des l'acceptation, et mine juste
  # apres : interroger le recu dans la foulee rendait `null`, et le script comptait un echec
  # sur une transaction parfaitement minee. On attend qu'il existe, brievement.
  R=""; ST=""
  for _ in $(seq 1 40); do
    R="$(rpc '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["'"$H"'"]}')"
    ST="$(printf '%s' "$R" | jq1 result.status)"
    [ -n "$ST" ] && break
    sleep 0.25
  done
  GAS="$(printf '%s' "$R" | python3 -c "import json,sys;d=json.load(sys.stdin).get('result');print(int(d.get('gasUsed','0x0'),16) if d else 0)")"
  BLOCMINE="$(printf '%s' "$R" | python3 -c "import json,sys;d=json.load(sys.stdin).get('result');print(int(d.get('blockNumber','0x0'),16) if d else 0)")"
  NLOG="$(printf '%s' "$R" | python3 -c "import json,sys;d=json.load(sys.stdin).get('result');print(len(d.get('logs',[])) if d else 0)")"
  # 4. le solde USDC a-t-il bouge ?
  BAL="$(rpc '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"'"$USDC"'","data":"0x70a08231000000000000000000000000'"${A#0x}"'"},"latest"]}' | jq1 result)"
  USD=$((16#${BAL#0x}))
  if [ "$CONF" != "True" ] && [ "$CONF" != "true" ]; then
    printf '  %2d : ECHEC  le rembobinage a rendu le bloc %s, pas le bloc epingle\n' "$i" "$BLOC"
    KO=$((KO+1)); continue
  fi
  if [ "$ST" = "0x1" ] && [ "$USD" -gt 0 ]; then
    printf '  %2d : OK     depart %s -> mine en %s · status 0x1 · gas %s · %s logs · USDC recu %s · plancher %s\n' "$i" "$BLOC" "$BLOCMINE" "$GAS" "$NLOG" "$USD" "$PLANCHER"
    OK=$((OK+1))
  else
    TRACE="$(rpc '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"from":"'"$A"'","to":"'"$TO"'","data":"'"$DATA"'","value":"'"$VAL"'"},"latest"]}' | python3 -c "import json,sys;d=json.load(sys.stdin);e=d.get('error') or {};print((e.get('data') or e.get('message') or '')[:80])")"
    printf '  %2d : ECHEC  bloc de depart %s · status %s · gas %s · %s logs · USDC %s · trace %s\n' "$i" "$BLOC" "${ST:-?}" "$GAS" "$NLOG" "$USD" "$TRACE"
    KO=$((KO+1))
  fi
done
rpc '{"jsonrpc":"2.0","id":1,"method":"anvil_stopImpersonatingAccount","params":["'"$A"'"]}' >/dev/null
curl -s -m 60 -X POST "$PONT/demo/revenir" >/dev/null
echo
echo "RESULTAT : $OK reussites / $KO echecs sur $N"
[ "$KO" -eq 0 ] || exit 1
