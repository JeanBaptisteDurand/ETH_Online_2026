# Audit de la hero — `#/`, direction A « la plaque », 2026-09-12

## web-design-guidelines

Règles relues depuis `vercel-labs/web-interface-guidelines/command.md` (WebFetch), passées sur
`apps/web/src/components/Carte.tsx`, `apps/web/src/App.tsx`, `apps/web/src/index.css`.

Violations trouvées et corrigées :
- `Carte.tsx` (figure appariée) : `<dd>` avant `<dt>` dans chaque paire, ordre invalide → `dt` d'abord dans le DOM, ordre visuel par `order` en flex.
- `Carte.tsx` (figure appariée) : montants en wei sans `translate="no"` → ajouté sur les deux valeurs.
- `App.tsx` (barre haute) : la marque sans `translate="no"` → ajouté.
- `App.tsx` / `index.css` : à 390 px la barre débordait (liens cassés sur deux lignes, bouton de thème hors écran) → `white-space: nowrap` sur les liens, la provenance (importance 3) masquée sous 640 px, le thème ancré à droite.

Vérifié conforme, sans changement :
- focus : `:focus-visible` global avec anneau 2 px `--focus` décalé (le `outline: none` a son remplacement) ; `scroll-margin-top: 60px` ≥ la barre de 56 px.
- animation : `transform`/`opacity`/`stroke-dashoffset` seulement, aucun `transition: all`, `prefers-reduced-motion` coupe le tracé et les transitions ; `reduced.png` est identique au pixel à `home-1440.png` (`cmp`).
- typographie : `…` typographique, apostrophes courbes, `text-wrap: balance` sur le h1, `tabular-nums` global.
- navigation : les nœuds et les routes sont des `<a href>` (Cmd-clic et molette gardés), `aria-current="page"` sur la route active, skip-link présent.
- dark mode : `color-scheme` sur `:root`, `theme-color` dans `index.html` pour les deux thèmes.
- touch : `touch-action: manipulation` et `-webkit-tap-highlight-color` sur les nœuds ; cibles 56 px sur les plaques, 32 px sur les boutons de la barre.
- contenu : les chiffres viennent de `facts.json` et passent par `toLocaleString('fr')`.

Reste, et pourquoi :
- `index.html` : pas de `<link rel="preload" as="font">` pour Instrument Sans et JetBrains Mono. Les polices sont auto-hébergées via `@fontsource-variable` et importées par le bundle ; le preload se règle au build de tout le site, pas dans la hero.
- La légende des familles est un `<dl>` avec des `<div>` de groupe : valide en HTML, sans ARIA ajouté.

## Design Audit (protocole redesign-existing-projects, sur `design/shots/hero/`)

- Typographie : Instrument Sans porte le titre (64 px, 600, -0.03em), la prose et les noms des plaques (18 px, 500) ; JetBrains Mono ne parle que sur les valeurs (horloge, métadonnées, rail). Graisses 400/500/600. Aucune capitale chassée, aucun point médian, aucune flèche collée. Rapport dans le pli 64 : 11 ; l'écart en `t-number` (112 px) est sous le pli, comme le décide DESIGN.md.
- Couleur et surfaces : quatre valeurs (page `#08090a`, enceinte `#0e1013`, plaque `#161a1e`, survol `#1c2126`), deux filets, un liseré haut. Le jaune analyse désaturé tient à côté du bleu et de l'orange. Aucune ombre, aucun dégradé, aucune trame.
- Layout : hero 7/5 aligné à gauche, l'enceinte pleine largeur est le seul geste de cadrage, les quatorze plaques entières dans le pli à 1440 (la dernière finit à 810 px), douze à 390. Le vide autour de l'orchestrateur est la respiration du schéma (≈ 250 × 130 px de chaque côté), plus le trou de 600 × 250 px de l'avant.
- États : repos, survol (plaque monte d'un cran, pistes du chemin en encre, les autres au filet), focus (anneau), actif (`translateY(1px)`), en attente / hors ligne écrits dans la métadonnée. Route active en encre dans la barre.
- Contenu : titre en une phrase de quatorze mots sur deux lignes, sous-titre de deux lignes, légende en trois mots plus glose. Français partout.
- Patterns : plus de kit de cartes identiques à filet ; les plaques ont un liseré, une barre de famille, une hiérarchie numéro / nom / méta. Barre haute en liens texte plus deux boutons fantômes.
- Code : tokens dans `index.css` (`--surface-*`, `--highlight`, `--e-out`), aucun hex dans les composants, la logique de tracé des pistes et les données inchangées, `tsc -b` vert, 0 erreur console.

### Fix Priority (ce qui reste, pour `/da-kit:build`)
1. Les pistes au repos (`--line-strong` sur `--surface-1`) restent discrètes : mesurer leur contraste à l'écran et monter d'un cran si le câblage ne se lit pas sur un projecteur.
2. Le rail des 27 jeux est une liste à filets dans l'enceinte : lui donner la même grammaire que les plaques (une plaque basse par jeu, ou une seule plaque « 27 jeux » dépliable).
3. La section usage et preuve, les accès et la matrice sont encore dans l'ancien `Panel` : les passer au système (titres `t-headline`, champs `field`, boutons `button-*`).
4. Les pages outil et l'instrument : onglets avec repère de famille, tables `table-header` / `table-cell`, index collant.
5. Preload des deux polices dans `index.html`.
