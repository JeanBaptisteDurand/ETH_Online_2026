# Audit web-design-guidelines — la hero de TARE

> Skill `web-design-guidelines` (Vercel, Web Interface Guidelines), règles récupérées le
> 2026-09-12 sur `raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.
> Portée : la hero de `#/` — `src/components/Carte.tsx`, la barre haute et la navigation de
> `src/App.tsx`, les jetons de `src/index.css`, et `index.html`.

## Règles violées, et ce qui a été corrigé

## src/components/Carte.tsx

src/components/Carte.tsx:~255 — `<a>` avec `onClick` + `preventDefault` inconditionnel : Cmd-clic, Ctrl-clic et clic molette ne pouvaient plus ouvrir un onglet. **Corrigé** — le clic modifié garde son comportement natif.
src/components/Carte.tsx — nœud sans `touch-action: manipulation` : latence de double-tap sur téléphone. **Corrigé** dans `.noeud`.
src/components/Carte.tsx — nœud sans `-webkit-tap-highlight-color` : surbrillance bleue par défaut au tap, hors charte. **Corrigé**, mise à `transparent`, le retour tactile reste porté par `:active`.

## src/App.tsx

src/App.tsx:~230 — navigation construite en `<button onClick>` : pas de Cmd-clic, pas de clic molette, adresse non copiable. **Corrigé** — `<a href="#/…">` avec `aria-current="page"` sur la route active, et l'interception ne vaut que pour le clic nu.
src/App.tsx:~70 — texte de navigation en `--ink-3` (4,04:1 sur le fond) : échec AA sur du texte de 11 px. **Corrigé** — passé à `--ink-2` (8,4:1). La règle est écrite dans DESIGN.md rubrique 2.
src/App.tsx:~59 — `<summary>` du dépliant de provenance : marqueur natif retiré par `list-none` côté Tailwind seulement, WebKit gardait son triangle. **Corrigé** — `summary::-webkit-details-marker { display: none }`.

## src/index.css

src/index.css — titre sans `text-wrap: balance` : mot orphelin sur la seconde ligne à 390 px. **Corrigé** sur `.t-hero`.
src/index.css — barre haute collante de 44 px sans `scroll-margin-top` sur les cibles d'ancre ni sur les nœuds : un élément atteint au clavier ou par ancre passait sous la barre. **Corrigé** — 60 px sur `:target`, `h1`, `h2`, `h3` et `.noeud`.

## index.html

index.html:6 — `<meta name="theme-color">` absent : la chrome du navigateur mobile ne suivait pas le fond de page. **Corrigé** — deux déclarations, une par schéma de couleur.

## Ce qui passait déjà

- Animation : `prefers-reduced-motion` honoré, le tracé des pistes est désactivé et le câblage s'affiche complet. Aucune propriété animée hors `stroke-dashoffset` sur un SVG hors flux, aucun `transition: all` — les propriétés sont listées une par une.
- Focus : `:focus-visible` global, anneau de 2 px décalé, jamais `outline: none` sans remplacement.
- Sémantique : `<a>` pour naviguer, `<h1>` unique sur la page et `<h2>` dans les panneaux, `aria-labelledby` sur la section de la carte.
- Décor : le SVG des pistes, la gouttière de `#` et les graduations de l'horloge sont tous en `aria-hidden`, et le SVG est en `pointer-events: none`.
- Typographie : `tabular-nums` sur tout le corps de page, `…` et non trois points, guillemets français.
- Lecture de mise en page : `getBoundingClientRect` n'est jamais appelé pendant le rendu — uniquement dans `useLayoutEffect` et dans le `ResizeObserver`.
- Contenu : aucune liste de plus de cinquante éléments, aucune image, aucun champ de formulaire dans la hero.
- Thème : `color-scheme` déclaré sur les deux thèmes.
- Débordement : aucun défilement horizontal à 390, 768 et 1440 px.

## Ce qui reste, et pourquoi

- **Lien d'évitement vers le contenu principal.** Absent du site entier, pas seulement de la hero. Il appartient au squelette de page et sera posé avec la barre haute définitive, au moment du build des trois routes. Noté ici pour ne pas être oublié.
- **La règle « Title Case » des guidelines pour les titres et les boutons ne s'applique pas.** Le produit est en français, où la casse de titre à l'anglaise est une faute. Les guidelines sont écrites pour l'anglais ; la casse de phrase est retenue, et c'est aussi ce que demande `frontend-design` contre les capitales décoratives.
- **`env(safe-area-inset-*)`.** La barre haute n'est pas en plein bord et le corps de page porte déjà ses gouttières latérales ; à revoir si une barre basse fixe apparaît.

Bilan : **10 règles violées, 9 corrigées**, 1 reportée au squelette de page et documentée.
