// Cosmetic catalog (all original designs) + daily item shop rotation.
import { RNG } from '../core/rng.js';

export const RARITIES = {
  uncommon: { name: 'Uncommon', color: '#5fcf3a', bg: ['#4bb026', '#1f5e10'], price: 500 },
  rare: { name: 'Rare', color: '#3a9ae8', bg: ['#3aa0f0', '#163e7a'], price: 900 },
  epic: { name: 'Epic', color: '#b54ae8', bg: ['#c060f0', '#4a1a78'], price: 1400 },
  legendary: { name: 'Legendary', color: '#f0a020', bg: ['#f5b23a', '#8a3a10'], price: 2000 },
};
export const TYPE_NAMES = { outfit: 'Outfit', backbling: 'Back Bling', pickaxe: 'Harvesting Tool', glider: 'Glider', emote: 'Emote', wrap: 'Wrap' };

const O = (id, name, rarity, outfit, desc, set) => ({ id, type: 'outfit', name, rarity, outfit, desc, set });
export const COSMETICS = [
  // ---- outfits ----
  O('farmhand', 'Farmhand', 'uncommon', { skin: 0xe0ac80, shirt: 0x3a6aa8, shirtPattern: 'plaid', shirt2: 0x1e3a5a, pants: 0x3a4a6a, boots: 0x5a3a24, hat: 'cap', hatColor: 0xc0392b, hair: 'short', hairColor: 0x4a2a14 }, 'Up before the rooster. Ready for anything.', 'Hollow Creek'),
  O('prairie', 'Prairie Rose', 'uncommon', { skin: 0xc68a62, shirt: 0xb83a32, shirtPattern: 'plaid', shirt2: 0x4a1a14, pants: 0x3a4a6a, boots: 0x6a4a2a, hat: 'straw', hair: 'long', hairColor: 0x8a5a2a, face: 'grin' }, 'Born on Route 9, raised in the corn.', 'Hollow Creek'),
  O('trucker', 'Long Haul Lou', 'uncommon', { skin: 0xd8a070, shirt: 0x6a7a3a, shirtPattern: 'plaid', shirt2: 0x2a3a1a, pants: 0x4a4a4a, boots: 0x3a2a1a, hat: 'cap', hatColor: 0x2a4a7a, vest: 0x3a3a3a, face: 'beard', hair: 'short', hairColor: 0x3a2a1a }, '1.2 million miles. Not stopping now.', 'Route 9'),
  O('keeper', 'Keeper Morrow', 'uncommon', { skin: 0xe8b890, shirt: 0x1e2e4a, pants: 0x2a2a3a, boots: 0x1a1a1a, hat: 'beanie', hatColor: 0x8a2a2a, face: 'beard', hairColor: 0x8a8a8a }, 'Keeps the light burning at Lighthouse Point.', 'Pelican Harbor'),
  O('moonshiner', 'Hooch Hollis', 'uncommon', { skin: 0xd09068, shirt: 0xe8e0d0, pants: 0x5a4a3a, overalls: 0x4a5a7a, boots: 0x3a2a1a, hat: 'straw', face: 'beard', hairColor: 0x5a3a1a }, 'His still is his castle.', 'Cedar Ridge'),
  O('lena', 'Last Light Lena', 'uncommon', { skin: 0x8a5a3a, shirt: 0xc0392b, pants: 0x2a2a2a, boots: 0x3a2a1a, hair: 'ponytail', hairColor: 0x1a1a1a, gloves: 0x2a2a2a }, 'Never misses the last helicopter.', 'Survivors'),
  O('sheriff', 'Sheriff Dalton', 'rare', { skin: 0xd8a070, shirt: 0xc8b088, pants: 0x5a4a32, boots: 0x3a2414, hat: 'cowboy', hatColor: 0x6a4a2a, vest: 0x4a3a2a, face: 'angry', bandana: null }, 'The law in Millbrook. What is left of it.', 'Millbrook'),
  O('bayou', 'Bayou Belle', 'rare', { skin: 0x9a6a48, shirt: 0x2a8a7a, pants: 0x3a3a2a, boots: 0x2a3a2a, hat: 'bucket', hatColor: 0x6a7a3a, hair: 'long', hairColor: 0x2a1a10, face: 'grin' }, 'Knows every channel in the marsh.', 'Bellerose'),
  O('beekeeper', 'Honey Bee Hattie', 'rare', { skin: 0xe8c098, shirt: 0xf0ece0, pants: 0xe8e0d0, boots: 0x6a5a3a, hat: 'veil', gloves: 0xe8c040, hair: 'ponytail', hairColor: 0xd8a040 }, 'The bees never turned. Probably.', 'Hollow Creek'),
  O('linebacker', 'Friday Night', 'rare', { skin: 0x7a4a2a, shirt: 0xc0392b, pants: 0xf0f0f0, boots: 0x1a1a1a, hat: 'helmet', hatColor: 0xc0392b, build: 1.15 }, 'Millbrook Mustangs, #54. Undefeated.', 'Millbrook'),
  O('buck', 'Buck Wilde', 'rare', { skin: 0xd8a070, shirt: 0x8a5a2a, shirtPattern: 'plaid', shirt2: 0x3a2a1a, pants: 0x4a3a2a, boots: 0x3a2a1a, hat: 'antlers', hair: 'curly', hairColor: 0x6a4a2a, face: 'grin' }, 'Hunting season never ended.', 'Cedar Ridge'),
  O('rodeo', 'Rodeo Rita', 'rare', { skin: 0xe8b890, shirt: 0xe86aa0, pants: 0x3a4a7a, boots: 0xc0392b, hat: 'cowboy', hatColor: 0xf0f0f0, hair: 'long', hairColor: 0xe8c060, face: 'grin', bandana: 0xf0f0f0 }, 'Eight seconds is all she needs.', 'County Fair'),
  O('scarecrow', 'Patchwork Jack', 'epic', { skin: 0xc8a870, face: 'sack', shirt: 0x8a3a2a, shirtPattern: 'plaid', shirt2: 0x3a2a1a, overalls: 0x5a4a3a, pants: 0x5a4a3a, boots: 0x3a2a1a, hat: 'straw', gloves: 0xd8b860 }, 'The crows were the first to leave.', 'Harvest Moon'),
  O('hazmat', 'Hazmat Hank', 'epic', { skin: 0xe0ac80, shirt: 0xe8c832, pants: 0xe8c832, boots: 0x1a1a1a, gloves: 0x1a1a1a, hat: 'gasmask', build: 1.05 }, 'Came to contain the Greenfall. Stayed to survive it.', 'Greenfall'),
  O('pumpkin', 'Pumpkin Pete', 'epic', { skin: 0x8a6a4a, face: 'pumpkin', shirt: 0x2a2a2a, overalls: 0x6a3a8a, pants: 0x6a3a8a, boots: 0x1a1a1a, gloves: 0x3a6a2a }, 'Carved himself a new head.', 'Harvest Moon'),
  O('ranger', 'Night Ranger', 'epic', { skin: 0x5a3a2a, shirt: 0x2a3a2a, pants: 0x1a2a1a, boots: 0x1a1a1a, vest: 0x3a4a3a, hat: 'helmet', hatColor: 0x2a3a2a, gloves: 0x1a1a1a }, 'Owns the dark. Hates the green.', 'Greenfall'),
  O('marshwitch', 'Marsh Witch', 'epic', { skin: 0x9ab88a, shirt: 0x4a2a5a, pants: 0x2a1a2a, boots: 0x1a1a1a, hat: 'hood', hatColor: 0x3a1a4a, face: 'angry', eye: '#7aff5a' }, 'The swamp whispers. She listens.', 'Bellerose'),
  O('cornking', 'Corn King', 'legendary', { skin: 0xe0ac80, shirt: 0xe8b830, pants: 0x3a6a2a, boots: 0x6a4a1a, hat: 'crown', hair: 'long', hairColor: 0xf0d060, gloves: 0xf0d060, face: 'grin', build: 1.08 }, 'Ruler of the endless rows. Bow, or be harvested.', 'Harvest Moon'),
  O('plague', 'Dr. Mire', 'legendary', { skin: 0xd8d0c0, shirt: 0x1a1a1a, pants: 0x1a1a1a, boots: 0x2a1a1a, gloves: 0x3a2a1a, hat: 'plague', vest: 0x2a2a2a }, 'Has a cure. Will not share it.', 'Greenfall'),
  O('reaper', 'Green Reaper', 'legendary', { skin: 0x3a4a3a, shirt: 0x141814, pants: 0x101410, boots: 0x0a0a0a, hat: 'hood', hatColor: 0x101410, face: 'angry', eye: '#7aff5a', gloves: 0x101410 }, 'Arrives every night with the green sky.', 'Greenfall'),
  // ---- back blings ----
  { id: 'bb_pack', type: 'backbling', name: 'Rucksack', rarity: 'uncommon', style: 'pack', desc: 'Holds everything but hope.' },
  { id: 'bb_haybale', type: 'backbling', name: 'Hay Day', rarity: 'uncommon', style: 'haybale', desc: 'Comfy. Itchy.' },
  { id: 'bb_lantern', type: 'backbling', name: 'Porch Light', rarity: 'rare', style: 'lantern', desc: 'Leave it on for me.' },
  { id: 'bb_radio', type: 'backbling', name: 'Field Radio', rarity: 'rare', style: 'radio', desc: 'Still picking up the evac channel.' },
  { id: 'bb_guitar', type: 'backbling', name: 'Old Six-String', rarity: 'rare', style: 'guitar', desc: 'Three chords and the truth.' },
  { id: 'bb_beehive', type: 'backbling', name: 'Hive Mind', rarity: 'epic', style: 'beehive', desc: 'Buzzing with ideas.' },
  { id: 'bb_gascan', type: 'backbling', name: 'Full Tank', rarity: 'uncommon', style: 'gascan', desc: 'For the long drive out.' },
  { id: 'bb_crate', type: 'backbling', name: 'Supply Run', rarity: 'uncommon', style: 'crate', desc: 'Fragile. This side up.' },
  { id: 'bb_wings', type: 'backbling', name: 'Nightwings', rarity: 'epic', style: 'wings', desc: 'Not for flying. Mostly.' },
  { id: 'bb_skull', type: 'backbling', name: 'Green Glow', rarity: 'legendary', style: 'skull', desc: 'Its eyes follow the horde.' },
  // ---- harvesting tools ----
  { id: 'pk_shovel', type: 'pickaxe', name: 'Rusty Shovel', rarity: 'uncommon', style: 'shovel', desc: 'Dig in.' },
  { id: 'pk_pitchfork', type: 'pickaxe', name: 'Pitchfork', rarity: 'rare', style: 'pitchfork', desc: 'Torches sold separately.' },
  { id: 'pk_axe', type: 'pickaxe', name: 'Fire Axe', rarity: 'rare', style: 'axe', desc: 'Break glass in case of horde.' },
  { id: 'pk_sickle', type: 'pickaxe', name: 'Harvest Hook', rarity: 'uncommon', style: 'sickle', desc: 'Reap what you sow.' },
  { id: 'pk_anchor', type: 'pickaxe', name: 'Dead Weight', rarity: 'epic', style: 'anchor', desc: 'Salvaged from Pelican Harbor.' },
  { id: 'pk_oar', type: 'pickaxe', name: 'Paddle Out', rarity: 'uncommon', style: 'oar', desc: 'Up the creek, with a paddle.' },
  { id: 'pk_guitar', type: 'pickaxe', name: 'Power Chord', rarity: 'epic', style: 'guitar', desc: 'Encore!' },
  { id: 'pk_scythe', type: 'pickaxe', name: 'Greenfall Scythe', rarity: 'legendary', style: 'scythe', desc: 'Forged in the green light.' },
  { id: 'pk_bat', type: 'pickaxe', name: 'Tailgater', rarity: 'rare', style: 'bat', desc: 'Batter up.' },
  // ---- gliders ----
  { id: 'gl_canvas', type: 'glider', name: 'Canvas Kite', rarity: 'uncommon', style: 'canvas', desc: 'Homemade. Mostly safe.' },
  { id: 'gl_barn', type: 'glider', name: 'Barnstormer', rarity: 'rare', style: 'barn', desc: 'Red as a barn door.' },
  { id: 'gl_patch', type: 'glider', name: 'Quilted Wing', rarity: 'uncommon', style: 'patch', desc: 'Grandma stitched it.' },
  { id: 'gl_crop', type: 'glider', name: 'Crop Duster', rarity: 'epic', style: 'crop', desc: 'Low and slow.' },
  { id: 'gl_bat', type: 'glider', name: 'Dusk Wing', rarity: 'epic', style: 'bat', desc: 'Silent descent.' },
  { id: 'gl_toxic', type: 'glider', name: 'Green Front', rarity: 'legendary', style: 'toxic', desc: 'Ride the storm in.' },
  { id: 'gl_balloon', type: 'glider', name: 'County Fair', rarity: 'rare', style: 'balloon', desc: 'Step right up.' },
  // ---- emotes ----
  { id: 'em_wave', type: 'emote', name: 'Howdy', rarity: 'uncommon', anim: 'wave', desc: 'A friendly hello.' },
  { id: 'em_hoedown', type: 'emote', name: 'Hoedown', rarity: 'rare', anim: 'hoedown', desc: 'Kick up some dust.' },
  { id: 'em_twostep', type: 'emote', name: 'Two-Step', rarity: 'uncommon', anim: 'twostep', desc: 'Slow, slow, quick-quick.' },
  { id: 'em_fiddle', type: 'emote', name: 'Air Fiddle', rarity: 'epic', anim: 'fiddle', desc: 'The devil went down to Bellerose.' },
  { id: 'em_chicken', type: 'emote', name: 'Barnyard Strut', rarity: 'rare', anim: 'chicken', desc: 'Bawk.' },
  { id: 'em_salute', type: 'emote', name: 'Respect', rarity: 'uncommon', anim: 'salute', desc: 'Pay your respects.' },
  { id: 'em_lasso', type: 'emote', name: 'Yeehaw', rarity: 'epic', anim: 'lasso', desc: 'Rope the horde.' },
  { id: 'em_robot', type: 'emote', name: 'Tin Man', rarity: 'rare', anim: 'robot', desc: 'Beep boop, partner.' },
  // ---- wraps ----
  { id: 'wr_none', type: 'wrap', name: 'Factory', rarity: 'uncommon', wrap: null, desc: 'No frills.' },
  { id: 'wr_rust', type: 'wrap', name: 'Barn Rust', rarity: 'uncommon', wrap: { base: 0x8a4a2a, accent: 0xc0602a }, desc: 'Weathered.' },
  { id: 'wr_camo', type: 'wrap', name: 'Woodland', rarity: 'rare', wrap: { base: 0x4a5a2a, accent: 0x6a5a3a }, desc: 'Blend in.' },
  { id: 'wr_toxic', type: 'wrap', name: 'Greenfall', rarity: 'legendary', wrap: { base: 0x1a2a1a, accent: 0x7aff5a, glow: true }, desc: 'It glows. That is bad.' },
  { id: 'wr_gilded', type: 'wrap', name: 'Gilded', rarity: 'epic', wrap: { base: 0xc8a030, accent: 0xf0d060 }, desc: 'Solid gold. Probably.' },
  { id: 'wr_bayou', type: 'wrap', name: 'Bayou Night', rarity: 'rare', wrap: { base: 0x1a3a4a, accent: 0x5ad8c8 }, desc: 'Moonlight on the water.' },
  { id: 'wr_candy', type: 'wrap', name: 'Fair Candy', rarity: 'epic', wrap: { base: 0xe86aa0, accent: 0x6ad8f0 }, desc: 'Cotton candy for your rifle.' },
];
export const BY_ID = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const DEFAULT_OWNED = ['farmhand', 'prairie', 'bb_pack', 'pk_shovel', 'gl_canvas', 'em_wave', 'wr_none'];
export const DEFAULT_EQUIPPED = { outfit: 'farmhand', backbling: 'bb_pack', pickaxe: 'pk_shovel', glider: 'gl_canvas', emote: 'em_wave', wrap: 'wr_none' };
export const priceOf = (c) => c.price ?? (RARITIES[c.rarity].price * (c.type === 'outfit' ? 1 : c.type === 'emote' ? 0.5 : c.type === 'wrap' ? 0.4 : 0.6)) | 0;

// The shop rotates every day at 00:00 UTC.
export function shopForDay(dayIndex) {
  const r = new RNG(9001 + dayIndex * 7919);
  const pool = COSMETICS.filter((c) => !DEFAULT_OWNED.includes(c.id));
  const outfits = r.shuffle(pool.filter((c) => c.type === 'outfit'));
  const featured = outfits.slice(0, 2).map((o) => {
    // bundle-ish: matching back bling suggestion
    return o;
  });
  const rest = r.shuffle(pool.filter((c) => !featured.includes(c)));
  const daily = [];
  for (const c of rest) { if (daily.length >= 6) break; if (daily.filter((d) => d.type === c.type).length >= 2) continue; daily.push(c); }
  return { featured, daily };
}
export function currentDay() { return Math.floor(Date.now() / 86400000); }
export function msToNextDay() { return 86400000 - (Date.now() % 86400000); }

export function cosmeticsFor(equipped) {
  const o = BY_ID[equipped.outfit] || BY_ID.farmhand;
  return {
    outfit: o.outfit,
    cosmetics: { backbling: BY_ID[equipped.backbling]?.style || 'pack', pickaxe: BY_ID[equipped.pickaxe]?.style || 'shovel', glider: BY_ID[equipped.glider]?.style || 'canvas', wrap: BY_ID[equipped.wrap]?.wrap || null },
    emote: BY_ID[equipped.emote]?.anim || 'wave',
  };
}
export function randomOutfit(rng) {
  const outfits = COSMETICS.filter((c) => c.type === 'outfit');
  const bbs = COSMETICS.filter((c) => c.type === 'backbling');
  const pks = COSMETICS.filter((c) => c.type === 'pickaxe');
  const gls = COSMETICS.filter((c) => c.type === 'glider');
  return { outfit: rng.pick(outfits).outfit, cosmetics: { backbling: rng.pick(bbs).style, pickaxe: rng.pick(pks).style, glider: rng.pick(gls).style } };
}
