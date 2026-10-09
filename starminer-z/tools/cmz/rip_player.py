# Exports the player's side of CastleMiner Z from your own copy of the game: every animation the
# original plays on the player's avatar (first person and third), and the models of the things
# the avatar holds, with their textures. The ripped files are DigitalDNA's: they stay in
# local-assets/, which git ignores.
#
#   python3 tools/cmz/rip_player.py <extracted Content folder> <out folder>
#
# Writes <out>/avatar/clips.json and <out>/items/<name>.gltf.json with <out>/items/index.json.
#
# The clips are the XNA avatar's own: 71 bones in the AvatarBone order (breadth first from the
# hips, each depth in name order), which is the rig this game already draws its avatars on. A
# bone's key is its absolute local rotation; positions are offsets from the bind pose, and only
# the hips have any.
import base64, json, math, os, struct, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xnb
from rip_models import decompose, vertices

BONES = ['BASE', 'BACKA', 'LF_H', 'RT_H', 'SC_BASE', 'BACKB', 'LF_K', 'LF_SC_H', 'RT_K', 'RT_SC_H', 'SC_BACKA', 'LF_A', 'LF_C',
         'LF_SC_K', 'NECK', 'RT_A', 'RT_C', 'RT_SC_K', 'SC_BACKB', 'HEAD', 'LF_S', 'LF_T', 'RT_S', 'RT_T', 'SC_NECK', 'LF_E',
         'LF_SC_S', 'LF_SC_TWIST_S', 'RT_E', 'RT_SC_S', 'RT_SC_TWIST_S', 'LF_E_TWIST', 'LF_SC_E', 'LF_W', 'RT_E_TWIST', 'RT_SC_E',
         'RT_W', 'LF_FINGA', 'LF_FINGB', 'LF_FINGC', 'LF_FINGD', 'LF_PROP', 'LF_SPECIAL', 'LF_THUMB', 'RT_FINGA', 'RT_FINGB',
         'RT_FINGC', 'RT_FINGD', 'RT_PROP', 'RT_SPECIAL', 'RT_THUMB', 'LF_FINGA1', 'LF_FINGB1', 'LF_FINGC1', 'LF_FINGD1',
         'LF_THUMB1', 'RT_FINGA1', 'RT_FINGB1', 'RT_FINGC1', 'RT_FINGD1', 'RT_THUMB1', 'LF_FINGA2', 'LF_FINGB2', 'LF_FINGC2',
         'LF_FINGD2', 'LF_THUMB2', 'RT_FINGA2', 'RT_FINGB2', 'RT_FINGC2', 'RT_FINGD2', 'RT_THUMB2']
CLIP_DIRS = [('AvatarAnimation', ''), ('Weapons/M294/Animation', 'M294/')]

# the things in hand: our name -> the original's model
ITEMS = {
    'pickaxe': 'PickAxe', 'spade': 'Spade', 'axe': 'Axe', 'knife': 'Knife', 'compass': 'Compass',
    'pistol': 'Colt', 'assault': 'AK', 'rifle': 'BoltRifle', 'shotgun': 'PumpShotgun', 'smg': 'M11',
    'ore': 'Ore', 'bars': 'Bars', 'gems': 'Gems', 'ammo': 'Ammo',
}

def b64(fmt, vals):
    return base64.b64encode(struct.pack('<%d%s' % (len(vals), fmt), *vals)).decode()

# ---- the clips ------------------------------------------------------------------------------------

def same(keys, eps=2e-5):
    return all(max(abs(a - b) for a, b in zip(k, keys[0])) < eps for k in keys)

def clips(content, out):
    rot, pos, res, odd = [], [], {}, []
    for d, prefix in CLIP_DIRS:
        folder = os.path.join(content, d)
        for f in sorted(os.listdir(folder)):
            if not f.endswith('.xnb'): continue
            name = prefix + f[:-4]
            c = xnb.parse(xnb.read_xnb(os.path.join(folder, f)))['object']
            if len(c['bones']) != len(BONES): raise ValueError(f'{name}: {len(c["bones"])} bones')
            tracks, frames = [], 0
            for bi, bk in enumerate(c['bones']):
                keys = [list(q) for q in bk['rot']]
                # one hemisphere, so a key never turns the long way to the next
                for k in range(1, len(keys)):
                    if sum(a * b for a, b in zip(keys[k], keys[k - 1])) < 0: keys[k] = [-v for v in keys[k]]
                frames = max(frames, len(keys))
                if same(keys): keys = keys[:1]
                tracks.append([bi, 0, len(keys), len(rot) // 4])
                rot += [max(-32767, min(32767, round(v * 32767))) for k in keys for v in k]
                pk = [list(p) for p in bk['pos']]
                if bi == 0:
                    if same(pk, 1e-5): pk = pk[:1]
                    tracks.append([bi, 1, len(pk), len(pos) // 3])
                    pos += [v for p in pk for v in p]
                elif pk and max(abs(v) for p in pk for v in p) > 1e-4:
                    odd.append(f'{name} moves {BONES[bi]}')
                if bk['scale'] and max(abs(v - 1) for s in bk['scale'] for v in s) > 1e-4:
                    odd.append(f'{name} scales {BONES[bi]}')
            res[name] = {'fps': c['fps'], 'dur': round(c['ticks'] / 1e7, 6), 'frames': frames, 'tracks': tracks}
    os.makedirs(os.path.join(out, 'avatar'), exist_ok=True)
    doc = {'bones': BONES, 'clips': res, 'rot': b64('h', rot), 'pos': b64('f', pos)}
    path = os.path.join(out, 'avatar', 'clips.json')
    json.dump(doc, open(path, 'w'), separators=(',', ':'))
    print(f'{len(res)} clips, {len(rot) // 4} rotation keys, {len(pos) // 3} position keys, {os.path.getsize(path)} bytes')
    for o in odd: print('  note:', o)

# ---- the items ------------------------------------------------------------------------------------

def png_bytes(w, h, rgba):
    import zlib
    raw = b''.join(b'\0' + rgba[y * w * 4:(y + 1) * w * 4] for y in range(h))
    def chunk(t, b): return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xFFFFFFFF)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

class Doc:
    def __init__(self):
        self.bin, self.views, self.accessors = bytearray(), [], []

    def accessor(self, values, fmt, ctype, atype, target=None, minmax=False):
        k = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[atype]
        flat = [x for v in values for x in (v if isinstance(v, (list, tuple)) else (v,))]
        data = struct.pack('<%d%s' % (len(flat), fmt), *flat)
        while len(self.bin) % 4: self.bin.append(0)
        view = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target: view['target'] = target
        self.bin += data
        self.views.append(view)
        a = {'bufferView': len(self.views) - 1, 'componentType': ctype, 'count': len(values), 'type': atype}
        if minmax:
            a['min'] = [min(flat[i::k]) for i in range(k)]
            a['max'] = [max(flat[i::k]) for i in range(k)]
        self.accessors.append(a)
        return len(self.accessors) - 1

def item(name, rel, content, out):
    p = xnb.parse(xnb.read_xnb(os.path.join(content, rel + '.xnb')))
    if 'errors' in p: raise ValueError(f'{rel}: {p["errors"]}')
    model, shared = p['object'], p['shared']
    g = Doc()
    nodes = []
    for b in model['bones']:
        t, r, s = decompose(b['m'])
        node = {'name': b['name'], 'translation': t, 'rotation': r}
        if any(abs(v - 1) > 1e-5 for v in s): node['scale'] = s
        nodes.append(node)
    roots = []
    for i, b in enumerate(model['bones']):
        if b['parent'] is None: roots.append(i)
        else: nodes[b['parent']].setdefault('children', []).append(i)
    images, textures, materials, meshes, mat_of = [], [], [], [], {}
    for mesh in model['meshes']:
        prims = []
        for part in mesh['parts']:
            vb, ib = shared[part['vb'] - 1], shared[part['ib'] - 1]
            fx = shared[part['effect'] - 1] if part['effect'] else {}
            key = json.dumps({k: v for k, v in fx.items() if k != 'effectCode'}, sort_keys=True)
            if key not in mat_of:
                m = {'name': os.path.basename(fx.get('texture', '').replace('\\', '/')) or 'plain',
                     'pbrMetallicRoughness': {'baseColorFactor': list(fx.get('diffuse', [1, 1, 1])) + [fx.get('alpha', 1)], 'metallicFactor': 0, 'roughnessFactor': 1},
                     'extras': {'specular': fx.get('specular', [0, 0, 0]), 'power': fx.get('power', 1)}}
                if fx.get('texture'):
                    t = xnb.parse(xnb.read_xnb(os.path.join(content, *fx['texture'].split('\\')) + '.xnb'))['object']
                    rgba = xnb.texture_rgba(t, False, True)
                    images.append({'uri': 'data:image/png;base64,' + base64.b64encode(png_bytes(t['w'], t['h'], rgba)).decode()})
                    textures.append({'source': len(images) - 1, 'sampler': 0})
                    m['pbrMetallicRoughness']['baseColorTexture'] = {'index': len(textures) - 1}
                materials.append(m)
                mat_of[key] = len(materials) - 1
            V = vertices(vb)
            idx = struct.unpack('>%dH' % (len(ib['data']) // 2), ib['data']) if ib['sixteen'] else struct.unpack('>%dI' % (len(ib['data']) // 4), ib['data'])
            tri = idx[part['startIndex']:part['startIndex'] + part['primitives'] * 3]
            used = sorted(set(tri))
            lo = min(used)
            faces = []
            for k in range(0, len(tri), 3): faces += [tri[k] - lo, tri[k + 2] - lo, tri[k + 1] - lo]  # XNA winds clockwise
            sl = slice(part['vertexOffset'] + lo, part['vertexOffset'] + max(used) + 1)
            attrs = {'POSITION': g.accessor(V[(0, 0)][sl], 'f', 5126, 'VEC3', 34962, True)}
            if (3, 0) in V: attrs['NORMAL'] = g.accessor(V[(3, 0)][sl], 'f', 5126, 'VEC3', 34962)
            if (2, 0) in V: attrs['TEXCOORD_0'] = g.accessor(V[(2, 0)][sl], 'f', 5126, 'VEC2', 34962)
            prims.append({'attributes': attrs, 'indices': g.accessor(faces, 'H', 5123, 'SCALAR', 34963), 'material': mat_of[key]})
        # the original tints a mesh by name: recolor_ takes the item's material colour, recolor2_ its second
        tint = 2 if 'recolor2_' in mesh['name'] else 1 if 'recolor_' in mesh['name'] else 0
        meshes.append({'name': mesh['name'], 'primitives': prims, 'extras': {'tint': tint, 'sphere': mesh['sphere']}})
        bone = mesh['bone'] if mesh['bone'] is not None else roots[0]
        if 'mesh' in nodes[bone]:
            nodes.append({'name': mesh['name'], 'mesh': len(meshes) - 1})
            nodes[bone].setdefault('children', []).append(len(nodes) - 1)
        else:
            nodes[bone]['mesh'] = len(meshes) - 1
    while len(g.bin) % 4: g.bin.append(0)
    doc = {'asset': {'version': '2.0', 'generator': 'starminer-z tools/cmz/rip_player.py'}, 'scene': 0,
           'scenes': [{'nodes': roots}], 'nodes': nodes, 'meshes': meshes, 'materials': materials,
           'accessors': g.accessors, 'bufferViews': g.views,
           'buffers': [{'byteLength': len(g.bin), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(bytes(g.bin)).decode()}]}
    if images:
        doc['images'], doc['textures'] = images, textures
        doc['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
    fn = f'{name}.gltf.json'
    json.dump(doc, open(os.path.join(out, 'items', fn), 'w'), separators=(',', ':'))
    tip = next((b for b in model['bones'] if b['name'] == 'BarrelTip'), None)
    return {'file': fn, 'model': rel, 'bones': [b['name'] for b in model['bones']], 'meshes': [m['name'] for m in model['meshes']],
            'barrelTip': [round(v, 5) for v in tip['m'][12:15]] if tip else None, 'bytes': os.path.getsize(os.path.join(out, 'items', fn))}

def items(content, out):
    os.makedirs(os.path.join(out, 'items'), exist_ok=True)
    index = {}
    for name, rel in ITEMS.items():
        index[name] = item(name, rel, content, out)
        print(f'{name:8} {rel:12} {index[name]["bytes"]:7} bytes  meshes {index[name]["meshes"]}  tip {index[name]["barrelTip"]}')
    json.dump(index, open(os.path.join(out, 'items', 'index.json'), 'w'), indent=1)

if __name__ == '__main__':
    clips(sys.argv[1], sys.argv[2])
    items(sys.argv[1], sys.argv[2])
