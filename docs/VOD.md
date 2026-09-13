# The demo video — shooting script, beat by beat

> **What this file is, and why half of it is in French.**
>
> It is the shot list for the demo video: what is on screen, what is said, and when to move.
> Everything you *do* is in English — the headings, the timings, the stage directions, the
> checks. The lines inside the quoted blocks are what is **spoken on camera**, and the recording
> is in French, so they are kept in the language they will be said in. Translating them would
> mean rehearsing one text and speaking another.
>
> **The route it follows is the deck**, in order: `#/deck` in presenter mode (`?presenter=1`),
> with two cuts out to the live instrument to show it really runs. The deck carries **nine
> beats**; every stage direction below names the beat by its number in that sequence.
>
> **The rule that holds the whole script together:** no figure is spoken that is not on screen
> at the moment it is spoken. It is the project's own argument, and it is what makes the video
> impossible to contradict.
>
> **Length — read this before recording.** The target is **4:00**. The spoken lines below
> currently count **834 words**. Four minutes of normal speech is about 600 words; 834 words is
> closer to **5:30**, and the deck's own presenter clock counts down from **5:00**. So one of
> three things has to happen before the take: cut roughly 250 words, accept a 5:00 target and
> retitle the scenes, or speak faster than is good for you. The last one is not a plan. The
> **Plan B** table at the end says which paragraphs are the ones to drop.
>
> Recount it any time — this reads the eleven spoken blocks and nothing else:
>
> ```bash
> python3 -c "import re; b=re.findall(r'as it will be spoken:\n\n((?:>.*\n)+)', open('docs/VOD.md').read()); print(len(b),'blocks;',len(re.sub(r'^> ?','',''.join(b),flags=re.M).split()),'words')"
> ```
>
> It prints `11 blocks; 870 words` today — 870 raw tokens, **834** once the lone dashes and
> middots are dropped. Either way the script is long for four minutes.

---

## Before you record

| | |
|---|---|
| URL | `https://tare-hooks.tech/#/deck?presenter=1` — the clock, the beat counter and the shortcuts exist only with that parameter |
| Keys | **space**, **→**, **↓** or **PageDown** to advance · **←**, **↑** or **PageUp** to go back · **f** fullscreen · **r** resets the clock · **p** pauses it. There are no number keys: to jump to a beat, click it in the rail |
| Clock | counts **down from 5:00**. It is not the 4:00 target — see the note above |
| Window | 1440 × 900, dark theme, zoom 100 % |
| Have ready | a second tab on `#/` with a token address **already pasted** but not submitted — it saves eight seconds |
| Turn off | notifications, a shaky cursor, and the sound of the keyboard |
| Sound | one take if you can. Editing shows, and this project is sold on trust |

---

## 00:00 → 00:28 · The hook — someone, a problem, us

**On screen** — the deck, **beat 1**, but you speak *before* showing the figures. Open on the instrument at `#/` with an address already pasted, cursor in the field, nothing submitted.

**What you say** — in French, as it will be spoken:

> Michel dirige une petite boîte. Il a de la trésorerie en jetons, et aujourd'hui il veut en
> échanger une partie contre de l'ETH. Il ouvre son interface, il voit un prix, il signe.
> Ce que Michel ne voit pas, c'est le **hook** : un petit programme attaché au pool, qui
> s'exécute pendant son swap, et qui peut prélever. Sur certains pools, ça se compte en
> dixièmes de pour cent. Sur d'autres — et on va vous les montrer — **ça prend presque tout**.
> Michel n'a aucun moyen de le savoir avant de signer. Personne ne l'a.
>
> **TARE mesure ce que les hooks prennent vraiment, et le publie.** Cent vingt-cinq mille
> mesures, sept mille huit cents pools, cent douze hooks — obtenues par un rejeu de machine
> virtuelle qu'on a écrit pour ça. Et un agent de quatorze outils qui s'en sert pour répondre
> à la seule question qui compte : **par quelle porte passer, et ce qu'elle coûte.**

**Cue** — on « et le publie », space → the deck, beat 1.

**Tone** — Michel is there for a reason, not for a laugh. He makes concrete a problem that is otherwise a protocol abstraction. Say his name once, then forget him: the rest is about measurement, not about a character.

---

## 00:28 → 00:48 · The problem, in one figure

**On screen** — deck, **beat 1**. The three large figures: `9 / 1 559`, `0`, `78 / 112`.

**What you say** — in French, as it will be spoken:

> Parce qu'Uniswap demande à ces hooks de déclarer ce qu'ils facturent. Sur mille cinq cent
> cinquante-neuf hooks vus en deux cent mille blocs, **neuf** le font. Neuf.

**Cue** — nothing. Let the three numbers breathe for two seconds.

---

## 00:48 → 01:10 · The registry cannot answer

**On screen** — still **beat 1**, scrolled down to the paragraph. `"additionalProperties": false` is visible.

**What you say** — in French, as it will be spoken:

> Il existe un registre officiel des hooks. Vingt-sept champs par entrée, dix-neuf booléens.
> **Pas un seul n'est une quantité.** Et son schéma est fermé : il n'interdit pas seulement de
> publier un taux, il **interdit d'ajouter le champ** qui le porterait. Pire : sur les cent
> douze hooks qu'on a mesurés, **soixante-dix-huit sont absents de ce registre**. Il ne voit
> pas les deux tiers de ce qui tourne.

**Cue** — space → beat 2.

---

## 01:10 → 01:45 · The method — the technical core

**On screen** — deck, **beat 2**. `125 072` · `7 817` · `112` · `89`.

**What you say** — in French, as it will be spoken:

> Alors on l'a mesuré. Et c'est là que ça devient intéressant, parce que la mesure évidente est
> **impossible**. L'identité d'un pool v4 — sa `PoolKey` — **contient l'adresse du hook**. « Le
> même pool sans son hook » n'existe pas, on ne peut pas le comparer à lui-même.
> Donc on ne change pas le pool. **On change le code du hook.** Sur un fork épinglé à un bloc,
> on remplace son bytecode par un talon inerte de **quatre-vingt-neuf octets**. Le `poolId`, la
> liquidité, le `slot0`, les réserves : identiques au bit près. La seule chose qui a changé dans
> l'univers observable, c'est le code qui s'exécute pendant le swap. On cote le même swap deux
> fois — **et l'écart, c'est ce que le hook a pris.**

**Cue** — on « l'écart, c'est ce que le hook a pris », space → beat 3.

---

## 01:45 → 02:05 · The proof

**On screen** — deck, **beat 3**. `96,74` executed against `96,74` announced.

**What you say** — in French, as it will be spoken:

> L'objection arrive tout de suite : une cotation sur un fork, ça vaut quoi ? On a donc
> **exécuté le swap pour de vrai**, et recollé le résultat à ce que la cotation annonçait.
> **Au wei près.** Et on publie aussi le pool où ça **ne** concorde pas — un sur trois. Chaque
> ligne se rejoue chez vous en une commande.

**Cue** — switch to the `#/` tab of the instrument.

---

## 02:05 → 02:28 · The instrument — Michel's answer

**On screen** — `#/`, the address already pasted. You submit it **during** the sentence.

Beat 4 of the deck now runs the real app inside the board, so this cut is a choice, not a necessity: a live tab is more convincing, beat 4 is safer if the machine is slow.

**What you say** — in French, as it will be spoken:

> Revenons à Michel. Je colle l'adresse de son jeton…
> et j'ai les portes par lesquelles je peux l'acheter, classées : les frais du pool, **plus** le
> prélèvement du hook mesuré, et ce qu'il me reste sur cent. Tout est calculé **dans la page** :
> cent vingt-cinq mille mesures embarquées, **zéro requête réseau**. Et quand une porte n'est pas
> mesurée, l'écran ne dit pas zéro — il dit **inconnue**.

**Cue** — back to the deck, **beat 6** (the extension). Click it in the rail: you are deliberately skipping beat 4 (the instrument board, just shown live) and beat 5 (MCP), which comes next.

---

## 02:28 → 02:52 · The extension — the right moment

**On screen** — deck, **beat 6**. Click **there is a better one**, let it play, then click **there is only one door** — the deck's own two outcomes, in its own words.

**What you say** — in French, as it will be spoken:

> Mais le bon moment pour savoir ce qu'un hook prend, ce n'est pas quand on cherche. C'est
> **trois secondes avant de signer**. L'extension se place entre le site d'échange et le
> portefeuille, lit le calldata, et rend son verdict avant la signature. S'il existe une porte
> moins chère, elle construit la transaction de remplacement et la fait signer par **Permit2** —
> une signature hors chaîne au lieu d'une transaction d'approbation. Et **elle ne l'envoie
> jamais** : elle la rend au portefeuille. S'il n'y a rien de mieux — et c'est le cas
> **quatre-vingt-dix-neuf fois sur cent** — elle le dit. Inventer une alternative serait pire
> que se taire.

**Cue** — ← once, back to beat 5.

---

## 02:52 → 03:12 · MCP — for agents

**On screen** — deck, **beat 5**. Click the second ready-made question.

**What you say** — in French, as it will be spoken:

> Et pour les agents. Si vous demandez à un modèle ce qu'un hook prend, il **invente un nombre
> plausible**. Nos quatre outils MCP portent, dans leur propre description, l'interdiction d'en
> énoncer un. Là, le modèle n'invente pas : il appelle l'outil, et l'outil répond avec son
> bloc, sa taille, son étiquette — et la commande qui le rejoue.

**Cue** — jump to **beat 7** while the typing finishes (click it in the rail: → alone would land back on the extension).

---

## 03:12 → 03:30 · The device, the toll, the proof

**On screen** — deck, **beat 7**, the Speculos screens lighting up one by one.

> **Careful, this is the one place the script breaks its own rule.** The line ends on « seize attestations », and 16 / 99 is displayed on **beat 8**, not on beat 7. Either advance before saying it, or move the sentence into the next scene.

**What you say** — in French, as it will be spoken:

> Le verdict est rendu **champ par champ** sur un Ledger : on ne signe pas un haché opaque, on
> lit ce qu'on signe, et annuler ne laisse rien partir. Une mesure neuve se paie **un millième
> de dollar en x402 sur Hedera**, relu sur le mirror node — pas sur notre parole. L'agent qui
> répond a une identité **HCS-14** que l'appelant recalcule avant de payer. Et seize
> attestations sont écrites on-chain, lisibles par un autre contrat.

**Cue** — space → beat 8.

---

## 03:30 → 03:48 · What we do not know

**On screen** — deck, **beat 8**. `63 156` · `61 466` · `450` · `0`.

> The line says « deux erreurs passées ». [`docs/HONESTY.md`](HONESTY.md) documents **nine**, and the README says nine. Say two only if the screen is showing two; otherwise say nine, which is the stronger number anyway.

**What you say** — in French, as it will be spoken:

> Et puis il y a ça, qu'on affiche aussi grand que le reste. Sur cent vingt-cinq mille mesures,
> **soixante et un mille neuf cent seize ne sont pas des valeurs**. On les garde, avec leur
> raison. Parce qu'un blanc se lit « rien », et « rien » se lit « zéro ». Seize attestations
> écrites sur **quatre-vingt-dix-neuf calculées** — et c'est l'écart qu'on publie, pas le
> chiffre flatteur. Deux erreurs passées du projet sont publiées avec leur correction.

**Cue** — space → beat 9.

---

## 03:48 → 04:00 · The close

**On screen** — deck, **beat 9**. The fourteen tools, the five ways in.

**What you say** — in French, as it will be spoken:

> Quatorze outils, vingt-sept jeux de données, cinq façons d'y accéder : le site, l'extension,
> le serveur MCP, le péage x402, le compte. Tout est publié — le corpus, les commandes de rejeu,
> et ce qu'on ne sait pas. **Allez le contredire.**

**Cue** — hold the last screen for a full second before cutting.

---

## Plan B, if something breaks

| what breaks | what you do |
|---|---|
| the instrument will not load | stay on the deck: beat 2 carries the same figures |
| the MCP demo will not start | click **↻ reset**, or skip it — beat 6 is the stronger one |
| the clock runs away | **r** resets it without leaving the beat you are on |
| you are behind at 3:00 | cut the toll paragraph (03:12): keep Speculos, and say « et le péage x402 est réglé sur Hedera » in one line |
| you are ahead | add, on beat 2: « huit tailles, les deux sens, un bloc épinglé — parce qu'un taux unique serait faux à toutes les tailles sauf une » |
| you need to cut 250 words | the first scene (153 words) and the method scene (120) are the two longest. Trim there before touching the figures |

---

## Every figure the script says, and where it shows

None is spoken without being on screen. Check them before the take — they are all generated, so
they move when the corpus moves.

| said | on screen | source |
|---|---|---|
| 9 out of 1,559 | beat 1 | `docs/dataset/declarations.json` |
| 27 fields, 19 booleans, 0 quantities | beat 1 | `apps/web/public/data/hooklist.snapshot.json` |
| 78 of 112 absent | beat 1 | `docs/dataset/registre-couverture.json` |
| 125,072 · 7,817 · 112 · 89 bytes | beat 2 | `dataset.totals`, `engine/tare/stub.py` |
| 96.74 bps executed = announced | beat 3 | `docs/dataset/porte-a4.json` |
| 99.71 % — only one door | beat 6 | `packages/guard/data/chiffres-alternative.json` |
| 63,156 / 61,466 / 450 / 0 | beat 8 | `docs/dataset/summary.json` |
| 16 attestations out of 99 | **beat 8 only** | `docs/dataset/attestations.json` |
| 14 tools · 27 datasets · 5 ways in | beat 9 | `apps/web/src/lib/outils.ts`, `donnees.ts` |

---

## What we do not say, and why

- **"the first global measurement of hooks on EVM"** — it may well be true, and it is exactly the
  kind of sentence a judge cannot check: nobody can prove no team ever did it. The whole project
  rests on **every claim being checkable**. One unverifiable boast in the middle of twenty
  verifiable figures weakens all twenty.
  **Say instead what can be checked in thirty seconds**, which is stronger:
  « cent vingt-cinq mille mesures publiées, sur sept mille huit cents pools, chacune rejouable
  en une commande — allez en trouver une autre. » The challenge does the same work as the
  superlative, and it cannot be turned against us.
- **"the first", "the only", "revolutionary"** — same reason.
- **"real time"** — it is false: the measurement is a photograph, at one block, on one chain.
  Saying it would be the exact mistake we accuse others of.
- **"subscription"** — the contract exists and passes twenty tests, but it is not deployed on a
  public network. If it is shown, say "written, not deployed".
- **the test count** — it is true and it interests nobody on video. It lives in the README, where
  a judge who wants to check will go and read it.
