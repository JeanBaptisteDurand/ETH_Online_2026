# Audit du build — section par section

Protocole : le skill `web-design-guidelines` invoqué sur les fichiers de chaque section, règles
relues depuis `vercel-labs/web-interface-guidelines/command.md`. Une ligne par section : ce qui
a été trouvé, ce qui a été corrigé, ce qui reste et pourquoi.

## `#/` — les cinq accès

Reconstruite dans le système : plus de `Panel` ni d'ordinal (ce n'est pas une séquence), titre
en `t-headline` Archivo, liste à filets en deux colonnes (le nom et pour qui à gauche, la raison
d'être et les outils à droite), puces d'outils avec port de famille au lieu de boîtes à texte
coloré. Le point médian de la ligne de métadonnées est remplacé par deux faits séparés d'un
filet, un tell de frontend-design en moins.

- `Accueil.tsx` : `dangerouslySetInnerHTML` conservé sur la raison d'être — il ne rend qu'un gras (`**…**`) sur une chaîne du dépôt, jamais une saisie. Noté, pas corrigé.
- Vérifié : hiérarchie `h2` correcte sous le `h1` du hero, liens de navigation en `<a href>`, cibles 24 px sur les puces, focus visible hérité, aucun `transition: all`.

## `#/` — la matrice 27 × 14

Reconstruite dans le système : en-tête au même gabarit que les accès, légende en prose plutôt
qu'en étiquettes mono, table des jeux en `ligne-table` avec survol sur `surface-1`, dépliant au
gabarit `.depliant` (44 px de cible, une phrase et non une étiquette).

- `Accueil.tsx` : la table des vingt-sept jeux n'avait pas de `<caption>` — ajoutée en `sr-only`.
- `Accueil.tsx` : le nom d'un jeu dans la matrice allumait sa ligne au survol mais pas au focus clavier — `onFocus`/`onBlur` ajoutés.
- `index.css` : l'en-tête de la matrice était collante sous 700 px et **recouvrait le nom du premier jeu**. Empilée, chaque jeu porte déjà son nom au-dessus de ses cases : le collant est retiré à cette largeur.
- `Accueil.tsx` : les fonds de survol passaient par `--bg-2`, hérité de l'ancien système ; ils passent à `surface-1`, l'échelle de la direction.
