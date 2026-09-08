#!/usr/bin/env bash
# Lance Speculos — l'emulateur officiel de Ledger — servant une application compilee.
#
#   scripts/ledger/run-speculos.sh ethereum      # garde EIP-712, port 5010
#   scripts/ledger/run-speculos.sh ledger-sync   # Key Ring / LKRP, port 5011
#
# L'API HTTP expose a la fois le transport APDU (@ledgerhq/hw-transport-node-speculos-http)
# et l'ecran (/events, /screenshot), donc ce que l'appareil AFFICHE est lisible par un test :
# c'est ce qui a produit docs/ledger/ECRANS.md.
#
# La graine est celle de test par defaut de Speculos, sauf si SPECULOS_SEED est fournie.
# Ne mets JAMAIS une graine reelle ici.
set -euo pipefail

APP="${1:-ethereum}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APPS_DIR="$ROOT/infra/speculos/apps"
ELF="$APPS_DIR/$APP.elf"
MODEL="${MODEL:-nanox}"
IMAGE="${SPECULOS_IMAGE:-ghcr.io/ledgerhq/speculos:latest}"

case "$APP" in
  ethereum)    DEFAULT_PORT=5010 ;;
  ledger-sync) DEFAULT_PORT=5011 ;;
  *)           DEFAULT_PORT=5000 ;;
esac
API_PORT="${API_PORT:-$DEFAULT_PORT}"
NAME="${SPECULOS_CONTAINER:-tare-speculos-$APP}"

if [[ ! -f "$ELF" ]]; then
  echo "[run-speculos] $ELF absent — lance d'abord : scripts/ledger/build-app.sh $APP" >&2
  exit 1
fi

# `set -u` + un tableau vide = "unbound variable" sur le bash 3.2 de macOS :
# on ne developpe le tableau que s'il a un element.
SEED_ARGS=()
[[ -n "${SPECULOS_SEED:-}" ]] && SEED_ARGS=(--seed "$SPECULOS_SEED")

docker rm -f "$NAME" >/dev/null 2>&1 || true
echo "[run-speculos] app=$APP model=$MODEL api=http://127.0.0.1:$API_PORT nom=$NAME"
exec docker run --rm --name "$NAME" \
  -p "$API_PORT:5000" \
  -v "$APPS_DIR:/apps" \
  "$IMAGE" \
  --model "$MODEL" --display headless --api-port 5000 \
  ${SEED_ARGS[@]+"${SEED_ARGS[@]}"} \
  "/apps/$APP.elf"
