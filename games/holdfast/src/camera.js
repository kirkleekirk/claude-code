// Over-the-shoulder third-person camera that never clips through walls,
// floors, roofs or the ground.
import * as THREE from 'three';

export class ThirdPersonCamera {
  constructor(camera, physics) {
    this.camera = camera;
    this.physics = physics;
    this.yaw = Math.PI;      // 0 looks toward -Z
    this.pitch = -0.18;
    this.dist = 3.6;
    this.curDist = 3.6;
    this.aim = 0;
    this.shoulder = 0.5;
    this.pos = new THREE.Vector3();
    this.sens = 0.0024;
    this.touchSens = 0.0065;
    this.invertY = false;
  }
  get forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get right() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  look(dx, dy, touch = false) {
    const s = touch ? this.touchSens : this.sens;
    this.yaw -= dx * s;
    this.pitch -= dy * s * (this.invertY ? -1 : 1);
    this.pitch = Math.max(-1.25, Math.min(0.95, this.pitch));
  }
  update(dt, target, aiming, crouch = false) {
    this.aim += ((aiming ? 1 : 0) - this.aim) * Math.min(1, dt * 10);
    const pivot = new THREE.Vector3(target.x, target.y + (crouch ? 1.15 : 1.55), target.z);
    const right = this.right;
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    const want = this.dist * (1 - this.aim * 0.55);
    const sh = this.shoulder * (1 + this.aim * 0.3);
    // shoulder offset, shortened if a wall is beside the player
    let side = this.physics.raycast(pivot.x, pivot.y, pivot.z, right.x, 0, right.z, sh + 0.25, { skipGlass: true, noTerrain: true, filter: camFilter }).dist - 0.25;
    side = Math.max(0, Math.min(sh, side));
    const base = pivot.clone().addScaledVector(right, side);
    const back = dir.clone().multiplyScalar(-1);
    const hit = this.physics.raycast(base.x, base.y, base.z, back.x, back.y, back.z, want + 0.3, { skipGlass: true, filter: camFilter, terrainPad: 0.35, pad: 0.12 });
    let d = Math.max(0.35, Math.min(want, hit.dist - 0.25));
    // pull in quickly, ease out slowly
    if (d < this.curDist) this.curDist = d; else this.curDist += (d - this.curDist) * Math.min(1, dt * 3);
    this.pos.copy(base).addScaledVector(back, this.curDist);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(base.clone().addScaledVector(dir, 10));
    const zoom = 1 + this.aim * ((this.zoom || 1) - 1);
    this.camera.fov += ((62 - this.aim * 14) / zoom - this.camera.fov) * Math.min(1, dt * 8);
    this.camera.updateProjectionMatrix();
  }
}
function camFilter(b) { return b.kind !== 'tree' && b.kind !== 'prop-small' && b.kind !== 'zombie'; }
