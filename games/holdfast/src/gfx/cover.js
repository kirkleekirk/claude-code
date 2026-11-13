// What is open to the sky. Now and then (only while it rains or the ground is
// still wet) the land around the camera is drawn from straight above into a
// small height map. Rain is hidden wherever it would be under a roof, a porch,
// an awning or a tree; splashes land on whatever is highest; and only ground
// the sky can see gets wet. Every material reads it through one shared
// texture (see globals.js).
import * as THREE from 'three';
import { GFX, globalUniforms, COVER } from './globals.js';

export class Cover {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(COVER.px, COVER.px, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
    this.tex = globalUniforms().hfCover.value;
    const h = COVER.size / 2;
    this.cam = new THREE.OrthographicCamera(-h, h, h, -h, COVER.near, COVER.far);
    this.cam.up.set(0, 0, -1);
    // depth from above, packed into three bytes
    this.mat = new THREE.ShaderMaterial({
      vertexShader: THREE.ShaderLib.depth.vertexShader,
      fragmentShader: /* glsl */`
varying vec2 vHighPrecisionZW;
void main() {
	float d = clamp( 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5, 0.0, 0.99999 );
	vec3 e = fract( d * vec3( 1.0, 255.0, 65025.0 ) );
	e.xy -= e.yz / 255.0;
	gl_FragColor = vec4( e, 1.0 );
}`,
      side: THREE.DoubleSide,
    });
    this.timer = 0;
    this.at = new THREE.Vector3(1e9, 0, 0);
    this.white = new THREE.Color(1, 1, 1);
    this.prev = new THREE.Color();
  }
  // is a redraw due? (every 0.4 s, or sooner if the camera has moved far)
  due(dt, camPos) {
    this.timer -= dt;
    return this.timer <= 0 || Math.abs(camPos.x - this.at.x) + Math.abs(camPos.z - this.at.z) > 10;
  }
  render(scene, camPos) {
    this.timer = 0.4;
    const r = this.renderer, texel = COVER.size / COVER.px;
    const cx = Math.round(camPos.x / texel) * texel, cz = Math.round(camPos.z / texel) * texel, top = Math.round(camPos.y) + COVER.up;
    this.at.set(cx, top, cz);
    this.cam.position.set(cx, top, cz);
    this.cam.lookAt(cx, top - 10, cz);
    this.cam.updateMatrixWorld();
    const target = r.getRenderTarget(), over = scene.overrideMaterial, sm = r.shadowMap, auto = sm.autoUpdate, need = sm.needsUpdate, alpha = r.getClearAlpha();
    r.getClearColor(this.prev);
    sm.autoUpdate = false; sm.needsUpdate = false; // the sun's shadow maps are not this pass's business
    scene.overrideMaterial = this.mat;
    r.setRenderTarget(this.rt);
    r.setClearColor(this.white, 1); // nothing overhead
    r.clear();
    r.render(scene, this.cam);
    r.copyFramebufferToTexture(this.tex);
    scene.overrideMaterial = over;
    sm.autoUpdate = auto; sm.needsUpdate = need;
    r.setRenderTarget(target);
    r.setClearColor(this.prev, alpha);
    // world rect of the map and the height its top edge stands for
    GFX.cover[0] = cx - COVER.size / 2; GFX.cover[1] = cz - COVER.size / 2; GFX.cover[2] = COVER.size; GFX.cover[3] = top;
  }
  dispose() { this.rt.dispose(); this.mat.dispose(); }
}
