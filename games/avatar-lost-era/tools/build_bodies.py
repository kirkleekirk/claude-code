"""Convert the two CC-BY base meshes into the game's embedded body asset (src/05_bodies.js).

- Normalises to metres, Y up, facing +Z, feet on y=0.
- Rigs both meshes to the game skeleton (female: artist weights from her MB-Lab rig mapped onto game bones;
  male: unrigged, so weights are computed from distance to bone segments).
- Re-poses both from A-pose to the game's rest pose (arms hanging down) with linear-blend skinning.
- Writes positions, indices, 4 bone weights per vertex, joint positions, a body-region label per vertex,
  and the authors' CC-BY credits.

usage: python3 tools/build_bodies.py   (run from games/avatar-lost-era)
"""
import base64, json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import glb_read

ROOT = os.path.join(os.path.dirname(__file__), '..')
BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'lidL', 'lidR', 'hairTail',
         'clavL', 'shL', 'elL', 'handL', 'fingL', 'fing2L', 'thumbL', 'clavR', 'shR', 'elR', 'handR', 'fingR', 'fing2R', 'thumbR',
         'hipL', 'knL', 'ankleL', 'toeL', 'hipR', 'knR', 'ankleR', 'toeR']
BI = {b: i for i, b in enumerate(BONES)}
# region labels (used by the game to paint clothing): dominant bone → region
REGION = {'hips': 1, 'spine': 2, 'chest': 3, 'clav': 3, 'neck': 4, 'head': 5, 'sh': 6, 'el': 7, 'hand': 8, 'fing': 8, 'fing2': 8, 'thumb': 8, 'hip': 9, 'kn': 10, 'ankle': 11, 'toe': 11}


def region_of(bone):
    for k in sorted(REGION, key=len, reverse=True):
        if bone.startswith(k):
            return REGION[k]
    return 0


# ---------------------------------------------------------------- female: MB-Lab joint → game bone
def mb_map(name):
    side = 'L' if name.endswith('_L') else 'R' if name.endswith('_R') else ''
    base = name[:-2] if side else name
    if base in ('MBlab_sk1616295127.556248_rootJoint', 'root', 'pelvis'): return [('hips', 1)]
    if base.startswith('thigh'): return [('hip' + side, 1)]
    if base.startswith('calf'): return [('kn' + side, 1)]
    if base == 'foot': return [('ankle' + side, 1)]
    if base == 'toes': return [('toe' + side, 1)]
    if base == 'spine01': return [('spine', 1)]
    if base == 'spine02': return [('spine', 0.5), ('chest', 0.5)]
    if base in ('spine03', 'breast'): return [('chest', 1)]
    if base == 'clavicle': return [('clav' + side, 1)]
    if base.startswith('upperarm'): return [('sh' + side, 1)]
    if base.startswith('lowerarm'): return [('el' + side, 1)]
    if base == 'hand': return [('hand' + side, 1)]
    if base.startswith('thumb'): return [('thumb' + side, 1)]
    for f in ('index', 'middle', 'ring', 'pinky'):
        if base.startswith(f):
            seg = base[len(f):]
            return [('hand' + side, 1)] if seg == '00' else [('fing' + side, 1)] if seg == '01' else [('fing2' + side, 1)]
    if base == 'neck': return [('neck', 1)]
    if base == 'head': return [('head', 1)]
    raise KeyError(name)


def seg_dist(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(p - (a + np.outer(t, ab)), axis=1), t


def arm_split(pos, idx, J):
    """Below the armpits the arms hang free of the torso: split that part of the mesh into connected pieces.
    Returns +1 / -1 for vertices on a free-hanging arm (by side), 0 for the torso and legs, None above the armpits."""
    pit = min(J['shL'][1], J['shR'][1]) - 0.15
    low = pos[:, 1] < pit; parent = list(range(len(pos)))
    def find(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for t in idx:
        for a_, b_ in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            if low[a_] and low[b_]: parent[find(a_)] = find(b_)
    comp = {}
    for i in np.where(low)[0]: comp.setdefault(find(i), []).append(i)
    out = np.full(len(pos), np.nan)
    big = max(comp.values(), key=len)  # torso + legs
    for c in comp.values():
        side = 0 if c is big else int(np.sign(pos[c, 0].mean()))
        out[c] = side
    return out


def auto_weights(pos, J, split=None):
    """Weights for an unrigged body from distance to bone segments, restricted to anatomically sensible bones."""
    segs = {  # bone: (start joint, end joint)
        'hips': (J['hips'] + [0, -0.06, 0], J['spine']), 'spine': (J['spine'], J['chest']), 'chest': (J['chest'], J['neck']),
        'neck': (J['neck'], J['head']), 'head': (J['head'], J['head'] + [0, 0.2, 0.02])}
    for s in 'LR':
        segs['sh' + s] = (J['sh' + s], J['el' + s]); segs['el' + s] = (J['el' + s], J['hand' + s]); segs['hand' + s] = (J['hand' + s], J['fing' + s])
        segs['fing' + s] = (J['fing' + s], J['fing' + s] + (J['fing' + s] - J['hand' + s]) * 0.9); segs['thumb' + s] = (J['thumb' + s], J['thumb' + s] + [0, -0.04, 0.02])
        segs['hip' + s] = (J['hip' + s], J['kn' + s]); segs['kn' + s] = (J['kn' + s], J['ankle' + s]); sg = 1 if s == 'L' else -1; heelZ = pos[(np.sign(pos[:, 0]) == sg) & (pos[:, 1] < 0.1), 2].min()
        segs['ankle' + s] = (np.array([J['ankle' + s][0], 0.035, heelZ + 0.03]), J['toe' + s] + [0, 0.01, 0])
        segs['toe' + s] = (J['toe' + s], J['toe' + s] + [0, -0.005, 0.07]); segs['clav' + s] = (J['clav' + s] + (J['sh' + s] - J['clav' + s]) * 0.25, J['sh' + s] + [0, 0.03, 0])
    names = list(segs)
    D = np.stack([seg_dist(pos, *segs[n])[0] for n in names], 1)
    x, y = pos[:, 0], pos[:, 1]
    shX = abs(J['shL'][0])
    # restrict candidates by side and height so an arm never pulls on the thigh it hangs beside
    for k, n in enumerate(names):
        side = n[-1] if n[-1] in 'LR' and n not in ('hips',) else ''
        if side == 'L': D[x < -0.02, k] = 1e9
        if side == 'R': D[x > 0.02, k] = 1e9
        if n.startswith(('sh', 'el', 'hand', 'fing', 'thumb')): D[np.abs(x) < shX * 0.72, k] = 1e9
        if n.startswith(('hip', 'kn', 'ankle')) and n != 'hips': D[(np.abs(x) > shX * 0.95) & (y > J['hipL'][1] - 0.2), k] = 1e9
        if n in ('spine', 'chest', 'hips', 'neck', 'head'): D[np.abs(x) > shX * 1.15, k] = 1e9
        if n.startswith('clav'): D[(y < J['chest'][1] + 0.06) | (y > J['neck'][1] + 0.01) | (np.abs(x) < 0.035), k] = 1e9
        if n.startswith('toe'): D[y > 0.06, k] = 1e9
        if split is not None:  # free-hanging arm pieces follow only that arm; the torso below the armpits never follows an arm
            isarm = n.startswith(('sh', 'el', 'hand', 'fing', 'thumb'))
            sd = 1 if side == 'L' else -1 if side == 'R' else 0
            if isarm: D[(split == 0) | ((split != 0) & ~np.isnan(split) & (split != sd)), k] = 1e9
            else: D[(split == 1) | (split == -1), k] = 1e9
        if n.startswith('kn'): D[y < J['ankleL'][1] - 0.02, k] = 1e9  # the foot below the ankle follows the foot only
    W = 1.0 / np.maximum(D, 0.012) ** 6
    top = np.argsort(-W, 1)[:, :4]
    w = np.take_along_axis(W, top, 1); w /= w.sum(1, keepdims=True)
    w[w < 0.04] = 0; w /= w.sum(1, keepdims=True)
    return [[names[i] for i in row] for row in top], w


def repose_arms(pos, idx_names, w, J, drop, root='sh', chain=('sh', 'el', 'hand', 'fing', 'fing2', 'thumb')):
    """Rotate each limb about its root joint (z axis) — linear-blend skinning so the armpit / groin blends smoothly."""
    out = pos.copy()
    for s, sg in (('L', 1), ('R', -1)):
        if abs(drop[s]) < 1e-6: continue
        c = J[root + s].copy(); ang = -sg * drop[s]
        R = np.array([[np.cos(ang), -np.sin(ang), 0], [np.sin(ang), np.cos(ang), 0], [0, 0, 1]])
        arm = {b + s for b in chain}
        f = np.array([[w[i, k] if idx_names[i][k] in arm else 0 for k in range(4)] for i in range(len(pos))]).sum(1)
        moved = (pos - c) @ R.T + c
        out = out + f[:, None] * (moved - pos)
        for b in arm:
            if b in J: J[b] = (J[b] - c) @ R.T + c
    return out


def body(path, kind, height):
    ms, joints, extras = glb_read.meshes(path)
    if kind == 'female':
        main = max(ms, key=lambda m: len(m['pos']))  # drop the separate underwear mesh
        pos = main['pos']; idx = main['idx']
    else:
        pos = ms[0]['pos']; idx = ms[0]['idx']
    # merge duplicate positions (UV seams) so weights and smoothing are shared
    key = np.round(pos, 5); uniq, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.reshape(-1)
    first = np.zeros(len(uniq), np.int64); first[inv[::-1]] = np.arange(len(pos))[::-1]
    pos_u = pos[first]; idx = inv[idx]
    keep = (idx[:, 0] != idx[:, 1]) & (idx[:, 1] != idx[:, 2]) & (idx[:, 0] != idx[:, 2]); idx = idx[keep]
    mn, mx = pos_u.min(0), pos_u.max(0); s = height / (mx[1] - mn[1])
    off = np.array([-(mn[0] + mx[0]) / 2, -mn[1], 0.0])
    P = (pos_u + off) * s
    if kind == 'female':
        J0 = {k: (v + off) * s for k, v in joints.items()}
        J = {'hips': J0['pelvis'], 'spine': J0['spine01'], 'chest': J0['spine03'], 'neck': J0['neck'], 'head': J0['head']}
        for sd in 'LR':
            J['sh' + sd] = J0['upperarm_' + sd]; J['el' + sd] = J0['lowerarm_' + sd]; J['hand' + sd] = J0['hand_' + sd]
            J['fing' + sd] = J0['middle01_' + sd]; J['fing2' + sd] = J0['middle02_' + sd]; J['thumb' + sd] = J0['thumb01_' + sd]
            J['hip' + sd] = J0['thigh_' + sd]; J['kn' + sd] = J0['calf_' + sd]; J['ankle' + sd] = J0['foot_' + sd]
            J['clav' + sd] = J0['clavicle_' + sd]; J['toe' + sd] = J0['toes_' + sd]
        # artist weights → game bones
        Jn, Wt = main['joints'][first], main['weights'][first]
        names, w = [], np.zeros((len(P), 4))
        for i in range(len(P)):
            acc = {}
            for k in range(4):
                for b, f in mb_map(main['jointNames'][Jn[i, k]]):
                    # this file's skin labels sides opposite to where the vertices sit: take the side from the vertex
                    if b[-1] in 'LR' and b not in ('hips',): b = b[:-1] + ('L' if P[i, 0] > 0 else 'R')
                    acc[b] = acc.get(b, 0) + Wt[i, k] * f
            top = sorted(acc.items(), key=lambda t: -t[1])[:4]
            tot = sum(v for _, v in top) or 1
            names.append([b for b, _ in top] + ['hips'] * (4 - len(top))); w[i, :len(top)] = [v / tot for _, v in top]
        z0 = J['hips'][2]
    else:
        H = height
        # arm axis from a straight-line fit through each arm's vertices (the mesh is too sparse for height slices)
        def arm_line(side):
            m = (np.sign(P[:, 0]) == side) & (np.abs(P[:, 0]) > 0.16) & (P[:, 1] > 0.42 * H) & (P[:, 1] < 0.8 * H)
            Q = P[m]; c = Q.mean(0); u = np.linalg.svd(Q - c)[2][0]; u = u if u[1] < 0 else -u
            return c, u
        def on_arm(side, y):
            c, u = arm_line(side); t = (y - c[1]) / u[1]; return c + u * t
        J = {}
        crotch = 0.475 * H
        J['hips'] = np.array([0, crotch + 0.085, 0.0]); J['spine'] = np.array([0, crotch + 0.16, 0.0]); J['chest'] = np.array([0, 0.71 * H, 0.0])
        J['neck'] = np.array([0, 0.845 * H, 0.0]); J['head'] = np.array([0, 0.875 * H, 0.012])
        for sd, sg in (('L', 1), ('R', -1)):
            J['el' + sd] = on_arm(sg, 0.625 * H); J['hand' + sd] = on_arm(sg, 0.49 * H); J['sh' + sd] = on_arm(sg, 0.815 * H) * [0.93, 1, 1]
            top = P[(np.sign(P[:, 0]) == sg) & (np.abs(P[:, 0]) > 0.16) & (P[:, 1] > 0.77 * H)]; J['sh' + sd][2] = top[:, 2].mean()  # line fit drifts at the end: centre the shoulder in the deltoid
            J['fing' + sd] = J['hand' + sd] + (J['hand' + sd] - J['el' + sd]) * 0.3
            J['fing2' + sd] = J['fing' + sd] + (J['hand' + sd] - J['el' + sd]) * 0.15
            J['thumb' + sd] = J['hand' + sd] + np.array([-sg * 0.01, -0.03, 0.025])
            J['hip' + sd] = np.array([sg * 0.09, crotch + 0.075, 0.0]); J['kn' + sd] = np.array([sg * 0.095, 0.285 * H, 0.012]); J['ankle' + sd] = np.array([sg * 0.1, 0.045 * H, -0.01])
        for sd, sg in (('L', 1), ('R', -1)):
            J['clav' + sd] = np.array([sg * 0.025, J['sh' + sd][1] - 0.012, J['sh' + sd][2] + 0.05])
            ft = P[(np.sign(P[:, 0]) == sg) & (P[:, 1] < 0.1)]; heel, tip = ft[:, 2].min(), ft[:, 2].max()
            J['toe' + sd] = np.array([J['ankle' + sd][0] + sg * 0.004, 0.026, heel + 0.72 * (tip - heel)])
        split = arm_split(P, idx, J)
        print('arm split: torso', int((split == 0).sum()), 'L', int((split == 1).sum()), 'R', int((split == -1).sum()))
        names, w = auto_weights(P, J, split)
        z0 = 0.0
    P[:, 2] -= z0
    for k in J: J[k] = np.asarray(J[k], float) - [0, 0, z0]
    # A-pose → arms hanging (leave ~6° so the hands clear the thighs)
    drop = {}
    for sd, sg in (('L', 1), ('R', -1)):
        v = J['hand' + sd] - J['sh' + sd]; cur = np.arctan2(sg * v[0], -v[1]); drop[sd] = cur - np.radians(6.5)
    P = repose_arms(P, names, w, J, drop)
    # wide A-pose stance → feet under the hips
    drop = {}
    for sd, sg in (('L', 1), ('R', -1)):
        v = J['ankle' + sd] - J['hip' + sd]; cur = np.arctan2(sg * v[0], -v[1]); drop[sd] = cur - np.arctan2(-0.012, -v[1]) if cur > 0.03 else 0.0
    P = repose_arms(P, names, w, J, drop, 'hip', ('hip', 'kn', 'ankle', 'toe'))
    if kind == 'female':  # soften the exaggerated base-mesh silhouette to fit the show's loose robes
        ch = J['chest']; front = (P[:, 2] > ch[2] + 0.03) & (np.abs(P[:, 1] - (ch[1] - 0.02)) < 0.13) & (np.abs(P[:, 0]) < 0.17)
        P[front, 2] = ch[2] + 0.03 + (P[front, 2] - ch[2] - 0.03) * 0.55
        hipband = (np.abs(P[:, 1] - J['hips'][1] + 0.05) < 0.14) & (np.abs(P[:, 0]) > 0.1)
        hx = np.abs(P[hipband, 0]); P[hipband, 0] = np.sign(P[hipband, 0]) * (0.1 + (hx - 0.1) * 0.85)
    # derived joints the game needs
    reg = np.array([region_of(names[i][int(np.argmax(w[i]))]) for i in range(len(P))], np.uint8)
    head = P[reg == 5]
    J['lidL'] = np.zeros(3); J['lidR'] = np.zeros(3); J['hairTail'] = np.array([0, head[:, 1].max() - 0.05, head[:, 2].min() + 0.03])
    return {'pos': P, 'idx': idx, 'names': names, 'w': w, 'J': J, 'reg': reg, 'credit': extras,
            'headTop': float(head[:, 1].max()), 'headFront': float(head[:, 2].max()), 'headBack': float(head[:, 2].min()), 'headHalfW': float(np.abs(head[:, 0]).max())}


def b64(a): return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()


def pack(b):
    si = np.array([[BI[n] for n in row] for row in b['names']], np.uint8)
    sw = np.round(b['w'] * 255).astype(np.int32); sw[:, 0] += 255 - sw.sum(1); sw = np.clip(sw, 0, 255).astype(np.uint8)
    return {'n': int(len(b['pos'])), 'pos': b64(b['pos'].astype(np.float32)), 'idx': b64(b['idx'].astype(np.uint16)), 'si': b64(si), 'sw': b64(sw), 'reg': b64(b['reg']),
            'J': {k: [round(float(x), 5) for x in v] for k, v in b['J'].items()}, 'head': {'top': round(b['headTop'], 4), 'front': round(b['headFront'], 4), 'back': round(b['headBack'], 4), 'halfW': round(b['headHalfW'], 4)},
            'credit': {k: b['credit'].get(k) for k in ('title', 'author', 'license', 'source')}}


if __name__ == '__main__':
    male = body(os.path.join(ROOT, 'assets/male_body.glb'), 'male', 1.76)
    female = body(os.path.join(ROOT, 'assets/female_base_mesh.glb'), 'female', 1.66)
    data = {'bones': BONES, 'A': pack(male), 'B': pack(female)}
    js = '/* GENERATED by tools/build_bodies.py from assets/*.glb — do not edit by hand.\n   Base meshes (CC-BY-4.0): "Low-Poly Male Body" by Tidominer; "Low Poly Female Base Mesh" by Mesh-Base (Sketchfab). */\n'
    js += 'const BODY_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n'
    open(os.path.join(ROOT, 'src/05_bodies.js'), 'w').write(js)
    np.savez('/tmp/bodies_debug.npz', mpos=male['pos'], fpos=female['pos'], midx=male['idx'], fidx=female['idx'], mreg=male['reg'], freg=female['reg'])
    json.dump({'male': {k: v.tolist() for k, v in male['J'].items()}, 'female': {k: v.tolist() for k, v in female['J'].items()}}, open('/tmp/bodies_joints.json', 'w'))
    print('wrote src/05_bodies.js', os.path.getsize(os.path.join(ROOT, 'src/05_bodies.js')), 'bytes;', 'male', male['pos'].shape, 'tris', len(male['idx']), '| female', female['pos'].shape, 'tris', len(female['idx']))
