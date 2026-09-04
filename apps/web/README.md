# TARE — l'instrument (`apps/web`)

La surface dense. Pas la page de présentation.

**La règle absolue :** un verdict utile à l'écran en moins de 5 secondes, sans wallet, sans clic,
sans inscription. Le tableau **est** le résultat, il s'affiche au chargement. Les données mesurées
sont dans le paquet JavaScript : lire le verdict ne demande aucune requête réseau.

```bash
npm install
npm run build     # data -> verify -> tsc -> vite build
npm run preview   # http://localhost:4181
npm run dev
```

## Ce que la page contient

| # | panneau | ce qu'il fait |
|---|---------|----------------|
| 01 | le verdict | quatre nombres, écrits et non animés, chacun recompté au build |
| 02 | le tableau | une ligne par hook. `CE QUE LE REGISTRE DIT` **≠** `CE QUE LA MESURE DIT` |
| 03 | 14 LED | on colle une adresse, 14 LED s'allument. Zéro RPC, zéro backend, latence nulle |
| 04 | la fiche | l'adresse, la fiche du registre, et la phrase de désaccord |
| 05 | la courbe | profil taille → bps. Canvas nu, X logarithmique, Y ancré à 0 |
| 06 | les lignes brutes | chaque mesure, son étiquette, et **sa commande de rejeu** |

## Les trois affirmations, et comment elles sont contrôlées

`npm run verify` sort en code 1 dès qu'une affirmation ne tient plus, et il est branché **dans**
`npm run build`. Une affirmation invalidée casse la chaîne, elle ne s'affiche pas quand même.

1. **Les 14 permissions d'un hook SONT les 14 bits de poids faible de son adresse.**
   Contrôlé sur l'instantané du registre officiel `Uniswap/hooklist` : **757 fiches sur 757,
   10 598 comparaisons de bits, zéro écart.** L'ordre des bits utilisé pour le contrôle est **lu
   dans `src/lib/flags.ts`** — le fichier livré au navigateur — et non recopié dans le script.
2. **Le registre est qualitatif.** Recensement des champs : **27 champs feuilles, 19 booléens,
   1 numérique (`hook.chainId`, un identifiant de réseau), 0 champ quantitatif.** Aucun champ ne
   peut contredire la colonne de droite, parce qu'aucun champ ne chiffre quoi que ce soit.
3. **Le jeu de données dérivé n'invente rien.** `bpsMax`, le nombre de pools, le nombre de lignes
   et les 60 mesures au-dessus de 1 bps sur `stored_lp_fee = 0` sont recomptés depuis
   `docs/measurements-v1.json` à chaque build. Et : aucune ligne ne porte un nombre sans
   l'étiquette `MESURE`, aucune `MESURE` n'est sans nombre.

## Les quatre règles du produit, dans le code

1. **Le modèle ne produit jamais un nombre.** Aucun nombre affiché n'est calculé côté client :
   ils viennent tous de `docs/measurements-v1.json` ou d'un recomptage au build.
2. **Chaque mesure porte une étiquette** — `MESURE` / `INTERPOLE` / `NON_MESURABLE` /
   `NON_COTABLE`. L'étiquette d'un hook est la **plus forte présente**, jamais une moyenne.
   Une étiquette n'est **jamais colorée** : colorer un label, c'est faire croire à une grandeur.
3. **Aucune conclusion sur une réponse tronquée.** Une lecture bornée est un `NON_MESURABLE`,
   jamais une valeur. Les 58 lignes `NON_COTABLE` affichent `—`, sans fond de rampe, avec leur
   sélecteur de revert (`7a5ed734` → `NotEnoughLiquidity`).
4. **Chaque valeur porte son bloc, sa taille et son sens, et se rejoue en une commande.**
   La commande de rejeu est réelle et a été exécutée contre le fork :

   ```
   cd engine && python3 -c "from tare.poolid import PoolKey; from tare.measure import measure; print(measure('http://127.0.0.1:8545', PoolKey('0x0000000000000000000000000000000000000000','0xb200000000000000000000d7a3d02bfaccc0d601',0,200,'0x985c14baa2a18316ffda0aefb3a632fadfca2acc'), True, 1000000000000000, 50614000))"
   ```

   → `out_with=442747808421317694054679`, `out_without=447218008457966041360433`,
   `bps=99.9557`, `label=MEASURED` — **identiques** à la ligne 0 de `docs/measurements-v1.json`.
   Une ligne `NON_COTABLE` a aussi été rejouée : même verdict, `NOT_QUOTABLE / NotEnoughLiquidity`.

## La charte, appliquée

`border-radius: 0` partout · JetBrains Mono Variable (39,5 kB) pour tout ce qui est structure et
chiffre · Instrument Sans Variable (29,4 kB) pour la prose · **une seule famille chromatique**, la
rampe `inferno` tronquée `[0,18 ; 0,90]` sur 7 paliers, qui encode `bps` et rien d'autre · cellule
à trois étages, fond à 22 % et barre interne gauche 3 px, **l'encre ne change jamais** · mode clair
avec la rampe `YlOrRd` ré-ancrée · aucune ombre portée, aucun dégradé d'interface, aucun nombre
animé · `prefers-reduced-motion` respecté.

**La courbe** (`src/components/Curve.tsx`, Canvas nu, aucune bibliothèque de graphes) : axe X
logarithmique, axe Y **ancré à 0 par défaut**, zoom disponible mais étiqueté `ZOOM · Y NON ANCRE`,
points à `r = 3 px` **jamais lissés en spline**, série de référence — le stub — **toujours grise**,
à 0 bps par construction. L'opacité encode la densité de séries superposées ; **aucun point n'est
déplacé** pour être rendu visible.

## Données

| fichier | rôle | tenu à jour par |
|---|---|---|
| `../../docs/measurements-v1.json` | 128 mesures réelles, Base, bloc 50 614 000 | le moteur (`engine/`) |
| `public/data/hooklist.snapshot.json` | instantané du registre officiel, épinglé à un commit | `npm run registry` (réseau) |
| `src/data/dataset.json` | dérivé au build des deux précédents | `npm run data` |

`npm run registry` est le seul script qui demande le réseau ; il n'est **pas** appelé par le build.

## Ce que je ne sais pas — NON VÉRIFIÉ

- **Le profil de taille ne contient que 2 tailles**, pas 5. `docs/measurements-v1.json` ne contient
  que `1e15` et `1e17`. L'interface l'écrit en toutes lettres sous la courbe et ne trace que les
  points existants. Elle ne fabrique pas les trois autres.
- **Un seul bloc** (50 614 000) et **une seule chaîne** (Base). Rien ici n'est une série temporelle.
- **`bpsMax` est un maximum observé**, pas un maximum possible : il dépend des tailles cotées.
- L'API du LOT B n'est pas branchée ; les données sont lues au build depuis le dépôt.
- Le nombre de fiches du registre bouge : il valait 737 puis 757 en une heure. Le commit est affiché
  dans l'en-tête et dans le pied de page pour que le chiffre soit toujours rattachable.

## Captures

`docs/instrument-full.png` (page entière, sombre) · `docs/instrument-light.png` (mode clair) ·
`docs/instrument-zoom.png` (la courbe avec `ZOOM · Y NON ANCRE` — l'exagération devient visible,
c'est exactement pour cela que le zoom porte une étiquette).
