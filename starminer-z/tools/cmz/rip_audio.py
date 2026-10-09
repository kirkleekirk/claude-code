# Rips CastleMiner Z's audio from your own copy of the game: the XACT wave banks (sound effects
# in Sounds.xwb; music and ambience in SoundsStreaming.xwb, which is WMA) decoded with ffmpeg,
# and the sound bank (Sounds.xsb), which names each cue and says which waves it plays, how loud,
# at what pitch, and how it picks between variations. Writes <out>/<bank>_<n>.mp3 and
# <out>/index.json (plus xsb-debug.txt, the raw cue records, for checking the parse).
# The ripped files are DigitalDNA's: they stay in local-assets/, which git ignores.
#
#   python3 tools/cmz/rip_audio.py <extracted Content folder> <out folder>
import json, os, struct, subprocess, sys, tempfile
from array import array

def u16(d, o, E): return struct.unpack_from(E + 'H', d, o)[0]
def i16(d, o, E): return struct.unpack_from(E + 'h', d, o)[0]
def u32(d, o, E): return struct.unpack_from(E + 'I', d, o)[0]
def f32(d, o, E): return struct.unpack_from(E + 'f', d, o)[0]

# XACT keeps a volume as a byte on a curve: 0 is -96 dB, 180 is 0 dB, 255 is +6 dB
def decibels(b):
    return round((-96.0 - 67.7385212334047) / (1 + (b / 80.1748600297963) ** 0.432254984608615) + 67.7385212334047, 2)

# ---- wave banks -------------------------------------------------------------------------------

WMA_BYTES_PER_SEC = [12000, 24000, 4000, 6000, 8000, 20000, 2500]
WMA_BLOCK_ALIGN = [929, 1487, 1280, 2230, 8917, 8192, 4459, 5945, 2304, 1536, 1485, 1008, 2731, 4096, 6827, 5462, 1280]

def read_xwb(path):
    d = open(path, 'rb').read()
    E = '>' if d[:4] == b'DNBW' else '<'
    ver = u32(d, 4, E)
    regs = [(u32(d, 12 + 8 * i, E), u32(d, 16 + 8 * i, E)) for i in range(5)]
    bo = regs[0][0]
    count = u32(d, bo + 4, E)
    name = d[bo + 8:bo + 72].split(b'\0')[0].decode()
    esize = u32(d, bo + 72, E)
    meta_o, data_o = regs[1][0], regs[4][0]
    entries = []
    for i in range(count):
        fd, fmt, po, pl, ls, ll = struct.unpack_from(E + 'IIIIII', d, meta_o + i * esize)
        # MINIWAVEFORMAT: tag 2 bits, channels 3, rate 18, block align 8, bits-per-sample flag 1
        entries.append({'i': i, 'tag': ['pcm', 'xma', 'adpcm', 'wma'][fmt & 3], 'ch': (fmt >> 2) & 7,
                        'rate': (fmt >> 5) & 0x3FFFF, 'align': (fmt >> 23) & 0xFF, 'hi': (fmt >> 31) & 1,
                        'samples': fd >> 4, 'data': d[data_o + po:data_o + po + pl], 'loop': (ls, ll), 'E': E})
    return name, ver, entries

# a RIFF container ffmpeg can read: WAVE for PCM, XWMA for WMA
def container(e, wma_tag=0x161):
    ch, rate, data = e['ch'], e['rate'], e['data']
    if e['tag'] == 'pcm':
        bits = 16 if e['hi'] else 8
        ba = ch * bits // 8
        fmt = struct.pack('<HHIIHH', 1, ch, rate, rate * ba, ba, bits)
        if bits == 16 and e['E'] == '>':
            a = array('h', data[:len(data) & ~1]); a.byteswap(); data = a.tobytes()
        form = b'WAVE'
    elif e['tag'] == 'wma':
        ba = WMA_BLOCK_ALIGN[min(e['align'] & 0x1F, len(WMA_BLOCK_ALIGN) - 1)]
        bps = WMA_BYTES_PER_SEC[min(e['align'] >> 5, len(WMA_BYTES_PER_SEC) - 1)]
        fmt = struct.pack('<HHIIHHH', wma_tag, ch, rate, bps, ba, 16, 0)
        form = b'XWMA'
    else:
        raise ValueError('unsupported wave format ' + e['tag'])
    body = b'fmt ' + struct.pack('<I', len(fmt)) + fmt + b'data' + struct.pack('<I', len(data)) + data
    return b'RIFF' + struct.pack('<I', 4 + len(body)) + form + body

# ---- the sound bank -----------------------------------------------------------------------------

def read_xsb(path, debug):
    d = open(path, 'rb').read()
    E = '>' if d[:4] == b'KBDS' else '<'
    nsimple, ncomplex = u16(d, 19, E), u16(d, 21, E)
    nbanks = d[27]
    namelen = u32(d, 30, E)  # 32 bits: the Xbox file shows it, 00 00 02 ad
    simple_o, complex_o, names_o = u32(d, 34, E), u32(d, 38, E), u32(d, 42, E)
    bankname_o = u32(d, 58, E)
    banks = [d[bankname_o + 64 * i:bankname_o + 64 * (i + 1)].split(b'\0')[0].decode() for i in range(nbanks)]
    names = [n.decode('utf-8', 'replace') for n in d[names_o:names_o + namelen].split(b'\0')]

    def wave(bank, track, w=1):
        return {'bank': banks[bank] if bank < len(banks) else bank, 'track': track, 'w': w}

    # the events of a clip: which waves play, when, and with what variation
    def clip(o, vol):
        out = []
        n = d[o]; q = o + 1
        for _ in range(n):
            info = u32(d, q, E); q += 6  # event info, random offset
            ev, t = info & 0x1F, ((info >> 5) & 0xFFFF) / 1000
            if ev == 1:
                out.append({'t': t, 'loop': d[q + 5], 'vol': vol, 'waves': [wave(d[q + 4], u16(d, q + 2, E))]})
                q += 10
            elif ev == 3:
                # the variation list starts 15 bytes in (MonoGame's 16 is one too many for this
                # version: its tracks come out a byte late, 0x7700 for track 0x77)
                nt = u16(d, q + 7, E)
                ev3 = {'t': t, 'loop': d[q + 2], 'vol': vol, 'pick': d[q + 9], 'raw': d[q:q + 15].hex(), 'waves': []}
                q += 15
                for _ in range(nt):
                    ev3['waves'].append(wave(d[q + 2], u16(d, q, E), d[q + 4] - d[q + 3])); q += 5
                out.append(ev3)
            elif ev == 4:
                out.append({'t': t, 'loop': d[q + 5], 'vol': vol, 'waves': [wave(d[q + 4], u16(d, q + 2, E))],
                            'pitch': [i16(d, q + 10, E) / 1000, i16(d, q + 12, E) / 1000],
                            'volume': [decibels(d[q + 14]), decibels(d[q + 15])]})
                q += 34
            elif ev == 6:
                nt = u16(d, q + 31, E)
                ev6 = {'t': t, 'loop': d[q + 2], 'vol': vol, 'pick': d[q + 33],
                       'pitch': [i16(d, q + 7, E) / 1000, i16(d, q + 9, E) / 1000],
                       'volume': [decibels(d[q + 11]), decibels(d[q + 12])], 'waves': []}
                q += 39  # as for event 3, one byte less than MonoGame's layout
                for _ in range(nt):
                    ev6['waves'].append(wave(d[q + 2], u16(d, q, E), d[q + 4] - d[q + 3])); q += 5
                out.append(ev6)
            elif ev == 8:
                q += 16  # a volume change: no waves
            else:
                break  # the other events carry no waves and their layouts vary
        return out

    def sound(o):
        flags = d[o]
        s = {'category': u16(d, o + 1, E), 'vol': decibels(d[o + 3]), 'pitch': i16(d, o + 4, E) / 1000, 'priority': d[o + 6]}
        q = o + 9
        if not flags & 1:
            s['events'] = [{'t': 0, 'loop': 0, 'vol': 0, 'waves': [wave(d[q + 2], u16(d, q, E))]}]
            return s
        nclips = d[q]; q += 1
        if flags & 0x0E: q += u16(d, q, E)  # RPC curves, length-prefixed
        if flags & 0x10: q += u16(d, q, E)  # DSP presets, likewise
        s['events'] = []
        for _ in range(nclips):
            s['events'] += clip(u32(d, q + 1, E), decibels(d[q])); q += 9
        return s

    cues = {}
    for i in range(nsimple):
        o = simple_o + i * 5
        nm = names[i] if i < len(names) else f'cue{i}'
        try: cues[nm] = {'sounds': [sound(u32(d, o + 1, E))], 'weights': [1], 'pick': 0, 'kind': 'sound'}
        except Exception as ex: cues[nm] = {'error': str(ex)}
        debug.write(f'{nm} simple {d[o:o + 5].hex()} -> {d[u32(d, o + 1, E):u32(d, o + 1, E) + 24].hex()}\n')
    for i in range(ncomplex):
        o = complex_o + i * 15
        nm = names[nsimple + i] if nsimple + i < len(names) else f'cue{nsimple + i}'
        flags, at = d[o], u32(d, o + 1, E)
        debug.write(f'{nm} complex {d[o:o + 15].hex()} -> {d[at:at + 40].hex()}\n')
        try:
            if flags & 4:
                cue = {'sounds': [sound(at)], 'weights': [1], 'pick': 0, 'kind': 'sound'}
            else:
                # entry count and flags: a pair of 16-bit fields the Xbox build stores as one
                # byte-swapped 32-bit word, so there the flags come first
                ne, vf = u16(d, at, E), u16(d, at + 2, E)
                if E == '>': ne, vf = vf, ne
                kind = (vf >> 3) & 7
                r = at + 8
                sounds, weights = [], []
                for _ in range(ne):
                    if kind == 0:
                        s = {'vol': 0, 'pitch': 0, 'events': [{'t': 0, 'loop': 0, 'vol': 0, 'waves': [wave(d[r + 2], u16(d, r, E))]}]}
                        w = d[r + 4] - d[r + 3]; r += 5
                    elif kind == 1:
                        s = sound(u32(d, r, E)); w = d[r + 5] - d[r + 4]; r += 6
                    elif kind == 3:
                        s = sound(u32(d, r, E)); w = [round(f32(d, r + 4, E), 3), round(f32(d, r + 8, E), 3)]; r += 16
                    elif kind == 4:
                        s = {'vol': 0, 'pitch': 0, 'events': [{'t': 0, 'loop': 0, 'vol': 0, 'waves': [wave(d[r + 2], u16(d, r, E))]}]}
                        w = 1; r += 3
                    else:
                        raise ValueError(f'variation table kind {kind}')
                    sounds.append(s); weights.append(w)
                cue = {'sounds': sounds, 'weights': weights, 'pick': vf & 7, 'kind': ['waves', 'sounds', '?', 'interactive', 'compact'][kind] if kind < 5 else kind, 'vflags': vf}
            cue['limit'] = d[o + 9]
            cues[nm] = cue
        except Exception as ex:
            cues[nm] = {'error': str(ex)}
    return banks, cues

# ---- main -------------------------------------------------------------------------------------------

def mp3_gapless(path):
    # The silence an MP3 decoder puts around the sound, from the Xing/LAME header in the first
    # frame: the encoder's delay (plus the decoder's own 529 samples) before it, and the
    # padding that fills out the last frame. Browsers don't all trim it, and a loop (the birds,
    # the crickets) would stutter on it, so the game trims it itself. Returns the samples of
    # lead-in, the whole decoded length (frames x samples per frame), and the frame length.
    d = open(path, 'rb').read(8192)
    p = 0
    if d[:3] == b'ID3':
        p = 10 + ((d[6] & 0x7f) << 21 | (d[7] & 0x7f) << 14 | (d[8] & 0x7f) << 7 | (d[9] & 0x7f))
    spf = 1152 if (struct.unpack('>I', d[p:p + 4])[0] >> 19) & 3 == 3 else 576
    i = next((k for k in (d.find(t, p, p + 64) for t in (b'Xing', b'Info')) if k >= 0), -1)
    if i < 0:
        return None
    flags = struct.unpack('>I', d[i + 4:i + 8])[0]
    q, frames = i + 8, None
    if flags & 1: frames = struct.unpack('>I', d[q:q + 4])[0]; q += 4
    if flags & 2: q += 4
    if flags & 4: q += 100
    if flags & 8: q += 4
    q += 9 + 1 + 1 + 8 + 1 + 1  # encoder, revision, lowpass, replay gain, flags, bitrate
    delay = (d[q] << 4) | (d[q + 1] >> 4)
    return {'lead': delay + 529, 'total': frames * spf if frames else None, 'spf': spf}

def main(content, out):
    os.makedirs(out, exist_ok=True)
    enc = subprocess.run(['ffmpeg', '-hide_banner', '-encoders'], capture_output=True, text=True).stdout
    codec, ext = ('libmp3lame', 'mp3') if 'libmp3lame' in enc else ('aac', 'm4a')
    index = {'format': ext, 'banks': {}, 'cues': {}}
    tmp = tempfile.mkdtemp()
    for fn in ['Sounds.xwb', 'SoundsStreaming.xwb']:
        name, ver, entries = read_xwb(os.path.join(content, fn))
        files = []
        for e in entries:
            src = os.path.join(tmp, f'{name}_{e["i"]}.riff')
            wav = os.path.join(tmp, f'{name}_{e["i"]}.wav')
            dst = f'{name}_{e["i"]:03d}.{ext}'
            q = ['-q:a', '4'] if codec == 'libmp3lame' else ['-b:a', '128k']
            err, samples, rate = None, None, e['rate']
            for tag in ([0x161, 0x162] if e['tag'] == 'wma' else [0]):
                try:
                    open(src, 'wb').write(container(e, tag))
                except Exception as ex:
                    err = str(ex); break
                # decoded first, so the exact length is known, then encoded
                r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-c:a', 'pcm_s16le', wav], capture_output=True, text=True)
                if r.returncode == 0:
                    w = open(wav, 'rb').read()
                    k = w.find(b'data')
                    ch, rate = struct.unpack('<H', w[22:24])[0], struct.unpack('<I', w[24:28])[0]
                    samples = (len(w) - k - 8) // (2 * ch)
                    r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-c:a', codec] + q + [os.path.join(out, dst)],
                                       capture_output=True, text=True)
                ok = r.returncode == 0 and os.path.getsize(os.path.join(out, dst)) > 0
                err = None if ok else r.stderr[-300:]
                if ok: break
            files.append({'file': None if err else dst, 'tag': e['tag'], 'ch': e['ch'], 'rate': rate,
                          'seconds': round(e['samples'] / max(1, e['rate']), 2), 'samples': samples,
                          'gapless': None if err or codec != 'libmp3lame' else mp3_gapless(os.path.join(out, dst)),
                          'loop': list(e['loop']), 'error': err})
        index['banks'][name] = files
        print(name, 'version', ver, 'entries', len(entries), 'formats', sorted({e['tag'] for e in entries}),
              'decoded', sum(1 for f in files if f['file']), 'errors', sorted({f['error'][:80] for f in files if f['error']})[:3])
    with open(os.path.join(out, 'xsb-debug.txt'), 'w') as dbg:
        banks, cues = read_xsb(os.path.join(content, 'Sounds.xsb'), dbg)
    index['cues'] = cues
    bad = [k for k, c in cues.items() if 'error' in c]
    print('sound bank', banks, 'cues', len(cues), 'unparsed', bad)
    json.dump(index, open(os.path.join(out, 'index.json'), 'w'), indent=1)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
