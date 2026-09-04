# apps/api — l'API TARE

Node + Hono + TypeScript. Elle sert les mesures d'extraction des hooks Uniswap v4 et
vend la mesure a la demande derriere un peage x402 sur Hedera testnet.

**Elle ne calcule aucun bps.** Les nombres viennent soit du jeu publie, soit du moteur
Python (`engine/tare`, 47 tests, porte A3), appele par `scripts/measure_one.py`.

## Demarrer

```bash
docker compose up -d              # depuis la racine : le fork anvil epingle au bloc
cd apps/api && npm install
npm start                         # http://127.0.0.1:8787
npm test                          # 30 tests vitest
```

## Routes

| | |
|---|---|
| `GET /hooks` | le classement : par hook, le bps maximum, le nb de pools, le nb de mesures, la fiche du registre officiel |
| `GET /hook/:address` | tous les profils du hook : par pool, chaque point avec bloc, taille, sens, etiquette |
| `GET /measurement/:id` | une mesure et **sa commande de rejeu exacte** |
| `POST /measure` | la mesure a la demande — **payante, x402** |
| `GET /usage` · `GET /usage/log` | le compteur : unite = 1 mesure |
| `GET /meta` | sources, sante du moteur, peage |
| `GET /replay/:id` | la commande de rejeu, en texte brut |

## Le peage : facture a la mesure, pas a la requete

`@x402/hono` et `@x402/hedera` en **2.23.0** (les deux existent sur npm et s'installent).
Reseau `hedera:testnet`, facilitateur `https://api.testnet.blocky402.com` — dont
`/supported` annonce bien `{"scheme":"exact","network":"hedera:testnet","extra":{"feePayer":"0.0.7162784"}}`.

Le prix **n'est pas fixe** : c'est une fonction du corps de la requete
(`price: async (context) => …` dans `src/x402.ts`). Une requete qui demande cinq
tailles paie cinq unites. Sans ce prix dynamique, "compute metering rather than a
flat per-request charge" ne serait qu'une phrase.

```
1 mesure  ->  accepts[0].amount = "1000"   (USDC Hedera, 6 decimales, 0,001 USD)
5 mesures ->  accepts[0].amount = "5000"
```

Le corps du 402 recopie `accepts[]` en clair : x402 v2 le met dans l'en-tete
`payment-required` en base64, illisible dans un `curl`.

## Corps de POST /measure

```jsonc
{
  "hook":    "0x…",          // un hook connu de docs/pools-liquides.json
  "pool_id": "0x…",          // ou un pool deja mesure
  "pool":    { "currency0": "0x…", "currency1": "0x…", "fee": 8388608,
               "tick_spacing": 200, "hooks": "0x…" },   // ou la PoolKey complete
  "sizes":      ["100000000000000", "1000000000000000"],
  "directions": ["0->1", "1->0"],
  "block": 50614000
}
```

Le plan est valide **avant** le peage : une requete qu'on ne saurait pas executer
sort en 400 sans jamais reclamer de paiement.

## Preuves (curl, 05/09/2026)

Le classement reproduit les resultats acquis :

```
$ curl -s localhost:8787/hooks | jq '.hooks[0] | {hook, max_bps, pools, measurements, labels}'
{ "hook": "0x985c14baa2a18316ffda0aefb3a632fadfca2acc", "max_bps": 100,
  "pools": 25, "measurements": 100, "labels": {"MEASURED": 52, "NOT_QUOTABLE": 48} }
```

Le 402, avec le vrai facilitateur Hedera :

```
$ curl -s -X POST localhost:8787/measure -H 'content-type: application/json' \
    -d '{"pool_id":"0x56d31…0450","sizes":["1000000000000000"]}'
HTTP/1.1 402 Payment Required
{"x402Version":2,
 "accepts":[{"scheme":"exact","network":"hedera:testnet","amount":"1000",
             "asset":"0.0.429274","payTo":"0.0.7162784","maxTimeoutSeconds":300,
             "extra":{"feePayer":"0.0.7162784"}}],
 "billing":{"unit":"measurement","unit_price_usd":0.001,"units_for_this_request":1}}
```

La mesure a la demande, peage coupe (`X402_ENABLED=0`), sur le pool de la porte A3.
Les quatre premieres valeurs sont celles que la porte attend (99,99 / 99,93 / 99,26 / 93,10) :

```
     100000000000000  MEASURED        99.9926
    1000000000000000  MEASURED        99.926
   10000000000000000  MEASURED        99.2644
  100000000000000000  MEASURED        93.1011
 1000000000000000000  NOT_MEASURABLE  engine_error:empty response from http://127.0.0.1:8545
```

La cinquieme n'est **pas** un zero : le RPC amont du fork (`https://base.drpc.org`,
public) a rate-limite, la lecture est revenue vide, et une lecture vide est un
`NOT_MEASURABLE`. C'est la regle 3, appliquee par le code et non par la bonne volonte.

## Ce qui n'est PAS verifie

* **Un paiement Hedera reel n'a jamais ete regle** de bout en bout : il faudrait un
  compte testnet finance et un client x402. Ce qui est verifie : le 402 est emis avec
  des `accepts[]` corrects, le montant suit le nombre de mesures, et le facilitateur
  annonce bien `exact` sur `hedera:testnet`. La verification et le reglement sont
  delegues a `@x402/hono`, non reimplementes ici.
* `payTo` vaut par defaut `HEDERA_FEE_PAYER` (`0.0.7162784`), c'est-a-dire le compte du
  facilitateur. **Mets un vrai compte TARE dans `HEDERA_PAY_TO` avant toute demo payante.**
* `replay.command` (`make measure HOOK=… BLOCK=…`) est la forme courte publiee dans le
  README de la racine. `engine/tare/cli.py` est apparu pendant ce lot, donc la commande
  existe — mais mon seul essai (`make measure HOOK=0x1aea38f0… BLOCK=50614000`) s'est
  arrete sur un `RpcError: empty response` non rattrape, le RPC amont du fork etant
  rate-limite. **La forme qui tourne aujourd'hui est `replay.command_exact`**
  (`python3 apps/api/scripts/measure_one.py …`), verifiee a la main et via l'API ;
  les deux sont servies par `/measurement/:id`.
* `docs/pools-liquides.json` stocke la liquidite en nombre JSON : au-dela de 2^53 la
  valeur exacte est deja perdue a la lecture du fichier. Elle ne sert qu'a classer les
  pools d'un meme hook (`liquidity_approx`), jamais a etre affichee comme une mesure.
