#!/usr/bin/env bash
# Active « Raw messages » dans l'application Ethereum de Speculos, et repose l'appareil.
#
# C'EST LE REGLAGE QUI DECIDE DE TOUT. Sans lui l'appareil repond 0x6a80 et affiche
# « Blind signing must be enabled », un message trompeur : ce n'est PAS la signature
# aveugle qu'il faut activer (elle ferait signer un hachage, sans aucun champ), c'est
# le rendu BRUT des EIP-712. Voir EIP712.md a la racine du depot.
#
# A REJOUER APRES CHAQUE REDEMARRAGE DU CONTENEUR SPECULOS : le reglage vit en RAM.
#
#   ssh root@92.112.193.140 /root/tare-demo-bridge/scripts/speculos-raw-messages.sh
set -euo pipefail
S="${DEMO_SPECULOS:-http://127.0.0.1:5010}"

lire() {
  curl -s -m 5 "$S/events?currentscreenonly=true" \
    | python3 -c "import json,sys;print(' '.join(e.get('text','') for e in json.load(sys.stdin).get('events',[])))"
}
appui() { curl -s -m 5 -X POST "$S/button/$1" -d '{"action":"press-and-release"}' >/dev/null; sleep 0.4; }

echo "[raw] ecran : $(lire)"

# 1. trouver « Raw messages ». On ne confirme QUE sur lui : appuyer « au cas ou » sur un
#    libelle non reconnu, c'est basculer un autre reglage sans le savoir.
trouve=0
for _ in $(seq 1 24); do
  E="$(lire)"
  if [[ "$E" == *"Raw messages"* ]]; then
    trouve=1
    if [[ "$E" == *Disabled* ]]; then appui both; sleep 0.5; fi
    break
  fi
  # « App settings » est une PORTE, pas un reglage : on y entre par un appui double.
  # « Quit app » est le dernier element du carrousel : a droite on n'en sort plus, et un
  #  appui double y FERME l'application. On revient donc a gauche.
  if [[ "$E" == *"App settings"* ]]; then appui both
  elif [[ "$E" == *"Quit app"* || "$E" == *"App info"* ]]; then appui left
  else appui right
  fi
done
[[ $trouve -eq 1 ]] || { echo "[raw] ECHEC : « Raw messages » introuvable — l'appareil n'est pas dans les reglages" >&2; exit 1; }

E="$(lire)"
echo "[raw] $E"
[[ "$E" == *Enabled* ]] || { echo "[raw] ECHEC : le reglage n'est pas active" >&2; exit 1; }

# 2. reposer l'appareil sur « Ethereum app is ready ». Un APDU qui arrive pendant que
#    l'appareil est dans ses reglages tombe sur un etat imprevu et casse le flux
#    (« stream has been aborted »).
#    L'ordre du carrousel des reglages a ete releve a l'ecran, pas suppose :
#      Blind signing, Nonce, Raw messages, Debug contracts, Smart accounts,
#      Transaction hash, Back
#    « Back » est donc a DROITE, et il se prend par un appui double. Le menu principal,
#    lui, est : Ethereum app is ready, App settings, App info, Quit app — on y revient
#    a GAUCHE, jamais a droite : « Quit app » est un cul-de-sac qui ferme l'application.
for _ in $(seq 1 12); do
  E="$(lire)"
  [[ "$E" == "Back" ]] && { appui both; break; }
  [[ "$E" == *"app is ready"* || "$E" == *"App settings"* ]] && break
  appui right
done
for _ in $(seq 1 12); do
  E="$(lire)"
  [[ "$E" == *"app is ready"* ]] && break
  appui left
done
E="$(lire)"
echo "[raw] repos : $E"
[[ "$E" == *"app is ready"* ]] || { echo "[raw] ECHEC : l'appareil n'est pas revenu au repos" >&2; exit 1; }
