#!/usr/bin/env bash
# Every suite in the repository, counted once, with a single citable line at the end.
# A suite that fails to run is reported as such and is NOT counted as zero — the same rule
# the measurement engine applies to a node that will not answer.
set -uo pipefail
cd "$(dirname "$0")/.."
pass=0; total=0; broken=(); failed=(); skipped=()

count() { # name, pass, total
  printf "  %-22s %s/%s\n" "$1" "$2" "$3"; pass=$((pass+$2)); total=$((total+$3))
}
vitest_count() { # dir, config, name
  # Vitest ecrit "Tests  104 passed (104)" quand tout passe, mais
  # "Tests  5 failed | 99 passed (104)" des qu'il y a un echec. Une premiere version ne
  # cherchait que la premiere forme : une suite avec cinq echecs etait donc rapportee
  # "NE TOURNE PAS", et le total final s'annoncait INCOMPLET. Un echec devenait une absence
  # — exactement l'erreur que ce projet reproche partout ailleurs, dans son propre
  # compte-rendu de tests. On lit maintenant le total entre parentheses, qui est present
  # dans les deux formes, et on compte les echecs explicitement.
  local out; out=$(cd "$1" && npx vitest run ${2:+--config $2} 2>&1) || true
  local ligne p f t
  ligne=$(grep -oE 'Tests +[0-9]+ (failed|passed|skipped).*\([0-9]+\)' <<<"$out" | tail -1)
  if [ -z "$ligne" ]; then
    broken+=("$3"); printf "  %-22s NE TOURNE PAS\n" "$3"; return
  fi
  t=$(grep -oE '\([0-9]+\)$' <<<"$ligne" | tr -d '()')
  p=$(grep -oE '[0-9]+ passed' <<<"$ligne" | grep -oE '[0-9]+' | head -1)
  f=$(grep -oE '[0-9]+ failed' <<<"$ligne" | grep -oE '[0-9]+' | head -1)
  # Un test IGNORE n'est ni passe ni echoue. Le compter dans le total faisait lire
  # "45/46" comme un echec alors que rien n'avait echoue — une absence prise pour une
  # panne, dans le compte-rendu d'un projet qui refuse exactement cela.
  local sk; sk=$(grep -oE '[0-9]+ skipped' <<<"$ligne" | grep -oE '[0-9]+' | head -1)
  p=${p:-0}; f=${f:-0}; sk=${sk:-0}
  count "$3" "$p" "$((t - sk))"
  [ "$sk" -gt 0 ] && skipped+=("$3 ($sk)")
  [ "$f" -gt 0 ] && failed+=("$3 ($f)")
  return 0
}

echo "TARE — toutes les suites"
# Un test imprime volontairement son propre comptage (8582 comparaisons de bits) : on ne garde
# que la derniere ligne, sinon elle est lue comme le resultat de la suite.
e=$(cd engine && python3 -c "import unittest;r=unittest.TextTestRunner(stream=open('/dev/null','w')).run(unittest.defaultTestLoader.discover('tests','test*.py','.'));print(r.testsRun-len(r.failures)-len(r.errors),r.testsRun)" 2>/dev/null | tail -1)
count "engine (python)" $(awk '{print $1}' <<<"$e") $(awk '{print $2}' <<<"$e")
vitest_count apps/api ""                            "api"
vitest_count apps/api "src/assistant/vitest.config.ts" "assistant"
vitest_count apps/api "src/metering/vitest.config.ts"  "metering"
node_test_count() { # dir, glob-or-cmd, name — le runner natif de node imprime "ℹ pass N" / "ℹ fail N"
  local out; out=$(cd "$1" && eval "$2" 2>&1) || true
  local p f
  p=$(grep -oE '^. pass [0-9]+' <<<"$out" | grep -oE '[0-9]+' | head -1)
  f=$(grep -oE '^. fail [0-9]+' <<<"$out" | grep -oE '[0-9]+' | head -1)
  if [ -z "${p:-}" ]; then broken+=("$3"); printf "  %-22s NE TOURNE PAS\n" "$3"
  else
    count "$3" "$p" "$((p+${f:-0}))"
    [ "${f:-0}" -gt 0 ] && failed+=("$3 (${f})")
  fi
  return 0
}
node_test_count apps/mcp "npm test --silent"        "mcp"
vitest_count packages/guard ""                      "guard"
node_test_count apps/web "node --test src/chat/*.test.ts" "web (chat)"
node_test_count apps/landing "npm test --silent"        "landing"

echo "  ----------------------------------------"
# Trois etats, jamais confondus : une suite qui ne demarre pas, une suite qui echoue, et
# une suite verte. Les melanger reviendrait a lire une panne comme une absence.
if [ ${#broken[@]} -gt 0 ]; then
  printf "  suites qui ne tournent pas : %s\n" "${broken[*]}"
fi
if [ ${#failed[@]} -gt 0 ]; then
  printf "  suites en echec : %s\n" "${failed[*]}"
fi
if [ ${#skipped[@]} -gt 0 ]; then
  printf "  tests ignores (hors total) : %s\n" "${skipped[*]}"
fi
if [ ${#broken[@]} -gt 0 ]; then
  echo "  $pass/$total tests green — INCOMPLET, ${#broken[@]} suite(s) non executee(s)"
  exit 1
fi
if [ ${#failed[@]} -gt 0 ]; then
  echo "  $pass/$total tests green — $((total-pass)) en echec"
  exit 1
fi
echo "  $pass/$total tests green"
