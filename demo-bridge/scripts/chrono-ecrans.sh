#!/usr/bin/env bash
#
# CHRONOMETRER LA TRAVERSEE DE L'APPAREIL, du premier ecran au refus.
#
# Ce qu'on mesure, et pourquoi deux nombres :
#
#   - LES APPUIS. C'est le nombre durable : il ne depend d'aucune cadence, ni de la
#     vitesse de celui qui appuie. C'est lui qu'il faut comparer avant/apres.
#   - LE TEMPS, a une cadence FIXE et annoncee (250 ms entre deux appuis, sans temps de
#     lecture). Un temps mesure a cadence libre ne se compare a rien.
#
# On compte AUSSI les ecrans « Press right button to continue message or press both to
# skip » : ce sont eux qui noient le contenu, et les ignorer serait mesurer autre chose
# que ce dont le presentateur se plaint.
#
#   scripts/chrono-ecrans.sh [stop|substitution|queue]
#
# On termine par un REFUS : c'est le geste de la demo, et il n'envoie rien.
set -uo pipefail
ACTE="${1:-stop}"
CADENCE_MS="${CADENCE_MS:-250}"
S="${DEMO_SPECULOS:-http://127.0.0.1:5010}"
P="${DEMO_BASE:-http://127.0.0.1:8790}"

lire() { curl -s -m 5 "$S/events?currentscreenonly=true" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: print(''); raise SystemExit
print(' '.join(e.get('text','') for e in d.get('events',[])).strip())"; }
appui() { curl -s -m 5 -X POST "$S/button/$1" -d '{"action":"press-and-release"}' >/dev/null; }
pause() { python3 -c "import time,sys;time.sleep(int(sys.argv[1])/1000)" "$CADENCE_MS"; }

# On part d'un appareil AU REPOS, sinon on compte les restes du flux precedent.
for _ in $(seq 1 40); do
  E="$(lire)"
  case "$E" in *"app is ready"*) break;; esac
  case "$E" in
    *"Message "*|*"Reject"*|*"must be enabled"*) appui both;;
    "Back") appui both;;
    *"App settings"*|*"App info"*|*"Quit app"*) appui left;;
    *) appui right;;
  esac
  pause
done
echo "  depart : $(lire)"

TMP="$(mktemp)"
curl -s -m 200 -X POST -H 'content-type: application/json' -d "{\"verdict\":\"$ACTE\"}" "$P/demo/approuver" > "$TMP" &
CURL=$!
sleep 2

APPUIS=0; DISTINCTS=0; SEPARATEURS=0; CONTENU=0
DERNIER=""; T0=""
while kill -0 $CURL 2>/dev/null; do
  E="$(lire)"
  [ -z "$E" ] && { pause; continue; }
  if [ "$E" != "$DERNIER" ]; then
    DISTINCTS=$((DISTINCTS+1))
    case "$E" in
      *"Press right button"*) SEPARATEURS=$((SEPARATEURS+1));;
      *) CONTENU=$((CONTENU+1)); printf '    %2d  %s\n' "$CONTENU" "${E:0:96}";;
    esac
    DERNIER="$E"
  fi
  [ -z "$T0" ] && T0="$(python3 -c 'import time;print(time.time())')"
  case "$E" in
    *"Blind signing ahead"*) appui both; APPUIS=$((APPUIS+1));;
    "Reject"*)               appui both; APPUIS=$((APPUIS+1)); break;;
    *"app is ready"*)        ;;
    *)                       appui right; APPUIS=$((APPUIS+1));;
  esac
  pause
done
T1="$(python3 -c 'import time;print(time.time())')"
wait $CURL
echo
python3 -c "
import json,sys
d=json.load(open('$TMP'))
print('  reponse du pont :', 'refus %s — %s' % (d['refus'], d['raison']) if 'refus' in d else json.dumps(d,ensure_ascii=False)[:160])"
rm -f "$TMP"
python3 - "$T0" "$T1" "$APPUIS" "$CONTENU" "$SEPARATEURS" "$DISTINCTS" "$CADENCE_MS" <<'PY'
import sys
t0,t1,appuis,contenu,sep,dist,cad = float(sys.argv[1]),float(sys.argv[2]),int(sys.argv[3]),int(sys.argv[4]),int(sys.argv[5]),int(sys.argv[6]),int(sys.argv[7])
print()
print("  ECRANS DE CONTENU      : %d" % contenu)
print("  ecrans « Press right » : %d" % sep)
print("  ecrans distincts vus   : %d" % dist)
print("  APPUIS jusqu'au refus  : %d   <- le nombre qui ne depend d'aucune cadence" % appuis)
print("  temps a %d ms/appui    : %.1f s" % (cad, t1-t0))
PY
