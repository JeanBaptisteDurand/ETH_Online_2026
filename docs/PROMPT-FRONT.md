# Le prompt à donner au Claude qui fait le front

> Copie tout ce qui est entre les deux lignes. Rien d'autre.

---

Tu reprends le front d'un projet **fini et figé**. Ne cherche pas ce qu'il manque au produit :
il ne manque rien. Le moteur, les données, les contrats et les quatorze outils sont écrits,
mesurés et testés — **1 215 tests verts**. Ce qui manque est le **design**, et c'est tout ce
qu'on te demande.

**Le cadre, pour que tu ne te poses pas la question :** c'est une soumission à ETHOnline 2026.
Le dépôt est public : `https://github.com/JeanBaptisteDurand/ETH_Online_2026`. Le produit
mesure ce qu'un hook Uniswap v4 prélève vraiment sur un swap, en remplaçant son bytecode par
89 octets inertes sur un fork épinglé et en cotant le même swap deux fois. **125 072 mesures.**
Le reste du produit lit ça, ou agit dessus.

**Commence par ça, dans cet ordre :**

1. `git pull origin main`
2. Lis **`docs/FRONT-BRIEF.md`** en entier. Sa **section 0** dit ce qui est figé, ce qui est à
   toi, et ce à quoi il ne faut pas toucher. Le reste contient : les 14 outils rangés en
   3 familles colorées, **deux tableaux de priorité** (quel outil et quelle donnée présenter en
   premier à un jury), l'anatomie d'une page outil, ce qui existe déjà, et les six règles
   d'honnêteté qui ne sont pas négociables.
3. `cd apps/web && npm install && npm run data && npm run dev`
4. Ouvre les trois routes et regarde-les tourner :
   - `#/` — **l'opération** : on colle l'adresse d'un jeton, on lit par quel pool l'acheter et
     ce que ça coûte. Tout est calculé dans la page, sur 125 072 mesures embarquées, sans une
     seule requête. Puis **17 · les cinq accès au produit et pourquoi chacun existe** — le site,
     l'extension, le MCP, x402 en direct sur Hedera, le compte. Puis **18 · quelle donnée sert
     quel outil**, les 27 jeux de données du dépôt avec leur volume et les outils qui les lisent.
   - `#/outil/1` … `#/outil/14` — **une page par outil**, bâtie sur trois temps :
     **ce qui entre** (ce qui n'est pas un fichier, puis les fichiers avec leur volume, puis un
     échantillon réel du corpus) → **il s'exécute** (les étapes numérotées, et ce que ça coûte)
     → **ce qui sort** (les champs rendus par leur vrai nom, puis la sortie réelle : les deux
     cotations du fork pour Mesurer, les règlements relus pour Payer, les écrans du Ledger pour
     Approuver, les neuf états de Permit2 pour Substituer).
     Les trois libellés **changent selon la famille** : un outil d'action ne dit pas « donnée de
     sortie », il dit **ce qui change**.
   - `#/instrument` — les 17 panneaux d'analyse déjà construits.
5. Lis **`src/lib/outils.ts`** et **`src/lib/donnees.ts`**. C'est **la carte** : pour chaque
   outil, la question d'utilisateur, ce qui entre, les étapes, les champs de sortie, le code qui
   l'implémente, les routes, son coût et son état ; et pour chaque jeu de données, ce qu'il
   contient, la commande qui l'a produit et les outils qui le lisent. **Tu n'as rien à deviner.**

**Ce que tu dois produire :**

Le design, avec ton système. Trois contraintes, et elles viennent du produit :

- **Les trois familles ont une couleur** et elle porte une information : bleu = va chercher une
  donnée, jaune = interprète, orange = **change quelque chose**. L'orange est la seule famille
  qui touche à l'argent de quelqu'un ; elle doit se repérer sans lire.
- **L'outil central est le 1 (Mesurer)**, et sa page est la plus importante du site : deux
  cotations du même swap — une avec le hook, une avec un talon inerte de 89 octets à son adresse
  — et l'écart entre elles. C'est l'idée du projet en une image. Donne-lui la forme qu'elle
  mérite.
- **L'outil 7 (Substituer)** est ce qui sépare un tableau de bord d'un produit : il construit la
  transaction de remplacement et la fait signer via **Permit2** — une signature hors chaîne au
  lieu de deux transactions — et **il ne l'envoie jamais**. Le bouton n'est actif que sur l'état
  `PRÊT` ; les huit autres états restent visibles et grisés avec leur raison.

**Ce à quoi tu ne touches pas** (section 0 du brief) : `engine/`, `contracts/`, `apps/api/`,
`packages/`, `apps/web/src/lib/`, et les fichiers **générés** `src/data/facts.json` et
`src/data/dataset.json`. La règle qui résume tout : **aucun nombre écrit à la main dans un
composant** — tout vient de `facts.json`, `dataset.ts` ou `donnees.ts`, et un test fait tomber la
suite si un chiffre est tapé en dur dans un écran.

**Les six règles d'honnêteté** (section 6 du brief) sont l'argument du projet. Un écran qui les
casse casse le projet. La plus importante : **une lecture qui échoue est `NON_MESURABLE`, jamais
un zéro et jamais un blanc** — un blanc se lit « rien », et « rien » se lit « zéro ». Le composant
`<NonLu>` existe pour ça. Et un **refus motivé est une fonctionnalité** : quand l'écran dit
« aucune porte mesurée à cette taille », ce n'est pas un trou à remplir, c'est la réponse.

Une animation **par famille**, pas une par page : quatorze animations différentes fatiguent.

Vérifie à 400 px de large. Les tableaux ont déjà `overflow-x: auto` sur leur conteneur.

Avant de rendre : `cd apps/web && node --test src/lib/*.test.ts` doit rester à 111/111, et
`npm run build` doit passer.

L'instrument est en **français** — c'est une décision, pas un oubli.

---
