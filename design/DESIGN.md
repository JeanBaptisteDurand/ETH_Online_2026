---
version: alpha
name: tare-design
description: "A near-black instrument canvas (#08090a) on which the system map sits as a machined plate: one enclosure a step lighter than the page, tool nodes as plates with a one-pixel top highlight, and 1px orthogonal wiring that turns from grey to ink on hover. The only chromatic accent is the action-family orange (#eb6628), allowed on the action nodes, the primary button and the figure's verdict; collecte blue and analyse yellow are categorical, never decorative. Display is Instrument Sans at 600 with -0.03em tracking, every number and identifier is JetBrains Mono; the material is flat, hairline and value, no shadow, no gradient, radius zero everywhere. The memorable thing: hovering a tool lights its path through the whole map."

colors:
  canvas: "#08090a"
  surface-1: "#0e1013"
  surface-2: "#161a1e"
  surface-3: "#1c2126"
  highlight: "#2a3037"
  ink: "#e8eaed"
  ink-muted: "#a2a9b0"
  ink-subtle: "#6b7178"
  primary: "#eb6628"
  on-primary: "#08090a"
  primary-hover: "#f27d45"
  accent-2: "#3376f6"
  accent-3: "#dfc24d"
  baseline: "#6b7178"
  border: "#23272c"
  border-strong: "#363b42"
  focus: "#3376f6"

typography:
  display:
    fontFamily: "Archivo Variable"
    fontSize: "4rem"
    fontWeight: 600
    letterSpacing: "-0.03em"
    lineHeight: 1.02
  number:
    fontFamily: "JetBrains Mono Variable"
    fontSize: "7rem"
    fontWeight: 500
    letterSpacing: "-0.02em"
    lineHeight: 1
  headline:
    fontFamily: "Archivo Variable"
    fontSize: "2rem"
    fontWeight: 600
    letterSpacing: "-0.02em"
    lineHeight: 1.15
  title:
    fontFamily: "Archivo Variable"
    fontSize: "1.25rem"
    fontWeight: 500
    letterSpacing: "-0.01em"
    lineHeight: 1.3
  body:
    fontFamily: "Instrument Sans Variable"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  mono:
    fontFamily: "JetBrains Mono Variable"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
  mono-sm:
    fontFamily: "JetBrains Mono Variable"
    fontSize: "0.6875rem"
    fontWeight: 400
    letterSpacing: "0.02em"
    lineHeight: 1.35

rounded:
  sm: "0px"
  md: "0px"
  lg: "0px"

spacing:
  unit: "8px"
  gutter: "24px"
  section: "112px"

components:
  enclosure:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.mono-sm}"
    padding: "24px"
    rounded: "{rounded.lg}"
  plate:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    padding: "12px 14px"
    rounded: "{rounded.md}"
  plate-hover:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    padding: "12px 14px"
    rounded: "{rounded.md}"
  plate-orchestrator:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    padding: "20px"
    rounded: "{rounded.md}"
  plate-highlight:
    backgroundColor: "{colors.highlight}"
    height: "1px"
  wire:
    backgroundColor: "{colors.border-strong}"
    height: "1px"
  wire-active:
    backgroundColor: "{colors.ink}"
    height: "1px"
  wire-rest:
    backgroundColor: "{colors.border}"
    height: "1px"
  port:
    backgroundColor: "{colors.surface-3}"
    width: "7px"
    height: "7px"
  menu-outils:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    padding: "18px 20px"
    rounded: "{rounded.md}"
  scroll-cue:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.mono-sm}"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    padding: "10px 16px"
    height: "40px"
    rounded: "{rounded.md}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    padding: "10px 16px"
    height: "40px"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "10px 16px"
    height: "40px"
    rounded: "{rounded.md}"
  button-disabled:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    padding: "10px 16px"
    height: "40px"
    rounded: "{rounded.md}"
  field:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    height: "44px"
    padding: "0 12px"
    rounded: "{rounded.md}"
  focus-ring:
    backgroundColor: "{colors.focus}"
    width: "2px"
  figure-paired:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.number}"
    padding: "24px"
    rounded: "{rounded.lg}"
  series-without:
    backgroundColor: "{colors.baseline}"
    height: "8px"
    width: "24px"
  table-header:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.mono-sm}"
    padding: "10px 12px"
  table-cell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    padding: "10px 12px"
  tab:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    padding: "12px 14px"
  tab-active:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "12px 14px"
  family-collecte:
    backgroundColor: "{colors.accent-2}"
    width: "3px"
  family-analyse:
    backgroundColor: "{colors.accent-3}"
    width: "3px"
  family-action:
    backgroundColor: "{colors.primary}"
    width: "3px"
  value-badge:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.ink}"
    typography: "{typography.mono-sm}"
    padding: "2px 6px"
    rounded: "{rounded.sm}"
  rule-subtle:
    backgroundColor: "{colors.ink-subtle}"
    height: "1px"
  non-lu:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.mono-sm}"
  hero-title:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display}"
  top-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "56px"
    padding: "0 24px"
---

# TARE Design System

Skills invoked : frontend-design, design-taste-frontend, high-end-visual-design, redesign-existing-projects, image-to-code (SKILL.md lu et appliqué : l'outil Skill ne le résout pas dans cette session)
Brand DESIGN.md read : linear.app.md, vercel.md
Dials (taste-skill) : variance 6, motion 4, density 7
Ambition : marqué
Locks (the user's words, never rediscussed) : "une map en node/flux […] la première chose que l'on voit sur la page, l'orchestrateur et tous les tools qu'il utilise", "à la fois la preuve et l'usage", "évite les canevas pointillés, trop AI", "évite globalement les rendus type AI. Choix des couleurs, coins arrondis etc.", "l'instrument est en français", "A, avec l'horloge de B : le schéma d'appareil en hero", "une véritable identité SaaS type Awwwards, très soignée", "reprendre l'ensemble du front entièrement, juste il faut garder la composition globale", "Va pour la A", "ma statistique, 96,74, apparaissent directement dans le hero", "pouvoir coller un jeton pour compute une adresse", "trois interaction soit evidente : scroll down, cliquer sur un node", "le graph manque un peu de clarte et de dynamisme" (réf. Dribbble SEDA Kit), "une police plus affirme genre archivo pour les titres", "un fond complexe et anime pour ma hero", "la map, la stat, et le compute doivent etre visible tous les 3 dans le hero", "tu peux reduire le contenu de la stat et du compute, mais pas le schema", "je n'aime pas trop l'animation propose, trop AI generated dans le style", "mes trois elements en entier dans mon hero", "supprime la section compute apres le scroll. Ma barre compute la remplace", "permet de mettre une adresse demo directement dans le hero", "reprends l'animation du background, genre totalement de style, adopte une autre ref", "dans le header, rajoute un acces direct aux pages outils", "rajoute une section pourquoi avoir cree TARE", "supprime l'animation derriere le Hero", "rajoute un scroll smooth", "rajoute des transitions fluides d'apparitions des components et entre les pages"

## Overview

**Memorable** : le premier écran porte ensemble les trois choses qui comptent — ce qu'un hook a pris, un champ pour le demander sur son propre jeton, et le système entier en un schéma dont chaque nœud s'ouvre.

TARE appartient au monde des instruments de mesure et des schémas d'atelier : une plaque sombre, des pistes tirées à angle droit, des chiffres qui portent leur unité et leur bloc. On arrive sur un produit fini, pas sur un terminal : la voix est Instrument Sans, calme et large, et la mono n'apparaît que là où une valeur est une valeur. Ce site n'est ni un tableau de bord ni une page de lancement : c'est la carte d'un système, et la carte se lit avant de se lire. De **linear.app.md** je prends l'échelle de quatre surfaces sans ombre (`{colors.canvas}` → `{colors.surface-1}` → `{colors.surface-2}` → `{colors.surface-3}`) qui construit toute la profondeur, le liseré clair sur le bord haut d'un panneau qui le fait « rendu », et le display à 600 jamais au-delà. De **vercel.md** la règle de partage : la sans porte tout ce qui est récit, la mono seulement la couche technique, et le chiffre display du hero est le seul endroit où la mono devient grande.

**Key Characteristics:**
- Quatre surfaces et deux filets : la page, l'enceinte de la carte un cran plus claire, la plaque, la plaque survolée. La profondeur est une valeur, jamais une ombre.
- Un seul accent, l'orange action `{colors.primary}`, sur trois choses : les nœuds de la famille action, le bouton primaire, l'onglet actif. Le bleu collecte et le jaune analyse sont des couleurs de catégorie, jamais de décoration.
- Display **Archivo** 700 à -0.035em pour les titres, Instrument Sans pour la prose, JetBrains Mono pour les données. Trois voix, trois fonctions.
- Matière plate : filet 1 px, liseré haut 1 px sur chaque plaque, rayon 0 partout. Aucun dégradé, aucune ombre, aucun flou, **aucun fond animé** : le hero est posé sur le canvas nu.
- Motion calm : les sections s'ouvrent en entrant dans l'écran, le changement de route se repose, le câblage de la carte se trace une fois au chargement, le flux descend le long des pistes. Les nombres ne bougent jamais.
- Jamais : capitales espacées en titre, chaînes de métadonnées en points médians, flèches collées aux liens, kit de cartes identiques, mono comme voix par défaut.

## Colors

`{colors.canvas}` est la page et le fond des tableaux. `{colors.surface-1}` est l'enceinte de la carte, le fond de la figure appariée et des champs. `{colors.surface-2}` est la plaque d'un nœud, `{colors.surface-3}` la plaque survolée et le fond d'une étiquette. `{colors.highlight}` sert à une seule chose : le liseré haut de 1 px d'une plaque, qui la fait usinée. Filets : `{colors.border}` au repos, `{colors.border-strong}` pour l'orchestrateur, les champs et les séparations de zones.

Encre : `{colors.ink}` sur canvas 16,5:1, sur surface-2 13,9:1. `{colors.ink-muted}` 8,4:1 pour tout texte secondaire. `{colors.ink-subtle}` 4,0:1 : jamais de texte sous 18 px, seulement des filets, les glyphes désactivés, le filet des états grisés (`rule-subtle`) et la série de référence (`{colors.baseline}`).

| famille | token | ce que la couleur dit |
|---|---|---|
| collecte | `{colors.accent-2}` | il va chercher une donnée |
| analyse | `{colors.accent-3}` | il interprète |
| action | `{colors.primary}` | il change quelque chose, et touche à l'argent |

Le jaune analyse est désaturé (`#dfc24d` au lieu du `#f6d746` actuel) pour tenir à côté du bleu et de l'orange sans crier ; il n'est pas la rampe. La rampe `--m-0` à `--m-6` de la charte encode les bps et rien d'autre ; elle n'est pas touchée. La couleur n'encode jamais l'état d'un outil ni la qualité d'une mesure : `NON_MESURABLE` est écrit, pas rouge. Thème clair : les tokens existants (`#f7f7f5`, `#14171a`, familles `#1b4fc4` / `#9a7b00` / `#c2410c`) restent, avec la même échelle de surfaces inversée.

## Typography

Trois familles auto-hébergées (`@fontsource-variable/archivo`, `@fontsource-variable/instrument-sans`, `@fontsource-variable/jetbrains-mono`), toutes dans le paquet. **Archivo** est la voix des titres — une grotesque plus large et plus affirmée qu'Instrument Sans, qui donne au titre de route la présence que la charte demande : `{typography.display}` pour le titre de route (700, -0.035em), `{typography.headline}` pour un titre de section (700), `{typography.title}` pour le nom d'un outil sur sa plaque (600). Instrument Sans reste la voix de la prose : `{typography.body}` à 65 ch au plus, les libellés, la navigation. JetBrains Mono est la donnée : `{typography.mono}` pour toute valeur, adresse, commande et champ, `{typography.mono-sm}` pour la ligne de métadonnée d'une plaque et les en-têtes de table, `{typography.number}` pour l'écart en bps, une fois par écran. Échelle : 11 / 13 / 16 / 20 / 32 / 64 / 112 px, rapport 10:1 dans le pli du hero ; `{typography.display}` descend à 2,75 rem et `{typography.number}` à 3,5 rem sous 768 px (clamp dans le code). Graisses 400, 500, 600 ; jamais 700. Chiffres tabulaires partout, zéro barré sur l'hexadécimal. Les capitales ne servent qu'aux valeurs qui s'écrivent ainsi (`MESURE`, `PRÊT`, `ABSENT`).

## Layout

Shell : barre haute de 56 px sur `{colors.canvas}`, filet bas `{colors.border}`, le nom TARE en `{typography.title}` à gauche, puis le dépliant **menu-outils** et les deux routes, la provenance et le thème à droite en `{typography.body}`. Grille 12 colonnes, gouttière 24 px, largeur maximale 1360 px, marges 24 px (16 px sous 768). Rythme vertical par 8, sections séparées par `{spacing.section}` et un filet pleine largeur. Tout est aligné à gauche.

**Écran 1, `#/`, la carte puis l'opération.** Hero nommé **editorial-schema**, sur la bande du corpus (rubrique Elevation).

**Le premier écran porte les trois, et c'est un verrou** : le schéma entier, l'écart mesuré, et le champ où l'on colle une adresse. Le schéma ne se réduit pas ; ce sont la mesure et le champ qui se compactent autour de lui. Disposition à 1440 : en haut à gauche sur 7 colonnes, le titre en `{typography.display}` sur deux lignes puis le champ (`field` + `button-primary` « voir ce qu'elle coûte ») ; en haut à droite sur 5 colonnes, séparé par un filet vertical, l'écart en `{typography.number}` suivi d'une seule phrase qui donne les deux cotations ; sous eux, pleine largeur, l'**enclosure** avec la légende des trois familles, le rail des 27 jeux, la plaque orchestrateur et les quatorze plaques câblées. En bas, le **scroll-cue**.

**La barre du hero calcule et répond sur place.** Il n'y a plus de section d'opération sous la carte : garder les deux aurait fait deux champs pour une seule question. On colle une adresse — ou on clique l'un des trois jetons du corpus proposés sous le champ, ceux qui ont plusieurs portes — et le bloc de droite, qui portait l'écart de référence, porte la réponse : l'écart entre les portes du jeton, de la moins chère à la plus chère. Trois états, à la même place : **référence** (l'écart de la porte A4, au repos), **succès** (l'écart du jeton, en `{typography.number}`), **refus motivé** (« il n'y a qu'une porte », son état et sa raison en toutes lettres — c'est la réponse dans 97,2 % des cas, pas un trou). Le bouton devient « recommencer » dès qu'une adresse est saisie. Le détail par porte reste sur les pages des outils 3 et 6.

Sous le premier écran, trois sections : **pourquoi TARE existe** — quatre points numérotés, en séquence parce qu'aucun ne se comprend sans le précédent : le registre ne peut pas dire combien, presque personne ne le déclare, comparer est impossible par construction, alors on change le hook et pas le pool ; tous ses chiffres viennent de `provenance` et de `totals`, aucun n'est écrit à la main. Puis les cinq accès en liste à filets, puis la matrice 27 × 14 en grille `gap: 1px`.

**Les trois interactions, et comment chacune se voit sans lire.** Coller : le champ est dans le premier écran, avec le seul bouton orange de la page, et son aide s'écrit sous lui. Cliquer un nœud : chaque plaque porte un port coloré sur son bord gauche et, au survol, un chevron `›` apparaît à droite de son nom pendant que son chemin s'allume ; l'en-tête de l'enceinte le dit en toutes lettres. Descendre : le scroll-cue sous la carte, animé, cliquable, qui nomme ce qui vient.

**Le premier écran est mesuré, pas espéré.** À 1440 × 900 l'enceinte se ferme à 740 px et le repère de défilement à 800 px : les trois éléments sont entiers, y compris sur un portable dont la fenêtre utile descend à 800 px. C'est ce qui fixe l'échelle de tout le reste — plaques de 44 px, rail tronqué à six entrées avec son reste affiché, en-tête d'enceinte sur une ligne.

```
Ce qu’un hook prend              |  96,74
vraiment sur un swap.            |  bps pris sur un swap réellement exécuté
[ 0x…                ] [ voir ]  |  il en reste 99,03 au lieu de 100,00
────────────────── la bande du corpus, relue en continu ──────────────────
┌ enclosure ───────────────────────────────────────────────────────┐
│ La chaîne et ses 14 outils   ■ collecte  ■ analyse  ■ action     │
│ 27 jeux   ┌ LA CHAÎNE ┐─┬─▌1 Mesurer  ▌2 Consulter ▌7 Substituer │
│ corpus    │ 6/6 · 13 680 ├─▌8 Intercep ▌3 Situer   ▌9 Approuver  │
│ …         └ ▁▂▃▅ ────┘ └─▌10 Payer    ▌4 Comprendre…             │
└──────────────────────────────────────────────────────────────────┘
│ plus bas : l’opération sur ton jeton, les accès, les données
```

À 768 : une colonne, le titre puis le champ puis la mesure, la carte garde ses trois colonnes de famille sous l'orchestrateur. À 390 : le titre en trois lignes, le champ et le bouton empilés, la mesure en une ligne de chiffre plus une phrase, les plaques en deux colonnes sans métadonnée, le rail des jeux remplacé par un compteur cliquable.

**Écran 2, `#/outil/1` à `14`.** Bandeau d'onglets collant sous la barre (un par outil, repère de famille à gauche du numéro, l'actif souligné de 2 px dans sa couleur de famille, défilable au doigt). Au-dessus du pli : le nom en `{typography.display}` réduit d'un cran, la question de l'outil en `{typography.body}`, famille et état, et la sortie réelle ; pour l'outil 1 c'est la figure appariée en grand. Sous le pli : entrée, exécution, sortie, en trois blocs à `{typography.headline}` séparés par filets, sans boîte. L'échantillon de cinq lignes se déplie. Action primaire : copier la commande de rejeu (bouton secondaire) ; pour l'outil 7, le bouton primaire n'est actif que sur `PRÊT` et les neuf autres états sont listés avec leur raison.

**Écran 3, `#/instrument`.** Index des dix-sept panneaux collant à gauche (ordinal mono, titre sans, compte à droite), le tableau registre contre mesure d'abord, sur `{colors.canvas}` avec filets de ligne, en-tête mono collant ; sous 1100 px chaque ligne devient une plaque de paires libellé / valeur.

À 768 : le hero passe en une colonne (titre, horloge, légende), l'enceinte garde deux colonnes (orchestrateur au-dessus, outils dessous en trois colonnes de famille), les pistes deviennent verticales. À 390 : le titre en `{typography.display}` tient en trois lignes, les plaques passent en deux colonnes sans ligne de métadonnée, le rail des jeux devient un compteur cliquable, la figure appariée empile ses deux séries sur un axe commun avec le verdict au-dessus.

## Elevation & Depth

Trois niveaux, tous faits de valeur et de filet : le canvas, l'enceinte un cran plus clair avec un filet `{colors.border}`, la plaque deux crans plus claire avec un filet `{colors.border}` et un liseré haut `{colors.highlight}`. Aucune section ne porte de champ : la page entière est une seule feuille, découpée. Le survol monte d'un cran (`{colors.surface-3}`, filet `{colors.border-strong}`). Le liseré `plate-highlight` est le seul emploi de `{colors.highlight}` ; l'anneau de focus `focus-ring` le seul emploi de `{colors.focus}` hors les champs. Aucune ombre, aucun flou : la lumière vient du liseré haut, toujours la même source.

| section | base | field | texture | accents | why |
|---|---|---|---|---|---|
| barre haute | canvas | aucun | aucune | aucun | elle s'efface derrière la carte |
| hero | canvas | aucun | aucune | le nombre en encre, le bouton orange | trois fonds animés ont été essayés et refusés l'un après l'autre ; le quatrième choix est l'absence, et le premier écran y gagne — le titre, le champ et le schéma n'ont plus rien derrière eux |
| carte | surface-1 (enclosure) | aucun | aucune | barres de famille 3 px, orange sur les plaques action | l'enceinte est le seul geste de cadrage de la page |
| usage et preuve | canvas, figure sur surface-1 | aucun | aucune | verdict en encre, série de référence grise | la figure est une lecture de précision |
| accès | canvas | aucun | aucune | aucun | respiration |
| matrice 27 × 14 | canvas, grille gap 1 px sur border | aucun | aucune | cellules pleines en couleur de famille | la trame est la donnée |
| pages outil | canvas | aucun | aucune | famille sur l'onglet actif | une seule feuille |
| instrument | canvas | aucun | aucune | la rampe dans la colonne bps | la rampe porte déjà toute la couleur |

## Shapes

Rayon 0 sur tout, sans exception : c'est un lock et une mesure de la charte (6/6 des sites primés de référence). Filets 1 px, jamais plus, sauf la barre de famille de 3 px au bord gauche d'une plaque et le soulignement de 2 px d'un onglet actif. Une piste part et arrive sur un **port** : un carré plein de 7 px, de la couleur de la famille qu'il dessert, posé sur le bord de la plaque. Jamais une flèche pleine. Aucune icône : les états s'écrivent (`prêt`, `en attente`, `hors ligne`), la famille se voit à la barre et à la colonne.

## Components

**enclosure** : le cadre de la carte. `{colors.surface-1}`, filet `{colors.border}`, padding 24 px, une légende `{typography.mono-sm}` en `{colors.ink-muted}` en haut à gauche (« la chaîne et ses quatorze outils »). Un seul par page. Filet 1 px `{colors.border}`.

**plate** (le nœud) : `{colors.surface-2}`, filet `{colors.border}`, liseré haut `{colors.highlight}`, barre de famille 3 px à gauche (`family-collecte`, `family-analyse`, `family-action`). Anatomie : numéro en `{typography.mono-sm}` `{colors.ink-muted}`, nom en `{typography.title}`, une ligne de métadonnée en `{typography.mono-sm}`. Hauteur 56 px minimum, cible entière cliquable, `<a href="#/outil/n">`. États : repos ; survol `plate-hover` en 120 ms et ses pistes passent à `wire-active` pendant que les autres descendent à `{colors.border}` ; focus anneau 2 px `{colors.focus}` décalé de 2 px ; actif `translateY(1px)` ; en attente ou hors ligne : même plaque, la raison écrite dans la ligne de métadonnée, jamais un simple grisé.

**plate-orchestrator** : deux plaques de large, filet `{colors.border-strong}`, le nom « La chaîne » en `{typography.headline}`, `6/6 étapes en 13 680 ms` en `{typography.mono}`, six graduations hautes comme la durée de leur étape en `{colors.ink-muted}`.

**wire** : SVG, polylignes orthogonales 1 px. **Chaque piste porte la couleur de la famille qu'elle dessert** — c'est ce qui rend la carte lisible d'un coup d'œil : on suit le bleu, le jaune ou l'orange de l'orchestrateur jusqu'à son outil, au lieu de démêler quarante traits gris. Au repos la couleur est posée à 45 % sur le fond ; au survol d'une plaque, son chemin passe à pleine couleur et s'épaissit à 1,5 px pendant que les autres descendent à `wire-rest`. Un **flux** parcourt les pistes en continu : un tiret court de la couleur de la famille qui descend de l'orchestrateur vers les outils, 4 s par cycle, décalé par famille — le dynamisme vient de là, et il s'arrête sous `prefers-reduced-motion`. Les pistes du rail des données restent en tirets 4/4 gris : une alimentation n'est pas un flux d'outil.

**port** : un carré plein de 7 px à la couleur de la famille, à cheval sur le bord gauche d'une plaque et sur les bords de l'orchestrateur. Il dit où le câble se branche, et c'est le signe qu'une plaque est un nœud connecté, pas une case. Au survol, il passe à `{colors.ink}`.

**scroll-cue** : en bas du premier écran, un trait vertical de 24 px en `{colors.border-strong}` dans lequel un segment de 8 px descend en boucle (1,8 s), suivi du nom des sections qui viennent en `{typography.mono-sm}`. C'est un `<button>` : il défile jusqu'à la carte. Sous `prefers-reduced-motion`, le segment reste en haut du trait.

**menu-outils** : dans la barre haute, un dépliant « les outils » qui donne les quatorze, groupés par famille et dans leur couleur, depuis n'importe quelle route. On n'y arrivait que par la carte : depuis une page d'outil ou depuis l'instrument, il fallait remonter à l'accueil pour en ouvrir un autre. Panneau sur `{colors.surface-2}`, filet `{colors.border-strong}`, liseré haut, trois colonnes à partir de 640 px et une seule en dessous où il s'ancre aux bords de l'écran. Il se ferme au clic dehors, à l'échappement, et dès qu'on choisit.

**Ce que le hero n'a pas.** Trois fonds animés ont été construits puis refusés : des pistes orthogonales qui poussaient (« trop AI generated dans le style »), un semis des mesures du corpus (juste, mais sans figure), une pile de crêtes façon ridgeline (une silhouette, mais de trop). Le quatrième choix est l'absence, et c'est une décision : le premier écran porte déjà trois objets denses — un titre, un champ qui calcule, un schéma de quatorze nœuds — et rien derrière eux ne les sert.

**figure-paired** : sur `{colors.surface-1}` à filet, deux cellules : à gauche les deux séries dans les mêmes axes (avec le hook en `{colors.ink}`, avec le talon en `{colors.baseline}`), axes en `{typography.mono-sm}`, légende en deux barres de nuancier 24 × 8 px (`series-without` pour la grise) ; à droite l'intervalle `[ 99.9942 → 102.4610 ]` en `{typography.mono}`, l'écart en `{typography.number}`, « bps, ce que le hook a pris » en `{typography.body}`, les deux montants en wei en `{typography.mono-sm}`. Aucun lissage. Refus motivé écrit à la place du verdict.

**button-primary** : `{colors.primary}` sur `{colors.on-primary}`, 40 px de haut, texte `{typography.body}` 500. Survol `button-primary-hover`, actif `translateY(1px)`, désactivé `button-disabled` (filet `{colors.border}`, texte `{colors.ink-muted}`, sans fond) et la raison écrite à côté. **button-secondary** : `{colors.surface-2}`, filet `{colors.border-strong}`, mêmes états. Un tertiaire est un lien souligné.

**field** : libellé `{typography.body}` au-dessus, 44 px, `{colors.surface-1}`, filet `{colors.border-strong}`, texte `{typography.mono}`, focus anneau `{colors.focus}`, aide et erreur écrites sous le champ.

**table** : pas de conteneur ; `table-header` collant et `table-cell`, lignes séparées par un filet `{colors.border}`, nombres à droite tabulaires, texte à gauche, survol de ligne `{colors.surface-1}`. Sous 1100 px, chaque ligne devient une plaque de paires libellé / valeur.

**tab / tab-active** : bandeau collant, `{typography.body}`, repère de famille (carré 8 px) avant le numéro, l'actif en `{colors.ink}` souligné de 2 px dans sa couleur de famille, `aria-selected`, flèches au clavier, défilable horizontalement avec le début et la fin visibles.

**value-badge** : la valeur brute en capitales (`MESURE`, `NON_COTABLE`), `{colors.surface-3}`, `{typography.mono-sm}` chassée à 0,1 em. **non-lu** : un tiret cadratin puis la raison en `{typography.mono-sm}` `{colors.ink-muted}`, obligatoire partout où une lecture a échoué.

## Motion

Preset **calm**, variance 6, motion 4, densité 7. **Défilement doux** — la direction l'avait refusé, l'utilisateur l'a demandé, et sa décision prime ; il saute sous `prefers-reduced-motion`. Pas de bibliothèque de motion : tout tient en CSS et en un `<canvas>` 2D, aucune dépendance ajoutée. Le moment orchestré, une fois au chargement de `#/` : les plaques sont présentes dès la première image, et les pistes se tracent depuis l'orchestrateur vers les outils par `stroke-dashoffset`, 600 ms, `cubic-bezier(0.32, 0.72, 0, 1)`, famille par famille (collecte, analyse, action). Aucun préchargeur. Un seul mouvement continu : le flux qui descend les pistes de la carte, 4 s par cycle. **Deux gestes d'apparition** : une section qui entre dans l'écran monte de 12 px et s'ouvre en 520 ms, une seule fois — jamais deux, un élément qui rejoue son apparition transforme un défilement en clignotement ; et le contenu d'une route qui change se repose en 260 ms, ce qui dit qu'on a changé de page sans qu'un titre saute. Les deux tiennent en un `IntersectionObserver` et deux animations CSS sur `transform` et `opacity`, sans dépendance. La carte du hero n'est pas sous un reveal : faire monter ce qu'on regarde déjà est un effet, pas une lecture. Ce qui répond : le survol d'une plaque allume son chemin et monte la plaque d'un cran en 120 ms ; le survol d'une étape de l'horloge trace son parcours ; un dépliant ouvre sa hauteur en 180 ms. Une animation par famille : collecte, la piste se remplit ; analyse, la série de référence se superpose à la série mesurée en 180 ms ; action, le bouton et son état changent ensemble en 90 ms. Ce qui ne bouge jamais : les nombres, la rampe. Sous `prefers-reduced-motion` : les pistes sont tracées d'emblée, les changements d'état sont instantanés, rien n'est retiré.

## Do's and Don'ts

**Do** : un seul geste de cadrage par page, l'enceinte, et tout le reste groupé par filet et espace. Instrument Sans pour tout ce qui se lit, JetBrains Mono pour tout ce qui se mesure. Écrire la raison de chaque refus, de chaque état inactif, de chaque lecture manquée.

**Don't** : pas de fond en dégradé, en mesh, en trame de points ni en pistes qui poussent — le fond du hero est fait des mesures du produit et il a une silhouette, ou il n'est pas. Pas de capitales espacées en titre ni en libellé, pas de chaîne de métadonnées en points médians, pas de flèche `→` collée à un lien, les trois tells de frontend-design auxquels cette direction est le plus exposée. Pas de dégradé, pas d'ombre, pas de coin arrondi, pas de canevas pointillé, pas de compteur animé, pas de préchargeur : les interdits de l'utilisateur. Pas de plaques emboîtées dans des plaques : l'enceinte contient des plaques, une plaque ne contient rien d'autre que son texte.

## Responsive Behavior

À 1440 : hero en 7 / 5 colonnes et enceinte pleine largeur **dans le même écran**, les quatorze plaques entières, le scroll-cue au bas du pli. À 768 : une colonne pour le hero, l'enceinte garde ses trois colonnes de famille sous l'orchestrateur, les pistes deviennent verticales, les onglets défilent. À 390 : le titre en trois lignes au plus, les plaques en deux colonnes sans métadonnée (douze entières dans le pli), le rail des jeux remplacé par un compteur cliquable, la figure appariée empilée avec le verdict au-dessus, le nombre display à 3,5 rem. Aucun défilement horizontal de la page ; seules les tables défilent dans leur conteneur. Cibles 44 px sur les plaques, 24 px au minimum ailleurs. Focus visible partout.

## Iteration Guide

1. One component at a time, referenced by its `components:` token name.
2. Before a new section, decide which surface level it lives on and whether it carries a field.
3. Body defaults to `{typography.body}`; the accent stays scarce.
4. After edits: `npx @google/design.md lint design/DESIGN.md`, then the shots at 1440 and 390, then reduced motion.
5. Every change the user asks for is written here first, then in the code.

## Known Gaps

Le jaune analyse désaturé (`{colors.accent-3}`) et ses valeurs en thème clair sont à confirmer avec l'équipier, qui tient la charte ; la rampe n'est pas touchée. La landing anglaise (`apps/landing`) n'est pas couverte par ce document. Le contenu de l'horloge (six étapes) vient de `chaine-complete.json` : si l'artefact change, la plaque orchestrateur suit. La pile de crêtes est peinte en canvas 2D sans dépendance ; si le site gagne une bibliothèque de motion plus tard, elle n'a pas à être réécrite pour autant.
