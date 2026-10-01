/* AUDIO */
// All sound is synthesized with Web Audio: no files. Includes a small procedural music loop.
var Sound = (function () {
'use strict';
let ctx = null, master = null, sfxG = null, musG = null, noiseBuf = null;
const vol = { sfx: 0.8, music: 0.45 };
let musicOn = false, musTimer = null, nextNote = 0, step = 0;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try { ctx = new AC(); } catch (e) { return null; }
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
  sfxG = ctx.createGain(); sfxG.connect(comp);
  musG = ctx.createGain(); musG.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  apply();
  return ctx;
}
function apply() { if (!ctx) return; sfxG.gain.value = vol.sfx * 0.7; musG.gain.value = vol.music * 0.32; }
function unlock() { if (!ensure()) return; if (ctx.state === 'suspended') ctx.resume(); if (vol.music > 0 && !musicOn) startMusic(); }
function setVolume(s, m) { vol.sfx = s; vol.music = m; apply(); if (m <= 0) stopMusic(); else if (ctx && !musicOn) startMusic(); }
function suspend(on) { if (!ctx) return; if (on) ctx.suspend(); else ctx.resume(); }

function tone(o) {
  if (!ctx || vol.sfx <= 0 && !o.music) return;
  const t = (o.when || ctx.currentTime) + (o.delay || 0);
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + (o.slide || o.dur));
  if (o.detune) osc.detune.value = o.detune;
  const v = o.vol == null ? 0.3 : o.vol, a = o.attack || 0.005, dur = o.dur || 0.2;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = osc;
  if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
  node.connect(g); g.connect(o.music ? musG : sfxG);
  osc.start(t); osc.stop(t + dur + 0.05);
}
function noise(o) {
  if (!ctx || (vol.sfx <= 0 && !o.music)) return;
  const t = (o.when || ctx.currentTime) + (o.delay || 0);
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f || 1200, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur); f.Q.value = o.q || 1;
  const g = ctx.createGain(); const v = o.vol == null ? 0.25 : o.vol;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f); f.connect(g); g.connect(o.music ? musG : sfxG);
  src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.05);
}
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);

const S = {
  click() { tone({ type: 'triangle', f0: 880, f1: 660, dur: 0.06, vol: 0.18 }); },
  select() { tone({ type: 'triangle', f0: 520, f1: 780, dur: 0.08, vol: 0.16 }); },
  error() { tone({ type: 'square', f0: 180, f1: 140, dur: 0.16, vol: 0.12, lp: 900 }); },
  whoosh() { noise({ f: 400, f1: 2400, dur: 0.22, vol: 0.22, q: 0.8 }); },
  draw() { noise({ f: 2600, f1: 4200, dur: 0.1, vol: 0.12, q: 2 }); tone({ type: 'sine', f0: 900, f1: 1300, dur: 0.08, vol: 0.06 }); },
  place() { tone({ type: 'sine', f0: 160, f1: 70, dur: 0.18, vol: 0.4 }); noise({ f: 900, dur: 0.08, vol: 0.18, ft: 'lowpass' }); },
  floop() { tone({ type: 'sine', f0: 240, f1: 760, dur: 0.12, slide: 0.1, vol: 0.28 }); tone({ type: 'sine', f0: 760, f1: 380, dur: 0.16, delay: 0.1, vol: 0.2 }); },
  holo() { tone({ type: 'triangle', f0: 300, f1: 1200, dur: 0.35, vol: 0.12 }); tone({ type: 'sine', f0: 1200, f1: 1600, dur: 0.25, delay: 0.15, vol: 0.06 }); },
  hit(n) { const k = Math.min(1, (n || 1) / 6); noise({ f: 700 + k * 300, f1: 200, dur: 0.12 + k * 0.1, vol: 0.25 + k * 0.2, ft: 'lowpass' }); tone({ type: 'sine', f0: 140 - k * 40, f1: 50, dur: 0.16 + k * 0.08, vol: 0.35 + k * 0.2 }); },
  zap() { tone({ type: 'sawtooth', f0: 1400, f1: 300, dur: 0.18, vol: 0.1, lp: 3000 }); },
  arrow() { noise({ f: 3000, f1: 1200, dur: 0.12, vol: 0.12, q: 3 }); },
  death() { [0, 1, 2, 3].forEach(i => tone({ type: 'square', f0: 620 - i * 120, dur: 0.07, delay: i * 0.05, vol: 0.09, lp: 2500 })); noise({ f: 3000, f1: 400, dur: 0.3, vol: 0.12, q: 0.6 }); },
  hero() { tone({ type: 'sine', f0: 110, f1: 40, dur: 0.35, vol: 0.5 }); noise({ f: 500, f1: 120, dur: 0.3, vol: 0.25, ft: 'lowpass' }); },
  heal() { [0, 4, 7, 12].forEach((s, i) => tone({ type: 'sine', f0: NOTE(76 + s), dur: 0.18, delay: i * 0.05, vol: 0.09 })); },
  shield() { tone({ type: 'sine', f0: 1046, dur: 0.3, vol: 0.08 }); tone({ type: 'sine', f0: 1568, dur: 0.3, vol: 0.06, delay: 0.04 }); },
  freeze() { tone({ type: 'triangle', f0: 1800, f1: 2400, dur: 0.25, vol: 0.08 }); noise({ f: 6000, dur: 0.3, vol: 0.1, q: 4 }); },
  burn() { for (let i = 0; i < 4; i++) noise({ f: 1500 + Math.random() * 2000, dur: 0.05, delay: i * 0.04, vol: 0.12, q: 2 }); },
  rot() { tone({ type: 'sine', f0: 140, f1: 90, dur: 0.35, vol: 0.18 }); tone({ type: 'sine', f0: 147, f1: 95, dur: 0.35, vol: 0.12 }); },
  build() { tone({ type: 'triangle', f0: 200, f1: 600, dur: 0.35, vol: 0.14 }); [0, 1, 2].forEach(i => noise({ f: 1800, dur: 0.03, delay: 0.08 + i * 0.07, vol: 0.12, q: 3 })); },
  collapse() { noise({ f: 300, f1: 80, dur: 0.6, vol: 0.35, ft: 'lowpass' }); tone({ type: 'sine', f0: 90, f1: 40, dur: 0.5, vol: 0.3 }); },
  turn() { [0, 7, 12].forEach((s, i) => tone({ type: 'triangle', f0: NOTE(72 + s), dur: 0.22, delay: i * 0.08, vol: 0.1 })); },
  oppTurn() { [12, 7, 0].forEach((s, i) => tone({ type: 'triangle', f0: NOTE(64 + s), dur: 0.2, delay: i * 0.07, vol: 0.07 })); },
  fight() { noise({ f: 200, f1: 1800, dur: 0.3, vol: 0.2, q: 0.7 }); tone({ type: 'sawtooth', f0: 110, f1: 220, dur: 0.3, vol: 0.12, lp: 1200 }); },
  steal() { tone({ type: 'sine', f0: 400, f1: 1200, dur: 0.3, vol: 0.12 }); tone({ type: 'sine', f0: 1200, f1: 300, dur: 0.35, delay: 0.25, vol: 0.12 }); },
  trap() { tone({ type: 'square', f0: 220, dur: 0.08, vol: 0.12, lp: 1500 }); tone({ type: 'square', f0: 330, dur: 0.12, delay: 0.08, vol: 0.12, lp: 1500 }); noise({ f: 900, dur: 0.2, vol: 0.2 }); },
  eat() { [0, 1, 2].forEach(i => noise({ f: 600, dur: 0.06, delay: i * 0.11, vol: 0.22, ft: 'lowpass' })); tone({ type: 'square', f0: 260, f1: 180, dur: 0.12, delay: 0.3, vol: 0.08, lp: 1200 }); },
  volcano() { noise({ f: 120, f1: 60, dur: 1.2, vol: 0.5, ft: 'lowpass' }); tone({ type: 'sawtooth', f0: 70, f1: 40, dur: 1.0, vol: 0.2, lp: 400 }); },
  coin() { tone({ type: 'square', f0: 988, dur: 0.07, vol: 0.07, lp: 4000 }); tone({ type: 'square', f0: 1319, dur: 0.18, delay: 0.07, vol: 0.07, lp: 4000 }); },
  pack() { [0, 4, 7, 11, 14].forEach((s, i) => tone({ type: 'triangle', f0: NOTE(72 + s), dur: 0.3, delay: i * 0.06, vol: 0.08 })); },
  emote() { tone({ type: 'sine', f0: 600, f1: 900, dur: 0.1, vol: 0.12 }); },
  win() { [[60, 0], [64, 0.12], [67, 0.24], [72, 0.36], [76, 0.52]].forEach(([n, d]) => { tone({ type: 'square', f0: NOTE(n), dur: 0.22, delay: d, vol: 0.08, lp: 3000 }); tone({ type: 'triangle', f0: NOTE(n - 12), dur: 0.3, delay: d, vol: 0.08 }); }); tone({ type: 'triangle', f0: NOTE(72), dur: 0.9, delay: 0.7, vol: 0.12 }); tone({ type: 'triangle', f0: NOTE(76), dur: 0.9, delay: 0.7, vol: 0.1 }); tone({ type: 'triangle', f0: NOTE(79), dur: 0.9, delay: 0.7, vol: 0.1 }); },
  lose() { tone({ type: 'triangle', f0: NOTE(55), f1: NOTE(53), dur: 0.45, vol: 0.14 }); tone({ type: 'triangle', f0: NOTE(52), f1: NOTE(48), dur: 0.9, delay: 0.45, vol: 0.14 }); }
};
function play(name, arg) { if (!ctx || vol.sfx <= 0) return; try { S[name] && S[name](arg); } catch (e) { /* ignore */ } }

// ---- music: cozy game-night loop (I-vi-IV-V in C, 96 bpm, soft pad + pluck + bass + hats)
const PROG = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];
const MEL = [0, 2, 1, 2, 0, 2, 1, 2];
function startMusic() {
  if (!ctx || musicOn || vol.music <= 0) return;
  musicOn = true; nextNote = ctx.currentTime + 0.1; step = 0;
  musTimer = setInterval(schedule, 90);
}
function stopMusic() { musicOn = false; if (musTimer) clearInterval(musTimer); musTimer = null; }
function schedule() {
  if (!ctx || !musicOn) return;
  const spb = 60 / 96 / 2;
  while (nextNote < ctx.currentTime + 0.35) {
    const bar = Math.floor(step / 8) % 4, beat = step % 8, ch = PROG[bar];
    if (beat === 0) {
      ch.forEach(n => { tone({ music: 1, when: nextNote, type: 'triangle', f0: NOTE(n + 12), dur: spb * 8, attack: 0.25, vol: 0.05 }); tone({ music: 1, when: nextNote, type: 'sine', f0: NOTE(n + 12), detune: 7, dur: spb * 8, attack: 0.3, vol: 0.035 }); });
      tone({ music: 1, when: nextNote, type: 'sine', f0: NOTE(ch[0] - 12), dur: spb * 3, vol: 0.12 });
    }
    if (beat === 4) tone({ music: 1, when: nextNote, type: 'sine', f0: NOTE(ch[0] - 12), dur: spb * 3, vol: 0.09 });
    if (Math.floor(step / 32) % 2 === 1 || beat % 2 === 0) {
      const n = ch[MEL[beat]] + 24 + (beat === 6 && bar === 3 ? 2 : 0);
      tone({ music: 1, when: nextNote, type: 'square', f0: NOTE(n), dur: spb * 0.9, vol: 0.022, lp: 1800 });
    }
    if (beat % 2 === 1) noise({ music: 1, when: nextNote, f: 7000, dur: 0.04, vol: 0.025, q: 2 });
    nextNote += spb; step++;
  }
}
let gesture = false;
['pointerdown', 'keydown', 'touchstart'].forEach(t => window.addEventListener(t, () => { gesture = true; }, { once: true, capture: true }));
function vibrate(ms) {
  // only after a real user gesture (browsers log an intervention otherwise)
  const active = navigator.userActivation ? navigator.userActivation.hasBeenActive : gesture;
  if (!active || !gesture) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ }
}

return { unlock, setVolume, suspend, play, vibrate, startMusic, stopMusic, get ready() { return !!ctx; } };
})();
/* END AUDIO */
