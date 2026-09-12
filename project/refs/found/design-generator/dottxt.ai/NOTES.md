# dottxt.ai — .TXT, Nominee Awwwards du 24 août 2026

Captures : `01-hero.png`, `02-echelle-typo.png`, `03-trame-1bit.png`.

- **Palette** : deux valeurs seulement, #f2f2f0 et noir, plus quatre accents en carré plein
  de 16 px dans la barre de navigation (jaune P, bleu D, vert B, rose A) qui servent de
  **raccourci clavier**, pas de décoration. Une bande noire pleine pour inverser une section.
- **Texture** : une **trame 1 bit** (dithering noir/blanc) en carré encadré, et un portrait
  tramé en négatif sur le fond noir. La texture remplace le dégradé.
- **Typographie** : une bitmap pixellisée pour le h1 (~130 px de haut de casse, capitales),
  du monospace 12 px pour tout le reste — eyebrow, nav, terminal, micro-cartes. Le rapport
  d'échelle mesuré dans la page est de l'ordre de 20:1.
- **Composition** : border-radius 0 strict, cadres 1 px noirs, une colonne de micro-cartes
  ancrée à droite (trame / tooltip fermable / lien `↗`), un terminal ancré en bas à gauche.
  La page est un plan de travail, pas un empilement de sections.
- **Ce qu'elle refuse** : l'illustration de la promesse. Il n'y a aucune image de produit.

## Ce qu'on en prend pour TARE
1. **L'objet héros est la commande réelle et sa sortie réelle** : la fenêtre montre
   `$ dottxt generate --model … --schema '{"valid": "boolean"}'` puis `{"valid": true}`.
   Chez TARE le héros porte les deux cotations et l'écart, avec la commande de rejeu.
2. **L'eyebrow numéroté** : `01 BY THE TEAM BEHIND OUTLINES (65M+ DOWNLOADS)`, le numéro dans
   un carré gris, l'affirmation chiffrée. Réutilisable tel quel pour numéroter les
   dix-sept panneaux de `#/instrument` — voir aussi `04 PRODUCTS` / `04.1` en pagination.
3. **Le rapport d'échelle extrême** dans un seul écran, et le rayon zéro partout.
4. **La trame 1 bit comme texture** : une façon de remplir une surface sans dégradé,
   qui reste honnête (c'est des pixels, pas une lumière).

## Ce qu'on n'en prend pas
La bannière de cookies. La police bitmap pour le h1 — TARE a Instrument Sans et JetBrains Mono,
la charte est décidée. Les carrés de couleur en raccourci clavier : chez TARE les carrés de
couleur sont déjà pris par les trois familles, on ne peut pas leur donner un second sens.
