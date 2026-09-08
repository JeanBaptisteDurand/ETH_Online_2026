# @tare/keyring — le Ledger Key Ring, sans appareil physique

## Le probleme que ce paquet resout

TARE paie ses propres requetes. Chaque appel `POST /measure` est regle en x402 par une
`TransferTransaction` Hedera signee avec `HEDERA_PAYER_PRIVATE_KEY` — et cette cle est **en
clair dans `.env`**. Un agent autonome qui manipule de l'argent garde sa cle privee dans un
fichier texte, lisible par n'importe quel processus de la machine.

C'est exactement le probleme que le **Ledger Key Ring Protocol** (LKRP) existe pour
resoudre : *« Secrets, not coins »* — un secret chiffre sous une cle derivee de la graine
Ledger, une validation sur l'appareil a l'installation, puis **plus aucune** ensuite. Un
agent sans tete peut dechiffrer ; un attaquant qui lit le disque ne peut pas.

## Ce qui a ete etabli, et comment

Le CLI package (`@ledgerhq/wallet-cli ring init`) exige un appareil **physique** : il
construit son Device Management Kit avec un seul transport USB, en dur. Quatre tentatives
le confirment — a vide, avec Speculos lance et `SPECULOS_API_PORT`, et avec la variable
non documentee `WALLET_CLI_MOCK=1` (qui simule le backend trustchain, pas l'appareil) :

```
{"ok":false,"error":{"command":"ring init","message":"No Ledger device found."}}
```

**Mais le CLI n'est pas le protocole.** En dessous, `@ledgerhq/hw-ledger-key-ring-protocol`
expose `device.apdu(transport)` et accepte **n'importe quel** `@ledgerhq/hw-transport` —
donc le transport Speculos officiel. Il suffisait de compiler la bonne application :
LKRP ne parle pas a l'app Ethereum mais a **« Ledger Sync »**
(`TRUSTCHAIN_APP_NAME` dans le SDK), dont le depot `LedgerHQ/app-ledger-sync` est public.

Resultat, obtenu contre Speculos servant Ledger Sync **1.2.2** pour Nano X :

```
defi LKRP    bf5e60cc2f2b4a2a2e53f9f034c4bbfe   (trustchain.api.live.ledger.com/v1/challenge)
ecran 1      « Connect to Ledger Sync? »
ecran 2      « Connect »                        -> approbation
publicKey    031fbef68de38f9facd182c1bc60c3f17290c294cc0d197f57eb645aa43733440a
signature    3045022100eea64dbecd1b3ccd222af165757b0ed35e1912a38a0aefab268a8a59c9f1e89e…
attestation  3044022033bb54582d3ae946d780472440333a79601fd48de2c01f38207b7448b21c482b…
```

C'est la primitive d'authentification du Key Ring : l'appareil signe le defi emis par le
backend de Ledger, et joint l'attestation qui prouve que la cle vient bien d'un composant
securise Ledger.

## Rejouer

```bash
scripts/ledger/build-app.sh ledger-sync      # compile l'app depuis LedgerHQ/app-ledger-sync
scripts/ledger/run-speculos.sh ledger-sync   # Speculos sur http://127.0.0.1:5011
npx tsx packages/keyring/scripts/seed-id.ts  # le defi, l'ecran, la signature
```

## Ce qui n'est PAS prouve

- **Aucun appareil physique.** Speculos execute le meme binaire d'application et le meme
  code d'affichage — c'est pour cela que Ledger le publie — mais un emulateur n'est pas un
  Nano dans une main.
- **Le cycle complet `init / encrypt / decrypt` n'est pas fait.** Le seed ID est la
  premiere etape ; creer la trustchain, ajouter le membre et publier la cle sont des appels
  au backend de Ledger qui suivent, et qui ne sont pas encore ecrits ici.
- La graine est celle de test par defaut de Speculos. Aucune graine reelle n'a touche cette
  machine.
