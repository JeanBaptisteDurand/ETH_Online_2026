# TARE — rapport d'intake (analyste project-brief, 2026-09-12)

## Ce que fait le produit

TARE mesure ce qu'un hook Uniswap v4 prend réellement sur un swap : sur un fork Base épinglé au bloc 50 614 000, `anvil_setCode` remplace le bytecode du hook par un stub inerte, le même swap est coté deux fois via V4Quoter, et l'écart est le prélèvement (engine/tare/measure.py:1-12, README.md:25-30). Le corpus de 125 072 mesures sur 7 817 pools et 112 hooks est embarqué dans l'instrument web (apps/web, React/Vite, encodé par colonne en 7,9 Mo) qui rend un verdict sans serveur ni wallet, confronté au registre officiel `Uniswap/hooklist` qui ne porte aucun champ quantitatif (App.tsx:21-23, Table.tsx:17-19). Autour : une API Hono (lecture gratuite, `POST /measure` payant en x402/USDC sur Hedera testnet, `/route`, `/alternative`, `/graph`, compte par portefeuille), une landing statique, un serveur MCP, une extension MV3 de garde à la signature et un moteur Python (README.md:247-258).

En une phrase : **« Tu mets 100 €, tu récupères combien ? » — le péage caché d'un hook, mesuré par contrefactuel et rejouable en une commande.**

## Les données affichées, par importance

**Essentielles (1)**

| Donnée (libellé écran) | Où | Source amont |
|---|---|---|
| « Tu mets 100 €, il te reste X (entre X et Y) € » + barre revient / incertain / reste au pool | panneau 00, Exit.tsx:200-203 | **calcul local** lib/exit.ts:83-147 sur `dataset.rows` ← `docs/dataset/measurements.jsonl` (build-dataset.mjs) |
| Verdict 4 tuiles : mesures > 1 bps sur LP fee 0 · hooks mesurés · hooks absents du registre · champs quantitatifs du registre | panneau 01, App.tsx:65-108 | `dataset.totals` (build-dataset.mjs:146-158, **jsonl**) + `facts.registre` (build-facts.mjs:169-203, **snapshot** épinglé vs `docs/hooklist-live-20260905.json`) |
| Tableau 02 : « CE QUE LE REGISTRE DIT » (ABSENT / SRC DYN UPG VAN CSD / swapAccess) ≠ « CE QUE LA MESURE DIT » (bps max, min, obs, bloc, taille, sens de la pire ligne) | Table.tsx:101-181 | `dataset.hooks[]` : registre ← **snapshot** `public/data/hooklist.snapshot.json` ; mesure ← **jsonl**, `worstRowId` → `rowsById` |
| Fiche 05 / profil 06 / lignes brutes 07 : bps max, phrase de désaccord, courbe taille → bps, ligne ouverte avec out_with / out_without / stub / **commande de rejeu** | Detail.tsx:98-145, Curve.tsx, Detail.tsx:294-323 | `rowsOfHook` + `profileOf` (lib/dataset.ts:124-157), **calcul local** sur le jsonl embarqué |
| Route 03 : verdict MULTIPLE_POOLS / SINGLE_POOL / NOT_MEASURED, coût total = frais LP + hook par porte, rejeu | Route.tsx:179-253,306-381 | **API** `GET /route` (apps/api/src/route.ts:730 `total_bps_formula`) ← jsonl + `measurements-contestes.jsonl` + recensement `pools-liquides-full.json` ; rien recalculé côté client |
| Substituer 16 : état MEILLEURE_PORTE / PORTE_UNIQUE…, porte proposée, économie, envoi PRET…, plancher de sortie, N appels RPC | Substituer.tsx:368-571 | **API** `POST /alternative` (packages/guard sur `packages/guard/data/table.json`) + **chaîne** (3 `eth_call` vivants) + portefeuille `eth_sendTransaction` |
| `POST /measure` : 402 x402, mesure neuve, facturation par mesure | apps/api/src/app.ts:395-584 | **fork anvil + moteur Python**, facilitateur Blocky402, journal `docs/x402-settlements.jsonl` relu sur le **mirror node** |

**Les cinq à retenir pour le brief** : (1) la phrase de sortie (calcul local, jsonl) ; (2) les deux colonnes registre ≠ mesure (snapshot + jsonl) ; (3) le bps max d'un hook avec sa commande de rejeu (jsonl) ; (4) le coût total par porte de `/route` (API, jsonl + recensement) ; (5) les règlements x402 relus sur le mirror node (panneau 09, `facts.x402` ← `docs/x402-settlements.jsonl`).

**Importantes (2)** : LED 04 (14 bits = adresse, zéro réseau ; chips mesure/registre, Led.tsx), les trois encarts de graphe 08 (`/graph/twins|impact|disagreement`, graph.json non versionné), les panneaux Machine 09-14 (x402, HCS-14, attestations Hedera, The Graph, porte A4, Ledger/Speculos — tous lus dans `facts.json` construit depuis `docs/dataset/*.json`, `docs/ledger/`, et par **regex** sur `apps/api/src/config.ts`, `engine/tare/gates/a4.py`, `apps/mcp/src/server.ts`), le compte 15 (session par signature, abonnement lu sur la chaîne, clés, paquets, journal Postgres), l'assistant (SSE vers le port 8788, actions revalidées puis appliquées au tableau).

**Détails (3)** : en-tête et footer de provenance (App.tsx:28-62, 275-302), légende de rampe, identité d'agent complète, panneau « autres surfaces », `GET /` de l'API.

Le détail des 47 données, avec source et problème par ligne, est dans `project/intake/inventory.json → analysis.dataDisplayed`.

## Le parcours principal de démo (sans serveur)

1. Ouvrir la page : le dataset est décodé, le hook au bps max le plus fort est sélectionné (App.tsx:144-146).
2. Panneau 00 : cliquer « il ne reste rien » → « Tu mets 100 €, il te reste 0,00 € », barre pleine (Exit.tsx:162-203).
3. Panneau 01 : les quatre chiffres du verdict, puis la méthode en un paragraphe.
4. Panneau 02 : le tableau trié par mesure décroissante, la colonne registre dit ABSENT ou des booléens, la colonne mesure dit des bps ; cliquer une ligne.
5. Panneaux 05-07 : fiche, phrase de désaccord, courbe log, pire ligne ouverte, **copier la commande de rejeu** → `make replay …` rend le même bps au wei (README.md:240-245).
6. Optionnel : LED 04 avec une adresse ; assistant (« la démo · vanillaSwap=false mais < 1 bps ») si un serveur tourne.

Six autres parcours (LED, route, substitution, compte, assistant, paiement x402) sont détaillés étape par étape dans `analysis.flows`.

## Les trois points faibles principaux

1. **Une page de 17 panneaux sans navigation ni hiérarchie stable.** Les ordinaux ne suivent pas l'ordre visuel (Route « 03 » dont le commentaire dit « 07 », Route.tsx:244 et 557 ; le chat porte « 07 » comme les lignes brutes, Chat.tsx:426 vs Detail.tsx:163). La provenance (bloc, stub, commit, fiches) est répétée six fois (en-tête, tuile 4, légende, chaque ligne du tableau, titre 07, footer). Les phrases d'honnêteté sont recopiées dans une dizaine de composants.
2. **Un tiers du site est en état de refus sur le build public.** Route 03, Graphe 08, Compte 15, Substituer 16 et l'assistant dépendent d'une API non hébergée (README.md:326-330) ; chacun affiche son propre texte « aucune API publiée ». Route lance en plus six requêtes au chargement (Route.tsx:78,476-522) sur une page qui annonce « aucune requête ».
3. **Densité et formats bruts, avec des chiffres écrits en dur.** Tableau 7 colonnes × 3 lignes par cellule à 1080 px minimum (Table.tsx:278) ; adresses hexadécimales partout faute de symboles ; wei non formatés (Detail.tsx:314-315) ; prose en dur avec des nombres (Substituer.tsx:236-242, Exit.tsx:120, Led.tsx:169 « nos 128 mesures », périmé) — la faute que le commit bdcbef6 vient de corriger sur la landing. S'y ajoute un bug métier connu : `lignesDuJeton()` mélange les pools d'un jeton et `testDeSortie()` attribue le résultat au pool de la première ligne (Exit.tsx:36-41, lib/exit.ts:136 ; docs/ETAT-2026-09-10.md §5).

Performance perçue : 7,9 Mo décodés dans le thread principal, deux filtres complets de 125 072 lignes par changement de hook, un filtre complet par frappe dans le champ du panneau 00, canvas entièrement redessiné à chaque mousemove (Curve.tsx:224).

## Ce qu'on garde tel quel

La logique métier en fonctions pures et testées (`lib/exit.ts`, `lib/route.ts`, `lib/flags.ts`, `lib/ramp.ts`, `lib/format.ts`, `lib/local.ts`, `chat/engine|validate|model.ts`) ; le pipeline de build des données (`build-dataset.mjs`, `codec.mjs`, `verify.mjs`, `build-facts.mjs`) ; les quatre règles d'honnêteté et leurs mécanismes (étiquettes jamais promues, « pas de nombre » ≠ zéro, lectures bornées 8/10/20 s, vue remise sur troncature, bloc/taille/sens/rejeu sur chaque valeur) ; les machines d'état nommées (`Fetched`, `Refus`, `EtatAlternative` × `EtatEnvoi`) ; le parcours compte (EIP-6963, message signé rendu par le serveur, sessionStorage, abonnement relu on-chain, paiement sans calldata) ; la substitution à deux étages avec compte des appels RPC ; les règles de la courbe et la pagination des lignes brutes ; le pilotage du tableau par `ChatView` et le permalien ; l'API Hono et le moteur Python intégralement ; les jetons de charte d'`index.css` et les primitives de `Prim.tsx`.

## Les risques d'un refactor

Cinq composants de 576 à 965 lignes mêlant formulaire, réseau, état et rendu ; `Bouton`/`L`/`Ligne` dupliqués entre fichiers ; styles inline avec variables CSS sur chaque élément en plus des classes Tailwind arbitraires ; **aucun test de composant** (9 fichiers de tests purs lancés par `node --test` depuis scripts/test-all.sh:63-66, pas de script `test` dans apps/web/package.json) ; `dataset.json` et `facts.json` non versionnés et exigés par les imports, construits par regex sur du code source ; singleton `dataset` importé par 12 modules ; hash d'URL réservé au permalien du chat (collision avec tout routeur ou ancre) ; ordinaux de panneaux cités par `docs/ARCHITECTURE.md` et le pitch ; deux vocabulaires d'étiquettes FR/EN ; prose porteuse dans le JSX et textes serveur à afficher tels quels ; cinq variables `VITE_*` qui décident si un panneau est « sans API » ou « cassé » ; trois surfaces et deux générateurs de faits qui peuvent diverger.

## Questions que seul l'auteur peut trancher

1. **Public premier** : le jury ETHOnline (lit le dépôt, veut une URL vivante) ou le swapper Base réel ? Cela fixe la langue (UI FR, README/landing EN), l'ordre des panneaux et ce qu'on montre au-dessus de la ligne de flottaison.
2. **Titre du produit** : le test de sortie (00), la table registre ≠ mesure (02), ou les six pools à sens unique / 94 contrôles que l'ETAT §4 propose comme nouveau titre ?
3. **Une API sera-t-elle hébergée avant le 13/09** (`VITE_TARE_API`, `VITE_ASSISTANT_URL`) ? Sinon : replier, regrouper ou retirer les cinq panneaux serveur du build public ?
4. **Les panneaux Machine 09-14** restent-ils dans l'instrument, ou migrent-ils vers la landing / docs ? Ils ont été ajoutés parce que « la page ne portait pas un mot sur x402, Hedera, Ledger » (Machine.tsx:1-13).
5. **Les ordinaux 00-16** sont-ils un contrat (docs, vidéo, pitch) à conserver, ou peut-on réordonner et renuméroter ?
6. **Le « € » du panneau 00** : garder une devise nominale, ou passer en unités du jeton / pourcentage ? Le montant doit-il devenir actionnable (ETAT §5) ?
7. **Vocabulaire canonique des étiquettes** à l'écran : MESURE/NON_COTABLE (corpus web) ou MEASURED/NOT_QUOTABLE (API, graphe, guard) ?
8. **Le bug d'attribution de `lignesDuJeton()`** : à corriger avant la refonte, ou la refonte doit-elle contourner (choisir un pool quand un jeton en a plusieurs) ?
9. **Thème clair** (`index.css` YlOrRd) : requis ou héritage ?
10. **Les chiffres en dur** de Substituer.tsx:236-242, Exit.tsx:28-32,120, Led.tsx:7-12,169 : les dériver au build (comme `facts.json`) ou les supprimer ?
11. **Chat** : conserver l'assistant flottant sans serveur publié, ou le réserver au build local ?
12. **Landing et instrument** : deux surfaces à garder distinctes (14 kB gzip vs 7,9 Mo), ou une seule ? Et un seul générateur de faits ?
13. **Extension et MCP** : téléchargement réel derrière abonnement, ou démonstration ? Le contrat d'abonnement (`VITE_ABONNEMENT_CONTRAT`, chaîne 84532 par défaut) sera-t-il déployé ?

Validation : `inventory.json` valide contre `schemas/inventory.schema.json` (47 données, 7 parcours, 13 points faibles, 10 keep, 12 risques).
