// Every block type in the world, shared by the main thread and the world workers: CastleMiner
// Z's (its later updates' too: TNT and C4, the doors, Space Goo and space rock from the crash
// sites, the lantern fixed atop the start tower), with a few of this game's own.
//
// id: a byte in the chunk arrays. tex: texture layer names (see gfx/blockTextures.js),
// either one name for all faces or { top, bottom, side }. render: how the mesher draws it.
// tier: the pick tier needed to mine it (0 hands, 1 stone, 2 copper, 3 iron, 4 gold, 5 diamond).

export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  SAND: 3,
  ROCK: 4,
  SNOW: 5,
  ICE: 6,
  LOG: 7,
  LEAVES: 8,
  WOOD: 9,
  COAL_ORE: 10,
  COPPER_ORE: 11,
  IRON_ORE: 12,
  GOLD_ORE: 13,
  DIAMOND_ORE: 14,
  BEDROCK: 15,
  LAVA: 16,
  BLOODSTONE: 17,
  LANTERN: 18,
  TORCH: 19,
  TOWER_STONE: 20,
  COPPER_WALL: 21,
  IRON_WALL: 22,
  GOLD_WALL: 23,
  DIAMOND_WALL: 24,
  CRATE: 25,
  GLASS: 26,
  SNOW_GRASS: 27,
  // torches hung on a wall: the wall is on the named side
  TORCH_PX: 28,
  TORCH_NX: 29,
  TORCH_PZ: 30,
  TORCH_NZ: 31,
  TNT: 32,
  C4: 33,
  // Space Goo, glowing where the aliens' rock came down
  SLIME: 34,
  // a crash site's rock, and the same put down by a player
  SPACE_ROCK: 35,
  SPACE_ROCK_BUILT: 36,
  // the lantern at the top of the start tower: it can't be dug
  FIXED_LANTERN: 37,
  // doors: a lower and an upper half, shut or open, in a wall along x or along z
  DOOR_LOWER_X: 38,
  DOOR_LOWER_Z: 39,
  DOOR_UPPER_X: 40,
  DOOR_UPPER_Z: 41,
  DOOR_LOWER_OPEN_X: 42,
  DOOR_LOWER_OPEN_Z: 43,
  DOOR_UPPER_OPEN_X: 44,
  DOOR_UPPER_OPEN_Z: 45,
};

// Texture layers, in array order. The mesher refers to layers by index.
export const TEXTURES = [
  'grass_top', 'grass_side', 'dirt', 'sand', 'rock', 'snow', 'ice', 'log_side', 'log_top', 'leaves',
  'wood', 'coal_ore', 'copper_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'bedrock', 'lava', 'bloodstone',
  'lantern', 'torch', 'tower_stone', 'tower_top', 'copper_wall', 'iron_wall', 'gold_wall', 'diamond_wall',
  'crate_side', 'crate_top', 'glass', 'snow_side', 'lantern_top',
  'tnt_side', 'tnt_top', 'c4_side', 'c4_top', 'slime', 'space_rock', 'door_lower', 'door_upper',
];
export const TEX = Object.fromEntries(TEXTURES.map((n, i) => [n, i]));

const defs = [];
function def(id, props) {
  const d = {
    id,
    name: props.name,
    solid: props.solid ?? true,
    opaque: props.opaque ?? true,
    render: props.render ?? 'opaque', // 'none' | 'opaque' | 'cutout' | 'translucent' | 'torch' | 'door'
    light: props.light ?? 0,
    hardness: props.hardness ?? 1,
    tool: props.tool ?? 'pick',
    tier: props.tier ?? 0,
    drop: props.drop ?? id,
    sound: props.sound ?? 'stone',
    emissive: props.emissive ?? 0,
    breakable: props.breakable ?? true,
    damage: props.damage ?? 0,
    color: props.color ?? 0x888888, // particle colour
  };
  const t = props.tex;
  if (t) {
    const top = typeof t === 'string' ? t : t.top ?? t.side;
    const bottom = typeof t === 'string' ? t : t.bottom ?? t.side;
    const side = typeof t === 'string' ? t : t.side;
    // face order: +x, -x, +y, -y, +z, -z
    d.faces = [TEX[side], TEX[side], TEX[top], TEX[bottom], TEX[side], TEX[side]];
    if (d.faces.some((f) => f === undefined)) throw new Error(`block ${props.name}: unknown texture`);
  } else d.faces = [0, 0, 0, 0, 0, 0];
  defs[id] = d;
  return d;
}

def(B.AIR, { name: 'Air', solid: false, opaque: false, render: 'none', breakable: false });
def(B.GRASS, { name: 'Grass', tex: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, hardness: 0.75, tool: 'spade', drop: B.DIRT, sound: 'grass', color: 0x5b8a2e });
def(B.DIRT, { name: 'Dirt', tex: 'dirt', hardness: 0.7, tool: 'spade', sound: 'dirt', color: 0x6b4a2e });
def(B.SAND, { name: 'Sand', tex: 'sand', hardness: 0.6, tool: 'spade', sound: 'sand', color: 0xd9c38f });
def(B.ROCK, { name: 'Rock', tex: 'rock', hardness: 2.2, tool: 'pick', tier: 1, sound: 'stone', color: 0x77736c });
def(B.SNOW, { name: 'Snow', tex: { top: 'snow', side: 'snow_side', bottom: 'dirt' }, hardness: 0.55, tool: 'spade', drop: B.SNOW, sound: 'snow', color: 0xe8eef4 });
def(B.ICE, { name: 'Ice', tex: 'ice', hardness: 1.2, tool: 'pick', tier: 0, sound: 'glass', color: 0xa8d0ea });
def(B.LOG, { name: 'Log', tex: { top: 'log_top', bottom: 'log_top', side: 'log_side' }, hardness: 1.8, tool: 'axe', sound: 'wood', color: 0x5a4028 });
def(B.LEAVES, { name: 'Leaves', tex: 'leaves', opaque: false, render: 'cutout', hardness: 0.25, tool: 'none', sound: 'grass', color: 0x3f6a22, drop: 0 });
def(B.WOOD, { name: 'Wood', tex: 'wood', hardness: 1.4, tool: 'axe', sound: 'wood', color: 0x9a7444 });
def(B.COAL_ORE, { name: 'Coal', tex: 'coal_ore', hardness: 2.6, tool: 'pick', tier: 1, sound: 'stone', color: 0x2a2a2a });
def(B.COPPER_ORE, { name: 'Copper Ore', tex: 'copper_ore', hardness: 2.8, tool: 'pick', tier: 1, sound: 'stone', color: 0x4f8a5a });
def(B.IRON_ORE, { name: 'Iron Ore', tex: 'iron_ore', hardness: 3.2, tool: 'pick', tier: 2, sound: 'stone', color: 0x9a5a34 });
def(B.GOLD_ORE, { name: 'Gold Ore', tex: 'gold_ore', hardness: 3.6, tool: 'pick', tier: 3, sound: 'stone', color: 0xe0b030 });
def(B.DIAMOND_ORE, { name: 'Diamond Ore', tex: 'diamond_ore', hardness: 4.2, tool: 'pick', tier: 4, sound: 'stone', color: 0xbfeaf0 });
def(B.BEDROCK, { name: 'Bedrock', tex: 'bedrock', hardness: 999, breakable: false, sound: 'stone', color: 0x333333 });
def(B.LAVA, { name: 'Lava', tex: 'lava', solid: false, opaque: true, light: 15, emissive: 1, breakable: false, damage: 30, sound: 'stone', color: 0xff6a10 });
def(B.BLOODSTONE, { name: 'BloodStone', tex: 'bloodstone', hardness: 4.6, tool: 'pick', tier: 5, sound: 'stone', color: 0x8a1010 });
def(B.LANTERN, { name: 'Lantern', tex: { top: 'lantern_top', bottom: 'lantern_top', side: 'lantern' }, light: 15, emissive: 0.85, hardness: 0.6, tool: 'none', sound: 'glass', color: 0xffd060 });
def(B.TORCH, { name: 'Torch', tex: 'torch', solid: false, opaque: false, render: 'torch', light: 13, hardness: 0.05, tool: 'none', sound: 'wood', color: 0xffa040 });
def(B.TOWER_STONE, { name: 'Rock', tex: { top: 'tower_top', bottom: 'tower_top', side: 'tower_stone' }, hardness: 999, breakable: false, sound: 'stone', color: 0x55524c });
def(B.COPPER_WALL, { name: 'Copper Wall', tex: 'copper_wall', hardness: 4, tool: 'pick', tier: 1, sound: 'metal', color: 0xb8703a });
def(B.IRON_WALL, { name: 'Iron Wall', tex: 'iron_wall', hardness: 6, tool: 'pick', tier: 2, sound: 'metal', color: 0x8a8e92 });
def(B.GOLD_WALL, { name: 'Gold Wall', tex: 'gold_wall', hardness: 8, tool: 'pick', tier: 3, sound: 'metal', color: 0xe0b440 });
def(B.DIAMOND_WALL, { name: 'Diamond Wall', tex: 'diamond_wall', hardness: 11, tool: 'pick', tier: 4, sound: 'metal', color: 0xc8f0f4 });
def(B.CRATE, { name: 'Crate', tex: { top: 'crate_top', bottom: 'crate_top', side: 'crate_side' }, hardness: 1.2, tool: 'axe', sound: 'wood', color: 0x8a6438 });
def(B.GLASS, { name: 'Glass', tex: 'glass', opaque: false, render: 'cutout', hardness: 0.4, tool: 'none', sound: 'glass', color: 0xd0e8f0, drop: 0 });
for (const id of [B.TORCH_PX, B.TORCH_NX, B.TORCH_PZ, B.TORCH_NZ]) def(id, { name: 'Torch', tex: 'torch', solid: false, opaque: false, render: 'torch', light: 13, hardness: 0.05, tool: 'none', sound: 'wood', color: 0xffa040, drop: B.TORCH });
def(B.SNOW_GRASS, { name: 'Snow', tex: { top: 'snow', side: 'snow_side', bottom: 'dirt' }, hardness: 0.7, tool: 'spade', drop: B.DIRT, sound: 'snow', color: 0xe8eef4 });
def(B.TNT, { name: 'TNT', tex: { top: 'tnt_top', bottom: 'tnt_top', side: 'tnt_side' }, hardness: 1, tool: 'spade', sound: 'dirt', color: 0xb02a1e });
def(B.C4, { name: 'C4', tex: { top: 'c4_top', bottom: 'c4_top', side: 'c4_side' }, hardness: 1, tool: 'spade', sound: 'dirt', color: 0x2a6a2a });
def(B.SLIME, { name: 'Space Goo', tex: 'slime', light: 15, emissive: 0.7, hardness: 4, tier: 6, sound: 'dirt', color: 0x40c040 });
def(B.SPACE_ROCK, { name: 'Space Rock', tex: 'space_rock', hardness: 4, tier: 6, sound: 'stone', color: 0x4a4a50 });
def(B.SPACE_ROCK_BUILT, { name: 'Space Rock', tex: 'space_rock', hardness: 4, tier: 6, sound: 'stone', color: 0x4a4a50 });
def(B.FIXED_LANTERN, { name: 'Lantern', tex: { top: 'lantern_top', bottom: 'lantern_top', side: 'lantern' }, light: 15, emissive: 0.85, breakable: false, sound: 'glass', color: 0xffd060 });
// a door is a panel, not a cube; shut, it stops you (and the dead) like a wall
for (const [id, upper, open] of [[B.DOOR_LOWER_X, 0, 0], [B.DOOR_LOWER_Z, 0, 0], [B.DOOR_UPPER_X, 1, 0], [B.DOOR_UPPER_Z, 1, 0],
  [B.DOOR_LOWER_OPEN_X, 0, 1], [B.DOOR_LOWER_OPEN_Z, 0, 1], [B.DOOR_UPPER_OPEN_X, 1, 1], [B.DOOR_UPPER_OPEN_Z, 1, 1]]) {
  def(id, { name: 'Door', tex: upper ? 'door_upper' : 'door_lower', solid: !open, opaque: false, render: 'door', hardness: 1, tool: 'none', sound: 'wood', color: 0x8a6438, drop: B.DOOR_LOWER_X });
}

export const BLOCKS = defs;
export const BLOCK_COUNT = defs.length;
export const isTorch = (id) => id === B.TORCH || (id >= B.TORCH_PX && id <= B.TORCH_NZ);
export const isDoor = (id) => id >= B.DOOR_LOWER_X && id <= B.DOOR_UPPER_OPEN_Z;
// a door's parts: is it the upper half, is it open, does its panel run along x
export const DOOR = (id) => ({ upper: [B.DOOR_UPPER_X, B.DOOR_UPPER_Z, B.DOOR_UPPER_OPEN_X, B.DOOR_UPPER_OPEN_Z].includes(id),
  open: id >= B.DOOR_LOWER_OPEN_X, alongX: [B.DOOR_LOWER_X, B.DOOR_UPPER_X, B.DOOR_LOWER_OPEN_X, B.DOOR_UPPER_OPEN_X].includes(id) });
// the door block with these parts
export function doorBlock(upper, open, alongX) {
  if (open) return upper ? (alongX ? B.DOOR_UPPER_OPEN_X : B.DOOR_UPPER_OPEN_Z) : (alongX ? B.DOOR_LOWER_OPEN_X : B.DOOR_LOWER_OPEN_Z);
  return upper ? (alongX ? B.DOOR_UPPER_X : B.DOOR_UPPER_Z) : (alongX ? B.DOOR_LOWER_X : B.DOOR_LOWER_Z);
}

// Flat lookup tables for the hot loops in the mesher and the physics.
export const OPAQUE = new Uint8Array(256);
export const SOLID = new Uint8Array(256);
export const LIGHT = new Uint8Array(256);
export const RENDER = new Uint8Array(256); // 0 none, 1 opaque, 2 cutout, 3 translucent, 4 torch, 5 door
export const FACES = new Uint8Array(256 * 6);
export const EMISSIVE = new Uint8Array(256);
const R = { none: 0, opaque: 1, cutout: 2, translucent: 3, torch: 4, door: 5 };
for (const d of defs) {
  if (!d) continue;
  OPAQUE[d.id] = d.opaque ? 1 : 0;
  SOLID[d.id] = d.solid ? 1 : 0;
  LIGHT[d.id] = d.light;
  RENDER[d.id] = R[d.render];
  EMISSIVE[d.id] = Math.round(d.emissive * 255);
  for (let f = 0; f < 6; f++) FACES[d.id * 6 + f] = d.faces[f];
}

// World dimensions
export const CHUNK = 16;
export const HEIGHT = 128;
export const COLUMN_SIZE = CHUNK * CHUNK * HEIGHT;
// index inside a column: x | z << 4 | y << 8 (each horizontal layer is contiguous)
export const idx = (x, y, z) => x | (z << 4) | (y << 8);
