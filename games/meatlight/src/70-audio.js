/* =========================================================================
   MEATLIGHT :: 70-audio.js
   Everything is synthesised at runtime -- no samples, no downloads.
   Characters get distinct voice-blip timbres so you can tell who is talking
   before you finish reading the name.
   ========================================================================= */

var AC = null, MASTER = null, NOISEBUF = null;
var BUS = { amb: null, machine: null, radio: null };
var HUM = null, HUMGAIN = null, TONE = null, TONEGAIN = null;
var audioReady = false;

function initAudio() {
  if (audioReady) return;
  var Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  AC = new Ctor();
  MASTER = AC.createGain(); MASTER.gain.value = 0.85; MASTER.connect(AC.destination);

  /* one second of noise, reused everywhere */
  var n = AC.sampleRate | 0;
  NOISEBUF = AC.createBuffer(1, n, AC.sampleRate);
  var d = NOISEBUF.getChannelData(0), last = 0;
  for (var i = 0; i < n; i++) {
    var w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;      // brown-ish
    d[i] = last * 3.2;
  }

  /* room tone: filtered noise loop */
  TONE = AC.createBufferSource(); TONE.buffer = NOISEBUF; TONE.loop = true;
  var tf = AC.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = 340;
  TONEGAIN = AC.createGain(); TONEGAIN.gain.value = 0.10;
  TONE.connect(tf); tf.connect(TONEGAIN); TONEGAIN.connect(MASTER); TONE.start();

  /* plant hum: two detuned saws through a low filter */
  HUMGAIN = AC.createGain(); HUMGAIN.gain.value = 0.055;
  var hf = AC.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 190; hf.Q.value = 3;
  var o1 = AC.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 49.5;
  var o2 = AC.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 50.6;
  var o3 = AC.createOscillator(); o3.type = 'sine'; o3.frequency.value = 24.7;
  o1.connect(hf); o2.connect(hf); o3.connect(hf);
  hf.connect(HUMGAIN); HUMGAIN.connect(MASTER);
  o1.start(); o2.start(); o3.start();
  HUM = { o1: o1, o2: o2, o3: o3 };
  audioReady = true;
}

function env(node, t0, a, d, peak, tail) {
  var g = node.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  g.exponentialRampToValueAtTime(0.0001, t0 + a + d + (tail || 0));
}

function noiseBurst(dur, type, freq, Q, vol, t0, sweepTo) {
  if (!audioReady) return;
  t0 = t0 || AC.currentTime;
  var s = AC.createBufferSource(); s.buffer = NOISEBUF; s.loop = true;
  s.playbackRate.value = 0.7 + Math.random() * 0.6;
  var f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q || 1;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  var g = AC.createGain();
  env(g, t0, Math.min(0.02, dur * 0.2), dur, vol);
  s.connect(f); f.connect(g); g.connect(MASTER);
  s.start(t0); s.stop(t0 + dur + 0.1);
}

function tone(freq, dur, type, vol, t0, toFreq) {
  if (!audioReady) return;
  t0 = t0 || AC.currentTime;
  var o = AC.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), t0 + dur);
  var g = AC.createGain();
  env(g, t0, Math.min(0.03, dur * 0.25), dur, vol === undefined ? 0.2 : vol);
  o.connect(g); g.connect(MASTER);
  o.start(t0); o.stop(t0 + dur + 0.1);
}

/* --------------------------------------------------------------- voices -- */
var VOICE = {
  RAY:  { f: 172, type: 'square',   v: 0.055, jit: 26 },
  DALE: { f: 118, type: 'sawtooth', v: 0.050, jit: 18 },
  SOL:  { f: 236, type: 'square',   v: 0.045, jit: 34 },
  VOSK: { f: 150, type: 'triangle', v: 0.048, jit: 10 },
  PA:   { f: 132, type: 'square',   v: 0.042, jit: 8 },
  RAD:  { f: 190, type: 'square',   v: 0.038, jit: 22 }
};
function blip(who) {
  if (!audioReady) return;
  var V = VOICE[who] || VOICE.RAY;
  var f = V.f + (Math.random() - 0.5) * V.jit;
  var t0 = AC.currentTime;
  var o = AC.createOscillator(); o.type = V.type; o.frequency.setValueAtTime(f, t0);
  o.frequency.exponentialRampToValueAtTime(f * 0.9, t0 + 0.05);
  var lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
  var g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(V.v, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
  o.connect(lp); lp.connect(g); g.connect(MASTER);
  o.start(t0); o.stop(t0 + 0.08);
}

/* ------------------------------------------------------------- one-shots -- */
var SFX = {
  camSwitch: function () { noiseBurst(0.07, 'bandpass', 2400, 4, 0.16); tone(760, 0.045, 'square', 0.05); },
  uiMove:    function () { tone(880, 0.03, 'square', 0.035); },
  uiSelect:  function () { tone(520, 0.05, 'square', 0.05); tone(780, 0.05, 'square', 0.035, AC && AC.currentTime + 0.04); },
  uiDeny:    function () { tone(150, 0.16, 'square', 0.07, null, 96); },
  doorBuzz:  function () { tone(96, 0.30, 'square', 0.055); noiseBurst(0.30, 'bandpass', 380, 6, 0.05); },
  doorOpen:  function () { noiseBurst(0.55, 'lowpass', 900, 1, 0.10, null, 260); tone(78, 0.30, 'triangle', 0.05); },
  doorShut:  function () { noiseBurst(0.16, 'lowpass', 700, 1, 0.20); tone(58, 0.24, 'square', 0.10, null, 34); },
  lockdown:  function () { tone(210, 1.5, 'square', 0.09, null, 62); noiseBurst(1.6, 'lowpass', 500, 1, 0.10); },
  rollup:    function () { noiseBurst(2.2, 'bandpass', 220, 2, 0.13); tone(44, 2.0, 'sawtooth', 0.05); },
  radioOn:   function () { noiseBurst(0.22, 'highpass', 1700, 1, 0.10); tone(1180, 0.05, 'square', 0.03); },
  radioOff:  function () { noiseBurst(0.12, 'highpass', 2000, 1, 0.07); },
  paChime:   function () { tone(660, 0.30, 'sine', 0.07); tone(880, 0.34, 'sine', 0.06, AC && AC.currentTime + 0.16); },
  step:      function () { noiseBurst(0.09, 'bandpass', 190 + Math.random() * 90, 2, 0.055); },
  stepWet:   function () { noiseBurst(0.13, 'bandpass', 620 + Math.random() * 300, 3, 0.05); },
  clank:     function () { tone(240 + Math.random() * 60, 0.10, 'square', 0.045, null, 120); noiseBurst(0.09, 'bandpass', 1900, 6, 0.045); },
  chainRun:  function () { noiseBurst(0.20, 'bandpass', 1400, 5, 0.045); },
  wet:       function () { noiseBurst(0.34, 'lowpass', 480, 1, 0.13, null, 150); },
  tear:      function () { noiseBurst(0.75, 'bandpass', 900, 1.4, 0.20, null, 220); tone(70, 0.6, 'sawtooth', 0.07, null, 40); },
  stinger:   function () { tone(880, 1.1, 'sawtooth', 0.13, null, 55); noiseBurst(1.0, 'lowpass', 2400, 1, 0.13, null, 200); },
  stingerLo: function () { tone(160, 1.6, 'sawtooth', 0.11, null, 38); },
  breath:    function () { noiseBurst(0.5, 'bandpass', 700, 1.2, 0.07, null, 380); },
  roar:      function () {
    if (!audioReady) return;
    var t0 = AC.currentTime;
    tone(120, 1.9, 'sawtooth', 0.16, t0, 42);
    tone(181, 1.7, 'square', 0.09, t0 + 0.05, 61);
    noiseBurst(1.9, 'lowpass', 1600, 1, 0.17, t0, 240);
  },
  klaxon: function () {
    if (!audioReady) return;
    var t0 = AC.currentTime;
    for (var i = 0; i < 3; i++) { tone(440, 0.34, 'square', 0.075, t0 + i * 0.62); tone(330, 0.34, 'square', 0.06, t0 + i * 0.62 + 0.30); }
  },
  heart: function () {
    if (!audioReady) return;
    var t0 = AC.currentTime;
    tone(52, 0.17, 'sine', 0.20, t0, 34);
    tone(46, 0.21, 'sine', 0.15, t0 + 0.27, 30);
  },
  fire:  function () { noiseBurst(3.0, 'lowpass', 900, 0.7, 0.22, null, 320); tone(64, 2.6, 'sawtooth', 0.09); },
  power: function () { tone(60, 0.9, 'sawtooth', 0.10, null, 220); noiseBurst(0.7, 'lowpass', 1200, 1, 0.08); },
  powerDown: function () { tone(220, 1.2, 'sawtooth', 0.10, null, 30); noiseBurst(0.9, 'lowpass', 1400, 1, 0.09, null, 180); }
};

function sfx(name) { if (SFX[name]) SFX[name](); }

/* Continuous machine noise, tied to whether Line 3 is running. */
function setMachine(level, conveyor) {
  if (!audioReady) return;
  HUMGAIN.gain.setTargetAtTime(0.03 + level * 0.075, AC.currentTime, 0.4);
  if (HUM) HUM.o3.frequency.setTargetAtTime(conveyor ? 31 : 24.7, AC.currentTime, 0.6);
}
function setTone(level) {
  if (!audioReady) return;
  TONEGAIN.gain.setTargetAtTime(level, AC.currentTime, 0.5);
}
