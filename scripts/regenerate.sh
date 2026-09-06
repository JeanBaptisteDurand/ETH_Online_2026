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

echo "== 1/10 graphe =="
( cd engine && python3 -m tare.graph.cli build --out tare/graph/data/graph.json )

echo "== 2/10 fixtures de parite TypeScript <-> Python =="
bash scripts/regen-fixtures.sh

echo "== 3/10 tableau « what we found » du README =="
PYTHONPATH=engine python3 -m tare.dataset.stats --write-readme

echo "== 4/10 tableau « what the graph reveals » du README =="
( cd engine && python3 -m tare.graph.readme --write-readme )

echo "== 5/10 analyse des sources =="
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

echo "== 6/10 index RAG (les en-tetes citent le graphe, donc apres lui) =="
( cd engine && python3 -m tare.rag build --write 2>/dev/null ) || \
  ( cd engine && python3 -m tare.rag build )

echo "== 7/10 banc des deux recuperateurs =="
( cd engine && python3 -m tare.rag.split --write --quiet )

echo "== 8/10 table de la garde =="
# Sans cette etape, la garde consulte une table figee au jour de sa derniere construction.
# Elle a tourne sur 199 pools pendant que le corpus en couvrait 7 817 : elle repondait
# « pool inconnu » sur 97 % de ce qu'elle savait deja mesurer.
( cd packages/guard && npm run build:table --silent )

echo "== 9/10 jeu embarque par le site =="
node apps/web/scripts/build-dataset.mjs

echo "== 10/10 texte de soumission =="
( cd engine && python3 -m tare.submission.build --write )

echo
echo "== verification =="
bash scripts/test-all.sh
