// What the plants share: the wind, the weight of wheels on grass, and the
// way light falls on leaves. Also the pampas clumps along the fences.
import * as THREE from 'three';
import { lerp } from '../util.js';
import { pampasTexture } from '../textures.js';

export const windUniforms = { uTime: { value: 0 }, uWind: { value: 0.4 } };
export function updateWind(dt, wind) {
  windUniforms.uTime.value += dt;
  windUniforms.uWind.value = lerp(windUniforms.uWind.value, wind, Math.min(1, dt * 0.5));
}

// Cars flatten the grass under them: up to four nearby cars as
// (x, z, cos yaw, sin yaw) and (half length, half width).
export const carFlat = {
  uCarA: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(1e6, 1e6, 1, 0)) },
  uCarB: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) },
};

// Light on leaves (for a Lambert material's fragment shader). A card of
// leaves is lit by the normal it was given, whichever way it happens to face;
// the light wraps a little way round, a shadow never quite blacks it out
// (leaves pass light on), and with the sun behind it the leaf glows.
// `mask` is a GLSL float: 1 where the fragment is leaf, 0 where it is wood.
export function leafLight(sh, mask = '1.0', upright = 0) {
  // (upright plants given a plain upward normal lean it toward a low sun, as standing leaves would catch it)
  const lean = upright ? `
#if NUM_DIR_LIGHTS > 0
	{ vec3 hfUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ), hfDl = directionalLights[ 0 ].direction; normal = normalize( normal + ( hfDl - hfUp * dot( hfDl, hfUp ) ) * ${upright.toFixed(2)} ); }
#endif` : '';
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n#define HF_SHADOW_FLOOR 0.38')
    .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize( vNormal );' + lean + '\nvec3 nonPerturbedNormal = normal;')
    .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
#if NUM_DIR_LIGHTS > 0
	{
		vec3 hfL = directionalLights[ 0 ].direction;
		float hfNL = dot( normal, hfL );
		float hfWrap = clamp( ( hfNL + 0.45 ) / 1.45, 0.0, 1.0 ) - clamp( hfNL, 0.0, 1.0 );
		float hfBack = pow( max( dot( geometryViewDir, - hfL ), 0.0 ), 4.0 );
		#ifdef HF_SUN
			vec3 hfThrough = hfSunCol * ( 0.25 + 0.75 * hfSunVis );
		#else
			vec3 hfThrough = directLight.color;
		#endif
		reflectedLight.directDiffuse += directLight.color * BRDF_Lambert( diffuseColor.rgb ) * hfWrap * 0.8;
		reflectedLight.directDiffuse += hfThrough * BRDF_Lambert( diffuseColor.rgb * vec3( 1.25, 1.15, 0.5 ) ) * ( hfBack * 1.5 + 0.1 ) * ( ${mask} );
	}
#endif`)
    // foliage has no reflected surroundings of its own: more of the sky's light instead
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n\treflectedLight.indirectDiffuse *= vec3( 1.6, 1.75, 1.5 );');
}

// A cut-out plant material that sways and is lit as leaves.
//   sway: GLSL float, 0 at the root to 1 at the top    origin: GLSL vec2, where it stands (for the phase)
export function plantMaterial(tex, quality, { alphaTest = 0.4, amp = 0.1, sway = 'uv.y', origin = 'position.xz', pars = '' } = {}) {
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest, side: THREE.DoubleSide, vertexColors: true });
  mat.alphaToCoverage = !!(quality && quality.post && quality.msaa);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.uniforms.uWind = windUniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime; uniform float uWind;\n${pars}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec2 ip = ${origin};
          float k = ${sway}; k *= k;
          float ph = uTime * 1.7 + ip.x * 0.31 + ip.y * 0.17;
          float s = sin( ph ) * 0.6 + sin( ph * 2.3 + 1.7 ) * 0.3;
          transformed.x += s * ${amp.toFixed(3)} * k * ( 0.4 + uWind );
          transformed.z += cos( ph * 0.9 ) * ${(amp * 0.6).toFixed(3)} * k * ( 0.4 + uWind );
        }`);
    leafLight(sh, '1.0', 0.45);
  };
  mat.customProgramCacheKey = () => ['plant', amp, sway, origin, pars].join('|');
  return mat;
}

// ---------------- pampas / tall grass clumps (static) ----------------
export function buildClumps(scene, points, quality) {
  const mat = plantMaterial(pampasTexture(), quality, { amp: 0.15, sway: 'clamp( position.y / 2.2, 0.0, 1.0 )', origin: 'vec2( instanceMatrix[ 3 ][ 0 ], instanceMatrix[ 3 ][ 2 ] )' });
  const g = crossedQuads(2.2, 2.3);
  const inst = new THREE.InstancedMesh(g, mat, Math.max(1, points.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  points.forEach((p, i) => {
    q.setFromAxisAngle(up, p.r);
    m4.compose(new THREE.Vector3(p.x, p.y - 0.05, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    inst.setMatrixAt(i, m4);
  });
  inst.count = points.length;
  inst.castShadow = true; inst.receiveShadow = true;
  scene.add(inst);
  return inst;
}

function crossedQuads(w, h, n = 2) {
  const pos = [], uv = [], nor = [], idx = [], col = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI;
    const c = Math.cos(a) * w / 2, s = Math.sin(a) * w / 2;
    const b = pos.length / 3;
    pos.push(-c, 0, -s, c, 0, s, c, h, s, -c, h, -s);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let k = 0; k < 4; k++) { nor.push(0, 1, 0); col.push(k < 2 ? 0.7 : 1, k < 2 ? 0.7 : 1, k < 2 ? 0.7 : 1); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
