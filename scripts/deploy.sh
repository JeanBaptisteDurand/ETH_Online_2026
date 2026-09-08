#!/usr/bin/env bash
# Mettre le service x402 en ligne, sur une machine neuve.
#
#   TARE_DOMAIN=tare.exemple.fr ./scripts/deploy.sh
#
# Prealables sur le serveur : docker, un enregistrement A/AAAA qui pointe sur lui, les
# ports 80 et 443 ouverts (Caddy en a besoin pour le certificat), et un .env rempli.
#
# Le script REFUSE de partir sur une configuration qui produirait un service en apparence
# sain et faux : sans RPC il n'y a pas de fork donc pas de mesure ; sans compte encaisseur
# le peage encaisserait chez quelqu'un d'autre. Mieux vaut ne pas demarrer que servir des
# 402 qui menent nulle part.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[[ -f .env ]] && { set -a; . ./.env; set +a; }

manque=()
[[ -n "${TARE_DOMAIN:-}" ]]      || manque+=("TARE_DOMAIN (le nom de domaine, pour le certificat)")
[[ -n "${BASE_RPC_URL:-}" ]]     || manque+=("BASE_RPC_URL (sans fork, aucune mesure n'est possible)")
[[ -n "${HEDERA_PAY_TO:-}" ]]    || manque+=("HEDERA_PAY_TO (le compte qui encaisse)")
[[ -n "${HEDERA_FEE_PAYER:-}" ]] || manque+=("HEDERA_FEE_PAYER (annonce par le facilitateur)")
if (( ${#manque[@]} )); then
  echo "[deploy] refus de demarrer, il manque :" >&2
  printf '  - %s\n' "${manque[@]}" >&2
  exit 1
fi

# Le trousseau est monte en lecture seule ; s'il est absent le service tombera sur
# l'environnement — et le dira. On le signale ici aussi, pour que ce ne soit pas une
# surprise a la premiere requete payee.
if [[ -f var/keyring.json ]]; then
  echo "[deploy] trousseau Ledger present : la cle de paiement est scellee."
else
  mkdir -p var
  echo "[deploy] ATTENTION : aucun var/keyring.json." >&2
  echo "         La cle viendra de l'environnement, EN CLAIR." >&2
  echo "         Pour la sceller : npx tsx packages/keyring/scripts/ring.ts seal" >&2
fi

echo "[deploy] domaine   $TARE_DOMAIN"
echo "[deploy] reseau    ${HEDERA_NETWORK:-hedera:testnet}"
echo "[deploy] encaisse  $HEDERA_PAY_TO"
echo "[deploy] bloc      ${FORK_BLOCK:-50614000}"

docker compose -f docker-compose.deploy.yml up -d --build

echo "[deploy] attente du fork (le premier demarrage remplit le cache, comptez 1 a 2 min)"
for i in $(seq 1 60); do
  if docker compose -f docker-compose.deploy.yml exec -T api \
       curl -fsS http://127.0.0.1:8787/health 2>/dev/null | grep -q '"ok":true'; then
    echo "[deploy] l'API repond."
    break
  fi
  sleep 5
done

echo
echo "[deploy] verifie le peage depuis l'exterieur — il doit repondre 402 :"
echo "  curl -i -X POST https://$TARE_DOMAIN/measure -H 'content-type: application/json' \\"
echo "    -d '{\"hook\":\"0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc\",\"sizes\":[\"1000000000000\"]}'"
echo
echo "[deploy] puis paie-la vraiment :"
echo "  TARE_API_URL=https://$TARE_DOMAIN/measure npx tsx apps/api/src/pay/cli.ts payer"
