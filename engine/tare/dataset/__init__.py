"""Lectures du jeu publie — docs/dataset/measurements.jsonl.

Rien ici ne mesure quoi que ce soit : ce paquet RELIT des lignes deja ecrites et
les compte. Il existe pour qu'un chiffre du README se rejoue en une commande au
lieu d'etre recopie a la main — ce qui est exactement comme un chiffre devient
faux sans que personne ne s'en apercoive.

    PYTHONPATH=engine python3 -m tare.dataset.stats --lp-fee-zero --above-bps 1

`stats` n'est deliberement PAS importe ici : `python3 -m tare.dataset.stats`
executerait alors le module deux fois (RuntimeWarning de runpy). Importez-le
explicitement : `from tare.dataset.stats import lp_fee_zero_table`.
"""
