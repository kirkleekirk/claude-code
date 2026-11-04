#!/usr/bin/env bash
# Assemble the single-file game (index.html) from src/.
set -euo pipefail
cd "$(dirname "$0")"
{
  cat src/00_head.html
  echo '<script>'
  for f in src/*.js; do echo "/* ---- ${f#src/} ---- */"; cat "$f"; done
  echo '</script>'
  echo '</body>'
  echo '</html>'
} > index.html
# syntax-check the assembled script before declaring success
tmp=$(mktemp --suffix=.js); cat src/*.js > "$tmp"; if ! node --check "$tmp" 2>"$tmp.err"; then cat "$tmp.err"; rm -f "$tmp" "$tmp.err"; echo "BUILD FAILED: syntax error"; exit 1; fi; rm -f "$tmp" "$tmp.err"
echo "built index.html ($(wc -c < index.html) bytes)"
