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

echo "== 1/6 graphe =="
( cd engine && python3 -m tare.graph.cli build --out tare/graph/data/graph.json )

echo "== 2/7 tableau « what we found » du README =="
PYTHONPATH=engine python3 -m tare.dataset.stats --write-readme

echo "== 3/7 tableau « what the graph reveals » du README =="
( cd engine && python3 -m tare.graph.readme --write-readme )

echo "== 4/7 analyse des sources =="
( cd engine && python3 -m tare.source.cli report --write 2>/dev/null ) || \
  echo "   (pas de regenerateur --write, analyse laissee en l'etat)"

echo "== 5/7 index RAG (les en-tetes citent le graphe, donc apres lui) =="
( cd engine && python3 -m tare.rag build --write 2>/dev/null ) || \
  ( cd engine && python3 -m tare.rag build )

echo "== 6/7 banc des deux recuperateurs =="
( cd engine && python3 -m tare.rag.split --write --quiet )

echo "== 8/9 jeu embarque par le site =="
node apps/web/scripts/build-dataset.mjs

echo "== 9/9 texte de soumission =="
( cd engine && python3 -m tare.submission.build --write )

echo
echo "== verification =="
bash scripts/test-all.sh
