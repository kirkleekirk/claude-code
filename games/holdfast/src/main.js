// Holdfast — entry point: renderer, quality, world generation, game loop and
// the glue between player, zombies, claims, build mode and UI.
import * as THREE from 'three';
import { Sky } from './world/sky.js';
import { World } from './world/world.js';
import { Water } from './world/water.js';
import { Creek } from './world/creek.js';
import { Physics } from './physics.js';
import { updateWind } from './world/vegetation.js';
import { setTextureQuality } from './textures.js';
import { setAtlasSize } from './atlas.js';
import { Input } from './input.js';
import { ThirdPersonCamera } from './camera.js';
import { Player } from './player.js';
import { loadCharacterModels, Character, PALETTES } from './characters.js';
import { FEATURES } from './world/layout.js';
import { HUD } from './hud.js';
import { Inventory, Interaction, Combat } from './gameplay.js';
import { Zombies } from './zombies.js';
import { Claims } from './claims.js';
import { BuildMode } from './buildmode.js';
import { MapView } from './map.js';
import { Audio } from './audio.js';
import { saveGame, loadGame, clearSave, hasSave } from './save.js';
import { SurvivorSetup, SPAWNS, traitMods, profilePalette, BG_BY_ID, DEAD } from './survivor.js';
import { START_RES } from './gameplay.js';
import { Society } from './npc/society.js';
import { CommandView } from './command.js';
import { GUNS, itemName } from './items.js';
import { treat, maxHealthOf, INJURIES, exhausted } from './condition.js';
import { bodyMods, statsFromTraits, STAT_TRAITS } from './stats.js';
import { setScarcity, START_BY, GUNS as GUN_DEFS } from './items.js';
import { PackScreen } from './packui.js';
import { Vehicles } from './vehicles/vehicles.js';

import { isTouch } from './platform.js';
export { isTouch };

export function detectQuality() {
  let stored = null;
  try { stored = localStorage.getItem('holdfast.quality'); } catch (e) { /* ignore */ }
  const q = new URLSearchParams(location.search).get('q') || stored;
  const mobile = isTouch || /Android|iPhone|iPad/i.test(navigator.userAgent);
  const level = q || (mobile ? 'low' : 'high');
  return {
    level,
    mobile,
    pixelRatio: level === 'low' ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 2),
    shadowSize: level === 'low' ? 1024 : 2048,
    shadowRange: level === 'low' ? 38 : 60,
    viewDistance: level === 'low' ? 380 : 620,
    texSize: level === 'low' ? 256 : 512,
    grass: level === 'low' ? 0.4 : 1,
    antialias: level !== 'low',
  };
}

const WEAPONS = {
  bat: { kind: 'bat', name: 'Baseball bat', damage: 38, reach: 2.0, speed: 0.6 },
  pistol: { kind: 'gun', name: 'Pistol', damage: 45, reach: 0, speed: 0.32 },
};

export class Game {
  constructor(canvasParent, onProgress) {
    this.quality = detectQuality();
    setTextureQuality(this.quality.texSize >= 512 ? 1 : 0.5);
    setAtlasSize(this.quality.texSize);
    this.onProgress = onProgress || (() => {});
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: this.quality.antialias, powerPreference: 'high-performance' });
    r.setPixelRatio(this.quality.pixelRatio);
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    canvasParent.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 5000);
    this.clock = new THREE.Clock();
    this.systems = [];
    this.day = 1;
    this.customShapes = {};
    this.customStyles = {};
    this.dirtyT = -1;
    this.autosaveT = 60;
    this.mods = traitMods([]);
    this.profile = null;
    addEventListener('resize', () => this.resize());
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
  async init() {
    this.sky = new Sky(this.scene, this.renderer, this.quality);
    this.physics = new Physics(null);
    this.world = new World(this.scene, this.physics, this.onProgress);
    await this.world.generate({ texSize: this.quality.texSize, quality: this.quality });
    this.water = new Water(this.scene, this.world.terrain);
    this.creek = new Creek(this.scene, this.world, this.water.uniforms);
    this.onProgress('Waking survivors', 0.94);
    // a host page may point at other copies of the models (e.g. .gltf JSON)
    const urls = window.HOLDFAST_MODELS || {};
    await loadCharacterModels({
      man: { url: urls.man || new URL('../assets/models/man.glb', import.meta.url).href, height: 1.78 },
      woman: { url: urls.woman || new URL('../assets/models/woman.glb', import.meta.url).href, height: 1.68 },
    });
    this.input = new Input(this.renderer.domElement);
    this.input.wantLock = !this.quality.mobile;
    this.tpc = new ThirdPersonCamera(this.camera, this.physics);
    const ch = new Character('man', PALETTES.survivorM);
    this.scene.add(ch.root);
    this.player = new Player(this, ch);
    this.player.spawn(FEATURES.spawn[0], FEATURES.spawn[1]);
    this.tpc.yaw = -Math.PI / 2; // looking east toward town
    this.inventory = new Inventory();
    this.hud = new HUD(this);
    this.interaction = new Interaction(this);
    this.combat = new Combat(this);
    this.zombies = new Zombies(this);
    this.claims = new Claims(this);
    this.buildMode = new BuildMode(this);
    this.map = new MapView(this);
    this.audio = new Audio();
    this.society = new Society(this);
    this.command = new CommandView(this);
    this.storage = this.inventory; // the camp's storage
    this.packScreen = new PackScreen(this);
    this.vehicles = new Vehicles(this);
    this.sky.onThunder = () => setTimeout(() => this.audio.thunder(), 600 + Math.random() * 1500);
    // flashlight
    this.flashlight = new THREE.SpotLight(0xfff4dc, 0, 28, 0.42, 0.45, 1.4);
    this.scene.add(this.flashlight, this.flashlight.target);
    this.player.flashlightOn = false;
    this.setWeapon('bat');
    const qs = new URLSearchParams(location.search);
    this.loading = true;
    const loaded = !qs.get('fresh') && loadGame(this);
    // the cars the map left parked (a save brings back where yours are)
    if (!this.vehicles.restored) this.vehicles.fromWorld(this.world.carSpots || []);
    this.loading = false;
    if (loaded && this.profile) {
      const L = this.society.ensureLeader(this.profile);
      this.society.restoreControl(this.society.savedControl);
      // an older save: its pistol and ammo go to the leader
      if (this.storage.legacyPistol) {
        delete this.storage.legacyPistol;
        if (!L.gear.gun) L.gear.gun = { id: '1911', mag: 8 }; else this.storage.put('gun', '1911', 1, { mag: 8 });
        L.pack.add('ammo', '9mm', this.storage.take('ammo', '9mm', 48));
      }
      if (this.savedWeaponGun && this.player.body && this.player.body.gear.gun) this.setWeapon('gun');
    }
    // a save from before there were other people: two of them find you
    if (loaded && !this.society.loaded && !qs.get('still')) this.society.startingCompanions(this.player.pos);
    this.onProgress('Ready', 1);
    // phones start in the top view (and keep whichever view you used last)
    let pref = null;
    try { pref = localStorage.getItem('holdfast.view'); } catch (e) { /* storage blocked */ }
    const wantCmd = qs.get('view') ? qs.get('view') === 'command' : !qs.get('still') && (pref ? pref === 'command' : isTouch);
    this.startView = () => { if (wantCmd) this.command.toggle(true); };
    if (loaded && !this.profile && !qs.get('still')) {
      // a save from before survivors existed: make one, keep everything else
      this.setupOpen = true;
      this.hud.setVisible(false);
      new SurvivorSetup(this, (p) => {
        this.setupOpen = false;
        this.hud.setVisible(true);
        this.applyProfile(p, false, true);
        this.save();
        this.startView();
        setTimeout(() => this.hud.toast(`Welcome back, ${p.name.split(' ')[0]}. Your claims are where you left them.`, 4), 600);
      }, { keepPlace: true });
    } else if (loaded) {
      this.startView();
      setTimeout(() => this.hud.toast(`Welcome back${this.profile ? ', ' + this.profile.name.split(' ')[0] : ''}. Your claims are where you left them.`, 4), 800);
    } else if (qs.get('still') && !qs.get('setup')) {
      // automated checks skip the creation screens
      this.applyProfile({ name: 'Test Survivor', model: 'man', skin: PALETTES.survivorM[0], shirt: PALETTES.survivorM[1], pants: PALETTES.survivorM[2], hair: PALETTES.survivorM[4], traits: [], spawn: 'highway' }, true);
      if (qs.get('npcs') !== '0') this.society.startingCompanions(this.player.pos);
      this.startView();
    } else {
      // a new game: make a survivor, then pick where to start
      this.setupOpen = true;
      this.hud.setVisible(false);
      new SurvivorSetup(this, (p) => {
        this.setupOpen = false;
        this.hud.setVisible(true);
        this.applyProfile(p, true);
        const nComp = p.companions ?? 2;
        if (nComp) this.society.startingCompanions(this.player.pos, nComp);
        this.save();
        this.startView();
        const cmd = this.command.active;
        const who = nComp === 0 ? 'you\u2019re on your own for now' : nComp === 1 ? 'one survivor is with you' : 'two survivors are with you';
        setTimeout(() => this.hud.toast(`${p.name.split(' ')[0]}, ${who}. Find a place worth holding, then ${isTouch ? 'tap Claim to plant your flag' : 'press G to plant your claim flag'}.`, 7), 600);
        setTimeout(() => this.hud.toast(cmd ? 'Pick someone and tap Take control to play as them, or send them on a job.' : isTouch ? 'Walk up to someone and tap Use to talk. Top view manages your whole group.' : 'Walk up to someone and press E to talk. J shows your camp. V for the top view.', 6), 8000);
        setTimeout(() => this.hud.toast(cmd ? 'Tap people to pick them · tap the ground to send them · drag to look around' : isTouch ? 'Left side: move · Right side: look · Buttons: hit, use, jump' : 'WASD move · Mouse look · Click to swing · E to use · Esc for help', 6), 3800);
      });
    }
  }
  // Put the survivor into the world: body and colours, trait effects, and
  // (for a new game) starting kit and spawn point.
  applyProfile(p, fresh, justMade = fresh) {
    // a survivor from before there were stats: their stat-like traits become stats
    if (!p.stats) { p.stats = statsFromTraits(p.traits || []); p.traits = (p.traits || []).filter((t) => !STAT_TRAITS.includes(t)); }
    this.profile = p;
    // how picked-over and how crowded the county is
    p.world = p.world || { supplies: 'scarce', dead: 'normal' };
    setScarcity(p.world.supplies);
    this.zombies.mult = (DEAD[p.world.dead] || DEAD.normal).mult;
    // the leader is a survivor like everyone else; you start out as them
    const lead = this.society.ensureLeader(p);
    lead.pack.cap = 30 + (p.traits.includes('packrat') ? 6 : 0) + (BG_BY_ID[p.background] && BG_BY_ID[p.background].kit.pack ? BG_BY_ID[p.background].kit.pack : 0);
    if (justMade) lead.stats = { ...p.stats };
    lead.baseHealth = bodyMods(lead, p).maxHealth;
    lead.maxHealth = maxHealthOf(lead);
    if (!this.player.body || this.player.body === lead) this.switchTo(lead, true);
    const pl = this.player;
    if (fresh) {
      Object.assign(this.inventory.res, START_BY[p.world.supplies] || START_BY.scarce);
      if (p.traits.includes('prepper')) this.inventory.add({ food: 4, meds: 2, wood: 15, metal: 6, stone: 6 });
      lead.pack.add('res', 'food', 2); lead.pack.add('res', 'meds', 1);
      if (p.traits.includes('prepper')) { lead.pack.add('res', 'food', 2); lead.pack.add('res', 'meds', 1); }
      // what your old life sent you out with
      const bg = BG_BY_ID[p.background], kit = bg ? bg.kit : {};
      if (kit.gun) {
        const def = GUN_DEFS[kit.gun];
        lead.gear.gun = { id: kit.gun, mag: def.mag };
        lead.pack.add('ammo', def.ammo, (kit.ammo || 0) + (p.traits.includes('gunnut') ? def.mag : 0));
      }
      for (const [k, n] of Object.entries(kit.res || {})) lead.pack.add('res', k, n);
      if (kit.item) this.storage.put('item', kit.item, 1);
      const sp = SPAWNS.find((s) => s.id === p.spawn) || SPAWNS[0];
      pl.spawn(sp.at[0], sp.at[1]);
      lead.health = lead.maxHealth; pl.stamina = pl.maxStamina;
      this.tpc.yaw = -Math.PI / 2;
    }
    if (lead.gear.gun && this.player.body === lead) this.setWeapon('gun');
    pl.syncModel(0.016);
  }
  // take control of a survivor (the one you were drives themselves again)
  switchTo(b, quiet = false) {
    const pl = this.player, old = pl.body;
    if (!b || b.dead || b.downed || old === b) return false;
    if (b.mode === 'away') { this.hud.toast(`${b.first} is out on a run.`, 2); return false; }
    if (exhausted(b) && !quiet) { this.hud.toast(`${b.first} is exhausted and needs rest at camp.`, 2.5); return false; }
    if (this.society.ui.talking) this.society.ui.closeTalk();
    // whatever they'd been told to do, you're doing it now
    if (b.job) this.society.jobs.cancel(b);
    b.orderTarget = null; b.restOrder = false; b.healOrder = false; b.rescue = null; b.healing = null; b.runJob = false;
    pl.attach(b);
    b.mode = 'controlled';
    if (old && !old.dead) {
      // back to their own life: at camp, or tagging along with whoever you are now
      const home = this.claims.list[0];
      old.mode = home && home.x0 <= old.pos.x && old.pos.x <= home.x1 && home.z0 <= old.pos.z && old.pos.z <= home.z1 ? 'camp' : 'follow';
      if (exhausted(old) || old.health < old.maxHealth * 0.35) old.mode = home ? 'travel' : 'follow';
      old.task = null;
    }
    this.mods = b.mods();
    pl.maxStamina = this.mods.maxStamina;
    this.setWeapon(b.gear.gun ? 'gun' : 'bat');
    this.wasInCamp = null;
    if (!quiet) this.hud.toast(`You're ${b.person.name} now.`, 2.5);
    this.hud.bodyChanged && this.hud.bodyChanged();
    return true;
  }
  // the one you're playing got better at something: their numbers follow
  refreshMods() {
    const b = this.player.body;
    if (!b) return;
    this.mods = b.mods();
    this.player.maxStamina = this.mods.maxStamina;
    if (this.player.weapon && this.player.weapon.kind !== 'gun') this.setWeapon('bat');
  }
  // the one you're playing went down: someone close takes over to help.
  // false when there's nobody left to be (then it's like dying)
  onBodyDown(b, src) {
    const alive = this.society.camp.members.filter((m) => m !== b && !m.dead && !m.downed && m.mode !== 'away');
    alive.sort((x, y) => Math.hypot(x.pos.x - b.pos.x, x.pos.z - b.pos.z) - Math.hypot(y.pos.x - b.pos.x, y.pos.z - b.pos.z));
    const near = alive.find((m) => Math.hypot(m.pos.x - b.pos.x, m.pos.z - b.pos.z) < 40);
    const next = near || alive.find((m) => m.leader) || alive[0];
    if (!next) return false;
    this.switchTo(next, true);
    b.health = 1;
    b.goDown(src);
    this.hud.toast(near ? `${b.first} is down! You're ${next.first} now. Get to them (hold ${isTouch ? 'Use' : 'E'}).` : `${b.first} is down, out there alone. Send someone, fast.`, 5);
    return true;
  }
  // the leader, down with nobody coming: they come to at camp, worse for wear
  wakeAtCamp(b) {
    const c = this.claims.list[0];
    const at = c ? [c.flag[0] + 1.5, c.flag[2] + 1.5] : [b.pos.x, b.pos.z];
    b.downed = false; b.setAct(null); b.locked = false;
    b.pos.set(at[0], this.physics.groundAt(at[0], at[1], 999), at[1]); b.visualY = b.pos.y; b.stop();
    if (!b.injuries.some((i) => i.id === 'concussion')) b.injuries.push({ id: 'concussion', t: INJURIES.concussion.heal });
    b.maxHealth = maxHealthOf(b); b.health = b.maxHealth * 0.5; b.fatigue = Math.max(b.fatigue || 0, 80);
    b.mode = c ? 'camp' : 'follow';
    this.society.camp.log(`${b.person.name} came to back at camp, aching and confused.`, 'hurt');
    this.hud.toast(`${b.first} came to back at camp.`, 3);
  }
  onExhausted(b) {
    this.hud.toast(`${b.first} is exhausted. ${b.leader ? 'Get back to camp and rest.' : 'Switch to someone rested (top view) or head home.'}`, 5);
  }
  // put found things in a survivor's pack: { got: [names], left: [entries] }
  giveLoot(b, entries) {
    const got = [], left = [], taken = [];
    for (const e of entries) {
      if (!e || !e.n) continue;
      // claim kits and things for plans go to the group
      if (e.kind === 'item') { this.storage.put('item', e.id, e.n); got.push(itemName(e.kind, e.id, e.n)); taken.push({ kind: e.kind, id: e.id, n: e.n }); continue; }
      if (e.kind === 'gun' && !b.gear.gun) {
        b.gear.gun = { id: e.id, mag: e.mag || 0 };
        got.push(itemName(e.kind, e.id) + ' (in hand)');
        taken.push({ kind: 'gun', id: e.id, n: 1 });
        if (b.controlled) this.setWeapon('gun');
        continue;
      }
      const n = b.pack.add(e.kind, e.id, e.n, { mag: e.mag });
      if (n > 0) { got.push(itemName(e.kind, e.id, n)); taken.push({ kind: e.kind, id: e.id, n }); }
      if (n < e.n) left.push({ ...e, n: e.n - n });
    }
    return { got, left, taken };
  }
  // back at camp: the pack goes into storage, minus what you'd want on you
  unload(b, quiet = false) {
    const st = this.storage, pk = b.pack, moved = [];
    const keep = { food: 2, meds: 2 };
    for (const [k, n] of Object.entries(pk.res)) { const t = Math.max(0, n - (keep[k] || 0)); if (t) { pk.take('res', k, t); st.put('res', k, t); moved.push(itemName('res', k, t)); } }
    const gd = b.gear.gun ? GUNS[b.gear.gun.id] : null;
    for (const [k, n] of Object.entries(pk.ammo)) { const t = Math.max(0, n - (gd && gd.ammo === k ? gd.mag * 3 : 0)); if (t) { pk.take('ammo', k, t); st.put('ammo', k, t); moved.push(itemName('ammo', k, t)); } }
    while (pk.guns.length) { const g = pk.guns.pop(); st.put('gun', g.id, 1, { mag: g.mag }); moved.push(itemName('gun', g.id)); }
    for (const [k, n] of Object.entries(pk.items)) if (n > 0) { pk.take('item', k, n); st.put('item', k, n); moved.push(itemName('item', k, n)); }
    if (moved.length && !quiet) this.hud.loot(`Stored at camp: ${moved.join(', ')}`);
    if (moved.length) this.markDirty();
    return moved;
  }
  // take what's needed from your pack, or camp storage when you're there
  takeSupply(kind, id, n) {
    const b = this.player.body;
    let got = b ? b.pack.take(kind, id, n) : 0;
    if (got < n && this.claims.at(this.player.pos.x, this.player.pos.z)) got += this.storage.take(kind, id, n - got);
    return got;
  }
  haveSupply(kind, id) {
    const b = this.player.body;
    return (b ? b.pack.count(kind, id) : 0) + (this.claims.at(this.player.pos.x, this.player.pos.z) ? this.storage.count(kind, id) : 0);
  }
  // build mode for the claim you're in, or your nearest one
  openBuild() {
    if (this.buildMode.active) return;
    const p = this.player.pos;
    let c = this.claims.at(p.x, p.z);
    if (!c && this.claims.list.length) c = [...this.claims.list].sort((a, b) => Math.hypot(a.flag[0] - p.x, a.flag[2] - p.z) - Math.hypot(b.flag[0] - p.x, b.flag[2] - p.z))[0];
    if (!c) { this.hud.toast(isTouch ? 'Plant a claim flag first (tap Claim).' : 'Plant a claim flag first (G).', 2.5); return; }
    if (this.command.active) this.command.closeMenu();
    this.buildMode.enter(c);
  }
  // 'bat' or 'gun' (whichever gun this survivor has)
  setWeapon(k) {
    const b = this.player.body;
    if (k === 'pistol') k = 'gun';
    if (k === 'gun') {
      const g = b && b.gear.gun;
      if (!g) return;
      const def = GUNS[g.id];
      this.player.weapon = { kind: 'gun', id: g.id, name: def.name, speed: def.rate, damage: def.dmg, reach: 0 };
      this.player.reloadT = 0;
      return;
    }
    const w = { ...WEAPONS.bat };
    w.damage *= this.mods.melee; w.speed *= this.mods.swing;
    this.player.weapon = w;
  }
  markDirty() { this.dirtyT = 4; }
  // meds for wounds (bleeding first), food for a bit of strength
  patchUp() {
    const p = this.player, b = p.body, hud = this.hud;
    if (!b) return;
    const hm = Math.round(45 * this.mods.heal), hf = Math.round(15 * this.mods.heal);
    const wounds = b.injuries.some((i) => !i.treated);
    if ((wounds || p.health < p.maxHealth * 0.6) && this.takeSupply('res', 'meds', 1)) {
      const t = treat(b);
      p.heal(hm);
      hud.toast(`Patched up (+${hm} health)${t ? ' · ' + t.name + ' treated' : ''}`, 2.5);
    } else if (p.health < p.maxHealth && this.takeSupply('res', 'food', 1)) { p.heal(hf); p.stamina = p.maxStamina; hud.toast(`Ate something (+${hf} health)`, 2); }
    else if (p.health >= p.maxHealth && !wounds) hud.toast("You're not hurt.", 1.5);
    else hud.toast('No food or meds on you.', 1.5);
  }
  save() { return saveGame(this); }
  newGame() { clearSave(); location.reload(); }
  respawn() {
    const p = this.player;
    const c = this.claims.list[0];
    const at = c ? [c.flag[0] + 1.5, c.flag[2] + 1.5, c.flag[1]] : FEATURES.spawn;
    p.spawn(at[0], at[1], at[2]);
    p.char.root.rotation.x = 0;
    // half of what you carried is gone, and it left a mark
    const b = p.body;
    if (b) {
      for (const bag of [b.pack.res, b.pack.ammo]) for (const k in bag) bag[k] = Math.floor(bag[k] / 2);
      if (!b.injuries.some((i) => i.id === 'concussion')) b.injuries.push({ id: 'concussion', t: INJURIES.concussion.heal });
      b.maxHealth = maxHealthOf(b);
      b.health = b.maxHealth * 0.6;
      b.fatigue = Math.max(b.fatigue || 0, 70);
    }
    // the ones that got you have wandered off
    this.zombies.list = this.zombies.list.filter((z) => { const near = z.pos.distanceTo(p.pos) < 35; if (near) z.dispose(); return !near; });
    this.hud.hideDeath();
    this.hud.toast('You came to, aching. Some supplies are gone.', 3);
  }
  onPlayerDeath() {
    setTimeout(() => this.hud.showDeath('The dead got you this time. Half of what you carried went with you.'), 1500);
  }
  onKill() { this.zombies.kills++; }

  handleKeys() {
    const inp = this.input, hud = this.hud;
    if (inp.lockLost) { inp.lockLost = false; if (!hud.paused && !this.buildMode.active && !this.modalOpen && !this.player.dead) hud.togglePause(true); }
    if (inp.pressed('Escape')) {
      // one Esc closes one thing
      if (this.buildMode.designer && !this.buildMode.designer.el.hidden) { this.buildMode.designer.close(); inp.pressedSet.delete('Escape'); }
      else if (this.command.active && (!this.command.$('cmd-menu').hidden || this.command.planting)) { this.command.closeMenu(); this.command.setPlantMode(false); inp.pressedSet.delete('Escape'); }
      else if (this.society.ui.talking) { this.society.ui.closeTalk(); inp.pressedSet.delete('Escape'); }
      else if (!this.society.ui.campEl.hidden) { this.society.ui.toggleCamp(false); inp.pressedSet.delete('Escape'); }
      else if (!this.packScreen.el.hidden) { this.packScreen.toggle(false); inp.pressedSet.delete('Escape'); }
      else if (!this.map.el.hidden) { this.map.toggle(false); inp.pressedSet.delete('Escape'); }
      else if (!this.buildMode.active) hud.togglePause();
    }
    if (hud.paused || this.player.dead) return;
    if (inp.pressed('KeyM') && !this.buildMode.active && !this.society.ui.talking && this.society.ui.campEl.hidden) this.map.toggle();
    if (inp.pressed('KeyJ') && !this.buildMode.active && !this.society.ui.talking && this.map.el.hidden && this.packScreen.el.hidden) this.society.ui.toggleCamp();
    if (inp.pressed('KeyK') && !this.buildMode.active && !this.society.ui.talking && this.map.el.hidden && this.packScreen.el.hidden) {
      const ui = this.society.ui;
      if (!ui.campEl.hidden && ui.tab === 'stats') ui.toggleCamp(false); else ui.showStats();
    }
    if ((inp.pressed('KeyI') || inp.pressed('Tab')) && !this.buildMode.active && !this.society.ui.talking && this.map.el.hidden && this.society.ui.campEl.hidden) this.packScreen.toggle();
    if (this.modalOpen) return;
    // behind the wheel the car takes the keys (lights, horn); get out to build or claim
    const driving = this.vehicles && this.vehicles.driving;
    if (driving) {
      if (inp.pressed('KeyE')) { inp.pressedSet.delete('KeyE'); this.vehicles.exit(); }
      if (inp.pressed('KeyV') && this.vehicles.exit()) this.command.toggle();
      if (inp.pressed('KeyB') || inp.pressed('KeyG')) hud.toast('Get out of the car first.', 1.5);
      if (inp.pressed('KeyH')) this.patchUp();
      return;
    }
    if (inp.pressed('KeyB') && !this.buildMode.active) { this.openBuild(); inp.pressedSet.delete('KeyB'); }
    if (this.buildMode.active) return;
    if (inp.pressed('KeyV')) this.command.toggle();
    if (inp.pressed('KeyG') && this.command.active) this.command.setPlantMode(true);
    else if (inp.pressed('KeyG')) {
      const f = this.tpc.forward;
      this.claims.plant(this.player.pos.x + f.x * 2, this.player.pos.z + f.z * 2, false, this.player.pos.y);
    }
    if (inp.pressed('KeyQ')) {
      const b = this.player.body;
      if (this.player.weapon.kind === 'gun') this.setWeapon('bat');
      else if (b && b.gear.gun) this.setWeapon('gun');
      else hud.toast('No gun in hand. Guns turn up in houses, cars and raider camps; equip one from your pack.', 3);
    }
    if (inp.pressed('KeyF')) { this.player.flashlightOn = !this.player.flashlightOn; }
    if (inp.pressed('KeyH')) this.patchUp();
  }

  update(dt) {
    const inp = this.input;
    if (this.setupOpen) {
      // behind the creation screens: a slow look over Harlan's Landing
      this.setupT = (this.setupT || 0) + dt;
      const a = -0.6 + Math.sin(this.setupT * 0.05) * 0.25;
      this.camera.position.set(110 + Math.cos(a) * 95, 42, Math.sin(a) * 95);
      this.camera.lookAt(120, 12, 0);
      this.sky.update(dt * 0.2, this.camera.position);
      this.world.update(dt, this.camera.position);
      return;
    }
    if (inp && this.hud) {
      this.handleKeys();
      if (this.hud.paused) return;
    }
    if (inp && !this.freeCam) {
      if (this.buildMode.active) {
        this.buildMode.update(dt);
        this.player.char.animate(dt, { speed: 0, mode: 'idle', weapon: this.player.weapon.kind === 'gun' ? 'gun' : 'bat' });
        this.player.syncModel(dt);
        this.player.char.mesh.visible = true;
      } else if (this.society.ui.talking) {
        // a two-shot from the side, a little behind your shoulder
        const n = this.society.ui.talking, p = this.player.pos;
        const dx = n.pos.x - p.x, dz = n.pos.z - p.z, L = Math.hypot(dx, dz) || 1;
        const ux = dx / L, uz = dz / L;
        const mx = (p.x + n.pos.x) / 2, mz = (p.z + n.pos.z) / 2, my = Math.max(p.y, n.visualY) + (n.seated ? 1.25 : 1.5);
        const far = 1.9 + L * 0.55;
        const room = (k) => this.physics.raycast(mx, my, mz, -uz * k, 0, ux * k, far + 0.4, { skipGlass: true, filter: (b) => b.kind !== 'tree' }).dist;
        if (!this.talkSide) this.talkSide = room(1) >= room(-1) ? 1 : -1;
        const k = this.talkSide, r = Math.min(far, room(k) - 0.3);
        const cam = new THREE.Vector3(mx - uz * k * r - ux * 0.9, my + 0.3, mz + ux * k * r - uz * 0.9);
        if (!this.talkCamInit) { this.talkCamInit = true; this.camera.position.copy(cam); }
        this.camera.position.lerp(cam, Math.min(1, dt * 4));
        this.camera.lookAt(mx + ux * 0.35, my - 0.12, mz + uz * 0.35);
        // leave room for the talk panel: it sits lower right on wide screens, at the bottom on narrow ones
        if (innerWidth > 720) this.camera.rotateY(isTouch ? -0.34 : -0.2); else this.camera.rotateX(-0.22);
        let f = Math.atan2(dx, dz) - this.player.facing;
        while (f > Math.PI) f -= Math.PI * 2;
        while (f < -Math.PI) f += Math.PI * 2;
        this.player.facing += f * Math.min(1, dt * 5);
        this.player.char.animate(dt, { speed: 0, mode: 'idle', weapon: this.player.weapon.kind === 'gun' ? 'gun' : 'bat' });
        this.player.syncModel(dt);
        this.tpc.yaw = Math.atan2(-ux, -uz);
      } else if (this.command.active && !this.modalOpen) {
        this.talkSide = 0; this.talkCamInit = false;
        this.command.update(dt);
        this.zombies.update(dt);
      } else if (!this.modalOpen && this.vehicles.driving) {
        this.talkSide = 0; this.talkCamInit = false;
        this.vehicles.updateDriving(dt);
        this.hud.setPrompt(null);
        this.zombies.update(dt);
      } else if (!this.modalOpen) {
        this.talkSide = 0; this.talkCamInit = false;
        const ld = inp.lookDelta();
        const dragging = !inp.locked && (inp.mouse.buttons & 1) && inp.dragMoved;
        if (inp.locked || inp.touch.active || (inp.mouse.buttons & 4) || dragging) this.tpc.look(ld.x, ld.y, inp.touch.active);
        this.player.update(dt, inp, this.tpc);
        // guns fire on the attack input
        if (this.player.shotPending) { this.player.shotPending = false; if (this.player.weapon.kind === 'gun') this.combat.shoot(this.player); }
        this.tpc.update(dt, this.player.char.root.position, this.player.aiming, this.player.crouch);
        // in a tight corner the camera ends up inside the player: hide the model
        const close = this.tpc.curDist < 0.6;
        this.player.char.mesh.visible = !close;
        if (close) this.player.weaponMesh.visible = false;
        this.interaction.update(dt);
        this.zombies.update(dt);
      }
      this.focus = this.command.active ? this.command.focusPoint : this.player.pos;
      this.sky.overview = this.command.active ? 1 : 0;
      this.command.sync();
      // walking into camp: the pack goes into storage
      const body = this.player.body;
      if (body && !this.player.dead && !this.player.released && !this.vehicles.driving) {
        const inCamp = !!this.claims.at(this.player.pos.x, this.player.pos.z);
        if (inCamp && this.wasInCamp === false) this.unload(body);
        this.wasInCamp = inCamp;
      }
      // a scope pulls the view in
      const gd = this.player.gunDef;
      this.tpc.zoom = gd ? (gd.scope || (gd.cls === 'long' ? 1.25 : 1)) : 1;
      document.getElementById('ui').classList.toggle('scoped', !!(gd && gd.scope && this.player.aiming && !this.command.active && this.tpc.aim > 0.6));
      this.society.update(dt);
      this.vehicles.update(dt);
      this.combat.update(dt);
      this.claims.update(dt);
      this.hud.update(dt);
      // flashlight follows the view
      const fl = this.flashlight;
      fl.intensity = this.player.flashlightOn && !this.buildMode.active ? 40 : 0;
      if (fl.intensity) {
        const f = new THREE.Vector3();
        // from above, the light goes where you face, not where the camera looks
        if (this.command.active && !this.society.ui.talking) f.set(Math.sin(this.player.facing), -0.18, Math.cos(this.player.facing)).normalize();
        else this.camera.getWorldDirection(f);
        fl.position.copy(this.player.pos).add(new THREE.Vector3(0, 1.45, 0)).addScaledVector(f, 0.3);
        fl.target.position.copy(fl.position).addScaledVector(f, 10);
        fl.target.updateMatrixWorld();
      }
      if (this.sky.darkness > 0.75 && !this.player.flashlightOn && !this._flHint && !this.vehicles.driving) { this._flHint = true; this.hud.toast(isTouch ? 'It is getting dark. Tap Light for your flashlight.' : 'It is getting dark. Press F for your flashlight.', 4); }
      // autosave
      if (this.dirtyT > 0) { this.dirtyT -= dt; if (this.dirtyT <= 0) this.save(); }
      this.autosaveT -= dt;
      if (this.autosaveT <= 0) { this.autosaveT = 60; this.save(); }
      this.audio.setWind(this.sky.w.wind, this.sky.w.rain);
    }
    for (const s of this.systems) s.update && s.update(dt);
    for (const d of this.world.doors) d.update(dt);
    const before = this.sky.time;
    this.sky.update(dt, this.focus || this.camera.position);
    if (this.sky.time < before) this.day++;
    this.water.update(dt, this.sky);
    this.world.update(dt, this.camera.position);
    if (this.vehicles) this.vehicles.cull();
    updateWind(dt, this.sky.w.wind);
  }
  render() { this.renderer.render(this.scene, this.camera); }
  start() {
    const loop = () => {
      const dt = Math.min(0.05, this.clock.getDelta());
      this.update(dt);
      this.render();
      if (this.input) this.input.endFrame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
export { hasSave };
