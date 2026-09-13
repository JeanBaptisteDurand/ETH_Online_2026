# TARE — l'état du front, ce qui manque, et comment câbler le compte

> **À qui ce document s'adresse.** Au Claude qui fait le design, et à JB. Il dit trois choses :
> ce que la branche `design/tare` a fait, **ce qui manque pour qu'un juge comprenne le produit**,
> et **la spécification complète du compte, des clés d'API, du MCP et de l'extension** — parce
> que ces quatre-là existent dans le code, marchent, et ne sont visibles nulle part à l'écran.
>
> Tout ce qui est écrit ici a été vérifié dans un navigateur ou dans le code, à la date du
> 12 septembre 2026. Quand une chose n'a pas pu être vérifiée, c'est écrit.
>
> Le reste du cadre est dans [`FRONT-BRIEF.md`](FRONT-BRIEF.md) (section 0 : ce qui est figé,
> ce qui est à toi) et dans [`PROMPT-FRONT.md`](PROMPT-FRONT.md).

---

## 1. La branche `design/tare`

Un commit, `b1bde67`, « design skeleton », par Florent Belotti. Il n'a touché que `apps/web` :
ni la landing, ni `src/lib/`, ni le moteur, ni les contrats. **Le build passe. Zéro erreur de
console sur les seize routes. Aucun nouveau débordement horizontal.** Le triptyque
entrée → exécution → sortie est intact sur les quatorze pages d'outil, et `donnees.ts` est
toujours la source des jeux de données. Le travail est propre et respecte le périmètre.

Ce qu'il a ajouté de vraiment bon :

- une **carte du système** (`Carte.tsx`, 500 lignes) : les 27 jeux de données en amont, les
  14 outils, l'orchestrateur à 6/6 étapes en 13 680 ms ;
- sur `#/outil/1`, une **figure appariée** qui met `out_with` et `out_without` sur une base 100,
  **les nomme**, et ajoute la glose de la PoolKey — ce que ma version ne faisait pas ;
- un glossaire des sept champs rendus ;
- le hash du talon en entier dans l'en-tête, avec ses étiquettes de provenance.

Une décision qu'il a prise et qu'il faut valider : sur la page outil, **il affiche la sortie
avant l'entrée**. C'est défendable — on montre le résultat d'abord — mais ça contredit l'ordre
de lecture documenté dans le brief. À trancher, ce n'est pas un défaut.

---

## 2. Est-ce qu'on comprend le produit sur la page d'accueil ? — Non

C'est le constat le plus lourd du document, et il est **mesuré**, pas ressenti. Sur le texte
rendu de toute la page d'accueil :

| mot | occurrences |
|---|---|
| **Uniswap** | **0** |
| **v4** | **0** |
| hook | 24 — **jamais défini** |

La phrase qui explique le produit **existe** : *« Ce qu'un hook Uniswap v4 prend réellement sur
un swap. Le même swap coté deux fois, avec le hook et avec un stub inerte. L'écart est la
mesure. »* Elle est dans le `<meta name="description">` de `index.html`. **Elle n'est rendue
nulle part dans la page.** Personne ne la lit.

L'ordre de lecture est à l'envers pour quelqu'un qui arrive froid :

| écran | ce qu'il voit | ce que ça lui dit |
|---|---|---|
| 1 | « La chaîne et ses 14 outils » + la carte des 27 jeux | une **architecture interne**. Il ne sait pas encore de quoi on parle |
| 2 | 99,03 contre 100,00 → **96,74 bps**, et les wei bruts | la méthode et le chiffre — enfin |
| 3 | « Colle une adresse de jeton » | l'action |

Et une phrase a disparu au passage. `main` ouvrait sur :

> « par où acheter ce jeton, et ce que ça coûte — 125 072 mesures embarquées · aucune requête.
> Colle l'adresse d'un jeton. On te dit par quel pool l'acheter, ce que ce pool prend — frais LP
> plus prélèvement du hook, mesuré — **et ce qu'il te reste sur 100.** »

« Et ce qu'il te reste sur 100 » était la seule phrase qui disait au visiteur **ce qu'il
obtient**. Elle n'existe plus.

---

## 3. Le compte, les clés d'API, le MCP, l'extension

**C'est la partie la plus rentable du document**, parce que tout ce qui suit **est déjà écrit,
testé, et ne demande que des écrans**.

### 3.1 L'état réel, à l'écran

| élément | dans le code | à l'écran |
|---|---|---|
| panneau compte | oui, panneau 15 de `#/instrument` | **présent, mais 628 caractères** : il s'arrête à « aucun portefeuille annoncé » |
| connexion portefeuille | **EIP-6963**, écrit à la main dans `src/compte/api.ts` | un message d'état, **pas de bouton** |
| clés d'API | `Compte.tsx` — « une par surface » | **jamais visible** sans portefeuille |
| **téléchargement de l'extension** | `GET /compte/extension.zip` | **`extension.zip` : 0 occurrence dans le texte rendu des 16 routes** |
| **téléchargement du MCP** | `GET /compte/mcp.tgz` | **idem, 0 occurrence** |
| **configuration MCP** | `apps/mcp/README.md` | **nulle part sur le site** : `mcpServers` 0, `claude_desktop` 0, `stdio` 0 |
| abonnement lu on-chain | `POST /compte/abonnement` | en prose seulement — normal, le contrat n'est pas déployé |
| historique | `GET /compte/journal` | en prose seulement |

**RainbowKit : absent, et ce n'est pas un oubli.** La découverte des portefeuilles passe par
**EIP-6963** (`eip6963:requestProvider` / `eip6963:announceProvider`), écrite à la main, sans
wagmi, sans viem, sans WalletConnect. La raison est bonne : avec deux portefeuilles installés,
`window.ethereum` n'en montre qu'un et cache l'autre. **La conséquence est réelle : pas de QR
code, pas de mobile.** Un juge qui ouvre le site sur son téléphone ne peut pas se connecter.

### 3.2 Les deux authentifications — elles ne se mélangent jamais

C'est la règle du `router.ts`, et l'interface doit la refléter :

| | qui la porte | en-tête | ce qu'elle ouvre |
|---|---|---|---|
| **jeton de session** | un **humain** devant un navigateur | `authorization: Bearer <jeton>` | lire le compte, gérer les clés, lire l'historique |
| **clé d'API** | une **machine** — l'extension, le MCP | `x-tare-cle: <clé>` | **écrire au journal, et rien d'autre** |

> **Une clé ne peut jamais en créer une autre.** C'est volontaire, et ça mérite d'être dit à
> l'écran : c'est un argument de sécurité qu'un jury comprend en une phrase.

### 3.3 Toutes les routes du compte

| méthode | route | auth | ce qu'elle fait |
|---|---|---|---|
| `POST` | `/compte/nonce` | — | `{adresse}` → un nonce à usage unique |
| `POST` | `/compte/session` | — | `{adresse, nonce, signature}` → un jeton de session |
| `DELETE` | `/compte/session` | Bearer | déconnexion |
| `GET` | `/compte` | Bearer | le compte : abonnement, clés, état |
| `POST` | `/compte/cle` | Bearer | `{portee: 'extension' \| 'mcp', nom?}` → **la clé, rendue UNE SEULE FOIS** |
| `DELETE` | `/compte/cle/:id` | Bearer | révoquer une clé |
| `POST` | `/compte/abonnement` | Bearer | déclencher la relecture on-chain |
| `GET` | `/compte/extension.zip` | Bearer + abonnement | le paquet de l'extension |
| `GET` | `/compte/mcp.tgz` | Bearer + abonnement | le serveur MCP, empaqueté par `npm pack` |
| `GET` | `/compte/paquets` | Bearer | l'état des deux paquets |
| `GET` | `/compte/journal` | Bearer | l'historique — `?quoi=` et `?limite=` |
| `POST` | `/compte/journal` | **`x-tare-cle`** | l'extension et le MCP y déposent |

Deux refus que l'interface doit rendre **tels quels**, parce qu'ils disent leur raison :

- créer une clé sans abonnement actif → **402**, avec `{error: "abonnement inactif", detail, abonnement}`.
  Le code le dit : *« une clé ne sert à rien sans abonnement, et le dire ici vaut mieux que de
  la délivrer pour qu'elle soit refusée plus tard, sans qu'on sache pourquoi. »*
- la clé n'est **jamais** renvoyée deux fois : la base n'en garde que le `sha256`. Le message de
  l'API est `« notez-la maintenant : elle n'est rendue qu'une fois »`. **L'écran doit la montrer
  une fois, en gros, avec un bouton copier, et ne jamais prétendre pouvoir la relire.**

### 3.4 Ce qu'il faut construire, écran par écran

Rien de tout ceci n'existe à l'écran aujourd'hui. Tout existe côté API.

1. **Un bouton « connecter »** qui liste les portefeuilles annoncés par EIP-6963, et, s'il n'y
   en a aucun, dit quoi installer — c'est déjà le texte actuel, il lui manque le bouton.
2. **Deux cartes de clé**, une par portée, avec leur raison d'être :
   - `extension` → *« pour que l'extension dépose ses verdicts dans ton historique. Elle marche
     sans, hors ligne. »*
   - `mcp` → *« pour que le serveur MCP dépose ses appels dans ton historique. Il marche sans. »*
   Dans les deux cas, **la clé est facultative** — c'est un argument, pas une limite, et il faut
   l'écrire.
3. **La clé neuve, affichée une fois**, en grand, avec « copier », et un avertissement explicite.
4. **Deux boutons de téléchargement** — extension et MCP — avec leur prérequis (abonnement) et,
   juste en dessous, **les instructions d'installation** de la section 3.5.
5. **L'historique**, avec ses filtres `quoi` et `limite`.
6. **L'abonnement**, avec le bouton « relire sur la chaîne » et le refus motivé quand la lecture
   échoue : *« abonnement non vérifié, donc pas actif »* — jamais « abonné » sur la foi d'une
   transaction partie.

### 3.5 L'installation, à afficher sur le site

**L'extension** — `chrome://extensions` → mode développeur → **Load unpacked** → le dossier
décompressé. La clé d'API se règle dans la page d'options. Sans clé, elle fonctionne : la table
des mesures vit dans son service worker, **elle ne fait aucune requête**. L'API par défaut est
`http://127.0.0.1:8787`, et la clé est stockée sous `tare.cle_api` dans `chrome.storage.local`.

**Le serveur MCP** — dans Claude Desktop, ajouter à
`~/Library/Application Support/Claude/claude_desktop_config.json`
(`%APPDATA%\Claude\claude_desktop_config.json` sur Windows) :

```json
{
  "mcpServers": {
    "tare": {
      "command": "node",
      "args": ["<chemin>/apps/mcp/dist/src/index.js"]
    }
  }
}
```

Dans Claude Code, une ligne :

```bash
claude mcp add tare -- node <chemin>/apps/mcp/dist/src/index.js
```

**La clé est facultative** : `TARE_CLE_API`, de portée `mcp`, et elle ne sert **qu'**à déposer
les appels dans l'historique. Sans elle, le serveur répond depuis les **125 072 mesures
commitées** et n'envoie rien à personne. Ses quatre outils : `tare_measure`, `tare_lookup`,
`tare_impact`, `tare_twins`.

---

## 4. Le rejeu VM — une régression

`main` montrait, sur `#/outil/1`, **six exécutions du contrefactuel — les plus fortes du
corpus**, chacune avec ses deux valeurs brutes et **sa propre commande de rejeu**, sous la
phrase qui expliquait la démarche. Dont celle-ci :

| hook | sens · taille | bps | avec le hook | avec le talon |
|---|---|---|---|---|
| `0xb429d62f…` | 1→0 · 1 000 000 000 000 | **9 999,5279** | 76 | 1 609 989 |

`design/tare` n'en garde **qu'une**, et c'est la **médiane** (100,00 bps). −1 612 caractères,
**cinq commandes de rejeu perdues**, et le cas le plus spectaculaire du corpus avec.

Son choix est argumenté dans son propre code — le maximum est un pool où il ne sort presque
rien, vrai mais illisible comme figure. **Il a raison sur la figure. La solution est d'ajouter,
pas de remplacer :** sa figure médiane en haut, et les six lignes en dessous, dépliables.

---

## 5. Quatre chiffres qui mentaient — déjà corrigés et poussés

Trouvés en croisant la landing, l'instrument et la branche de design. **Aucun n'était couvert
par un test.** Les quatre sont corrigés sur `main`, et trois ont désormais un test.

| | ce qui était affiché | la vérité |
|---|---|---|
| **le titre de la landing** | « 1 559 hooks. **Zero** declare. » et « not one emits either » | **9 déclarent** — la section juste en dessous l'écrivait déjà, avec neuf cases allumées. Le titre **lit** maintenant `hooks_declaring`, et un test refuse les deux phrases mortes |
| **les attestations** | « **99** hooks attestés » en gros | `build-facts.mjs` étiquetait « écrits » ce qui est **« à écrire »**. **16** sont on-chain, chacune avec son hash. Maintenant : 99 calculés · 17 transactions envoyées · **16 écrites** · 13 écartées faute de mesure |
| **le `<noscript>`** | « 128 mesures, 4 hooks, 32 pools », et il citait `docs/measurements-v1.json`, **un fichier qui n'existe plus** | 125 072 / 112 / 7 817. Servi sur **chaque route** à tout ce qui ne lance pas de JavaScript — un robot d'indexation, un aperçu de lien. Corrigé, + test |
| **« 37 % des projets primés »** | attribué au **site** | dans `docs/planning/04-finalist-profile.md`, le 37 % porte sur « extension · mobile · WhatsApp · mini-app ». Remplacé par celui qui soutient vraiment l'argument : **les 27 projets primés en asynchrone avaient tous une URL de démo vivante, 27 sur 27** |

---

## 6. La landing et l'instrument : qui rate quoi

Deux surfaces, deux rôles. La **landing** (`/`, en **anglais**) porte l'argument en 8 sections.
L'**instrument** (`/hooks/`, en **français**) porte le produit. Elles ne se doublonnent pas —
mais chacune a un trou.

### Un juge qui ne voit que l'accueil de l'instrument rate

1. **Pourquoi le nombre est valide.** Que la **PoolKey contient l'adresse du hook**, donc que
   « le même pool sans son hook » n'existe pas, donc qu'on remplace son **bytecode**. Sans ça,
   « 96,74 bps » est un chiffre parmi d'autres. **La perte la plus coûteuse.**
2. **Pourquoi le projet existe.** Le registre officiel : **978 fiches, 27 champs, 19 booléens,
   0 quantité**, et `"additionalProperties": false` — *le schéma n'omet pas un nombre, il
   interdit d'en ajouter un*. Absent de l'accueil. Et « 9 hooks sur 1 559 » n'y est que **dans
   un dépliant fermé**, en incise d'une description de fichier.
3. **L'échelle.** « 125 072 mesures » sans **7 817 pools · 112 hooks · 8 tailles · les deux
   sens**. 125 072 mesures d'un seul pool donneraient le même chiffre.
4. **Que le taux dépend de la taille.** Le sélecteur de taille est là sans un mot ; la
   démonstration A3 (5 tailles, ±0,05 bps, réécriture indépendante antérieure au code) n'y est
   pas.
5. **« Ce que je ne sais pas ».** 61 916 lignes sur 125 072 ne sont **pas** des valeurs ;
   `NOT_QUOTABLE` ≠ `NOT_MEASURABLE` ; deux erreurs passées publiées avec leur correction ;
   aucune attribution nommée. **L'instrument n'a aucune section limites.** La discipline est
   codée partout — refus motivés, `<NonLu>`, compteurs de troncature — elle n'est **jamais
   plaidée**. Un jury ne peut pas créditer ce qu'il ne lit pas.
6. **78 des 112 hooks mesurés sont absents du registre**, et **7 794 paires sur 7 802 n'ont
   qu'un seul pool**. Les deux faits qui transforment « ce hook prend X » en « et tu ne peux pas
   y échapper ».

### Un juge qui ne voit que la landing rate

1. **Trois surfaces sur cinq : zéro mot.** L'extension, le serveur MCP, le compte.
2. **Le geste.** Coller une adresse et obtenir un classement de portes. La landing le *promet*
   en section 06 ; son propre champ ne décode que les 14 bits de permission.
3. **Le coût total.** La landing ne publie que le prélèvement du hook ; l'instrument additionne
   les **frais LP lus sur la chaîne**. C'est le total qui décide pour un utilisateur.
4. **La preuve que le contrefactuel ne ment pas** : la porte A4, un swap **réellement exécuté**
   recollé à sa cotation au wei près. Réduite à une subordonnée sans chiffre — alors que c'est
   l'objection numéro un d'un juge v4.
5. **La chaîne bout en bout** : 6/6 étapes en 13 680 ms, transaction réelle → verdict → autre
   porte → mesure payée → ancrage HCS → signature sur l'appareil.
6. **Les détails qui gagnent les prix de sponsors** : x402 à **0,001 USDC** avec un 402 qui
   annonce son prix et un **prix dynamique** (cinq mesures coûtent cinq fois), la clé signataire
   **scellée dans un Ledger**, **HCS-14** nommé et recalculable, **Permit2** et la liste de
   commandes `0x0a10`, et la transaction de remplacement **jamais envoyée**.

---

## 7. Ce qu'il reste à faire, par priorité

### À faire absolument — quatre items, tous du texte, aucun design

1. **Une phrase en haut de l'accueil** : ce que mesure TARE, sur **Uniswap v4**, et pour qui.
   Le mot « Uniswap » n'est aujourd'hui nulle part sur la page.
2. **Le contrefactuel en deux phrases** sous la figure : la PoolKey contient le hook → on
   remplace le bytecode par 89 octets inertes → sur un fork épinglé → l'écart est le
   prélèvement.
3. **Remettre les six contrefactuels** sur `#/outil/1`, dépliables sous la figure médiane, dont
   le hook à 9 999,53 bps.
4. **Remonter hors du dépliant** « 9 hooks sur 1 559 déclarent » et « le registre a 0 quantité,
   et son schéma interdit d'en ajouter une ».

### Très rentable

- Une section **« ce que je ne sais pas »** sur l'instrument — c'est ce qui fait croire au reste.
- **L'échelle du corpus** à côté de « 125 072 » : 7 817 pools, 112 hooks, 8 tailles, deux sens.
- **Rendre les cinq accès cliquables** vers leur surface.
- **Les écrans du compte** de la section 3.4, et les instructions d'installation de la 3.5.
- La phrase **« et ce qu'il te reste sur 100 »**, remise là où elle était.

### À décider par JB, pas par le front

- **RainbowKit** : environ deux heures, et ça règle le mobile. Sans lui, aucune connexion depuis
  un téléphone.
- **La langue** : la landing est en anglais, l'instrument en français. Un juge qui suit le
  bouton passe de l'une à l'autre.
- **La landing parle-t-elle du produit** (extension, MCP, compte) ou reste-t-elle l'argument pur ?

### Pré-existant, à savoir — ce n'est la faute de personne sur cette branche

- **`#/instrument` déborde à 390 px** : cinq `<th>` en `position: sticky` dans la table « Les
  lignes brutes de ce hook » échappent au conteneur à `overflow-x: auto`. Présent aussi sur
  `main`. L'accueil et les pages outil, eux, ne débordent pas.
- **`npm run build` sur la landing prend 5 min 30** (l'étape `facts.mjs`), et
  `src/generated/facts.json` est **gitignoré** — donc il est régénéré à chaque déploiement.
  À savoir avant de compter sur un déploiement de dernière minute.
- La table « Le registre contre la mesure » tronque les frais LP on-chain à 3 valeurs + « +5 »
  au lieu de 8, et le libellé a perdu le mot **« on-chain »**, qui disait d'où venait le chiffre.

---

## 8. Ce qui reste dans les mains de JB

Ni le front ni son Claude n'y peuvent rien. Si un écran dit « en attente », c'est **ça** qu'il
attend — ce n'est pas un bug à corriger :

- activer GitHub Pages (Settings → Pages → Source : GitHub Actions) ;
- **révoquer la clé Alchemy**, encore présente dans l'historique git public ;
- déployer `AbonnementTARE` sur un réseau public, puis renseigner `TARE_ABONNEMENT_CONTRAT` et
  régénérer la fiche — **tant que ce n'est pas fait, le compte répond « abonnement non vérifié,
  donc pas actif », et c'est le comportement correct** ;
- renseigner `TARE_DEMO_URL` et régénérer ;
- tourner la vidéo ;
- ouvrir la PR `Uniswap/hooklist` et envoyer le formulaire de retour Uniswap.
