import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { HAIR_STYLES, OUTFITS, heightMetres, randomAppearance, type Appearance } from '@/content/appearance';
import { Rng } from '@/core/rng';
import { createCharacters } from '@/characters';
import { CLIPS } from '@/characters/anim/clips';
import { buildPerson } from '@/characters/geometry/build';
import { Bone } from '@/characters/rig';
import { MaterialKit } from '@/render/materials/MaterialKit';
import { SharedUniforms } from '@/render/shared';
import type { ActorEvent, ClipId } from '@/characters/api';

const kit = () => new MaterialKit(new SharedUniforms());
const person = (seed: number | string): Appearance => randomAppearance(new Rng(seed));
const DT = 1 / 60;

function worldY(actor: { root: { updateMatrixWorld(f: boolean): void } }, bone: { getWorldPosition(v: Vector3): Vector3 }): number {
  actor.root.updateMatrixWorld(true);
  return bone.getWorldPosition(new Vector3()).y;
}

describe('character geometry', () => {
  it('is deterministic for an appearance', () => {
    const a = person('det');
    const g1 = buildPerson(a), g2 = buildPerson(a);
    expect(g1.vertices).toBe(g2.vertices);
    const p1 = g1.geometry.getAttribute('position').array, p2 = g2.geometry.getAttribute('position').array;
    expect(Array.from(p1).every((v, i) => v === p2[i])).toBe(true);
    const w1 = g1.geometry.getAttribute('skinWeight').array, w2 = g2.geometry.getAttribute('skinWeight').array;
    expect(Array.from(w1).every((v, i) => v === w2[i])).toBe(true);
  });

  it('stands within 2% of the appearance height', () => {
    const f = createCharacters(kit());
    for (let i = 0; i < 24; i++) {
      const a = person(i);
      a.hair = 26; // bald: the head top is the body top
      const actor = f.create(a);
      const crown = actor.geo.crown * actor.prop.scale;
      expect(Math.abs(crown - heightMetres(a)) / heightMetres(a)).toBeLessThan(0.02);
      expect(actor.height).toBeCloseTo(heightMetres(a), 5);
      actor.dispose();
    }
  });

  it('keeps every shape inside the vertex budget', () => {
    const rng = new Rng('budget');
    let max = 0;
    for (let i = 0; i < 80; i++) {
      const a = randomAppearance(rng);
      a.hair = i % HAIR_STYLES.length;
      a.outfit = (i * 11) % OUTFITS.length;
      a.glasses = i % 6;
      a.jewelry = i % 5;
      a.bag = i % 5;
      a.phone = i % 2 === 0;
      a.facialHair = i % 5;
      max = Math.max(max, buildPerson(a).vertices);
    }
    expect(max).toBeLessThan(6500);
  });
});

describe('actors', () => {
  it('never produces NaN under random locomotion, postures and clips', () => {
    const f = createCharacters(kit());
    const rng = new Rng('chaos');
    const clips = Object.keys(CLIPS) as ClipId[];
    const actors = Array.from({ length: 6 }, (_, i) => f.create(person(`n${i}`)));
    for (let frame = 0; frame < 900; frame++) {
      for (const a of actors) {
        if (frame % 37 === 0) {
          a.loco.speed = rng.range(0, 8);
          a.loco.moveAngle = rng.range(-Math.PI, Math.PI);
          a.loco.turnRate = rng.range(-3, 3);
          a.loco.grounded = rng.chance(0.85);
          a.loco.vy = a.loco.grounded ? 0 : rng.range(-9, 5);
          a.loco.crouch = rng.chance(0.2) ? 1 : 0;
          a.steer = rng.range(-1.5, 1.5);
        }
        if (frame % 91 === 0) a.posture = (['stand', 'stand', 'drive', 'passenger', 'sit'] as const)[rng.int(0, 4)]!;
        if (frame % 53 === 0) a.play(clips[rng.int(0, clips.length - 1)]!);
        if (frame % 70 === 0) a.lookAt(rng.chance(0.5) ? new Vector3(rng.range(-5, 5), 1.6, rng.range(-5, 5)) : null);
        a.update(DT, (frame % 200) * 0.9);
        a.root.updateMatrixWorld(true);
      }
    }
    for (const a of actors) {
      for (const b of a.bones) {
        expect(Number.isFinite(b.quaternion.x + b.quaternion.y + b.quaternion.z + b.quaternion.w)).toBe(true);
        expect(Number.isFinite(b.position.x + b.position.y + b.position.z)).toBe(true);
      }
      for (const v of a.uniforms.face) expect(Number.isFinite(v.x + v.y + v.z + v.w)).toBe(true);
    }
  });

  it('stands with its feet on the ground at idle', () => {
    const f = createCharacters(kit());
    for (let i = 0; i < 8; i++) {
      const a = f.create(person(`feet${i}`));
      for (let k = 0; k < 120; k++) a.update(DT, 3);
      const ankleL = worldY(a, a.bones[Bone.footL]!);
      const ankleR = worldY(a, a.bones[Bone.footR]!);
      const expected = 0.085 * a.prop.scale + a.prop.lift * a.prop.scale;
      expect(Math.abs(ankleL - expected)).toBeLessThan(0.02);
      expect(Math.abs(ankleR - expected)).toBeLessThan(0.02);
    }
  });

  it('keeps planted feet from sliding while walking and running', () => {
    const f = createCharacters(kit());
    for (const speed of [1.4, 3.4, 5.6]) {
      const a = f.create(person(`slide${speed}`));
      a.loco.speed = speed;
      const foot = a.bones[Bone.footL]!;
      const cur = new Vector3();
      const start = new Vector3();
      let z = 0;
      let inContact = false, contacts = 0, worst = 0;
      const ground = (0.085 + 0.0008) * a.prop.scale + a.prop.lift * a.prop.scale;
      for (let k = 0; k < 480; k++) {
        z -= speed * DT;
        a.root.position.set(0, 0, z);
        a.update(DT, 4);
        a.root.updateMatrixWorld(true);
        foot.getWorldPosition(cur);
        // Flat-footed spans only: rolling on the heel or the ball pivots the ankle on purpose.
        const flat = k > 120 && cur.y < ground;
        if (flat && !inContact) {
          start.copy(cur);
          contacts++;
        }
        if (flat) worst = Math.max(worst, Math.hypot(cur.x - start.x, cur.z - start.z));
        inContact = flat;
      }
      expect(contacts).toBeGreaterThan(2);
      expect(worst).toBeLessThan(0.02);
    }
  });

  it('raises footsteps, landing, contact and seating events', () => {
    const f = createCharacters(kit());
    const a = f.create(person('events'));
    const seen: ActorEvent[] = [];
    a.onEvent = (e) => seen.push(e);
    a.loco.speed = 1.5;
    for (let k = 0; k < 240; k++) a.update(DT, 4);
    expect(seen.filter((e) => e === 'footL').length).toBeGreaterThanOrEqual(3);
    expect(seen.filter((e) => e === 'footR').length).toBeGreaterThanOrEqual(3);
    a.loco.speed = 0;
    a.loco.grounded = false;
    a.loco.vy = -6;
    for (let k = 0; k < 30; k++) a.update(DT, 4);
    a.loco.grounded = true;
    a.loco.vy = 0;
    for (let k = 0; k < 10; k++) a.update(DT, 4);
    expect(seen).toContain('land');
    let done = false;
    a.play('handoff', { onDone: () => (done = true) });
    for (let k = 0; k < 100; k++) a.update(DT, 4);
    expect(seen).toContain('contact');
    expect(done).toBe(true);
    a.posture = 'drive';
    for (let k = 0; k < 40; k++) a.update(DT, 4);
    expect(seen).toContain('seated');
    // A seated pose holds: the blend weight stays at 1 across further updates of any length.
    const seatW = () => (a as unknown as { seatW: number }).seatW;
    for (const dt of [DT, 0.25, DT, 1]) {
      a.update(dt, 4);
      expect(seatW()).toBe(1);
    }
    a.posture = 'stand';
    for (let k = 0; k < 40; k++) a.update(DT, 4);
    expect(seen).toContain('stood');
  });

  it('shares geometry by shape and frees it on dispose', () => {
    const f = createCharacters(kit());
    const a = person('twin');
    const b = { ...a, skin: (a.skin + 5) % 20, hairColor: (a.hairColor + 3) % 14, height: 1 - a.height };
    const x = f.create(a), y = f.create(b);
    expect(x.geo).toBe(y.geo);
    expect(f.cache.hits).toBe(1);
    expect(f.stats().geometries).toBe(1);
    x.dispose();
    y.dispose();
    expect(f.stats().actors).toBe(0);
    expect(f.cache.inUse).toBe(0);
    expect(x.root.parent).toBeNull();
    f.dispose();
    expect(f.stats().geometries).toBe(0);
  });

  it('reports LOD bands and culls distant actors', () => {
    const f = createCharacters(kit());
    const actors = [5, 40, 100, 400].map((d, i) => ({ d, a: f.create(person(`lod${i}`)) }));
    for (let k = 0; k < 3; k++) for (const { a, d } of actors) a.update(DT, d);
    const s = f.stats();
    expect(s.full).toBe(1);
    expect(s.reduced).toBe(2);
    expect(s.culled).toBe(1);
    expect(actors[3]!.a.root.children.length).toBe(0);
  });
});
