#!/usr/bin/env bash
# Installe les dependances de chaque paquet du depot.
#
# Il n'y a pas de racine npm avec des workspaces : chaque application et chaque paquet a son
# propre package.json et son propre verrou. Sur un clone frais, scripts/test-all.sh annonce
# donc « 428/428 — INCOMPLET, 6 suite(s) non executee(s) » et non les 960 attendus. Il ne
# ment pas — il DIT que six suites ne tournent pas — mais personne ne peut savoir que la
# seule chose qui manque est un `npm install`.
#
#   bash scripts/install-all.sh && bash scripts/test-all.sh
#
# `npm ci` quand un verrou existe, parce qu'un verrou sert a installer exactement ce qui a
# ete teste ; `npm install` sinon. Une installation qui echoue s'annonce et n'est pas
# comptee comme faite : c'est la meme regle que partout ailleurs ici.
set -uo pipefail
cd "$(dirname "$0")/.."

PAQUETS=(apps/api apps/mcp apps/web apps/landing packages/guard packages/hookflags packages/keyring)

ok=(); rate=()
for p in "${PAQUETS[@]}"; do
  [ -f "$p/package.json" ] || { echo "  ABSENT   $p"; continue; }
  printf "  %-24s " "$p"
  if [ -f "$p/package-lock.json" ]; then cmd="npm ci"; else cmd="npm install"; fi
  if (cd "$p" && $cmd --silent >/dev/null 2>&1); then
    echo "ok ($cmd)"; ok+=("$p")
  else
    echo "ECHEC ($cmd)"; rate+=("$p")
  fi
done

echo "  ----------------------------------------"
printf "  %d installes" "${#ok[@]}"
if [ ${#rate[@]} -gt 0 ]; then
  printf ", %d EN ECHEC : %s\n" "${#rate[@]}" "${rate[*]}"
  echo "  Relance a la main dans le dossier fautif pour voir la raison."
  exit 1
fi
echo
echo "  Ensuite : bash scripts/test-all.sh"
