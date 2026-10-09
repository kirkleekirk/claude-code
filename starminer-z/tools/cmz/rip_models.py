# Exports CastleMiner Z's enemies from your own copy of the game: the zombie and the four
# skeletons (meshes, skins and every animation clip) as glTF binaries (.glb) for three.js, and
# their skins (the texture variants the game swaps between) as PNGs. Writes <out>/<name>.glb,
# <out>/<texture>.png and <out>/index.json. The ripped files are DigitalDNA's: they stay in
# local-assets/, which git ignores.
#
#   python3 tools/cmz/rip_models.py <extracted Content folder> <out folder>
import json, math, os, struct, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xnb

MODELS = {
    'zombie': 'Enemies/Zombies/zombieHigh',
    'skeleton': 'Enemies/Skeletons/SkeletonZombie',
    'skeleton_axes': 'Enemies/Skeletons/SkeletonAxes',
    'skeleton_sword': 'Enemies/Skeletons/SkeletonSword',
    'skeleton_archer': 'Enemies/Skeletons/SkeletonArcher',
}
# EnemyType's texture table, in its order: zombies 0-6, skeletons 7-11
TEXTURES = ['Enemies/Zombies/zombie-01_0', 'Enemies/Zombies/zombie-06', 'Enemies/Zombies/zombie-10', 'Enemies/Zombies/zombie-11',
            'Enemies/Zombies/zombie-13', 'Enemies/Zombies/zombie-14', 'Enemies/Zombies/zombie-17',
            'Enemies/Skeletons/skele-01_0', 'Enemies/Skeletons/skele-04', 'Enemies/Skeletons/skele-05', 'Enemies/Skeletons/skele-06',
            'Enemies/Skeletons/skele-07']

FLOAT, USHORT, UBYTE, SHORT = 5126, 5123, 5121, 5122
# the skeletons share one rig and one set of clips: the clips go in the first, the others are meshes
ANIM_FROM = {'skeleton_axes': 'skeleton', 'skeleton_sword': 'skeleton', 'skeleton_archer': 'skeleton'}

# ---- XNA (row vectors, M11..M44) to glTF ---------------------------------------------------------

def quat(C):
    (m00, m01, m02), (m10, m11, m12), (m20, m21, m22) = C
    tr = m00 + m11 + m22
    if tr > 0:
        s = math.sqrt(tr + 1) * 2; return [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]
    if m00 > m11 and m00 > m22:
        s = math.sqrt(1 + m00 - m11 - m22) * 2; return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]
    if m11 > m22:
        s = math.sqrt(1 + m11 - m00 - m22) * 2; return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]
    s = math.sqrt(1 + m22 - m00 - m11) * 2; return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]

def decompose(m):
    # the first three rows are the basis (scaled), the fourth the translation
    rows = [m[0:3], m[4:7], m[8:11]]
    s = [math.sqrt(sum(x * x for x in r)) or 1 for r in rows]
    R = [[rows[i][j] / s[i] for j in range(3)] for i in range(3)]
    det = (R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0])
           + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]))
    if det < 0: s[0] = -s[0]; R[0] = [-x for x in R[0]]
    C = [[R[c][r] for c in range(3)] for r in range(3)]  # column-vector form: the transpose
    q = quat(C)
    n = math.sqrt(sum(x * x for x in q)) or 1
    return [m[12], m[13], m[14]], [x / n for x in q], s

def matmul(a, b):  # XNA order: a then b
    return [sum(a[r * 4 + k] * b[k * 4 + c] for k in range(4)) for r in range(4) for c in range(4)]

# ---- vertex buffers (Xbox 360: big-endian, as the GPU reads them) ---------------------------------

def vertices(vb):
    decl, n, data = vb['decl'], vb['count'], vb['data']
    stride, out = decl['stride'], {}
    for e in decl['elements']:
        f, o = e['fmt'], e['off']
        if f in (0, 1, 2, 3):
            k = f + 1
            vals = [struct.unpack_from('>%df' % k, data, i * stride + o) for i in range(n)]
        elif f in (4, 5):  # Color, Byte4: one big-endian word, the first component in its low byte
            vals = [tuple(reversed(data[i * stride + o:i * stride + o + 4])) for i in range(n)]
        elif f in (7, 9):  # Short4, NormalizedShort4
            vals = [struct.unpack_from('>4h', data, i * stride + o) for i in range(n)]
            if f == 9: vals = [tuple(x / 32767 for x in v) for v in vals]
        else:
            continue
        out[(e['use'], e['idx'])] = vals
    return out

class GLB:
    def __init__(self):
        self.bin, self.views, self.accessors = bytearray(), [], []
        self.cache = {}

    def accessor(self, values, ctype, atype, target=None, minmax=False):
        k = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[atype]
        flat = [x for v in values for x in (v if isinstance(v, (list, tuple)) else (v,))]
        if ctype == SHORT: flat = [max(-32767, min(32767, round(x * 32767))) for x in flat]  # normalized
        data = struct.pack('<%d%s' % (len(flat), {FLOAT: 'f', USHORT: 'H', UBYTE: 'B', SHORT: 'h'}[ctype]), *flat)
        key = (data, ctype, atype)
        if key in self.cache: return self.cache[key]
        while len(self.bin) % 4: self.bin.append(0)
        view = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target: view['target'] = target
        self.bin += data
        self.views.append(view)
        a = {'bufferView': len(self.views) - 1, 'componentType': ctype, 'count': len(values), 'type': atype}
        if ctype == SHORT: a['normalized'] = True
        if minmax:
            a['min'] = [min(flat[i::k]) for i in range(k)]
            a['max'] = [max(flat[i::k]) for i in range(k)]
        self.accessors.append(a)
        self.cache[key] = len(self.accessors) - 1
        return self.cache[key]

    def write(self, path, doc):
        while len(self.bin) % 4: self.bin.append(0)
        doc.update({'accessors': self.accessors, 'bufferViews': self.views, 'buffers': [{'byteLength': len(self.bin)}]})
        js = json.dumps(doc, separators=(',', ':')).encode()
        js += b' ' * (-len(js) % 4)
        body = struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(self.bin), 0x004E4942) + bytes(self.bin)
        open(path, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + len(body)) + body)

def export(name, x, out, with_clips=True):
    p = xnb.parse(x)
    if 'errors' in p: raise ValueError(f'{name}: {p["errors"]}')
    model, shared = p['object'], p['shared']
    tag = model['tag']
    sk, ibp, clips = tag['skeleton'], tag['inverseBindPose'], tag['clips']
    g = GLB()
    nodes = []
    for b in sk:
        t, r, s = decompose(b['m'])
        node = {'name': b['name'], 'translation': t, 'rotation': r}
        if any(abs(v - 1) > 1e-5 for v in s): node['scale'] = s
        nodes.append(node)
    roots = []
    for i, b in enumerate(sk):
        if b['parent'] < 0: roots.append(i)
        else: nodes[b['parent']].setdefault('children', []).append(i)
    # does the skeleton's own pose match the inverse bind poses? (it should: the bind pose)
    world = [None] * len(sk)
    for i, b in enumerate(sk):
        world[i] = b['m'] if b['parent'] < 0 else matmul(b['m'], world[b['parent']])
    err = max(max(abs(v - (1.0 if k % 5 == 0 else 0.0)) for k, v in enumerate(matmul(ibp[i], world[i]))) for i in range(len(sk)))
    # the mesh: every part of every mesh, triangles turned round (XNA's front faces wind clockwise)
    prims, heights, effects = [], [], []
    for mesh in model['meshes']:
        for part in mesh['parts']:
            vb, ib = shared[part['vb'] - 1], shared[part['ib'] - 1]
            fx = shared[part['effect'] - 1] if part['effect'] else {}
            V = vertices(vb)
            idx = struct.unpack('>%dH' % (len(ib['data']) // 2), ib['data']) if ib['sixteen'] else struct.unpack('>%dI' % (len(ib['data']) // 4), ib['data'])
            tri = idx[part['startIndex']:part['startIndex'] + part['primitives'] * 3]
            v0, nv = part['vertexOffset'], part['vertices']
            used = sorted(set(tri))
            lo = min(used)
            rel = [i - lo for i in tri]
            faces = []
            for k in range(0, len(rel), 3): faces += [rel[k], rel[k + 2], rel[k + 1]]
            sl = slice(v0 + lo, v0 + lo + (max(used) - lo + 1))
            pos = V[(0, 0)][sl]
            heights += [q[1] for q in pos]
            attrs = {'POSITION': g.accessor(pos, FLOAT, 'VEC3', 34962, True)}
            if (3, 0) in V: attrs['NORMAL'] = g.accessor(V[(3, 0)][sl], FLOAT, 'VEC3', 34962)
            if (2, 0) in V: attrs['TEXCOORD_0'] = g.accessor(V[(2, 0)][sl], FLOAT, 'VEC2', 34962)
            if (6, 0) in V:
                J = V[(6, 0)][sl]
                W = V[(7, 0)][sl]
                Wn = []
                for w in W:
                    t = sum(w)
                    Wn.append([c / t for c in w] if t > 0 else [1, 0, 0, 0])
                if max(max(j) for j in J) >= len(sk): raise ValueError(f'{name}: a vertex follows bone {max(max(j) for j in J)} of {len(sk)}')
                attrs['JOINTS_0'] = g.accessor(J, UBYTE, 'VEC4', 34962)
                attrs['WEIGHTS_0'] = g.accessor(Wn, FLOAT, 'VEC4', 34962)
            prims.append({'attributes': attrs, 'indices': g.accessor(faces, USHORT, 'SCALAR', 34963), 'material': 0})
            effects.append({k: v for k, v in fx.items() if k != 'effectCode'})
    nodes.append({'name': name, 'mesh': 0, 'skin': 0})
    roots.append(len(nodes) - 1)
    skin = {'joints': list(range(len(sk))), 'inverseBindMatrices': g.accessor([m for m in ibp], FLOAT, 'MAT4'), 'skeleton': roots[0]}
    # the clips: a key per frame at the clip's rate (one for a track that never changes, kept so
    # a clip always sets every bone it moves); rotations as normalized shorts; scale only where
    # it isn't 1
    anims, info = [], {}
    for cname, c in clips.items():
        info[cname] = round(c['ticks'] / 1e7, 4)
        if not with_clips: continue
        ch, sm = [], []
        for bi, bk in enumerate(c['bones'][:len(sk)]):
            for path, keys, atype in (('translation', bk['pos'], 'VEC3'), ('rotation', bk['rot'], 'VEC4'), ('scale', bk['scale'], 'VEC3')):
                if not keys: continue
                if path == 'scale' and all(abs(v - 1) < 1e-4 for k in keys for v in k): continue
                keys = [list(q) for q in keys]
                if path == 'rotation':
                    for k in range(1, len(keys)):
                        if sum(a * b for a, b in zip(keys[k], keys[k - 1])) < 0: keys[k] = [-v for v in keys[k]]
                if all(max(abs(a - b) for a, b in zip(k, keys[0])) < 2e-5 for k in keys): keys = keys[:1]
                times = [k / c['fps'] for k in range(len(keys))]
                out_acc = g.accessor(keys, SHORT, atype) if path == 'rotation' else g.accessor(keys, FLOAT, atype)
                sm.append({'input': g.accessor(times, FLOAT, 'SCALAR', None, True), 'output': out_acc, 'interpolation': 'LINEAR'})
                ch.append({'sampler': len(sm) - 1, 'target': {'node': bi, 'path': path}})
        anims.append({'name': cname, 'channels': ch, 'samplers': sm})
    doc = {'asset': {'version': '2.0', 'generator': 'starminer-z tools/cmz/rip_models.py'}, 'scene': 0,
           'scenes': [{'nodes': roots}], 'nodes': nodes, 'meshes': [{'name': name, 'primitives': prims}],
           'skins': [skin],
           'materials': [{'name': name, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 1}}]}
    if anims: doc['animations'] = anims
    g.write(os.path.join(out, f'{name}.glb'), doc)
    # how the clip keys relate to the bind pose: absolute local transforms, or offsets from it
    b0 = next(iter(clips.values()))['bones']
    offs = [max(abs(a - b) for a, b in zip(b0[i]['pos'][0], decompose(sk[i]['m'])[0])) for i in range(min(len(sk), len(b0))) if b0[i]['pos']]
    return {'file': f'{name}.glb', 'bones': [b['name'] for b in sk], 'clips': info, 'effects': effects,
            'height': [round(min(heights), 3), round(max(heights), 3)], 'bindError': round(err, 5),
            'clipVsBindTranslation': round(max(offs), 4) if offs else None, 'bytes': os.path.getsize(os.path.join(out, f'{name}.glb'))}

def main(content, out):
    os.makedirs(out, exist_ok=True)
    index = {'models': {}, 'textures': []}
    for name, rel in MODELS.items():
        try:
            index['models'][name] = export(name, xnb.read_xnb(os.path.join(content, rel + '.xnb')), out, name not in ANIM_FROM)
            m = index['models'][name]
            m['clipsFrom'] = ANIM_FROM.get(name, name)
            print(name, m['bytes'], 'bytes;', len(m['bones']), 'bones;', len(m['clips']), 'clips;', 'height', m['height'], 'bind error', m['bindError'], 'clip-vs-bind', m['clipVsBindTranslation'])
            print('   clips', ', '.join(f'{k} {v}' for k, v in m['clips'].items()))
            print('   effects', m['effects'])
        except Exception as e:
            import traceback; traceback.print_exc()
            print(name, 'failed:', e)
    for rel in TEXTURES:
        t = xnb.parse(xnb.read_xnb(os.path.join(content, rel + '.xnb')))['object']
        rgba = xnb.texture_rgba(t, False, True)
        fn = os.path.basename(rel).replace('_0', '') + '.png'
        xnb.write_png(os.path.join(out, fn), t['w'], t['h'], rgba)
        cut = sum(1 for i in range(3, len(rgba), 4) if rgba[i] < 128)
        index['textures'].append({'file': fn, 'w': t['w'], 'h': t['h'], 'transparentPixels': cut})
    print('textures', [(t['file'], t['transparentPixels']) for t in index['textures']])
    json.dump(index, open(os.path.join(out, 'index.json'), 'w'), indent=1)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
