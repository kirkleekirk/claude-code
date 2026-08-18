"""Minimal PNG writer.

Kept dependency-free on purpose: the art for this game is generated, not authored,
so the build should not need Pillow or any other package to reproduce it.
"""

import struct
import zlib


def write_png(path, width, height, pixels):
    """pixels: flat bytearray of RGBA, length width*height*4."""
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # filter type 0 (None)
        raw.extend(pixels[y * stride:(y + 1) * stride])

    def chunk(tag, data):
        out = struct.pack('>I', len(data)) + tag + data
        return out + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', header))
        f.write(chunk(b'IDAT', zlib.compress(bytes(raw), 9))) 
        f.write(chunk(b'IEND', b''))


class Canvas(object):
    """Flat RGBA image with the handful of primitives the tile art needs."""

    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.data = bytearray(width * height * 4)

    def set(self, x, y, r, g, b, a=255):
        if x < 0 or y < 0 or x >= self.width or y >= self.height:
            return
        i = (y * self.width + x) * 4
        self.data[i] = max(0, min(255, int(r)))
        self.data[i + 1] = max(0, min(255, int(g)))
        self.data[i + 2] = max(0, min(255, int(b)))
        self.data[i + 3] = max(0, min(255, int(a)))

    def get(self, x, y):
        i = (y * self.width + x) * 4
        return self.data[i], self.data[i + 1], self.data[i + 2], self.data[i + 3]

    def rect(self, x0, y0, w, h, colour):
        for y in range(y0, y0 + h):
            for x in range(x0, x0 + w):
                self.set(x, y, *colour)


class Rng(object):
    """Deterministic xorshift, so regenerating the atlas gives byte-identical output."""

    def __init__(self, seed):
        self.state = seed & 0xFFFFFFFF or 0x9E3779B9

    def next(self):
        s = self.state
        s ^= (s << 13) & 0xFFFFFFFF
        s ^= s >> 17
        s ^= (s << 5) & 0xFFFFFFFF
        self.state = s
        return s

    def rand(self):
        return (self.next() >> 8) / 16777216.0

    def between(self, lo, hi):
        return lo + (hi - lo) * self.rand()
