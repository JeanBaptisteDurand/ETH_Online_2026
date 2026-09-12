# Critique — phase 3, le site construit, branche `design/tare`

> Écrite le 2026-09-12. Elle remplace en entier la version précédente (blocage du contrôle des
> skills, puis notation DA de la hero seule).
>
> **Contrôle préalable, obligatoire :** `node …/design-generator/scripts/skills-check.mjs build`
> → **exit 0, 22 preuves d'usage** (tasteskill, frontend-design, deux `DESIGN.md` de marques,
> famille `mono`, web-design-guidelines, playwright-cli). Le blocage de la passe précédente est
> levé : `project/design/qa.md` existe et porte ses trois sections. La notation a donc lieu.
> Vérifié aussi : aucune famille n'a substitué sa palette ni ses polices à celles du design —
> les hex relevés à l'écran sont ceux de la rubrique 2 (`#3376f6`, `#f6d746`, `#eb6628`,
> `#e8eaed`, `#08090a`), et le vert acide `#37F712` de `mono` n'apparaît nulle part.
>
> Lu : `decisions.json` (dix verrous actifs), `brief.json` (`modules.design`, `demo`,
> `content.pages`, `content.data` et leurs importances, `content.actions`, `brand.avoid`),
> `DESIGN.md` en entier, `audit-hero.md`, `qa.md`.
> Regardé : `shots/build/` (home + `#/outil/1`, `#/outil/7`, `#/instrument` en 390 / 768 / 1440,
> pleine page et défilé, `console.txt`), `shots/qa/` pour les plis et `refus-graphe.png`,
> `shots/avant/home-1440.png` pour le progrès.
> Tenu pour mesuré, sans le refaire : axe 0 violation sur 4 routes × 2 largeurs, Lighthouse
> accessibilité 100 × 4, 0 cible sous 24 px, 0 débordement sur 16 routes à 390, focus sur
> 100 tabulations, `prefers-reduced-motion` identique au hachage, parcours en 5 clics + 1 collage.
> Non jugé : la charte de l'équipier (JetBrains Mono, Instrument Sans, rampe `--m-0…--m-6`,
> rayon 0). Les 10 erreurs de `console.txt` sont toutes `ERR_CONNECTION_REFUSED` vers
> `127.0.0.1:8787` — le cas que couvre le refus motivé, jugé à l'écran en §10, pas compté en panne.

## Notes

| critère | note | en une ligne |
|---|---|---|
| **fidelity** | **3** | Neuf verrous tenus avec leur preuve à l'écran. d009 ne l'est qu'aux deux tiers : **la matrice 27 × 14 n'existe nulle part**, alors que `DESIGN.md` l'affirme trois fois. Et `#/outil/7` se contredit sur le compte des états. |
| ambition | **4** | L'écart avec `shots/avant/` est considérable et l'ambition « marquée » de d004 est atteinte en typographie et en composition. Les deux objets les plus ambitieux du document — le fil continu et la matrice — sont l'un à moitié posé, l'autre absent. |
| hierarchy | **4** | 5/5 des données d'importance 1 dans le pli à 1440, 4/5 à 390 par arbitrage écrit et argumenté, index de panneaux enfin présent. L'importance 3 de l'écran 2 n'est pas repliée. |
| typography | **3** | L'échelle est réelle (115 px contre 13 px) et la dérive mono/sans de la DA est corrigée. Mais `.t-label` impose capitales + 0,1em de chasse à tout ce qui n'est pas une donnée — **y compris aux commandes shell, rendues en capitales, donc injouables**. |
| **colour** | **5** | L'encodage est discipliné et il tient : la rampe pour la grandeur, trois jetons propres pour les familles en sombre comme en clair, jamais la couleur pour un état. La régression relevée en DA est corrigée au pixel. |
| motion | **4** | Un seul moment orchestré, trois gestes de famille, aucun compteur animé, aucun préchargeur, mouvement réduit parfait. L'animation « analyse » est livrée sous la forme la plus générique qui soit. |
| density | **4** | Densité 8 réellement appliquée : plus une seule boîte de type carte, groupement par filet. Deux accidents : un vide de 600 × 250 px dans la carte, et une section qui pèse 58 % de la page d'accueil. |
| originality | **4** | 5 mérités par l'invention propre au sujet (carte-manifold, horloge réelle, figure appariée, index-sommaire), **moins un tell** de `frontend-design` : l'étiquette en capitales chassées, systématique. |
| responsive | **3** | La carte se recompose intelligemment à 768 et à 390, 12 nœuds entiers dans le pli, 0 débordement sur 16 routes. Mais la table maîtresse de `#/instrument` est **tronquée en silence**, à 390 **et à 1440**. |
| **accessibility** | **5** | axe 0 / Lighthouse 100 × 4 / 0 cible sous 24 px / focus sur 100 arrêts / mouvement réduit / 7 régions défilantes au clavier, et le contraste du `<canvas>` vérifié au pixel là où axe est aveugle. C'est au-dessus de l'état de l'art. |

---

## 1. `fidelity` — 3. Les dix verrous, un par un

| # | verrou | tenu | preuve à l'écran |
|---|---|---|---|
| **d001** | la carte en hero, l'orchestrateur et tous ses outils, première chose vue | **oui** | `build/home-1440.png` : bloc `La chaîne` (x 260-500, y 345-505) et les 14 blocs d'outils (x 540-1424, y 207-570), entièrement dans les 900 px. `build/home-390.png` : mêmes 14 nœuds, 12 entiers dans 844 px. Rien n'est amputé à aucune largeur. |
| **d002** | un nœud se clique et mène au détail de l'outil, un onglet par outil | **oui** | `build/#-outil-1-1440.png` et `#-outil-7-1440.png` : bandeau collant de 14 onglets, l'onglet courant souligné de 2 px dans la couleur de sa famille (bleu sur l'outil 1, orange sur l'outil 7). Parcours rejoué par la QA : clic nœud → `#/outil/1`, clic onglet → `#/outil/7`. |
| **d003** | une seule section fond l'usage et la preuve | **oui** | `build/home-scrolled.png` : la section « Colle une adresse de jeton, vois ce qu'elle coûte » porte le champ, l'aide (« rien n'est envoyé : la recherche se fait sur le corpus embarqué »), les cinq jetons du corpus — et `Accueil.tsx:294` rend la `FigureAppariee` **dans cette même section**, sous le champ. Voir la réserve ci-dessous. |
| **d004** | ambition marquée, au niveau des sites primés | **oui** | `display` mesuré à ~115 px de corps contre 13 px pour `data` sur `home-1440.png` ; comparaison directe avec `shots/avant/home-1440.png`, où le plus gros corps de la page faisait 13 px. |
| **d005** | pas de canevas pointillé | **oui** | aucune trame : le fond est `#08090a` uniforme hors blocs et filets, relevé sur `home-1440.png`. Le seul tireté du site est l'arête « jeu de données → outil », qui est la seconde grammaire de la rubrique 2. |
| **d006** | ni dégradé, ni ombre portée, ni coin arrondi | **oui** | `index.css` pose le rayon 0 sur `*` ; aucun `box-shadow` ni `filter` à l'écran ; les quatre coins d'un nœud passent du fond à la couleur de famille en un pixel. Les panneaux de refus, les chips, les boutons et les champs sont tous à angle vif. |
| **d007** | le produit est en français | **oui, mais mal typographié** | toute l'interface est en français. Réserve de forme, pas de langue : les textes de refus et plusieurs titres de panneaux sont **sans accents** — `refus-graphe.png` : « sans reponse », « aucun clone n'est affiche », « precedentes », « aller a la pire ligne ». Sur la surface dont le métier est de dire proprement ce qui manque, ça se voit. Compté en `typography`, pas ici. |
| **d008** | la source de vérité est ce qui est **déclaré**, pas l'état des écrans | **non, en un point** | `build/#-outil-7-1440.png` : la phrase d'en-tête de la section « Ce qui change » dit **« 10 états d'envoi »** (y 488), et onze lignes plus bas le champ `etat` dit **« PRET, ou l'un des huit états qui disent ce qui manque »** (y 589), c'est-à-dire neuf. Deux comptes contradictoires **sur le même écran**. La source déclarée que d008 désigne (`lib/outils.ts:307`) dit neuf, `brief.json → demo.path` dit « les neuf états de Permit2 », `DESIGN.md` r5 dit « les huit autres ». Seul `lib/substituer.test.ts:5` dit dix — et c'est ce chiffre-là, tiré de l'implémentation, qui a été mis à l'écran. |
| **d009** | direction A + l'horloge de B : schéma d'appareil, horloge réelle, **et la matrice 27 × 14 descendue dans la section qui dit quelle donnée sert quel outil** | **deux clauses sur trois** | Schéma d'appareil : oui (`home-1440.png`). Horloge réelle : oui, et elle encode — relevé des six graduations sur `home-1440.png` (x 275-330, base y 495) : hauteurs 5, 4, 4, 55, 4, 35 px, silhouette non croissante, quatrième étape dominante. **Matrice : absente.** `home-1440-full.png`, y 2 390 → 5 720 : la section « Quelle donnée sert quel outil » est une table de 27 lignes à cinq colonnes (`JEU DE DONNÉES / VOLUME / LU PAR / ÉCRIT PAR / FICHIER`), la relation étant portée par des chips de noms d'outils empilées. Aucune grille 27 × 14 nulle part : `grep -rn "repeat(14"` dans `apps/web/src` ne rend rien. |
| **d010** | la hero est validée : schéma, horloge, figure appariée, échelle typographique, acquis pour tout le site | **oui** | les quatre acquis sont repris tels quels et étendus : la figure appariée est le cœur du pli de `#/outil/1` (`#-outil-1-1440-full.png`, y 467-755), l'échelle typographique est la même sur les trois routes, l'horloge est intacte. |

### Pourquoi 3 et pas 1, et pourquoi pas 4

La règle est qu'un verrou trahi vaut 1. Je ne prononce pas 1, et je dis exactement pourquoi :
**d009 n'est pas refusé, il est à moitié substitué.** La section que le verrou nomme existe, elle est
à sa place, et elle dit bien quelle donnée sert quel outil — la substance de la phrase est à
l'écran. Ce qui manque est la **forme nommée par toi**, « la matrice 27 × 14 », remplacée sans
arbitrage par la forme la plus courante du web, une table de documentation. Une substitution de
forme non enregistrée sur un verrou actif n'est pas une trahison de l'intention, c'est un verrou à
moitié tenu : d'où 3, et non 4, parce que la note sous 4 est le seul signal qui force la correction.

**Aggravant, et c'est ce qui interdit le 4 même en lisant d009 avec indulgence : le document affirme
ce que l'écran ne fait pas.** `DESIGN.md` écrit trois fois que la matrice existe — rubrique 1
(« C'est ce qui tiendra la matrice 27 × 14 »), rubrique 5 (« puis la matrice 27 × 14 »), rubrique 6
(ligne de tableau « la matrice 27 × 14 | la trame est faite par la grille elle-même, en `gap: 1px` »).
Un juge qui lit le document puis ouvre la page ne trouve pas l'objet. Le brief prévient lui-même
qu'« un seul chiffre faux coûte la crédibilité de tous les autres » ; un seul objet promis et absent
coûte la même chose.

### Réserve sur d003, et pourquoi je lève la condition posée en phase DA

La critique de la DA avait écrit : « si le build rend la figure appariée deux fois — une dans le
hero, une dans la section de collage — d003 est trahi et `fidelity` retombe à 1 ». **Je lève cette
condition, et je m'en explique**, parce qu'elle est devenue incompatible avec un verrou postérieur.

- **d010** (12:51, après cette critique) valide la hero « la figure appariée […] acquise pour tout
  le site ». Fondre la figure du hero dans la section de collage, comme la condition l'exigeait,
  reviendrait à défaire ce que d010 a figé.
- Les deux figures **ne mesurent pas la même grandeur** : celle du hero est le péage du hook (le
  même swap avec le hook et contre 89 octets inertes, `96,74 bps`), celle de la section est le coût
  du choix de porte (la porte la moins chère contre la plus chère du même jeton). Le code le dit
  (`Accueil.tsx` : `unite="bps entre la meilleure porte et la pire"`) et l'écran l'écrit en toutes
  lettres : « La figure de la carte, plus haut, mesure autre chose : un swap déjà exécuté, coté
  contre un talon inerte. »

d003 est donc tenu : on colle, et la réponse **est** la preuve, dans une seule section.
**Deux réserves néanmoins, l'une de fond, l'une de preuve.**

1. Les deux figures partagent la même forme à 1 200 px d'écart et ne sont distinguées que par une
   phrase de prose. Un lecteur pressé croira que la seconde recalcule la première. **Correction :**
   nommer chaque figure par sa grandeur en tête (`FIG. 1 — le péage du hook`, `FIG. 2 — le coût de
   la porte`), comme la maquette ASCII de la rubrique 5 le prévoyait déjà (`FIG. 1 | LA CHAÎNE…`),
   et différencier les deux formes : barres appariées pour l'une, deux rangs de portes pour l'autre.
2. **Aucune capture de l'état de succès n'existe**, ni dans `shots/build/` ni dans `shots/qa/` :
   le seul état livré est l'état vide. Je note d003 tenu sur la preuve de code (`Accueil.tsx:294`)
   et sur le relevé de parcours de la QA. **Correction :** livrer `home-1440-succes.png` et
   `home-390-succes.png` — c'est l'interaction la plus importante du site, elle doit avoir sa photo.

### Ce qu'il faut corriger, sous `fidelity`

1. **Construire la matrice 27 × 14**, en `display: grid; gap: 1px` sur fond `--line` comme la
   rubrique 6 l'annonce : 27 rangs × 14 colonnes de 40 px environ tiennent en ~700 px de haut à
   1440, contre 3 330 px pour la table actuelle. Marque pleine pour « écrit », marque creuse pour
   « lu » — la seconde grammaire sans couleur de la rubrique 2. La table de détail actuelle devient
   ce qui s'ouvre au clic d'un rang. **Ou**, si la table est le bon choix, enregistrer l'arbitrage
   dans `decisions.json` et retirer les trois mentions de la matrice de `DESIGN.md` : ce qui n'est
   pas acceptable, c'est que le document et l'écran ne disent pas la même chose.
2. **`#/outil/7`, le compte des états.** Un seul chiffre, partout : `Outil.tsx:596`-sq et le champ
   `etat` de `lib/outils.ts:307` doivent s'accorder, et `brief.json → demo.path` (« les neuf
   états ») avec eux. Le compte doit être **dérivé** de la liste rendue, jamais écrit dans une
   phrase — sans quoi il redeviendra faux au prochain état ajouté.
3. **`#/outil/7`, le bouton contredit la carte.** Le nœud 7 de la carte annonce « construit,
   n'envoie pas » (`home-1440.png`, y 350) et `brief.content.actions.substituer` dit « sans jamais
   l'envoyer » ; le bouton de l'état `PRET` dit **« signer et envoyer »** (`Outil.tsx:641`,
   `#-outil-7-1440-full.png` y 570). Deux promesses opposées à un écran d'écart, sur la seule
   famille qui touche à l'argent de quelqu'un. **Correction :** « signer — sans envoyer », et la
   phrase qui dit qui envoie.

---

## 2. `ambition` — 4

**Le progrès est massif et il faut le dire.** `shots/avant/home-1440.png` : un en-tête chargé d'une
chaîne de métadonnées en points médians, des panneaux encadrés empilés, aucun corps au-dessus de
13 px, la couleur en décor de chips. `shots/build/home-1440.png` : un schéma d'appareil,
quatorze nœuds câblés, une horloge qui encode ses temps réels, une figure appariée et un `display`
de 115 px. C'est le passage d'un tableau de bord à un instrument, et c'est bien « l'ambition
marquée » de d004.

**Ce qui empêche le 5, chiffré.**

1. **Le fil de la rubrique 0 ne se branche pas.** Le document promet : « une piste de 1 px […] ne
   s'arrête pas au bord du héros : elle continue derrière les sections suivantes et vient se
   brancher sur la figure des deux cotations ». Relevé au pixel sur `build/home-1440.png` : une
   piste descend bien la gouttière (2 px d'encre à x 17-18 sur toutes les rangées de 636 à 672) puis
   part à droite (39 px d'encre, x 17 → 55, rangée 672) — **et s'arrête là**. Les rangées 680 et 690
   sont vides sur les 1 440 px. Le premier élément de la figure, le nuancier de `reçu avec le hook
   en place`, est à x 16-39, **y 735**. Le fil s'interrompt à 63 px de sa cible et pointe vers le
   vide. **Correction, la n°1 du document :** prolonger la piste de x 17 jusqu'à y 735, puis la
   rentrer horizontalement sur le nuancier, et la terminer par le segment perpendiculaire de 6 px
   que la rubrique 4 définit. C'est une polyligne de trois points. Le geste est minuscule, il est
   tout l'écart entre « une carte bien faite » et la phrase que le document a écrite.
2. **La matrice, l'objet le plus ambitieux après la carte, n'est pas construite** (§1).
3. **La moitié basse de `#/` retombe au niveau d'une documentation.** De y 2 390 à y 5 720, soit
   **58 % de la page d'accueil**, l'écran est une table à cinq colonnes dont les cellules portent
   six lignes de prose. Rien n'y est dessiné. Un juge qui descend perd l'instrument en route.

---

## 3. `hierarchy` — 4

**À 1440, cinq données d'importance 1 sur cinq dans le pli**, relevé sur `build/home-1440.png`
(900 px) : légende des familles y 155-185 ; quatorze nœuds y 207-570 ; horloge y 390-505 ; rail des
27 jeux y 220-630, compté et tronqué avec son reste (9 lignes + « et 18 autres, plus bas » = 27) ;
la paire et l'écart y 700-830. Contrat de la rubrique 5 rempli.

**À 390, quatre sur cinq**, la paire passant en importance 2 — l'arbitrage que tu me demandes de
juger, §8.

**Écran 2.** `#-outil-1-1440-full.png` : nom, ordinal, famille, état, coût et question dans les
430 premiers pixels, puis **la sortie réelle** — les deux cotations, leurs séries, les wei bruts,
l'écart en `display` et la commande de rejeu avec son bouton — de y 431 à 840. C'est la page la plus
importante du site selon le brief, et sa priorité est respectée à la lettre. Même construction pour
l'outil 7 : `PRET` et son bouton à y 562, les neuf (dix) états dessous, chacun avec sa raison.

**Écran 3.** L'index de panneaux collant demandé par la rubrique 5 existe (`#-instrument-1440.png`,
x 16-248) : ordinal en mono gris, titre en sans, compte aligné à droite sur un filet, 17 entrées,
`aria-current` suivi par `IntersectionObserver`. C'était la priorité 4 du brief, elle est tenue.

**Ce qui empêche le 5.**

1. **L'importance 3 de l'écran 2 n'est pas derrière une interaction.** La rubrique 5 écrit :
   « Importance 3, derrière une interaction : l'échantillon de cinq lignes du corpus **se déplie** ».
   `#-outil-1-1440.png`, y 440-620 : les cinq lignes sont déployées d'emblée, et elles occupent le
   pli sur `#/outil/1` dès qu'on défile d'un cran. **Correction :** `<details>` fermé par défaut,
   résumé « cinq lignes sur 125 072 », le compte total restant visible fermé comme ouvert.
2. **Le 768 n'est garanti nulle part.** La rubrique 9 ne parle que de 1440 et de 390.
   `build/home-768.png` : la paire et l'écart tombent sous le pli, comme à 390. **Correction :** une
   phrase en rubrique 9 disant que 768 se comporte comme 390 sur ce point — sinon la garantie a un
   trou au milieu de sa plage.
3. **Le vide sous la colonne collecte**, déjà relevé en DA et non corrigé. `build/home-1440.png`,
   rectangle x 540-830 / y 390-650 : la famille collecte n'a que trois outils, sa colonne s'arrête
   haut et le regard tombe dans une zone morte de 290 × 260 px, doublée du vide à droite du bloc
   orchestrateur (x 500-540 / y 200-345). **Correction :** descendre le bloc orchestrateur au centre
   optique de la carte, pour que le départ des pistes soit à mi-hauteur et que le vide se referme.
4. **Coquille dans la rubrique 9 :** « les deux derniers amorcés, les deux derniers amorcés »
   (`DESIGN.md:259`). Sur la phrase même qui porte l'arbitrage du pli à 390.

Le parcours de démo tient en ses cinq clics et son collage, la QA l'a rejoué pas à pas ; aucune
donnée d'importance 3 au-dessus d'un pli, la provenance ayant quitté l'en-tête pour un `<details>`.

---

## 4. `typography` — 3

**Acquis :** l'échelle est réelle et mesurable (115 px contre 13 px sur la même capture), les
chiffres sont tabulaires, la distinction mono/sans est franche, et **la dérive relevée en DA est
corrigée** — la glose de l'écart et la ligne « bout en bout, sous une seule horloge » sont
maintenant en Instrument Sans, vérifié sur `build/home-1440.png` y 725-790 et y 410-440.

**Ce qui fait tomber à 3, et c'est une seule classe CSS.**

`index.css:170-175` — `.t-label { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase }`.
C'est mot pour mot l'« étiquette en capitales chassées » que `frontend-design` liste comme chrome de
gabarit, et c'est aussi ce que la rubrique 3 de `DESIGN.md` s'interdit à elle-même : « les capitales
restent aux étiquettes de données, où elles sont la valeur elle-même (`MESURE`, `NON_COTABLE`) ».
À l'écran, la classe habille tout sauf des valeurs : `IL FAUT`, `OUTILS`, `LE SITE`, `L'EXTENSION`,
`SES JUMEAUX`, `SON RAYON DE SOUFFLE`, `REJOUER CETTE VALEUR`, `COPIER LA COMMANDE`, les cinq
en-têtes de la table des données, et le pavé flottant `ASSISTANT · PILOTE LE TABLEAU`.

**Et elle produit une faute de fond, pas seulement de goût.** `Accueil.tsx:547` passe `j.produit` —
**la commande qui a produit le jeu de données** — dans `.t-label`. Résultat à l'écran
(`home-1440-full.png`, colonne `FICHIER`) : `PYTHON3 -M TARE.SWEEP (ENGINE/TARE/MEASURE.PY), SUR UN
FORK ANVIL ÉPINGLÉ`, `NODE APPS/WEB/SCRIPTS/BUILD-DATASET.MJS`, `PYTHON3 -M TARE.CLI SUMMARY`.
Un chemin et une commande sont **sensibles à la casse** : telles qu'elles sont affichées, aucune ne
s'exécute. Sur un site dont l'argument entier est « vérifie plutôt que de me croire », et juste
sous un chemin de fichier correctement rendu en minuscules, c'est la contradiction la plus coûteuse
de la page.

**Corrections, dans l'ordre :**
1. `Accueil.tsx:547` → rôle `data-sm`, casse d'origine. Même traitement partout où une commande ou
   un chemin passe par `.t-label`.
2. Retirer `text-transform` et ramener `letter-spacing` à 0,02em dans `.t-label` ; créer une classe
   distincte `.t-valeur` (capitales, chasse 0,1em) réservée aux quatre étiquettes de mesure
   `MESURE / INTERPOLE / NON_MESURABLE / NON_COTABLE` et aux constantes (`PRET`, `ABSENT`, `SRC`).
3. Accentuer les textes de refus et les titres de panneaux : `refus-graphe.png` — « sans reponse »,
   « n'est affiche », « precedentes », « aller a la pire ligne », et le sommaire qui écrit « Le même
   swap, coté deux fois » quand le panneau écrit « Le meme swap, cote deux fois ». d007 fait du
   français une décision ; une décision se typographie.
4. Déclarer en rubrique 3 la septième taille réellement livrée (le h1 de route, ~53 px) : le rôle
   existe à l'écran depuis la DA, il manque toujours au tableau.

---

## 5. `colour` — 5

Relevés au pixel sur `build/home-1440.png` : légende collecte `(51,118,246)` = `#3376f6`, analyse
`#f6d746`, action `(235,102,40)` = `#eb6628` ; barres de famille des nœuds conformes. Aucun hex
parasite, la rampe `--m-0…--m-6` n'est pas touchée, et les trois familles ont bien reçu leurs jetons
propres (`index.css:40-42` en sombre, `81-83` en clair : `#1b4fc4`, `#9a7b00`, `#c2410c`) — la
résolution du conflit de thème annoncée en rubrique 2 est construite, l'orange reste séparable de
l'or en thème clair.

**La régression relevée en phase DA est corrigée, et je l'ai vérifiée plutôt que crue :** les deux
nuanciers de la paire valent aujourd'hui `(232,234,237)` = `fg` pour la série avec le hook et
`(107,113,120)` pour la série de référence — plus aucune teinte de famille détournée en série de
mesure. Une couleur, un sens, sur toute la page.

La couleur n'encode jamais un état : « en attente », « hors ligne », « aucun jeu lu » sont écrits en
toutes lettres sous les nœuds concernés. Dans `#-instrument-1440.png`, la rampe fait exactement son
travail sur la colonne des bps et sur rien d'autre.

Réserve d'archivage, sans effet sur la note : **aucune capture du site construit en thème clair**
n'existe dans `shots/build/` (seule la hero en a une, datée de la DA). À livrer pour le dossier.

---

## 6. `motion` — 4

Ce qui est juste : **un seul moment orchestré** (`index.css:229-240`, `piste-trace`, 600 ms, décalé
par famille, sur des blocs déjà opaques — rien n'apparaît, seul le câblage se dessine) ; trois
gestes de famille et pas quatorze ; aucun compteur animé sur un nombre mesuré ; aucun préchargeur ;
`prefers-reduced-motion` honoré sans perte (`index.css:242-247`, `420-424`, et la QA mesure deux
captures identiques au hachage sur les quatre routes, `getAnimations()` à 0).

**Ce qui empêche le 5 :** l'animation de la famille analyse est livrée sous la forme générique que
`frontend-design` nomme explicitement. `index.css:407-418`, `figure-pose` : `opacity 0 → 1` et
`translateY(-6px) → 0`. C'est le fade-and-slide-up d'entrée, le geste par défaut de toute page
générée. Le document décrivait autre chose, et de plus juste : « la série de référence **vient se
superposer** à la série mesurée, en 180 ms ». **Correction :** animer la série de référence depuis
la longueur de la série mesurée jusqu'à la sienne (`transform: scaleX` sur l'axe, origine à gauche),
de sorte que le mouvement **soit** la comparaison. Même durée, même coût, et le geste dit enfin
quelque chose.

Second point : la piste qui se trace pendant 600 ms se termine, depuis la carte, sur un moignon qui
ne touche rien (§2). Une animation attire l'œil sur un trait qui ne mène nulle part.

---

## 7. `density` — 4

Densité 8 est réellement appliquée, et c'est le changement structurel le plus visible face à
`shots/avant/` : plus un seul conteneur de type carte, le groupement se fait par filet et par
espace, les nombres sont en mono, les tableaux naissent d'une grille en `gap: 1px`. Les pages outil
tiennent trois temps, un échantillon, une commande de rejeu et dix états sans jamais paraître
encombrées.

**Deux accidents, aux deux extrêmes.**

1. **Trop vide :** la carte de `#/` à 1440 laisse 290 × 260 px morts sous la colonne collecte et
   40 × 145 px à droite de l'orchestrateur (§3.3), pendant que le même écran pousse l'écart au bord
   du pli.
2. **Trop long :** la section des données pèse 3 330 px sur une page de 5 720 (58 %), pour 27 lignes
   — soit 123 px par ligne, dans un document qui a réglé sa densité à 8. La matrice absente (§1) est
   précisément l'objet qui ramènerait cette section à ~700 px **en montrant davantage** : 378
   relations d'un coup d'œil au lieu de 27 paragraphes.

---

## 8. Les deux arbitrages, jugés

### A. À 390, la paire de cotations et son écart déclarés importance 2

**Le compte est honnête et je le confirme :** 8 rangs × 44 px + 7 gouttières = 408 px de nœuds
incompressibles, et amputer la carte contredirait d001. L'arbitrage est écrit, il figure aux deux
rubriques, elles ne se contredisent plus, et `mustSeeIn10s` disait déjà « l'écart visible dès qu'on
descend d'un cran ». **Je le valide.**

**Mais le raisonnement s'arrête à une hypothèse non examinée :** il suppose qu'entrer l'écart dans
le pli exige le rôle `display` à 56 px avec ses deux séries et ses wei. Ce n'est pas la seule forme.
Relevé sur `build/home-390.png` : au-dessus du premier nœud (y 440), l'espace est occupé par la
barre 0-44, la navigation 56-100, le titre sur deux lignes 115-195, la légende 196-212, le bloc
`La chaîne` 247-368 (dont une ligne de glose et 22 px de graduations) et le compteur des jeux
382-426. **Environ 150 px y sont récupérables sans toucher à un seul nœud** : titre sur une ligne à
32 px (−40), glose « bout en bout, sous une seule horloge » repliée dans le bloc (−25), graduations
à 12 px (−10), gouttières resserrées de 8 (−40), légende et compteur sur la même rangée (−44).
Une bande d'écart en une ligne — `99,03 │ 100,00 │ 96,74 bps` en rôle `metric`, 56 px de haut, la
figure complète restant un cran plus bas — y tiendrait. `mustSeeIn10s` n°4 serait alors servi aux
trois largeurs. **Proposition, pas exigence :** la note de `hierarchy` ne dépend pas de ce choix,
mais l'arbitrage devrait citer cette option et dire pourquoi il la refuse, plutôt que de conclure de
« l'écart ne tient pas » à « il descend ».

### B. L'écart de la section usage en rôle `metric` et non `display`

**Je le valide aussi, et pour une meilleure raison que celle qui est donnée.** La raison écrite —
« que la hero garde le seul `display` de la page » — est une règle de forme. La vraie raison est
celle du §1 : **les deux figures ne mesurent pas la même grandeur**, et leur donner deux poids
typographiques est ce qui empêche de croire que la seconde recalcule la première. Le document
gagnerait à l'écrire ainsi.

**Une réserve de fond, tout de même :** en l'état, le geste de l'utilisateur — coller son adresse —
produit un résultat typographiquement **plus petit** que l'exemple qu'on lui a montré avant qu'il ne
fasse quoi que ce soit. La récompense est inversée. **Correction, qui garde la règle intacte :** un
`display` par écran, mais qui appartient à la réponse dès qu'il y en a une — au succès du collage,
la figure du hero passe en `metric` et celle de la section prend le `display`. La page continue de
n'avoir qu'un seul très grand nombre, et c'est celui que l'utilisateur a demandé.

---

## 9. `responsive` — 3

Au crédit, et c'est substantiel : la carte se recompose vraiment à chaque palier — trois colonnes de
familles et rail latéral à 1440, colonnes resserrées et rail passé dessous à 768, deux colonnes de
nœuds sans ligne de métadonnée et compteur cliquable à 390 — et le document décrivait exactement
cela avant qu'il ne soit construit. 12 nœuds entiers dans le pli à 390, cible minimale 44 px tenue,
zéro débordement horizontal sur les seize routes.

**Ce qui fait tomber à 3 : la table maîtresse de `#/instrument` est tronquée en silence, et pas
seulement sur mobile.**

- `build/#-instrument-1440.png`, bord droit x 1 415-1 428 : la dernière colonne est coupée en plein
  mot, « ME… ». **À 1440 px**, la largeur de référence du site.
- `build/#-instrument-390.png` : chaque rang est coupé sur « ABSEN… », colonnes 3 à 7 invisibles.
- La seule indication de défilement est un nom accessible (`Table.tsx:278`,
  `aria-label="… défilement horizontal"`). Un lecteur d'écran est prévenu ; **un lecteur voyant ne
  l'est pas**, et l'interdiction d'ombre portée (d006) prive la page de l'affordance habituelle.

C'est nommément la priorité 7 de `modules.design` : « les tableaux à sept colonnes […] les rendre
lisibles à 400 px **sans les tronquer en silence** ». Elle n'est pas tenue.

**Corrections :**
1. Un repère visible et permanent dans la rangée d'en-tête collante : `◀ 5 colonnes de plus ▶` en
   `data-sm`, aligné à droite, et un filet vertical `--line-strong` sur le bord coupé — deux règles
   CSS, zéro ombre.
2. À 390, basculer la table en un rang par hook empilé (adresse, puis registre, puis mesure), ce que
   la grille en `gap: 1px` permet sans nouveau composant. La rubrique 5 n'a jamais prévu la
   troncature comme réponse mobile.
3. À 1440, réduire d'une colonne : `bloc` et `taille` peuvent vivre dans la cellule de la mesure,
   déjà sur trois lignes.
4. Le pavé flottant `ASSISTANT · PILOTE LE TABLEAU` recouvre un rang de la table à 390
   (`#-instrument-390.png`, y 800-830) et cumule deux tells (capitales chassées, point médian).
   Le remonter dans l'index, ou le réduire à un bouton de 44 px sans texte à cette largeur.

---

## 10. `accessibility` — 5, et la forme du refus

Je ne refais pas les mesures de la QA, je les tiens : axe-core 4.13.0 à **0 violation** sur 4 routes
× 2 largeurs (1 854 nœuds au départ), Lighthouse accessibilité **100 sur les quatre routes**,
0 cible sous 24 px, 14/14 nœuds de carte à 44 px minimum, focus visible sur 100 arrêts de
tabulation, ordre de tabulation conforme à l'ordre visuel, 7 régions défilantes atteignables au
clavier, `prefers-reduced-motion` identique au hachage, 0 débordement sur 16 routes.

Ce qui me fait écrire 5 plutôt que 4 est le contrôle que personne n'exige : **le texte peint dans le
`<canvas>` du panneau 06 a été vérifié au pixel, rangée par rangée**, là où axe est aveugle, et il
est passé de 2,2:1 à 8,3:1 sans que le filet d'axe ni la ligne de référence perdent leur gris —
c'est-à-dire sans détruire l'information pour satisfaire la règle. C'est de l'accessibilité
comprise, pas cochée.

**La forme du refus, jugée à l'écran** (`shots/qa/refus-graphe.png`) : les trois encarts du graphe
portent la même structure — ce qui manque en `data`, l'erreur brute, la phrase qui dit ce qui n'est
**pas** affiché et pourquoi un zéro mentirait, la commande, le bouton de copie. C'est la même forme
aux cinq surfaces, via un seul composant. **Un refus qui a l'air d'une fonctionnalité : le brief le
demandait (priorité 6), c'est obtenu.** Les 10 erreurs de `console.txt` sont donc bien couvertes.

Deux réserves de forme, comptées ailleurs : les textes de refus sont sans accents (§4.3), et la même
phrase de refus est répétée trois fois côte à côte dans la même section — à 390, cela fait trois
écrans de la même explication. **Correction :** une explication pour la section, trois encarts
réduits à leur ligne d'état et à leur commande.

---

## 11. `originality` — 4

**Ce que ce site invente pour lui-même**, et qu'on ne verra pas ailleurs : une carte-manifold où le
câblage naît d'un bloc unique et se distribue en colonnes de familles ; une horloge dont les six
graduations portent les temps réels de la chaîne et non un escalier décoratif (relevé : 5, 4, 4, 55,
4, 35 px — une silhouette non croissante, qu'aucun décor n'aurait produite) ; une figure appariée
dont l'écart est le seul très grand nombre de l'écran ; un index-sommaire de rapport technique pour
les dix-sept panneaux ; une table dont les filets naissent d'un `gap: 1px`. Le contre-exemple gardé
par le scout — nœuds ronds à anneau coloré — est évité, la charte n'est jamais contredite.

**Un tell facturé**, et je dis pourquoi c'en est un ici : **l'étiquette en capitales chassées**
(`.t-label`, 11 px, `letter-spacing: 0.1em`, `text-transform: uppercase`), appliquée à des libellés
qui ne sont pas des valeurs. `frontend-design` la classe en chrome de gabarit (« a tracked-out
ALL-CAPS eyebrow label above every heading »), et `DESIGN.md` rubrique 8 se l'interdit nommément.
Elle est partout : `IL FAUT`, `OUTILS`, `SES JUMEAUX`, `REJOUER CETTE VALEUR`, les en-têtes de la
table des données. −1.

**Un tell que je ne facture pas, et je dis pourquoi**, pour que tu puisses me contredire : les
points médians. Le patron `A · B · C` a bien disparu des endroits où il régnait — l'en-tête de page
l'a perdu au profit d'un `<details>` « provenance », la carte au profit de « 6/6 étapes en
13 680 ms », les barres de section au profit de paires séparées par un filet vertical
(`125 072 mesures embarquées │ aucune requête réseau`). Ce qui subsiste est le séparateur de deux
champs dans une ligne mono de relevé (`3 ko · 3 swaps executes`, `base · chainid 8453`) : là, le
point médian sépare les champs d'un enregistrement, il ne décore pas un titre. Je le signale comme
résidu à surveiller, pas comme tell. Le pavé flottant `ASSISTANT · PILOTE LE TABLEAU`, lui, est bien
le patron interdit — il est compté en `responsive` §9.4.

**Ce qui retiendrait encore le 5 même sans tell :** l'élément mémorable de la rubrique 0 n'est
construit qu'aux deux tiers (§2.1), et la matrice manque (§1). Une fois le fil branché et la matrice
posée, ce site n'aura plus de rival de forme dans sa catégorie.

---

## Corrections, classées par impact

| # | correction | critère | preuve |
|---|---|---|---|
| 1 | **Construire la matrice 27 × 14** en `gap: 1px`, la table devenant le détail au clic — ou enregistrer l'arbitrage et retirer les trois mentions de `DESIGN.md` | fidelity, ambition, density | `home-1440-full.png` y 2 390-5 720 ; `grep repeat(14` sans résultat |
| 2 | **Brancher la piste sur la figure** : prolonger x 17 de y 672 à y 735, entrer sur le nuancier, terminer par le segment perpendiculaire de 6 px | ambition, originality | `home-1440.png` : encre à x 17-18 jusqu'à y 672, rangées 680 et 690 vides, cible à y 735 |
| 3 | **Sortir les commandes de `.t-label`** (`Accueil.tsx:547`) et retirer `text-transform` de la classe ; créer `.t-valeur` pour les seules étiquettes de mesure | typography, originality | colonne `FICHIER` : `PYTHON3 -M TARE.CLI SUMMARY`, `NODE APPS/WEB/SCRIPTS/BUILD-DATASET.MJS` |
| 4 | **Un seul compte d'états sur `#/outil/7`**, dérivé de la liste rendue ; accorder `outils.ts`, `brief.json` et `DESIGN.md` | fidelity | `#-outil-7-1440.png` : « 10 états d'envoi » (y 488) contre « l'un des huit états » (y 589) |
| 5 | **Repère de troncature visible** sur la table registre, et un rang par hook à 390 | responsive | `#-instrument-1440.png` x 1 415 coupé ; `#-instrument-390.png` |
| 6 | **« signer — sans envoyer »** : le bouton de `PRET` contredit le nœud 7 et `brief.content.actions` | fidelity | `#-outil-7-1440-full.png` y 570 contre `home-1440.png` y 350 |
| 7 | **Replier l'échantillon de cinq lignes** derrière un `<details>`, compte total visible fermé | hierarchy | `#-outil-1-1440.png` y 440-620 |
| 8 | **Accentuer** les textes de refus et les titres de panneaux | typography | `refus-graphe.png` : « sans reponse », « n'est affiche », « precedentes » |
| 9 | **Superposition au lieu du fade-and-slide** pour l'animation analyse (`scaleX` sur l'axe) | motion | `index.css:407-418` |
| 10 | **Fermer le vide de la carte** : descendre l'orchestrateur au centre optique | hierarchy, density | `home-1440.png` x 540-830 / y 390-650 |
| 11 | **Nommer les deux figures** (`FIG. 1 — le péage du hook`, `FIG. 2 — le coût de la porte`) et différencier leurs formes | fidelity | `Accueil.tsx:294` et `home-1440.png` y 700-830 |
| 12 | **Livrer les captures manquantes** : état de succès du collage à 1440 et à 390, et le site construit en thème clair | preuve | `shots/build/` n'en contient aucune |
| 13 | **Rubrique 9** : corriger « les deux derniers amorcés, les deux derniers amorcés », garantir le 768, citer l'option de la bande d'écart à 390 | hierarchy | `DESIGN.md:259` ; `home-768.png` |
| 14 | **Le pavé flottant** : hors du recouvrement à 390, sans capitales chassées ni point médian | responsive, originality | `#-instrument-390.png` y 800-830 |

## Contrôle de l'audit `audit-hero.md`

Les neuf règles marquées corrigées le sont toujours à l'écran après le build : navigation en
`<a href="#/…">` avec `aria-current` (`build/home-1440.png`, onglets `la carte` / `l'instrument`,
état actif visible), texte de navigation à `--ink-2`, marqueur de `<summary>` retiré du dépliant
`provenance`, `text-wrap: balance` confirmé par la coupe du titre à 390, `theme-color` déclaré deux
fois, aucun débordement horizontal aux trois largeurs, `touch-action` et `tap-highlight` sur les
nœuds. **La dixième, le lien d'évitement, était reportée « au squelette de page » : elle est posée**
(`qa.md` §4, `App.tsx`) — le report a été tenu, ce qui est la bonne manière de reporter.
