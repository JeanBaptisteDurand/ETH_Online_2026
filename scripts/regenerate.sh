#!/usr/bin/env bash
# Rebuild every derived artefact from the dataset, in dependency order.
#
# The corpus grew from 995 to over 10,000 measurements during the build week. Everything
# downstream of it — the graph, the RAG headers that quote the graph, the README table, the
# source analysis, the submission text — was computed from an earlier corpus and silently
# describes a dataset that no longer exists. This script is the order in which they have to be
# rebuilt, because each step reads the previous one's output.
#
# Run it ONLY when no sweep is running: a corpus that changes mid-rebuild produces artefacts
# that disagree with each other, which is worse than artefacts that are merely old.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)

if pgrep -f "tare.cli sweep" > /dev/null; then
  echo "REFUS : un balayage tourne encore. Le corpus bouge, les artefacts se contrediraient." >&2
  echo "  $(pgrep -fl 'tare.cli sweep' | head -3)" >&2
  exit 1
fi

n=$(wc -l < docs/dataset/measurements.jsonl | tr -d ' ')
echo "== corpus : $n mesures =="

echo "== 1/14 graphe =="
( cd engine && python3 -m tare.graph.cli build --out tare/graph/data/graph.json )

echo "== 2/14 fixtures de parite TypeScript <-> Python =="
bash scripts/regen-fixtures.sh

echo "== 3/14 tableau « what we found » du README =="
PYTHONPATH=engine python3 -m tare.dataset.stats --write-readme

echo "== 4/14 tableau « what the graph reveals » du README =="
( cd engine && python3 -m tare.graph.readme --write-readme )

echo "== 5/14 analyse des sources =="
# Trois verbes, dans cet ordre : recuperer les sources verifiees, lire le taux que chaque
# contrat declare, puis rendre le document. Une version anterieure appelait `report --write`
# — un drapeau qui n'existe pas — en avalant l'erreur avec 2>/dev/null, puis annoncait
# « pas de regenerateur ». Le regenerateur existait ; l'appel etait faux, et l'erreur etouffee
# le faisait passer pour une absence. C'est le defaut que ce projet traque, dans son propre
# script de regeneration.
#
# RPC_SOURCE doit designer un fork AU REPOS : `analyze` lit l'etat des contrats, et un fork
# qu'un balayage utilise repondrait sous la charge d'un autre mesureur.
: "${RPC_SOURCE:=${RPC:-http://127.0.0.1:8545}}"
( cd engine \
  && python3 -m tare.source.cli fetch \
  && python3 -m tare.source.cli analyze --rpc "$RPC_SOURCE" \
  && python3 -m tare.source.cli report )

echo "== 6/14 index RAG (les en-tetes citent le graphe, donc apres lui) =="
( cd engine && python3 -m tare.rag build --write 2>/dev/null ) || \
  ( cd engine && python3 -m tare.rag build )

echo "== 7/14 banc des deux recuperateurs =="
( cd engine && python3 -m tare.rag.split --write --quiet )

echo "== 8/14 table de la garde =="
# Sans cette etape, la garde consulte une table figee au jour de sa derniere construction.
# Elle a tourne sur 199 pools pendant que le corpus en couvrait 7 817 : elle repondait
# « pool inconnu » sur 97 % de ce qu'elle savait deja mesurer.
( cd packages/guard && npm run build:table --silent )

echo "== 9/14 jeu embarque par le site =="
node apps/web/scripts/build-dataset.mjs

echo "== 10/14 declaration : les hooks emettent-ils HookSwap ou HookFee ? =="
# La MOITIE HORS LIGNE seulement, et c'est deliberé : le scan des deux evenements coute
# 40 requetes RPC facturees, et le releve ne change que quand la fenetre de collecte change.
# Sans `--scan`, cette etape recompte les hooks depuis les Initialize deja sur disque et
# laisse le releve existant intact. Pour le refaire en entier :
#   RPC=<noeud d'archive> python3 -m tare.declare --scan --write
( cd engine && python3 -m tare.declare )

echo "== 11/14 couverture du registre officiel =="
# 78 des 112 hooks mesures n'y figurent pas. Ce chiffre etait publie de trois facons
# contradictoires — une adresse en dur sur la landing, « two of the 12 hooks » dans LIMITS,
# 70 % dans le dossier — parce que rien ne le calculait.
( cd engine && python3 -m tare.registre --write )

echo "== 12/14 chiffres de la porte de remplacement =="
# Ils etaient comptes a la main, et ils etaient faux : la comparaison ignorait le SENS du
# swap. Depend de la table de la garde, donc apres elle.
node packages/guard/scripts/chiffres-alternative.mjs --write

echo "== 13/14 texte de soumission et fiche (ils lisent le releve de l'etape 10) =="
( cd engine && python3 -m tare.submission.build --write )

echo "== 14/14 script de la video =="
# Il REFUSE d'ecrire un script dont la parole depasse la duree visee, et dit de combien : la
# version precedente demandait 303 s pour une video de 180. Une etape rouge ici n'est pas une
# panne, c'est un script a couper.
( cd engine && python3 -m tare.video --write ) || \
  echo "  script video non ecrit : coupe des mots, ou releve CIBLE_S dans tare/video.py" >&2

# L'INDEX RAG, UNE SECONDE FOIS — et ce n'est pas une redondance.
#
# Il indexe docs/*.md par PLAGE DE LIGNES, et les etapes 3, 4, 5, 10 a 13 reecrivent ces
# documents. Construit avant elles, il cite des lignes qui ont bouge : test/rag.test.ts le
# detecte et rougit avec « INDEX PERIME », ce qui est exactement son travail. Le reconstruire
# ici coute une minute et evite un test rouge dont la cause n'est pas le code.
echo "== index RAG, apres les documents (ils ont bouge depuis l'etape 6) =="
( cd engine && python3 -m tare.rag build >/dev/null ) || \
  echo "  index RAG non reconstruit : les tests le diront" >&2

echo
echo "== verification =="
bash scripts/test-all.sh
