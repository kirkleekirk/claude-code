// On-foot QA bot: movement speeds, jump, curbs, walls, the camera's wall pull-in, the "Get in"
// prompt, and getting into and out of a car. Gates follow BALANCE.md (feel targets).
// Usage: node qa/foot.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { canvasShot, hh, launchBrowser, openGame, out, startServer } from './lib.mjs';

const step = async (page, s, render = false) => hh(page, 'advance', s, render);
const foot = (page) => hh(page, 'footState');
const set = async (page, controls) => {
  for (const [k, v] of Object.entries(controls)) await hh(page, 'input', k, v);
};
const release = async (page) => set(page, { moveX: null, moveY: null, sprint: null, jump: null, crouch: null, enterVehicle: null, exitVehicle: null });
const r2 = (v) => Math.round(v * 100) / 100;

const report = {};
const fails = [];
const gate = (ok, what) => {
  if (!ok) fails.push(what);
};

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page, logs } = await openGame(browser, server.url, 'test=1&time=17.6');

  // Find a curb: probe north from the westbound lane of Halcyon Boulevard until the ground steps up.
  const X = 301.3;
  const road = await hh(page, 'groundAt', X, -4.5);
  let curbZ = null;
  for (let z = -4.5; z < 40; z += 0.1) {
    const g = await hh(page, 'groundAt', X, z);
    if (g > road + 0.08) {
      curbZ = r2(z);
      break;
    }
  }
  report.curbProbe = { road: r2(road), curbZ, top: r2(await hh(page, 'groundAt', X, (curbZ ?? 0) + 0.6)) };
  gate(curbZ !== null, 'probe: no curb found north of Halcyon Blvd');

  // Spawn on the road facing the curb (north is +z, so yaw = π).
  await hh(page, 'footSpawn', X, (curbZ ?? 10) - 4, Math.PI);
  await hh(page, 'setCameraYaw', Math.PI);
  await step(page, 1);
  let s = await foot(page);
  report.spawn = { grounded: s.grounded, y: r2(s.y), mode: s.mode };
  gate(s.grounded && s.mode === 'foot', 'spawn: not grounded on foot');

  // Walk, jog and sprint along the road (west, yaw = π/2 camera).
  await hh(page, 'footSpawn', X, (curbZ ?? 10) - 4, Math.PI / 2);
  await hh(page, 'setCameraYaw', Math.PI / 2);
  await step(page, 0.5);
  const speeds = {};
  for (const [name, controls] of [['walk', { moveY: 0.4 }], ['jog', { moveY: 1 }], ['sprint', { moveY: 1, sprint: 1 }]]) {
    await release(page);
    await set(page, controls);
    await step(page, 1.5);
    s = await foot(page);
    speeds[name] = r2(s.speed);
  }
  await release(page);
  // Time to stop from a sprint.
  let stopT = 0;
  for (let i = 0; i < 20; i++) {
    await step(page, 0.05);
    stopT += 0.05;
    s = await foot(page);
    if (s.speed < 0.2) break;
  }
  report.speeds = { ...speeds, stopFromSprint: r2(stopT) };
  gate(speeds.walk > 0.9 && speeds.walk < 2.2, `speed: walk ${speeds.walk}`);
  gate(speeds.jog > 3.6 && speeds.jog < 5, `speed: jog ${speeds.jog}`);
  gate(speeds.sprint > 6.2 && speeds.sprint < 8, `speed: sprint ${speeds.sprint}`);
  gate(stopT <= 0.35, `stop: ${r2(stopT)} s from a sprint`);

  // Jump height and air time.
  await step(page, 0.5);
  s = await foot(page);
  const y0 = s.y;
  await set(page, { jump: 1 });
  await step(page, 1 / 60);
  await set(page, { jump: null });
  let peak = y0, air = 0, landed = false;
  for (let i = 0; i < 80; i++) {
    await step(page, 1 / 60);
    s = await foot(page);
    peak = Math.max(peak, s.y);
    air += 1 / 60;
    if (i > 3 && s.grounded) {
      landed = true;
      break;
    }
  }
  report.jump = { height: r2(peak - y0), airTime: r2(air), landed };
  gate(peak - y0 > 0.5 && peak - y0 < 1.0, `jump: height ${r2(peak - y0)} m`);
  gate(landed && air < 0.85, `jump: air time ${r2(air)} s`);

  // Curb: jog north onto the sidewalk; the step must be climbed without stopping.
  await hh(page, 'footSpawn', X, (curbZ ?? 10) - 2.5, Math.PI);
  await hh(page, 'setCameraYaw', Math.PI);
  await step(page, 0.3);
  s = await foot(page);
  const yRoad = s.y;
  await set(page, { moveY: 1 });
  await step(page, 1.4);
  s = await foot(page);
  report.curb = { rise: r2(s.y - yRoad), speed: r2(s.speed), z: r2(s.z) };
  await hh(page, 'setCamera', [s.x + 3.2, s.y + 1.4, s.z - 1.5], [s.x, s.y + 0.6, s.z], 50);
  await step(page, 0.05, true);
  await canvasShot(page, out('foot', 'curb.png'));
  await hh(page, 'releaseCamera');
  gate(s.y - yRoad > 0.08 && s.speed > 3, `curb: rise ${r2(s.y - yRoad)} m at ${r2(s.speed)} m/s`);
  // Walls: find a building north of the boulevard (two roof hits in a row) and walk into it.
  // Deco Row: blocks of hotels line the north side of the boulevard.
  const WX = -400.3;
  let wallZ = null;
  for (let z = 4; z < 160; z += 0.5) {
    if ((await hh(page, 'groundAt', WX, z)) > 3 && (await hh(page, 'groundAt', WX, z + 0.5)) > 3) {
      wallZ = z;
      break;
    }
  }
  gate(wallZ !== null, 'wall: no building found north of the boulevard');
  await hh(page, 'footSpawn', WX, (wallZ ?? 20) - 3, Math.PI);
  await hh(page, 'setCameraYaw', Math.PI);
  await set(page, { moveY: 1 });
  await step(page, 1.5);
  const before = await foot(page);
  await step(page, 1);
  s = await foot(page);
  report.wall = { wallZ, stoppedAtZ: r2(before.z), jitter: r2(Math.hypot(s.x - before.x, s.z - before.z)), y: r2(s.y - before.y) };
  gate(Math.abs(before.z - ((wallZ ?? 0) - 0.3)) < 0.8, `wall: stopped at z ${r2(before.z)}, wall at ${wallZ}`);
  gate(Math.hypot(s.x - before.x, s.z - before.z) < 0.3 && Math.abs(s.y - before.y) < 0.2, 'wall: jitter or climbing against a wall');
  // Swing the camera round so the building is behind the player: the camera must pull in.
  await release(page);
  await hh(page, 'setCameraYaw', 0, 0.1);
  await step(page, 0.4);
  s = await foot(page);
  report.camera = { againstWall: r2(s.camDistance) };
  gate(s.camDistance < 2.2, `camera: did not pull in at a wall (${r2(s.camDistance)} m)`);
  await step(page, 0.05, true);
  await canvasShot(page, out('foot', 'wall-camera.png'));

  // Cars: park a Gator by the player, check the prompt, get in, drive a moment, get out.
  await hh(page, 'footSpawn', X, (curbZ ?? 10) - 4, Math.PI / 2);
  // Facing −X; the Gator parks alongside, its left (driver) door toward the player.
  await hh(page, 'parkVehicle', 'gator', X, (curbZ ?? 10) - 6.3, Math.PI / 2);
  await step(page, 1);
  s = await foot(page);
  report.prompt = s.prompt;
  gate(s.prompt?.verb === 'Get in', `prompt: expected "Get in", got ${JSON.stringify(s.prompt)}`);
  await set(page, { enterVehicle: 1 });
  await step(page, 1 / 60);
  await set(page, { enterVehicle: null });
  s = await foot(page);
  const entering = s.mode;
  await step(page, 0.8);
  s = await foot(page);
  report.enter = { during: entering, after: s.mode };
  gate(entering === 'entering' && s.mode === 'vehicle', `enter: ${entering} → ${s.mode}`);
  await set(page, { throttle: 0.5 });
  await step(page, 1.2);
  await set(page, { throttle: null, brake: 1 });
  await step(page, 1.5);
  await set(page, { brake: null });
  await hh(page, 'exitVehicle');
  await step(page, 0.8);
  s = await foot(page);
  report.exit = { mode: s.mode, grounded: s.grounded };
  gate(s.mode === 'foot' && s.grounded, `exit: ${s.mode}, grounded ${s.grounded}`);
  await step(page, 0.2, true);
  await canvasShot(page, out('foot', 'after-exit.png'));

  const st = await hh(page, 'getState');
  const problems = [...logs, ...st.problems];
  if (problems.length) fails.push(...problems.map((p) => `console: ${p.slice(0, 300)}`));
} finally {
  await browser.close();
  await server.close();
}
report.fails = fails;
mkdirSync(out('foot'), { recursive: true });
writeFileSync(out('foot', 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(fails.length ? 1 : 0);
