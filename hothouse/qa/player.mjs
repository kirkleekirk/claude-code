// Player look review: on foot in the shoulder camera, walking, getting into the Gator, seated
// in the convertible and the pickup, from outside and in the chase camera.
// Usage: node qa/player.mjs
import { canvasShot, hh, launchBrowser, openGame, out, startServer } from './lib.mjs';

const server = await startServer();
const browser = await launchBrowser();
let failed = false;
try {
  const { page, logs } = await openGame(browser, server.url, 'test=1&time=18.3');
  const shot = async (name) => {
    await hh(page, 'advance', 0.05, true);
    await canvasShot(page, out('player', `${name}.png`));
  };
  // On foot on the Strand promenade.
  await hh(page, 'footSpawn', -790, 140, Math.PI);
  await hh(page, 'setCameraYaw', Math.PI - 0.5, 0.1);
  await hh(page, 'advance', 1.2, false);
  await shot('foot-idle');
  await hh(page, 'input', 'moveY', 1);
  await hh(page, 'advance', 1.2, false);
  await shot('foot-jog');
  await hh(page, 'input', 'sprint', 1);
  await hh(page, 'advance', 1.0, false);
  await shot('foot-sprint');
  await hh(page, 'input', 'moveY', null);
  await hh(page, 'input', 'sprint', null);
  await hh(page, 'advance', 0.8, false);
  const s = await hh(page, 'footState');
  // A close portrait from the front.
  const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
  await hh(page, 'setCamera', [s.x + fx * 2.4, s.y + 1.6, s.z + fz * 2.4], [s.x, s.y + 1.2, s.z], 40);
  await shot('foot-portrait');
  await hh(page, 'releaseCamera');
  // Getting into a Gator parked in Bayshore Drive's curb lane, the player standing beside it.
  await hh(page, 'footSpawn', -783.2, 150, -Math.PI / 2);
  await hh(page, 'setCameraYaw', -Math.PI / 2 + 0.6, 0.12);
  await hh(page, 'parkVehicle', 'gator', -780.6, 151, 0);
  await hh(page, 'advance', 1, false);
  const pr = await hh(page, 'footState');
  if (pr.prompt?.verb !== 'Get in') console.log('no Get in prompt', JSON.stringify(pr));
  await hh(page, 'input', 'enterVehicle', 1);
  await hh(page, 'advance', 1 / 60, false);
  await hh(page, 'input', 'enterVehicle', null);
  await hh(page, 'advance', 0.35, false);
  await shot('enter-gator');
  await hh(page, 'advance', 1.2, false);
  const v = await hh(page, 'vehicleState');
  await hh(page, 'setCamera', [v.x + 3.4 * Math.cos(v.yaw) - 2.2 * Math.sin(v.yaw), v.y + 1.8, v.z - 3.4 * Math.sin(v.yaw) - 2.2 * Math.cos(v.yaw)], [v.x, v.y + 1.1, v.z], 42);
  await shot('gator-driver-outside');
  await hh(page, 'releaseCamera');
  // The convertible from outside and in the chase camera.
  await hh(page, 'spawnVehicle', 'palmera', -768, 150, 0.35);
  await hh(page, 'advance', 1.5, false);
  const p = await hh(page, 'vehicleState');
  await hh(page, 'setCamera', [p.x + 3.0 * Math.cos(p.yaw) - 3.0 * Math.sin(p.yaw), p.y + 1.6, p.z - 3.0 * Math.sin(p.yaw) - 3.0 * Math.cos(p.yaw)], [p.x, p.y + 0.9, p.z], 40);
  await shot('palmera-driver');
  await hh(page, 'releaseCamera');
  await hh(page, 'input', 'throttle', 1);
  await hh(page, 'input', 'steer', -0.4);
  await hh(page, 'advance', 2, false);
  await shot('palmera-chase');
  const st = await hh(page, 'getState');
  const problems = [...logs, ...st.problems];
  if (problems.length) {
    failed = true;
    console.log(problems.join('\n'));
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(failed ? 'FAIL' : 'ok');
process.exit(failed ? 1 : 0);
