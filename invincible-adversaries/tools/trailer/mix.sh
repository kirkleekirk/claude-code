#!/usr/bin/env bash
# Final assembly: concat shot clips, duck the score under the game SFX, master to -14 LUFS, mux.
#   ./mix.sh <dir-with-shot-mp4s-music.wav-sfx.wav> <out.mp4> <duration-seconds>
set -euo pipefail
D=$1; OUT=$2; DUR=$3
cd "$D"
ls [0-9][0-9]_*.mp4 | sort | sed "s|^|file '$PWD/|; s|$|'|" > list.txt
echo "clips: $(wc -l < list.txt)"

# score ducks (sidechain) whenever the game SFX hit; then both buses are summed (as float, so a sum over
# full scale reaches the limiter below instead of clipping here)
ffmpeg -hide_banner -loglevel error -y -i music.wav -i sfx.wav -filter_complex "
  [1:a]asplit=2[key][fx];
  [0:a]volume=0.82[mus];
  [mus][key]sidechaincompress=threshold=0.1:ratio=2.5:attack=8:release=240:makeup=1[duck];
  [fx]volume=1.2,highpass=f=28[fx2];
  [duck][fx2]amix=inputs=2:normalize=0:duration=longest,volume=enable='between(t,${DROP:-16.83},${DROP_END:-16.995})':volume=0.08,atrim=0:${DUR},afade=t=out:st=$(python3 -I -c "print($DUR - 0.9)"):d=0.9[mix]" \
  -map "[mix]" -ar 48000 -c:a pcm_f32le mix_raw.wav

# two-pass loudness normalisation to -14 LUFS / -2 dBTP (headroom for AAC overshoot): linear gain when the
# peaks allow it, otherwise loudnorm limits the peaks dynamically
J=$(ffmpeg -hide_banner -nostats -i mix_raw.wav -af loudnorm=I=-14:TP=-2.0:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$J" | python3 -I -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -hide_banner -loglevel error -y -i mix_raw.wav -af "loudnorm=I=-14:TP=-2.0:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true:print_format=summary" -ar 48000 -c:a pcm_s16le mix.wav

# two-pass 8 Mbit/s H.264; a light temporal denoise keeps the post-process film grain from eating the bitrate
V="-vf hqdn3d=2:1.5:7:6 -c:v libx264 -preset slow -b:v 8M -maxrate 12M -bufsize 16M -pix_fmt yuv420p -profile:v high -level 4.2 -r 30"
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i list.txt $V -pass 1 -passlogfile x264pass -an -t "$DUR" -f null /dev/null
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i list.txt -i mix.wav -map 0:v -map 1:a $V -pass 2 -passlogfile x264pass \
  -c:a aac -b:a 256k -ar 48000 -t "$DUR" -movflags +faststart "$OUT"
rm -f x264pass*
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of compact "$OUT"
ffmpeg -hide_banner -nostats -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|LRA|Peak):" | head -3
