// The post pipeline: the world is drawn into a high-dynamic-range target and
// finished like a photograph. Bright things bleed light (bloom), corners and
// creases darken (ambient occlusion), the whole frame is exposed and
// tone-mapped with the game's film look, graded for the time of day, and
// anti-aliased. Each stage can be switched off for slower machines; with the
// pipeline off entirely the scene renders straight to the screen as before.
import * as THREE from 'three';
import { TONEMAP_GLSL, LOOK } from './tonemap.js';

const VERT = /* glsl */`precision highp float;
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;
const HEAD = 'precision highp float;\nprecision highp sampler2D;\nin vec2 vUv;\nout vec4 fragColor;\n';

// 13-tap downsample; the first step also picks out what should glow
const DOWN = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uFirst; uniform vec2 uKnee;
vec3 S( float x, float y ) { return texture( tSrc, vUv + vec2( x, y ) * uTexel ).rgb; }
float lum( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
void main() {
	vec3 a = S( -2., 2. ), b = S( 0., 2. ), c = S( 2., 2. ), d = S( -2., 0. ), e = S( 0., 0. ), f = S( 2., 0. ), g = S( -2., -2. ), h = S( 0., -2. ), i = S( 2., -2. );
	vec3 j = S( -1., 1. ), k = S( 1., 1. ), l = S( -1., -1. ), m = S( 1., -1. );
	vec3 col;
	if ( uFirst > 0.5 ) {
		// weight each group down by its own brightness so one hot pixel can't flicker
		vec3 g0 = ( a + b + d + e ) * 0.25, g1 = ( b + c + e + f ) * 0.25, g2 = ( d + e + g + h ) * 0.25, g3 = ( e + f + h + i ) * 0.25, g4 = ( j + k + l + m ) * 0.25;
		float w0 = 0.125 / ( 1.0 + lum( g0 ) ), w1 = 0.125 / ( 1.0 + lum( g1 ) ), w2 = 0.125 / ( 1.0 + lum( g2 ) ), w3 = 0.125 / ( 1.0 + lum( g3 ) ), w4 = 0.5 / ( 1.0 + lum( g4 ) );
		col = ( g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4 ) / ( w0 + w1 + w2 + w3 + w4 );
		float br = max( col.r, max( col.g, col.b ) );
		float w = max( br - uKnee.x, 0.0 ) / max( br, 1e-4 );
		col = min( col * max( w, uKnee.y ), vec3( 48.0 ) );
	} else col = e * 0.125 + ( a + c + g + i ) * 0.03125 + ( b + d + f + h ) * 0.0625 + ( j + k + l + m ) * 0.125;
	fragColor = vec4( max( col, 0.0 ), 1.0 );
}`;
// tent upsample, blended over the level it lands on
const UP = /* glsl */`
uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 uTexel; uniform float uSpread;
vec3 S( float x, float y ) { return texture( tSrc, vUv + vec2( x, y ) * uTexel ).rgb; }
void main() {
	vec3 s = S( -1., 1. ) + S( 1., 1. ) + S( -1., -1. ) + S( 1., -1. ) + 2.0 * ( S( 0., 1. ) + S( 0., -1. ) + S( -1., 0. ) + S( 1., 0. ) ) + 4.0 * S( 0., 0. );
	fragColor = vec4( mix( texture( tBase, vUv ).rgb, s / 16.0, uSpread ), 1.0 );
}`;
// ambient occlusion from the depth buffer alone (after McGuire's scalable AO)
const AO = /* glsl */`
uniform sampler2D tDepth; uniform mat4 uProjInv; uniform vec2 uTexel; uniform vec4 uP; // radius (m), pixels per metre at 1 m, strength, far fade
float depthAt( vec2 uv ) { return texture( tDepth, uv ).r; }
vec3 posAt( vec2 uv, float d ) { vec4 p = uProjInv * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 ); return p.xyz / p.w; }
float ign( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
void main() {
	float d = depthAt( vUv );
	if ( d >= 0.99999 ) { fragColor = vec4( 1.0, 1e4, 0.0, 1.0 ); return; }
	vec3 P = posAt( vUv, d );
	float fade = 1.0 - smoothstep( uP.w * 0.6, uP.w, - P.z );
	if ( fade <= 0.0 ) { fragColor = vec4( 1.0, - P.z, 0.0, 1.0 ); return; }
	// the surface normal from neighbouring depths, taking the nearer neighbour on each axis so edges stay clean
	float dl = depthAt( vUv - vec2( uTexel.x, 0.0 ) ), dr = depthAt( vUv + vec2( uTexel.x, 0.0 ) ), dd = depthAt( vUv - vec2( 0.0, uTexel.y ) ), du = depthAt( vUv + vec2( 0.0, uTexel.y ) );
	vec3 dx = abs( dl - d ) < abs( dr - d ) ? P - posAt( vUv - vec2( uTexel.x, 0.0 ), dl ) : posAt( vUv + vec2( uTexel.x, 0.0 ), dr ) - P;
	vec3 dy = abs( dd - d ) < abs( du - d ) ? P - posAt( vUv - vec2( 0.0, uTexel.y ), dd ) : posAt( vUv + vec2( 0.0, uTexel.y ), du ) - P;
	vec3 N = normalize( cross( dx, dy ) );
	float R = uP.x, R2 = R * R;
	float rpx = clamp( R * uP.y / - P.z, 3.0, 80.0 );
	float ang = ign( gl_FragCoord.xy ) * 6.2831853, occ = 0.0;
	float bias = 0.012 + 0.0016 * - P.z;
	const int NS = HF_AO_SAMPLES;
	for ( int i = 0; i < NS; i ++ ) {
		float t = ( float( i ) + 0.5 ) / float( NS );
		float a = ang + t * 6.2831853 * 2.4;
		vec2 uv = vUv + vec2( cos( a ), sin( a ) ) * ( rpx * sqrt( t ) ) * uTexel;
		vec3 v = posAt( uv, depthAt( uv ) ) - P;
		float vv = dot( v, v ), f = max( R2 - vv, 0.0 );
		occ += f * f * f * max( ( dot( v, N ) - bias ) / ( vv + 0.01 ), 0.0 );
	}
	float ao = max( 0.0, 1.0 - occ * uP.z * 5.0 / ( R2 * R2 * R2 * float( NS ) ) );
	fragColor = vec4( mix( 1.0, ao, fade ), - P.z, 0.0, 1.0 );
}`;
// depth-aware blur for the occlusion (red: occlusion, green: distance from the eye)
const AOBLUR = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uDir;
void main() {
	vec2 c = texture( tSrc, vUv ).rg;
	float s = c.r, w = 1.0;
	for ( int i = 1; i <= 3; i ++ ) {
		for ( int k = -1; k <= 1; k += 2 ) {
			vec2 t = texture( tSrc, vUv + uDir * float( i * k ) ).rg;
			float ww = max( 0.0, 1.0 - abs( t.g - c.g ) / ( 0.035 * c.g + 0.03 ) ) * ( 1.0 - float( i ) * 0.2 );
			s += t.r * ww; w += ww;
		}
	}
	fragColor = vec4( s / w, c.g, 0.0, 1.0 );
}`;
const COMPOSITE = /* glsl */`
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tAO;
uniform float uExposure; uniform float uBloom; uniform float uAO; uniform vec2 uLook; uniform vec3 uTint;
uniform vec3 uShadows; uniform vec3 uHighs; uniform vec4 uFx; // vignette, grain, time, saturation
${TONEMAP_GLSL}
float ign( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
void main() {
	vec3 c = texture( tScene, vUv ).rgb;
	#ifdef HF_AO
	float ao = texture( tAO, vUv ).r;
	// occlusion dims what the sky lights; keep it off surfaces in full sun
	float l0 = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c *= mix( 1.0, ao, uAO * ( 1.0 - smoothstep( 0.35, 1.4, l0 ) * 0.6 ) );
	#endif
	#ifdef HF_BLOOM
	c += texture( tBloom, vUv ).rgb * uBloom;
	#endif
	c *= uExposure * uTint;
	c = hfTonemap( c, uLook.x, uLook.y );
	// the grade: tint the darks and the lights apart, then set the saturation
	float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c *= mix( uShadows, vec3( 1.0 ), smoothstep( 0.0, 0.45, l ) );
	c *= mix( vec3( 1.0 ), uHighs, smoothstep( 0.45, 1.0, l ) );
	l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c = max( l + ( c - l ) * uFx.w, 0.0 );
	vec2 q = vUv - 0.5;
	c *= 1.0 - smoothstep( 0.18, 0.95, dot( q, q ) * 2.0 ) * uFx.x;
	c = mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( vec3( 0.0031308 ), c ) );
	float n = ign( gl_FragCoord.xy + fract( uFx.z ) * 61.0 );
	c += ( n - 0.5 ) * ( uFx.y * ( 1.0 - l * 0.6 ) + 1.0 / 255.0 );
	fragColor = vec4( clamp( c, 0.0, 1.0 ), dot( c, vec3( 0.299, 0.587, 0.114 ) ) );
}`;
// FXAA 3.11, the compact variant; expects luma in alpha
const FXAA = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel;
void main() {
	vec4 cM = texture( tSrc, vUv );
	float lNW = texture( tSrc, vUv + vec2( -1.0, -1.0 ) * uTexel ).a, lNE = texture( tSrc, vUv + vec2( 1.0, -1.0 ) * uTexel ).a;
	float lSW = texture( tSrc, vUv + vec2( -1.0, 1.0 ) * uTexel ).a, lSE = texture( tSrc, vUv + vec2( 1.0, 1.0 ) * uTexel ).a, lM = cM.a;
	float lMin = min( lM, min( min( lNW, lNE ), min( lSW, lSE ) ) ), lMax = max( lM, max( max( lNW, lNE ), max( lSW, lSE ) ) );
	if ( lMax - lMin < max( 0.0312, lMax * 0.125 ) ) { fragColor = vec4( cM.rgb, 1.0 ); return; }
	vec2 dir = vec2( - ( ( lNW + lNE ) - ( lSW + lSE ) ), ( lNW + lSW ) - ( lNE + lSE ) );
	float reduce = max( ( lNW + lNE + lSW + lSE ) * 0.03125, 1.0 / 128.0 );
	dir = clamp( dir / ( min( abs( dir.x ), abs( dir.y ) ) + reduce ), -8.0, 8.0 ) * uTexel;
	vec4 A = 0.5 * ( texture( tSrc, vUv + dir * ( 1.0 / 3.0 - 0.5 ) ) + texture( tSrc, vUv + dir * ( 2.0 / 3.0 - 0.5 ) ) );
	vec4 B = A * 0.5 + 0.25 * ( texture( tSrc, vUv + dir * -0.5 ) + texture( tSrc, vUv + dir * 0.5 ) );
	fragColor = vec4( ( B.a < lMin || B.a > lMax ) ? A.rgb : B.rgb, 1.0 );
}`;
const COPY = /* glsl */`
uniform sampler2D tSrc;
void main() { fragColor = vec4( texture( tSrc, vUv ).rgb, 1.0 ); }`;

const mat = (frag, uniforms, defines = {}) => new THREE.RawShaderMaterial({
  glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: HEAD + frag, uniforms, defines, depthTest: false, depthWrite: false, toneMapped: false,
});

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    const ext = renderer.extensions;
    this.float = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    this.cfg = { on: false, msaa: 0, bloom: 0, fxaa: false, ao: false, aoSamples: 8 };
    this.scale = 1;
    // what the frame should look like right now; the sky sets these
    this.look = {
      exposure: 1, bloom: 0.5, ao: 0.85, tint: new THREE.Color(1, 1, 1), shadows: new THREE.Color(1, 1, 1), highs: new THREE.Color(1, 1, 1),
      vignette: 0.22, grain: 0.012, sat: 1, power: LOOK.power, lookSat: LOOK.sat,
    };
    this.t = 0;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(geo, null);
    this.quad.frustumCulled = false;
    this.fs = new THREE.Scene();
    this.fs.add(this.quad);
    this.size = new THREE.Vector2();
    this.m = {
      down: mat(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 }, uKnee: { value: new THREE.Vector2(1.0, 0.045) } }),
      up: mat(UP, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uSpread: { value: 0.62 } }),
      fxaa: mat(FXAA, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }),
      copy: mat(COPY, { tSrc: { value: null } }),
      aoBlur: mat(AOBLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }),
    };
    this.targets = [];
  }
  // (re)build for a set of features: { on, msaa, bloom (levels), fxaa, ao, aoSamples }
  configure(cfg) {
    Object.assign(this.cfg, cfg);
    this.dispose();
    this.w = 0;
    const c = this.cfg, defs = {};
    if (c.bloom) defs.HF_BLOOM = 1;
    if (c.ao) defs.HF_AO = 1;
    if (this.m.composite) this.m.composite.dispose();
    this.m.composite = mat(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null }, tAO: { value: null }, uExposure: { value: 1 }, uBloom: { value: 0.5 }, uAO: { value: 0.8 },
      uLook: { value: new THREE.Vector2(LOOK.power, LOOK.sat) }, uTint: { value: new THREE.Color(1, 1, 1) },
      uShadows: { value: new THREE.Color(1, 1, 1) }, uHighs: { value: new THREE.Color(1, 1, 1) }, uFx: { value: new THREE.Vector4(0.2, 0.01, 0, 1) },
    }, defs);
    if (this.m.ao) this.m.ao.dispose();
    this.m.ao = c.ao ? mat(AO, { tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uP: { value: new THREE.Vector4(0.9, 500, 1, 90) } }, { HF_AO_SAMPLES: c.aoSamples || 8 }) : null;
  }
  dispose() { for (const t of this.targets) { if (t.depthTexture) t.depthTexture.dispose(); t.dispose(); } this.targets = []; this.sceneRT = null; }
  rt(w, h, o = {}) {
    const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      type: o.ldr || !this.float ? THREE.UnsignedByteType : THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: !!o.depth, stencilBuffer: false,
      samples: o.samples || 0, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    t.texture.name = o.name || 'post';
    this.targets.push(t);
    return t;
  }
  build(w, h) {
    this.dispose();
    this.w = w; this.h = h;
    const c = this.cfg;
    this.sceneRT = this.rt(w, h, { depth: true, samples: c.msaa, name: 'scene' });
    if (c.ao) {
      const dt = new THREE.DepthTexture(w, h);
      dt.type = THREE.UnsignedIntType; dt.format = THREE.DepthFormat;
      dt.minFilter = dt.magFilter = THREE.NearestFilter;
      this.sceneRT.depthTexture = dt;
      const aw = Math.ceil(w / 2), ah = Math.ceil(h / 2);
      this.aoA = this.rt(aw, ah, { name: 'ao' });
      this.aoB = this.rt(aw, ah, { name: 'aoBlur' });
    }
    this.down = []; this.ups = [];
    let bw = w, bh = h;
    for (let i = 0; i < c.bloom; i++) {
      bw = Math.max(2, Math.round(bw / 2)); bh = Math.max(2, Math.round(bh / 2));
      this.down.push(this.rt(bw, bh, { name: 'bloomD' + i }));
      if (i < c.bloom - 1) this.ups.push(this.rt(bw, bh, { name: 'bloomU' + i }));
    }
    this.ldr = c.fxaa ? this.rt(w, h, { ldr: true, name: 'ldr' }) : null;
  }
  pass(material, target) {
    const r = this.renderer;
    this.quad.material = material;
    r.setRenderTarget(target);
    r.render(this.fs, this.cam);
  }
  render(scene, camera, dt = 0) {
    const r = this.renderer, c = this.cfg;
    if (!c.on) { r.setRenderTarget(null); r.render(scene, camera); return; }
    r.getDrawingBufferSize(this.size);
    const w = Math.max(2, Math.round(this.size.x * this.scale)), h = Math.max(2, Math.round(this.size.y * this.scale));
    if (w !== this.w || h !== this.h || !this.sceneRT) this.build(w, h);
    this.t += dt;
    const L = this.look, m = this.m;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    const auto = r.autoClear;
    r.autoClear = false;
    if (c.ao) {
      const u = m.ao.uniforms, aw = this.aoA.width, ah = this.aoA.height;
      u.tDepth.value = this.sceneRT.depthTexture;
      u.uProjInv.value.copy(camera.projectionMatrixInverse);
      u.uTexel.value.set(1 / aw, 1 / ah);
      // pixels covered by one metre at one metre from the eye
      u.uP.value.set(0.9, 0.5 * ah * camera.projectionMatrix.elements[5], 0.55, 110);
      this.pass(m.ao, this.aoA);
      const b = m.aoBlur.uniforms;
      b.tSrc.value = this.aoA.texture; b.uDir.value.set(1.4 / aw, 0); this.pass(m.aoBlur, this.aoB);
      b.tSrc.value = this.aoB.texture; b.uDir.value.set(0, 1.4 / ah); this.pass(m.aoBlur, this.aoA);
    }
    if (c.bloom) {
      const d = m.down.uniforms;
      let src = this.sceneRT;
      this.down.forEach((t, i) => {
        d.tSrc.value = src.texture; d.uTexel.value.set(1 / src.width, 1 / src.height); d.uFirst.value = i === 0 ? 1 : 0;
        this.pass(m.down, t);
        src = t;
      });
      const u = m.up.uniforms;
      let top = this.down[this.down.length - 1];
      for (let i = this.down.length - 2; i >= 0; i--) {
        u.tSrc.value = top.texture; u.tBase.value = this.down[i].texture; u.uTexel.value.set(1 / top.width, 1 / top.height);
        this.pass(m.up, this.ups[i]);
        top = this.ups[i];
      }
      m.composite.uniforms.tBloom.value = top.texture;
    }
    const u = m.composite.uniforms;
    u.tScene.value = this.sceneRT.texture;
    if (c.ao) u.tAO.value = this.aoA.texture;
    u.uExposure.value = L.exposure; u.uBloom.value = L.bloom; u.uAO.value = L.ao;
    u.uLook.value.set(L.power, L.lookSat); u.uTint.value.copy(L.tint); u.uShadows.value.copy(L.shadows); u.uHighs.value.copy(L.highs);
    u.uFx.value.set(L.vignette, L.grain, this.t, L.sat);
    if (this.ldr) {
      this.pass(m.composite, this.ldr);
      m.fxaa.uniforms.tSrc.value = this.ldr.texture; m.fxaa.uniforms.uTexel.value.set(1 / w, 1 / h);
      this.pass(m.fxaa, null);
    } else this.pass(m.composite, null);
    r.autoClear = auto;
  }
}
