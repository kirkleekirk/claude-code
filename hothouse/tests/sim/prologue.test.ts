import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/events';
import { createSim, loadSim } from '@/sim';
import { playPrologue, run } from './helpers';

describe('the first ten minutes', () => {
  it('plays through the scripted prologue to Vale’s text', () => {
    const bus = new EventBus();
    const beats: string[] = [];
    bus.on('sim:beat', (e) => beats.push(e.beat));
    const sim = createSim({ seed: 42, difficulty: 'classic', bus });
    expect(sim.query.prologue().clockPinned).toBe(true);
    playPrologue(sim);
    for (const b of ['firstHarvest', 'kikiText', 'kikiAccepted', 'kikiDelivered', 'gardenStore', 'firstPlant', 'firstTend', 'firstMix', 'brandNamed', 'duskFalls', 'secondDelivered', 'rank2', 'valeText', 'prologueDone']) {
      expect(beats, b).toContain(b);
    }
    expect(sim.state.progression.rank).toBeGreaterThanOrEqual(2);
    expect(sim.query.prologue().done).toBe(true);
    expect(sim.query.prologue().clockPinned).toBe(false);
    expect(sim.state.missions.progress.paella.status).toBe('available');
    expect(sim.state.customers.gus.unlocked).toBe(true);
    expect(sim.state.notebook.length).toBeGreaterThanOrEqual(2);
    const mixed = Object.values(sim.state.products).find((p) => p.effects.includes('mellowTide') && p.effects.includes('sunkissed'));
    expect(mixed).toBeDefined();
    expect(sim.state.money.dirty).toBeGreaterThanOrEqual(0);
  });

  it('round-trips through serialize and stays deterministic', () => {
    const a = createSim({ seed: 7, difficulty: 'classic' });
    playPrologue(a);
    const saved = a.serialize();
    const b = loadSim(JSON.parse(JSON.stringify(saved)));
    expect(b.serialize()).toEqual(saved);
    run(a, 120);
    run(b, 120);
    expect(b.serialize()).toEqual(a.serialize());
  });

  it('is deterministic for the same seed and inputs', () => {
    const a = createSim({ seed: 99, difficulty: 'sweaty' });
    const b = createSim({ seed: 99, difficulty: 'sweaty' });
    playPrologue(a);
    playPrologue(b);
    run(a, 300);
    run(b, 300);
    expect(a.serialize()).toEqual(b.serialize());
  });
});
