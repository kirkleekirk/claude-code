#!/usr/bin/env python3
"""
Procedurally paints every texture Heroes Endgame ships with:
  * 64x64 player-format skins for each nemesis (+ optional *_glow.png emissive layers)
  * Dormammu's 128x64 head texture, the energy bolt sprite
  * 16x16 item icons and 18x18 mob effect icons

Run from the project root:  python3 tools/generate_textures.py
Requires Pillow (pip install pillow). Re-running overwrites the PNGs, so hand-painted replacements should be
saved under a different name or this script edited to skip them.
"""
import math
import os
import random

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "main", "resources", "assets", "heroes_endgame", "textures")
ENTITY = os.path.join(ROOT, "entity")
ITEM = os.path.join(ROOT, "item")
EFFECT = os.path.join(ROOT, "mob_effect")

for d in (ENTITY, ITEM, EFFECT):
    os.makedirs(d, exist_ok=True)


# =====================================================================================================================
# Colour helpers
# =====================================================================================================================

def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shade(c, f):
    """f > 1 lightens, f < 1 darkens."""
    if f >= 1:
        return tuple(min(255, int(v + (255 - v) * (f - 1))) for v in c[:3])
    return tuple(max(0, int(v * f)) for v in c[:3])


def mix(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


def jitter(c, amount, rnd):
    d = rnd.randint(-amount, amount)
    return tuple(max(0, min(255, v + d)) for v in c[:3])


# =====================================================================================================================
# Player skin layout (64x64, 1.8+ format). Each part: (u, v, w, h, d) = box texture origin and box size.
# Faces: top, bottom, right, front, left, back.
# =====================================================================================================================

def faces(u, v, w, h, d):
    return {
        "top": (u + d, v, w, d),
        "bottom": (u + d + w, v, w, d),
        "right": (u, v + d, d, h),
        "front": (u + d, v + d, w, h),
        "left": (u + d + w, v + d, d, h),
        "back": (u + d + w + d, v + d, w, h),
    }


def parts(slim=False):
    aw = 3 if slim else 4
    return {
        "head": faces(0, 0, 8, 8, 8), "hat": faces(32, 0, 8, 8, 8),
        "body": faces(16, 16, 8, 12, 4), "jacket": faces(16, 32, 8, 12, 4),
        "right_arm": faces(40, 16, aw, 12, 4), "right_sleeve": faces(40, 32, aw, 12, 4),
        "left_arm": faces(32, 48, aw, 12, 4), "left_sleeve": faces(48, 48, aw, 12, 4),
        "right_leg": faces(0, 16, 4, 12, 4), "right_pants": faces(0, 32, 4, 12, 4),
        "left_leg": faces(16, 48, 4, 12, 4), "left_pants": faces(0, 48, 4, 12, 4),
    }


SIDE_SHADE = {"top": 1.12, "bottom": 0.7, "right": 0.86, "front": 1.0, "left": 0.86, "back": 0.8}


class Skin:
    def __init__(self, name, slim=False, seed=None):
        self.name = name
        self.slim = slim
        self.img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        self.glow = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        self.p = parts(slim)
        self.rnd = random.Random(seed if seed is not None else name)
        self.has_glow = False

    # --- low level -------------------------------------------------------------------------------------------------
    def px(self, x, y, c, layer=None):
        img = layer or self.img
        if 0 <= x < 64 and 0 <= y < 64:
            img.putpixel((x, y), tuple(c[:3]) + ((c[3],) if len(c) > 3 else (255,)))

    def glow_px(self, x, y, c):
        self.has_glow = True
        self.px(x, y, c, self.glow)
        self.px(x, y, c)

    def rect(self, part, face, x0, y0, x1, y1, c, noise=6, glow=False):
        """Paint a rectangle in face-local coordinates (inclusive), with light shading per face."""
        fu, fv, fw, fh = self.p[part][face]
        for y in range(max(0, y0), min(fh - 1, y1) + 1):
            for x in range(max(0, x0), min(fw - 1, x1) + 1):
                col = shade(c, SIDE_SHADE[face]) if not glow else c
                col = jitter(col, noise, self.rnd) if noise else col
                if glow:
                    self.glow_px(fu + x, fv + y, col)
                else:
                    self.px(fu + x, fv + y, col)

    def fill(self, part, c, noise=6, faces_=None):
        for face, (fu, fv, fw, fh) in self.p[part].items():
            if faces_ and face not in faces_:
                continue
            self.rect(part, face, 0, 0, fw - 1, fh - 1, c, noise)

    def band(self, part, y0, y1, c, noise=5, faces_=("front", "right", "left", "back")):
        """Horizontal band across the side faces of a part (y in face-local coordinates)."""
        for face in faces_:
            fu, fv, fw, fh = self.p[part][face]
            self.rect(part, face, 0, y0, fw - 1, y1, c, noise)

    def vgrad(self, part, top, bottom, noise=5):
        """Vertical gradient over the side faces; top/bottom faces get the end colours."""
        for face, (fu, fv, fw, fh) in self.p[part].items():
            for y in range(fh):
                t = y / max(1, fh - 1)
                c = mix(top, bottom, t) if face not in ("top", "bottom") else (top if face == "top" else bottom)
                for x in range(fw):
                    self.px(fu + x, fv + y, jitter(shade(c, SIDE_SHADE[face]), noise, self.rnd))

    def save(self):
        self.img.save(os.path.join(ENTITY, self.name + ".png"))
        if self.has_glow:
            self.glow.save(os.path.join(ENTITY, self.name + "_glow.png"))

    # --- body helpers ----------------------------------------------------------------------------------------------
    def limbs(self, arm, leg, hand=None, boot=None, boot_h=3, glove_h=3):
        for a in ("right_arm", "left_arm"):
            self.fill(a, arm)
            if hand:
                self.band(a, 12 - glove_h, 11, hand)
                self.rect(a, "bottom", 0, 0, 3, 3, hand)
        for l in ("right_leg", "left_leg"):
            self.fill(l, leg)
            if boot:
                self.band(l, 12 - boot_h, 11, boot)
                self.rect(l, "bottom", 0, 0, 3, 3, boot)

    def face(self, skin, hair=None, eyes=(255, 255, 255), iris=(40, 40, 60), mouth=None, brows=None,
             hair_rows=1, beard=None, mustache=None, sideburns=True, glow_eyes=False):
        self.fill("head", skin, noise=4)
        if hair:
            # Hair on top/back/sides + fringe on the face.
            self.rect("head", "top", 0, 0, 7, 7, hair)
            self.rect("head", "back", 0, 0, 7, 6, hair)
            for side in ("right", "left"):
                self.rect("head", side, 0, 0, 7, 2, hair)
                if sideburns:
                    self.rect("head", side, 5 if side == "right" else 0, 3, 7 if side == "right" else 2, 4, hair)
            self.rect("head", "front", 0, 0, 7, hair_rows - 1, hair)
        b = brows if brows is not None else (shade(hair, 0.8) if hair else shade(skin, 0.6))
        self.rect("head", "front", 1, 3, 2, 3, b, noise=0)
        self.rect("head", "front", 5, 3, 6, 3, b, noise=0)
        for x0 in (1, 5):
            if glow_eyes:
                self.rect("head", "front", x0, 4, x0 + 1, 4, eyes, noise=0, glow=True)
            else:
                self.rect("head", "front", x0, 4, x0, 4, eyes if x0 == 1 else iris, noise=0)
                self.rect("head", "front", x0 + 1, 4, x0 + 1, 4, iris if x0 == 1 else eyes, noise=0)
        self.rect("head", "front", 3, 5, 4, 5, shade(skin, 0.85), noise=0)  # nose shadow
        if mustache:
            self.rect("head", "front", 2, 6, 5, 6, mustache, noise=0)
        if mouth:
            self.rect("head", "front", 3, 7 if mustache else 6, 4, 7 if mustache else 6, mouth, noise=0)
        if beard:
            self.rect("head", "front", 1, 7, 6, 7, beard)
            self.rect("head", "front", 0, 5, 0, 7, beard)
            self.rect("head", "front", 7, 5, 7, 7, beard)
            self.rect("head", "bottom", 0, 0, 7, 7, beard)


# =====================================================================================================================
# Characters
# =====================================================================================================================

def viltrumite_uniform(s, base, accent, emblem):
    """Viltrumite Empire uniform: dark bodysuit, light shoulders/chest panel, emblem, gloves and boots."""
    s.fill("body", base)
    s.rect("body", "front", 0, 0, 7, 2, accent)
    s.rect("body", "back", 0, 0, 7, 2, accent)
    s.rect("body", "front", 2, 3, 5, 3, accent)
    s.rect("body", "front", 3, 4, 4, 5, emblem, noise=2)
    s.band("body", 9, 9, shade(base, 0.7))
    s.rect("body", "top", 0, 0, 7, 3, accent)
    s.limbs(base, base, hand=accent, boot=accent, boot_h=4)
    for a in ("right_arm", "left_arm"):
        s.rect(a, "top", 0, 0, 3, 3, accent)
        s.band(a, 0, 1, accent)


def make_viltrumite_soldier():
    s = Skin("viltrumite_soldier")
    s.face(rgb("d9a77f"), hair=rgb("1b1410"), iris=rgb("3a2a1e"), mustache=rgb("1b1410"), mouth=rgb("8a4b3a"))
    viltrumite_uniform(s, rgb("17171c"), rgb("e9e9ee"), rgb("b31b1b"))
    s.save()


def make_viltrumite_scout():
    s = Skin("viltrumite_scout")
    s.face(rgb("c9946c"), hair=rgb("5a3b22"), iris=rgb("2b4a7a"), mouth=rgb("8a4b3a"), hair_rows=2)
    viltrumite_uniform(s, rgb("2b2d36"), rgb("c9ccd6"), rgb("b31b1b"))
    s.save()


def make_conquest():
    s = Skin("conquest")
    skin = rgb("c48d68")
    s.face(skin, hair=rgb("d8d8d8"), iris=rgb("6a1010"), mustache=rgb("cfcfcf"), mouth=rgb("7a3b2a"), hair_rows=1)
    # Scars and a ruined eye
    for (x, y) in ((1, 2), (2, 3), (2, 4), (3, 5), (5, 1), (6, 2)):
        s.rect("head", "front", x, y, x, y, rgb("8e4a3a"), noise=0)
    s.rect("head", "front", 1, 4, 2, 4, rgb("b9b9b9"), noise=0)
    viltrumite_uniform(s, rgb("1a1a1a"), rgb("8d8f96"), rgb("b31b1b"))
    # Battle-worn metal pauldrons
    for a in ("right_arm", "left_arm"):
        s.band(a, 0, 2, rgb("6d7078"))
        s.rect(a, "top", 0, 0, 3, 3, rgb("7d8088"))
    s.save()


def make_thragg():
    s = Skin("thragg")
    s.face(rgb("d2a07c"), hair=rgb("0f0f12"), iris=rgb("1d1d1d"), mouth=rgb("7a3b2a"), hair_rows=2)
    # The scar across his face
    for i in range(6):
        s.rect("head", "front", 1 + i, 1 + i, 1 + i, 1 + i, rgb("8c3b2c"), noise=0)
    viltrumite_uniform(s, rgb("efefef"), rgb("151515"), rgb("a01616"))
    # Regent's red sash
    s.rect("body", "front", 0, 7, 7, 8, rgb("9b1212"))
    s.save()


def make_loki():
    s = Skin("loki")
    gold = rgb("d4af37")
    s.face(rgb("e8d2bf"), hair=rgb("101010"), iris=rgb("2f6b3a"), mouth=rgb("8c5a52"), hair_rows=1)
    # Long black hair framing the face
    s.rect("head", "front", 0, 1, 0, 6, rgb("101010"))
    s.rect("head", "front", 7, 1, 7, 6, rgb("101010"))
    s.rect("head", "back", 0, 0, 7, 7, rgb("101010"))
    for side in ("right", "left"):
        s.rect("head", side, 0, 0, 7, 7, rgb("101010"))
    # Golden horned helmet on the hat layer: a band over the brow and two horns sweeping up
    s.rect("hat", "front", 1, 0, 6, 1, gold)
    s.rect("hat", "front", 3, 2, 4, 2, gold)
    s.rect("hat", "front", 0, 0, 0, 0, shade(gold, 1.2))
    s.rect("hat", "front", 7, 0, 7, 0, shade(gold, 1.2))
    s.rect("hat", "top", 1, 1, 6, 6, gold)
    for side in ("right", "left"):
        s.rect("hat", side, 0, 0, 7, 1, gold)
    # Green and black leather with gold trim
    green = rgb("1f5e2e")
    s.fill("body", rgb("141a14"))
    s.rect("body", "front", 0, 0, 1, 11, green)
    s.rect("body", "front", 6, 0, 7, 11, green)
    s.rect("body", "front", 2, 0, 5, 0, gold)
    s.band("body", 8, 8, gold)
    s.limbs(rgb("141a14"), rgb("16301e"), hand=rgb("2a2a2a"), boot=rgb("1b1b1b"), boot_h=4)
    for a in ("right_arm", "left_arm"):
        s.band(a, 0, 3, green)
        s.band(a, 6, 6, gold)
    s.save()


def make_chitauri():
    s = Skin("chitauri")
    s.face(rgb("6e6a5f"), hair=None, eyes=rgb("4fb8ff"), iris=rgb("4fb8ff"), mouth=rgb("2e2a24"), glow_eyes=True)
    for x in (0, 2, 5, 7):
        s.rect("head", "front", x, 6, x, 7, rgb("3b3832"))
    s.fill("body", rgb("4a4e55"))
    s.rect("body", "front", 1, 1, 6, 6, rgb("5d6169"))
    s.rect("body", "front", 3, 2, 4, 3, rgb("2e7dba"), glow=True)
    s.limbs(rgb("44474e"), rgb("3a3c42"), hand=rgb("2b2c30"), boot=rgb("2b2c30"))
    s.save()


def make_ebony_maw():
    s = Skin("ebony_maw", slim=True)
    s.face(rgb("9ea3a8"), hair=None, iris=rgb("1a1a1a"), eyes=rgb("d8d8d8"), mouth=rgb("4a4a4a"))
    s.rect("head", "front", 2, 6, 5, 7, rgb("6d7277"))  # sunken nose/mouth
    s.fill("body", rgb("1f1f22"))
    s.rect("body", "front", 3, 0, 4, 11, rgb("4a4a52"))
    s.limbs(rgb("1f1f22"), rgb("1f1f22"), hand=rgb("9ea3a8"), boot=rgb("111111"))
    s.save()


def make_cull_obsidian():
    s = Skin("cull_obsidian")
    hide = rgb("4a443c")
    s.face(hide, hair=None, eyes=rgb("ffcc33"), iris=rgb("ffcc33"), mouth=rgb("1c1a17"), glow_eyes=True)
    # Horns and bony brow on the hat layer
    s.rect("hat", "front", 0, 0, 1, 1, rgb("d9cfb8"))
    s.rect("hat", "front", 6, 0, 7, 1, rgb("d9cfb8"))
    s.fill("body", rgb("6b4b2e"))
    s.rect("body", "front", 0, 0, 7, 4, rgb("3d3a35"))
    s.band("body", 8, 9, rgb("2a2622"))
    s.limbs(hide, rgb("5a3e26"), hand=rgb("2a2622"), boot=rgb("2a2622"), boot_h=4)
    for a in ("right_arm", "left_arm"):
        s.band(a, 0, 3, rgb("3d3a35"))
    s.save()


def make_proxima_midnight():
    s = Skin("proxima_midnight", slim=True)
    s.face(rgb("6c79a8"), hair=rgb("101018"), eyes=rgb("66ccff"), iris=rgb("66ccff"), mouth=rgb("2d2f4a"), hair_rows=1, glow_eyes=True)
    # Horn crest
    s.rect("hat", "front", 0, 0, 1, 2, rgb("1b1b2b"))
    s.rect("hat", "front", 6, 0, 7, 2, rgb("1b1b2b"))
    s.rect("head", "back", 0, 0, 7, 7, rgb("101018"))
    s.fill("body", rgb("1c1c3a"))
    s.rect("body", "front", 2, 1, 5, 5, rgb("2b2b55"))
    s.band("body", 7, 7, rgb("4fb3ff"))
    s.limbs(rgb("1c1c3a"), rgb("1c1c3a"), hand=rgb("0f0f1e"), boot=rgb("0f0f1e"), boot_h=5)
    s.save()


def make_corvus_glaive():
    s = Skin("corvus_glaive")
    s.face(rgb("4d5a4d"), hair=None, eyes=rgb("e8e8e8"), iris=rgb("101010"), mouth=rgb("1f241f"))
    s.rect("head", "front", 0, 0, 7, 1, rgb("2b332b"))
    s.fill("body", rgb("1a1d1a"))
    s.rect("body", "front", 0, 0, 7, 2, rgb("6a6f6a"))
    s.rect("body", "front", 3, 3, 4, 11, rgb("2f3b2f"))
    s.limbs(rgb("1a1d1a"), rgb("141714"), hand=rgb("6a6f6a"), boot=rgb("0d0f0d"))
    s.save()


def make_thanos():
    s = Skin("thanos")
    purple = rgb("7b4f9d")
    gold = rgb("d4af37")
    blue = rgb("2b3f7a")
    s.face(purple, hair=None, iris=rgb("1e2a5a"), eyes=rgb("d8e2ff"), mouth=rgb("4a2c5e"))
    # The chin ridges
    for x in (1, 3, 4, 6):
        s.rect("head", "front", x, 6, x, 7, shade(purple, 0.7), noise=0)
    s.rect("head", "front", 2, 3, 5, 3, shade(purple, 0.65), noise=0)
    s.fill("body", blue)
    s.rect("body", "front", 0, 0, 7, 5, gold)
    s.rect("body", "front", 2, 1, 5, 4, shade(gold, 0.85))
    s.rect("body", "back", 0, 0, 7, 3, gold)
    s.band("body", 8, 9, shade(gold, 0.8))
    s.limbs(blue, blue, hand=gold, boot=gold, boot_h=5, glove_h=4)
    for a in ("right_arm", "left_arm"):
        s.band(a, 0, 2, gold)
    s.save()


def make_stonekeeper():
    s = Skin("stonekeeper")
    red = rgb("b22222")
    s.face(red, hair=None, eyes=rgb("ffd27a"), iris=rgb("ffd27a"), mouth=rgb("3a0a0a"), glow_eyes=True)
    for x in range(1, 7):
        s.rect("head", "front", x, 6, x, 7, rgb("e8d8c8") if x % 2 else rgb("3a0a0a"), noise=0)
    s.rect("head", "front", 3, 5, 4, 5, rgb("3a0a0a"), noise=0)
    cloak = rgb("1c1414")
    # Hood
    s.fill("hat", cloak, faces_=("top", "right", "left", "back"))
    s.rect("hat", "front", 0, 0, 7, 0, cloak)
    s.rect("hat", "front", 0, 0, 0, 7, cloak)
    s.rect("hat", "front", 7, 0, 7, 7, cloak)
    s.fill("body", cloak)
    s.fill("jacket", shade(cloak, 1.1))
    s.limbs(cloak, cloak, hand=red, boot=rgb("0d0a0a"))
    for l in ("right_pants", "left_pants"):
        s.fill(l, shade(cloak, 1.1))
    s.save()


def make_mindless_one():
    s = Skin("mindless_one")
    rock = rgb("5a5048")
    s.fill("head", rock)
    for face in ("front", "right", "left", "back", "top"):
        fu, fv, fw, fh = s.p["head"][face]
        for y in range(fh):
            for x in range(fw):
                if face == "top" or y < 6 or face == "front":
                    t = y / 7.0
                    c = mix(rgb("ffe08a"), rgb("ff6a00"), t) if face != "top" else rgb("ffd04a")
                    if face == "front" and 2 <= y <= 5:
                        c = mix(rgb("fff2c0"), rgb("ff9a1a"), t)
                    s.glow_px(fu + x, fv + y, jitter(c, 12, s.rnd))
    s.fill("body", rock)
    s.rect("body", "front", 1, 1, 6, 10, shade(rock, 1.1))
    s.limbs(shade(rock, 0.9), shade(rock, 0.85), hand=shade(rock, 0.7), boot=shade(rock, 0.7))
    s.save()


def doom_armor(s, metal, green, robot=False):
    mask = shade(metal, 1.1)
    s.fill("head", mask, noise=3)
    # Rivets and slit eyes
    s.rect("head", "front", 1, 3, 2, 3, rgb("0a0a0a"), noise=0)
    s.rect("head", "front", 5, 3, 6, 3, rgb("0a0a0a"), noise=0)
    s.rect("head", "front", 1, 3, 1, 3, rgb("3cff6a") if not robot else rgb("ff3b3b"), noise=0, glow=True)
    s.rect("head", "front", 6, 3, 6, 3, rgb("3cff6a") if not robot else rgb("ff3b3b"), noise=0, glow=True)
    s.rect("head", "front", 3, 4, 4, 5, shade(mask, 0.85), noise=0)
    s.rect("head", "front", 2, 6, 5, 6, rgb("1a1a1a"), noise=0)
    for (x, y) in ((0, 1), (7, 1), (0, 6), (7, 6)):
        s.rect("head", "front", x, y, x, y, shade(mask, 0.7), noise=0)
    # Green hood
    s.fill("hat", green, faces_=("top", "right", "left", "back"))
    s.rect("hat", "front", 0, 0, 7, 0, green)
    s.rect("hat", "front", 0, 0, 0, 6, green)
    s.rect("hat", "front", 7, 0, 7, 6, green)
    # Green tunic over metal, brown belt with gold buckle
    s.fill("body", green)
    s.rect("body", "front", 0, 0, 7, 1, metal)
    s.band("body", 8, 9, rgb("4a3420"))
    s.rect("body", "front", 3, 8, 4, 9, rgb("d4af37"), noise=0)
    s.limbs(metal, metal, hand=shade(metal, 0.8), boot=shade(metal, 0.75), boot_h=4)
    for l in ("right_leg", "left_leg"):
        s.band(l, 0, 3, green)
    if robot:
        for a in ("right_arm", "left_arm"):
            s.band(a, 5, 5, rgb("3a3a3a"))
            s.rect(a, "front", 1, 6, 2, 6, rgb("ff3b3b"), glow=True)


def make_doctor_doom():
    s = Skin("doctor_doom")
    doom_armor(s, rgb("8a9097"), rgb("1f6b2c"))
    s.save()


def make_doombot():
    s = Skin("doombot")
    doom_armor(s, rgb("6f757c"), rgb("2e5e2e"), robot=True)
    s.save()


def make_doomsday():
    s = Skin("doomsday")
    hide = rgb("6e6e6e")
    bone = rgb("e8e2d0")
    s.face(hide, hair=None, eyes=rgb("ff3030"), iris=rgb("ff3030"), mouth=rgb("e8e2d0"), glow_eyes=True)
    s.rect("head", "front", 1, 6, 6, 7, rgb("2a2a2a"))
    for x in (1, 3, 5):
        s.rect("head", "front", x, 6, x, 6, bone, noise=0)
    for x in (0, 2, 4, 6):
        s.rect("head", "top", x, 0, x, 7, bone)
    s.fill("body", hide)
    for (x, y) in ((1, 1), (6, 1), (2, 4), (5, 4), (1, 8), (6, 8)):
        s.rect("body", "front", x, y, x, y + 1, bone, noise=2)
    s.rect("body", "back", 3, 0, 4, 11, bone)
    s.limbs(hide, rgb("4b5a3a"), hand=shade(hide, 0.8), boot=rgb("3a3a3a"))
    for a in ("right_arm", "left_arm"):
        for face in ("right", "left", "back"):
            s.rect(a, face, 1, 2, 2, 3, bone, noise=2)
            s.rect(a, face, 1, 7, 2, 8, bone, noise=2)
    s.save()


def make_zoom():
    s = Skin("zoom")
    black = rgb("101012")
    s.fill("head", black, noise=3)
    s.rect("head", "front", 1, 3, 2, 4, rgb("cfe6ff"), noise=0, glow=True)
    s.rect("head", "front", 5, 3, 6, 4, rgb("cfe6ff"), noise=0, glow=True)
    s.rect("head", "front", 2, 6, 5, 6, rgb("2a2a2e"), noise=0)
    for face in ("right", "left"):
        s.rect("head", face, 2, 1, 3, 3, rgb("2a2a2e"))
    s.fill("body", black)
    s.rect("body", "front", 3, 1, 4, 1, rgb("2f7fff"), glow=True)
    s.rect("body", "front", 2, 2, 3, 2, rgb("2f7fff"), glow=True)
    s.rect("body", "front", 4, 3, 5, 3, rgb("2f7fff"), glow=True)
    s.rect("body", "front", 3, 4, 4, 4, rgb("2f7fff"), glow=True)
    s.band("body", 8, 8, rgb("2a2a2e"))
    s.limbs(black, black, hand=rgb("1c1c20"), boot=rgb("1c1c20"))
    for part in ("right_arm", "left_arm", "right_leg", "left_leg"):
        s.rect(part, "front", 1, 2, 1, 9, rgb("26262c"))
    s.save()


def sentinel_body(s, purple, magenta, name_glow):
    s.fill("head", purple, noise=3)
    s.rect("head", "front", 1, 2, 6, 7, magenta)
    s.rect("head", "front", 1, 3, 2, 3, rgb("ffe84a"), noise=0, glow=True)
    s.rect("head", "front", 5, 3, 6, 3, rgb("ffe84a"), noise=0, glow=True)
    s.rect("head", "front", 2, 6, 5, 6, shade(magenta, 0.6), noise=0)
    s.rect("head", "top", 1, 1, 6, 6, shade(purple, 0.8))
    s.fill("body", purple)
    s.rect("body", "front", 1, 1, 6, 7, magenta)
    s.rect("body", "front", 3, 3, 4, 4, rgb("ff3355"), noise=0, glow=True)
    s.band("body", 9, 9, shade(purple, 0.7))
    s.limbs(purple, purple, hand=magenta, boot=magenta, boot_h=4, glove_h=4)
    for a in ("right_arm", "left_arm"):
        s.band(a, 0, 2, magenta)
        s.rect(a, "bottom", 1, 1, 2, 2, rgb("ff3355"), glow=True)
    for l in ("right_leg", "left_leg"):
        s.rect(l, "bottom", 1, 1, 2, 2, rgb("ffb347"), glow=True)


def make_sentinel():
    s = Skin("sentinel")
    sentinel_body(s, rgb("7b3fa0"), rgb("c0508c"), True)
    s.save()


def make_master_mold():
    s = Skin("master_mold")
    sentinel_body(s, rgb("4b2e66"), rgb("9b2d5a"), True)
    for face in ("right", "left", "back"):
        s.rect("head", face, 0, 6, 7, 7, rgb("2e1a40"))
    s.save()


def make_ghost_rider():
    s = Skin("ghost_rider")
    bone = rgb("efe6d6")
    s.fill("head", bone, noise=8)
    # Skull: eye sockets, nose hole, teeth
    s.rect("head", "front", 1, 3, 2, 4, rgb("1a0a00"), noise=0)
    s.rect("head", "front", 5, 3, 6, 4, rgb("1a0a00"), noise=0)
    s.rect("head", "front", 1, 3, 1, 3, rgb("ff7a00"), noise=0, glow=True)
    s.rect("head", "front", 6, 3, 6, 3, rgb("ff7a00"), noise=0, glow=True)
    s.rect("head", "front", 3, 5, 4, 5, rgb("1a0a00"), noise=0)
    for x in range(1, 7):
        s.rect("head", "front", x, 7, x, 7, rgb("1a0a00") if x % 2 == 0 else bone, noise=0)
    # Flames all around the skull (hat layer, emissive)
    for face, (fu, fv, fw, fh) in s.p["hat"].items():
        for y in range(fh):
            for x in range(fw):
                if face == "front" and y >= 2:
                    continue
                if face in ("right", "left", "back") and y > 5 - (x % 3):
                    continue
                t = y / 7.0
                c = mix(rgb("fff2a0"), rgb("ff5a00"), t) if face != "top" else rgb("ffd04a")
                s.glow_px(fu + x, fv + y, jitter(c, 18, s.rnd))
    leather = rgb("1a1a1a")
    s.fill("body", leather)
    s.rect("body", "front", 3, 0, 4, 11, rgb("2a2a2a"))
    for i in range(8):
        s.rect("body", "front", i, i + 2, i, i + 2, rgb("9a9a9a"), noise=0)  # chain across the chest
    s.limbs(leather, rgb("222326"), hand=rgb("111111"), boot=rgb("0d0d0d"), boot_h=4)
    s.save()


# =====================================================================================================================
# Dormammu (128x64: 16^3 head at (0,0), 18x8x18 crown at (0,32))
# =====================================================================================================================

def make_dormammu():
    img = Image.new("RGBA", (128, 64), (0, 0, 0, 0))
    rnd = random.Random("dormammu")

    def box_faces(u, v, w, h, d):
        return faces(u, v, w, h, d)

    head = box_faces(0, 0, 16, 16, 16)
    for face, (fu, fv, fw, fh) in head.items():
        for y in range(fh):
            for x in range(fw):
                cx, cy = (x - fw / 2 + 0.5) / (fw / 2), (y - fh / 2 + 0.5) / (fh / 2)
                edge = max(abs(cx), abs(cy))
                base = mix(rgb("2a0a3e"), rgb("ff6a00"), max(0.0, (edge - 0.55) / 0.45))
                img.putpixel((fu + x, fv + y), jitter(base, 10, rnd) + (255,))
    fu, fv, fw, fh = head["front"]
    # Burning eyes
    for (ex, ey) in ((3, 6), (10, 6)):
        for y in range(ey, ey + 2):
            for x in range(ex, ex + 3):
                img.putpixel((fu + x, fv + y), rgb("fff6b0") + (255,))
    # Brow ridge and mouth of fire
    for x in range(2, 14):
        img.putpixel((fu + x, fv + 4), rgb("120318") + (255,))
    for x in range(4, 12):
        img.putpixel((fu + x, fv + 12), rgb("ffb000") + (255,))
        img.putpixel((fu + x, fv + 13), rgb("ff5a00") + (255,))
    crown = box_faces(0, 32, 18, 8, 18)
    for face, (cu, cv, cw, ch) in crown.items():
        for y in range(ch):
            for x in range(cw):
                if face in ("front", "back", "left", "right"):
                    height = 3 + int(4 * abs(math.sin(x * 1.3 + (1 if face == "left" else 0))))
                    if y < ch - height:
                        continue
                    t = (y - (ch - height)) / max(1, height)
                    c = mix(rgb("fff2a0"), rgb("ff4a00"), t)
                elif face == "top":
                    continue
                else:
                    c = rgb("ff6a00")
                img.putpixel((cu + x, cv + y), jitter(c, 14, rnd) + (255,))
    img.save(os.path.join(ENTITY, "dormammu.png"))


def make_energy_bolt():
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - 7.5, y - 7.5) / 7.5
            if d <= 1.0:
                a = int(255 * (1 - d) ** 1.4)
                core = int(255 * max(0.0, 1 - d * 1.8))
                img.putpixel((x, y), (255, 255, 255, max(a, core)))
    img.save(os.path.join(ENTITY, "energy_bolt.png"))


# =====================================================================================================================
# Items (16x16)
# =====================================================================================================================

def new_icon():
    return Image.new("RGBA", (16, 16), (0, 0, 0, 0))


def gem(color, shape="diamond", seed=0):
    img = new_icon()
    rnd = random.Random(seed)
    c = rgb(color)
    cx, cy = 7.5, 7.5
    for y in range(16):
        for x in range(16):
            dx, dy = x - cx, y - cy
            if shape == "diamond":
                inside = abs(dx) / 6.5 + abs(dy) / 7.5 <= 1.0
            elif shape == "orb":
                inside = math.hypot(dx, dy) <= 6.2
            elif shape == "eye":
                inside = abs(dx) / 7.0 + (abs(dy) / 4.0) ** 1.4 <= 1.0
            else:  # oval
                inside = (dx / 5.5) ** 2 + (dy / 7.0) ** 2 <= 1.0
            if not inside:
                continue
            light = 1.0 + 0.55 * max(0.0, (-dx - dy) / 10.0) - 0.45 * max(0.0, (dx + dy) / 10.0)
            col = shade(c, light)
            img.putpixel((x, y), jitter(col, 6, rnd) + (255,))
    # Outline
    out = img.copy()
    for y in range(16):
        for x in range(16):
            if img.getpixel((x, y))[3] == 0:
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < 16 and 0 <= ny < 16 and img.getpixel((nx, ny))[3] > 0:
                        out.putpixel((x, y), shade(c, 0.35) + (255,))
                        break
    # Sparkles
    for (x, y) in ((5, 4), (4, 5), (6, 3)):
        if out.getpixel((x, y))[3] > 0:
            out.putpixel((x, y), (255, 255, 255, 255))
    return out


def tesseract():
    img = new_icon()
    blue = rgb("2f6bff")
    light = rgb("9fc4ff")
    # Isometric cube
    for y in range(16):
        for x in range(16):
            # top face
            if 2 <= y <= 6 and abs(x - 7.5) <= (y - 1.5) * 1.6 and abs(x - 7.5) <= 6:
                img.putpixel((x, y), shade(light, 1.0) + (255,))
            elif 6 < y <= 14 and 1 <= x <= 14:
                c = shade(blue, 1.15) if x < 8 else shade(blue, 0.8)
                if y > 12 and abs(x - 7.5) > (14.5 - y) * 3:
                    continue
                img.putpixel((x, y), c + (255,))
    for (x, y) in ((7, 9), (8, 9), (7, 10), (8, 10), (6, 4), (9, 4)):
        img.putpixel((x, y), (230, 245, 255, 255))
    return img


def gauntlet(stones):
    img = new_icon()
    gold = rgb("d4af37")
    dark = rgb("8a6d1c")
    shape = [
        "....XXXX........",
        "...XXXXXX.......",
        "..XXXXXXXXX.....",
        "..XXXXXXXXXX....",
        "..XXXXXXXXXXX...",
        ".XXXXXXXXXXXX...",
        ".XXXXXXXXXXXXX..",
        ".XXXXXXXXXXXXX..",
        ".XXXXXXXXXXXXX..",
        "..XXXXXXXXXXXX..",
        "..XXXXXXXXXXX...",
        "...XXXXXXXXXX...",
        "...XXXXXXXXX....",
        "....XXXXXXXX....",
        "....XXXXXXXX....",
        "....XXXXXXXX....",
    ]
    for y, row in enumerate(shape):
        for x, ch in enumerate(row):
            if ch == "X":
                l = 1.15 - 0.03 * (x + y)
                img.putpixel((x, y), shade(gold, max(0.6, l)) + (255,))
    # finger separations
    for (x, y) in ((5, 1), (7, 2), (9, 3), (11, 4)):
        img.putpixel((x, y), dark + (255,))
    sockets = [(4, 2), (6, 3), (8, 4), (10, 5), (12, 6), (7, 9)]  # 4 knuckles, thumb, back of hand
    colours = ["2f6bff", "ffd21f", "d8172b", "8e2cd9", "19c24a", "ff8a1a"]
    for i, (x, y) in enumerate(sockets):
        if i < stones:
            img.putpixel((x, y), rgb(colours[i]) + (255,))
        else:
            img.putpixel((x, y), dark + (255,))
    return img


def simple_icon(draw):
    img = new_icon()
    draw(img)
    return img


def put(img, pts, color):
    for (x, y) in pts:
        if 0 <= x < 16 and 0 <= y < 16:
            img.putpixel((x, y), rgb(color) + (255,) if isinstance(color, str) else color)


def circle(img, cx, cy, r, color, fill=True, edge=None):
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - cx, y - cy)
            if (fill and d <= r) or (not fill and abs(d - r) < 0.6):
                img.putpixel((x, y), rgb(color) + (255,))
            elif edge and abs(d - r) < 0.7:
                img.putpixel((x, y), rgb(edge) + (255,))


def make_items():
    gem("ffd21f", "diamond", 1).save(os.path.join(ITEM, "mind_stone.png"))
    gem("d8172b", "oval", 2).save(os.path.join(ITEM, "reality_stone.png"))
    gem("8e2cd9", "orb", 3).save(os.path.join(ITEM, "power_stone.png"))
    gem("19c24a", "eye", 4).save(os.path.join(ITEM, "time_stone.png"))
    gem("ff8a1a", "diamond", 5).save(os.path.join(ITEM, "soul_stone.png"))
    tesseract().save(os.path.join(ITEM, "space_stone.png"))
    gauntlet(0).save(os.path.join(ITEM, "infinity_gauntlet.png"))
    gauntlet(3).save(os.path.join(ITEM, "infinity_gauntlet_partial.png"))
    gauntlet(6).save(os.path.join(ITEM, "infinity_gauntlet_full.png"))

    def eye(img):
        circle(img, 7.5, 7.5, 6.5, "d4af37")
        circle(img, 7.5, 7.5, 4.5, "8a6d1c")
        for x in range(4, 12):
            put(img, [(x, 7), (x, 8)], "19c24a" if 5 <= x <= 10 else "2b1d05")
        put(img, [(7, 7), (8, 7), (7, 8), (8, 8)], "0b3d17")
        put(img, [(7, 0), (8, 0), (7, 1), (8, 1)], "d4af37")
    simple_icon(eye).save(os.path.join(ITEM, "sealed_eye_of_agamotto.png"))

    def book(img):
        for y in range(2, 15):
            for x in range(3, 13):
                img.putpixel((x, y), rgb("3b2a6b" if x > 3 else "251a45") + (255,))
        for y in range(3, 14):
            img.putpixel((12, y), rgb("e8e2d0") + (255,))
        circle(img, 8, 8, 2.5, "f2f2f2")
        put(img, [(8, 8), (7, 8)], "4fb3ff")
        put(img, [(8, 7)], "0b1a3a")
    simple_icon(book).save(os.path.join(ITEM, "watcher_log.png"))

    def sigil(img):
        circle(img, 7.5, 7.5, 6.5, "efefef", edge="7a7a7a")
        for y in range(4, 12):
            put(img, [(7, y), (8, y)], "b31b1b")
        for x in range(5, 11):
            put(img, [(x, 5)], "b31b1b")
        put(img, [(6, 10), (9, 10), (5, 11), (10, 11)], "b31b1b")
    simple_icon(sigil).save(os.path.join(ITEM, "viltrumite_sigil.png"))

    def medal(img):
        for y in range(0, 6):
            put(img, [(6, y), (9, y)], "b31b1b")
            put(img, [(7, y), (8, y)], "1a1a1a")
        circle(img, 7.5, 10, 4.5, "a8adb5", edge="5a5f66")
        put(img, [(6, 9), (9, 11), (7, 10), (8, 10)], "6d7078")
    simple_icon(medal).save(os.path.join(ITEM, "conquest_medal.png"))

    def crest(img):
        for y in range(1, 15):
            w = 6 - max(0, y - 9)
            for x in range(8 - w, 8 + w):
                img.putpixel((x, y), rgb("d4af37" if (x + y) % 5 else "b8952a") + (255,))
        for y in range(4, 11):
            put(img, [(7, y), (8, y)], "9b1212")
        put(img, [(5, 5), (10, 5), (6, 6), (9, 6)], "9b1212")
    simple_icon(crest).save(os.path.join(ITEM, "regent_crest.png"))

    def insignia(img):
        for y in range(16):
            for x in range(16):
                if abs(x - 7.5) + abs(y - 7.5) <= 7:
                    img.putpixel((x, y), rgb("2a1240" if abs(x - 7.5) + abs(y - 7.5) > 5 else "6b2fa0") + (255,))
        put(img, [(7, 4), (8, 4), (6, 6), (9, 6), (7, 8), (8, 8), (5, 10), (10, 10), (7, 11), (8, 11)], "d4af37")
    simple_icon(insignia).save(os.path.join(ITEM, "black_order_insignia.png"))

    def core(img):
        for y in range(3, 13):
            for x in range(3, 13):
                img.putpixel((x, y), rgb("5a5f66" if (x in (3, 12) or y in (3, 12)) else "2b2f33") + (255,))
        circle(img, 7.5, 7.5, 2.5, "3cff6a")
        put(img, [(1, 7), (2, 7), (13, 8), (14, 8), (7, 1), (7, 2), (8, 13), (8, 14)], "d4af37")
    simple_icon(core).save(os.path.join(ITEM, "doombot_core.png"))

    def mask(img):
        for y in range(1, 15):
            w = 6 if y < 11 else 6 - (y - 10)
            for x in range(8 - w, 8 + w):
                img.putpixel((x, y), shade(rgb("9aa0a7"), 1.1 - 0.02 * (x + y)) + (255,))
        put(img, [(4, 5), (5, 5), (6, 5), (9, 5), (10, 5), (11, 5)], "0a0a0a")
        put(img, [(6, 11), (7, 11), (8, 11), (9, 11)], "1a1a1a")
        for y in range(1, 4):
            put(img, [(2, y + 3), (13, y + 3)], "1f6b2c")
    simple_icon(mask).save(os.path.join(ITEM, "doom_mask.png"))

    def bone(img):
        for i in range(12):
            x, y = 2 + i, 13 - i
            put(img, [(x, y), (x + 1, y), (x, y - 1)], "e8e2d0")
        put(img, [(13, 1), (14, 2), (12, 1)], "fffaf0")
        put(img, [(2, 13), (3, 14), (1, 13)], "bdb6a2")
    simple_icon(bone).save(os.path.join(ITEM, "doomsday_bone.png"))

    def red_eye(img):
        circle(img, 7.5, 7.5, 6.5, "7b3fa0", edge="3b1f50")
        circle(img, 7.5, 7.5, 3.5, "ff3355")
        put(img, [(7, 7), (8, 7), (7, 8), (8, 8)], "ffe84a")
    simple_icon(red_eye).save(os.path.join(ITEM, "sentinel_eye.png"))

    def mold_core(img):
        for y in range(2, 14):
            for x in range(2, 14):
                img.putpixel((x, y), rgb("4b2e66" if (x + y) % 4 else "9b2d5a") + (255,))
        circle(img, 7.5, 7.5, 3.0, "ff3355")
        put(img, [(7, 7), (8, 8)], "ffffff")
    simple_icon(mold_core).save(os.path.join(ITEM, "master_mold_core.png"))

    def chain(img):
        for i in range(7):
            x, y = 2 + i * 2, 12 - i * 2 + (i % 2)
            put(img, [(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)], "8a8a8a" if i % 2 else "bdbdbd")
        put(img, [(13, 1), (14, 0), (12, 2), (14, 2)], "ff7a00")
        put(img, [(13, 0), (12, 0)], "ffd04a")
    simple_icon(chain).save(os.path.join(ITEM, "penance_chain.png"))

    def vial(img):
        for y in range(3, 15):
            for x in range(5, 11):
                c = "2f7fff" if y > 6 else "cfe6ff"
                img.putpixel((x, y), rgb(c) + (200,))
        for y in range(1, 3):
            put(img, [(6, y), (7, y), (8, y), (9, y)], "6b4b2e")
        put(img, [(6, 8), (6, 9), (7, 12)], "e6f2ff")
        put(img, [(4, y) for y in range(4, 14)] + [(11, y) for y in range(4, 14)], "b8c4d4")
    simple_icon(vial).save(os.path.join(ITEM, "velocity_9.png"))


def make_effects():
    img = Image.new("RGBA", (18, 18), (0, 0, 0, 0))
    rnd = random.Random("snapped")
    for _ in range(70):
        x, y = rnd.randint(2, 15), rnd.randint(2, 15)
        if math.hypot(x - 8.5, y - 8.5) < 7.5:
            img.putpixel((x, y), jitter(rgb("8e5bd9"), 30, rnd) + (255,))
    img.save(os.path.join(EFFECT, "snapped.png"))
    img = Image.new("RGBA", (18, 18), (0, 0, 0, 0))
    for y in range(18):
        for x in range(18):
            h = 15 - abs(x - 8.5) * 1.6 - 2 * abs(math.sin(x * 1.7))
            if y >= 17 - h and 2 <= x <= 15:
                t = (y - (17 - h)) / max(1, h)
                img.putpixel((x, y), mix(rgb("fff2a0"), rgb("ff4a00"), 1 - t) + (255,))
    img.save(os.path.join(EFFECT, "hellfire.png"))


def main():
    for fn in (make_viltrumite_soldier, make_viltrumite_scout, make_conquest, make_thragg, make_loki, make_chitauri,
               make_ebony_maw, make_cull_obsidian, make_proxima_midnight, make_corvus_glaive, make_thanos,
               make_stonekeeper, make_mindless_one, make_doctor_doom, make_doombot, make_doomsday, make_zoom,
               make_sentinel, make_master_mold, make_ghost_rider, make_dormammu, make_energy_bolt):
        fn()
    make_items()
    make_effects()
    print("textures written to", os.path.normpath(ROOT))


if __name__ == "__main__":
    main()
