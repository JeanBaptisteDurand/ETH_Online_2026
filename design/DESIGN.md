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
    fontFamily: "Instrument Sans Variable"
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
    fontFamily: "Instrument Sans Variable"
    fontSize: "2rem"
    fontWeight: 600
    letterSpacing: "-0.02em"
    lineHeight: 1.15
  title:
    fontFamily: "Instrument Sans Variable"
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
Locks (the user's words, never rediscussed) : "une map en node/flux […] la première chose que l'on voit sur la page, l'orchestrateur et tous les tools qu'il utilise", "à la fois la preuve et l'usage", "évite les canevas pointillés, trop AI", "évite globalement les rendus type AI. Choix des couleurs, coins arrondis etc.", "l'instrument est en français", "A, avec l'horloge de B : le schéma d'appareil en hero", "une véritable identité SaaS type Awwwards, très soignée", "reprendre l'ensemble du front entièrement, juste il faut garder la composition globale", "Va pour la A"

## Overview

**Memorable** : on survole un outil et son chemin s'allume à travers toute la carte, du jeu de données à l'orchestrateur, en encre sur une plaque usinée.

TARE appartient au monde des instruments de mesure et des schémas d'atelier : une plaque sombre, des pistes tirées à angle droit, des chiffres qui portent leur unité et leur bloc. On arrive sur un produit fini, pas sur un terminal : la voix est Instrument Sans, calme et large, et la mono n'apparaît que là où une valeur est une valeur. Ce site n'est ni un tableau de bord ni une page de lancement : c'est la carte d'un système, et la carte se lit avant de se lire. De **linear.app.md** je prends l'échelle de quatre surfaces sans ombre (`{colors.canvas}` → `{colors.surface-1}` → `{colors.surface-2}` → `{colors.surface-3}`) qui construit toute la profondeur, le liseré clair sur le bord haut d'un panneau qui le fait « rendu », et le display à 600 jamais au-delà. De **vercel.md** la règle de partage : la sans porte tout ce qui est récit, la mono seulement la couche technique, et le chiffre display du hero est le seul endroit où la mono devient grande.

**Key Characteristics:**
- Quatre surfaces et deux filets : la page, l'enceinte de la carte un cran plus claire, la plaque, la plaque survolée. La profondeur est une valeur, jamais une ombre.
- Un seul accent, l'orange action `{colors.primary}`, sur trois choses : les nœuds de la famille action, le bouton primaire, l'onglet actif. Le bleu collecte et le jaune analyse sont des couleurs de catégorie, jamais de décoration.
- Display Instrument Sans 600 à -0.03em, un titre par route ; le nombre display en JetBrains Mono 500, un par écran, pour l'écart en bps.
- Matière plate : filet 1 px, liseré haut 1 px sur chaque plaque, rayon 0 partout. Aucun dégradé, aucune ombre, aucun flou, aucune trame.
- Motion calm : le câblage se trace une fois au chargement, puis tout répond au survol. Les nombres ne bougent jamais.
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

Deux familles auto-hébergées (`@fontsource-variable/instrument-sans`, `@fontsource-variable/jetbrains-mono`), déjà dans le paquet. Instrument Sans est la voix : `{typography.display}` pour le titre de route, `{typography.headline}` pour un titre de section, `{typography.title}` pour le nom d'un outil sur sa plaque, `{typography.body}` pour la prose à 65 ch au plus, les libellés et la navigation. JetBrains Mono est la donnée : `{typography.mono}` pour toute valeur, adresse, commande et champ, `{typography.mono-sm}` pour la ligne de métadonnée d'une plaque et les en-têtes de table, `{typography.number}` pour l'écart en bps, une fois par écran. Échelle : 11 / 13 / 16 / 20 / 32 / 64 / 112 px, rapport 10:1 dans le pli du hero ; `{typography.display}` descend à 2,75 rem et `{typography.number}` à 3,5 rem sous 768 px (clamp dans le code). Graisses 400, 500, 600 ; jamais 700. Chiffres tabulaires partout, zéro barré sur l'hexadécimal. Les capitales ne servent qu'aux valeurs qui s'écrivent ainsi (`MESURE`, `PRÊT`, `ABSENT`).

## Layout

Shell : barre haute de 56 px sur `{colors.canvas}`, filet bas `{colors.border}`, le nom TARE en `{typography.title}` à gauche, les deux routes et le thème à droite en `{typography.body}`, la provenance dans un dépliant. Grille 12 colonnes, gouttière 24 px, largeur maximale 1360 px, marges 24 px (16 px sous 768). Rythme vertical par 8, sections séparées par `{spacing.section}` et un filet pleine largeur. Tout est aligné à gauche.

**Écran 1, `#/`, la carte puis l'opération.** Hero nommé **editorial-schema** : sur 7 colonnes, le titre en `{typography.display}` « Ce qu'un hook prend vraiment sur un swap. » avec sous lui un `{typography.body}` de deux lignes en `{colors.ink-muted}` et la légende des trois familles ; à droite, sur 5 colonnes, l'horloge réelle de la chaîne. Sous eux, l'**enclosure** pleine largeur porte la carte : le rail des 27 jeux à gauche (une colonne de lignes mono, comptée), la plaque orchestrateur au centre gauche, les quatorze plaques en trois colonnes de famille à droite, câblées. Au-dessus du pli à 1440 : le titre, la légende, l'horloge, l'orchestrateur, les quatorze plaques. Sous le pli : la section usage et preuve (champ d'adresse, six jetons du corpus, puis la **figure-paired** : deux séries dans les mêmes axes, l'intervalle entre crochets, l'écart en `{typography.number}`), puis les cinq accès en liste à filets, puis la matrice 27 × 14 en grille `gap: 1px`. Action primaire : cliquer une plaque. États de la section usage : vide (les six jetons), refus motivé (« il n'y a qu'une porte », écrit dans la figure), succès.

```
TARE                          la carte   l'instrument   clair
Ce qu'un hook prend                      LA CHAÎNE  6/6 · 13 680 ms
vraiment sur un swap.                    ▁▂▃▅▂▇
■ collecte  ■ analyse  ■ action
┌ enclosure ──────────────────────────────────────────────────┐
│ 27 jeux      ┌──────────┐    ┌ 1 Mesurer ┐ ┌ 2 Consulter┐ ┌ 7 Substituer┐ │
│ measurements ┤ LA CHAÎNE ├─┬──┤ 3 jeux lus│ │ 6 jeux lus │ │ 3 jeux lus  │ │
│ one-way      └──────────┘ ├──┤ 8 Intercep│ │ 3 Situer   │ │ 9 Approuver │ │
│ +25          ─────────────┘  └───────────┘ └────────────┘ └─────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Écran 2, `#/outil/1` à `14`.** Bandeau d'onglets collant sous la barre (un par outil, repère de famille à gauche du numéro, l'actif souligné de 2 px dans sa couleur de famille, défilable au doigt). Au-dessus du pli : le nom en `{typography.display}` réduit d'un cran, la question de l'outil en `{typography.body}`, famille et état, et la sortie réelle ; pour l'outil 1 c'est la figure appariée en grand. Sous le pli : entrée, exécution, sortie, en trois blocs à `{typography.headline}` séparés par filets, sans boîte. L'échantillon de cinq lignes se déplie. Action primaire : copier la commande de rejeu (bouton secondaire) ; pour l'outil 7, le bouton primaire n'est actif que sur `PRÊT` et les neuf autres états sont listés avec leur raison.

**Écran 3, `#/instrument`.** Index des dix-sept panneaux collant à gauche (ordinal mono, titre sans, compte à droite), le tableau registre contre mesure d'abord, sur `{colors.canvas}` avec filets de ligne, en-tête mono collant ; sous 1100 px chaque ligne devient une plaque de paires libellé / valeur.

À 768 : le hero passe en une colonne (titre, horloge, légende), l'enceinte garde deux colonnes (orchestrateur au-dessus, outils dessous en trois colonnes de famille), les pistes deviennent verticales. À 390 : le titre en `{typography.display}` tient en trois lignes, les plaques passent en deux colonnes sans ligne de métadonnée, le rail des jeux devient un compteur cliquable, la figure appariée empile ses deux séries sur un axe commun avec le verdict au-dessus.

## Elevation & Depth

Trois niveaux, tous faits de valeur et de filet : le canvas, l'enceinte un cran plus clair avec un filet `{colors.border}`, la plaque deux crans plus claire avec un filet `{colors.border}` et un liseré haut `{colors.highlight}`. Le survol monte d'un cran (`{colors.surface-3}`, filet `{colors.border-strong}`). Le liseré `plate-highlight` est le seul emploi de `{colors.highlight}` ; l'anneau de focus `focus-ring` le seul emploi de `{colors.focus}` hors les champs. Aucune ombre, aucun flou : la lumière vient du liseré haut, toujours la même source.

| section | base | field | texture | accents | why |
|---|---|---|---|---|---|
| barre haute | canvas | aucun | aucune | aucun | elle s'efface derrière la carte |
| hero, titre et horloge | canvas | aucun | aucune | légende des familles | le titre ne se bat contre rien |
| carte | surface-1 (enclosure) | aucun | aucune | barres de famille 3 px, orange sur les plaques action | l'enceinte est le seul geste de cadrage de la page |
| usage et preuve | canvas, figure sur surface-1 | aucun | aucune | verdict en encre, série de référence grise | la figure est une lecture de précision |
| accès | canvas | aucun | aucune | aucun | respiration |
| matrice 27 × 14 | canvas, grille gap 1 px sur border | aucun | aucune | cellules pleines en couleur de famille | la trame est la donnée |
| pages outil | canvas | aucun | aucune | famille sur l'onglet actif | une seule feuille |
| instrument | canvas | aucun | aucune | la rampe dans la colonne bps | la rampe porte déjà toute la couleur |

## Shapes

Rayon 0 sur tout, sans exception : c'est un lock et une mesure de la charte (6/6 des sites primés de référence). Filets 1 px, jamais plus, sauf la barre de famille de 3 px au bord gauche d'une plaque et le soulignement de 2 px d'un onglet actif. Les extrémités d'une piste se terminent par un segment perpendiculaire de 6 px, jamais une flèche pleine. Aucune icône : les états s'écrivent (`prêt`, `en attente`, `hors ligne`), la famille se voit à la barre et à la colonne.

## Components

**enclosure** : le cadre de la carte. `{colors.surface-1}`, filet `{colors.border}`, padding 24 px, une légende `{typography.mono-sm}` en `{colors.ink-muted}` en haut à gauche (« la chaîne et ses quatorze outils »). Un seul par page. Filet 1 px `{colors.border}`.

**plate** (le nœud) : `{colors.surface-2}`, filet `{colors.border}`, liseré haut `{colors.highlight}`, barre de famille 3 px à gauche (`family-collecte`, `family-analyse`, `family-action`). Anatomie : numéro en `{typography.mono-sm}` `{colors.ink-muted}`, nom en `{typography.title}`, une ligne de métadonnée en `{typography.mono-sm}`. Hauteur 56 px minimum, cible entière cliquable, `<a href="#/outil/n">`. États : repos ; survol `plate-hover` en 120 ms et ses pistes passent à `wire-active` pendant que les autres descendent à `{colors.border}` ; focus anneau 2 px `{colors.focus}` décalé de 2 px ; actif `translateY(1px)` ; en attente ou hors ligne : même plaque, la raison écrite dans la ligne de métadonnée, jamais un simple grisé.

**plate-orchestrator** : deux plaques de large, filet `{colors.border-strong}`, le nom « La chaîne » en `{typography.headline}`, `6/6 étapes en 13 680 ms` en `{typography.mono}`, six graduations hautes comme la durée de leur étape en `{colors.ink-muted}`.

**wire** : SVG, polylignes orthogonales 1 px, `{colors.border-strong}` au repos (`wire-rest` `{colors.border}` pour les pistes éteintes pendant un survol), pleines d'outil à outil, tirets 4/4 d'un jeu de données vers un outil. Extrémité : segment perpendiculaire 6 px. Au survol d'une plaque, le chemin complet passe à `{colors.ink}`.

**figure-paired** : sur `{colors.surface-1}` à filet, deux cellules : à gauche les deux séries dans les mêmes axes (avec le hook en `{colors.ink}`, avec le talon en `{colors.baseline}`), axes en `{typography.mono-sm}`, légende en deux barres de nuancier 24 × 8 px (`series-without` pour la grise) ; à droite l'intervalle `[ 99.9942 → 102.4610 ]` en `{typography.mono}`, l'écart en `{typography.number}`, « bps, ce que le hook a pris » en `{typography.body}`, les deux montants en wei en `{typography.mono-sm}`. Aucun lissage. Refus motivé écrit à la place du verdict.

**button-primary** : `{colors.primary}` sur `{colors.on-primary}`, 40 px de haut, texte `{typography.body}` 500. Survol `button-primary-hover`, actif `translateY(1px)`, désactivé `button-disabled` (filet `{colors.border}`, texte `{colors.ink-muted}`, sans fond) et la raison écrite à côté. **button-secondary** : `{colors.surface-2}`, filet `{colors.border-strong}`, mêmes états. Un tertiaire est un lien souligné.

**field** : libellé `{typography.body}` au-dessus, 44 px, `{colors.surface-1}`, filet `{colors.border-strong}`, texte `{typography.mono}`, focus anneau `{colors.focus}`, aide et erreur écrites sous le champ.

**table** : pas de conteneur ; `table-header` collant et `table-cell`, lignes séparées par un filet `{colors.border}`, nombres à droite tabulaires, texte à gauche, survol de ligne `{colors.surface-1}`. Sous 1100 px, chaque ligne devient une plaque de paires libellé / valeur.

**tab / tab-active** : bandeau collant, `{typography.body}`, repère de famille (carré 8 px) avant le numéro, l'actif en `{colors.ink}` souligné de 2 px dans sa couleur de famille, `aria-selected`, flèches au clavier, défilable horizontalement avec le début et la fin visibles.

**value-badge** : la valeur brute en capitales (`MESURE`, `NON_COTABLE`), `{colors.surface-3}`, `{typography.mono-sm}` chassée à 0,1 em. **non-lu** : un tiret cadratin puis la raison en `{typography.mono-sm}` `{colors.ink-muted}`, obligatoire partout où une lecture a échoué.

## Motion

Preset **calm**, variance 6, motion 4, densité 7. Pas de smooth scroll. Le moment orchestré, une fois au chargement de `#/` : les plaques sont présentes dès la première image, et les pistes se tracent depuis l'orchestrateur vers les outils par `stroke-dashoffset`, 600 ms, `cubic-bezier(0.32, 0.72, 0, 1)`, famille par famille (collecte, analyse, action). Aucun préchargeur. Ce qui répond : le survol d'une plaque allume son chemin et monte la plaque d'un cran en 120 ms ; le survol d'une étape de l'horloge trace son parcours ; un dépliant ouvre sa hauteur en 180 ms. Une animation par famille : collecte, la piste se remplit ; analyse, la série de référence se superpose à la série mesurée en 180 ms ; action, le bouton et son état changent ensemble en 90 ms. Ce qui ne bouge jamais : les nombres, la rampe. Sous `prefers-reduced-motion` : les pistes sont tracées d'emblée, les changements d'état sont instantanés, rien n'est retiré.

## Do's and Don'ts

**Do** : un seul geste de cadrage par page, l'enceinte, et tout le reste groupé par filet et espace. Instrument Sans pour tout ce qui se lit, JetBrains Mono pour tout ce qui se mesure. Écrire la raison de chaque refus, de chaque état inactif, de chaque lecture manquée.

**Don't** : pas de capitales espacées en titre ni en libellé, pas de chaîne de métadonnées en points médians, pas de flèche `→` collée à un lien, les trois tells de frontend-design auxquels cette direction est le plus exposée. Pas de dégradé, pas d'ombre, pas de coin arrondi, pas de canevas pointillé, pas de compteur animé, pas de préchargeur : les interdits de l'utilisateur. Pas de plaques emboîtées dans des plaques : l'enceinte contient des plaques, une plaque ne contient rien d'autre que son texte.

## Responsive Behavior

À 1440 : hero en 7 / 5 colonnes, enceinte pleine largeur avec les quatorze plaques entières dans le pli. À 768 : une colonne pour le hero, l'enceinte garde ses trois colonnes de famille sous l'orchestrateur, les pistes deviennent verticales, les onglets défilent. À 390 : le titre en trois lignes au plus, les plaques en deux colonnes sans métadonnée (douze entières dans le pli), le rail des jeux remplacé par un compteur cliquable, la figure appariée empilée avec le verdict au-dessus, le nombre display à 3,5 rem. Aucun défilement horizontal de la page ; seules les tables défilent dans leur conteneur. Cibles 44 px sur les plaques, 24 px au minimum ailleurs. Focus visible partout.

## Iteration Guide

1. One component at a time, referenced by its `components:` token name.
2. Before a new section, decide which surface level it lives on and whether it carries a field.
3. Body defaults to `{typography.body}`; the accent stays scarce.
4. After edits: `npx @google/design.md lint design/DESIGN.md`, then the shots at 1440 and 390, then reduced motion.
5. Every change the user asks for is written here first, then in the code.

## Known Gaps

Le jaune analyse désaturé (`{colors.accent-3}`) et ses valeurs en thème clair sont à confirmer avec l'équipier, qui tient la charte ; la rampe n'est pas touchée. La landing anglaise (`apps/landing`) n'est pas couverte par ce document. Le contenu de l'horloge (six étapes) vient de `chaine-complete.json` : si l'artefact change, la plaque orchestrateur suit.
