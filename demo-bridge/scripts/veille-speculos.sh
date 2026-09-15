#!/usr/bin/env bash
#
# LA VEILLE QUI EMPECHE UN REDEMARRAGE NOCTURNE DE CASSER LA DEMO.
#
# « Raw messages » — le reglage sans lequel l'application Ethereum repond 0x6a80 au lieu
# d'afficher les champs de l'EIP-712 — vit en RAM du conteneur Speculos. Un `docker restart`
# le remet a Disabled, en silence, et la demo tomberait le lendemain devant le jury.
#
# Ce script ne sonde RIEN en boucle : il ecoute `docker events` et ne se reveille qu'au
# demarrage du conteneur. Entre deux redemarrages il ne touche pas a l'appareil — un script
# qui appuie sur des boutons toutes les minutes finirait par le faire pendant une signature.
#
# IL NE PILOTE PAS L'APPAREIL LUI-MEME : il demande au pont (127.0.0.1:8790) de le faire, par
# POST /demo/speculos/raw. Un seul code pilote l'appareil, et c'est celui qui sait aussi quand
# NE PAS y toucher (il rend OCCUPE si une signature est en cours). Le script shell ne sert que
# de repli, si le pont ne repond pas du tout.
#
set -uo pipefail
CONTENEUR="${SPECULOS_CONTAINER:-tare-speculos-ethereum}"
SPECULOS="${DEMO_SPECULOS:-http://127.0.0.1:5010}"
PONT="${DEMO_PONT:-http://127.0.0.1:8790}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { echo "[veille-speculos] $*"; }

attendre_speculos() {
  for _ in $(seq 1 60); do
    curl -sf -m 3 "$SPECULOS/events?currentscreenonly=true" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

poser_le_reglage() {
  attendre_speculos || { log "Speculos ne repond pas apres 120 s — abandon pour ce tour"; return 1; }
  sleep 3   # laisser l'application finir de s'ouvrir avant de lire l'ecran
  for essai in 1 2 3; do
    R="$(curl -sf -m 60 -X POST "$PONT/demo/speculos/raw" 2>/dev/null)" || R=""
    case "$R" in
      *'"etat":"ACTIVE"'*|*'"etat":"DEJA_ACTIVE"'*) log "reglage en place ($R)"; return 0;;
      *'"etat":"OCCUPE"'*) log "appareil occupe (signature en cours) — on n'y touche pas, essai $essai"; sleep 20;;
      "") log "le pont ne repond pas (essai $essai)"; sleep 5;;
      *) log "reponse inattendue du pont : $R (essai $essai)"; sleep 5;;
    esac
  done
  # repli : piloter l'appareil directement
  log "repli sur le script shell"
  "$ICI/speculos-raw-messages.sh" && return 0
  log "ECHEC : « Raw messages » n'a pas pu etre pose"
  return 1
}

log "demarrage — conteneur surveille : $CONTENEUR"
poser_le_reglage || true

# `docker events` rend une ligne par demarrage du conteneur. Si le demon docker redemarre,
# la commande sort et systemd relance l'unite (Restart=always) : c'est le filet.
docker events --filter "container=$CONTENEUR" --filter "event=start" --format '{{.Time}}' |
while read -r _ts; do
  log "le conteneur vient de demarrer — on repose le reglage"
  poser_le_reglage || true
done
log "flux docker events termine — systemd relancera l'unite"
