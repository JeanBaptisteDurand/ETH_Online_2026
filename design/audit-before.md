# Audit de l'existant — `apps/web`, branche `design/tare`, 2026-09-12

Protocole : Design Audit du skill `redesign-existing-projects`, sur `design/shots/before/`
(4 routes × 390 / 768 / 1440) et le code (`src/index.css`, `components/`). Ce que la DA doit
résoudre, pas ce qu'elle doit refaire : la composition est un lock.

## Typographie
- La page entière est en JetBrains Mono 13 px, prose comprise : le `body` est en `--mono`, et `.prose` (Instrument Sans 16 px) est l'exception. Le résultat se lit comme un terminal, pas comme un produit. La hiérarchie repose sur deux tailles (13 et 20/28 px) et un seul titre à 56 px.
- Le titre de la carte « La chaîne et ses 14 outils » est le seul moment typographique du premier écran ; les quatorze nœuds, la légende et le rail parlent tous à 13 / 11 px. Rapport d'échelle réel dans le pli : 56 : 11 ≈ 5 : 1, loin des 17 : 1 mesurés par la charte de l'équipier.
- Les paires libellé / valeur des pages outil (`out_with`, `etat`, `routes`…) ont la même taille et le même gris : rien ne distingue le nom de la chose.
- `.t-valeur` en capitales chassées 0,1 em est justifié (la capitale est la donnée). `.t-label` a été corrigé. Pas d'orphelins visibles.

## Couleur et surfaces
- Une seule matière : fond `#08090a` et filets `#24272b`. Aucune enceinte, aucun palier de fond entre la barre, la carte, la section usage. La page est plate, elle a l'air inachevée plutôt que retenue.
- Les nœuds de la carte sont des rectangles `--bg-2` à filet, tous identiques, avec une barre de famille de 3 px : c'est exactement la « boîte à filet » générique. L'orchestrateur est une boîte plus grande de la même famille.
- Le jaune analyse `#f6d746` à 100 % de saturation crie à côté du bleu et de l'orange ; sur la table de l'instrument, le fond olive des cellules « bps » (rampe mélangée à 22 %) est boueux.
- Deux gris : `--ink-3` `#6b7178` sert encore de texte courant 11 px dans le rail (« et 18 autres, plus bas »), sous 4,5 : 1.

## Layout
- La carte occupe le pli à 1440, mais avec un vide de 600 × 250 px en bas à gauche (sous l'orchestrateur) et un vide de 300 × 350 px sous la colonne bleue. Le rail des 27 jeux est une liste, pas un élément de la carte.
- Les pistes (1 px `--line-strong`) sont à peine visibles : le câblage, qui est l'idée, ne se lit pas. À 768 elles sont un enchevêtrement de coudes sans hiérarchie.
- La barre haute (44 px) et la barre d'onglets des pages outil (44 px) sont collées au bord, sans identité : nom en mono 13 px, deux boutons mono en haut à droite.
- La figure appariée du pli (`96,74`) est un chiffre display Instrument Sans posé à côté de deux barres et d'un paragraphe : c'est le « gros chiffre + petit libellé » que frontend-design nomme comme défaut, et la figure de SSTR (les deux séries dans les mêmes axes) n'y est pas.
- Symétrie parfaite des paddings de section (32 / 32) ; les sections se distinguent par un filet pleine largeur seulement.

## États
- Survol des nœuds : filet vers la couleur de famille, fond `--bg-3`, 90 ms. Actif : `translateY(1px)`. Focus : anneau 2 px `--focus`. Correct, mais uniforme : la page n'a pas un seul geste mémorable.
- Le refus motivé existe et a une forme commune (bandeau « ? l'assistant pilote le tableau » en bas à droite de l'instrument : mono, boîte à filet).
- Aucun état de chargement (tout est local) : correct.

## Contenu
- Le français est tenu, les nombres viennent des faits, les commandes sont en casse réelle. La glose de la légende (« va chercher une donnée / interprète / change quelque chose ») est bonne.
- Chaînes de métadonnées en points médians : encore présentes dans les cellules de l'instrument (« min -100.00 · 14020 obs · bloc 50 614 000 · 1e12 · c1→c0 »), avec la flèche `→` collée.

## Patterns et composants
- Boutons : rectangle à filet, texte mono 11 px, tous identiques (« provenance », « clair », « la carte », « l'instrument »). Aucun primaire, aucun secondaire.
- Onglets des pages outil : 14 onglets mono, soulignés de 2 px, débordent à 1440 (le 11 est coupé). Pas de repère de famille avant le survol.
- Les jetons du corpus (« 0xb200…4199 / 78.67 bps entre ses portes ») sont cinq boîtes à filet identiques en rang : le kit de cartes.
- Table de l'instrument : sept colonnes à trois lignes par cellule, coupée en silence à 1440 et à 390 (la 390 la met en paires libellé / valeur, lisible mais très longue).

## Icônes
- Aucune icône. C'est un choix tenable pour un instrument, mais les états (« en attente », « hors ligne ») et les familles n'ont aucun signe autre que la barre de 3 px et le texte.

## Qualité du code
- Tokens propres dans `index.css`, deux thèmes, `--fam-*` séparés de la rampe, `border-radius: 0 !important` global. Trois durées et un seul easing `--e-enter`. Bonne base : la DA change les valeurs et les emplois, pas la structure.
- Tailwind v4 via le plugin Vite ; composants React 19 sans dépendance de motion. Aucun style inline de couleur relevé.

## Omissions stratégiques
- Pas de lien « retour à la carte » visible dans les pages outil au-dessus du pli (la barre d'onglets fait office).
- Pas de skip-link. Pas de 404 (routeur par fragment : une route inconnue tombe sur l'accueil, à vérifier).

## Fix Priority (ce que la DA doit résoudre, dans l'ordre d'impact)
1. **Emploi des polices** : Instrument Sans devient la voix du produit (titres, prose, libellés, navigation) ; JetBrains Mono reste la voix des données, et seulement d'elles. Les polices ne changent pas, leur partage change.
2. **Matière et profondeur sans ombre** : trois paliers de fond réellement distincts (page, enceinte, surface) et deux filets ; l'enceinte emboîtée pour la carte et la figure ; le jaune analyse désaturé dans une plage qui tient à côté du bleu et de l'orange.
3. **Le câblage visible** : pistes plus claires, une hiérarchie (le flux de la chaîne en fort, l'alimentation en faible), le vide de la carte comblé par le rail des données intégré à la carte.
4. **Une échelle typographique de site primé** : un display par écran, des titres de section à 32–40 px, des libellés sans capitales, un rapport d'au moins 12 : 1 dans le pli.
5. **La barre haute et les onglets** : une identité (marque, routes, thème) et des onglets qui tiennent à 1440 avec leur repère de famille.
6. **La figure appariée** façon SSTR : deux séries dans les mêmes axes, la légende en barres de nuancier, le verdict à côté.
7. **Les gestes** : un seul moment orchestré (le câblage se trace), un survol qui allume le chemin, rien d'autre.
