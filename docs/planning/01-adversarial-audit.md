# 27 — AUDIT ADVERSE : ce qui est FAUX dans les documents 23 et 24

> Un procureur technique a attaqué Assay. **Il a eu raison sur l'essentiel.** J'ai revérifié chaque
> accusation moi-même avant d'écrire ce document. Les chiffres ci-dessous sont les miens, pas les siens.
>
> C'est la deuxième fois que je bâtis un angle sur un chiffre non contrôlé (la première :
> `08-CORRECTION-AT2.md`). La différence, cette fois, c'est que l'erreur est trouvée le 28 août et
> pas le 11 septembre.

---

## 🔴 FAUX N°1 — l'exemple « gridpulse » est fabriqué par mon propre code

Il est dans `24-NOYAU-TECHNIQUE.md` §4, dans `23-LE-PROJET.md` §3.5 ter, **et dans le brouillon de
`howItsMade`**, où il sert de deuxième preuve : *« an agent following the registry would build a
transaction on the wrong chain »*.

**Vérification live du 28/08 :**

```
DEMANDE  scheme=exact network=base          asset=0x833589fC…2913  montant=10000
DÉCLARE  scheme=exact network=eip155:8453   asset=0x833589fC…2913  montant=10000   ← 1re offre
```

**Même chaîne, même jeton, même montant.** Seule l'orthographe du réseau diffère.
Ce n'est pas une divergence, c'est un alias CAIP-2.

Pourquoi mon dossier affichait Algorand : `tools/x402full.py` ligne 34 stocke `sorted(adv)[:3]`.
gridpulse déclare **13 offres** ; le tri alphabétique met `algorand:…` en tête et **la ligne Base
disparaît de la preuve**. La troncature n'a pas caché l'exemple : elle l'a **fabriqué**.

---

## 🔴 FAUX N°2 — mon comparateur compte les alias de réseau comme des divergences

`norm()` compare `network` en chaîne brute. Or le registre contient les deux graphies :

| graphie courte | occurrences | graphie CAIP-2 | occurrences |
|---|---|---|---|
| `base` | **303** | `eip155:8453` | 16 630 |
| `solana` | 18 | `solana:5eykt4Us…` | 5 352 |
| `algorand:…73ktiC1qzkkit8=` | **160** | `algorand:…73k` | 877 |
| `base-sepolia` | 13 | `eip155:84532` | 144 |
| `polygon` / `arbitrum` | 1 / 1 | `eip155:137` / `eip155:42161` | 1 861 / 1 752 |

Le procureur, en rejouant avec une table d'alias et une comparaison numérique des montants, obtient
**882 des 2 626 qui redeviennent CONFORMES**, plus **441** où le serveur offre un *sur-ensemble* de
ce qui est déclaré (le plan de l'agent tient) — soit **1 323 / 2 626 = 50,4 % du chiffre-titre qui
s'évapore**. Je n'ai pas pu rejouer le calcul complet moi-même : `research/x402-conform.json` ne
stocke que 3 offres par ressource (cf. FAUX n°4), donc **le recalcul exige de re-sonder**. C'est la
première tâche à faire, et le chiffre de 40 % ne doit pas être réutilisé avant.

---

## 🔴 FAUX N°3 — la comparaison de montants est sans unité

`tools/x402full.py` ligne 11 : `str(a.get("maxAmountRequired") or a.get("amount") or "")`.
Comparaison de **chaînes**, jamais de lecture de `decimals()`.

**881 offres portent un montant en unités humaines décimales** : `'0.1'` ×266, `'0.15'` ×145,
`'0.08'` ×133, `'0.25'` ×56, `'0.2'` ×54, `'0.05'` ×51. gridpulse lui-même déclare `xrpl:0 / RLUSD / 0.01`.

Conséquence : les plus gros « surcoûts » du corpus sont des ordres de grandeur absurdes
(×3,3·10¹⁴ chez `aegis-ai.xyz`) qui sont des décimales comparées à des unités de base, pas des abus.

Sur les 1 055 « divergences de montant » : **862 (82 %) ont le même maximum des deux côtés**,
106 voient le serveur demander **moins**, et **seulement 87 demander plus**.
Mon exemple `api.loyalspark.online` (déclaré 5 000, demandé 1 000) est **une baisse de prix**
présentée comme un défaut.

**Ce qui survit :** `api.hyperextend.xyz/v1/liquidations/BTC` — déclaré 11 000, demandé 111 000,
et le rapport ×10 est cohérent sur les deux rails (`0.011 → 0.111` sur hyperliquid). Celui-là tient.

---

## 🔴 FAUX N°4 — la preuve stockée est amputée pour un tiers des cas signalés

`x402full.py` ligne 34 : `o["declare"]=sorted(adv)[:3]; o["demande"]=sorted(real)[:3]`.

**910 des 2 626 DIVERGENT/PARTIEL (34,7 %) déclarent plus de 3 offres.**
Distribution réelle : 767 ressources déclarent **13** offres, 180 en déclarent **14**.
Pour tous ceux-là, la preuve du dossier est incomplète et peut inverser le verdict, comme pour gridpulse.

Aggravant : **aucun horodatage nulle part**. Les clés de `research/x402-live.json` sont
`['accepts_n','host','parsed','resource','status','x402Version']` — pas de `observed_at`. Et chaque
exécution **écrase** le fichier. Le produit promet « observé le … » et « une ressource qui meurt
montre sa date de mort » : rien de tout ça n'existe.

---

## 🔴 FAUX N°5 — le `howItsMade` ment sur la pile technique

Il annonce *« Python probe workers (asyncio/ThreadPoolExecutor, 48–64 concurrent) »*.
**`asyncio` n'apparaît dans aucun des scripts.** `grep -n "asyncio" tools/x402*.py` → aucune occurrence.
Il annonce Postgres : il n'y a que des `json.dump`.

---

## 🔴 FAUX N°6 — « 0 ressource Hedera » n'est pas une découverte

C'est **la prémisse publiée du sponsor**, mot pour mot dans son propre brief
(`tools/raw-prizes-ethonline2026.txt`) :

> « Hedera is built for this, but **x402 on Hedera is still short of one thing: actual services you
> can pay for.** »

Le présenter comme « le fait qui fait le titre » devant un juge Hedera est le pire angle possible :
on lui récite son texte. Le fait reste vrai et utile comme *contexte*, jamais comme *trouvaille*.

---

## 🔴 FAUX N°7 — TLS désactivé dans les cinq sondes

`ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE` dans
`tools/x402live.py`, `x402full.py`, `x402post.py`, `x402conform.py`, `x402recheck.py`.

Un instrument dont toute la valeur est *« je vous dis ce que le serveur a vraiment répondu »*
collecte ses preuves sur un canal non authentifié — et nomme publiquement 264 hôtes sur cette base.
C'est indéfendable et c'est trivial à corriger.

---

## 🔴 FAUX N°8 — le niveau HONORÉ n'existe pas, et c'est l'exigence dure du sponsor

Aucun des scripts ne contient de signature, d'en-tête `X-PAYMENT`, d'EIP-3009 dans un chemin de
paiement, ni d'appel de facilitateur. Or le brief Hedera **exige** :

> « Host a live x402-gated service on Hedera testnet or mainnet, settled through the Blocky402 facilitator. »
> « Build a platform or agent that consumes that service and **completes at least one real paid request end to end**. »

Et HONORÉ est aussi la seule ligne de séparation revendiquée face à x402scan (`23-LE-PROJET.md` §3.5 bis).
Les trois niveaux qui existent sont : « la ligne est dans un JSON », « un `urlopen` a répondu », et
l'égalité de chaînes fautive du FAUX n°2.

---

## ✅ CE QUI SURVIT À L'AUDIT, ET QUI EST SOLIDE

1. **Les 5 109 `SANS_ACCEPTS` (43 % des 402).** Indépendant du comparateur : c'est l'absence d'un
   tableau `accepts` exploitable, pas une comparaison. **À re-vérifier quand même** : mon test lisait
   le corps entier, mais la classification mérite d'être rejouée proprement.
2. **`api.hyperextend.xyz` : 11 000 déclaré, 111 000 demandé.** Re-sondé, cohérent sur deux rails.
3. **🏆 LA COUCHE EIP-712 — intacte, et c'est elle qui porte tout.**
   Elle ne dépend ni des alias de réseau, ni des unités de montant, ni de la troncature : elle compare
   `extra.name`/`extra.version` à `name()`/`version()` lus on-chain, et **elle est démontrée par
   expérience** sur un fork de Base (`tools/preuve-eip712.sh`, doc 24 §9) :
   bon domaine → paiement accepté ; `GatewayWalletBatched`/`1`, déclaré par **963 ressources** →
   `FiatTokenV2: invalid signature`, aucun fonds déplacé.
   Ma méthode a été validée contre une transaction **réellement acceptée on-chain**
   (`0x59d4a95e…`, bloc 50 539 359) avant toute conclusion.
4. **La découverte EIP-7702** : un payeur délégué bascule la vérification vers EIP-1271 ;
   `0x70997970…` porte `0xef0100b2c460…` sur Base. Vérifié.
5. **L'inventaire brut** : 14 833 ressources, 1 622 hôtes, 9 schemes, 43 réseaux, top 1 % = 76 % des appels.

---

## LA CONCLUSION QUI COMPTE

**Le projet ne meurt pas — sa thèse change de couche.**

La couche « déclaré vs demandé » (HTTP, chaînes de caractères) est **fragile, à moitié fausse, et
c'était le scraper**. La couche « satisfiabilité cryptographique » (EIP-712, EIP-3009, EIP-7702,
proxies) est **intacte, démontrée par expérience, et c'est elle qui vaut 5/5 en Technicality**.

> **Le titre n'est plus « le registre annonce un prix, le serveur en demande un autre ».**
> **Il devient : « 963 services x402 déclarent un domaine de signature qui rend leur propre
> paiement impossible — et voici le fork où le contrat les refuse. »**

C'est plus étroit, c'est plus dur, et c'est vrai.

### Ce qu'il faut faire avant d'écrire une ligne de plus

1. Re-sonder en **stockant les offres complètes + un horodatage**, TLS **vérifié**.
2. Recalculer « déclaré vs demandé » avec **table d'alias CAIP-2** et **comparaison numérique après
   lecture de `decimals()`**. Publier le nouveau chiffre, quel qu'il soit.
3. **Construire le niveau HONORÉ** — c'est l'exigence du sponsor et la seule vraie séparation d'avec x402scan.
4. Retirer `asyncio`, Postgres, gridpulse et loyalspark du `howItsMade`.
5. Ne plus jamais présenter « 0 ressource Hedera » comme une trouvaille.

---

# 🔴 FAUX N°9 — LA PREUVE EIP-712 AUSSI. Le pilier que je croyais intact.

**J'avais ignoré un champ.** Les 963 accepts qui déclarent `extra.name="GatewayWalletBatched"`
déclarent aussi, dans le même objet :

```json
"extra": { "name": "GatewayWalletBatched",
           "verifyingContract": "0x77777777dcc4d5a8b6e418fd04d8997ef11000ee",
           "version": "1" }
```

**961 des 963 portent ce `verifyingContract`** (les 2 autres pointent `0x0077777d7eba…`).
Le domaine EIP-712 n'est donc **pas** celui du token : c'est celui du **Gateway wallet de Circle**,
déclaré explicitement par le vendeur. Les vendeurs ne sont pas mal configurés — **c'est moi qui
n'ai pas lu leur déclaration en entier.**

Mon expérience sur fork (`24-NOYAU-TECHNIQUE.md` §9) signait avec l'USDC comme `verifyingContract`.
Elle échouait pour la seule raison qu'elle **devait** échouer : le vendeur n'a jamais prétendu que
le token était le contrat vérificateur. L'expérience était juste ; **l'hypothèse qu'elle testait
était la mienne, pas celle du registre.**

> **Conséquence : « 963 services déclarent un domaine de signature qui rend leur paiement
> impossible » est FAUX. Le titre du projet n'existe plus.**

Ce qui reste vrai de la couche : la méthode de reconstruction (validée contre la transaction réelle
`0x59d4a95e…`), la découverte EIP-7702, et le fait qu'un vérificateur de satisfiabilité **doit lire
`extra.verifyingContract`** — ce que personne, moi compris, ne faisait.

### Précision d'équité envers le registre

Le procureur affirmait que les 963 sont « 94,8 % un seul opérateur (`theaslangroupllc.com`) ».
**C'est faux aussi, et je l'ai mesuré :** 80 hôtes distincts, le premier
(`www.watchevelive.com`) ne pèse que **4,6 %**, `theaslangroupllc.com` cumulé ~10 %.
Je ne charge pas le registre d'un défaut qu'il n'a pas.

---

# BILAN : LES TROIS PILIERS D'ASSAY SONT TOMBÉS

| Pilier | Sort |
|---|---|
| « 40 % des exigences divergent » | ✗ artefact d'alias CAIP-2 + montants sans unité |
| « gridpulse pointe la mauvaise chaîne » | ✗ fabriqué par ma troncature `[:3]` |
| « 963 domaines EIP-712 faux » | ✗ j'ai ignoré `extra.verifyingContract` |

**Assay est mort comme thèse.** Ce qui survit n'est pas un produit, c'est une leçon de méthode et
un corpus de 14 833 ressources.

## Ce qui a été mesuré et qui TIENT, chez les alternatives

| Projet | Technique | Vente | Ce qui est vérifié |
|---|---|---|---|
| **Hookproof** (Uniswap, brief **publié**) | 4/10 en l'état | **7/10** | Recensement **refait à l'aveugle** : 2 052 hooks Base sur 7 j (moi : 2 008), 157 fiches au registre (**exact**), intersection 27 (**exact**), Sourcify 2/80. Rien n'est bluffé. Ce qui ne tient pas, c'est tout ce qui vient *après* l'énumération. |
| **Meter991** (Hedera, brief **publié**) | 4/10 | 6/10 | HIP-991 actif et utilisable, topic réel à 26 messages facturés. Mais frais **fixe par message** : le consensus ne compte rien, il encaisse. Et **0,05 $/message = 62× un HCS normal, 50× le prix d'une inférence entière.** |
| **Touchstone** (EIP-7702, sponsor non publié) | 5/5 revendiqué | — | Recensement **contredit** : l'agent annonce 4,72 % de délégués sur Base ; ma mesure indépendante sur 12 blocs / 1 093 expéditeurs uniques donne **0,09 %** (1 seul). Sur Ethereum on est d'accord (5,86 % vs 6,24 %). **Base est justement la chaîne qui porte 16 630 des accepts.** Écart NON RÉSOLU. |

## Les deux noyaux de remplacement les plus solides sortis de l'exercice

1. **Hookproof → LE CONTREFACTUEL.** Jeter le recensement et les étiquettes de risque. Ne garder
   qu'une chose : **le prélèvement réel d'un hook, en points de base, mesuré.** Sur un fork anvil à
   bloc épinglé, coter le vrai pool via `V4Quoter`, comparer au même pool sans hook. Filtre gratuit :
   `StateView.getLiquidity` (~250 hooks candidats sur Base, en retenir 40 à 60). Ce n'est pas dans
   la fiche d'origine, c'est neuf, et c'est difficile.
2. **Meter991 → INVERSER LE SUJET.** Faire du 0,05 $ le sujet et non l'angle mort :
   *« Hedera a livré une primitive où le réseau lui-même encaisse. Dix-huit mois après, personne ne
   s'en sert — 0 sur 12 000 soumissions HCS récentes, 1 topic sur 2 984 créations testnet, 0 sur 64
   mainnet. Voici pourquoi, mesuré, et voici le seuil exact au-dessus duquel elle redevient le rail
   le moins cher. »*
