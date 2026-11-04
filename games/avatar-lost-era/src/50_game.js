/* =====================================================================
   PLAYER
   ===================================================================== */
class Player {
  constructor(profile) {
    this.profile = profile; this.look = profile.look; this.native = NATIONS[profile.nation].element; this.bg = BACKGROUNDS[profile.bg] || BACKGROUNDS.hunter;
    this.perk = NATIONS[profile.nation].homes[profile.home].bonus || {};
    this.pos = V3(); this.vel = V3(); this.vy = 0; this.yaw = 0; this.grounded = true; this.radius = 0.4; this.height = 1.8; this.kind = 'player';
    this.maxHp = 100 + (this.bg.perk.hp || 0); this.hp = this.maxHp; this.maxChi = 100; this.chi = 100; this.stam = 100; this.hunger = 85; this.thirst = 85; this.warmth = 80;
    this.element = this.native; this.cds = {}; this.alive = true; this.dead = false; this.invuln = 0; this.shieldT = 0; this.healT = 0; this.airJumps = 0;
    this.waterMax = 3 + (this.bg.perk.skin || 0); this.water = this.waterMax; this.meditating = false; this.sheltered = false; this.sleeping = false; this.combatT = 0; this.handFlame = 0;
    this.status = { burn: 0, slow: 0, frozen: 0, stun: 0, sick: 0 };
    this.H = buildHumanoid(this.look); G.scene.add(this.H.root);
  }
  rebuildModel() { G.scene.remove(this.H.root); this.H = buildHumanoid(this.look); G.scene.add(this.H.root); }
  get sprinting() { return this._sprint && this.moving; }
  hurt(amount, src) {
    if (this.dead || this.invuln > 0 || G.mode !== 'play') return;
    let k = 1; if (Game.has('badger_stance') && this.stillT > 1 && this.grounded) k *= 0.8; if (this.meditating) this.stopMeditate();
    const dmg = amount * k; this.hp -= dmg; this.H.emissiveT = 0.18; SFX.hurt(); G.ui.hurtFlash(); G.ui.floater(this.pos, Math.round(dmg), 'hurt'); playAction(this.H, 'hit'); this.combatT = 6;
    Game.stat('hits_taken', 1); G.camShake = Math.max(G.camShake || 0, 0.25);
    if (this.hp <= 0) Game.die(src);
  }
  knock(dir, force, up) { this.vel.x += dir.x * force; this.vel.z += dir.z * force; if (up && this.grounded) { this.vy = up; this.grounded = false; } }
  stopMeditate() { if (this.meditating) { this.meditating = false; G.ui.note('Meditation broken.'); } }
  handPos(side = 'R') { if (G.vr && VR.L) { const v = V3(); (side === 'R' ? VR.R : VR.L).object3D.getWorldPosition(v); return v; } const h = this.H.J['hand' + side]; const v = V3(); h.getWorldPosition(v); return v; }
}

/* =====================================================================
   TECHNIQUES
   ===================================================================== */
function nearWater(pos, r = 9) {
  if (terrainH(pos.x, pos.z) < -0.25) return V3(pos.x, WORLD.sea, pos.z);
  for (let ring = 1; ring <= 3; ring++) { const rr = r * ring / 3; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const x = pos.x + Math.cos(a) * rr, z = pos.z + Math.sin(a) * rr; if (terrainH(x, z) < -0.25) return V3(x, WORLD.sea, z); } }
  if (World.moonPoolCenter && pos.distanceTo(World.moonPoolCenter) < 8) return World.moonPoolCenter.clone();
  if (World.well && Math.hypot(pos.x - World.well.x, pos.z - World.well.z) < 5) return V3(World.well.x, terrainH(World.well.x, World.well.z) + 0.8, World.well.z);
  return null;
}
function dmgMult(el) {
  const P = G.player; let k = 1 + 0.04 * (Game.state.level - 1);
  if (el === 'fire') { k *= isNight() ? 0.8 : 1.15; k *= P.perk.fireDmg || 1; }
  if (el === 'water') { k *= isNight() ? (1.2 + (moonPhase() > 0.95 ? 0.3 : 0)) : 0.9; }
  if (el === 'earth') k *= P.perk.earthDmg || 1;
  if (el === P.native) k *= 1.1;
  return k;
}
function chiCost(id) {
  const t = TECH[id]; const P = G.player; let c = t.chi || 0; const aff = affinity(P.native, t.el);
  if (aff === 'opposite') c *= 1.25; else if (aff === 'adjacent') c *= 1.1;
  if (id === 'healing') c *= P.perk.healCost || 1; if (t.el === 'air') c *= P.perk.airCost || 1;
  return Math.round(c);
}
const Tech = {
  aimDir(P, from) { const a = G.aim.point.clone().sub(from); if (a.lengthSq() < 0.01) return V3(Math.sin(P.yaw), 0, Math.cos(P.yaw)); return a.normalize(); },
  can(id) {
    const P = G.player; const t = TECH[id]; if (!t || !Game.has(id)) return 'unknown';
    if (P.dead || P.sleeping) return 'busy';
    if ((P.cds[id] || 0) > 0) return 'cooldown';
    if (P.chi < chiCost(id)) return 'chi';
    if (t.grounded && !P.grounded && !P.swimming) return 'air';
    if (t.grounded && P.swimming) return 'water-ground';
    if (t.water && !nearWater(P.pos) && P.water <= 0 && !P.swimming) return 'nowater';
    return null;
  },
  cast(id) {
    const P = G.player; const why = this.can(id);
    if (why) { const msg = { cooldown: '', chi: 'Not enough chi. Breathe… or meditate (C).', air: 'Earthbenders need their feet on the ground!', 'water-ground': 'There is no earth beneath you here.', nowater: 'No water nearby — and your waterskin is empty.', busy: '' }[why]; if (msg) G.ui.note(msg, 'bad'); return false; }
    if (P.meditating) P.stopMeditate();
    const t = TECH[id]; let usedSkin = false;
    if (t.water && !nearWater(P.pos) && !P.swimming) { P.water -= 1; usedSkin = true; }
    const ok = this[id] ? this[id](P, t) : false; if (ok === false) { if (usedSkin) P.water += 1; return false; }
    P.chi -= chiCost(id); P.cds[id] = t.cd || 0.5; P.combatT = 6; P.castLock = 0.25; Game.stat('casts', 1); Game.stat('cast_' + t.el, 1);
    return true;
  },
  faceAim(P) { const d = G.aim.point.clone().sub(P.pos); P.yaw = Math.atan2(d.x, d.z); P.H.root.rotation.y = P.yaw; },
  // ---------------- FIRE ----------------
  fire_jab(P, t) { this.faceAim(P); const side = (P.alt = !P.alt) ? 'R' : 'L'; playAction(P.H, side === 'R' ? 'punchR' : 'punchL', 0.9);
    gameTimeout(() => { const from = P.handPos(side); const dir = this.aimDir(P, from); this.fireball(from, dir, 34, t.dmg * dmgMult('fire'), 0.35); SFX.fire(); }, 110); return true; },
  fireball(from, dir, speed, dmg, size) {
    const core = glowSprite(0xff5a14, size * 3.0, 0.85); core.position.copy(from); const c2 = glowSprite(0xffc860, size * 1.4, 0.8); core.add(c2); c2.scale.set(0.42, 0.42, 1);
    const light = { pos: from.clone(), intensity: 2.5, color: 0xff7a2a, range: 10 }; G.dynLights.push(light);
    const p = Bending.spawn({ el: 'fire', pos: from.clone(), vel: dir.clone().multiplyScalar(speed), r: size, dmg, owner: G.player, mesh: core, life: 1.6, knock: 3, light,
      trail(pr, dt) { FX.fire(pr.pos, 3, 0.8, size * 1.5, 0.3); if (Math.random() < 0.3) FX.smoke(pr.pos, 1, 0.6); } });
    const end = Bending.endProj.bind(Bending); p.onEnd = () => { const i = G.dynLights.indexOf(light); if (i >= 0) G.dynLights.splice(i, 1); }; void end; return p;
  },
  spark(P) {
    // light a campfire, cook in hand, or hold a flame for light
    const fire = G.campfires.find(f => f.pos.distanceTo(P.pos) < 4 && !f.lit);
    playAction(P.H, 'heal', 1.6); const hp = P.handPos('R');
    if (fire) { fire.lit = true; fire.fuel = 240; FX.burst(V3(fire.pos.x, fire.pos.y + 0.3, fire.pos.z), PAL.fireA, PAL.fireB, 30, 3, 0.6, 0.6, { up: 2 }); SFX.bigfire(); G.ui.note('You kindle the campfire with a breath of flame.', 'good'); Game.stat('fires_lit', 1); return true; }
    const raw = Game.firstRaw(); if (raw) { Game.startCook(raw, 'hand'); FX.fire(hp, 10, 0.6, 0.5, 0.8); SFX.fire(); return true; }
    P.handFlame = 45; FX.fire(hp, 12, 0.5, 0.4, 0.6); SFX.fire(); G.ui.note('A small flame dances in your palm, lighting the way.'); return true;
  },
  fire_blast(P, t) { this.faceAim(P); const seq = ['punchR', 'punchL', 'punchR'];
    seq.forEach((a, i) => gameTimeout(() => { if (P.dead) return; playAction(P.H, a, 0.7); gameTimeout(() => { const side = a === 'punchR' ? 'R' : 'L'; const from = P.handPos(side); const dir = this.aimDir(P, from); dir.x += (Math.random() - 0.5) * 0.03; dir.y += (Math.random() - 0.5) * 0.03; this.fireball(from, dir.normalize(), 38, t.dmg * dmgMult('fire'), 0.45); SFX.fire(); }, 90); }, i * 230));
    return true; },
  fire_arc(P, t) { playAction(P.H, 'kick', 1); SFX.bigfire(); const c = V3(P.pos.x, P.pos.y + 0.6, P.pos.z); const dmg = t.dmg * dmgMult('fire');
    G.effects.push({ t: 0, hitDone: false, update(dt) { this.t += dt; const a0 = P.yaw + this.t / 0.5 * Math.PI * 2; for (let k = 0; k < 6; k++) { const a = a0 - k * 0.15; const r = 1.2 + this.t * 9; const p = V3(P.pos.x + Math.sin(a) * r, P.pos.y + 0.6 + Math.sin(this.t * 10) * 0.1, P.pos.z + Math.cos(a) * r); FX.fire(p, 2, 1.5, 0.8, 0.5); }
      if (!this.hitDone && this.t > 0.2) { this.hitDone = true; for (const e of G.ents) { if (!e.alive || e.kind === 'villager' || (e.sp && e.sp.passive)) continue; const d = Math.hypot(e.pos.x - c.x, e.pos.z - c.z); if (d < 6.5 + e.radius && Math.abs(e.pos.y - P.pos.y) < 3) { e.damage(dmg, 'fire', P); Game.stat('hits_fire', 1); e.status.burn = 3; e.knock(V3(e.pos.x - c.x, 0, e.pos.z - c.z).normalize(), 9, 3); } } }
      return this.t < 0.55; } });
    return true; },
  breath_fire(P, t) { this.faceAim(P); playAction(P.H, 'breath', 1); SFX.bigfire(); P.warmth = Math.min(100, P.warmth + 40); const dmg = t.dmg * dmgMult('fire');
    G.effects.push({ t: 0, tick: 0, update(dt) { this.t += dt; this.tick -= dt; if (this.t < 0.25) return true; const head = V3(); P.H.J.head.getWorldPosition(head); head.y += 0.05; const fwd = V3(Math.sin(P.yaw), -0.08, Math.cos(P.yaw)).normalize(); head.addScaledVector(fwd, 0.2);
        for (let k = 0; k < 8; k++) { const r = Math.random; const vx = fwd.x * 14 + (r() - 0.5) * 4, vy = fwd.y * 14 + (r() - 0.5) * 3 + 1, vz = fwd.z * 14 + (r() - 0.5) * 4;
          FX.norm.emit(head.x, head.y, head.z, vx, vy, vz, 0.55, 0.3, 1.7, PAL.flameA, PAL.flameB, { drag: 2.2, grav: 3, alpha: 0.9 }); if (k % 3 === 0) FX.add.emit(head.x, head.y, head.z, vx, vy, vz, 0.35, 0.25, 0.9, PAL.fireA, PAL.fireC, { drag: 2.2, grav: 3, alpha: 0.6 }); }
        if (Math.random() < 0.3) FX.smoke(head.clone().addScaledVector(fwd, 6), 1, 1.2);
        if (this.tick <= 0) { this.tick = 0.15; for (const e of G.ents) { if (!e.alive || e.kind === 'villager' || (e.sp && e.sp.passive)) continue; const d = V3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z); const dist = d.length(); if (dist > 9.5 || dist < 0.01) continue; d.normalize(); if (d.dot(V3(fwd.x, 0, fwd.z).normalize()) > 0.88) { e.damage(dmg * 0.5, 'fire', P); Game.stat('hits_fire', 1); if (Math.random() < 0.4) e.status.burn = 3; } } }
        return this.t < 1.1; } });
    return true; },
  // ---------------- EARTH ----------------
  rock_toss(P, t) { this.faceAim(P); playAction(P.H, 'earthLift', 1.0); const fwd = V3(Math.sin(P.yaw), 0, Math.cos(P.yaw)); const base = P.pos.clone().addScaledVector(fwd, 1.3); const gy = groundH(base.x, base.z);
    const m = new THREE.Mesh(ROCK_GEO, VCMAT()); m.scale.setScalar(0.9); m.position.set(base.x, gy - 0.6, base.z); G.scene.add(m); FX.dust(V3(base.x, gy, base.z), 10, 2, 0.9); SFX.earth();
    G.effects.push({ t: 0, fired: false, update(dt) { this.t += dt; if (!this.fired) { m.position.y = gy - 0.6 + U.smooth(0, 0.3, this.t) * 1.9; m.rotation.y += dt * 2;
        if (this.t > 0.42) { this.fired = true; G.scene.remove(m); const from = m.position.clone(); const dir = Tech.aimDir(P, from); const pr = Bending.spawnRock(from, dir, 30, t.dmg * dmgMult('earth'), P, 0.65); pr.vel.y += 1.0; pr.grav = -6; SFX.whoosh(); } }
        return !this.fired; }, end() { if (!this.fired) G.scene.remove(m); } });
    return true; },
  earth_wall(P, t) { this.faceAim(P); playAction(P.H, 'stomp', 1.3); const fwd = V3(Math.sin(P.yaw), 0, Math.cos(P.yaw)); const at = P.pos.clone().addScaledVector(fwd, 2.4);
    gameTimeout(() => { const w = makeWall(at, P.yaw, 12 * (P.perk.wallTime || 1)); G.structures.push(w); G.camShake = 0.15; }, 380); return true; },
  rock_shelter(P) {
    const old = G.structures.find(s => s.shelter && s.alive && !s.collapsing); if (old) old.collapse();
    playAction(P.H, 'stomp', 1.2); gameTimeout(() => { const s = makeShelter(P.pos.clone(), P.yaw); G.structures.push(s); P.shelter = s; G.camShake = 0.25; Game.stat('shelters', 1); G.ui.note('The earth folds over you into a snug stone tent. (F to leave · Z / sleep at night)', 'good'); }, 420); return true; },
  earth_pillar(P, t) {
    // if aiming at a nearby enemy, launch it; otherwise launch self
    const tgt = G.aim.target; playAction(P.H, 'stomp', 1.5);
    if (tgt && tgt.alive && tgt.pos.distanceTo(P.pos) < 18) { gameTimeout(() => { const s = makePillar(tgt.pos.clone()); G.structures.push(s); tgt.vy = 13; tgt.damage(18 * dmgMult('earth'), 'earth', P); tgt.status.stun = 1.2; Game.stat('hits_earth', 1); }, 300); return true; }
    gameTimeout(() => { const s = makePillar(P.pos.clone()); G.structures.push(s); P.vy = 15; P.grounded = false; }, 300); return true; },
  shockwave(P, t) { playAction(P.H, 'stomp', 1.0); gameTimeout(() => { Bending.shockwaveFX(P.pos, 6); SFX.earth(); SFX.crack(); G.camShake = 0.4; const dmg = t.dmg * dmgMult('earth');
      for (const e of G.ents) { if (!e.alive || e.kind === 'villager' || (e.sp && e.sp.passive)) continue; const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z); if (d < 8 && Math.abs(e.pos.y - P.pos.y) < 2.5) { e.damage(dmg * (1 - d / 16), 'earth', P); Game.stat('hits_earth', 1); e.status.stun = 1; e.knock(V3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z).normalize(), 6, 7); } } }, 420); return true; },
  // ---------------- WATER ----------------
  waterSource(P) { return nearWater(P.pos) || P.handPos('R'); },
  water_whip(P, t) { this.faceAim(P); playAction(P.H, 'whip', 1); SFX.water(); const src = this.waterSource(P); const dmg = t.dmg * dmgMult('water');
    const n = 30; const mats = new THREE.MeshPhongMaterial({ color: 0x4ab8f8, transparent: true, opacity: 0.8, shininess: 140, specular: 0xffffff, emissive: 0x0a4a7a });
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 8), mats, n); im.frustumCulled = false; G.scene.add(im); const mtx = new THREE.Matrix4();
    let hitDone = false; const hit = new Set();
    G.effects.push({ t: 0, update(dt) { this.t += dt; const hand = P.handPos('R'); const target = G.aim.point.clone(); const maxLen = 9; const to = target.clone().sub(hand); if (to.length() > maxLen) to.setLength(maxLen); const end = hand.clone().add(to);
        const ext = this.t < 0.16 ? U.smooth(0, 0.16, this.t) : 1 - U.smooth(0.3, 0.5, this.t); const start = this.t < 0.12 && src.distanceTo(hand) < 12 ? src.clone().lerp(hand, this.t / 0.12) : hand;
        for (let i = 0; i < n; i++) { const u = i / (n - 1) * ext; const p = start.clone().lerp(end, u); p.y += Math.sin(u * Math.PI) * 0.8 + Math.sin(u * 12 - this.t * 30) * 0.12 * (1 - u); const sc = (1.25 - u * 0.65) * (0.9 + Math.sin(i * 1.7 + this.t * 24) * 0.15); mtx.compose(p, TMP.q.identity(), TMP.v2.set(sc, sc, sc)); im.setMatrixAt(i, mtx); }
        im.instanceMatrix.needsUpdate = true; if (Math.random() < 0.6) { const tip = start.clone().lerp(end, ext); FX.splash(tip, 2, 1); }
        if (!hitDone && this.t > 0.14) { hitDone = true; for (const e of G.ents) { if (!e.alive || e.kind === 'villager' || (e.sp && e.sp.passive)) continue; const ep = V3(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z); const segD = distPointSeg(ep, hand, end); if (segD < 0.9 + e.radius && !hit.has(e)) { hit.add(e); e.damage(dmg, 'water', P); Game.stat('hits_water', 1); e.knock(to.clone().setY(0).normalize(), 4, 1); Game.stat('knock_water', 1); FX.splash(ep, 14, 3); } } }
        return this.t < 0.5; }, end() { G.scene.remove(im); } });
    return true; },
  water_draw(P) {
    const src = nearWater(P.pos, 10); if (!src) { G.ui.note('There is no water close enough to draw from.', 'bad'); return false; }
    playAction(P.H, 'whip', 0.7); SFX.water(); const hand = P.handPos('R');
    G.effects.push({ t: 0, update(dt) { this.t += dt; for (let k = 0; k < 4; k++) { const u = Math.random(); const p = src.clone().lerp(P.handPos('R'), u); p.y += Math.sin(u * Math.PI) * 1.5; FX.norm.emit(p.x, p.y, p.z, 0, 0, 0, 0.3, 0.3, 0.1, PAL.waterA, PAL.waterB, { alpha: 0.8 }); } return this.t < 0.7; } });
    P.water = P.waterMax; P.thirst = Math.min(100, P.thirst + 30); Game.stat('drinks', 1);
    const deep = terrainH(src.x, src.z) < -1.5 || (src.y === WORLD.sea && terrainH(src.x, src.z) < -0.8);
    if (deep && (G.t - (P.lastFish || -99)) > 18 && Math.random() < 0.55 + (P.bg === BACKGROUNDS.fisher ? 0.35 : 0)) { P.lastFish = G.t; Game.give('fish_raw', 1); G.ui.note('A fish comes up with the water! Like a true waterbender.', 'good'); Game.stat('fish', 1); }
    else G.ui.note('You draw the water to you, drink, and refill your skin.', 'good');
    void hand; return true; },
  ice_darts(P, t) { this.faceAim(P); playAction(P.H, 'push', 1.2); SFX.ice(); const dmg = t.dmg * dmgMult('water');
    for (let i = 0; i < 3; i++) gameTimeout(() => { const from = P.handPos(i % 2 ? 'L' : 'R'); const dir = this.aimDir(P, from); dir.x += (i - 1) * 0.04; dir.normalize();
      const b = new GeoBuilder(); b.add(new THREE.ConeGeometry(0.08, 0.6, 5), '#ffffff', 0, 0, 0, Math.PI / 2, 0, 0); const m = new THREE.Mesh(b.build(), new THREE.MeshPhongMaterial({ vertexColors: true, color: 0xbfe8ff, emissive: 0x2a6a9a, transparent: true, opacity: 0.85, shininess: 120 }));
      m.add(glowSprite(0x9fe8ff, 0.8, 0.8)); m.scale.setScalar(1.4);
      Bending.spawn({ el: 'ice', pos: from.clone(), vel: dir.multiplyScalar(40), r: 0.25, dmg, owner: P, mesh: m, life: 1.4, knock: 1.5, faceVel: true, trail(pr) { if (Math.random() < 0.5) FX.sparkle(pr.pos, PAL.iceB, 1, 0.1, 0.12); } }); SFX.ice(); }, 160 + i * 90);
    return true; },
  healing(P) { playAction(P.H, 'heal', 1); SFX.water(); P.healT = 3; G.ui.note('Water glows around your hands…', 'good'); Game.stat('heals', 1);
    const orbs = ['L', 'R'].map(sd => { const o = glowSprite(0x6ad0ff, 0.55, 0.9); P.H.J['hand' + sd].add(o); const w = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshPhongMaterial({ color: 0x8fe0ff, transparent: true, opacity: 0.7, emissive: 0x2a8ad8, shininess: 120 })); P.H.J['hand' + sd].add(w); return [o, w]; });
    G.effects.push({ t: 0, update(dt) { this.t += dt; orbs.forEach(([o, w], i) => { const k = 0.55 + Math.sin(this.t * 6 + i) * 0.1; o.scale.set(k, k, 1); w.scale.setScalar(1 + Math.sin(this.t * 9 + i * 2) * 0.15); }); return this.t < 3 && !P.dead; }, end() { orbs.forEach(([o, w]) => { o.parent && o.parent.remove(o); w.parent && w.parent.remove(w); }); } });
    return true; },
  tidal_push(P, t) { this.faceAim(P); playAction(P.H, 'push', 1); SFX.water(); gameTimeout(() => SFX.water(), 150); const near = !!nearWater(P.pos, 14); const power = near ? 1.6 : 1; const dmg = t.dmg * dmgMult('water') * power;
    const fwd = V3(Math.sin(P.yaw), 0, Math.cos(P.yaw)); const start = P.pos.clone().addScaledVector(fwd, 1.2);
    const g = waveGeometry(6.4 * power, 1.7 * power); const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.82, side: THREE.DoubleSide, shininess: 110, specular: 0xffffff, emissive: 0x08304a }));
    G.scene.add(m); const hit = new Set();
    G.effects.push({ t: 0, update(dt) { this.t += dt; const d = this.t * 16; const p = start.clone().addScaledVector(fwd, d); m.position.set(p.x, groundH(p.x, p.z) - 0.1, p.z); m.rotation.y = Math.atan2(fwd.x, fwd.z); const grow = U.smooth(0, 0.18, this.t) * (1 - U.smooth(0.55, 0.8, this.t) * 0.7); m.scale.set(1, Math.max(0.05, grow), 1); m.material.opacity = 0.82 * (1 - U.smooth(0.5, 0.8, this.t));
        for (let k = 0; k < 6; k++) { const side = (Math.random() - 0.5) * 5 * power; FX.splash(V3(p.x + fwd.z * side, groundH(p.x, p.z) + 0.4, p.z - fwd.x * side), 1, 2); }
        for (const e of G.ents) { if (!e.alive || hit.has(e) || e.kind === 'villager' || (e.sp && e.sp.passive)) continue; const rel = V3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z); const along = rel.dot(fwd); const lat = Math.abs(rel.x * fwd.z - rel.z * fwd.x); if (along > 0 && along < d + 1 && along > d - 2.5 && lat < 3.4 * power) { hit.add(e); e.damage(dmg, 'water', P); Game.stat('hits_water', 1); e.knock(fwd, 12 * power, 4); Game.stat('knock_water', 1); } }
        return this.t < 0.8; }, end() { G.scene.remove(m); } });
    return true; },
  ice_prison(P, t) { this.faceAim(P); playAction(P.H, 'push', 1); SFX.ice(); gameTimeout(() => { const from = P.handPos('R'); const dir = this.aimDir(P, from);
      const m = glowSprite(0x9fe8ff, 1.2); Bending.spawn({ el: 'iceprison', pos: from.clone(), vel: dir.multiplyScalar(30), r: 0.45, dmg: t.dmg * dmgMult('water'), owner: P, mesh: m, life: 1.5, knock: 0, trail(pr) { FX.sparkle(pr.pos, PAL.iceA, 2, 0.3, 0.2); FX.splash(pr.pos, 1, 0.5); } }); }, 200); return true; },
  // ---------------- AIR ----------------
  air_palm(P, t) { this.faceAim(P); playAction(P.H, 'palm', 1); SFX.air(); gameTimeout(() => { const from = P.handPos('R'); const dir = this.aimDir(P, from);
      const b = new THREE.Group(); for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.28 + i * 0.12, 0.035, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 - i * 0.1, depthWrite: false })); r.rotation.y = i * 0.6; r.rotation.x = i * 0.9; b.add(r); }
      Bending.spawn({ el: 'air', pos: from.clone(), vel: dir.clone().multiplyScalar(30), r: 0.55, dmg: t.dmg * dmgMult('air'), owner: P, mesh: b, life: 1.0, knock: 13, spin: V3(9, 13, 0), trail(pr) { FX.air(pr.pos, pr.vel.clone().normalize().multiplyScalar(-0.2), 2, 1, 0.5); } }); }, 110); return true; },
  air_jump(P) { const mult = (P.perk.airJump || 1); if (P.grounded || P.swimming) { P.vy = 12.5 * mult; } else { P.vy = Math.max(P.vy, 0) + 10 * mult; } P.grounded = false; playAction(P.H, 'leap', 1); SFX.air();
    FX.ring(V3(P.pos.x, P.pos.y + 0.1, P.pos.z), PAL.airA, PAL.airB, 26, 6, 0.6, true); FX.dust(V3(P.pos.x, groundH(P.pos.x, P.pos.z), P.pos.z), 8, 3, 0.8); FX.leaves(P.pos, 3); return true; },
  wind_step(P) { const mv = P.moveDir && P.moveDir.lengthSq() > 0.01 ? P.moveDir.clone() : V3(Math.sin(G.camYaw + Math.PI), 0, Math.cos(G.camYaw + Math.PI)); mv.normalize(); P.dash = { dir: mv, t: 0.25 }; P.invuln = 0.4; playAction(P.H, 'dash', 1); SFX.whoosh(); P.yaw = Math.atan2(mv.x, mv.z);
    G.effects.push({ t: 0, update(dt) { this.t += dt; FX.air(V3(P.pos.x, P.pos.y + 1, P.pos.z), mv.clone().multiplyScalar(-1), 4, 4, 0.6); return this.t < 0.3; } }); return true; },
  air_sweep(P, t) { this.faceAim(P); playAction(P.H, 'sweep', 1); SFX.air(); gameTimeout(() => SFX.whoosh(), 120); const fwd = V3(Math.sin(P.yaw), 0, Math.cos(P.yaw)); const dmg = t.dmg * dmgMult('air');
    G.effects.push({ t: 0, done: false, update(dt) { this.t += dt; const r = 1 + this.t * 22; for (let k = 0; k < 10; k++) { const a = P.yaw + (k / 9 - 0.5) * 1.9; const p = V3(P.pos.x + Math.sin(a) * r, P.pos.y + 0.9 + Math.random() * 0.6, P.pos.z + Math.cos(a) * r); FX.air(p, V3(Math.sin(a), 0, Math.cos(a)), 1, 3, 0.7); }
        if (!this.done && this.t > 0.15) { this.done = true; for (const e of G.ents) { if (!e.alive || e.kind === 'villager' || (e.sp && e.sp.passive)) continue; const d = V3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z); const dist = d.length(); if (dist > 11 || dist < 0.01) continue; d.normalize(); if (d.dot(fwd) > 0.55) { e.damage(dmg, 'air', P); Game.stat('hits_air', 1); e.knock(d, 18, 6); Game.stat('knock_air', 1); } } }
        return this.t < 0.45; } }); return true; },
  air_shield(P) { playAction(P.H, 'swirl', 1); SFX.air(); P.shieldT = 4; const g = new THREE.Group(); for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(1.7 + i * 0.08, 0.03, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false })); r.rotation.set(Math.random() * 3, Math.random() * 3, 0); g.add(r); }
    G.scene.add(g); G.effects.push({ t: 0, update(dt) { this.t += dt; g.position.set(P.pos.x, P.pos.y + 1, P.pos.z); g.children.forEach((r, i) => { r.rotation.x += dt * (3 + i); r.rotation.y += dt * (2 + i * 0.5); r.material.opacity = 0.35 * Math.min(1, (4 - this.t) * 2); });
        if (Math.random() < 0.7) { const a = Math.random() * 6.28; FX.air(V3(P.pos.x + Math.cos(a) * 1.6, P.pos.y + 0.3 + Math.random() * 1.8, P.pos.z + Math.sin(a) * 1.6), V3(-Math.sin(a), 0.2, Math.cos(a)), 1, 4, 0.4); }
        for (const e of G.ents) { if (!e.alive || e.kind === 'villager' || (e.sp && e.sp.passive)) continue; const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z); if (d < 2.6 + e.radius) { e.knock(V3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z).normalize(), 14, 4); if (!e._shT || G.t - e._shT > 0.6) { e._shT = G.t; e.damage(5, 'air', P); Game.stat('knock_air', 1); } } }
        return this.t < 4; }, end() { G.scene.remove(g); P.shieldT = 0; } }); return true; },
};
// a curling wave: sheet swept across its width, rising and curling forward; white foam toward the crest
function waveGeometry(width, height) {
  const nu = 20, nv = 10, pos = [], col = [], idx = []; const deep = new THREE.Color('#2a86d0'), foam = new THREE.Color('#e8f8ff'), c = new THREE.Color();
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const u = i / nu, v = j / nv; const env = Math.sin(Math.PI * u) ** 0.6; const a = v * Math.PI * 0.85;
    const x = (u - 0.5) * width, y = Math.sin(a) * height * env + (1 - Math.cos(a)) * height * 0.25 * env, z = (1 - Math.cos(a)) * height * 0.55 * env - 0.4;
    pos.push(x, y, z); c.copy(deep).lerp(foam, U.smooth(0.55, 1, v)); col.push(c.r, c.g, c.b); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, d = a + nu + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function distPointSeg(p, a, b) { const ab = b.clone().sub(a); const t = U.clamp(p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1), 0, 1); return p.distanceTo(a.clone().addScaledVector(ab, t)); }

/* =====================================================================
   ENVIRONMENT (time of day)
   ===================================================================== */
const SKY_KEYS = [
  // hour, top, horizon, sunCol, sunI, hemiSky, hemiGround, hemiI, cloud
  [0, '#050a1c', '#16223e', '#6a7aa8', 0.0, '#3a4a7a', '#1a1a24', 0.35, '#2a3450'],
  [4.5, '#0a1028', '#2a2a48', '#6a7aa8', 0.0, '#3a4a7a', '#1a1a24', 0.35, '#3a3a58'],
  [5.6, '#2a3a6a', '#d88a6a', '#ffb07a', 0.4, '#8a8ab0', '#4a3a3a', 0.55, '#e8a090'],
  [6.6, '#4a7ab8', '#ffc08a', '#ffd0a0', 1.0, '#b8c8e0', '#6a5a3a', 0.75, '#ffe0c8'],
  [8.5, '#3f86d8', '#bfe0f2', '#fff2d8', 1.5, '#cfe6ff', '#6a5a3a', 0.85, '#ffffff'],
  [13, '#367ed6', '#cfe8f6', '#fff6e8', 1.65, '#d8ecff', '#6a5a3a', 0.9, '#ffffff'],
  [16.5, '#3f7ed0', '#f2dcae', '#ffe2b0', 1.4, '#e8dcc8', '#6a5a3a', 0.85, '#fff0d8'],
  [18.2, '#3a3f7a', '#ff8a4a', '#ff9a50', 0.9, '#d8a080', '#5a3a2a', 0.7, '#ffb080'],
  [19.4, '#1c1c44', '#8a3a4a', '#ff6a40', 0.25, '#7a6a90', '#2a2030', 0.5, '#a05a6a'],
  [20.6, '#0a0e26', '#1e2a4e', '#6a7aa8', 0.0, '#3a4a7a', '#1a1a24', 0.38, '#2a3450'],
  [24, '#050a1c', '#16223e', '#6a7aa8', 0.0, '#3a4a7a', '#1a1a24', 0.35, '#2a3450'],
];
const _ca = new THREE.Color(), _cb = new THREE.Color();
function lerpHex(a, b, t, out) { _ca.set(a); _cb.set(b); return out.copy(_ca).lerp(_cb, t); }
const Env = {
  top: new THREE.Color(), hor: new THREE.Color(), sunC: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(),
  update(dt, camPos) {
    const h = G.time; let i = 0; while (i < SKY_KEYS.length - 2 && h > SKY_KEYS[i + 1][0]) i++;
    const a = SKY_KEYS[i], b = SKY_KEYS[i + 1]; const t = U.clamp((h - a[0]) / (b[0] - a[0]), 0, 1);
    lerpHex(a[1], b[1], t, this.top); lerpHex(a[2], b[2], t, this.hor); lerpHex(a[3], b[3], t, this.sunC); const sunI = U.lerp(a[4], b[4], t);
    lerpHex(a[5], b[5], t, this.hs); lerpHex(a[6], b[6], t, this.hg); const hemiI = U.lerp(a[7], b[7], t); lerpHex(a[8], b[8], t, G.env.cloud);
    // sun & moon directions: east (+x) at 6h, overhead at 12h, west at 18h
    const ang = (h - 6) / 12 * Math.PI; const sunDir = V3(Math.cos(ang), Math.sin(ang), 0.35).normalize(); const moonDir = V3(-Math.cos(ang), -Math.sin(ang), -0.25).normalize();
    const S = World.sky.material.uniforms; S.top.value.copy(this.top); S.hor.value.copy(this.hor); S.bot.value.copy(this.hor).multiplyScalar(0.6); S.sunDir.value.copy(sunDir); S.moonDir.value.copy(moonDir); S.sunCol.value.copy(this.sunC); S.moonPhase.value = moonPhase();
    const night = U.smooth(19.6, 21, h) + (1 - U.smooth(4.2, 5.8, h)); G.env.night = U.clamp(night, 0, 1); S.stars.value = G.env.night;
    G.env.morning = Math.max(0, 1 - Math.abs(h - 6.5) / 2);
    const P = camPos; const sun = World.sun; const light = sunDir.y > -0.05 ? sunDir : moonDir;
    sun.position.set(P.x + light.x * 200, P.y + Math.max(light.y, 0.15) * 200, P.z + light.z * 200); sun.target.position.copy(P);
    if (sunDir.y > -0.05) { sun.color.copy(this.sunC); sun.intensity = sunI; } else { sun.color.set('#8aa0d8'); sun.intensity = 0.45 * (0.5 + moonPhase() * 0.5); }
    World.hemi.color.copy(this.hs); World.hemi.groundColor.copy(this.hg); World.hemi.intensity = hemiI; World.amb.intensity = 0.12 + G.env.night * 0.08;
    // fog follows the horizon colour, thicker in the misty marsh and at dawn
    const fog = World.scene.fog; fog.color.copy(this.hor).lerp(this.top, 0.15);
    const marsh = U.smooth(90, 40, Math.hypot(P.x - LOC.pillars.x, P.z - LOC.pillars.z)); const alt = U.smooth(40, 90, P.y);
    fog.near = U.lerp(70, 8, Math.max(marsh * 0.8, G.env.morning * 0.3)); fog.far = U.lerp(620, 160, marsh * 0.75) * (1 - G.env.night * 0.25) + alt * 100;
    if (marsh > 0.2) fog.color.lerp(_ca.set('#c8d8d0'), marsh * 0.5 * (1 - G.env.night));
    G.env.windy = 0.25 + alt * 0.7 + Math.max(0, Math.sin(G.t * 0.05)) * 0.2; WIND.uniforms.uWind.value = 0.7 + G.env.windy;
    G.env.sunDir = sunDir;
  },
};

/* =====================================================================
   GAME: progression, survival, quests, saving
   ===================================================================== */
const QUESTS = {
  arrival: { title: 'The Valley of Four Winds', giver: 'Prologue', steps: [
      { text: 'Reach Tienhai Village', check: () => Math.hypot(G.player.pos.x, G.player.pos.z) < 32 },
      { text: 'Speak with Elder Bao in the village', check: () => G.flags.talkedBao } ], reward: { xp: 40 }, next: 'eat' },
  eat: { title: 'A Bender Must Eat', giver: 'Elder Bao', steps: [
      { text: 'Hunt an animal and harvest it — or pull a fish from the water', check: () => (G.stats.harvested || 0) + (G.stats.fish || 0) >= 1 },
      { text: 'Cook it: at a lit campfire (B to build, F to light/cook) or with firebending', check: () => (G.stats.cooked || 0) >= 1 },
      { text: 'Eat the cooked food (X)', check: () => (G.stats.ate_cooked || 0) >= 1 },
      { text: 'Drink fresh water (F at a river or lake)', check: () => (G.stats.drinks || 0) >= 1 } ], reward: { xp: 70, sp: 1 }, next: 'night' },
  night: { title: 'The First Night', giver: 'Elder Bao', steps: [
      { text: 'Prepare for nightfall: build a campfire or raise a shelter', check: () => (G.stats.campfires || 0) + (G.stats.shelters || 0) >= 1 },
      { text: 'Rest through the night (by a fire, in a shelter, or at the inn)', check: () => (G.stats.slept || 0) >= 1 } ], reward: { xp: 90, sp: 1 }, next: 'path' },
  path: { title: 'The Path of the Avatar', giver: 'Elder Bao', steps: [
      { text: 'Open your Bending Scroll (K or Tab)', check: () => G.flags.openedSkills },
      { text: 'Complete a trial and learn a new technique', check: () => (G.stats.learned || 0) >= 1 } ], reward: { xp: 60, sp: 1 }, next: 'daofei' },
  daofei: { title: 'Daofei on the Old Road', giver: 'Merchant Mei', steps: [
      { text: 'Find the daofei camp east of the village', check: () => G.player.pos.distanceTo(V3(LOC.daofei.x, G.player.pos.y, LOC.daofei.z)) < 40 },
      { text: 'Defeat the daofei (non-lethally, if you wish)', check: () => (G.stats.daofei || 0) >= DAOFEI.length, progress: () => `${Math.min(G.stats.daofei || 0, DAOFEI.length)}/${DAOFEI.length}` },
      { text: 'Return to Elder Bao', check: () => G.flags.reportedDaofei } ], reward: { xp: 220, sp: 2, items: { copper: 50 } }, next: 'teachers' },
  teachers: { title: 'The Old Teachers', giver: 'Elder Bao', steps: [
      { text: () => `Seek the first teacher of ${EL[nextElement(G.player.native)].short.toLowerCase()} — ${EL[nextElement(G.player.native)].teacher} — and awaken a second element`, check: () => (G.stats.awakened || 0) >= 1 },
      { text: 'Meditate beneath the Elder Banyan', check: () => G.flags.banyanVision } ], reward: { xp: 200, sp: 1 }, next: null },
};
const LORE = [
  { k: 'era', t: 'The Lost Era', b: 'You live nearly three thousand years before the Hundred Year War — some seven thousand years after Avatar Wan closed the spirit portals. The Fire Nation is a chain of island clans guided by the Fire Sages; the Earth Kingdom is a patchwork of walled cities with lawless roads between; the Water Tribes keep to the poles; the Air Nomads drift between their four temples on sky bison.' },
  { k: 'cycle', t: 'The Avatar Cycle', b: 'The Avatar is reborn in the order of the seasons: Fire, Air, Water, Earth. Each Avatar traditionally learns the elements in that same order, beginning with their own. The element opposite one\'s own — Fire against Water, Air against Earth — is always the hardest to learn.' },
  { k: 'teachers', t: 'The First Benders', b: 'Firebending was first learned from the dragons; earthbending from the blind badgermoles; waterbending from the Moon\'s push and pull on the tides; airbending from the sky bison. In this valley, traces of all four teachers remain.' },
  { k: 'daofei', t: 'Daofei', b: 'Outlaws of the Earth Kingdom roads. Some are desperate farmers, some are cruel, and some are earthbenders who learned to break rather than build.' },
  { k: 'spirits', t: 'Spirits', b: 'Since Avatar Wan closed the portals, spirits rarely cross into the human world. The Avatar is the bridge between the two worlds — and the valley\'s old banyan is said to be a place where that bridge feels thin.' },
];

const Game = {
  state: null, cooking: null,
  newState() { return { level: 1, xp: 0, sp: 1, learned: [], awakened: [], inv: {}, quests: {}, activeQuest: 'arrival', discovered: [], bestiary: [], lore: ['era', 'cycle'], daofeiDown: [] }; },
  has(id) { const t = TECH[id]; if (!t) return false; if (!this.state.learned.includes(id)) return false; if (t.el !== 'avatar' && !this.elementOpen(t.el)) return false; return true; },
  elementOpen(el) { return el === G.player.native || this.state.awakened.includes(el); },
  stat(k, n = 1) { G.stats[k] = (G.stats[k] || 0) + n; },
  give(item, n = 1) { this.state.inv[item] = (this.state.inv[item] || 0) + n; if (n > 0 && G.mode === 'play') G.ui.note(`+${n} ${ITEMS[item].name}`, 'good'); },
  take(item, n = 1) { if ((this.state.inv[item] || 0) < n) return false; this.state.inv[item] -= n; if (!this.state.inv[item]) delete this.state.inv[item]; return true; },
  count(item) { return this.state.inv[item] || 0; },
  firstRaw() { return ['meat_raw', 'fish_raw'].find(i => this.count(i) > 0) || null; },
  addXP(n) { const s = this.state; s.xp += n; while (s.xp >= this.xpNeed()) { s.xp -= this.xpNeed(); s.level++; s.sp++; G.player.maxHp += 6; G.player.maxChi += 5; G.player.hp = G.player.maxHp; G.player.chi = G.player.maxChi; G.ui.banner(`Level ${s.level}`, 'Your spirit grows stronger. +1 Skill Point'); SFX.gong(); FX.burst(V3(G.player.pos.x, G.player.pos.y + 1, G.player.pos.z), PAL.gold, PAL.ember, 40, 5, 0.4, 1); } },
  xpNeed() { return 100 + 70 * (this.state.level - 1); },
  onKill(e, el) {
    const xp = e.kind === 'daofei' ? (e.def.role === 'leader' ? 90 : 45) : (e.sp.xp || 5); this.addXP(xp);
    const elem = ['fire', 'earth', 'water', 'air'].includes(el) ? el : el === 'ice' || el === 'iceprison' ? 'water' : null; if (elem) this.stat('kills_' + elem, 1);
    this.stat('kills', 1); if (e.kind === 'daofei') { this.stat('daofei', 1); this.state.daofeiDown.push(e.def.name); }
    if (e.kind === 'animal' && !this.state.bestiary.includes(e.species)) { this.state.bestiary.push(e.species); G.ui.note(`Bestiary: ${e.name} recorded.`, 'lore'); }
  },
  /* ---------------- trials & learning ---------------- */
  trialNeed(id) { const t = TECH[id]; if (!t.trial) return 0; const aff = t.el === 'avatar' ? 'native' : affinity(G.player.native, t.el); return Math.ceil(t.trial.n * (t.awaken ? (affinity(G.player.native, t.awaken) === 'opposite' ? 1.5 : 1) : AFF_MULT[aff])); },
  trialCur(id) { const t = TECH[id]; if (!t.trial) return 0; return Math.floor(G.stats[t.trial.stat] || 0); },
  spCost(id) { const t = TECH[id]; if (t.awaken) return affinity(G.player.native, t.awaken) === 'opposite' ? 4 : 2; const aff = t.el === 'avatar' ? 'native' : affinity(G.player.native, t.el); return Math.ceil((t.sp || 1) * AFF_MULT[aff]); },
  lockReason(id) {
    const t = TECH[id]; const P = G.player; if (!t) return 'Unknown';
    if (t.late) return 'Later in your journey.';
    if (this.state.learned.includes(id)) return null;
    if (t.awaken === P.native) return 'This is your native element.';
    if (t.el !== 'avatar' && !this.elementOpen(t.el)) return `You have not yet awakened ${EL[t.el].name}. Seek ${EL[t.el].teacher}.`;
    if (t.awaken && affinity(P.native, t.awaken) === 'opposite' && !this.state.awakened.length) return `${EL[t.awaken].name} opposes your native element. You must awaken another element first.`;
    if (t.req) for (const r of t.req) if (!this.state.learned.includes(r)) return `Requires: ${TECH[r].name}`;
    return null;
  },
  canLearn(id) { return !this.lockReason(id) && !this.state.learned.includes(id) && this.trialCur(id) >= this.trialNeed(id) && this.state.sp >= this.spCost(id); },
  learn(id) {
    if (!this.canLearn(id)) return false; const t = TECH[id]; this.state.sp -= this.spCost(id); this.state.learned.push(id); this.stat('learned', 1);
    if (t.awaken) { this.state.awakened.push(t.awaken); this.stat('awakened', 1); for (const s of STARTING[t.awaken]) if (!this.state.learned.includes(s)) this.state.learned.push(s); }
    this.ceremony(id); this.addXP(25); this.save(); return true;
  },
  ceremony(id) {
    const t = TECH[id]; const el = t.awaken || (t.el === 'avatar' ? 'avatar' : t.el); const P = G.player; const col = el === 'avatar' ? '#bfe7ff' : EL[el].color;
    G.ui.ceremony(t.awaken ? EL[t.awaken].glyph : t.glyph, t.awaken ? 'ELEMENT AWAKENED' : 'TECHNIQUE LEARNED', t.awaken ? EL[t.awaken].name : t.name, t.awaken ? EL[t.awaken].quote : t.quote, col);
    SFX.unlock(el); playAction(P.H, 'ceremony', 1); P.ceremonyT = 3.6;
    const c = () => V3(P.pos.x, P.pos.y + 1, P.pos.z);
    const rocks = []; if (el === 'earth') for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(ROCK_GEO, VCMAT()); m.scale.setScalar(0.5); G.scene.add(m); rocks.push(m); }
    G.effects.push({ t: 0, update(dt) { this.t += dt; const u = this.t; const p = c();
      if (el === 'fire') { for (let k = 0; k < 3; k++) { const a = u * 6 + k * 2.09; const r = 1.6 - u * 0.2; FX.fire(V3(p.x + Math.cos(a) * r, p.y - 0.8 + u * 0.8, p.z + Math.sin(a) * r), 2, 0.4, 0.6, 1.2); } if (u > 1.5 && u < 1.6) FX.burst(p, PAL.fireA, PAL.fireB, 60, 7, 0.7, 0.8); FX.embers(p, 1); }
      else if (el === 'water') { for (let k = 0; k < 4; k++) { const a = u * 4 + k * 1.57; FX.norm.emit(p.x + Math.cos(a) * 1.5, p.y - 0.4 + Math.sin(u * 3 + k) * 0.6, p.z + Math.sin(a) * 1.5, 0, 0, 0, 0.6, 0.35, 0.1, PAL.waterA, PAL.waterB, { alpha: 0.9 }); } FX.sparkle(p, PAL.moon, 1, 2, 0.2); if (u > 1.5 && u < 1.55) FX.splash(p, 40, 5); }
      else if (el === 'earth') { rocks.forEach((m, i) => { const a = u * 2.5 + i * 0.785; const lift = U.smooth(0, 0.8, u) * (1 - U.smooth(2.6, 3.0, u)); m.position.set(p.x + Math.cos(a) * 2.2, P.pos.y - 0.5 + lift * (1.6 + Math.sin(i) * 0.5), p.z + Math.sin(a) * 2.2); m.rotation.x += dt * 3; }); if (u > 2.9 && !this.slam) { this.slam = true; FX.dust(P.pos, 30, 5, 1.4); SFX.earth(); G.camShake = 0.4; } }
      else if (el === 'air') { for (let k = 0; k < 3; k++) { const a = u * 7 + k * 2.09; const r = 0.6 + u * 0.5; FX.air(V3(p.x + Math.cos(a) * r, P.pos.y + u * 1.2, p.z + Math.sin(a) * r), V3(-Math.sin(a), 0.5, Math.cos(a)), 1, 2, 0.5); } if (Math.random() < 0.4) FX.leaves(p, 1); }
      else { const cols = [PAL.fireB, PAL.waterB, PAL.leaf, PAL.airA]; for (let k = 0; k < 4; k++) { const a = u * 3 + k * 1.57; FX.sparkle(V3(p.x + Math.cos(a) * 1.8, p.y + Math.sin(u * 2 + k) * 0.5, p.z + Math.sin(a) * 1.8), cols[k], 2, 0.1, 0.35); } }
      return u < 3.6; }, end() { rocks.forEach(m => G.scene.remove(m)); } });
  },
  /* ---------------- survival ---------------- */
  eatItem(item) {
    const it = ITEMS[item]; const P = G.player; if (!it || !this.take(item, 1)) return false;
    if (it.food) P.hunger = Math.min(100, P.hunger + it.food); if (it.drink) P.thirst = Math.min(100, P.thirst + it.drink); if (it.heal) P.hp = Math.min(P.maxHp, P.hp + it.heal);
    playAction(P.H, 'eat', 1); SFX.eat(); this.stat('ate', 1); if (!it.raw && it.food) this.stat('ate_cooked', 1);
    if (it.raw && Math.random() < 0.5) { P.status.sick = 40; G.ui.note('The raw meat turns your stomach. You feel sick.', 'bad'); }
    if (it.meat && P.native === 'air') { P.chi = Math.max(0, P.chi - 20); G.ui.note('The monks raised you vegetarian. The meat sits heavy on your spirit (−chi).', 'lore'); }
    else G.ui.note(`You eat the ${it.name.toLowerCase()}.`); return true;
  },
  eatBest() { const order = ['meat_cooked', 'fish_cooked', 'peach', 'cabbage', 'berries', 'herb', 'meat_raw', 'fish_raw'];
    const P = G.player; let list = order; if (P.native === 'air') list = ['peach', 'cabbage', 'berries', 'herb', 'meat_cooked', 'fish_cooked', 'meat_raw', 'fish_raw'];
    if (P.hp < P.maxHp * 0.5 && this.count('herb')) return this.eatItem('herb');
    for (const i of list) if (this.count(i)) return this.eatItem(i); G.ui.note('You have nothing to eat. Hunt, fish or forage.', 'bad'); return false; },
  drinkSkin() { const P = G.player; if (P.water <= 0) { G.ui.note('Your waterskin is empty.', 'bad'); return; } P.water--; P.thirst = Math.min(100, P.thirst + 25); SFX.water(); this.stat('drinks_skin', 1); G.ui.note('You drink from your waterskin.'); },
  startCook(item, how) { if (this.cooking) return; this.cooking = { item, how, t: 0, dur: how === 'hand' ? 1.6 : 2.4 }; },
  updateCook(dt) { const c = this.cooking; if (!c) return; const P = G.player; c.t += dt; G.ui.progress(c.t / c.dur);
    if (c.how === 'hand' && Math.random() < 0.6) FX.fire(P.handPos('R'), 1, 0.4, 0.35, 0.6);
    if (c.t >= c.dur) { this.cooking = null; G.ui.progress(-1); if (this.take(c.item, 1)) { const out = ITEMS[c.item].cooksTo; this.give(out, 1); this.stat('cooked', 1); SFX.fire(); } } },
  buildCampfire() { const P = G.player; if (this.count('wood') < 4) { G.ui.note('You need 4 firewood to build a campfire. Gather wood from trees (F).', 'bad'); return; }
    if (P.swimming) return; this.take('wood', 4); const fwd = V3(Math.sin(P.yaw), 0, Math.cos(P.yaw)); const p = P.pos.clone().addScaledVector(fwd, 1.6); const cf = new Campfire(p.x, p.z, false); G.campfires.push(cf); this.stat('campfires', 1); playAction(P.H, 'gather', 1);
    G.ui.note(this.has('spark') ? 'Campfire built. Kindle it with firebending (Hearth Flame) or press F to strike flint.' : 'Campfire built. Press F to strike flint and light it.', 'good');
    if (G.campfires.filter(c => !c.permanent).length > 6) { const old = G.campfires.find(c => !c.permanent); old.remove(); G.campfires.splice(G.campfires.indexOf(old), 1); } },
  canSleep() { const P = G.player; if (!(G.time >= 19 || G.time < 5)) return 'You can only sleep after dusk.';
    const hostile = G.ents.find(e => e.alive && e.hostile && e.pos.distanceTo(P.pos) < 25 && (e.state === 'chase' || e.state === 'attack')); if (hostile) return 'You cannot rest while enemies are near!';
    if (P.sheltered || nearestLitFire(P.pos, 5) || Math.hypot(P.pos.x - World.inn.x, P.pos.z - World.inn.z) < 8) return null; return 'You need shelter or a lit campfire to sleep safely.'; },
  sleep() { const why = this.canSleep(); if (why) { G.ui.note(why, 'bad'); return; } const P = G.player; P.sleeping = true; G.ui.fade(true);
    setTimeout(() => { const wasNight = G.time >= 19 || G.time < 5; if (G.time >= 19) G.day++; G.time = 6.2; P.hp = P.maxHp; P.chi = P.maxChi; P.stam = 100; P.warmth = Math.max(P.warmth, 70); P.hunger = Math.max(0, P.hunger - 18); P.thirst = Math.max(0, P.thirst - 22);
      if (wasNight) { this.stat('slept', 1); this.stat('nights', 1); } P.respawn = P.pos.clone(); P.sleeping = false; G.ui.fade(false); G.ui.banner(`Day ${G.day}`, 'The sun rises over Tienhai Valley.'); this.save(); }, 1600); },
  die(src) { const P = G.player; P.dead = true; P.hp = 0; G.mode = 'dead'; SFX.gong();
    const lines = ['Your past lives will not let the cycle end here. You feel their hands pull you back toward the world.', 'Darkness — then a voice that sounds like your own, but older: "Not yet. Get up."', 'You dream of the Avatars before you, standing in a long line. The last of them shakes their head and points back the way you came.'];
    G.ui.dead(`${src && src.name ? `Felled by ${src.name}. ` : ''}${lines[Math.floor(Math.random() * lines.length)]}`); },
  respawn() { const P = G.player; const sp = P.respawn || V3(-8, 0, 12); P.pos.set(sp.x, groundH(sp.x, sp.z) + 0.1, sp.z); P.vel.set(0, 0, 0); P.vy = 0; P.dead = false; P.hp = P.maxHp * 0.6; P.chi = P.maxChi * 0.5; P.hunger = Math.max(P.hunger, 40); P.thirst = Math.max(P.thirst, 40); P.warmth = Math.max(P.warmth, 60);
    for (const i of ['meat_raw', 'fish_raw']) delete this.state.inv[i]; G.mode = 'play'; G.ui.hideDead(); G.time = Math.max(G.time, 6.5) < 20 ? G.time : 6.5; G.ui.note('You awaken, weakened but whole. Raw food you carried has spoiled.', 'lore'); },
  drop(pos, item, n) { G.drops.push(new Drop(pos, item, n)); },
  /* ---------------- quests ---------------- */
  questTick() {
    const s = this.state; const q = QUESTS[s.activeQuest]; if (!q) return; const prog = s.quests[s.activeQuest] || (s.quests[s.activeQuest] = { step: 0 });
    while (prog.step < q.steps.length && q.steps[prog.step].check()) { prog.step++; SFX.ui(); if (prog.step < q.steps.length) G.ui.note(`Quest updated: ${typeof q.steps[prog.step].text === 'function' ? q.steps[prog.step].text() : q.steps[prog.step].text}`, 'good'); }
    if (prog.step >= q.steps.length && !prog.done) { prog.done = true; const r = q.reward; if (r.xp) this.addXP(r.xp); if (r.sp) s.sp += r.sp; if (r.items) for (const k in r.items) this.give(k, r.items[k]);
      G.ui.banner('Quest Complete', q.title + (r.sp ? `  ·  +${r.sp} Skill Point${r.sp > 1 ? 's' : ''}` : '')); SFX.unlock('avatar'); s.activeQuest = q.next; if (q.next) { s.quests[q.next] = { step: 0 }; setTimeout(() => G.ui.note(`New quest: ${QUESTS[q.next].title}`, 'good'), 2500); } else this.chapterEnd(); this.save(); }
  },
  chapterEnd() { G.flags.chapter1 = true; setTimeout(() => G.ui.story([
      `<p><b>END OF CHAPTER ONE — THE VALLEY OF FOUR WINDS</b></p><p>The vision fades, but the words of Avatar ${PAST_AVATARS[prevElement(G.player.native)].name} stay with you: <i>"Something is crossing over where nothing should cross. Find the spiral on the map, young one. Find it before the others do."</i></p><p>The torn daofei map shows an island far to the west, beyond the Great Divide, marked with a spiral that matches no nation's symbol.</p><p>Your journey continues… The valley remains open to you: hunt, train, complete your trials, and master your elements while the next chapter is written.</p>`], null), 1200); },
  /* ---------------- interaction ---------------- */
  findInteract() {
    const P = G.player; const fwd = V3(Math.sin(P.yaw), 0, Math.cos(P.yaw)); let best = null, bestScore = 1e9;
    const consider = (pos, r, label, action, prio = 0) => { const dx = pos.x - P.pos.x, dz = pos.z - P.pos.z; const d = Math.hypot(dx, dz); if (d > r) return; if (Math.abs((pos.y ?? P.pos.y) - P.pos.y) > 3.5) return;
      const facing = d > 0.3 ? (dx * fwd.x + dz * fwd.z) / d : 1; const s = d - prio - Math.max(0, facing) * 0.9; /* what you face wins ties */ if (s < bestScore) { bestScore = s; best = { label, action, pos }; } };
    if (P.sheltered && P.shelter) consider(P.pos, 3, 'Leave the shelter', () => { P.shelter.collapse(); P.shelter = null; }, 5);
    for (const e of G.ents) { if (e.kind === 'villager') consider(e.pos, 3.2, `Talk to ${e.name}`, () => Dialog.open(e), 2);
      else if (!e.alive && !e.harvested && e.kind === 'animal') consider(e.pos, 2.4 + e.radius, `Harvest ${e.name}`, () => this.harvest(e), 3); }
    for (const f of G.campfires) { if (!f.lit) consider(f.pos, 2.5, this.has('spark') ? 'Light campfire (firebending)' : 'Strike flint to light', () => this.lightFire(f), 2);
      else if (this.firstRaw()) consider(f.pos, 2.6, `Cook ${ITEMS[this.firstRaw()].name}`, () => { this.startCook(this.firstRaw(), 'fire'); playAction(P.H, 'gather', 1); }, 2);
      else if (this.canSleep() === null) consider(f.pos, 2.6, 'Sleep by the fire until dawn', () => this.sleep(), 1); }
    if (P.sheltered && this.canSleep() === null) consider(P.pos, 3, 'Sleep in your stone tent until dawn', () => this.sleep(), 6);
    if (World.inn) consider(V3(World.inn.x, P.pos.y, World.inn.z), 7, 'Rest at the Inn of the Jade Lantern', () => Dialog.inn(), 0);
    for (const tr of this.nearby(World.treeRecs, P.pos, 3.2)) consider(V3(tr.x, P.pos.y, tr.z), 2.4 + tr.s * 0.4, tr.kind === 'peach' ? 'Pick moon peaches' : 'Gather firewood', () => this.gatherTree(tr), 0);
    for (const b of this.nearby(World.bushRecs, P.pos, 3)) consider(V3(b.x, P.pos.y, b.z), 2.3, b.berries > 0 ? 'Pick berries' : 'Bush (picked clean)', () => this.pickBush(b), 0);
    for (const r of this.nearby(World.rockRecs, P.pos, 3.5)) if (r.s > 0.35) consider(V3(r.x, P.pos.y, r.z), 1.6 + r.s * 0.9, P.native === 'earth' || this.state.awakened.includes('earth') ? 'Bend stone free' : 'Chip off stone', () => this.gatherStone(r), -0.5);
    for (const tab of TABLETS) consider(tab.pos, 3, `Read: ${tab.title}`, () => G.ui.story([`<p><b>${tab.title}</b></p>${tab.text}`], null), 1);
    if (World.cabbageCart) consider(V3(World.cabbageCart.x, P.pos.y, World.cabbageCart.z), 3, 'Admire the cabbages', () => { const m = G.ents.find(e => e.def && e.def.id === 'cabbage'); if (m) Dialog.open(m); }, 0);
    const w = nearWater(P.pos, 3.5); if (w && !P.swimming) consider(V3(w.x, P.pos.y, w.z), 6, 'Drink water', () => { P.thirst = Math.min(100, P.thirst + 35); P.water = P.waterMax; this.stat('drinks', 1); SFX.water(); playAction(P.H, 'gather', 1.3); G.ui.note('You drink deeply and refill your waterskin.', 'good'); }, -1);
    return best;
  },
  nearby(list, pos, r) { const out = []; for (const t of list) { if (Math.abs(t.x - pos.x) < r + 2 && Math.abs(t.z - pos.z) < r + 2) out.push(t); } return out; },
  interact() { const P = G.player; if (P.dead || P.sleeping) return; if (P.meditating) { P.stopMeditate(); return; } const it = this.findInteract(); if (it) it.action(); },
  harvest(e) { const sp = e.sp; const P = G.player; e.harvested = true; e.deadT = 0; playAction(P.H, 'gather', 1); const meat = Math.max(1, Math.round(sp.meat * (P.bg.perk.meat || 1)));
    this.give('meat_raw', meat); if (sp.hide) this.give('hide', sp.hide); this.stat('harvested', 1); FX.burst(V3(e.pos.x, e.pos.y + 0.5, e.pos.z), PAL.leaf, PAL.dustB, 8, 2, 0.25, 0.6, { normal: true, alpha: 0.6 });
    if (P.native === 'air' && !G.flags.airMeatNote) { G.flags.airMeatNote = true; G.ui.note('Air Nomads do not eat meat — but meat and hides trade well with merchants.', 'lore'); } },
  lightFire(f) { const P = G.player; if (this.has('spark')) { Tech.cast('spark'); return; }
    if (this.count('stone') < 1) { G.ui.note('You need a stone to strike sparks against your flint.', 'bad'); return; } playAction(P.H, 'gather', 1.2); SFX.crack();
    if (Math.random() < 0.6) { f.lit = true; f.fuel = 240; FX.burst(V3(f.pos.x, f.pos.y + 0.3, f.pos.z), PAL.fireA, PAL.fireB, 20, 2, 0.5, 0.6, { up: 1.5 }); G.ui.note('Sparks catch the kindling. The campfire is lit.', 'good'); this.stat('fires_lit', 1); }
    else { FX.sparkle(V3(f.pos.x, f.pos.y + 0.3, f.pos.z), PAL.ember, 6, 0.3, 0.1); G.ui.note('Only sparks. Try again.'); } },
  gatherTree(tr) { const P = G.player; if ((tr.cd || 0) > G.t) { G.ui.note(tr.kind === 'peach' ? 'This tree has been picked over for now.' : 'You\'ve taken what you can from this tree for now.'); return; } tr.cd = G.t + 90; playAction(P.H, 'gather', 1); SFX.crack();
    FX.leaves(V3(tr.x, tr.y + 3, tr.z), 10); if (tr.kind === 'peach') { this.give('peach', 2); return; } const n = (P.perk.gather || 1) * (1 + (Math.random() < 0.5 ? 1 : 0)); this.give('wood', n); this.stat('wood', n); },
  pickBush(b) { const P = G.player; if (b.berries <= 0) { if (G.t > (b.regrow || 0)) b.berries = 3; else return; } const n = Math.min(b.berries, 2); b.berries -= n; b.regrow = G.t + 180; playAction(P.H, 'gather', 1.3); this.give('berries', n);
    if (Math.random() < 0.25) this.give('herb', 1); },
  gatherStone(r) { const P = G.player; if ((r.cd || 0) > G.t) { G.ui.note('Nothing more to take here for now.'); return; } r.cd = G.t + 40; const earth = P.native === 'earth' || this.state.awakened.includes('earth');
    playAction(P.H, earth ? 'earthLift' : 'gather', 1); if (earth) { FX.dust(V3(r.x, r.y + 0.3, r.z), 8, 2, 0.7); SFX.earth(); } else SFX.crack(); const n = (earth ? 2 : 1) * (P.perk.gather || 1); this.give('stone', n); this.stat('stones', n); },
  /* ---------------- save / load ---------------- */
  save(silent = true) {
    if (TEST_MODE && !G.allowSave) return; try { const P = G.player; const data = { v: 1, profile: P.profile, pos: [P.pos.x, P.pos.y, P.pos.z], yaw: P.yaw, hp: P.hp, chi: P.chi, maxHp: P.maxHp, maxChi: P.maxChi, hunger: P.hunger, thirst: P.thirst, warmth: P.warmth, water: P.water, respawn: P.respawn ? [P.respawn.x, P.respawn.z] : null,
        time: G.time, day: G.day, stats: G.stats, flags: G.flags, state: this.state, settings: G.settings };
      localStorage.setItem('avatar_lost_era_v1', JSON.stringify(data)); if (!silent) G.ui.note('Journey saved.', 'good'); } catch (e) { if (!silent) G.ui.note('Could not save (storage unavailable).', 'bad'); } },
  loadData() { try { const s = localStorage.getItem('avatar_lost_era_v1'); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
};

/* Lore tablets placed in the world */
const TABLETS = [];
function placeTablets() {
  const mk = (x, z, title, text) => { const y = terrainH(x, z); const b = new GeoBuilder(); b.add(new THREE.BoxGeometry(1.2, 1.6, 0.25), '#8f877a', 0, 0.8, 0, 0, 0, 0, 1, 1, 1, { ao: 0.3 }); b.add(new THREE.BoxGeometry(1.4, 0.2, 0.4), '#6a645a', 0, 1.65, 0);
    const m = new THREE.Mesh(b.build(), VCMAT()); m.position.set(x, y, z); m.rotation.y = Math.atan2(-x, -z); G.scene.add(m); addCollider({ type: 'circle', x, z, r: 0.6 }); TABLETS.push({ pos: V3(x, y, z), title, text }); };
  mk(LOC.sunruins.x + 16, LOC.sunruins.z + 8, 'Tablet of the Sun Warriors', '<p>"Before there was fire in the hands of men, there was the Sun, and the Sun spoke through the dragons. They showed us that fire is life — the energy of the sun within us — and not only destruction."</p><p>"The flame atop this temple has not died since the first dragon breathed it."</p><p class="sig">— Fragment, script of an ancient people</p>');
  mk(LOC.moonpool.x + 6, LOC.moonpool.z - 6, 'Tablet of the Moon', '<p>"The Ocean and the Moon circle one another, push and pull, never resting. The first benders of water watched the tides answer the Moon, and learned to ask the same of the water."</p><p>"Waterbenders draw their strength from the Moon. On the night it is full, they are at their strongest."</p>');
  mk(LOC.badgercave.x - 9, LOC.badgercave.z + 9, 'Tablet of the Badgermoles', '<p>"The badgermoles are blind, yet they know the whole mountain. They do not fight the earth. They feel it, and it moves for them."</p><p>"Two lovers learned this from them, long ago, and built a city where they were joined."</p>');
  mk(LOC.bisonpeak.x + 10, LOC.bisonpeak.z + 4, 'Tablet of the Sky', '<p>"The first airbenders were taught by the sky bison, who ride the winds without fighting them. To bend the air, let go of what tethers you."</p><p>"Here the herds still come to graze. Sit with them, and listen to the wind."</p>');
  mk(LOC.banyan.x + 8, LOC.banyan.z + 2, 'The Elder Banyan', '<p>"Spirits walked among these roots when the world was young, before Avatar Wan closed the doors between the worlds. The roots remember. The Avatar, who is a bridge, may hear them still."</p>');
}
