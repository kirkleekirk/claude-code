import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import type { PlaceableId, PropertyId, UpgradeId } from '@/content/ids';
import type { PlaceId } from '@/content/places';
import { createSim, type Sim, type SimWorldInput, type SupplyId } from '@/sim';
import { REST } from '@/sim/balance';
import { playPrologue } from './helpers';

function world(sim: Sim, place: PlaceId = 'ofelias'): SimWorldInput {
  return {
    day: sim.state.clock.day, hours: sim.state.clock.hours, weather: 'clear', district: 'flats', place,
    insideProperty: place === 'ofelias' ? 'ofelias' : null, streetHeat: 0, inVehicle: false, busy: false,
  };
}

function run(sim: Sim, seconds: number, place: PlaceId = 'ofelias'): void {
  for (let i = 0; i < seconds; i++) sim.tick(1, world(sim, place));
}

function started(seed = 7): Sim {
  const sim = createSim({ seed, difficulty: 'classic' });
  playPrologue(sim);
  return sim;
}

describe('economy guards', () => {
  it('rest is a breather, not a money printer', () => {
    const sim = started();
    const first = sim.skipTime(3 * 960);
    expect(first.seconds).toBeGreaterThan(0);
    expect(first.seconds).toBeLessThanOrEqual(REST.maxSkip);
    const again = sim.skipTime(600);
    expect(again.seconds).toBe(0);
    expect(again.interrupted).toBeTruthy();
    run(sim, REST.awake + 1);
    expect(sim.waitUntil((sim.state.clock.hours + 3) % 24).seconds).toBeGreaterThan(0);
  });

  it('Build Mode refunds never pay out more than the purchase', () => {
    const sim = started();
    sim.dev.grantCash(5000);
    const before = sim.state.money.dirty + sim.state.money.clean;
    const item: PlaceableId = 'planterBox';
    const grid = sim.content.properties.ofelias.grid;
    expect(sim.cmd.beginBuild('ofelias').ok).toBe(true);
    let placed: string | null = null;
    for (let y = 0; y < grid.h && !placed; y++) {
      for (let x = 0; x < grid.w && !placed; x++) {
        const r = sim.cmd.place('ofelias', item, x, y, 0);
        if (r.ok) placed = r.value;
      }
    }
    expect(placed).not.toBeNull();
    expect(sim.cmd.remove('ofelias', placed!).ok).toBe(true);
    expect(sim.state.money.dirty + sim.state.money.clean).toBeLessThanOrEqual(before);
    expect(sim.cmd.endBuild('ofelias').ok).toBe(true);
  });

  it('a mission delivery becomes an accepted request at the set-piece, priced for the whole party', () => {
    const sim = started();
    const p = sim.state.missions.progress;
    for (const id of ['paella', 'greenThumb'] as const) p[id].status = 'done';
    sim.dev.grantXp(2000);
    run(sim, 2);
    expect(p.skateNight.status).toBe('available');
    // Skate Night runs at night.
    sim.tick(1, { ...world(sim), hours: 21 });
    const ok = sim.cmd.missionStart('skateNight');
    expect(ok.ok).toBe(true);
    const req = sim.state.requests.find((r) => r.mission === 'skateNight')!;
    expect(req).toBeDefined();
    expect(req.status).toBe('accepted');
    expect(req.customer).toBe('kiki');
    expect(req.wants.qty).toBe(6);
    expect(req.place).toBe('skatePark');
    expect(req.offer).toBeGreaterThan(sim.content.customers.kiki.budget);
    // Failing the mission closes the request; retrying opens a fresh one.
    expect(sim.cmd.missionFail('skateNight', 'test').ok).toBe(true);
    expect(sim.state.requests.find((r) => r.id === req.id)!.status).toBe('expired');
  });
});

describe('random play keeps the books straight', () => {
  const props: PropertyId[] = ['ofelias'];
  const places: PlaceId[] = ['ofelias', 'sodAlmighty', 'mamaYolis', 'boardwalk', 'palmettoPlaza'];
  const items: SupplyId[] = ['seed:abuelasBlush', 'seed:gatorgrassGold', 'add:honey', 'add:guava', 'add:keyLime', 'add:seaSalt'];
  const upgrades: UpgradeId[] = ['dripIrrigation', 'snipSnap', 'secondBurner', 'sunLamps', 'bigBowl', 'autoRestock'];

  for (const seed of [3, 17, 29]) {
    it(`seed ${seed}: no negative or fractional money, stock or supplies after 1500 random actions`, () => {
      const sim = started(seed);
      const rng = new Rng(seed);
      sim.dev.grantCash(3000);
      let xp = sim.state.progression.xp;
      for (let i = 0; i < 1500; i++) {
        const place = rng.pick(places);
        run(sim, rng.int(1, 6), place);
        const s = sim.state;
        const stacks = Object.keys(s.bag);
        switch (rng.int(0, 11)) {
          case 0: sim.cmd.plantAll('ofelias', rng.pick(['abuelasBlush', 'gatorgrassGold'] as const)); break;
          case 1: sim.cmd.tendAll('ofelias'); break;
          case 2: for (const p of Object.values(s.plants)) if (p.growth >= 1) sim.cmd.harvest(p.id, ['good', 'perfect', 'ok']); break;
          case 3: sim.cmd.buy(place === 'mamaYolis' ? 'mamaYolis' : 'sodAlmighty', rng.pick(items), rng.int(-2, 12)); break;
          case 4: if (stacks.length) sim.cmd.mix('ofelias', rng.pick(stacks), [rng.pick(['honey', 'guava', 'keyLime', 'seaSalt'] as const)], rng.int(0, 14)); break;
          case 5: {
            const r = s.requests.find((x) => x.status === 'pending' || x.status === 'accepted');
            if (r?.message) sim.cmd.replyChip(r.message, rng.pick(['accept', 'counter', 'decline']));
            if (r) {
              const d = sim.cmd.openDeal({ request: r.id });
              const stack = d.ok ? sim.query.bestStack(d.value.id) : null;
              if (d.ok && stack) sim.cmd.offer(d.value.id, { stack, qty: rng.int(0, 5), unitPrice: rng.range(-10, 400) });
            }
            break;
          }
          case 6: sim.cmd.stow(rng.pick(props)); break;
          case 7: sim.cmd.packBag(rng.pick(props), 'smart'); break;
          case 8: sim.cmd.buyUpgrade(rng.pick(upgrades)); break;
          case 9: sim.cmd.payDebt(rng.range(-50, 900), rng.pick(['dirty', 'clean'] as const)); break;
          case 10: if (stacks.length) sim.cmd.refine('ofelias', rng.pick(stacks), rng.int(0, 4)); break;
          default: sim.skipTime(rng.int(-30, 900));
        }
        const m = s.money;
        expect(Number.isFinite(m.dirty) && m.dirty >= 0 && Number.isInteger(m.dirty)).toBe(true);
        expect(Number.isFinite(m.clean) && m.clean >= 0 && Number.isInteger(m.clean)).toBe(true);
        for (const store of [s.bag, ...Object.values(s.properties).map((p) => p.stash)]) {
          for (const k in store) expect(Number.isInteger(store[k]) && store[k]! > 0).toBe(true);
        }
        for (const k in s.supplies) expect((s.supplies[k as SupplyId] ?? 0) >= 0).toBe(true);
        expect(s.progression.xp).toBeGreaterThanOrEqual(xp);
        xp = s.progression.xp;
      }
    });
  }
});
