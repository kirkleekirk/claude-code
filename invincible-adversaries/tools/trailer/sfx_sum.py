# Sum the per-worker SFX stems (their shots never overlap in time) and find the big impacts from the
# sound cues the director logged next to each stem (<stem>.cues.json: [shot, sound, time]).
import sys, os, wave, json, numpy as np
outs = sys.argv[1]; ins = sys.argv[2:]
acc = None; sr = None
for p in ins:
    w = wave.open(p); sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    acc = x if acc is None else acc[:len(x)] + x[:len(acc)]
peak = float(np.max(np.abs(acc)))
st = acc.reshape(-1, 2)
w = wave.open(outs, 'w'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
w.writeframes((np.clip(st, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()
cues = []
for p in ins:
    cp = os.path.splitext(p)[0] + '.cues.json'
    if os.path.exists(cp): cues += json.load(open(cp))
# each hit is the first time that sound plays in that shot; a missing one falls back to score.js's default
SYNC = { 'mach': ('inv_mach', 'explosion'), 'unbound': ('eve_ult', 'unbound_burst'), 'beam': ('eve_ult', 'beam_start'), 'land': ('omni_land', 'ground_slam') }
hits = {}
for k, (shot, name) in SYNC.items():
    ts = [t for s, n, t in cues if s == shot and n == name]
    if ts: hits[k] = round(min(ts), 3)
    else: print('no cue for', k, f'({name} in {shot})')
json.dump(hits, open(outs.replace('.wav', '_hits.json'), 'w'))
print('sfx peak', round(peak, 3), 'hits', hits)
