// Guns behave by stat: spread/bloom from accuracy+handling, falloff by range, ammo, reloads, jams,
// noise radius, cover. Pooled bullets; throwables create zones (fire, smoke, caltrops) or blasts.
import { RAMPS } from '../data/palette.js';
import { FAMILIES } from '../data/guns.js';
import { T, raycast, dist } from './core.js';
import { SOLID } from '../world/tiles.js';

const SPEED = { sidearm: 420, smg: 420, rifle: 520, shotgun: 360, silent: 330, heavy: 500 };
const MAX_BULLETS = 500;

export class Combat {
  constructor(world) {
    this.w = world;
    this.bullets = [];
    for (let i = 0; i < MAX_BULLETS; i++) this.bullets.push({ on: false });
    this.zones = [];
    this.throws = [];
    this.noises = [];
  }

  // weapon: { st, loaded, reloadT, cd, bloom, jammed, gun (S.guns ref | null) }
  tryFire(e, wpn, ax, ay, opts = {}) {
    const st = wpn.st;
    if (wpn.reloadT > 0 || wpn.cd > 0) return false;
    if (wpn.jammed) { this.w.sfx('jam', e); wpn.cd = 0.3; return false; }
    if (wpn.loaded <= 0) { this.w.sfx('empty', e); wpn.cd = 0.25; if (opts.autoReload !== false) this.startReload(e, wpn); return false; }
    if (this.w.noViolenceAt(e.x, e.y)) { if (e.isPlayer) this.w.toast('No guns drawn at the Crossroads.'); wpn.cd = 0.6; return false; }
    if (Math.random() < st.jam) { wpn.jammed = true; this.w.sfx('jam', e); if (e.isPlayer) this.w.toast('Jammed! Press R to clear.'); return false; }
    wpn.loaded--;
    wpn.cd = 60 / st.rpm;
    if (wpn.gun) wpn.gun.dur = Math.max(0, wpn.gun.dur - st.wear);
    const base = Math.atan2(ay - e.y, ax - e.x);
    let spread = (1 - st.acc / 100) * 0.42 + wpn.bloom;
    if (e.moving) spread *= 1.35;
    if (e.sneaking) spread *= 0.7;
    if (opts.accMult) spread /= opts.accMult;
    const pel = st.pellets || 1;
    const sp = SPEED[st.family] || 420;
    for (let i = 0; i < pel; i++) {
      const a = base + (Math.random() - 0.5) * spread * (pel > 1 ? 1.5 * st.spread : 1) * 2;
      const dmg = st.dmg * (opts.dmgMult || 1) * (0.9 + Math.random() * 0.2);
      this.spawn(e.x + Math.cos(base) * 8, e.y + Math.sin(base) * 8, Math.cos(a) * sp * (0.92 + Math.random() * 0.16), Math.sin(a) * sp, dmg, st.range * T, e, wpn.ammoVar || 'std');
    }
    wpn.bloom = Math.min(0.5, wpn.bloom + st.recoil * 0.08);
    const fam = FAMILIES[st.family] || FAMILIES.sidearm;
    this.w.sfx(fam.sound, e);
    if (st.noise > 0) this.noise(e.x, e.y, st.noise * T, e);
    this.w.flash(e.x + Math.cos(base) * 10, e.y + Math.sin(base) * 10, st.flash, e.elevated ? 33 : 9);
    if (st.family !== 'silent' && st.family !== 'shotgun') this.w.R.fx.casing(e.x, e.y, base);
    if (e.isPlayer) { this.w.shake(st.family === 'heavy' ? 2.2 : st.family === 'shotgun' ? 2 : 0.8); this.w.stat('shotsFired'); }
    e.lastShot = this.w.time;
    return true;
  }

  startReload(e, wpn) {
    if (wpn.reloadT > 0) return;
    if (wpn.jammed) { wpn.jammed = false; wpn.reloadT = 0.6; this.w.sfx('reload', e); return; }
    if (wpn.loaded >= wpn.st.mag) return;
    if (e.isPlayer && this.w.ammoCount(wpn) <= 0) { this.w.toast('Out of ammo for this gun.'); return; }
    wpn.reloadT = wpn.st.reload;
    this.w.sfx('reload', e);
  }

  finishReload(e, wpn) {
    const need = wpn.st.mag - wpn.loaded;
    const got = e.isPlayer ? this.w.takeAmmo(wpn, need) : need;
    wpn.loaded += got;
  }

  updateWeapon(e, wpn, dt) {
    if (wpn.cd > 0) wpn.cd -= dt;
    wpn.bloom = Math.max(0, wpn.bloom - dt * (0.35 + wpn.st.handling * 0.6));
    if (wpn.reloadT > 0) { wpn.reloadT -= dt; if (wpn.reloadT <= 0) { wpn.reloadT = 0; this.finishReload(e, wpn); } }
  }

  spawn(x, y, vx, vy, dmg, range, owner, variant) {
    for (const b of this.bullets) {
      if (b.on) continue;
      Object.assign(b, { on: true, x, y, x0: x, y0: y, vx, vy, dmg, range, life: (range * 2.2) / Math.hypot(vx, vy), owner, fac: owner.faction, variant, trail: 0, skip: owner.elevated ? 30 : 0, h0: owner.elevated ? 33 : 9 });
      return b;
    }
    return null;
  }

  bulletHeight(b) { return Math.max(9, b.h0 - Math.hypot(b.x - b.x0, b.y - b.y0) * 0.5); }

  noise(x, y, r, src) { this.noises.push({ x, y, r, src, t: 0.1 }); }

  update(dt) {
    const Q = this.w.Q;
    for (const b of this.bullets) {
      if (!b.on) continue;
      b.life -= dt;
      if (b.life <= 0) { b.on = false; continue; }
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      const flown = Math.hypot(b.x - b.x0, b.y - b.y0);
      const hit = flown < b.skip ? null : raycast(b.x, b.y, nx, ny, (tx, ty) => { const s = Q.solidAt(tx, ty); if (s === SOLID.FULL) return true; if (s === SOLID.LOW) return Math.hypot(tx * T + 8 - b.x0, ty * T + 8 - b.y0) > 22; return false; });
      // Entities along the segment.
      const victims = this.w.hash.query((b.x + nx) / 2, (b.y + ny) / 2, 40, this._tmp || (this._tmp = []));
      let struck = null, bestT = 2;
      for (const v of victims) {
        if (!v.alive || v === b.owner || v.ko || !v.hittable || v.elevated) continue;
        if (!this.w.hostileShot(b, v)) continue;
        const t = segCircle(b.x, b.y, nx, ny, v.x, v.y, v.r || 6);
        if (t !== null && t < bestT) { bestT = t; struck = v; }
      }
      const wallT = hit ? Math.hypot(hit.x - b.x, hit.y - b.y) / Math.max(1e-6, Math.hypot(nx - b.x, ny - b.y)) : 2;
      if (struck && bestT <= wallT) {
        const travelled = Math.hypot(b.x - b.x0, b.y - b.y0);
        const fall = travelled <= b.range ? 1 : Math.max(0.5, 1 - 0.5 * (travelled - b.range) / b.range);
        this.w.damage(struck, b.dmg * fall, b.owner, { dir: Math.atan2(b.vy, b.vx), variant: b.variant, x: b.x + (nx - b.x) * bestT, y: b.y + (ny - b.y) * bestT });
        b.on = false;
        continue;
      }
      if (hit) {
        // A shot that reaches a watchtower's tile can hit the sniper posted on it.
        const up = victims.find((v) => v.elevated && v.alive && Math.floor(v.x / T) === hit.tx && Math.floor(v.y / T) === hit.ty && this.w.hostileShot(b, v));
        if (up && Math.random() < 0.75) this.w.damage(up, b.dmg, b.owner, { dir: Math.atan2(b.vy, b.vx), variant: b.variant, x: up.x, y: up.y });
        else { this.w.R.fx.sparks(hit.x, hit.y, Math.atan2(b.vy, b.vx)); if (b.variant === 'inc') this.addZone('fire', hit.x, hit.y, 14, 2.5, b.owner); }
        b.on = false;
        continue;
      }
      b.x = nx; b.y = ny;
    }
    for (const n of this.noises) n.t -= dt;
    this.noises = this.noises.filter((n) => n.t > 0);
    this.updateThrows(dt);
    this.updateZones(dt);
  }

  // ---------- throwables & zones ----------
  throwItem(e, type, tx, ty) {
    const d = Math.min(7 * T, Math.hypot(tx - e.x, ty - e.y));
    const a = Math.atan2(ty - e.y, tx - e.x);
    this.throws.push({ type, x: e.x, y: e.y, h: 8, sx: e.x, sy: e.y, ex: e.x + Math.cos(a) * d, ey: e.y + Math.sin(a) * d, t: 0, dur: 0.35 + d / 400, owner: e, fuse: type === 'pipebomb' ? 1.2 : 0 });
    this.w.sfx('throw', e);
  }

  updateThrows(dt) {
    for (const th of this.throws) {
      th.t += dt;
      const k = Math.min(1, th.t / th.dur);
      th.x = th.sx + (th.ex - th.sx) * k;
      th.y = th.sy + (th.ey - th.sy) * k;
      th.h = 8 * (1 - k) + Math.sin(k * Math.PI) * 18;
      if (k >= 1 && !th.landed) {
        th.landed = true;
        if (th.type === 'molotov') { this.addZone('fire', th.ex, th.ey, 26, 6, th.owner); this.w.sfx('fire_whoosh', th); this.noise(th.ex, th.ey, 10 * T, th.owner); }
        else if (th.type === 'caltrops') this.addZone('caltrops', th.ex, th.ey, 24, 15, th.owner);
        else if (th.type === 'smokepot') { this.addZone('smoke', th.ex, th.ey, 36, 10, th.owner); this.w.R.fx.smoke(th.ex, th.ey, 14, true); }
      }
      if (th.type === 'pipebomb' && th.landed) { th.fuse -= dt; if (th.fuse <= 0) { th.done = true; this.explode(th.ex, th.ey, 2.5 * T, 85, th.owner); } }
      else if (th.landed) th.done = true;
    }
    this.throws = this.throws.filter((t) => !t.done);
  }

  explode(x, y, r, dmg, owner) {
    this.w.sfx('explosion', { x, y });
    this.noise(x, y, 30 * T, owner);
    this.w.shake(5);
    this.w.R.fx.burst(x, y, 26, [RAMPS.heat[3], RAMPS.gold[3], RAMPS.heat[2], RAMPS.bone[1]], 120, 0.6, 2, 8);
    this.w.R.fx.smoke(x, y, 10, true);
    this.w.flash(x, y, 3, 10);
    for (const v of this.w.hash.query(x, y, r + 8, [])) {
      if (!v.alive || !v.hittable) continue;
      const d = Math.hypot(v.x - x, v.y - y);
      if (d > r) continue;
      if (raycast(x, y, v.x, v.y, (tx, ty) => this.w.Q.blocksSight(tx, ty))) continue;
      this.w.damage(v, dmg * (1 - 0.6 * d / r), owner, { dir: Math.atan2(v.y - y, v.x - x), blast: true });
    }
    this.w.onExplosion(x, y, r, owner);
  }

  addZone(type, x, y, r, dur, owner) { this.zones.push({ type, x, y, r, t: dur, max: dur, owner, tick: 0 }); }

  smokeBlocks(x0, y0, x1, y1) {
    for (const z of this.zones) {
      if (z.type !== 'smoke') continue;
      if (segCircle(x0, y0, x1, y1, z.x, z.y, z.r * Math.min(1, z.t / 2)) !== null) return true;
    }
    return false;
  }

  updateZones(dt) {
    for (const z of this.zones) {
      z.t -= dt;
      z.tick -= dt;
      if (z.type === 'fire' && Math.random() < 0.6) this.w.R.fx.fire(z.x + (Math.random() - 0.5) * z.r, z.y + (Math.random() - 0.5) * z.r * 0.6);
      if (z.type === 'smoke' && Math.random() < 0.3) this.w.R.fx.smoke(z.x, z.y, 2, true);
      if (z.tick > 0) continue;
      z.tick = 0.4;
      for (const v of this.w.hash.query(z.x, z.y, z.r + 8, [])) {
        if (!v.alive || !v.hittable || Math.hypot(v.x - z.x, v.y - z.y) > z.r) continue;
        if (z.type === 'fire') this.w.damage(v, 5, z.owner, { burn: true });
        if (z.type === 'caltrops' && v !== z.owner && v.faction !== (z.owner && z.owner.faction)) { this.w.damage(v, 2, z.owner, { quiet: true }); v.slowT = 0.6; }
      }
    }
    this.zones = this.zones.filter((z) => z.t > 0);
  }

  draw(ctx, camX, camY) {
    for (const b of this.bullets) {
      if (!b.on) continue;
      const a = Math.atan2(b.vy, b.vx);
      ctx.strokeStyle = b.variant === 'inc' ? RAMPS.heat[3] : RAMPS.gold[3];
      ctx.lineWidth = 1;
      ctx.beginPath();
      const bh = this.bulletHeight(b);
      ctx.moveTo(Math.round(b.x - camX), Math.round(b.y - bh - camY));
      ctx.lineTo(Math.round(b.x - camX - Math.cos(a) * 5), Math.round(b.y - bh - camY - Math.sin(a) * 5));
      ctx.stroke();
    }
    for (const th of this.throws) {
      ctx.fillStyle = RAMPS.ink[0];
      ctx.fillRect(Math.round(th.x - camX) - 2, Math.round(th.y - th.h - camY) - 2, 4, 4);
      ctx.fillStyle = th.type === 'molotov' ? RAMPS.heat[3] : th.type === 'smokepot' ? RAMPS.bone[2] : RAMPS.ink[3];
      ctx.fillRect(Math.round(th.x - camX) - 1, Math.round(th.y - th.h - camY) - 1, 2, 2);
    }
  }

  drawZonesUnder(ctx, camX, camY) {
    for (const z of this.zones) {
      if (z.type === 'smoke') continue;
      const x = Math.round(z.x - camX), y = Math.round(z.y - camY);
      const a = Math.min(1, z.t / 1.5);
      ctx.globalAlpha = 0.5 * a;
      ctx.fillStyle = z.type === 'fire' ? RAMPS.heat[1] : RAMPS.ink[2];
      ctx.beginPath(); ctx.ellipse(x, y, z.r, z.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      if (z.type === 'caltrops') { ctx.fillStyle = RAMPS.ink[3]; for (let i = 0; i < 9; i++) ctx.fillRect(x + Math.round(Math.cos(i * 2.4) * z.r * 0.7 * ((i % 3) / 3 + 0.3)), y + Math.round(Math.sin(i * 2.4) * z.r * 0.4), 2, 2); }
      ctx.globalAlpha = 1;
    }
  }

  drawSmoke(ctx, camX, camY) {
    for (const z of this.zones) {
      if (z.type !== 'smoke') continue;
      const a = Math.min(1, z.t / 2) * 0.75;
      ctx.globalAlpha = a;
      ctx.fillStyle = RAMPS.bone[1];
      ctx.beginPath(); ctx.ellipse(Math.round(z.x - camX), Math.round(z.y - camY - 6), z.r, z.r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

// Segment p0->p1 vs circle; returns t in [0,1] of first contact or null.
export function segCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0;
  const fx = x0 - cx, fy = y0 - cy;
  const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a === 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

export { dist };
