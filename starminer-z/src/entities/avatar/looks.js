// The avatars a player can be, in the spirit of the Xbox 360 dashboard's: two boys and two
// girls to start from (the four from the earlier game), each with skin, hair, eyes, brows,
// mouth and clothing colours that can be changed in Options.

export const SKIN_TONES = [0xf3d2b4, 0xe8bf98, 0xd9a582, 0xc08a62, 0x9a6440, 0x7a4c30, 0x5a3622];
export const HAIR_COLORS = [0x1a120c, 0x2a1a10, 0x4a2c18, 0x7a5030, 0xb08040, 0xd8b878, 0x8a8a8a, 0x6a1a10];
export const SHIRT_TINTS = [0x4a5a6c, 0x8a96a6, 0x9a3a3a, 0x3a6a3a, 0xc8b080, 0x2a2a30, 0xe8e8e8, 0x6a4a8a];
export const IRIS = [0x2a6ab8, 0x3a2414, 0x2e7a4a, 0x6a5a3a, 0x5a6a7a];

export const PRESETS = [
  { name: 'Ross', sex: 'm', skin: 0xdca67e, hair: { style: 'short', color: 0x24170e }, top: { tint: 0x4a5a6c }, bottoms: { tint: 0xffffff }, shoes: { tint: 0xffffff }, face: { eyes: 0, brows: 0, mouth: 4, iris: 0x2a5aa8, brow: 0x7a4a24 } },
  { name: 'Joel', sex: 'm', skin: 0xeab992, hair: { style: 'short', color: 0x1e140c }, top: { tint: 0x46586a }, bottoms: { tint: 0xd8dde8 }, shoes: { tint: 0xffffff }, face: { eyes: 6, brows: 0, mouth: 6, iris: 0x34588a, browThin: true } },
  { name: 'Maya', sex: 'f', skin: 0x8c5230, hair: { style: 'bob', color: 0x22160e }, top: { tint: 0x4a5a6c }, bottoms: { tint: 0xffffff }, shoes: { tint: 0xffffff }, face: { eyes: 6, brows: 2, mouth: 0, iris: 0x1f6fd6, lip: 0xe0587a } },
  { name: 'Nia', sex: 'f', skin: 0x80482a, hair: { style: 'bob', color: 0x1a120c }, top: { tint: 0x485868 }, bottoms: { tint: 0xe0e0e0 }, shoes: { tint: 0xffffff }, face: { eyes: 0, brows: 0, mouth: 1, iris: 0x2a170c, lip: 0x8e4440 } },
];

export function lookFromProfile(p) {
  const base = PRESETS[p?.preset ?? 0] || PRESETS[0];
  if (!p) return { ...base };
  return {
    ...base,
    skin: p.skin ?? base.skin,
    hair: { ...base.hair, color: p.hair ?? base.hair.color },
    top: { tint: p.shirt ?? base.top.tint },
    face: { ...base.face, iris: p.iris ?? base.face.iris },
  };
}
