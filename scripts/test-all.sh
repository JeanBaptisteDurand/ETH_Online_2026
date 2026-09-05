#!/usr/bin/env bash
# Every suite in the repository, counted once, with a single citable line at the end.
# A suite that fails to run is reported as such and is NOT counted as zero — the same rule
# the measurement engine applies to a node that will not answer.
set -uo pipefail
cd "$(dirname "$0")/.."
pass=0; total=0; broken=()

count() { # name, pass, total
  printf "  %-22s %s/%s\n" "$1" "$2" "$3"; pass=$((pass+$2)); total=$((total+$3))
}
vitest_count() { # dir, config, name
  local out; out=$(cd "$1" && npx vitest run ${2:+--config $2} 2>&1) || true
  local p t
  p=$(grep -oE 'Tests +[0-9]+ passed' <<<"$out" | grep -oE '[0-9]+' | head -1)
  t=$(grep -oE 'Tests +[0-9]+ passed \(([0-9]+)\)' <<<"$out" | grep -oE '\([0-9]+\)' | tr -d '()')
  [ -z "${t:-}" ] && t=$p
  if [ -z "${p:-}" ]; then broken+=("$3"); printf "  %-22s NE TOURNE PAS\n" "$3"; else count "$3" "$p" "$t"; fi
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
  else count "$3" "$p" "$((p+${f:-0}))"; fi
}
node_test_count apps/mcp "npm test --silent"        "mcp"
vitest_count packages/guard ""                      "guard"
node_test_count apps/web "node --test src/chat/*.test.ts" "web (chat)"

echo "  ----------------------------------------"
if [ ${#broken[@]} -gt 0 ]; then
  printf "  suites qui ne tournent pas : %s\n" "${broken[*]}"
  echo "  $pass/$total tests green — INCOMPLET, ${#broken[@]} suite(s) non executee(s)"
  exit 1
fi
echo "  $pass/$total tests green"
