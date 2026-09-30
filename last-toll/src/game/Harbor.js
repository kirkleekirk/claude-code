import * as THREE from 'three';
import { makeItem, def } from '../data/items.js';
import { approachById, ESCAPES } from '../data/heist.js';
import { countOwned } from '../data/story.js';
import { SHIP, WY } from '../world/HarborGen.js';
import { Boat } from '../entities/Boat.js';
import { Squad } from '../entities/Allies.js';
import { SKY } from '../world/Sky.js';
import { clamp } from '../core/math.js';

// Port Lafitte, on a raid: everything the harbor has that the rest of the parish
// doesn't. Ladders and the anchor chain, the water (and under it), the boats, the
// Covenant's crew of Guardsmen, the cage in Hold 3 and the sea chest under it, the
// places to scout the ship from, and on the night of the job, the approach you
// picked and the ways out it gives you.

const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class HarborRaid {
  constructor(raid) {
    this.r = raid;
    this.city = raid.city;
    this.sites = raid.city.sites;
    this.approach = raid.heist ? approachById(raid.heist.approach) : null;
    this.gear = raid.heist?.gear || {};
    this.boats = [];
    this.boat = null;
    this.climb = null;
    this.gotCase = false;
    this.caseDone = !!raid.profile.heist?.done;
    this.vaultOpen = false;
    this.chestOpen = false;
    this.alarm = false;
    this.scouted = false;
    this.fuse = null;
    this.noiseT = 0;
    this.fov = null;
    this.under = false;
  }

  // Does the survivor have this with them (or ready aboard, for the night of the job)?
  has(id) {
    if (this.r.inv.count(id) > 0) return true;
    return !!this.gear[id];
  }

  get knowsJob() {
    const h = this.r.profile.heist;
    return !!h && h.stage !== 'locked';
  }

  start() {
    const r = this.r;
    this._shipGuards();
    this._lights();
    this._climbs();
    this._uses();
    this._vault();
    this._seaChest();
    if (this.knowsJob && !this.approach) this._plantSetups();
    if (!this.caseDone) this._prototype();
    this._boats();
    this._placePlayer();
    if (this.approach?.id === 'magnolia') this._crew();
    r.env.water.material.side = THREE.DoubleSide;
    // no sea inside the Covenant's hull
    r.env.water.material.userData.wHole.value.set(SHIP.x0 + 10, SHIP.z0 + 0.5, SHIP.x1 - 0.5, SHIP.z1 - 0.5);
    // the Magnolia is a way home when she's here
    if (this.sites.magnolia) {
      const m = this.sites.magnolia;
      r.docks.unshift({ name: 'The Magnolia', center: m.deck.clone(), radius: 3.2, lantern: m.deck.clone().setY(m.y + 2.4), spawn: m.deck.clone(), yaw: 0, insertion: true });
      r.docks[1].insertion = false;
    }
  }

  // ---- setup --------------------------------------------------------------------------

  _shipGuards() {
    const r = this.r, S = this.city.ship, rng = r.rng;
    const loud = this.approach && this.approach.kit === 'loud';
    for (const p of S.posts) {
      const s = r.guards.spawnSoldier(new THREE.Vector3(p.x, p.y, p.z), { post: true, facing: p.facing });
      s.ship = true;
    }
    for (const route of S.routes) {
      const n = 2;
      for (let k = 0; k < n; k++) {
        const a = route[k % route.length];
        const s = r.guards.spawnSoldier(new THREE.Vector3(a.x + rng.range(-0.6, 0.6), a.y, a.z + rng.range(-0.6, 0.6)), { route });
        s.routeI = (k + 1) % route.length;
        s.ship = true;
      }
    }
    // on a loud night the Guard has a few more hands on deck
    if (loud) {
      for (const [x, z] of [[-30, SHIP.z1 - 2], [36, SHIP.z1 - 1.8]]) {
        const s = r.guards.spawnSoldier(new THREE.Vector3(x, SHIP.deck, z), { post: true, facing: Math.PI });
        s.ship = true;
      }
    }
  }

  _lights() {
    const r = this.r;
    this.holdLights = [];
    for (const p of this.city.ship.lights) {
      const l = new THREE.PointLight(0xfff0d0, 22, 20, 1.3);
      l.position.set(p.x, SHIP.hold + 6, (SHIP.hz0 + SHIP.hz1) / 2);
      r.scene.add(l);
      this.holdLights.push(l);
    }
  }

  _climbs() {
    const r = this.r;
    for (const c of this.city.climbs) {
      r.loot.addExtra({ pos: c.base.clone().add(new THREE.Vector3(0, 1.15, 0)), radius: 0.75, get label() { return `Climb ${c.label}`; }, onUse: () => this.startClimb(c, true), climbExtra: true });
      r.loot.addExtra({ pos: c.off.clone().add(new THREE.Vector3(0, 0.45, 0)), radius: 0.6, get label() { return `Climb down ${c.label}`; }, onUse: () => this.startClimb(c, false), climbExtra: true });
    }
  }

  _uses() {
    const r = this.r;
    for (const u of this.city.uses) {
      if (u.kind === 'scope') {
        r.loot.addExtra({ pos: u.pos, radius: 0.8, label: u.label, onUse: () => this._scope() });
      } else if (u.kind === 'lifeboat') {
        const h = this;
        this.lifeboatUse = r.loot.addExtra({ pos: u.pos, radius: 1.2, get label() { return h.lifeboat ? 'The lifeboat is gone' : 'Launch the lifeboat'; }, onUse: () => this._launchLifeboat() });
      }
    }
  }

  _vault() {
    const v = this.sites.vault;
    if (!v) return;
    const h = this;
    this.vaultUse = this.r.loot.addExtra({
      pos: v.pos, radius: 0.7,
      get label() {
        if (h.has('manifest')) return 'Punch in the cage code — 4-1-7-7';
        if (h.has('cutting_torch')) return 'Cut the cage lock with the torch';
        if (h.r.inv.count('demo_charge')) return 'Blow the cage lock (demolition charge)';
        return 'The cage is locked — cut it, blow it, or find the code';
      },
      onUse: () => this._openCage(),
    });
  }

  _seaChest() {
    const sc = this.sites.seaChest;
    if (!sc) return;
    const h = this;
    // from inside the hold
    this.r.loot.addExtra({
      pos: sc.top.clone().add(new THREE.Vector3(0, 0.3, 0)), radius: 0.7,
      get label() { return h.chestOpen ? 'Drop down through the sea chest' : 'Unbolt the sea chest hatch'; },
      onUse: () => {
        if (!h.chestOpen) { h._work('Unbolting the hatch…', 3, () => { h.chestOpen = true; h.r.app.audio.mech('bench'); h.r.hud.toast('The sea chest is open. Straight down to the sea.'); }); return; }
        h._path([h.r.player.pos.clone(), sc.top.clone(), sc.bottom.clone()], [0.3, 1.2], 'dive');
        h.r.app.audio.splash(sc.bottom, 0.6);
      },
    });
    // from under the hull
    this.r.loot.addExtra({
      pos: sc.hull.clone().add(new THREE.Vector3(0, -0.7, 0)), radius: 1.0,
      get label() { return h.chestOpen ? 'Climb up through the sea chest' : h.has('cutting_torch') ? 'Cut the sea chest grate' : 'A grate over the sea chest — you need a cutting torch'; },
      onUse: () => {
        if (!h.chestOpen) {
          if (!h.has('cutting_torch')) { h.r.app.audio.ui('error'); return; }
          h._work('Cutting the grate…', 5, () => { h.chestOpen = true; h.r.hud.toast('The grate is off. Up into Hold 3.'); }, true);
          return;
        }
        h._path([h.r.player.pos.clone(), sc.bottom.clone(), sc.top.clone()], [0.5, 1.4], 'walk');
        h.r.hud.big('Hold 3', 'You come up through the tank top beside the Guard\'s cage.', '', 3);
      },
    });
  }

  // Put what the job needs where the harbor keeps it, unless you already have it.
  _plantSetups() {
    const p = this.r.profile, s = this.sites;
    const own = (id) => countOwned(p, id) > 0;
    const put = (c, id, qty = 1) => { if (c && !c.opened) c.items.unshift(makeItem(id, qty)); };
    if (!own('dive_gear')) put(s.diveLocker, 'dive_gear');
    if (!own('cutting_torch')) put(s.torchChest, 'cutting_torch');
    if (!own('boat_keys')) put(s.masterDesk, 'boat_keys');
    if (!own('manifest')) put(s.masterDesk, 'manifest');
    put(s.fuelStore, 'fuel_can', 2);
  }

  _prototype() {
    const p = this.sites.prototype;
    if (!p) return;
    this.caseItem = this.r.loot.spawnItem(makeItem('prototype_case'), p.clone(), 0.3, { static: false });
  }

  _boats() {
    const r = this.r, s = this.sites;
    // Ray's speedboat, tied up at the end of the marina float
    if (s.speedDock) {
      const b = new Boat({ scene: r.scene, world: r.world, audio: r.app.audio, kind: 'speed', pos: s.speedDock, heading: 0 });
      b.name = 'Ray\'s speedboat';
      this.speedboat = b;
      this._boatUse(b);
      this.boats.push(b);
    }
  }

  _boatUse(b) {
    const h = this;
    b.use = this.r.loot.addExtra({
      getPos: (out) => b.console(out), radius: 1.0,
      get label() {
        if (b === h.speedboat && !h.has('boat_keys')) return 'Ray\'s speedboat — the keys are in the harbor master\'s desk';
        if (b === h.speedboat && !h.approach && h.r.inv.count('fuel_can') < 1) return 'Ray\'s speedboat — the tank is dry. It needs a can of fuel.';
        return `Take the wheel of ${b.name}`;
      },
      onUse: () => {
        if (b === h.speedboat && !h.has('boat_keys')) { h.r.app.audio.ui('error'); return; }
        if (b === h.speedboat && !h.approach && !b.fuelled) {
          if (h.r.inv.count('fuel_can') < 1) { h.r.app.audio.ui('error'); return; }
          h.r.inv.take('fuel_can', 1);
          b.fuelled = true;
          h.r.hud.toast('A can of diesel in the tank');
        }
        h.enterBoat(b);
      },
    });
  }

  _placePlayer() {
    const r = this.r, P = r.player, a = this.approach;
    if (!a) return;
    if (a.start === 'boat' && this.speedboat) {
      this.speedboat.fuelled = true;
      this.enterBoat(this.speedboat);
      P.yaw = 0;
    } else if (a.start === 'magnolia' && this.sites.magnolia) {
      const m = this.sites.magnolia;
      P.spawn(m.deck.clone(), 0);
    }
    if (a.id === 'dive') P.diveGear = true;
  }

  _crew() {
    const r = this.r, m = this.sites.magnolia;
    this.squad = new Squad({ scene: r.scene, world: r.world, player: r.player, guards: r.guards, fx: r.fx, audio: r.app.audio, hud: r.hud, rng: r.rng, climbs: this.city.climbs, noise: (p, rad) => r.noise(p, rad) });
    this.squad.add('hale', m.ally[0].clone(), 'rifle');
    this.squad.add('remy', m.ally[1].clone(), 'shotgun');
  }

  // ---- ladders, chains and ropes ------------------------------------------------------------

  startClimb(c, up) {
    const P = this.r.player;
    if (this.boat) this.leaveBoat(false);
    const speed = c.speed || 2.6;
    const len = c.from.distanceTo(c.to);
    if (up) this._path([P.pos.clone(), c.from.clone(), c.to.clone(), c.off.clone()], [0.35, len / speed, 0.5], 'walk');
    else {
      const end = c.base.clone();
      const inWater = c.water;
      this._path([P.pos.clone(), c.to.clone(), c.from.clone(), end], [0.4, len / speed, 0.4], inWater ? 'swim' : 'walk');
    }
  }

  // Move the survivor along points, then leave them in a mode.
  _path(pts, durs, endMode) {
    const P = this.r.player;
    P.mode = 'climb';
    P.vel.set(0, 0, 0);
    this.climb = { pts, durs, i: 0, t: 0, endMode, clank: 0 };
  }

  _updateClimb(dt) {
    const c = this.climb, P = this.r.player;
    c.t += dt;
    const d = c.durs[c.i];
    const k = clamp(c.t / d, 0, 1);
    const e = c.i === 1 ? k : k * k * (3 - 2 * k);
    P.pos.copy(c.pts[c.i]).lerp(c.pts[c.i + 1], e);
    if (c.i === 1) {
      P.bob += dt * 5;
      P.bobAmt = 0.6;
      c.clank -= dt;
      if (c.clank <= 0) { c.clank = 0.42; this.r.app.audio.footstep(0.35, 'metal'); }
    }
    if (k >= 1) {
      c.i++;
      c.t = 0;
      if (c.i >= c.durs.length) {
        this.climb = null;
        P.mode = c.endMode;
        P.vy = 0;
        if (c.endMode === 'swim') P.pos.y = WY - 1.3;
        if (c.endMode === 'dive' && !P.diveGear && !this.has('dive_gear')) this.r.hud.toast('No air tank. Hold your breath and get out from under the hull.', true);
      }
    }
  }

  // ---- things that take a moment ------------------------------------------------------------

  _work(hint, dur, done, underwater = false) {
    const P = this.r.player;
    P.using = { kind: 'work', hint, t: 0, dur, done, sparks: true, underwater };
  }

  // Raid._finishUse hands special uses here. true when handled.
  finishUse(u) {
    if (u.kind === 'work') { u.done(); return true; }
    if (u.kind === 'scope') { this._scouted(); return true; }
    return false;
  }

  _scope() {
    const P = this.r.player;
    if (this.scouted) { this.r.hud.toast('You\'ve seen what you need. Get home and plan it.'); return; }
    P.using = { kind: 'scope', hint: 'Glassing the Covenant…', t: 0, dur: 5 };
    this.r.hud.toast('Binoculars up. Hold still.');
  }

  _scouted() {
    this.scouted = true;
    const r = this.r;
    if (!r.storyEvents.includes('scouted')) r.storyEvents.push('scouted');
    const n = r.guards.soldiers.filter((s) => s.ship && !s.dead).length;
    r.hud.big('The Covenant', `${n} Guardsmen aboard: the gangway, the bow, the bridge wing, the stern and down in the holds. A cage in Hold 3. A pilot ladder on the seaward side, the anchor chain at the bow, a sea chest under the aft hold, a lifeboat on the stern.`, '', 9);
    r.app.audio.ui('craft');
    setTimeout(() => { if (!r.ended) r.hud.toast(this.approach ? 'Scouted' : 'Scouted. Get home and plan it on Hale\'s board.'); }, 9000);
  }

  _openCage() {
    const r = this.r, audio = r.app.audio;
    if (this.vaultOpen || this.fuse) return;
    if (this.has('manifest')) {
      audio.beep(this.sites.vault.pos, false);
      setTimeout(() => this._cageOpens('The code takes. The cage swings open.'), 400);
      return;
    }
    if (this.has('cutting_torch')) {
      this._work('Cutting the lock…', 5, () => this._cageOpens('The lock drops off, glowing.'));
      r.noise(r.player.pos, 7);
      return;
    }
    if (r.inv.count('demo_charge')) {
      r.inv.take('demo_charge', 1);
      this.fuse = { t: 6, beep: 0 };
      r.hud.big('Charge set', 'Six seconds. Get back from the cage.', 'sweep', 3);
      audio.mech('bench');
      return;
    }
    audio.ui('error');
    r.hud.toast('A torch, a charge, or the code from the manifest', true);
  }

  _cageOpens(msg) {
    const v = this.sites.vault;
    this.vaultOpen = true;
    v.box.collide = false;
    v.box.occlude = false;
    this.gateSwing = 0;
    this.r.loot.removeExtra(this.vaultUse);
    this.r.hud.toast(msg);
    this.r.app.audio.open(v.pos, 'metal');
  }

  // ---- boats ----------------------------------------------------------------------------------

  enterBoat(b) {
    const P = this.r.player;
    this.boat = b;
    b.board(P);
    b.seat(P.pos);
    this.r.hud.toast(b === this.speedboat ? 'W to idle along quietly · Shift+W flat out (loud) · A/D steer · E to get off' : 'W ahead · A/D steer · E to get off');
  }

  // Off the boat: onto a ladder, a float or a landing if one's close, else into the water.
  leaveBoat(place = true) {
    const b = this.boat, P = this.r.player, W = this.r.world;
    if (!b) return;
    b.leave();
    this.boat = null;
    if (!place) return;
    b.seat(_v);
    // a ladder close by
    let best = null, bd = 4.5;
    for (const c of this.city.climbs) {
      if (!c.water) continue;
      const d = Math.hypot(c.base.x - _v.x, c.base.z - _v.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) { this.startClimb(best, true); return; }
    // somewhere to step to
    const s = Math.sin(b.heading), cc = Math.cos(b.heading);
    for (const side of [1, -1]) {
      for (const dist of [2.2, 3.2, 4.2]) {
        const x = b.pos.x + side * cc * dist, z = b.pos.z - side * s * dist;
        const g = W.heightAt(x, z, b.deckY + 1.2);
        if (g !== null && Math.abs(g - b.deckY) < 1.6 && g > WY - 0.8) {
          this._path([P.pos.clone(), new THREE.Vector3(x, g, z)], [0.5], 'walk');
          return;
        }
      }
    }
    // over the side
    const x = b.pos.x + cc * 2.4, z = b.pos.z - s * 2.4;
    this._path([P.pos.clone(), new THREE.Vector3(x, WY - 1.3, z)], [0.5], 'swim');
    this.r.app.audio.splash(new THREE.Vector3(x, WY, z), 0.6);
  }

  _launchLifeboat() {
    const r = this.r;
    if (this.lifeboat) return;
    const b = new Boat({ scene: r.scene, world: r.world, audio: r.app.audio, kind: 'life', pos: new THREE.Vector3(SHIP.x1 + 6, WY, SHIP.z0 + 4), heading: -Math.PI / 2 });
    b.name = 'the lifeboat';
    this.lifeboat = b;
    this.boats.push(b);
    this._boatUse(b);
    r.app.audio.splash(b.pos, 1.4);
    r.noise(b.pos, 40);
    this.enterBoat(b);
    r.hud.big('Lifeboat away', 'She drops off the stern ramp and rights herself. Open water is north, past the breakwater.', '', 4);
  }

  // ---- frame ----------------------------------------------------------------------------------

  update(dt) {
    const r = this.r, P = r.player, input = r.app.input;
    if (this.climb) this._updateClimb(dt);
    P.diveGear = P.diveGear || this.has('dive_gear');
    // boats
    for (const b of this.boats) b.update(dt, b === this.boat ? input : null, r.time);
    if (this.boat && P.mode === 'seat') {
      const before = this.boat.heading;
      this.boat.seat(P.pos);
      P.yaw += this.boat.heading - before;
      // the throttle is loud; idling isn't
      this.noiseT -= dt;
      if (this.noiseT <= 0) {
        this.noiseT = 0.8;
        if (this.boat.loud) r.noise(this.boat.pos, 55);
      }
      // run for open water: hold your course out past the line for a few seconds (so swinging
      // wide round the ship on the way in doesn't end the night)
      if (this.boat.pos.z < -160 || Math.abs(this.boat.pos.x) > 160) {
        if (!this.outT) r.hud.toast(this.gotCase ? 'Open water. Hold your course out to get clear of Port Lafitte' : 'Open water. Keep going to leave Port Lafitte without the case, or turn back');
        this.outT = (this.outT || 0) + dt;
        if (this.outT > 4) { r.finish('extracted', { name: 'Open water' }); return; }
      } else this.outT = 0;
      if (!r.uiOpen && input.wasPressed('KeyE')) this.leaveBoat();
    }
    // the torch throws sparks; the charge counts down
    const u = P.using;
    if (u && u.kind === 'work' && u.sparks && Math.random() < dt * 20) {
      _v.copy(P.eye).addScaledVector(P.forward(new THREE.Vector3()), 0.8);
      r.fx.sparks(_v, 3);
    }
    if (this.fuse) {
      const f = this.fuse, v = this.sites.vault;
      f.t -= dt;
      f.beep -= dt;
      if (f.beep <= 0) { f.beep = f.t > 2 ? 0.8 : 0.25; r.app.audio.beep(v.pos, f.t < 2); }
      if (f.t <= 0) {
        this.fuse = null;
        r.explode(v.pos.clone(), 3.2);
        this._cageOpens('The charge blows the gate off its hinges.');
        this._raiseAlarm();
      }
    }
    if (this.vaultOpen && this.gateSwing !== null && this.gateSwing < 1) {
      this.gateSwing = Math.min(1, this.gateSwing + dt * 1.5);
      this.sites.vault.gate.rotation.y = -1.9 * this.gateSwing;
    }
    // the prize
    if (!this.gotCase && r.inv.count('prototype_case') > 0) {
      this.gotCase = true;
      if (!r.storyEvents.includes('covenant')) r.storyEvents.push('covenant');
      const ways = (this.approach ? this.approach.escapes : ['overboard', 'lifeboat']).map((k) => ESCAPES[k].label).join(' · ');
      r.hud.big('The prototype case', `Now get it off the ship. ${ways}.`, '', 6);
      if (this.approach && this.approach.kit === 'loud') this._raiseAlarm();
    }
    // loud nights: the Guard knows once shooting starts near the ship
    if (!this.alarm && r.guards.soldiers.some((s) => s.ship && !s.dead && s.inCombat)) this._raiseAlarm();
    if (this.squad) this.squad.update(dt, r.time);
    // the lighthouse still turns
    const bc = this.sites.beacon;
    if (bc) {
      bc.group.rotation.y = r.time * 0.45;
      bc.mat.opacity = 0.06 * clamp((r.env.darkness - 0.3) * 2, 0, 1);
    }
  }

  _raiseAlarm() {
    if (this.alarm) return;
    this.alarm = true;
    const r = this.r;
    r.app.audio.siren(6);
    r.hud.toast('Alarm on the Covenant', true);
    for (const s of r.guards.soldiers) {
      if (!s.ship || s.dead || s.inCombat) continue;
      s.investigate.copy(r.player.pos);
      s.state = 'alert';
      s.t = 0;
    }
  }

  // After the camera moves: under the water, the world goes green and close.
  afterCamera(camera) {
    const r = this.r;
    const under = camera.position.y < WY - 0.02 && r.player.inWater;
    this.under = under;
    if (under) {
      SKY.p.z = 0;
      const fog = r.scene.fog;
      const depth = WY - camera.position.y;
      fog.color.setRGB(0.02, 0.07, 0.07).multiplyScalar(1 - r.env.darkness * 0.6);
      fog.near = 0.5;
      fog.far = Math.max(9, 26 - depth * 0.8);
      r.scene.background.copy(fog.color);
    }
    r.hud.root.classList.toggle('underwater', under);
  }

  // What the HUD says to do.
  objective() {
    const a = this.approach, r = this.r, s = this.sites, P = r.player;
    if (!a) {
      if (!this.knowsJob) return null;
      if (!this.scouted && !r.profile.heist.scouted) return { text: 'Glass the Covenant from the lighthouse gallery or the crane', mark: s.lighthouse };
      if (this.scouted) return { text: 'The Covenant is scouted. Get home and plan it.' };
      const need = [];
      if (!this.has('dive_gear') && countOwned(r.profile, 'dive_gear') < 1) need.push('dive gear (dive shop)');
      if (!this.has('boat_keys') && countOwned(r.profile, 'boat_keys') < 1) need.push('boat keys (harbor office)');
      need.push('fuel (depot)');
      return { text: `Covenant prep: ${need.join(' · ')}` };
    }
    if (this.gotCase) {
      const esc = a.escapes.map((k) => ESCAPES[k].label).join(' · ');
      let mark = null;
      if (a.id === 'dive') mark = this.chestOpen ? s.seaChest.top : s.beach;
      else if (a.start === 'boat') mark = this.speedboat?.pos;
      else if (a.id === 'magnolia') mark = s.magnolia?.deck;
      if (this.boat) return { text: 'Run for open water — north, past the breakwater', mark: new THREE.Vector3(this.boat.pos.x, 0, -170) };
      return { text: `Get out: ${esc}`, mark };
    }
    if (this.vaultOpen) return { text: 'Take the prototype case from the cage', mark: s.prototype };
    const onShip = P.pos.y > SHIP.hold - 1 && P.pos.x > SHIP.x0 - 8 && P.pos.x < SHIP.x1 + 2 && P.pos.z > SHIP.z0 - 1 && P.pos.z < SHIP.z1 + 1 && P.mode !== 'swim' && P.mode !== 'dive';
    if (onShip) return { text: 'Get into Hold 3 and open the cage', mark: s.vault.pos };
    if (a.id === 'dive') return { text: P.mode === 'dive' ? 'The sea chest is under the hull, beneath Hold 3' : 'Swim out to the Covenant and dive under her — C to dive, Space to rise', mark: s.seaChest.hull };
    if (a.id === 'speed_quiet') return { text: 'Idle round to the pilot ladder on the Covenant\'s seaward side', mark: s.pilotLadder };
    if (a.id === 'speed_loud') return { text: 'Tie up at the gangway landing and go up', mark: s.boatLanding };
    return { text: 'Up the boarding ladders with Hale and Remy', mark: s.shipCenter };
  }

  status() {
    const P = this.r.player, out = [];
    if (P.mode === 'dive' && P.underwater) out.push(P.diveGear ? `Air ${Math.ceil(P.air * 100)}%` : `Breath ${Math.ceil(P.breath * 100)}%`);
    else if (P.mode === 'swim') out.push('Swimming');
    if (this.boat) out.push(this.boat.loud ? 'Engine flat out' : 'Engine idling');
    if (this.squad) for (const a of this.squad.allies) out.push(`${a.name} ${a.down ? 'down' : Math.max(0, Math.ceil(a.hp / 2.6)) + '%'}`);
    return out;
  }

  dispose() {
    for (const b of this.boats) b.dispose();
    this.squad?.dispose();
    this.r.hud.root.classList.remove('underwater');
    SKY.p.z = 1;
  }
}
