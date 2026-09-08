# @tare/keyring — le Ledger Key Ring, sans appareil physique

## Le probleme que ce paquet resout

TARE paie ses propres requetes. Chaque appel `POST /measure` est regle en x402 par une
`TransferTransaction` Hedera signee avec `HEDERA_PAYER_PRIVATE_KEY` — et cette cle est **en
clair dans `.env`**. Un agent autonome qui manipule de l'argent garde sa cle privee dans un
fichier texte, lisible par n'importe quel processus de la machine.

C'est le probleme que le **Ledger Key Ring Protocol** (LKRP) existe pour resoudre :
*« Secrets, not coins »* — un secret chiffre sous une cle derivee de la graine Ledger, une
validation sur l'appareil a l'installation, puis **plus aucune** ensuite. Un agent sans
tete continue de dechiffrer ; un lecteur du disque ne trouve plus la cle, seulement un
membre revocable. Ce que cela protege exactement, et ce que cela ne protege pas, est ecrit
plus bas — sans arrondir.

## Ce qui tourne, de bout en bout

Le CLI package (`@ledgerhq/wallet-cli ring init`) exige un appareil **physique** : il
construit son Device Management Kit avec un seul transport USB, en dur. Quatre tentatives
le confirment — a vide, avec Speculos lance et `SPECULOS_API_PORT`, et avec la variable
non documentee `WALLET_CLI_MOCK=1` (qui simule le backend trustchain, pas l'appareil) :

```
{"ok":false,"error":{"command":"ring init","message":"No Ledger device found."}}
```

**Mais le CLI n'est pas le protocole.** En dessous, `@ledgerhq/ledger-key-ring-protocol`
prend un `WithDevice` qu'on fournit, et `@ledgerhq/hw-ledger-key-ring-protocol` expose
`device.apdu(transport)` avec **n'importe quel** `@ledgerhq/hw-transport`. Il suffisait de
compiler la bonne application : LKRP ne parle pas a l'app Ethereum mais a **« Ledger
Sync »** (`TRUSTCHAIN_APP_NAME`), dont le depot `LedgerHQ/app-ledger-sync` est public.

Le cycle complet, obtenu contre Speculos servant Ledger Sync **1.2.2** pour Nano X :

| etape | resultat |
|---|---|
| defi LKRP | `trustchain-backend.api.aws.stg.ldg-tech.com/v1/challenge`, TLV de 183 o signe par Ledger |
| seed ID | l'appareil signe : `031fbef68de38f9facd182c1bc60c3f17290c294cc0d197f57eb645aa43733440a`, avec attestation |
| trustchain | creee — `00914e888507dbcb06b27d5fd3e50f3465d632d63fde0b07b587f7ebb99cfae281` |
| chiffrement | la vraie `HEDERA_PAYER_PRIVATE_KEY`, scellee en 132 octets |
| **ouverture** | **Speculos eteint, port mort, transport interdit — le secret sort** |
| **paiement** | une requete x402 reelle reglee avec cette cle : `0.0.7162784@1788855729.911769704` |

Les ecrans, dans l'ordre — il y a **deux** approbations, pas une :

```
Connect to Ledger Sync?  ->  Connect                      <- appui double
Connection requested
Turn on sync for Ledger Wallet?
Ledger Wallet will be able to view and update your synced accounts.
                         ->  Turn On sync                 <- appui double
Sync requested
```

## Ce que ca protege, et ce que ca ne protege pas

Sur le disque (`var/keyring.json`, mode 0600) il y a : la cle privee du **membre**, le
`rootId`, et le secret **scelle**. Il n'y a **pas** la cle de chiffrement — le membre la
retrouve en s'authentifiant aupres du backend de Ledger, qui lui rend le flux resolu de la
trustchain (`restoreTrustchain`). Un test le verifie, et `parseRing` **refuse** un fichier
qui en contiendrait une : ce fichier-la ne protegerait rien.

Ce qu'on gagne, exactement :

- la cle de paiement n'est plus **en clair** sur le disque ;
- l'acces est **revocable** — `removeMember` coupe cette machine sans toucher la graine,
  les autres membres, ni le secret ;
- l'acces est **attribuable** a une machine nommee ;
- l'amorcage a exige une **approbation materielle**.

Ce qu'on ne gagne pas : un attaquant qui vole le fichier du membre **et** peut joindre le
backend de Ledger peut dechiffrer. Ce n'est pas un coffre, c'est une **delegation
revocable**. C'est deja tres au-dessus d'une ligne de `.env`, et ce n'est pas un coffre.

## Ou ca se branche dans TARE

`apps/api/src/pay/secret.ts` resout la cle : trousseau s'il existe, environnement sinon —
et il **dit toujours lequel**, jusque dans la preuve de reglement
(`docs/x402-settlements.jsonl`, champ `source_de_la_cle`). Le repli existe pour que le
projet reste utilisable sans conteneur Speculos, mais il s'annonce : « il marche » et « il
est protege » ne sont pas la meme phrase.

## Rejouer

```bash
scripts/ledger/build-app.sh ledger-sync       # compile depuis LedgerHQ/app-ledger-sync
scripts/ledger/run-speculos.sh ledger-sync    # Speculos sur http://127.0.0.1:5011

npx tsx packages/keyring/scripts/seed-id.ts   # le defi, l'ecran, la signature
set -a; . ./.env; set +a
npx tsx packages/keyring/scripts/ring.ts seal # scelle HEDERA_PAYER_PRIVATE_KEY

docker rm -f tare-speculos-ledger-sync        # on ETEINT l'appareil
npx tsx packages/keyring/scripts/ring.ts open # et le secret sort quand meme

# et le paiement, avec la variable retiree de l'environnement :
cd apps/api && env -u HEDERA_PAYER_PRIVATE_KEY \
  TARE_POOL_ID=0x… TARE_DIRECTIONS='1->0' npx tsx src/pay/cli.ts payer
```

## Le bug amont qui empeche quiconque d'installer ce paquet

`npm install @ledgerhq/ledger-key-ring-protocol` **echoue pour tout le monde** :

```
ledger-key-ring-protocol@0.15.2
  -> @ledgerhq/speculos-transport@0.10.6
       -> @ledgerhq/live-dmk-speculos@0.10.0     <- absent de npm (le nom entier rend 404)
```

`@ledgerhq/live-dmk-speculos` n'est publie a **aucune** version, et **toutes** les versions
de `speculos-transport` >= 0.9.6 en dependent. Dans le monorepo de Ledger Live la
resolution passe par un lien de workspace ; hors de lui, elle 404. Or **aucun fichier** du
protocole ne charge `speculos-transport` : c'est une dependance declaree et inutilisee.

Notre contournement, dans `package.json`, avec sa raison ecrite a cote :

```json
"overrides": { "@ledgerhq/speculos-transport": "npm:@ledgerhq/logs@6.17.0" }
```

C'est laid, et c'est assume : le paquet est aliase sur un module qui s'installe et que
personne ne charge. Le correctif amont est d'une ligne — publier `live-dmk-speculos`, ou
retirer la dependance — et il est propose dans [`OPEN-SOURCE.md`](../../OPEN-SOURCE.md).

## Ce qui n'est PAS prouve

- **Aucun appareil physique.** Speculos execute le meme binaire d'application et le meme
  code d'affichage — c'est pour cela que Ledger le publie — mais un emulateur n'est pas un
  Nano dans une main.
- **Le backend est celui de RECETTE.** La production refuse notre attestation
  (« Attestation is for an unknown application »), et elle a raison : notre `.elf` est
  compile localement, donc non signe par Ledger. Un Nano de production irait en production.
- La graine est celle de test par defaut de Speculos. Aucune graine reelle n'a touche cette
  machine.
