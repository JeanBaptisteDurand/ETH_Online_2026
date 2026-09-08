# Mettre le service en ligne

Le track Hedera *AI & Agentic Payments* demande deux choses que le code seul ne donne
pas :

> *« Host a **live** x402-gated service on Hedera testnet or mainnet, settled through the
> Blocky402 facilitator »*
> *« …completes **at least one real paid request** end to end »*

La seconde est faite, et prouvée : six règlements réels dans
[`docs/x402-settlements.jsonl`](docs/x402-settlements.jsonl), relus sur le mirror node.
La première demande une machine allumée.

## Ce qui est déjà vérifié

L'image se construit, tourne, et **a été payée** — le dernier règlement de
`x402-settlements.jsonl` a été servi par le conteneur, pas par le processus de
développement :

```
POST /measure (conteneur)  ->  402
PAYMENT-SIGNATURE          ->  200 en 5,5 s
mirror node                ->  SUCCESS, 0.001 USDC, 0.0.7162784@1788856311.146171915
```

Il ne manque donc que l'hébergement lui-même : un nom de domaine et une machine.

## Une commande

```bash
# sur le serveur, dépôt cloné, .env rempli
TARE_DOMAIN=tare.exemple.fr ./scripts/deploy.sh
```

`scripts/deploy.sh` **refuse de démarrer** sur une configuration qui produirait un service
en apparence sain et faux : sans `BASE_RPC_URL` il n'y a pas de fork, donc pas de mesure,
seulement un jeu de données à relire ; sans `HEDERA_PAY_TO` le péage encaisserait chez
quelqu'un d'autre. Mieux vaut ne pas démarrer que servir des 402 qui ne mènent nulle part.

## Les trois conteneurs, et pourquoi aucun n'est en trop

| | rôle | pourquoi il est indispensable |
|---|---|---|
| `anvil` | fork Base épinglé au bloc 50 614 000 | c'est **lui** qui rend la mesure possible : `anvil_setCode` remplace le bytecode du hook par le stub inerte de 89 octets. Sans fork, pas de contrefactuel |
| `api` | l'API x402 + le moteur Python | inséparables : `POST /measure` exécute `measure_one.py` et lit sa sortie |
| `caddy` | TLS automatique | un service « en ligne » sans TLS n'est pas un service, c'est une démo |

Le volume de cache d'anvil n'est pas un raffinement : une cotation à froid contre un RPC
public a été mesurée à **8,96 s**, et à **0,01 s** une fois l'état local.

## Deux pièges déjà payés

**Compose découpe une commande en chaîne.** L'`ENTRYPOINT` de l'image Foundry est
`["/bin/sh","-c"]` : la commande doit lui arriver en **un seul argument**. Avec une chaîne
YAML, `sh -c` prend `anvil` pour tout le script et chaque option devient `$0`, `$1`… Un
anvil nu démarre — **sans fork**, et à l'écoute de `127.0.0.1` **dans** le conteneur, donc
le port publié ne répond à rien. Une liste à un élément est la seule forme juste. Ce bug a
vécu dans le dépôt jusqu'au 8 septembre.

**x402 vit dans les en-têtes.** `PAYMENT-REQUIRED` sur le 402, `PAYMENT-SIGNATURE` sur la
requête payée, `PAYMENT-RESPONSE` sur la réponse. Un proxy qui les avale casse le protocole
en silence : le client paie et ne voit pas son reçu. Le
[`Caddyfile`](infra/Caddyfile) les laisse passer **et** les expose au navigateur.

Le délai du proxy est monté à 300 s pour la même raison : cinq tailles × deux sens ont pris
9,4 s en local, et le défaut de 30 s couperait une requête **payée** juste avant sa
réponse. Le client aurait payé pour rien — c'est le pire cas possible, donc c'est celui
qu'on prévoit.

## La clé de paiement, en production

Le trousseau Ledger est monté **en lecture seule** dans le conteneur
(`./var:/srv/tare/var:ro`) : le service l'ouvre, il ne le modifie jamais.

S'il est absent, le service tombe sur `HEDERA_PAYER_PRIVATE_KEY` en clair — et
`scripts/deploy.sh` **le dit à voix haute** au lieu de laisser la découverte pour plus
tard. Pour le sceller, voir [`packages/keyring/`](packages/keyring/).

## Vérifier depuis l'extérieur

```bash
# le péage doit répondre 402, avec son prix
curl -i -X POST https://tare.exemple.fr/measure \
  -H 'content-type: application/json' \
  -d '{"hook":"0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc","sizes":["1000000000000"]}'

# puis payer pour de vrai
TARE_API_URL=https://tare.exemple.fr/measure npx tsx apps/api/src/pay/cli.ts payer
```

## Ce qui n'est pas fait

**Aucune machine n'héberge encore ce service.** Tout ce qui précède est vérifié en local,
conteneur compris, et le déploiement tient en une commande — mais l'URL publique n'existe
pas, donc l'exigence du track n'est **pas** satisfaite. Elle ne le sera pas tant qu'un nom
de domaine ne répondra pas.
