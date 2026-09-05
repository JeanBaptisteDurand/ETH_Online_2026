#!/usr/bin/env bash
# Les fixtures de parite entre les routes TypeScript et engine/tare/graph/queries.py.
#
# Elles sont la sortie BRUTE de la CLI Python, et elles perimen a chaque reconstruction du
# graphe — c'est voulu : le test compare deux implementations, pas deux instants. Mais tant
# qu'on les regenerait a la main, elles derivaient a chaque fois et cinq tests passaient au
# rouge sur un code parfaitement correct. Ce script est appele par scripts/regenerate.sh,
# juste apres la construction du graphe.
set -euo pipefail
cd "$(dirname "$0")/.."
F=apps/api/test/fixtures/graph-python
mkdir -p "$F"

for c in orphans contradictions disagreement clusters; do
  PYTHONPATH=engine python3 -m tare.graph.cli "$c" --json > "$F/$c.json"
done

# Les fixtures par hook : on lit l'adresse DANS la fixture existante plutot que de la
# reecrire ici, pour qu'un hook renomme ou remplace ne devienne pas une adresse inventee.
for f in "$F"/impact-*.json "$F"/summary-*.json "$F"/deployer-*.json "$F"/twins-*.json; do
  [ -e "$f" ] || continue
  base=$(basename "$f" .json)
  cmd=${base%%-*}
  addr=$(python3 -c "
import json,sys
d=json.load(open('$f'))
a=d.get('address') or (d.get('hook') or '').split(':')[-1]
print(a)")
  [ -n "$addr" ] || { echo "  !! $base : aucune adresse lisible, fixture laissee en l'etat" >&2; continue; }
  case "$cmd" in
    deployer) sub="deployer-cluster" ;;
    *)        sub="$cmd" ;;
  esac
  PYTHONPATH=engine python3 -m tare.graph.cli "$sub" --hook "$addr" --json > "$f"
done

echo "  fixtures de parite regenerees depuis le graphe courant"
