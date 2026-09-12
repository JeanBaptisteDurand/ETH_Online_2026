# Audit de la hero — `#/`, direction A « la plaque », 2026-09-12 (révision 2)

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


---

## Révision 2 — les six corrections, puis les deux suivantes

Ce qui a changé depuis la première présentation, et ce que chaque audit a trouvé dessus.

**Les corrections appliquées.** L'écart de 96,74 bps et le champ d'adresse sont montés dans le
premier écran, avec le schéma entier : les trois tiennent ensemble à 1440 × 900, le schéma
intact, la mesure et le champ compactés autour de lui. Les trois interactions sont signalées
sans lire : le seul bouton orange de la page sous le champ, un port coloré et un chevron sur
chaque plaque au survol, un repère de défilement animé sous la carte. Le graphe a gagné ce que
la référence SEDA Kit apporte : des ports au bord des plaques, des câbles qui portent la
couleur de la famille qu'ils desservent au lieu d'un gris uniforme, et un flux qui descend les
pistes en continu. Archivo porte les titres, Instrument Sans la prose, JetBrains Mono les
données. Le fond est la bande du corpus.

**web-design-guidelines, deuxième passe.** Violations trouvées et corrigées :
- `Carte.tsx` : le champ du hero n'avait ni `inputMode`, ni `aria-describedby`, ni `aria-invalid`, ni message d'erreur — une adresse incomplète faisait défiler sans rien dire. Aide et erreur écrites sous le champ, soumission bloquée tant que l'adresse n'est pas lisible.
- `Carte.tsx`, `App.tsx` : les deux `scrollIntoView({ behavior: 'smooth' })` ignoraient `prefers-reduced-motion`. Un helper `doux()` rend `auto` dans ce cas.
- `Carte.tsx` : le bouton du hero décrochait du champ parce que le texte d'aide était dans le même bloc que l'input ; l'aide passe sur sa propre ligne.

Vérifié conforme, sans changement : `<canvas>` en `aria-hidden` et `pointer-events: none` ;
`useEffect` avec nettoyage strict (rAF, `ResizeObserver`, `MutationObserver`, `visibilitychange`) ;
aucun écouteur de défilement ; aucun `transition: all` ; contraste du bouton orange 5,8:1 sur le
texte d'encre sombre ; cibles 44 px sur le champ, le bouton, les plaques et le repère de
défilement ; `translate="no"` sur la marque et les montants en wei.

Reste, et pourquoi : l'animation du flux et le tracé des pistes portent sur `stroke-dashoffset`,
qui n'est ni `transform` ni `opacity`. C'est une propriété de peinture, sans recalcul de mise en
page, et c'est le seul moyen de dessiner un trait progressivement ; les deux s'arrêtent sous
mouvement réduit. Le preload des deux polices dans `index.html` reste pour le build.

**Design Audit, deuxième passe.** La typographie a gagné une voix de titre distincte d'Archivo
(700, -0,035em) contre la prose d'Instrument Sans — la hiérarchie ne tient plus seulement à la
taille. La couleur reste disciplinée : un seul accent orange, sur le bouton primaire et la
famille action ; les câbles colorés n'ajoutent pas une couleur, ils appliquent celle qui existe
déjà. Le layout a perdu son trou : le premier écran est plein, l'enceinte est le seul geste de
cadrage, rien n'est centré. Les états sont complets sur le champ (vide, erreur, valide) et sur
les plaques (repos, survol, focus, actif, en attente, hors ligne).

### Fix Priority (ce qui reste, pour `/da-kit:build`)
1. Le rail des 27 jeux garde la grammaire d'une liste alors que tout le reste est en plaques : lui donner un port et un filet de famille, ou le réduire à une plaque dépliable.
2. La section usage et preuve, les accès et la matrice sont encore dans l'ancien `Panel` : les passer au système (titres `t-headline`, champs `field`, boutons `button-*`).
3. Les pages outil et l'instrument : onglets avec repère de famille, tables `table-header` / `table-cell`, index collant.
4. Preload des deux polices dans `index.html`.
5. Vérifier la bande du corpus en thème clair : les trois valeurs qu'elle lit changent, la densité perçue aussi.


---

## Révision 3 — les trois entiers, le fond visible, la section compute supprimée

**Ce qui a changé.** Le premier écran est maintenant mesuré et non espéré : à 1440 × 900,
l'enceinte se ferme à 740 px et le repère de défilement à 800 px, ce qui laisse les trois
éléments entiers même sur un portable dont la fenêtre utile descend à 800 px. C'est cette
contrainte qui a fixé l'échelle : plaques de 44 px, noms d'outils à 15 px, rail tronqué à six
entrées avec son reste affiché, en-tête d'enceinte sur une ligne, titre à 2,75 rem au plus.

La section d'opération sous la carte est supprimée. La barre du hero la remplace : on colle une
adresse ou on clique l'un des trois jetons du corpus proposés, et le bloc de droite répond à la
place de l'écart de référence. Trois états au même endroit — référence, succès, refus motivé.
`AccueilPanel` et son code mort ont été retirés ; `AccesPanel` et `DonneesPanel` restent.

Le fond était invisible pour une raison mesurable, pas esthétique : l'ordonnée portait le
prélèvement en log sur une échelle fixe, et la médiane du corpus valant 100 bps, tout le semis
se tassait dans le tiers haut de la bande. En portant le **rang** de prélèvement, le semis
couvre toute la bande. Les creux suivent les rectangles de ligne, pas les boîtes, ce qui laisse
la bande visible partout où il n'y a pas de glyphe.

**web-design-guidelines, troisième passe.** Corrigé :
- `Carte.tsx` : le repère de défilement annonçait « l'opération sur ton jeton », une section qui n'existe plus. Libellé refait.
- `Carte.tsx` : le texte d'aide invitait à essayer un jeton alors que les jetons disparaissent dès qu'une adresse est saisie. Trois textes distincts selon l'état.
- `Carte.tsx` : le bloc de réponse porte `aria-live="polite"` — son contenu change sans que la page bouge.

Vérifié : les jetons de démonstration sont des `<button type="button">` de 24 px au moins, avec
leur écart en `title` ; le bouton primaire change de libellé selon l'état ; aucune erreur console
sur les trois largeurs ; `tsc -b` vert.

### Fix Priority (ce qui reste, pour `/da-kit:build`)
1. Le rail des 27 jeux garde la grammaire d'une liste alors que tout le reste est en plaques : lui donner un port et un filet de famille, ou le réduire à une plaque dépliable.
2. Les cinq accès et la matrice sont encore dans l'ancien `Panel` : les passer au système.
3. Les pages outil et l'instrument : onglets avec repère de famille, tables `table-header` / `table-cell`, index collant.
4. Preload des deux polices dans `index.html`.
5. Vérifier la bande du corpus et les plaques en thème clair.
6. Les tests de `lib/` référencent-ils encore l'opération d'accueil ? À vérifier au build (`node --test src/lib/*.test.ts`).

**Une alerte qui ne vient pas du front.** `node --test src/lib/*.test.ts` : une seule
assertion tombe, « toutes les sources ont été lues », parce que
`packages/guard/data/table.json` n'existe pas dans le dépôt. Le générateur de faits le
signalait déjà au premier `npm run data`, avant toute modification de design. `packages/` est
hors du périmètre du front : à signaler à l'équipier, pas à corriger ici.
