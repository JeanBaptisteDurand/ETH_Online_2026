# Inventaire de @tare/api

Scanné le 2026-09-12T10:25:37.878Z. 2801 fichiers (.sol 2223, .ts 203, .json 180, .py 85, .md 38, .tsx 14). Gestionnaire : npm.

## Paquets (monorepo)

- `apps/api/package.json` @tare/api : @hono/node-server, @noble/curves, @noble/hashes, @tare/keyring, @x402/hedera, @x402/hono, hono, pg, zod, @types/node, @types/pg, tsx…
- `apps/landing/package.json` @tare/landing : @fontsource-variable/instrument-sans, @fontsource-variable/jetbrains-mono, uplot, @types/node, typescript, vite
- `apps/mcp/package.json` @tare/mcp : @modelcontextprotocol/sdk, js-sha3, zod, @types/node, typescript
- `apps/web/package.json` @tare/web : @fontsource-variable/instrument-sans, @fontsource-variable/jetbrains-mono, @tanstack/react-table, react, react-dom, @tailwindcss/vite, @types/node, @types/react, @types/react-dom, @vitejs/plugin-react, tailwindcss, typescript…
- `packages/guard/package.json` @tare/guard : @ledgerhq/hw-app-eth, @ledgerhq/hw-transport-webhid, @types/chrome, @types/node, esbuild, typescript, vitest
- `packages/hookflags/package.json` @tare/hookflags : 
- `packages/keyring/package.json` @tare/keyring : @ledgerhq/hw-ledger-key-ring-protocol, @ledgerhq/hw-transport, @ledgerhq/hw-transport-node-speculos-http, rxjs, @ledgerhq/ledger-key-ring-protocol, @types/node, tsx, typescript, vitest

## Stack

- Framework : react (typescript, build vite)
- css : tailwindcss
- backend : hono
- db : pg
- test : vitest

## Routes (55)

- `GET /agent` (server-route) apps/api/src/agent/router.ts
- `GET /agent/hcs` (server-route) apps/api/src/agent/router.ts
- `GET /alternative` (server-route) apps/api/src/alternative.ts
- `POST /alternative` (server-route) apps/api/src/alternative.ts
- `GET /` (server-route) apps/api/src/app.ts
- `GET /health` (server-route) apps/api/src/app.ts
- `GET /meta` (server-route) apps/api/src/app.ts
- `GET /hooks` (server-route) apps/api/src/app.ts
- `GET /hook/:address` (server-route) apps/api/src/app.ts
- `GET /token/:address` (server-route) apps/api/src/app.ts
- `GET /exit/:address` (server-route) apps/api/src/app.ts
- `GET /measurement/:id` (server-route) apps/api/src/app.ts
- `POST /measure` (server-route) apps/api/src/app.ts
- `GET /usage` (server-route) apps/api/src/app.ts
- `GET /replay/:id` (server-route) apps/api/src/app.ts
- `GET /` (server-route) apps/api/src/assistant/router.ts
- `GET /actions` (server-route) apps/api/src/assistant/router.ts
- `GET /health` (server-route) apps/api/src/assistant/router.ts
- `GET /quota` (server-route) apps/api/src/assistant/router.ts
- `GET /table` (server-route) apps/api/src/assistant/router.ts
- `POST /ask` (server-route) apps/api/src/assistant/router.ts
- `GET /stream` (server-route) apps/api/src/assistant/router.ts
- `POST /stream` (server-route) apps/api/src/assistant/router.ts
- `POST /actions/validate` (server-route) apps/api/src/assistant/router.ts
- `POST /actions/run` (server-route) apps/api/src/assistant/router.ts
- `GET /` (server-route) apps/api/src/assistant/server.ts
- `POST /compte/nonce` (server-route) apps/api/src/compte/router.ts
- `POST /compte/session` (server-route) apps/api/src/compte/router.ts
- `DELETE /compte/session` (server-route) apps/api/src/compte/router.ts
- `GET /compte` (server-route) apps/api/src/compte/router.ts
- `POST /compte/cle` (server-route) apps/api/src/compte/router.ts
- `DELETE /compte/cle/:id` (server-route) apps/api/src/compte/router.ts
- `POST /compte/abonnement` (server-route) apps/api/src/compte/router.ts
- `GET /compte/extension.zip` (server-route) apps/api/src/compte/router.ts
- `GET /compte/mcp.tgz` (server-route) apps/api/src/compte/router.ts
- `GET /compte/paquets` (server-route) apps/api/src/compte/router.ts
- `GET /compte/journal` (server-route) apps/api/src/compte/router.ts
- `POST /compte/journal` (server-route) apps/api/src/compte/router.ts
- `GET /graph` (server-route) apps/api/src/graph-routes.ts
- `GET /graph/${name}/:hook` (server-route) apps/api/src/graph-routes.ts

## Composants par densité de données (15)

| Composant | Fichier | Lignes | Tables | Graphiques | Listes | Nombres | Formulaires |
|---|---|---|---|---|---|---|---|
| Route | apps/web/src/components/Route.tsx | 965 | 0 | 0 | 9 | 0 | 4 |
| Machine | apps/web/src/components/Machine.tsx | 743 | 6 | 0 | 8 | 8 | 0 |
| Substituer | apps/web/src/components/Substituer.tsx | 576 | 0 | 0 | 5 | 5 | 2 |
| Compte | apps/web/src/components/Compte.tsx | 664 | 3 | 0 | 5 | 4 | 0 |
| Chat | apps/web/src/chat/Chat.tsx | 587 | 0 | 0 | 9 | 0 | 2 |
| Detail | apps/web/src/components/Detail.tsx | 328 | 3 | 0 | 2 | 4 | 0 |
| Graph | apps/web/src/components/Graph.tsx | 435 | 0 | 11 | 3 | 0 | 0 |
| Table | apps/web/src/components/Table.tsx | 365 | 3 | 0 | 4 | 2 | 0 |
| Led | apps/web/src/components/Led.tsx | 200 | 0 | 0 | 5 | 1 | 1 |
| Curve | apps/web/src/components/Curve.tsx | 310 | 0 | 0 | 4 | 2 | 0 |
| Exit | apps/web/src/components/Exit.tsx | 242 | 0 | 0 | 1 | 5 | 2 |
| App | apps/web/src/App.tsx | 309 | 0 | 0 | 3 | 0 | 0 |
| GraphApi | apps/web/src/components/GraphApi.ts | 235 | 0 | 0 | 0 | 0 | 0 |
| Prim | apps/web/src/components/Prim.tsx | 172 | 0 | 0 | 0 | 0 | 0 |
| main | apps/web/src/main.tsx | 13 | 0 | 0 | 0 | 0 | 0 |

## Libellés visibles (extraits)

- **Route** : adresse invalide — 0x suivi de 40 hexadecimaux · taille non mesuree · bps · Il n'y a rien a classer&nbsp;: · Une seule porte est · mesuree · alternatives · · structure du marche, derivee du recensement · minorant · taille (wei)
- **Machine** : x402 v2 · Hedera testnet · Blocky402 · Journal des reglements non lu : · docs/x402-settlements.jsonl · la mesure · paiements · regles · et relus sur le mirror node · signes par une cle servie par le · Ledger Key Ring · USDC par
- **Substituer** : x.pool)).size · Sur les · Quinze · quatre · tickSpacing · comparer · comparer et construire · signer et envoyer · approuver le jeton vers Permit2 · transaction envoyee
- **Compte** : C'est la · seule · sur la chaine · window.ethereum · signer pour entrer · l'abonnement, lu sur la chaine · relire l'abonnement · lire le prix · payer · les cles d'API — une par surface
- **Chat** : assistant · pilote le tableau · assistant · replier · t.kind === 'question' ? ( · reset · permalien · envoyer · etiquette de la mesure citee, jamais promue · etiquette de la reponse · une question sur les hooks mesures
- **Detail** : bps maximum observes · suivantes › · aller a la pire ligne · valeur · taille · sens · bloc · lp fee on-chain · profil taille → bps
- **Graph** : aucune mesure cotable · meme keccak(eth_getCode) · ce qu’il faudrait re-mesurer · pools a re-mesurer si le defaut est dans le code · eth_getCode · ses jumeaux · son rayon de souffle · son desaccord avec le registre · le graphe · ce que le hook touche autour de lui
- **Table** : ABSENT · aucune fiche dans hooklist.json · aucune cotation · bps · ouvrir · SRC · verifiedSource — source verifiee · DYN · dynamicFee — commission dynamique declaree · UPG
- **Led** : BigInt(adresse) &amp; 0x3FFF · Les 14 permissions d'un hook Uniswap v4 · sont · Hooks.sol · Ce que la permission dit, c’est ce que le hook · a le droit · registre : absent · registre en cours de chargement — les LED n'en dependent pas · instantane du registre indisponible — LED inchangees · 14 permissions, zero appel reseau
- **Curve** : sans hook · avec hook · cliquer : ouvrir la ligne et sa commande de rejeu
- **Exit** : min && ( · ce qui te revient · min && · zone incertaine · calcul dans le navigateur · aucune requete · bloc 50 614 000 · tu mets · Pas de reponse pour ce jeton. · Les · deux premiers · zone incertaine : la revente varie selon la taille
- **App** : TARE · instrument · lecture immediate · aucun wallet · aucune requete · on change le hook · anvil_setCode · Hooks.sol · L'ecart est ce que le hook a pris. · retirer · cliquer une ligne pour ouvrir sa fiche · le meme swap, cote deux fois

## Appels de données (31)

- fetch `http://127.0.0.1:5010` apps/api/src/chaine/run.ts:312
- fetch `${MIRROR_TESTNET}/api/v1/accounts/${accountId}/tokens?token.id=${token}` apps/api/src/pay/cli.ts:52
- fetch `${mirror}/api/v1/transactions/${id}` apps/api/src/pay/client.ts:109
- fetch `url` apps/api/src/pay/client.ts:203
- fetch `url` apps/api/src/pay/client.ts:229
- fetch `url` apps/api/src/rag/embed.ts:65
- fetch `${this.baseUrl}/api/tags` apps/api/src/rag/embed.ts:101
- fetch `url` apps/mcp/src/api.ts:34
- fetch `url` apps/mcp/src/rpc.ts:23
- fetch `API` apps/web/scripts/fetch-registry.mjs:29
- fetch `RAW` apps/web/scripts/fetch-registry.mjs:30
- fetch `${base}/health` apps/web/src/chat/client.ts:110
- fetch `${base}/ask` apps/web/src/chat/client.ts:130
- fetch `${API}/compte/${quoi === ` apps/web/src/components/Compte.tsx:569
- fetch `${API_BASE}${path}` apps/web/src/components/GraphApi.ts:204
- fetch `${import.meta.env.BASE_URL}data/hooklist.snapshot.json` apps/web/src/components/Led.tsx:21
- fetch `${API}${chemin}` apps/web/src/compte/api.ts:181
- fetch `${API}/alternative` apps/web/src/compte/substitution.ts:120
- fetch `url` docs/feedback-evidence/routing_allowlist.py:43
- fetch `SOURCES` docs/feedback-evidence/routing_allowlist.py:90
- fetch `SOURCES` docs/feedback-evidence/routing_allowlist.py:91
- fetch `SOURCES` docs/feedback-evidence/routing_allowlist.py:92
- fetch `url` docs/pr-hooklist/validate.py:176
- fetch `f` docs/pr-hooklist/validate.py:184
- fetch `f` docs/pr-hooklist/validate.py:185
- fetch `r` engine/tare/collect.py:121
- fetch `${api}/compte/journal` packages/guard/extension/options.src.ts:62
- fetch `chrome.runtime.getURL` packages/guard/extension/worker.src.ts:45
- fetch `${r.api.replace(/\/+$/, ` packages/guard/extension/worker.src.ts:100
- fetch `${API}/events?currentscreenonly=true` packages/guard/scripts/speculos-approve.ts:44
- fetch `${API}/button/${b}` packages/guard/scripts/speculos-approve.ts:52

## URLs externes

- https://hol.org/docs/standards/hcs-14/
- https://github.com/JeanBaptisteDurand/ETH_Online_2026/blob/main
- https://api.openai.com/v1
- https://api.testnet.blocky402.com
- https://testnet.mirrornode.hedera.com
- https://hashscan.io/testnet/topic/0.0.10371106
- https://hashscan.io/testnet/transaction/0.0.10367920-1788569227-263707186
- https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10371106/messages/7
- https://mainnet.mirrornode.hedera.com
- https://trustchain-backend.api.aws.stg.ldg-tech.com
- http://t/rag/search?q=
- https://api.exemple
- https://api.exemple/compte/journal
- https://raw.githubusercontent.com/Uniswap/hooklist/main/hooklist.json
- https://api.github.com/repos/Uniswap/hooklist/commits/main
- https://api.exemple.fr
- https://raw.githubusercontent.com
- https://github.com/JeanBaptisteDurand/ETH_Online_2026/blob/main/docs/dataset/measurements.jsonl
- http://example.com/data.json
- https://testnet.hashio.io/api
- https://base.blockscout.com/api/v2
- http://x
- https://example.invalid
- https://exemple.tld/hooks/
- https://api.exemple/
- https://base-mainnet.g.alchemy.com/v2/SECRET_KEY_ABC123
- https://trustchain.api.live.ledger.com

## Variables d'environnement

`ASSISTANT_PORT`, `BASESCAN_API_KEY`, `BASE_RPC_URL`, `BASE_URL`, `DATABASE_URL`, `ETHERSCAN_API_KEY`, `HEDERA_EVM_RPC`, `HEDERA_PAYEE_KEY_TYPE`, `HEDERA_PAYER_ACCOUNT_ID`, `HEDERA_PAYER_EVM`, `HEDERA_PAYER_KEY_TYPE`, `HEDERA_PAYER_PRIVATE_KEY`, `HEDERA_PAY_TO`, `LEDGER_PATH`, `LKRP_BACKEND`, `NODE_ENV`, `OLLAMA_PLANNER_MODEL`, `OLLAMA_URL`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_EMBEDDING_MODEL`, `OPENAI_PLANNER_MODEL`, `RPC`, `SPECULOS_URL`, `TARE_ABONNEMENT_CHAIN_ID`, `TARE_ABONNEMENT_CONTRAT`, `TARE_API_URL`, `TARE_ATTESTATIONS`, `TARE_CENSUS_PATH`, `TARE_CENSUS_SCAN_PATH`, `TARE_CONTESTES_PATH`, `TARE_DECLARE_CHUNK`, `TARE_DEMO_URL`, `TARE_DIRECTIONS`, `TARE_DISABLE_OLLAMA`, `TARE_DISABLE_OPENAI`, `TARE_EMBED_MODEL`, `TARE_HOOK`, `TARE_JSONL_PATH`, `TARE_KEYRING`, `TARE_LIVE_HCS`, `TARE_LOG_CHUNK`, `TARE_LOG_WORKERS`, `TARE_PG_DSN`, `TARE_PLANNER`, `TARE_POOLS_PATH`, `TARE_POOL_ID`, `TARE_RAG_URL`, `TARE_REPO_ROOT`, `TARE_REVEAL`, `TARE_SCAN_WORKERS`, `TARE_SECRET_NAME`, `TARE_SIZES`, `TARE_SOURCE_BASE`, `TARE_UNIT_PRICE_USD`, `TARE_UPSTREAM_RPC`, `TARE_V1_PATH`, `THE_GRAPH_KEY`, `TRUSTCHAIN_API`, `TX_INDEX`, `VITEST`, `X402_ENABLED`

## Données et schémas

- apps/web/src/chat/model.ts

## Points d'entrée

- ?

## À lire en premier (pour l'agent repo-analyst)

- apps/web/src/components/Route.tsx
- apps/web/src/components/Machine.tsx
- apps/web/src/components/Substituer.tsx
- apps/web/src/components/Compte.tsx
- apps/web/src/chat/Chat.tsx
- apps/web/src/components/Detail.tsx
- apps/web/src/components/Graph.tsx
- apps/web/src/components/Table.tsx
- README.md
