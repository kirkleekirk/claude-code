// Vehicle portraits for look review: each car parked on the Strand at golden hour, from the front
// three-quarter, the rear three-quarter (high, to see the cabin) and straight down into the cockpit.
// Usage: node qa/cars.mjs [vehicleId[,vehicleId…]|all]
import { canvasShot, hh, launchBrowser, openGame, out, startServer } from './lib.mjs';

const ALL = ['palmera', 'gator', 'hammerhead', 'brisa', 'marshal'];
const arg = process.argv[2] ?? 'all';
const ids = arg === 'all' ? ALL : arg.split(',');
const server = await startServer();
const browser = await launchBrowser();
let failed = false;
try {
  const { page, logs } = await openGame(browser, server.url, 'test=1&time=17.5');
  for (const id of ids) {
    await hh(page, 'spawnVehicle', id, -768, 150, 0.35);
    await hh(page, 'advance', 2, false);
    const s = await hh(page, 'vehicleState');
    const c = Math.cos(s.yaw), n = Math.sin(s.yaw);
    // Car frame: forward = (-sin, -cos), right = (cos, -sin).
    const at = (fwd, right, up) => [s.x - n * fwd + c * right, s.y + up, s.z - c * fwd - n * right];
    const views = {
      front: { pos: at(4.6, 3.4, 1.0), look: at(0, 0, 0.55), fov: 42 },
      rear: { pos: at(-4.4, -3.2, 2.4), look: at(0, 0, 0.6), fov: 42 },
      cabin: { pos: at(-0.6, 0.5, 3.4), look: at(0.4, 0, 0.4), fov: 50 },
    };
    for (const [name, v] of Object.entries(views)) {
      await hh(page, 'setCamera', v.pos, v.look, v.fov);
      await hh(page, 'advance', 0.05, true);
      await canvasShot(page, out('cars', `${id}-${name}.png`));
    }
    await hh(page, 'releaseCamera');
  }
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
