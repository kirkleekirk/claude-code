// Save / load to localStorage. World buildings are regenerated identically
// each run, so only what changed is stored: edited or player-built
// structures, searched containers, claims, inventory and custom designs.
import { Structure, bumpStructureIds } from './building/structure.js';
import { registerShape, registerStyle } from './building/defs.js';

const KEY = 'holdfast.save.v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
}

export function saveGame(game) {
  const w = game.world;
  const data = {
    v: 1,
    time: game.sky.time, day: game.day, weather: game.sky.weather,
    player: { x: game.player.pos.x, y: game.player.pos.y, z: game.player.pos.z, health: game.player.health, weapon: game.player.weapon.kind },
    inventory: game.inventory.toJSON(),
    claims: game.claims.toJSON(),
    structures: w.structures.filter((S) => S.owner || S.modified || S.playerBuilt).map((S) => S.toJSON()),
    searched: w.structures.map((S) => [S.id, S.props.map((p, i) => (p.searched ? i : -1)).filter((i) => i >= 0)]).filter((e) => e[1].length),
    doors: w.structures.map((S) => [S.id, S.doors.map((d, i) => (d.broken ? i : -1)).filter((i) => i >= 0)]).filter((e) => e[1].length),
    carLoot: (w.carLoot || []).map((c, i) => (c.searched ? i : -1)).filter((i) => i >= 0),
    customShapes: game.customShapes, customStyles: game.customStyles,
    kills: game.zombies ? game.zombies.kills : 0,
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
  const w = game.world;
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
    if (data.player.weapon === 'gun' && game.inventory.weapons.pistol) game.setWeapon('pistol');
  }
  if (game.zombies) game.zombies.kills = data.kills || 0;
  return true;
}
