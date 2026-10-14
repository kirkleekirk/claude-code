import { settings } from '../settings.js';
import { renderAll } from './synth.js';
import { pick, rand } from '../util.js';

// Mixer graph:
//   sfx/voice sources -> worldBus -> worldFilter (muffle when downed) -> master -> compressor -> out
//   worldBus -> reverbSend -> convolver -> master
//   ui -> uiBus -> master ; music -> musicBus -> master
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.zombieClips = {};
    this.ready = false;
    this.voices = new Set();
    this.zombieVoiceCount = 0;
    this.loops = new Map();
    this.musicEl = null;
    this.musicSource = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 10;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.connect(this.compressor);
    this.compressor.connect(ctx.destination);

    this.worldFilter = ctx.createBiquadFilter();
    this.worldFilter.type = 'lowpass';
    this.worldFilter.frequency.value = 20000;
    this.worldFilter.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.voiceBus = ctx.createGain();
    this.sfxBus.connect(this.worldFilter);
    this.voiceBus.connect(this.worldFilter);
    this.uiBus = ctx.createGain();
    this.uiBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.connect(this.worldFilter);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.4, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.18;
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.9;
    this.sfxBus.connect(this.reverbSend);
    this.voiceBus.connect(this.reverbSend);
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.worldFilter);

    this.applyVolumes();
    settings.onChange(() => this.applyVolumes());
    this.hrtf = settings.get('quality') !== 'low';
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.get('masterVolume'), t, 0.05);
    this.sfxBus.gain.setTargetAtTime(settings.get('sfxVolume'), t, 0.05);
    this.ambienceBus.gain.setTargetAtTime(settings.get('sfxVolume') * 0.8, t, 0.05);
    this.uiBus.gain.setTargetAtTime(settings.get('sfxVolume') * 0.8, t, 0.05);
    this.voiceBus.gain.setTargetAtTime(settings.get('voiceVolume'), t, 0.05);
    this.musicBus.gain.setTargetAtTime(settings.get('musicVolume'), t, 0.05);
  }

  makeImpulse(seconds, decay) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // early slap from the treeline, then a soft diffuse tail
        const early = i > sr * 0.045 && i < sr * 0.06 ? 0.6 : 0;
        d[i] = (Math.random() * 2 - 1) * (Math.pow(1 - t, decay) * 0.8 + early * (1 - t));
      }
    }
    return buf;
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  async load(base, onProgress) {
    this.init();
    const manifest = await (await fetch(base + 'manifest.json')).json();
    const gunNames = Object.keys(manifest.guns);
    const zombieCats = Object.keys(manifest.zombies);
    const total = gunNames.length + zombieCats.length + 1;
    let done = 0;
    const tick = () => onProgress && onProgress(++done / total);

    const decode = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('audio ' + url + ' ' + res.status);
      const ab = await res.arrayBuffer();
      return await new Promise((resolve, reject) => this.ctx.decodeAudioData(ab, resolve, reject));
    };

    const synthPromise = renderAll().then((bufs) => {
      Object.assign(this.buffers, bufs);
      tick();
    });

    const gunJobs = gunNames.map(async (name) => {
      try {
        this.buffers[name] = await decode(base + 'guns/' + name + '.mp3');
      } catch (e) {
        console.warn(e);
      }
      tick();
    });
    const zombieJobs = zombieCats.map(async (cat) => {
      const info = manifest.zombies[cat];
      try {
        const sprite = await decode(base + info.file);
        this.zombieClips[cat] = info.clips.map(([start, dur]) => this.slice(sprite, start, dur)).filter(Boolean);
      } catch (e) {
        console.warn(e);
        this.zombieClips[cat] = [];
      }
      tick();
    });
    await Promise.all([...gunJobs, ...zombieJobs, synthPromise]);
    this.ready = true;
  }

  // Cut one clip out of a sprite. The encoder may have shifted the audio a few ms,
  // so re-find the onset near the nominal start.
  slice(sprite, start, dur) {
    const sr = sprite.sampleRate;
    const data = sprite.getChannelData(0);
    const s0 = Math.max(0, Math.floor((start - 0.03) * sr));
    const s1 = Math.min(data.length, Math.floor((start + dur + 0.1) * sr));
    let peak = 0;
    for (let i = s0; i < s1; i++) peak = Math.max(peak, Math.abs(data[i]));
    if (peak <= 0) return null;
    const thr = peak * 0.02;
    let onset = s0;
    while (onset < s1 && Math.abs(data[onset]) < thr) onset++;
    onset = Math.max(0, onset - Math.floor(0.006 * sr));
    const len = Math.min(data.length - onset, Math.floor((dur + 0.03) * sr));
    const buf = this.ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    for (let i = 0; i < len; i++) out[i] = data[onset + i];
    const fade = Math.min(len, Math.floor(0.02 * sr));
    for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
    return buf;
  }

  // ---------------------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------------------

  _source(buffer, { rate = 1, rateVar = 0, loop = false, offset = 0 } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate * (1 + (rateVar ? rand(-rateVar, rateVar) : 0));
    src.loop = loop;
    return src;
  }

  play(name, opts = {}) {
    if (!this.ready || !this.ctx) return null;
    const buffer = typeof name === 'string' ? this.buffers[name] : name;
    if (!buffer) return null;
    const { volume = 1, bus = 'sfx', delay = 0, pan = 0, lowpass = 0, reverb = true } = opts;
    const src = this._source(buffer, opts);
    const g = this.ctx.createGain();
    g.gain.value = volume;
    let node = src;
    if (lowpass) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      node.connect(f);
      node = f;
    }
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      node = p;
    }
    node.connect(g);
    g.connect(this._bus(bus, reverb));
    src.start(this.ctx.currentTime + delay, opts.offset || 0);
    const voice = { src, gain: g, stop: (fade = 0.05) => this._stop(voice, fade) };
    this._track(voice);
    return voice;
  }

  _bus(bus, reverb = true) {
    if (bus === 'ui') return this.uiBus;
    if (bus === 'music') return this.musicBus;
    if (bus === 'voice') return this.voiceBus;
    if (bus === 'ambience') return this.ambienceBus;
    if (!reverb) return this.worldFilter;
    return this.sfxBus;
  }

  _track(voice) {
    this.voices.add(voice);
    voice.src.onended = () => {
      this.voices.delete(voice);
      if (voice.onEnd) voice.onEnd();
      try {
        voice.gain.disconnect();
      } catch (e) {
        /* already gone */
      }
    };
  }

  _stop(voice, fade) {
    if (!voice || voice.stopped) return;
    voice.stopped = true;
    const t = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
    voice.gain.gain.linearRampToValueAtTime(0, t + fade);
    try {
      voice.src.stop(t + fade + 0.01);
    } catch (e) {
      /* not started */
    }
  }

  play3D(name, pos, opts = {}) {
    if (!this.ready || !this.ctx) return null;
    const buffer = typeof name === 'string' ? this.buffers[name] : name;
    if (!buffer) return null;
    const { volume = 1, bus = 'sfx', refDistance = 3, maxDistance = 70, rolloff = 1.15, delay = 0 } = opts;
    const src = this._source(buffer, opts);
    const panner = this.ctx.createPanner();
    panner.panningModel = this.hrtf ? 'HRTF' : 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = refDistance;
    panner.maxDistance = maxDistance;
    panner.rolloffFactor = rolloff;
    this._setPannerPos(panner, pos);
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(panner);
    panner.connect(g);
    g.connect(this._bus(bus));
    src.start(this.ctx.currentTime + delay);
    const voice = {
      src, gain: g, panner,
      stop: (fade = 0.05) => this._stop(voice, fade),
      setPosition: (p) => this._setPannerPos(panner, p),
    };
    this._track(voice);
    return voice;
  }

  _setPannerPos(panner, p) {
    if (panner.positionX) {
      const t = this.ctx.currentTime;
      panner.positionX.setTargetAtTime(p.x, t, 0.02);
      panner.positionY.setTargetAtTime(p.y, t, 0.02);
      panner.positionZ.setTargetAtTime(p.z, t, 0.02);
    } else {
      panner.setPosition(p.x, p.y, p.z);
    }
  }

  // Zombie vocals: limited polyphony so a horde reads as a horde, not a wall of noise.
  zombie(cat, pos, opts = {}) {
    const clips = this.zombieClips[cat];
    if (!clips || !clips.length) return null;
    if (this.zombieVoiceCount >= (opts.force ? 18 : 12)) return null;
    const v = this.play3D(pick(clips), pos, { bus: 'voice', rateVar: 0.06, refDistance: 3.5, maxDistance: 55, ...opts });
    if (v) {
      this.zombieVoiceCount++;
      v.onEnd = () => {
        this.zombieVoiceCount--;
      };
    }
    return v;
  }

  zombieClip(cat, index) {
    const clips = this.zombieClips[cat];
    return clips && clips.length ? clips[index % clips.length] : null;
  }

  loop(key, name, opts = {}) {
    if (this.loops.has(key)) return this.loops.get(key);
    const v = opts.pos ? this.play3D(name, opts.pos, { ...opts, loop: true }) : this.play(name, { ...opts, loop: true });
    if (v) this.loops.set(key, v);
    return v;
  }

  stopLoop(key, fade = 0.3) {
    const v = this.loops.get(key);
    if (v) {
      v.stop(fade);
      this.loops.delete(key);
    }
  }

  setLoopVolume(key, volume, tau = 0.2) {
    const v = this.loops.get(key);
    if (v && this.ctx) v.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, tau);
  }

  stopAll() {
    for (const v of [...this.voices]) v.stop(0.1);
    this.loops.clear();
    this.zombieVoiceCount = 0;
  }

  updateListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = camera.position;
    const e = camera.matrixWorld.elements;
    const fx = -e[8];
    const fy = -e[9];
    const fz = -e[10];
    const ux = e[4];
    const uy = e[5];
    const uz = e[6];
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(p.x, t, 0.01);
      l.positionY.setTargetAtTime(p.y, t, 0.01);
      l.positionZ.setTargetAtTime(p.z, t, 0.01);
      l.forwardX.setTargetAtTime(fx, t, 0.01);
      l.forwardY.setTargetAtTime(fy, t, 0.01);
      l.forwardZ.setTargetAtTime(fz, t, 0.01);
      l.upX.setTargetAtTime(ux, t, 0.01);
      l.upY.setTargetAtTime(uy, t, 0.01);
      l.upZ.setTargetAtTime(uz, t, 0.01);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  // 0 = clear, 1 = fully muffled (downed / heavy damage)
  setMuffle(amount) {
    if (!this.ctx) return;
    const f = 20000 * Math.pow(0.02, amount);
    this.worldFilter.frequency.setTargetAtTime(Math.max(300, f), this.ctx.currentTime, 0.15);
  }

  setIndoor(amount) {
    if (!this.ctx) return;
    this.reverbSend.gain.setTargetAtTime(0.16 + amount * 0.22, this.ctx.currentTime, 0.4);
  }

  // ---------------------------------------------------------------------------------------
  // Music (streamed through a media element so the 3-minute theme isn't decoded into RAM)
  // ---------------------------------------------------------------------------------------
  playMusic(url, { loop = true, volume = 1, fadeIn = 1.5 } = {}) {
    if (!this.ctx) return;
    if (!this.musicEl) {
      this.musicEl = new Audio();
      this.musicEl.crossOrigin = 'anonymous';
      this.musicEl.preload = 'auto';
      try {
        this.musicSource = this.ctx.createMediaElementSource(this.musicEl);
        this.musicGain = this.ctx.createGain();
        this.musicSource.connect(this.musicGain);
        this.musicGain.connect(this.musicBus);
      } catch (e) {
        this.musicSource = null;
      }
    }
    const el = this.musicEl;
    if (!el.src.endsWith(url)) el.src = url;
    el.loop = loop;
    const t = this.ctx.currentTime;
    if (this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setValueAtTime(0, t);
      this.musicGain.gain.linearRampToValueAtTime(volume, t + fadeIn);
    } else {
      el.volume = volume * settings.get('musicVolume');
    }
    const p = el.play();
    if (p && p.catch) p.catch(() => {});
  }

  fadeOutMusic(seconds = 1.5) {
    if (!this.musicEl || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
      this.musicGain.gain.linearRampToValueAtTime(0, t + seconds);
    }
    const el = this.musicEl;
    clearTimeout(this._musicStopTimer);
    this._musicStopTimer = setTimeout(() => el.pause(), seconds * 1000 + 50);
  }

  // Robotic "facility AI" announcer via speech synthesis, if the platform has it.
  announce(text, { rate = 0.85, pitch = 0.35, volume = 0.9 } = {}) {
    if (!settings.get('announcer')) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate;
      u.pitch = pitch;
      u.volume = volume * settings.get('masterVolume');
      const voices = synth.getVoices();
      const en = voices.find((v) => /en[-_]US/i.test(v.lang) && /male|daniel|david|alex|fred/i.test(v.name)) ||
        voices.find((v) => /^en/i.test(v.lang));
      if (en) u.voice = en;
      synth.speak(u);
    } catch (e) {
      /* speech not available */
    }
  }
}

export const audio = new AudioEngine();
