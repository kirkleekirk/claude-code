// Explosions, by the original's rules (its Explosive class): TNT and C4 set off by a fuse or a
// bullet, rockets, grenades, and the laser bolts that break the block they stop in.
//
// Every machine shows an explosion and takes its own share of it: its player's hurt (unless a
// wall's in the way), and its own dead (each player's machine runs the dead that came for them).
// The machine that set it off takes the blocks out, and the others hear of it as block changes.

import * as THREE from 'three';
import { B, BLOCKS, SOLID, HEIGHT, isDoor, DOOR } from '../world/blocks.js';
import { HARDNESS, DAMAGE_THROUGH, BLAST_PROOF } from '../entities/cmz/types.js';

export const EXPLOSIVE = { TNT: 0, C4: 1, ROCKET: 2, LASER: 3, GRENADE: 4 };
const { TNT, C4, ROCKET } = EXPLOSIVE;
// by kind: how far out blocks go (a cube this many blocks out), how far the dead are hurt, how
// far you are, and how close is death outright (cDestructionRanges, cEnemyDamageRanges,
// cDamageRanges, cKillRanges)
const DESTRUCTION = [2, 3, 1, 0, 1];
const ENEMY_RANGE = [12, 24, 12, 1, 8];
const DAMAGE_RANGE = [6, 12, 6, 1, 5];
const KILL_RANGE = [3, 6, 3, 1, 2.5];
// a lit TNT or C4 goes off this many seconds later
export const FUSE = 4;
// the item it counts as, for who killed what (79 TNT, 80 C4: the original's own ids)
const KIND_ITEM = { [TNT]: 'tnt', [C4]: 'c4' };

// what no explosion breaks; and what TNT, a laser bolt and a grenade leave standing too
// (the original's BreakLookup). Lava stays, as no one can dig it here.
const NEVER = new Uint8Array(256), SPARED = new Uint8Array(256);
for (const id of [B.AIR, B.FIXED_LANTERN, B.BEDROCK, B.TOWER_STONE, B.SLIME, B.SPACE_ROCK, B.SPACE_ROCK_BUILT, B.LAVA]) NEVER[id] = 1;
for (const id of [B.LANTERN, B.GOLD_ORE, B.IRON_ORE, B.COPPER_ORE, B.COAL_ORE, B.DIAMOND_ORE, B.IRON_WALL, B.COPPER_WALL, B.GOLD_WALL,
  B.DIAMOND_WALL, B.BLOODSTONE]) SPARED[id] = 1;
const spares = (type, id) => NEVER[id] || (type !== C4 && type !== ROCKET && SPARED[id]);

// BlockWithinLevelBlastRange: soft blocks (hardness 1 or 2) go within 2 blocks (TNT, 1), hard
// ones (3 or 4) within 1, and nothing harder
function withinReach(dx, dy, dz, id, type) {
  const h = HARDNESS[id];
  const r = h === 3 || h === 4 ? 1 : h === 1 || h === 2 ? (type === TNT ? 1 : 2) : -1;
  return r >= 0 && Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) <= r;
}

const isUpperDoor = (id) => isDoor(id) && DOOR(id).upper;
const isLowerDoor = (id) => isDoor(id) && !DOOR(id).upper;
const key = (x, y, z) => `${x},${y},${z}`;
const _a = new THREE.Vector3();

export class Explosives {
  constructor(game) {
    this.game = game;
    // the fuses this machine lit: { x, y, z, type, t }
    this.fuses = [];
    // the lit ones flashing, wherever they were lit: key -> mesh
    this.flashes = new Map();
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    this.flashGeo = new THREE.BoxGeometry(1.02, 1.02, 1.02);
  }

  dispose() {
    for (const f of this.flashes.values()) { f.m.removeFromParent(); this.game.audio?.stop?.(f.hiss); }
    this.flashes.clear();
    this.flashGeo.dispose();
    this.flashMat.dispose();
  }

  // ---- fuses ---------------------------------------------------------------------------------

  // TNT or C4 at x, y, z lit (by a swing of anything but a spade, or the Activate button): it
  // flashes and goes off four seconds later (InGameHUD.SetFuseForExplosive).
  light(x, y, z) {
    const id = this.game.world.getBlock(x, y, z);
    if (id !== B.TNT && id !== B.C4) return false;
    if (this.fuses.some((f) => f.x === x && f.y === y && f.z === z)) return false;
    this.fuses.push({ x, y, z, type: id === B.C4 ? C4 : TNT, t: FUSE });
    this.flash(x, y, z);
    this.game.online?.fuse(x, y, z);
    return true;
  }

  // someone's fuse burning (the original's ExplosiveFlashEntity): the block flashes, a quarter
  // of a second on and a quarter off (an eighth, after three seconds), smoking, with its hiss
  flash(x, y, z) {
    const k = key(x, y, z);
    if (this.flashes.has(k)) return;
    const m = new THREE.Mesh(this.flashGeo, this.flashMat);
    m.position.set(x + 0.5, y + 0.5, z + 0.5);
    m.renderOrder = 15;
    this.game.scene.add(m);
    this.flashes.set(k, { m, x, y, z, life: 0, t: 0.25, on: true, hiss: this.game.audio?.play?.('Fuse', m.position) ?? null });
  }

  unflash(x, y, z) {
    const k = key(x, y, z), f = this.flashes.get(k);
    if (!f) return;
    f.m.removeFromParent();
    this.game.audio?.stop?.(f.hiss);
    this.flashes.delete(k);
  }

  update(dt) {
    const w = this.game.world;
    for (const [k, f] of this.flashes) {
      f.life += dt;
      f.t -= dt;
      if (f.t <= 0) { f.on = !f.on; f.t += f.life > 3 ? 0.125 : 0.25; }
      f.m.visible = f.on;
      if (Math.random() < dt * 14) this.game.sprites.emit('smoke', f.x + 0.5, f.y + 1.05, f.z + 0.5, { color: 0x8a8682, size: 0.12, grow: 0.5, life: 0.9, spread: 0.3, gravity: -1.6, alpha: 0.45 });
      // (gone, or burning on long after it should have gone off: let go of it)
      const id = w.getBlock(f.x, f.y, f.z);
      if ((id !== B.TNT && id !== B.C4) || f.life > FUSE + 2) { f.m.removeFromParent(); this.game.audio?.stop?.(f.hiss); this.flashes.delete(k); }
    }
    for (let i = this.fuses.length - 1; i >= 0; i--) {
      const f = this.fuses[i];
      f.t -= dt;
      if (f.t > 0) continue;
      this.fuses.splice(i, 1);
      // (dug out or blown up since: nothing)
      const id = w.getBlock(f.x, f.y, f.z);
      if (id === (f.type === C4 ? B.C4 : B.TNT)) this.detonate(f.x, f.y, f.z, f.type, true, true);
    }
  }

  // ---- going off ------------------------------------------------------------------------------

  // TNT or C4 going off (HandleDetonateExplosiveMessage): its block gone, the bang (the first of
  // a chain only), each player's share of it, and on the machine that set it off, the blocks it
  // takes with it, any other explosives among them going off in turn.
  detonate(x, y, z, type, original, mine, shooter = this.game.online?.myId ?? 0) {
    this.unflash(x, y, z);
    const c = _a.set(x + 0.5, y + 0.5, z + 0.5).clone();
    if (original) this.effects(c, true);
    this.splash(c, type, KIND_ITEM[type], shooter);
    if (!mine) return;
    if (original) this.game.online?.boom(c, type, original, KIND_ITEM[type]);
    if (original) this.removeBlocks(x, y, z, type, false, shooter);
  }

  // A rocket or a grenade going off, or a laser bolt stopping (each on the machine of whoever
  // fired it, and from there to everyone): the bang and everyone's share of it; and the blocks.
  blast(c, type, item, mine, shooter = this.game.online?.myId ?? 0) {
    if (type !== EXPLOSIVE.LASER) {
      this.effects(c, true);
      this.splash(c, type, item, shooter);
    }
    if (!mine) return;
    this.game.online?.boom(c, type, true, item);
    this.removeBlocks(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z), type, type === EXPLOSIVE.LASER, shooter);
  }

  // The original's FindBlocksToRemove: a cube round each explosion (by its kind), what's soft
  // enough and not spared going, any TNT or C4 in it going off in turn (no bang of its own), a
  // crate spilling what's in it, a door going whole, and what hangs on what goes falling.
  removeBlocks(x0, y0, z0, type0, digFx, shooter) {
    const g = this.game, w = g.world;
    const gone = new Map(), hangers = new Map();
    const queue = [{ x: x0, y: y0, z: z0, type: type0 }];
    if (type0 === TNT || type0 === C4) gone.set(key(x0, y0, z0), [x0, y0, z0]);
    while (queue.length) {
      const e = queue.shift(), r = DESTRUCTION[e.type];
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) {
        const x = e.x + dx, y = e.y + dy, z = e.z + dz;
        if (y < 0 || y >= HEIGHT || !w.isLoaded(x, z)) continue;
        const k = key(x, y, z);
        if (gone.has(k)) continue;
        const id = w.getBlock(x, y, z);
        if (id === B.TNT || id === B.C4) {
          const t = id === B.C4 ? C4 : TNT;
          queue.push({ x, y, z, type: t });
          gone.set(k, [x, y, z]);
          this.detonate(x, y, z, t, false, false, shooter);
          g.online?.boom(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), t, false, KIND_ITEM[t]);
          continue;
        }
        if (spares(e.type, id) || !withinReach(dx, dy, dz, id, e.type) || isUpperDoor(id)) continue;
        gone.set(k, [x, y, z]);
        if (id === B.CRATE) g.crates?.spill(x, y, z);
        this.hangersOf(x, y, z, hangers);
        if (isLowerDoor(id)) {
          const up = key(x, y + 1, z);
          if (!gone.has(up)) { gone.set(up, [x, y + 1, z]); this.hangersOf(x, y + 1, z, hangers); }
        }
      }
    }
    // what hung on what's gone falls, as what it is (ProcessExplosionDependents)
    for (const [k, [x, y, z, id]] of hangers) {
      if (gone.has(k)) continue;
      gone.set(k, [x, y, z]);
      g.drops.spawn(isDoor(id) ? 'door' : 'torch', 1, x + 0.5, y + 0.5, z + 0.5);
      if (isLowerDoor(id)) gone.set(key(x, y + 1, z), [x, y + 1, z]);
    }
    g.editKind = 2;
    try {
      for (const [x, y, z] of gone.values()) {
        const id = w.getBlock(x, y, z);
        if (id === B.AIR) continue;
        w.setBlock(x, y, z, B.AIR);
        if (digFx) this.digEffects(x, y, z, id);
      }
    } finally { g.editKind = 0; }
  }

  // RememberDependentObjects: the torches on a block, and a door standing on it
  hangersOf(x, y, z, out) {
    const w = this.game.world;
    for (const [dx, dy, dz, t] of [[0, 1, 0, B.TORCH], [1, 0, 0, B.TORCH_NX], [-1, 0, 0, B.TORCH_PX], [0, 0, 1, B.TORCH_NZ], [0, 0, -1, B.TORCH_PZ]]) {
      if (w.getBlock(x + dx, y + dy, z + dz) === t) out.set(key(x + dx, y + dy, z + dz), [x + dx, y + dy, z + dz, t]);
    }
    const above = w.getBlock(x, y + 1, z);
    if (isLowerDoor(above)) out.set(key(x, y + 1, z), [x, y + 1, z, above]);
  }

  // ---- what it does to you and the dead ---------------------------------------------------------

  // ApplySplashDamageToLocalPlayerAndZombies: the player, close enough, dies outright, and
  // further out is hurt less the further off and the more there is in the way; the dead within
  // their range take up to 12 (all of it in the nearer half).
  splash(c, type, item, shooter) {
    const g = this.game, p = g.player;
    if (!p.dead) {
      _a.set(p.pos.x, p.pos.y + 1, p.pos.z);
      const d = _a.distanceTo(c), kill = KILL_RANGE[type], range = DAMAGE_RANGE[type];
      if (d < range) {
        const f = d < kill ? 1 : this.through(c, _a) * (1 - (d - kill) / (range - kill));
        if (f > 0) p.hurt(f * p.maxHealth, c, 'explosion');
      }
    }
    const r = ENEMY_RANGE[type], half = r / 2;
    for (const e of g.enemies?.list || []) {
      if (e.dead || e.gone) continue;
      const d = e.pos.distanceTo(c);
      if (d >= r) continue;
      const dmg = d < half ? 12 : 12 * (1 - (d - half) / (r - half));
      if (e.takeExplosiveDamage(dmg)) g.killedBy(e, shooter, item);
    }
  }

  // How much of the blast gets from a to b (the original's DamageLOSProbe): each metre through
  // a block takes off what the block doesn't let through; some blocks stop it outright.
  through(a, b) {
    const w = this.game.world;
    let m = 1;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return 1;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    let x = Math.floor(a.x), y = Math.floor(a.y), z = Math.floor(a.z);
    const sx = ux > 0 ? 1 : -1, sy = uy > 0 ? 1 : -1, sz = uz > 0 ? 1 : -1;
    const tdx = ux !== 0 ? Math.abs(1 / ux) : Infinity, tdy = uy !== 0 ? Math.abs(1 / uy) : Infinity, tdz = uz !== 0 ? Math.abs(1 / uz) : Infinity;
    let tx = ux !== 0 ? ((ux > 0 ? x + 1 - a.x : a.x - x) * tdx) : Infinity;
    let ty = uy !== 0 ? ((uy > 0 ? y + 1 - a.y : a.y - y) * tdy) : Infinity;
    let tz = uz !== 0 ? ((uz > 0 ? z + 1 - a.z : a.z - z) * tdz) : Infinity;
    let t = 0;
    for (let n = 0; n < 256 && t < len; n++) {
      const next = Math.min(tx, ty, tz, len);
      const id = w.getBlock(x, y, z);
      if (SOLID[id] && next > t) {
        if (BLAST_PROOF[id]) return 0;
        const lose = (1 - DAMAGE_THROUGH[id]) * (next - t);
        if (lose > 0) { m *= Math.max(0, Math.min(1, 1 - lose)); if (m <= 0) return 0; }
      }
      t = next;
      if (tx <= ty && tx <= tz) { x += sx; tx += tdx; } else if (ty <= tz) { y += sy; ty += tdy; } else { z += sz; tz += tdz; }
    }
    return m;
  }

  // ---- how it looks and sounds ------------------------------------------------------------------

  // AddEffects: the bang, a flash, a puff of fire and of smoke, and (rock: true) rocks flying
  effects(c, rock) {
    const s = this.game.sprites;
    this.game.audio?.play?.('Explosion', c);
    s.emit('flame', c.x, c.y, c.z, { color: 0xfff2c8, size: 2.2, grow: 2.0, life: 0.15, spread: 0, alpha: 0.85 });
    for (let i = 0; i < 16; i++) s.emit('flame', c.x, c.y, c.z, { color: i % 3 ? 0xff8a2a : 0xffc65a, size: 0.6, grow: 1.3, life: 0.4 + Math.random() * 0.3, spread: 7, drag: 3, alpha: 0.75 });
    for (let i = 0; i < 14; i++) s.emit('smoke', c.x, c.y + 0.3, c.z, { color: 0x4a4744, size: 1.0, grow: 2.4, life: 1.6 + Math.random() * 1.2, spread: 4, drag: 1.8, gravity: -0.8, alpha: 0.55 });
    if (rock) for (let i = 0; i < 22; i++) s.emit('dust', c.x, c.y, c.z, { color: 0x6a645c, size: 0.12, life: 1.2, spread: 11, gravity: 14, drag: 0.4, alpha: 0.95 });
    // the light of it, a moment
    this.game.lightFlash?.(c, 0.35);
  }

  // AddDigEffects: a block knocked out (a laser bolt's)
  digEffects(x, y, z, id) {
    const g = this.game;
    g.audio?.play?.('GroundCrash', new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5));
    g.debris?.burst(x + 0.5, y + 0.5, z + 0.5, BLOCKS[id].color, 12, 1);
    for (let i = 0; i < 4; i++) g.sprites.emit('smoke', x + 0.5, y + 0.5, z + 0.5, { color: 0x6a6662, size: 0.5, grow: 1.2, life: 0.9, spread: 1.6, alpha: 0.5 });
  }
}
