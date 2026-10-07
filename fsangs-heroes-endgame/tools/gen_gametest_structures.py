#!/usr/bin/env python3
"""Writes the GameTest structure templates (gzipped NBT) used by the mod's @GameTest methods.

  empty  - a 9x6x9 box: smooth stone floor, air above (room for a shooter, targets and a bench)
  range  - a 5x6x40 shooting lane with a floor, for range/falloff tests
"""
import gzip
import os
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "main", "resources", "data", "heroes_endgame", "structures")
DATA_VERSION = 3465  # 1.20.1


def tag_string(s):
    b = s.encode("utf-8")
    return struct.pack(">H", len(b)) + b


def named(tag_id, name, payload):
    return bytes([tag_id]) + tag_string(name) + payload


def int_tag(v):
    return struct.pack(">i", v)


def list_tag(elem_id, items):
    return bytes([elem_id]) + struct.pack(">i", len(items)) + b"".join(items)


def compound(entries):
    return b"".join(entries) + b"\x00"


def structure(sx, sy, sz, floor_block="minecraft:smooth_stone"):
    palette = [compound([named(8, "Name", tag_string(floor_block))])]
    blocks = []
    for x in range(sx):
        for z in range(sz):
            pos = list_tag(3, [int_tag(x), int_tag(0), int_tag(z)])
            blocks.append(compound([named(9, "pos", pos), named(3, "state", int_tag(0))]))
    root = compound([
        named(3, "DataVersion", int_tag(DATA_VERSION)),
        named(9, "size", list_tag(3, [int_tag(sx), int_tag(sy), int_tag(sz)])),
        named(9, "palette", list_tag(10, palette)),
        named(9, "blocks", list_tag(10, blocks)),
        named(9, "entities", list_tag(10, [])),
    ])
    return named(10, "", root)


def write(name, data):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".nbt")
    with gzip.GzipFile(path, "wb", mtime=0) as f:
        f.write(data)
    print("wrote", os.path.relpath(path))


if __name__ == "__main__":
    write("empty", structure(9, 6, 9))
    write("range", structure(5, 6, 40))
