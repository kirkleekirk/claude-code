#!/bin/sh
# Every check, in order of how much it tells you.
set -e
cd "$(dirname "$0")"
echo "== rules =="; node rules.test.js
echo; echo "== click paths =="; node ui.test.js "${1:-300}"
echo; echo "== balance =="; node sim.js "${2:-600}"
