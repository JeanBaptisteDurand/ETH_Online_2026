#!/usr/bin/env bash
# Compile une application Ledger en .elf pour Speculos, avec l'image officielle
# ledger-app-builder. Aucune authentification GitHub requise.
#
#   scripts/ledger/build-app.sh ethereum     -> app Ethereum (garde EIP-712)
#   scripts/ledger/build-app.sh ledger-sync  -> app Ledger Sync (Key Ring / LKRP)
#
# Pourquoi les deux : la garde fait signer un EIP-712 par l'app Ethereum ; le Key Ring
# parle a une AUTRE application, "Ledger Sync" (TRUSTCHAIN_APP_NAME dans
# @ledgerhq/hw-ledger-key-ring-protocol). Un Speculos ne sert qu'une app a la fois.
#
# Sortie : infra/speculos/apps/<nom>.elf   (idempotent ; FORCE=1 pour recompiler)
set -euo pipefail

APP="${1:-ethereum}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT/infra/speculos/apps"
OUT_ELF="$OUT_DIR/$APP.elf"
TARGET="${TARGET:-nanox}"           # nanox | nanosp | flex | stax
BUILDER="ghcr.io/ledgerhq/ledger-app-builder/ledger-app-builder:latest"

case "$APP" in
  ethereum)    REPO="https://github.com/LedgerHQ/app-ethereum";    REF="${APP_REF:-master}" ;;
  ledger-sync) REPO="https://github.com/LedgerHQ/app-ledger-sync"; REF="${APP_REF:-develop}" ;;
  *) echo "[build-app] app inconnue: $APP (attendu: ethereum | ledger-sync)" >&2; exit 1 ;;
esac

CACHE="$ROOT/.cache/ledger-app-$APP"
mkdir -p "$OUT_DIR"

if [[ -f "$OUT_ELF" && "${FORCE:-0}" != "1" ]]; then
  echo "[build-app] $OUT_ELF existe deja — rien a faire (FORCE=1 pour recompiler)."
  exit 0
fi

echo "[build-app] app=$APP target=$TARGET ref=$REF"

if [[ ! -d "$CACHE/.git" ]]; then
  echo "[build-app] clonage de $REPO ..."
  git clone --recurse-submodules --depth 1 --branch "$REF" "$REPO" "$CACHE"
else
  echo "[build-app] clone en cache : $CACHE"
fi

# Le nom de la variable SDK dans l'image : NANOX_SDK, FLEX_SDK, ...
SDK_VAR="$(echo "$TARGET" | tr '[:lower:]' '[:upper:]')_SDK"

echo "[build-app] compilation (BOLOS_SDK=\$$SDK_VAR) ..."
docker run --rm -v "$CACHE:/app" "$BUILDER" bash -lc "
  set -e
  cd /app
  make clean || true
  make -j BOLOS_SDK=\$$SDK_VAR
"

# Le SDK unifie produit build/<target>/bin/app.elf ; l'ancien, bin/app.elf.
PRODUCED=""
for cand in "$CACHE/build/$TARGET/bin/app.elf" "$CACHE/build/bin/app.elf" "$CACHE/bin/app.elf"; do
  [[ -f "$cand" ]] && { PRODUCED="$cand"; break; }
done
if [[ -z "$PRODUCED" ]]; then
  echo "[build-app] ERREUR : app.elf introuvable. Arborescence :" >&2
  find "$CACHE/build" -name 'app.elf' 2>/dev/null >&2 || true
  exit 1
fi

cp "$PRODUCED" "$OUT_ELF"
echo "[build-app] OK -> $OUT_ELF ($(du -h "$OUT_ELF" | cut -f1))"
