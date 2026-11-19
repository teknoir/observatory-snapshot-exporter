#!/usr/bin/env bash
# `npm test` entry point. Humans and CI get the usual node:test output. Under a coding agent (CLAUDECODE,
# AI_AGENT, Codex) the full spec output goes to .test-logs/ and the console shows only the console output
# printed just before each failing test, the totals, the failing tests (error, stack), the exit code and
# the log path.
set -uo pipefail
cd "$(dirname "$0")/.."
export DISABLE_V8_COMPILE_CACHE=1
cmd=(node --require ts-node/register --test --test-force-exit); files=(test/*.test.ts)
is_agent() { case "${AI_AGENT:-}" in 0|false|no|off) return 1;; "") ;; *) return 0;; esac
  [ -n "${CLAUDECODE:-}${CODEX_THREAD_ID:-}${CODEX_SANDBOX:-}${GEMINI_CLI:-}${CURSOR_AGENT:-}${OPENCODE:-}" ]; }
is_agent || exec "${cmd[@]}" ${files[@]+"${files[@]}"} "$@"

export NO_COLOR=1 FORCE_COLOR=0
mkdir -p .test-logs; log=".test-logs/node-test-$(date +%Y%m%d-%H%M%S)-$$.log"
"${cmd[@]}" --test-reporter=spec ${files[@]+"${files[@]}"} "$@" >"$log" 2>&1; rc=$?
# Before the totals: keep the lines printed since the previous result line, and show them (12 at most)
# only when the next result is a failure. From the totals on: print everything (totals, failing tests).
awk '
/^ℹ tests / { tail = 1 }
tail { print; next }
/^ *(✔|﹣|▶) / { n = 0; next }
/^ *✖ / {
  if (n) { print "console output before: " $0; for (i = (n > 12 ? n - 11 : 1); i <= n; i++) print "  " buf[i]; print "" }
  n = 0; next
}
{ buf[++n] = $0 }
END { if (!tail) print "(no totals: the run did not finish; see the log)" }
' "$log"
echo "exit=$rc full log: $log"
exit "$rc"
