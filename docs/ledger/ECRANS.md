# Ce que l'appareil Ledger affiche, mot pour mot

**Deux captures.** La seconde, ci-dessous, est celle qui compte : elle part d'une transaction
REELLE capturee sur Base mainnet, la fait decoder par la garde, et montre a l'appareil le rapport
qui en sort — pas un objet ecrit a la main. Elle se rejoue en une commande :

```bash
scripts/ledger/build-app.sh ethereum
scripts/ledger/run-speculos.sh ethereum          # puis : Settings -> Raw messages -> Enabled
cd packages/guard && TX_INDEX=1 npx tsx scripts/speculos-approve.ts
```

La preuve complete, avec la signature, est dans [`guard-speculos.json`](guard-speculos.json).

## Capture 2 — une transaction reelle, de bout en bout

Transaction `0xfa82cb2cf32bf1d7ba8c33d8ae3f6d4787a16e54dbf612cead72da4bd22d9b13`, bloc 50 888 834
sur Base. La garde en tire le hook `0xb429d62f…` et le pool `0x08f61898…`, et **refuse de donner un
nombre pour ce pool-la** : il n'est pas dans la table. L'appareil affiche ce refus tel quel —
`take non mesure — ce n'est pas zero`. C'est la regle dure du projet, rendue sur du materiel.

```
ECRANS (46) :
  Ethereum app is ready
  Blind signing ahead To accept risk, press both buttons
  Review typed message
  Review struct EIP712Domain
  name TARE Guard
  version 1
  chainId 8453
  Review struct TareGuardApproval
  verdict BLOCK
  summary (1/2) TARE n'a pas mesure ce pool a cette taille. Le meme hook a pris
  summary (2/2) 9999.53 bps ailleurs, au bloc 50614000. Continuer ?
  hook 0xb429d62f8f3bFFb9 8CdB9569533eA23bF0 Ba28CC
  poolId (1/2) 0x08F61898535F7A8C D82529CA22CD0CE6B B9106CCD8FEE74866
  poolId (2/2) D93E1028A2F560
  take non mesure — ce n'est pas zero
  label (1/2) NOT_MEASURABLE (faisceau, pas ce point) (pool_absent_
  label (2/2) de_la_table:hook_ mesure_ailleurs)
  size 530000000000000 en entree
  direction 1->0
  dataset (1/3) 125072 mesures, 112 hooks, 7817 pools, chaine 8453, moteur
  dataset (2/3) tare-engine/0.3.0, stub 0x8e39b2ad4344342
  dataset (3/3) b4f7dc5cf31df0aec9b d5b5f8ec7fccd241256 cf1fda637a4
  measuredAtBlock 50614000
  freshness (1/2) mesures au bloc 50614000 ; bloc courant non fourni,
  freshness (2/2) retard inconnu
  warnings aucun
  promptDigest (1/2) 0xC4D97543070BD71 FF1D7ABE74EFB83BD 950A07BEBE3A5E405
  promptDigest (2/2) BA64E2D5B23CC63
  Sign message
```

Signature `v=28`. Les ecrans « Press right button to continue message or press both to skip » sont
retires de cette liste pour la lisibilite ; ils figurent dans `guard-speculos.json`.

## Capture 1 — la premiere, sur un rapport construit pour le test

Capture brute d'une execution contre Speculos, application Ethereum officielle 1.22.3
(Nano X), reglage « Raw messages » active. Le rapport montre ici venait d'un cas de test,
pas d'un decodage de transaction : c'est pour cela que la capture 2 a ete faite.

```
ECRANS (44) :
  Ethereum app is ready
  Blind signing ahead To accept risk, press  both buttons
  Review typed  message
  Review struct EIP712Domain
  Press right button to  continue message or  press both to skip
  name TARE Guard
  Press right button to  continue message or  press both to skip
  version 1
  Press right button to  continue message or  press both to skip
  chainId 8453
  Press right button to  continue message or  press both to skip
  Review struct TareGuardApproval
  Press right button to  continue message or  press both to skip
  verdict BLOCK
  Press right button to  continue message or  press both to skip
  summary (1/2) Ce hook prend 689.95  bps a ta taille, mesure  au bloc 50614000. 
  summary (2/2) Continuer ?
  Press right button to  continue message or  press both to skip
  hook 0x1aEA38f06deCE45c 252eF1Ac5AF989D51D c8E8cc
  Press right button to  continue message or  press both to skip
  poolId (1/2) 0xD996FF76787C7C52 0483FE0164699395CC 89BFCB6FC4BDBA282
  poolId (2/2) 0771F127FA300
  take 689.95 bps
  Press right button to  continue message or  press both to skip
  label MEASURED
  Press right button to  continue message or  press both to skip
  size 100000000000000 en  entree
  Press right button to  continue message or  press both to skip
  direction 1->0
  Press right button to  continue message or  press both to skip
  dataset (1/3) 125072 mesures, 112  hooks, 7817 pools,  chaine 8453, moteur 
  dataset (2/3) tare-engine/0.3.0,  stub  0x8e39b2ad4344342
  dataset (3/3) b4f7dc5cf31df0aec9b d5b5f8ec7fccd241256 cf1fda637a4
  Press right button to  continue message or  press both to skip
  measuredAtBlock 50614000
  Press right button to  continue message or  press both to skip
  freshness (1/2) mesures au bloc  50614000 ; bloc  courant non fourni, 
  freshness (2/2) retard inconnu
  Press right button to  continue message or  press both to skip
  warnings aucun
  Press right button to  continue message or  press both to skip
  promptDigest (1/2) 0x7CA143E05DC7F4A 9A27E22CD8A8ABDF9 5A20B090601D17599D
  promptDigest (2/2) C17929A239BEDF
  Sign message
SIGNE : v=28 r=caf2c6b9894e5abf9e17867e…
```
