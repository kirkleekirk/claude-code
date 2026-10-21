#!/usr/bin/env bash
# Final assembly: concat shot clips, duck the score under the game SFX, master to -14 LUFS, mux.
#   ./mix.sh <dir-with-shot-mp4s-music.wav-sfx.wav> <out.mp4> <duration-seconds>
set -euo pipefail
D=$1; OUT=$2; DUR=$3
cd "$D"
ls [0-9][0-9]_*.mp4 | sort | sed "s|^|file '$PWD/|; s|$|'|" > list.txt
echo "clips: $(wc -l < list.txt)"

# score ducks (sidechain) whenever the game SFX hit; then both buses are summed
ffmpeg -hide_banner -loglevel error -y -i music.wav -i sfx.wav -filter_complex "
  [1:a]asplit=2[key][fx];
  [0:a]volume=0.82[mus];
  [mus][key]sidechaincompress=threshold=0.05:ratio=3.5:attack=6:release=260:makeup=1[duck];
  [fx]volume=1.2,highpass=f=28[fx2];
  [duck][fx2]amix=inputs=2:normalize=0:duration=longest,atrim=0:${DUR},afade=t=out:st=$(python3 -I -c "print($DUR - 0.9)"):d=0.9[mix]" \
  -map "[mix]" -ar 48000 -c:a pcm_s24le mix_raw.wav

# two-pass loudness normalisation (linear) to -14 LUFS / -1 dBTP
J=$(ffmpeg -hide_banner -nostats -i mix_raw.wav -af loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$J" | python3 -I -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -hide_banner -loglevel error -y -i mix_raw.wav -af "loudnorm=I=-14:TP=-1.0:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true:print_format=summary" -ar 48000 -c:a pcm_s16le mix.wav

ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i list.txt -i mix.wav \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high -level 4.2 -r 30 \
  -c:a aac -b:a 256k -ar 48000 -t "$DUR" -movflags +faststart "$OUT"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of compact "$OUT"
ffmpeg -hide_banner -nostats -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|LRA|Peak):" | head -3
