# La vidéo — 4 minutes, scène par scène

> **Comment ce script est construit.** Quatre minutes, c'est **environ 600 mots dits** à un
> rythme normal. Tout ce qui est écrit ci-dessous sous « ce que tu dis » a été compté : **584
> mots**. Si tu ajoutes une phrase, enlèves-en une.
>
> **Le parcours est celui du deck**, dans l'ordre : `#/deck` en mode présentateur
> (`?presenter=1`), avec deux sorties vers l'instrument pour montrer que ça tourne vraiment.
> Le deck porte un chrono de 4:00 : il est là exactement pour cet enregistrement.
>
> **La règle qui tient tout le script** : on ne dit aucun chiffre qui ne soit pas à l'écran au
> moment où on le dit. C'est l'argument du projet, et c'est aussi ce qui rend la vidéo
> impossible à contredire.

---

## Avant d'enregistrer

| | |
|---|---|
| URL | `…/hooks/#/deck?presenter=1` — le chrono, le compteur et les raccourcis n'apparaissent qu'avec ce paramètre |
| Navigation | **espace** ou **→** pour avancer, **←** pour revenir, **f** plein écran, **r** remet le chrono à zéro |
| Fenêtre | 1440 × 900, thème sombre, zoom 100 % |
| À préparer | un onglet sur `#/` avec l'adresse d'un jeton **déjà collée** mais pas validée — on gagne huit secondes |
| À couper | notifications, curseur qui tremble, et le son de frappe du clavier |
| Prise de son | une seule prise si possible. Le montage se voit, et ce projet se vend sur la confiance |

---

## 00:00 → 00:28 · L'accroche — quelqu'un, un problème, nous

**À l'écran** — le deck, temps **01**, mais tu parles AVANT de montrer les chiffres. On ouvre
sur l'instrument `#/` avec une adresse déjà collée, curseur dans le champ, rien de validé.

**Ce que tu dis :**

> Michel dirige une petite boîte. Il a de la trésorerie en jetons, et aujourd'hui il veut en
> échanger une partie contre de l'ETH. Il ouvre son interface, il voit un prix, il signe.
> Ce que Michel ne voit pas, c'est le **hook** : un petit programme attaché au pool, qui
> s'exécute pendant son swap, et qui peut prélever. Sur certains pools, ça se compte en
> dixièmes de pour cent. Sur d'autres — et on va vous les montrer — **ça prend presque tout**.
> Michel n'a aucun moyen de le savoir avant de signer. Personne ne l'a.
>
> **TARE mesure ce que les hooks prennent vraiment, et le publie.** Cent vingt-cinq mille
> mesures, sept mille huit cents pools, cent douze hooks — obtenues par un rejeu de machine
> virtuelle qu'on a écrit pour ça. Et un agent de quatorze outils qui s'en sert pour répondre
> à la seule question qui compte : **par quelle porte passer, et ce qu'elle coûte.**

**Geste** : à « et le publie », espace → le deck, temps 01.

**Note de ton** : Michel est là pour une raison, pas pour faire rire. Il rend concret un
problème qui est sinon une abstraction de protocole. Dis son nom une fois, puis oublie-le —
la suite parle de mesure, pas de personnage.

---

## 00:28 → 00:48 · Le problème, en un chiffre

**À l'écran** — deck, temps **01**. Les trois chiffres en grand : `9 / 1 559`, `0`, `78 / 112`.

**Ce que tu dis :**

> Parce qu'Uniswap demande à ces hooks de déclarer ce qu'ils facturent. Sur mille cinq cent
> cinquante-neuf hooks vus en deux cent mille blocs, **neuf** le font. Neuf.

**Geste** : rien. On laisse les trois nombres respirer deux secondes.

---

## 00:48 → 01:10 · Le registre ne peut pas répondre

**À l'écran** — même temps **01**, on descend sur le paragraphe. Le `"additionalProperties": false`
est visible.

**Ce que tu dis :**

> Il existe un registre officiel des hooks. Vingt-sept champs par entrée, dix-neuf booléens.
> **Pas un seul n'est une quantité.** Et son schéma est fermé : il n'interdit pas seulement de
> publier un taux, il **interdit d'ajouter le champ** qui le porterait. Pire : sur les cent
> douze hooks qu'on a mesurés, **soixante-dix-huit sont absents de ce registre**. Il ne voit
> pas les deux tiers de ce qui tourne.

**Geste** : espace → temps 02.

---

## 01:10 → 01:45 · La méthode — le cœur technique

**À l'écran** — deck, temps **02**. `125 072` · `7 817` · `112` · `89`.

**Ce que tu dis :**

> Alors on l'a mesuré. Et c'est là que ça devient intéressant, parce que la mesure évidente est
> **impossible**. L'identité d'un pool v4 — sa `PoolKey` — **contient l'adresse du hook**. « Le
> même pool sans son hook » n'existe pas, on ne peut pas le comparer à lui-même.
> Donc on ne change pas le pool. **On change le code du hook.** Sur un fork épinglé à un bloc,
> on remplace son bytecode par un talon inerte de **quatre-vingt-neuf octets**. Le `poolId`, la
> liquidité, le `slot0`, les réserves : identiques au bit près. La seule chose qui a changé dans
> l'univers observable, c'est le code qui s'exécute pendant le swap. On cote le même swap deux
> fois — **et l'écart, c'est ce que le hook a pris.**

**Geste** : à « l'écart, c'est ce que le hook a pris », espace → temps 03.

---

## 01:45 → 02:05 · La preuve

**À l'écran** — deck, temps **03**. `96,74` exécutés contre `96,74` annoncés.

**Ce que tu dis :**

> L'objection arrive tout de suite : une cotation sur un fork, ça vaut quoi ? On a donc
> **exécuté le swap pour de vrai**, et recollé le résultat à ce que la cotation annonçait.
> **Au wei près.** Et on publie aussi le pool où ça **ne** concorde pas — un sur trois. Chaque
> ligne se rejoue chez vous en une commande.

**Geste** : basculer sur l'onglet `#/` de l'instrument.

---

## 02:05 → 02:28 · L'instrument — la réponse de Michel

**À l'écran** — `#/`, l'adresse déjà collée. On valide **pendant** la phrase.

**Ce que tu dis :**

> Revenons à Michel. Je colle l'adresse de son jeton…
> et j'ai les portes par lesquelles je peux l'acheter, classées : les frais du pool, **plus** le
> prélèvement du hook mesuré, et ce qu'il me reste sur cent. Tout est calculé **dans la page** :
> cent vingt-cinq mille mesures embarquées, **zéro requête réseau**. Et quand une porte n'est pas
> mesurée, l'écran ne dit pas zéro — il dit **inconnue**.

**Geste** : retour au deck, temps 05 (l'extension) — on saute volontairement le MCP pour le
garder après.

---

## 02:28 → 02:52 · L'extension — le bon moment

**À l'écran** — deck, temps **05**. Cliquer « il y a mieux », laisser jouer, puis cliquer
« il n'y a qu'une porte ».

**Ce que tu dis :**

> Mais le bon moment pour savoir ce qu'un hook prend, ce n'est pas quand on cherche. C'est
> **trois secondes avant de signer**. L'extension se place entre le site d'échange et le
> portefeuille, lit le calldata, et rend son verdict avant la signature. S'il existe une porte
> moins chère, elle construit la transaction de remplacement et la fait signer par **Permit2** —
> une signature hors chaîne au lieu d'une transaction d'approbation. Et **elle ne l'envoie
> jamais** : elle la rend au portefeuille. S'il n'y a rien de mieux — et c'est le cas
> **quatre-vingt-dix-neuf fois sur cent** — elle le dit. Inventer une alternative serait pire
> que se taire.

**Geste** : espace ← pour revenir au temps 04.

---

## 02:52 → 03:12 · Le MCP — pour les agents

**À l'écran** — deck, temps **04**. Cliquer la seconde question prête.

**Ce que tu dis :**

> Et pour les agents. Si vous demandez à un modèle ce qu'un hook prend, il **invente un nombre
> plausible**. Nos quatre outils MCP portent, dans leur propre description, l'interdiction d'en
> énoncer un. Là, le modèle n'invente pas : il appelle l'outil, et l'outil répond avec son
> bloc, sa taille, son étiquette — et la commande qui le rejoue.

**Geste** : espace → temps 06 pendant que la frappe finit.

---

## 03:12 → 03:30 · L'appareil, le péage, la preuve

**À l'écran** — deck, temps **06**, les écrans Speculos qui s'allument un par un.

**Ce que tu dis :**

> Le verdict est rendu **champ par champ** sur un Ledger : on ne signe pas un haché opaque, on
> lit ce qu'on signe, et annuler ne laisse rien partir. Une mesure neuve se paie **un millième
> de dollar en x402 sur Hedera**, relu sur le mirror node — pas sur notre parole. L'agent qui
> répond a une identité **HCS-14** que l'appelant recalcule avant de payer. Et seize
> attestations sont écrites on-chain, lisibles par un autre contrat.

**Geste** : espace → temps 07.

---

## 03:30 → 03:48 · Ce qu'on ne sait pas

**À l'écran** — deck, temps **07**. `63 156` · `61 466` · `450` · `0`.

**Ce que tu dis :**

> Et puis il y a ça, qu'on affiche aussi grand que le reste. Sur cent vingt-cinq mille mesures,
> **soixante et un mille neuf cent seize ne sont pas des valeurs**. On les garde, avec leur
> raison. Parce qu'un blanc se lit « rien », et « rien » se lit « zéro ». Seize attestations
> écrites sur **quatre-vingt-dix-neuf calculées** — et c'est l'écart qu'on publie, pas le
> chiffre flatteur. Deux erreurs passées du projet sont publiées avec leur correction.

**Geste** : espace → temps 08.

---

## 03:48 → 04:00 · La sortie

**À l'écran** — deck, temps **08**. Les quatorze outils, les cinq accès.

**Ce que tu dis :**

> Quatorze outils, vingt-sept jeux de données, cinq façons d'y accéder : le site, l'extension,
> le serveur MCP, le péage x402, le compte. Tout est publié — le corpus, les commandes de rejeu,
> et ce qu'on ne sait pas. **Allez le contredire.**

**Geste** : laisser le dernier écran une seconde pleine avant de couper.

---

## Le plan B, si une chose casse

| ce qui casse | ce que tu fais |
|---|---|
| l'instrument ne charge pas | reste sur le deck : le temps 02 porte les mêmes chiffres |
| la démo MCP ne part pas | clique « ↻ reprendre », ou passe — le temps 05 est plus fort |
| le chrono dérape | **r** le remet à zéro sans quitter le temps où tu es |
| tu es en retard à 3:00 | coupe le paragraphe du péage (03:06) : garde Speculos, dis « et le péage x402 est réglé sur Hedera » en une ligne |
| tu es en avance | ajoute, au temps 02 : « huit tailles, les deux sens, un bloc épinglé — parce qu'un taux unique serait faux à toutes les tailles sauf une » |

---

## Les chiffres du script, et où chacun s'affiche

Aucun n'est dit sans être à l'écran. Vérifie-les avant la prise — ils sont tous générés, donc
ils peuvent bouger si le corpus change.

| dit | à l'écran | source |
|---|---|---|
| 9 sur 1 559 | deck 01 | `docs/dataset/declarations.json` |
| 27 champs, 19 booléens, 0 quantité | deck 01 | `apps/web/public/data/hooklist.snapshot.json` |
| 78 sur 112 absents | deck 01 | `docs/dataset/registre-couverture.json` |
| 125 072 · 7 817 · 112 · 89 octets | deck 02 | `dataset.totals`, `engine/tare/stub.py` |
| 96,74 bps exécutés = annoncés | deck 03 | `docs/dataset/porte-a4.json` |
| 99,71 % — une seule porte | deck 05 | `packages/guard/data/chiffres-alternative.json` |
| 63 156 / 61 466 / 450 / 0 | deck 07 | `docs/dataset/summary.json` |
| 16 attestations sur 99 | deck 06 et 07 | `docs/dataset/attestations.json` |
| 14 outils · 27 jeux · 5 accès | deck 08 | `apps/web/src/lib/outils.ts`, `donnees.ts` |

---

## Ce qu'on ne dit pas, et pourquoi

- **« la première mesure globale des hooks sur EVM »** — c'est peut-être vrai, et c'est
  exactement le genre de phrase qu'un juge ne peut pas vérifier : personne ne peut prouver
  qu'aucune équipe n'a jamais fait ça. Or tout le projet repose sur le fait que **chaque
  affirmation se vérifie**. Une revendication invérifiable au milieu de vingt chiffres
  vérifiables les affaiblit tous.
  **Dis plutôt ce qui se contrôle en trente secondes**, et qui est plus fort :
  *« cent vingt-cinq mille mesures publiées, sur sept mille huit cents pools, chacune rejouable
  en une commande — allez en trouver une autre. »* Le défi fait le même travail que le
  superlatif, et il ne peut pas se retourner contre nous.
- **« le premier », « le seul », « révolutionnaire »** — même raison.
- **« temps réel »** — c'est faux : la mesure est une photographie, à un bloc, sur une chaîne.
  Le dire serait exactement l'erreur qu'on reproche aux autres.
- **« abonnement »** — le contrat existe et passe vingt tests, mais il n'est pas déployé sur un
  réseau public. Si on le montre, on dit « écrit, pas déployé ».
- **le nombre de tests** — 1 220 verts, c'est vrai, mais ça n'intéresse personne en vidéo. Ça
  vit dans le README, où un juge qui veut vérifier ira le lire.
