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
# La base porte les comptes, les cles d'API et l'historique. Un mot de passe absent
# ferait demarrer Postgres avec celui de developpement — sur une machine publique.
[[ -n "${TARE_DB_PASSWORD:-}" ]] || manque+=("TARE_DB_PASSWORD (les 9 routes du compte en dependent ; ne deploie pas avec le mot de passe de dev)")
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
# LE SCRIPT NE DOIT PAS ANNONCER LA SUITE SI L'API N'A JAMAIS REPONDU. Il le faisait :
# la boucle sortait au bout de cinq minutes et le mode d'emploi s'affichait comme si tout
# allait bien. On sort en erreur, avec de quoi chercher.
repond=0
for _ in $(seq 1 60); do
  if docker compose -f docker-compose.deploy.yml exec -T api \
       curl -fsS http://127.0.0.1:8787/health 2>/dev/null | grep -q '"ok":true'; then
    repond=1
    echo "[deploy] l'API repond."
    break
  fi
  sleep 5
done

if (( ! repond )); then
  echo >&2
  echo "[deploy] ECHEC : l'API n'a pas repondu en 5 minutes. Rien n'est en ligne." >&2
  echo "         Etat des conteneurs :" >&2
  docker compose -f docker-compose.deploy.yml ps >&2 || true
  echo >&2
  echo "         Les 40 dernieres lignes de chaque service :" >&2
  for svc in db anvil api assistant caddy; do
    echo "         --- $svc ---" >&2
    docker compose -f docker-compose.deploy.yml logs --tail 40 "$svc" 2>&1 | sed 's/^/         /' >&2 || true
  done
  echo >&2
  echo "         Les deux causes de loin les plus probables :" >&2
  echo "         1. BASE_RPC_URL invalide ou hors quota : anvil ne demarre pas, donc l'API" >&2
  echo "            attend un fork qui n'arrive jamais." >&2
  echo "         2. le premier remplissage du cache du fork depasse 5 minutes sur une" >&2
  echo "            liaison lente. Relance le script : le cache est un volume, il persiste." >&2
  exit 1
fi

# Ce qui depend de la base, verifie a part : elle peut etre saine alors que la migration
# n'a pas passe, et le compte rend alors 503 sans que rien d'autre ne bronche.
if docker compose -f docker-compose.deploy.yml exec -T api \
     curl -fsS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8787/compte/nonce \
     -H 'content-type: application/json' -d '{"adresse":"0x0000000000000000000000000000000000000001"}' \
     2>/dev/null | grep -q '^200$'; then
  echo "[deploy] les comptes repondent : base migree, connexion par portefeuille possible."
else
  echo "[deploy] ATTENTION : POST /compte/nonce ne rend pas 200." >&2
  echo "         Les 9 routes du compte sont donc fermees : ni cle d'API, ni historique," >&2
  echo "         ni telechargement. Le reste du service (mesure, peage, /hooks) fonctionne." >&2
  echo "         Regarde : docker compose -f docker-compose.deploy.yml logs db api | tail -40" >&2
fi

# L'assistant est un second serveur : sain d'un cote ne dit rien de l'autre.
if docker compose -f docker-compose.deploy.yml exec -T assistant \
     curl -fsS http://127.0.0.1:8788/assistant/health >/dev/null 2>&1; then
  echo "[deploy] l'assistant repond sur /assistant."
else
  echo "[deploy] ATTENTION : l'assistant ne repond pas — le panneau de conversation du site" >&2
  echo "         dira « injoignable ». Le reste de l'instrument ne depend pas de lui." >&2
fi

if [[ -z "${TARE_ABONNEMENT_CONTRAT:-}" ]]; then
  echo "[deploy] NOTE : TARE_ABONNEMENT_CONTRAT est absent. GET /compte repondra"
  echo "         « abonnement non verifie, donc pas actif » — un refus motive, mais un refus :"
  echo "         aucune cle d'API ni aucun telechargement ne sera delivre."
  echo "         Deploie le contrat : cd contracts && forge script script/DeployerAbonnement.s.sol \\"
  echo "           --rpc-url \$TARE_ABONNEMENT_RPC --broadcast"
fi

echo
echo "[deploy] verifie le peage depuis l'exterieur — il doit repondre 402 :"
echo "  curl -i -X POST https://$TARE_DOMAIN/measure -H 'content-type: application/json' \\"
echo "    -d '{\"hook\":\"0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc\",\"sizes\":[\"1000000000000\"]}'"
echo
echo "[deploy] puis paie-la vraiment :"
echo "  TARE_API_URL=https://$TARE_DOMAIN/measure npx tsx apps/api/src/pay/cli.ts payer"
