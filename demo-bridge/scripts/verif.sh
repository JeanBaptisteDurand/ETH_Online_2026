#!/usr/bin/env bash
# Les cinq routes, appelees a la suite. A lancer depuis n'importe ou :
#
#   DEMO=https://demo.tare-hooks.tech scripts/verif.sh
#
# Tant que l'enregistrement DNS de demo.tare-hooks.tech n'existe pas, on passe par le
# certificat public de tare-hooks.tech et l'en-tete Host — Caddy route sur le Host, pas
# sur le SNI, donc c'est le MEME chemin public :
#
#   scripts/verif.sh --sans-dns
set -euo pipefail
A="${ADRESSE:-0xDad77910DbDFdE764fC21FCD4E74D71bBACA6D8D}"
if [[ "${1:-}" == "--sans-dns" ]]; then
  B="https://tare-hooks.tech"
  ARGS=(--resolve tare-hooks.tech:443:92.112.193.140 -H "Host: demo.tare-hooks.tech")
elif [[ "${1:-}" == "--pont" ]]; then
  # Le filet de secours : MEME service, MEME origine que la page, DNS et certificat deja
  # en place. C'est la voie a prendre tant que demo.tare-hooks.tech n'a pas son A record.
  B="https://tare-hooks.tech/pont"
  ARGS=()
else
  B="${DEMO:-https://demo.tare-hooks.tech}"
  ARGS=()
fi
# `set -u` + un tableau vide = « unbound variable » sur le bash 3.2 de macOS : on ne
# developpe le tableau que s'il a un element. Meme piege que scripts/ledger/run-speculos.sh.
q() { curl -sS -m 250 ${ARGS[@]+"${ARGS[@]}"} "$@"; }

echo "== 1 GET /demo/etat";      q "$B/demo/etat" | head -c 400; echo
echo "== 2 POST /demo/preparer"; q -X POST -H 'content-type: application/json' \
  -d "{\"adresse\":\"$A\",\"acte\":\"substitution\"}" "$B/demo/preparer" | head -c 400; echo
echo "== 5 GET /demo/soldes";    q "$B/demo/soldes?adresse=$A"; echo
echo "== 4 POST /demo/revenir";  q -X POST "$B/demo/revenir"; echo
echo "== 3 POST /demo/approuver  (un humain doit marcher dans les ecrans ; ajoute \"auto\":true pour s'en passer)"
q -X POST -H 'content-type: application/json' -d '{"verdict":"substitution","auto":true}' "$B/demo/approuver" \
  | python3 -c "import json,sys;d=json.load(sys.stdin);d.pop('ecrans',None);d.pop('message',None);print(json.dumps(d,ensure_ascii=False)[:400])"
