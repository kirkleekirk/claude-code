// Driving QA bot: measures each vehicle's handling through the harness, checks it against the feel
// targets in BALANCE.md, and saves front, rear and chase shots.
// Usage: node qa/drive.mjs [vehicleId[,vehicleId…]|all]
import { writeFileSync } from 'node:fs';
import { canvasShot, hh, launchBrowser, openGame, out, startServer } from './lib.mjs';

const ALL = ['palmera', 'gator', 'hammerhead', 'brisa', 'marshal'];
const arg = process.argv[2] ?? 'palmera';
const ids = arg === 'all' ? ALL : arg.split(',');

// Measurements step physics without drawing; the shots draw.
const step = async (page, s, render = false) => hh(page, 'advance', s, render);
const state = (page) => hh(page, 'vehicleState');
const set = async (page, controls) => {
  for (const [k, v] of Object.entries(controls)) await hh(page, 'input', k, v);
};
const release = async (page) => set(page, { throttle: null, brake: null, steer: null, handbrake: null, boost: null });
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const deg = (rad) => Math.round((rad * 180) / Math.PI);

/** Run the full handling course for one vehicle. Returns the report and the list of failed gates. */
async function course(page, id) {
  const report = { vehicle: id };
  const fails = [];
  const gate = (ok, what) => {
    if (!ok) fails.push(what);
  };

  // Rest: settles upright on four wheels.
  await hh(page, 'spawnVehicle', id, -768, 210, 0);
  await step(page, 2);
  let s = await state(page);
  report.rest = { up: r2(s.up), contacts: s.wheels.filter((w) => w.contact).length, y: r2(s.y) };
  gate(s.up > 0.99 && report.rest.contacts === 4, 'rest: not upright on four wheels');

  // Acceleration and top speed: westbound on Halcyon Boulevard.
  await hh(page, 'spawnVehicle', id, 300, -4.5, Math.PI / 2);
  await step(page, 1.5);
  await set(page, { throttle: 1 });
  let t = 0, t60 = null, vmax = 0;
  while (t < 14) {
    await step(page, 0.25);
    t += 0.25;
    s = await state(page);
    vmax = Math.max(vmax, s.speed);
    if (t60 === null && s.speed >= 26.82) t60 = t;
    if (s.x < -700) break;
  }
  report.accel = { t60, mph: Math.round(vmax * 2.237), up: r2(s.up), distance: Math.round(300 - s.x) };
  gate(t60 !== null && t60 <= 8, `accel: 0-60 mph took ${t60 ?? '>14'} s`);
  gate(vmax > 35, `accel: top speed only ${Math.round(vmax * 2.237)} mph`);

  // Braking from whatever speed the run reached.
  const x0 = s.x;
  const v0 = s.speed;
  await set(page, { throttle: 0, brake: 1 });
  t = 0;
  while (t < 10) {
    await step(page, 0.1);
    t += 0.1;
    s = await state(page);
    if (s.speed < 0.3) break;
  }
  const bd = Math.abs(x0 - s.x);
  report.brake = { fromMph: Math.round(v0 * 2.237), distance: Math.round(bd), time: r1(t), g: r2((v0 * v0) / (2 * Math.max(bd, 1)) / 9.81) };
  gate(report.brake.g >= 0.8 && s.up > 0.95, `brake: ${report.brake.g} g`);
  await release(page);

  // Skidpad in the empty harbor district: full lock at a steady 15 m/s.
  await hh(page, 'spawnVehicle', id, 300, -900, 0);
  await step(page, 1.5);
  await set(page, { throttle: 0.7 });
  for (let i = 0; i < 12; i++) {
    await step(page, 0.25);
    s = await state(page);
    if (s.speed > 15) break;
  }
  await set(page, { throttle: 0.45, steer: 1 });
  const yaw0 = s.yaw;
  await step(page, 3);
  s = await state(page);
  const yawRate = (s.yaw - yaw0) / 3;
  report.skidpad = { speed: r1(s.speed), driftDeg: deg(s.drift), up: r2(s.up), lateralG: r2(Math.abs(s.speed * yawRate) / 9.81) };
  gate(s.up > 0.95 && Math.abs(s.drift) < 0.35, 'skidpad: rolled or spun at full lock');
  await release(page);
  await step(page, 2);

  // Handbrake turn and recovery: a long pull at full lock, then hands off.
  await hh(page, 'spawnVehicle', id, 300, -760, Math.PI / 2);
  await step(page, 1.5);
  await set(page, { throttle: 1 });
  for (let i = 0; i < 30; i++) {
    await step(page, 0.2);
    s = await state(page);
    if (s.speed > 22) break;
  }
  await set(page, { steer: 1, handbrake: 1, throttle: 0.6 });
  let peak = 0;
  for (let i = 0; i < 8; i++) {
    await step(page, 0.1);
    s = await state(page);
    peak = Math.max(peak, Math.abs(s.drift));
  }
  await set(page, { handbrake: 0, steer: 0, throttle: 0.5 });
  let recover = null;
  for (let i = 0; i < 40; i++) {
    await step(page, 0.1);
    s = await state(page);
    peak = Math.max(peak, Math.abs(s.drift));
    if (recover === null && Math.abs(s.drift) < 0.1) recover = r1((i + 1) * 0.1);
  }
  report.handbrake = { peakDeg: deg(peak), recoverS: recover, speedAfter: Math.round(s.ground), up: r2(s.up) };
  gate(deg(peak) <= 75, `handbrake: spun to ${deg(peak)} deg`);
  gate(recover !== null && recover <= 2.5, `handbrake: recovery ${recover ?? '>4'} s`);
  gate(s.ground >= 10, `handbrake: bled to ${Math.round(s.ground)} m/s`);
  await release(page);

  // Held drift: a handbrake flick, then throttle and part lock to sustain the slide.
  await hh(page, 'spawnVehicle', id, 300, -760, Math.PI / 2);
  await step(page, 1.5);
  await set(page, { throttle: 1 });
  for (let i = 0; i < 30; i++) {
    await step(page, 0.2);
    s = await state(page);
    if (s.speed > 24) break;
  }
  const entry = s.ground;
  const flow0 = s.flow;
  await set(page, { steer: 1, handbrake: 1, throttle: 0.8 });
  await step(page, 0.3);
  await set(page, { handbrake: 0, steer: 0.55, throttle: 1 });
  let sum = 0, n = 0, hpeak = 0, minSpeed = entry, maxImpact = 0;
  const trace = [];
  for (let i = 0; i < 20; i++) {
    await step(page, 0.1);
    s = await state(page);
    maxImpact = Math.max(maxImpact, s.impact);
    trace.push([r1(s.ground), r1(s.speed), deg(s.drift), s.drifting ? 1 : 0]);
    sum += Math.abs(s.drift);
    n++;
    hpeak = Math.max(hpeak, Math.abs(s.drift));
    minSpeed = Math.min(minSpeed, s.ground);
  }
  const kept = r2(minSpeed / entry);
  report.heldDrift = { entryMph: Math.round(entry * 2.237), meanDeg: deg(sum / n), peakDeg: deg(hpeak), kept, up: r2(s.up), maxImpact, flowGain: r2(s.flow - flow0) };
  // The front-drive Brisa earns Flow from near misses, air and flat-out runs rather than drifts.
  if (id !== 'brisa') gate(s.flow - flow0 > 0.08, `flow: a held drift only filled ${r2(s.flow - flow0)}`);
  if (process.env.DRIVE_TRACE) report.heldDrift.trace = trace;
  // Front-drive cars pull straight after a flick by nature; they only need to rotate visibly.
  const minMean = id === 'brisa' ? 5 : 12;
  gate(deg(sum / n) >= minMean && deg(hpeak) <= 70, `held drift: mean ${deg(sum / n)} deg, peak ${deg(hpeak)} deg`);
  gate(kept >= 0.55, `held drift: kept ${kept} of entry speed`);
  await release(page);

  // Flip while still rolling: scrapes to a stop and rights itself.
  await hh(page, 'flipVehicle');
  await step(page, 4);
  s = await state(page);
  report.flip = { up: r2(s.up) };
  gate(s.up > 0.9, 'flip: still upside down after 4 s');

  // Curbs: hop Halcyon Boulevard's raised median at 30° mid-block (no junctions, no buildings).
  await hh(page, 'spawnVehicle', id, -370, -7, 2.62);
  await step(page, 1);
  await set(page, { throttle: 0.6 });
  // Record the moment the car clears the median's far curb (z > 3), before it reaches the far side.
  let cleared = null;
  for (let i = 0; i < 16 && !cleared; i++) {
    await step(page, 0.25);
    s = await state(page);
    if (s.z > 3) cleared = { t: r1((i + 1) * 0.25), up: r2(s.up), speed: r1(s.speed) };
  }
  report.curb = cleared ?? { t: null, up: r2(s.up), speed: r1(s.speed), z: r1(s.z) };
  gate(!!cleared && cleared.up > 0.95 && cleared.speed > 3, `curb: stuck or tipped crossing the median (${JSON.stringify(report.curb)})`);
  await release(page);

  // Beauty shots on the Strand.
  await hh(page, 'spawnVehicle', id, -768, 150, 0.2);
  await step(page, 2);
  s = await state(page);
  await hh(page, 'setCamera', [s.x + 4.2, s.y + 1.1, s.z - 4.6], [s.x, s.y + 0.6, s.z], 46);
  await step(page, 0.2, true);
  await canvasShot(page, out('drive', `${id}-front.png`));
  await hh(page, 'setCamera', [s.x - 5.0, s.y + 2.2, s.z + 5.5], [s.x, s.y + 0.5, s.z], 46);
  await step(page, 0.2, true);
  await canvasShot(page, out('drive', `${id}-rear.png`));
  await hh(page, 'releaseCamera');
  await set(page, { throttle: 1 });
  await step(page, 3, true);
  await canvasShot(page, out('drive', `${id}-chase.png`));
  await release(page);
  return { report, fails };
}

const server = await startServer();
const browser = await launchBrowser();
const summary = {};
let failed = false;
try {
  const { page, logs } = await openGame(browser, server.url, 'test=1&time=17.6');
  for (const id of ids) {
    const { report, fails } = await course(page, id);
    const st = await hh(page, 'getState');
    const problems = [...logs.splice(0), ...st.problems];
    if (problems.length) fails.push(...problems.map((p) => `console: ${p.slice(0, 300)}`));
    report.fails = fails;
    if (fails.length) failed = true;
    summary[id] = report;
    writeFileSync(out('drive', `${id}-report.json`), JSON.stringify(report, null, 2));
    console.log(`${id}: ${fails.length ? `FAIL\n  - ${fails.join('\n  - ')}` : 'ok'}`);
    console.log(JSON.stringify(report));
  }
} finally {
  await browser.close();
  await server.close();
}
if (ids.length > 1) writeFileSync(out('drive', 'summary.json'), JSON.stringify(summary, null, 2));
process.exit(failed ? 1 : 0);
