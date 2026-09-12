# Famille — interfaces qui montrent un système, au registre « instrument »

Trouvées par recherche. Trois retenues, cinq écartées, la raison de chacune est dite.

## 1. oxide.computer — retenu
`oxide.computer-01-hero.png`, `oxide.computer-02-schema.png`

- **Palette** : noir #080a0a, encre blanche, un vert #48d597 en monospace pour la marque et
  les liens, un rouge #fb6e88 réservé aux états d'erreur (`-> STATUS / ERROR / AB-80`).
- **Texture** : aucune. Une gouttière de `#` répétés en monospace 10 px tient la colonne à
  gauche de chaque bloc — une texture faite de caractères, pas d'image.
- **Typographie** : JetBrains-like monospace en capitales espacées pour la nav, les boutons,
  les légendes de figure ; un grotesque pour la prose. Exactement la paire de TARE.
- **Composition** : rayon zéro strict, **filets 1 px qui sortent d'un panneau pour aller
  chercher un autre objet** — dans le héros, une polyligne à angles droits relie le terminal
  CLI à la photo de la baie. C'est une arête de graphe sans canevas. La légende de figure est
  encadrée : `FIG. 1 | OXIDE CLOUD COMPUTER`.
- **Ce qu'elle refuse** : l'icône, l'arrondi, l'ombre, la couleur d'agrément.
- **On en prend** : la polyligne orthogonale 1 px comme arête (réponse directe au refus des
  courbes molles de n8n), la légende `FIG. n` encadrée pour les panneaux de l'instrument,
  le schéma isométrique en **trait pointillé fin** qui dessine un système sans canevas pointillé,
  la gouttière de `#`. **On n'en prend pas** : le vert de marque, la photo produit.

## 2. observablehq.com/framework — retenu
`observable-framework-01-accueil.png`, `observable-framework-02-panneaux.png`

- **Palette** : thème clair #fff / thème sombre #1b1e23, un vert-sarcelle unique en accent.
  Les panneaux de démonstration sont sombres et denses.
- **Texture** : aucune.
- **Typographie** : le h1 est **en monospace** (`The best dashboards are built with code.`),
  la prose en sans. L'inverse de l'habitude, et ça marche parce que le sujet est le code.
- **Composition** : rayon zéro (ou 2 px), une commande copiable dans un cadre 1 px sous le
  chapô, une grille de vignettes de tableaux de bord légendées par un lien `→`.
- **Ce qu'elle refuse** : la promesse illustrée ; elle montre des tableaux de bord réels.
- **On en prend** : le modèle des **dix-sept panneaux** — des panneaux sombres à filets,
  chacun légendé, qui tiennent côte à côte sans respirer ; et le principe « la vignette est
  le produit ». **On n'en prend pas** : la barre latérale de documentation, le thème clair
  par défaut, la vignette à ombre portée.

## 3. temporal.io — retenu (la seule section d'exécution)
`temporal.io-01-execution.png`

- **Palette** : noir #0a0a0a pour le module d'exécution, encre blanche, un violet de marque
  qu'on laisse.
- **Composition** : deux panneaux à rayon zéro, filets 1 px. À gauche, le code réel avec un
  sélecteur de langage en **monospace capitale souligné à l'onglet actif** ; en dessous une
  `Console` qui écrit sa sortie ligne à ligne (`# WORKFLOW running…`, `# ACTIVITY send_email
  is running…`). À droite, un axe de temps en monospace **tourné à 90°** (`1d 15d 30d 45d…`).
- **On en prend** : la paire **code réel / console réelle** comme preuve d'exécution — c'est
  la section `execution` des pages outil (les 3 à 5 étapes numérotées et leur `a_ms`) ;
  et l'axe de temps vertical en monospace pour la chaîne complète (6 étapes, 13 680 ms).
- **On n'en prend pas** : le héros à dégradé violet/turquoise, l'étoile, le bouton dégradé.

## Écartées, et pourquoi
- **xyflow.com** (React Flow, la bibliothèque même du graphe) : dégradés roses/violets,
  cartes arrondies à ombre portée, arêtes en pointillé rose. Registre opposé, malgré l'usage.
- **dagster.io**, **windmill.dev**, **buildkite.com**, **modal.com**, **railway.com**,
  **kestra.io**, **marimo.io**, **val.town** : toutes des pages SaaS à dégradé, coins
  arrondis, ombres portées et pastilles d'icônes colorées. C'est exactement le registre refusé.
- **eclipses.bogachev.fr** : très bel instrument de données, et sa **légende de rampe**
  (`WHEN · OLDER · RECENT · FUTURE` en dégradé de pastilles) est la bonne idée pour la rampe
  `--m-0 … --m-6` de TARE. Mais : préchargeur plein écran avec compteur %, pastilles de filtre
  arrondies, palette beige chaude, aucune monospace. Non capturée dans `family/` pour ne pas
  contaminer la planche ; à revoir seulement pour la question « comment légender une rampe ».
- **wc26.bogachev.fr** : dégradés arc-en-ciel en fond. Une seule chose à en retenir, et elle
  est utile pour `#/instrument` : le titre de section `01  Knockout` — ordinal en monospace
  gris, titre en sans, compte `32 MATCHES` aligné à droite sur un filet 1 px.

## Contre-exemple conservé
`_contre-exemple-grafana-node-graph.png` — le panneau « node graph » de Grafana : des nœuds
**circulaires** à anneau rouge/vert, arêtes fléchées grises. C'est la forme par défaut du
graphe de système, et c'est précisément ce que TARE ne doit pas faire : le cercle interdit
le rayon zéro, l'anneau coloré double la couleur de famille, et le libellé tombe hors du nœud.
Gardé pour montrer d'où il faut s'éloigner.
