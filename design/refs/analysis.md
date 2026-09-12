# Analyse des images — protocole image-to-code (§8 analyse propre, §9 analyse profonde, §14–16 hero)

Note de méthode : l'outil Skill ne résout pas `image-to-code` dans cette session (installé par setup
après le démarrage, non enregistré). Son SKILL.md a été lu et son protocole appliqué ici, sur les
images fournies ; la génération d'images n'est pas disponible (aucun MCP branché).

## 1. `design/refs/ref-01-carte-noeuds-n8n.png` (déposée par l'utilisateur, 714 × 439)

- **Ce que c'est** : un workflow n8n, une rangée de sept nœuds en haut (trigger → transformations → README), puis un second niveau qui se ramifie vers trois sorties (mail, fichier, fichier EN) et un modèle Gemini en bas à gauche qui alimente trois nœuds en pointillé.
- **Priorité visuelle** : la topologie. On lit d'abord le flux gauche → droite, puis les embranchements, enfin les libellés.
- **Anatomie d'un nœud** : un carré à icône (≈ 44 px, gris `#3a3d42`, coin 6 px), un titre sous le nœud en 11 px, une ligne de métadonnée en 9 px gris (`getAll: row`, `create: file`). Titre et méta sont hors du nœud : le nœud est un objet, le texte est sa légende.
- **Arêtes** : courbes de Bézier 1,5 px gris clair, flèche pleine à l'arrivée ; les liens vers le modèle sont en tirets. Deux natures d'arête, deux traits.
- **Fond** : gris anthracite `#2d2f33` à trame de points (le canevas pointillé que d005 refuse).
- **Rythme** : colonnes régulières (≈ 95 px), lignes à 45 px d'écart ; un nœud « Github Repo Summarize » plus large fait office d'orchestrateur local.
- **Extractible pour TARE** : la lecture gauche → droite en niveaux, la légende hors du nœud (titre + une méta), les deux natures d'arête, le nœud plus large comme orchestrateur. Rejeté par les locks : le canevas pointillé, les courbes, les icônes en pastille colorée, le coin 6 px.

## 2. `project/refs/found/design-generator/sstr.tech/04-figure-mesure-deux-fois.png` (référence n° 1 de la charte)

- **Ce que c'est** : une cellule d'une grille de filets pleine largeur, avec à gauche un nuage de points (profondeur vs charge, série traitée en orange `#ff4a1c`, série de référence en gris clair) et à droite le verdict : intervalle entre crochets `[ 140 → 117 T ]` en mono 13 px, puis `-23T` à ≈ 96 px en sans, puis le nom de la grandeur en 20 px, puis un bouton.
- **Typographie** : trois tailles seulement dans la cellule (13 / 20 / 96) : rapport 7 : 1 dans la cellule, et la légende d'axe en mono capitale espacée gris.
- **Structure** : la grille de filets 1 px `#2a2a2a` est le seul dessin ; la cellule du graphe et la cellule du verdict sont deux cases de la même grille. Rayon 0 partout sauf le bouton (coins coupés en biseau, pas arrondis).
- **Légende** : deux barres de nuancier 24 × 8 px suivies du libellé mono (`WITH FRS` / `WITHOUT FRS`).
- **Extractible** : la paire graphe / verdict dans deux cellules d'une même grille, l'intervalle entre crochets au-dessus du nombre, les barres de nuancier. C'est la forme de la figure appariée de TARE.

## 3. `design/shots/before/home-1440.png` (l'existant)

- **Priorité visuelle** : le titre 56 px, puis les quatorze boîtes identiques, puis le chiffre 96,74. Trois focales qui se disputent : le hero n'a pas de point unique (§14).
- **Anatomie du nœud** : boîte `#17191c` à filet, barre de famille 3 px à gauche, numéro + nom en mono 13 px, méta en mono 11 px gris. Le texte est dans la boîte : le nœud est un bouton, pas un objet légendé.
- **Arêtes** : pistes orthogonales 1 px `#383c42`, presque invisibles ; coudes empilés en haut des colonnes (trois traits superposés à 2 px d'écart).
- **Espace** : vide de ≈ 600 × 250 px sous l'orchestrateur ; le rail des 27 jeux est une table à gauche, pas un élément câblé.
- **Ce qui manque pour le niveau Awwwards** : une matière (tout est plat), une seule focale, un câblage lisible, un titre qui porte et non un chiffre isolé.

## 4. `design/shots/directions.png` (la planche des trois directions, 2400 × 1120)

- Les trois colonnes partagent la palette verrouillée ; seules `enceinte` et `surface` varient (`#0e1013 / #161a1e`, `#08090a / #101214`, `#0b0c0e / #121417`) : la différence entre directions est une différence de matière et d'anatomie du nœud, pas de couleur. C'est voulu.
- A et B partagent Instrument Sans en display ; C met JetBrains Mono en display et le titre « TARE » y perd de la présence à 64 px (la mono à cette taille est plus large et plus froide). Si C est choisie, le display reste réservé au nombre, et le titre de page repasse en Instrument Sans.
- Les croquis lisent : A montre l'enceinte comme un cadre unique (un seul geste de cadrage, §16), B n'a aucun cadre, C est tout cadre. Le risque de C est le « broadsheet à filets » de la liste noire de frontend-design ; il ne tient que si la grille est le câblage et non une décoration.
- L'orange des titres de la planche est celui de la famille action : sur le site il ne sera jamais un titre, c'est un artefact de la planche.
