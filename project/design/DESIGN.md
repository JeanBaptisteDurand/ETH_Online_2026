# DESIGN — TARE

> Écrit par design-generator le 2026-09-12 à partir de `project/brief.json` (marque, références, `content`, `demo`) et de `project/decisions.json`. Un design entier, pour ce projet seulement. Version machine : `project/design/tokens.json`.

## 0. Ce qui rend ce site mémorable

**La page est câblée.** Une piste de 1 px sort du bloc orchestrateur, traverse la carte jusqu'aux quatorze outils, et ne s'arrête pas au bord du héros : elle continue derrière les sections suivantes et vient se brancher sur la figure des deux cotations. On ne regarde pas un diagramme du système, on regarde le système, et on suit un fil du doigt jusqu'à son résultat.

Les verrous, cités un par un.

- **d001** — « une map en node/flux avec le rendu le plus design et cohérent avec ma DA possible : la première chose que l'on voit sur la page, l'orchestrateur et tous les tools qu'il utilise ». Tenu : la carte est la première section de `#/`, elle occupe le premier écran, elle porte le bloc `LA CHAÎNE` et les quatorze blocs d'outils.
- **d002** — « cliquer sur un nœud permet d'apercevoir le détail du fonctionnement du tool ». Tenu : chaque bloc d'outil est un `<a href="#/outil/n">`, cible 44 px, focus visible, et la page d'arrivée ouvre sur l'onglet de l'outil cliqué.
- **d003** — « à la fois la preuve et l'usage ». Tenu : une seule section sous la carte. On colle une adresse, et la réponse est la figure des deux cotations avec l'écart. L'usage produit la preuve.
- **d004** — ambition marquée. Tenu : le rapport d'échelle typographique passe de 3,4:1 à 10,5:1, mesuré ci-dessous, et la carte est un objet dessiné, pas une liste.
- **d005** — « évite les canevas pointillés, trop AI ». Tenu : aucune trame de fond. Les pistes sont des traits pleins sur le fond de page, et la seule gouttière est faite de caractères `#` en monospace.
- **d006** — « évite globalement les rendus type AI. Choix des couleurs, coins arrondis etc. ». Tenu : rayon 0 partout, aucun dégradé, aucune ombre portée, aucun halo. La profondeur est faite de filets et de valeurs de fond.
- **d007** — le français. Tenu : toute l'interface, y compris les libellés de la carte.
- **d008** — « fie-toi à ce qui est dit, et non à ce qui est fait pour le moment ». Tenu : la rubrique 5 décrit les écrans depuis `src/lib/outils.ts`, `src/lib/donnees.ts` et `brief.json`, pas depuis l'état actuel des composants.
- **d009** — direction A avec l'horloge de B. Tenu : schéma d'appareil en héro, l'horloge réelle de la chaîne dans le bloc orchestrateur, la matrice 27 × 14 descendue dans la section des données.

La charte de l'équipier n'est pas un verrou du registre mais elle en a la force : JetBrains Mono et Instrument Sans, la rampe `--m-0` à `--m-6` qui encode les bps, le rayon zéro. Ce document l'applique, il ne la rouvre pas.

## 1. Atmosphère

**Câblé, mesuré, dense, franc.**

On arrive sur un appareil, pas sur une page de produit. Le monde est celui des schémas d'atelier et des relevés : des pistes tirées à angle droit, des blocs légendés par leur fonction, des chiffres en monospace qui portent leur unité et leur bloc. La lumière est celle d'un écran sombre, pas celle d'une scène : aucune source, aucune ombre, aucune matière. Ce site n'est ni un tableau de bord SaaS ni une page de lancement. Il n'illustre rien : ce qu'il montre est ce qu'il a mesuré.

Skills : frontend-design, design-taste-frontend, industrial-brutalist-ui
Références lues : warp.md, posthog.md
Famille (awesome-design-skills) : mono

Ce que je retiens, et pourquoi.

De **industrial-brutalist-ui**, l'archétype *Tactical Telemetry* et lui seul, jamais mélangé au *Swiss Print* : fond sombre, monospace pour toute donnée, rejet absolu du `border-radius`, compartimentation visible par filets, et surtout sa directive de grille — `display: grid; gap: 1px` avec un fond de parent contrastant, qui produit des filets parfaits sans déclarer une bordure. C'est ce qui tiendra la matrice 27 × 14. Je rejette explicitement son costume : pas de scanlines CRT, pas de halftone, pas de crochets ASCII décoratifs, pas de `®` structurel, et pas son rouge aviation — la couleur ici est déjà prise par la rampe de mesure.

De **mono**, le mode de densité compacte, l'exigence d'états explicites (défaut, survol, focus, actif, désactivé, chargement, vide, erreur) et la règle « ne pas mélanger plusieurs métaphores visuelles » — décisive quand une page porte à la fois un schéma, une figure de mesure et un tableau. Jamais sa palette : son vert acide `#37F712` est exactement le tell que frontend-design décrit.

De **warp.md**, le raisonnement le plus utile du lot : *la marque n'a pas d'accent chromatique, l'encre est l'accent*, et *l'imagerie de terminal est le seul système décoratif*. Transposé : chez TARE l'accent n'est pas une couleur de marque, c'est la rampe de mesure, et le seul système décoratif est la donnée elle-même — les pistes, la figure appariée, le tableau. Warp tient aussi son héros à 64 px en graisse 400, volontairement calme : la présence vient du vide autour, pas du gras.

De **posthog.md**, deux choses : la hiérarchie se fabrique par paliers de graisse plutôt que par couleur, et le canevas ne change pas de valeur entre les sections — une seule feuille continue du haut en bas. C'est le contraire de l'état actuel, où chaque section est une boîte `Panel` posée sur le fond.

Des **références du brief** : de sstr.tech, la figure de la même grandeur mesurée deux fois, série traitée en couleur contre série de référence en gris, légende en barres de nuancier, et le verdict à côté en très grand. De dottxt.ai, l'objet héros qui est la commande réelle et sa sortie réelle. De oxide.computer, trouvé par le scout, la polyligne orthogonale de 1 px qui sort d'un panneau pour aller chercher un autre objet — l'arête de graphe sans canevas, qui répond au refus du pointillé. Du contre-exemple Grafana conservé par le scout, ce qu'il ne faut pas faire : des nœuds ronds à anneau coloré, qui interdiraient le rayon zéro et doubleraient la couleur de famille.

Réglages (design-taste-frontend) : variance 6, motion 3, densité 8. Ambition du brief : marqué.

Densité 8 déclenche une règle que j'applique à la lettre : au-dessus de 7, les conteneurs de type carte sont interdits, le groupement se fait par `border-top`, `divide-y` ou l'espace seul, et les nombres sont en monospace. C'est le changement structurel le plus visible par rapport à l'existant.

## 2. Palette et rôles

| Rôle | Hex | Contraste sur bg | Usage |
|---|---|---|---|
| bg | `#08090a` | — | fond de page, une seule valeur du haut en bas |
| fg | `#e8eaed` | 16,5:1 | texte, chiffres, pistes actives |
| accent | `#eb6628` | 6,1:1 | famille action — la seule qui touche à l'argent de quelqu'un |
| accent2 | `#3376f6` | 4,8:1 | famille collecte, et l'anneau de focus |
| muted | `#a2a9b0` | 8,4:1 | texte secondaire, légendes, métadonnées |
| surface | `#17191c` | — | fond d'un bloc de la carte, en-tête de tableau |

Trois valeurs de plus, héritées de la charte : `--line` `#24272b` pour les filets au repos, `--line-strong` `#383c42` pour les filets qui séparent deux zones, et `--ink-3` `#6b7178`.

**Une correction d'usage, mesurée.** `--ink-3` donne 4,04:1 sur le fond de page. Il est aujourd'hui employé pour du texte courant de 10 et 11 px, ce qui échoue en AA. Règle : `--ink-3` ne porte plus de texte de moins de 18,66 px, il sert aux filets, aux glyphes désactivés et aux états grisés. Tout texte secondaire passe à `muted` `#a2a9b0`. Aucune teinte de la charte n'est modifiée, seul son emploi l'est.

**Ce que la couleur encode, et ce qu'elle n'encode pas.**

La rampe `--m-0` à `--m-6` encode une seule grandeur, le prélèvement en points de base, du plus faible au plus fort. Elle est séquentielle et ne sert jamais à autre chose. Les trois couleurs de famille sont catégorielles et ne disent qu'une chose : ce que l'outil fait au monde. Bleu il va chercher, jaune il interprète, orange il change quelque chose.

La couleur n'encode jamais la qualité d'une mesure, la fraîcheur d'une donnée, ni l'état d'un outil. Une étiquette `NON_MESURABLE` n'est pas rouge : elle est écrite. Un outil en attente n'est pas grisé par sa famille : il porte sa raison en toutes lettres.

**Le conflit du thème clair, et sa résolution.** Les trois familles empruntent aujourd'hui `--m-6` et `--m-4` à la rampe. En thème clair la rampe s'inverse : `--m-6` passe d'un jaune `#f6d746` à un rouge `#d41020`, et `--m-4` d'un orange `#eb6628` à `#fd7435`. Analyse et action se rapprochent alors, alors que l'orange doit se repérer sans lire. Je sors donc les trois familles de la rampe et je leur donne trois jetons propres, `--fam-collecte`, `--fam-analyse`, `--fam-action`, qui valent les mêmes hex qu'aujourd'hui en sombre et sont redéfinis en clair pour garder l'écart. La rampe n'est pas touchée. C'est une décision d'emploi, à confirmer par l'équipier puisque la rampe est à lui — elle est notée en rubrique 9.

**Une seconde grammaire, sans couleur.** Pour distinguer les deux natures d'arête que la référence de l'utilisateur porte, la couleur ne suffit pas : trait plein pour le flux entre outils, trait à tirets pour l'alimentation d'un jeu de données vers un outil. Un daltonien lit la différence.

## 3. Typographie

Deux familles, déjà décidées et auto-hébergées : **Instrument Sans Variable** pour la prose et les titres, **JetBrains Mono Variable** pour tout ce qui est un chiffre, un identifiant, une adresse, une commande ou une étiquette de donnée. La règle ne souffre pas d'exception : si c'est mesuré, c'est en mono.

| Rôle | Taille | Famille | Graisse | Interlettrage | Usage |
|---|---|---|---|---|---|
| display | `clamp(3.5rem, 8vw, 8.5rem)` | mono | 500 | 0 | l'écart en bps, et lui seul, une fois par écran |
| hero | `clamp(2.25rem, 4.6vw, 3.5rem)` | sans | 600 | -0,03em | le titre de la page, une fois, en tête de route |
| title-lg | 28 px | sans | 600 | -0,02em | titre de section |
| title | 20 px | sans | 600 | -0,02em | titre de bloc, nom d'outil dans sa page |
| body | 16 px | sans | 400 | 0 | prose, 68 caractères au plus |
| data | 13 px | mono | 400 | 0 | valeurs, adresses, noms de champs |
| data-sm | 11 px | mono | 400 | 0,02em | métadonnées, légendes d'axe, nom de fichier |

Sept rôles pour six tailles de données plus le titre de page. Le rapport d'échelle passe de 3,4:1 (44 px contre 13 px, l'état actuel) à **10,5:1** (136 px contre 13 px). La charte de l'équipier mesure elle-même 17:1 à 22:1 sur six sites primés ; 10,5:1 est le palier que supporte un instrument dense sans devenir une affiche. Chiffres tabulaires partout (`font-variant-numeric: tabular-nums`), sans quoi une colonne de bps ne s'aligne pas.

**Ce qu'on ne fait pas**, et qui est présent aujourd'hui.

- Pas de chaîne de métadonnées jointe par des points médians. L'en-tête actuel affiche `base · chainid 8453 · bloc 50 614 000 · tare-engine/0.3.0 · stub 0x8e39b2ad… · registre ccab541 · 757 fiches` : c'est le tell le plus net de la page, et cette provenance est déjà répétée six fois ailleurs. Elle passe dans un seul bloc dépliable, en paires libellé/valeur.
- Pas de capitales espacées en titre de section. Les capitales restent aux étiquettes de données, où elles sont la valeur elle-même (`MESURE`, `NON_COTABLE`, `ABSENT`).
- Pas de mot isolé accentué dans un titre.
- Pas d'ordinal numéroté sur ce qui n'est pas une séquence. Les six étapes de la chaîne sont une séquence et gardent leurs numéros. Les dix-sept panneaux n'en sont pas une : leurs ordinaux deviennent des ancres de navigation, pas des eyebrows.
- Pas de flèche `→` collée au texte d'un lien.

**Un contrôle qu'aucun outil ne fait à ta place.** Le texte peint dans un `<canvas>` est une image pour axe : il ne voit ni sa couleur ni son contraste. Les graduations de la courbe du panneau 06 y sont restées à 2,2:1 alors que le reste du site était corrigé, et seule une mesure de pixels l'a trouvé. Tout graphe ajouté plus tard se contrôle par échantillonnage de pixels, jamais par axe seul.

## 4. Composants

**Bloc de carte (le nœud).** Rectangle, rayon 0, fond `surface`, filet 1 px `--line`. Un titre en `title` et **une seule** ligne de métadonnée en `data-sm` — l'anatomie de la référence de l'utilisateur, rien de plus. Une barre pleine de 3 px sur le bord gauche porte la couleur de famille. États : repos, survol (filet passe à la couleur de famille, fond monte à `--bg-3`, 90 ms), focus visible (anneau 2 px `accent2`, décalé de 2 px), actif (`translateY(1px)`), désactivé (filet `--ink-3`, raison écrite dessous, jamais un simple grisé). Cible 44 px de haut au minimum.

**Bloc orchestrateur.** Même grammaire, deux fois plus large, filet `--line-strong`. Il porte le nom de la chaîne, son horloge réelle et son compte d'étapes. C'est le seul bloc qui contient une série de six graduations.

**Piste.** SVG, polyligne à angles droits uniquement, 1 px, `--line-strong` au repos. Au survol d'un bloc, les pistes qui le touchent passent à `fg` et les autres descendent à `--line`. Plein pour un flux d'outil à outil, tirets 4/4 pour un jeu de données vers un outil. Jamais de courbe, jamais de flèche pleine : une extrémité se termine par un segment perpendiculaire de 6 px.

**Figure appariée.** Deux colonnes dans les mêmes axes, la série avec le hook en `fg`, la série avec le talon en `--baseline` gris. Surtout pas en `accent` : cet orange dit déjà « famille action » dans la légende du même écran, et une couleur ne peut pas porter deux sens sur une page. Légende en deux barres de nuancier de 24 × 8 px suivies d'un libellé mono, jamais des puces rondes. À droite, le verdict : l'intervalle `[ 99.9942 → 102.4610 ]` en `data`, l'écart en `display`, le nom de la grandeur en `body`. Aucun lissage : un nuage de points reste un nuage de points, et la courbe ne relie pas ce qui n'est pas mesuré.

**Tableau.** Pas de conteneur. `display: grid; gap: 1px` sur fond `--line`, cellules sur fond `bg` — les filets naissent de la grille. En-tête en `data-sm`, collant. Nombres alignés à droite et tabulaires, texte à gauche, adresses en mono tronquées au milieu. Une ligne se survole en montant à `--bg-1`. Conteneur en `overflow-x: auto`, déjà en place.

**Étiquette de mesure.** Rectangle plein, rayon 0, 2 px de padding vertical, texte en `data-sm`. Elle porte la valeur brute (`MESURE`, `INTERPOLE`, `NON_MESURABLE`, `NON_COTABLE`) et n'est jamais traduite ni promue.

**Non lu.** Le composant existe (`<NonLu>`) et devient obligatoire : un tiret cadratin en `--ink-3` suivi de la raison en `data-sm`. Jamais un blanc, jamais un zéro.

**Bouton.** Rectangle, rayon 0, filet 1 px. Primaire : fond `fg`, texte `bg`. Secondaire : fond transparent, filet `--line-strong`. Désactivé : filet `--line`, texte `--ink-3`, **et la raison affichée à côté** — c'est la règle de la substitution, où neuf états sur dix laissent le bouton inactif. Le compte vient de l'implémentation, qui en déclare dix et dont le test refuse qu'un soit oublié ; d008 en fait la source de vérité.

**Champ.** Libellé au-dessus, filet 1 px, fond `--bg-1`, hauteur 44 px, focus en anneau `accent2`. Le texte d'aide existe dans le balisage même vide. L'erreur s'écrit sous le champ, jamais en alerte.

**Onglets** (page outil, un onglet par outil). Libellé en `data`, souligné de 2 px à l'onglet actif dans la couleur de sa famille, `aria-selected`, navigation au clavier par flèches.

Aucun de ces composants ne porte d'ombre ni de rayon. La profondeur n'existe pas : il n'y a qu'un plan, découpé.

## 5. Layout et ordre des écrans

**Shell.** Une barre haute de 44 px, collante, qui porte le nom, les trois routes et le bouton de thème. Rien d'autre : la provenance quitte l'en-tête. Grille de 12 colonnes, gouttière 24 px, largeur maximale 1440 px, gouttière latérale 24 px à partir de 768 px et 16 px en dessous. Rythme vertical par multiples de 8. Alignement à gauche partout : rien n'est centré, sauf un chiffre dans sa cellule.

Le canevas ne change pas de valeur d'une section à l'autre. Les sections se séparent par un filet pleine largeur et par l'espace, jamais par un changement de fond.

### Écran 1 — `#/` · la carte, puis l'opération

La question : de quoi ce système est-il fait, et qu'est-ce qu'il me dit sur mon jeton ?

**Au-dessus du pli**, cinq données d'importance 1 au plus.

| donnée | représentation |
|---|---|
| les trois familles et leur couleur | légende, trois barres de nuancier + libellé |
| les quatorze outils | quatorze blocs, un titre + une ligne de métadonnée |
| l'orchestrateur et son horloge | un bloc large, `6/6 étapes · 13 680 ms`, six graduations hautes comme le temps de leur étape |
| les vingt-sept jeux de données | un rail de gauche, comptés, tronqué avec son reste affiché, chaque ligne menant au recensement |
| la paire de cotations et leur écart | deux valeurs ramenées sur une base de 100, la série avec le hook en `fg` et la série de référence en gris, puis l'écart dans le seul rôle `display` de l'écran, et les deux montants en wei bruts dessous. **Importance 1 à 1440, importance 2 à 390** — voir plus bas |

**En dessous du pli**, importance 2 : la section qui fond l'usage et la preuve, puis les cinq accès, puis la matrice 27 × 14. **Derrière une interaction**, importance 3 : la provenance complète, dans un bloc dépliable de la barre haute ; le détail d'un jeu de données, au clic sur sa ligne du rail.

Action primaire : cliquer un bloc d'outil, qui mène à `#/outil/n`. Action secondaire : coller une adresse, dans la section suivante.

États de la section usage : **vide**, le champ propose six jetons du corpus, ceux qui ont plusieurs portes ; **chargement**, aucun, tout est local ; **refus motivé**, « il n'y a qu'une porte » ou « aucune porte mesurée à cette taille », qui est la réponse et non un trou ; **succès**, la figure appariée et l'écart.

```
┌ TARE ─ la carte · l'instrument · les outils ──────── thème ┐
│                                                            │
│ FIG. 1 | LA CHAÎNE ET SES QUATORZE OUTILS                  │
│ ■ collecte   ■ analyse   ■ action                          │
│                                                            │
│ #  ┌──────────────────┐         ▌1 Mesurer                 │
│ #  │ LA CHAÎNE        ├────┬────▌  lit 4 jeux · 0 requête   │
│ #  │ 6/6 · 13 680 ms  │    │    ▌3 Situer                   │
│ #  │ │ │ │  │      │  │    ├────▌  calcul local             │
│ #  └──────────────────┘    │    ▌7 Substituer               │
│ #  27 jeux ────────────────┘    ▌  construit, n'envoie pas  │
│ #  measurements.jsonl           ▌… onze autres              │
│ #  one-way.json · +25                                       │
├────────────────────────────────────────────────────────────┤
│ COLLE UNE ADRESSE, VOIS CE QU'ELLE COÛTE                   │
│ [ 0x… ]                                                     │
│  avec le hook │ avec 89 octets inertes │ [99.99 → 102.46]   │
│  ·  ·   ·     │  ·    ·    ·           │                    │
│    ·  ·       │      ·   ·             │    247.31          │
│               │                        │    bps             │
└────────────────────────────────────────────────────────────┘
```

Responsive. À 768 px, la carte passe de deux colonnes à une, l'orchestrateur en haut, les outils dessous groupés par famille, les pistes deviennent verticales. À 390 px : la glose de la légende tombe et il ne reste que la barre de nuancier et le nom de la famille ; le rail des jeux de données descend sous les outils et un compteur cliquable (`27 jeux de données`) prend sa place dans le premier écran ; les quatorze blocs d'outils passent en deux colonnes et perdent leur ligne de métadonnée, de sorte que douze d'entre eux tiennent entiers sans défiler ; les graduations de l'horloge se réduisent de 40 à 22 px. La figure appariée passe des deux colonnes à deux lignes superposées partageant le même axe horizontal, et le verdict passe au-dessus. Le `display` descend à 3,5 rem, ce qui laisse l'écart sur une ligne.

### Écran 2 — `#/outil/1` à `#/outil/14` · une page par outil

La question : qu'est-ce que cet outil ingère, fait, et rend ?

Importance 1, au-dessus du pli : le nom et la question de l'outil, sa famille, son état, et **la sortie réelle**. Pour l'outil 1, c'est la figure appariée en grand — c'est la page la plus importante du site et l'idée du projet en une image. Importance 2, en dessous : les trois temps dans l'ordre, entrée puis exécution puis sortie, avec les libellés qui changent selon la famille. Importance 3, derrière une interaction : l'échantillon de cinq lignes du corpus se déplie, et le compte total reste affiché pour que la troncature se voie.

Le bandeau d'onglets, un par outil, reste collant en haut : c'est la « redirection » de d002, qui montre que l'orchestrateur passe d'un outil à l'autre. Au-dessus des onglets, une piste reprend le fil de la carte et marque l'outil courant.

Action primaire : copier la commande de rejeu. Pour l'outil 7, construire la transaction — le bouton n'est actif que sur `PRÊT`, et les huit autres états restent visibles, inactifs, chacun avec sa raison.

```
│ ▌ 1 · Mesurer          collecte · prêt · 0,001 USDC     │
│ [1][2][3][4][5][6][7][8][9][10][11][12][13][14]         │
│ ce hook, sur ce pool, à cette taille — combien ?        │
│                                                          │
│  out_with        out_without           ÉCART             │
│  99.9942         102.4610              247.31 bps        │
│  ───────────────────────────────────────────             │
│  make replay --pool 0x99… --size 1e18        [copier]    │
│                                                          │
│  CE QU'IL VA CHERCHER │ IL S'EXÉCUTE │ CE QU'IL RAMÈNE   │
```

### Écran 3 — `#/instrument` · les dix-sept panneaux

La question : qu'est-ce que le corpus dit, en entier ?

Importance 1 : le tableau registre contre mesure, trié par mesure décroissante, avec la rampe qui fait son travail. Importance 2 : les panneaux d'analyse, dans l'ordre. Importance 3 : les lignes brutes, paginées.

Ce que le design ajoute, et qui manque : **un index de panneaux collant à gauche**, ordinal en mono gris, titre en sans, compte aligné à droite sur un filet — la structure de sommaire d'un rapport technique. Dix-sept panneaux sans repère sont aujourd'hui une page sans navigation.

Les cinq surfaces qui dépendent de l'API partagent une seule forme de refus : le nom de ce qui manque, la raison, et la commande qui le ferait tourner en local. Un refus motivé est une fonctionnalité et doit en avoir l'air.

### Le parcours de démo, en clics

| # | étape | écran | clics |
|---|---|---|---|
| 1 | la carte occupe le premier écran | `#/` | 0 |
| 2 | coller une adresse, voir les deux cotations et l'écart | `#/` | 1 (coller) |
| 3 | le nœud de l'outil 1 | `#/outil/1` | 1 |
| 4 | un nœud orange, l'outil 7 et ses dix états | `#/outil/7` | 1 |
| 5 | un nœud de donnée | `#/` rail, puis détail | 1 |
| 6 | les dix-sept panneaux | `#/instrument` | 1 |

Cinq clics et un collage. `mustSeeIn10s` pointe entièrement sur l'étape 1 : la carte, les trois couleurs de famille, le fait qu'un nœud se clique, et l'écart visible dès qu'on descend d'un cran.

## 6. Profondeur et fonds

**Un seul niveau d'élévation, et il n'est pas lumineux.** Trois valeurs de fond (`bg`, `--bg-1`, `surface`) et deux valeurs de filet (`--line`, `--line-strong`) suffisent à tout. Aucune ombre, aucun flou, aucun halo : la hiérarchie se lit au filet et à la valeur. C'est la conséquence directe de d006.

| section | base | champ | texture | accents | pourquoi |
|---|---|---|---|---|---|
| carte (héro) | default | aucun | aucune | aucun | les pistes et les blocs sont déjà le dessin ; un champ derrière eux rendrait les filets de 1 px illisibles |
| usage et preuve | default | aucun | aucune | aucun | la figure appariée est une lecture de précision, le fond ne doit rien y ajouter |
| les cinq accès | default | aucun | aucune | aucun | respiration après la carte |
| la matrice 27 × 14 | default | aucun | aucune | aucun | la trame est faite par la grille elle-même, en `gap: 1px`. Cette forme est verrouillée par d009 : une table de relations à cinq colonnes ne la remplace pas |
| pages outil | default | aucun | aucune | aucun | — |
| instrument | default | aucun | aucune | aucun | la rampe porte déjà toute la couleur de l'écran |

Aucune section n'a de champ. Ce n'est pas une omission : la page entière est une seule feuille, et la seule texture admise est une gouttière de caractères `#` en `--ink-3`, à gauche des blocs de la carte, qui reprend oxide.computer. Elle est en `aria-hidden`.

## 7. Motion

Preset **calm**, curseurs variance 6, motion 3, densité 8. Pas de smooth scroll : sur une page dense, il rend la lecture d'un tableau imprécise.

**Le moment orchestré, une fois.** Au chargement de `#/`, les pistes de la carte se tracent depuis le bloc orchestrateur vers les outils, par `stroke-dashoffset`, en 600 ms et dans l'ordre des familles. Les blocs sont déjà là, opaques, dès la première image : rien n'apparaît, seul le câblage se dessine. Aucun préchargeur, aucun écran d'attente — le premier texte utile est peint avant le premier octet de JavaScript, comme aujourd'hui.

**Une animation par famille, pas une par page**, comme le demande le brief front. Collecte : la piste se remplit. Analyse : la série de référence se superpose à la série mesurée, en 180 ms, au premier affichage de la figure. Action : le bouton et son état changent ensemble, 90 ms, et la raison s'écrit sous lui.

**Ce qui répond à l'utilisateur** : le survol d'un bloc allume ses pistes et éteint les autres ; le survol d'une étape de la chaîne trace son parcours ; l'ouverture d'un échantillon déplie sa hauteur. Tout en `transform` et `opacity`.

**Ce qui ne bouge jamais** : les nombres. Aucun compteur qui monte depuis zéro, aucun chiffre qui se recompose. Un nombre mesuré est écrit, pas calculé à l'écran. Aucune transition non plus sur la rampe de couleur d'une cellule : la teinte est la valeur.

Sous `prefers-reduced-motion`, le même design, complet : les pistes sont tracées d'emblée, les changements d'état sont instantanés, rien n'est retiré.

## 8. Do et don't

**Do.** Grouper par filet et par espace, jamais par boîte — densité 8 interdit la carte. Donner à chaque refus la même forme que les autres, avec sa raison et sa commande. Laisser la donnée être le seul système décoratif du site : les pistes, la figure appariée, la rampe.

**Don't.** Pas de chaîne de métadonnées en points médians, pas de capitales espacées en titre, pas d'ordinal sur ce qui n'est pas une séquence — les trois tells de frontend-design que cette direction risque le plus, et les trois sont dans la page aujourd'hui. Pas de dégradé, pas d'ombre portée, pas de coin arrondi, pas de canevas pointillé, pas de compteur animé, pas de préchargeur — `brand.avoid` au complet. Pas de nœud rond à anneau coloré : c'est le contre-exemple que le scout a gardé exprès.

## 9. Ce que la DA garantit à l'usage

Le parcours de démo tient en cinq clics et un collage. À 1440, les cinq données d'importance 1 de `#/` sont lisibles sans scroll, la paire de cotations et son écart comprises. **À 390, quatre sur cinq le sont** — la légende des familles, l'horloge de la chaîne, le compteur des jeux de données et douze des quatorze outils entiers, les deux derniers amorcés, les deux derniers amorcés ; la paire et son écart demandent un défilement court. C'est une contrainte de format assumée, pas un oubli : quatorze nœuds à cible tactile de 44 px et un chiffre de 56 px ne tiennent pas ensemble dans 844 px de haut, et amputer la carte contredirait d001. L'ordre mobile met donc devant ce que la carte doit prouver — le système et son ampleur — et laisse la preuve chiffrée à un cran de défilement. Aucune donnée d'importance 3 au-dessus du pli : la provenance complète et les lignes brutes sont derrière une interaction. Cibles de 44 px sur les blocs de la carte, 24 px au minimum ailleurs. Contraste 4,5:1 sur tout texte, ce que la correction d'emploi de `--ink-3` rend vrai pour la première fois. Focus visible sur tout élément atteignable, anneau 2 px décalé. `prefers-reduced-motion` respecté sans perte. Aucun défilement horizontal à 390 px, où le site est aujourd'hui à zéro débordement sur les seize routes — à ne pas casser.

Une question reste ouverte et appartient à l'équipier : les trois jetons de famille sortis de la rampe (rubrique 2). La rampe elle-même n'est pas touchée.

Le thème clair est capturé et vérifié : `project/design/shots/hero/home-1440-clair.png`. Les trois familles y restent séparables — bleu, or sombre, rouge-orangé — mais l'écart de teinte entre analyse et action y est plus serré qu'en sombre. La rampe appartenant à l'équipier, le choix de resserrer ou d'écarter davantage lui revient ; la légende, elle, est permanente à l'écran dans les deux thèmes.

Audit web-design-guidelines de la hero : voir `project/design/audit-hero.md`.

## 10. Guide pour l'agent constructeur

Mode existing, branche `design/tare`. Les jetons vivent dans `apps/web/src/index.css`, déjà en place : on ajoute `--fam-collecte`, `--fam-analyse`, `--fam-action`, le rôle `display` et les règles d'emploi, on ne renomme rien. Aucun hex dans un composant, aucun style inline de couleur — variables uniquement. Aucun nombre écrit à la main : tout vient de `facts.json`, `dataset.ts`, `outils.ts` ou `donnees.ts`, et `src/lib/facts.test.ts` fait tomber la suite sinon. Ne jamais toucher `src/lib/`, `src/data/`, `engine/`, `contracts/`, `apps/api/`, `packages/`.

Ordre de construction, celui du parcours de démo : la carte de `#/` d'abord, avec `Carte`, `NoeudOutil`, `NoeudChaine` et `Piste` ; puis la section usage et preuve avec `FigureAppariee` ; puis la page outil et son bandeau d'onglets ; puis l'index de panneaux de `#/instrument` ; puis la forme commune des refus. Réutiliser `Panel`, `Copy`, `Replay`, `NonLu` et `Chip` de `Prim.tsx` plutôt que d'en écrire d'autres, en leur retirant leur chrome de boîte. `web-design-guidelines` passe sur chaque écran avant de rendre la main, et `node --test src/lib/*.test.ts` reste à 114/114 avec `npm run build` vert.
