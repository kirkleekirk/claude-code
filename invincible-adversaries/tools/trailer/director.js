// Trailer director: stages each shot in-engine, drives the camera and title overlays,
// and records the game's own audio into an OfflineAudioContext on the trailer clock.
(() => {
const g = window.__game, THREE = window.THREE, w = g.world, fx = g.fx;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FPS = 30, FDT = 1 / FPS, SUB = 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const out3 = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const inout = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const backOut = (t) => { t = clamp01(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const win = (t, a, b, fi = 0.2, fo = 0.2) => ss(a, a + fi, t) * (1 - ss(b - fo, b, t));
const noise = (t, s) => Math.sin(t * 1.7 + s) * 0.5 + Math.sin(t * 3.1 + s * 2.3) * 0.3 + Math.sin(t * 5.3 + s * 4.1) * 0.2;

// Local frame: +z points toward the sun's azimuth, so a camera at +z sees the lit side.
const F = V(0.806, 0, 0.592).normalize(), UP = V(0, 1, 0), R = new THREE.Vector3().crossVectors(UP, F);
const L = (x, y, z, o) => (o ? o.clone() : V(0, 0, 0)).addScaledVector(R, x).addScaledVector(UP, y).addScaledVector(F, z);
const dirL = (x, y, z) => L(x, y, z).normalize();
const vlerp = (a, b, t) => a.clone().lerp(b, t);

// ------------------------------------------------------------------ overlay
const css = `
#keyhint, #toasts { display: none !important; }
#tr { position: fixed; inset: 0; z-index: 9999; pointer-events: none; font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif; color: #fff; overflow: hidden; }
#tr > div { position: absolute; }
#tr-vig { inset: 0; background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,.55) 100%); }
#tr-black, #tr-flash { inset: 0; }
#tr-black { background: #000; } #tr-flash { background: #fff; }
#tr-bars { inset: 0; }
#tr-bars i { position: absolute; left: 0; right: 0; height: 0; background: #000; }
#tr-bars i:first-child { top: 0; } #tr-bars i:last-child { bottom: 0; }
#tr-card { left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; font-weight: 800; font-size: 54px; letter-spacing: .42em; text-indent: .42em; text-transform: uppercase; white-space: nowrap; }
#tr-card b { color: #ffd400; font-weight: 800; }
#tr-name { left: 7%; bottom: 13%; }
#tr-name .nm { font: 400 132px/0.92 Anton, Impact, sans-serif; letter-spacing: .01em; -webkit-text-stroke: 3px #07090e; paint-order: stroke fill; text-shadow: 7px 7px 0 #07090e; transform: skewX(-8deg); transform-origin: left bottom; }
#tr-name .rl { margin-top: 10px; display: flex; align-items: center; gap: 16px; font-weight: 800; font-size: 25px; letter-spacing: .32em; }
#tr-name .rl i { display: block; height: 5px; width: 90px; transform: skewX(-20deg); }
#tr-name .real { margin-top: 4px; font-weight: 600; font-size: 19px; letter-spacing: .22em; color: rgba(255,255,255,.7); }
#tr-ult { left: 0; right: 0; top: 16%; text-align: center; }
#tr-ult .u { display: inline-block; font: 400 96px/1 Anton, Impact, sans-serif; letter-spacing: .02em; -webkit-text-stroke: 3px #07090e; paint-order: stroke fill; text-shadow: 6px 6px 0 #07090e; }
#tr-ult .sub { margin-top: 8px; font-weight: 800; font-size: 22px; letter-spacing: .4em; text-indent: .4em; }
#tr-logo { left: 0; right: 0; top: 50%; text-align: center; transform-origin: 50% 50%; }
#tr-logo .l1 { position: relative; display: inline-block; font: 400 150px/0.9 Anton, Impact, sans-serif; color: #ffd400; -webkit-text-stroke: 4px #07090e; paint-order: stroke fill; text-shadow: 8px 8px 0 #07090e; letter-spacing: .01em; }
#tr-logo .l1 svg { position: absolute; right: -36px; top: -38px; width: 150px; height: 90px; }
#tr-logo .l2wrap { margin-top: -6px; }
#tr-logo .l2 { display: inline-block; background: #00aeef; padding: 4px 34px 6px; transform: skewX(-12deg); box-shadow: 7px 7px 0 #07090e; font: 400 64px/1 Anton, Impact, sans-serif; letter-spacing: .34em; text-indent: .34em; color: #fff; -webkit-text-stroke: 2px #07090e; paint-order: stroke fill; }
#tr-logo .tag { margin-top: 26px; font-weight: 800; font-size: 24px; letter-spacing: .46em; text-indent: .46em; color: rgba(255,255,255,.88); }
#tr-end { left: 0; right: 0; bottom: 11%; text-align: center; }
#tr-end .cta { font-weight: 800; font-size: 40px; letter-spacing: .38em; text-indent: .38em; color: #fff; }
#tr-end .cta b { color: #ffd400; }
#tr-end .fine { margin-top: 26px; font-weight: 600; font-size: 17px; letter-spacing: .12em; color: rgba(255,255,255,.5); }
#tr-word { left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; font: 400 170px/1 Anton, Impact, sans-serif; letter-spacing: .06em; -webkit-text-stroke: 4px #07090e; paint-order: stroke fill; text-shadow: 9px 9px 0 #07090e; }
`;
const root = document.createElement('div');
root.id = 'tr';
root.innerHTML = `
  <div id="tr-vig"></div>
  <div id="tr-bars"><i></i><i></i></div>
  <div id="tr-name"><div class="nm"></div><div class="rl"><i></i><span></span></div><div class="real"></div></div>
  <div id="tr-ult"><div class="u"></div><div class="sub"></div></div>
  <div id="tr-word"></div>
  <div id="tr-black"></div>
  <div id="tr-logo"><div class="l1">INVINCIBLE<svg viewBox="0 0 200 120"><path d="M60 40c10-20 40-25 55-10 8-12 30-12 34 4 14-2 22 12 12 22 12 8 4 26-12 22-2 14-22 18-32 8-12 12-36 8-38-8-18 4-30-12-19-24-8-10 2-22 0-14z" fill="#b8000d"/><circle cx="160" cy="80" r="6" fill="#b8000d"/><circle cx="40" cy="70" r="4" fill="#b8000d"/><circle cx="175" cy="45" r="3" fill="#b8000d"/><path d="M100 90c2 10 0 22-3 28 6-4 8-14 8-26z" fill="#b8000d"/></svg></div><div class="l2wrap"><span class="l2">ADVERSARIES</span></div><div class="tag"></div></div>
  <div id="tr-card"></div>
  <div id="tr-end"><div class="cta">PLAY NOW <b>·</b> IN YOUR BROWSER</div><div class="fine">An unofficial fan project. Invincible and its characters belong to their respective owners.</div></div>
  <div id="tr-flash"></div>`;
const st = document.createElement('style'); st.textContent = css;
document.head.appendChild(st); document.body.appendChild(root);
const $ = (s) => root.querySelector(s);
const el = { black: $('#tr-black'), flash: $('#tr-flash'), vig: $('#tr-vig'), bars: root.querySelectorAll('#tr-bars i'), card: $('#tr-card'), name: $('#tr-name'), nm: $('#tr-name .nm'), rl: $('#tr-name .rl span'), rlbar: $('#tr-name .rl i'), real: $('#tr-name .real'),
  ult: $('#tr-ult'), u: $('#tr-ult .u'), usub: $('#tr-ult .sub'), logo: $('#tr-logo'), tag: $('#tr-logo .tag'), end: $('#tr-end'), word: $('#tr-word') };

function applyOverlay(o) {
  el.black.style.opacity = o.black || 0;
  el.flash.style.opacity = o.flash || 0;
  el.vig.style.opacity = o.vig ?? 1;
  const bar = (o.bars || 0) * 12.5;
  el.bars.forEach((b) => { b.style.height = bar + 'vh'; });
  // text card
  if (o.card && o.card.a > 0.001) {
    el.card.style.display = 'block';
    el.card.innerHTML = o.card.html;
    el.card.style.opacity = o.card.a;
    el.card.style.letterSpacing = (0.42 + (o.card.spread || 0)) + 'em';
    el.card.style.transform = `translateY(-50%) scale(${o.card.s || 1})`;
  } else el.card.style.display = 'none';
  // hero name card
  if (o.name && o.name.a > 0.001) {
    const n = o.name;
    el.name.style.display = 'block';
    el.nm.textContent = n.name; el.nm.style.color = n.color;
    el.rl.textContent = n.role; el.rlbar.style.background = n.color; el.rl.style.color = '#fff';
    el.real.textContent = n.real || '';
    el.name.style.opacity = n.a;
    el.nm.style.transform = `translateX(${(1 - n.k) * -120}px) skewX(-8deg)`;
    el.rl.parentElement.style.transform = `translateX(${(1 - n.k2) * -80}px)`;
    el.rl.parentElement.style.opacity = n.k2;
    el.real.style.opacity = n.k2 * 0.9;
  } else el.name.style.display = 'none';
  // ultimate name
  if (o.ult && o.ult.a > 0.001) {
    el.ult.style.display = 'block';
    el.u.textContent = o.ult.text; el.u.style.color = o.ult.color;
    el.usub.textContent = o.ult.sub || '';
    el.ult.style.opacity = o.ult.a;
    el.u.style.transform = `scale(${o.ult.s || 1}) skewX(-8deg)`;
  } else el.ult.style.display = 'none';
  // logo
  if (o.logo && o.logo.a > 0.001) {
    el.logo.style.display = 'block';
    el.logo.style.opacity = o.logo.a;
    el.logo.style.transform = `translateY(-${o.logo.y ?? 58}%) scale(${o.logo.s || 1})`;
    el.tag.textContent = o.logo.tag || '';
    el.tag.style.opacity = o.logo.tagA ?? 1;
  } else el.logo.style.display = 'none';
  if (o.end && o.end.a > 0.001) { el.end.style.display = 'block'; el.end.style.opacity = o.end.a; } else el.end.style.display = 'none';
  if (o.word && o.word.a > 0.001) {
    el.word.style.display = 'block'; el.word.textContent = o.word.text; el.word.style.color = o.word.color;
    el.word.style.opacity = o.word.a; el.word.style.transform = `translateY(-50%) scale(${o.word.s || 1}) skewX(-8deg)`;
  } else el.word.style.display = 'none';
}

// ------------------------------------------------------------------ audio capture
const TR = window.TR = { clock: 0, muted: false, rateScale: 1 };
TR.initAudio = async (total) => {
  const SR = 48000;
  const off = new OfflineAudioContext(2, Math.ceil(total * SR), SR);
  const proxy = new Proxy(off, {
    get(t, k) { if (k === 'currentTime') return TR.clock; const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v; },
    set(t, k, v) { t[k] = v; return true; },
  });
  window.AudioContext = function () { return proxy; };
  await g.audio.init();
  g.audio.maxVoices = 1e9;
  // every sound that plays is logged as [shot, name, trailer time] so the score can hit on exact events
  TR.cues = [];
  const play = g.audio.play.bind(g.audio);
  g.audio.play = (name, o = {}) => {
    if (TR.muted) return null;
    const v = play(name, { ...o, rate: (o.rate || 1) * TR.rateScale });
    if (v) TR.cues.push([cur.s.id, name, +(TR.clock + (o.delay || 0)).toFixed(4)]);
    return v;
  };
  const beamVoice = g.audio.beamVoice.bind(g.audio);
  g.audio.beamVoice = (p) => (TR.muted ? { set() {}, stop() {} } : beamVoice(p));
  TR.off = off;
};
TR.renderAudio = async () => {
  const buf = await TR.off.startRendering();
  const n = buf.length, L0 = buf.getChannelData(0), R0 = buf.getChannelData(1);
  const pcm = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) { pcm[i * 2] = Math.max(-1, Math.min(1, L0[i])) * 32767; pcm[i * 2 + 1] = Math.max(-1, Math.min(1, R0[i])) * 32767; }
  const bytes = new Uint8Array(pcm.buffer);
  let s = '';
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
  return { sr: buf.sampleRate, b64: btoa(s) };
};

// ------------------------------------------------------------------ staging
function resetFx() {
  fx.add.n = 0; fx.alpha.n = 0;
  for (const it of fx.items) it.dispose(fx.scene); fx.items = [];
  for (const t of fx.trails) t.dispose(); fx.trails = [];
  for (const d of fx.decals) { fx.scene.remove(d.mesh); d.mesh.material.dispose(); } fx.decals = [];
  fx.updaters = [];
  fx.debris.items = []; if (fx.debris.mesh) fx.debris.mesh.count = 0;
  for (const s of fx.lights.lights) { s.t = s.life = 0; s.l.intensity = 0; }
  g.renderer.waves = [];
  Object.assign(g.renderer.fx, { ca: 0, flash: 0, damage: 0, desat: 0, radial: 0, speedLines: 0, lowHp: 0 });
  w.hitstopT = 0;
}

const KEYS = ['invincible', 'eve', 'omniman'];
/** spec: [{ key, team, at:Vector3, face:Vector3 (world dir), fly, player, bot }] */
function stage(spec, { hud = false, bots = 'idle' } = {}) {
  g.clearWorld();
  resetFx();
  g.state = 'playing';
  g.menus.show(null);
  g.hud.show(hud);
  w.settings.bots = bots; w.settings.noCooldowns = true; w.settings.godMode = false; w.settings.comic = true;
  const heroes = [];
  for (const s of spec) {
    const h = g.spawn(s.key, s.team ?? 0, { isPlayer: !!s.player, name: s.player ? 'YOU' : undefined });
    if (s.player) g.player = h;
    h.pos.copy(s.at); h.vel.set(0, 0, 0);
    const gy = w.groundAt(h.pos.x, h.pos.z);
    if (s.fly) { h.mode = 'fly'; h.grounded = false; } else { h.pos.y = Math.max(h.pos.y, gy); h.mode = h.pos.y > gy + 0.05 ? 'air' : 'ground'; h.grounded = h.mode === 'ground'; }
    const f = (s.face || F.clone().negate()).clone(); f.y = 0; f.normalize();
    h.intents.aimDir.copy(s.aim || f); h.aimDir.copy(h.intents.aimDir); h.yaw = h.visYaw = Math.atan2(f.x, f.z);
    h.intents.aimOrigin.copy(h.pos).add(V(0, 1.5, 0));
    h.intents.aimPoint.copy(h.pos).addScaledVector(h.intents.aimDir, 20);
    if (s.hp != null) h.hp = s.hp;
    h.trName = s.name;
    heroes.push(h);
  }
  if (!g.player) g.player = heroes[0];
  const keep = new Set(spec.map((s, i) => (s.bot ? heroes[i] : null)).filter(Boolean));
  g.bots = g.bots.filter((b) => keep.has(b.h));
  g.playerBot = null;
  g.script = () => {};
  // one silent step so every hero has a pose, center and capsule before kits run
  for (const h of heroes) clr(h.intents);
  g.noRender = true; g.step(1 / 120);
  const S = { heroes, by: (n) => heroes[spec.findIndex((s) => s.name === n)], trauma: 0, sm: {} };
  return S;
}
const clr = (it) => { it.primaryPressed = it.secondaryPressed = it.a1 = it.a2 = it.a3 = it.ult = false; it.jump = it.flyToggle = false; it.choice = null; };
function aim(h, pt) {
  const it = h.intents;
  it.aimOrigin.copy(h.pos).add(V(0, 1.5, 0));
  it.aimDir.copy(pt).sub(it.aimOrigin).normalize();
  it.aimPoint.copy(pt);
  it.aimHero = null;
}
const once = (S, key, cond, fn) => { if (!S[key] && cond) { S[key] = true; fn(); } };
/** smoothed follow point (critically damped) */
function follow(S, key, target, rate = 6) {
  const p = S.sm[key];
  if (!p) { S.sm[key] = target.clone(); return S.sm[key]; }
  p.lerp(target, 1 - Math.exp(-rate * FDT));
  return p;
}
const center = (h) => (h.center ? h.center.clone() : h.pos.clone().add(V(0, 1, 0)));

// ------------------------------------------------------------------ shots
const C = { inv: '#ffd400', eve: '#ff4fd8', omni: '#ff3a45' };
const NAME = {
  invincible: { name: 'INVINCIBLE', role: 'DUELIST  ·  FLYING DIVE DPS', real: 'MARK GRAYSON', color: C.inv },
  eve: { name: 'ATOM EVE', role: 'STRATEGIST  ·  SHIELDS & SUPPORT', real: 'SAMANTHA EVE WILKINS', color: C.eve },
  omniman: { name: 'OMNI-MAN', role: 'VANGUARD  ·  BRAWLER TANK', real: 'NOLAN GRAYSON', color: C.omni },
};
const nameCard = (key, t, t0, t1) => ({ ...NAME[key], a: win(t, t0, t1, 0.12, 0.25), k: out3((t - t0) / 0.35), k2: out3((t - t0 - 0.15) / 0.4) });
const ultCard = (text, color, t, t0, t1, sub) => ({ text, color, sub, a: win(t, t0, t1, 0.05, 0.25), s: lerp(1.35, 1, backOut((t - t0) / 0.28)) });
const card = (html, t, dur) => ({ html, a: win(t, 0.25, dur - 0.1, 0.35, 0.3), s: lerp(1.06, 1, out3(t / dur)), spread: (1 - out3(t / dur)) * 0.12 });

const shots = [];
const add = (s) => shots.push(s);

// ---------- cold open
add({ id: 'card_three', dur: 2.0, noRender: true, setup: () => stage([{ key: 'omniman', at: L(0, 0, 0) }]), ov: (S, t) => ({ black: 1, card: card('THREE <b>HEROES</b>', t, 2.0) }) });

add({
  id: 'establish', dur: 3.0, pre: 1.0,
  setup: () => stage([{ key: 'omniman', player: true, at: L(0, 0, 0), face: F }]),
  update: (S, t) => { const h = S.heroes[0]; aim(h, L(0, 1.6 + t * 1.2, 30)); },
  cam: (S, t) => { const k = inout(t / 3.0); return { pos: vlerp(L(-3, 22, 42), L(-0.5, 1.7, 6.2), k), look: vlerp(L(0, 1.0, 0), L(0, 1.55, 0), k), fov: lerp(42, 36, k) }; },
  ov: (S, t) => ({ black: 1 - ss(0, 0.5, t), bars: 1 }),
});

add({ id: 'card_arena', dur: 1.5, noRender: true, setup: () => stage([{ key: 'eve', at: L(0, 0, 0) }]), ov: (S, t) => ({ black: 1, card: card('ONE <b>ARENA</b>', t, 1.5) }) });

add({
  id: 'eve_hover', dur: 2.5, pre: 0.6,
  setup: () => stage([{ key: 'eve', player: true, at: L(0, 2.4, 0), fly: true, face: F }]),
  update: (S, t) => {
    const h = S.heroes[0]; clr(h.intents); aim(h, L(0, 2.6, 14));
    once(S, 'b', t > 1.1, () => { h.intents.a1 = true; });
  },
  cam: (S, t) => { const k = inout(t / 2.5); return { pos: vlerp(L(-2.8, 1.6, 3.7), L(2.1, 1.9, 3.9), k), look: L(0, 3.15, 0), fov: 40 }; },
  ov: () => ({ bars: 1 }),
});

add({ id: 'card_limits', dur: 1.5, noRender: true, setup: () => stage([{ key: 'invincible', at: L(0, 0, 0) }]), ov: (S, t) => ({ black: 1, card: card('NO <b>HOLDING BACK</b>', t, 1.5) }) });

add({
  id: 'inv_flyby', dur: 1.5, pre: 0.2,
  setup: () => { const S = stage([{ key: 'invincible', player: true, at: L(-0.5, 3.0, -24), fly: true, face: F }]); S.heroes[0].vel.copy(F).multiplyScalar(20); return S; },
  update: (S, t) => {
    const h = S.heroes[0], it = h.intents; clr(it);
    if (!S.dash) { aim(h, L(1.6, 2.6, 12)); it.mz = 1; }
    once(S, 'dash', t > 0.85, () => { S.dash = true; aim(h, L(2.4, 2.4, 40)); it.a1 = true; });
  },
  cam: (S, t) => {
    const h = S.heroes[0];
    const l = follow(S, 'l', center(h), 7);
    return { pos: L(0.4, 1.8, 10.5), look: V(l.x, Math.min(l.y, 5), l.z), fov: 46 };
  },
  ov: () => ({ bars: 1 }),
});

// three flash cuts
add({
  id: 'flash_punch', dur: 1 / 3, pre: 0.62,
  setup: () => stage([{ key: 'omniman', player: true, at: L(-0.9, 0, 0), face: R }, { key: 'invincible', team: 1, at: L(0.75, 0, 0), face: R.clone().negate() }]),
  update: (S) => { const h = S.heroes[0]; clr(h.intents); aim(h, center(S.heroes[1])); h.intents.primary = true; },
  cam: () => ({ pos: L(0.35, 1.45, 2.3), look: L(0.15, 1.35, 0), fov: 42 }),
  ov: (S, t) => ({ bars: 1, flash: (1 - ss(0, 0.12, t)) * 0.45 }),
});
add({
  id: 'flash_bubble', dur: 1 / 3, pre: 0.25,
  setup: () => stage([{ key: 'eve', player: true, at: L(-3, 1.8, 2), fly: true, face: R }, { key: 'omniman', at: L(0.6, 0, 0), face: F }]),
  update: (S) => { const h = S.heroes[0]; clr(h.intents); aim(h, center(S.heroes[1])); once(S, 'b', true, () => { h.intents.a1 = true; }); },
  cam: () => ({ pos: L(1.2, 1.4, 3.2), look: L(0.5, 1.2, 0), fov: 40 }),
  ov: (S, t) => ({ bars: 1, flash: (1 - ss(0, 0.12, t)) * 0.45 }),
});
add({
  id: 'flash_clap', dur: 1 / 3, pre: 0.3,
  setup: () => stage([{ key: 'invincible', player: true, at: L(0, 0, 0), face: F }, { key: 'eve', team: 1, at: L(0.3, 0, 6), face: F.clone().negate() }]),
  update: (S) => { const h = S.heroes[0]; clr(h.intents); aim(h, L(0, 1.2, 10)); once(S, 'c', true, () => { h.intents.secondaryPressed = true; }); },
  cam: () => ({ pos: L(2.9, 1.5, 2.0), look: L(0, 1.35, 0.8), fov: 42 }),
  ov: (S, t) => ({ bars: 1, flash: Math.max((1 - ss(0, 0.12, t)) * 0.45, ss(0.2, 0.333, t)) }),
});

// ---------- title
add({
  id: 'title', dur: 4.0, pre: 6.0,
  setup: () => {
    const S = stage([
      { key: 'invincible', team: 0, at: L(-6, 0, -4), bot: true }, { key: 'eve', team: 0, at: L(-8, 0, -1), bot: true }, { key: 'omniman', team: 0, at: L(-4, 0, 2), bot: true },
      { key: 'invincible', team: 1, at: L(6, 0, 4), bot: true }, { key: 'eve', team: 1, at: L(8, 0, 1), bot: true }, { key: 'omniman', team: 1, at: L(4, 0, -2), bot: true },
    ], { bots: 'active' });
    w.settings.difficulty = 'hard';
    return S;
  },
  cam: (S, t) => {
    const alive = S.heroes.filter((h) => !h.dead);
    const c = V(0, 0, 0); for (const h of alive) c.add(h.pos); if (alive.length) c.multiplyScalar(1 / alive.length);
    const f = follow(S, 'c', c, 0.8);
    const a = 0.6 + t * 0.07;
    return { pos: V(f.x + Math.sin(a) * 22, 7.5, f.z + Math.cos(a) * 22), look: V(f.x, 2.2, f.z), fov: 46 };
  },
  ov: (S, t) => ({
    black: 0.45 + ss(3.4, 4.0, t) * 0.55, flash: (1 - ss(0, 0.35, t)) * 0.9,
    logo: { a: ss(0, 0.06, t) * (1 - ss(3.45, 3.9, t)), s: lerp(1.45, 1, backOut(t / 0.32)) * (1 + t * 0.012), tag: 'A 3V3 HERO SHOOTER', tagA: ss(1.0, 1.5, t) },
  }),
});

// ---------- INVINCIBLE
add({
  id: 'inv_land', dur: 2.0, pre: 0.06,
  setup: () => stage([{ key: 'invincible', player: true, at: L(-1.2, 10, -5), fly: true, face: F }]),
  update: (S, t) => {
    const h = S.heroes[0], it = h.intents; clr(it);
    aim(h, L(0, 0, 0)); it.aimPoint.copy(L(0, 0, 0));
    once(S, 'd', true, () => { it.a2 = true; });
    if (t > 0.6) aim(h, L(0, 1.6, 12));
  },
  cam: (S, t) => { const k = out3(t / 2.0); return { pos: vlerp(L(1.3, 0.5, 4.3), L(0.9, 0.62, 3.5), k), look: vlerp(L(0, 1.6, 0), L(0, 1.05, 0), ss(0, 0.8, t)), fov: 40 }; },
  ov: (S, t) => ({ name: nameCard('invincible', t, 0.5, 2.0) }),
});

add({
  id: 'inv_combo', dur: 2.0, pre: 0.15,
  setup: () => stage([{ key: 'invincible', player: true, at: L(-1.4, 0, 0), face: R }, { key: 'omniman', team: 1, at: L(1.25, 0, 0), face: R.clone().negate() }]),
  update: (S) => { const h = S.heroes[0]; clr(h.intents); aim(h, center(S.heroes[1])); h.intents.primary = true; },
  cam: (S, t) => { const a = lerp(0.35, -0.5, inout(t / 2)); return { pos: L(Math.sin(a) * 3.7, 1.45, Math.cos(a) * 3.7), look: L(0, 1.25, 0), fov: 42 }; },
});

add({
  id: 'inv_dash', dur: 1.5, pre: 0.15,
  setup: () => stage([
    { key: 'invincible', player: true, at: L(-12, 1.5, 0), fly: true, face: R },
    { key: 'eve', team: 1, at: L(-2, 0, 0.6), face: R.clone().negate() }, { key: 'omniman', team: 1, at: L(3, 0, -0.6), face: R.clone().negate() },
  ]),
  update: (S, t) => { const h = S.heroes[0], it = h.intents; clr(it); aim(h, L(24, 1.4, 0)); once(S, 'd', t > 0.25, () => { it.a1 = true; }); },
  cam: (S, t) => { const k = ss(0.2, 0.95, t); return { pos: L(lerp(-5, 11, k), 1.7, 9.0), look: L(lerp(-4, 15, k), 1.3, 0), fov: 52 }; },
});

add({
  id: 'inv_dive', dur: 2.0, pre: 0.1,
  setup: () => stage([
    { key: 'invincible', player: true, at: L(-6, 15, -10), fly: true, face: F },
    { key: 'eve', team: 1, at: L(-1.3, 0, 0.6), face: F }, { key: 'omniman', team: 1, at: L(1.5, 0, -0.7), face: F },
  ]),
  update: (S, t) => { const h = S.heroes[0], it = h.intents; clr(it); aim(h, L(0, 0, 0)); it.aimPoint.copy(L(0, 0, 0)); once(S, 'd', t > 0.2, () => { it.a2 = true; }); },
  cam: (S, t) => { const k = inout(t / 2); const l = follow(S, 'l', center(S.heroes[0]), 5); return { pos: vlerp(L(3.8, 0.9, 8.2), L(3.1, 1.1, 6.9), k), look: V(l.x, Math.max(1.1, l.y), l.z).lerp(L(0, 1.3, 0), ss(0.6, 1.2, t)), fov: 54 }; },
});

add({
  id: 'inv_slam', dur: 2.0, pre: 0.2,
  setup: () => stage([{ key: 'invincible', player: true, at: L(-1.6, 0, 0), face: R }, { key: 'omniman', team: 1, at: L(1.4, 0, 0), face: R.clone().negate() }]),
  update: (S, t) => { const h = S.heroes[0], it = h.intents; clr(it); aim(h, center(S.heroes[1])); once(S, 's', t > 0.15, () => { it.a3 = true; }); },
  cam: (S, t) => { const f = follow(S, 'f', center(S.heroes[0]), 4.5); const y = Math.max(1.2, f.y); return { pos: L(0.6, 1.2 + (y - 1.2) * 0.55, 5.6 + (y - 1.2) * 0.12), look: V(f.x, y, f.z), fov: 54 }; },
});

add({
  id: 'inv_mach', dur: 4.0, pre: 0.1,
  setup: () => {
    const S = stage([
      { key: 'invincible', player: true, at: L(2, 0, 6), face: F.clone().negate() },
      { key: 'omniman', team: 1, at: L(-1.2, 0, -0.6), face: F }, { key: 'eve', team: 1, at: L(1.6, 0, 0.8), face: F },
    ]);
    S.heroes[0].ult = S.heroes[0].def.ultCost;
    return S;
  },
  update: (S, t) => {
    const h = S.heroes[0], it = h.intents; clr(it);
    aim(h, L(0, 0, 0)); it.aimPoint.copy(L(0, 0, 0));
    once(S, 'u', t >= 0.05, () => { it.ult = true; });
    once(S, 'f', t > 1.75, () => { it.primaryPressed = true; });
    if (h.override && h.override.phase === 'fall') S.falling = true;
    else if (S.falling && !S.impactT) S.impactT = t;
  },
  slow: (S, t) => (S.impactT ? lerp(0.3, 1, ss(S.impactT + 0.15, S.impactT + 1.1, t)) : 1),
  cam: (S, t) => {
    const h = S.heroes[0];
    if (t < 0.8) return { pos: L(3.0, 0.4, 9.2), look: follow(S, 'r', center(h).add(V(0, 0.8, 0)), 4), fov: 58 };
    if (t < 1.9) {
      const c = center(h), away = c.clone().sub(L(0, 0, 0)); away.y = 0; away.normalize();
      return { pos: c.clone().addScaledVector(away, 1.6).add(V(0, 4.5, 0)), look: L(0, 0, 0), fov: 52 };
    }
    const k = ss(1.9, 4, t);
    return { pos: vlerp(L(15, 2.2, 17), L(13, 2.6, 15), k), look: vlerp(L(0, 8, 0), L(0, 1.5, 0), ss(1.9, 2.6, t)), fov: 52 };
  },
  ov: (S, t) => ({ ult: S.impactT ? ultCard('MACH BREAKER', C.inv, t, S.impactT, 4.0) : null, flash: S.impactT ? (1 - ss(S.impactT, S.impactT + 0.3, t)) * 0.65 : 0 }),
});

// ---------- ATOM EVE
add({
  id: 'eve_intro', dur: 2.0, pre: 0.0,
  setup: () => stage([{ key: 'eve', player: true, at: L(-7, 2.8, -2), fly: true, face: R }]),
  update: (S, t) => {
    const h = S.heroes[0], it = h.intents; clr(it);
    if (t < 0.55) { aim(h, L(0, 2.5, 0)); it.mz = 1; } else { it.mz = 0; aim(h, L(0.5, 2.5, 12)); }
  },
  cam: (S, t) => { const k = inout(t / 2.0); return { pos: vlerp(L(1.4, 1.9, 4.6), L(0.9, 2.1, 3.8), k), look: follow(S, 'l', center(S.heroes[0]).add(V(0, 0.2, 0)), 5), fov: 40 }; },
  ov: (S, t) => ({ name: nameCard('eve', t, 0.5, 2.0) }),
});

add({
  id: 'eve_bolts', dur: 2.0, pre: 0.2, hud: true,
  setup: () => stage([{ key: 'eve', player: true, at: L(0, 0, 0), face: F.clone().negate() }, { key: 'omniman', team: 1, at: L(1.2, 0, -10), face: F }, { key: 'invincible', team: 1, at: L(-2.5, 0, -12), face: F }], { hud: true }),
  update: (S, t) => { const h = S.heroes[0], it = h.intents; clr(it); const tg = t < 1.1 ? S.heroes[1] : S.heroes[2]; aim(h, center(tg)); it.primary = true; it.mx = Math.sin(t * 2.2) * 0.8; },
  cam: (S, t) => { const h = S.heroes[0]; const a = h.intents.aimDir.clone(); a.y = 0; a.normalize(); const r = new THREE.Vector3().crossVectors(UP, a).negate(); const p = h.pos.clone().addScaledVector(a, -3.9).addScaledVector(r, 0.75).add(V(0, 1.75, 0)); return { pos: follow(S, 'p', p, 8), look: follow(S, 'l', h.pos.clone().addScaledVector(a, 12).add(V(0, 1.2, 0)), 8), fov: 55 }; },
});

add({
  id: 'eve_bubble', dur: 2.0, pre: 0.3,
  setup: () => stage([
    { key: 'eve', player: true, at: L(-2.6, 1.1, 3.4), fly: true, face: R },
    { key: 'omniman', team: 0, at: L(-0.9, 0, 0), face: R },
    { key: 'invincible', team: 1, at: L(0.9, 0, 0), face: R.clone().negate() },
  ]),
  update: (S, t) => {
    const [h, ally, foe] = S.heroes;
    clr(h.intents); aim(h, center(ally));
    once(S, 'b', t > 0.15, () => { h.intents.a1 = true; });
    clr(foe.intents); aim(foe, center(ally)); foe.intents.primary = t > 0.35;
  },
  cam: (S, t) => { const k = inout(t / 2.0); return { pos: vlerp(L(3.6, 1.7, 6.4), L(2.9, 1.6, 5.8), k), look: L(-0.9, 1.5, 1.2), fov: 44 }; },
});

add({
  id: 'eve_field', dur: 2.5, pre: 0.2,
  setup: () => stage([
    { key: 'eve', player: true, at: L(0, 0, 0), face: F.clone().negate() },
    { key: 'omniman', team: 1, at: L(-0.8, 0, -9), face: F }, { key: 'invincible', team: 1, at: L(1.6, 0, -10), face: F },
  ]),
  update: (S, t) => {
    const h = S.heroes[0], it = h.intents; clr(it);
    aim(h, L(0.4, 0.2, -9.5)); it.aimPoint.copy(L(0.4, 0, -9.5));
    once(S, 'f', t > 0.05, () => { it.a2 = true; });
    if (t > 0.8) aim(h, center(S.heroes[1]));
    once(S, 'c', t > 0.9, () => { it.secondaryPressed = true; });
  },
  cam: (S, t) => { const k = inout(t / 2.5); return { pos: vlerp(L(5.6, 2.6, -2.4), L(4.8, 2.2, -4.0), k), look: L(0, 1.2, -7.2), fov: 50 }; },
});

add({
  id: 'eve_ult', dur: 4.5, pre: 0.1,
  setup: () => {
    const S = stage([
      { key: 'eve', player: true, at: L(0, 0, 0), face: F },
      { key: 'omniman', team: 1, at: L(-4.0, 0, 13), face: F.clone().negate() }, { key: 'invincible', team: 1, at: L(0.5, 0, 15), face: F.clone().negate() }, { key: 'eve', team: 1, at: L(4.0, 0, 12.5), face: F.clone().negate() },
    ]);
    S.heroes[0].ult = S.heroes[0].def.ultCost;
    return S;
  },
  update: (S, t) => {
    const h = S.heroes[0], it = h.intents; clr(it);
    const sweep = t < 2.1 ? -5 : lerp(-6, 6, ss(2.1, 4.4, t));
    aim(h, L(sweep, 0.6, 14));
    once(S, 'u', t >= 0.05, () => { it.ult = true; });
    once(S, 'b', t > 1.9, () => { it.primaryPressed = true; });
  },
  cam: (S, t) => {
    if (t < 2.0) { const k = inout(t / 2.0); return { pos: vlerp(L(1.6, 0.7, 3.4), L(1.3, 0.95, 2.9), k), look: L(0, 3.1, 0), fov: 46 }; }
    const k = ss(2.0, 4.6, t);
    return { pos: vlerp(L(15, 5.5, 2.0), L(16, 6.0, 5.0), k), look: L(0, 2.2, 8.0), fov: 52 };
  },
  ov: (S, t) => ({
    ult: t < 2.0 ? ultCard('UNBOUND', C.eve, t, 0.85, 2.0) : ultCard('ANNIHILATION BEAM', C.eve, t, 2.05, 4.5),
    flash: (1 - ss(0.85, 1.1, t)) * ss(0.8, 0.85, t) * 0.5,
  }),
});

add({
  id: 'eve_revive', dur: 2.0, pre: 3.0,
  setup: () => {
    const S = stage([
      { key: 'eve', player: true, at: L(0, 0, 0), face: F },
      { key: 'invincible', team: 0, at: L(-2.8, 0, 1.0), face: F }, { key: 'omniman', team: 0, at: L(3.0, 0, 0.6), face: F },
    ]);
    S.heroes[0].ult = S.heroes[0].def.ultCost;
    for (const a of [S.heroes[1], S.heroes[2]]) w.kill(null, a);
    return S;
  },
  update: (S, t) => {
    const h = S.heroes[0], it = h.intents; clr(it); aim(h, L(0, 1.6, 12));
    once(S, 'u', t >= -1.3, () => { it.ult = true; });
    once(S, 'r', t > 0.15, () => { it.secondaryPressed = true; });
  },
  cam: (S, t) => { const k = inout(t / 2); return { pos: vlerp(L(0.8, 2.0, 7.5), L(0.6, 2.3, 6.6), k), look: L(0, 2.2, 0), fov: 46 }; },
  ov: (S, t) => ({ ult: ultCard('RECONSTRUCTION', C.eve, t, 0.15, 2.0, '—  OR  BRING  EVERYONE  BACK  —') }),
});

// ---------- OMNI-MAN
add({
  id: 'omni_land', dur: 2.5, pre: 0.0,
  setup: () => { const S = stage([{ key: 'omniman', player: true, at: L(0, 9, -0.8), face: F }]); S.heroes[0].mode = 'air'; S.heroes[0].vel.set(0, -24, 0); return S; },
  update: (S, t) => {
    const h = S.heroes[0], it = h.intents; clr(it); aim(h, L(0, 1.6, 12));
    once(S, 'land', h.grounded && t > 0.05, () => { fx.groundSlam(h.pos.clone(), { power: 0.85 }); w.sfx('ground_slam', h.pos, { vol: 0.9 }); });
  },
  cam: (S, t) => { const l = follow(S, 'l', center(S.heroes[0]).add(V(0, 0.3, 0)), 7); return { pos: vlerp(L(0.9, 0.5, 4.4), L(0.6, 0.6, 3.7), inout(t / 2.5)), look: V(l.x, Math.max(1.4, l.y), l.z), fov: 42 }; },
  ov: (S, t) => ({ name: nameCard('omniman', t, 0.6, 2.5) }),
});

add({
  id: 'omni_combo', dur: 2.0, pre: 0.1,
  setup: () => stage([{ key: 'omniman', player: true, at: L(-1.2, 0, 0), face: R }, { key: 'invincible', team: 1, at: L(1.3, 0, 0), face: R.clone().negate() }]),
  update: (S, t) => { const h = S.heroes[0]; clr(h.intents); aim(h, center(S.heroes[1])); h.intents.primary = t < 1.5; },
  cam: (S, t) => { const a = lerp(-0.4, 0.45, inout(t / 2.0)); return { pos: L(Math.sin(a) * 4.0, 1.5, Math.cos(a) * 4.0), look: L(0.2, 1.2, 0), fov: 42 }; },
});

add({
  id: 'omni_boulder', dur: 2.0, pre: 0.1,
  setup: () => stage([{ key: 'omniman', player: true, at: L(3.5, 0, 0), face: R.clone().negate() }, { key: 'eve', team: 1, at: L(-7, 0, 0), face: R }]),
  update: (S, t) => { const h = S.heroes[0], it = h.intents; clr(it); aim(h, center(S.heroes[1])); once(S, 'b', t > 0.1, () => { it.secondaryPressed = true; }); },
  cam: (S, t) => { const k = inout(t / 2.0); return { pos: vlerp(L(2.4, 1.6, 6.4), L(-1.6, 1.8, 7.0), k), look: vlerp(L(3, 1.5, 0), L(-4.5, 1.3, 0), ss(0.4, 1.4, t)), fov: 50 }; },
});

add({
  id: 'omni_charge', dur: 2.0, pre: 0.1,
  setup: () => stage([{ key: 'omniman', player: true, at: L(-10, 0, 0), face: R }, { key: 'invincible', team: 1, at: L(-2, 0, 0), face: R.clone().negate() }]),
  update: (S, t) => { const h = S.heroes[0], it = h.intents; clr(it); aim(h, L(14, 1.2, 0)); once(S, 'c', t > 0.15, () => { it.a1 = true; }); },
  cam: (S, t) => { const k = ss(0.1, 1.0, t); return { pos: L(lerp(-6, 12, k), 1.6, 7.8), look: L(lerp(-5, 15, k), 1.2, 0), fov: 52 }; },
});

add({
  id: 'omni_clap', dur: 2.0, pre: 0.1,
  setup: () => stage([
    { key: 'omniman', player: true, at: L(0, 0, 0), face: F },
    { key: 'invincible', team: 1, at: L(-1.2, 0, 6), face: F.clone().negate() }, { key: 'eve', team: 1, at: L(1.6, 0, 8), face: F.clone().negate() },
  ]),
  update: (S, t) => { const h = S.heroes[0], it = h.intents; clr(it); aim(h, L(0, 1.2, 9)); once(S, 'c', t > 0.15, () => { it.a2 = true; }); },
  cam: (S, t) => { const k = inout(t / 2); return { pos: vlerp(L(4.0, 1.2, 8.5), L(4.6, 1.4, 7.6), k), look: L(0, 1.6, 2.5), fov: 48 }; },
});

add({
  id: 'omni_ult', dur: 4.0, pre: 0.1,
  setup: () => {
    const S = stage([
      { key: 'omniman', player: true, at: L(0, 0, 0), face: F.clone().negate() },
      { key: 'invincible', team: 1, at: L(-6, 0, -8), face: F }, { key: 'eve', team: 1, at: L(5, 0, -11), face: F },
      { key: 'invincible', team: 1, at: L(-2, 0, -16), face: F }, { key: 'eve', team: 1, at: L(7, 0, -17), face: F },
    ]);
    S.heroes[0].ult = S.heroes[0].def.ultCost;
    return S;
  },
  update: (S, t) => { const h = S.heroes[0], it = h.intents; clr(it); aim(h, L(0, 1.2, -12)); once(S, 'u', t > 0.1, () => { it.ult = true; }); },
  cam: (S, t) => { const f = follow(S, 'f', center(S.heroes[0]), 3.2); const a = lerp(0.5, 1.25, t / 4.0); return { pos: f.clone().add(L(Math.sin(a) * 9.5, 4.2, Math.cos(a) * 9.5)), look: f.clone().add(V(0, -0.2, 0)), fov: 52 }; },
  ov: (S, t) => ({ ult: ultCard('A FRACTION OF OUR POWER', C.omni, t, 0.35, 4.0) }),
});

// ---------- montage
const word = (text, color, t, d = 1) => ({ text, color, a: win(t, 0.0, d, 0.03, 0.22), s: lerp(1.3, 1, backOut(t / 0.22)) });
add({
  id: 'm_dive', dur: 1.0, pre: 0.5,
  setup: () => stage([{ key: 'invincible', player: true, at: L(-4, 13, -8), fly: true }, { key: 'omniman', team: 1, at: L(0, 0, 0), face: F }]),
  update: (S) => { const h = S.heroes[0], it = h.intents; clr(it); aim(h, L(0, 0, 0)); it.aimPoint.copy(L(0, 0, 0)); once(S, 'd', true, () => { it.a2 = true; }); },
  cam: (S, t) => ({ pos: L(2.0, 1.1, 5.6 - t * 0.6), look: L(0, 1.3, 0), fov: 50 }),
  ov: (S, t) => ({ word: word('DIVE.', C.inv, t) }),
});
add({
  id: 'm_shield', dur: 1.0, pre: 0.5,
  setup: () => stage([{ key: 'eve', player: true, at: L(-2.4, 1.9, 3), fly: true }, { key: 'invincible', team: 0, at: L(-0.8, 0, 0), face: R }, { key: 'omniman', team: 1, at: L(1.0, 0, 0), face: R.clone().negate() }]),
  update: (S) => { const [h, a, f] = S.heroes; clr(h.intents); aim(h, center(a)); once(S, 'b', true, () => { h.intents.a1 = true; }); clr(f.intents); aim(f, center(a)); f.intents.primary = true; },
  cam: (S, t) => ({ pos: L(0.3 - t * 0.6, 1.4, 4.0), look: L(0, 1.2, 0), fov: 44 }),
  ov: (S, t) => ({ word: word('SHIELD.', C.eve, t) }),
});
add({
  id: 'm_conquer', dur: 1.0, pre: 0.82,
  setup: () => stage([{ key: 'omniman', player: true, at: L(-1.2, 0, 0), face: R }, { key: 'eve', team: 1, at: L(1.3, 0, 0), face: R.clone().negate() }]),
  update: (S) => { const h = S.heroes[0]; clr(h.intents); aim(h, center(S.heroes[1])); h.intents.primary = true; },
  cam: (S, t) => ({ pos: L(0.6, 0.7, 3.6 + t * 0.4), look: L(0.2, 1.3, 0), fov: 42 }),
  ov: (S, t) => ({ word: word('CONQUER.', C.omni, t) }),
});
add({
  id: 'm_clash', dur: 1.0, pre: 0.15,
  setup: () => stage([{ key: 'invincible', player: true, at: L(-6, 7, 0), fly: true, face: R }, { key: 'omniman', team: 1, at: L(3, 7, 0), fly: true, face: R.clone().negate() }]),
  update: (S) => { const [h, o] = S.heroes; clr(h.intents); aim(h, center(o)); h.intents.mz = 1; h.intents.primary = true; },
  cam: (S, t) => { const m = follow(S, 'm', center(S.heroes[0]).lerp(center(S.heroes[1]), 0.5), 6); return { pos: m.clone().add(L(0.6 + t * 0.8, 0.6, 5.2)), look: m, fov: 48 }; },
});
add({
  id: 'm_thunder', dur: 1.0, pre: 0.32,
  setup: () => stage([{ key: 'omniman', player: true, at: L(0, 0, -5), face: F }, { key: 'invincible', team: 1, at: L(0.4, 0, 1.5), face: F.clone().negate() }]),
  update: (S) => { const h = S.heroes[0]; clr(h.intents); aim(h, L(0, 1.2, 8)); once(S, 'c', true, () => { h.intents.a2 = true; }); },
  cam: () => ({ pos: L(1.5, 1.3, 7.5), look: L(0, 1.4, -2), fov: 52 }),
});

add({
  id: 'final_pose', dur: 2.5, pre: 0.8,
  setup: () => stage([
    { key: 'omniman', player: true, at: L(0, 0, 0.3), face: F },
    { key: 'invincible', at: L(-1.9, 1.9, -0.6), fly: true, face: F }, { key: 'eve', at: L(2.0, 1.6, -0.5), fly: true, face: F },
  ]),
  update: (S) => { for (const h of S.heroes) { clr(h.intents); aim(h, L(0, 2, 14)); } },
  cam: (S, t) => { const k = out3(t / 2.5); return { pos: vlerp(L(0.3, 1.0, 3.6), L(0.2, 1.5, 5.8), k), look: vlerp(L(0, 1.6, 0), L(0, 1.75, 0), k), fov: lerp(46, 42, k) }; },
  ov: (S, t) => ({ black: ss(2.2, 2.5, t) }),
});

add({
  id: 'end', dur: 6.0, noRender: true,
  setup: () => stage([{ key: 'invincible', at: L(0, 0, 0) }]),
  ov: (S, t) => ({ black: 1, logo: { a: ss(0.2, 0.8, t) * (1 - ss(5.0, 5.8, t)), s: lerp(1.08, 1, out3(t / 2)) * (1 + t * 0.006), y: 70 }, end: { a: ss(1.2, 1.9, t) * (1 - ss(5.0, 5.8, t)) } }),
});

// timeline
let t0 = 0;
for (const s of shots) { s.frames = Math.round(s.dur * FPS); s.dur = s.frames / FPS; s.t0 = t0; t0 += s.dur; }
TR.total = t0;
TR.list = () => shots.map((s, i) => ({ i, id: s.id, t0: +s.t0.toFixed(3), dur: s.dur, frames: s.frames, noRender: !!s.noRender }));

// ------------------------------------------------------------------ runtime
let cur = null;
function camApply(S, s, t) {
  if (!s.cam) return;
  const c = s.cam(S, t);
  // camera shake from in-game trauma (the rig itself is bypassed in override mode)
  S.trauma = Math.max(0, Math.min(1.2, S.trauma + (g.camRig.trauma || 0)) - FDT * 1.6); g.camRig.trauma = 0;
  const k = S.trauma * S.trauma * 0.35, tt = TR.clock * 9;
  const pos = c.pos.clone().add(V(noise(tt, 1) * k, noise(tt, 7) * k * 0.7, noise(tt, 13) * k));
  const look = (c.look.isVector3 ? c.look.clone() : c.look).add(V(noise(tt, 3) * k * 0.5, noise(tt, 5) * k * 0.4, 0));
  g.camOverride = { pos, look, fov: c.fov || 50 };
}
TR.begin = (i) => {
  const s = shots[i];
  TR.muted = true; TR.clock = s.t0;
  const S = s.setup() || {};
  cur = { s, S, f: 0 };
  // pre-roll (simulated silently, never rendered)
  const preSteps = Math.round((s.pre || 0) * FPS * SUB);
  for (let k = 0; k < preSteps; k++) {
    const t = -s.pre + k / (FPS * SUB);
    s.update && s.update(S, t, 1 / (FPS * SUB));
    camApply(S, s, Math.max(0, t));
    g.noRender = true; g.step(1 / (FPS * SUB));
  }
  S.trauma = 0; g.camRig.trauma = 0;
  TR.muted = false;
  return { id: s.id, frames: s.frames };
};
TR.frame = (f, render = true) => {
  const { s, S } = cur;
  const t = f / FPS;
  const slow = s.slow ? s.slow(S, t) : 1;
  TR.rateScale = slow < 0.99 ? 0.55 + 0.45 * slow : 1;
  for (let k = 0; k < SUB; k++) {
    const lt = t + k / (FPS * SUB);
    TR.clock = s.t0 + lt;
    s.update && s.update(S, lt, 1 / (FPS * SUB));
    camApply(S, s, lt);
    g.noRender = s.noRender || !render || k < SUB - 1;
    g.step(slow / (FPS * SUB));
  }
  applyOverlay(s.ov ? s.ov(S, t) : {});
  return true;
};
TR.ready = true;
})();
