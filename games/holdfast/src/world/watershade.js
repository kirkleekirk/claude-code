// How water looks, shared by the river and the creek. The surface is three
// sizes of ripple carried along by the current (and ringed by rain); it
// mirrors the sky it is under, clouds included, and the dark line of the
// banks and their trees; the sun or moon lays a glittering path across it;
// and what shows through is the muddy water itself, paler in the shallows.
import * as THREE from 'three';
import { globalUniforms, CLOUD_GLSL, HAZE_GLSL, CLOUD_H, CLOUD_S } from '../gfx/globals.js';
import { waveTexture } from '../gfx/noise.js';

export const WATER_PARS = /* glsl */`
${HAZE_GLSL}
${CLOUD_GLSL}
uniform float uTime; uniform float uRain; uniform float uWind;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb; uniform vec3 uLandCol;
uniform vec3 uZenith; uniform vec3 uCloudLit; uniform vec3 uCloudShade;
uniform sampler2D uWaveTex;
uniform sampler2D uLand; uniform vec4 uLandGrid; uniform vec2 uLandN; uniform float uLandOn;

// the sky in a direction, as the dome draws it (without the sun's disc)
vec3 hfSkyAt( vec3 d, vec3 wp ) {
	vec3 c = mix( hfHaze( d ), uZenith, 1.0 - exp( - max( d.y, 0.0 ) * 3.4 ) );
	float t = ( ${CLOUD_H.toFixed(1)} - wp.y ) / max( d.y, 0.05 );
	float dens = hfCloudDens( ( wp.xz + d.xz * t ) * ${CLOUD_S.toFixed(8)} + hfCloud.xy, hfCloud.z ) * smoothstep( 0.03, 0.22, d.y );
	return mix( c, mix( uCloudShade, uCloudLit, 0.62 ), dens * 0.92 );
}
// does a mirrored ray run into the land, or the trees standing on it? 0 sky, 1 land
float hfBank( vec3 wp, vec3 R ) {
	if ( uLandOn < 0.5 ) return 0.0;
	float len = max( length( R.xz ), 1e-4 ), rise = R.y / len, hit = 0.0, d = 11.0;
	vec2 dir = R.xz / len;
	for ( int i = 0; i < 4; i ++ ) {
		vec2 q = wp.xz + dir * d;
		float land = texture2D( uLand, ( ( q - uLandGrid.xy ) / uLandGrid.z + 0.5 ) / uLandN ).r;
		land += smoothstep( wp.y + 0.4, wp.y + 2.2, land ) * 8.5; // trees
		hit = max( hit, smoothstep( - 1.0, 1.6, land - ( wp.y + rise * d ) ) );
		d *= 2.7;
	}
	return hit;
}
// rings where raindrops land
vec2 hfRings( vec2 p ) {
	vec2 g = p * 1.7, id = floor( g ), f = fract( g ) - 0.5;
	float h = fract( sin( dot( id, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float ph = fract( uTime * 1.3 + h * 9.0 ), r = length( f );
	return f / max( r, 1e-3 ) * sin( ( r - ph * 0.5 ) * 46.0 ) * smoothstep( 0.09, 0.0, abs( r - ph * 0.5 ) ) * ( 1.0 - ph );
}
// the surface normal: flow is the current's direction (xy) and speed; size scales the ripples down for small water
vec3 hfWaterNormal( vec2 p, float dist, vec3 flow, float size ) {
	vec2 q = p * size, fl = flow.xy * ( flow.z * uTime * size );
	vec2 a = texture2D( uWaveTex, ( q - fl ) * 0.019 + vec2( uTime * 0.0037, 0.0 ) ).rg - 0.5;
	vec2 b = texture2D( uWaveTex, ( q - fl * 1.5 ) * 0.061 + vec2( 0.31, uTime * 0.0093 ) ).rg - 0.5;
	vec2 c = texture2D( uWaveTex, ( q - fl * 2.1 ) * 0.183 - vec2( uTime * 0.021, 0.17 ) ).rg - 0.5;
	vec2 s = ( a + b * 0.75 + c * 0.55 * ( 1.0 + uRain * 1.6 ) ) * ( 0.4 + 0.7 * uWind ) / ( 1.0 + dist * 0.0035 );
	if ( uRain > 0.02 ) s += ( hfRings( p ) + hfRings( p * 1.37 + 3.1 ) ) * ( uRain * 0.6 / ( 1.0 + dist * 0.03 ) );
	return normalize( vec3( s.x, 1.0, s.y ) );
}
// the colour of water at wp seen along V (unit, toward the eye); fres comes back as how mirror-like it is there
vec3 hfWater( vec3 wp, vec3 V, float dist, float depth, vec3 flow, float size, vec3 shallow, vec3 deep, float murk, out float fres ) {
	vec3 N = hfWaterNormal( wp.xz, dist, flow, size );
	float F = 0.02 + 0.98 * pow( 1.0 - max( dot( N, V ), 0.0 ), 5.0 );
	vec3 R = reflect( - V, N );
	R.y = abs( R.y ) + 0.002;
	vec3 mirror = mix( hfSkyAt( R, wp ), uLandCol, hfBank( wp, R ) );
	// cloud shadows cross the water as they cross the land
	float shade = 1.0 - hfCloud.w * hfCloudDens( ( wp.xz + uSunDir.xz * ( ( ${CLOUD_H.toFixed(1)} - wp.y ) / max( uSunDir.y, 0.16 ) ) ) * ${CLOUD_S.toFixed(8)} + hfCloud.xy, hfCloud.z );
	vec3 body = mix( shallow, deep, smoothstep( 0.0, murk, depth ) ) * ( uAmb + uSunCol * ( max( uSunDir.y, 0.0 ) * 0.2 * shade ) );
	vec3 col = mix( body, mirror, F );
	float nh = max( dot( N, normalize( uSunDir + V ) ), 0.0 );
	col += uSunCol * shade * ( pow( nh, 420.0 ) * 7.0 + pow( nh, 48.0 ) * 0.04 );
	fres = F;
	return col;
}
`;

// One set of uniforms for all the water. sky: the Sky; ground: the world's GroundMap (for the banks), if there is one.
export function waterUniforms(sky, ground) {
  const G = globalUniforms(), S = sky.uniforms;
  return {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    hfSunDir: G.hfSunDir, hfFogCol: G.hfFogCol, hfSunGlow: G.hfSunGlow, hfFogA: G.hfFogA, hfFogB: G.hfFogB, hfCloud: G.hfCloud, hfNoise: G.hfNoise,
    uTime: { value: 0 }, uRain: { value: 0 }, uWind: { value: 0.3 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
    uAmb: { value: new THREE.Color(0.3, 0.3, 0.3) }, uLandCol: { value: new THREE.Color(0.03, 0.05, 0.02) },
    uZenith: S.uZenith, uCloudLit: S.uCloudLit, uCloudShade: S.uCloudShade,
    uWaveTex: { value: waveTexture() },
    uLand: { value: ground ? ground.heightTex : null }, uLandGrid: { value: ground ? ground.grid : new THREE.Vector4(0, 0, 1, 0) },
    uLandN: { value: ground ? ground.gridN : new THREE.Vector2(1, 1) }, uLandOn: { value: ground ? 1 : 0 },
  };
}
// keep them in step with the sky
export function updateWater(u, dt, sky) {
  u.uTime.value += dt;
  u.uRain.value = sky.w.rain;
  u.uWind.value = sky.w.wind;
  const sun = sky.sun;
  u.uSunDir.value.copy(sky.lightDir);
  u.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity);
  const h = sky.hemi;
  u.uAmb.value.copy(h.color).multiplyScalar(h.intensity * 0.34);
  // the banks in the mirror: dark leaves under this light, greyed a little by the air
  const lum = (h.color.r * 0.3 + h.color.g * 0.59 + h.color.b * 0.11) * h.intensity + sun.intensity * Math.max(0, sky.lightDir.y) * 0.5;
  u.uLandCol.value.setRGB(0.034 * lum, 0.055 * lum, 0.022 * lum).lerp(sky.colors.horizon, 0.16);
}
