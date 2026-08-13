#!/usr/bin/env python3
"""Generate BUNKER '86 PWA icons with no third-party dependencies.

Writes a synthwave hazard-trefoil mark straight to PNG using zlib + struct,
so the repo needs neither Pillow nor a checked-in binary blob.

    python3 tools/make-icons.py
"""
import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")

BG_TOP = (8, 12, 22)
BG_BOT = (26, 10, 34)
GRID = (99, 247, 193)
TREFOIL = (255, 62, 165)
GLOW = (126, 232, 255)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def blend(dst, src, alpha):
    return tuple(round(dst[i] * (1 - alpha) + src[i] * alpha) for i in range(3))


def write_png(path, pixels, size):
    """pixels: list of rows, each a list of (r, g, b)."""
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type 0
        for r, g, b in row:
            raw += bytes((r, g, b))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


def render(size, inset=0.0):
    """inset: fraction of the canvas kept clear at the edges (for maskable)."""
    cx = cy = (size - 1) / 2.0
    art_r = (size / 2.0) * (1.0 - inset)
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            # vertical gradient ground
            col = lerp(BG_TOP, BG_BOT, y / (size - 1))

            dx, dy = x - cx, y - cy
            dist = math.hypot(dx, dy)
            ang = math.atan2(dy, dx)

            # perspective grid across the lower half
            if y > size * 0.60:
                depth = (y - size * 0.60) / (size * 0.40)
                spacing = max(2.0, 26.0 * (1.0 - depth) ** 2 + 3.0)
                if (y % max(2, int(spacing))) < 1.2:
                    col = blend(col, GRID, 0.22 * (1 - depth) + 0.06)
                conv = (x - cx) / max(1e-6, depth * size * 0.5)
                if abs((conv * 6) % 1.0) < 0.06:
                    col = blend(col, GRID, 0.16 * (1 - depth) + 0.04)

            # soft glow behind the mark
            g = max(0.0, 1.0 - dist / (art_r * 0.95))
            col = blend(col, GLOW, 0.20 * g * g)

            # radiation trefoil: three blades plus a hub
            r_in, r_out = art_r * 0.20, art_r * 0.66
            if dist <= r_in * 0.92:
                col = blend(col, TREFOIL, 1.0)
            elif r_in <= dist <= r_out:
                seg = (ang + math.pi) % (2 * math.pi / 3)
                half = (2 * math.pi / 3) * 0.30
                centre = (2 * math.pi / 3) / 2
                if abs(seg - centre) < half:
                    col = blend(col, TREFOIL, 1.0)
                elif abs(seg - centre) < half + 0.05:
                    col = blend(col, TREFOIL, 0.45)  # cheap edge softening

            # vignette
            v = min(1.0, dist / (size * 0.72))
            col = blend(col, (2, 3, 6), 0.55 * v * v)

            row.append(col)
        rows.append(row)
    return rows


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    jobs = [
        ("icon-192.png", 192, 0.06),
        ("icon-512.png", 512, 0.06),
        ("icon-maskable-512.png", 512, 0.22),  # keep the mark inside the safe zone
    ]
    for name, size, inset in jobs:
        path = os.path.normpath(os.path.join(OUT_DIR, name))
        write_png(path, render(size, inset), size)
        print("wrote", path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    main()
