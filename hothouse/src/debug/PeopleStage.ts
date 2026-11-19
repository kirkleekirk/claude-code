import {
  BackSide, BufferAttribute, BufferGeometry, CircleGeometry, Color, Group, Mesh, MeshBasicMaterial, SkinnedMesh, Vector3, type Material, type Object3D,
} from 'three';
import { BUILDS, HAIR_STYLES, OUTFITS, PLAYER_LOOKS, randomAppearance, type Appearance } from '@/content/appearance';
import { damp } from '@/core/math';
import { Rng } from '@/core/rng';
import { createCharacters, type ActorImpl, type CharacterFactoryImpl, type ClipId, type FaceExpression } from '@/characters';
import { CLIPS } from '@/characters/anim/clips';
import type { GameContext, Stage } from '@/game/Game';
import { carBodyGeometry, wheelGeometry, wheelMounts } from '@/vehicles/carMesh';
import { VEHICLES, seatPoint, type VehicleId } from '@/vehicles/defs';
import { BOARDWALK_Y, STRAND } from '@/world/landmarks/Beachfront';
import type { World } from '@/world/World';
import { extendHarness } from './harness';

/**
 * People showcase (`?sandbox=people`): a studio floating off the Strand for lineups, hair and
 * outfit sheets, expressions, locomotion filmstrips and every clip; cars with seated drivers; and
 * crowds on the boardwalk at golden hour and at night. Scenes are set up through the harness so
 * `qa/people.mjs` can capture contact sheets.
 */

/** The studio: a floor and a curved backdrop, people facing west into the low sun. */
const STUDIO = { x: -1330, y: 0.6, z: 260 } as const;
const FACE_WEST = Math.PI / 2;

interface Walker {
  actor: ActorImpl;
  x: number;
  z: number;
  dir: number;
  speed: number;
  z0: number;
  z1: number;
  turning: number;
  yaw: number;
  y: number;
}

interface Framing {
  pos: Vector3;
  look: Vector3;
  fov: number;
}

const EXPRESSIONS: readonly FaceExpression[] = ['neutral', 'happy', 'annoyed', 'surprised', 'smug', 'worried'];
const GAITS: Record<string, { speed: number; angle?: number; crouch?: number; jump?: boolean }> = {
  idle: { speed: 0 },
  walk: { speed: 1.4 },
  jog: { speed: 3.4 },
  run: { speed: 5.6 },
  sprint: { speed: 7.6 },
  crouch: { speed: 1.0, crouch: 1 },
  strafe: { speed: 1.5, angle: -Math.PI / 2 },
  backpedal: { speed: 1.2, angle: Math.PI },
  jump: { speed: 0, jump: true },
};

export class PeopleStage implements Stage {
  readonly people: CharacterFactoryImpl;
  private actors: ActorImpl[] = [];
  private walkers: Walker[] = [];
  private props: Object3D[] = [];
  private debugMeshes: Mesh[] = [];
  private readonly studio: Group;
  private frame: Framing = { pos: new Vector3(), look: new Vector3(), fov: 45 };
  private frozen = false;
  private scene = 'lineup';
  private readonly rng = new Rng('people-stage');
  private readonly cam = new Vector3();

  constructor(private readonly ctx: GameContext, private readonly world: World) {
    this.people = createCharacters(ctx.kit);
    this.studio = this.buildStudio();
    ctx.gfx.scene.add(this.studio);
    extendHarness({
      people: (name: string, opt?: string) => this.setup(name, opt),
      peopleStats: () => ({ ...this.people.stats(), scene: this.scene, vertices: this.actors.map((a) => a.geo.vertices) }),
      peopleDebug: (mode: 'winding' | 'off') => this.debug(mode),
    });
    this.setup('lineup');
  }

  fixed(): void {}

  update(dt: number): void {
    this.world.update(dt);
    const cam = this.ctx.gfx.camera;
    cam.position.copy(this.frame.pos);
    cam.lookAt(this.frame.look);
    if (cam.fov !== this.frame.fov) {
      cam.fov = this.frame.fov;
      cam.updateProjectionMatrix();
    }
    for (const w of this.walkers) this.walk(w, dt);
    if (this.frozen) return;
    for (const a of this.actors) {
      a.root.getWorldPosition(this.cam);
      a.update(dt, this.cam.distanceTo(cam.position));
    }
  }

  debugState(): Record<string, unknown> {
    return { stage: 'people', scene: this.scene, ...this.people.stats() };
  }

  dispose(): void {
    this.clear();
    this.people.dispose();
    this.studio.removeFromParent();
    this.world.dispose();
  }

  // ── scenes ─────────────────────────────────────────────────────────────

  private setup(name: string, opt?: string): { actors: number } {
    this.clear();
    this.scene = opt ? `${name}:${opt}` : name;
    this.frozen = false;
    this.studio.visible = !['crowd', 'night'].includes(name);
    const S = STUDIO;
    switch (name) {
      case 'lineup': {
        // One of each build, alternating outfits, heights spread from short to tall.
        BUILDS.forEach((_, i) => {
          const a = this.person(`lineup${i}`, { build: i, height: (i % 4) / 3, outfit: (i * 6 + 1) % OUTFITS.length, hair: (i * 7) % 30 });
          this.place(a, S.x, S.y, S.z + (i - 5.5) * 0.86, FACE_WEST);
        });
        this.look(S.x - 8.4, S.y + 1.2, S.z, S.x, S.y + 0.92, S.z, 46);
        break;
      }
      case 'hair': {
        const page = Number(opt ?? 0);
        for (let i = 0; i < 10; i++) {
          const style = page * 10 + i;
          if (style >= HAIR_STYLES.length) break;
          const row = i < 5 ? 0 : 1;
          const col = i % 5;
          const a = this.person(`hair${style}`, { hair: style, hairColor: (style * 5) % 14, facialHair: style % 7 === 3 ? 3 : 0, glasses: 0, height: 0.5 });
          this.place(a, S.x + row * 1.05, S.y, S.z + (col - 2) * 0.82 + row * 0.41, FACE_WEST - 0.25 + col * 0.12);
        }
        this.look(S.x - 2.75, S.y + 1.82, S.z + 0.2, S.x + 0.5, S.y + 1.48, S.z + 0.2, 42);
        break;
      }
      case 'outfits': {
        const page = Number(opt ?? 0);
        const shapes = [...new Set(OUTFITS.map((o) => o.name))];
        const list = shapes.slice(page * 10, page * 10 + 10);
        list.forEach((nm, i) => {
          const outfit = OUTFITS.find((o) => o.name === nm)!.id + (i % 3);
          const a = this.person(`outfit${nm}`, { outfit: Math.min(OUTFITS.length - 1, outfit), build: (i * 5) % 12, hair: (i * 3) % 30 });
          this.place(a, S.x, S.y, S.z + (i - (list.length - 1) / 2) * 0.82, FACE_WEST);
        });
        this.look(S.x - 6.9, S.y + 1.2, S.z, S.x, S.y + 0.95, S.z, 46);
        break;
      }
      case 'faces': {
        const page = Number(opt ?? 0);
        EXPRESSIONS.forEach((e, i) => {
          const a = this.person(`face${page}-${i}`, { skin: (i * 3 + page * 10) % 20, hair: (i * 4 + page * 13) % 30, glasses: 0, facialHair: page === 1 && i % 2 ? 2 : 0 });
          const actor = this.place(a, S.x, S.y, S.z + (i - 2.5) * 0.44, FACE_WEST);
          actor.setExpression(page === 0 ? e : EXPRESSIONS[(i + 1) % 6]!);
        });
        this.look(S.x - 1.95, S.y + 1.62, S.z, S.x, S.y + 1.58, S.z, 36);
        this.settle(1.2);
        for (const actor of this.actors) {
          actor.deferBlink(60);
          actor.update(1 / 60, 3);
        }
        this.frozen = true;
        break;
      }
      case 'loco': {
        const gait = GAITS[opt ?? 'walk'] ?? GAITS.walk!;
        const a = this.person('loco', { build: 4, outfit: 47, hair: 14, height: 0.55 });
        for (let i = 0; i < 6; i++) {
          const actor = this.place(a, S.x, S.y, S.z + (i - 2.5) * 1.05, 0);
          actor.loco.speed = gait.speed;
          actor.loco.moveAngle = gait.angle ?? 0;
          actor.loco.crouch = gait.crouch ?? 0;
          if (gait.jump) {
            actor.loco.grounded = i === 5;
            actor.loco.vy = [4.5, 2, 0, -2.5, -7, 0][i]!;
          }
        }
        this.settle(1.5);
        this.actors.forEach((actor, i) => {
          if (gait.jump) return;
          actor.setCyclePhase(i / 6);
          actor.update(0, 5);
        });
        if (gait.jump) {
          // The last frame shows the landing crouch.
          const last = this.actors[5]!;
          last.loco.grounded = false;
          last.loco.vy = -8;
          for (let k = 0; k < 30; k++) last.update(1 / 60, 5);
          last.loco.grounded = true;
          last.loco.vy = 0;
          for (let k = 0; k < 6; k++) last.update(1 / 60, 5);
        }
        this.frozen = true;
        this.look(S.x - 6.2, S.y + 1.05, S.z, S.x, S.y + 0.85, S.z, 50);
        break;
      }
      case 'clips': {
        const ids = Object.keys(CLIPS) as ClipId[];
        const page = Number(opt ?? 0);
        const list = ids.slice(page * 6, page * 6 + 6);
        list.forEach((id, i) => {
          const a = this.person(`clip${id}`, { hair: (i * 7 + page * 5) % 30, outfit: (i * 13 + page * 7) % OUTFITS.length });
          const actor = this.place(a, S.x, S.y, S.z + (i - 2.5) * 1.3, FACE_WEST - 0.3);
          actor.play(id, { loop: true });
        });
        // Advance each clip to its most telling moment.
        const moment: Partial<Record<ClipId, number>> = { handoff: 0.5, receive: 0.5, pickup: 0.5, putdown: 0.5, knockdown: 0.99, getUp: 0.5, wave: 0.5, cheer: 0.4, point: 0.5, shove: 0.38, punch: 0.42, hitReact: 0.18, shrug: 0.5, nod: 0.25, shake: 0.12, enterVehicleL: 0.55, enterVehicleR: 0.55, exitVehicleL: 0.45, exitVehicleR: 0.45, beckon: 0.5 };
        list.forEach((id, i) => {
          const actor = this.actors[i]!;
          const t = (moment[id] ?? 0.4) * CLIPS[id].dur;
          for (let k = 0; k < Math.round(t * 60); k++) actor.update(1 / 60, 6);
        });
        this.frozen = true;
        this.look(S.x - 5.4, S.y + 1.55, S.z, S.x + 0.3, S.y + 0.85, S.z, 48);
        break;
      }
      case 'drivers': {
        const id = (opt ?? 'palmera') as VehicleId;
        const cutaway = id !== 'palmeraOutside' && id !== 'palmeraClose';
        const vid = (id === 'palmeraOutside' || id === 'palmeraClose' ? 'palmera' : id) as VehicleId;
        const car = this.car(vid, cutaway, S.x, S.y, S.z, FACE_WEST - 0.5);
        const drv = this.person(`driver${vid}`, { outfit: 4, hair: 3, glasses: 1 });
        const pas = this.person(`pass${vid}`, { outfit: 40, hair: 13, build: 3 });
        for (const [a, side] of [[drv, 'driver'], [pas, 'passenger']] as const) {
          const actor = this.people.create(a);
          const seat = seatPoint(VEHICLES[vid]!.body, side);
          actor.root.position.set(seat.x, seat.y, seat.z);
          actor.posture = side === 'driver' ? 'drive' : 'passenger';
          actor.steer = side === 'driver' ? 0.35 : 0;
          car.add(actor.root);
          this.actors.push(actor);
        }
        this.settle(1.2);
        this.frozen = true;
        // Three-quarter view from the driver's side, or a close look at the hands on the wheel.
        const len = VEHICLES[vid]!.body.length;
        if (id === 'palmeraClose') {
          car.updateMatrixWorld(true);
          const eye = car.localToWorld(new Vector3(-1.45, 1.5, -1.25));
          const at = car.localToWorld(new Vector3(-0.3, 1.0, 0.45));
          this.look(eye.x, eye.y, eye.z, at.x, at.y, at.z, 40);
        } else {
          this.look(S.x - 3.4 - len * 0.35, S.y + 1.9, S.z + 2.6 + len * 0.2, S.x, S.y + 0.85, S.z, 42);
        }
        break;
      }
      case 'crowd':
      case 'night': {
        const night = name === 'night';
        const zc = night ? 18 : 40;
        const y = BOARDWALK_Y;
        for (let i = 0; i < 34; i++) {
          const a = randomAppearance(this.rng.fork(`crowd${i}`));
          const actor = this.people.create(a);
          this.ctx.gfx.scene.add(actor.root);
          this.actors.push(actor);
          const role = i % 9;
          // On the deck: between the sand-side rail and the promenade.
          const x = STRAND.boardwalkX + 2.2 + this.rng.next() * 13;
          const z = zc - 26 + this.rng.next() * 56;
          if (role < 5) {
            const dir = this.rng.chance(0.5) ? 1 : -1;
            this.walkers.push({ actor, x, z, dir, speed: role === 4 ? 2.8 + this.rng.next() * 1.5 : 1.0 + this.rng.next() * 0.7, z0: zc - 45, z1: zc + 45, turning: 0, yaw: dir > 0 ? Math.PI : 0, y });
            if (role === 3) actor.play('phoneText', { loop: true });
          } else {
            actor.root.position.set(x, y, z);
            actor.root.rotation.y = this.rng.next() * Math.PI * 2;
            const clip: ClipId | null = role === 5 ? 'talk' : role === 6 ? 'phoneCall' : role === 7 ? (night ? 'dance' : 'lean') : null;
            if (clip) actor.play(clip, { loop: true });
            if (role === 8) actor.lookAt(new Vector3(x - 4, y + 1.6, z + 2));
          }
        }
        this.settle(2.0);
        if (night) this.look(STRAND.boardwalkX + 4.5, y + 1.75, zc + 34, STRAND.boardwalkX - 8, y + 2.5, zc - 10, 55);
        else this.look(STRAND.boardwalkX + 3.5, y + 1.65, zc + 36, STRAND.boardwalkX - 3, y + 1.2, zc - 20, 52);
        break;
      }
      case 'player': {
        PLAYER_LOOKS.forEach((l, i) => {
          const actor = this.place(l.base, S.x, S.y, S.z + (i - 2.5) * 0.95, FACE_WEST + (i - 2.5) * 0.08);
          actor.setExpression(i % 2 ? 'smug' : 'happy');
        });
        this.settle(1.0);
        this.look(S.x - 5.2, S.y + 1.35, S.z, S.x, S.y + 1.05, S.z, 44);
        break;
      }
      default:
        throw new Error(`unknown people scene "${name}"`);
    }
    return { actors: this.actors.length };
  }

  /** A deterministic person with overrides. */
  private person(seed: string, over: Partial<Appearance> = {}): Appearance {
    return { ...randomAppearance(new Rng(seed)), ...over };
  }

  private place(a: Appearance, x: number, y: number, z: number, yaw: number): ActorImpl {
    const actor = this.people.create(a);
    actor.root.position.set(x, y, z);
    actor.root.rotation.y = yaw;
    this.ctx.gfx.scene.add(actor.root);
    this.actors.push(actor);
    return actor;
  }

  /** Run a short while so smoothed motion settles, then hold. */
  private settle(seconds: number): void {
    const n = Math.round(seconds * 60);
    for (let k = 0; k < n; k++) {
      for (const w of this.walkers) this.walk(w, 1 / 60);
      for (const a of this.actors) a.update(1 / 60, 8);
    }
    for (const a of this.actors) a.root.updateMatrixWorld(true);
  }

  private look(px: number, py: number, pz: number, lx: number, ly: number, lz: number, fov: number): void {
    this.frame = { pos: new Vector3(px, py, pz), look: new Vector3(lx, ly, lz), fov };
  }

  private walk(w: Walker, dt: number): void {
    const a = w.actor;
    if (w.turning > 0) {
      w.turning -= dt;
      const target = w.dir > 0 ? Math.PI : 0;
      const before = w.yaw;
      w.yaw = damp(w.yaw, target, 6, dt);
      a.loco.speed = 0.4;
      a.loco.turnRate = dt > 0 ? (w.yaw - before) / dt : 0;
    } else {
      w.z += w.dir * w.speed * dt;
      a.loco.speed = w.speed;
      a.loco.turnRate = 0;
      if ((w.dir > 0 && w.z > w.z1) || (w.dir < 0 && w.z < w.z0)) {
        w.dir = -w.dir;
        w.turning = 0.7;
      }
    }
    a.root.position.set(w.x, w.y, w.z);
    a.root.rotation.y = w.yaw;
  }

  private car(id: VehicleId, cutaway: boolean, x: number, y: number, z: number, yaw: number): Group {
    const def = VEHICLES[id]!;
    const g = new Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const paint = new Color(def.paints[0]!);
    const mat = this.ctx.kit.physical({
      vertexColors: true, surfAttr: true, wet: true, rim: 0.3, roughness: 1, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.06,
      transparent: cutaway, depthWrite: true,
      extend: {
        key: cutaway ? 'showroom-car-cut' : 'showroom-car',
        uniforms: { uPaint: { value: paint } },
        fragmentPars: 'uniform vec3 uPaint;',
        fragmentColor: 'if (hhFlag(vSurf.w, 16.0) > 0.5) diffuseColor.rgb *= uPaint;',
        fragmentFinal: cutaway ? 'gl_FragColor.a = hhFlag(vSurf.w, 4.0) > 0.5 ? 0.22 : 1.0;' : '',
      },
    });
    const body = new Mesh(carBodyGeometry(def), mat);
    body.castShadow = true;
    g.add(body);
    const wgeo = wheelGeometry(def);
    for (const [mx, my, mz] of wheelMounts(def)) {
      const wm = new Mesh(wgeo, mat);
      wm.position.set(mx, my, mz);
      if (mx < 0) wm.scale.x = -1;
      g.add(wm);
    }
    this.ctx.gfx.scene.add(g);
    this.props.push(g);
    return g;
  }

  private buildStudio(): Group {
    const g = new Group();
    g.name = 'people-studio';
    const floorMat = this.ctx.kit.standard({ color: '#D8CCCB', roughness: 0.92 });
    const floor = new Mesh(new CircleGeometry(26, 48), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(STUDIO.x, STUDIO.y, STUDIO.z);
    floor.receiveShadow = true;
    g.add(floor);
    // Curved backdrop east of the floor: a quarter pipe rising into a wall.
    const geo = new BufferGeometry();
    const cols = 24, rows = 16, R = 3.5, H = 9, W = 36, x0 = STUDIO.x + 6;
    const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
    for (let r = 0; r <= rows; r++) {
      const s = r / rows;
      const ang = Math.min(1, s * 1.6) * Math.PI / 2;
      const px = s < 0.625 ? x0 + Math.sin(ang) * R : x0 + R;
      const py = s < 0.625 ? STUDIO.y + (1 - Math.cos(ang)) * R : STUDIO.y + R + (s - 0.625) / 0.375 * (H - R);
      const nx = s < 0.625 ? -Math.sin(ang) : -1, ny = s < 0.625 ? Math.cos(ang) : 0;
      for (let c = 0; c <= cols; c++) {
        pos.push(px, py, STUDIO.z - W / 2 + (c / cols) * W);
        nrm.push(nx, ny, 0);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c, b = a + cols + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
    geo.setIndex(idx);
    const wall = new Mesh(geo, this.ctx.kit.standard({ color: '#E3D5D2', roughness: 0.95 }));
    wall.receiveShadow = true;
    g.add(wall);
    return g;
  }

  /** Paint inverted faces red: any red on a closed surface is a winding error. */
  private debug(mode: 'winding' | 'off'): number {
    for (const m of this.debugMeshes) m.removeFromParent();
    this.debugMeshes = [];
    if (mode === 'off') return 0;
    const red = new MeshBasicMaterial({ color: '#FF0030', side: BackSide });
    for (const a of this.actors) {
      const dbg = new SkinnedMesh(a.geo.geometry, red);
      dbg.bind(a.mesh.skeleton, a.mesh.bindMatrix);
      dbg.frustumCulled = false;
      a.mesh.parent!.add(dbg);
      this.debugMeshes.push(dbg);
    }
    return this.debugMeshes.length;
  }

  private clear(): void {
    for (const m of this.debugMeshes) m.removeFromParent();
    this.debugMeshes = [];
    for (const a of this.actors) a.dispose();
    this.actors = [];
    this.walkers = [];
    for (const p of this.props) {
      p.removeFromParent();
      p.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          this.ctx.kit.release(m.material as Material);
        }
      });
    }
    this.props = [];
  }
}
