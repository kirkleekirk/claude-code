// CastleMiner Z's own bodies for the dead: the zombie and the four skeletons (plain, axes,
// sword and archer), skinned, with every animation clip they have and their skins, from the
// copy ripped out of the game (tools/cmz/rip_models.py writes them to local-assets/models,
// which is never committed). Lit like everything else in the world. Without the ripped files
// the dead are built on the avatar rig instead (see ../enemy.js).

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadGltfJson } from './gltf.js';
import { fileFetch, fileUrl } from '../../core/files.js';
import { GLSL_SKY_COMMON } from '../../gfx/sky.js';
import { GLSL_LIGHTING } from '../../gfx/terrainMaterial.js';

const BASE = 'local-assets/models/';

const VS = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 w = modelMatrix * vec4(transformed, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * objectNormal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FS = /* glsl */ `
${GLSL_SKY_COMMON}
${GLSL_LIGHTING}
uniform vec2 uObjLight;
uniform sampler2D uMap;
uniform float uFlash;
uniform float uOpacity;
uniform vec3 uViewPos;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
void main() {
  // fading out: a fine dither, so it stays in the opaque pass
  if (uOpacity < 1.0 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > uOpacity) discard;
  vec3 n = normalize(vNormalW);
  if (!gl_FrontFacing) n = -n;
  vec3 albedo = texture2D(uMap, vUv).rgb;
  vec3 light = lightAt(vWorld, n, uObjLight.x, uObjLight.y, 1.0);
  vec3 col = albedo * light;
  vec3 v = normalize(vWorld - uViewPos);
  float rim = pow(1.0 - max(dot(n, -v), 0.0), 3.0);
  col += skyLookup(normalize(vec3(n.x, abs(n.y) + 0.1, n.z))) * rim * 0.1 * lightCurve(uObjLight.x) * albedo;
  col = mix(col, vec3(1.0, 0.18, 0.12) * max(light.r, 0.3), uFlash);
  col = applyFog(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

function makeMaterial(sky, terrain, map) {
  const uniforms = {
    ...sky,
    uFogStart: terrain.uFogStart, uFogEnd: terrain.uFogEnd, uHaze: terrain.uHaze,
    uShadowMap: terrain.uShadowMap, uShadowMatrix: terrain.uShadowMatrix, uShadowOn: terrain.uShadowOn,
    uShadowLightDir: terrain.uShadowLightDir, uShadowTexel: terrain.uShadowTexel,
    uObjLight: { value: new THREE.Vector2(1, 0) },
    uMap: { value: map },
    uFlash: { value: 0 },
    uOpacity: { value: 1 },
    uViewPos: { value: new THREE.Vector3() },
  };
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide });
  m.onBeforeRender = (r, s, cam) => { uniforms.uViewPos.value.setFromMatrixPosition(cam.matrixWorld); };
  return m;
}

let LOADED = null;

// The models, clips and skins, once; false if they aren't there.
export function loadCmzBodies() {
  if (!LOADED) LOADED = load();
  return LOADED;
}

async function load() {
  try {
    const r = await fileFetch(BASE + 'index.json');
    if (!r.ok) return false;
    const idx = await r.json();
    const models = {};
    await Promise.all(Object.entries(idx.models).map(async ([name, info]) => {
      const g = await loadGltfJson(BASE + info.file);
      g.scene.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        // the clips swing the bodies well outside their bind pose (climbing out of the ground,
        // lying dead): a sphere round all of it
        o.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2.6);
      });
      models[name] = { scene: g.scene, clips: new Map(g.animations.map((c) => [c.name, c])), info };
    }));
    for (const m of Object.values(models)) if (!m.clips.size && m.info.clipsFrom) m.clips = models[m.info.clipsFrom].clips;
    const tl = new THREE.TextureLoader();
    const skins = await Promise.all(idx.textures.map((t) => tl.loadAsync(fileUrl(BASE + t.file)).then((tex) => {
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    })));
    return { models, skins };
  } catch {
    return false;
  }
}

// One body: a clone of a model with its own material (each is lit, flashes and fades on its
// own), playing the original's clips by name. The original faces its models down -z; ours
// face +z, as the avatars do.
export class CmzBody {
  constructor(L, model, skin, sky, terrain) {
    const M = L.models[model];
    this.root = new THREE.Group();
    this.inner = cloneSkinned(M.scene);
    this.inner.rotation.y = Math.PI;
    this.root.add(this.inner);
    this.material = makeMaterial(sky, terrain, L.skins[skin] || L.skins[0]);
    this.inner.traverse((o) => { if (o.isMesh) o.material = this.material; });
    this.clips = M.clips;
    this.mixer = new THREE.AnimationMixer(this.inner);
    this.action = null;
  }

  has(name) { return this.clips.has(name); }

  duration(name) { return this.clips.get(name)?.duration ?? 0; }

  // the original's PlayClip: blend into the clip over `fade` seconds
  play(name, { loop = false, fade = 0.25, speed = 1 } = {}) {
    const clip = this.clips.get(name);
    if (!clip) return;
    const a = this.mixer.clipAction(clip);
    a.enabled = true;
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.reset();
    a.setEffectiveTimeScale(speed);
    a.setEffectiveWeight(1);
    a.play();
    if (this.action && this.action !== a) this.action.crossFadeTo(a, fade, false);
    this.action = a;
  }

  setSpeed(s) { this.action?.setEffectiveTimeScale(s); }

  stop() { this.action?.stop(); this.action = null; }

  update(dt) { this.mixer.update(dt); }

  setLight(sky, block) { this.material.uniforms.uObjLight.value.set(sky, block); }

  set flash(v) { this.material.uniforms.uFlash.value = v; }

  set opacity(v) { this.material.uniforms.uOpacity.value = v; }

  dispose() {
    this.mixer.stopAllAction();
    this.material.dispose();
    this.root.removeFromParent();
  }
}
