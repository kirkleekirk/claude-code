import * as THREE from 'three';
import { CityGen } from '../world/CityGen.js';
import { Environment } from '../world/Environment.js';
import { Loot } from './Loot.js';
import { Effects } from '../fx/Effects.js';
import { Player } from '../entities/Player.js';
import { Horde } from '../entities/Horde.js';
import { ViewModel } from '../combat/ViewModel.js';
import { Combat, SLOTS } from '../combat/Combat.js';
import { Inventory } from './Inventory.js';
import { HUD } from '../ui/HUD.js';
import { InventoryUI } from '../ui/InventoryUI.js';
import { MapUI } from '../ui/MapUI.js';
import { RNG } from '../core/rng.js';
import { def, makeItem } from '../data/items.js';
import { packCapacity, maxHealthFor } from './Profile.js';
import { clamp } from '../core/math.js';

// One trip into the flooded parish: from the skiff at dusk, until you make it
// back to the water or the dead take you.

const START_HOUR = 17.0;
const TOLL_HOUR = 19.5;
const OVERRUN_HOUR = 20.75;
const EXTRACT_TIME = 4;

const clone = (x) => (x ? JSON.parse(JSON.stringify(x)) : x);

export class Raid {
  constructor(app, { zone, profile, seed }) {
    this.app = app;
    this.zone = zone;
    this.profile = profile;
    this.seed = seed ?? (Math.random() * 1e9) >>> 0;
    this.rng = new RNG(this.seed ^ 0x5bd1e995);
    this.paused = false;
    this.ended = false;
    this.stats = { kills: 0, stabKills: 0, headKills: 0, searched: 0, shots: 0, bites: 0 };
    this.time = 0;
    this.nourishGain = 0;
  }

  start() {
    const { renderer, audio, input, uiRoot } = this.app;
    const zone = this.zone;
    const profile = this.profile;
    const scene = new THREE.Scene();
    this.scene = scene;
    const aspect = window.innerWidth / window.innerHeight;
    const camera = new THREE.PerspectiveCamera(profile.settings.fov, aspect, 0.05, 600);
    this.camera = camera;
    this.baseFov = profile.settings.fov;
    scene.add(camera);

    this.env = new Environment(scene, { fogTint: zone.palette.fog });
    this.loot = new Loot(scene, audio);
    const gen = new CityGen({ zone, seed: this.seed, scene, loot: this.loot });
    this.city = gen.build();
    this.world = this.city.world;
    this.docks = this.city.docks;
    this.fx = new Effects(scene, this.world);

    // raid inventory is a copy; the profile only changes when the raid resolves
    this.inv = new Inventory({ loadout: clone(profile.loadout), backpack: clone(profile.backpack), cap: packCapacity(profile) });
    if (!this.inv.loadout.knife && !this.inv.loadout.melee) {
      this.inv.loadout.knife = makeItem('screwdriver', 1, { dur: 16 });
      this.gaveScrewdriver = true;
    }

    const player = new Player({ camera, world: this.world, audio, input });
    this.player = player;
    player.maxHealth = maxHealthFor(profile.nourishment);
    player.health = Math.min(profile.health, player.maxHealth);
    player.battery = profile.battery ?? 100;
    const ins = this.docks.find((d) => d.insertion) || this.docks[0];
    player.spawn(ins.spawn, ins.yaw);
    player.noise = (p, r) => this.noise(p, r);
    player.onDamage = (amt, kind) => {
      if (kind === 'bite') {
        this.hud.toast('Bitten', true);
        this.stats.bites++;
      }
      if (player.using) this._cancelUse();
    };
    player.onDeath = () => this._onDeath();

    this.horde = new Horde({
      scene, world: this.world, player, audio, fx: this.fx, env: this.env, loot: this.loot, rng: this.rng,
      events: {
        onKill: (w, info) => this._onKill(w, info),
      },
    });

    this.vm = new ViewModel(aspect);
    this.hud = new HUD(uiRoot);
    this.invUI = new InventoryUI(uiRoot, {
      onAction: (act, sel) => this._invAction(act, sel),
      actionsFor: (sel, it) => this._invActions(sel, it),
      onClose: () => this.toggleInventory(false),
      onClick: () => audio.ui(),
    });
    this.mapUI = new MapUI(uiRoot);
    this.mapUI.setData(this.city.map, zone.name, this.env.towerPos);

    this.combat = new Combat({
      player, horde: this.horde, world: this.world, audio, fx: this.fx, vm: this.vm, loot: this.loot,
      inv: this.inv, camera, hud: this.hud, noise: (p, r, o) => this.noise(p, r, o),
      onAggro: () => {
        if (player.disguise > 0) {
          player.disguise = 0;
          this.hud.toast('The stench won\'t cover you now', true);
        }
      },
    });
    this.combat.init();
    player.onHeldDied = (w) => this.combat.onHeldDied(w);

    // flashlight on the camera
    const spot = new THREE.SpotLight(0xfff0d6, 0, 34, 0.42, 0.5, 1.4);
    spot.position.set(0.12, -0.1, 0);
    camera.add(spot);
    spot.target.position.set(0, -0.05, -1);
    camera.add(spot.target);
    this.flashlight = spot;

    // fire barrels and dock lanterns (fixed light count avoids shader recompiles)
    this.fireLights = [];
    const fires = this.city.fires.slice(0, 3);
    for (const f of fires) {
      const l = new THREE.PointLight(0xff8a3a, 12, 16, 1.6);
      l.position.copy(f);
      scene.add(l);
      this.fireLights.push(l);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa050, transparent: true, opacity: 0.8 }));
      glow.position.copy(f).setY(0.95);
      scene.add(glow);
      l.userData.glow = glow;
    }
    this.lanterns = [];
    for (const d of this.docks) {
      const l = new THREE.PointLight(0xffc070, 10, 20, 1.5);
      l.position.copy(d.lantern);
      scene.add(l);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), new THREE.MeshBasicMaterial({ color: 0xffd28a }));
      glow.position.copy(d.lantern);
      scene.add(glow);
      this.lanterns.push(l);
    }

    this._spawnWalkers();

    this.clock = START_HOUR;
    this.rate = (TOLL_HOUR - START_HOUR) / (zone.tollMinutes * 60);
    this.tolled = false;
    this.overrun = false;
    this.spawnT = 0;
    this.extractT = 0;
    this.deathT = 0;
    this.env.setTime(this.clock);
    audio.startAmbience();
    audio.setAmbience({ wind: 0.16, insects: 0, drone: 0 });
    this.hud.big(zone.name, 'Scavenge. Get back to the water before the bell tolls.', '', 5);
    if (this.gaveScrewdriver) setTimeout(() => this.hud.toast('You found a rusty screwdriver in the skiff'), 1500);
    this.hud.toast('Tab: backpack · M: map · F: flashlight');
  }

  _spawnWalkers() {
    const zone = this.zone, rng = this.rng, sp = this.city.spawns, P = this.player.pos;
    const dayMul = Math.min(1.6, 1 + 0.05 * (this.profile.day - 1));
    const n = Math.round(zone.walkers * dayMul);
    const far = (p, d) => Math.hypot(p.x - P.x, p.z - P.z) > d;
    const street = rng.shuffle(sp.street.filter((p) => far(p, 30)));
    const dormant = rng.shuffle(sp.dormant.filter((p) => far(p, 25)));
    const check = rng.shuffle(sp.checkpoint.filter((p) => far(p, 30)));
    let made = 0;
    const kind = (riotBoost = 1) => ({ riot: rng.chance(zone.riot * riotBoost), fresh: rng.chance(zone.fresh) });
    for (const p of check) {
      if (made >= n) break;
      this.horde.spawn(p, { ...kind(3), state: 'wander' });
      made++;
    }
    const nDormant = Math.min(dormant.length, Math.round(n * 0.25));
    for (let i = 0; i < nDormant; i++) {
      this.horde.spawn(dormant[i], { ...kind(), state: 'dormant' });
      made++;
    }
    let i = 0;
    while (made < n && street.length) {
      const p = street[i % street.length];
      const jitter = i >= street.length ? 1.5 : 0;
      this.horde.spawn({ x: p.x + rng.range(-jitter, jitter), z: p.z + rng.range(-jitter, jitter) }, { ...kind(), state: 'wander' });
      made++;
      i++;
    }
    this.initialWalkers = made;
  }

  noise(pos, radius, opts = {}) {
    this.horde.noise(pos, radius, opts);
  }

  _onKill(w, info) {
    this.stats.kills++;
    if (info.part === 'head') this.stats.headKills++;
    if (info.how === 'stab' || (info.kind === 'stab')) this.stats.stabKills++;
  }

  // ---- input / UI -------------------------------------------------------------

  toggleInventory(v) {
    const want = v ?? !this.invUI.open;
    if (want) {
      this.mapUI.toggle(false);
      this.invUI.show(this.inv);
      this.uiOpen = true;
      this.app.input.exitLock();
    } else {
      this.invUI.hide();
      this.uiOpen = false;
      this.app.input.requestLock();
    }
  }

  _invActions(sel, it) {
    const d = def(it.id);
    const acts = [];
    const inLoadout = sel.startsWith('L:');
    if (!inLoadout) {
      if (d.cat === 'food' && !d.raw) acts.push({ id: 'use', label: 'Eat', primary: true });
      if (d.cat === 'med') acts.push({ id: 'use', label: 'Use', primary: true });
      if (it.id === 'battery') acts.push({ id: 'use', label: 'Swap flashlight battery', primary: true });
      if (it.id === 'suppressor') {
        const pistol = this.inv.loadout.sidearm;
        acts.push({ id: 'attach', label: 'Fit to pistol', primary: true, disabled: !(pistol && pistol.id === 'pistol' && !pistol.sup) });
      }
      if (d.cat === 'weapon') acts.push({ id: 'equip', label: `Holster (${{ knife: 'sheath', melee: 'hip', sidearm: 'holster', long: 'shoulder' }[d.slot]})`, primary: true });
    } else {
      acts.push({ id: 'unequip', label: 'Put in pack', disabled: this.inv.full });
      if (d.kind === 'gun' && it.gun && (it.gun.loaded > 0 || it.gun.chamber === 'live')) acts.push({ id: 'unload', label: 'Unload' });
    }
    acts.push({ id: 'drop', label: 'Drop', danger: true });
    return acts;
  }

  _invAction(act, sel) {
    const inv = this.inv, audio = this.app.audio;
    if (!sel) return;
    const inLoadout = sel.startsWith('L:');
    const key = sel.slice(2);
    const it = inLoadout ? inv.loadout[key] : inv.backpack[+key];
    if (!it) return;
    const d = def(it.id);
    if (act === 'use') {
      this._startUse(it);
      this.toggleInventory(false);
    } else if (act === 'drop') {
      if (inLoadout) inv.loadout[key] = null;
      else inv.backpack.splice(+key, 1);
      inv.changed();
      const f = this.player.forward(new THREE.Vector3());
      this.loot.dropItem(it, this.player.pos.clone().addScaledVector(f.setY(0).normalize(), 0.8));
      audio.pickup();
      this.invUI.sel = null;
    } else if (act === 'equip') {
      const slot = d.slot === 'knife' && inv.loadout.knife && !inv.loadout.melee ? 'melee' : d.slot;
      const prev = inv.loadout[slot];
      inv.backpack.splice(+key, 1);
      inv.loadout[slot] = it;
      if (prev) inv.backpack.push(prev);
      inv.changed();
      audio.mech('holster');
      this.invUI.sel = 'L:' + slot;
    } else if (act === 'unequip') {
      if (inv.full) return;
      inv.loadout[key] = null;
      inv.backpack.push(it);
      inv.changed();
      this.invUI.sel = null;
    } else if (act === 'attach') {
      const pistol = inv.loadout.sidearm;
      if (pistol && pistol.id === 'pistol' && !pistol.sup) {
        pistol.sup = it.dur ?? 40;
        inv.backpack.splice(+key, 1);
        inv.changed();
        this.vm.updateSuppressor(pistol);
        audio.mech('magIn');
        this.hud.toast('Suppressor fitted');
        this.invUI.sel = 'L:sidearm';
      }
    } else if (act === 'unload') {
      const g = it.gun;
      const n = g.loaded + (g.chamber === 'live' ? 1 : 0);
      const left = inv.add(makeItem(d.ammo, n));
      const put = n - left;
      let rem = put;
      if (g.chamber === 'live' && rem > 0) { g.chamber = 'empty'; rem--; }
      g.loaded = Math.max(0, g.loaded - rem);
      if (left) this.hud.toast('Not enough room for all the rounds');
      audio.mech('magOut');
    }
  }

  _startUse(it) {
    const d = def(it.id);
    if (this.player.using) return;
    const dur = d.useTime || (d.cat === 'food' ? 1.6 : 0.8);
    this.player.using = { item: it, t: 0, dur };
    if (d.cat === 'food') this.app.audio.eat();
    else if (it.id === 'bandage') this.app.audio.bandage();
    else this.app.audio.mech('holster');
  }

  _cancelUse() {
    this.player.using = null;
  }

  _finishUse() {
    const u = this.player.using;
    this.player.using = null;
    if (u.kind === 'guts') {
      u.corpse.gutted = true;
      this.player.disguise = 60;
      this.app.audio.splat(this.player.pos);
      this.hud.toast('Covered in guts — the dead ignore you until you attack');
      return;
    }
    const it = u.item;
    const d = def(it.id);
    const p = this.player;
    // consume one from wherever it sits
    const idx = this.inv.backpack.indexOf(it);
    if (idx < 0) return;
    it.qty -= 1;
    if (it.qty <= 0) this.inv.backpack.splice(idx, 1);
    this.inv.changed();
    if (d.nourish) {
      this.nourishGain += d.nourish;
      const n = clamp(this.profile.nourishment + this.nourishGain, 0, 100);
      p.maxHealth = maxHealthFor(n);
      this.hud.toast(`${d.name} — nourishment ${Math.round(n)}`);
    }
    if (d.heal) {
      const dur = it.id === 'medkit' ? 4 : it.id === 'bandage' ? 3 : 1.5;
      p.heal.remaining += d.heal;
      p.heal.rate = Math.max(p.heal.rate, d.heal / dur);
    }
    if (d.stamina) p.stamina = Math.min(p.maxStamina, p.stamina + d.stamina);
    if (d.regenBoost) p.regenBoost = d.regenBoost;
    if (d.adrenaline) { p.adrenaline = d.adrenaline; this.hud.toast('Adrenaline — heart pounding'); }
    if (it.id === 'battery') { p.battery = 100; this.hud.toast('Fresh battery'); }
  }

  _quickHeal() {
    const p = this.player;
    const missing = p.maxHealth - p.health - p.heal.remaining;
    const meds = this.inv.backpack.filter((s) => def(s.id).cat === 'med' && def(s.id).heal > 0);
    if (!meds.length) { this.hud.toast('No medicine in your pack'); return; }
    meds.sort((a, b) => Math.abs(def(a.id).heal - missing) - Math.abs(def(b.id).heal - missing));
    this._startUse(meds[0]);
  }

  _interact(target) {
    const hud = this.hud, audio = this.app.audio;
    if (this.combat.held) {
      if (!this.combat.ripHelmet()) hud.toast('Nothing to do with it but kill it');
      return;
    }
    if (!target) return;
    if (target.type === 'item') {
      const r = this.inv.pickup(target.item);
      if (r.ok) {
        this.loot.removeItem(target);
        audio.pickup();
        const d = def(target.item.id);
        hud.toast(r.equipped ? `${d.name} → ${{ knife: 'sheath', melee: 'hip', sidearm: 'holster', long: 'shoulder' }[r.equipped]}` : `+ ${d.name}${target.item.qty > 1 ? ' ×' + target.item.qty : ''}`);
      } else if (r.partial) {
        audio.pickup();
        hud.toast('Took what fits — backpack full');
      } else {
        audio.ui('error');
        hud.toast('Backpack full', true);
      }
    } else if (target.type === 'container') {
      this.loot.open(target);
      this.stats.searched++;
      this.noise(this.player.pos, 3);
    } else if (target.onUse) {
      target.onUse();
    }
  }

  // ---- frame ----------------------------------------------------------------------

  update(dt) {
    const { input, audio } = this.app;
    if (this.ended) return;
    const player = this.player;
    if (this.paused) {
      input.consumeLook();
      return;
    }
    this.time += dt;
    this.clock += this.rate * dt;
    this.env.setTime(this.clock);

    // raid events
    if (!this.tolled && this.clock >= TOLL_HOUR) this._toll();
    if (this.tolled && !this.overrun && this.clock >= OVERRUN_HOUR) {
      this.overrun = true;
      this.hud.big('Overrun', 'They are everywhere. Get to a skiff.', 'toll', 4);
      audio.bell(0.6, 2);
    }
    if (this.tolled) this._hordeSpawns(dt);

    // input
    const look = input.consumeLook();
    const uiBlock = this.uiOpen;
    if (!player.dead) {
      if (!uiBlock) {
        if (input.wasPressed('KeyF')) {
          if (player.battery > 0) { player.flashlightOn = !player.flashlightOn; audio.flashlight(); } else this.hud.toast('Flashlight battery is dead');
        }
        if (input.wasPressed('KeyH')) this._quickHeal();
        if (input.wasPressed('KeyM')) this.mapUI.toggle(!this.mapUI.open);
      }
      if (input.wasPressed('Tab')) this.toggleInventory();
      if (!uiBlock) {
        this.combat.update(dt, input, look);
        player.lookInput(look.x * this.combat.lookMul, look.y * this.combat.lookMul);
      } else {
        this.combat.update(dt, { ...inputShim, isDown: () => false }, { x: 0, y: 0, rawY: 0 });
      }
      const hb = this.combat.holdBreath;
      player.update(dt, {
        moveX: uiBlock ? 0 : input.moveX,
        moveZ: uiBlock ? 0 : input.moveZ,
        sprint: !uiBlock && input.isDown('ShiftLeft') && !hb && this.combat.ads < 0.3,
        crouchToggle: !uiBlock && (input.wasPressed('KeyC') || input.wasPressed('ControlLeft')),
        speedMul: (player.using ? 0.6 : 1) * (this.combat.ads > 0.5 ? 0.6 : 1),
        time: this.time,
      });
      if (!this.combat.held) player.speedMul = 1;
      if (player.using) {
        player.using.t += dt;
        if (player.grabbed) this._cancelUse();
        else if (player.using.t >= player.using.dur) this._finishUse();
      }
    }

    this.horde.update(dt, this.time);
    this.loot.update(dt, this.time, this.player.pos, this.env.drawDistance);
    this.fx.update(dt);

    // camera
    if (player.dead) {
      this.deathT += dt;
      player.pitch = Math.max(-1.2, player.pitch - dt * 0.3);
      player.eyeH = Math.max(0.25, player.eyeH - dt * 1.4);
      if (this.deathT > 3.2) this.finish('died');
    }
    player.applyCamera(this.time);
    const zoom = this.combat.isGun ? (this.combat.d.zoom || (this.combat.d.slot === 'long' ? this.baseFov * 0.78 : this.baseFov * 0.85)) : this.baseFov;
    const targetFov = this.baseFov + (zoom - this.baseFov) * this.combat.ads;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    this.env.update(dt, this.camera.position, this.time);

    // lights
    this.flashlight.intensity = player.flashlightOn ? 55 * (player.battery < 15 ? 0.4 + Math.random() * 0.6 : 1) : 0;
    for (const l of this.fireLights) {
      const f = 0.75 + Math.sin(this.time * 13 + l.position.x) * 0.12 + Math.random() * 0.15;
      l.intensity = 12 * f;
      l.userData.glow.scale.setScalar(0.8 + f * 0.4);
    }

    // interaction
    let prompt = null, promptKey = 'E';
    const fwd = player.forward(new THREE.Vector3());
    const target = !player.dead && !uiBlock ? this.loot.query(player.eye, fwd, 2.3) : null;
    this.loot.highlight(target);
    let corpse = null;
    if (!target && !player.dead && !uiBlock && !this.combat.held) corpse = this._corpseInFront(fwd);
    if (this.combat.held && this.combat.held.helmet) prompt = 'Rip off the riot helmet';
    else if (corpse) prompt = 'Smear its guts on yourself';
    else if (target) {
      if (target.type === 'item') {
        const d = def(target.item.id);
        prompt = `Take ${d.name}${target.item.qty > 1 ? ' ×' + target.item.qty : ''}`;
        if (!this.inv.canFit(target.item) && !(d.cat === 'weapon' && !this.inv.loadout[d.slot])) prompt += ' — pack full';
      } else if (target.type === 'container') prompt = `Search ${target.label}`;
      else prompt = target.label;
    }
    if (!uiBlock && !player.dead && input.wasPressed('KeyE')) {
      if (corpse && !player.using) {
        player.using = { kind: 'guts', corpse, t: 0, dur: 1.6 };
        this.app.audio.splat(corpse.pos);
      } else this._interact(target);
    }

    // extraction
    let extractK = null;
    if (!player.dead) {
      // a skiff only takes you home once you've actually gone ashore
      if (!this.ashore && this.world.isIndoors(player.pos.x, player.pos.z) || Math.hypot(player.pos.x - this.docks[0].center.x, player.pos.z - this.docks[0].center.z) > 14) this.ashore = true;
      const dock = this.ashore ? this.docks.find((d) => Math.hypot(player.pos.x - d.center.x, player.pos.z - d.center.z) < d.radius) : null;
      if (dock && !player.grabbed) {
        this.extractT += dt;
        extractK = this.extractT / EXTRACT_TIME;
        if (!prompt) { prompt = `Casting off from ${dock.name}…`; promptKey = '⚓'; }
        if (this.extractT >= EXTRACT_TIME) this.finish('extracted', dock);
      } else this.extractT = 0;
    }

    // ambience follows the dusk
    const dark = this.env.darkness;
    audio.setAmbience({ wind: 0.12 + dark * 0.08, insects: clamp((dark - 0.3) * 2, 0, 1), drone: this.tolled ? (this.overrun ? 1 : 0.6) : 0 });
    audio.updateListener(this.camera.position, fwd, new THREE.Vector3(0, 1, 0));

    // HUD
    const c = this.combat;
    const it = c.item, d = c.d;
    let weapon;
    if (!it) weapon = { name: 'Bare hands', ammo: '', state: c.hint ? '' : 'V shove · Q grab', durK: -1 };
    else if (d.kind === 'gun') {
      const g = it.gun;
      const chamber = g.chamber === 'live' ? '+1' : '';
      const mag = d.action === 'mag' ? (g.magIn ? `${g.loaded}${chamber}` : '—') : `${g.loaded}${chamber}`;
      const state = g.chamber === 'jam' ? 'Jammed' : d.action === 'mag' && !g.magIn ? 'Mag out' : g.chamber === 'spent' ? (d.action === 'pump' ? 'Pump it' : 'Work the bolt') : d.action === 'cyl' && g.open ? 'Cylinder open' : it.sup ? `Suppressed · ${it.sup}` : '';
      weapon = { name: d.name, ammo: `${mag} <small>/ ${this.inv.count(d.ammo)}</small>`, state, durK: it.dur / d.dur };
    } else weapon = { name: d.name, ammo: '', state: c.melee && c.melee.phase === 'windup' ? (c.melee.charge >= 1 ? 'Full swing' : 'Winding up') : '', durK: it.dur / d.dur };
    const grabbers = player.grabbers;
    let grab = null;
    if (grabbers.length) {
      let bite = 0;
      for (const w of grabbers) bite = Math.max(bite, w.biteProgress || 0);
      grab = { free: player.struggle, bite };
    }
    const markers = this.docks.map((dk) => ({ x: dk.center.x, z: dk.center.z, kind: '' }));
    markers.push({ x: this.env.towerPos.x, z: this.env.towerPos.z, kind: 'bell' });
    this.hud.update(dt, {
      yaw: player.yaw, px: player.pos.x, pz: player.pos.z, markers,
      clock: this.clock, tollIn: (TOLL_HOUR - this.clock) / this.rate, tolled: this.tolled, overrun: this.overrun,
      health: player.health, maxHealth: player.maxHealth, stamina: player.stamina, battery: player.battery, flashlight: player.flashlightOn,
      weapon, slots: SLOTS.map((s) => !!this.inv.loadout[s]), slotIndex: SLOTS.indexOf(c.slot),
      ads: c.ads, hideCross: c.isGun && c.ads > 0.6, charge: c.melee && c.melee.phase === 'windup' ? c.melee.charge : null,
      prompt, promptKey, hint: player.using ? (player.using.kind === 'guts' ? 'Smearing guts…' : `Using ${def(player.using.item.id).name}…`) : c.hint,
      status: this._status(),
      grab, extract: extractK, hurt: player.hurtT, scope: c.item && c.item.id === 'rifle' && c.ads > 0.92,
    });
    if (this.mapUI.open) this.mapUI.draw(player.pos.x, player.pos.z, player.yaw, this.docks);
    this.vm.update(dt, this.combat.vmState(), this.env);
  }

  _status() {
    const p = this.player;
    const out = [];
    if (p.disguise > 0) out.push(`Covered in guts ${Math.ceil(p.disguise)}s`);
    if (p.adrenaline > 0) out.push(`Adrenaline ${Math.ceil(p.adrenaline)}s`);
    if (p.regenBoost > 0) out.push('Painkillers');
    if (p.crouched) out.push('Crouched');
    return out.join(' · ');
  }

  _corpseInFront(fwd) {
    const p = this.player;
    let best = null, bd = 2.1;
    for (const w of this.horde.corpses) {
      if (w.gutted || w.model.fall < 0.9) continue;
      const hp = w.volumes().hips;
      const dx = hp.x - p.pos.x, dz = hp.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > bd) continue;
      const dy = hp.y - p.eye.y;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / Math.hypot(dx, dy, dz);
      if (dot < 0.8) continue;
      bd = d;
      best = w;
    }
    return best;
  }

  _toll() {
    this.tolled = true;
    const audio = this.app.audio;
    audio.bell(0.9, 3);
    this.env.ringBell();
    this.hud.big('The bell tolls', 'Every dead thing in the parish heard it. Get to a skiff.', 'toll', 6);
    this.spawnT = 3;
    // the toll stirs the sleepers
    for (const w of this.horde.walkers) {
      if (w.state === 'dormant' && this.rng.chance(0.6)) w.setState('getup');
      else if (!w.dead && (w.state === 'wander' || w.state === 'investigate') && this.rng.chance(0.35)) {
        w.hunting = true;
        w.setState('chase');
      }
    }
  }

  _hordeSpawns(dt) {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    const late = clamp((this.clock - TOLL_HOUR) / (OVERRUN_HOUR - TOLL_HOUR), 0, 1);
    this.spawnT = 7 - late * 4.5;
    const alive = this.horde.aliveCount;
    const cap = this.zone.maxWalkers + 30 + Math.round(late * 30);
    if (alive >= cap) return;
    const P = this.player.pos;
    const edges = this.city.spawns.edge.concat(this.city.spawns.street).filter((p) => {
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      return d > 32 && d < 75;
    });
    if (!edges.length) return;
    const n = 1 + Math.floor(this.rng.next() * (2 + late * 2));
    for (let i = 0; i < n; i++) {
      const p = this.rng.pick(edges);
      const w = this.horde.spawn({ x: p.x + this.rng.range(-1.5, 1.5), z: p.z + this.rng.range(-1.5, 1.5) }, {
        riot: this.rng.chance(this.zone.riot), fresh: this.rng.chance(this.zone.fresh + late * 0.15), state: 'chase', hunting: true,
      });
      w.lastSeen.copy(P);
    }
  }

  _onDeath() {
    this.hud.big('You died', 'The parish keeps what you carried.', '', 6);
    this.combat.held = null;
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm.setAspect(w / h);
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
    this.vm.render(renderer);
  }

  setPaused(p) {
    this.paused = p;
  }

  finish(result, dock = null) {
    if (this.ended) return;
    this.ended = true;
    const player = this.player;
    const out = {
      result,
      zone: this.zone.id,
      zoneName: this.zone.name,
      dock: dock ? dock.name : null,
      kills: this.stats.kills,
      stabKills: this.stats.stabKills,
      headKills: this.stats.headKills,
      searched: this.stats.searched,
      bites: this.stats.bites,
      time: this.time,
      clock: this.clock,
      health: player.health,
      battery: player.battery,
      nourishGain: this.nourishGain,
      loadout: this.inv.loadout,
      backpack: this.inv.backpack,
      carried: this.inv.all(),
    };
    this.app.onRaidEnd(out);
  }

  dispose() {
    this.app.audio.stopAmbience();
    this.hud.root.remove();
    this.invUI.el.remove();
    this.mapUI.el.remove();
    this.city.mesh.traverse((o) => o.geometry && o.geometry.dispose());
  }
}

// When the backpack is open the combat system still ticks (reloads finish,
// holds slip) but receives no fresh input.
const inputShim = {
  wasPressed: () => false,
  isDown: () => false,
  buttons: [false, false, false],
  btnPressed: [false, false, false],
  wheel: 0,
};
