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

## Corrections sur la hero (2026-09-12, 22:20)

> « Alors quelque correction mais j'aime deja beaucoup. Je voudrais que ma statistique, 96,74, apparaissent directement dans le hero, comme le fait de pouvoir coller un jeton pour compute une adresse. Aussi, je veux que trois interaction soit evidente : la possibilite de scroll down pour voir les details de nos process, la possibilite de cliquer sur un node pour voir le detail de l'outil. Aussi, meme si le graph est deja bien, je trouve qu'il manque un peu de clarte et de dynamisme. Tu peux t'inspirer de ce genre de graph la : https://dribbble.com/shots/26500134-Ai-generation-of-a-node-system-for-generating-images-SEDA-Kit. Aussi, une police plus affirme genre archivo pour les titres serait bienvenu. Et finalement, je voudrais avoir un fond complexe et anime pour ma hero. Je te laisse le soin de definir quel type d'animation (en utilisant motion ou pas) s'y prete le mieux. »

Locks ajoutés :
- « ma statistique, 96,74, apparaissent directement dans le hero » (composition : l'écart de la porte A4 dans le premier écran)
- « pouvoir coller un jeton pour compute une adresse » dans le hero (composition : le champ d'adresse dans le premier écran)
- « trois interaction soit evidente : […] scroll down pour voir les details de nos process, […] cliquer sur un node pour voir le detail de l'outil » (composition, motion : coller, cliquer un nœud, descendre, les trois signalées sans lire)
- « le graph […] manque un peu de clarte et de dynamisme », référence https://dribbble.com/shots/26500134 (SEDA Kit) (composition, motion)
- « une police plus affirme genre archivo pour les titres » (typographie : Archivo pour les titres ; Instrument Sans reste pour la prose, JetBrains Mono pour les données)
- « un fond complexe et anime pour ma hero », le type d'animation laissé à la DA (fond, motion)

## Corrections sur la hero, 2 (2026-09-12, 22:10)

> « petit detail : la map, la stat, et le compute doivent etre visible tous les 3 dans le hero, tu peux reduire le contenu de la stat et du compute, mais pas le schema. Tu peux changer le layout des trois component pour que cela passe. Aussi, je n'aime pas trop l'animation propose, trop AI generated dans le style, cherche pour une autre reference. »

Locks ajoutés :
- « la map, la stat, et le compute doivent etre visible tous les 3 dans le hero » (composition : le premier écran porte le schéma entier, l'écart et le champ)
- « tu peux reduire le contenu de la stat et du compute, mais pas le schema » (la carte ne se réduit pas ; la mesure et le champ se compactent)
- « je n'aime pas trop l'animation propose, trop AI generated dans le style » (le champ de pistes qui poussent au hasard est refusé : chercher une autre référence)

## Corrections sur la hero, 3 (2026-09-12, 22:40)

> « Je veux voir mes trois elements en entier dans mon hero. Je ne vois pas ton animation dans le fond, elle est cache par mes composants. Tu peux reduire la taille du contenu des composants ou revoir leur layout pour que tout passes. Aussi, supprime la section "compute" apres le scroll. Ma barre "compute" la remplace (mais du coup, permet de mettre une adresse demo directement dans le hero). »

Locks ajoutés :
- « mes trois elements en entier dans mon hero » (aucun des trois n'est coupé par le pli)
- « je ne vois pas ton animation dans le fond, elle est cache par mes composants » (le fond doit se voir : réduire les composants ou revoir leur layout)
- « supprime la section compute apres le scroll. Ma barre compute la remplace » (l'accueil n'a plus de section d'opération : le hero calcule et répond)
- « permet de mettre une adresse demo directement dans le hero » (des jetons du corpus proposés sous le champ)
