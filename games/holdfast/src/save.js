// Save / load to localStorage. World buildings are regenerated identically
// each run, so only what changed is stored: edited or player-built
// structures, searched containers, claims, inventory and custom designs.
import { Structure, bumpStructureIds } from './building/structure.js';
import { registerShape, registerStyle } from './building/defs.js';
import { FARM_SHIFT, NEW_LAND } from './world/terrain.js';

// Map versions: 2 = the farm country moved FARM_SHIFT west, with the land
// around Carver's Crossing in between. An older save's things out west move
// with it.
const MAP_VERSION = 2;
function migrateWest(d) {
  const west = (x) => typeof x === 'number' && x < NEW_LAND.x1;
  const mv = (o) => { if (o && west(o.x)) o.x -= FARM_SHIFT; };
  mv(d.player);
  for (const c of d.claims || []) if (west(c.vx * 2)) c.vx -= FARM_SHIFT / 2;
  for (const j of d.structures || []) if (west(j.ox)) j.ox -= FARM_SHIFT;
  const soc = d.society;
  if (soc) {
    for (const m of soc.members || []) mv(m);
    for (const c of soc.raiders || []) mv(c);
    for (const m of (soc.missions && soc.missions.list) || []) {
      if (m.at) { if (Array.isArray(m.at)) { if (west(m.at[0])) m.at[0] -= FARM_SHIFT; } else mv(m.at); }
    }
  }
  d.carLoot = [];
}

const KEY = 'holdfast.save.v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
}

// where you are; behind the wheel, the spot you'd step out onto
function playerSpot(game) {
  const p = game.player, vs = game.vehicles;
  let [x, y, z] = [p.pos.x, p.pos.y, p.pos.z];
  if (vs && vs.driving) [x, y, z] = vs.exitSpot(vs.driving, 1);
  return { x, y, z, health: p.health, weapon: p.weapon.kind };
}

export function saveGame(game) {
  const w = game.world;
  const data = {
    v: 1, map: MAP_VERSION,
    time: game.sky.time, day: game.day, weather: game.sky.weather,
    profile: game.profile,
    player: playerSpot(game),
    inventory: game.inventory.toJSON(),
    claims: game.claims.toJSON(),
    structures: w.structures.filter((S) => S.owner || S.modified || S.playerBuilt).map((S) => S.toJSON()),
    searched: w.structures.map((S) => [S.id, S.props.map((p, i) => (p.searched ? i : -1)).filter((i) => i >= 0)]).filter((e) => e[1].length),
    doors: w.structures.map((S) => [S.id, S.doors.map((d, i) => (d.broken ? i : -1)).filter((i) => i >= 0)]).filter((e) => e[1].length),
    carLoot: (w.carLoot || []).map((c, i) => (c.searched ? i : -1)).filter((i) => i >= 0),
    customShapes: game.customShapes, customStyles: game.customStyles,
    kills: game.zombies ? game.zombies.kills : 0,
    society: game.society ? game.society.toJSON() : null,
    vehicles: game.vehicles ? game.vehicles.toJSON() : null,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function loadGame(game) {
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
  if (!data || data.v !== 1) return false;
  if ((data.map || 1) < MAP_VERSION) { migrateWest(data); data.map = MAP_VERSION; }
  const w = game.world;
  if (data.profile && game.applyProfile) game.applyProfile(data.profile, false);
  for (const [id, s] of Object.entries(data.customShapes || {})) { registerShape(id, s); game.customShapes[id] = s; }
  for (const [id, s] of Object.entries(data.customStyles || {})) { registerStyle(id, s); game.customStyles[id] = s; }
  const byId = new Map(w.structures.map((S) => [S.id, S]));
  let maxNum = 0;
  for (const j of data.structures || []) {
    const n = +String(j.id).replace(/\D/g, '');
    if (n > maxNum) maxNum = n;
    const existing = byId.get(j.id);
    if (existing) {
      const fresh = Structure.fromJSON(j);
      for (const k of ['floors', 'walls', 'roofs', 'stairs', 'columns', 'props']) existing[k] = fresh[k];
      Object.assign(existing, { owner: j.owner, oy: j.oy, modified: true });
      w.attach(existing);
    } else {
      const S = Structure.fromJSON(j);
      S.playerBuilt = true;
      w.structures.push(S);
      w.attach(S);
      byId.set(S.id, S);
    }
  }
  bumpStructureIds(maxNum + 1);
  for (const [id, idx] of data.searched || []) {
    const S = byId.get(id);
    if (!S) continue;
    for (const i of idx) if (S.props[i]) S.props[i].searched = true;
    for (const it of S.interact) if (it.prop && it.prop.searched) it.searched = true;
  }
  for (const [id, idx] of data.doors || []) {
    const S = byId.get(id);
    if (!S) continue;
    for (const i of idx) { const d = S.doors[i]; if (d) { d.broken = true; if (!d.open) w.toggleDoor(d); } }
  }
  for (const i of data.carLoot || []) if (w.carLoot && w.carLoot[i]) w.carLoot[i].searched = true;
  if (game.vehicles && Array.isArray(data.vehicles) && data.vehicles.length) { game.vehicles.restore(data.vehicles); game.vehicles.restored = true; }
  game.inventory.load(data.inventory || {});
  // claims (kits were already spent when they were planted)
  for (const c of data.claims || []) {
    const S = byId.get(c.structure);
    const kits = game.inventory.claimKits;
    game.inventory.claimKits = 1;
    const claim = game.claims.plant(c.vx * 2, c.vz * 2, true);
    game.inventory.claimKits = kits;
    if (claim && S && claim.structure !== S) {
      // re-link to the saved structure (e.g. an adopted farmhouse)
      if (claim.structure && !claim.adopted) { w.detach(claim.structure); w.structures.splice(w.structures.indexOf(claim.structure), 1); }
      claim.structure = S; S.owner = claim.id; claim.adopted = c.adopted;
    }
    if (claim) claim.color = c.color;
  }
  game.sky.setTime(data.time ?? 9);
  game.day = data.day || 1;
  if (data.weather) game.sky.setWeather(data.weather, true);
  if (data.player) {
    game.player.spawn(data.player.x, data.player.z, data.player.y);
    game.player.health = Math.max(20, data.player.health || 100);
    game.savedWeaponGun = data.player.weapon === 'gun';
  }
  if (game.zombies) game.zombies.kills = data.kills || 0;
  // claims are back: the camp can find its home before its people arrive
  if (game.society && data.society) {
    game.society.camp.setClaim(game.claims.list[0] || null);
    game.society.loaded = game.society.load(data.society);
  }
  return true;
}
