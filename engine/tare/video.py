"""Le script de la video de demo, engendre depuis le corpus.

Pourquoi engendre. La version precedente citait « sept mille neuf cents mesures, six cent
vingt-quatre pools, seize hooks » — le corpus en porte 125 072, 7 817 et 112. Un facteur
quinze, dans le seul document qu'on LIT A VOIX HAUTE : une fois enregistre, un chiffre faux
ne se corrige plus. Elle annoncait aussi « 0 des 84 hooks », qui est faux (9 sur 1 559), et ne
montrait ni Hedera, ni le Ledger, ni le compte, ni la substitution — la moitie du produit.

    python3 -m tare.video            affiche
    python3 -m tare.video --write    ecrit docs/VIDEO.md

DEUX CHOSES QUE CE SCRIPT REFUSE DE FAIRE.

1. Arrondir un chiffre pour qu'il se dise mieux. « Cent vingt-cinq mille » se prononce ; on
   ecrit le nombre exact a cote, parce que la personne qui enregistre doit pouvoir verifier.
2. Promettre un ecran qui n'existe pas. Chaque plan nomme un fichier, une commande ou une
   route du depot. Un plan qu'on ne peut pas tourner devient, au montage, un plan qu'on
   remplace par une affirmation.
"""
from __future__ import annotations
import argparse, os, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tare.submission.build import REPO, facts  # noqa: E402

OUT = Path(REPO) / "docs" / "VIDEO.md"

# LA DUREE VISEE, en secondes. Deplacer ce nombre est une DECISION, pas un ajustement : c'est
# lui qui decide combien de mots le script peut porter.
#
# Elle valait 180. La version precedente de ce script portait 430 mots pour 180 s et sa note
# disait « which fits with pauses » — coherent, pour un projet qui avait alors six panneaux.
# Le produit en a maintenant dix-sept, et six acces : la mesure, l'extension, la substitution,
# le peage x402, le compte abonne, le MCP. Le script est passe de 732 mots a 466 en coupant
# 36 %, et les coupes suivantes retiraient un FAIT, pas un mot.
#
# 210 s, donc — trois minutes trente. C'est le meme arbitrage que le budget de la page de
# presentation : couper du vrai pour proteger un nombre rond est le mauvais echange. Un juge
# qui arrete a 3:00 a deja vu la mesure, le contrefactuel, l'instrument et l'extension.
#
# POUR REVENIR A 3:00 : retirer la section « The part that makes it true » (2:10) est la coupe
# la plus propre — 55 mots, et c'est le seul passage dont l'argument est repris ailleurs (la
# concordance source/mesure est dans le texte de soumission et dans FEEDBACK.md).
CIBLE_S = 210


def _ts(s: float) -> str:
    """m:ss, arrondi a la seconde. Un horodatage au dixieme ne sert personne au montage."""
    t = int(round(s))
    return f"{t // 60}:{t % 60:02d}"


def _mot(n: int) -> str:
    """Le nombre tel qu'on le PRONONCE, a cote du nombre exact.

    Une personne qui lit « 125 072 » a voix haute hesite. Une qui lit « cent vingt-cinq mille »
    ne verifie plus. On donne les deux, et l'exact est celui qui est vrai.
    """
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f} million".replace(".0 ", " ")
    if n >= 1000:
        return f"{round(n / 1000):,} thousand".replace(",", " ")
    return str(n)


def _horodater(text: str) -> tuple[str, int]:
    """Remplit les titres et les deux compteurs, depuis le script lui-meme.

    Ils etaient ecrits a la main — « 0:00 – 0:15 », « 1:05 – 1:45 » — et ne correspondaient a
    rien : la premiere version demandait 303 s de parole sous des titres qui s'arretaient a
    3:00. Un decoupage faux fait rater le montage, pas la lecture.

    Ce travail vit ICI et non dans main() : `render()` seul doit rendre un document coherent,
    sinon un test qui l'appelle directement lit des marqueurs a la place des chiffres — ce qui
    est arrive.
    """
    dits = re.findall(r'\*\*Say\.\*\*\s*"(.*?)"', text, re.S)
    mots = len(" ".join(dits).split())

    blocs = text.split("## {T} · ")
    if len(blocs) > 1:
        cumul = 0.0
        sortie = [blocs[0]]
        for i, b in enumerate(blocs[1:]):
            n = len(" ".join(re.findall(r'\*\*Say\.\*\*\s*"(.*?)"', b, re.S)).split())
            debut = cumul
            cumul += n / 145 * 60
            fin = CIBLE_S if i == len(blocs) - 2 else cumul
            sortie.append(f"## {_ts(debut)} – {_ts(fin)} · " + b)
        text = "".join(sortie)

    return (
        text.replace("{MOTS}", str(mots)).replace("{PAROLE}", _ts(mots / 145 * 60)),
        mots,
    )


def render(f: dict) -> str:
    d = f.get("declarations") or {}
    c = d.get("conclusion") or {}
    ini = d.get("initialize") or {}
    # LES CLES DE CET ARTEFACT SONT EN FRANCAIS : `absents`, `listes`, `part_absente_pct`, et
    # le denominateur vit dans `corpus.hooks_mesures`. La forme anglaise (`absent`, `measured`)
    # est celle de l'objet JS de la landing. Deux vocabulaires pour un meme fait, et une cle
    # recopiee de travers : la phrase annoncait « missing 0 of the 0 hooks I measured ».
    cov = (f.get("couverture") or {}).get("couverture") or {}
    corp = (f.get("couverture") or {}).get("corpus") or {}
    a = f.get("alternative") or {}
    bloc = f["block"][0] if f["block"] else None
    part_unique = (
        a["etats"]["PORTE_UNIQUE"] / a["mesures_lues"] * 100 if a else None
    )
    eco_max = (a.get("economie_bps") or {}).get("max") if a else None

    declare = (
        f"**{c['n_hooks_qui_declarent']} of them do** — nought point five eight percent"
        if c.get("publiable")
        else "**almost none of them do**"
    )

    corps = f"""<!-- Engendre par `python3 -m tare.video --write`. Ne pas editer a la main :
     la version precedente citait 7 900 mesures quand le corpus en portait 125 072, et
     « 0 des 84 hooks » quand la reponse est 9 sur 1 559. Un chiffre faux qu'on a ENREGISTRE
     ne se corrige plus. -->

# The demo video — shot list

**Target: {_ts(CIBLE_S)}.** Judges watch dozens; the first fifteen seconds decide whether they
watch the rest. No logo animation, no music under speech, no "hi everyone".

Every screen below is real. Where a command appears, it is the command that produces what you see,
and it is in the repository. Every figure is generated from the corpus — if you re-run
`python3 -m tare.video --write` after a sweep, the numbers in this script change with it.

---

## {{T}} · The question, asked with a number

**Screen.** Terminal, one command already typed, you press return:

```bash
cd engine && python3 -m tare.declare
```

**Say.** "A Uniswap v4 hook can take a cut of your swap. Uniswap's guide asks hooks to announce
it. I scanned two hundred thousand Base blocks: {ini.get('n_hooks', 0):,} hooks,
{declare} — and those nine announce an absolute amount on one past swap, not the rate at your
size."

**Cut on:** the line `hooks distincts : {ini.get('n_hooks', 0)}` appearing.

> **Do not say "none".** An earlier cut of this script did, and it was wrong.

---

## {{T}} · The registry cannot help either

**Screen.** `docs/dataset/registre-couverture.json`.

**Say.** "The registry meant to describe them has {f['registry_fields']} fields and **not one can
hold a quantity** — and it is missing {cov.get('absents', 0)} of the {corp.get('hooks_mesures', 0)} hooks
I measured."

---

## {{T}} · Why nobody has this number

**Screen.** `docs/METHOD.md` open at `## 1. The wall`, the `PoolKey` struct highlighted.

**Say.** "And you cannot compare a pool to itself without its hook: the `PoolKey` *contains* the
hook's address. Remove it and it is a different pool, different liquidity, different price. That
is why this number exists nowhere."

---

## {{T}} · The trick, shown not claimed

**Screen.** Split: left `engine/tare/stub.py`, right a terminal running

```bash
cd engine && python3 -m tare.gates.a3
```

**Say.** "So don't change the pool — change the **hook**. On a pinned fork, `anvil_setCode`
rewrites the bytecode at the hook's address. Pool id, liquidity, price: byte-identical. Quote the
same swap twice — once with the real hook, once with an eighty-nine-byte inert stub — and the
difference **is** what the hook took."

**Screen, second half of this section.** Gate A3 prints its reproduced figures, green.

**Say.** "This gate replays recorded values against numbers an independent implementation
produced before this code existed."

---

## {{T}} · The instrument, on real data

**Screen.** The web app. Sort by bps descending. The table fills; no number animates its value.

**Say.** "{f['rows']:,} measurements. {f['pools']:,} pools, {f['hooks']} hooks, {f['sizes']} sizes,
both directions, block {bloc:,}."

**Screen.** Click the largest row: block, size, direction, stub hash, the replay command.

**Say.** "Every row carries what would disprove it. Copy the line, run it — or don't, and tell
me."

**Screen, second half of this section.** Filter to `stored_lp_fee = 0` **and static-fee pools**.

**Say.** "{f['zero_stat_n']:,} of them sit on pools whose LP fee, read from storage, is exactly
zero and not dynamic — so that zero really advertises free. Median {f['zero_stat_med']:.0f} basis
points, worst case {f['zero_stat_max']:.0f}."

> **The number you must NOT say is {f['zero_n']:,}.** That is the count without the filter, and
> {f['zero_dyn_n'] / f['zero_n'] * 100:.0f} % of it sits on dynamic-fee pools, where
> `stored_lp_fee = 0` means "the hook sets the price per swap", not "free". Saying the big number
> is the one trap this project sets for itself, and a judge finds it in a minute.

---

## {{T}} · The part that makes it true, not just striking

**Screen.** `docs/hooks-source/ANALYSIS.md`, the concordance table.

**Say.** "A number without a cause is an accusation. So I read the verified source of
{f['source_read']} of the {f['source_total']}. Where source and measurement compare, they agree
across {f['concordant_pools']:,} pools — worst deviation **{f['worst_deviation']} of a basis
point**. Which corrected me: the problem was never secrecy. The metadata layer cannot carry a
quantity."

---

## {{T}} · Before you sign

**Screen.** Browser, a real Uniswap swap ready to sign. The extension badge is amber.

**Say.** "The last mile. The extension decodes the hook out of your swap calldata before you
sign — offline, no request, no account. With nothing on that pool it says *not measured*, never
zero. A guard that fails to 'yes' guards nothing."

**Screen.** The panel, then click **Reject**.

---

## {{T}} · And elsewhere?

**Screen.** Panel 16. Click **comparer**. The header reads **0 appel(s) RPC**.

**Say.** "Is there a cheaper door? For {part_unique:.1f} percent of the corpus: *there is only
one* — an answer, not a failed search. In the
{a.get('propositions_au_dessus_du_seuil', 0)} cases where there is one, it builds the replacement
transaction: floor from a live quote, real deadline. And it does not send it. That is yours."

**Screen.** The button **signer et envoyer**, active. Do not click it.

---

## {{T}} · Who pays, and who is asking

**Screen.** Terminal: `npx tsx apps/api/src/pay/cli.ts payer`, then the HashScan link it prints.

**Say.** "The API is metered with x402 on Hedera — {f['settlements']} settlements confirmed on the
mirror node, not by my server. The signing key lives in a Ledger, and the agent has an on-chain
HCS-14 identity, so a caller can check who it calls."

---

## {{T}} · What it refuses to do

**Screen.** `docs/HONESTY.md`, scrolling the numbered false results.

**Say.** "Every false result this project produced is written down with its cause. A bounded read
is `NOT_MEASURABLE` — never a value, never a zero."

**Screen.** The landing page, URL legible.

**Say.** "TARE. Every number replayable, every failure labelled."

---

## Recording notes

- **Terminal**: 16 px JetBrains Mono, black on `#0B0B0C`. No prompt vanity — `$` and the command.
- **Never** show a spinner for more than 2 s: pre-warm the fork, the dataset and the API before
  recording. `POST /alternative` makes up to three `eth_call`s; run it once before the take so the
  fork cache is warm.
- Speak at ~145 words/minute. This script is **{{MOTS}} words**, which is {{PAROLE}} of speech
  for a {_ts(CIBLE_S)} video — the rest is silence and what the screen says on its own.
- **Do not** say "we". One person built this. Say "I".
- **The MCP server is NOT in this cut**, and that is a choice: it is the fourth access by order
  of visit, and showing a tool call inside a model's transcript costs twenty seconds to explain
  for an audience that mostly will not use it. It is in the written submission. If you want it,
  the cleanest place is after "And elsewhere?" — and you must then cut something else, because
  this script already uses {{PAROLE}} of the {_ts(CIBLE_S)}.
- The one sentence to land, because it is the whole argument: **{f['registry_fields']} fields,
  zero quantities.**
- Two numbers not to misspeak: **{f['rows']:,}** measurements, and **{f['zero_stat_n']:,}** rows
  on pools that advertise free — not {f['zero_n']:,}.
"""
    return _horodater(corps)[0]


def mots_dits(f: dict) -> int:
    """Le nombre de mots a prononcer. Utilise par le CLI pour refuser un script trop long."""
    return _horodater(render(f))[1]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    f = facts()
    text = render(f)
    mots = mots_dits(f)
    # LE BUDGET DE PAROLE, VERIFIE ET NON DEVINE.
    #
    # 180 s a 145 mots/minute font 435 mots. La premiere version de ce script en faisait 732 —
    # cinq minutes de parole pour trois minutes de video. Personne ne s'en apercoit en lisant :
    # on s'en apercoit en enregistrant, deux fois, a une heure du rendu. On refuse donc
    # d'ecrire un script qui ne tient pas, et on dit de combien il depasse.
    secondes = mots / 145 * 60
    print(f"  {mots} mots dits — {secondes:.0f} s de parole pour {CIBLE_S} s de video")
    if secondes > CIBLE_S:
        trop = int(mots - CIBLE_S * 145 / 60)
        print(
            f"\nREFUS : {trop} mots de trop. A 145 mots/minute ce script demande "
            f"{secondes:.0f} s de parole pour une video de {CIBLE_S} s.\n"
            f"Coupe {trop} mots dans les blocs **Say.**, ou releve CIBLE_S en connaissance de "
            f"cause.",
            file=sys.stderr,
        )
        return 1
    marge = CIBLE_S - secondes
    print(f"  marge : {marge:.0f} s pour les silences et ce que l'ecran raconte seul")
    if a.write:
        OUT.write_text(text)
        print(f"{OUT} : {len(text)} caracteres")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
