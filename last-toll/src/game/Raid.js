import * as THREE from 'three';
import { CityGen } from '../world/CityGen.js';
import { StiltGen } from '../world/StiltGen.js';
import { HarborGen, WY as HARBOR_WY } from '../world/HarborGen.js';
import { HarborRaid } from './Harbor.js';
import { Environment } from '../world/Environment.js';
import { Loot } from './Loot.js';
import { Effects } from '../fx/Effects.js';
import { Player } from '../entities/Player.js';
import { Horde } from '../entities/Horde.js';
import { GuardForce } from '../entities/Guard.js';
import { ViewModel } from '../combat/ViewModel.js';
import { Combat, SLOTS } from '../combat/Combat.js';
import { Inventory } from './Inventory.js';
import { HUD, fmtClock } from '../ui/HUD.js';
import { InventoryUI } from '../ui/InventoryUI.js';
import { MapUI } from '../ui/MapUI.js';
import { RNG, noise1 } from '../core/rng.js';
import { def, makeItem } from '../data/items.js';
import { zoneClock } from '../data/zones.js';
import { packCapacity, maxHealthFor, countIn } from './Profile.js';
import { clamp } from '../core/math.js';
import { disposeTree } from '../core/dispose.js';

// One trip into the flooded parish: from the skiff until you make it back to the
// water, or the dead (or the Living Guard) take you. At curfew the Guard runs its
// Sweep: the herder mast's horns drive every dead thing in the sector ahead of
// soldiers and searchlight drones, and anyone still outside the walls is fair game.

const EXTRACT_TIME = 4;

// What the Guard says over the loudspeakers.
const BROADCASTS = {
  early: [
    'This is the Living Guard, Ninth Garrison. Curfew begins at nightfall. Report the infected.',
    'Citizens. The Living Guard is your future. Remain indoors. Do not approach the walls.',
    'Attention. Unregistered persons in this sector will be detained. Or purged.',
  ],
  warn: 'Curfew in one minute. The sector will be swept. Anyone outside the walls will be treated as infected.',
  sweep: 'Curfew is in effect. Sweep teams are in the sector. Lethal force is authorized.',
  overrun: 'Sector lost. Sweep teams, fall back. Seal the gates.',
};

// After the relay at Outpost 9 comes down, the horns are silent and the 9th
// Garrison takes it out on the parish by hand.
const ANGRY = {
  early: [
    'This is the Living Guard, Ninth Garrison. An act of sabotage has been committed against this garrison. Anyone sheltering the saboteur will be treated as infected.',
    'Citizens. Report any stranger to your nearest Guard post. The reward is water.',
    'By order of Colonel Merritt, patrols are doubled. Curfew will be enforced by hand.',
  ],
  sweep: 'Curfew is in effect. Sweep teams are clearing the sector by hand. Shoot anything that moves.',
};

function angryZone(z) {
  const g = z.guards || { posts: 0, patrols: 0 };
  return {
    ...z,
    guards: { posts: g.posts, patrols: g.patrols + (z.threat >= 2 ? 1 : 0) },
    sweepTeam: (z.sweepTeam || 0) + 2,
    drones: (z.drones || 0) + 1,
  };
}

const clone = (x) => (x ? JSON.parse(JSON.stringify(x)) : x);

export class Raid {
  constructor(app, { zone, profile, seed, heist = null }) {
    this.app = app;
    this.heist = heist;
    this.profile = profile;
    this.hornsDead = !!(profile.story && profile.story.mastDown);
    this.zone = this.hornsDead ? angryZone(zone) : zone;
    this.storyEvents = [];
    this.seed = seed ?? (Math.random() * 1e9) >>> 0;
    this.rng = new RNG(this.seed ^ 0x5bd1e995);
    this.paused = false;
    this.ended = false;
    this.stats = { kills: 0, stabKills: 0, headKills: 0, searched: 0, shots: 0, bites: 0, guardKills: 0, drones: 0, drowned: 0 };
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

    const stilts = zone.layout === 'stilts';
    const harbor = zone.layout === 'harbor';
    // the Guard's mast stands inland; at the harbor that's behind the town
    const mastA = harbor ? Math.PI / 2 + this.rng.range(-0.5, 0.5) : this.rng.range(0, Math.PI * 2);
    this.env = new Environment(scene, {
      mastDir: new THREE.Vector3(Math.cos(mastA), 0, Math.sin(mastA)),
      fogTint: zone.palette.fog,
      mood: this.heist?.mood || zone.mood || 'dusk',
      storm: !!zone.storm,
      fireflies: !!zone.fireflies,
      waterY: stilts ? -1.6 : harbor ? HARBOR_WY : undefined,
      sky: zone.sky,
      mist: harbor ? [[0.2, 0.3], [0.7, 0.18]] : null,
    });
    this.env.onThunder = (delay) => audio.thunder(delay);
    this.loot = new Loot(scene, audio);
    const Gen = stilts ? StiltGen : harbor ? HarborGen : CityGen;
    // on the All Hands job the Magnolia herself comes along
    const magnoliaModel = this.heist && this.heist.approach === 'magnolia' ? this.app.hub?.boat?.exterior?.() || null : null;
    const gen = new Gen({ zone, seed: this.seed, scene, loot: this.loot, force: this._storyForce(), heist: this.heist, magnoliaModel });
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
    // the sandbox's rules, if this is a sandbox trip
    this.sandbox = profile.sandbox || null;
    this.sbT = 0;
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
      // a hit spoils what you were doing, unless it's work that keeps going (a torch on a lock)
      if (player.using && player.using.kind !== 'work') this._cancelUse();
    };
    player.onDeath = (kind) => this._onDeath(kind);

    this.horde = new Horde({
      scene, world: this.world, player, audio, fx: this.fx, env: this.env, loot: this.loot, rng: this.rng,
      events: {
        onKill: (w, info) => this._onKill(w, info),
        onDrown: () => { this.stats.drowned++; this.stats.kills++; },
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
    this.mapUI.setData(this.city.map, zone.name, this.env.mastPos);

    // the Living Guard: soldiers on post and patrol, drones overhead
    this.guards = new GuardForce({
      scene, world: this.world, player, audio, fx: this.fx, env: this.env, loot: this.loot, rng: this.rng, hud: this.hud, horde: this.horde,
      noise: (p, r, o) => this.horde.noise(p, r, o),
      onKill: (s, info) => this._onGuardKill(s, info),
    });
    this.horde.guards = this.guards;
    this._spawnGuards();

    this.combat = new Combat({
      player, horde: this.horde, world: this.world, audio, fx: this.fx, vm: this.vm, loot: this.loot,
      guards: this.guards, vmMuzzleWorld: () => this.vm.muzzleWorld(camera),
      explode: (p, r) => this.explode(p, r),
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
    // Guard floodlights: two real lights follow whichever floods are nearest
    this.floodLights = [];
    if (this.city.floods.length) {
      for (let i = 0; i < Math.min(2, this.city.floods.length); i++) {
        const l = new THREE.SpotLight(0xfff0d8, 0, 34, 0.62, 0.45, 1.3);
        scene.add(l);
        scene.add(l.target);
        this.floodLights.push(l);
      }
      this.floodT = 0;
    }

    this._setupStory();
    if (this.city.harbor) {
      this.harbor = new HarborRaid(this);
      this.harbor.start();
    }
    this._spawnWalkers();

    // the night of the job runs on its own clock
    const clk = this.heist ? { start: this.heist.time, sweep: this.heist.time + 2.5, overrun: this.heist.time + 3.75 } : zoneClock(zone);
    this.clk = clk;
    this.clock = clk.start;
    this.rate = (clk.sweep - clk.start) / (zone.sweepMinutes * 60);
    this.clk0 = { ...clk };
    this.rate0 = this.rate;
    this.swept = false;
    if (this.sandbox) {
      if (this.sandbox.hour != null && !this.heist) this.setHour(this.sandbox.hour);
      this.applySandbox();
      const tag = document.createElement('div');
      tag.className = 'sb-tag';
      tag.innerHTML = '<b>Sandbox</b> <span class="key">N</span> walker <span class="key">J</span> Guardsman <span class="key">K</span> clear <span class="key">T</span> +1 hour <span class="key">Esc</span> rules &amp; armory';
      this.hud.root.appendChild(tag);
    }
    this.overrun = false;
    this.warned = false;
    this.spawnT = 0;
    this.extractT = 0;
    this.deathT = 0;
    this.ambT = 20;
    this.broadcastT = 25 + this.rng.range(0, 20);
    this.broadcasts = 0;
    this.pulseT = 0;
    this.env.setTime(this.clock);
    audio.startAmbience();
    audio.setAmbience({ wind: 0.16, insects: 0, drone: 0 });
    const lede = this.heist
      ? this.harbor.approach.entry
      : stilts
        ? 'Scavenge the village. The dead climb out of the water here. Get back to your skiff before the Sweep.'
        : harbor
          ? 'The Covenant rides at anchor off the breakwater. Scavenge the port, and get back to the water before the Sweep.'
          : 'Scavenge. Get back to the water before the Living Guard sweeps the sector.';
    this.hud.big(this.heist ? this.harbor.approach.name : zone.name, lede, '', this.heist ? 9 : 5);
    if (this.gaveScrewdriver) setTimeout(() => this.hud.toast('You found a rusty screwdriver in the skiff'), 1500);
    this.hud.toast('Tab: backpack · M: map · F: flashlight');
    for (const n of this.app.raidNotes || []) setTimeout(() => this.hud.toast(n), 2600);
    this.app.raidNotes = null;
  }

  // ---- the story ashore -------------------------------------------------------------

  // Lots the story needs this trip: the Quarter's checkpoint, Outpost 9's relay compound.
  _storyForce() {
    const s = this.profile.story;
    if (!s) return [];
    if (s.step === 'codebook' && this.zone.id === 'quarter') return ['checkpoint'];
    if (s.step === 'mast' && this.zone.id === 'outpost' && !s.mastDown) return ['compound'];
    return [];
  }

  _owned(id) {
    return countIn([this.profile.stash], id) + this.inv.count(id);
  }

  // Put what the story needs where the story says it is, and mark it.
  _setupStory() {
    const s = this.profile.story, z = this.zone.id, S = this.city.story || {};
    this.storyGoal = null;
    if (this.hornsDead) this.env.mastOff(true);
    if (!s) return;
    const plant = (c, id, text) => {
      if (!c) c = this.rng.pick(this.loot.containers.filter((k) => !k.opened));
      if (!c) return;
      c.items.unshift(makeItem(id));
      this.storyGoal = { kind: 'item', item: id, c, pos: c.center, text };
    };
    if (s.step === 'codebook' && z === 'quarter' && !this._owned('codebook')) plant(S.signals && S.signals[0], 'codebook', 'Find the signals locker in the checkpoint\'s command tent');
    if (s.step === 'ledger' && z === 'marais' && !this._owned('ledger')) plant(S.offering, 'ledger', 'Search the offering chest beside the chapel altar');
    if (s.step === 'mast' && z === 'outpost' && !s.mastDown && S.relays && S.relays.length) {
      // the relay deepest in the base, farthest from where the skiff put you ashore
      const P = this.player.pos;
      const rl = S.relays.slice().sort((a, b) => Math.hypot(b.x - P.x, b.z - P.z) - Math.hypot(a.x - P.x, a.z - P.z))[0];
      this.relay = rl;
      const pos = new THREE.Vector3(rl.x, 1.1, rl.z);
      this.storyGoal = { kind: 'relay', pos };
      const raid = this;
      this.relayUse = this.loot.addExtra({
        pos, radius: 1.1,
        get label() { return raid.inv.count('demo_charge') ? 'Plant the demolition charge' : 'The relay mast — you need a demolition charge'; },
        onUse: () => this._plant(),
      });
    }
  }

  _plant() {
    const audio = this.app.audio, P = this.player.pos, rl = this.relay;
    if (this.charge || this.storyEvents.includes('mastDown')) return;
    if (!this.inv.count('demo_charge')) {
      audio.ui('error');
      this.hud.toast('You need a demolition charge. Hale\'s plans are on the workshop bench.', true);
      return;
    }
    this.inv.take('demo_charge', 1);
    this.loot.removeExtra(this.relayUse);
    // taped to the leg of the tower nearest you
    const a = Math.atan2(P.x - rl.x, P.z - rl.z);
    const pos = new THREE.Vector3(rl.x + Math.sin(a) * 0.62, 0.95, rl.z + Math.cos(a) * 0.62);
    const g = new THREE.Group();
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 10), new THREE.MeshLambertMaterial({ color: 0x6a5a3a }));
    g.add(can);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: 0xff2010 }));
    led.position.set(0, 0.05, 0.08);
    g.add(led);
    g.position.copy(pos);
    g.rotation.y = a;
    this.scene.add(g);
    this.charge = { t: 25, pos, mesh: g, led, beep: 0 };
    audio.mech('bench');
    this.noise(P, 4);
    this.hud.big('Charge set', '25 seconds. Get clear of the mast.', 'sweep', 3);
  }

  _updateCharge(dt) {
    const c = this.charge;
    c.t -= dt;
    c.beep -= dt;
    const every = c.t > 10 ? 1 : c.t > 4 ? 0.5 : 0.2;
    if (c.beep <= 0) {
      c.beep = every;
      this.app.audio.beep(c.pos, c.t < 4);
      c.led.visible = true;
    } else if (c.beep < every - 0.08) c.led.visible = false;
    if (c.t <= 0) this._detonate();
  }

  // The relay goes: the tower falls, every herder mast in the parish goes dark,
  // and the 9th Garrison comes looking for whoever did it.
  _detonate() {
    const c = this.charge, rl = this.relay, audio = this.app.audio, P = this.player.pos;
    this.charge = null;
    this.scene.remove(c.mesh);
    this.explode(c.pos, 5.5);
    this.fx.explosion(new THREE.Vector3(rl.x, 4, rl.z), 1.2);
    this.player.shake = Math.max(this.player.shake, 1.4);
    this.storyEvents.push('mastDown');
    this.hornsDead = true;
    this.env.mastOff();
    rl.lamp.visible = false;
    this.toppling = { t: 0, a: Math.atan2(rl.x - P.x, rl.z - P.z) || 0, landed: false };
    this.storyGoal = { kind: 'escape' };
    this.hud.big('The relay is down', 'Every horn in the parish just went quiet. Now get out.', 'sweep', 5);
    setTimeout(() => { if (!this.ended) audio.broadcast('Relay failure at Outpost Nine. All units, converge on the compound. Find the saboteur.'); }, 2600);
    audio.siren(8);
    // everyone comes running
    for (const s of this.guards.soldiers) {
      if (s.dead) continue;
      s.investigate.set(rl.x + this.rng.range(-8, 8), 0, rl.z + this.rng.range(-8, 8));
      if (!s.inCombat) { s.state = 'alert'; s.t = 0; }
    }
    if (!this.swept) this._sweep();
    else for (let i = 0; i < 2; i++) this._launchDrone(55);
  }

  _updateTopple(dt) {
    const tp = this.toppling, rl = this.relay;
    tp.t += dt;
    const k = Math.max(0, tp.t - 0.6);
    const ang = Math.min(Math.PI / 2 - 0.03, 0.02 * k + 0.55 * k * k);
    rl.group.rotation.set(ang, tp.a, 0, 'YXZ');
    if (!tp.landed && ang >= Math.PI / 2 - 0.03) {
      tp.landed = true;
      const at = new THREE.Vector3(rl.x + Math.sin(tp.a) * 9, 0.4, rl.z + Math.cos(tp.a) * 9);
      this.fx.explosion(at, 0.6);
      this.app.audio.gunshot('explosion', at);
      this.app.audio.impact(at, 'hard');
      this.horde.blast(at, 2.4);
      const d = at.distanceTo(this.player.pos);
      this.player.shake = Math.max(this.player.shake, Math.max(0, 1.1 - d / 30));
      this.noise(at, 60, { alarm: true });
    }
    if (tp.landed && tp.t > 6) this.toppling = null;
  }

  // What the story wants of you here, for the HUD.
  _storyHud() {
    if (this.harbor) {
      const h = this.harbor.objective();
      if (h) return h;
    }
    const g = this.storyGoal, s = this.profile.story;
    if (this.charge) return { text: `Get clear of the mast — ${Math.ceil(this.charge.t)}`, urgent: true };
    if (g && g.kind === 'escape') return { text: 'The relay is down. Get to a skiff.' };
    if (g && g.kind === 'item') return this.inv.count(g.item) ? { text: `${def(g.item).name} is in your pack. Get it home.` } : { text: g.text, mark: g.pos };
    if (g && g.kind === 'relay') return { text: this.inv.count('demo_charge') ? 'Plant the charge on the relay mast' : 'The relay mast. You didn\'t bring a charge.', mark: g.pos };
    if (s && s.step === 'tags') {
      const n = this._owned('dogtags');
      return { text: n >= 3 ? 'Three dog tags. Bring them to Hale.' : `Guard dog tags ${n}/3 — dead Guardsmen carry them` };
    }
    return null;
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
      this.horde.spawn(this._near(p, jitter), { ...kind(), state: 'wander' });
      made++;
      i++;
    }
    this.initialWalkers = made;
  }

  // A walkable spot within `jitter` of p (on the stilts, open water is never walkable).
  _near(p, jitter) {
    for (let k = 0; jitter > 0 && k < 4; k++) {
      const x = p.x + this.rng.range(-jitter, jitter), z = p.z + this.rng.range(-jitter, jitter);
      if (this.world.isWalkable(x, z)) return { x, z };
    }
    return { x: p.x, z: p.z };
  }

  // Soldiers on their posts and walking patrol routes, plus any drones already up.
  _spawnGuards() {
    const zone = this.zone, rng = this.rng, sp = this.city.spawns, P = this.player.pos;
    const g = zone.guards || { posts: 0, patrols: 0 };
    const far = (p, d) => Math.hypot(p.x - P.x, p.z - P.z) > d;
    const posts = rng.shuffle(sp.guardPost.filter((p) => far(p, 35)));
    for (let i = 0; i < Math.min(g.posts, posts.length); i++) {
      const p = posts[i];
      this.guards.spawnSoldier(p, { post: true, facing: p.facing });
    }
    const pts = sp.patrol.filter((p) => far(p, 40));
    for (let i = 0; i < g.patrols && pts.length >= 2; i++) {
      // a loop through a few nearby points
      const a = rng.pick(pts);
      const near = pts.filter((q) => q !== a && Math.hypot(q.x - a.x, q.z - a.z) < 50);
      const route = [a, ...rng.shuffle(near).slice(0, rng.int(1, 3))].map((q) => new THREE.Vector3(q.x, 0, q.z));
      const n = rng.int(2, 3);
      for (let k = 0; k < n; k++) {
        const s = this.guards.spawnSoldier(this._near(a, 1.2), { route });
        s.routeI = 1 % route.length;
      }
    }
    for (let i = 0; i < (zone.dronesBeforeSweep || 0); i++) this._launchDrone(60);
  }

  // A drone comes in from the mast's side of the sky.
  _launchDrone(dist = 55) {
    const P = this.player.pos, m = this.env.mastPos;
    const a = Math.atan2(m.z - P.z, m.x - P.x) + this.rng.range(-0.8, 0.8);
    this.guards.spawnDrone(new THREE.Vector3(P.x + Math.cos(a) * dist, 10.5, P.z + Math.sin(a) * dist));
  }

  // Something goes off: walkers close by die, the rest go down; soldiers, and you, get hurt.
  explode(point, radius = 3.4) {
    const audio = this.app.audio, P = this.player.pos;
    this.fx.explosion(point, 1);
    audio.gunshot('explosion', point);
    audio.impact(point, 'hard');
    const res = this.horde.blast(point, radius);
    for (const s of this.guards.soldiers) {
      if (s.dead) continue;
      const d = Math.hypot(s.pos.x - point.x, s.pos.z - point.z);
      if (d > radius) continue;
      const l = d || 1;
      this.guards.damage(s, { part: 'body', damage: 260 * (1 - d / radius) + 20, kind: 'bullet', power: 1, dirX: (s.pos.x - point.x) / l, dirZ: (s.pos.z - point.z) / l, point: s.pos.clone().setY(1.1) });
    }
    const pd = Math.hypot(P.x - point.x, P.z - point.z);
    if (pd < radius * 1.1) this.player.damage(Math.round(55 * (1 - pd / (radius * 1.1)) + 5), 'blast');
    this.player.shake = Math.max(this.player.shake, Math.max(0, 1.2 - pd / 12));
    this.noise(point, 70, { alarm: true });
    if (res.kills > 1) this.hud.toast(`${res.kills} of them blown apart`);
  }

  noise(pos, radius, opts = {}) {
    this.horde.noise(pos, radius, opts);
    // the Guard only comes running for real noise: shots, alarms, breaking things
    if (radius >= 10) this.guards.onNoise(pos, radius);
  }

  _onKill(w, info) {
    this.stats.kills++;
    if (info.part === 'head') this.stats.headKills++;
    if (info.how === 'stab' || (info.kind === 'stab')) this.stats.stabKills++;
  }

  _onGuardKill(s, info) {
    if (info.drone) {
      this.stats.drones++;
      this.hud.toast('Drone down');
      return;
    }
    // soldiers the dead drag down don't count as yours
    if (info.how === 'eaten') return;
    this.stats.guardKills++;
    if (info.how === 'takedown') this.hud.toast('Silent takedown');
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
    if (u.kind && this.harbor && this.harbor.finishUse(u)) return;
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

  // ---- the sandbox ------------------------------------------------------------------------

  // Put the sandbox's rules into effect now: no damage, and the clock stopped (no Sweep).
  applySandbox() {
    const sb = this.sandbox;
    if (!sb) return;
    this.player.invulnerable = !!sb.god;
    if (!sb.sweep && !this.swept) {
      this.rate = 0;
      this.clk.sweep = Infinity;
      this.clk.overrun = Infinity;
    } else if (sb.sweep && this.rate === 0) {
      this.rate = this.rate0;
      this.clk.sweep = this.clk0.sweep;
      this.clk.overrun = this.clk0.overrun;
    }
  }

  // Move the night to another hour (before the Sweep), keeping how long there is until it.
  setHour(h) {
    if (this.swept) return false;
    const c = this.clk0;
    this.clk0 = { start: h, sweep: h + (c.sweep - c.start), overrun: h + (c.overrun - c.start) };
    this.clk = { ...this.clk0 };
    this.clock = h;
    this.rate = this.rate0;
    this.warned = false;
    this.applySandbox();
    return true;
  }

  _sandboxKeys(dt) {
    const input = this.app.input, P = this.player.pos, sb = this.sandbox;
    // ammo that never runs out: keep a stack in the pack for every gun you carry
    this.sbT -= dt;
    if (sb.ammo && this.sbT <= 0) {
      this.sbT = 0.5;
      for (const it of Object.values(this.inv.loadout)) {
        const d = it && def(it.id);
        if (!d || d.kind !== 'gun' || !d.ammo) continue;
        const stack = def(d.ammo).stack || 1;
        if (this.inv.count(d.ammo) < stack) this.inv.add(makeItem(d.ammo, stack));
      }
    }
    if (this.uiOpen) return;
    const spot = (dist) => {
      const fx = -Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
      for (const k of [dist, dist * 0.7, dist * 1.3, dist * 0.45]) {
        const x = P.x + fx * k, z = P.z + fz * k;
        if (!this.world.isWalkable(x, z)) continue;
        const y = this.world.floorMode ? this.world.heightAt(x, z, P.y + 0.6) : 0;
        if (y === null || Math.abs(y - P.y) > 2.5) continue;
        return new THREE.Vector3(x, y, z);
      }
      return null;
    };
    if (input.wasPressed('KeyN')) {
      const v = spot(8);
      if (v) { this.horde.spawn(v, { state: 'wander' }); this.noise(P, 12); } else this.hud.toast('No room for one there');
    }
    if (input.wasPressed('KeyJ')) {
      const v = spot(16);
      if (v) this.guards.spawnSoldier(v, { post: true, facing: Math.atan2(P.x - v.x, P.z - v.z) });
      else this.hud.toast('No room for one there');
    }
    if (input.wasPressed('KeyK')) {
      let n = 0;
      for (const w of this.horde.walkers) {
        if (w.dead || Math.hypot(w.pos.x - P.x, w.pos.z - P.z) > 40) continue;
        this.horde.kill(w);
        n++;
      }
      this.hud.toast(n ? `${n} put down` : 'Nothing dead near you');
    }
    if (input.wasPressed('KeyT')) {
      if (this.setHour(this.clock + 1 > 28 ? 16.5 : this.clock + 1)) this.hud.toast(`It's ${fmtClock(this.clock)}`);
      else this.hud.toast('The Sweep is on: the night runs on its own now');
    }
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
      if (target.locked === 'keycard' && !target.opened) {
        if (!this.inv.count('keycard')) {
          audio.ui('error');
          hud.toast('Locked — it takes a Guard keycard', true);
          return;
        }
        this.inv.take('keycard', 1);
        target.locked = null;
        audio.ui('craft');
        hud.toast('Keycard accepted');
      }
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
    this._events(dt);
    if (this.charge) this._updateCharge(dt);
    if (this.toppling) this._updateTopple(dt);
    if (this.city.story && this.city.story.relays.length) {
      const on = !this.hornsDead && Math.sin(this.time * 2.2) > 0.6;
      for (const rl of this.city.story.relays) rl.lamp.visible = on;
    }

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
      if (this.sandbox) this._sandboxKeys(dt);
      if (input.wasPressed('Tab')) this.toggleInventory();
      // in the water, on a ladder or at a wheel your hands are full
      this.handsBusy = player.mode !== 'walk' && player.mode !== 'fall';
      if (!uiBlock && this.handsBusy) {
        this.combat.update(dt, { ...inputShim, isDown: () => false }, { x: 0, y: 0, rawY: 0 });
        player.lookInput(look.x, look.y);
      } else if (!uiBlock) {
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
        rise: !uiBlock && input.isDown('Space'),
        speedMul: (player.using ? 0.6 : 1) * (this.combat.ads > 0.5 ? 0.6 : 1),
        time: this.time,
      });
      if (this.harbor) this.harbor.update(dt);
      if (this.ended) return;
      if (!this.combat.held) player.speedMul = 1;
      if (player.using) {
        player.using.t += dt;
        if (player.grabbed) this._cancelUse();
        else if (player.using.t >= player.using.dur) this._finishUse();
      }
    }

    this.horde.update(dt, this.time);
    this.guards.update(dt, this.time);
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
    let targetFov = this.baseFov + (zoom - this.baseFov) * this.combat.ads;
    if (player.using && player.using.kind === 'scope') targetFov = 14;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    this.env.update(dt, this.camera.position, this.time);
    if (this.harbor) this.harbor.afterCamera(this.camera);

    // lights
    this.flashlight.intensity = player.flashlightOn ? 55 * (player.battery < 15 ? 0.4 + Math.random() * 0.6 : 1) : 0;
    for (const l of this.fireLights) {
      const f = 0.75 + Math.sin(this.time * 13 + l.position.x) * 0.12 + Math.random() * 0.15;
      l.intensity = 12 * f;
      l.userData.glow.scale.setScalar(0.8 + f * 0.4);
    }
    // candles and lanterns gutter together
    if (this.city.glowMat) this.city.glowMat.color.setScalar(0.82 + noise1(this.time * 3.1) * 0.12 + noise1(this.time * 11.7) * 0.06);
    if (this.floodLights.length) this._updateFloods(dt);

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
    if (!uiBlock && !player.dead && player.mode !== 'seat' && player.mode !== 'climb' && input.wasPressed('KeyE')) {
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

    // ambience follows the dark
    const dark = this.env.darkness;
    const swamp = this.zone.mood === 'swamp';
    audio.setAmbience({ wind: (swamp ? 0.07 : 0.12) + dark * 0.08, insects: clamp((dark - 0.3) * 2, 0, 1) * (swamp ? 1.3 : 1), drone: this.swept ? (this.overrun ? 1 : 0.6) : 0 });
    this._ambientScares(dt);
    audio.updateListener(this.camera.position, fwd, new THREE.Vector3(0, 1, 0));

    // HUD
    const c = this.combat;
    const it = c.item, d = c.d;
    let weapon;
    if (!it) weapon = { name: 'Bare hands', ammo: '', state: c.hint ? '' : 'V shove · Q grab', durK: -1 };
    else if (d.kind === 'gun' && d.action === 'bow') {
      const b = c.bow;
      weapon = { name: d.name, ammo: `${b && b.nocked ? 1 : 0} <small>/ ${this.inv.count(d.ammo)}</small>`, state: b && b.nocked ? (b.draw >= 1 ? 'Full draw' : b.draw > 0 ? 'Drawing' : 'Nocked') : '', durK: it.dur / d.dur };
    } else if (d.kind === 'gun') {
      const g = it.gun;
      const chamber = g.chamber === 'live' ? '+1' : '';
      const mag = d.action === 'mag' ? (g.magIn ? `${g.loaded}${chamber}` : '—') : `${g.loaded}${chamber}`;
      const state = g.chamber === 'jam' ? 'Jammed' : d.energy && !g.magIn ? 'No cell' : d.energy && g.chamber !== 'live' ? 'Coil cold' : d.action === 'mag' && !g.magIn ? 'Mag out' : g.chamber === 'spent' ? (d.action === 'pump' ? (d.lever ? 'Work the lever' : 'Pump it') : 'Work the bolt') : d.action === 'cyl' && g.open ? 'Cylinder open' : d.action === 'break' && g.open ? 'Broken open' : c.charging ? 'Charging' : d.auto ? 'Full auto' : '';
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
    if (!this.hornsDead) markers.push({ x: this.env.mastPos.x, z: this.env.mastPos.z, kind: 'mast' });
    const story = this._storyHud();
    if (story && story.mark) markers.push({ x: story.mark.x, z: story.mark.z, kind: 'story' });
    this.hud.update(dt, {
      yaw: player.yaw, px: player.pos.x, pz: player.pos.z, markers,
      clock: this.clock, sweepIn: (this.clk.sweep - this.clock) / this.rate, sweepOff: this.rate === 0 && !this.swept, swept: this.swept, overrun: this.overrun, spotted: this.guards.spotted,
      health: player.health, maxHealth: player.maxHealth, stamina: player.stamina, battery: player.battery, flashlight: player.flashlightOn,
      weapon, slots: SLOTS.map((s) => !!this.inv.loadout[s]), slotIndex: SLOTS.indexOf(c.slot),
      ads: c.ads, hideCross: c.isGun && c.ads > 0.6, charge: c.melee && c.melee.phase === 'windup' ? c.melee.charge : null,
      prompt, promptKey, hint: player.using ? (player.using.hint || (player.using.kind === 'guts' ? 'Smearing guts…' : `Using ${def(player.using.item.id).name}…`)) : c.hint,
      status: this._status(),
      grab, extract: extractK, hurt: player.hurtT, scope: c.isGun && c.d.scope && c.ads > 0.92,
      objective: story,
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
    if (this.guards.spotted) out.push('Spotted by the Guard');
    if (this.harbor) out.push(...this.harbor.status());
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

  // Curfew warning, the Sweep, and the overrun after it.
  _events(dt) {
    const audio = this.app.audio, clk = this.clk;
    const toSweep = (clk.sweep - this.clock) / this.rate;
    // the Guard talks to the parish before curfew
    if (!this.swept) {
      this.broadcastT -= dt;
      if (this.broadcastT <= 0 && this.broadcasts < 2 && toSweep > 90) {
        this.broadcastT = 150 + this.rng.range(0, 90);
        const early = this.hornsDead ? ANGRY.early : BROADCASTS.early;
        audio.broadcast(early[this.broadcasts % early.length]);
        this.hud.toast('A Guard loudspeaker crackles somewhere out in the dark');
        this.broadcasts++;
      }
    }
    if (!this.warned && toSweep <= 60) {
      this.warned = true;
      audio.broadcast(BROADCASTS.warn);
      if (!this.hornsDead) audio.herderPulse(4, 0.4);
      this.hud.toast('Curfew in one minute — the Sweep is coming', true);
    }
    if (!this.swept && this.clock >= clk.sweep) this._sweep();
    if (this.swept && !this.overrun && this.clock >= clk.overrun) {
      this.overrun = true;
      this.hud.big('Overrun', 'The Guard has lost the sector. Everything dead is out here with you. Get to a skiff.', 'sweep', 4);
      audio.siren(7);
      if (!this.hornsDead) audio.herderPulse(8, 1);
      setTimeout(() => audio.broadcast(BROADCASTS.overrun), 2500);
      // the sweep team pulls back toward the mast; the dead follow them
      for (const s of this.guards.soldiers) {
        if (s.dead || s.inCombat) continue;
        s.investigate.set(this.env.mastPos.x * 0.35, 0, this.env.mastPos.z * 0.35);
        s.state = 'alert';
        s.t = 0;
      }
    }
    if (this.swept) {
      this._hordeSpawns(dt);
      // the horns keep pushing the dead through the sector
      this.pulseT -= dt;
      if (this.pulseT <= 0 && !this.hornsDead) {
        this.pulseT = this.overrun ? 26 : 38;
        audio.herderPulse(6, this.overrun ? 1 : 0.7);
      }
    }
  }

  _sweep() {
    this.swept = true;
    const audio = this.app.audio, zone = this.zone, rng = this.rng, P = this.player.pos;
    const horns = !this.hornsDead;
    audio.siren(10);
    if (horns) audio.herderPulse(8, 1);
    this.env.startSweep();
    if (!this.storyEvents.includes('mastDown')) setTimeout(() => audio.broadcast(horns ? BROADCASTS.sweep : ANGRY.sweep), 3500);
    if (horns) this.hud.big('The Sweep', 'The Guard\'s horns are driving every dead thing in the sector toward the water. Get to a skiff.', 'sweep', 6);
    else if (!this.storyEvents.includes('mastDown')) this.hud.big('The Sweep', 'No horns tonight. Just soldiers, and more of them. Get to a skiff.', 'sweep', 6);
    this.spawnT = 3;
    this.pulseT = 30;
    // the horns stir the sleepers and set the wanderers moving; without them, only the noise does
    for (const w of this.horde.walkers) {
      if (w.dead) continue;
      if (w.state === 'dormant' && rng.chance(horns ? 0.6 : 0.15)) w.setState('getup');
      else if ((w.state === 'wander' || w.state === 'investigate') && rng.chance(horns ? 0.35 : 0.08)) {
        w.hunting = true;
        w.setState('chase');
      }
    }
    // drones up, and a sweep team comes in from the far side of the sector
    const up = this.guards.drones.filter((d) => !d.dead).length;
    for (let i = up; i < (zone.drones || 0); i++) this._launchDrone(50 + i * 12);
    const cands = this.city.spawns.patrol.concat(this.city.spawns.street).filter((p) => {
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      return d > 45 && d < 95;
    });
    if (cands.length && zone.sweepTeam) {
      const a = rng.pick(cands);
      for (let i = 0; i < zone.sweepTeam; i++) {
        const s = this.guards.spawnSoldier(this._near(a, 1.5));
        s.state = 'alert';
        s.investigate.set(P.x + rng.range(-14, 14), 0, P.z + rng.range(-14, 14));
      }
    }
  }

  _hordeSpawns(dt) {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    const clk = this.clk;
    const late = clamp((this.clock - clk.sweep) / (clk.overrun - clk.sweep), 0, 1);
    // with the horns dead nothing drives the dead in from the edges; they only drift
    this.spawnT = (7 - late * 4.5) * (this.hornsDead ? 2 : 1);
    const alive = this.horde.aliveCount;
    const cap = this.zone.maxWalkers + (this.hornsDead ? 8 : 30) + Math.round(late * (this.hornsDead ? 10 : 30));
    if (alive >= cap) return;
    const P = this.player.pos, rng = this.rng;
    const n = 1 + Math.floor(rng.next() * (2 + late * 2));
    const opts = () => ({ riot: rng.chance(this.zone.riot), fresh: rng.chance(this.zone.fresh + late * 0.15), hunting: true });
    // out on the stilts, most of them come up out of the water
    const emerge = this.city.spawns.emerge.filter((e) => {
      const d = Math.hypot(e.to.x - P.x, e.to.z - P.z);
      return d > 14 && d < 55;
    });
    const edges = this.city.spawns.edge.concat(this.city.spawns.street).filter((p) => {
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      return d > 32 && d < 75;
    });
    for (let i = 0; i < n; i++) {
      let w;
      if (emerge.length && (rng.chance(0.75) || !edges.length)) {
        const e = rng.pick(emerge);
        w = this.horde.emerge(e.from, e.to, opts());
      } else if (edges.length) {
        w = this.horde.spawn(this._near(rng.pick(edges), 1.5), { ...opts(), state: 'chase' });
      }
      if (w) w.lastSeen.copy(P);
    }
  }

  // Sounds out in the dark that have nothing to do with you. Mostly.
  _ambientScares(dt) {
    this.ambT -= dt;
    if (this.ambT > 0) return;
    const audio = this.app.audio, rng = this.rng;
    this.ambT = rng.range(30, 65);
    const swamp = this.zone.mood === 'swamp';
    const P = this.player.pos;
    const far = (d) => {
      const a = rng.range(0, Math.PI * 2);
      return new THREE.Vector3(P.x + Math.cos(a) * d, 1.2, P.z + Math.sin(a) * d);
    };
    const pick = rng.weighted(swamp
      ? [['frogs', 4], ['gator', 1.2], ['creak', 2], ['chime', 1.2], ['splash', 2], ['groan', 1.5], ['scream', 0.5], ['shots', 0.5]]
      : [['creak', 2], ['chime', 1], ['groan', 2.5], ['scream', 0.8], ['shots', 1.2], ['dog', 0.8]]);
    if (pick === 'frogs') audio.frogs();
    else if (pick === 'gator') audio.gatorBellow();
    else if (pick === 'creak') audio.creak();
    else if (pick === 'chime') audio.chime();
    else if (pick === 'splash') audio.splash(far(rng.range(12, 30)).setY(this.env.waterY), rng.range(0.5, 1.2));
    else if (pick === 'groan') audio.groan(far(rng.range(18, 34)), rng.range(0.7, 1.1), 0.7, 1.8);
    else if (pick === 'scream') audio.scream();
    else if (pick === 'shots') audio.distantShots();
    else if (pick === 'dog') audio.groan(far(rng.range(40, 60)), 1.8, 0.4, 1.2);
  }

  // Point the two real floodlights at the Guard floods nearest the player.
  _updateFloods(dt) {
    this.floodT -= dt;
    if (this.floodT > 0) return;
    this.floodT = 1;
    const P = this.player.pos;
    const near = this.city.floods.slice().sort((a, b) => a.pos.distanceToSquared(P) - b.pos.distanceToSquared(P));
    this.floodLights.forEach((l, i) => {
      const f = near[i];
      if (!f) { l.intensity = 0; return; }
      l.position.copy(f.pos);
      l.target.position.copy(f.target);
      l.target.updateMatrixWorld();
      l.intensity = f.pos.distanceTo(P) < 70 ? 70 : 0;
    });
  }

  _onDeath(kind) {
    const byGuard = kind === 'laser';
    this.hud.big('You died', byGuard ? 'The Living Guard doesn\'t take prisoners after curfew.' : 'The parish keeps what you carried.', '', 6);
    this.combat.held = null;
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm.setAspect(w / h);
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
    if (!this.handsBusy) this.vm.render(renderer);
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
      guardKills: this.stats.guardKills,
      drones: this.stats.drones,
      drowned: this.stats.drowned,
      time: this.time,
      clock: this.clock,
      health: player.health,
      battery: player.battery,
      nourishGain: this.nourishGain,
      loadout: this.inv.loadout,
      backpack: this.inv.backpack,
      carried: this.inv.all(),
      storyEvents: this.storyEvents.slice(),
      heist: this.heist ? { approach: this.heist.approach, gotCase: this.inv.count('prototype_case') > 0 } : null,
    };
    this.app.onRaidEnd(out);
  }

  dispose() {
    // free everything this trip put on the GPU (the scene first: the parts below only unhook)
    disposeTree(this.scene);
    disposeTree(this.vm.scene);
    // and the characters themselves, wherever they are (level of detail takes far ones out of the scene)
    for (const w of this.horde.walkers) { w.model.av?.dispose?.(); disposeTree(w.model.root); }
    for (const s of this.guards.soldiers) { s.model?.av?.dispose?.(); disposeTree(s.model?.root); }
    this.app.audio.stopAmbience();
    this.hud.root.remove();
    this.invUI.el.remove();
    this.mapUI.el.remove();
    this.guards.dispose();
    this.harbor?.dispose();
    try { window.speechSynthesis?.cancel(); } catch (_) { /* optional */ }
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
