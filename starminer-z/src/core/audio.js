// The game's sound: CastleMiner Z's own recordings, played by the original's rules.
//
// The cues come from the copy ripped out of the game (tools/cmz/rip_audio.py writes them to
// local-assets/audio, which is never committed). A cue is one or more sounds, one picked at
// random each time (never the same twice running), and a sound is a set of tracks with its
// volume, looping and category. When each cue plays follows the original's code: footsteps
// as you walk, the dig sound when a block comes out, the dead growling the whole time they
// chase you, thunder after the lightning, birds by day and crickets by night (dripping
// underground, the lost souls in Hell), the theme in the menus, and a song the first time you
// get 200, 900, 1600, 2300, 3000 and 3400 m out.
//
// Nothing is synthesized: without the ripped files the game is silent. The context can only
// start once the player has done something (a key, a click, a tap); unlock() starts it, and
// every method is safe to call before then.

import { B } from '../world/blocks.js';
import { fileFetch } from './files.js';

const BASE = 'local-assets/audio/';
const dB = (v) => Math.pow(10, (v || 0) / 20);

// the original's sound categories: effects, music, and the four kinds of ambience
const CAT_MUSIC = 2;
const AMBIENT = { 3: 'day', 4: 'night', 5: 'cave', 6: 'hell' };
const AMBIENCE = ['Birds', 'Crickets', 'Drips', 'lostSouls'];

// the songs, each played once, the first time you get this far out (in 3D, from the start)
const SONGS = [['Song6', 3400], ['Song5', 3000], ['Song4', 2300], ['Song3', 1600], ['Song2', 900], ['Song1', 200]];
// the original's y = 0 is our y = 64
const GROUND = 64;
// Hell's moaning starts 37 blocks under the original's y = 0 and is full 10 below that
const HELL_TOP = GROUND - 37;

// a gun's shot and reload, when the item doesn't name its own
const GUNS = {
  pistol: ['GunShot4', 'Reload'], smg: ['GunShot2', 'Reload'], lmg: ['GunShot2', 'Reload'],
  assault: ['GunShot3', 'AssaultReload'], rifle: ['GunShot1', 'AssaultReload'], shotgun: ['Shotgun', 'ShotGunReload'],
};
const gunCues = (it) => [it?.shot || (GUNS[it?.gun] || GUNS.assault)[0], it?.reloadSound || (GUNS[it?.gun] || GUNS.pistol)[1]];

// the sound a block makes coming out (the original's Player.GetDigSound)
const DIG = { [B.SAND]: 'Sand', [B.SNOW]: 'Sand', [B.SNOW_GRASS]: 'Sand', [B.LEAVES]: 'leaves' };

// what each of the dead growls while it chases you (ZombieChase.Update, by where it's found)
const GROWLS = { zombie: 'ZombieGrowl', skeleton: 'Skeleton', archer: 'Skeleton', felguard: 'Felguard', alien: 'Alien' };

// 3D sounds farther off than this aren't started at all
const HEAR = 64;
// at most this many of one cue at once (the farthest makes way for a nearer one)
const MAX_LIVE = 10;
// the theme fades out over three seconds when a game starts
const FADE = 3;

function decode(ctx, data) {
  return new Promise((resolve) => {
    try {
      const p = ctx.decodeAudioData(data, resolve, () => resolve(null));
      if (p && p.catch) p.catch(() => resolve(null));
    } catch { resolve(null); }
  });
}

function setPos(node, v) {
  if (node.positionX) { node.positionX.value = v.x; node.positionY.value = v.y; node.positionZ.value = v.z; }
  else node.setPosition(v.x, v.y, v.z);
}

export class Audio {
  constructor(app) {
    this.app = app;
    this.vol = { sound: app.settings.sound ?? 0.9, music: app.settings.music ?? 0.6 };
    this.ctx = null;
    this.cues = null;
    this.banks = null;
    this.buffers = new Map();
    this.loads = new Map();
    this.live = new Map();
    this.lastPick = new Map();
    this.ambient = null;
    this.music = null; // the music cue playing
    this.wanted = null; // the song still loading to play
    this.fading = 0; // seconds into the theme's fade-out
    this.musicGain = -1;
    this.menu = true;
    this.songs = SONGS.map(([name, at]) => ({ name, at, done: false }));
    this.lastDist = 0;
    this.L = { x: 0, y: 0, z: 0 };
    const AC = window.AudioContext || window.webkitAudioContext;
    try { if (AC) this.ctx = new AC(); } catch { this.ctx = null; }
    if (!this.ctx) return;
    this.buses();
    this.loaded = this.load();
  }

  buses() {
    const c = this.ctx;
    // the original mixes quietly (most effects at -12 dB): bring it all up, and catch the peaks
    this.master = c.createGain();
    this.master.gain.value = 2;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 4; lim.ratio.value = 12; lim.attack.value = 0.002; lim.release.value = 0.2;
    this.master.connect(lim).connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.mus = c.createGain();
    this.mus.connect(this.master);
    this.amb = {};
    for (const k of Object.values(AMBIENT)) {
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(this.sfx);
      this.amb[k] = g;
    }
    this.setVolumes(this.vol.sound, this.vol.music);
  }

  // The cue list, every effect and the ambience (they're small), and the menu theme first; the
  // songs only when they're wanted.
  async load() {
    let idx = null;
    try { const r = await fileFetch(BASE + 'index.json'); if (r.ok) idx = await r.json(); } catch { idx = null; }
    if (!idx || !idx.cues) return false;
    this.cues = idx.cues;
    this.banks = idx.banks;
    const urls = [...this.urls('Theme')];
    for (const [name, cue] of Object.entries(this.cues)) {
      if (!cue.sounds || cue.sounds.some((s) => s.category === CAT_MUSIC)) continue;
      urls.push(...this.urls(name));
    }
    await Promise.all(urls.map((u) => this.fetch(u)));
    return true;
  }

  // the files a cue's tracks are in
  urls(name) {
    const out = [];
    for (const s of this.cues?.[name]?.sounds || []) for (const e of s.events) for (const w of e.waves) { const u = this.url(w); if (u) out.push(u); }
    return out;
  }

  url(w) {
    const t = this.banks?.[w.bank]?.[w.track];
    return t && t.file && !t.error ? BASE + t.file : null;
  }

  entry(url) {
    for (const L of Object.values(this.banks || {})) for (const t of L) if (t.file && BASE + t.file === url) return t;
    return null;
  }

  fetch(url) {
    if (!url || !this.ctx) return Promise.resolve(null);
    let p = this.loads.get(url);
    if (!p) {
      p = fileFetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((d) => (d ? decode(this.ctx, d) : null)).catch(() => null)
        .then((b) => { if (b) { b = this.trim(b, this.entry(url)); this.buffers.set(url, b); } return b; });
      this.loads.set(url, p);
    }
    return p;
  }

  // An MP3 decodes with the encoder's silence before the sound and padding after it, unless
  // the browser trims it from the file's header. Trim it here if it didn't, so loops are seamless.
  trim(buf, t) {
    const g = t && t.gapless;
    if (!g || !t.samples) return buf;
    const r = buf.sampleRate / t.rate;
    const want = Math.round(t.samples * r), slack = buf.sampleRate * 0.004;
    if (Math.abs(buf.length - want) <= slack) return buf;
    let lead = -1;
    // undecoded header frame or not, the sound starts after the encoder's delay
    for (const [total, skip] of [[g.total, g.lead], [g.total + g.spf, g.lead + g.spf]]) {
      if (total && Math.abs(buf.length - total * r) <= slack) { lead = Math.round(skip * r); break; }
    }
    if (lead < 0 || lead + want > buf.length) return buf;
    const out = this.ctx.createBuffer(buf.numberOfChannels, want, buf.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) out.getChannelData(ch).set(buf.getChannelData(ch).subarray(lead, lead + want));
    return out;
  }

  get running() { return !!this.ctx && this.ctx.state === 'running' && !!this.cues; }

  unlock() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume?.().catch?.(() => {});
  }

  setVolumes(sound, music) {
    this.vol.sound = sound; this.vol.music = music;
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(sound, this.ctx.currentTime, 0.05);
    if (!this.fading) this.setMusicGain(music);
  }

  setMusicGain(v) {
    if (Math.abs(v - this.musicGain) < 1e-4) return;
    this.musicGain = v;
    this.mus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  // ---- playing cues -------------------------------------------------------------------------

  // Plays a cue at a place in the world (pos) or in your head. Returns the instance, which a
  // moving sound follows with move(), or null if it didn't start. far: { hear, ref } for
  // something big and loud (a dragon): heard that far off, and as loud as up close out to ref.
  play(name, pos = null, gain = 1, far = null) {
    if (!this.running) return null;
    const cue = this.cues[name];
    if (!cue || !cue.sounds || !cue.sounds.length) return null;
    const c = this.ctx;
    let dist = 0;
    if (pos) {
      dist = Math.hypot(pos.x - this.L.x, pos.y - this.L.y, pos.z - this.L.z);
      if (dist > (far?.hear ?? HEAR)) return null;
    }
    let live = this.live.get(name);
    if (!live) { live = new Set(); this.live.set(name, live); }
    const limit = cue.limit && cue.limit < 255 ? cue.limit : MAX_LIVE;
    if (live.size >= limit) {
      let far = null;
      for (const i of live) if (!far || i.dist > far.dist) far = i;
      if (!pos || !far || far.dist <= dist) return null;
      this.stop(far);
    }
    const s = cue.sounds[this.pick(name, cue)];
    // an event with several tracks plays one of them
    const parts = [];
    for (const e of s.events) {
      const us = e.waves.map((w) => this.url(w)).filter(Boolean);
      if (!us.length) continue;
      const u = us.length > 1 ? us[Math.floor(Math.random() * us.length)] : us[0];
      const buf = this.buffers.get(u);
      if (buf) parts.push([e, buf]); else this.fetch(u);
    }
    if (!parts.length) return null;
    const out = c.createGain();
    out.gain.value = dB(s.vol) * gain;
    const inst = { name, srcs: [], out, panner: null, dist, playing: true, loop: false };
    let node = out;
    if (pos) {
      const pn = c.createPanner();
      pn.panningModel = 'equalpower';
      pn.distanceModel = 'inverse';
      pn.refDistance = far?.ref ?? 3;
      pn.rolloffFactor = 1.1;
      pn.maxDistance = 10000;
      setPos(pn, pos);
      out.connect(pn);
      node = inst.panner = pn;
    }
    node.connect(s.category === CAT_MUSIC ? this.mus : this.amb[AMBIENT[s.category]] || this.sfx);
    const t0 = c.currentTime + 0.005;
    for (const [e, buf] of parts) {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = !!e.loop;
      let to = out;
      if (e.vol) { to = c.createGain(); to.gain.value = dB(e.vol); to.connect(out); }
      src.connect(to);
      src.onended = () => this.ended(inst, src);
      src.start(t0 + (e.t || 0));
      inst.srcs.push(src);
      if (src.loop) inst.loop = true;
    }
    live.add(inst);
    return inst;
  }

  // one of the cue's sounds by their weights, and not the one it played last
  pick(name, cue) {
    const n = cue.sounds.length;
    if (n === 1) return 0;
    const w = cue.weights && cue.weights.length === n ? cue.weights : null;
    const last = this.lastPick.get(name);
    let total = 0;
    for (let i = 0; i < n; i++) if (i !== last) total += (w && w[i]) || 1;
    let r = Math.random() * total, k = 0;
    for (; k < n; k++) {
      if (k === last) continue;
      r -= (w && w[k]) || 1;
      if (r <= 0) break;
    }
    if (k >= n) k = ((last ?? -1) + 1) % n;
    this.lastPick.set(name, k);
    return k;
  }

  ended(inst, src) {
    const i = inst.srcs.indexOf(src);
    if (i >= 0) inst.srcs.splice(i, 1);
    if (inst.srcs.length) return;
    inst.playing = false;
    this.live.get(inst.name)?.delete(inst);
    try { (inst.panner || inst.out).disconnect(); } catch { /* gone */ }
  }

  stop(inst, fade = 0.04) {
    if (!inst || !inst.playing) return;
    inst.playing = false;
    this.live.get(inst.name)?.delete(inst);
    const t = this.ctx.currentTime;
    try {
      inst.out.gain.cancelScheduledValues(t);
      inst.out.gain.setValueAtTime(inst.out.gain.value, t);
      inst.out.gain.linearRampToValueAtTime(0, t + fade);
      for (const s of inst.srcs) s.stop(t + fade + 0.01);
    } catch { /* already stopped */ }
  }

  // a 3D sound follows whatever's making it
  move(inst, pos) {
    if (!inst || !inst.playing || !inst.panner) return;
    setPos(inst.panner, pos);
    inst.dist = Math.hypot(pos.x - this.L.x, pos.y - this.L.y, pos.z - this.L.z);
  }

  // ---- the player ---------------------------------------------------------------------------

  step() { this.play('FootStep'); }
  land() { this.play('FootStep'); }
  // the original is quiet while you swing at a block; it sounds when the block comes out
  dig() {}
  // (pos: someone else's, online, out in the world; yours play in your head)
  breakBlock(id, pos = null) { this.play(DIG[id] || 'punch', pos); }
  place(_sound, pos = null) { this.play('Place', pos); }
  pickup() { this.play('pickupitem'); }
  drop() { this.play('dropitem'); }
  equip() { this.play('Click'); }
  // what's in hand now: a laser sword hums while it's held (its OnItemEquipped)
  holding(it) {
    if (this.hum && !(it?.laser && it.kind === 'tool')) { this.stop(this.hum); this.hum = null; }
    if (it?.laser && it.kind === 'tool' && !this.hum?.playing) this.hum = this.play('LightSaber');
  }
  saberSwing() { this.play('LightSaberSwing'); }
  melee(hit) { if (hit) this.play('punch'); }
  toolBreak() {}
  // it: the gun's item (pos: someone else's, online)
  gunshot(it, pos = null) { this.play(gunCues(it)[0], pos); }
  reload(it) { this.play(gunCues(it)[1]); }
  reloadDone() {}
  dryFire() {}
  impact(_id, pos) { this.play('BulletHitDirt', pos); }
  bulletHit(pos) { this.play('BulletHitHuman', pos); }
  hurt() { this.play('Hit'); }
  death() { this.play('Fall'); }
  douse() { this.play('Douse'); }

  // ---- the dead -----------------------------------------------------------------------------

  // climbing out of the ground
  emerge(pos) { this.play('CreatureUnearth', pos); this.play('ZombieCry', pos); }
  // the growl (the rattle, for the skeletons; the Felguard's and the aliens' own) that never
  // stops while they chase you
  growl(kind, pos) { return this.play(GROWLS[kind] || 'Skeleton', pos); }
  enemyDig(pos) { this.play('ZombieDig', pos); }

  // ---- the sky, the front end -------------------------------------------------------------

  thunder() { this.play('thunderLow'); }
  storm() { this.play('thunderBig'); }
  // a new day
  dawn() { this.play('HorrorStinger'); }
  ui(kind) { this.play(kind === 'deny' ? 'Error' : kind === 'open' ? 'Popup' : 'Click'); }
  craft() { this.play('craft'); }
  award() { this.play('Award'); }

  // ---- every frame ----------------------------------------------------------------------------

  // info: menu (the front end), time (of day), depth (blocks of ground overhead), y, pos (the
  // player, for the songs)
  update(dt, cam, info = {}) {
    if (!this.ctx || !cam) return;
    const L = this.L, e = cam.matrixWorld.elements;
    L.x = cam.position.x; L.y = cam.position.y; L.z = cam.position.z;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = L.x; l.positionY.value = L.y; l.positionZ.value = L.z;
      l.forwardX.value = -e[8]; l.forwardY.value = -e[9]; l.forwardZ.value = -e[10];
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(L.x, L.y, L.z);
      l.setOrientation(-e[8], -e[9], -e[10], 0, 1, 0);
    }
    if (!this.running) return;
    // the ambience loops all the time; the categories' volumes say which you hear
    this.ambient = this.ambient || [];
    for (let i = 0; i < AMBIENCE.length; i++) if (!this.ambient[i]?.playing) this.ambient[i] = this.play(AMBIENCE[i]);
    this.ambience(info);
    this.score(dt, info);
  }

  // The original's SetAudio: birds by day and crickets by night, crossing at dawn and dusk;
  // dripping water once there's ground overhead (all of it under 15 blocks); the lost souls in
  // Hell. The front end has the birds.
  ambience(info) {
    let day = 1, night = 0, cave = 0, hell = 0;
    if (!info.menu) {
      const h = (info.time ?? 0.5) * 24, hour = Math.floor(h), f = h - hour;
      if (hour <= 5 || hour >= 21) { day = 0; night = 1; }
      else if (hour >= 9 && hour <= 17) { day = 1; night = 0; }
      else if (hour === 6) { day = 0; night = 1 - f; }
      else if (hour === 7 || hour === 19) { day = 0.5; night = 0.5; }
      else if (hour === 8) { day = f; night = 0; }
      else if (hour === 18) { day = 1 - f; night = 0; }
      else { day = 0; night = f; }
      cave = Math.min(1, (info.depth || 0) / 15);
      const y = info.y ?? GROUND;
      if (y <= HELL_TOP) hell = Math.min(1, (HELL_TOP - y) / 10);
    }
    const t = this.ctx.currentTime;
    const set = (k, v) => this.amb[k].gain.setTargetAtTime(v, t, 0.25);
    set('day', day * (1 - cave));
    set('night', night * (1 - cave));
    set('cave', cave * (1 - hell));
    set('hell', hell);
  }

  // The music: the theme in the front end; into a game it fades away, and each song plays once,
  // the first time you walk out past its distance, when nothing else is playing. (A jump of
  // more than 10 m past one, a game loaded far out, skips it, as in the original.)
  score(dt, info) {
    if (info.menu) {
      this.menu = true;
      this.playMusic('Theme');
    } else {
      if (this.menu) {
        this.menu = false;
        this.fadeMusic();
        for (const s of this.songs) s.done = false;
        this.lastDist = 0;
      }
      const p = info.pos;
      if (p) {
        const d = Math.hypot(p.x, p.y - GROUND, p.z), last = this.lastDist;
        this.lastDist = d;
        for (const s of this.songs) {
          if (s.done) continue;
          if (this.music?.playing || this.wanted) break;
          if (d <= s.at) continue;
          s.done = true;
          if (d - last <= 10) this.playMusic(s.name);
        }
      }
    }
    if (this.fading > 0) {
      this.fading += dt;
      this.setMusicGain(Math.max(0, this.vol.music - this.fading / FADE));
      if (this.fading >= FADE) { this.stop(this.music); this.music = null; this.fading = 0; }
    }
  }

  // The original's PlayMusic: another song stops the one playing; the same one carries on.
  playMusic(name) {
    if (this.fading) { this.fading = 0; }
    this.setMusicGain(this.vol.music);
    const m = this.music;
    if (m && m.playing && m.name !== name) { this.stop(m); this.music = null; }
    if ((this.music && this.music.playing) || this.wanted === name) return;
    const urls = this.urls(name);
    if (!urls.length) return;
    if (urls.every((u) => this.buffers.has(u))) { this.music = this.play(name); return; }
    this.wanted = name;
    Promise.all(urls.map((u) => this.fetch(u))).then(() => {
      if (this.wanted !== name) return;
      this.wanted = null;
      if (this.menu === (name === 'Theme')) this.music = this.play(name);
    });
  }

  fadeMusic() {
    if (this.music && this.music.playing) this.fading = 1e-4;
    this.wanted = null;
  }
}
