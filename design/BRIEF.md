# BRIEF — da-kit, TARE (`apps/web`, branche `design/tare`)

## Arguments de `/da-kit:da`, tels quels (2026-09-12)

> (aucun argument : la commande a été lancée sans texte)

Le projet porte déjà un brief (`project/brief.md`, mode existing) et onze décisions verrouillées
(`project/decisions.json`). Les locks ci-dessous sont les phrases de l'utilisateur qui tranchent
quelque chose, reprises mot pour mot de ces décisions. L'image déposée dans `inspi/schema.png`
(identique à `project/refs/user/ref-01-carte-noeuds-n8n.png`) est copiée dans `design/refs/`.

## Locks

- « Je veux surtout une map en node/flux avec le rendu le plus design et coherent avec ma DA possible : la premiere chose que l'on voit sur la page, l'orchestrateur et tous les tools qu'il utilise » (d001, composition)
- « Clicker sur un noeud permet d'apercevoir le detail du fonctionnement du tool, avec un onglet par tool, un contexte d'utilisateur, et une redirection qui montre que l'orchestrateur utilise ces donnees pour son calcul » (d002, composition)
- « On ne pourrait pas avoir un entre deux ? A la fois la preuve et l'usage » (d003, composition)
- « Ambition marquee : le registre instrument reste, mais le contraste typographique et la composition montent au niveau des sites primes » (d004, composition)
- « Evite les canevas pointilles, trop AI » (d005, référence)
- « Evite globalement les rendus type AI. Choix des couleurs, coins arrondis etc. » (d006, couleur, forme)
- « L'instrument est en francais — c'est une decision, pas un oubli » (d007, contenu)
- « Pars du principe que ce sont des features non terminees, donc fie toi a ce qui est dis, et non a ce qui est fait pour le moment » (d008, contenu)
- « A, avec l'horloge de B : le schema d'appareil en hero (le systeme entier au repos, l'orchestrateur et les quatorze outils, pistes orthogonales 1 px), le bloc orchestrateur porte l'horloge reelle de la chaine, et la matrice 27 x 14 descend dans la section qui dit quelle donnee sert quel outil » (d009, composition, motion)
- « C'est OK » — la hero de design-generator validée : schéma d'appareil, horloge réelle, figure appariée, échelle typographique (d010, composition)

Charte de l'équipier, hors du registre mais avec la force d'un lock (brief §6, hors périmètre) :
JetBrains Mono Variable pour tout chiffre et identifiant, Instrument Sans Variable pour la prose,
rampe `--m-0` à `--m-6` qui encode les bps, rayon zéro, fond sombre `#08090a` / encre `#e8eaed`,
thème clair `#f7f7f5` / `#14171a`. Interdits : dégradés, ombres portées, coins arrondis, canevas
pointillés, préchargeur, compteurs animés sur des nombres mesurés, un blanc ou un zéro là où la
lecture a échoué.

## Arguments du 2026-09-12, 20:50 (réponse aux deux questions : surface et direction)

> « En fait, j'ai fais un prompt qui affiche correctement les donnees attendues. Maintenant, l'idee c'est de donner une veritable identite SaaS type Awwward, tres soignee au produit. On peut reprendre l'ensemble du front entierement, juste il faut garder la composition globale. »

Locks ajoutés :
- « donner une veritable identite SaaS type Awwward, tres soignee au produit » (direction, ambition)
- « On peut reprendre l'ensemble du front entierement » (tout le rendu est libre : surfaces, matières, typographie dans la charte, motion, composants)
- « juste il faut garder la composition globale » (la carte en hero avec l'orchestrateur et les quatorze outils, la section usage et preuve dessous, les accès, la matrice ; une page par outil en trois temps ; l'instrument et son index)
- Surface : `apps/web`, l'instrument (les données attendues s'y affichent déjà correctement)

## Direction choisie (2026-09-12, 21:20)

> « Va pour la A. »

Lock : direction **A · La plaque** — la carte est une enceinte d'un cran plus claire que la page,
les nœuds sont des plaques avec un liseré haut d'un pixel, le câblage passe du gris à l'encre au survol.
