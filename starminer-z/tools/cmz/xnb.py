# Reads XNA Game Studio 4.0 content (.xnb) from your own copy of CastleMiner Z: the header, the
# LZX compression, and the objects inside (models with their vertex and index buffers, effects,
# textures, and DigitalDNA's skeletons and animation clips). The formats are XNA's, as MonoGame
# documents and implements them; DNA's own readers were read off DNA.Common.dll.
#
#   python3 tools/cmz/xnb.py survey <Content folder> <report.txt> <png folder>
import json, os, re, struct, sys, zlib
from array import array

# ---- LZX (XNA's flavour: a 64 KB window, output in frames of 32 KB) -----------------------------

EXTRA = []
_j = 0
for _i in range(0, 52, 2):
    EXTRA += [_j, _j]
    if _i and _j < 17: _j += 1
POSBASE = []
_j = 0
for _i in range(51):
    POSBASE.append(_j); _j += 1 << EXTRA[_i]

def huff_table(lens, nsyms):
    # canonical codes, shortest first, then by symbol; a full 16-bit lookup of (symbol, length)
    tbl = [None] * 65536
    code, prev = 0, 0
    for l, s in sorted((l, s) for s, l in enumerate(lens[:nsyms]) if l):
        code <<= l - prev; prev = l
        start, n = code << (16 - l), 1 << (16 - l)
        if start + n > 65536: raise ValueError('LZX: bad Huffman code lengths')
        tbl[start:start + n] = [(s, l)] * n
        code += 1
    return tbl

class LZX:
    def __init__(self, wbits=16):
        self.wsize = 1 << wbits
        self.win = bytearray(self.wsize)
        self.wpos = 0
        self.R = [1, 1, 1]
        self.main_elements = 256 + ({20: 42, 21: 50}.get(wbits, wbits * 2) << 3)
        self.started = False
        self.btype = self.bremain = self.blen = 0
        self.main_len = [0] * (656 + 64)
        self.len_len = [0] * (250 + 64)
        self.al_len = [0] * 8
        self.main_tbl = self.len_tbl = self.al_tbl = None

    # input: 16-bit little-endian words, read most significant bit first
    def ensure(self, k):
        d = self.d
        while self.n < k:
            p = self.p
            lo = d[p] if p < len(d) else 0
            hi = d[p + 1] if p + 1 < len(d) else 0
            self.p = p + 2
            self.buf |= ((hi << 8) | lo) << (16 - self.n)
            self.n += 16

    def bits(self, k):
        if not k: return 0
        self.ensure(k)
        v = self.buf >> (32 - k)
        self.buf = (self.buf << k) & 0xFFFFFFFF
        self.n -= k
        return v

    def sym(self, tbl):
        self.ensure(16)
        e = tbl[self.buf >> 16]
        if e is None: raise ValueError('LZX: bad Huffman code')
        self.buf = (self.buf << e[1]) & 0xFFFFFFFF
        self.n -= e[1]
        return e[0]

    def lengths(self, lens, first, last):
        pre = huff_table([self.bits(4) for _ in range(20)], 20)
        x = first
        while x < last:
            z = self.sym(pre)
            if z == 17:
                for _ in range(self.bits(4) + 4): lens[x] = 0; x += 1
            elif z == 18:
                for _ in range(self.bits(5) + 20): lens[x] = 0; x += 1
            elif z == 19:
                y = self.bits(1) + 4
                z = lens[x] - self.sym(pre)
                if z < 0: z += 17
                for _ in range(y): lens[x] = z; x += 1
            else:
                z = lens[x] - z
                if z < 0: z += 17
                lens[x] = z; x += 1

    def frame(self, d, pos, inlen, outlen):
        self.d, self.p, self.buf, self.n = d, pos, 0, 0
        win, wsize = self.win, self.wsize
        R0, R1, R2 = self.R
        if not self.started:
            if self.bits(1): self.bits(16); self.bits(16)  # Intel E8 translation: XNA never uses it
            self.started = True
        togo = outlen
        while togo > 0:
            if self.bremain == 0:
                if self.btype == 3:
                    if self.blen & 1: self.p += 1
                    self.buf = self.n = 0
                self.btype = self.bits(3)
                hi = self.bits(16); lo = self.bits(8)
                self.bremain = self.blen = (hi << 8) | lo
                if self.btype == 2:
                    for i in range(8): self.al_len[i] = self.bits(3)
                    self.al_tbl = huff_table(self.al_len, 8)
                if self.btype in (1, 2):
                    self.lengths(self.main_len, 0, 256)
                    self.lengths(self.main_len, 256, self.main_elements)
                    self.main_tbl = huff_table(self.main_len, 656)
                    self.lengths(self.len_len, 0, 249)
                    self.len_tbl = huff_table(self.len_len, 250)
                elif self.btype == 3:
                    self.ensure(16)
                    if self.n > 16: self.p -= 2
                    R0, R1, R2 = struct.unpack_from('<III', d, self.p)
                    self.p += 12
                    self.buf = self.n = 0
                else:
                    raise ValueError('LZX: bad block type %d' % self.btype)
            run = min(self.bremain, togo)
            togo -= run
            self.bremain -= run
            wpos = self.wpos & (wsize - 1)
            if wpos + run > wsize: raise ValueError('LZX: a run straddles the window')
            bt = self.btype
            if bt == 3:
                win[wpos:wpos + run] = d[self.p:self.p + run]
                self.p += run
                wpos += run
            else:
                main_tbl, len_tbl, al_tbl = self.main_tbl, self.len_tbl, self.al_tbl
                while run > 0:
                    m = self.sym(main_tbl)
                    if m < 256:
                        win[wpos] = m; wpos += 1; run -= 1
                        continue
                    m -= 256
                    ml = m & 7
                    if ml == 7: ml += self.sym(len_tbl)
                    ml += 2
                    mo = m >> 3
                    if mo > 2:
                        ex = EXTRA[mo]
                        if bt == 1:
                            mo = POSBASE[mo] - 2 + self.bits(ex) if mo != 3 else 1
                        else:
                            base = POSBASE[mo] - 2
                            if ex > 3: mo = base + (self.bits(ex - 3) << 3) + self.sym(al_tbl)
                            elif ex == 3: mo = base + self.sym(al_tbl)
                            elif ex > 0: mo = base + self.bits(ex)
                            else: mo = 1
                        R2, R1, R0 = R1, R0, mo
                    elif mo == 0:
                        mo = R0
                    elif mo == 1:
                        mo, R1, R0 = R1, R0, R1
                    else:
                        mo, R2, R0 = R2, R0, R2
                    run -= ml
                    dst = wpos
                    if wpos >= mo:
                        src = dst - mo
                    else:
                        src = dst + wsize - mo
                        cl = mo - wpos
                        if cl < ml:
                            win[dst:dst + cl] = win[src:src + cl]
                            dst += cl; wpos += cl; ml -= cl; src = 0
                    wpos += ml
                    if src + ml <= dst or src > dst:
                        # apart, or reading ahead of the writes (wrapped round the window)
                        win[dst:dst + ml] = win[src:src + ml]
                    else:  # an overlapping copy repeats the last (dst - src) bytes
                        pat = win[src:dst]
                        win[dst:dst + ml] = (pat * (ml // len(pat) + 1))[:ml]
                if run < 0: raise ValueError('LZX: a match ran past its frame')
            self.wpos = wpos
        self.R = [R0, R1, R2]
        end = self.wpos if self.wpos else wsize
        return bytes(win[end - outlen:end])

def lzx_xnb(d, pos, end, size):
    lz, out = LZX(16), bytearray()
    while pos < end and len(out) < size:
        hi, lo = d[pos], d[pos + 1]
        if hi == 0xFF:
            frame, block = (lo << 8) | d[pos + 2], (d[pos + 3] << 8) | d[pos + 4]; pos += 5
        else:
            frame, block = 0x8000, (hi << 8) | lo; pos += 2
        if not block or not frame: break
        out += lz.frame(d, pos, block, frame)
        pos += block
    return bytes(out[:size])

def read_xnb(path):
    d = open(path, 'rb').read()
    if d[:3] != b'XNB': raise ValueError('not an XNB file')
    plat, ver, flags = chr(d[3]), d[4], d[5]
    size = struct.unpack_from('<I', d, 6)[0]
    if flags & 0x80:
        data = lzx_xnb(d, 14, size, struct.unpack_from('<I', d, 10)[0])
    else:
        data = d[10:size]
    return {'platform': plat, 'version': ver, 'flags': flags, 'packed': size, 'data': data}

# ---- the objects inside ----------------------------------------------------------------------------

def generic(name):
    # 'Ns.ListReader`1[[A, asm, ...]]' -> ('Ns.ListReader', ['A'])
    i = name.find('`')
    if i < 0: return name.split(',')[0].strip(), []
    args, depth, cur = [], 0, ''
    for ch in name[name.index('[', i):]:
        if ch == '[':
            depth += 1
            if depth == 2: cur = ''; continue
        elif ch == ']':
            depth -= 1
            if depth == 1: args.append(cur.split(',')[0].strip()); continue
            if depth == 0: break
        if depth >= 2: cur += ch
    return name[:i], args

class Reader:
    def __init__(self, data, big):
        self.d, self.p, self.E = data, 0, '>' if big else '<'
        self.readers, self.shared = [], []

    def u8(self): v = self.d[self.p]; self.p += 1; return v
    def bool(self): return self.u8() != 0
    def num(self, f, n):
        v = struct.unpack_from(self.E + f, self.d, self.p)[0]; self.p += n; return v
    def i32(self): return self.num('i', 4)
    def u32(self): return self.num('I', 4)
    def i64(self): return self.num('q', 8)
    def f32(self): return self.num('f', 4)
    def f32s(self, n):
        v = struct.unpack_from(self.E + '%df' % n, self.d, self.p); self.p += 4 * n; return list(v)
    def raw(self, n):
        if self.p + n > len(self.d): raise ValueError(f'read of {n} bytes past the end at {self.p}')
        v = self.d[self.p:self.p + n]; self.p += n; return v
    def v7(self):
        r = s = 0
        while True:
            b = self.u8(); r |= (b & 0x7F) << s; s += 7
            if not b & 0x80: return r
    def str(self):
        n = self.v7(); return self.raw(n).decode('utf-8', 'replace')

    def obj(self):
        t = self.v7()
        if t == 0: return None
        if t > len(self.readers): raise ValueError(f'type id {t} of {len(self.readers)} at {self.p}')
        return self.read(self.readers[t - 1])

    def read(self, full):
        base, args = generic(full)
        f = READERS.get(base)
        if not f: raise ValueError('no reader for ' + full.split(',')[0])
        return f(self, args)

    def elem(self, tname):
        f = RAW.get(tname)
        return f(self) if f else self.obj()

RAW = {
    'Microsoft.Xna.Framework.Matrix': lambda r: r.f32s(16),
    'Microsoft.Xna.Framework.Vector2': lambda r: r.f32s(2),
    'Microsoft.Xna.Framework.Vector3': lambda r: r.f32s(3),
    'Microsoft.Xna.Framework.Vector4': lambda r: r.f32s(4),
    'Microsoft.Xna.Framework.Quaternion': lambda r: r.f32s(4),
    'Microsoft.Xna.Framework.Color': lambda r: r.u32(),
    'Microsoft.Xna.Framework.BoundingSphere': lambda r: r.f32s(4),
    'Microsoft.Xna.Framework.BoundingBox': lambda r: r.f32s(6),
    'System.Int32': lambda r: r.i32(), 'System.UInt32': lambda r: r.u32(), 'System.Single': lambda r: r.f32(),
    'System.Boolean': lambda r: r.bool(), 'System.Byte': lambda r: r.u8(), 'System.Int64': lambda r: r.i64(),
    'System.TimeSpan': lambda r: r.i64(), 'System.Double': lambda r: r.num('d', 8),
}

def read_dict(r, a):
    n = r.i32()
    out = {}
    for i in range(n):
        k = r.elem(a[0]); v = r.elem(a[1])
        out[k if isinstance(k, (str, int, float)) else f'#{i}'] = v
    return out

def read_vdecl(r, a=None):
    stride, n = r.u32(), r.u32()
    return {'stride': stride, 'elements': [{'off': r.u32(), 'fmt': r.i32(), 'use': r.i32(), 'idx': r.u32()} for _ in range(n)]}

def read_vb(r, a):
    decl = read_vdecl(r)
    n = r.u32()
    return {'decl': decl, 'count': n, 'data': r.raw(n * decl['stride'])}

def read_ib(r, a):
    sixteen = r.bool()
    return {'sixteen': sixteen, 'data': r.raw(r.u32())}

def read_model(r, a):
    nb = r.u32()
    bones = [{'name': r.obj(), 'm': r.f32s(16)} for _ in range(nb)]
    def ref():
        i = r.u8() if nb < 255 else r.u32()
        return i - 1 if i else None
    for b in bones:
        b['parent'] = ref()
        b['children'] = [ref() for _ in range(r.u32())]
    meshes = []
    for _ in range(r.u32()):
        mesh = {'name': r.obj(), 'bone': ref(), 'sphere': r.f32s(4), 'tag': r.obj(), 'parts': []}
        for _ in range(r.u32()):
            part = {'vertexOffset': r.u32(), 'vertices': r.u32(), 'startIndex': r.u32(), 'primitives': r.u32(), 'tag': r.obj()}
            part['vb'], part['ib'], part['effect'] = r.v7(), r.v7(), r.v7()
            mesh['parts'].append(part)
        meshes.append(mesh)
    return {'bones': bones, 'meshes': meshes, 'root': ref(), 'tag': r.obj()}

def read_tex2d(r, a):
    fmt, w, h, levels = r.i32(), r.u32(), r.u32(), r.u32()
    return {'fmt': fmt, 'w': w, 'h': h, 'mips': [r.raw(r.u32()) for _ in range(levels)]}

def read_skeleton(r, a):
    return [{'name': r.str(), 'parent': r.i32(), 'm': r.f32s(16)} for _ in range(r.i32())]

def read_clip(r, a):
    c = {'name': r.str(), 'fps': r.i32(), 'ticks': r.i64(), 'bones': []}
    for _ in range(r.i32()):
        pos = [r.f32s(3) for _ in range(r.i32())]
        rot = [r.f32s(4) for _ in range(r.i32())]
        scl = [r.f32s(3) for _ in range(r.i32())]
        c['bones'].append({'pos': pos, 'rot': rot, 'scale': scl})
    return c

# XNA's ReflectiveReader writes base-class members first, then the class's own, in declaration order
REFLECTIVE = {
    'DNA.Drawing.Animation.AnimationData': lambda r: {'clips': r.obj()},
    'DNA.Drawing.Animation.SkinedAnimationData': lambda r: {'clips': r.obj(), 'inverseBindPose': r.obj(), 'skeleton': r.obj()},
}

def read_reflective(r, a):
    f = REFLECTIVE.get(a[0])
    if not f: raise ValueError('no layout for reflective type ' + a[0])
    return f(r)

C = 'Microsoft.Xna.Framework.Content.'
# DigitalDNA's own effect (DNA.Drawing.Effects.DNAEffect+Reader): the effect file, its textures by
# parameter name, then each other parameter as a type code (0 int, 1 string, 2 bool, 3 float,
# 4-6 vectors, 7 matrix) and a count (0: one value, else an array)
def read_dna_effect(r, a):
    out = {'dnaEffect': r.str(), 'textures': {}, 'params': {}}
    for _ in range(r.i32()):
        name = r.str()
        out['textures'][name] = r.str()
    one = [r.i32, r.str, r.bool, r.f32, lambda: r.f32s(2), lambda: r.f32s(3), lambda: r.f32s(4), lambda: r.f32s(16)]
    for _ in range(r.i32()):
        name, t, n = r.str(), r.u8(), r.i32()
        if t >= len(one): raise ValueError(f'DNAEffect parameter {name}: type {t}')
        out['params'][name] = one[t]() if n == 0 else [one[t]() for _ in range(n)]
    # the diffuse map, for whatever draws it as a plain textured model
    tex = out['textures']
    out['texture'] = next((v for k, v in tex.items() if 'diffuse' in k.lower()), next(iter(tex.values()), ''))
    return out

# DigitalDNA's sprite sheet (DNA.Drawing.SpriteManager+SpriteManagerReader): the texture, then
# each sprite's name and rectangle on it (x, y, width, height)
def read_sprites(r, a):
    tex = r.obj()
    sprites = {}
    for _ in range(r.i32()):
        name = r.str()
        sprites[name] = [r.i32(), r.i32(), r.i32(), r.i32()]
    return {'texture': tex, 'sprites': sprites}

READERS = {
    C + 'StringReader': lambda r, a: r.str(),
    C + 'Int32Reader': lambda r, a: r.i32(),
    C + 'SingleReader': lambda r, a: r.f32(),
    C + 'BooleanReader': lambda r, a: r.bool(),
    C + 'MatrixReader': lambda r, a: r.f32s(16),
    C + 'Vector3Reader': lambda r, a: r.f32s(3),
    C + 'QuaternionReader': lambda r, a: r.f32s(4),
    C + 'TimeSpanReader': lambda r, a: r.i64(),
    C + 'ListReader': lambda r, a: [r.elem(a[0]) for _ in range(r.i32())],
    C + 'ArrayReader': lambda r, a: [r.elem(a[0]) for _ in range(r.i32())],
    C + 'DictionaryReader': read_dict,
    C + 'ReflectiveReader': read_reflective,
    C + 'ModelReader': read_model,
    C + 'VertexDeclarationReader': read_vdecl,
    C + 'VertexBufferReader': read_vb,
    C + 'IndexBufferReader': read_ib,
    C + 'BasicEffectReader': lambda r, a: {'texture': r.str(), 'diffuse': r.f32s(3), 'emissive': r.f32s(3), 'specular': r.f32s(3),
                                           'power': r.f32(), 'alpha': r.f32(), 'vertexColor': r.bool()},
    C + 'SkinnedEffectReader': lambda r, a: {'texture': r.str(), 'weights': r.i32(), 'diffuse': r.f32s(3), 'emissive': r.f32s(3),
                                             'specular': r.f32s(3), 'power': r.f32(), 'alpha': r.f32()},
    C + 'EffectReader': lambda r, a: {'effectCode': len(r.raw(r.u32()))},
    C + 'EffectMaterialReader': lambda r, a: {'effect': r.str(), 'params': r.obj()},
    C + 'Texture2DReader': read_tex2d,
    C + 'ExternalReferenceReader': lambda r, a: {'external': r.str()},
    'DNA.Drawing.Skeleton+Reader': read_skeleton,
    'DNA.Drawing.Effects.DNAEffect+Reader': read_dna_effect,
    'DNA.Drawing.Animation.AnimationClip+Reader': read_clip,
    'DNA.Drawing.SpriteManager+SpriteManagerReader': read_sprites,
}

def parse(x, big=None):
    # Xbox 360 content stores numbers big-endian; try that first, then little-endian
    errs = []
    for b in ([big] if big is not None else [x['platform'] == 'x', x['platform'] != 'x']):
        r = Reader(x['data'], b)
        try:
            readers = [None] * r.v7()
            for i in range(len(readers)):
                readers[i] = r.str(); r.i32()
            r.readers = readers
            nshared = r.v7()
            obj = r.obj()
            shared = [r.obj() for _ in range(nshared)]
            return {'big': b, 'readers': readers, 'object': obj, 'shared': shared, 'end': r.p, 'size': len(x['data'])}
        except Exception as e:
            errs.append((b, str(e), r.p))
    return {'errors': errs, 'readers': getattr(r, 'readers', [])}

# ---- textures ----------------------------------------------------------------------------------------

def swap16(b):
    a = array('H', b[:len(b) & ~1]); a.byteswap(); return a.tobytes()

def swap32(b):
    a = array('I', b[:len(b) & ~3]); a.byteswap(); return a.tobytes()

def tiled_offset(x, y, w, log_bpb):
    # where block (x, y) sits in an Xbox 360 tiled surface w blocks wide
    aw = (w + 31) & ~31
    macro = ((x >> 5) + (y >> 5) * (aw >> 5)) << (log_bpb + 7)
    micro = ((x & 7) + ((y & 0xE) << 2)) << log_bpb
    off = macro + ((micro & ~0xF) << 1) + (micro & 0xF) + ((y & 1) << 4)
    return (((off & ~0x1FF) << 3) + ((y & 16) << 7) + ((off & 0x1C0) << 2) + (((((y & 8) >> 2) + (x >> 3)) & 3) << 6) + (off & 0x3F)) >> log_bpb

def untile(data, wb, hb, bpb):
    log = {1: 0, 2: 1, 4: 2, 8: 3, 16: 4}[bpb]
    out = bytearray(wb * hb * bpb)
    for y in range(hb):
        for x in range(wb):
            s = tiled_offset(x, y, wb, log) * bpb
            if s + bpb <= len(data):
                o = (y * wb + x) * bpb
                out[o:o + bpb] = data[s:s + bpb]
    return bytes(out)

def rgb565(c):
    r, g, b = (c >> 11) & 31, (c >> 5) & 63, c & 31
    return (r << 3 | r >> 2, g << 2 | g >> 4, b << 3 | b >> 2)

def decode_dxt(data, w, h, fmt):
    # fmt: 4 = DXT1, 5 = DXT3, 6 = DXT5 (XNA's SurfaceFormat numbers); data is little-endian
    bw, bh = (w + 3) // 4, (h + 3) // 4
    bs = 8 if fmt == 4 else 16
    out = bytearray(w * h * 4)
    for by in range(bh):
        for bx in range(bw):
            o = (by * bw + bx) * bs
            if o + bs > len(data): continue
            alpha = None
            if fmt == 5:
                bits = struct.unpack_from('<Q', data, o)[0]
                alpha = [((bits >> (4 * k)) & 15) * 17 for k in range(16)]
            elif fmt == 6:
                a0, a1 = data[o], data[o + 1]
                bits = int.from_bytes(data[o + 2:o + 8], 'little')
                if a0 > a1: pal = [a0, a1] + [((7 - k) * a0 + k * a1) // 7 for k in range(1, 7)]
                else: pal = [a0, a1] + [((5 - k) * a0 + k * a1) // 5 for k in range(1, 5)] + [0, 255]
                alpha = [pal[(bits >> (3 * k)) & 7] for k in range(16)]
            c0, c1, idx = struct.unpack_from('<HHI', data, o + bs - 8)
            a, b = rgb565(c0), rgb565(c1)
            if c0 > c1 or fmt != 4:
                cols = [a + (255,), b + (255,), tuple((2 * x + y) // 3 for x, y in zip(a, b)) + (255,), tuple((x + 2 * y) // 3 for x, y in zip(a, b)) + (255,)]
            else:
                cols = [a + (255,), b + (255,), tuple((x + y) // 2 for x, y in zip(a, b)) + (255,), (0, 0, 0, 0)]
            for k in range(16):
                x, y = bx * 4 + (k & 3), by * 4 + (k >> 2)
                if x < w and y < h:
                    c = cols[(idx >> (2 * k)) & 3]
                    p = (y * w + x) * 4
                    out[p:p + 4] = bytes((c[0], c[1], c[2], c[3] if alpha is None else alpha[k]))
    return bytes(out)

def write_png(path, w, h, rgba):
    raw = b''.join(b'\0' + rgba[y * w * 4:(y + 1) * w * 4] for y in range(h))
    def chunk(t, b): return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xFFFFFFFF)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                           + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b''))

def texture_rgba(t, tiled, swap):
    # the top mip as RGBA; the Xbox stores 16-bit words byte-swapped and may tile the surface
    w, h, fmt, data = t['w'], t['h'], t['fmt'], t['mips'][0]
    if fmt in (4, 5, 6):
        if swap: data = swap16(data)
        bw, bh = (w + 3) // 4, (h + 3) // 4
        if tiled: data = untile(data, bw, bh, 8 if fmt == 4 else 16)
        return decode_dxt(data, w, h, fmt)
    if fmt == 0:
        if tiled: data = untile(data, w, h, 4)
        if swap: data = swap32(data)  # an ARGB word stored big-endian
        return bytes(data[:w * h * 4])
    raise ValueError(f'texture format {fmt}')

# ---- survey: what is in the files, so the ripper can be written against it ----------------------------

def summary(v, depth=0):
    if isinstance(v, dict):
        if depth > 5: return '{...}'
        return '{' + ', '.join(f'{k}: {summary(x, depth + 1)}' for k, x in v.items()) + '}'
    if isinstance(v, list):
        if len(v) > 6: return '[' + ', '.join(summary(x, depth + 1) for x in v[:3]) + f', ... ({len(v)})]'
        return '[' + ', '.join(summary(x, depth + 1) for x in v) + ']'
    if isinstance(v, (bytes, bytearray)): return f'<{len(v)} bytes>'
    if isinstance(v, float): return f'{v:.4g}'
    return repr(v)

FORMATS = ['Single', 'Vector2', 'Vector3', 'Vector4', 'Color', 'Byte4', 'Short2', 'Short4', 'NShort2', 'NShort4', 'HalfVector2', 'HalfVector4']
USAGES = ['Position', 'Color', 'TexCoord', 'Normal', 'Binormal', 'Tangent', 'BlendIndices', 'BlendWeight', 'Depth', 'Fog', 'PointSize', 'Sample', 'Tessellate']

def survey(content, report, pngdir):
    os.makedirs(pngdir, exist_ok=True)
    picks = []
    for root, dirs, files in os.walk(content):
        for f in sorted(files):
            rel = os.path.relpath(os.path.join(root, f), content)
            if not f.endswith('.xnb'): continue
            if rel.startswith('Enemies') or f in ('Shadow.xnb', 'Knife.xnb') or (rel.startswith('AvatarAnimation') and f in ('Walk.xnb', 'Run.xnb', 'FPSIdle.xnb', 'GenericWalk.xnb')):
                picks.append(rel)
    with open(report, 'w') as out:
        for rel in sorted(picks):
            out.write(f'\n=== {rel}\n')
            try:
                x = read_xnb(os.path.join(content, rel))
            except Exception as e:
                out.write(f'  xnb error: {e}\n'); continue
            out.write(f"  platform {x['platform']} v{x['version']} flags {x['flags']:#x} packed {x['packed']} size {len(x['data'])}\n")
            p = parse(x)
            for rd in p.get('readers') or []: out.write(f'  reader {rd[:160]}\n')
            if 'errors' in p:
                for b, e, at in p['errors']:
                    out.write(f"  parse ({'BE' if b else 'LE'}) failed at {at}: {e}\n")
                    out.write('    ' + x['data'][max(0, at - 32):at + 96].hex() + '\n')
                continue
            out.write(f"  parsed {'BE' if p['big'] else 'LE'}, used {p['end']} of {p['size']} bytes\n")
            o = p['object']
            if isinstance(o, dict) and 'meshes' in o:
                out.write(f"  bones {len(o['bones'])}: " + ', '.join(f"{b['name']}<{b['parent']}" for b in o['bones'][:80]) + '\n')
                for m in o['meshes']:
                    out.write(f"  mesh {m['name']} bone {m['bone']} sphere {summary(m['sphere'])} parts {summary(m['parts'])}\n")
                for i, s in enumerate(p['shared']):
                    if isinstance(s, dict) and 'decl' in s:
                        els = ', '.join(f"{USAGES[e['use']] if e['use'] < len(USAGES) else e['use']}{e['idx']}:{FORMATS[e['fmt']] if e['fmt'] < len(FORMATS) else e['fmt']}@{e['off']}" for e in s['decl']['elements'])
                        out.write(f"  shared {i + 1}: vertices {s['count']} stride {s['decl']['stride']} [{els}]\n")
                        out.write(f"    first vertex {s['data'][:s['decl']['stride']].hex()}\n")
                    elif isinstance(s, dict) and 'sixteen' in s:
                        out.write(f"  shared {i + 1}: indices 16bit={s['sixteen']} bytes {len(s['data'])} first {s['data'][:12].hex()}\n")
                    else:
                        out.write(f'  shared {i + 1}: {summary(s)[:400]}\n')
                tag = o['tag']
                if isinstance(tag, dict):
                    clips = tag.get('clips') or {}
                    out.write(f"  tag: {len(clips)} clips\n")
                    for k, c in clips.items():
                        b0 = c['bones'][0] if c['bones'] else {}
                        out.write(f"    clip {k}: fps {c['fps']} seconds {c['ticks'] / 1e7:.3f} bones {len(c['bones'])} keys(bone0) {len(b0.get('pos', []))}/{len(b0.get('rot', []))}/{len(b0.get('scale', []))}\n")
                    sk = tag.get('skeleton') or []
                    out.write(f"  skeleton {len(sk)}: " + ', '.join(f"{b['name']}<{b['parent']}" for b in sk) + '\n')
                    ibp = tag.get('inverseBindPose') or []
                    out.write(f"  inverse bind poses {len(ibp)}; first {summary(ibp[:1])}\n")
                else:
                    out.write(f'  tag {summary(tag)[:600]}\n')
            elif isinstance(o, dict) and 'mips' in o:
                out.write(f"  texture fmt {o['fmt']} {o['w']}x{o['h']} mips {len(o['mips'])} top {len(o['mips'][0])} bytes\n")
                base = os.path.join(pngdir, rel.replace(os.sep, '_')[:-4])
                for tiled in (False, True):
                    for swap in (False, True):
                        try:
                            write_png(f'{base}_t{int(tiled)}s{int(swap)}.png', o['w'], o['h'], texture_rgba(o, tiled, swap))
                        except Exception as e:
                            out.write(f'    png t{int(tiled)}s{int(swap)}: {e}\n')
            else:
                out.write(f'  object {summary(o)[:1500]}\n')
                if p['shared']: out.write(f"  shared {summary(p['shared'])[:600]}\n")

if __name__ == '__main__':
    if sys.argv[1] == 'survey': survey(sys.argv[2], sys.argv[3], sys.argv[4])
