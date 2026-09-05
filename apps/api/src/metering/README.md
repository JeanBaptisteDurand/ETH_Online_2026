# LOT G — le compteur a la mesure et le journal HCS

L'unite facturee de TARE n'est pas la requete, c'est **la mesure** : une paire de
cotations du meme swap, une fois avec le hook, une fois avec le stub inerte de
89 octets. Une requete « 5 tailles x 2 sens » vaut **dix** unites et ecrit **dix
lignes** au registre. C'est le point Hedera *pay-per-call inference, data, or
compute metering rather than a flat per-request charge* ; sans ces dix lignes,
ce ne serait qu'un slogan.

Chaque lot publie ensuite son **empreinte** sur un topic Hedera Consensus
Service — *verifiable payment audit trails on HCS*.

## Le topic reel

| | |
|---|---|
| Topic | **`0.0.10371106`** (Hedera testnet) |
| HashScan | <https://hashscan.io/testnet/topic/0.0.10371106> |
| Mirror | <https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10371106/messages> |
| Cree par | `0.0.10367920`, tx `0.0.10367920@1788569154.281550684` |
| Cle de soumission | la cle du compte payeur : seul TARE ecrit dans son journal |
| Cout observe | **377 528 tinybar** (message de 282 o) et **389 763 tinybar** (289 o), soit **~0,0038 HBAR par message** |

Le message n.1, relu sur le mirror node :

```json
{"v":"tare.metering.v1","batch":"b_11d6a668638448db9869","ts":"2026-09-05T00:47:11.371Z",
 "digest":"sha256:af2de094a070a0b2057525758cfb6515e65ea66bec88c52af5960849e820a647",
 "units":2,"unit_price_usd":0.001,"amount_usd":0.002,"payer":"0.0.10367920",
 "settlement":null,"block":50614000}
```
consensus timestamp `1788569234.806167390`, payer `0.0.10367920`.

Ce qui part sur HCS est l'empreinte du lot, pas les mesures : un message HCS non
chunke plafonne a 1024 octets, et le detail reste dans `/usage/log`.

## Ce qui est porte, et ce qui a change

| Source CorLens v2 | Ici | Ce qui change |
|---|---|---|
| `apps/ai-service/src/repositories/prompt-log.repo.ts` | `ledger.ts` | Prisma/Postgres -> JSONL append-only ; une ligne par **mesure**, plus par appel ; `purpose` -> `payer` |
| `apps/ai-service/src/services/usage.service.ts` | `service.ts` | meme fenetre (1er du mois UTC), `byPurpose` -> `byPayer` ; + l'ancrage HCS |
| `apps/ai-service/src/controllers/usage.controller.ts` | `router.ts` | Fastify+Zod -> Hono ; + `/usage/log`, `/usage/batch/:id`, `/usage/hcs*` |
| `apps/ai-service/src/middleware/hmac-verify.ts` + `packages/clients/src/hmac.ts` | `hmac.ts` | Fastify -> Hono ; en-tetes `x-tare-*` ; **le corps signe est le corps BRUT** (CorLens re-serialisait `req.body`, donc un JSON re-espace cassait la signature) ; le refus dit sa raison au lieu d'un 401 muet |

Aucune dependance ajoutee : `@hiero-ledger/sdk` 2.85.0 (ex-`@hashgraph/sdk`) est
deja installe, tire par `@x402/hedera` 2.23.0.

## Les regles d'honnetete, appliquees a la facturation

- Une mesure `NOT_MEASURABLE` **n'est pas facturee**. Lecture bornee, timeout,
  moteur muet : pas d'unite. On ne facture pas un silence.
  (`MEASURED`, `INTERPOLATED`, `NOT_QUOTABLE` sont facturees : le couple de
  cotations a bien tourne, et `NOT_QUOTABLE` est un verdict, pas une panne.)
- Un lot n'est `ANCHORED` que si le **mirror node** rend le message, octet pour
  octet. Sinon `NOT_ANCHORED`, avec la raison. Jamais promu.
- Un cout non lu vaut `null`, **jamais 0** — 0 dirait « gratuit ».
- `readTopic` suit `links.next` jusqu'au bout ; une pagination interrompue rend
  `complete: false`, pas une liste courte presentee comme complete.

## Routes

```
GET  /usage                    total en mesures, par payeur, hashes de reglement, etat HCS
GET  /usage/rollup             la forme CorLens : { since, unit, byPayer }
GET  /usage/log?limit=         une ligne PAR MESURE, avec `truncated`
GET  /usage/batch/:id          le detail d'un lot
GET  /usage/hcs                topic, cout, ancrages
GET  /usage/hcs/history        chaque ancrage, message publie compris
GET  /usage/hcs/message/:seq   relecture LIVE par le mirror node (200 VERIFIED / 503 NOT_VERIFIED)
POST /usage/anchor             ancre un lot — signee HMAC
```

## Montage dans `src/app.ts` (hors de ce lot, a faire au merge)

```ts
import { createMetering, toMeasurementUnit } from "./metering/index.js";

const metering = createMetering({ unitPriceUsd: cfg.unitPriceUsd });
app.route("/", metering.router);          // remplace l'actuel app.get("/usage")
```

puis dans le handler `POST /measure`, apres `measurements` :

```ts
const receipt = metering.service.recordBatch({
  route: "/measure", method: "POST",
  payer: who.payer, network: who.network, scheme: who.scheme,
  units_requested: plan.units, unit_price_usd: cfg.unitPriceUsd,
  latency_ms: Date.now() - t0, error: null,
  units: measurements.map(toMeasurementUnit),
});
void metering.service.anchorBatch(receipt);   // l'ancrage HCS ne bloque pas la reponse
```

et, dans `createPaymentLayer`, `onAfterSettle` appelle
`metering.service.attachSettlement(batchId, { success, transaction, payer })`.

Attention : `app.get("/usage")` existe deja dans `src/app.ts` et gagnerait sur
celui-ci (premier enregistre, premier servi). Il faut le retirer au montage.

## Variables

```
HEDERA_HCS_TOPIC_ID=0.0.10371106   # sans lui : pas d'ancrage, et /usage le DIT
TARE_METERING_LOG=...              # chemin du JSONL ; absent => en memoire
TARE_HMAC_SECRET=...               # absent => la garde s'efface et l'annonce
TARE_LIVE_HCS=0                    # coupe le test reseau
```

## Commandes

```bash
cd apps/api
npx vitest run --config src/metering/vitest.config.ts   # 45 tests + 1 saute
npx tsx src/metering/cli.ts topic-create                # une seule fois
npx tsx src/metering/cli.ts anchor                      # publie une empreinte et la relit
npx tsx src/metering/cli.ts usage                       # le parcours complet, 10 unites
npx tsx src/metering/cli.ts read                        # tout le topic, toutes les pages
```
