import { expect } from 'vitest';
import type { PlaceId } from '@/content/places';
import type { Sim, SimWorldInput } from '@/sim';

/** Shared test helpers: a world input, ticking, and the scripted first ten minutes. */

export function world(sim: Sim, patch: Partial<SimWorldInput> = {}): SimWorldInput {
  return {
    day: sim.state.clock.day, hours: sim.state.clock.hours, weather: 'clear', district: 'flats', place: 'ofelias',
    insideProperty: 'ofelias', streetHeat: 0, inVehicle: false, busy: false, ...patch,
  };
}

export function run(sim: Sim, seconds: number, patch: Partial<SimWorldInput> = {}): void {
  for (let i = 0; i < seconds * 2; i++) sim.tick(0.5, world(sim, patch));
}

export function at(place: PlaceId): Partial<SimWorldInput> {
  return { place, insideProperty: place === 'ofelias' ? 'ofelias' : null };
}

/** Plays the first ten minutes like a player following the objective banner. */
export function playPrologue(sim: Sim): void {
  run(sim, 4);
  const ripe = Object.values(sim.state.plants).find((p) => p.growth >= 1)!;
  expect(sim.cmd.harvest(ripe.id, ['perfect', 'perfect', 'good']).ok).toBe(true);
  run(sim, 10);
  const kiki = sim.state.requests.find((r) => r.customer === 'kiki')!;
  expect(kiki).toBeDefined();
  expect(sim.cmd.replyChip(kiki.message!, 'accept').ok).toBe(true);
  run(sim, 30, at('boardwalk'));
  const deal = sim.cmd.openDeal({ request: kiki.id });
  expect(deal.ok).toBe(true);
  if (!deal.ok) return;
  const stack = sim.query.bestStack(deal.value.id)!;
  const band = sim.query.haggle(deal.value.id, stack, 2)!;
  expect(sim.cmd.offer(deal.value.id, { stack, qty: 2, unitPrice: band.safe }).ok).toBe(true);
  run(sim, 20, at('sodAlmighty'));
  expect(sim.cmd.buy('sodAlmighty', 'seed:abuelasBlush', 2).ok).toBe(true);
  expect(sim.cmd.buy('sodAlmighty', 'add:honey', 4).ok).toBe(true);
  run(sim, 30, at('ofelias'));
  const prop = sim.state.properties.ofelias;
  const pots = prop.layout.filter((p) => p.item === 'planterBox').flatMap((p) => [`${p.id}:0`, `${p.id}:1`]);
  const free = pots.filter((pot) => !Object.values(sim.state.plants).some((pl) => pl.pot === pot));
  expect(sim.cmd.plant('ofelias', free[0]!, 'abuelasBlush').ok).toBe(true);
  expect(sim.cmd.tendAll('ofelias').ok).toBe(true);
  const raw = Object.keys(sim.state.bag).find((k) => k.startsWith('b.abuelasBlush.sunkissed*'))!;
  expect(raw).toBeDefined();
  const mixed = sim.cmd.mix('ofelias', raw, ['honey'], Math.min(2, sim.state.bag[raw]!));
  expect(mixed.ok).toBe(true);
  expect(sim.cmd.createBrand('Abuela Gold', { shape: 0, icon: 1, palette: 0, type: 0 }, 1).ok).toBe(true);
  run(sim, 15);
  const marisol = sim.state.requests.find((r) => r.customer === 'marisol')!;
  expect(marisol).toBeDefined();
  expect(sim.cmd.replyChip(marisol.message!, 'accept').ok).toBe(true);
  // Harvest whatever ripened while away so there is enough to sell.
  for (const p of Object.values(sim.state.plants)) if (p.growth >= 1) sim.cmd.harvest(p.id, ['good', 'good', 'good']);
  run(sim, 20, at('palmettoPlaza'));
  const d2 = sim.cmd.openDeal({ request: marisol.id });
  expect(d2.ok).toBe(true);
  if (!d2.ok) return;
  const s2 = sim.query.bestStack(d2.value.id)!;
  const qty = Math.min(3, sim.state.bag[s2] ?? 0);
  expect(sim.cmd.autoPrice(d2.value.id, s2, qty).ok).toBe(true);
  if (sim.query.upgrades().find((u) => u.id === 'dripIrrigation')?.affordable) expect(sim.cmd.buyUpgrade('dripIrrigation').ok).toBe(true);
  run(sim, 60);
}
