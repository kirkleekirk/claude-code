import { describe, expect, it, vi } from 'vitest';
import { createAudio } from '@/audio';
import type { EngineFrame } from '@/audio/api';
import { VoiceManager } from '@/audio/engine/voices';
import { log } from '@/core/log';

const FRAME: EngineFrame = { rpm: 3000, throttle: 0.5, load: 0.5, speed: 20, slip: 0, surface: 'asphalt', interior: false, x: 0, y: 0, z: 0 };

describe('AudioEngine without an audio context', () => {
  it('muted: every call is a safe no-op and the radio card still follows its timeline', async () => {
    const audio = createAudio({ muted: true });
    await audio.unlock();
    expect(audio.unlocked.value).toBe(false);
    expect(audio.stats().state).toBe('muted');
    audio.ui('confirm');
    audio.sfx('gunPistol', { x: 1, y: 2, z: 3, intensity: 1 });
    audio.blip({ pitch: 150, brightness: 0.5, expressiveness: 0.5 }, 1);
    const loop = audio.loop('siren', { x: 0, z: 0 });
    loop.set(1, 0.7);
    loop.setPosition(5, 0, 5);
    const engine = audio.engine({ cylinders: 8, idleRpm: 800, redlineRpm: 6400, rasp: 0.5, bass: 0.9, turbo: 0, pops: 0.5 });
    engine.setPriority(true);
    engine.update(FRAME);
    audio.score.setMood('menu');
    audio.score.setIntensity(0.8);
    audio.score.stinger('rankUp');
    audio.radio.setStation('haze');
    audio.radio.setAudible(1, true);
    audio.update(0.016);
    const np = audio.radio.nowPlaying.value;
    expect(np).not.toBeNull();
    expect(np!.station).toBe('haze');
    expect(np!.title.length).toBeGreaterThan(0);
    expect(audio.stats().loops).toBe(1);
    expect(audio.stats().engines).toBe(1);
    loop.stop(0.2);
    engine.dispose();
    expect(audio.stats().loops).toBe(0);
    expect(audio.stats().engines).toBe(0);
    audio.radio.setAudible(0, true);
    audio.update(0.016);
    expect(audio.radio.nowPlaying.value).toBeNull();
    audio.dispose();
  });

  it('reports Web Audio as unavailable in environments without it, without throwing', async () => {
    const audio = createAudio();
    await expect(audio.unlock()).resolves.toBeUndefined();
    expect(audio.stats().state).toBe('unavailable');
    expect(audio.unlocked.value).toBe(false);
    audio.update(0.016);
    audio.suspend();
    audio.resume();
    audio.dispose();
  });

  it('shrugs off non-finite and out-of-range input', () => {
    const audio = createAudio({ muted: true });
    expect(() => {
      audio.setListener(NaN, Infinity, -Infinity, NaN, NaN, NaN);
      audio.setVolume('music', NaN);
      audio.setVolume('master', 7);
      audio.duck('sfx', NaN, Infinity);
      audio.setTimeScale(NaN);
      audio.setAmbience({ district: 'nowhere', hours: NaN, rain: Infinity, storm: -1, wind: NaN, indoor: 2, water: NaN, crowd: -5, traffic: 9 });
      const l = audio.loop('rain');
      l.set(NaN, Infinity);
      l.setPosition(NaN, NaN, NaN);
      l.stop(NaN);
      const e = audio.engine({ cylinders: 4, idleRpm: NaN, redlineRpm: -1, rasp: NaN, bass: 2, turbo: -1, pops: NaN });
      e.update({ ...FRAME, rpm: NaN, throttle: Infinity, speed: -Infinity });
      e.dispose();
      audio.radio.setAudible(NaN, false);
      audio.score.setIntensity(NaN);
      audio.update(NaN);
    }).not.toThrow();
    audio.dispose();
  });

  it('is inert after dispose', () => {
    const audio = createAudio({ muted: true });
    audio.dispose();
    const l = audio.loop('wind');
    l.set(1);
    const e = audio.engine({ cylinders: 4, idleRpm: 900, redlineRpm: 7000, rasp: 0.5, bass: 0.5, turbo: 0, pops: 0 });
    e.update(FRAME);
    expect(audio.stats().loops).toBe(0);
    expect(audio.stats().engines).toBe(0);
    expect(() => audio.update(0.016)).not.toThrow();
  });

  it('logs no problems on the happy paths', () => {
    log.clear();
    const audio = createAudio({ muted: true });
    audio.update(0.016);
    audio.dispose();
    expect(log.problems()).toEqual([]);
  });
});

describe('VoiceManager', () => {
  it('debounces identical triggers within a frame', () => {
    const vm = new VoiceManager(8, 0.012);
    expect(vm.admit('snip', 1.0, 4)).toBe(true);
    expect(vm.admit('snip', 1.005, 4)).toBe(false);
    expect(vm.admit('snip', 1.02, 4)).toBe(true);
  });

  it('steals the oldest voice of a sound past its limit, and the oldest overall past the global limit', () => {
    const vm = new VoiceManager(2, 0);
    const stops: string[] = [];
    const add = (id: string, start: number) => {
      vm.admit(id, start, 2);
      vm.add({ id, start, end: start + 10, stop: () => stops.push(`${id}@${start}`) });
    };
    add('gun', 0);
    add('gun', 1);
    add('gun', 2);
    // Per-sound limit of 2: the oldest gun makes room.
    expect(stops).toEqual(['gun@0']);
    add('step', 3);
    // Global limit of 2: the oldest voice overall makes room.
    expect(stops).toEqual(['gun@0', 'gun@1']);
    expect(vm.active).toBe(2);
    vm.prune(100);
    expect(vm.active).toBe(0);
    const spy = vi.fn();
    vm.add({ id: 'x', start: 0, end: 200, stop: spy });
    vm.stopAll(1);
    expect(spy).toHaveBeenCalledOnce();
  });
});
