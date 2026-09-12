# QA — TARE, module design-generator

> **Recette close.** Aucun bloquant.
>
> Trois passes sur `http://localhost:5273` (vite dev, `apps/web`) et sur `http://localhost:4181`
> (build de production servi par `vite preview`, pour Lighthouse). Routes : `#/`, `#/outil/1`,
> `#/outil/7`, `#/instrument` — les quatre écrans de la rubrique 5 de `DESIGN.md`. Largeurs :
> 390, 768, 1440. Le débordement horizontal est en plus vérifié sur les **seize** routes du site.
>
> Sept bloquants ont été rendus au total — six en 1re passe, un septième (`B1-r`) trouvé en
> 2e passe au pixel, là où axe ne voit rien. **Tous sont fermés, chacun revérifié avec l'outil
> qui l'avait trouvé**, jamais sur déclaration. Les valeurs ci-dessous sont mes mesures.
>
> Preuves : `project/design/shots/qa/` — captures, `console.txt`, `axe.txt`, 8 `axe-*.json`,
> 4 `lighthouse*.json`, `curve-axes.png`.
>
> Cadrage appliqué tel quel : la charte (JetBrains Mono, Instrument Sans, rampe de mesure, rayon
> zéro) appartient à un tiers et n'est pas jugée ; le poids du paquet JavaScript est une décision
> de produit, mesuré et dit, pas compté en défaut ; le français est une décision — la règle
> « Title Case » des guidelines ne s'applique donc pas.

---

## 1. Les bloquants, et comment chacun a été refermé

| # | bloquant | état | mesure de contrôle, faite par la QA |
|---|---|---|---|
| B1 | contraste sous 4,5:1 sur du texte courant (DOM) | **fermé** | axe `color-contrast` : 1 841 / 8 / 5 → **0 / 0 / 0**. Lighthouse accessibilité **88 / 96 / 93 → 100 / 100 / 100 / 100** |
| B1-r | contraste sous 4,5:1 sur le texte peint dans un `<canvas>`, invisible à axe | **fermé** | échantillonnage de pixels ligne par ligne sur le panneau 06 : **0 px de texte en `--ink-4`**, tout le texte à **8,3:1**. Détail ci-dessous |
| B2 | cibles interactives à 18 px | **fermé** | **0 cible sous 24 px** sur 4 routes × 2 largeurs, et **0 lien exempté** au titre de la pleine phrase — l'exception n'a pas servi de porte de sortie |
| B3 | sortie réelle hors du pli sur `#/outil/7` | **fermé** | `PRET` + son bouton : y = 2 215 → **562** à 1440, y = 3 438 → **694** à 390 |
| B4 | l'écart hors du pli sur `#/` à 390 | **fermé par arbitrage écrit** | la contradiction document/écran est levée dans `DESIGN.md` r5 et r9. Détail ci-dessous |
| B5 | régions défilantes sans accès clavier | **fermé** | 7 conteneurs réellement défilants, **0 sans accès clavier** |
| B6 | `aria-label` sur `<div>` sans rôle | **fermé** | 14 `<span role="img">` nommés `bit 13, beforeInitialize — active` |

### B1-r — la preuve au pixel, ligne par ligne

Le 0 violation d'axe ne suffisait pas : **axe ne voit pas un `<canvas>`**, c'est une image pour
lui. J'avais trouvé le défaut par échantillonnage ; je l'ai refermé de la même façon, mais en
profilant **chaque rangée** de la bande basse du canevas, pour séparer le texte des traits — la
correction devait toucher le texte et rien d'autre.

Histogramme de la bande basse (`shots/qa/curve-axes.png`, canevas 1144 × 380) :

```
avant                                   après
41 641 px  0,0,0      le fond           41 640 px  0,0,0        le fond
   199 px  68,73,79   #454a50  2,2:1       272 px  162,169,176  #a2a9b0  8,39:1
   152 px 161,168,176 #a1a8b0  8,3:1       268 px  161,168,176  #a1a8b0  8,30:1
                                           214 px  162,169,175  #a2a9af  8,38:1
                                           178 px  67,71,80     #434750  2,14:1  ← trait, pas texte
```

Le profil par rangée lève l'ambiguïté du dernier couple, et c'est lui qui conclut :

```
y = 340‑343   ink4 = 971, 196, 134, 132   ink2 ≈ 4     ← le filet d'axe et les séries : des TRAITS
y = 348‑357   ink4 = 0                    ink2 = 89‑151 ← les graduations 1e12 … 1e19 : du TEXTE
y = 364‑374   ink4 = 0                    ink2 = 11‑218 ← la légende de l'axe : du TEXTE
```

**Aucun pixel de texte en `--ink-4` ni en `--baseline`. Tout le texte du canevas est à 8,3:1.**
Les 1 433 px proches de `--ink-4` qui restent dans la bande vivent tous sur les rangées 340‑343 :
c'est le filet d'axe (`strokeStyle`, ~971 px de large d'un seul tenant) et les polylignes de
séries. Les garder est le bon choix : un trait d'axe qui crie autant que sa graduation ferait un
graphe plus bruyant, pas plus lisible, et la ligne de référence en `--baseline` est précisément ce
qui **dit** « série de référence ». La correction a touché le texte, et le texte seulement.

Le libellé a aussi perdu ses capitales et ses points médians — « sans hook, talon inerte, 0 bps par
construction ». C'est mieux : la casse de phrase est ce que demande le reste du document, et les
points médians y étaient un tic de titre sur ce qui est une légende.

### B4 — l'arbitrage est écrit, et les deux rubriques concordent

Le problème que j'avais posé n'était pas un défaut de construction mais **un écart entre le
document et l'écran** : la rubrique 5 plaçait dans le pli de 390 deux données d'importance 1 qui
n'y tiennent pas ensemble. L'écart est levé dans `DESIGN.md`, pas contourné :

- **Rubrique 5**, tableau des données de l'écran 1 : « la paire de cotations et leur écart […]
  **Importance 1 à 1440, importance 2 à 390** — voir plus bas ».
- **Rubrique 9** : « À 390, quatre sur cinq le sont […] la paire et son écart demandent un
  défilement court. C'est une contrainte de format assumée, pas un oubli : quatorze nœuds à cible
  tactile de 44 px et un chiffre de 56 px ne tiennent pas ensemble dans 844 px de haut, et amputer
  la carte contredirait d001. »

**Vérifié : les deux rubriques ne se contredisent plus**, et elles s'accordent avec `mustSeeIn10s`,
qui disait déjà « l'écart visible dès qu'on descend d'un cran ». Le compte tient aussi :
j'avais mesuré 8 rangées × 44 px + 7 gouttières × 8 px = **408 px incompressibles** et **319 px
manquants**, soit environ six nœuds à retirer — ce que d001 interdit. C'est bien ce que le document
argumente.

**Une réserve, et elle porte sur un chiffre.** Les rubriques 5 et 9 écrivent toutes deux que
**dix** des quatorze nœuds tiennent entiers dans le pli à 390 (r9 ajoute « les deux suivants
amorcés », ce qui n'en compte que douze sur quatorze). Je mesure **douze entiers, deux amorcés,
zéro hors du pli** :

```
1 Mesurer      440→484  ENTIER      6 Proposer…    650→702  ENTIER
8 Intercepter  440→484  ENTIER      7 Substituer   718→770  ENTIER
10 Payer…      490→534  ENTIER      9 Approuver    718→770  ENTIER
2 Consulter    550→594  ENTIER      11 S'abonner   776→820  ENTIER
3 Situer       550→594  ENTIER      12 Authentifier 776→820 ENTIER
4 Comprendre   600→644  ENTIER      13 Prouver     826→870  amorcé
5 Décider      600→644  ENTIER      14 Attester    826→870  amorcé
```

Le document est **en dessous de la réalité de deux nœuds**. Ce n'est pas un bloquant — l'écran est
meilleur que la promesse — mais c'est un chiffre faux dans un document dont l'audience, selon le
brief lui-même, « ouvre le dépôt et vérifie un chiffre du pitch : un seul chiffre faux coûte la
crédibilité de tous les autres ». À corriger en `douze` aux deux endroits. Voir la rubrique 8.

### Ce qui n'est pas compté en bloquant

Les 6 erreurs console (10 à la 1re passe, 8 à la 2e) sont toutes `ERR_CONNECTION_REFUSED` vers
`127.0.0.1:8787` — `/route` ×2, `/graph`, `/graph/twins`, `/graph/impact`, `/graph/disagreement`.
**Aucune autre erreur, aucun avertissement.** La forme du refus est jugée à l'écran, rubrique 6.

---

## 2. Le tableau de recette

| vérification | méthode | résultat | preuve |
|---|---|---|---|
| Console, 4 routes | `shots.sh` + `playwright-cli console` | **passe** — 6 erreurs, toutes `ERR_CONNECTION_REFUSED` vers l'API absente, 0 autre erreur, 0 avertissement | `shots/qa/console.txt` |
| Captures 4 routes × 390/768/1440 + pleine page + défilées | `shots.sh` | 12 + 4 + 4 | `shots/qa/*.png` |
| Débordement horizontal, 4 routes × 3 largeurs | `scrollWidth > clientWidth` | **passe** — 12/12 `false` | relevé ci-dessous |
| Débordement horizontal, **les 16 routes** à 390 | idem | **passe — 0 débordement sur 16**, `scrollWidth === clientWidth` partout. La garantie de la rubrique 9 est vraie | relevé ci-dessous |
| `prefers-reduced-motion` | `emulateMedia({ reducedMotion: 'reduce' })`, 2 captures à 1 s | **passe** — identiques au hachage sur les 4 routes, `getAnimations()` en cours : **0** | `shots/qa/*-reduced-a.png` / `-b.png` |
| Focus visible | 25 tabulations × 4 routes | **passe** — 0 manquant sur 100 arrêts | `src/index.css:138` |
| Contraste, DOM | axe-core 4.13.0, 4 routes × 2 largeurs | **passe — 0 nœud** (était 1 854) | `shots/qa/axe-*.json` |
| Contraste, canevas | profil de pixels par rangée | **passe — 0 px de texte sous 4,5:1**, tout à 8,3:1 | `shots/qa/curve-axes.png` |
| Libellés de champs | lecture de `src/` + axe | **passe** — les six champs sont étiquetés | rubrique 4 |
| Ordre de tabulation | 25 pas × 4 routes | **passe** — suit l'ordre visuel, aucun `tabindex` positif, aucun piège | — |
| Cibles ≥ 24 px | `getBoundingClientRect` sur tous les interactifs | **passe — 0 hors norme** | relevé |
| Nœuds de la carte ≥ 44 px | idem sur `.carte-outils a.noeud` | **passe** — 14/14, hauteur 50 à 1440, 44 et 52 à 390, **minimum 44** | rubrique 5 |
| Carte intacte après compaction | libellés des 14 nœuds relus | **passe** — les 14 outils, numérotés 1 à 14, présents aux deux largeurs | rubrique 5 |
| Régions défilantes accessibles | `overflow` + `scrollWidth`, puis `tabIndex` et contenu focusable | **passe — 0 sans clavier** sur 7 conteneurs | relevé |
| Parcours de démo | 6 étapes de `brief.json → demo.path` rejouées | **passe** — **5 clics + 1 collage**, le compte annoncé | rubrique 5 |
| Importance 1 au-dessus du pli, `#/` 1440 | `getBoundingClientRect().bottom <= innerHeight` | **passe** — 5/5 | `shots/qa/home-1440.png` |
| Importance 1 au-dessus du pli, `#/` 390 | idem, contre la hiérarchie **révisée** | **passe** — 4/4, l'écart étant déclaré importance 2 à cette largeur | `shots/qa/home-390.png` |
| Importance 1 au-dessus du pli, `#/outil/1` | idem | **passe** à 1440 ; à 390 les deux cotations, leurs séries et les wei sont dans le pli, le `display` est entamé au bord | `shots/qa/pli-outil-1-390.png` |
| Importance 1 au-dessus du pli, `#/outil/7` | idem | **passe** aux deux largeurs | `shots/qa/pli-outil-7-*.png` |
| Importance 1 au-dessus du pli, `#/instrument` | idem | **passe** | `shots/qa/pli-instrument-1440.png` |
| Aucune importance 3 au-dessus du pli | inspection des 4 folds | **passe** — provenance en `<details>` fermé, détail d'un jeu derrière un clic | relevé |
| `mustSeeIn10s` au premier écran | les 4 points de `brief.json` | **passe** — 4/4 à 1440 ; à 390, 3 au premier écran et l'écart « à un cran de défilement », ce que le brief énonce lui-même | `shots/qa/home-*.png` |
| axe-core, 4 routes × 2 largeurs | axe-core 4.13.0 | **0 violation, toutes gravités** | `shots/qa/axe.txt` |
| Lighthouse desktop, 4 routes | lighthouse, build de production | accessibilité **100 partout** ; rubrique 7 | `shots/qa/lighthouse.json` |
| Forme du refus, 5 surfaces | lecture à l'écran | **passe** ; rubrique 6 | `shots/qa/refus-graphe.png` |

**Débordement horizontal, 4 routes × 3 largeurs :**

```
/              390: 390/390 false   768: 768/768 false   1440: 1440/1440 false
/#/outil/1     390: 390/390 false   768: 768/768 false   1440: 1440/1440 false
/#/outil/7     390: 390/390 false   768: 768/768 false   1440: 1440/1440 false
/#/instrument  390: 390/390 false   768: 768/768 false   1440: 1440/1440 false
```

**Débordement horizontal, les seize routes à 390 px** — la garantie de la rubrique 9, vérifiée :

```
/  ·  /#/instrument  ·  /#/outil/1 … /#/outil/14      →  16 routes, 0 débordement
```

---

## 3. axe

`npx @axe-core/cli` ne peut pas s'exécuter sur cette machine : le ChromeDriver exige Chrome 153,
le Chrome installé est en 152.0.7977.84 (`session not created`). **Le même moteur, axe-core 4.13.0,
est donc injecté dans le Chromium de Playwright** et lancé sur le document complet de chaque route,
à 1440 et à 390. Sorties : `shots/qa/axe.txt` et `axe-<route>-<largeur>.json`.

| route · largeur | 1re passe | **passe finale** |
|---|---|---|
| `#/` · 1440 | `color-contrast` (5) · `definition-list` (1) · `dlitem` (6) | **0** |
| `#/` · 390 | `color-contrast` (5) · `definition-list` (1) · `dlitem` (3) | **0** |
| `#/outil/1` · 1440 | `color-contrast` (8) · `scrollable-region-focusable` (7) | **0** |
| `#/outil/1` · 390 | `color-contrast` (8) · `scrollable-region-focusable` (8) | **0** |
| `#/outil/7` · 1440 | aucune | **0** |
| `#/outil/7` · 390 | `scrollable-region-focusable` (1) | **0** |
| `#/instrument` · 1440 | `aria-prohibited-attr` (14) · `color-contrast` (1 841) · `scrollable-region-focusable` (2) · `region` (1) · `empty-table-header` (3) | **0** |
| `#/instrument` · 390 | `aria-prohibited-attr` (14) · `color-contrast` (1 344) · `scrollable-region-focusable` (3) · `region` (1) · `empty-table-header` (3) | **0** |

**Aucune violation, aucune gravité, sur les huit relevés.** Les règles `region` et
`empty-table-header`, que j'avais classées en améliorations, ont été traitées aussi.

**Et la limite d'axe, dite une fois pour toutes :** ce 0 ne couvre pas le texte peint dans un
`<canvas>`. C'est là que `B1-r` se cachait. Tout graphe ajouté plus tard devra être contrôlé par
échantillonnage de pixels, pas par axe — c'est la leçon de méthode de cette recette.

---

## 4. web-design-guidelines

Skill `web-design-guidelines`, règles récupérées à l'exécution sur
`raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.
**Portée : tout `apps/web/src/`**, hors `src/lib/` (gelé par le brief). L'audit de la hero est dans
`project/design/audit-hero.md` ; les endroits où la hero a été retouchée depuis sont revérifiés ici.

**Bilan : 25 règles violées au total → 23 corrigées, 2 reportées avec leur raison, 0 restante.**

### src/components/Curve.tsx

✓ corrigé. `Curve.tsx:128-129` — les graduations `1e12`…`1e19` de l'axe X passent de `--ink-4`
(2,2:1) à `--ink-2` (8,3:1). `Curve.tsx:153-154` — la légende de la série de référence passe de
`--baseline` (4,04:1) à `--ink-2`, en casse de phrase et sans points médians. Les `strokeStyle`
restent en `--line`, `--ink-4` et `--baseline` : ce sont des traits, hors du champ de la règle de
contraste, et la ligne de référence doit garder le gris qui la désigne. Vérifié au pixel, rangée
par rangée, rubrique 1.

### src/components/Prim.tsx

✓ corrigé. Bouton `Copy` à 24 px, `<pre>` en `tabindex="0"` + `role="region"`, libellés de 10 et
11 px passés en `--ink-2`.

### src/components/Led.tsx

✓ corrigé. Les 14 bits sont des `<span role="img" aria-label="bit 13, beforeInitialize — active">`.
Le numéro de bit dans le nom accessible est un ajout que je n'avais pas demandé et qui est juste :
sans lui, quatorze pastilles se confondent à l'oreille.

### src/components/Outil.tsx

✓ corrigé, deux fois. La sortie réelle remonte sous les onglets (**B3**), et les dix boutons ont
chacun leur nom accessible : `PRET — signer et envoyer`, `PAS_DE_PROPOSITION — inactif`,
`NON_DEMANDE — inactif`, `SANS_PLANCHER — inactif`, `APPROBATION_REQUISE — inactif`,
`SIGNATURE_REQUISE — inactif`, `NONCE_NON_LU — inactif`, `ETAT_PERMIT2_INCONNU — inactif`,
`PERMIT_SUR_MONNAIE_NATIVE — inactif`, `RELECTURE_DIVERGENTE — inactif`. Dix noms, dix raisons.
La phrase d'entête — « 10 états d'envoi, et un seul autorise à signer. Les autres restent visibles
avec ce qu'il leur manque : un état caché ferait croire à une étape ratée. » — met l'intention du
design à l'écran.

### src/components/Carte.tsx — la légende, et l'empreinte de la hero

✓ corrigé. `<dl>` conservé, `<dt>` et `<dd>` redevenus enfants **directs** du `<div>` de groupe,
nuancier en `<span>` sur `gridRow: '1 / span 2'`. `definition-list` et `dlitem` disparaissent sans
changer le rendu.

**Empreinte vérifiée sur mes propres coordonnées d'avant correction**, faute de capture d'avant :

| | avant | après |
|---|---|---|
| `.legende` à 1440 | 154 → 186, h = 32 | **154 → 186** |
| `.legende` à 390 | 196 → 212, h = 16 | **196 → 212** |
| texte à 390 | `collecte · analyse · action` | **identique** |

Même position, même hauteur, même texte, au pixel.

`Carte.tsx:340` — les graduations de l'horloge portent encore leur information par `title` seul.
**Reporté, non bloquant** : la même donnée est écrite en clair juste au-dessus
(`6/6 étapes en 13 680 ms`).

### src/components/Substituer.tsx · src/chat/Chat.tsx · src/components/Exit.tsx

✓ corrigés. Les six champs du site sont étiquetés, avec `name`, `autocomplete`, `inputmode` et un
placeholder qui finit par `…` en montrant le motif.

### src/components/Detail.tsx · src/components/Table.tsx

✓ corrigés. Cadre `overflow-auto` en `role="region"` + `tabindex="0"` ; les `<th>` vides ont un nom
accessible, `td-has-header` ne remonte plus dans Lighthouse.

### src/App.tsx · src/index.css · index.html

✓ le lien d'évitement est en place et le bloc hors point de repère de `#/instrument` est rattaché.
`:focus-visible` global, aucun `transition: all`, `prefers-reduced-motion` honoré, `color-scheme`
sur les deux thèmes, `tabular-nums`, rayon zéro sur `*`, `theme-color` par schéma, viewport sans
`user-scalable=no`.

`src/index.css:304` — `.gouttiere` reste en `--ink-4`. **Reporté, et assumé** : c'est la colonne de
caractères `#`, décorative par construction, `aria-hidden`, `user-select: none`, voulue ainsi par
d005. Du texte purement décoratif est hors du champ de la règle de contraste.

### Ce qui ne s'applique pas, et pourquoi

Title Case (le produit est en français, la casse de titre à l'anglaise y est une faute) · règles
`<img>` (le site n'a aucune image) · `env(safe-area-inset-*)` (rien en plein bord).

---

## 5. Hiérarchie et parcours, mesurés contre le brief

### Le parcours de démo — `brief.json → demo.path`

Rejoué à 1440, chaque clic compté :

```
collage 1  — 0x4200…0006 dans #jeton, la figure des deux cotations répond     (étape 2)
clic 1     — .carte-outils a.noeud[href="#/outil/1"]        → #/outil/1       (étape 3)
clic 2     — .onglet[href="#/outil/7"]                      → #/outil/7       (étape 4)
clic 3     — a[href="#/"], retour à la carte                → #/
clic 4     — .carte-source a, une ligne du rail             → #donnees-corpus (étape 5)
clic 5     — a[href="#/instrument"]                         → #/instrument    (étape 6)

TOTAL : 5 clics + 1 collage
```

**Annoncé rubrique 5 : cinq clics et un collage. Mesuré : cinq clics et un collage.** Inchangé aux
trois passes — aucun remaniement n'a allongé le chemin.

### Écran 1 — `#/`

| donnée | 1440 (pli 900) | 390 (pli 844) |
|---|---|---|
| les trois familles et leur couleur — imp. 1 | 154 → 186 · **dans le pli** | 196 → 212 · **dans le pli** |
| les quatorze outils — imp. 1 | 14/14 entiers, hauteur 50 · **dans le pli** | **12 entiers, 2 amorcés, 0 hors pli** ; hauteurs 44 et 52, minimum 44 |
| l'orchestrateur et son horloge — imp. 1 | 346 → 507 · **dans le pli** | 247 → 368 · **dans le pli** |
| les vingt-sept jeux de données — imp. 1 | rail 221 → 631 · **dans le pli** | rail à 884, remplacé dans le pli par le compteur 382 → 426 (44 px, cliquable) |
| la paire de cotations et leur écart | imp. 1 · `display` 115 px, `96,74` à 688 → 794 · **dans le pli** | **imp. 2 à cette largeur** (r5 et r9) · `display` 56 px à 1 163 → 1 215, un cran de défilement |

Aucune donnée d'importance 3 au-dessus du pli. Le premier titre d'importance 2 est à y = 889 à
1440 : il dépasse d'un cheveu, ce qui invite au défilement sans occuper le pli. Bon réglage.

### Écran 2 — `#/outil/1` et `#/outil/7`

| | `#/outil/1` | `#/outil/7` |
|---|---|---|
| nom, question, famille, état | dans le pli aux deux largeurs | dans le pli aux deux largeurs |
| bandeau d'onglets collant | `sticky`, 14 onglets, 44 px | `sticky`, 14 onglets, 44 px |
| **la sortie réelle** | figure appariée 467 → 755 · **dans le pli** à 1440 ; à 390 les deux cotations, leurs séries et les wei sont dans le pli, le `display` est entamé au bord | `PRET` + bouton à **562** (1440) et **694** (390) ; premier état inactif 549 → 593 et 744 → 788 · **dans le pli** |
| premier titre d'importance 2 | « Ce qu'il ramène » à 431 | « Ce qui change » à 431 |
| cibles < 24 px | **0** | **0** |

Les dix états sont rendus, visibles, grisés, chacun avec sa raison et son propre nom accessible.

### Écran 3 — `#/instrument`

Index collant : `<nav aria-label="les dix-sept panneaux de l'instrument">`, 17 entrées,
`aria-current="location"` suivi par `IntersectionObserver`, ancres `#/instrument/p-08` copiables.
Importance 1, le tableau registre-contre-mesure, dans le pli. **0 cible sous 24 px** (20 avant),
**0 nœud de contraste** (1 841 avant), **0 px de texte sous 4,5:1 sur le canevas du panneau 06**.

---

## 6. La forme du refus, jugée à l'écran

Les cinq surfaces qui dépendent de l'API absente passent toutes par le même composant `Absence`
(`src/components/Prim.tsx:188`) : `Route.tsx`, `Graph.tsx`, `Compte.tsx`, `Substituer.tsx`,
`Machine.tsx`. Il impose les trois pièces de la rubrique 5 — **ce qui manque**, **pourquoi**, **la
commande qui le ferait tourner ici** — plus un bouton de copie, qui respecte désormais ses 24 px.
`role="status"` + `aria-live="polite"` quand c'est une vraie panne, rien quand la pièce n'existe
simplement pas ici.

```
graphe non joignable   sans reponse
http://127.0.0.1:8787 injoignable (Failed to fetch) — aucun clone n'est
affiche, et surtout pas « 0 clone » : le graphe n'a pas repondu.
PYTHONPATH=engine python3 -m tare.graph.cli twins --hook 0xb429d62f…
[ COPIER LA COMMANDE ]
```

**Verdict : la forme tient, et de la même façon aux cinq endroits.** Le refus nomme la ressource,
donne l'erreur brute, dit ce qui n'est **pas** affiché et pourquoi le zéro serait un mensonge, et
rend la commande copiable. Ce n'est pas un trou, c'est une fonctionnalité, et ça se voit.

Réserves restantes, améliorations :
1. **Les textes de refus ne sont pas accentués** (« sans reponse », « n'est affiche », « le sondage
   s'est arrete »), ni certains titres de panneaux — le sommaire écrit « Le même swap, coté deux
   fois », le panneau « Le meme swap, cote deux fois ». Sur la surface dont le métier est de dire
   proprement ce qui manque, l'écart de soin se voit.
2. La commande change de forme d'un refus à l'autre (`cd apps/api && npm run dev` ici,
   `PYTHONPATH=engine python3 -m …` là). Exact dans les deux cas, mais un lecteur pressé lit deux
   produits différents.

---

## 7. Lighthouse

`npx lighthouse --preset=desktop --quiet --chrome-flags="--headless --no-sandbox" --output=json`,
sur le **build de production** servi par `vite preview` (port 4181), reconstruit après la correction
de `B1-r`. Sorties : `shots/qa/lighthouse.json` (= `#/`), `lighthouse--outil-1.json`,
`lighthouse--outil-7.json`, `lighthouse--instrument.json`.

| | `#/` | `#/outil/1` | `#/outil/7` | `#/instrument` |
|---|---|---|---|---|
| performance | 79 | 80 | 82 | 73 |
| **accessibilité** | **100** | **100** | **100** | **100** |
| bonnes pratiques | 100 | 100 | 100 | 96 |
| SEO | 91 | 91 | 91 | 91 |
| **LCP** | **1,8 s** | 1,8 s | 1,8 s | 1,8 s |
| **CLS** | **0,002** | 0,049 | 0 | 0,027 |
| Total Blocking Time | 170 ms | 160 ms | 140 ms | 290 ms |
| poids total transféré | 1 859 Kio | 1 859 Kio | 1 859 Kio | 1 958 Kio |

**Accessibilité : 88 / 96 / — / 93 → 100 / 100 / 100 / 100, aucun audit d'accessibilité en échec
sur aucune route.** La performance est stable aux trois passes (79‑82, et 69‑73 sur `#/instrument`,
la variation étant le bruit d'une mesure locale) : les correctifs sont structurels et n'ont rien
coûté.

**Le budget.**

| budget | cible | mesuré | verdict |
|---|---|---|---|
| LCP | < 2,5 s | 1,8 s partout | **tenu**, 0,7 s de marge |
| CLS | < 0,1 | 0 – 0,049 | **tenu**, le pire vaut la moitié du budget |
| JS initial | < 250 Ko gzip hors lazy | **1 824 Ko gzip** (8 843 Ko bruts), un chunk, aucun lazy | **dépassé ×7,3 — et assumé** |

Le dépassement est mesuré et dit, pas compté en défaut : les 125 072 mesures sont embarquées pour
que la page réponde sans une seule requête, et c'est cette décision qui fait tenir l'argument
« vérifie plutôt que de me croire ». Le fait remarquable reste que **le budget de temps tient quand
même**, parce que le canevas est peint par un `<style>` inline avant le premier octet de JS et
qu'aucune image n'entre dans le chemin critique. Détail du build :

```
index.js    8 842,76 Ko   gzip 1 823,56 Ko   ← les mesures embarquées
index.css      20,03 Ko   gzip     5,70 Ko
polices          127 Ko   (woff2, 8 sous-ensembles)
index.html       1,48 Ko   gzip     0,79 Ko
```

---

## 8. Ce qui reste — aucun bloquant

**Un chiffre à corriger dans `DESIGN.md`**
1. Rubriques 5 et 9 : remplacer « dix » par « douze » nœuds entiers dans le pli à 390, et
   « les deux suivants amorcés » par « les deux derniers amorcés ». Mesuré : 12 entiers, 2 amorcés,
   0 hors du pli. Le document sous-estime son propre résultat de deux nœuds — et le brief prévient
   qu'un seul chiffre faux coûte la crédibilité des autres.

**Améliorations, sans urgence**
2. Accentuer les textes de refus et les titres de panneaux de `#/instrument`.
3. Uniformiser le rappel de la commande de l'API locale en tête des panneaux concernés.
4. Panneau 06 : le libellé « sans hook, talon inerte, 0 bps par construction » est posé sur le nuage
   de points le plus dense du graphe, qui le traverse. La lisibilité y perd ce que le contraste y a
   gagné — le déplacer de quelques pixels au-dessus de la ligne, ou lui donner un fond plein,
   suffirait.
5. `Carte.tsx:340` — sortir du `title` seul pour les graduations de l'horloge.
6. Replier l'échantillon de cinq lignes du corpus derrière une interaction, comme la rubrique 5 le
   prévoit, en gardant le compte total affiché pour que la troncature se voie.

---

## 9. Ce qui a servi

`shots.sh` et `playwright-cli` (captures, console, redimensionnement, `emulateMedia`, `run-code`,
`eval`, `getAnimations`, tabulation) · le skill **web-design-guidelines**, règles récupérées à
l'exécution sur GitHub, appliqué à `apps/web/src/` · **axe-core 4.13.0**, injecté dans Chromium
faute de ChromeDriver compatible · **échantillonnage de pixels par rangée** sur `<canvas>`, là où
axe ne voit rien · **Lighthouse** desktop sur le build de production · `project/brief.json`
(`demo.path`, `demo.mustSeeIn10s`) et les rubriques 5 et 9 de `project/design/DESIGN.md` comme
référence de hiérarchie.

Preuves : `project/design/shots/qa/` — captures aux trois largeurs, pleine page, défilées,
reduced-motion a/b, plis propres, `curve-axes.png`, `refus-graphe.png`, `console.txt`, `axe.txt`,
8 `axe-*.json`, 4 `lighthouse*.json`.
