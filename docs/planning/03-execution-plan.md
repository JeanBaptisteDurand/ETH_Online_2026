# 36 — TARE : PLAN D'EXÉCUTION « LES AGENTS FONT LE BACK, L'HUMAIN FAIT LE FRONT »

> **ETHOnline 2026** · Build **4 → 11 sept** · Soumission **13 sept 12:00 EDT** · Dev solo
> Document écrit le **29/08/2026**. Il complète `34-TARE-FINAL.md` ; il ne le remplace pas.
>
> **Règle appliquée, héritée de `27-AUDIT-ADVERSE.md` :** tout chiffre de ce document a été
> produit par une commande que j'ai exécutée sur cette machine, et la commande est écrite à côté.
> Ce que je n'ai pas exécuté porte **NON VÉRIFIÉ**.

---

# 🟢 PARTIE 0 — CE QUE J'AI EXÉCUTÉ MOI-MÊME (à lire avant tout le reste)

J'ai reconstruit le moteur de mesure de zéro pour vérifier qu'il tient debout. **Il tient.** Et
l'exercice a produit **trois corrections dures au doc 34** et **deux déblocages** des « trois choses
qui décident ».

## 0.1 Le contrefactuel fonctionne, et je le reproduis au chiffre près

J'ai écrit mon propre stub, forké Base à un bloc épinglé, et coté le même pool deux fois.

```bash
export PATH="$PATH:$HOME/.aztec/current/bin"
anvil --fork-url https://mainnet.base.org --fork-block-number 50614000 --port 8546 --silent &

Q=0x0d5e0F971ED27FBfF6c2837bf31316121532048D            # V4Quoter Base
HOOK=0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc
STUB=0x6004600060003760005160e01c63575e24b414601b5760406000f35b60606000f3
SIG='quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))(uint256,uint256)'
PK="(0x33747ca0945c56315f3e8ae09fc7d4069f1e8c0c,0x4200000000000000000000000000000000000006,8388608,200,$HOOK)"

cast call $Q "$SIG" "($PK,false,1000000000000000,0x)" --rpc-url http://127.0.0.1:8546   # avec le hook
cast rpc anvil_setCode $HOOK $STUB --rpc-url http://127.0.0.1:8546                       # on remplace
cast call $Q "$SIG" "($PK,false,1000000000000000,0x)" --rpc-url http://127.0.0.1:8546   # sans le hook
```

| taille (WETH) | avec le hook | avec le stub | bps |
|---|---|---|---|
| 0,0001 | 7 409 572 306 329 514 408 340 863 | 7 484 410 869 395 114 850 766 674 | **99,99** |
| 0,001 | 74 046 344 406 434 247 356 447 811 | 74 793 727 864 869 651 546 413 544 | **99,93** |
| 0,01 | 735 561 536 208 542 351 184 728 467 | 742 936 251 187 393 444 164 399 877 | **99,26** |
| 0,1 | 6 898 904 191 230 301 435 933 669 760 | 6 963 737 349 042 331 235 538 396 691 | **93,10** |
| 1 | 42 562 146 520 610 930 055 994 183 280 | 42 808 026 636 781 453 817 297 145 640 | **57,44** |

`research/tare-mesures.json` ligne 8 donne `[99.99259, 99.92595, 99.26444, 93.10110, 57.43785]`.
**Identique à la 4ᵉ décimale, avec un stub que j'ai écrit moi-même.** Le moteur est réel, il est
reproductible, et il l'est maintenant avec un `poolId` :
`0x706140c978c382cda318ba3d1282368231e580a3d7b13803d09ca3593caca8cf`, bloc `50 614 000`,
`zeroForOne = false`.

## 0.2 🔴 CORRECTION 1 — le stub ne fait PAS « 89 octets », et 33 suffisent

`v4-core/src/libraries/Hooks.sol` (clone local `repos/sponsor-uniswap-v4-core/`) impose exactement
trois choses :

| ligne | invariant |
|---|---|
| `Hooks.sol:153` | `result.length >= 32` **et** `result.parseSelector() == data.parseSelector()` |
| `Hooks.sol:259` | pour `beforeSwap` : `result.length` doit valoir **exactement 96** |
| `Hooks.sol:166` | pour `callHookWithReturnDelta(parseReturn=true)` : **exactement 64** |

Aucun autre. Un stub qui fait ça tient en **33 octets** :

```
6004 6000 6000 37   calldatacopy(0,0,4)        ; le sélecteur, aligné à gauche
6000 51 60e0 1c     shr(224, mload(0))
63 575e24b4 14      == beforeSwap ?
601b 57             si oui -> saut
6040 6000 f3        sinon return(0,0x40)       ; 64 octets
5b 6060 6000 f3     JUMPDEST return(0,0x60)    ; 96 octets
```
`0x6004600060003760005160e01c63575e24b414601b5760406000f35b60606000f3` — **33 octets**, testé
ci-dessus contre un hook qui porte `beforeSwapReturnsDelta` **et** `afterSwapReturnsDelta`.
Sélecteur `beforeSwap` = `0x575e24b4` (`cast sig "beforeSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),bytes)"`).

> **Le « stub de 89 octets » est NON VÉRIFIÉ.** Soit tu retrouves d'où viennent les 89 (peut-être une
> version compilée depuis Solidity), soit **tu écris le vrai chiffre**. Un juge qui compte les octets
> du dépôt et n'en trouve pas 89 te coûte plus cher que la différence entre 33 et 89.
> **Le fait défendable n'est pas la taille, c'est l'invariant : 96 / 64 / sélecteur réémis, trois
> lignes de `Hooks.sol` citables.**

## 0.3 🔴 CORRECTION 2 — §0.2 du doc 34 est FAUX : le contrefactuel n'est pas « le pool à frais nuls »

`v4-core/src/libraries/Pool.sol:303-305` :

```solidity
uint24 lpFee = params.lpFeeOverride.isOverride()
    ? params.lpFeeOverride.removeOverrideFlagAndValidate()
    : slot0Start.lpFee();
```

`isOverride()` teste `self & 0x400000` (`LPFeeLibrary.sol:63`). Un stub qui rend `lpFeeOverride = 0`
**n'active pas l'override** → le pool applique **`slot0.lpFee`, le frais stocké dans son propre
slot0**, pas zéro.

Vérifié en direct sur les pools mesurés (`StateView.getSlot0` à `0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71`,
qui pointe bien sur le PoolManager `0x498581fF…`) :

| poolId | `slot0.lpFee` | bps mesuré (0,001 / 0,1) |
|---|---|---|
| `0x4b1bd12f…` | **30 000** (3,00 %) | 59,58 / 53,76 |
| `0xab276678…` | **80 000** (8,00 %) | 157,33 / 155,92 |
| `0x6be731a2…` | **10 000** (1,00 %) | 17,67 / 17,20 |
| `0x805639c1…` | **0** | 119,70 / 114,00 |
| `0x772db21f…` | **0** | **1 176,37 / 1 166,09** |

> **Conséquence, et elle est bonne pour toi :** sur les pools à `slot0.lpFee` non nul, la référence
> « sans hook » **facture déjà le frais LP du pool**, donc les bps mesurés sont bien « ce que le hook
> prend **en plus** ». Le doute du §0.2 ne s'applique **qu'aux pools dont `slot0.lpFee = 0`** — et
> pour ceux-là la phrase exacte est : *« le pool n'a aucun frais LP inscrit ; les 11,76 % sont
> intégralement décidés par le hook au moment du swap »*, ce qui est **plus fort**, pas plus faible.
>
> **Action : ajouter la colonne `stored_lp_fee` au schéma `measurement` (§15 du doc 34).** Une lecture
> `extsload`, coût nul, et l'interdiction de prononcer « 11,76 % » tombe.

## 0.4 🟢 DÉBLOCAGE — « les 77,6 % non cotables » n'est pas un mystère, c'est UNE erreur nommée

Toutes mes cotations en échec rendent le même octet. Décodage :

- enveloppe `0x6190b2b0` = `UnexpectedRevertBytes(bytes)` — `v4-periphery/src/libraries/QuoterRevert.sol:11`
- contenu `0x7a5ed734` = **`NotEnoughLiquidity(PoolId)`** — `v4-periphery/src/base/BaseV4Quoter.sol:16`

et `BaseV4Quoter.sol:52-56` dit pourquoi :

```solidity
int128 amountSpecifiedActual = (zeroForOne == (amountSpecified < 0)) ? swapDelta.amount0() : swapDelta.amount1();
if (amountSpecifiedActual != amountSpecified) revert NotEnoughLiquidity(poolKey.toId());
```

**Le Quoter refuse tout swap qui ne consomme pas la totalité de l'entrée.** Deux causes : la
liquidité s'épuise dans ce sens, ou le hook modifie le montant spécifié (comptabilité personnalisée).

Sur mes 252 observations : **100 % des échecs sont ce seul sélecteur** (54/54 puis 43/43).
→ **Le produit ne dit plus « 77,6 % inexpliqués ». Il dit « N pools, sens X : `NotEnoughLiquidity`,
sélecteur `0x7a5ed734` ».** C'est une taxonomie, pas un trou.

Et il y a un fait de méthode caché dedans : **le même pool cote dans un sens et pas dans l'autre.**
`0x1aea38f0…` révèle `7a5ed734` en `zeroForOne = true` et cote parfaitement en `false`. Si les 11/98
de l'artefact d'origine ont été obtenus dans un seul sens, **le taux de cotabilité réel est très
au-dessus de 11 %** : chez moi il est de **54,7 % à 65,3 %** dès qu'on balaye les deux sens.

## 0.5 🟢 DÉBLOCAGE — le corpus « frais statiques » existe, il est propre, et je l'ai déjà mesuré

Sur `research/pools-liquides.json` : **199 pools liquides, 12 hooks, top 4 = 181 pools (91 %)** —
les chiffres du §0.5 du doc 34 sont exacts. Et parmi eux :

- **167 pools à frais dynamiques** (`fee = 8388608 = 0x800000`)
- **32 pools à frais STATIQUES**, portés par **4 hooks** — dont **31 à `fee = 0`** et 1 à `fee = 10000`

Sur un pool à frais **statique**, `key.fee.isDynamicFee()` est faux, donc `Hooks.sol:262` ne lit
**jamais** `parseFee()` : **la valeur de retour du stub sur le frais est purement ignorée.**
Le contrefactuel est mathématiquement propre. Sur les 31 pools à `fee = 0`, il est encore plus
propre : le pool annonce publiquement **zéro frais LP**.

Balayage exécuté (32 pools × 2 sens × 2 tailles = **128 observations**, bloc 50 614 000,
artefact : `research/tare-probe-statiques-bloc50614000.json`) :

| hook | pools | bps min | bps max | lecture |
|---|---|---|---|---|
| `0x985c14baa2a18316ffda0aefb3a632fadfca2acc` | 25 | 95,76 | ~100,0 | **~1 % pris sur un pool à frais affiché 0** |
| `0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc` | 2 | 94,14 | ~100,0 | idem |
| `0x3b2b979df21036cee51b8debb13100e2cb8deacc` | 4 | 0,000 | 0,000 | **prend 0,0002 bps — le contrôle** |
| `0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000` | 1 | 0,0 | 0,0 | **cotations strictement identiques — le contrôle parfait** |

**70 / 128 cotables (54,7 %)**, 58 échecs, **tous `NotEnoughLiquidity`**.

> **La phrase-titre qui survit à toutes les objections du §0.2 :**
> **« Ce pool affiche un frais LP de zéro. Le hook en prend cent points de base. Et sur le pool
> d'à côté, le même code n'en prend aucun. Voici les deux cotations, au même bloc. »**
> Elle ne dépend d'aucun frais dynamique, d'aucune interprétation, d'aucun launchpad de memecoins.

## 0.6 Le reste de ce que j'ai revérifié, en une table

| Affirmation du doc 34 | Ma vérification | Verdict |
|---|---|---|
| `extsload` : `keccak(poolId‖6) + 3` = liquidité | `cast call 0x498581ff… "extsload(bytes32)"` → `365514774916937598336610` sur le poolId `0x706140c9…` | ✅ **exact au chiffre près** |
| PoolManager Base `0x498581ff718922c3f8e6a244956af099b2652b2b` | `cast code` → **24 009 octets** ; `V4Quoter.poolManager()` et `StateView.poolManager()` pointent dessus | ✅ |
| V4Quoter Base `0x0d5e0F971ED27FBfF6c2837bf31316121532048D` | code présent, **5 820 octets** | ✅ |
| Cotation à froid ≈ 8,96 s, à chaud ≈ 0,01 s | mesuré : **9,087 s à froid, 0,046 s à chaud** (même appel, RPC public) | ✅ **confirmé, un peu pire** |
| `hooklist.json` : 570/613 `vanillaSwap=false` (93,0 %), 30/613 `auditUrl` (4,9 %), 613/613 `verifiedSource` | recompté sur `repos/sponsor-uniswap-hooklist/hooklist.json` | ✅ **exact** |
| schéma : **un seul entier** (`chainId`), `additionalProperties:false` ×4 | recompté sur `schema.json` : 19 booléens, 7 chaînes, 4 objets, 1 entier ; 4 occurrences | ✅ **exact** |
| 37 couples (adresse, chainId) à deux fiches, dont 10 contradictoires | recompté | ✅ **exact** |
| flags = les 14 bits de poids faible de l'adresse | recalculé sur 613 fiches × 14 flags = **8 582/8 582, zéro écart** | ✅ (le doc dit 8 974/8 974 : c'était l'ancien clone de 641 fiches — même conclusion) |
| 73,2 % de fiches à flag `ReturnsDelta` | recompté : **445/613 = 72,6 %** | ⚠️ **corrige en 72,6 %** |
| images Docker : pgvector 639 Mo, redis:7-alpine 61,9 Mo, neo4j 988 Mo | `docker images` local | ✅ **exact** |
| `V4_SWAP = 0x10` | `repos/sponsor-uniswap-v4-periphery/test/mocks/MockPermissionedRouter.sol:26` | ✅ |
| bench networkx vs Neo4j (§6 du doc 34) | **je ne l'ai pas rejoué** | ⚠️ **NON VÉRIFIÉ par moi** — mais la limite Bolt à 2⁶³−1 est structurelle et l'argument tient seul |
| attribution Clanker de `0xb429d62f…` | pas fait | ⚠️ **NON VÉRIFIÉ** — et **désormais inutile** : le titre passe sur les frais statiques (§0.5) |

## 0.7 Le nouvel artefact du hook vedette — il est maintenant traçable

`research/tare-probe-b429-bloc50614000.json` : **31 pools uniques × 2 sens × 2 tailles = 124
observations**, 81 cotables (65,3 %), `poolId` sur chaque ligne. Le même hook, au même bloc :

`0,0 · 17,7 · 59,6 · 119,7 · 157,3 · 357,8 · 1 176,4 bps`

**Le « facteur 10 entre pools du même hook » est vrai, reproductible, et il vaut en réalité un
facteur ∞ (de 0 à 1 176).** C'est ça, la démonstration que le booléen d'Uniswap ne peut pas exprimer.

---

# PARTIE 1 — COMPLÉTUDE FONCTIONNELLE, FONCTION PAR FONCTION

## 1.1 Le moteur de mesure — **COMPLÈTEMENT DÉFINI** (et vérifié par exécution)

Tout est spécifié et tout marche. Ce qui **manque** est court, et c'est de la spec, pas de la découverte :

| Manque | Ce qu'il faut écrire |
|---|---|
| `stored_lp_fee` absent du schéma | colonne `stored_lp_fee int NOT NULL` + `fee_is_dynamic` (déjà là). Sans elle, §0.3 rend la mesure ininterprétable |
| Pas de taxonomie d'échec | colonne `revert_selector bytea` + table de correspondance (`0x7a5ed734 → NotEnoughLiquidity`). Remplace `reason text` en texte libre |
| Le sens n'est pas balayé | `zero_for_one` existe dans le schéma mais **rien n'impose de faire les deux**. Le rendre obligatoire : une observation = (pool, sens, taille) |
| Taille du stub | fixer le chiffre réel et le `stub_hash` (§0.2) |
| `hookData` toujours vide | `bytes hookData` est passé à `beforeSwap`. Un hook qui exige un `hookData` non vide révertera. **À étiqueter `NON_COTABLE / requiresCustomSwapData`** — le registre a déjà ce booléen (`properties.requiresCustomSwapData`, présent sur 613/613 fiches) |
| Multi-hop non traité | `quoteExactInput` (chemin) traverse plusieurs hooks. Hors périmètre : **le dire** |

**Ce qui est déjà fait et n'est pas à refaire :** découverte `Initialize`, `extsload` liquidité,
stub, `V4Quoter`, balayage taille, décodeur de flags. Le seul travail neuf de J1 est le balayage
**sens** et la **taxonomie de reverts**.

---

## 1.2 L'ACTION — **PARTIELLEMENT DÉFINIE.** C'est bien le point faible, et voici les trois pistes chiffrées

### (a) La garde au moment de la signature — extension navigateur

**Le patron existe et il a gagné.** Magnee (finaliste HackMoney 2026, `2nd place LI.FI` + `Integrate ENS`
+ Finalist) décrit sa méthode mot pour mot dans son `howItsMade`
(`research/win-async-finalists.json`, projet `magnee-dude7`) :

> *« The extension injects a content script at document_start that wraps window.ethereum.request().
> It also intercepts EIP-6963 announceProvider events and installs a property trap via
> Object.defineProperty to catch late provider assignments. Only eth_sendTransaction with value > 0
> is intercepted; everything else passes through untouched. »*

**Comment on l'adapte à un swap v4.** Magnee filtre sur `value > 0` ; un swap v4 ERC-20→ERC-20 passe
par Permit2 avec `value = 0`. TARE doit filtrer sur le **calldata**, pas sur la valeur :

1. **Injection.** Manifest V3, `content_scripts` avec `"run_at": "document_start"` et
   `"world": "MAIN"` (Chrome ≥ 111) — sinon un script d'`ISOLATED` qui insère une balise `<script>`.
2. **Capture du provider.** Trois chemins, il faut les trois :
   - envelopper `window.ethereum.request` ;
   - `Object.defineProperty(window, 'ethereum', {set, get})` pour les injections tardives ;
   - écouter `eip6963:announceProvider` **en phase de capture**, `stopImmediatePropagation()`, puis
     redispatcher un **nouvel** objet `detail` contenant le provider enveloppé.
     ⚠️ EIP-6963 impose `Object.freeze()` sur `detail` (https://eips.ethereum.org/EIPS/eip-6963) :
     **on ne peut pas muter, on doit reconstruire.** Il faut aussi réagir à `eip6963:requestProvider`.
3. **Détection du swap.** Sur `eth_sendTransaction` (et `wallet_sendCalls`, ERC-5792) :
   `to == UniversalRouter` (Base : `0x6fF5693b99212Da76ad316178A184AB56D299b43`, **19 499 octets de
   code vérifiés on-chain**), sélecteur `execute(bytes,bytes[],uint256)`.
4. **Décodage jusqu'à la `PoolKey`.**
   - `commands` : chaque octet, `& 0x3f`; **`0x10` = `V4_SWAP`** (vérifié dans
     `repos/sponsor-uniswap-v4-periphery/test/mocks/MockPermissionedRouter.sol:26`).
     Le bit `0x80` est `ALLOW_REVERT`, il faut le masquer.
   - `inputs[i] = abi.encode(bytes actions, bytes[] params)`.
   - `actions` : `0x06 = SWAP_EXACT_IN_SINGLE`, `0x08 = SWAP_EXACT_OUT_SINGLE`
     (`repos/sponsor-uniswap-v4-periphery/src/libraries/Actions.sol:28-31`).
   - `params[j] = abi.encode(ExactInputSingleParams)` dont le **premier champ est la `PoolKey`**
     (`src/interfaces/IV4Router.sol:31`). La `PoolKey` est un tuple **statique** de 5 mots
     (`v4-core/src/types/PoolKey.sol:11-22`), donc :
     **l'adresse du hook est aux octets `0xa0..0xc0` de `params[j]`, 20 octets de poids faible.**
   - 🎯 **Ce décalage est indépendant de la version.** Le clone actuel de `v4-periphery` a ajouté un
     champ `minHopPriceX36` **après** la `PoolKey` (`IV4Router.sol:35`) : la `PoolKey` ne bouge pas.
     **Ne décode jamais la struct entière — lis les octets 0xa0..0xc0.** C'est la seule façon de
     survivre aux deux ABI déployées.
   - `0x07 / 0x09` (multi-hop) : la `PoolKey` n'existe pas, il faut décoder `PathKey[]`
     (`src/libraries/PathKey.sol:8-14`, champ `hooks` en 4ᵉ position). **Coûteux. Le sortir du périmètre
     J-1..J7 et afficher « chemin multi-saut : non analysé ».**
5. **La réponse.** 🔴 **Point dur, mesuré :** une cotation à froid coûte **9,087 s**, à chaud **0,046 s**
   (§0.6). **Mesurer en direct à la signature est impossible.** La garde doit donc être une
   **consultation d'une table pré-calculée** :
   - table embarquée dans l'extension (les ~200 hooks liquides de Base tiennent en quelques Ko) → **0 ms** ;
   - + un appel API en `Promise.race` avec un **timeout de 400 ms** et un **fail-open explicite**.
   - Si le hook est inconnu : **« hook non mesuré »**, jamais **« sûr »**. C'est la même discipline
     d'honnêteté que le reste du produit.
6. **Cas d'échec à documenter (et à afficher) :**
   | cas | conséquence |
   |---|---|
   | dapp qui a capturé `request` avant l'injection | non intercepté |
   | WalletConnect / wallet embarqué / smart account | **ne passe jamais par `window.ethereum`** → non intercepté |
   | `detail` EIP-6963 gelé | il faut redispatcher, pas muter |
   | routeur tiers (agrégateur) | `to` inconnu → non intercepté |
   | hook décodé mais absent de la table | « non mesuré » |
   | double modale (la nôtre + celle du wallet) | résoudre la nôtre **avant** de relayer |
   | publication Chrome Web Store | plusieurs jours de revue → **livrer un `.zip` + « charger l'extension non empaquetée »**, et le montrer dans la vidéo |

**Faisable en 7 j ?** Oui, **1,5 à 2 jours** : interception + décodage + modale + table. Magnee a fait
plus dur (il *modifiait* la transaction, avec EIP-7702, et a dû patcher MetaMask). **TARE ne modifie
rien : il lit, il affiche, il relaie.** C'est le même patron avec la moitié du risque.

### (b) Le SDK publié — patron GrimSwap

GrimSwap (finaliste HackMoney 2026) publie `@grimswap/circuits v1.4.1` sur npm et le met en avant
dans son `howItsMade`. **C'est l'action la moins chère du dossier : ~2 heures.**

Contenu défendable de `@tare/hookmeter` (npm) et `tare` (PyPI) :

| export | dépendance réseau | exactitude |
|---|---|---|
| `decodeFlags(address)` → 14 booléens | **aucune** | **exacte, 8 582/8 582 vérifié** (§0.6) |
| `poolId(poolKey)` → bytes32 | aucune | déterministe, vecteur de test fourni |
| `liquiditySlot(poolId)` → bytes32 | aucune | `keccak(poolId‖6)+3`, vecteur `365514774916937598336610` |
| `STUB_BYTECODE`, `STUB_HASH` | aucune | les 33 octets + leur hash |
| `measure({rpc, hook, poolKey, block, sizes})` | anvil | la boucle complète |
| `lookup(hook)` | API TARE | les mesures publiées |

**Un juge fait `npm i @tare/hookmeter` et obtient les 14 LED en une ligne, sans RPC.** C'est
exactement le « livrable réutilisable » que le brief Uniswap appelle *tooling*.

### (c) La PR sur le schéma `hooklist`

Structure du dépôt vérifiée (`repos/sponsor-uniswap-hooklist/`) :

- `schema.json` — `additionalProperties: false` à **4 endroits** → **ajouter un champ EXIGE une PR sur le schéma.** C'est l'argument, offert par la structure elle-même.
- `scripts/validate.py`, `scripts/verify_flags.py`, `scripts/aggregate.py`
- tests pytest : `test_aggregate.py`, `test_assemble_hook.py`, `test_compute_flags.py`, …
- CI : `.github/workflows/validate.yml`, `review-hook.yml`, `regenerate.yml` (d'après `CLAUDE.md`)
- **le dépôt n'accepte que le rebase merge** (`CLAUDE.md`, section « Git & PRs »)

**Forme de la PR, petite et reviewable :**
```json
"measurement": {
  "type": "object", "additionalProperties": false,
  "properties": {
    "maxBpsObserved": {"type": "number"},
    "poolId":       {"type": "string", "pattern": "^0x[0-9a-f]{64}$"},
    "blockNumber":  {"type": "integer"},
    "chainId":      {"type": "integer"},
    "method":       {"type": "string", "enum": ["counterfactual-substitution"]},
    "sourceUrl":    {"type": "string"}
  },
  "required": ["maxBpsObserved","poolId","blockNumber","chainId","method","sourceUrl"]
}
```
+ une règle dans `validate.py` + **un test dans `scripts/test_*.py`** + une fiche d'exemple.
**Champ optionnel, non bloquant, autoportant.** Le README de la PR cite les trois lignes de
`Hooks.sol` et le permalien de la mesure.

### 🔴 Verdict sur l'ACTION

| piste | coût | risque | verdict |
|---|---|---|---|
| **(b) SDK** | 2 h | nul | **FAIRE — dans le lot agents, J1** |
| **(c) PR hooklist** | 3 h | nul (une PR ouverte est un livrable même non mergée) | **FAIRE — J6** |
| **(a) extension** | 1,5–2 j | moyen (interception, revue Store) | **FAIRE si le front est à l'heure au soir de J5.** C'est le seul des trois qui change la nature du projet (lecture → garde) |

**La formulation qui vend les trois ensemble :** *« TARE n'est pas un tableau. C'est une mesure, un
paquet npm, une garde au moment où tu signes, et un champ qui manque au registre d'Uniswap — avec
la PR qui l'ajoute. »*

---

## 1.3 L'assistant qui pilote le front — **PARTIELLEMENT DÉFINI.** Il manque 11 commandes et une contradiction à trancher

Le doc 34 §8 liste **7** commandes : `filter`, `sort`, `highlight`, `open`, `plotCurve`, `compare`,
`measure`. **Avec ces 7, la démo se bloque au deuxième tour** (pas de retour arrière) et **le graphe
networkx n'est jamais visible à l'écran** — donc la moitié de la Partie IV du doc 34 ne se démontre pas.

### Le bus complet — **18 commandes d'interface + `measure` + `clarify` = 20**

```ts
// packages/contracts/src/assistant.ts — union discriminée Zod, whitelist stricte
const Cmd = z.discriminatedUnion("t", [ /* ... */ ]);
```

| # | commande | signature | question type qu'elle sert |
|---|---|---|---|
| 1 | `filter` | `{minBps?, maxBps?, chainId?, flag?, label?, allowlisted?, inRegistry?, feeIsDynamic?, storedLpFee?, hasAudit?}` | *« les hooks qui prennent plus de 100 bps »* |
| 2 | `sort` | `{column, dir:'asc'\|'desc'}` | *« classe par prélèvement décroissant »* |
| 3 | 🆕 `columns` | `{show:string[], hide:string[]}` | *« montre-moi la colonne frais stocké »* — **c'est ÇA, la combinatoire à ~12 dimensions que le doc invoque pour justifier le langage naturel. Sans elle l'argument est creux.** |
| 4 | 🆕 `reset` | `{}` | *« repars de zéro »* — **sans retour arrière, la démo se bloque au 2ᵉ tour** |
| 5 | `highlight` | `{hooks:string[], reason:string}` | *« lesquels sont dans l'allowlist ? »* |
| 6 | 🆕 `search` | `{q:string}` | *« trouve 0xb429 »*, *« les pools avec WETH »* |
| 7 | `open` | `{hook, poolId?}` | *« ouvre le premier »* |
| 8 | `plotCurve` | `{hook, poolId, direction}` | *« trace le profil »* |
| 9 | 🆕 `setSize` | `{amountIn:string}` | 5 tailles : laquelle la colonne bps affiche |
| 10 | 🆕 `setDirection` | `{zeroForOne:boolean}` | **§0.4 : le sens décide de la cotabilité. Non pilotable = trou.** |
| 11 | 🆕 `setAxis` | `{x:'log'\|'linear', yAnchoredAtZero:boolean}` | applique les règles d'honnêteté du §12 doc 34 — **et refuse de désancrer Y sans étiquette visible** |
| 12 | `compare` | `{a:{hook,poolId}, b:{hook,poolId}}` | *« le même hook sur deux pools »* |
| 13 | 🆕 `graphImpact` | `{hook}` | *« quels jetons sont exposés à ce hook ? »* → **networkx `impact()`** |
| 14 | 🆕 `graphTwins` | `{hook}` | *« qui a le même bytecode ? »* → nœud `(:Bytecode)` en étoile |
| 15 | 🆕 `graphOrphans` | `{}` | *« au registre, mais aucun pool liquide »* |
| 16 | 🆕 `showDisagreement` | `{}` | *« le registre dit "modifie le swap", la mesure dit zéro »* — **la requête n°5 du doc 33 §25** |
| 17 | 🆕 `showEvidence` | `{measurementId}` | **ouvre la commande de rejeu + le permalien.** C'est la promesse centrale du produit. Sans commande, elle n'est atteignable qu'à la souris |
| 18 | 🆕 `openLimits` | `{}` | la page « ce que je ne sais pas » — **le dernier plan de la vidéo, celui qui gagne** |
| 19 | `measure` | `{hook, poolId, amountIn, zeroForOne}` | lance une vraie mesure |
| 20 | 🆕 `clarify` | `{question, options?}` | **quand le modèle ne sait pas mapper. Sans elle, il invente un `filter`.** |

*(18 commandes pilotent l'interface ; `measure` déclenche du calcul et `clarify` est la sortie de secours obligatoire.
Le doc 34 en listait 7 — il en manque donc **13**.)*

### 🔴 La contradiction à trancher : `measure` « facturée en x402 » depuis le navigateur

Un visiteur de la page n'a **ni compte Hedera, ni HBAR, ni USDC associé**. Le flux x402 `exact` sur
Hedera exige que le client **signe une `TransferTransaction`** puis l'envoie en base64
(`repos/sponsor-x402/specs/schemes/exact/scheme_exact_hedera.md`, étapes 3-6). **Aucun visiteur ne
fera ça.** Si la démo montre le chat qui déclenche un paiement, elle ment.

**Tranchage :**
- **le chat web** : `measure` est **gratuit, avec un quota de session** (ex. 3 mesures / 10 min, clé = IP + cookie) ;
- **x402 garde l'API et le MCP**, consommés par **un agent** — c'est exactement ce que le brief Hedera demande : *« Build a platform or agent that consumes that service »* ;
- la vidéo montre **deux scènes distinctes** : le chat qui pilote le tableau, puis **un terminal agent** qui paie et reçoit. Le doc 34 §VIII les colle en un seul plan de 25 s : **les séparer**.

### Les autres règles à écrire dans le contrat (elles manquent toutes)

1. **Une seule union Zod, `strict()`, whitelist fermée.** Toute commande hors liste → `clarify`.
2. **Application atomique** : le lot de commandes s'applique en une transaction d'état front, ou pas du tout.
3. **Zéro ligne ⇒ le dire.** Un `filter` qui vide le tableau doit produire *« 0 hook correspond ; 3 si tu enlèves la contrainte allowlist »*. Un tableau vide sans message est le pire moment possible en démo.
4. **Le modèle ne produit jamais un nombre** (règle d'or du doc 34, déjà écrite) — **à faire respecter par un test**, pas par une phrase de README : un test qui rejette toute réponse contenant un littéral numérique hors des champs typés.
5. **Journal** : chaque tour → `prompt-log` (repris de `apps/ai-service/src/repositories/prompt-log.repo.ts`, CorLens) + les commandes émises. C'est aussi l'attribution IA exigée à J6.

---

## 1.4 MCP + x402 Hedera + compteur + HCS — **PARTIELLEMENT DÉFINI.** Le point bloquant est une URL que personne n'avait

### 🟢 Trouvaille : le facilitateur Blocky402 pour Hedera **testnet** existe mais n'est pas documenté sur son site

```
$ curl -s https://api.blocky402.com/supported
{"kinds":[{"x402Version":2,"scheme":"exact","network":"hedera:mainnet",
           "extra":{"feePayer":"0.0.10571514"}}], ...}

$ curl -s https://api.testnet.blocky402.com/supported
{"kinds":[{"x402Version":2,"scheme":"exact","network":"eip155:80002"},
          {"x402Version":2,"scheme":"exact","network":"solana:EtWTRABZ…"},
          {"x402Version":2,"scheme":"exact","network":"hedera:testnet",
           "extra":{"feePayer":"0.0.7162784"}}],
 "signers":{"hedera:*":["0.0.7162784"]}}
```

> 🔴 **`api.blocky402.com` ne sert QUE `hedera:mainnet`.** Le testnet est sur **`api.testnet.blocky402.com`**,
> feePayer **`0.0.7162784`**, `x402Version 2`, scheme `exact`. Ni `testnet.blocky402.com` ni
> `facilitator.blocky402.com` ne résolvent (DNS, exit 000).
> **Sans cette URL, J0 se passe à chercher pourquoi « ça marche pas ». Elle est trouvée.**

Note complémentaire : `https://x402.org/facilitator/supported` sert aussi `hedera:testnet` — mais le
brief exige **Blocky402** nommément (*« settled through the Blocky402 facilitator »*,
`watch/prizes-20260828-2234.txt:57`). **Ne pas se tromper de facilitateur.**

### Les paquets à utiliser, versions exactes (clone local `repos/sponsor-x402/`)

| paquet | version | rôle |
|---|---|---|
| `@x402/hono` | **2.23.0** | le middleware serveur — colle à la stack GuardLens (Hono 4.6) |
| `@x402/hedera` | **2.23.0** | le mécanisme Hedera (`typescript/packages/mechanisms/hedera/`) |
| `@x402/mcp` | **2.23.0** | **x402 dans un serveur MCP — le chemin agent est déjà packagé** |
| spec de référence | `specs/schemes/exact/scheme_exact_hedera.md` | le flux en 14 étapes, à recopier dans le README |
| PoC officiel du sponsor | `repos/sponsor-hedera/x402-inference-pay-per-request-poc/` | l'architecture agent↔service↔facilitateur, déjà écrite |

⚠️ **Piège de version repéré :** le PoC du sponsor utilise l'en-tête `PAYMENT-SIGNATURE` ; Blocky402
documente `X-PAYMENT`. **Prendre les en-têtes que `@x402/hono` 2.23.0 émet, pas ceux d'un README.**

### Les 4 outils MCP — définis, mais à corriger

| outil | signature | état |
|---|---|---|
| `tare_measure` | `(hook, poolId, amountIn, zeroForOne, block?)` | ✅ — **et c'est celui-là qui est facturé en x402** |
| `tare_lookup` | `(hook)` → profils + étiquettes | ✅ gratuit |
| `tare_impact` | `(hook)` → pools et jetons exposés | ✅ gratuit |
| `tare_twins` | `(hook)` → même bytecode / même déployeur | ✅ gratuit |

**Manque :** le doc 34 écrit `tare_measure(hook, pool, size, direction)` avec `pool` non typé.
**Le paramètre doit être `poolId` (bytes32)** — c'est la leçon du §0.4 du doc 34 : *« la liquidité
n'identifie pas un pool »*. Manque aussi : `tare_replay(measurementId)` qui **rend la commande shell
exacte** — un outil gratuit, trois lignes, qui met la falsifiabilité dans les mains de l'agent.

### Le compteur et le journal HCS — **NON DÉFINIS**

Le doc dit « le compteur d'usage de CorLens **est** le compteur Hedera » et « journal HCS ». Existe
bien : `apps/ai-service/src/services/usage.service.ts` + `controllers/usage.controller.ts`
(CorLens v2, vérifié sur disque). Mais **rien n'est spécifié côté Hedera** :

| à décider avant J4 | pourquoi |
|---|---|
| **l'unité facturée** | le brief donne des points bonus pour *« compute metering rather than a flat per-request charge »*. **L'unité naturelle et mesurée : le nombre de cotations `V4Quoter` déclenchées** (1 mesure = 2 cotations ; un balayage 5 tailles × 2 sens = 20). C'est un compteur physique, pas un forfait déguisé |
| **le prix** | à fixer en tinybars/µUSDC. Le PoC sponsor facture 0,001 $ / requête |
| **HCS : un topic, quel message** | `topicId` créé à J0 ; message = `{measurement_id, hook, pool_id, block, bps, stub_hash, engine_ver, tx_id}` ≤ 1024 octets. **Une soumission HCS par mesure payée**, pas par requête HTTP |
| **le coût HCS** | ⚠️ `27-AUDIT-ADVERSE.md` a déjà mesuré qu'un HIP-991 à 0,05 $/message est ruineux. **Un topic HCS ordinaire (sans frais custom) coûte ~0,0001 $** — **NON VÉRIFIÉ par moi, à re-mesurer à J0 sur le testnet** |
| **la découvrabilité** | bonus *« a directory that makes your service findable »* → publier le `x402` bien-connu (`/.well-known/x402`) et une fiche. Coût : 30 min |

---

## 1.5 Le graphe networkx — **DÉCISION COMPLÈTE, SPEC INCOMPLÈTE**

La **décision** (networkx, pas Neo4j) est tranchée et bien argumentée dans le doc 34 §6. Je ne l'ai
pas rejouée (**NON VÉRIFIÉ**) mais l'argument central est structurel et n'a pas besoin de bench :
**Bolt code les entiers en int64, plafond 2⁶³−1 = 9,22·10¹⁸**, et une liquidité de pool vaut
couramment `3,65·10²³` (§0.6). Les `uint128` doivent partir en texte, les comparaisons Cypher
meurent. **Argument suffisant, garde-le, et cite l'`OverflowError` littéral.**

Ce que j'ai mesuré moi-même, sur le vrai COBOL Explorer (`ingestion/graph/build.py:81`) :

```
graph.json : 339 nœuds / 421 arêtes
from_json() médiane sur 7 exécutions : 1,4 ms
impact() moyenne sur 200 appels      : 0,013 ms
→ rapport reconstruction / requête    : 108×
extrapolation linéaire à 15 834 nœuds : ~67 ms de reconstruction
```

**Le bug de `tools()` est réel et localisé** : `server/api/app.py:157-159` construit un `GraphTools`
neuf à chaque requête, et `server/agent/tools.py:25-26` fait `json.load` + `from_json` dans son
`__init__`. Juste à côté, `store()` (ligne 167+) **cache** ses `VersionStore` dans `_STORES` avec un
commentaire qui explique pourquoi. **Le patron correct est dans le même fichier, dix lignes plus bas.**

**Ce qui manque dans le doc 34 :** le schéma nœuds/arêtes a été **perdu** entre le doc 33 §25 et le
doc 34. Il faut le remettre, avec les trois décisions de modélisation du §6 (mesure accrochée au
POOL ; `RegistryEntry` en nœud ; `(:Bytecode)` en étoile) :

```
Nœuds :  Hook · Pool · Token · Deployer · Measurement · RegistryEntry · AllowlistEntry · Bytecode
Arêtes : ATTACHED_TO (Hook→Pool) · HOLDS (Pool→Token) · DEPLOYED_BY (Hook→Deployer)
         HAS_BYTECODE (Hook→Bytecode) · MEASURED_AS (Pool→Measurement)
         LISTED_IN (Hook→RegistryEntry) · ALLOWED_IN (Hook→AllowlistEntry)
```

**Manque aussi le lien graphe → vecteur.** Le doc 34 §7 dit « on reprend `chunk_corpus()` », mais
**le corpus TARE n'est pas défini** : quel texte on vectorise ? Réponse à écrire : les **~3 % de
sources vérifiées** (2/80 sur Sourcify hors registre), les **613 `description` du hooklist** (elles
sont substantielles — la fiche `ArrakisPrivateHook` fait 250 mots), et les 30 rapports d'audit liés.
**Sans corpus nommé, on refait le `void ragIndex;` de CorLens** (`apps/corridor/src/app.ts:118`,
vérifié sur disque).

---

# PARTIE 2 — LE PLAN « AGENTS EN ONE-SHOT »

## 2.1 Le principe

**Les agents ne construisent pas le produit. Ils construisent le socle vérifiable sur lequel
l'humain pose le produit.** La différence est opérationnelle : tout ce qu'un agent livre doit être
**prouvé par une commande qui rend 0**, pas par une capture d'écran.

Trois règles non négociables :
1. **Un lot = un dossier = une porte.** Aucun agent ne touche le dossier d'un autre.
2. **Aucun agent ne réécrit `docker-compose.yml`.** Il est écrit une fois (§2.3), à la main, avant tout.
3. **Aucun agent ne code contre le réseau réel.** Les fixtures sont des `.json` figés au bloc 50 614 000, déjà produits (`research/tare-probe-*.json`).

## 2.2 Le découpage en lots

```
                     ┌──────────────────────────────────────────┐
   LOT 0 (humain)    │ compose + .env + RPC payant + Hedera J0   │
                     └────────────────┬─────────────────────────┘
             ┌──────────────┬─────────┼──────────┬──────────────┐
             ▼              ▼         ▼          ▼              ▼
          LOT A          LOT B      LOT C      LOT D          LOT E
        engine/        packages/   apps/api   apps/ai-svc   packages/
        (Python)       db+contracts (Hono)    (embed/LLM)   sdk (npm+py)
             │              │         │          │              │
             └──────┬───────┴────┬────┴────┬─────┘              │
                    ▼            ▼         ▼                    │
                 LOT F        LOT G     LOT H                   │
              engine/graph   apps/mcp  x402+HCS                 │
              (networkx)     (4 outils) (Hedera)                │
                    └────────────┬──────────────────────────────┘
                                 ▼
                    LOT I — la suite de tests globale + le Makefile
                                 ▼
                    ══ L'HUMAIN PREND LA MAIN : apps/web ══
```

| lot | agent | contenu | dépend de | durée visée |
|---|---|---|---|---|
| **0** | **humain, avant les agents** | `docker-compose.yml`, `.env.example`, RPC payant, compte Hedera financé, aller-retour Blocky402 manuel | — | J0 |
| **A** | 1 | `engine/` : `stub.py`, `discover.py`, `liquidity.py`, `measure.py`, `classify.py` (taxonomie de reverts), `sampler.py` | 0 | 1 passe |
| **B** | 2 | `packages/db` (Drizzle, table `measurement` **avec `stored_lp_fee` et `revert_selector`**) + `packages/contracts` (Zod, **dont l'union des 20 commandes**) | 0 | 1 passe |
| **C** | 3 | `apps/api` Hono : `/hooks`, `/hooks/:addr`, `/measurements`, `/replay/:id`, SSE `/assistant` | B | 1 passe |
| **D** | 4 | `apps/ai-service` : embedding, complétion, HMAC, `prompt-log` — **portage direct de CorLens** | B | 1 passe |
| **E** | 5 | `packages/sdk-ts` + `packages/sdk-py` : flags, poolId, slot, stub, `measure()` | A | 1 passe |
| **F** | 6 | `engine/graph/` : build depuis Postgres, `impact/twins/orphans/disagreement`, **cache process** | A, B | 1 passe |
| **G** | 7 | `apps/mcp` : 5 outils (`measure`, `lookup`, `impact`, `twins`, `replay`) | C, F | 1 passe |
| **H** | 8 | `apps/api/x402/` (@x402/hono + @x402/hedera), `usage/`, `hcs/` | C | 1 passe |
| **I** | 9 | `Makefile`, `scripts/verify.sh`, CI, agrégation du compte de tests | tous | 1 passe |

**A, B, D, E démarrent en parallèle immédiatement.** C attend B (quelques minutes). F, G, H forment
la deuxième vague. **I ferme.**

**Ce que les agents NE font PAS :** `apps/web`, l'extension, le `DESIGN.md`, la vidéo, les textes de
soumission. C'est l'humain, et c'est là qu'est la note.

## 2.3 Le `docker-compose.yml`, complet et concret

Vérifications faites avant de l'écrire :
- `pgvector/pgvector:pg16` = **639 Mo**, `redis:7-alpine` = **61,9 Mo** (`docker images`, local)
- `ghcr.io/foundry-rs/foundry:latest` = **228 628 276 octets (218 Mio)**, digest `sha256:0c00cb0b…`
- 🔴 **son `ENTRYPOINT` est `["/bin/sh","-c"]` et il n'a pas de `CMD`.** Donc **`command:` DOIT être
  une chaîne unique** ; la forme liste passe les arguments en `$0 $1 …` et **ils sont silencieusement
  ignorés** (testé : `docker run … anvil --version` démarre anvil et ignore `--version`).
- l'utilisateur est `foundry` (uid 1000), `HOME=/home/foundry`
- 🔴 `anvil --help` le dit noir sur blanc : *« the fork RPC cache location … uses endpoint-specific
  files under `~/.foundry/cache/rpc/<chain>/<block>/` »*. **Persister ce volume, c'est transformer
  les 9,087 s à froid en 0,046 s.** C'est la parade n°1 au poste de dépense RPC.

```yaml
# tare/docker-compose.yml
name: tare

x-anvil: &anvil
  image: ghcr.io/foundry-rs/foundry:latest
  restart: unless-stopped
  env_file: [.env]
  volumes:
    - foundry_cache:/home/foundry/.foundry/cache   # <- LE volume qui tue le 9,087 s
  healthcheck:
    test: ["CMD-SHELL", "cast block-number --rpc-url http://127.0.0.1:8545 >/dev/null || exit 1"]
    interval: 5s
    timeout: 10s
    retries: 30
    start_period: 40s

services:

  postgres:
    image: pgvector/pgvector:pg16          # 639 Mo, verifie localement
    container_name: tare-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: tare
      POSTGRES_PASSWORD: tare_dev
      POSTGRES_DB: tare
    ports: ["5436:5432"]                   # 5432/5435 sont deja pris sur cette machine
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init-pgvector.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tare -d tare"]
      interval: 3s
      timeout: 3s
      retries: 20

  redis:
    image: redis:7-alpine                  # 61,9 Mo, verifie localement
    container_name: tare-redis
    restart: unless-stopped
    ports: ["6382:6379"]
    command: ["redis-server", "--appendonly", "yes"]
    volumes: [redisdata:/data]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      timeout: 3s
      retries: 20

  # ---- 4 forks anvil. La chaine et le bloc sont EPINGLES : toute mesure est rejouable. ----
  anvil-1:
    <<: *anvil
    container_name: tare-anvil-1
    ports: ["8555:8545"]
    command: "anvil --host 0.0.0.0 --port 8545 --fork-url ${BASE_RPC_URL} --fork-block-number ${FORK_BLOCK} --steps-tracing false --silent"
  anvil-2:
    <<: *anvil
    container_name: tare-anvil-2
    ports: ["8556:8545"]
    command: "anvil --host 0.0.0.0 --port 8545 --fork-url ${BASE_RPC_URL} --fork-block-number ${FORK_BLOCK} --steps-tracing false --silent"
  anvil-3:
    <<: *anvil
    container_name: tare-anvil-3
    ports: ["8557:8545"]
    command: "anvil --host 0.0.0.0 --port 8545 --fork-url ${BASE_RPC_URL} --fork-block-number ${FORK_BLOCK} --steps-tracing false --silent"
  anvil-4:
    <<: *anvil
    container_name: tare-anvil-4
    ports: ["8558:8545"]
    command: "anvil --host 0.0.0.0 --port 8545 --fork-url ${BASE_RPC_URL} --fork-block-number ${FORK_BLOCK} --steps-tracing false --silent"

  # ---- one-shot : cree le schema puis sort. Les apps l'attendent. ----
  migrate:
    build: {context: ., dockerfile: docker/migrate.Dockerfile}
    container_name: tare-migrate
    restart: "no"
    environment:
      DATABASE_URL: postgres://tare:tare_dev@postgres:5432/tare
    depends_on:
      postgres: {condition: service_healthy}

  engine:
    build: {context: ., dockerfile: docker/engine.Dockerfile}   # python:3.12-slim + foundry cast
    container_name: tare-engine
    restart: unless-stopped
    env_file: [.env]
    environment:
      DATABASE_URL: postgres://tare:tare_dev@postgres:5432/tare
      REDIS_URL: redis://redis:6379
      ANVIL_POOL: "http://anvil-1:8545,http://anvil-2:8545,http://anvil-3:8545,http://anvil-4:8545"
      FORK_BLOCK: ${FORK_BLOCK}
      CHAIN_ID: "8453"
      ENGINE_VER: ${ENGINE_VER:-0.1.0}
    volumes: ["./engine:/app/engine:ro", "graphcache:/app/.cache"]
    depends_on:
      migrate:  {condition: service_completed_successfully}
      redis:    {condition: service_healthy}
      anvil-1:  {condition: service_healthy}
      anvil-2:  {condition: service_healthy}
      anvil-3:  {condition: service_healthy}
      anvil-4:  {condition: service_healthy}
    healthcheck:
      test: ["CMD-SHELL", "python -c \"import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health')\""]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 20s
    ports: ["8000:8000"]

  ai-service:
    build: {context: ., dockerfile: apps/ai-service/Dockerfile}
    container_name: tare-ai
    restart: unless-stopped
    environment:
      PORT: "3003"
      HOST: "0.0.0.0"
      DATABASE_URL: postgres://tare:tare_dev@postgres:5432/tare
      INTERNAL_HMAC_SECRET: ${INTERNAL_HMAC_SECRET:-dev-hmac-do-not-use-in-prod-aaaaaaaaaaaaaaaa}
      OPENAI_API_KEY: ${OPENAI_API_KEY:?OPENAI_API_KEY manquante - CorLens a livre en prod avec la cle VIDE, on ne recommence pas}
    ports: ["3003:3003"]
    depends_on:
      migrate: {condition: service_completed_successfully}
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O- http://127.0.0.1:3003/health || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 15s

  api:
    build: {context: ., dockerfile: apps/api/Dockerfile}
    container_name: tare-api
    restart: unless-stopped
    env_file: [.env]
    environment:
      PORT: "8787"
      DATABASE_URL: postgres://tare:tare_dev@postgres:5432/tare
      REDIS_URL: redis://redis:6379
      ENGINE_URL: http://engine:8000
      AI_SERVICE_URL: http://ai-service:3003
      INTERNAL_HMAC_SECRET: ${INTERNAL_HMAC_SECRET:-dev-hmac-do-not-use-in-prod-aaaaaaaaaaaaaaaa}
      X402_FACILITATOR_URL: ${X402_FACILITATOR_URL:-https://api.testnet.blocky402.com}
      X402_NETWORK: ${X402_NETWORK:-hedera:testnet}
      X402_PAY_TO: ${HEDERA_ACCOUNT_ID:?HEDERA_ACCOUNT_ID manquante}
      X402_ASSET: ${X402_ASSET:-0.0.0}          # 0.0.0 = HBAR natif, pas d'association de jeton
      HEDERA_PRIVATE_KEY: ${HEDERA_PRIVATE_KEY:?}
      HCS_TOPIC_ID: ${HCS_TOPIC_ID:?cree a J0, sinon le journal n'existe pas}
    ports: ["8787:8787"]
    depends_on:
      migrate:    {condition: service_completed_successfully}
      redis:      {condition: service_healthy}
      ai-service: {condition: service_healthy}
      engine:     {condition: service_healthy}
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O- http://127.0.0.1:8787/health || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 15s

  mcp:
    build: {context: ., dockerfile: apps/mcp/Dockerfile}
    container_name: tare-mcp
    restart: unless-stopped
    environment:
      API_URL: http://api:8787
      MCP_TRANSPORT: http
      PORT: "3010"
    ports: ["3010:3010"]
    depends_on:
      api: {condition: service_healthy}
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O- http://127.0.0.1:3010/health || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 20

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args: {VITE_API_URL: "http://localhost:8787"}
    container_name: tare-web
    restart: unless-stopped
    ports: ["5173:80"]
    depends_on:
      api: {condition: service_healthy}

volumes:
  pgdata:
  redisdata:
  foundry_cache:     # <- ne JAMAIS le supprimer entre deux runs
  graphcache:
```

`.env.example` :
```bash
BASE_RPC_URL=https://…            # RPC PAYANT. Le public rend 9,087 s a froid (mesure du 29/08)
FORK_BLOCK=50614000               # epingle. Change-le et TOUTES les mesures changent.
ENGINE_VER=0.1.0
OPENAI_API_KEY=
INTERNAL_HMAC_SECRET=
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=0x…
HCS_TOPIC_ID=0.0.xxxxx
X402_FACILITATOR_URL=https://api.testnet.blocky402.com   # PAS api.blocky402.com (mainnet only)
X402_NETWORK=hedera:testnet
X402_ASSET=0.0.0
```

## 2.4 🎯 LES PORTES DE VÉRIFICATION — un critère binaire par lot

**C'est le cœur de la demande.** Chaque porte est une commande qui **rend 0 ou rend ≠ 0**. Rien à
interpréter. `scripts/verify.sh` les enchaîne ; l'agent boucle jusqu'à ce que sa porte passe.

### Porte 0 — l'infrastructure
```bash
docker compose up -d --wait          # --wait echoue si un healthcheck ne passe pas
test $(docker compose ps --format '{{.Health}}' | grep -c healthy) -ge 8
```

### Porte A — le moteur
```bash
# A1 : le stub satisfait Hooks.sol, en dur
docker compose exec -T engine python -m engine.stub --selfcheck
#     -> assert len(STUB)==33 ; assert ret(beforeSwap)==96 ; assert ret(afterSwap)==64 ; assert selecteur reemis

# A2 : le vecteur d'or de la liquidite  (le seul chiffre que j'ai verifie contre la chaine)
docker compose exec -T engine python -m engine.liquidity \
  --pool-id 0x706140c978c382cda318ba3d1282368231e580a3d7b13803d09ca3593caca8cf \
  | grep -qx "365514774916937598336610"

# A3 : LE VECTEUR D'OR DU CONTREFACTUEL. Si ca passe, le produit existe.
docker compose exec -T engine python -m engine.measure \
  --hook 0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc \
  --pool-id 0x706140c978c382cda318ba3d1282368231e580a3d7b13803d09ca3593caca8cf \
  --block 50614000 --no-zero-for-one --sizes 1e14,1e15,1e16,1e17,1e18 --format bps \
  | grep -qx "99.99,99.93,99.26,93.10,57.44"

# A4 : la taxonomie de reverts
docker compose exec -T engine python -m engine.measure \
  --hook 0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc \
  --pool-id 0x706140c978c382cda318ba3d1282368231e580a3d7b13803d09ca3593caca8cf \
  --block 50614000 --zero-for-one --sizes 1e15 --format label \
  | grep -qx "NON_COTABLE:0x7a5ed734:NotEnoughLiquidity"

# A5 : le corpus statique complet, reproduit
docker compose exec -T engine python -m engine.sweep --static-only --block 50614000 --json \
  | python3 -c "import json,sys; d=json.load(sys.stdin); \
      assert len(d)==128, len(d); \
      assert sum(1 for x in d if x['bps'] is not None)==70; \
      assert all(x['revert_selector']=='0x7a5ed734' for x in d if x['bps'] is None); print('OK')"
```
> **A3 est la porte qui compte.** Elle compare 5 nombres à 5 nombres que j'ai obtenus indépendamment
> avec un stub écrit à la main. Un agent ne peut pas la truquer sans réimplémenter le moteur juste.

### Porte B — base et contrats
```bash
# B1 : le schema porte les colonnes qui rendent une mesure rejouable
docker compose exec -T postgres psql -U tare -d tare -tAc \
 "select count(*) from information_schema.columns where table_name='measurement'
  and column_name in ('pool_id','block_number','observed_at','stub_hash','engine_ver',
                      'stored_lp_fee','fee_is_dynamic','revert_selector','zero_for_one')" \
 | grep -qx "9"

# B2 : aucune ligne ne peut exister sans son bloc  (contrainte, pas convention)
docker compose exec -T postgres psql -U tare -d tare -c \
 "insert into measurement(hook,pool_id,chain_id,amount_in,zero_for_one,label,stub_hash,engine_ver)
  values('\x00','\x00',8453,1,true,'MESURE','\x00','t')" 2>&1 | grep -q "null value in column \"block_number\""

# B3 : les 20 commandes de l'assistant sont typees et fermees
pnpm --filter @tare/contracts test -- --run   # union discriminee : 20 cas valides + 1 cas inconnu -> clarify
```

### Porte C — l'API
```bash
curl -sf localhost:8787/health | grep -q '"ok":true'
curl -sf 'localhost:8787/hooks?minBps=100' | python3 -c "import json,sys;d=json.load(sys.stdin);assert d['total']>0;print('OK')"
# tout point de mesure expose sa commande de rejeu
curl -sf localhost:8787/measurements/1 | python3 -c "import json,sys;d=json.load(sys.stdin);assert d['replay'].startswith('docker compose exec');print('OK')"
```

### Porte D — ai-service
```bash
curl -sf -X POST localhost:3003/embedding -H 'content-type: application/json' \
  -H "x-hmac: $(scripts/hmac.sh)" -d '{"input":"beforeSwap hook"}' \
  | python3 -c "import json,sys;assert len(json.load(sys.stdin)['embedding'])==1536;print('OK')"
# le journal de prompts est ECRIT, pas declare
docker compose exec -T postgres psql -U tare -d tare -tAc "select count(*) from prompt_log" | grep -qv '^0$'
```

### Porte E — le SDK
```bash
# le seul test qui compte : 100 % client, zero RPC
node -e "const {decodeFlags}=require('./packages/sdk-ts/dist');
 const f=decodeFlags('0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc');
 if(!(f.beforeSwap&&f.afterSwap&&f.beforeSwapReturnsDelta&&f.afterSwapReturnsDelta&&!f.beforeDonate))process.exit(1)"
# et l'exactitude sur TOUT le registre
python3 -c "
import json,sys; sys.path.insert(0,'packages/sdk-py')
from tare import decode_flags
h=json.load(open('repos/sponsor-uniswap-hooklist/hooklist.json'))
n=sum(1 for e in h for k,v in decode_flags(e['hook']['address']).items() if v==e['flags'][k])
assert n==len(h)*14, n; print('8582/8582 OK')"
```

### Porte F — le graphe (et la porte anti-COBOL)
```bash
# F1 : les requetes rendent quelque chose
docker compose exec -T engine python -m engine.graph.cli impact  --hook 0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc | python3 -c "import json,sys;assert len(json.load(sys.stdin)['pools'])>=25;print('OK')"
docker compose exec -T engine python -m engine.graph.cli orphans | python3 -c "import json,sys;json.load(sys.stdin);print('OK')"

# F2 : 🔴 LA PORTE ANTI-BUG-COBOL. Le graphe est construit UNE fois pour tout le process.
docker compose exec -T engine python -m engine.graph.cli --assert-single-build --n 50
#     l'implementation : un compteur global increment dans build_graph(); l'assertion exige ==1 apres 50 requetes.
# F3 : et le budget temps le prouve aussi
docker compose exec -T engine python -m engine.graph.cli --bench --n 200 \
  | python3 -c "import json,sys;d=json.load(sys.stdin);assert d['p50_ms']<1.0,d;print('OK')"
```

### Porte G — MCP
```bash
npx @modelcontextprotocol/inspector --cli http://localhost:3010 --method tools/list \
  | python3 -c "import json,sys;t={x['name'] for x in json.load(sys.stdin)['tools']};
     assert t=={'tare_measure','tare_lookup','tare_impact','tare_twins','tare_replay'},t;print('OK')"
```

### Porte H — 🔴 LA PORTE HEDERA. Celle qui vaut 2 000 $
```bash
# H1 : le service EST bien x402-garde
test "$(curl -s -o /dev/null -w '%{http_code}' -X POST localhost:8787/v1/measure -d '{}')" = "402"

# H2 : la 402 annonce le bon reseau ET le bon feePayer
curl -s -X POST localhost:8787/v1/measure -d '{}' \
 | python3 -c "import json,sys;a=json.load(sys.stdin)['accepts'][0];
    assert a['network']=='hedera:testnet',a; assert a['scheme']=='exact';
    assert a['extra']['feePayer']=='0.0.7162784',a; print('OK')"

# H3 : LE PAIEMENT REEL DE BOUT EN BOUT  (l'exigence dure du brief)
node scripts/agent-pay.mjs --url http://localhost:8787/v1/measure \
  --hook 0x985c14baa2a18316ffda0aefb3a632fadfca2acc \
  --pool-id 0x… --amount-in 1e15 > /tmp/paid.json
python3 -c "import json;d=json.load(open('/tmp/paid.json'));
 assert d['status']==200; assert d['settlement']['transactionId'];
 assert d['result']['bps'] is not None; print(d['settlement']['transactionId'])"

# H4 : la trace HCS existe, et elle porte le bloc
node scripts/hcs-tail.mjs --topic $HCS_TOPIC_ID --last 1 \
 | python3 -c "import json,sys;m=json.load(sys.stdin);
    assert m['block']==50614000; assert m['pool_id'].startswith('0x'); print('OK')"

# H5 : le compteur facture le CALCUL, pas la requete
curl -s localhost:8787/v1/usage | python3 -c "import json,sys;d=json.load(sys.stdin);
 assert d['unit']=='quoter_calls', d; assert d['total']>=2; print('OK')"
```
> **H3 est binaire et non négociable : sans un `transactionId` Hedera visible sur HashScan, le prix
> est perdu quoi qu'il arrive par ailleurs.** Le brief l'écrit : *« completes at least one real paid
> request end to end »* (`watch/prizes-20260828-2234.txt:58`).

### Porte I — l'agrégat
```bash
make verify     # enchaine 0..H, s'arrete au premier echec, imprime la porte fautive
make test       # imprime la ligne finale :  "TARE: 118/118 tests green"
```

## 2.5 Les tests : quoi, combien, et comment obtenir un compte citable

**Le patron à copier :** Slopstock écrit *« eight Foundry contracts total, **83/83 tests green** »*
(`research/win-async-finalists.json`, `slopstock-7zgd6`). **Point gratuit, à ne pas perdre.**

| suite | outil | ce qu'on teste | nombre visé |
|---|---|---|---|
| `engine/tests/test_stub.py` | pytest | longueurs 96/64, sélecteur réémis, refus sur une longueur fausse, `stub_hash` stable | **8** |
| `engine/tests/test_poolid.py` | pytest | `poolId` sur 4 vecteurs d'or, dont `0x706140c9…` | **6** |
| `engine/tests/test_liquidity.py` | pytest | `keccak(poolId‖6)+3` sur 3 vecteurs (dont `365514774916937598336610`) | **5** |
| `engine/tests/test_flags.py` | pytest | **paramétré sur les 613 fiches** → 1 test paramétré ×613, compté **1** dans le rapport mais annoncé « 8 582 assertions » | **3** |
| `engine/tests/test_reverts.py` | pytest | décodage `0x6190b2b0` → `0x7a5ed734` → étiquette ; 4 sélecteurs connus + 1 inconnu | **6** |
| `engine/tests/test_measure_golden.py` | pytest (fixture figée, **zéro réseau**) | les 5 bps du vecteur d'or ; les 128 obs statiques ; le 1176 du hook vedette | **9** |
| `engine/tests/test_labels.py` | pytest | machine à états `MESURE / INTERPOLE / NON_MESURABLE / NON_COTABLE` | **7** |
| `engine/tests/test_graph.py` | pytest | impact/twins/orphans/disagreement + **le test « une seule construction »** | **9** |
| `contracts/test/Stub.t.sol` | forge | `vm.etch` du stub puis `poolManager.swap` : `beforeSwap` accepté, `afterSwap` accepté, longueur fausse ⇒ `InvalidHookResponse` | **6** |
| `packages/db` | vitest | contraintes NOT NULL (une par colonne obligatoire), index, insertion/relecture | **11** |
| `packages/contracts` | vitest | les 20 commandes : parse OK, parse KO, `strict()` refuse un champ en trop, commande inconnue → `clarify` | **21** |
| `apps/api` | vitest | routes, `replay` non vide, 402 sur `/v1/measure`, quota de session, SSE | **14** |
| `apps/api/x402` | vitest (facilitateur bouchonné) + 1 intégration réelle | 402, en-têtes, verify, settle, échec de paiement, `usage` en `quoter_calls`, message HCS | **12** |
| `apps/ai-service` | vitest | HMAC accepté/refusé, `prompt-log` écrit, embedding dimension | **7** |
| `apps/mcp` | vitest | 5 outils listés, schémas d'entrée, `tare_measure` renvoie 402 sans paiement | **8** |
| `packages/sdk-ts` / `sdk-py` | vitest / pytest | flags, poolId, slot, constantes du stub | **10 (5+5)** |
| `apps/web` | vitest | widget 14 LED sur 100 adresses aléatoires ; **règle d'axe : X log, Y ancré à 0** ; message « 0 ligne » | **9** |
| e2e | Playwright | chargement à froid < 1,5 s, verdict sans clic, chat → tableau filtré, fiche → courbe, page « ce que je ne sais pas » | **6** |
| | | **TOTAL** | **≈ 157** |

**La règle pour que le chiffre soit citable :**
1. `make test` **agrège les 4 runners** (pytest, vitest, forge, playwright) et imprime **une seule
   ligne** : `TARE: 157/157 tests green (pytest 53 · vitest 92 · forge 6 · playwright 6)`.
2. **Le chiffre est produit par la commande, pas écrit à la main.** Le `howItsMade` cite la sortie.
3. **Aucun test réseau dans le compte.** Les tests du moteur tournent sur des fixtures figées au
   bloc 50 614 000 — c'est la seule façon d'avoir 157/157 le jour du jury, avec ou sans RPC.
4. **Un test qui échoue est supprimé du dépôt ou réparé, jamais `skip`.** Un `skipped` visible dans
   la sortie annule l'effet du chiffre.

## 2.6 Les pièges connus — chacun avec sa parade et sa porte

| # | piège | origine | parade | porte |
|---|---|---|---|---|
| 1 | **cotation à froid 9,087 s vs 0,046 s à chaud** | mesuré ici, §0.6 | RPC payant **+ volume `foundry_cache:/home/foundry/.foundry/cache`** (chemin confirmé par `anvil --help`) **+ 4 anvil en parallèle** | Porte 0 : `--wait` sur les 4 healthchecks ; A3 doit passer en < 3 s au 2ᵉ appel |
| 2 | **`graph.json` reparsé à chaque requête HTTP** | `server/api/app.py:157` + `agent/tools.py:25` | singleton `_GRAPH` + `threading.Lock`, **exactement le patron de `store()` dix lignes plus bas dans le même fichier** | **F2** : compteur de constructions, `assert == 1` après 50 requêtes |
| 3 | **`void ragIndex;` — index jamais peuplé** | `apps/corridor/src/app.ts:118` (CorLens) | **le corpus est nommé** (613 descriptions + sources vérifiées + 30 audits) et **le nombre de vecteurs est une porte** | Porte D bis : `select count(*) from chunks` ≥ 600 |
| 4 | **absence d'horodatage / de bloc** | `27-AUDIT-ADVERSE.md` FAUX n°4 | `block_number`, `observed_at`, `stub_hash`, `engine_ver` **NOT NULL en base** | **B2** : l'INSERT sans `block_number` doit échouer |
| 5 | **`OPENAI_API_KEY` vide en production** | `.env` de prod LPLens (doc 01 §2.5) | `${OPENAI_API_KEY:?}` dans le compose : **le service refuse de démarrer** | Porte 0 |
| 6 | **une réponse qui écrase le fichier précédent** | `x402-live.json` (audit FAUX n°4) | tout va en Postgres, `bigserial`, jamais de `json.dump` sur un chemin fixe | B1 |
| 7 | **TLS désactivé dans les sondes** | audit FAUX n°7 | interdit ; `requests`/`httpx` par défaut | revue de code, grep `verify=False` = 0 |
| 8 | **troncature `[:3]` qui fabrique une preuve** | audit FAUX n°1 | aucune troncature dans les artefacts ; la pagination est côté lecture seulement | grep `[:3]` dans `engine/` = 0 |
| 9 | **le README promet ce que le code ne fait pas** | LPLens (§0.6 doc 34) | 🔴 **corriger la fiche ETHGlobal ET le README de LPLens avant le 4/09** ; et dans TARE, chaque phrase du README pointe une ligne | J0, puis revue J6 |
| 10 | **forme liste dans `command:` du conteneur foundry** | testé ici | `command:` **en chaîne unique** ; l'`ENTRYPOINT` est `/bin/sh -c` | Porte 0 : anvil healthy |
| 11 | **mauvais facilitateur** | `api.blocky402.com` = mainnet **seulement** | `X402_FACILITATOR_URL=https://api.testnet.blocky402.com` | **H2** : `feePayer == 0.0.7162784` |
| 12 | **la liquidité prise pour un identifiant de pool** | doc 34 §0.4 | `pool_id` partout, clé de tout ; la liquidité n'est qu'une colonne | B1 + A2 |
| 13 | **le modèle qui produit un nombre** | règle d'or, jamais testée | test qui rejette tout littéral numérique hors champ typé | Porte B3 |
| 14 | **`fee_is_dynamic` sans `stored_lp_fee`** | §0.3 de ce document | les deux colonnes, obligatoires | B1 (9 colonnes) |

---

# PARTIE 3 — LE CALENDRIER J0 → J7

## J0 — avant le 4 septembre. Aucun code produit, tout est débloqué

| # | tâche | preuve que c'est fait |
|---|---|---|
| 1 | 🔴 **Corriger la fiche ETHGlobal ET le README de LPLens** | la chaîne *« with and without »* ne renvoie plus sur LPLens |
| 2 | **RPC Base payant** | `BASE_RPC_URL` dans `.env`, une cotation à froid < 1 s |
| 3 | **Compte Hedera testnet financé + aller-retour Blocky402 à la main** contre `https://api.testnet.blocky402.com` | un `transactionId` en main, visible sur HashScan |
| 4 | **Créer le topic HCS** et mesurer le coût réel d'un message | `HCS_TOPIC_ID` + le coût en HBAR, chiffré |
| 5 | **Écrire `docker-compose.yml` + `.env.example`** (§2.3) | `docker compose config` sort sans erreur |
| 6 | **Écrire les 9 prompts de lot + les portes** dans `AGENTS.md` | le fichier existe, une porte par lot |
| 7 | Basculer le titre sur **les frais statiques** (§0.5) dans tous les textes | plus aucune occurrence de « 11,76 % » comme chiffre-titre |
| 8 | Fixer la taille réelle du stub, ou dire 33 | plus aucune occurrence de « 89 octets » non prouvée |

**Ce qui DISPARAÎT de la liste J0 du doc 34 :** « trancher les frais dynamiques » (fait, §0.3),
« trancher l'identité de `0xb429d62f` » (devenu sans objet, §0.5), « re-générer les mesures » (le
schéma et les vecteurs d'or sont là, §0.1, §0.5, §0.7).

## J1 — les agents. Une seule journée, neuf lots, et on vérifie jusqu'à ce que ça passe

- **Matin** : lancer A, B, D, E en parallèle. Chacun boucle sur sa porte.
- **Après-midi** : C, F, G, H. Puis I.
- **Fin de journée : `make verify` rend 0 sur les portes 0 → I.**

**Si une porte ne passe pas à 20 h, on ne discute pas : on relance l'agent avec la sortie d'échec
collée dans le prompt.** C'est le sens de « vérifier jusqu'à ce que ce soit bon » : la boucle est
pilotée par une commande, jamais par une lecture de code.

**Ce qui doit être vrai le soir de J1 :** l'API sert des mesures depuis Postgres, un agent paie en
x402 sur Hedera testnet et reçoit un verdict, le MCP liste 5 outils, le SDK est publié sur npm et
PyPI, et `make test` imprime un compte.

## J2 — la couverture (agent + humain en surveillance)

- Balayage complet : **199 pools liquides × 2 sens × 5 tailles ≈ 2 000 observations**.
  À 0,12 s l'observation en médiane sur fork chaud (mesuré §0.5) et 4 anvil : **~1 minute de calcul
  pur**, le reste est la latence de premier accès. **La force brute est atteignable à cette échelle.**
  L'échantillonneur adaptatif n'est plus une nécessité — **il devient un argument de conception à
  garder pour l'échelle historique, et à présenter comme tel, pas comme une contrainte inventée.**
- Clones par bytecode (`eth_getCode` → hash → nœud `(:Bytecode)`), déployeurs.
- **Porte J2** : ≥ 1 500 observations en base · ≥ 10 courbes non plates · ≥ 1 grappe de clones ·
  100 % des lignes portent `pool_id`, `block_number`, `stored_lp_fee`, `stub_hash`.

## J3 → J5 — **L'HUMAIN. Le front, et rien d'autre.**

| jour | livrable | porte |
|---|---|---|
| **J3** | Le widget **14 LED** (100 % client, sans RPC) · la matrice dense `@tanstack/react-table` · le squelette de la fiche hook | verdict à l'écran **sans un clic**, chargement à froid < 1,5 s (Playwright) |
| **J4** | **La courbe** (uPlot ou Canvas nu) avec **X log, Y ancré à 0, 5 points visibles, incertitude affichée** · la vue `compare` · la page « ce que je ne sais pas » | le test d'axe passe · la page limites existe et cite §0.3 et §0.4 |
| **J5** | **L'assistant** : SSE + bus des 20 commandes · les 3 vues de graphe (`impact`, `twins`, `orphans`) · `showEvidence` | *« montre-moi les hooks autorisés par défaut dans le routeur de production qui prennent plus de 100 bps »* → le tableau se réduit, on ouvre, la courbe se dessine, **sans un clic** |

**Décision au soir de J5, une seule question :** *les trois portes J3/J4/J5 passent-elles ?*
- **oui** → J6 matin = **l'extension** (§1.2 a). C'est le différenciateur.
- **non** → J6 matin = finir le front. **On coupe l'extension.** Le SDK et la PR portent l'ACTION.

## J6 — le gel et les cases éliminatoires

- `FEEDBACK.md` à la racine + **formulaire `developers.uniswap.org/hackathon-feedback` avec le lien vers ce fichier** (`watch/prizes-20260828-2234.txt:485`)
- README qui **pointe les contrats et les lignes** (exigence littérale du brief Uniswap) : `Hooks.sol:153/166/259`, `Pool.sol:303-305`, `BaseV4Quoter.sol:52-56`
- **La PR sur `Uniswap/hooklist`** (§1.2 c)
- Attribution IA, specs et prompts commités
- **`make test` → le compte final**, collé dans le `howItsMade`
- `howItsMade` de **4 500–5 500 caractères** dans l'ordre : le mur (`PoolKey` contient le hook) → le stub et ses trois invariants → **`HookSwap`/`HookFee` : 0 sur 84** → **le pool à frais 0 qui perd 100 bps** → les mesures et leurs permaliens → **les limites** (`NotEnoughLiquidity`, multi-saut, `hookData`) → **les corrections** → la stack avec versions et comptes
- Extension : `.zip` + instructions « charger l'extension non empaquetée » **si elle existe**

## J7 — la vidéo, seule

Plan revu par rapport au doc 34 §VIII, avec **deux corrections** :

| temps | plan | changement |
|---|---|---|
| 0:00–0:05 | logo animé — **même effet qu'à l'outro** | — |
| 0:05–0:20 | l'accueil à froid, sans rien toucher · les **14 LED** sur une adresse collée | — |
| 0:20–0:50 | **le fait** : *« Uniswap demande aux hooks de déclarer ce qu'ils prennent. Sur 84 hooks déployés en 24 000 blocs, zéro le fait. »* | — |
| 0:50–1:25 | **la mesure sur un pool à frais statique ZÉRO** : le stub remplace le hook, la cotation change de 100 bps. *« Ce pool affiche zéro frais. Le hook en prend cent points de base. »* | 🔴 **change de pool** — celui-ci ne peut pas être attaqué sur les frais dynamiques |
| 1:25–1:55 | le même hook, sept pools : **0 · 17 · 59 · 119 · 157 · 357 · 1 176 bps** | 🔴 **remplace « le facteur 10 » par la série complète** — elle est plus forte et je l'ai reproduite |
| 1:55–2:25 | **la preuve en direct** dans un terminal : `docker compose exec engine python -m engine.measure --hook … --block 50614000`, le même nombre tombe | — |
| 2:25–2:45 | **l'assistant** : une phrase tapée, le tableau se reconfigure, la courbe se dessine | 🔴 **séparé du paiement** |
| 2:45–3:05 | **un agent** en terminal appelle l'API, reçoit un 402, paie en x402 sur Hedera, reçoit le verdict, **hash HashScan à l'écran** | 🔴 **scène distincte** — le chat web n'a pas de wallet Hedera (§1.3) |
| 3:05–3:20 | **la page « ce que je ne sais pas »** — `NotEnoughLiquidity`, multi-saut non couvert, frais stockés, corrections. Logo, même effet | — |

Durée visée **3 min 20**, fenêtre **2:00–4:00** (Hedera : ≤ 5 min, une seule vidéo suffit).

## Ce qu'on coupe, dans l'ordre, si ça déborde

| ordre | on coupe | on garde à la place | ce qu'on perd |
|---|---|---|---|
| 1 | **pgvector / RAG** | la recherche plein texte Postgres sur les 613 descriptions | presque rien : le corpus est petit, la prose n'est pas le sujet |
| 2 | **l'échantillonneur adaptatif** | force brute sur 199 pools — **~1 min de calcul mesuré** | un argument de conception, pas une fonction. **Le dire honnêtement : « à cette échelle la force brute suffit ; l'échantillonneur existe pour l'historique complet »** |
| 3 | **l'extension** | le SDK npm/PyPI + la PR hooklist | le différenciateur « action ». **Coupe-la seulement si J5 n'a pas passé ses portes** |
| 4 | **les 3 vues de graphe dans l'UI** | les mêmes requêtes exposées en MCP + en README | la démo perd un tour de chat ; le graphe reste démontrable au terminal |
| 5 | **`compare` (vue scindée)** | deux onglets | un plan de vidéo |
| — | ❌ **JAMAIS** | la porte A3 · la porte H3 · la page « ce que je ne sais pas » · `FEEDBACK.md` + le formulaire · le compte de tests | ce sont les cinq choses qui décident |

---

# LES CINQ PHRASES QUI RÉSUMENT CE DOCUMENT

1. **Le moteur marche : je l'ai réécrit et je retrouve `[99,99 · 99,93 · 99,26 · 93,10 · 57,44]` à la
   quatrième décimale, avec un stub de 33 octets et un `poolId` traçable.**
2. **Le blocage n°2 du doc 34 est levé : `Pool.sol:303-305` prouve que la référence est le frais
   stocké du pool, pas zéro — et sur 32 pools à frais STATIQUE, un hook prend 100 bps là où le pool
   affiche 0 %. Le titre n'a plus besoin des frais dynamiques.**
3. **Les « 77,6 % non cotables » sont une seule erreur nommée, `NotEnoughLiquidity` (`0x7a5ed734`),
   et la moitié disparaît en balayant les deux sens.**
4. **Le facilitateur Hedera testnet est `https://api.testnet.blocky402.com`, feePayer `0.0.7162784` —
   il n'est documenté nulle part sur le site de Blocky402, et sans lui J4 se passe à déboguer un DNS.**
5. **L'ACTION n'est pas définie : il faut trancher aujourd'hui que le SDK et la PR partent avec les
   agents à J1/J6, et que l'extension est conditionnée aux portes de J5.**
