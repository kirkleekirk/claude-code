import { signal, type Signal } from '@preact/signals-core';
import { DepthOfFieldEffect } from 'postprocessing';
import { Vector3 } from 'three';
import { clockHours } from '@/core/clock';
import { clamp } from '@/core/math';
import type { PhotoModeControls, PhotoModeState, UiApi } from '@/ui/api';
import type { Game, GameSystem } from './Game';

/** How far the free camera may wander from where photo mode was opened. */
const TETHER = 40;
const MOVE_SPEED = 6;
const DEFAULT_STATE: PhotoModeState = {
  fov: 50, dof: false, focusDistance: 6, aperture: 0.4, exposure: 0, timeOfDay: 18.7, grade: 'none', hideCharacters: false, watermark: true,
};
/** Grade looks layered over the environment grade (warmth, fade, mono). */
const LOOKS: Record<PhotoModeState['grade'], { warmth: number; fade: number; mono: number }> = {
  none: { warmth: 0, fade: 0, mono: 0 },
  golden: { warmth: 0.55, fade: 0.12, mono: 0 },
  noir: { warmth: -0.1, fade: 0.08, mono: 1 },
  neon: { warmth: -0.35, fade: 0, mono: 0 },
};

const _fwd = new Vector3();
const _right = new Vector3();
const _look = new Vector3();

export interface PhotoModeHost {
  /** Objects hidden by "hide characters" (the player's actor, the crowd). */
  characters(): Iterable<{ visible: boolean }>;
}

/**
 * Photo Mode: freezes the world, hands the camera to the player within a tether, and applies the
 * panel's settings live (field of view, depth of field, exposure, time of day, grade, hiding
 * people). Captures render a fresh frame, add the optional watermark and return a PNG.
 */
export class PhotoMode implements GameSystem {
  readonly state: Signal<PhotoModeState> = signal({ ...DEFAULT_STATE });
  readonly mode: Signal<'camera' | 'panel'> = signal('camera');
  private active = false;
  private readonly pos = new Vector3();
  private readonly anchor = new Vector3();
  private readonly target = new Vector3();
  private yaw = 0;
  private pitch = 0;
  private savedHours = 0;
  private savedFov = 60;
  private dof: DepthOfFieldEffect | null = null;
  private savedMsaa = 0;
  private popContext: (() => void) | null = null;
  private readonly hidden: Array<{ visible: boolean }> = [];
  private readonly look = { x: 0, y: 0 };

  constructor(private readonly game: Game, private readonly ui: UiApi, private readonly host: PhotoModeHost) {}

  get isActive(): boolean {
    return this.active;
  }

  open(): void {
    if (this.active) return;
    const gfx = this.game.ctx.gfx;
    const cam = gfx.camera;
    this.active = true;
    this.pos.copy(cam.position);
    this.anchor.copy(cam.position);
    cam.getWorldDirection(_fwd);
    this.yaw = Math.atan2(-_fwd.x, -_fwd.z);
    this.pitch = Math.asin(clamp(_fwd.y, -1, 1));
    this.savedHours = clockHours(this.game.clock);
    this.savedFov = cam.fov;
    this.state.value = { ...DEFAULT_STATE, fov: Math.round(cam.fov), timeOfDay: Math.round(this.savedHours * 4) / 4 };
    this.mode.value = 'camera';
    this.popContext = this.game.ctx.input.pushContext('photo');
    if (gfx.quality.post) {
      // Depth of field reads a depth copy, which cannot be blitted out of a multisampled buffer.
      this.savedMsaa = gfx.post.composer.multisampling;
      gfx.post.composer.multisampling = 0;
      this.dof = new DepthOfFieldEffect(cam, { focusDistance: DEFAULT_STATE.focusDistance, focusRange: 3, bokehScale: 0 });
      gfx.post.setExtraEffects([this.dof]);
    }
    this.ui.openPhotoMode(this.controls);
  }

  readonly controls: PhotoModeControls = {
    state: this.state,
    set: (key, value) => {
      this.state.value = { ...this.state.value, [key]: value };
    },
    mode: this.mode,
    setMode: (m) => {
      this.mode.value = m;
    },
    capture: () => this.capture(),
    exit: () => this.close(),
  };

  close(): void {
    if (!this.active) return;
    this.active = false;
    const gfx = this.game.ctx.gfx;
    this.popContext?.();
    this.popContext = null;
    if (this.dof) {
      gfx.post.setExtraEffects([]);
      this.dof.dispose();
      this.dof = null;
      gfx.post.composer.multisampling = this.savedMsaa;
    }
    gfx.post.exposureScale = 1;
    gfx.post.grade.setLook(LOOKS.none);
    this.game.setTime(this.savedHours);
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
    this.game.cameraPin = null;
    gfx.camera.fov = this.savedFov;
    gfx.camera.updateProjectionMatrix();
    this.ui.closePhotoMode();
  }

  update(_dt: number, _alpha: number, dtReal: number): void {
    if (!this.active) return;
    const { input, gfx, settings } = this.game.ctx;
    const st = this.state.value;
    if (this.mode.value === 'camera') {
      input.look(this.look, dtReal, {
        mouseSensitivity: settings.peek('controls.mouseSensitivity') / 100,
        padSensitivity: settings.peek('controls.padSensitivity') / 100,
        invertY: settings.peek('controls.invertY'),
      });
      this.yaw -= this.look.x;
      this.pitch = clamp(this.pitch - this.look.y, -1.45, 1.45);
      const cp = Math.cos(this.pitch);
      _fwd.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
      _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const step = MOVE_SPEED * dtReal;
      this.pos.addScaledVector(_fwd, input.value('photoY') * step);
      this.pos.addScaledVector(_right, input.value('photoX') * step);
      this.pos.y += input.value('photoRise') * step;
      // Stay within the tether and above the ground.
      const dx = this.pos.x - this.anchor.x, dz = this.pos.z - this.anchor.z;
      const d = Math.hypot(dx, dz);
      if (d > TETHER) {
        this.pos.x = this.anchor.x + (dx / d) * TETHER;
        this.pos.z = this.anchor.z + (dz / d) * TETHER;
      }
      const floor = this.game.ctx.physics.groundHeight(this.pos.x, this.pos.z, this.pos.y + 1, this.pos.y - 50) + 0.3;
      this.pos.y = clamp(this.pos.y, floor, this.anchor.y + 30);
    }
    const cp = Math.cos(this.pitch);
    _look.set(this.pos.x - Math.sin(this.yaw) * cp, this.pos.y + Math.sin(this.pitch), this.pos.z - Math.cos(this.yaw) * cp);
    this.target.copy(_look);
    this.game.cameraPin = { position: this.pos, target: this.target, fov: st.fov };

    gfx.post.exposureScale = Math.pow(2, st.exposure);
    gfx.post.grade.setLook(LOOKS[st.grade]);
    if (Math.abs(clockHours(this.game.clock) - st.timeOfDay) > 0.01) this.game.setTime(st.timeOfDay);
    if (this.dof) {
      this.dof.cocMaterial.focusDistance = st.focusDistance;
      this.dof.bokehScale = st.dof ? 1 + st.aperture * 5 : 0;
    }
    if (st.hideCharacters && this.hidden.length === 0) {
      for (const o of this.host.characters()) {
        if (!o.visible) continue;
        o.visible = false;
        this.hidden.push(o);
      }
    } else if (!st.hideCharacters && this.hidden.length) {
      for (const o of this.hidden) o.visible = true;
      this.hidden.length = 0;
    }
  }

  /** Render the shot without UI and return it as a PNG (watermarked when asked). */
  private capture(): Promise<Blob | null> {
    const gfx = this.game.ctx.gfx;
    // The camera already holds this frame's photo pose; draw it fresh, without the interface.
    gfx.render(0);
    const src = gfx.canvas;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const g = out.getContext('2d');
    if (!g) return Promise.resolve(null);
    // Copy in the same task as the render: the WebGL buffer is cleared once composited.
    g.drawImage(src, 0, 0);
    if (this.state.value.watermark) drawWatermark(g, out.width, out.height);
    return new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/png'));
  }
}

function drawWatermark(g: CanvasRenderingContext2D, w: number, h: number): void {
  const size = Math.max(14, Math.round(h * 0.028));
  g.save();
  g.font = `italic 700 ${size}px Fraunces, Georgia, serif`;
  g.textAlign = 'right';
  g.textBaseline = 'alphabetic';
  g.shadowColor = 'rgba(20, 8, 40, 0.55)';
  g.shadowBlur = size * 0.4;
  g.fillStyle = 'rgba(255, 244, 227, 0.86)';
  g.fillText('Hothouse', w - size * 1.1, h - size * 1.6);
  g.font = `600 ${Math.round(size * 0.5)}px Figtree, system-ui, sans-serif`;
  g.fillStyle = 'rgba(255, 209, 102, 0.9)';
  g.fillText('HALCYON BAY', w - size * 1.1, h - size * 0.9);
  g.restore();
}
