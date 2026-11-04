"""Minimal GLB reader: world-space triangle meshes (skinned meshes posed at their bind pose) and joint positions."""
import json, struct
import numpy as np

COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def load(path):
    b = open(path, 'rb').read()
    cl = struct.unpack('<I', b[12:16])[0]
    js = json.loads(b[20:20 + cl])
    off = 20 + cl
    bl = struct.unpack('<I', b[off:off + 4])[0]
    binc = b[off + 8:off + 8 + bl]
    return js, binc


def accessor(js, binc, i):
    a = js['accessors'][i]
    bv = js['bufferViews'][a['bufferView']]
    dt = np.dtype(COMP[a['componentType']])
    n = NCOMP[a['type']]
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', 0) or dt.itemsize * n
    out = np.empty((a['count'], n), dtype=dt)
    for k in range(a['count']):
        out[k] = np.frombuffer(binc, dtype=dt, count=n, offset=start + k * stride)
    if a.get('normalized'):
        out = out.astype(np.float32) / np.iinfo(dt).max
    return out


def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def local_matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix'], dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    s = n.get('scale', [1, 1, 1])
    r = quat_mat(n.get('rotation', [0, 0, 0, 1]))
    m[:3, :3] = r @ np.diag(s)
    m[:3, 3] = n.get('translation', [0, 0, 0])
    return m


def world_matrices(js):
    W = {}
    parent = {}
    for i, n in enumerate(js['nodes']):
        for c in n.get('children', []):
            parent[c] = i

    def get(i):
        if i in W:
            return W[i]
        m = local_matrix(js['nodes'][i])
        if i in parent:
            m = get(parent[i]) @ m
        W[i] = m
        return m
    for i in range(len(js['nodes'])):
        get(i)
    return W


def meshes(path):
    """Return list of dicts: pos (N,3) world, idx (M,3), weights (N,k) joint weights by joint node index, and joints {name: world pos}."""
    js, binc = load(path)
    W = world_matrices(js)
    out = []
    joints = {}
    for i, n in enumerate(js['nodes']):
        if 'mesh' not in n:
            continue
        for p in js['meshes'][n['mesh']]['primitives']:
            pos = accessor(js, binc, p['attributes']['POSITION']).astype(np.float64)
            idx = accessor(js, binc, p['indices']).reshape(-1, 3) if 'indices' in p else np.arange(len(pos)).reshape(-1, 3)
            rec = {'name': n.get('name'), 'idx': idx.astype(np.int64)}
            if 'skin' in n:
                sk = js['skins'][n['skin']]
                ibm = accessor(js, binc, sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
                J = accessor(js, binc, p['attributes']['JOINTS_0']).astype(np.int64)
                Wt = accessor(js, binc, p['attributes']['WEIGHTS_0']).astype(np.float64)
                Wt = Wt / np.maximum(Wt.sum(1, keepdims=True), 1e-9)
                mats = np.array([W[j] @ ibm[k] for k, j in enumerate(sk['joints'])])
                hp = np.c_[pos, np.ones(len(pos))]
                world = np.zeros((len(pos), 3))
                for k in range(4):
                    world += Wt[:, k:k + 1] * np.einsum('nij,nj->ni', mats[J[:, k]], hp)[:, :3]
                rec['pos'] = world
                rec['joints'] = J
                rec['weights'] = Wt
                rec['jointNames'] = [js['nodes'][j]['name'].split('_MBlab')[0] for j in sk['joints']]
                for k, j in enumerate(sk['joints']):
                    joints[rec['jointNames'][k]] = W[j][:3, 3].copy()
            else:
                hp = np.c_[pos, np.ones(len(pos))]
                rec['pos'] = (W[i] @ hp.T).T[:, :3]
            out.append(rec)
    return out, joints, js['asset'].get('extras', {})
