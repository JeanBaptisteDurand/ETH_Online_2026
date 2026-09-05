# 35 — TARE : CHARTE GRAPHIQUE ET PAGE DE PRÉSENTATION

> Document de travail. Complète le `34-TARE-FINAL.md`, ne le remplace pas.
> Portée : **`tare.xyz` (surface 1, la page de présentation)** + **la charte commune aux deux surfaces**.
> `tare.xyz/hooks` (surface 2, l'instrument) n'est pas re-cadré ici ; il hérite de la charte.
> Tout ce qui n'a pas été ouvert porte **NON VÉRIFIÉ**.

---

## 0. CE QUI A ÉTÉ RÉELLEMENT OUVERT, ET CE QUI NE L'A PAS ÉTÉ

**Ouvert et vérifié** — Awwwards (`/websites/webgl/`, `/websites/3d/`, `/websites/data-visualization/`,
`/websites/technology/`, `/websites/sites_of_the_day/` + 9 fiches détail) · CSS Design Awards
(`/website-gallery`, `/wotd-award-nominees`) · 6 sites de référence en direct, dont 4 en capture d'écran
(SSTR, wc26, stateofaidesign, dottxt) · 29 outils de la boîte à outils · `getdesign.md` (catalogue,
schéma d'URL, 2 fiches complètes, CGU) · usgraphics.com (boutique, extras, dépôts GitHub) ·
les tailles npm réelles via l'API Bundlephobia · les fichiers `LICENSE` bruts sur `raw.githubusercontent.com` ·
les woff2 latins réels servis par `fonts.gstatic.com`.

**NON VÉRIFIÉ, et donc non jugé ici** — le manifeste usgraphics cité au §10 du doc 34
(*« Expose state and inner workings »*, *« Dense, not sparse »*, *« Verbosity over opacity »*…) :
`usgraphics.com/manifesto` renvoie **404**, le sitemap complet du site ne contient **aucune page manifeste**,
et une recherche sur les phrases exactes ne retrouve rien. **La source de ces citations est introuvable.**
Ne les colle pas en tête d'un `DESIGN.md` public sans avoir retrouvé où elles sont publiées : un juge qui
cherche la citation ne la trouvera pas non plus. *(Ce qui suit remplace ces citations par des sources
vérifiables issues des dépôts open source de US Graphics — voir §1.9 et §4.)*

**Correction factuelle sur le doc 34, §9.** La phrase *« La catégorie Data Visualization d'Awwwards le
prouve — 3 des 4 fiches ouvertes sont des landings Framer »* n'est pas généralisable. La page 1 de cette
catégorie contient **31 sites** (`awwwards.com/websites/data-visualization/`), pas 4, et elle est paginée
sur 5 pages. Sur ces 31, une seule fiche parmi celles que j'ai ouvertes est effectivement du Framer
(HydraDB, tags `Figma` / `Framer`). Le verdict « écarter Awwwards » reposait sur un échantillon de 4.

---

# PARTIE I — AWWWARDS ET CSSDA, RÉELLEMENT EXPLORÉS

## 1.0 Le résultat transversal, avant les fiches

J'ai extrait les jetons de design réels (police, couleurs, `border-radius`, unité d'espacement) de
**six** sites primés, via le format `branding` de Firecrawl, qui lit le CSS calculé :

| Site | `border-radius` | unité de base | polices réelles |
|---|---|---|---|
| sstr.tech | **0px** | 4 | ABC Monument Grotesk |
| dottxt.ai | **0px** | 4 | PP Neue Montreal + PP Neue Montreal Mono + neueBit |
| eclipses.bogachev.fr | **0px** | — | **Space Grotesk + Space Mono** |
| drone.riotters.com | **0px** | 8 | Switzer + ProtoMono |
| web3.esqrd.co | **0px** | 4 | Play + Roboto |
| marketing.pinelabs.com/signaliq | **0px** | 4 | PP Telegraf |

> **Six sur six : `border-radius: 0`.** Ce n'est pas une opinion de goût, c'est une mesure.
> La charte TARE fixe le rayon à **0 partout, sans exception** (§4.5).

Deuxième régularité : **le rapport d'échelle typographique est extrême.** dottxt.ai : h1 **267 px**
contre body **12 px** (22:1). drone.riotters.com : h2 **240 px** contre body **14 px** (17:1).
esqrd : h1 110 px. Là où un site « corporate » plafonne à 3:1, ces sites poussent à 17–22:1.
**C'est le levier Awwwards le moins cher qui existe : il ne coûte pas un kilo-octet.**

## 1.1 SSTR — Friction Reduction · **la référence n°1**

- Fiche : https://www.awwwards.com/sites/sstr-friction-reduction — **Site of the Day, 16 août 2026**
- En direct : https://sstr.tech/en/
- Notes : global **7,17** (design 7,16 · usability 7,28 · creativity 6,98 · content 7,17) · **Dev Award 7,58**
- Stack déclarée : **GSAP · BARBA.js · Astro** · palette annoncée `#FE5B2A` / `#18191B`
- Description verbatim : *« Brand, site and 3D for a friction-reduction company in oil drilling.
  **Editorial minimalism that speaks the engineer's language: a modular grid, motion tuned to the hardware.** »*

**Ce qu'on lui prend, précisément.** Une section, vue en capture : un nuage de points **`WITH FRS` en
orange contre `WITHOUT FRS` en gris**, axes en monospace capitale (`DEPTH`, `HOOK LOAD, T`), grille en
pointillés, légende faite de **deux barres de nuancier suivies d'un libellé monospace**, et à droite le
chiffre `-231` en très grand avec la légende `Hook load on POOH`. C'est **littéralement la figure de TARE** :
la même grandeur mesurée deux fois, la version traitée en couleur, la version de référence en gris.
Le titre de section est *« FRICTION REDUCTION WHILE DRILLING. PROVEN BY DATA. »*
On prend aussi : la **mise en page en modules 2×2 à filets 1 px pleine largeur**, l'eyebrow
`▪ PROCESS` (carré orange 6 px + libellé monospace capitale espacé), et le **bouton à coins chanfreinés**
(octogone, pas un rayon) avec le glyphe `↳`.

**Ce qu'on ne lui prend pas.** Son **préchargeur** : la page affiche `// PLEASE WAIT` / `// LOADING..` et
un compteur `50 %` avant de montrer quoi que ce soit. C'est exactement l'interdit n°1 de TARE. Ni ses
rendus produit 3D plein cadre — TARE n'a pas d'objet à photographier.

## 1.2 `.txt` (dottxt.ai) — **la meilleure note de tout mon échantillon**

- Fiche : https://www.awwwards.com/sites/txt — Nominee, **24 août 2026**
- En direct : https://dottxt.ai
- Notes communautaires : design **8,0** · usability **8,6** · creativity 7,8 · content 8,4 → **≈ 8,2**
- Stack : React · Three.js · Sanity · tags `Retro`, `Transitions`, `Microinteractions`
- Description verbatim : *« Structured generation libraries for developers and AI teams. Build reliable
  LLM-driven applications with schema-compliant, predictable outputs. »*
- Jetons réels : fond `#F3F3F3`, encre `#000000`, `border-radius: 0px`, base 4, **h1 267 px / body 12 px**

**Ce qu'on lui prend.** Trois dispositifs, tous à coût nul :
1. **L'objet héros est la commande réelle et sa sortie réelle.** Un panneau flottant à chrome de fenêtre
   rétro (barre de titre à filets, croix `☒`) contenant `$ dottxt generate --model … --schema '{"valid":"boolean"}'`
   puis, en dessous, `{"valid": true}`. Pas une illustration de la promesse : **la promesse exécutée.**
   Pour TARE : le panneau héros contient les deux cotations et l'écart, pas un visuel de l'écart.
2. **L'eyebrow numéroté** : une pastille grise `01` suivie de `BY THE TEAM BEHIND OUTLINES (65M+ DOWNLOADS)`
   en monospace capitale. Numérote les sections, chiffre l'affirmation.
3. **La pastille de raccourci clavier** dans chaque item de nav et chaque bouton : `P Products`,
   `D Documentation`, `Try the API [A]`. Un carré 18 px, fond de couleur, lettre monospace.
   Ça dit « ceci est un instrument, pas une brochure » en 12 lignes de CSS.
   Et la **trame en damier 1 bit** utilisée comme texture, à la place d'un dégradé.

**Ce qu'on ne lui prend pas.** Sa **bannière de cookies** plein écran qui recouvre le héros à l'arrivée —
même faute que le préchargeur de SSTR. Et sa police d'affichage bitmap (`neueBit`) est une signature
d'auteur ; TARE ne doit pas la copier, seulement retenir le principe : *une seule police d'affichage,
radicalement différente du corps, réservée à un seul usage.*

## 1.3 Where the Shadow Fell — **la seule référence à polices entièrement libres**

- Fiche : https://www.awwwards.com/sites/where-the-shadow-fell — Nominee, **22 août 2026**
- En direct : https://eclipses.bogachev.fr — auteur `aleksandr-bogachev` (le même que wc26)
- Notes : design 7,6 · usability 7,6 · creativity 7,6 · content 7,9
- Stack : WebGL · Three.js · JavaScript · tag `Data Visualization`
- Description verbatim : *« Every solar eclipse from 2000 BCE to 3000 CE on one globe. Pick any city and
  watch the eclipse from inside it, the sky exactly as it stood over that street. »*
- **Jetons réels : `Space Grotesk` (corps + titres) + `Space Mono` (chiffres et métadonnées).
  Les deux sont sur Google Fonts sous SIL OFL 1.1.**

**Ce qu'on lui prend.** La preuve qu'**un site Awwwards de visualisation de données tourne sur deux
polices gratuites**. C'est la réponse directe à « Berkeley Mono est payant ». Et la **répartition des
rôles** : un grotesque pour la prose, un monospace pour tout ce qui est un chiffre, un identifiant ou
une étiquette. Jamais l'inverse.

**Ce qu'on ne lui prend pas.** Le globe Three.js. TARE n'a **aucune donnée spatiale** (doc 34, §11).

## 1.4 WC 2026 — Data Portraits

- Fiche : https://www.awwwards.com/sites/wc-2026-data-portraits — Nominee, **27 juillet 2026**, moyenne **7,48**
- En direct : https://wc26.bogachev.fr
- Stack : WebGL · Three.js · **GLSL**
- Description verbatim : *« Every FIFA World Cup 2026 match rebuilt in 3D from real data — ~1,500 events
  a game become readable terrain. Real-time WebGL, data-driven crowd sound, live scorer cards. **Coded solo.** »*

**Ce qu'on lui prend.** Trois choses vues en capture. (a) L'**eyebrow précédé d'un filet horizontal** :
`—— FIFA WORLD CUP 2026` en monospace très espacé. (b) L'**index de section en très grand monospace à
faible contraste** : `01  Knockout`, avec le décompte aligné à droite (`32 MATCHES`) et une **règle
horizontale sous le tout**. C'est la structure de sommaire d'un rapport technique, et elle est gratuite.
(c) La mention **« Coded solo »** dans la description Awwwards elle-même : c'est un argument de jury, et
TARE est aussi un projet solo. Écris-le.

**Ce qu'on ne lui prend pas.** Le terrain coloré en dégradé. La page elle-même l'admet :
*« It's an impression, but one built entirely from data »*. **TARE n'a pas droit à l'impression.**
C'est le produit qui dénonce les chiffres embellis ; une image « impressionniste » de la mesure serait
une contradiction de fond.

## 1.5 Lidar Drone Scanning

- Fiche : https://www.awwwards.com/sites/lidar-drone-scanning — Nominee, **29 août 2026** — `DawidRiotters`
- En direct : https://drone.riotters.com
- Stack : WebGL · Three.js · **Next.js**
- Description verbatim : *« A Riotters R&D experiment turning raw drone LIDAR scans into a real-time 3D
  point cloud, rendered live in the browser with WebGL. »*
- Jetons réels : `Switzer` + `ProtoMono`, fond `#FFFFFF`, encre `#171717`, **base 8 px**, `radius 0`,
  **h2 240 px / body 14 px**

**Ce qu'on lui prend.** Le **cadrage éditorial d'un instrument de mesure** : un site qui présente
littéralement *une mesure physique brute* et qui ne s'excuse pas de sa technicité. Et le rapport d'échelle
240/14. Et l'unité d'espacement à **8 px** — plus rigide que 4, donc plus difficile à salir.
La fiche liste ses composants nommés : `website scroll`, `content switcher`, `menu transition`,
`terrain scan`. **Quatre mouvements pour tout un site.** C'est le budget d'animation que TARE doit tenir.

**Ce qu'on ne lui prend pas.** Le nuage de points temps réel : c'est un rendu 3D de données 3D. Légitime
chez eux, mensonger chez nous. **Ni sa typographie :** `Switzer` est distribuée par Fontshare sous
**ITF Free Font License**, qui interdit explicitement la redistribution *« through … a repository »* et
tout sous-ensemblage (§4.4). Elle ne peut pas entrer dans le dépôt de TARE.

## 1.6 Signal IQ (Setu by Pine Labs)

- Fiche : https://www.awwwards.com/sites/signal-iq-setu-by-pine-labs — **Honorable Mention, 31 juillet 2026**, moyenne **8,19**
- En direct : https://marketing.pinelabs.com/signaliq
- Stack : React · TypeScript · Framer · palette annoncée `#FD0100` / `#000000`
- Jetons réels : `#00E676` (vert), `#FD0100` (rouge), fond `#FFFFFF`, encre `#0A0A0A`, `radius 0`
- Description verbatim : *« India's only AI-powered bank statement analyser that reads UPI transactions,
  **uncovering hidden income, obligations and risk signals** traditional BSAs miss. »*

**Ce qu'on lui prend.** Le **positionnement**, mot pour mot transposable : *« uncovering hidden … signals
traditional [tools] miss »*. C'est la phrase de TARE dans un autre domaine, et elle a pris 8,19 avec une
Honorable Mention. On prend aussi le **système à deux couleurs signées** : un vert et un rouge, et rien
d'autre — l'un dit « détecté », l'autre dit « risque ». Aucune couleur décorative.

**Ce qu'on ne lui prend pas.** Sa palette exacte : `#00E676` sur blanc est en dessous de 3:1, illisible
en petit corps. TARE ne peut pas se le permettre sur une table dense.

## 1.7 AI in Design Report 2026

- Fiche : https://www.awwwards.com/sites/ai-in-design-report-2026 — **Site of the Day, 26 août 2026** + Developer Award
- En direct : https://stateofaidesign.com

**Ce qu'on lui prend.** Un seul dispositif, vu en capture, mais excellent : la **puce de légende monospace
à filet 1 px, ancrée dans le coin inférieur gauche d'un panneau** — `DESIGN ENGINEER`, `PRODUCT DESIGNER`,
`BRAND DESIGNER`, `FREELANCER`. Fond translucide, texte 10 px capitale espacée, bordure hairline, rayon 0.
**C'est exactement le composant dont TARE a besoin** pour porter `MESURE` / `INTERPOLE` / `NON_MESURABLE` /
`NON_COTABLE` sans jamais recourir à la couleur (§4.2). Et le titre est posé dans un **bloc noir plein**
qui déborde le contenu — un cartouche, pas un titre flottant.

**Ce qu'on ne lui prend pas.** Le collage de fleurs floutées en fond. C'est un rapport de données qui a
choisi de ne rien montrer de ses données au-dessus de la ligne de flottaison. **TARE fait l'inverse.**

## 1.8 Cerebrium

- Fiche : https://www.awwwards.com/sites/cerebrium — Nominee, **5 août 2026** — équipe de 8, dont Louis Paquet (PRO)
- En direct : https://cerebrium.ai
- Stack : GSAP · Three.js · **Cinema 4D** · WebGL · **Lottie**
- Description verbatim : *« Serverless infrastructure for real-time AI. Deploy voice agents, LLMs, and AI
  workloads with instant scaling, global regions, and **built-in observability**. »*

**Ce qu'on lui prend.** Rien de visuel. On le retient comme **étalon négatif chiffré** : huit personnes
créditées, Cinema 4D, GSAP, Three.js, Lottie — et le résultat est *nominé*, pas Site of the Day.
SSTR, avec **une** personne créditée (Dmitry Golub) et **zéro 3D temps réel**, a pris le SOTD et un
Dev Award de 7,58. **Sur Awwwards, la 3D ne remplace pas la direction éditoriale.** Pour un dev solo en
sept jours, c'est l'information la plus utile de la partie I.

## 1.9 CSS Design Awards — le verdict honnête

Ouvert : https://www.cssdesignawards.com/website-gallery et https://www.cssdesignawards.com/wotd-award-nominees.
**Sur les 18 nominés WOTD affichés (24–29 août 2026), la très grande majorité sont des portfolios
individuels ou des sites d'agence.** Les seuls candidats non-portfolio sont `Xerx` (xerx.io/en),
`Charmling` (charmling.app), `Agent Media` (agent-media.ai) et **`ESQRD — Web3 Development`**
(https://www.cssdesignawards.com/sites/esqrd-web3-development/50048/ → https://web3.esqrd.co).

**ESQRD est la seule référence CSSDA que je retiens**, et pour une seule raison mesurée : c'est un site
**web3** sur fond `#101010` avec `border-radius: 0`, `h1` à **110 px** et une palette entièrement
désaturée (`#998963`, `#70654A`, `#7C756C`) — **aucune couleur de marque crypto**. Il prouve qu'on peut
faire un site web3 primé sans violet, sans dégradé néon et sans mascotte. C'est tout ce qu'on lui prend.

> **Conclusion sur CSSDA : source faible pour ce projet.** Le barème CSSDA est plus permissif
> (seuil annoncé « average score above 8.00 » d'un jury) et le vivier est dominé par les portfolios.
> **Awwwards est la bonne source ; CSSDA n'ajoute rien qu'Awwwards ne donne mieux.**

## 1.10 Les huit références, en une ligne chacune

| # | Référence | URL vivante | Ce qu'on prend | Ce qu'on ne prend pas |
|---|---|---|---|---|
| 1 | **SSTR** | sstr.tech/en | figure *avec / sans* en 2 couleurs, grille modulaire à filets, eyebrow ▪ | le préchargeur |
| 2 | **.txt** | dottxt.ai | héros = la commande + sa sortie réelles ; puce de raccourci ; damier 1 bit | la bannière cookies, la fonte bitmap |
| 3 | **Where the Shadow Fell** | eclipses.bogachev.fr | Space Grotesk + Space Mono, tous deux OFL ; répartition prose/chiffres | le globe Three.js |
| 4 | **WC 2026 Data Portraits** | wc26.bogachev.fr | index de section `01` + filet + décompte à droite | le terrain « impressionniste » |
| 5 | **Lidar Drone Scanning** | drone.riotters.com | base 8 px, ratio 240/14, **4 mouvements pour tout le site** | le nuage 3D, **et sa police Switzer (Fontshare, non redistribuable)** |
| 6 | **Signal IQ** | marketing.pinelabs.com/signaliq | « uncovering hidden signals traditional tools miss » ; 2 couleurs signées | ses valeurs exactes (contraste insuffisant) |
| 7 | **AI in Design Report** | stateofaidesign.com | la puce-légende monospace à filet, ancrée en coin | le collage décoratif au-dessus du pli |
| 8 | **ESQRD** *(CSSDA)* | web3.esqrd.co | web3 primé, fond `#101010`, zéro couleur crypto | son titrage `Play`/`Roboto` |

*Étalon négatif retenu en plus : **Cerebrium** (cerebrium.ai) — 8 auteurs, C4D + GSAP + Three + Lottie,
et nominé seulement.*

---

# PARTIE II — LA BOÎTE À OUTILS NON OUVERTE, MAINTENANT OUVERTE

29 outils ouverts un par un. Colonne « verdict » = utilisable dans le dépôt **open source** exigé par
Uniswap, sans filigrane et sans clause de non-redistribution.

## 2.1 Les trouvailles

| Outil | Ce que c'est | Licence / plan gratuit (vérifié) | Poids gzip | Verdict |
|---|---|---|---|---|
| **Paper Shaders** — https://github.com/paper-design/shaders | shaders canvas, publiés par paper.design | **Apache-2.0** (fichier `LICENSE` lu) · npm `@paper-design/shaders` Apache-2.0 · **0 dépendance** · plan Paper gratuit, **aucun filigrane** sur la page pricing | **59,9 kB** | **OUI**, en option seulement (§5) |
| **usgraphics/usgc-themes** — https://github.com/usgraphics/usgc-themes | les **vraies** palettes de US Graphics | **BSD-3-Clause**, 166 ★ | 0 | **OUI — la trouvaille** |
| **usgraphics/usgc-machine-report** — https://github.com/usgraphics/usgc-machine-report | le TR-100 Machine Report | **BSD-3-Clause**, 583 ★ | 0 | **OUI** (doctrine, §4) |
| **Uiverse** — https://uiverse.io | 7 418 éléments UI communautaires | **MIT** confirmé par le `LICENSE` de `uiverse-io/galaxy` (12 220 ★) : *« Copyright (c) 2023 Uiverse.io »*, attribution *« not mandatory »* | 0 (CSS) | **OUI sur la licence**, mais ~95 % du catalogue est du néon/glassmorphism inutilisable ici |
| **Motion Primitives** — https://motion-primitives.com | composants animés copier-coller | **MIT** (`ibelick/motion-primitives`), 6,1k ★ | 0 (+ `motion`) | **OUI** |
| **Matter.js** — https://brm.io/matter-js/ | moteur physique 2D | **MIT**, 0 dépendance | 25,9 kB | **NON** — TARE n'a rien à faire tomber |
| **Haikei** — https://haikei.app | générateur d'assets SVG | *« You can use Haikei for both personal and professional projects »*, *« you do not need to credit Haikei »* | 0 | **OUI**, mais on n'en a pas l'usage (aucune vague, aucun blob) |
| **neumorphism.io** — https://neumorphism.io | générateur de `box-shadow` | **BSD-3-Clause** (`adamgiebl/neumorphism`) | 0 | **NON** — la charte interdit les ombres (§4.5) |
| **Khroma** — https://khroma.co | générateur de palettes IA | pas de CGU trouvées, gratuit | 0 | **NON** — la palette de TARE est **calculée**, pas choisie (§4.1) |
| **svgl.app** — https://svgl.app | ~666 logos SVG | **MIT** (`pheralb/svgl`) | statique | **OUI** pour les logos Uniswap / Base / Hedera — ⚠️ les marques restent celles de leurs propriétaires |
| **Component Gallery** — https://component.gallery | 60 composants × 95 design systems | pas de licence, consultation libre | 0 | **OUI** en référence de nommage |
| **UI Guideline** — https://uiguideline.com | 38 composants × 20 design systems, specs ARIA | site gratuit ; Spec Packs $9/$149 | 0 | **OUI** en consultation gratuite. **Ne paie pas** |
| **Design Spells** — https://designspells.com | galerie de micro-détails d'interface | aucune licence, aucune CGU | 0 | **OUI** en inspiration, **NON** comme source de code |
| **Figma MCP (distant)** — help.figma.com/hc/en-us/articles/32132100833559 | serveur MCP officiel Figma | serveur **distant** : *« all seats and plans »*. Serveur desktop : *« a Dev or Full seat »* sur *« all paid plans »* | 0 | **OUI** techniquement — **NON** en pratique : il faut d'abord un fichier Figma, et tu n'en auras pas le temps en 7 jours |
| **LottieFiles** — https://lottiefiles.com/page/license | animations Lottie | **Lottie Simple License** : usage commercial explicite, *« Use of Files without attributing the creator(s) is permitted »*, **aucun filigrane** — mais **share-alike** : chaque `.json` reste sous cette licence | 33 kB (dotLottie) | **NON** — 33 kB de runtime pour ce que `motion` fait déjà, plus une seconde licence à documenter |
| **Transitions.dev** — https://transitions.dev/terms.html | transitions CSS/React copier-coller | *« unlimited personal and commercial projects »* MAIS *« you may not … redistribute the library itself … as a competing … component kit »* | 0 | **⚠️ OUI pour 3–4 snippets maximum.** Un dépôt sous MIT annoncerait un droit de redistribution que cette licence ne t'accorde pas |

## 2.2 Les écartés, avec le motif exact

| Outil | Motif — vérifié |
|---|---|
| **Spline** — spline.design/pricing | **Double disqualification.** Plan Free : *« Web exports **with watermark** »* ; « No watermark on web exports » n'arrive qu'à Hobby $12/mo. **Et** `@splinetool/react-spline` et `@splinetool/runtime` déclarent `license: None` sur npm — donc **tous droits réservés par défaut**. Runtime 35,5 Mo décompressés |
| **Rive** — rive.app/pricing | Runtime `@rive-app/react-canvas` bien **MIT**, mais le plan Free **ne permet pas l'export** : *« FREE TO CREATE · $9/MO TO SHIP »*, et « Export .riv files » est la feature-clé du plan **Cadet $9**. Pas un filigrane — un blocage total. 55 kB + WASM ~4,8 Mo |
| **ShaderGradient** — shadergradient.co | MIT déclaré sur npm et dans le README, **mais aucun fichier `LICENSE` dans `ruucm/shadergradient`** (2 153 ★, API GitHub → `license: None`). Surtout : peer-deps `three` (182 kB gz) + `@react-three/fiber` (52 kB gz) → **≈ 283 kB gzip pour un dégradé**. Paper Shaders fait la même chose en 60 kB sans dépendance |
| **Intangible** — intangible.ai/pricing | ⚠️ `intangible.studio` **n'a pas de DNS**. Sur le vrai domaine : Free = *« Download images: **Watermarked** »*, *« Download video: **Watermarked** »*, *« 3D scene export: ✕ »* |
| **Meshy AI** — meshy.ai/pricing | Free : *« we grant you a CC BY 4.0 license instead »* + *« We kindly ask that you credit Meshy »*. Et hors sujet : aucun objet 3D dans TARE |
| **Rotato** — rotato.app/pricing | **Aucun plan gratuit.** Basic **€79**, Standard €89, Premium €199, « One-time payment ». Et c'est un outil de mockups d'appareils mobiles |
| **Mobbin** — mobbin.com/pricing | Contenu propriétaire (captures d'apps tierces). *« © Mobbin 2018–2026. All rights reserved »*, licence *« non-exclusive »*. Free : pas de téléchargement d'écran. **Inspiration privée uniquement** |
| **Screenlane** — screenlane.com | ⚠️ **301 permanent vers pageflows.com.** Le service n'existe plus sous ce nom. Page Flows : **aucun plan gratuit**, essai 3 j à $2,95 puis $13/mois |
| **wonjyou.studio** | ⚠️ **Erreur dans la liste de départ.** C'est le site de **coaching et mentorat design** de Won J You (Calendly + email). Rien à en tirer |
| **Icons8** — help center Icons8 | Free : *« Must embed on their website … at least one visible and clickable link to the website of Icons8 »*. **Backlink obligatoire** |
| **svgs.app** | ⚠️ **Différent de svgl.app.** Générateur SVG par IA. CGU : *« Users on the free plan are granted a … license to use Generated Content for **personal, non-commercial purposes only** »* |
| **21st.dev** — 21st.dev/terms | **Aucune licence globale.** *« are the sole and exclusive property of their respective authors and 21st Labs Inc. »* Importable seulement composant par composant, licence individuelle vérifiée |
| **termcn** — termcn.dev | ⚠️ **Piège majeur.** Le nom, l'org `shadcn-labs` et « works seamlessly with shadcn/ui » laissent croire à une lib web à esthétique terminal. C'est faux : *« Built on **Ink and OpenTUI** »* — ça rend dans un **vrai terminal (stdout)**, pas dans le DOM. MIT propre, **zéro ligne réutilisable** |
| **Framer** — framer.com/pricing | *« The 'Made in Framer' badge will automatically disappear once you connect a custom domain or upgrade »* → domaine perso = payant. Et ça ne produit pas de dépôt open source |
| **Webflow** | Starter gratuit : sous-domaine `.webflow.io`, **2 pages statiques**, badge « Made in Webflow ». Insuffisant pour deux surfaces. *(tarifs exacts : **NON VÉRIFIÉ** en direct — page inaccessible, chiffres issus du help center)* |

## 2.3 La stack front finale, avec les poids réels

Mesurés à l'API Bundlephobia le 29/08/2026, licences lues sur npm et `raw.githubusercontent.com` :

| Paquet | Licence | gzip | Rôle |
|---|---|---|---|
| `uplot` **1.6.32** | **MIT** | **21,3 kB** · 0 dép. | la courbe |
| `@tanstack/react-table` **9.2.4** | **MIT** | **31,0 kB** | la matrice dense |
| `motion` **13.1.1** | **MIT** — *« Copyright (c) 2024 Motion B.V. »* | **44,3 kB** | transitions d'état du tableau |
| `d3-scale` **4.0.2** | **ISC** | **15,6 kB** | échelles log / séquentielles |
| `shadcn/ui` | **MIT** — *« Copyright (c) 2023 shadcn »* | copié dans le dépôt | primitives |
| `clsx` 2.1.1 | MIT | 0,3 kB | — |
| *(option)* `@paper-design/shaders` 0.0.80 | **Apache-2.0** | 59,9 kB · 0 dép. | fond animé du héros |

**Total obligatoire hors React : 112,5 kB gzip.** Avec React+ReactDOM (~45 kB) : **≈ 158 kB**.
Avec Paper Shaders : **218 kB**. *(→ voir §5.9 : le shader est en chargement différé ou coupé.)*

---

# PARTIE III — `getdesign.md`

## 3.1 Ce que c'est, réellement

https://getdesign.md — un répertoire de fichiers `DESIGN.md` prêts à donner à un agent de code, pour
qu'une UI générée porte un langage visuel identifié au lieu du rendu par défaut.
**Schéma d'URL : `https://getdesign.md/<marque>/design-md`.** Installation annoncée sur chaque fiche :

```
npx getdesign@latest add vercel
```
> *« Run this command from your project root, then ask your AI assistant to use DESIGN.md for UI work. »*

**Catalogue vérifié (~76 marques)** : Airbnb, Airtable, Apple, Binance, BMW, BMW M, Bugatti, Cal.com,
Claude, Clay, **ClickHouse**, Cohere, Coinbase, Composio, Cursor, Dell (1996), Discord, ElevenLabs, Expo,
Ferrari, Figma, Framer, HashiCorp, HP, **IBM**, Intercom, Kraken, Lamborghini, **Linear**, Lovable,
Mastercard, Meta, MiniMax, Mintlify, Miro, Mistral AI, MongoDB, Mobbin, Nike, Nintendo (2001), Notion,
NVIDIA, Ollama, OpenCode, Pinterest, PlayStation, **PostHog**, **Raycast**, Renault, Replicate, Resend,
Revolut, Runway, Sanity, **Sentry**, Shopify, Slack, SpaceX, Spotify, Starbucks, Stripe, Supabase,
Superhuman, Tesla, **The Verge**, Together AI, Uber, **Vercel**, Vodafone, VoltAgent, **Warp**, Webflow,
**WIRED**, Wise, xAI, Zapier. Plus une seconde série sous `/design-md/<slug>` (Ramp, Kalshi, Steep,
Specify, Basehub, Superlist, Whimsical, Linear…).

## 3.2 ⚠️ La réserve de licence, à lire avant de committer quoi que ce soit

CGU lues sur https://getdesign.md/terms :

> *« All DESIGN.md files available in the public directory are free to browse, download, and use in your
> projects. These files are provided 'as is' without warranty »*

> *« All trademarks, brand names, logos, and product names referenced anywhere on the Service … are the
> property of their respective owners »*

Et chaque fiche porte l'avertissement :
> *« Independent analysis of publicly observable patterns … **Not affiliated with or endorsed by** ClickHouse ;
> ClickHouse and its logo are trademarks of their respective owner. »*

**Traduction opérationnelle : « free to use in your projects » ≠ droit de redistribution.**
Aucune licence open source n'est accordée sur les fichiers gratuits.

> **Règle pour TARE : lis le fichier, ne le committe pas.** Le dépôt public de TARE contient un
> `DESIGN.md` **écrit pour TARE**, avec la structure de la partie IV ci-dessous et **ses propres valeurs**.
> Committer `clickhouse/DESIGN.md` dans un dépôt MIT, sur un track sponsorisé, c'est exposer une clause
> de marque à un juge qui lit les licences.

## 3.3 Lequel conviendrait comme point de départ — **ClickHouse**

https://getdesign.md/clickhouse/design-md. Quatre raisons, pas une de goût :

**a) C'est le seul du catalogue dont le produit est un moteur de mesure.** Le fichier s'ouvre sur :
> *« A high-performance database interface anchored on **near-pure black canvas with electric yellow as
> the brand voltage**. White typography in confident bold sans, yellow CTAs, and **yellow stat numbers**
> carry the brand voice. »*

**b) Il énonce déjà la règle de couleur de TARE.** Section « 01 — Color Palette » :
> *« **Single-accent system.** Electric yellow handles CTAs, stat numbers, and full-bleed yellow CTA bands.
> **Everything else is black canvas + white type + dark surface cards.** »*

**c) Il énonce déjà la règle d'ombre de TARE.** Section « 12 — Elevation & Depth » :
> *« **No drop shadows.** Depth comes from black-canvas vs surface-card subtle contrast and yellow-vs-black
> extreme contrast. »*
> et *« Subtle hairline 1px `#2a2a2a` »*

**d) Ses deux polices sont libres.** *« Inter at 700 for display (with -1 to -2.5px tracking), 600 for
sub-titles + buttons, 400 for body. **JetBrains Mono for code**. »* — Inter et JetBrains Mono sont toutes
deux sous **SIL OFL 1.1** (`google/fonts/ofl/inter/OFL.txt`, `google/fonts/ofl/jetbrainsmono/OFL.txt`).
C'est le seul candidat sérieux dont on peut reprendre la typographie **sans acheter une licence**.

**La rampe de surfaces est directement reprenable** (ce sont des valeurs de gris, non protégeables) :
`canvas #0a0a0a` → `surface-soft #121212` → `surface-card #1a1a1a` → `surface-elevated #242424` →
`hairline #2a2a2a`. Échelle d'espacement : `4 · 8 · 12 · 16 · 24 · 32 · 48 · 96`.

**Ce qu'on rejette de ClickHouse :** son jaune `#faff69` (c'est une couleur de marque, et TARE n'a pas
le droit d'avoir une couleur de marque décorative — §4.1) et son échelle de rayons `4 · 6 · 8 · 12 · pill`
(TARE est à 0).

**Second choix, et pourquoi il perd.** https://getdesign.md/vercel/design-md est plus abouti :
*« Vercel's Geist system is an exercise in subtraction: near-black ink on a near-white sheet, where a
single tone carries every heading, CTA, and 1px border »*, échelle typo complète
(`display-xl 48px · 600 · lh 48px · ls -2.4px`, `mono-eyebrow 12px · 500 · lh 16px`), échelle d'espacement
`4 → 96`. **Il perd pour deux raisons :** ses boutons pilules 100 px et ses cartes à 12 px de rayon sont
l'inverse exact de la mesure du §1.0 ; et **l'esthétique Vercel est devenue le rendu par défaut de tous
les sites générés par IA en 2026** — un juge la lira comme « vibe-codé », ce qui est précisément le
reproche à éviter.

**Non retenus, sans les avoir jugés visuellement :** IBM, PostHog, Warp, Sentry, Linear, The Verge, WIRED
— fiches existantes (HTTP 200 vérifié) mais **non ouvertes en détail**. **NON VÉRIFIÉ.**

---

# PARTIE IV — LA CHARTE GRAPHIQUE

> Elle vaut pour **les deux** surfaces. Une seule différence, énoncée §4.1 : l'instrument n'autorise
> la couleur que pour encoder une grandeur ; la page de présentation a le droit d'occuper plus d'espace
> et de monter plus haut en échelle typographique. **Elle n'a pas le droit d'ajouter une couleur.**

## 4.1 La règle de couleur, avant la palette

1. **Une seule famille chromatique existe : la rampe de mesure.** Elle encode `bps`, et uniquement `bps`.
2. **Tout le reste de l'interface est achromatique** — neutres seuls.
3. **Une seule couleur non quantitative est tolérée : le bleu d'interaction** (focus, lien).
   Il est **froid**, donc jamais confondable avec la rampe qui est chaude.
   → *Le chaud dit « c'est grand ». Le bleu dit « tu peux agir ». Rien d'autre ne parle en couleur.*
4. **Les étiquettes qualitatives ne sont jamais colorées.** `MESURE` / `INTERPOLE` / `NON_MESURABLE` /
   `NON_COTABLE` sont **typographiques** : monospace 10 px capitale, filet 1 px, rayon 0
   (le dispositif de stateofaidesign.com, §1.7). Colorer un label, c'est faire croire à une grandeur.
5. **La couleur de marque de TARE est le haut de la rampe.** Le produit n'a pas de couleur d'agrément :
   **sa couleur d'identité est sa couleur d'alarme.** C'est cohérent avec la thèse, et ça se raconte.

## 4.2 La rampe de mesure — **calculée, pas choisie**

Elle n'est pas issue d'un générateur de palettes. C'est la colormap **`inferno`** (perceptuellement
uniforme, publiée, sûre pour les déficiences de vision des couleurs, domaine public via matplotlib),
tronquée à `[0.18 ; 0.90]` et échantillonnée sur **7 paliers logarithmiques**.
US Graphics publie d'ailleurs `usgraphics/van-gogh` — *« Perceptually linear colormaps »*, **BSD-3-Clause** —
c'est la même doctrine.

| Palier | Domaine `bps` | Hex | Fond de cellule (22 % sur `--bg-1`) | Contraste encre |
|---|---|---|---|---|
| `m0` | 0 | `#390963` | `#191025` | **15,25** |
| `m1` | ]0 ; 1] | `#6A176E` | `#241328` | 14,53 |
| `m2` | ]1 ; 10] | `#9B2964` | `#2F1726` | 13,70 |
| `m3` | ]10 ; 30] | `#CA404A` | `#391C20` | 12,80 |
| `m4` | ]30 ; 100] | `#EB6628` | `#402418` | 11,74 |
| `m5` | ]100 ; 300] | `#FB9B06` | `#443011` | 10,39 |
| `m6` | > 300 | `#F6D746` | `#433D1F` | **9,05** |

*Contraste calculé pour l'encre `#E8EAED` — **plancher 9,05 : AAA (7:1) tenu sur tous les paliers.***
Le contraste décroît de façon **monotone** avec la valeur : il ne contredit jamais l'encodage, il le double.

**Construction d'une cellule** (identique en clair et en sombre) :
`background: color-mix(in srgb, var(--m-N) 22%, var(--bg-1))` **+** `box-shadow: inset 3px 0 0 var(--m-N)`.
La barre à pleine saturation porte le signal, le fond porte l'ordre, **l'encre ne change jamais**.
> Une encre qui change de couleur avec le fond ferait varier le contraste sans encoder quoi que ce soit.

`m6` **est** la couleur de marque de TARE : **`#F6D746`**.

## 4.3 La palette complète

### Mode sombre — **par défaut**

```css
:root {
  /* surfaces — rampe de gris, doctrine ClickHouse §12 : la profondeur est un pas de surface, pas une ombre */
  --bg:          #08090A;  /* canevas */
  --bg-1:        #101214;  /* panneau, ligne paire du tableau */
  --bg-2:        #17191C;  /* panneau surélevé, champ de saisie */
  --bg-3:        #1E2125;  /* survol de ligne, en-tête collant */

  /* filets — 1 px, jamais 2 sauf règle d'en-tête */
  --line:        #24272B;
  --line-strong: #383C42;

  /* encres */
  --ink:         #E8EAED;  /* texte primaire, chiffres */
  --ink-2:       #A2A9B0;  /* étiquettes, en-têtes de colonne */
  --ink-3:       #6B7178;  /* unités, incertitudes, provenance */
  --ink-4:       #454A50;  /* graduations, filets d'axe */

  /* rampe de mesure — la SEULE famille chromatique */
  --m-0: #390963; --m-1: #6A176E; --m-2: #9B2964; --m-3: #CA404A;
  --m-4: #EB6628; --m-5: #FB9B06; --m-6: #F6D746;

  /* la seule couleur non quantitative — froide, donc non confondable */
  --focus:       #3376F6;  /* usgraphics/usgc-themes · RETICLE · Ansi 12 · BSD-3-Clause */

  /* série de référence — TOUJOURS grise. Le contrefactuel n'a pas de couleur. */
  --baseline:    #6B7178;
}
```

**Provenance des accents.** `#3376F6` est la valeur `Ansi 12 Color` du thème **RETICLE** de
`usgraphics/usgc-themes`, sous **BSD-3-Clause** — lue dans
`themes/iterm/USGC-RETICLE-IT.itermcolors`. Le thème complet, si tu veux d'autres valeurs
authentiquement US Graphics et **légalement réutilisables** :
`Background #000000` · `Foreground #459A65` · `Ansi 1 #CD0400` · `Ansi 3 #F6C443` · `Ansi 5 #EA3D8D` ·
`Ansi 8 #484747` · `Ansi 15 #FEFEFF` · `Cursor #868D96`.
> **C'est la réponse propre au problème « Berkeley Mono est payant » : US Graphics publie ses couleurs
> sous BSD-3-Clause. On prend les couleurs à la source, sous licence, sans acheter la fonte.**

### Mode clair — même système, rampe ré-ancrée

```css
:root[data-theme="light"] {
  --bg: #F7F7F5; --bg-1: #FFFFFF; --bg-2: #F0F0ED; --bg-3: #E7E7E3;
  --line: #D9D9D4; --line-strong: #B4B4AE;
  --ink: #14171A; --ink-2: #4A4F55; --ink-3: #767C83; --ink-4: #A8ADB3;
  /* YlOrRd [0.05;0.80] — inferno inversé serait illisible sur papier */
  --m-0:#FFF8BB; --m-1:#FFE590; --m-2:#FECA66; --m-3:#FEA446;
  --m-4:#FD7435; --m-5:#F23924; --m-6:#D41020;
  --focus:#1B4FC4; --baseline:#767C83;
}
```
Fonds de cellule calculés à **30 %** sur `#F7F7F5` : contraste encre de **16,67 à 9,94**. AAA tenu.

**Pourquoi le sombre est le défaut, et ce n'est pas une question de goût.** La rampe encode une
extraction. Sur canevas noir, `0 bps` se confond presque avec le fond et `> 1 000 bps` est incandescent :
l'intensité lumineuse va dans le même sens que la grandeur. Sur papier blanc, une rampe chaude doit
démarrer à un jaune déjà visible — **« zéro » aurait une apparence**. Le sombre est le mode où la rampe
ment le moins.

## 4.4 Typographies — noms réels, licences réelles, poids réels

### ⛔ Berkeley Mono est doublement disqualifiée — vérifié

Sur https://usgraphics.com/products/berkeley-mono, la section licence dit textuellement :

> *« **Commercial licenses are not compatible with open-source apps.** Commercial use restricted to UI
> elements only. If you're building an IDE, Terminal app, Text Editor, etc., we generally do not allow it »*

Ce n'est pas seulement payant (~$75 pour la licence Developer / usage personnel, réf. catalogue `FX-102` ;
*« Commercial use is not covered »*). **C'est explicitement incompatible avec un dépôt open source.**

Et l'essai gratuit `FX-050` n'est pas une porte de sortie : https://usgraphics.com/catalog/FX-050 —
*« All trial typeface stock units are valid for 7 days and can be used for evaluation purposes only »*,
**Commercial Use: No**, et les glyphes `/`↔`\` et `*`↔`#` sont **délibérément permutés** pour rendre
tout usage réel impossible. La fiche technique du SKU TX-02 (Berkeley Mono v2) porte
*« Proprietary and non-transferrable »*.

> **Cette phrase mérite d'être citée telle quelle dans le `DESIGN.md` de TARE.** Elle explique en une
> ligne pourquoi le projet ne porte pas la fonte de sa propre référence esthétique.

### ⛔ Et Fontshare aussi — piège non évident

**Satoshi, General Sans et Switzer sont marquées « Closed Source » sur Fontshare** et régies par
l'**ITF Free Font License v2.0** (https://www.fontshare.com/licenses/itf-ffl). Citations littérales :

> *« The Font Software may not … be distributed … or otherwise made available to any other person or
> entity, whether for free or for a fee. **This includes distributing the Font Software through another
> font website, font library, marketplace, repository**, download service, application or platform »*

> *« You may not modify … the Font Software … **This includes modifying or replacing glyphs, subsetting,
> format conversion** »*

**Committer un `.woff2` Satoshi ou Switzer dans un dépôt GitHub public viole la licence** — le mot
« repository » y est nommé — **et le sous-ensemblage est également interdit.**
⚠️ **Conséquence sur la référence §1.5 : drone.riotters.com est composé en Switzer. Sa typographie
n'est pas copiable.** On lui prend son échelle et son unité d'espacement, pas ses polices.

Écartées pour la même raison, toutes vérifiées comme commerciales non redistribuables : **Söhne**
(klim.co.nz), **Suisse Int'l** (swisstypefaces.com), **Neue Haas Grotesk**, **Nitti** (boldmonday.com),
**Basis Grotesque** (Colophon). *(Prix exacts : **NON VÉRIFIÉ** — grilles chargées en JavaScript.)*

### La fonte libre la PLUS PROCHE de Berkeley Mono : **Ioskeley Mono**

https://github.com/ahatem/IoskeleyMono — **SIL OFL 1.1** (`Copyright (c) 2025, Ahmed Hatem`,
fichier `LICENSE` lu). C'est une reconstruction de Berkeley Mono par le moteur **Iosevka**, et son
`private-build-plans.toml` **publie les métriques cibles** :

```toml
zero = "dotted"          # zéro POINTÉ, pas barré
tittle = "square"        # point du i CARRÉ
punctuation-dot = "square"
[metricOverride]  xHeight = 520   cap = 690   ascender = 740
# WIDTHS : 100 = Normal → shape 600
```

Soit, sur 1000 UPM : **chasse 600 · hauteur d'x 520 · capitale 690 · zéro pointé · points carrés.**
Le dépôt décline lui-même toute affiliation : *« not an official version, is not affiliated with, and
is not endorsed by Berkeley Graphics »*.

**Mesures comparées** (analyse fontTools des binaires ; `o-fill` = aire du `o` / aire de sa bbox,
un cercle parfait vaut 0,785 — **plus c'est haut, plus la contreforme est carrée**, c'est le proxy
quantitatif du « squarish » de Berkeley) :

| Fonte | chasse | x-h | cap | `o-fill` | zéro | licence |
|---|---|---|---|---|---|---|
| **★ cible (Berkeley / TX-02)** | **600** | **520** | **690** | **0,890** | **pointé** | propriétaire |
| **Ioskeley Mono** | 600 | 520 | 690 | **0,890** | pointé | **OFL 1.1** |
| **JetBrains Mono** | 600 | 550 | 730 | **0,862** | pointé | **OFL 1.1** |
| IBM Plex Mono | 600 | 516 | 698 | 0,812 | pointé | OFL 1.1 |
| Commit Mono | 600 | 540 | 700 | 0,797 | barré *(cf. ci-dessous)* | OFL 1.1 |
| Geist Mono | 600 | 530 | 710 | 0,810 | barré | OFL 1.1 |
| Departure Mono | 636 | 545 | 727 | **1,000** | pointé | MIT + OFL 1.1 |
| Martian Mono *(SemiExpanded)* | **700** | 600 | 800 | 0,812 | barré | OFL 1.1 |
| Space Mono | 612 | 496 | 700 | 0,804 | pointé | OFL 1.1 |

*(Réserve honnête : cette métrique ne capte pas le « caractère ». Space Mono sort bien classée et reste
une display très typée de Colophon, visuellement loin de Berkeley.)*

### La décision, et son coût

| | Ioskeley Mono | **JetBrains Mono** |
|---|---|---|
| proximité mesurée | **identique** | 2ᵉ (0,862 vs 0,890) |
| licence | OFL 1.1 | OFL 1.1 |
| variable | **non** — 40 fichiers statiques | **oui**, `wght` 100–800, **un seul fichier** |
| CDN / Google Fonts | **non** | oui (Google Fonts, Fontsource, jsDelivr) |
| poids woff2 latin | **≈94–96 kB par coupe** → ~190 kB pour 2 graisses | **39,5 kB pour 100→800** |
| maintenance | projet 2025, **mainteneur unique** | JetBrains, 2020, institutionnel |

> **Décision : on livre en JetBrains Mono variable.** 39,5 kB contre ~190 kB, un fichier contre deux,
> et un axe de graisse continu dont la section 0 a besoin (800 pour le héros, 400 pour le tableau).
> Sur une page dont le critère d'acceptation est **LCP < 1,0 s**, 150 kB de polices en plus est
> indéfendable — et c'est exactement le type d'arbitrage que ce produit prétend savoir faire.
>
> **Correctif de composition, parce que l'écart est réel :** JetBrains Mono a une hauteur d'x de 550
> contre 520 et une capitale de 730 contre 690. À corps égal elle paraît **~6 % plus grosse** et plus
> « produit 2020 » que « manuel technique 1975 ». **Compense en descendant le corps de 1 px sur le
> tableau et en ouvrant l'interlettrage de +0,02em sur les étiquettes.** C'est déjà dans l'échelle §4.6.
>
> **Ioskeley reste la bonne réponse à la question posée** — *« quel est l'équivalent libre le plus
> proche ? »* — et mérite une ligne dans le `DESIGN.md`. Ne la livre que si tu abandonnes le budget LCP.

*Note utile si tu veux les traits Berkeley sans changer de fonte :* **Commit Mono** (OFL 1.1, fichier
`LICENSE-FONT` du dépôt `eigilnikolajsen/commit-mono`) expose **`cv07` = zéro pointé** et
**`cv03` = points carrés** en OpenType — `font-feature-settings: 'cv07', 'cv03';` — et son configurateur
(commitmono.com, section « 07 Customize ») cuit ces réglages dans un woff2 variable. Contrepartie :
c'est la contreforme la plus **ronde** du panel (0,797), soit précisément le trait qui lui manque.

### La police de prose — **Instrument Sans**, et pas Inter

| Rôle | Police | Licence | Source | woff2 latin **mesuré** |
|---|---|---|---|---|
| **tout ce qui est structure, chiffre, étiquette, tableau, ET le titre héros** | **JetBrains Mono Variable** *(100–800)* | **SIL OFL 1.1** — `google/fonts/ofl/jetbrainsmono/OFL.txt` | `@fontsource-variable/jetbrains-mono` | **39,5 kB** |
| **prose uniquement** (le lead, la page « ce que je ne sais pas ») | **Instrument Sans Variable** *(400–700, axe `wdth` 75–100)* | **SIL OFL 1.1** — `google/fonts/ofl/instrumentsans/OFL.txt` : *« Copyright 2022 The Instrument Sans Project Authors »* | `@fontsource-variable/instrument-sans` | **29,4 kB** |

**Total 68,9 kB, dont 39,5 kB seulement en `preload`.**

**Pourquoi pas Inter.** 73 kB en variable `opsz+wght` contre 29,4, et surtout : Inter et Geist Sans
**sont le rendu par défaut de tous les sites générés par IA en 2026**. Un juge les lit comme
« vibe-codé ». C'est le reproche exact que ce travail doit éviter. Instrument Sans est une néo-grotesque
OFL, plus légère, dotée d'un **axe de chasse 75–100**, et **son nom même est un cadeau** pour un produit
qui s'appelle un instrument.

**Le titre héros est en JetBrains Mono ExtraBold, pas dans une police d'affichage.** Trois raisons :
(1) une chasse fixe à 168 px produit la plaque gravée d'un appareil de mesure, exactement le registre
recherché ; (2) c'est **zéro octet supplémentaire** ; (3) **la page a une seule voix — le titre est
composé dans la police du tableau, à 13 fois sa taille.** C'est un argument qu'on peut écrire dans la
soumission. *(C'est aussi ce que fait usgraphics : le titrage est composé dans le corps, à très gros corps.)*

### Les deux extensions possibles, si tu as du budget

| Police | Licence | woff2 | Ce qu'elle apporte | Coût |
|---|---|---|---|---|
| **Departure Mono** | **MIT** (© 2024 Helena Zhang & Tobias Fried) + OFL 1.1 dans le zip de release | **22,5 kB** (une seule coupe) | Une fonte **à pixels** (UPM 550, `o-fill` 1,000) pour **le seul sigle `TARE`** en tête et en pied — le dispositif dottxt (§1.2) | +22,5 kB, **illisible en corps de texte, ne l'utilise nulle part ailleurs** |
| **Archivo Variable** *(`wdth` 62–125 + `wght` 100–900)* | OFL 1.1 — `Omnibus-Type/Archivo` | 34,1 kB (`wght` seul) / **90,1 kB** avec `wdth` | Un **vrai axe de chasse** dans un seul fichier : condenser le titre héros à 62 % est le levier éditorial qui sépare une hero page générique d'une composition d'instrument | +34 à 90 kB |
| *(hors sujet mais à connaître)* **Redaction** — redaction.us | **OFL** — *« you can use them freely in your products and projects – print or digital, commercial or otherwise »* | 27,7 kB | Hybride Times/Century avec des **pixels dans les jonctions** et **7 grades de dégradation** (fax/photocopie), dessinée pour l'exposition *The Redaction* au MoMA PS1 | conceptuellement magnifique pour un document « caviardé », mais TARE **révèle**, il ne caviarde pas |

**Verdict : n'ajoute Departure Mono que pour le sigle, et seulement si la section 0 te paraît fade
une fois construite. Pas avant.**

## 4.5 Bordures, rayons, ombres

```css
--radius: 0;                    /* PARTOUT. Aucune exception. Mesuré 6/6 (§1.0) */
--border: 1px solid var(--line);
--border-strong: 1px solid var(--line-strong);   /* règle sous l'en-tête de tableau */
--focus-ring: 0 0 0 2px var(--bg), 0 0 0 4px var(--focus);   /* décalé, jamais un glow */
```

- **Aucune ombre portée. Jamais.** *« No drop shadows. Depth comes from … subtle contrast »*
  (ClickHouse `DESIGN.md`, §12). La profondeur se fait par le pas `--bg` → `--bg-1` → `--bg-2` → `--bg-3`
  et par le filet 1 px. `neumorphism.io` est écarté pour cette raison, pas pour sa licence.
- **Aucun dégradé sur un élément d'interface.** Un dégradé sur une surface est un encodage fantôme.
  Un dégradé n'est autorisé que **dans** la rampe de mesure, où il encode.
- **Une seule dérogation de forme, facultative :** le **chanfrein** du CTA principal (le dispositif SSTR,
  §1.1) — `clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)`.
  Zéro kilo-octet. **Un seul élément dans toute la page.** Ce n'est pas un rayon : les arêtes restent vives.
- **Tout est aligné sur une grille de 1 px.** Aucune valeur fractionnaire. Un instrument n'a pas de demi-pixels.

## 4.6 Échelle typographique — chiffrée

**Instrument** (`tare.xyz/hooks`), base **13 px**, tout en JetBrains Mono :

| Jeton | px | interligne | interlettrage | usage |
|---|---|---|---|---|
| `data-xs` | 10 | 14 | +0,04em | incertitude, unité, provenance (3ᵉ étage de cellule) |
| `data-sm` | 11 | 16 | +0,02em | 2ᵉ étage de cellule (`±0`, `bloc 50 550 000`) |
| `data` | **13** | 18 | 0 | **corps du tableau, le nombre** |
| `data-lg` | 16 | 22 | −0,01em | valeur mise en avant d'une fiche |
| `label` | 11 | 12 | **+0,10em** | CAPITALES : en-têtes de colonne, puces `MESURE` |
| `title-sm` | 16 | 20 | −0,01em | — |
| `title` | 20 | 24 | −0,02em | titre de panneau |
| `title-lg` | 28 | 32 | −0,02em | titre de fiche hook |
| `metric` | 44 | 40 | −0,03em | le verdict d'une fiche |

**Page de présentation** (`tare.xyz`) :

| Jeton | valeur | police | usage |
|---|---|---|---|
| `hero` | `clamp(56px, 11vw, 168px)` / lh **0,88** / ls **−0,045em** / 800 | JetBrains Mono | la phrase héros |
| `metric-xl` | `clamp(72px, 16vw, 240px)` / lh 0,82 / ls −0,05em / 800 | JetBrains Mono | **le nombre mesuré** |
| `h2` | `clamp(28px, 4.2vw, 56px)` / lh 1,0 / ls −0,03em / 700 | JetBrains Mono | titres de section |
| `lead` | `clamp(17px, 1.4vw, 21px)` / lh 1,5 | **Instrument Sans** | le paragraphe sous le héros |
| `body` | 16 / lh 1,6 | **Instrument Sans** | prose, mesure de **68ch max** |
| `caption` | 11 / lh 1,3 / ls +0,10em / CAPITALES | JetBrains Mono | eyebrows, légendes, index `01` |

**Rapport d'échelle : 240 / 16 = 15:1.** Dans la fourchette mesurée sur les références (17:1 chez
drone.riotters, 22:1 chez dottxt), et **il ne coûte rien** — c'est le seul geste « Awwwards » gratuit.

**Chiffres :** `font-variant-numeric: tabular-nums;` **globalement**, et `font-feature-settings: "zero" 1;`
(zéro barré) sur toute donnée hexadécimale. Une adresse de hook sans zéro barré est un piège à lecture.

## 4.7 Échelle d'espacement — chiffrée

Base **4 px** (comme Vercel, ClickHouse, SSTR, dottxt, esqrd — mesuré) :

```
s1 4 · s2 8 · s3 12 · s4 16 · s5 24 · s6 32 · s7 48 · s8 64 · s9 96 · s10 128 · s11 192
```

- **Instrument** : hauteur de ligne **28 px** (dense) / 36 px (confortable, réglable) ·
  padding de cellule `6px 10px` · gouttières `16px` · en-tête collant `32px`.
- **Page de présentation** : bande de section `128px` haut et bas ≥1024 px, `64px` en dessous ·
  conteneur `max-width: 1440px` · grille **12 colonnes, gouttière 24 px** ·
  marge latérale `clamp(16px, 4vw, 64px)`.
- **Ruptures** (reprises de ClickHouse §13, cohérentes avec la stack) :
  `375 · 768 · 1024 · 1280 · 1440`.

## 4.8 Animation — durées et courbes chiffrées

**La règle d'abord, les valeurs ensuite :**

> **R1. Rien n'a le droit de retarder l'affichage du verdict.**
> Pas de préchargeur *(l'erreur de SSTR)*. Pas de bannière de cookies bloquante *(l'erreur de dottxt)*.
> Pas de scroll détourné. **Aucune animation d'entrée sur le contenu du héros.**
>
> **R2. Un nombre n'anime jamais sa valeur.**
> Un compteur qui monte de 0 à 1 176 affiche **des nombres faux pendant 800 ms**. C'est exactement la
> malhonnêteté que le produit dénonce. **Un nombre peut se déplacer ou apparaître ; il ne se calcule
> jamais à l'écran.** *(À écrire dans le `DESIGN.md`, c'est un argument de jury.)*

```css
--t-feedback:   90ms;   /* survol, focus, case cochée */
--t-element:   180ms;   /* réordonnancement de ligne, filtre, ouverture de panneau */
--t-view:      280ms;   /* changement de vue */
--t-data:      320ms;   /* tracé de la courbe, une seule fois */
/* PLAFOND ABSOLU : 400ms. Rien ne dépasse. */

--e-enter: cubic-bezier(0.16, 1, 0.30, 1);   /* expo-out : part vite, se pose long */
--e-exit:  cubic-bezier(0.40, 0, 1, 1);      /* accélère et dégage */
--e-move:  cubic-bezier(0.20, 0, 0, 1);      /* réordonnancement */
```

- **Interdits :** `ease-in-out` sur une donnée · tout ressort (`spring`, `bounce`) sur un nombre — un
  ressort dépasse la valeur cible, donc **affiche une valeur fausse** · toute animation en boucle
  infinie hors d'un indicateur de chargement réel · le parallaxe.
- **Décalage (`stagger`) : 24 ms, 5 éléments maximum, plafond 120 ms.** Le budget de la référence §1.5 :
  **quatre mouvements pour tout le site.**
- **`prefers-reduced-motion: reduce`** → toutes les durées à `0.01ms`, sauf les fondus d'opacité à 90 ms.
  Non négociable : c'est un critère d'accessibilité qu'un juge peut tester en une bascule système.

## 4.9 Les règles propres à la mesure

**La courbe** (reprises du doc 34 §12, avec l'implémentation) :
- axe X **logarithmique** — `d3.scaleLog()` ;
- axe Y **ancré à 0** par défaut ; le zoom existe mais porte l'étiquette explicite `ZOOM · Y NON ANCRÉ` ;
- les 5 points **restent des points** (`r = 3px`, pleins), jamais lissés en spline (`spline: false` dans uPlot) ;
- l'incertitude est tracée (barre verticale 1 px, `--ink-4`) ;
- **la série de référence — le stub — est TOUJOURS `--baseline`, un gris.** Le contrefactuel n'a pas de
  couleur, parce qu'il n'a pas de grandeur. *(C'est la légende `WITH FRS` / `WITHOUT FRS` de SSTR, §1.1.)*

**La cellule à trois étages** (js-framework-benchmark, doc 34 §10) :
```
1176            ← data 13px, --ink, tabular-nums
±0              ← data-sm 11px, --ink-3
bloc 50550000   ← data-xs 10px, --ink-3
```
fond = rampe à 22 % · barre interne gauche 3 px à pleine saturation · **`--ink` ne change jamais**.

**Le widget 14 LED** (doc 34 §13) : 14 carrés de **10 × 10 px**, gouttière 4 px, filet 1 px `--line`,
rayon 0. Allumé = `--m-6` plein. Éteint = `--bg-2`. Étiquette sous chaque LED en `label` 10 px verticale.
**Zéro RPC, zéro dépendance :** `BigInt(addr) & 0x3FFFn`. **~30 lignes, 0 kB de bibliothèque.**

---

# PARTIE V — LE STORYBOARD DE `tare.xyz`

## 5.0 La contrainte, et sa seule résolution honnête

> **Un verdict utile à l'écran en moins de 5 secondes, sans wallet, sans clic.**

Il n'y a qu'une architecture qui tient cette contrainte : **la page de présentation *est* le verdict.**
On ne fait pas une page marketing qui mène à l'instrument ; on fait une page dont le premier écran
contient déjà une mesure réelle et un outil réel.

**Conséquence technique, à décider avant d'écrire une ligne : le premier écran est du HTML statique,
avec le nombre mesuré incrusté au build.** Zéro JavaScript n'est requis pour lire le verdict. Le JS
n'arrive que pour rendre le widget interactif, et il est de ~1 kB en ligne. Le reste du bundle
(React, la table, uPlot) est **découpé par route** et ne charge que sur `/hooks` et pour les sections 3–4.

**Budget d'affichage :** HTML+CSS critique **< 14 kB** (une fenêtre TCP) · `preload` de JetBrains Mono
39 kB · **LCP visé < 1,0 s**, plafond dur **1,5 s à froid** (le test du doc 34, J3).

## 5.1 Section 0 — `HEAD` · 0 → 100vh

**Ce qu'on voit.** Fond `--bg`. En haut à gauche, le sigle `TARE` en `caption` avec un filet.
En haut à droite, deux liens seulement : `INSTRUMENT →` et `SOURCE →`. Pas de menu, pas de burger.

Colonne gauche (7/12) :
```
——  UNISWAP V4 · BASE · BLOC 50 550 000        ← caption, filet en préfixe (dispositif §1.4)

84 HOOKS.                                       ← hero, clamp(56,11vw,168), lh 0.88, ls -0.045em
ZÉRO DÉCLARE.

Uniswap demande aux hooks de déclarer eux-mêmes ce qu'ils prennent, via les
events HookSwap et HookFee. Sur les 84 hooks déployés ces 24 000 derniers
blocs, zéro le fait. Alors je l'ai mesuré.        ← lead, Instrument Sans, 21px
```
Colonne droite (5/12), dans un panneau à filet 1 px, rayon 0 — **l'objet héros est l'outil, pas une
image de l'outil** (le dispositif dottxt, §1.2) :
```
┌ COLLE UNE ADRESSE DE HOOK ─────────────────┐
│ 0x…                                        │   ← champ, JetBrains Mono 13px
│ ▪▪▫▪▫▫▪▫▪▫▫▪▫▪   14 LED déjà allumées      │
│ BEFORE_SWAP · AFTER_SWAP · …               │
├────────────────────────────────────────────┤
│ MESURÉ            1176 bps                 │   ← metric-xl, incrusté au build
│ hook 0xb429d6… · pool 0x… · bloc 50550000  │   ← data-xs
│ [MESURE]                                   │   ← puce à filet (§1.7)
└────────────────────────────────────────────┘
```

**Ce qui bouge.** *Rien avant la peinture.* À `t+150 ms`, les **14 LED s'allument en séquence, 24 ms
d'écart, plafond 120 ms** — et c'est la seule animation d'entrée de toute la page. **C'est une donnée
qui s'affiche, pas une décoration.** Le champ est focalisable immédiatement ; coller une adresse
recalcule les LED en `--t-feedback` (90 ms).

**Quelle librairie.** Aucune. CSS + ~30 lignes de JS en ligne. **+0 kB.**

**Option, et je recommande de ne pas la prendre.** Un fond animé `@paper-design/shaders`
(**Apache-2.0, 59,9 kB gzip, 0 dépendance**) monté après le premier rendu via `requestIdleCallback`,
coupé sous `prefers-reduced-motion`. **L'alternative à 2 kB : la trame en damier 1 bit de dottxt.ai**
(§1.2) en `background-image` répétée, à 4 % d'opacité. Elle dit la même chose — « ceci est un
instrument » — pour **1/30ᵉ du poids**, et elle ne peut pas retarder le LCP. **Prends le damier.**
*(Décision honnête : le shader est un ornement, et le produit vend l'absence d'ornement.)*

## 5.2 Section 1 — `LE FAIT` · l'absence rendue visible

**Ce qu'on voit.** `01  LE STANDARD QUE PERSONNE N'APPLIQUE` (index monospace + filet + décompte à
droite, dispositif §1.4). En dessous, **une grille de 84 cellules** de 24 × 24 px, filet 1 px, rayon 0,
**toutes en `--bg-2`, aucune colorée**. À droite, en `metric` :
```
HookSwap   0 / 84
HookFee    0 / 84
```
**L'image, c'est le vide.** 84 cases grises. Sur une page dont la seule famille chromatique encode
« ce qui est pris », 84 cases sans couleur disent tout. Au survol, une cellule affiche son adresse
dans une info-bulle à filet.

**Ce qui bouge.** Les cellules apparaissent en opacité à l'entrée dans le viewport, **120 ms au total,
sans décalage individuel**. Rien d'autre.

**Quelle librairie.** CSS grid + `IntersectionObserver`. **+0 kB.**

## 5.3 Section 2 — `LA MÉTHODE` · le stub

**Ce qu'on voit.** `02  ON NE CHANGE PAS LE POOL, ON CHANGE LE HOOK`. Deux panneaux côte à côte,
séparés par un filet vertical :
- gauche — `BYTECODE RÉEL` : les 8 premières lignes du bytecode en hex, `data-xs`, `--ink-3` ;
- droite — `STUB · 89 OCTETS` : le stub **entier**, `data-sm`, `--ink` ;
- entre les deux, en `label` : `anvil_setCode`.

Puis trois lignes d'invariants : `même poolId` · `même liquidité` · `même slot0`.
Puis les deux cotations et l'écart, en `metric-xl`.

**Ce qui bouge.** Un **balayage lié au défilement** : le panneau de gauche est recouvert par celui de
droite via `clip-path: inset()` piloté par la progression de scroll. Une seule propriété animée,
composited.

**Quelle librairie.** `animation-timeline: view()` en CSS natif là où c'est supporté ; repli sur
`useScroll` de `motion` — **déjà dans le bundle** pour le tableau. **+0 kB net.**

## 5.4 Section 3 — `LA COURBE`

**Ce qu'on voit.** `03  LE MÊME SWAP, DEUX FOIS`. La **vraie** courbe uPlot, aux règles du §4.9 :
X log, Y ancré à 0, 5 points visibles, barres d'incertitude, **série de référence en gris `--baseline`**,
série mesurée dans la rampe. Légende en deux barres de nuancier + libellé monospace — **le dispositif
SSTR pris tel quel** (§1.1). Sous la courbe, en `data-xs` : `hook · pool · bloc · stub_hash · engine_ver`.

**Ce qui bouge.** Le tracé se dessine de gauche à droite en **320 ms, une seule fois**, à l'entrée dans
le viewport. Au survol d'un point : un curseur croix 1 px et une info-bulle à filet, en 90 ms.

**Quelle librairie.** `uplot` **21,3 kB gzip** + `d3-scale` **15,6 kB**. Chargés en `import()` dynamique
au franchissement du viewport. **+36,9 kB, hors du chemin critique.**

## 5.5 Section 4 — `LA MATRICE` (aperçu)

**Ce qu'on voit.** `04  199 POOLS · 12 HOOKS DISTINCTS`. **Douze lignes réelles** du tableau de
l'instrument, mêmes cellules à trois étages, même rampe, même densité — **aucune version « simplifiée
pour la landing »**. Puis un filet et une seule ligne : `→ OUVRIR L'INSTRUMENT COMPLET`.
*(Le CTA chanfreiné du §4.5 est ici, et c'est le seul de la page.)*

**Ce qui bouge.** Rien. Le tableau est du DOM réel, triable au clic sur un en-tête ; le tri réordonne
en `--t-element` (180 ms, `--e-move`).

**Quelle librairie.** `@tanstack/react-table` **31,0 kB** + `motion` **44,3 kB**, partagés avec `/hooks`.
**+75,3 kB, en chunk partagé.**

## 5.6 Section 5 — `CE QUE JE NE SAIS PAS`

**Ce qu'on voit.** `05  LES LIMITES`. Sur `--bg-1`, en **Instrument Sans, 16 px, mesure 68ch** — la seule zone de
prose longue de la page. Les frais dynamiques (§0.2 du doc 34), les **9 observations uniques et non 11**,
l'attribution Clanker **PLAUSIBLE, NON PROUVÉE**, les 77,6 % non cotables. Chaque affirmation porte un
permalien `(hook, pool, bloc)`.

**Ce qui bouge.** Rien. **Volontairement.** C'est la section qu'aucun des 27 finalistes async n'a écrite
(doc 34, partie VIII) ; elle doit se lire comme une note de bas de page d'article, pas comme un argument
de vente.

**Quelle librairie.** Aucune. **+0 kB.**

## 5.7 Section 6 — `PIED`

Le sigle `TARE`, **la même séquence de 14 LED qu'en tête** (la règle « même animation intro/outro » du
plan vidéo, doc 34, partie VIII), la licence, le hash du commit, le lien du dépôt, le compte de tests
`N/N green`. **+0 kB.**

## 5.8 Ce que la page ne contient pas, et c'est délibéré

Pas de préchargeur · pas de bannière de cookies bloquante · pas de bouton « Connect Wallet » ·
pas de carrousel de logos partenaires · pas de section témoignages · pas de curseur personnalisé ·
pas de parallaxe · pas de 3D — **il n'y a aucune donnée spatiale dans ce produit** (doc 34 §11) ·
pas de compteur qui monte (§4.8 R2).

## 5.9 Le budget, section par section

| Section | JS ajouté (gzip) | Chemin critique ? |
|---|---|---|
| 0 · HEAD | **~1 kB** en ligne | **OUI** — HTML statique, nombre incrusté au build |
| 1 · LE FAIT | 0 | non |
| 2 · LA MÉTHODE | 0 net | non |
| 3 · LA COURBE | `uplot` 21,3 + `d3-scale` 15,6 = **36,9** | non — `import()` au viewport |
| 4 · LA MATRICE | `react-table` 31,0 + `motion` 44,3 = **75,3** | non — chunk partagé avec `/hooks` |
| 5 · LIMITES | 0 | non |
| 6 · PIED | 0 | non |
| React + ReactDOM | ~45 | non — hydratation différée |
| **Total page** | **≈ 158 kB gzip** | **dont ~1 kB avant le verdict** |
| *(option Paper Shaders)* | *+59,9* | *non — et je recommande de la couper* |
| Polices | **39,5 kB** préchargés + **29,4 kB** en `swap` = **68,9 kB** | JetBrains Mono seule est préchargée |

---

# PARTIE VI — LE PROMPT POUR CURSOR / CLAUDE CODE

> À coller tel quel. Les références sont des URL ouvrables, les interdits sont explicites, les
> contraintes sont chiffrées, et le critère d'acceptation est mesurable.

```
Tu construis la page de présentation de TARE : tare.xyz.

TARE mesure ce qu'un hook Uniswap v4 prend réellement sur un swap. Méthode : sur un fork épinglé,
on remplace le bytecode du hook par un stub inerte de 89 octets via anvil_setCode, et on cote le
même swap deux fois. L'écart est ce que le hook prend. Fait porteur : Uniswap demande aux hooks de
déclarer ce qu'ils prennent via les events HookSwap / HookFee ; sur 84 hooks déployés en
24 000 blocs Base, zéro le fait.

STACK IMPOSÉE, RIEN D'AUTRE
  Vite + React 18 + TypeScript + Tailwind + shadcn/ui (copié dans le dépôt, MIT)
  @tanstack/react-table (MIT, 31,0 kB gz) · uplot (MIT, 21,3 kB gz) · d3-scale (ISC, 15,6 kB gz)
  motion (MIT, 44,3 kB gz)
  N'INSTALLE AUCUN AUTRE PAQUET SANS ME DEMANDER. Le dépôt est open source (track Uniswap) :
  toute dépendance doit être MIT / Apache-2.0 / BSD / ISC. Commons Clause = refus immédiat.

RÉFÉRENCES — ouvre-les, prends ces dispositifs précis, rien d'autre
  https://sstr.tech/en/          la figure "avec / sans" : série mesurée en couleur, série de
                                 référence en GRIS ; axes en monospace capitale ; légende en deux
                                 barres de nuancier ; grille modulaire à filets 1 px pleine largeur
  https://dottxt.ai              l'objet héros est l'outil réel et sa sortie réelle, dans un panneau
                                 à filet ; eyebrow numéroté "01" + libellé monospace capitale ;
                                 trame en damier 1 bit à la place de tout dégradé
  https://eclipses.bogachev.fr   la répartition des rôles : monospace pour tout chiffre, identifiant
                                 et étiquette ; sans-serif pour la prose. Jamais l'inverse
  https://wc26.bogachev.fr       l'index de section : "01 Titre" + filet horizontal + décompte
                                 aligné à droite
  https://stateofaidesign.com    la puce de légende monospace à filet 1 px ancrée dans le coin d'un
                                 panneau — pour MESURE / INTERPOLE / NON_MESURABLE / NON_COTABLE

CHARTE — valeurs exactes, ne les négocie pas
  border-radius: 0 PARTOUT, aucune exception (mesuré sur 6/6 des références ci-dessus)
  Aucune ombre portée, jamais. La profondeur est un pas de surface + un filet 1 px
  Aucun dégradé sur un élément d'interface
  Base d'espacement 4px : 4 8 12 16 24 32 48 64 96 128 192
  Ruptures : 375 768 1024 1280 1440 · conteneur max 1440px · grille 12 col, gouttière 24px

  Surfaces (sombre, défaut) : --bg #08090A · --bg-1 #101214 · --bg-2 #17191C · --bg-3 #1E2125
  Filets : --line #24272B · --line-strong #383C42
  Encres : --ink #E8EAED · --ink-2 #A2A9B0 · --ink-3 #6B7178 · --ink-4 #454A50
  Rampe de mesure (inferno tronquée, 7 paliers, la SEULE famille chromatique de tout le site) :
    --m-0 #390963 · --m-1 #6A176E · --m-2 #9B2964 · --m-3 #CA404A
    --m-4 #EB6628 · --m-5 #FB9B06 · --m-6 #F6D746
  Bleu d'interaction (focus/lien uniquement, jamais une grandeur) : --focus #3376F6
  Série de référence (le stub) : --baseline #6B7178 — TOUJOURS grise
  Mode clair sous [data-theme="light"] : --bg #F7F7F5 · --bg-1 #FFFFFF · --ink #14171A ·
    rampe YlOrRd #FFF8BB #FFE590 #FECA66 #FEA446 #FD7435 #F23924 #D41020

  Cellule de mesure : background color-mix(in srgb, var(--m-N) 22%, var(--bg-1))
                    + box-shadow: inset 3px 0 0 var(--m-N). L'encre ne change JAMAIS.

  Polices — SIL OFL 1.1, auto-hébergées via @fontsource-variable, JAMAIS via l'API Google Fonts
  (requête tierce à l'exécution) :
    @fontsource-variable/jetbrains-mono  (39,5 kB latin) = TOUT : structure, chiffres, étiquettes,
      tableau, ET le titre héros en poids 800. N'AJOUTE PAS de police d'affichage
    @fontsource-variable/instrument-sans (29,4 kB latin) = la prose UNIQUEMENT, mesure 68ch max
    N'utilise NI Inter NI Geist Sans : c'est le rendu par défaut de tous les sites générés par IA
    preload UNIQUEMENT JetBrains Mono. Instrument Sans en font-display: swap.
    font-variant-numeric: tabular-nums en global
    font-feature-settings: "zero" 1 sur toute donnée hexadécimale
  Échelle : hero clamp(56px,11vw,168px)/0.88/-0.045em/800 · metric-xl clamp(72px,16vw,240px)/0.82/
    -0.05em/800 · h2 clamp(28px,4.2vw,56px)/1.0/-0.03em · lead clamp(17px,1.4vw,21px)/1.5 (Instrument Sans) ·
    body 16/1.6 (Instrument Sans) · caption 11/1.3/+0.10em CAPITALES · data 13/18 · label 11/12/+0.10em

  Animation : --t-feedback 90ms · --t-element 180ms · --t-view 280ms · --t-data 320ms
    PLAFOND ABSOLU 400ms, rien ne dépasse
    --e-enter cubic-bezier(0.16,1,0.30,1) · --e-exit cubic-bezier(0.40,0,1,1)
    --e-move cubic-bezier(0.20,0,0,1)
    stagger 24ms, 5 éléments max, plafond 120ms
    prefers-reduced-motion: reduce -> toutes les durées à 0.01ms sauf les fondus d'opacité à 90ms

INTERDITS EXPLICITES — chacun est un motif de rejet du diff
  1.  Aucun border-radius non nul. Pas de "rounded-lg", pas de "rounded-md", pas de bouton pilule
  2.  Aucun box-shadow sauf l'anneau de focus (0 0 0 2px var(--bg), 0 0 0 4px var(--focus))
  3.  Aucun dégradé, aucun glassmorphism, aucun backdrop-blur, aucun effet de lueur
  4.  Aucune couleur hors des variables ci-dessus. Zéro violet crypto, zéro dégradé bleu-violet
  5.  Aucun compteur animé, aucun count-up, aucun ressort sur un nombre. Un nombre n'anime jamais
      sa valeur : un ressort dépasse la cible et affiche donc une valeur fausse
  6.  Aucun préchargeur, aucun écran de chargement, aucune bannière de cookies bloquante,
      aucun scroll détourné, aucun parallaxe, aucun curseur personnalisé
  7.  Aucune 3D, aucun Three.js, aucun WebGL. Il n'y a aucune donnée spatiale dans ce produit
  8.  Aucun emoji dans l'interface. Aucune icône décorative. Les seules icônes admises sont
      fonctionnelles et en trait 1px
  9.  Aucun bouton "Connect Wallet". Aucun carrousel de logos. Aucun témoignage. Aucun bloc pricing
  10. Aucune étiquette colorée. MESURE / INTERPOLE / NON_MESURABLE / NON_COTABLE sont
      typographiques : monospace 10px capitale, filet 1px, rayon 0. Colorer un label ferait croire
      à une grandeur
  11. Aucun texte centré au-delà d'une ligne. Tout est aligné à gauche sur la grille
  12. Aucune donnée inventée. Si une valeur manque, écris NON MESURE et laisse la cellule vide

STRUCTURE — 7 sections, dans cet ordre
  0 HEAD 100vh      : gauche, eyebrow "—— UNISWAP V4 · BASE · BLOC 50 550 000" puis le titre
                      "84 HOOKS. / ZÉRO DÉCLARE." puis le lead en Instrument Sans.
                      Droite, un panneau à filet contenant le widget 14 LED (14 carrés 10x10,
                      gouttière 4px, allumé = --m-6, éteint = --bg-2, calcul BigInt(addr) & 0x3FFFn,
                      100% client, aucun RPC, aucune dépendance) et, dessous, le nombre mesuré en
                      metric-xl avec sa ligne de provenance hook/pool/bloc en 10px.
                      Le fond porte une trame en damier 1 bit à 4% d'opacité (background-image CSS,
                      pas une image). Aucune animation d'entrée sauf l'allumage des 14 LED à t+150ms,
                      24ms d'écart, plafond 120ms
  1 LE FAIT         : "01" + grille de 84 cellules 24x24 à filet, TOUTES grises, aucune colorée,
                      et à droite "HookSwap 0 / 84" et "HookFee 0 / 84" en metric. L'absence de
                      couleur EST l'image
  2 LA MÉTHODE      : "02" + deux panneaux (bytecode réel | stub 89 octets) séparés par un filet
                      vertical, label "anvil_setCode" entre eux, puis les invariants
                      (même poolId, même liquidité, même slot0), puis les deux cotations et l'écart
  3 LA COURBE       : "03" + graphe uPlot, X logarithmique, Y ANCRÉ À 0 par défaut, 5 points visibles
                      comme points (r=3, spline: false), barres d'incertitude, série stub en
                      --baseline gris, série mesurée dans la rampe. Le zoom Y existe mais porte
                      l'étiquette explicite "ZOOM · Y NON ANCRÉ". Import dynamique au viewport
  4 LA MATRICE      : "04" + 12 lignes RÉELLES du tableau de l'instrument, cellules à trois étages
                      (valeur 13px / incertitude 11px --ink-3 / provenance 10px --ink-3), même rampe,
                      même densité. Aucune version simplifiée. Puis le seul CTA de la page
  5 LIMITES         : "05" + prose en Instrument Sans 16px, 68ch : frais dynamiques, 9 observations uniques
                      (pas 11), attribution PLAUSIBLE NON PROUVEE, 77,6% non cotables. Aucune
                      animation, volontairement
  6 PIED            : sigle, la MEME séquence de 14 LED qu'en tête, licence, hash de commit,
                      lien du dépôt, compte de tests N/N green

PERFORMANCE — critères d'acceptation, je les mesurerai
  - Le premier écran est du HTML statique avec le nombre mesuré incrusté au BUILD.
    Zéro JavaScript n'est requis pour lire le verdict. Le widget LED est ~1 kB de JS en ligne
  - HTML + CSS critique < 14 kB
  - LCP < 1,0 s, plafond dur 1,5 s à froid
  - JS total de la page < 160 kB gzip. Sections 3 et 4 en import() au viewport uniquement
  - Le verdict est lisible en moins de 5 secondes, sans wallet, sans un seul clic
  - Lighthouse Accessibilité >= 95, et la page reste entièrement utilisable au clavier
  - Contraste : tout texte >= 7:1 (AAA). La rampe est déjà calculée pour tenir 9,05 au minimum

MÉTHODE DE TRAVAIL
  Écris d'abord tokens.css avec TOUTES les variables ci-dessus, puis la section 0 seule, et
  arrête-toi. Je valide la section 0 avant que tu écrives la 1. Ne génère pas les 7 sections
  d'un coup. Ne "complète" jamais une donnée manquante : écris NON MESURE.
```

---

# PARTIE VII — LES CINQ DÉCISIONS À TRANCHER

1. **Le mode sombre par défaut** (§4.3) — c'est le mode où la rampe ment le moins, mais il rend
   l'impression et les captures d'écran de la vidéo plus difficiles. Si la vidéo prime, bascule en clair
   et inverse la rampe ; le système est symétrique, c'est un `data-theme`.
2. **JetBrains Mono plutôt qu'Ioskeley Mono** (§4.4) — Ioskeley est **la** réponse à « le plus proche
   équivalent libre de Berkeley Mono » : mêmes métriques au chiffre près (600/520/690, zéro pointé,
   points carrés), OFL 1.1. Mais elle coûte **~190 kB pour deux graisses statiques** contre **39,5 kB
   pour une variable 100–800**, sans CDN, avec un mainteneur unique. Sur un budget LCP < 1,0 s, c'est
   non. **Cite-la dans le `DESIGN.md`, ne la livre pas.** Si tu changes d'avis, le seul déclencheur
   légitime est d'avoir abandonné le budget de performance — pas un coup de cœur.
3. **Le shader est coupé** (§5.1) — Paper Shaders est propre juridiquement (Apache-2.0) et léger pour
   ce qu'il fait (59,9 kB, 0 dépendance), mais **le produit vend l'absence d'ornement**. Le damier 1 bit
   à 2 kB dit la même chose sans contradiction.
4. **`getdesign.md` se lit, ne se committe pas** (§3.2) — ClickHouse est le bon point de départ, mais le
   dépôt public de TARE porte un `DESIGN.md` écrit pour TARE.
5. **Retrouve ou abandonne les citations du manifeste usgraphics** (§0) — `usgraphics.com/manifesto` est
   en 404 et le sitemap n'en contient aucune trace. Remplacement vérifiable et sous licence dans
   `usgraphics/usgc-machine-report` (**BSD-3-Clause**), dont le README dit :
   > *« **Tabular, short, clear and concise.** »* · *« No emojis (except for the one used as a warning
   > sign). **No colors** (as default, might add an option to add colors). »*
   >
   > C'est la même doctrine, en une phrase, **et elle est citable avec son URL.**
