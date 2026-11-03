// Prints every class's bonus and drawback points and fails if any class is out of balance.
//   npm run check:classes
import { CLASSES, classBudget } from '../src/data/classes.js';

let bad = 0;
for (const c of CLASSES) {
  const b = classBudget(c);
  const off = b.buff ? (b.buff - b.nerf) / b.buff : 0;
  const ok = Math.abs(off) <= 0.06;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${c.name.padEnd(10)} bonus ${b.buff.toFixed(1).padStart(5)}  drawback ${b.nerf.toFixed(1).padStart(5)}  ${off >= 0 ? '+' : ''}${(off * 100).toFixed(1)}%`);
}
if (bad) { console.error(`${bad} class(es) are more than 6% out of balance`); process.exit(1); }
