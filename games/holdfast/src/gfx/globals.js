// Shared shader state. A handful of values (where the sun is, the colour of
// the haze, the clouds overhead, how wet the ground is) are needed by nearly
// every material, so they live in typed arrays that all materials point at,
// and the engine's fog and light chunks are replaced with the game's own:
//   - haze thickens with distance, lies in the low ground, and takes the
//     colour of the sky in that direction (so far hills melt into it);
//   - the sun's light is shadowed by a ring of shadow maps centred on what
//     you're looking at (sharp close up, still there across the valley) and
//     by the clouds drifting overhead;
//   - without the post pipeline, materials tone-map with the same film look.
// Pinned to three r170: the chunk names and the uniform cloning this leans on
// are checked at start-up and it falls back to the stock engine if they move.
import * as THREE from 'three';
import { noiseTexture } from './noise.js';
import { TONEMAP_GLSL, LOOK } from './tonemap.js';

// (kept on the page so a module reloaded while developing shares the same arrays)
const STATE = globalThis.__hfGfx || (globalThis.__hfGfx = {
  GFX: {
    sunDir: new Float32Array([0.3, 0.8, 0.2]),   // toward the sun, even after it has set
    fogCol: new Float32Array([0.6, 0.72, 0.85]), // haze colour (linear)
    sunGlow: new Float32Array([0.3, 0.2, 0.1]),  // extra haze colour toward the sun
    fogA: new Float32Array([0.004, 0.07, 12, 1]), // ground mist: density, falloff with height, base height, overall strength
    fogB: new Float32Array([0.0002, 420, 620, 0]), // thin haze per metre, fade-out start, fade-out end
    cloud: new Float32Array([0, 0, 0.3, 0]),     // cloud drift (uv x, y), cover, shadow strength
    misc: new Float32Array([0, 0, 0.3, 0]),      // wetness, time, wind, lightning
    cover: new Float32Array([0, 0, 64, -1e5]),   // the cover map's corner (x, z), its size, and the height of its top (see cover.js)
    ready: false,
  },
  uniforms: null, orig: null,
});
export const GFX = STATE.GFX;

// The cover map (cover.js): a top-down height map of what stands around the
// camera, so rain and wetness know what is open to the sky.
export const COVER = { size: 64, px: 512, near: 1, far: 170, up: 70, layer: 3 };
// things the cover map must not see (the sky's dome, grass, the rain itself, particles) live on this layer only
export function skyAndEffects(obj) { obj.layers.set(COVER.layer); return obj; }
// the height of the highest thing over a point, and whether a point is open to the sky
// (v runs north to south in the map: its camera looks down with north up)
export const COVER_GLSL = /* glsl */`
#ifndef HF_COVER_FN
#define HF_COVER_FN
uniform sampler2D hfCover;
uniform vec4 hfCoverRect;
float hfCoverTop( vec2 xz ) {
	vec2 uv = ( xz - hfCoverRect.xy ) / hfCoverRect.z;
	if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return - 1e5;
	vec3 e = texture2D( hfCover, vec2( uv.x, 1.0 - uv.y ) ).rgb;
	float d = dot( e, vec3( 1.0, 1.0 / 255.0, 1.0 / 65025.0 ) );
	return hfCoverRect.w - ${COVER.near.toFixed(1)} - d * ${(COVER.far - COVER.near).toFixed(1)};
}
float hfOpenSky( vec3 wp ) { return 1.0 - smoothstep( 0.3, 0.7, hfCoverTop( wp.xz ) - wp.y ); }
#endif
`;

// height of the cloud deck and the size of the noise tile over the land
export const CLOUD_H = 900, CLOUD_S = 1 / 4200;

export const CLOUD_GLSL = /* glsl */`
#ifndef HF_CLOUD_FN
#define HF_CLOUD_FN
uniform vec4 hfCloud;
uniform sampler2D hfNoise;
float hfCloudDens( vec2 uv, float cover ) {
	float b = texture2D( hfNoise, uv ).r;
	float m = texture2D( hfNoise, uv * 3.1 + vec2( 0.37, 0.11 ) ).g;
	float c = b * 0.76 + m * 0.24;
	float lo = mix( 0.8, 0.1, cover );
	return smoothstep( lo, lo + 0.17, c );
}
#endif
`;
export const HAZE_GLSL = /* glsl */`
#ifndef HF_HAZE_FN
#define HF_HAZE_FN
uniform vec3 hfSunDir;
uniform vec3 hfFogCol;
uniform vec3 hfSunGlow;
uniform vec4 hfFogA;
uniform vec4 hfFogB;
// the colour of the haze in a direction: the horizon colour, warmer and brighter toward the sun
vec3 hfHaze( vec3 d ) {
	float s = max( dot( d, hfSunDir ), 0.0 );
	float s2 = s * s, s8 = s2 * s2 * s2 * s2;
	return hfFogCol + hfSunGlow * ( s2 * 0.1 + s8 * 0.4 + s8 * s8 * s8 * s8 * s8 * s8 * 0.8 );
}
#endif
`;
const FOG_FN = /* glsl */`
vec3 hfFog( vec3 col, vec3 viewPos ) {
	vec3 rel = viewPos * mat3( viewMatrix );
	float dist = length( rel );
	vec3 d = rel / max( dist, 1e-3 );
	float camH = max( cameraPosition.y - hfFogA.z, - 30.0 );
	float k = hfFogA.y * d.y;
	float integ = abs( k ) > 1e-4 ? ( 1.0 - exp( min( - k * dist, 40.0 ) ) ) / k : dist;
	float od = hfFogA.x * exp( - hfFogA.y * camH ) * integ + hfFogB.x * dist;
	float f = 1.0 - exp( - od );
	f = max( f, smoothstep( hfFogB.y, hfFogB.z, dist ) ) * hfFogA.w;
	return mix( col, hfHaze( d ), f );
}
`;

// the uniform objects themselves, for hand-written shader materials
// the cover map every material reads: a plain texture the renderer copies its top-down pass into
function coverTexture() {
  const t = new THREE.FramebufferTexture(COVER.px, COVER.px);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.name = 'hfCover';
  return t;
}
export function globalUniforms() {
  if (STATE.uniforms) return STATE.uniforms;
  STATE.uniforms = {
    hfSunDir: { value: GFX.sunDir }, hfFogCol: { value: GFX.fogCol }, hfSunGlow: { value: GFX.sunGlow },
    hfFogA: { value: GFX.fogA }, hfFogB: { value: GFX.fogB }, hfCloud: { value: GFX.cloud }, hfMisc: { value: GFX.misc },
    hfNoise: { value: noiseTexture() },
    hfCover: { value: coverTexture() }, hfCoverRect: { value: GFX.cover },
  };
  return STATE.uniforms;
}

export function installGfx(again = false) {
  if (GFX.ready && !again) return true;
  const C = THREE.ShaderChunk;
  // always patch from the engine's own text
  if (!STATE.orig) STATE.orig = { lf: C.lights_fragment_begin, tm: C.tonemapping_pars_fragment, lp: C.lights_pars_begin, rm: C.roughnessmap_fragment };
  const lf = STATE.orig.lf, tm = STATE.orig.tm || '';
  const a = lf ? lf.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )') : -1;
  const b = lf ? lf.indexOf('#if ( NUM_RECT_AREA_LIGHTS > 0 )') : -1;
  const customTM = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
  if (a < 0 || b < a || !tm.includes(customTM) || !C.fog_pars_fragment || !STATE.orig.lp) {
    console.warn('gfx: this three.js build does not match; using stock fog and lighting');
    return false;
  }
  const U = globalUniforms();
  // every built-in material gets the shared values (typed arrays are passed by reference when uniforms are cloned)
  for (const k in THREE.ShaderLib) Object.assign(THREE.ShaderLib[k].uniforms, U);
  Object.assign(THREE.UniformsLib.fog, U);

  // ---- haze ----
  C.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogView;\n#endif\n';
  C.fog_vertex = '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogView = mvPosition.xyz;\n#endif\n';
  C.fog_pars_fragment = `#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogView;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	${HAZE_GLSL}
	${FOG_FN}
#endif
`;
  // haze goes on before tone mapping (in scene light), not after it
  C.fog_fragment = '';
  C.tonemapping_fragment = `#ifdef USE_FOG
	gl_FragColor.rgb = hfFog( gl_FragColor.rgb, vFogView );
#endif
#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif
`;
  C.tonemapping_pars_fragment = tm.replace(customTM, `${TONEMAP_GLSL}
vec3 CustomToneMapping( vec3 color ) { return hfTonemap( color * toneMappingExposure, ${LOOK.power.toFixed(3)}, ${LOOK.sat.toFixed(3)} ); }`);

  // ---- sun: shadow cascades and cloud shadows ----
  C.lights_pars_begin = STATE.orig.lp + `
${CLOUD_GLSL}
uniform vec4 hfMisc;
${COVER_GLSL}
// the sun as it reaches this fragment: its colour under the clouds before
// shadows, and how much of it the shadow maps let through (for light that
// passes through leaves and grass)
#define HF_SUN
vec3 hfSunCol = vec3( 0.0 );
float hfSunVis = 1.0;
// how much of the sun gets through the clouds to a point (view space)
float hfCloudShade( vec3 viewPos, vec3 lightDirView ) {
	if ( hfCloud.w < 0.004 ) return 1.0;
	vec3 wp = cameraPosition + viewPos * mat3( viewMatrix );
	vec3 L = lightDirView * mat3( viewMatrix );
	vec2 uv = ( wp.xz + L.xz * ( ( ${CLOUD_H.toFixed(1)} - wp.y ) / max( L.y, 0.16 ) ) ) * ${CLOUD_S.toFixed(8)} + hfCloud.xy;
	return 1.0 - hfCloud.w * hfCloudDens( uv, hfCloud.z );
}
`;
  const sunBlock = `#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )

	// one sun (or moon): the first directional light. Any others are only
	// there to carry further shadow maps, each covering a wider area.
	DirectionalLight directionalLight;
	directionalLight = directionalLights[ 0 ];
	getDirectionalLightInfo( directionalLight, directLight );

	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	if ( receiveShadow ) {
		float hfLit = 0.0, hfRem = 1.0, hfEdge = 0.0, hfK = 0.0;
		vec3 hfP = vec3( 0.0 );
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			hfP = vDirectionalShadowCoord[ i ].xyz / vDirectionalShadowCoord[ i ].w;
			hfEdge = max( abs( hfP.x - 0.5 ), abs( hfP.y - 0.5 ) ) * 2.0;
			if ( hfRem > 0.003 && hfEdge < 1.0 && hfP.z < 1.0 ) {
				hfK = 1.0 - smoothstep( 0.84, 1.0, hfEdge );
				hfLit += hfRem * hfK * getShadow( directionalShadowMap[ i ], directionalLightShadows[ i ].shadowMapSize, directionalLightShadows[ i ].shadowIntensity, directionalLightShadows[ i ].shadowBias, directionalLightShadows[ i ].shadowRadius, vDirectionalShadowCoord[ i ] );
				hfRem *= 1.0 - hfK;
			}
		}
		#pragma unroll_loop_end
		hfSunVis = hfLit + hfRem;
	}
	#endif

	hfSunCol = directLight.color * hfCloudShade( geometryPosition, directionalLight.direction );
	// (leaves let light through: a material can say how much still reaches it in shadow)
	#ifdef HF_SHADOW_FLOOR
	directLight.color = hfSunCol * mix( HF_SHADOW_FLOOR, 1.0, hfSunVis );
	#else
	directLight.color = hfSunCol * hfSunVis;
	#endif

	RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

#endif

`;
  C.lights_fragment_begin = lf.slice(0, a) + sunBlock + lf.slice(b);

  // ---- rain: ground the sky can see darkens and shines, and pools where it lies level ----
  C.roughnessmap_fragment = STATE.orig.rm + `
#if defined( HF_SUN ) && ! defined( FLAT_SHADED )
	if ( hfMisc.x > 0.01 ) {
		vec3 hfWp = cameraPosition - vViewPosition * mat3( viewMatrix );
		float hfUpN = ( normalize( vNormal ) * mat3( viewMatrix ) ).y;
		float hfWet = hfMisc.x * hfOpenSky( hfWp ) * smoothstep( - 0.2, 0.5, hfUpN );
		float hfPool = smoothstep( 0.6, 0.76, texture2D( hfNoise, hfWp.xz * 0.045 ).r ) * smoothstep( 0.9, 0.99, hfUpN ) * smoothstep( 0.45, 1.0, hfMisc.x );
		#ifdef HF_TERRAIN
			// (grass hides the wet earth under it: only bare dirt, gravel and sand pool and shine)
			float hfBare = wl[ 2 ] + wl[ 3 ] + wl[ 4 ];
			hfPool *= hfBare; hfWet *= 0.45 + 0.55 * hfBare;
		#endif
		diffuseColor.rgb *= 1.0 - 0.36 * hfWet;
		roughnessFactor = mix( roughnessFactor, mix( 0.32, 0.05, hfPool ), hfWet * smoothstep( 0.3, 0.9, hfUpN ) );
	}
#endif
`;
  GFX.ready = true;
  return true;
}
