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

## `#/outil/1` à `#/outil/14` — la page outil

Passée au système : titre en `t-display` Archivo avec le numéro en `ink-3`, question en
`t-title`, bandeau de famille / état / coût en sans séparé par filets, titres de section en
`t-headline` 24 px sur filet `--line` avec 32 px d'air au-dessus (le composant `Panel` a été
corrigé, ce qui met aussi l'instrument à jour). Le bandeau d'onglets porte un carré de famille
de 8 px avant le numéro et le nom en sans, l'actif souligné dans sa couleur sur `surface-1`.

- `Outil.tsx` : **le bandeau se déclarait `role="tablist"` avec des `role="tab"`** alors que chaque entrée change de route. Le motif ARIA promet à un lecteur d'écran un panneau dans la même page, qui n'existe pas, et `tabIndex={-1}` rendait treize outils inatteignables au clavier. Remplacé par une `<nav>` de liens avec `aria-current="page"`, tous tabulables, les flèches gauche/droite conservées comme raccourci.
- `Outil.tsx` : chaque ligne d'entrée commençait par une flèche `→` collée au texte, le tell que frontend-design nomme. Remplacée par un port de 7 px à la couleur de la famille.
- `Outil.tsx` : sept chaînes de métadonnées en points médians (`0→1 · 1e18 · bloc 50 614 000`, `standard · spec`, `écrans · type · champs`…). Les faits d'une même ligne sont séparés par un filet, les autres par une virgule.
- `Outil.tsx` : le libellé d'une paire libellé/valeur était de la même couleur que sa valeur — il passe en `ink-3`, la valeur reste en `ink-2`.
- Reste : `dangerouslySetInnerHTML` sur deux textes du dépôt (la raison d'être d'un accès, la raison d'un outil non prêt) — un gras sur une chaîne de `lib/`, jamais une saisie. Le tiret cadratin espacé dans la question d'un outil vient de `lib/outils.ts`, qui appartient à l'équipier.

## `#/instrument` — l'index des panneaux et les dix-sept panneaux

Passé au système : titre de route en `t-display` Archivo avec les trois comptes du corpus à
droite séparés par filets, index collant dont l'ordinal passe en `ink-3` et le titre en sans,
ligne active sur `surface-1`. Les dix-sept titres de panneau suivent le `Panel` corrigé
(Archivo 24 px). Les quatre tuiles du verdict passent sur `surface-1`, leur nombre reste en
mono, et leur glose passe en prose sans.

- `App.tsx` : les gloses du verdict étaient **sans accents** (« hooks mesures », « etiquetees », « epingle », « booleens », « numerique »). L'instrument est en français par décision : accents rétablis.
- `App.tsx` : deux chaînes de métadonnées en points médians dans les gloses du verdict, remplacées par des virgules et des phrases.
- `App.tsx` : la prose du panneau 01 était en mono par héritage et sans accents, elle passe en `t-body`.
- `Exit.tsx` : deux séparateurs en point médian, remplacés.
- Reste : l'indicateur de tri d'une colonne de table utilise `·` pour « non trié », en regard de `↑` et `↓`. C'est un symbole d'état d'une colonne, pas une chaîne de métadonnées ; conservé.
- Les dix erreurs console de cette route sont toutes `ERR_CONNECTION_REFUSED` vers l'API locale absente, le cas que couvre le refus motivé à l'écran.
