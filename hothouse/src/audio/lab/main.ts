import { effect } from '@preact/signals-core';
import type { EngineVoice, LoopHandle, LoopSound, ScoreMood, Sfx, StationId, SurfaceKind, UiSound } from '../api';
import { AudioEngine } from '../engine/AudioEngine';
import { DJ_VOICE } from '../music/spots';
import type { StingerKind } from '../music/stingers';
import { LOOP_IDS } from '../synth/loops';
import { SFX_IDS } from '../synth/sfx';
import { UI_SOUNDS } from '../synth/ui';
import { ENGINE_PROFILES, runReport, type Report } from './offline';

/**
 * Audio lab (dev-only page, `audio-lab.html`): audition every sound, loop, engine, station, mood
 * and ambience, and run the offline QA report. Plain DOM so it has no dependency on the game UI.
 */

const audio = new AudioEngine({ seed: 1 });
const root = document.getElementById('lab')!;

const css = document.createElement('style');
css.textContent = `
  body{margin:0;background:#0B0720;color:#FFF4E3;font:500 14px/1.4 system-ui,sans-serif}
  #lab{max-width:1200px;margin:0 auto;padding:24px}
  h1{font:italic 900 40px/1 Georgia,serif;margin:0 0 4px}
  h2{font-size:15px;color:#17E0C8;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.06em}
  .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  button{background:#2B1D66;color:#FFF4E3;border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:7px 11px;font:inherit;cursor:pointer;min-height:36px}
  button:hover{background:#3A2A7A} button.on{background:#B8F54A;color:#140B33}
  label{display:inline-flex;gap:6px;align-items:center;margin-right:12px}
  input[type=range]{accent-color:#B8F54A;width:140px}
  select,input[type=text]{background:#140B33;color:#FFF4E3;border:1px solid rgba(255,255,255,.16);border-radius:8px;padding:6px}
  .np{margin:8px 0;padding:10px 14px;border-radius:12px;background:#1F1450;min-height:20px}
  pre{background:#140B33;border-radius:12px;padding:12px;max-height:420px;overflow:auto;font-size:12px}
  .ok{color:#B8F54A}.bad{color:#FF4D6A}
`;
document.head.appendChild(css);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: Array<Node | string>): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) e.append(k);
  return e;
}

function section(title: string): HTMLDivElement {
  root.append(el('h2', { textContent: title }));
  const row = el('div', { className: 'row' });
  root.append(row);
  return row;
}

function slider(parent: HTMLElement, label: string, min: number, max: number, value: number, step: number, on: (v: number) => void): HTMLInputElement {
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  input.addEventListener('input', () => on(Number(input.value)));
  parent.append(el('label', {}, label, input));
  return input;
}

function button(parent: HTMLElement, label: string, on: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = el('button', { textContent: label });
  b.addEventListener('click', () => {
    void audio.unlock();
    on(b);
  });
  parent.append(b);
  return b;
}

root.append(el('h1', { textContent: 'Audio lab' }), el('div', { textContent: 'Click anything to unlock audio. Every sound here is synthesized.' }));

const ui = section('Interface');
for (const id of UI_SOUNDS) button(ui, id, () => audio.ui(id as UiSound));

const sfx = section('Effects');
for (const id of SFX_IDS) button(sfx, id, () => audio.sfx(id as Sfx, { intensity: 0.6 }));
const steps = section('Footsteps');
for (const s of ['asphalt', 'concrete', 'tile', 'sand', 'grass', 'gravel', 'wood', 'metal', 'water'] as SurfaceKind[]) {
  button(steps, s, () => {
    for (let i = 0; i < 4; i++) setTimeout(() => audio.sfx('footstep', { surface: s, intensity: 0.5 }), i * 330);
  });
}

const loops = section('Loops (toggle; sliders set level and parameter)');
const loopHandles = new Map<LoopSound, LoopHandle>();
let loopLevel = 0.8;
let loopParam = 0.5;
for (const id of LOOP_IDS) {
  button(loops, id, (b) => {
    const h = loopHandles.get(id as LoopSound);
    if (h) {
      h.stop(0.4);
      loopHandles.delete(id as LoopSound);
      b.classList.remove('on');
    } else {
      const nh = audio.loop(id as LoopSound);
      nh.set(loopLevel, loopParam);
      loopHandles.set(id as LoopSound, nh);
      b.classList.add('on');
    }
  });
}
const loopCtl = section('');
slider(loopCtl, 'level', 0, 1, loopLevel, 0.01, (v) => {
  loopLevel = v;
  loopHandles.forEach((h) => h.set(loopLevel, loopParam));
});
slider(loopCtl, 'param', 0, 1, loopParam, 0.01, (v) => {
  loopParam = v;
  loopHandles.forEach((h) => h.set(loopLevel, loopParam));
});

const eng = section('Engine');
const profileSel = el('select');
for (const k of Object.keys(ENGINE_PROFILES)) profileSel.append(el('option', { value: k, textContent: k }));
eng.append(profileSel);
let voice: EngineVoice | null = null;
const frame = { rpm: 900, throttle: 0, load: 0, speed: 0, slip: 0, surface: 'asphalt' as SurfaceKind, interior: false, x: 0, y: 0, z: -4 };
button(eng, 'start / stop', (b) => {
  if (voice) {
    voice.dispose();
    voice = null;
    b.classList.remove('on');
    return;
  }
  voice = audio.engine(ENGINE_PROFILES[profileSel.value]!);
  voice.setPriority(true);
  b.classList.add('on');
});
slider(eng, 'rpm', 600, 9000, frame.rpm, 10, (v) => (frame.rpm = v));
slider(eng, 'throttle', 0, 1, 0, 0.01, (v) => {
  frame.throttle = v;
  frame.load = v;
});
slider(eng, 'slip', 0, 1, 0, 0.01, (v) => (frame.slip = v));
slider(eng, 'speed', 0, 60, 0, 0.5, (v) => (frame.speed = v));
const interior = el('input', { type: 'checkbox' });
interior.addEventListener('change', () => (frame.interior = interior.checked));
eng.append(el('label', {}, 'interior', interior));

const blips = section('Dialogue blips');
for (const [name, v] of Object.entries(DJ_VOICE)) {
  button(blips, `DJ ${name}`, () => {
    for (let i = 0; i < 12; i++) setTimeout(() => audio.blip(v, i % 5 === 0 ? 0.8 : 0.2), i * 95 + (i % 4 === 3 ? 160 : 0));
  });
}

const radio = section('Radio');
for (const s of audio.radio.stations) button(radio, `${s.name} ${s.frequency}`, () => audio.radio.setStation(s.id as StationId));
button(radio, 'off', () => audio.radio.setStation(null));
button(radio, '◀ prev', () => audio.radio.prev());
button(radio, 'next ▶', () => audio.radio.next());
slider(radio, 'audible', 0, 1, 0, 0.01, (v) => audio.radio.setAudible(v, frame.interior || true));
const news = el('input', { type: 'text', placeholder: 'Headline for a news flash', value: 'Local nursery’s mysterious boom baffles economists' });
radio.append(news);
button(radio, 'push news', () => audio.radio.pushNews(news.value));
const np = el('div', { className: 'np' });
root.append(np);
effect(() => {
  const n = audio.radio.nowPlaying.value;
  np.textContent = n ? `${n.isAd ? '📻' : '♪'} ${n.title} — ${n.artist}${n.caption ? ` · ${n.caption}` : ''}` : 'Radio silent (set audible above 0)';
});

const score = section('Score');
for (const m of ['menu', 'explore', 'calm', 'tension', 'chase', 'raid', 'setpiece', 'silent'] as ScoreMood[]) button(score, m, () => audio.score.setMood(m));
slider(score, 'intensity', 0, 1, 0.6, 0.01, (v) => audio.score.setIntensity(v));
const sting = section('Stingers');
for (const k of ['logo', 'title', 'rankUp', 'discovery', 'busted', 'escaped', 'missionPassed', 'missionFailed', 'perfect'] as StingerKind[]) {
  button(sting, k, () => audio.score.stinger(k));
}

const amb = section('Ambience');
const district = el('select');
for (const d of ['flats', 'strand', 'deco', 'crown', 'harbor', 'sawgrass', 'isla', 'keys']) district.append(el('option', { value: d, textContent: d }));
amb.append(district);
const ambState = { district: 'flats', hours: 18.6, rain: 0, storm: 0, wind: 0.3, indoor: 0, water: 0.3, crowd: 0, traffic: 0.3 };
const pushAmb = () => audio.setAmbience({ ...ambState, district: district.value });
district.addEventListener('change', pushAmb);
for (const [k, max, step] of [['hours', 24, 0.1], ['rain', 1, 0.01], ['storm', 1, 0.01], ['wind', 1.5, 0.01], ['indoor', 1, 0.01], ['water', 1, 0.01], ['crowd', 1, 0.01], ['traffic', 1, 0.01]] as const) {
  slider(amb, k, 0, max, ambState[k], step, (v) => {
    ambState[k] = v;
    pushAmb();
  });
}
button(amb, 'start ambience', pushAmb);

const mix = section('Mix');
for (const bus of ['master', 'music', 'sfx', 'ambience', 'ui', 'barks'] as const) slider(mix, bus, 0, 1, 0.8, 0.01, (v) => audio.setVolume(bus, v));
slider(mix, 'time scale', 0.1, 1, 1, 0.01, (v) => audio.setTimeScale(v));

const qa = section('QA report (offline render, ~1–2 minutes)');
const out = el('pre', { textContent: 'Not run yet.' });
let last: Report | null = null;
button(qa, 'Run QA report', async () => {
  out.textContent = 'Rendering…';
  last = await runReport((label) => (out.textContent = `Rendering: ${label}…`), false);
  out.innerHTML = last.checks.map((c) => `<span class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✓' : '✗'} ${c.name}</span> — ${c.detail}`).join('\n');
});
root.append(out);

let lastT = performance.now();
const loop = () => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  voice?.update(frame);
  audio.update(dt);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

(globalThis as unknown as { __AUDIO_LAB__: unknown }).__AUDIO_LAB__ = {
  ready: true,
  runReport: (withWavs = true) => runReport(() => undefined, withWavs),
  get last() {
    return last;
  },
};
