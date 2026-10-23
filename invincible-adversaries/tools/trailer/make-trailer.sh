#!/usr/bin/env bash
# Renders the gameplay trailer: parallel capture workers -> game SFX stems -> score -> mix -> trailer.mp4
#   Needs the game served (npm start), ffmpeg, Python 3 with numpy, and `npm install` in tools/.
#   tools/trailer/make-trailer.sh [outDir] [workers]
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${1:-$HERE/out}; N=${2:-3}
mkdir -p "$OUT"
node "$HERE/timeline.mjs" "$HERE/director.js" "$OUT/timeline.json"
# contiguous shot groups with similar rendered frame counts (title cards are cheap)
python3 -I - "$OUT/timeline.json" "$N" > "$OUT/groups.txt" <<'EOF'
import json, sys
L = json.load(open(sys.argv[1]))['list']; n = int(sys.argv[2])
cost = [0 if s['noRender'] else s['frames'] for s in L]
target = sum(cost) / n; groups, cur, acc = [], [], 0
for s, c in zip(L, cost):
    cur.append(s['id']); acc += c
    if acc >= target and len(groups) < n - 1: groups.append(cur); cur, acc = [], 0
groups.append(cur)
for g in groups: print(','.join(g))
EOF
i=0; pids=()
while read -r g; do i=$((i + 1)); node "$HERE/capture.mjs" "$OUT" "$g" --audio "sfx_w$i.wav" > "$OUT/w$i.log" 2>&1 & pids+=($!); done < "$OUT/groups.txt"
for p in "${pids[@]}"; do wait "$p"; done
python3 -I "$HERE/sfx_sum.py" "$OUT/sfx.wav" "$OUT"/sfx_w*.wav
node "$HERE/render-score.mjs" "$OUT/music.wav" "$OUT/sfx_hits.json"
DUR=$(python3 -I -c "import json, sys; print(round(json.load(open(sys.argv[1]))['total'], 3))" "$OUT/timeline.json")
"$HERE/mix.sh" "$OUT" "$OUT/trailer.mp4" "$DUR"
echo "wrote $OUT/trailer.mp4"
