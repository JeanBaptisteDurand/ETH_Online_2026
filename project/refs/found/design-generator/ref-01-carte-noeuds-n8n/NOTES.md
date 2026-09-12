# ref-01 — carte de nœuds façon n8n (référence déposée par l'utilisateur)

Image : `project/refs/user/ref-01-carte-noeuds-n8n.png` (non dupliquée ici, `refs/user/` ne se touche pas).
Aucune recherche : la référence est une image, pas un nom.

## Ce qu'on regarde
Un graphe orienté de gauche à droite sur canevas anthracite. ~16 nœuds : carré ~64 px,
icône pleine couleur en haut, **titre dessous le nœud** et **une ligne de métadonnée grise**
sous le titre (`candidate_repo_count=3`, `getAll: row`, `create: row`, `Markdown to HTML`).
Arêtes : courbes de Bézier grises, pleines pour le flux de données, **pointillées** pour la
dépendance au modèle (les quatre traits qui remontent vers « Google Gemini Chat Model »).
Petits carrés `+` en bout de branche pour prolonger. Un éclair rouge marque l'entrée.

## Ce qui sert
- **L'anatomie du nœud** : titre + une seule ligne de métadonnée. C'est exactement
  « nom de l'outil + son état / son coût / ses jeux lus ». Rien de plus dans le nœud.
- **Deux qualités d'arête dans le même graphe** : trait plein = le flux, trait pointillé =
  la dépendance. TARE en a besoin : outil → outil (la chaîne) contre jeu de données → outil
  (l'alimentation). Une seule grammaire de trait ne suffira pas pour 14 outils + 27 données.
- **Le flux de gauche à droite avec des retours** : le long trait qui repart de la fin vers
  la deuxième rangée dit qu'un système boucle. La chaîne complète (6 étapes) peut se lire ainsi.
- **Le terminal marqué** : l'éclair dit où ça commence. TARE a besoin de dire où est
  l'orchestrateur sans légende.
- **Le `+` en bout de branche** : une affordance minuscule qui dit « il y a une suite ».
  Utile pour les nœuds tronqués à 400 px.

## Ce qui ne sert pas
- **Le canevas pointillé** — refusé explicitement (d001/d005 : « trop AI »).
- **Les pastilles d'icônes colorées** : ici la couleur est décorative et par éditeur
  (Gmail rouge, Google bleu, GitHub blanc). Chez TARE la couleur est une information
  (bleu = va chercher, jaune = interprète, orange = change). Une icône colorée par nœud
  détruirait la lecture des trois familles en vision périphérique.
- **Les coins arrondis des nœuds et le léger relief** : rayon zéro, filets 1 px.
- **Les courbes de Bézier molles** : à 41 nœuds elles feront un plat de spaghettis.
  Des orthogonales à angle droit tiennent la densité et vont avec le rayon zéro.
- **La densité sans hiérarchie** : tous les nœuds ont le même poids. TARE doit faire
  ressortir l'orchestrateur, puis les 14 outils, puis les 27 données.
