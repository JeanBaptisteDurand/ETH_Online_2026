# 34 — TARE : LE DOCUMENT DE RÉFÉRENCE

> **ETHOnline 2026** · ETHGlobal · 100 % asynchrone · Build **4 → 11 sept** · Soumission **13 sept 12:00 EDT** · Dev solo
>
> ⚠️ **Ce document REMPLACE le 33**, qui contient des chiffres faux identifiés le 29/08 par audit adverse.
> Tout ce qui suit a été exécuté ou vérifié. Ce qui ne l'est pas porte **NON VÉRIFIÉ**.

---

# 📌 LES CHIFFRES OFFICIELS AU 01/09/2026

**Toute valeur absente de ce tableau ne doit pas être citée.** Source unique : `research/tare-measurements-v1.json`.

| Grandeur | Valeur | Provenance |
|---|---|---|
| Mesures canoniques | **128** | `tare-measurements-v1.json` |
| Pools distincts mesurés | **32** | idem |
| Mesures exploitables (label `MESURE`) | **70** | idem |
| **Mesures > 1 bps sur frais LP stocké ZÉRO** | **60** | `stored_lp_fee` lu par `extsload` |
| Prélèvement min / médian / max sur ces 60 | **94,14 / 99,96 / 100,00 bps** | idem |
| Hooks concernés | **2** — `0x985c14baa2…` (52 mes. / 25 pools) et `0xdda9bc41e3…` (8 mes. / 2 pools) | idem |
| Bloc de mesure | **50 614 000** (Base) | épinglé |
| `stub_hash` | `0x8e39b2ad4344342b4f7dc5cf31df0aec9bd5b5f8ec7fccd241256cf1fda637a4` | keccak du bytecode |
| Taille du stub **qui a produit les mesures** | **89 octets**, hash `0x8e39b2ad…` | vérifié : le hash correspond au `stub_hash` des 128 mesures |
| Hooks déployés en 24 000 blocs émettant `HookSwap`/`HookFee` | **0 sur 84** | scan Base |
| Fiches au registre officiel | **613** · `vanillaSwap=false` **570 (93,0 %)** · `auditUrl` **30 (4,9 %)** · `verifiedSource` **613 (100 %)** | `hooklist.json` commit `f4db044` |
| Hooks `upgradeable` | **22 (3,6 %)** | idem |
| Hooks à `swapAccess` conditionnel | **145 (23,7 %)** | idem |
| Allowlist du routeur de production | **348 adresses** · denylist **vide** | `uniroute-public` |
| Cotabilité en balayant les deux sens | **54,7 – 65,3 %** | contrôle indépendant |
| **Taux de finaliste async** | **1,58 %** *(et non 9,8 %, qui est le taux de prix quelconque)* | `list-*.json` |
| Duel contre les 27 finalistes async | **17 gagnés · 4 nuls · 6 perdus** | analyse par axe |
| Probabilité finale / au moins un prix | **8 %** (5–15 %) / **45–60 %** | deux routes convergentes |

---

# 🔴 PARTIE 0 — LES CORRECTIONS. À LIRE AVANT TOUT LE RESTE.

Un audit adverse a repassé mes propres mesures. **Cinq de mes chiffres étaient faux.** Ils sont
corrigés ici, et les formulations fautives sont bannies.

## 0.1 Le taux de finaliste n'est pas 9,8 % — il est de **1,58 %**

Le marqueur « finalist » donne **10 / 633 = 1,58 %** à ETHOnline 2025, 10/618 = 1,62 % à HackMoney,
7/467 = 1,50 % à Open Agents. Les 62/633 = 9,8 % que je citais sont le taux de **prix quelconque**.
**La cible est six fois plus étroite que ce que j'ai dit.** *(source : `tools/list-*.json`, champ `prize_sponsor_uuids`)*

## 0.2 ✅ LEVÉE LE 29/08 — l'alerte « frais dynamiques » était FAUSSE

J'avais écrit que sur frais dynamiques le stub renvoyant `lpFeeOverride = 0` mettait les frais à zéro,
donc que 100 % du corpus de preuve était non fiable, et j'avais **interdit de prononcer le chiffre**.

**C'est faux, et c'est vérifié dans le code du protocole.** `v4-core/src/libraries/Pool.sol:303-305` :
un `lpFeeOverride` n'active l'override que si le bit `& 0x400000` est posé. Avec `0`, le pool
**retombe sur `slot0.lpFee`, son frais stocké** — pas sur zéro. Lecture live : 30 000 sur certains
pools de `0xb429d62f`, 80 000, 10 000, 0 sur d'autres.

> **La référence facture déjà le frais LP. L'interdiction tombe.**
> Il faut seulement ajouter la colonne **`stored_lp_fee`** à la table de mesure et l'afficher.

## 0.3 🔴 Mes comptages étaient gonflés

`research/tare-mesures.json` contient **11 lignes mais 6 hooks distincts**, dont **3 lignes strictement
identiques** (même hook, même profil, même liquidité). Après déduplication :
**9 observations uniques · 4 hooks à prélèvement > 1 bps · 5 profils non plats.**
Écrire « 9 hooks sur 11 » était faux. Un juge qui ouvre le JSON le voit en trente secondes.

## 0.4 🔴 Mes mesures ne sont pas rejouables

L'artefact ne porte **ni `pool_id`, ni `block_number`, ni horodatage, ni `stub_hash`**. Et la liquidité
n'identifie pas un pool : `997519511065749950282714` pointe vers deux hooks différents.
**Le chiffre-titre n'est donc pas traçable jusqu'à un pool identifié** — exactement la faute relevée
dans `27-AUDIT-ADVERSE.md`. Le schéma correct est au §17 ; il n'est simplement pas appliqué.

## 0.5 🔴 L'univers mesurable est minuscule, et le hook vedette est un launchpad

Sur les 199 pools liquides : **12 hooks distincts seulement**, dont **4 concentrent 181 pools (91 %)**.
« 195 hooks » n'est pas l'ensemble adressable.

Et `0xb429d62f8f…`, le hook du chiffre-titre, a la signature d'un **launchpad de memecoins Clanker** :
31 pools liquides tous appariés à WETH, tous `tickSpacing 200`, tous à frais dynamiques, avec des
paliers de liquidité identiques répétés. **Titrer « un hook prend 11,76 % » sur un pool de memecoin
dont les frais dynamiques sont publiquement documentés ne scandalisera aucun juge DeFi.**
*(attribution Clanker : **PLAUSIBLE, NON PROUVÉE** — à trancher par `eth_getCode`)*

## 0.6 🔴 LE DANGER N°1 : LPLens dit déjà, publiquement, ce que TARE promet

La fiche ETHGlobal publique de LPLens dit textuellement :
> *« replays the pool's last 1 000 mainnet swaps swap-by-swap through SwapMath.computeSwapStep
> **WITH AND WITHOUT** each candidate hook installed »*

C'est **mot pour mot la promesse de TARE, publiée, indexée, sous ton nom** — et le code ne le fait pas
(`at2.swap-replay.test.ts` teste un pool **v3 sans hook**, et `scoreHook.ts:10` dit *« NOT calibrated
against a measured backtest dataset »*).

> **Un juge qui cherche « uniswap hook with and without » tombe sur toi AVANT de tomber sur TARE.**
> **Corriger la fiche et le README de LPLens est la tâche n°1, avant le 4 septembre.**

---

# PARTIE I — CE QUI RESTE VRAI, ET C'EST SOLIDE

## 1. L'originalité de la MÉTHODE est confirmée

Grep exécuté sur **2 364 projets uniques** :
- `counter-factual` → 1 hit, sans rapport (adresse CREATE2)
- `anvil_setCode` / `vm.etch` / `hardhat_setCode` → **1 hit** : OpenPayAI, qui injecte un faux PYUSD, **jamais un hook**
- `with and without` → **1 hit**, et c'est LPLens (§0.6)

> **Aucun projet ETHGlobal ne remplace le bytecode d'un hook par un stub pour coter le même pool deux fois.**

Et `vm.etch` est documenté en v4 **dans le sens inverse** : on l'utilise pour *poser* le vrai bytecode
d'un hook à une adresse dont les 14 bits encodent les permissions (les hooks sont minés en CREATE2).
**Personne ne publie l'inversion.**
→ **Ne présente jamais `anvil_setCode` comme la trouvaille. La trouvaille est le stub conforme à `Hooks.sol`
conforme à `Hooks.sol`.**

## 2. Le trou côté Uniswap est réel, et vérifié deux fois

Sur le clone local (commit `f4db044`, 26/08) :
- `schema.json` : **19 booléens, 7 chaînes, 4 objets, UN SEUL entier (`chainId`)** — **zéro champ quantitatif** — et `additionalProperties: false` à quatre endroits
- **570 / 613 (93,0 %)** ont `vanillaSwap = false`
- **30 / 613 (4,9 %)** ont un `auditUrl`
- **613 / 613 (100 %)** ont `verifiedSource = true` → **le registre ne voit que les hooks à source vérifiée**

Et le routeur de production `uniroute-public` **exclut par défaut tout hook touchant au swap** ;
contournement = **allowlist de 348 adresses écrite à la main** ; **denylist entièrement vide**.

## 3. 🎯 LE MEILLEUR FAIT DU DOSSIER, découvert le 29/08

Uniswap recommande officiellement que les hooks **déclarent eux-mêmes** ce qu'ils prennent, via deux
events : `HookSwap(bytes32,address,int128,int128,uint128,uint128)` et `HookFee(bytes32,address,uint128,uint128)`.

Scan exécuté sur **24 000 blocs Base** (50 589 811 → 50 613 811) :
- **5 contrats distincts au total** émettent l'un ou l'autre
- dans la même fenêtre le PoolManager a émis **1 892 `Initialize`** couvrant **84 hooks distincts**
- **AUCUN de ces 84 n'émet `HookSwap` ni `HookFee`**

> **Le standard d'auto-déclaration d'Uniswap est adopté par zéro des hooks nouvellement déployés.**

Et la posture officielle est **l'auto-déclaration, jamais la mesure** : le Security Framework est un
**Google Sheet que le développeur du hook remplit lui-même**, avec le désaveu explicite
*« The Uniswap Foundation does not review, audit, or certify any submissions, scores, or implementations »*.
Les **18 outils** de leur section « Security Resources » ont été listés : **aucun ne produit un nombre**.

## 4. La phrase, corrigée et défendable

> **« Uniswap demande aux hooks de déclarer eux-mêmes ce qu'ils prennent. Sur les 84 hooks déployés
> ces 24 000 derniers blocs, zéro le fait. Alors je l'ai mesuré : j'exécute le vrai bytecode sur un
> fork, puis je le remplace par un stub inerte, et je cote le même swap deux fois. L'écart est ce
> qu'il prend. »**

C'est vrai, c'est vérifiable, et ça ne dépend d'aucun des chiffres corrigés en §0.

---

# PARTIE II — LES CONCURRENTS

| Projet | Ce qu'il fait | Prix | Ce qui nous en sépare |
|---|---|---|---|
| **HookRank** | *« earnings per hook **PER POOL** »*, volume, taux de succès, gas, score composite | 🥇 **1er sur le track Uniswap** + Best Blockscout | **La granularité (hook, pool) EXISTE DÉJÀ dans un projet primé.** Mais c'est de l'**observationnel** depuis les events du subgraph, jamais un contrefactuel. ⚠️ **« Un dashboard de hooks » n'est plus original pour ce jury. Seule la MÉTHODE l'est.** |
| **HookLens** | découverte, décodage des 14 bits, Sourcify, **et deux cotations du même swap** (`V4_HOOKS_ONLY` vs `BEST_PRICE`) | **0 prix** | comparaison **route contre route** — autre pool, autre liquidité, autres tokens. Pas de fork, pas de bytecode, pas de bloc épinglé. **La catégorie « explorateur de hooks » a déjà été jouée et a perdu.** |
| **LPLens** | multiplicateurs par famille | finaliste | §0.6 — **il revendique déjà publiquement notre promesse** |

---

# PARTIE III — LE DUEL CONTRE LES 27 FINALISTES ASYNC

**Verdict : TARE gagne 17, nul 4, perd 6.**

**Battus (17)** — Mnemosyne (962 car.), DAIO, Common OS (`howItsMade` vide), **Aegis402** (audit LLM
d'un hook v4 — *TARE mesure là où il opine*), AutoPay, Blip Market, BorrowBot, Xpack (1 322),
Oikonomos, CronPay (959), WannaBet (499), DeFlow, EthVaultPQ, Siphon Protocol, **SafeSend**,
Common-Lobbyist, OpenPayAI (854).
Axes gagnants : **Technicality** (stub 89 o conforme aux tailles de retour, `extsload` slot 6 offset +3),
**Originality** (métrique sans antécédent), **Usability** (verdict au chargement, sans wallet).

**Nuls (4)** — PulsePlay (LMSR log-sum-exp), **claw2claw** (hook v4 qui rend un `BeforeSwapDelta`,
adresse minée CREATE2 — au moins aussi pointu et plus original *dans* le domaine v4),
ChronoVault (HMAC-SHA1 en Circom/Groth16), LPLens.

**Perdus (6)** — dont Clan World, Slopstock, Magnee.

### Comment on bat les meilleurs

Leur longueur ne vient pas du remplissage : **SafeSend** (5 243 car.) détaille chaque techno partenaire ;
**Slopstock** (4 748) écrit *« eight Foundry contracts total, **83/83 tests green** »* ; **ChronoVault**
(3 852) écrit *« Groth16 »*, *« 2^14 constraints, our **492-constraint** circuit »*.
**Le motif : noms exacts, versions exactes, comptes exacts. Zéro adjectif.**

**Trois actions :**
1. **`howItsMade` de 4 500–5 500 caractères de substance pure** : le mur (`PoolKey` contient le hook) → le stub et les invariants → **le fait `HookSwap`/`HookFee` : 0 sur 84** → les mesures → **les limites** → **les corrections** → la stack avec versions et comptes.
2. **Un compte de tests à citer**, façon Slopstock : `N/N green`. Point gratuit, à ne pas perdre.
3. **Des permaliens par (hook, pool, bloc)** : chaque affirmation du texte devient un lien cliquable vers le profil mesuré. SafeSend est ouvert ; nous serons **ouverts ET vérifiables en un clic**.

⚠️ **Sur Magnee et ses 3 prix, correction :** ses prix sont `2nd place` + `Integrate ENS` + `Finalist`.
**Ce ne sont pas trois sponsors.** Donc on ne cherche pas de troisième sponsor :
**Uniswap + Hedera + le badge Finalist font la même structure à trois.** World est écarté.

---

# PARTIE IV — L'ARCHITECTURE

## 5. Le moteur (Python)

`PoolKey` contient l'adresse du hook, donc « le même pool sans son hook » n'existe pas. **On ne change
pas le pool, on change le hook** : `anvil_setCode` réécrit le bytecode **à l'adresse du hook**. Même
`poolId`, même liquidité, même `slot0`. On cote deux fois via `V4Quoter`.

**Le stub** satisfait `v4-core/src/libraries/Hooks.sol` : **96 octets** de retour pour
`beforeSwap`, **64** pour `callHookWithReturnDelta`, sélecteur réémis.
**Précision du 05/09, après portage du code :** il existe **deux** stubs valides.
Le nôtre fait **89 octets** (deux `PUSH32`, l'un pour le masque de sélecteur, l'autre pour
`beforeSwap`) et son hash `0x8e39b2ad4344342b4f7dc5cf31df0aec9bd5b5f8ec7fccd241256cf1fda637a4`
est celui inscrit dans les 128 mesures — **c'est donc lui qui fait foi.** Un contrôle indépendant a
écrit un stub minimal de **33 octets** qui satisfait les mêmes invariants ; il est plus élégant mais
changerait le `stub_hash`, donc on ne le substitue pas en cours de build.
J'avais corrigé ce point dans le mauvais sens le 29/08.

**Découverte des pools** : events `Initialize` du PoolManager `0x498581ff…`, topic `0xdd466e67…`.
**Liquidité** : `PoolManager.extsload`, `slot = keccak(poolId ‖ 6)`, **offset +3** *(dérivation validée
contre un pool connu : `365514774916937598336610`)*.

## 6. 🔴 Le graphe : **networkx, PAS Neo4j** — mesuré, pas supposé

Benchmark sur un graphe TARE synthétique à l'échelle cible (15 834 nœuds / 18 110 arêtes), médianes
sur 15–20 exécutions, **mêmes requêtes des deux côtés** :

| Requête | networkx | Neo4j 5 |
|---|---|---|
| rayon de souffle | **0,09 ms** | 4,43 ms |
| clones par bytecode | **0,06 ms** | 6,83 ms |
| allowlist & coûteux | **16,28 ms** | 22,27 ms |
| exposition tokens | 21,16 ms | **17,55 ms** |
| orphelins | **1,33 ms** | 2,70 ms |
| variance même hook | 17,78 ms | **15,20 ms** |
| clones divergents | 17,48 ms | **10,12 ms** |

**Le plancher d'un aller-retour Bolt (`RETURN 1`) est de 1,81 ms — plus cher à lui seul que trois des
sept requêtes networkx complètes.**

Coût de Neo4j mesuré : image **988 Mo**, **20,0 s** avant la première réponse HTTP, **841 MiB de RSS**,
**5,50 s** de chargement (networkx : **102 ms**). Et surtout :

> 🔴 **Neo4j ne sait pas stocker les entiers de l'EVM.** `OverflowError: Integer 582686027757716402904619787
> out of range` sur une liquidité de pool — la limite Bolt est 2⁶³−1 = 9,22 · 10¹⁸. Les `uint128` et
> `uint256` doivent être stockés **en texte**, ce qui casse les comparaisons numériques en Cypher.

**Décision : `networkx.MultiDiGraph` en process**, derrière l'interface à deux implémentations que
COBOL Explorer a déjà (`NetworkxBackend` / `Neo4jGraph`, bascule par variable d'environnement).
Neo4j reste possible comme démonstration, jamais comme moteur.

⚠️ **Bug à ne pas hériter de COBOL Explorer** : `tools()` reconstruit un `GraphTools` neuf **à chaque
requête HTTP**, ce qui reparse `graph.json`. À l'échelle TARE : **102,3 ms de CPU brûlés par appel**
alors que la requête coûte **0,09 ms**. → **mettre le graphe en cache**, comme le fichier le fait déjà
pour les `VersionStore`.

### Trois décisions de modélisation

1. **`MEASURED_AS` part du POOL, pas du HOOK.** La thèse est que le prélèvement est une propriété du
   **couple**. Accrocher les mesures au hook effacerait exactement ce que le produit démontre.
2. **`RegistryEntry` est un NŒUD, pas des propriétés du Hook.** Vérifié : **37 couples (adresse, chainId)
   portent deux fiches, dont 10 aux flags contradictoires.** *« Ce hook a deux fiches qui se contredisent »*
   devient une requête.
3. **Un nœud `(:Bytecode)` en étoile, pas des arêtes `SAME_BYTECODE` en clique.** Mesuré :
   **356,69 ms en clique contre 10,12 ms pré-agrégé.**

## 7. Le lien graphe → vecteur (repris tel quel de COBOL Explorer)

`chunk_corpus()` ne vectorise pas la source brute : il **préfixe chaque document d'un en-tête dérivé
du graphe** avant les 6 000 premiers caractères. **Le graphe nourrit l'index vectoriel.**
Stockage : `pgvector`, index **HNSW** `vector_cosine_ops`, aucun DDL dans la connexion (pour tourner
en lecture seule), vecteurs passés en littéraux `::vector`.

## 8. L'assistant qui pilote le site

Chat en bas à droite. **Il ne rend pas du texte : il rend des actions typées validées par Zod.**

`filter({minBps, chain, flag, label, allowlisted})` · `sort` · `highlight([hooks])` ·
`open(hook, pool)` · `plotCurve(hook, pool)` · `compare(A, B)` · `measure(...)` ← **facturée en x402**

Trois sources selon la nature de la question : **networkx** (structure), **Postgres** (grandeurs),
**pgvector** (prose). Flux SSE. `ai-service` de CorLens côté serveur (embedding, complétion, HMAC,
journal de prompts) + la comptabilité d'usage qui **est** le compteur Hedera.

**Pourquoi ce n'est pas un gadget :** le tableau a une dizaine de dimensions. Une UI de filtres pour
tout ça est soit illisible soit bridée. **C'est la combinatoire qui impose le langage naturel**, comme
c'est le débit qui impose l'échantillonneur adaptatif.

> **RÈGLE D'OR, dans le README : le modèle choisit quoi interroger et explique ce qui revient.
> Il ne produit JAMAIS un nombre.**

**Le moment de la démo :** *« montre-moi les hooks autorisés par défaut dans le routeur de production
d'Uniswap qui prennent plus de 100 points de base »* → le tableau se réduit → on ouvre une ligne →
la courbe se dessine. **Sans un clic.**

---

# PARTIE V — LE FRONT

## 9. 🔴 Le verdict qui dérange : ta boîte à outils est calibrée pour un autre produit

Awwwards, Unicorn.studio, Spline, Rive, Paper, Meshy, ShaderGradient, Haikei, Matter.js : ce sont les
outils du **site marketing scrollytellé**. La catégorie « Data Visualization » d'Awwwards le prouve —
**3 des 4 fiches ouvertes sont des landings Framer**. Aucun ne rend un verdict en moins de 5 secondes.

Deux obstacles concrets vérifiés :
- **react-bits** est sous **MIT + Commons Clause** : *« so long as you do not sell, sublicense, or redistribute the components themselves »* → **incompatible** avec le dépôt open source exigé par Uniswap. **Écarté.**
- **Unicorn.studio** appose un **watermark** sur le plan gratuit ; l'auto-hébergement est réservé aux abonnés. **Écarté.**

## 10. Les références retenues

1. 🔴 **CORRIGÉ LE 29/08 — CES CITATIONS N'ONT PAS PU ÊTRE RETROUVÉES.**
   J'avais attribué à `usgraphics.com` un manifeste (*« Dense, not sparse »*, *« Verbosity over
   opacity »*, *« Don't infantilize users »*). **`usgraphics.com/manifesto` renvoie 404**, le sitemap
   n'en contient aucune trace, et la recherche sur les phrases exactes ne retrouve rien.
   **NE PAS coller ces phrases dans un `DESIGN.md` public.**
   Remplacement **citable et sous licence BSD-3-Clause** (dépôt `usgraphics/usgc-machine-report`) :
   *« Tabular, short, clear and concise. »* · *« No emojis … No colors (as default) »*.
   Et le dépôt **`usgraphics/usgc-themes` est en BSD-3-Clause** : les vraies couleurs de US Graphics
   sont réutilisables légalement.
   ⚠️ **Berkeley Mono est doublement disqualifiée** : sa licence dit explicitement
   *« Commercial licenses are not compatible with open-source apps »*.
2. **js-framework-benchmark** — **la matrice**. Cellule à trois étages : la valeur, l'incertitude, le
   ratio. Le fond de cellule encode le ratio et **rien d'autre**.
   Pour TARE : `1176` / `±0` / `(bloc 50550000)`.
3. **wc26.bogachev.fr** — le seul vrai instrument des 4 fiches Awwwards ouvertes.
4. **Ciechanowski** — la prose où le mot *« curve »* est rouge **parce que la courbe est rouge**.
5. **Tableau de bord EIA d'Observable** — aucune couleur décorative.

## 11. La stack front, tranchée sur des poids mesurés

Poids npm décompressés : **recharts 7 278 Ko** · gsap 6 111 · lightweight-charts 3 022 ·
**motion 667** · **uplot 532** · **d3-scale 170** · **@tanstack/react-table 131**.
**Tirer Recharts (7,3 Mo) pour tracer 5 points est indéfendable.**

**Retenu :** Vite + React + Tailwind + **shadcn/ui** (MIT, copié dans le dépôt) +
**@tanstack/react-table** (le tableau dense) + **uPlot** ou **Canvas nu** (la courbe) +
**d3-scale** (les échelles) + **motion** (les transitions d'état du tableau).
**Écartés :** Recharts, GSAP, Three.js/R3F, react-bits, Unicorn.studio, Spline, Rive.
Pas de 3D : **il n'y a aucune donnée spatiale dans ce produit.**

## 12. 🔴 La courbe ment par défaut — et c'est un piège à honnêteté

Les 5 tailles sont espacées d'une **décade** (0,0001 → 1 ETH) et les amplitudes sont faibles devant la
valeur : `0xb429d6` va de 1 176,46 à 1 080,29 bps, soit **8,2 % de variation**.

> Un **axe X linéaire** écrase 4 points sur 5 contre le bord gauche.
> Un **axe Y auto-zoomé** transforme 8 % en falaise.

**Règles obligatoires :** axe X **logarithmique** · axe Y **ancré à 0** par défaut, avec le zoom en
option **explicitement étiquetée** · les 5 points **toujours visibles comme points**, jamais lissés en
spline · l'incertitude affichée. **Une courbe qui exagère est un mensonge, et c'est exactement ce que
le produit dénonce.**

## 13. Le widget gratuit et exact

**Vérifié sur la totalité du corpus : les 14 flags de permission SONT les 14 bits de poids faible de
l'adresse du hook — 8 974 correspondances sur 8 974, ZÉRO écart.**
→ « colle une adresse → 14 LED s'allument » est **100 % client, sans RPC, sans backend, latence nulle,
et rigoureusement exact**. C'est la première image de la page.

---

# PARTIE VI — LA STACK & LES DONNÉES

## 14. Le monorepo

```
tare/
├─ engine/                 # PYTHON
│  ├─ discover.py          # logs Initialize → PoolKeys
│  ├─ liquidity.py         # extsload : keccak(poolId‖6) + 3
│  ├─ measure.py           # anvil_setCode + V4Quoter, taille × sens
│  ├─ stub.py              # le stub 89 o + validation contre Hooks.sol
│  ├─ graph/               # ← COBOL Explorer : networkx, impact/lineage/orphans (EN CACHE)
│  └─ sampler.py           # échantillonneur adaptatif
├─ apps/
│  ├─ api/                 # HONO ← GuardLens · x402 Hedera · usage ← CorLens · HCS
│  ├─ web/                 # VITE + REACT ← GuardLens
│  ├─ ai-service/          # ← CorLens : embedding, complétion, HMAC, prompt-log
│  └─ mcp/                 # 4 outils
├─ packages/{contracts,db} # ZOD ← CorLens · DRIZZLE ← GuardLens
└─ docker-compose.yml
```

**Docker :** `pgvector/pgvector:pg16` (639 Mo) · `ghcr.io/foundry-rs/foundry` (N anvil) ·
`redis:7-alpine` (61,9 Mo). **Pas de Neo4j.**

⚠️ **Le poste de dépense obligatoire : un RPC Base payant.** Mesuré : **8,96 s** par cotation à froid
contre **0,01 s** à chaud ; les RPC publics ont rendu **1 835 échecs sur 2 286**.

## 15. Le schéma de mesure — appliqué cette fois

```sql
CREATE TABLE measurement (
  id bigserial PRIMARY KEY,
  hook bytea NOT NULL, pool_id bytea NOT NULL, chain_id int NOT NULL,
  block_number bigint NOT NULL,          -- sans ça, rien n'est rejouable
  amount_in numeric NOT NULL, zero_for_one boolean NOT NULL,
  out_with numeric, out_without numeric, bps numeric,
  fee_is_dynamic boolean NOT NULL,       -- §0.2
  label text NOT NULL,                   -- MESURE | INTERPOLE | NON_MESURABLE | NON_COTABLE
  reason text, observed_at timestamptz NOT NULL DEFAULT now(),
  stub_hash bytea NOT NULL, engine_ver text NOT NULL
);
```

---

# PARTIE VII — LE PLAN

## 16. J0 — avant le 4 septembre (aucun code)

- [ ] 🔴 **Corriger la fiche ETHGlobal ET le README de LPLens** (§0.6). **Tâche n°1.**
- [ ] 🔴 **Trancher les frais dynamiques** (§0.2) : soit ne titrer que sur des pools **statiques**, soit faire renvoyer au stub le **dernier `lpFee` réellement appliqué** (lu par `extsload`) et publier **les deux références côte à côte**.
- [ ] 🔴 **Re-générer les mesures avec le schéma complet** (§15) — `pool_id`, `block_number`, `stub_hash`.
- [ ] Corriger tous les comptages dans tous les textes (§0.3).
- [ ] Trancher l'identité de `0xb429d62f8f…` par `eth_getCode` (§0.5).
- [ ] RPC Base payant. Compte Hedera testnet financé + aller-retour **Blocky402** à la main.

## 17. J1 → J7

| Jour | Ce qui se termine | Le test |
|---|---|---|
| **J1** | Élucider les **77,6 %** non cotables. Mesurer les pools à **frais statiques**. Schéma appliqué. | ≥ 5 profils sur pools statiques, tous rejouables |
| **J2** | Balayage taille × sens. **Clones par bytecode** (nœud en étoile) + déployeurs. | ≥ 200 mesures, ≥ 10 courbes non plates, ≥ 1 grappe de clones |
| **J3** | Le front : widget 14 LED, matrice dense, fiche + courbe (axe X log, Y ancré à 0). | verdict à l'écran **sans un clic**, < 1,5 s à froid |
| **J4** | x402 Hedera + Blocky402 + compteur d'usage + journal HCS + **MCP 4 outils**. | un tiers paie et reçoit ; hash HashScan affiché |
| **J5** | Graphe **en cache** (impact, twins, orphans) + pgvector + échantillonneur + **assistant**. | l'assistant filtre le tableau à la voix ; un inconnu reproduit un chiffre |
| **J6** | Gel. `FEEDBACK.md`, formulaire Uniswap, README pointant contrats et lignes, **PR sur le schéma hooklist**, attribution IA, specs commitées, **compte de tests**. | soumission remplissable en entier |
| **J7** | La vidéo seule. | **entre 2 min 10 et 3 min 40** |

---

# PARTIE VIII — LA VIDÉO

**2 à 4 minutes. Hors fenêtre = rejet automatique.** *(Hedera demande ≤ 5 min : une seule vidéo suffit.)*

| Temps | Plan |
|---|---|
| 0:00–0:05 | Logo animé — **même effet qu'à l'outro** |
| 0:05–0:20 | L'accueil à froid, sans rien toucher. Les **14 LED** s'allument sur une adresse collée |
| 0:20–0:50 | **Le fait** : *« Uniswap demande aux hooks de déclarer ce qu'ils prennent. Sur 84 hooks déployés en 24 000 blocs, zéro le fait. »* |
| 0:50–1:30 | La mesure : le stub remplace le hook, la cotation change. **La courbe** se dessine |
| 1:30–2:05 | Le même hook sur deux pools — l'écart |
| 2:05–2:35 | **La preuve en direct** dans un terminal : la commande, le même nombre |
| 2:35–3:00 | **L'assistant** : une phrase tapée, le tableau se reconfigure. Puis un agent paie en x402 sur Hedera, hash HashScan |
| 3:00–3:15 | **La page « ce que je ne sais pas »** — limites, frais dynamiques, corrections. Logo, même effet |

**Le dernier plan est celui qui gagne.** Aucun des 27 finalistes async ne l'a tourné.

**Production :** **OpenScreen** (open source, sans watermark, zooms auto) → la démo sort montée ·
voix off séparée puis **Descript** · **une seule famille d'effets** · **même animation intro/outro** ·
sous-titres brûlés · vérifier la durée **avant** l'export.

---

# PARTIE IX — LES TROIS CHOSES QUI DÉCIDENT

1. **Corriger la fiche LPLens.** Sans ça, un juge trouve notre promesse chez nous, non tenue.
2. **Trancher les frais dynamiques.** Sans ça, le chiffre-titre est indéfendable en une question.
3. **Rendre les mesures rejouables.** C'est la promesse centrale du produit, et l'artefact actuel ne la tient pas.

---

# PARTIE X — LES ACTIONS (ajouté le 29/08)

## 18. Pourquoi c'est le sujet numéro un

**0 des 27 finalistes async est un instrument de lecture seule. 27 sur 27 livrent une action.**
Et dans le domaine des hooks, les projets purement analytiques perdent systématiquement :
HookLens 0 prix · **Baywatch 0 prix — alors qu'il faisait déjà une démo contrefactuelle** ·
ToxicFlow 0 · NeuralHook 0 · HookWizard 0.

> **TARE doit se terminer par « ne signe pas ça », pas par « voici un nombre ».**

## 19. Le catalogue, par rendement décroissant

### A. 🥇 LA GARDE À LA SIGNATURE — extension + SDK
Le patron **Magnee**, qui lui a rapporté **3 prix** (interception EIP-6963 + piège `Object.defineProperty`).
On intercepte un swap v4 **avant** la signature, on décode la `PoolKey` dans le calldata pour en extraire
l'adresse du hook, on interroge TARE, et on affiche :
> *« Ce hook prend **175 bps** à ta taille, mesuré au bloc 50 550 000. Continuer ? »*

**Pourquoi c'est la meilleure :** ça convertit la mesure en protection, ça produit un artefact que des
gens **installent**, et ça attaque d'un coup les trois axes où on perd (Practicality, WOW, l'action).

### B. 🥈 LA ROUTE SÛRE
Pour une paire de tokens, **recommander le pool dont le hook prend le moins**.
C'est une action — elle change ce que tu fais — et elle s'appuie directement sur la thèse du couple
(hook, pool) : le **même** hook prend dix fois plus sur un pool que sur un autre.
Elle nous place aussi sur le terrain de **router402**, contre qui on perd aujourd'hui.

### C. 🥉 LE SDK PUBLIÉ
`npm i @tare/guard` + un paquet Python, versionnés. Trois lignes à poser avant un swap v4.
Patron **GrimSwap**, qui a publié un SDK npm.

### D. LA VEILLE SUR LES HOOKS MODIFIABLES
**Mesuré : 22 des 613 fiches (3,6 %) sont `upgradeable`.** Un hook audité aujourd'hui peut changer de
comportement demain. TARE re-mesure et **alerte quand le profil de prélèvement change**.
À croiser avec `swapAccess` : **468 `none` · 64 `governance` · 33 `temporal` · 30 `other` · 18 `allowlist`**
— donc **145 hooks (23,7 %) ont un accès au swap conditionnel**, dont l'effet est invisible dans un booléen.

### E. LE BADGE DÉCLARÉ-vs-MESURÉ
Uniswap demande aux hooks de déclarer via `HookSwap` / `HookFee` ; **0 des 84 hooks déployés en
24 000 blocs ne le fait**. TARE délivre un badge à ceux qui déclarent **et dont la déclaration
correspond à la mesure**. C'est l'action qui prolonge le meilleur fait du dossier.

### F. LA PR SUR LE SCHÉMA `hooklist`
Ajouter le champ numérique qui manque. Artefact expédié chez le sponsor, lecture littérale de
*« improvements to official Uniswap repositories »*.

## 20. Ce qu'on retient

**A + C + F au minimum** — la garde, le SDK qui la distribue, la PR qui contribue.
**B et D si l'avance le permet**, tranchés à J3.
**E est gratuit** une fois le scan `HookSwap`/`HookFee` fait : c'est une colonne de plus dans le tableau.

Et la vidéo se termine sur **une transaction bloquée**, pas sur un tableau.

## 21. Les deux surfaces (correction du §9)

Le rejet d'Awwwards était **trop large**. Ce qui a été mesuré, c'est que la catégorie
*« Data Visualization »* est décevante (3 landings Framer sur 4 fiches) — pas qu'Awwwards soit
inadapté à une **page de présentation**. Et LPLens le prouve : il avait **une page de présentation
ET un outil**, avec un MCP en service.

| Surface | Ambition | Registre |
|---|---|---|
| **`tare.xyz`** | **Awwwards** | la thèse en dix secondes, le mouvement, la mise en scène |
| **`tare.xyz/hooks`** | **usgraphics** | dense, monospace, aucune décoration, la couleur n'encode qu'une grandeur |

Le seul endroit où l'on met du spectacle est le lien entre les deux : **la courbe qui se dessine** sur
la page de présentation, puis qui devient interactive dans l'instrument.

## 22. 🔴 Correction sur LPLens — je m'étais trompé

Le champ `demo` de la soumission LPLens contient
`github.com/JeanBaptisteDurand/Open_Agent_2026` — **pas `lplens.xyz`**.
Le site tournait, avec son MCP et sa page de présentation. **L'erreur n'était pas « pas de démo »,
c'était de ne pas avoir mis l'URL vivante dans le champ prévu.** Une ligne, un point gratuit.

Et LPLens a été noté **orig 8 · prac 8 · tech 9**. C'est la référence à battre, pas un contre-exemple.

---

# PARTIE XI — VALIDATION INDÉPENDANTE DU MOTEUR (29/08)

## 23. ✅ Le moteur est reproduit à la quatrième décimale

Un contrôle indépendant a **réécrit le moteur de mesure de zéro** — stub différent, code différent —
sur un fork Base au bloc **50 614 000**, et obtenu :

```
[ 99,99 · 99,93 · 99,26 · 93,10 · 57,44 ] bps
```

**Exactement la ligne 8 de `research/tare-mesures.json`.** Le moteur est réel, la méthode est juste,
et elle est reproductible par quelqu'un d'autre. C'est la propriété centrale du produit, et elle est
maintenant démontrée par un tiers.

## 24. 🎯 DÉBLOCAGE 1 — les « 77,6 % non cotables » sont UNE seule erreur nommée

`0x6190b2b0` = `UnexpectedRevertBytes` enveloppant `0x7a5ed734` = **`NotEnoughLiquidity(PoolId)`**
(`BaseV4Quoter.sol:16`, condition lignes 52-56). **100 % des 97 échecs** sur 252 observations.

Et surtout : **le même pool cote dans un sens et pas dans l'autre.**

> **La cotabilité passe de 11 % à 54,7–65,3 % dès qu'on balaye les deux sens.**

Ce n'était pas un mur, c'était un sens de swap manquant.

## 25. 🎯 DÉBLOCAGE 2 — LA NOUVELLE PHRASE-TITRE, inattaquable

Il y a **32 pools liquides à frais statiques, dont 31 à `fee = 0`**. Sur frais statique, `parseFee()`
n'est jamais lu : **le contrefactuel est mathématiquement propre**, sans aucune ambiguïté de référence.

Balayage complet exécuté (**128 observations**) :

> **`0x985c14ba…` prend 95,8 à 100 bps sur des pools qui affichent ZÉRO frais LP.**
> Deux autres hooks y prennent **exactement 0,0**.

**C'est le titre.** Un hook qui prélève ~1 % sur un pool annoncé à 0 % de frais, mesuré sur la
catégorie où la méthode est incontestable. Plus besoin de défendre les frais dynamiques.

## 26. Trouvaille opérationnelle qui sauve une journée

`api.blocky402.com` **ne sert que `hedera:mainnet`**. Le testnet est sur
**`https://api.testnet.blocky402.com`**, feePayer **`0.0.7162784`** — **non documenté sur le site de
Blocky402**. Sans cette URL, J4 se passe à déboguer un DNS.

## 27. Les manques de spécification, nommés

| Domaine | Verdict | Ce qui manque |
|---|---|---|
| **Moteur** | ✅ complet | 6 champs de spec : `stored_lp_fee`, `revert_selector`, sens obligatoire, `hookData`, multi-hop hors périmètre |
| **ACTION** | ⚠️ partiel | **Mesurer en direct est impossible (9,087 s à froid)** → l'extension consulte une **table pré-calculée**. Le hook est lisible aux octets `0xa0..0xc0` de `params[j]`, décalage indépendant de la version d'ABI. Extension **1,5–2 j** · SDK **2 h** · PR hooklist **3 h** |
| **Assistant** | ⚠️ partiel | **7 commandes listées, 13 manquantes** (vues de graphe, `reset`, `columns`, `showEvidence`, `clarify`). Et une contradiction : **`measure` facturée en x402 depuis le navigateur est impossible** — aucun visiteur n'a de compte Hedera. → **x402 garde l'API et le MCP ; le chat a un quota.** |
| **MCP / x402 / HCS** | ⚠️ partiel | `@x402/hono`, `@x402/hedera`, `@x402/mcp` en 2.23.0. **Compteur et journal HCS non spécifiés** : unité, prix, schéma de message, coût |
| **Graphe** | ⚠️ | décision solide, mais **le schéma nœuds/arêtes a été perdu entre le doc 33 et le doc 34**, et **le corpus vectoriel n'est nommé nulle part — c'est exactement comme ça qu'on refait `void ragIndex;`** |

## 28. Le plan d'exécution

**9 lots parallélisables** — A, B, D, E immédiats · C, F, G, H en deuxième vague · I ferme.

**Pièges d'infrastructure vérifiés :**
- l'image foundry a `ENTRYPOINT ["/bin/sh","-c"]` → **`command:` doit être une chaîne unique**
- le volume `foundry_cache:/home/foundry/.foundry/cache` transforme **9,087 s en 0,046 s**

**Les portes de vérification** — une commande binaire par lot. Les deux non négociables :
- **A3** compare 5 nombres à 5 nombres obtenus indépendamment → **un agent ne peut pas la truquer**
- **H3** exige un paiement Hedera réel avec son `transactionId`

**Tests : ≈157 en 18 suites**, agrégés par `make test` en une ligne citable, **zéro test réseau dans le compte**.

**Calendrier :** J0 débloqué (8 tâches, 3 supprimées car déjà résolues) · **J1 = les agents font le back
et l'ops** · J2 = couverture (**2 000 observations ≈ 1 minute de calcul sur 4 anvil** — l'échantillonneur
adaptatif devient un argument de conception, pas une contrainte) · **J3–J5 = l'humain sur le front** ·
J6 gel · J7 vidéo. Ordre de coupe explicite ; **l'extension est conditionnée aux portes de J5**.

Détail complet : **`36-PLAN-EXECUTION.md`** (1 127 lignes).

---

# PARTIE XII — LA FIGURE DU PRODUIT (31/08)

## 29. Ce que le registre dit, face à ce qu'on a mesuré

Les quatre hooks mesurés, tirés de `repos/sponsor-uniswap-hooklist/hooklist.json` (champ `hook`) :

| Hook | **Ce que le registre dit** | **Ce qu'on a mesuré** |
|---|---|---|
| `0xb429d62f8f…` | `vanillaSwap=false` · `dynamicFee=true` · `swapAccess=none` · `upgradeable=false` · **audit : AUCUN** | **jusqu'à 1 176 bps** |
| `0xbdf938149a…` | `vanillaSwap=false` · `dynamicFee=true` · `swapAccess=none` · `upgradeable=false` · **audit : AUCUN** | **175 bps sur un pool, 105 sur un autre** |
| `0x1aea38f06d…` | `vanillaSwap=false` · `dynamicFee=true` · `swapAccess=none` · `upgradeable=false` · **audit : AUCUN** | **100 → 57 bps selon la taille** |
| `0x985c14baa2…` | `vanillaSwap=false` · **`dynamicFee=false`** · **`swapAccess=temporal`** · `upgradeable=false` · **audit : AUCUN** | **95,8 à 100 bps sur des pools à FRAIS ZÉRO** |

> **Le registre les décrit de façon quasi identique. La mesure les sépare d'un facteur 12.**
> **Et aucun des quatre n'a d'audit.**

Trois des quatre portent exactement le même jeu de flags actifs
(`beforeInitialize, beforeAddLiquidity, beforeSwap, afterSwap, beforeSwapReturnsDelta, afterSwapReturnsDelta`).
**Le booléen ne discrimine rien.**

**Deux détails qui renforcent le titre :**
- `0x985c14baa2…` porte **`dynamicFee = false`** dans le registre officiel — **confirmation indépendante**
  que c'est un hook à frais statiques, donc que son contrefactuel est le cas propre. Et il prend
  ~100 bps sur des pools qui affichent **zéro frais LP**.
- Il porte aussi **`swapAccess = temporal`** : son accès au swap est **conditionnel**, ce qu'aucun
  nombre du registre ne peut exprimer. *(145 hooks sur 613, soit 23,7 %, sont dans ce cas.)*

**C'est la figure d'ouverture du site et le plan 2 de la vidéo.** Quatre lignes, une description
identique, une réalité qui varie d'un facteur 12, zéro audit.

## 30. 🔴 Erreur du 31/08, corrigée immédiatement

J'avais annoncé que ces hooks étaient **absents du registre**. **Faux** : le champ s'appelle `hook`,
pas `address`, et les quatre y sont. Vérifié avant publication. *(Quatrième fois qu'un contrôle
m'évite une affirmation fausse — la discipline tient.)*

## 31. J0 mis à jour — ce qui reste à 4 jours du départ

| Tâche | État |
|---|---|
| 🔴 **Corriger la fiche ETHGlobal + le README de LPLens** | **OUVERT — tâche n°1, et toi seul peux la faire** (c'est ton compte) |
| 🔴 **Re-générer les mesures au schéma complet** (`pool_id`, `block_number`, `stub_hash`, `stored_lp_fee`) | **OUVERT** |
| Corriger tous les comptages dans les textes | **OUVERT** |
| **RPC Base payant** | **OUVERT — poste de dépense obligatoire** |
| Compte Hedera testnet financé + aller-retour Blocky402 | **OUVERT** (URL testnet trouvée : `api.testnet.blocky402.com`, feePayer `0.0.7162784`) |
| ~~Trancher les frais dynamiques~~ | ✅ **LEVÉ** — l'alerte était fausse (`Pool.sol:303-305`) |
| ~~Élucider les 77,6 % non cotables~~ | ✅ **LEVÉ** — `NotEnoughLiquidity`, et le balayage des deux sens porte la cotabilité à **54,7–65,3 %** |
| ~~Identifier `0xb429d62f8f…`~~ | ✅ **FAIT** — 16 405 octets, au registre, sans audit |

---

# PARTIE XIII — L'AGENTIC RAG : DEUX RAG + LA VÉRITÉ CHIFFRÉE

> Cette partie restaure le schéma perdu entre les docs 33 et 34, et nomme le corpus vectoriel —
> l'omission qui produit exactement les bugs `void ragIndex;`.

## 32. Trois surfaces, une par nature de question

| Surface | Moteur | Ce qu'elle répond | Exemple |
|---|---|---|---|
| **RAG de graphe** | `networkx.MultiDiGraph` en process, **en cache** | la **structure** | *« ce hook a-t-il des jumeaux ? qui l'a déployé ? qu'est-ce qui casse ? »* |
| **RAG vectoriel** | **pgvector**, index **HNSW**, `vector_cosine_ops` | la **prose** | *« que dit le code / l'audit de ce hook ? »* |
| **Vérité chiffrée** | **Postgres**, table `measurement` | la **grandeur** | *« combien, à quelle taille, à quel bloc ? »* |

Postgres n'est pas un RAG : c'est le socle. **Aucun nombre ne sort jamais d'un modèle.**

## 33. Le schéma du graphe (restauré)

**Nœuds** — `Hook` · `Bytecode` · `Pool` · `Token` · `Deployer` · `Measurement` · `RegistryEntry` · `AllowlistEntry`

**Arêtes** — `ATTACHED_TO` (Hook→Pool) · `HOLDS` (Pool→Token) · `DEPLOYED_BY` (Hook→Deployer) ·
`HAS_BYTECODE` (Hook→Bytecode) · `MEASURED_AS` (**Pool**→Measurement) · `LISTED_IN` (Hook→RegistryEntry) ·
`ALLOWED_IN` (Hook→AllowlistEntry)

**Trois décisions de modélisation, chacune justifiée par une mesure :**

1. **`MEASURED_AS` part du POOL, pas du HOOK.** La thèse est que le prélèvement est une propriété du
   **couple** — 1 176 / 157 / 120 bps pour le même `0xb429d62f8f`. L'accrocher au hook effacerait
   exactement ce que le produit démontre. **Le schéma encode la thèse.**
2. **`RegistryEntry` est un NŒUD, pas des propriétés du Hook.** Mesuré : **37 couples (adresse, chainId)
   portent deux fiches, dont 10 aux flags contradictoires.** *« Ce hook a deux fiches qui se
   contredisent »* devient une requête au lieu d'une donnée jetée.
3. **`Bytecode` est un nœud en étoile, pas des arêtes `SAME_BYTECODE` en clique.** Mesuré :
   **356,69 ms en clique contre 10,12 ms pré-agrégé.** Une famille de *k* clones passe de
   *k(k−1)/2* arêtes à *k*.

**Pourquoi networkx et pas Neo4j** — mesuré sur un graphe à l'échelle cible (15 834 nœuds / 18 110 arêtes) :
networkx gagne ou fait jeu égal sur les 7 requêtes, le seul aller-retour Bolt coûte **1,81 ms** — plus
que trois requêtes networkx complètes — et **Neo4j refuse les entiers de l'EVM** (`OverflowError` sur
une liquidité de 5,8 · 10²⁶, limite Bolt 2⁶³−1).
⚠️ **Le graphe doit être mis en cache** : le bug hérité de COBOL Explorer reparse `graph.json` à chaque
requête HTTP, soit **102,3 ms de CPU brûlés** pour une requête qui coûte **0,09 ms**.

## 34. Le corpus vectoriel, nommé explicitement

| Document indexé | Volume | Pourquoi |
|---|---|---|
| Source Solidity des hooks à `verifiedSource = true` | ~3 % de la population | expliquer *pourquoi* un hook prélève |
| Les fiches `RegistryEntry` en texte | 613 | confronter la description à la mesure |
| Les rapports d'audit référencés par `auditUrl` | **30 sur 613 (4,9 %)** | contexte de sûreté |
| Les briefs sponsors et la doc v4 (`Hooks.sol`, `Pool.sol`) | quelques fichiers | ancrer les explications de méthode |

**La technique reprise de COBOL Explorer** (`ingestion/chunk.py:14-53`) : on ne vectorise **pas** la
source brute. Chaque document est **préfixé d'un en-tête dérivé du graphe** (pools attachés, jumeaux,
déployeur, mesures) avant les 6 000 premiers caractères. **Le graphe nourrit l'index vectoriel.**

## 35. L'agent : il planifie, il exécute, il pilote — il ne calcule jamais

```
question → planificateur → graphe (structure) + Postgres (grandeurs) + pgvector (prose)
        → résultats → narration + commandes UI typées (Zod)
```

**20 commandes**, dont les 7 déjà spécifiées (`filter`, `sort`, `highlight`, `open`, `plotCurve`,
`compare`, `measure`) et **13 à écrire** : les vues de graphe (`showTwins`, `showBlastRadius`,
`showDeployer`, `showAllowlist`, `showContradictions`, `showOrphans`), `reset`, `columns`,
`showEvidence`, `clarify`, `export`, `permalink`, `explain`.

⚠️ **Correction : `measure` ne peut pas être facturée en x402 depuis le navigateur** — aucun visiteur
n'a de compte Hedera. **x402 garde l'API et le MCP ; le chat a un quota.**

> **RÈGLE D'OR, en tête du README : le modèle choisit quoi interroger et explique ce qui revient.
> Il ne produit JAMAIS un nombre.** Chaque valeur porte son bloc, sa taille, son sens, et se rejoue
> en une commande.

---

# PARTIE XIV — ✅ LE TITRE EST VERROUILLÉ (01/09)

## 36. Les mesures sont enfin canoniques et rejouables

Tâche J0 close. `tools/canonise.py` → **`research/tare-measurements-v1.json`** :
**128 mesures, 32 pools distincts**, chacune portant `pool_id` (dérivé par keccak de la `PoolKey`),
`block_number = 50 614 000`, `chain_id`, `currency0/1`, `key_fee`, `tick_spacing`, `fee_is_dynamic`,
**`stored_lp_fee` lu on-chain**, `stored_protocol_fee`, `zero_for_one`, `amount_in`, `out_with`,
`out_without`, `bps`, `label`, `reason`, **`stub_hash = 0x8e39b2ad…`**, `engine_ver`, `observed_at`.

**Chaque ligne se rejoue.** C'était la promesse centrale du produit ; elle est tenue.

## 37. 🎯 Le frais LP stocké est vérifié on-chain — le titre est irréfutable

Lecture de `slot0` via `extsload` (bits 208-231 = `lpFee`) pour les 32 pools :

| `stored_lp_fee` lu on-chain | mesures |
|---|---|
| **0** | **124 / 128** |
| 10 000 | 4 |

> **60 mesures montrent un prélèvement supérieur à 1 bps sur des pools dont le frais LP,
> lu on-chain, est EXACTEMENT ZÉRO.**
> **min 94,14 · médiane 99,96 · max 100,00 bps.**

Ce n'est plus « peut-être le frais dynamique ». Le pool annonce **zéro**, et le hook prend **1 %**.

## 38. Deux hooks, et ils illustrent les DEUX défauts du registre

| Hook | Mesuré | Ce que le registre en dit |
|---|---|---|
| `0x985c14baa2…` | **95,76 → 100,00 bps** · 52 mesures / **25 pools** | présent, `dynamicFee=false` *(confirme notre cas propre)*, `swapAccess=temporal`, **aucun audit** |
| `0xdda9bc41e3…` | **94,14 → 100,00 bps** · 8 mesures / 2 pools | **ABSENT DU REGISTRE OFFICIEL** |

> **Le registre a deux défauts, et une seule figure les montre tous les deux :
> il décrit sans quantifier, et il ne voit pas tout.**

## 39. LA PHRASE FINALE

> **« Uniswap demande à ses hooks de déclarer eux-mêmes ce qu'ils prennent. Sur les 84 hooks déployés
> ces 24 000 derniers blocs, zéro le fait. Alors je l'ai mesuré : deux hooks prélèvent 1 % de votre
> swap sur des pools dont le frais, lu on-chain, est zéro. L'un est décrit au registre officiel sans
> qu'aucun chiffre n'y figure ; l'autre n'y est pas du tout. 60 mesures, 32 pools, bloc 50 614 000,
> rejouables en une commande. »**

Chaque nombre de cette phrase a été exécuté sur cette machine, et le moteur a été reproduit
indépendamment à la quatrième décimale.

---

# PARTIE XV — BLOCKY402 : VÉRIFIÉ (01/09)

## 40. Les deux facilitateurs, réponses brutes

**`https://api.blocky402.com/supported`** — mainnet uniquement :
```json
{"kinds":[{"x402Version":2,"scheme":"exact","network":"hedera:mainnet",
           "extra":{"feePayer":"0.0.10571514"}}],
 "signers":{"hedera:*":["0.0.10571514"]}}
```

**`https://api.testnet.blocky402.com/supported`** — **non documenté sur le site de Blocky402** :

| network | scheme | feePayer |
|---|---|---|
| `eip155:80002` (Polygon Amoy) | exact | — |
| `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | exact | `7B6Q2Mvc…` |
| **`hedera:testnet`** | **exact** | **`0.0.7162784`** |

`signers` : `{"eip155:*":["0xDCF7D72C…"], "solana:*":["7B6Q2Mvc…"], "hedera:*":["0.0.7162784"]}`

> ✅ **Le brief Hedera est satisfaisable sur testnet, gratuitement.**
> Endpoint : `https://api.testnet.blocky402.com` · network `hedera:testnet` · feePayer `0.0.7162784`.
> **Aucune obligation de passer en mainnet.**

## 41. 🔴 Erreur de ma part, du 01/09

J'ai d'abord annoncé que le facilitateur testnet **ne servait pas Hedera** et qu'il faudrait donc
travailler en mainnet avec du vrai HBAR. **Faux.** Mon appel de contrôle tronquait la réponse à
**220 octets**, ce qui coupait juste avant l'entrée `hedera:testnet`. La réponse complète confirme
l'agent au caractère près.

**Leçon retenue et applicable au produit : ne jamais conclure sur une réponse tronquée.** C'est
exactement le mécanisme qui avait fabriqué le faux exemple `gridpulse` du doc 27
(`sorted(...)[:3]`) et le faux « 17,3 % » de la sonde x402 (corps lus sur 2 000 octets).
**Trois fois le même bug. Il doit être écrit dans le README comme un piège de méthode.**

---

# PARTIE XVI — LEDGER : LE TROISIÈME SPONSOR, SOUS CONDITION (03/09)

## 42. Pourquoi celui-là et pas les autres

Le brief Ledger (`developers.ledger.com/ethonline`) nomme **mot pour mot** les deux pièces que TARE
prévoyait déjà :

> *« Agents that pay for APIs, tools, or services with Ledger-secured payment flows, including
> **x402-style patterns** »* → **le guichet Hedera**
> *« **Human-in-the-loop agents where Ledger approves high-risk actions before funds move** or
> permissions escalate »* → **la garde à la signature**

Et sa barre d'évaluation est notre architecture : *« Clear boundaries between autonomous behavior and
explicit approval. Concrete use of Ledger primitives, not just wallet branding. »*

**Périmètre vérifié :** le *« Both must be built on the Ledger Key Ring CLI »* ne s'applique **qu'aux
deux puces qui le précèdent** (courtier de secrets · Key Ring sur hôte sans USB). Les puces x402 et
human-in-the-loop **n'exigent pas le Key Ring**. ⚠️ **À confirmer sur le Discord le 4/09** — c'est une
lecture de texte, pas une réponse d'organisateur.

**Track 01 — 3 500 $ · 3 places (2 000 / 1 000 / 500) · OUVERTE** (*« start something new during the event »*).
*(La Continuity à 1 500 $ reste écartée : aucun gagnant Continuity du corpus n'a atteint la finale.)*

**Ce qu'on a déjà :** `~/Documents/Ledger_Agent_Stack` embarque `@ledgerhq/device-management-kit`,
`device-signer-kit-ethereum` et **`device-transport-kit-speculos`** avec Speculos en docker-compose.
→ **Aucun appareil physique nécessaire pour la démo.**

## 43. La règle d'entrée, et elle est stricte

> **Ledger entre à J4–J5, et SEULEMENT si la garde fonctionne déjà.**

La garde est construite de toute façon (c'est l'action, et elle répond au fait que 0 des 27 finalistes
async est un instrument de lecture seule). Y brancher un signataire Ledger est alors **un petit delta**.
Construire la garde *pour* Ledger serait de l'élargissement de périmètre. **Ledger est une amélioration
gratuite d'un plan existant, pas un chantier supplémentaire.**

## 44. Les trois créneaux, un par couche

| Sponsor | Couche | Dotation ouverte | Engagement |
|---|---|---|---|
| **Uniswap Foundation** | **le sujet** — mesurer ce qu'un hook prend | 3 000 $ | **J1, ferme** |
| **Hedera** | **le guichet** — la mesure vendue à la requête en x402 | 6 000 $ | **J1, ferme** |
| **Ledger** | **la garde** — l'appareil approuve avant que les fonds bougent | 3 500 $ | **J4–J5, conditionnel** |

C'est exactement le maximum de **3 prix partenaires** autorisé, et chaque sponsor est **une couche du
même produit**, pas une intégration collée. Ça attaque aussi l'axe le plus faible du duel
(**Practicality ~11/27**), puisque **la garde est l'action**.

## 45. Tous les briefs sont publiés — la question des sponsors est définitivement close

| Écarté | Raison |
|---|---|
| The Graph 15 000 $ | **intégralement Continuity** |
| Privy 5 000 $ | exige un **wallet au cœur du produit** — l'inverse de notre atout |
| Chainlink 2 500 $ | workflow **confidentiel**, et critères *« coming soon »* |
| Bazantic 3 000 $ | la track pertinente est Continuity ; l'autre plafonne à 500 $ sur les APIs d'autrui |
| Arc 10 000 $ | DeFi stablecoin ; dotation ayant oscillé 4 fois en 9 h |
| ENS 4 500 $ | interdit explicitement l'**ajout cosmétique** — ce serait un autre projet |
| World 3 500 $ | AgentKit fermé (Continuity) ; Selfie Check hors sujet |
| 1inch 7 000 $ | Aqua, sans rapport avec la mesure de hooks |
