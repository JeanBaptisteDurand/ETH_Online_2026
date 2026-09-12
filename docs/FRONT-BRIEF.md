# TARE — le brief front

> Ce fichier est écrit pour **le Claude de l'ami de JB**, qui reprend le front. Il dit ce que le
> produit est, quelle donnée sert quel outil, et dans quel ordre les présenter à un jury.
>
> Il ne demande pas de refaire l'existant. Le plomberie est faite : les données sont typées, les
> calculs sont purs et testés, les surfaces existent. Ce qui manque est le **design**.

---

## 0. Où va le projet — lis ça avant tout le reste

**Le produit est figé.** Ce qu'il fait, ce qu'il mesure, les quatorze outils, les vingt-cinq jeux
de données, les cinq accès et les mots employés : c'est décidé, écrit, testé. La question
« et si on ajoutait… » n'est plus ouverte. Il reste **le design**, et rien d'autre.

**Le cadre.** Soumission à ETHOnline 2026. Le dépôt est public :
`https://github.com/JeanBaptisteDurand/ETH_Online_2026`. La suite complète est verte — **1 215 tests**
(`bash scripts/test-all.sh`). Le site se déploie par GitHub Pages depuis `main`.

**Ce qui est à toi :** `apps/web/src/components/`, `apps/web/src/styles/`, `apps/landing/`.
Le design, la mise en page, le mouvement, le responsive.

**Ce qui n'est PAS à toi, et qu'il ne faut pas toucher :**

| n'y touche pas | pourquoi |
|---|---|
| `engine/`, `contracts/`, `apps/api/`, `packages/` | le moteur, les contrats et les surfaces sont mesurés et testés ; les modifier invalide les chiffres publiés |
| `apps/web/src/lib/` | calculs purs et testés — `portes.ts`, `exit.ts`, `outils.ts`, `donnees.ts` |
| `apps/web/src/data/facts.json`, `dataset.json` | **générés** par `npm run data`. Les éditer à la main introduit un chiffre qui ment |
| les états nommés et les refus | `AUCUNE_MESUREE`, `PORTE_UNIQUE`, `NON_MESURABLE`… Un refus motivé est une fonctionnalité, pas un trou à remplir |

**La règle qui résume tout :** *aucun nombre écrit à la main dans un composant.* Tout vient de
`facts.json`, de `dataset.ts` ou de `donnees.ts`. `src/lib/facts.test.ts` fait tomber la suite si
un chiffre est tapé en dur dans un écran.

**Ce qui reste dans les mains de JB** (donc ni les tiennes ni celles de ton Claude) : activer
GitHub Pages, déployer le contrat d'abonnement sur un réseau public, tourner la vidéo, ouvrir la
PR `Uniswap/hooklist`. Si un écran dit « en attente », c'est ça qu'il attend — ce n'est pas un
bug à corriger.

---

## 1. Ce que le produit est, en une phrase

Uniswap v4 laisse un « hook » s'exécuter à chaque swap, et il peut prélever. **Personne ne
publie combien.** Le registre officiel a 27 champs, 19 booléens, et son schéma interdit d'ajouter
une quantité. Sur 1 559 hooks vus en 200 000 blocs Base, **9 déclarent quoi que ce soit** — et ce
qu'ils émettent est un montant absolu sur un swap passé, pas le taux qu'on paierait.

Comparer est impossible : la clé d'un pool v4 **contient** l'adresse du hook, donc « le même pool
sans son hook » n'existe pas. Alors on ne change pas le pool — **on change le code du hook**. Sur
un fork épinglé, `anvil_setCode` remplace son bytecode par 89 octets inertes, on cote le même swap
deux fois, et **l'écart est le péage**.

**125 072 mesures · 7 817 pools · 112 hooks · 8 tailles · les deux sens.** Chaque ligne se rejoue
en une commande.

---

## 2. L'outil central, et les treize autres

L'outil central est **1 · Mesurer** : c'est le seul qui produit une donnée qui n'existait pas.
Tout le reste lit ce qu'il a produit, ou agit dessus.

Les quatorze se rangent en **trois familles**, et la couleur est déjà posée dans le code
(`src/lib/outils.ts`) :

| famille | couleur | ce qu'elle fait | outils |
|---|---|---|---|
| **collecte** | bleu `--focus` | va chercher une donnée qui n'existait pas | 1, 8, 10 |
| **analyse** | jaune `--m-6` | lit ce qui est mesuré et en tire une réponse | 2, 3, 4, 5, 6 |
| **action** | orange `--m-4` | **change quelque chose** — transaction, session, écriture on-chain | 7, 9, 11, 12, 13, 14 |

L'orange est la seule famille qui touche à l'argent de quelqu'un. Elle doit se repérer sans lire.

---

## 3. Les outils, classés par importance pour le jury

Le critère : **qu'est-ce qui, montré trente secondes, fait comprendre que ce projet existe ?**

| rang | outil | famille | pourquoi il passe en premier | où c'est déjà |
|---|---|---|---|---|
| **1** | **1 · Mesurer** | collecte | C'est **la** trouvaille. Le contrefactuel sur le code et non sur la clé, le talon de 89 octets, les deux cotations. Sans lui il n'y a pas de projet. Montrer les deux sorties appariées et l'écart. | page outil 1 |
| **2** | **7 · Substituer** | action | Transforme un verdict en **décision**. Permit2, une signature au lieu de deux transactions, et **on n'envoie jamais**. C'est ce qui sépare un dashboard d'un produit. | page outil 7, panneau 16 |
| **3** | **3 · Situer** | analyse | La question d'un humain : « je mets 100 €, il m'en reste combien ? » C'est la porte d'entrée à coût nul. | panneau 00 |
| **4** | **6 · Proposer une autre porte** | analyse | Le fait contre-intuitif : **99,71 % du temps il n'y a qu'une porte**, et le dire est une réponse. Aucun agrégateur ne le dit. | page outil 6, panneau 16 |
| **5** | **10 · Payer à l'unité** | collecte | x402 sur Hedera, 5 règlements relus **sur le mirror node**, pas sur notre parole. C'est l'exigence du track et c'est vérifiable par un tiers. | panneau 09 |
| **6** | **8 · Intercepter** | collecte | Le bon moment n'est pas « quand on cherche », c'est **trois secondes avant de signer**. 12 Ko de script, table hors ligne. | pas encore à l'écran |
| **7** | **14 · Attester** | action | Un **autre contrat** lit nos mesures. La seule surface qu'une machine consomme sans nous demander. 16 écrites sur 99 calculées — et on le dit. | panneau 11 |
| **8** | **13 · Prouver** | action | Identité HCS-14 recalculable par n'importe qui depuis six champs. Un appelant sait **qui** il appelle. | panneaux 10, 13 |
| **9** | **4 · Comprendre** | analyse | Les grappes de bytecode identique et les contradictions registre/mesure. Impressionnant mais demande une API. | panneau 08 |
| **10** | **9 · Approuver** | action | Le rapport rendu **champ par champ** sur un Ledger : on ne signe pas un hash opaque. | panneau 14 |
| **11** | **5 · Décider** | analyse | Le classement des portes d'une paire. Utile, mais recoupe 6. | panneau 03 |
| **12** | **2 · Consulter** | analyse | Le corpus brut. Indispensable, peu spectaculaire. | panneaux 02, 05–07 |
| **13** | **12 · Authentifier** | action | Connexion par signature, sans mot de passe. Attendu, pas différenciant. | panneau 15 |
| **14** | **11 · S'abonner** | action | Le contrat existe et passe 20 tests **mais n'est pas déployé**. À montrer en dernier, et à annoncer comme tel. | panneau 15 |

---

## 4. Les données, classées par importance pour le jury

Le critère : **qu'est-ce qu'un juge ne peut trouver nulle part ailleurs ?**

> **Les treize lignes ci-dessous sont les plus fortes, pas les seules.** Le dépôt porte
> **27 jeux de données**, tous recensés dans `apps/web/src/lib/donnees.ts` avec ce qu'ils
> contiennent, la commande qui les a produits, et **les outils qui les lisent ou les écrivent**.
> Le tableau complet s'affiche sur le site, panneau **18 · quelle donnée sert quel outil**.
> Leur volume n'est écrit nulle part à la main : il est *statté au build* et vit dans
> `facts.inventaire`. Et `src/lib/outils.test.ts` **refuse** qu'un fichier suivi par git sous
> `docs/dataset/` ou `packages/guard/data/` manque à cette liste — l'oubli fait tomber un test
> au lieu de dormir dans un coin.

| rang | donnée | volume | pourquoi elle compte | fichier |
|---|---|---|---|---|
| **1** | **Le corpus de mesures** | 125 072 lignes | La chose que personne d'autre n'a. Chaque ligne porte son bloc, sa taille, son sens, son étiquette et sa commande de rejeu. | `docs/dataset/measurements.jsonl` → `src/data/dataset.json` |
| **2** | **Les 6 pools à sens unique** | 6 pools | **Entrée 0,00 bps, sortie 9 999.** Aucun n'a de code source public : **aucune lecture de code ne pouvait les trouver.** C'est la preuve que la mesure trouve ce que l'audit ne trouve pas. | `docs/dataset/one-way.json` |
| **3** | **Le balayage des déclarations** | 1 559 hooks, 200 000 blocs | 9 déclarent — 0,58 %. Couverture 1, les deux `topic0` calculés depuis leur signature. | `docs/dataset/declarations.json` |
| **4** | **La couverture du registre** | 78 absents / 112 | Le registre officiel **ne voit pas 70 %** des hooks qu'on a mesurés. | `docs/dataset/registre-couverture.json` |
| **5** | **La concordance source ↔ mesure** | 4 801 concordants, 94 divergents | Là où le code publié annonce un taux, la mesure le confirme — **écart max 0,0005 bps**. Et 94 cas où ça diverge, jusqu'à **9 979 bps**. C'est ce qui rend le reste crédible. | `docs/hooks-source/analysis.json` |
| **6** | **La porte A4 — cotation vs exécution** | 3 exécutés, 1 divergent | Le seul endroit où une **cotation** devient un **swap exécuté**. On publie le pool où ça ne concorde pas. | `docs/dataset/porte-a4.json` |
| **7** | **Les règlements x402** | 5 réglés | Relus sur le **mirror node Hedera**, pas sur notre parole. Exigence du track. | `docs/x402-settlements.jsonl` |
| **8** | **Les chiffres de la porte de remplacement** | 15 propositions / 125 072 | 99,71 % « une seule porte ». Le fait contre-intuitif qui empêche de survendre. | `packages/guard/data/chiffres-alternative.json` |
| **9** | **Les attestations on-chain** | 16 écrites / 99 calculées | Lisibles par un autre contrat. L'écart est publié. | `docs/dataset/attestations.json` |
| **10** | **L'identité d'agent HCS-14** | 1 | Recalculable depuis six champs. | `docs/dataset/agent-identity.json` |
| **11** | **Le recensement de pools** | 7 817 pools | Le dénominateur : sans lui, « 112 hooks » ne veut rien dire. | `docs/dataset/pools-liquides-full.json` |
| **12** | **La chaîne complète** | 6/6 en 13,7 s | Une vraie transaction → décodée → autre porte ? → mesure payée → ancrée → signée. | `docs/dataset/chaine-complete.json` |
| **13** | **Le graphe** | 198 Mo, reconstruit | Grappes de bytecode, orphelins, contradictions. **Absent d'un clone** : il se reconstruit. | `engine/tare/graph/data/graph.json` |

---

## 4 bis. L'anatomie d'une page outil : entrée → exécution → sortie

Chaque page outil porte **trois temps**, dans cet ordre, et les mots changent selon la famille
parce que les trois familles ne font pas la même chose :

| famille | 1er temps | 2e temps | 3e temps |
|---|---|---|---|
| **collecte** (bleu) | *ce qu'il va chercher* | *il s'exécute* | *ce qu'il ramène* |
| **analyse** (jaune) | *donnée d'entrée* | *il s'exécute* | *donnée de sortie* |
| **action** (orange) | *ce qu'il lit avant d'agir* | *l'action* | *ce qui change* |

Ce que chaque temps contient, et d'où ça vient — tu n'as rien à écrire, seulement à mettre en
forme :

1. **L'entrée.** D'abord ce qui n'est **pas** un fichier (`outil.entree` : une adresse collée, un
   calldata intercepté, un état lu sur la chaîne). Ensuite les **fichiers**, tirés de
   `donnees.ts` : nom, volume, ce qu'ils contiennent, la commande qui les a produits. Pour les
   six outils qui lisent le corpus, un **échantillon réel** de cinq lignes, avec le compte total
   affiché pour que la troncature se voie.
2. **L'exécution.** `outil.execute` : trois à cinq étapes numérotées, dans l'ordre où elles
   arrivent, plus `outil.cout`. Pour la famille `action`, la dernière étape nomme **ce qui
   change** — un test le vérifie.
3. **La sortie.** `outil.sortie` : les champs rendus, **par leur vrai nom** (`out_with`, `bps`,
   `label`, `to / data / value`, `abonneJusquA`…) avec ce que chacun vaut. Puis les jeux que
   l'outil **écrit**, s'il en écrit. Puis, pour huit outils, la **sortie réelle** : les cotations
   appariées du fork, les règlements relus, les écrans du Ledger, les neuf états de Permit2.

Avant ce travail, six pages sur quatorze n'affichaient aucune sortie nommée. C'est réparé, et
`outils.test.ts` exige désormais ≥ 1 entrée, ≥ 3 étapes et ≥ 2 champs de sortie par outil.

---

## 5. Ce qui existe déjà côté code, et que tu n'as pas à refaire

| pièce | ce qu'elle fait | où |
|---|---|---|
| `src/lib/outils.ts` | **la carte** : 14 outils × famille, question, données, routes, panneaux, accès, coût, état | typé, sans dépendance |
| `src/lib/donnees.ts` | **le recensement** : 27 jeux de données × ce qu'ils contiennent × qui les lit ou les écrit | typé, testé |
| `src/lib/outils.test.ts` | le garde-fou : aucun fichier de données orphelin, aucun chemin de code inventé | `node --test src/lib/*.test.ts` |
| `src/lib/portes.ts` | « par où acheter ce jeton » — pur, hors ligne, groupé par monnaie dépensée | testé |
| `src/lib/dataset.ts` | les 125 072 mesures, encodées par colonnes (7,9 Mo) | déjà dans le paquet |
| `src/data/facts.json` | 11 groupes de faits, assemblés depuis le dépôt | régénéré par `npm run data` |
| `src/compte/api.ts` | les 9 routes du compte, EIP-6963, signature, abonnement lu on-chain | typé |
| `src/compte/substitution.ts` | `POST /alternative`, les 6 + 10 états nommés | typé |
| `src/components/Prim.tsx` | `Panel`, `Copy`, `Replay`, `NonLu`, `Chip` | la charte |

**Trois routes** dans l'app (routeur par fragment, sans dépendance) :

```
#/              l'opération : coller un jeton → par où l'acheter
                puis 17 · les cinq accès, et 18 · quelle donnée sert quel outil
#/outil/<n>     une page par outil : ce qu'il ingère → il s'exécute → ce qu'il rend
#/instrument    les 17 panneaux d'analyse
```

---

## 6. Les règles d'honnêteté — elles ne sont pas négociables

Elles sont l'argument du projet. Un écran qui les casse casse le projet.

1. **Quatre étiquettes, jamais promues** : `MESURE`, `INTERPOLE`, `NON_MESURABLE`, `NON_COTABLE`.
   Une lecture qui échoue est `NON_MESURABLE` — **jamais un zéro**, jamais un blanc.
2. **Un blanc se lit « rien », et « rien » se lit « zéro ».** Utilise `<NonLu>`.
3. **Chaque nombre porte son bloc, sa taille, son sens et sa commande de rejeu.**
4. **Une liste tronquée le dit**, avec le compte de ce qui manque.
5. **On ne dit jamais « abonné » parce qu'une transaction est partie** : seule la relecture
   on-chain tranche.
6. **La substitution est construite, jamais envoyée.** Le bouton n'est actif que sur `PRÊT`.

---

## 7. Ce qui reste à faire, et qui est à toi

- **Le design.** Les pages outil ont un accent par famille et une sortie par outil, mais elles se
  ressemblent. Chaque famille mérite sa forme : la collecte montre une **exécution** (deux
  cotations appariées, un journal qui défile), l'analyse montre une **distribution**, l'action
  montre un **état** et un bouton.
- **La page outil 1 (Mesurer)** est la plus importante : montre les deux sorties du fork
  côte à côte et l'écart entre elles. C'est l'idée du projet en une image.
- **L'animation.** Une par famille, pas une par page — quatorze animations différentes fatiguent.
- **Le responsive.** Les tableaux ont déjà `overflow-x: auto` sur leur conteneur ; vérifie à 400 px.
- **L'anglais.** L'instrument est en français. C'est une décision de JB, pas un oubli.
