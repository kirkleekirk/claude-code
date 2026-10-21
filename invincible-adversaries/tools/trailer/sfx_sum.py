# Sum the per-worker SFX stems (their shots never overlap in time) and find the big impacts.
import sys, wave, json, numpy as np
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
m = np.abs(st).mean(axis=1)
hop = sr // 200
env = np.array([m[i:i + hop].max() for i in range(0, len(m) - hop, hop)])
def onset(t0, t1):
    a, b = int(t0 * 200), int(t1 * 200)
    seg = env[a:b]
    if not len(seg): return None
    i = int(np.argmax(seg)); pk = seg[i]
    j = i
    while j > 0 and seg[j - 1] > pk * 0.3: j -= 1   # walk back to the attack
    return round((a + j) / 200, 3)
hits = { 'mach': onset(28.3, 29.4), 'unbound': onset(39.3, 40.3), 'beam': onset(40.6, 41.4), 'land': onset(45.6, 46.3) }
json.dump(hits, open(outs.replace('.wav', '_hits.json'), 'w'))
print('sfx peak', round(peak, 3), 'hits', hits)
