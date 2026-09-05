# 22 — LE PROFIL DU FINALISTE ASYNC (le bon échantillon, enfin)

> **Correction majeure.** Les docs 12, 18, 20 et 21 raisonnaient sur les **20 finalistes présentiels**
> (Cannes, New York). ETHOnline est **async**. L'avocat du diable a trouvé le marqueur du prix Finalist
> dans les listings (uuid sponsor `xdat5`, 20/20 de précision), ce qui débloque **27 finalistes async**
> jamais analysés — Open Agents 7 · HackMoney 2026 10 · ETHOnline 2025 10. Leurs fiches complètes ont été
> récupérées : `research/win-async-finalists.json`.
> **LPLens de JB est l'un des 27, et il a les meilleurs scores automatiques du lot (o8 p8 t9).**

## 1. Les 27 finalistes async

| Événement | Projets |
|---|---|
| **ETHOnline 2025** | CronPay · WannaBet · DeFlow · ChronoVault · EthVaultPQ · Siphon Protocol · SafeSend · Common-Lobbyist · Sippy · OpenPayAI |
| **HackMoney 2026** | AutoPay · Blip Market · PulsePlay · claw2claw · GrimSwap · BorrowBot · Xpack · Oikonomos · router402 · Magnee |
| **Open Agents 2026** | Clan World · Mnemosyne · Aegis402 · DAIO · Slopstock · Common OS · **LPLens** |

## 2. Async ≠ IRL : les écarts mesurés

| | **Async (27)** | IRL (20) | Lecture |
|---|---|---|---|
| médiane `howItsMade` | **1 764 car.** | 975 | **+81 %** — l'écrit porte la démo |
| plusieurs dépôts | **33 %** | 15 % | plus de surface, pas moins |
| mentionne des tests | **30 %** | 10 % | ×3 |
| **URL de démo live** | **27/27 (100 %)** | 18/20 | **unanime** |
| paiement / abonnement / facturation | **52 %** | 40 % | le thème dominant |
| extension · mobile · WhatsApp · mini-app | **37 %** | 25 % | la surface accessible |
| mainnet | 26 % | 20 % | |
| MCP | 11 % | 5 % | |
| **nombre de prix médian** | **1** | 2 | **le Finalist et rien d'autre** |

## 3. Ce que ça implique, concrètement

**a) Le jugement async est un jugement sur pièces.** Premier tour asynchrone : aucun juge ne te voit, ne
te pose de question, ne se laisse porter par ton énergie. Il reste **ton texte, ton dépôt et ton URL**.
D'où les 1 764 caractères de « how it's made » : les finalistes async **écrivent leur profondeur**.
C'est un livrable, pas une formalité.

**b) L'URL cliquable n'est pas un bonus, c'est le ticket d'entrée.** 27 sur 27. Combiné au test de
l'avocat du diable (27/27 finalistes async contre 58/80 des autres primés, **p = 0,001**), c'est le seul
signal statistiquement établi de tout ce dossier.

**c) Viser 3 sponsors est une erreur pour le Finalist async.** Le nombre de prix médian est **1**.
Les finalistes async gagnent le Finalist **seul**. La stratégie « 3 slots partenaires composés » des
docs 05 à 20 optimisait la mauvaise chose.

**d) Le champ lexical qui gagne est le paiement et l'accès.** *« Envoie du PYUSD par WhatsApp — pas de
wallet, pas de gas, juste ton numéro »* (Sippy) · *« Stripe pour les abonnements crypto »* (AutoPay) ·
*« Permettre aux sites de facturer les crawlers d'IA »* (OpenPayAI) · *« Des installs qui paient enfin »*
(Xpack) · *« Un intercepteur de paiements, en extension de navigateur »* (Magnee) ·
*« Une API, plusieurs LLM, vrai pay-per-use »* (router402).

## 3 bis. 🔴 La case gratuite que LPLens n'a pas cochée

**26 des 27 finalistes async ont une URL de démo VIVANTE dans le champ « demo » de leur soumission.
L'unique exception est LPLens** — qui y a mis `https://github.com/JeanBaptisteDurand/Open_Agent_2026`,
alors que **lplens.xyz existait, tournait, et tourne encore**.

Les 26 autres : `magn.ee` · `sippy.lat` · `router402.xyz` · `cronpay.xyz` · `grimswap.com` ·
`autopayprotocol.com` · `blipmarkets.com` · `app.clan-world.com` · `opendaio.com` · `claw2claw.2bb.dev` ·
`borrowbot.kibalabs.com` · `ethvault.qkey.co` · `mnemosyne-protocol.vercel.app` · … tous cliquables.

LPLens a donc décroché le Finalist **en violant la seule caractéristique universelle des finalistes
async**, compensée par la profondeur de son écrit (3 252 caractères de `howItsMade`, contre 1 764 de
médiane) et par les meilleurs scores automatiques des 27 (o8 p8 t9).

→ **Action à coût nul pour ETHOnline 2026 : mettre l'URL live dans le champ demo.** Ce n'est pas un
détail de forme : au premier tour, le juge ne voit que le texte, le dépôt et ce champ.

## 4. Le diagnostic sur LPLens, enfin précis

LPLens coche **presque tout** le profil : déployé et live, `howItsMade` très fourni, monorepo, tests
d'acceptation, MCP, meilleurs scores automatiques des 27. Et il **est** finaliste.

Ce qu'il ne cochait pas : **la surface accessible**. Il fallait un wallet, une position LP existante, et
comprendre l'impermanent loss pour en faire quoi que ce soit. 37 % des finalistes async se testent sans
rien installer ni connecter.

→ **La formule n'est pas « faire autre chose que LPLens ». C'est « refaire LPLens, avec une porte
d'entrée que n'importe qui pousse en 5 secondes ».**

## 5. Les erreurs de ce dossier, listées

1. **Docs 12/18/20** : patron déduit de 20 finalistes **100 % présentiels** pour un événement async.
2. **Doc 18** : le filtre « catégorie empruntée » **ne prédit rien** (78 % vs 78 % en async, Fisher p = 1,000).
3. **Doc 21** : benchmark contre ENShell et npmguard — des finalistes **présentiels**. La bonne référence,
   ce sont Sippy, Magnee, router402 et LPLens.
4. **Docs 05→20** : optimisation de 3 slots partenaires, alors que le finaliste async médian n'en a qu'un.
5. **Doc 03** : corpus compté à 1 755 au lieu de 2 388.
