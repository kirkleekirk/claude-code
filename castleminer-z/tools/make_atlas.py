#!/usr/bin/env python3
"""Generates the block and item atlases, and the particle sprite.

Tile indices here must stay in step with BlockRegistry (block atlas) and
ItemRegistry (icon atlas). Both atlases are 16x16 tiles of 16x16 texels, which
is what the shader's TILE_SIZE constant assumes.

Run:  python3 tools/make_atlas.py
Out:  content/Textures/{blocks,items,particle}.png
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from png import Canvas, Rng, write_png

TILE = 16
GRID = 16
SIZE = TILE * GRID


def noise_fill(canvas, ox, oy, base, spread, rng, alpha=255):
    for y in range(TILE):
        for x in range(TILE):
            n = rng.between(-spread, spread)
            canvas.set(ox + x, oy + y, base[0] + n, base[1] + n, base[2] + n, alpha)


def blobs(canvas, ox, oy, colour, count, radius, rng, jitter=18):
    for _ in range(count):
        cx = int(rng.between(1, TILE - 1))
        cy = int(rng.between(1, TILE - 1))
        r = rng.between(radius * 0.6, radius)
        for y in range(TILE):
            for x in range(TILE):
                dx = x - cx
                dy = y - cy
                if dx * dx + dy * dy <= r * r:
                    n = rng.between(-jitter, jitter)
                    canvas.set(ox + x, oy + y, colour[0] + n, colour[1] + n, colour[2] + n, 255)


def tile_origin(index):
    return (index % GRID) * TILE, (index // GRID) * TILE


# --------------------------------------------------------------------------
# Block atlas
# --------------------------------------------------------------------------

def build_blocks():
    c = Canvas(SIZE, SIZE)
    rng = Rng(1337)

    def at(index):
        return tile_origin(index)

    # 0 stone
    ox, oy = at(0)
    noise_fill(c, ox, oy, (128, 128, 132), 12, rng)

    # 1 dirt
    ox, oy = at(1)
    noise_fill(c, ox, oy, (134, 96, 67), 14, rng)

    # 2 grass top -- baked green, see BlockRegistry for why it is not tinted
    ox, oy = at(2)
    noise_fill(c, ox, oy, (99, 152, 70), 16, rng)

    # 3 grass side: dirt with a green lip
    ox, oy = at(3)
    noise_fill(c, ox, oy, (134, 96, 67), 14, rng)
    for y in range(4):
        for x in range(TILE):
            if y == 3 and rng.rand() < 0.45:
                continue
            n = rng.between(-16, 16)
            c.set(ox + x, oy + y, 99 + n, 152 + n, 70 + n, 255)

    # 4 cobblestone
    ox, oy = at(4)
    noise_fill(c, ox, oy, (110, 110, 114), 10, rng)
    blobs(c, ox, oy, (140, 140, 146), 7, 3.2, rng)
    blobs(c, ox, oy, (86, 86, 90), 5, 2.4, rng)

    # 5 sand
    ox, oy = at(5)
    noise_fill(c, ox, oy, (219, 207, 160), 10, rng)

    # 6 sandstone top
    ox, oy = at(6)
    noise_fill(c, ox, oy, (214, 200, 152), 8, rng)

    # 7 sandstone side: banded
    ox, oy = at(7)
    noise_fill(c, ox, oy, (214, 200, 152), 6, rng)
    for y in (3, 4, 10, 11):
        for x in range(TILE):
            c.set(ox + x, oy + y, 190, 176, 130, 255)

    # 8 gravel
    ox, oy = at(8)
    noise_fill(c, ox, oy, (126, 122, 120), 16, rng)
    blobs(c, ox, oy, (98, 94, 92), 8, 2.0, rng)

    # 9 snow
    ox, oy = at(9)
    noise_fill(c, ox, oy, (238, 242, 246), 8, rng)

    # 10 ice -- translucent
    ox, oy = at(10)
    noise_fill(c, ox, oy, (150, 196, 232), 10, rng, alpha=190)

    # 11 log top: rings
    ox, oy = at(11)
    noise_fill(c, ox, oy, (160, 126, 80), 8, rng)
    for y in range(TILE):
        for x in range(TILE):
            dx = x - 7.5
            dy = y - 7.5
            d = (dx * dx + dy * dy) ** 0.5
            if int(d) % 2 == 0:
                c.set(ox + x, oy + y, 128, 98, 60, 255)

    # 12 log side: vertical bark
    ox, oy = at(12)
    noise_fill(c, ox, oy, (108, 82, 50), 10, rng)
    for x in range(0, TILE, 3):
        for y in range(TILE):
            n = rng.between(-8, 8)
            c.set(ox + x, oy + y, 86 + n, 64 + n, 38 + n, 255)

    # 13 planks
    ox, oy = at(13)
    noise_fill(c, ox, oy, (172, 136, 86), 10, rng)
    for y in (0, 5, 10, 15):
        for x in range(TILE):
            c.set(ox + x, oy + y, 132, 100, 60, 255)

    # 14 leaves -- greyscale with gaps, tinted per biome in the shader
    ox, oy = at(14)
    for y in range(TILE):
        for x in range(TILE):
            if rng.rand() < 0.16:
                c.set(ox + x, oy + y, 0, 0, 0, 0)   # alpha-tested hole
            else:
                v = rng.between(150, 225)
                c.set(ox + x, oy + y, v, v, v * 0.94, 255)

    # 15 water -- translucent
    ox, oy = at(15)
    for y in range(TILE):
        for x in range(TILE):
            n = rng.between(-12, 12)
            c.set(ox + x, oy + y, 58 + n, 108 + n, 190 + n, 165)

    # 16 lava
    ox, oy = at(16)
    noise_fill(c, ox, oy, (208, 78, 20), 26, rng)
    blobs(c, ox, oy, (250, 176, 48), 6, 3.0, rng, jitter=24)

    # 17 bedrock
    ox, oy = at(17)
    noise_fill(c, ox, oy, (62, 62, 66), 18, rng)
    blobs(c, ox, oy, (34, 34, 38), 8, 2.6, rng)

    # 18..22 ores: stone with mineral blobs
    ores = [
        (18, (34, 34, 36)),      # coal
        (19, (196, 156, 118)),   # iron
        (20, (232, 198, 76)),    # gold
        (21, (108, 224, 224)),   # diamond
        (22, (196, 92, 226)),    # dragon stone
    ]
    for index, colour in ores:
        ox, oy = at(index)
        noise_fill(c, ox, oy, (128, 128, 132), 12, rng)
        blobs(c, ox, oy, colour, 5, 2.4, rng, jitter=14)

    # 23 torch -- mostly empty, alpha tested
    ox, oy = at(23)
    for y in range(TILE):
        for x in range(TILE):
            c.set(ox + x, oy + y, 0, 0, 0, 0)
    for y in range(6, TILE):
        for x in range(7, 10):
            n = rng.between(-10, 10)
            c.set(ox + x, oy + y, 122 + n, 88 + n, 52 + n, 255)
    for y in range(2, 7):
        for x in range(6, 11):
            if (x in (6, 10)) and y < 4:
                continue
            c.set(ox + x, oy + y, 252, int(rng.between(170, 220)), 60, 255)

    # 24 glass
    ox, oy = at(24)
    for y in range(TILE):
        for x in range(TILE):
            edge = x in (0, TILE - 1) or y in (0, TILE - 1)
            if edge:
                c.set(ox + x, oy + y, 210, 226, 236, 190)
            else:
                c.set(ox + x, oy + y, 200, 220, 232, 46)
    for i in range(3, 9):
        c.set(ox + i, oy + i - 1, 240, 248, 252, 150)

    # 25 stone brick
    ox, oy = at(25)
    noise_fill(c, ox, oy, (138, 138, 142), 8, rng)
    for y in (0, 8):
        for x in range(TILE):
            c.set(ox + x, oy + y, 96, 96, 100, 255)
    for y in range(1, 8):
        c.set(ox + 8, oy + y, 96, 96, 100, 255)
    for y in range(9, TILE):
        c.set(ox + 0, oy + y, 96, 96, 100, 255)

    # 26 obsidian
    ox, oy = at(26)
    noise_fill(c, ox, oy, (32, 24, 48), 12, rng)
    blobs(c, ox, oy, (58, 42, 84), 4, 2.0, rng)

    # 27 hell stone
    ox, oy = at(27)
    noise_fill(c, ox, oy, (120, 44, 36), 18, rng)
    blobs(c, ox, oy, (166, 66, 44), 6, 2.6, rng)

    # 28 explosive top
    ox, oy = at(28)
    noise_fill(c, ox, oy, (152, 60, 48), 8, rng)
    c.rect(ox + 6, oy + 6, 4, 4, (40, 40, 44, 255))

    # 29 explosive side
    ox, oy = at(29)
    noise_fill(c, ox, oy, (152, 60, 48), 8, rng)
    c.rect(ox, oy + 5, TILE, 6, (232, 226, 214, 255))
    for x in range(TILE):
        c.set(ox + x, oy + 5, 60, 60, 64, 255)
        c.set(ox + x, oy + 10, 60, 60, 64, 255)

    return c


# --------------------------------------------------------------------------
# Item icon atlas
# --------------------------------------------------------------------------

TIER_COLOURS = {
    'stone': (128, 128, 132),
    'iron': (206, 206, 212),
    'diamond': (108, 224, 224),
    'dragon': (196, 92, 226),
}


def clear_tile(c, ox, oy):
    for y in range(TILE):
        for x in range(TILE):
            c.set(ox + x, oy + y, 0, 0, 0, 0)


def draw_handle(c, ox, oy):
    for i in range(9):
        c.set(ox + 4 + i // 2, oy + 14 - i, 128, 92, 54, 255)
        c.set(ox + 5 + i // 2, oy + 14 - i, 108, 76, 44, 255)


def draw_pickaxe(c, ox, oy, colour):
    clear_tile(c, ox, oy)
    draw_handle(c, ox, oy)
    for x in range(2, 14):
        y = 4 + abs(x - 8) // 3
        c.set(ox + x, oy + y, *colour, a=255)
        c.set(ox + x, oy + y + 1, colour[0] - 24, colour[1] - 24, colour[2] - 24, 255)


def draw_axe(c, ox, oy, colour):
    clear_tile(c, ox, oy)
    draw_handle(c, ox, oy)
    for y in range(2, 9):
        width = 5 - abs(y - 5) // 2
        for x in range(8, 8 + width):
            c.set(ox + x, oy + y, *colour, a=255)


def draw_shovel(c, ox, oy, colour):
    clear_tile(c, ox, oy)
    draw_handle(c, ox, oy)
    for y in range(2, 7):
        for x in range(7, 12):
            c.set(ox + x, oy + y, *colour, a=255)


def draw_sword(c, ox, oy, colour):
    clear_tile(c, ox, oy)
    for i in range(9):
        c.set(ox + 4 + i, oy + 11 - i, *colour, a=255)
        c.set(ox + 5 + i, oy + 11 - i, colour[0] - 30, colour[1] - 30, colour[2] - 30, 255)
    for x in range(2, 7):
        c.set(ox + x, oy + 12, 120, 88, 52, 255)
    c.set(ox + 3, oy + 13, 96, 70, 42, 255)
    c.set(ox + 4, oy + 14, 96, 70, 42, 255)


def draw_gun(c, ox, oy, body, barrel_length, stock):
    clear_tile(c, ox, oy)
    c.rect(ox + 2, oy + 6, 9, 4, body)
    c.rect(ox + 10, oy + 7, barrel_length, 2, (48, 48, 52, 255))
    c.rect(ox + 3, oy + 10, 3, 4, (96, 70, 42, 255))
    if stock:
        c.rect(ox, oy + 7, 3, 3, (96, 70, 42, 255))


def draw_nugget(c, ox, oy, colour, rng):
    clear_tile(c, ox, oy)
    for y in range(4, 12):
        for x in range(4, 12):
            dx = x - 7.5
            dy = y - 7.5
            if dx * dx + dy * dy <= 15:
                n = rng.between(-18, 18)
                c.set(ox + x, oy + y, colour[0] + n, colour[1] + n, colour[2] + n, 255)


def build_items():
    c = Canvas(SIZE, SIZE)
    rng = Rng(0xBEEF)

    # 0 stick
    ox, oy = tile_origin(0)
    clear_tile(c, ox, oy)
    for i in range(10):
        c.set(ox + 5 + i // 3, oy + 13 - i, 132, 96, 56, 255)
        c.set(ox + 6 + i // 3, oy + 13 - i, 110, 78, 46, 255)

    draw_nugget(c, *tile_origin(1), colour=(40, 40, 44), rng=rng)      # coal
    draw_nugget(c, *tile_origin(2), colour=(214, 214, 220), rng=rng)   # iron ingot
    draw_nugget(c, *tile_origin(3), colour=(236, 200, 76), rng=rng)    # gold ingot
    draw_nugget(c, *tile_origin(4), colour=(112, 226, 226), rng=rng)   # diamond
    draw_nugget(c, *tile_origin(5), colour=(198, 96, 228), rng=rng)    # dragon stone
    draw_nugget(c, *tile_origin(6), colour=(88, 84, 92), rng=rng)      # gunpowder

    # 7 casing
    ox, oy = tile_origin(7)
    clear_tile(c, ox, oy)
    c.rect(ox + 6, oy + 4, 4, 8, (208, 168, 72, 255))
    c.rect(ox + 6, oy + 12, 4, 2, (170, 134, 56, 255))

    # 8..13 ammunition
    ammo = [
        (8, (208, 168, 72), 3, 7),     # pistol
        (9, (198, 62, 52), 4, 8),      # shells
        (10, (176, 150, 68), 3, 9),    # rifle
        (11, (150, 170, 190), 3, 10),  # sniper
        (12, (120, 120, 128), 6, 12),  # rocket
        (13, (120, 226, 226), 5, 9),   # laser cell
    ]
    for index, colour, width, height in ammo:
        ox, oy = tile_origin(index)
        clear_tile(c, ox, oy)
        x0 = 8 - width // 2
        y0 = 14 - height
        c.rect(ox + x0, oy + y0, width, height, colour + (255,))
        c.rect(ox + x0, oy + y0, width, 2, (min(255, colour[0] + 40),
                                           min(255, colour[1] + 40),
                                           min(255, colour[2] + 40), 255))

    tiers = ['stone', 'iron', 'diamond', 'dragon']

    for i, tier in enumerate(tiers):
        draw_pickaxe(c, *tile_origin(16 + i), colour=TIER_COLOURS[tier])
    for i, tier in enumerate(tiers):
        draw_axe(c, *tile_origin(20 + i), colour=TIER_COLOURS[tier])
    for i, tier in enumerate(tiers):
        draw_shovel(c, *tile_origin(24 + i), colour=TIER_COLOURS[tier])
    for i, tier in enumerate(tiers):
        draw_sword(c, *tile_origin(28 + i), colour=TIER_COLOURS[tier])

    draw_gun(c, *tile_origin(32), body=(56, 56, 62, 255), barrel_length=3, stock=False)   # pistol
    draw_gun(c, *tile_origin(33), body=(92, 62, 40, 255), barrel_length=5, stock=True)    # shotgun
    draw_gun(c, *tile_origin(34), body=(48, 52, 48, 255), barrel_length=5, stock=True)    # rifle
    draw_gun(c, *tile_origin(35), body=(40, 44, 52, 255), barrel_length=6, stock=True)    # sniper
    draw_gun(c, *tile_origin(36), body=(72, 72, 76, 255), barrel_length=6, stock=True)    # launcher
    draw_gun(c, *tile_origin(37), body=(132, 78, 168, 255), barrel_length=5, stock=True)  # laser

    return c


def build_thumbnail():
    """64x64 title thumbnail. Xbox Live Indie Games titles are required to ship one."""
    size = 64
    c = Canvas(size, size)
    rng = Rng(0xC0FFEE)

    for y in range(size):
        t = y / float(size)
        for x in range(size):
            c.set(x, y, 10 + 40 * t, 12 + 34 * t, 34 + 58 * t, 255)

    # Moon
    for y in range(6, 16):
        for x in range(44, 54):
            dx, dy = x - 49, y - 11
            if dx * dx + dy * dy <= 22:
                c.set(x, y, 228, 232, 240, 255)

    # Blocky horizon: grass lip, soil, then stone.
    heights = [38, 38, 37, 36, 36, 35, 35, 36, 37, 39, 40, 40, 39, 38, 38, 37]
    for col in range(16):
        top = heights[col]
        for y in range(top, size):
            for x in range(col * 4, col * 4 + 4):
                n = rng.between(-10, 10)
                if y == top:
                    c.set(x, y, 82 + n, 128 + n, 60 + n, 255)
                elif y < top + 4:
                    c.set(x, y, 108 + n, 78 + n, 52 + n, 255)
                else:
                    c.set(x, y, 96 + n, 96 + n, 100 + n, 255)

    # A seam of each headline ore, in tier order.
    for ox, oy, colour in ((10, 52, (108, 224, 224)),
                           (34, 56, (232, 198, 76)),
                           (52, 50, (198, 96, 228))):
        for y in range(oy, oy + 3):
            for x in range(ox, ox + 3):
                c.set(x, y, colour[0], colour[1], colour[2], 255)

    return c


def build_particle():
    """Soft round dot. Used for every billboard the particle system draws."""
    size = 16
    c = Canvas(size, size)
    for y in range(size):
        for x in range(size):
            dx = (x - 7.5) / 7.5
            dy = (y - 7.5) / 7.5
            d = (dx * dx + dy * dy) ** 0.5
            a = max(0.0, 1.0 - d)
            a = a * a
            c.set(x, y, 255, 255, 255, int(a * 255))
    return c


# Tiles this script actually draws. Written out as a manifest so the test suite can
# check that no registry entry points at a tile that does not exist -- that coupling
# has no compile-time check and the symptom is a block silently wearing the wrong
# texture.
BLOCK_TILES = list(range(0, 30))
ITEM_TILES = list(range(0, 14)) + list(range(16, 38))


def write_manifest(path):
    with open(path, 'w') as f:
        f.write('# Generated by tools/make_atlas.py -- do not edit.\n')
        f.write('# Tile indices drawn into each atlas.\n')
        f.write('tiles_per_row=%d\n' % GRID)
        f.write('blocks=%s\n' % ','.join(str(t) for t in BLOCK_TILES))
        f.write('items=%s\n' % ','.join(str(t) for t in ITEM_TILES))


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(here, 'content', 'Textures')
    os.makedirs(out, exist_ok=True)

    blocks = build_blocks()
    write_png(os.path.join(out, 'blocks.png'), SIZE, SIZE, blocks.data)

    items = build_items()
    write_png(os.path.join(out, 'items.png'), SIZE, SIZE, items.data)

    particle = build_particle()
    write_png(os.path.join(out, 'particle.png'), 16, 16, particle.data)

    write_manifest(os.path.join(out, 'atlas.manifest'))

    print('wrote blocks.png, items.png, particle.png, atlas.manifest to', out)

    thumbnail = build_thumbnail()
    thumb_dir = os.path.join(here, 'CastleMinerZ.Xbox360')
    if os.path.isdir(thumb_dir):
        write_png(os.path.join(thumb_dir, 'GameThumbnail.png'), 64, 64, thumbnail.data)
        print('wrote GameThumbnail.png to', thumb_dir)


if __name__ == '__main__':
    main()
