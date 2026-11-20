// Live audio soak: a real AudioContext (unlocked by a click, like the game's click-to-start),
// then a minute of mixed play — radio switching, score moods, engines, loops, SFX bursts,
// ambience changes, suspend/resume — checking context state, voice counts, heap and the console.
import { launchBrowser, startServer } from './lib.mjs';

const SECONDS = Number(process.env.QA_AUDIO_SOAK ?? 60);
const server = await startServer();
const browser = await launchBrowser();
let failed = false;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto(`${server.url}audio-lab.html`);
  await page.waitForFunction(() => globalThis.__AUDIO_LAB__?.ready === true, null, { timeout: 120000 });
  await page.getByRole('button', { name: 'confirm' }).click();
  await page.waitForFunction(() => globalThis.__AUDIO_LAB__.audio.stats().state === 'running', null, { timeout: 20000 });

  const result = await page.evaluate(async (seconds) => {
    const a = globalThis.__AUDIO_LAB__.audio;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const heap = () => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0);
    const samples = [];
    const stations = ['sunset', 'calle', 'haze', 'bass', null];
    const moods = ['menu', 'explore', 'tension', 'chase', 'raid', 'setpiece', 'calm'];
    const districts = ['flats', 'strand', 'deco', 'crown', 'harbor', 'sawgrass', 'isla', 'keys'];
    const profile = { cylinders: 8, idleRpm: 800, redlineRpm: 6400, rasp: 0.55, bass: 0.9, turbo: 0.3, pops: 0.6, flavor: 'bigBlock' };
    const player = a.engine(profile);
    player.setPriority(true);
    const traffic = Array.from({ length: 8 }, () => a.engine({ ...profile, cylinders: 4, flavor: 'piston', turbo: 0 }));
    const siren = a.loop('siren', { x: 30, z: -10 });
    siren.set(0.8, 0);
    const skid = a.loop('skid');
    a.radio.setAudible(1, true);
    const nowPlaying = new Set();
    const t0 = performance.now();
    let i = 0;
    while (performance.now() - t0 < seconds * 1000) {
      const t = (performance.now() - t0) / 1000;
      const rpm = 900 + ((Math.sin(t * 0.7) + 1) / 2) * 5200;
      player.update({ rpm, throttle: Math.sin(t * 0.7) > 0 ? 1 : 0, load: 0.7, speed: rpm / 150, slip: Math.max(0, Math.sin(t * 1.3)), surface: 'asphalt', interior: false, x: 0, y: 0, z: -3 });
      traffic.forEach((v, k) => v.update({ rpm: 2000 + k * 300, throttle: 0.4, load: 0.4, speed: 12, slip: 0, surface: 'asphalt', interior: false, x: Math.sin(t + k) * 40, y: 0, z: Math.cos(t + k) * 40 }));
      siren.setPosition(Math.sin(t) * 60, 0, Math.cos(t) * 60);
      skid.set(Math.max(0, Math.sin(t * 1.3)), 0.6);
      if (i % 10 === 0) a.sfx('footstep', { surface: 'concrete', x: 1, y: 0, z: 1 });
      if (i % 37 === 0) a.sfx('gunSmg', { x: 10, y: 1, z: -15 });
      if (i % 53 === 0) a.ui('confirm');
      if (i % 61 === 0) a.blip({ pitch: 160, brightness: 0.5, expressiveness: 0.6 }, 0.3);
      if (i % 100 === 0) a.radio.setStation(stations[(i / 100) % stations.length]);
      if (i % 140 === 0) a.score.setMood(moods[(i / 140) % moods.length]);
      if (i % 70 === 0) a.score.setIntensity(((i / 70) % 5) / 4);
      if (i % 90 === 0) a.setAmbience({ district: districts[(i / 90) % districts.length], hours: (t * 2) % 24, rain: (i / 90) % 3 === 0 ? 0.8 : 0, storm: 0, wind: 0.4, indoor: 0, water: 0.5, crowd: 0.3, traffic: 0.4 });
      if (i === 300) a.radio.pushNews('Local nursery’s mysterious boom baffles economists');
      if (i === 400) {
        a.suspend();
        await sleep(300);
        a.resume();
      }
      const np = a.radio.nowPlaying.value;
      if (np) nowPlaying.add(`${np.station}: ${np.title}`);
      a.update(1 / 60);
      if (i % 120 === 0) samples.push({ t, heap: heap(), ...a.stats() });
      i++;
      await sleep(16);
    }
    siren.stop(0.2);
    skid.stop(0.2);
    player.dispose();
    traffic.forEach((v) => v.dispose());
    await sleep(600);
    a.update(1 / 60);
    const end = a.stats();
    return { samples, end, nowPlaying: [...nowPlaying], frames: i };
  }, SECONDS);

  const maxVoices = Math.max(...result.samples.map((s) => s.voices));
  const states = new Set(result.samples.map((s) => s.state));
  const heaps = result.samples.map((s) => s.heap).filter((h) => h > 0);
  const firstHalf = heaps.slice(0, Math.max(1, Math.floor(heaps.length / 2)));
  const secondHalf = heaps.slice(Math.floor(heaps.length / 2));
  const avg = (xs) => xs.reduce((p, q) => p + q, 0) / Math.max(1, xs.length);
  const growth = avg(secondHalf) - avg(firstHalf);
  const checks = [
    ['context stays running', [...states].every((s) => s === 'running'), [...states].join(', ')],
    ['voices stay bounded (≤ 56)', maxVoices <= 56, `max ${maxVoices}`],
    ['handles released at the end', result.end.loops === 0 && result.end.engines === 0, `loops ${result.end.loops}, engines ${result.end.engines}`],
    ['radio card updates', result.nowPlaying.length >= 3, `${result.nowPlaying.length} distinct items`],
    ['heap flat (< 25 MB growth between halves)', growth < 25, `${growth.toFixed(1)} MB (${heaps[0]?.toFixed(1)} → ${heaps[heaps.length - 1]?.toFixed(1)})`],
    ['no console errors or warnings', errors.length === 0, errors.slice(0, 5).join(' | ') || 'clean'],
  ];
  for (const [name, ok, detail] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  console.log(`${result.frames} frames over ${SECONDS} s; now playing seen: ${result.nowPlaying.slice(0, 6).join(' · ')}`);
  failed = checks.some(([, ok]) => !ok);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
