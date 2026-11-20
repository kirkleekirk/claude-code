import { Color, Group, Mesh, Quaternion, Vector3, Vector4, type BufferGeometry, type IUniform, type MeshPhysicalMaterial } from 'three';
import { clamp, curve, damp, moveTowards, smoothstep } from '@/core/math';
import { tunables } from '@/core/tunables';
import type { Pose } from '@/core/types';
import { Collide, Query, RAPIER, TransformInterp, type PhysicsWorld } from '@/physics';
import { LAYER_REFLECTED } from '@/render/layers';
import type { MaterialKit } from '@/render/materials/MaterialKit';
import { carBodyGeometry, wheelGeometry, wheelMounts } from './carMesh';
import type { VehicleDef } from './defs';

export interface VehicleControls {
  throttle: number;
  /** Brake, and reverse once nearly stopped. */
  brake: number;
  /** −1 left … 1 right. */
  steer: number;
  handbrake: boolean;
  boost: boolean;
}

export interface VehicleAssists {
  traction: boolean;
  steering: boolean;
  countersteer: boolean;
}

export interface WheelState {
  contact: boolean;
  compression: number;
  /** Spring length this step. */
  length: number;
  load: number;
  /** Lateral slip speed (m/s) and longitudinal wheelspin (0–1). */
  slipLat: number;
  spin: number;
  angle: number;
  steer: number;
  /** World contact point (valid when contact). */
  readonly point: Vector3;
  surfaceY: number;
}

const cfg = tunables.group('vehicle.common', {
  latStiff: { value: 0.42, min: 0.05, max: 1, step: 0.01, label: 'lateral bite' },
  rollInfluence: { value: 0.55, min: 0, max: 1, step: 0.01 },
  downforce: { value: 1.6, min: 0, max: 10, step: 0.1 },
  yawDamp: { value: 2400, min: 0, max: 12000, step: 50 },
  driftAssist: { value: 0.55, min: 0, max: 2, step: 0.01 },
  counterSteer: { value: 0.65, min: 0, max: 1.5, step: 0.01 },
  steerRate: { value: 5.2, min: 0.5, max: 15, step: 0.1 },
  steerReturn: { value: 7.5, min: 0.5, max: 20, step: 0.1 },
  boostForce: { value: 7000, min: 0, max: 30000, step: 100 },
  airLevel: { value: 3.2, min: 0, max: 20, step: 0.1 },
  rollingResist: { value: 26, min: 0, max: 200, step: 1 },
  engineBrake: { value: 90, min: 0, max: 600, step: 5 },
  handbrakeBrake: { value: 0.14, min: 0, max: 0.6, step: 0.01, label: 'handbrake braking' },
  driftMax: { value: 0.85, min: 0.3, max: 1.4, step: 0.01, label: 'drift angle limit (rad)' },
  driftLimit: { value: 13, min: 0, max: 40, step: 0.5, label: 'drift limiter strength' },
  driftKeep: { value: 0.92, min: 0, max: 1, step: 0.01, label: 'drift momentum kept' },
  powerOversteer: { value: 0.75, min: 0, max: 0.95, step: 0.01, label: 'drive force eating lateral grip' },
  roofDrag: { value: 1.6, min: 0, max: 6, step: 0.1, label: 'upside-down scrape drag (1/s)' },
});

const _q = new Quaternion();
const _right = new Vector3();
const _up = new Vector3();
const _fwd = new Vector3();
const _v = new Vector3();
const _w = new Vector3();
const _com = new Vector3();
const _p = new Vector3();
const _r = new Vector3();
const _vp = new Vector3();
const _f = new Vector3();
const _s = new Vector3();
const _force = new Vector3();
const _tmp = new Vector3();
const _origin = new Vector3();
const _hitP = new Vector3();
const _vh = new Vector3();
const _qw = new Quaternion();
const _tw = new Vector3();
const DOWN_FORCE_CURVE: ReadonlyArray<readonly [number, number]> = [[0, 1], [0.25, 0.97], [0.55, 0.82], [0.8, 0.55], [0.95, 0.22], [1.05, 0]];

/**
 * An arcade vehicle: raycast suspension on a Rapier rigid body, forgiving-but-weighty tyres, and
 * assists that keep slides catchable. Fixed-step physics in `fixed`, interpolated visuals in `update`.
 */
export class Vehicle {
  readonly group = new Group();
  readonly rb: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controls: VehicleControls = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
  readonly assists: VehicleAssists = { traction: true, steering: true, countersteer: true };
  readonly wheels: WheelState[] = [];
  readonly material: MeshPhysicalMaterial;
  private readonly glass: MeshPhysicalMaterial;
  readonly uPaint: IUniform<Color> = { value: new Color() };
  /** x headlights, y brake lights, z siren, w reversing. */
  readonly uLights: IUniform<Vector4> = { value: new Vector4() };
  /** Signed forward speed (m/s), rpm, gear, and how sideways the car is (radians). */
  speed = 0;
  rpm = 800;
  gear = 1;
  driftAngle = 0;
  /** 0–1 how hard the tyres are sliding (skids, smoke, squeal). */
  slip = 0;
  airborne = false;
  airTime = 0;
  /** Last frame's strongest impact (newtons) for camera shake, sparks and sound. */
  impact = 0;
  /** Times the car has auto-righted (events and the drive bot read it). */
  righted = 0;
  /**
   * Drift latch: a handbrake pull at speed commits the car to a drift (low yaw damping, steerable
   * rotation, carried momentum) until it straightens out. Outside it the car grips and stability
   * control trims power oversteer, so a fast corner never turns into a surprise slide.
   */
  drifting = false;

  private readonly interp = new TransformInterp();
  private readonly mounts: Array<[number, number, number]>;
  private readonly wheelMeshes: Mesh[] = [];
  private readonly body: Mesh;
  private steerAngle = 0;
  private upsideDown = 0;
  private stuck = 0;
  private driftCalm = 0;
  private shiftTimer = 0;
  private readonly massPerWheel: number;
  private readonly staticComp: number;

  constructor(private readonly physics: PhysicsWorld, kit: MaterialKit, readonly def: VehicleDef, pose: Pose, paint: string, private readonly geo?: { body: BufferGeometry; wheel: BufferGeometry }) {
    const h = def.handling;
    const s = def.body;
    this.massPerWheel = h.mass / 4;
    this.staticComp = (h.mass * 9.81) / (4 * h.spring);
    this.mounts = wheelMounts(def).map(([x, y, z]) => [x, y + h.rest - this.staticComp, z]);

    // Physics body: a rounded box above the wheels; mass and inertia set explicitly.
    const hy = (s.height - s.clearance) / 2 * 0.82;
    const bodyCenterY = s.clearance + 0.06 + hy;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pose.x, pose.y, pose.z)
      .setRotation({ x: 0, y: Math.sin(pose.yaw / 2), z: 0, w: Math.cos(pose.yaw / 2) })
      .setCcdEnabled(true)
      .setLinearDamping(0.02)
      .setAngularDamping(0.35)
      .setAdditionalMassProperties(
        h.mass,
        { x: 0, y: bodyCenterY + h.comY, z: 0 },
        {
          x: (h.mass / 12) * (s.height ** 2 + s.length ** 2) * 0.9,
          y: (h.mass / 12) * (s.width ** 2 + s.length ** 2) * h.yawInertia,
          z: (h.mass / 12) * (s.width ** 2 + s.height ** 2) * 1.1,
        },
        { x: 0, y: 0, z: 0, w: 1 },
      );
    this.rb = physics.world.createRigidBody(desc);
    const cdesc = RAPIER.ColliderDesc.roundCuboid(s.width / 2 - 0.12, hy - 0.08, s.length / 2 - 0.14, 0.1)
      .setTranslation(0, bodyCenterY, 0)
      .setDensity(0)
      .setFriction(0.35)
      .setRestitution(0.18)
      .setCollisionGroups(Collide.vehicle);
    this.collider = physics.world.createCollider(cdesc, this.rb);
    physics.tag(this.collider, this);
    physics.onImpact(this.collider, 25000, (info) => {
      this.impact = Math.max(this.impact, info.force);
    });

    // Visuals.
    this.uPaint.value.set(paint);
    this.material = kit.physical({
      vertexColors: true, surfAttr: true, wet: true, rim: 0.3, roughness: 1, metalness: 1,
      clearcoat: 1, clearcoatRoughness: 0.06,
      extend: {
        key: 'vehicle-v1',
        uniforms: { uPaint: this.uPaint, uLights: this.uLights },
        // Three declares modelMatrix for the vertex stage only; the siren side test needs it here too.
        fragmentPars: 'uniform vec3 uPaint;\nuniform vec4 uLights;\nuniform highp mat4 modelMatrix;',
        fragmentColor: 'if (hhFlag(vSurf.w, 16.0) > 0.5) diffuseColor.rgb *= uPaint;',
        fragmentEmissive: `
          float hl = hhFlag(vSurf.w, 32.0);
          float tl = hhFlag(vSurf.w, 64.0);
          float sr = hhFlag(vSurf.w, 128.0);
          totalEmissiveRadiance += hhBaseColor * hl * uLights.x * 9.0;
          totalEmissiveRadiance += hhBaseColor * tl * (uLights.x * 0.9 + uLights.y * 5.0);
          float side = step(0.0, dot(vHHWorld - (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, normalize((modelMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz)));
          float phase = step(0.5, fract(uTime * 2.6 + side * 0.5));
          vec3 sirenCol = mix(vec3(1.0, 0.1, 0.15), vec3(0.15, 0.35, 1.0), side);
          totalEmissiveRadiance += sirenCol * sr * uLights.z * phase * 9.0;`,
        fragmentReplace: [['#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= hhFlag(vSurf.w, 16.0);\n#endif']],
      },
    });
    // Windows are a second, translucent material (geometry group 1) so drivers show through.
    this.glass = kit.physical({
      vertexColors: true, surfAttr: true, wet: true, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.8,
      depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.75,
    });
    this.body = new Mesh(geo?.body ?? carBodyGeometry(def), [this.material, this.glass]);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.body.layers.set(LAYER_REFLECTED);
    this.group.add(this.body);
    const wgeo = geo?.wheel ?? wheelGeometry(def);
    for (let i = 0; i < 4; i++) {
      const m = new Mesh(wgeo, this.material);
      m.castShadow = true;
      m.layers.set(LAYER_REFLECTED);
      if (this.mounts[i]![0] < 0) m.scale.x = -1;
      this.group.add(m);
      this.wheelMeshes.push(m);
      this.wheels.push({ contact: false, compression: 0, length: h.rest, load: 0, slipLat: 0, spin: 0, angle: 0, steer: 0, point: new Vector3(), surfaceY: 0 });
    }
    this.interp.reset(this.rb);
    this.group.name = `vehicle-${def.id}`;
  }

  private readonly pos = new Vector3();

  /** Current physics position (a live vector owned by the vehicle; copy it to keep it). */
  get position(): Vector3 {
    const t = this.rb.translation();
    return this.pos.set(t.x, t.y, t.z);
  }

  /** Heading (yaw, radians; 0 faces −Z). */
  get yaw(): number {
    const r = this.rb.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _fwd.set(0, 0, -1).applyQuaternion(_q);
    return Math.atan2(-_fwd.x, -_fwd.z);
  }

  /** Car space → world space with the physics pose (valid inside fixed steps, unlike `group`). */
  toWorld(local: Vector3, out: Vector3): Vector3 {
    const t = this.rb.translation(), r = this.rb.rotation();
    _qw.set(r.x, r.y, r.z, r.w);
    return out.copy(local).applyQuaternion(_qw).add(_tw.set(t.x, t.y, t.z));
  }

  teleport(pose: Pose): void {
    this.rb.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    this.rb.setRotation({ x: 0, y: Math.sin(pose.yaw / 2), z: 0, w: Math.cos(pose.yaw / 2) }, true);
    this.rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.interp.reset(this.rb);
  }

  fixed(dt: number): void {
    const h = this.def.handling;
    const c = this.controls;
    // Rapier keeps user forces until reset: start every step clean.
    this.rb.resetForces(false);
    this.rb.resetTorques(false);
    const t = this.rb.translation();
    _origin.set(t.x, t.y, t.z);
    const r = this.rb.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _right.set(1, 0, 0).applyQuaternion(_q);
    _up.set(0, 1, 0).applyQuaternion(_q);
    _fwd.set(0, 0, -1).applyQuaternion(_q);
    const lv = this.rb.linvel(), av = this.rb.angvel();
    _v.set(lv.x, lv.y, lv.z);
    _w.set(av.x, av.y, av.z);
    const com = this.rb.worldCom();
    _com.set(com.x, com.y, com.z);
    const vf = _v.dot(_fwd);
    const vs = _v.dot(_right);
    const speed = Math.hypot(vf, vs);
    this.speed = vf;
    this.driftAngle = speed > 4 ? Math.atan2(vs, Math.max(Math.abs(vf), 0.1)) : 0;

    // Steering: rate-limited, softened with speed, with optional counter-steer help.
    const speedFrac = clamp(Math.abs(vf) / h.topSpeed, 0, 1.2);
    const lock = this.assists.steering ? h.steerLock + (h.steerLockFast - h.steerLock) * smoothstep(0, 0.85, speedFrac) : h.steerLock;
    let target = c.steer * lock;
    if (this.assists.countersteer && speed > 6 && Math.abs(this.driftAngle) > 0.12) {
      target += clamp(this.driftAngle, -0.6, 0.6) * cfg.counterSteer * (1 - Math.abs(c.steer) * 0.35);
    }
    const rate = (Math.abs(target) > Math.abs(this.steerAngle) ? cfg.steerRate : cfg.steerReturn) * lock;
    this.steerAngle = moveTowards(this.steerAngle, clamp(target, -h.steerLock, h.steerLock), rate * dt);

    // Engine: automatic box, force fading with speed, reverse on brake from a standstill.
    const reversing = c.brake > 0.1 && vf < 0.8 && c.throttle < 0.1;
    const throttle = reversing ? c.brake : c.throttle;
    const engine = h.drive * curve(DOWN_FORCE_CURVE, Math.abs(vf) / (reversing ? h.topSpeed * 0.35 : h.topSpeed));
    let driveTotal = throttle * engine * (reversing ? -0.6 : 1);
    if (c.boost && !reversing && throttle > 0.1) driveTotal += cfg.boostForce;
    const braking = !reversing && c.brake > 0.05 && vf > 0.5 ? c.brake : 0;
    this.updateGearbox(vf, throttle, dt);

    const angle = Math.abs(this.driftAngle);
    if (c.handbrake && speed > 8) this.drifting = true;
    if (this.drifting) {
      this.driftCalm = angle < 0.12 ? this.driftCalm + dt : 0;
      if (this.driftCalm > 0.35 || speed < 5) this.drifting = false;
    }
    const committed = this.drifting || c.handbrake;

    let grounded = 0;
    let rearSlip = 0;
    // Ground-plane travel direction: sideways tyre force along it is speed lost to scrubbing.
    _vh.copy(_v).addScaledVector(_up, -_v.dot(_up));
    const vhLen = _vh.length();
    if (vhLen > 0.01) _vh.divideScalar(vhLen);
    let scrub = 0;
    for (let i = 0; i < 4; i++) {
      const wst = this.wheels[i]!;
      const front = i < 2;
      const [mx, my, mz] = this.mounts[i]!;
      _p.set(mx, my, mz).applyQuaternion(_q).add(_origin);
      const maxLen = h.rest + h.travel;
      const hit = this.physics.raycast(_p.x, _p.y, _p.z, -_up.x, -_up.y, -_up.z, maxLen + this.def.body.wheelR, Query.solid, this.rb);
      wst.steer = front ? this.steerAngle : 0;
      if (!hit.hit) {
        wst.contact = false;
        wst.length = moveTowards(wst.length, maxLen, dt * 4);
        wst.compression = 0;
        wst.load = 0;
        wst.slipLat = 0;
        continue;
      }
      grounded++;
      wst.contact = true;
      wst.point.set(hit.x, hit.y, hit.z);
      wst.surfaceY = hit.y;
      const len = Math.max(0, hit.distance - this.def.body.wheelR);
      const comp = h.rest - len;
      const compVel = (comp - (h.rest - wst.length)) / dt;
      wst.length = len;
      wst.compression = comp;
      let spring = h.spring * comp + h.damper * compVel;
      // Bump stop when the travel runs out.
      if (len < 0.04) spring += (0.04 - len) * h.spring * 6;
      const load = Math.max(0, spring);
      wst.load = load;
      _force.copy(_up).multiplyScalar(load);
      this.rb.addForceAtPoint(_force, _p, true);

      // Tyre frame at the contact.
      const ca = Math.cos(wst.steer), sa = Math.sin(wst.steer);
      _f.copy(_fwd).multiplyScalar(ca).addScaledVector(_right, sa);
      _s.copy(_right).multiplyScalar(ca).addScaledVector(_fwd, -sa);
      _r.set(hit.x, hit.y, hit.z).sub(_com);
      _vp.copy(_w).cross(_r).add(_v);
      const wf = _vp.dot(_f);
      const ws = _vp.dot(_s);

      // Longitudinal: drive, brakes, rolling and engine drag.
      const driveShare = front ? h.frontDrive / 2 : (1 - h.frontDrive) / 2;
      let fx = driveTotal * driveShare;
      if (this.assists.traction && Math.abs(fx) > 0) {
        fx *= 1 - smoothstep(4, 9, Math.abs(ws)) * 0.5;
        if (!committed) fx *= 1 - smoothstep(0.1, 0.35, angle) * 0.65;
      }
      if (braking > 0) fx -= Math.sign(wf) * h.brake * 0.25 * braking * (front ? 1.15 : 0.85);
      if (c.handbrake && !front) fx -= Math.sign(wf) * Math.min(h.brake * cfg.handbrakeBrake, Math.abs(wf) * this.massPerWheel / dt);
      fx -= wf * cfg.rollingResist * (throttle > 0.05 ? 0.4 : 1);
      if (throttle < 0.05 && !braking) fx -= wf * cfg.engineBrake * (1 - h.frontDrive * 0.5) * (front ? 0.3 : 0.7);

      // Lateral: cancel side slip up to the friction limit (the arcade grip model).
      let mu = front ? h.gripFront : h.gripRear;
      if (c.handbrake && !front) mu *= h.handbrakeGrip;
      const want = -ws * this.massPerWheel / dt * cfg.latStiff;
      // Friction circle: drive force eats into lateral capacity (power oversteer on RWD).
      const cap = mu * load;
      const lonUse = clamp(Math.abs(fx) / Math.max(cap, 1), 0, 1);
      const latCap = cap * Math.sqrt(1 - lonUse * lonUse * cfg.powerOversteer);
      const fy = clamp(want, -latCap, latCap);
      scrub += fy * _s.dot(_vh);
      fx = clamp(fx, -cap * 1.1, cap * 1.1);
      wst.slipLat = ws;
      wst.spin = clamp((Math.abs(driveTotal * driveShare) - cap) / Math.max(cap, 1), 0, 1);
      if (!front) rearSlip = Math.max(rearSlip, Math.abs(ws) / 5 + wst.spin);
      // Apply lateral force closer to the centre of mass to keep the body from rolling over.
      _hitP.set(hit.x, hit.y, hit.z);
      _r.copy(_com).sub(_hitP);
      const toCom = _r.dot(_up);
      _r.copy(_hitP).addScaledVector(_up, toCom * cfg.rollInfluence);
      _force.copy(_f).multiplyScalar(fx).addScaledVector(_s, fy);
      this.rb.addForceAtPoint(_force, _r, true);
      wst.angle += (wf / this.def.body.wheelR) * dt * (c.handbrake && !front ? 0 : 1);
    }

    // Anti-roll bars.
    for (const [a, b] of [[0, 1], [2, 3]] as const) {
      const wa = this.wheels[a]!, wb = this.wheels[b]!;
      if (!wa.contact || !wb.contact) continue;
      const diff = (wa.compression - wb.compression) * h.antiRoll;
      for (const [idx, sign] of [[a, -1], [b, 1]] as const) {
        const [mx, my, mz] = this.mounts[idx]!;
        _p.set(mx, my, mz).applyQuaternion(_q).add(_origin);
        _force.copy(_up).multiplyScalar(diff * sign);
        this.rb.addForceAtPoint(_force, _p, true);
      }
    }

    this.airborne = grounded === 0;
    this.airTime = this.airborne ? this.airTime + dt : 0;
    this.slip = clamp(Math.max(rearSlip, Math.abs(this.driftAngle) > 0.25 && speed > 6 ? Math.abs(this.driftAngle) : 0), 0, 1);

    if (grounded > 0) {
      // Downforce keeps fast cars planted.
      this.rb.addForce(_force.copy(_up).multiplyScalar(-cfg.downforce * speed * speed), true);
      // Yaw stability: damp spins unless the driver has committed to a drift; past the drift limit
      // the damping returns and a restoring torque swings the nose back toward the travel line.
      const yawRate = _w.dot(_up);
      const over = speed > 6 ? angle - cfg.driftMax : -1;
      const limit = smoothstep(-0.15, 0.2, over);
      const damping = cfg.yawDamp * (committed ? 0.15 + 0.85 * limit : 1);
      this.rb.addTorque(_force.copy(_up).multiplyScalar(-yawRate * damping), true);
      if (limit > 0) this.rb.addTorque(_force.copy(_up).multiplyScalar(-Math.sign(this.driftAngle) * limit * h.mass * cfg.driftLimit), true);
      // Slides carry their speed: hand back part of what sideways scrub takes, so drifts flow.
      const slide = smoothstep(0.15, 0.4, angle) * smoothstep(5, 9, speed);
      if (slide > 0 && scrub < 0) this.rb.addForce(_force.copy(_vh).multiplyScalar(-scrub * cfg.driftKeep * slide * (committed ? 1 : 0.4)), true);
      // Drift assist: in a committed drift, steering places the angle.
      if (committed && speed > 7) this.rb.addTorque(_force.copy(_up).multiplyScalar(-c.steer * h.mass * cfg.driftAssist * 2.2), true);
    } else {
      // Airborne: gently level the car so landings stay on four wheels.
      _tmp.copy(_up).cross(_r.set(0, 1, 0));
      this.rb.addTorque(_force.copy(_tmp).multiplyScalar(h.mass * cfg.airLevel), true);
    }

    this.recover(dt, c, speed);
    this.clampVelocity();
  }

  /** Called after the physics step each fixed tick. */
  afterStep(): void {
    this.interp.capture(this.rb);
  }

  update(alpha: number, dt: number): void {
    this.interp.sample(alpha, this.group.position, this.group.quaternion);
    // Wheels: steer, spin and sit on the suspension.
    for (let i = 0; i < 4; i++) {
      const wst = this.wheels[i]!;
      const m = this.wheelMeshes[i]!;
      const [mx, my, mz] = this.mounts[i]!;
      m.position.set(mx, my - wst.length, mz);
      m.rotation.set(0, 0, 0);
      m.rotateY(-wst.steer);
      m.rotateX(-wst.angle);
    }
    const lights = this.uLights.value;
    lights.y = damp(lights.y, this.controls.brake > 0.1 && this.speed > 0.5 ? 1 : 0, 18, dt);
    lights.w = this.speed < -0.5 ? 1 : 0;
    this.impact = Math.max(0, this.impact - dt * 400000);
  }

  setHeadlights(on: number): void {
    this.uLights.value.x = on;
  }

  setSiren(on: boolean): void {
    this.uLights.value.z = on ? 1 : 0;
  }

  setPaint(color: string): void {
    this.uPaint.value.set(color);
  }

  dispose(kit: MaterialKit): void {
    this.physics.removeBody(this.rb);
    if (!this.geo) {
      this.body.geometry.dispose();
      this.wheelMeshes[0]?.geometry.dispose();
    }
    kit.release(this.material);
    kit.release(this.glass);
  }

  private updateGearbox(vf: number, throttle: number, dt: number): void {
    const h = this.def.handling;
    const e = this.def.engine;
    const frac = clamp(Math.abs(vf) / h.topSpeed, 0, 1.1);
    const bands = [0, 0.16, 0.33, 0.52, 0.72, 0.94];
    let gear = 1;
    while (gear < 5 && frac > bands[gear]!) gear++;
    if (gear !== this.gear) {
      this.gear = gear;
      this.shiftTimer = 0.18;
    }
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    const lo = bands[gear - 1]!, hi = bands[gear]!;
    const inGear = clamp((frac - lo) / Math.max(0.01, hi - lo), 0, 1);
    const target = e.idleRpm + (e.redlineRpm - e.idleRpm) * (0.32 + 0.66 * inGear) * (throttle > 0.05 || Math.abs(vf) > 1 ? 1 : 0);
    const blip = this.shiftTimer > 0 ? -0.18 * e.redlineRpm : 0;
    this.rpm = damp(this.rpm, Math.max(e.idleRpm, target + blip + (throttle > 0.9 && Math.abs(vf) < 1 ? e.redlineRpm * 0.25 : 0)), 9, dt);
  }

  private recover(dt: number, c: VehicleControls, speed: number): void {
    // On its roof or side and resting on something: scrape to a stop, then auto-right.
    let grounded = false;
    if (_up.y < 0.3) {
      const b = this.def.body;
      const cy = b.clearance + (b.height - b.clearance) * 0.5;
      _p.copy(_origin).addScaledVector(_up, cy);
      grounded = this.physics.raycast(_p.x, _p.y, _p.z, 0, -1, 0, Math.max(b.width / 2, b.height - cy) + 0.4, Query.solid, this.rb).hit;
    }
    const lv = this.rb.linvel();
    if (grounded) {
      this.upsideDown += dt;
      // Sheet metal on asphalt drags far harder than the body's low wall-sliding friction.
      const m = this.def.handling.mass * cfg.roofDrag;
      this.rb.addForce({ x: -lv.x * m, y: 0, z: -lv.z * m }, true);
    } else this.upsideDown = 0;
    if (this.upsideDown > 1.4) {
      const t = this.rb.translation();
      const yaw = this.yaw;
      this.rb.setTranslation({ x: t.x, y: t.y + 1.2, z: t.z }, true);
      this.rb.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
      this.rb.setLinvel({ x: lv.x * 0.3, y: 0, z: lv.z * 0.3 }, true);
      this.rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      this.upsideDown = 0;
      this.righted++;
    }
    // Unstick: wedged on something while the driver keeps asking to go.
    if ((c.throttle > 0.5 || c.brake > 0.5) && speed < 0.4 && !this.airborne) this.stuck += dt;
    else this.stuck = 0;
    if (this.stuck > 2.6) {
      const t = this.rb.translation();
      this.rb.setTranslation({ x: t.x, y: t.y + 0.6, z: t.z }, true);
      this.rb.applyImpulse(_force.copy(_fwd).multiplyScalar(c.throttle > 0.5 ? 1200 : -1200), true);
      this.stuck = 0;
    }
  }

  private clampVelocity(): void {
    const lv = this.rb.linvel();
    const sp = Math.hypot(lv.x, lv.y, lv.z);
    if (sp > 95) this.rb.setLinvel({ x: (lv.x / sp) * 95, y: (lv.y / sp) * 95, z: (lv.z / sp) * 95 }, true);
    const av = this.rb.angvel();
    const w = Math.hypot(av.x, av.y, av.z);
    if (w > 7) this.rb.setAngvel({ x: (av.x / w) * 7, y: (av.y / w) * 7, z: (av.z / w) * 7 }, true);
  }
}
