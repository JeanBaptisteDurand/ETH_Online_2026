# Revue du site entier — TARE, branche `da/plaque`, 2026-09-13

Site lancé sur `http://localhost:5173`, captures dans `design/shots/review/` : cinq routes à
390, 768 et 1440, pleine page à 1440, état défilé, mouvement réduit, console, débordement.

## Mesures

| contrôle | résultat |
|---|---|
| débordement horizontal à 390, cinq routes | `false` partout (`overflow.png`) |
| axe-core 4.10, cinq routes | **0 violation** (`axe.png`) |
| Lighthouse desktop, build de production | accessibilité **100**, bonnes pratiques **100**, SEO 91, performance 76 |
| LCP / CLS / TBT | **1,9 s** / **0** / 200 ms |
| poids total | 1 898 KiB (le corpus de 7,9 Mo est encodé par colonnes et compressé) |
| console, cinq routes | 10 erreurs, **toutes** `ERR_CONNECTION_REFUSED` vers l'API locale absente |
| suite de tests | 113 passent, 1 échoue pour une source de données manquante hors front |

## Redesign audit

**Typographie.** Trois voix, chacune avec une fonction : Archivo 700 pour les titres, Instrument
Sans pour la prose et la navigation, JetBrains Mono pour toute valeur. Graisses 400, 500, 600 et
700 en usage. Chiffres tabulaires partout, zéro barré sur l'hexadécimal. Aucune capitale chassée
hors des valeurs qui s'écrivent ainsi. `text-wrap: balance` sur les titres. Prose à 72 caractères
au plus, un peu au-dessus des 65 recommandés, ce qui tient parce que l'interligne est à 1,55.

**Couleur et surfaces.** Un seul accent chromatique, l'orange de la famille action, sur le bouton
primaire et les nœuds d'action. Le bleu et le jaune sont catégoriels, la rampe encode les points
de base. Quatre valeurs de fond et deux filets, aucune ombre, aucun dégradé, aucun flou, rayon
zéro. La lumière vient d'un seul endroit, le liseré haut des plaques.

**Layout.** Largeur maximale 1360, tout aligné à gauche, aucune section centrée. Les grilles sont
asymétriques et différentes à chaque section : 7/5 au hero, 220 px plus le reste pour les accès,
quatre colonnes pour le pourquoi, trois colonnes de famille pour la carte. Aucune rangée de trois
cartes égales. Le premier écran porte ses trois objets entiers, mesuré à 740 px pour l'enceinte.

**Interactivité et états.** Survol, focus visible, pression, désactivé avec sa raison écrite.
Le champ du hero a ses trois états, vide, erreur et valide. Le refus motivé occupe la place du
succès. La route active est marquée dans la barre et dans le bandeau d'onglets.

**Contenu.** Français partout, accents rétablis là où ils manquaient. Aucun chiffre écrit à la
main dans un composant : tout vient de `facts.json`, de `dataset` ou des tables typées, et un
test fait tomber la suite sinon. Pas de latin, pas de nom générique, pas de cliché.

**Patterns.** Plus aucune boîte de type carte : le groupement se fait par filet et par espace,
comme la densité 7 l'impose. Les cinq accès sont une liste de glossaire, pas cinq tuiles.

**Icônes.** Aucune, et c'est un choix : les états s'écrivent, la famille se lit à la couleur.

**Qualité du code.** Sémantique — `nav`, `main`, `section`, `ol`, `dl`, `details`. Tokens en
variables CSS, aucun hex dans un composant. Aucun `transition: all`, aucun `z-index` arbitraire,
aucun `div` cliquable, aucune image sans dimensions, aucun blocage du zoom.

**Omissions stratégiques.** Skip-link présent. Pas de page 404 dédiée : une route inconnue tombe
sur l'accueil, ce qui est tenable pour trois routes en fragment. Pas de pied de page sur
l'accueil, seul l'instrument en a un. Pas de mentions légales, le dépôt étant public et le site
sans collecte.

### Fix Priority — appliquée pendant cette revue

1. **Contraste.** `--ink-3` portait du texte de 11 à 14 px sur quatre routes, à 4,04:1. C'est ce que DESIGN.md interdisait explicitement, et le build l'avait violé : 62 éléments sur l'ensemble du site. Tous passés à `--ink-2`, 8,4:1. axe et Lighthouse sont à zéro.
2. **Le contenu ne doit pas dépendre de JavaScript.** Les apparitions de section partaient à `opacity: 0` : sur la capture pleine page, trois sections sur quatre étaient blanches, et il en aurait été de même à l'impression ou si l'observateur ne s'était pas déclenché. L'apparition se fait désormais **par le seul mouvement**, une montée de 22 px : dans le pire des cas un bloc est décalé et parfaitement lisible.
3. **La prose rendue en monospace.** Les pages outil affichaient des paragraphes entiers en JetBrains Mono par héritage. Passés en Instrument Sans ; la mono reste aux valeurs.
4. **Des chiffres faux sans JavaScript.** Le bloc `<noscript>` annonçait « 128 mesures, 4 hooks, 32 pools » et citait un fichier disparu, alors que le corpus en compte 125 072. Sur un produit dont la thèse est qu'un chiffre publié doit être vérifiable, c'était la faute la plus coûteuse. Les chiffres sont retirés, le texte renvoie au dépôt.
5. **Métadonnées de partage.** `og:title`, `og:description`, `og:type` et la carte Twitter ajoutés ; le titre de page perd son point médian.

## web-design-guidelines

Règles relues depuis `vercel-labs/web-interface-guidelines/command.md`, passées sur
`apps/web/src` en entier.

Violations trouvées et corrigées pendant cette revue :

- `apps/web/src/index.css:657` — invite de champ en `--ink-3`, sous le seuil de contraste. Gravité haute, corrigée.
- `apps/web/src/App.tsx`, `components/Index.tsx`, `components/Accueil.tsx`, `components/Outil.tsx`, `components/Exit.tsx`, `components/Machine.tsx`, `components/Route.tsx`, `chat/Chat.tsx` — 62 textes en `--ink-3`. Gravité haute, corrigées.
- `apps/web/index.html:28` — contenu `<noscript>` faux. Gravité haute, corrigée.
- `apps/web/index.html:12` — métadonnées sociales absentes. Gravité moyenne, corrigée.

Vérifié conforme sur tout le front, sans changement :

- Aucun `transition: all`, aucun `outline: none` sans remplacement (`:focus-visible` pose un anneau de 2 px décalé), aucun `div` ou `span` porteur de `onClick`, aucune image sans dimensions, aucun `user-scalable=no`, aucun blocage de collage, aucun `z-index` arbitraire.
- Huit champs de saisie pour vingt-quatre attributs `aria-label` ou `htmlFor` : tous étiquetés, avec `autocomplete`, `inputMode` et `spellCheck` là où il faut.
- `overscroll-behavior: contain` sur les trois zones défilantes imbriquées : le menu des outils, le bandeau d'onglets et la matrice.
- Neuf appels à `toLocaleString('fr')` : aucun format de nombre codé en dur.
- `prefers-reduced-motion` coupe le défilement doux, les apparitions, la transition de route, le tracé du câblage et le flux des pistes. La capture `reduced.png` le montre.
- Typographie : points de suspension et guillemets typographiques, espaces insécables sur les unités et devant les deux-points.

Reste, et pourquoi :

- **Pas de page 404.** Une route inconnue rend l'accueil. Trois routes en fragment, aucune adresse profonde publiée : le coût d'une page dédiée dépasse le risque.
- **Performance à 76.** Le corpus de 125 072 mesures est embarqué dans le paquet, par décision de produit : aucune requête réseau, le site répond hors ligne. Le LCP à 1,9 s et le CLS à 0 sont bons ; le score est tiré vers le bas par le poids, qui est la contrepartie assumée de cette décision.
- **Un test tombe** : `facts.test.ts` exige que toutes les sources aient été lues, or `packages/guard/data/table.json` n'existe pas dans le dépôt. Le générateur le signalait avant toute modification de design. `packages/` appartient à l'équipier.
