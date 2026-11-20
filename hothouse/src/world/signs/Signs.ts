import { AdditiveBlending, Color, Group, Mesh, ShaderMaterial, type IUniform, type Material, type Texture } from 'three';
import type { TimeSlicer } from '@/core/slicer';
import { LAYER_REFLECTED } from '@/render/layers';
import { MeshBuilder, SurfFlag } from '@/render/geo/MeshBuilder';
import type { MaterialKit } from '@/render/materials/MaterialKit';
import { ATMOSPHERE_GLSL, SHARED_PARS, type SharedUniforms } from '@/render/shared';
import type { SignRequest } from '../buildings/kit';
import { SignAtlas, type AtlasRegion } from './SignAtlas';

const NEON_VERT = /* glsl */ `
attribute vec4 surf;
varying vec2 vUv;
varying vec3 vWorld;
varying vec2 vSign;
void main() {
  vUv = uv;
  vSign = surf.xz; // x: per-sign seed, z: strength
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const NEON_FRAG = /* glsl */ `
${SHARED_PARS}
${ATMOSPHERE_GLSL}
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec3 vWorld;
varying vec2 vSign;
void main() {
  vec4 t = texture2D(uAtlas, vUv);
  float seed = vSign.x;
  float night = smoothstep(0.0, 0.8, uWeather.z);
  // Nervous transformer hum on a few signs; a rare full drop-out.
  float buzz = 0.93 + 0.07 * sin(uTime * 37.0 + seed * 91.0);
  float drop = step(0.992, fract(sin(floor(uTime * 6.0) * 12.9898 + seed * 78.233) * 43758.5453)) * step(0.72, fract(seed * 7.13));
  float gate = mix(0.14, 1.0, night) * buzz * (1.0 - drop * 0.9);
  vec3 col = t.rgb * t.a * vSign.y * gate;
  col *= 1.0 - hhFogAmount(cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * All signage in a couple of draw calls per atlas page: glowing neon (additive, switches on at
 * dusk, flickers) and opaque boards (lit like walls, faintly self-lit at night).
 */
export class Signs {
  readonly group = new Group();
  private readonly materials: Material[] = [];

  private constructor(private readonly atlas: SignAtlas) {
    this.group.name = 'signs';
  }

  static async build(requests: readonly SignRequest[], kit: MaterialKit, shared: SharedUniforms, slicer: TimeSlicer): Promise<Signs> {
    const { atlas, regions } = await SignAtlas.create(requests, slicer);
    const signs = new Signs(atlas);
    const builders = new Map<string, MeshBuilder>();
    const builderFor = (r: AtlasRegion) => {
      const k = `${r.layer}|${r.page}`;
      let b = builders.get(k);
      if (!b) builders.set(k, (b = new MeshBuilder()));
      return b;
    };
    requests.forEach((req, i) => {
      const reg = regions[i]!;
      const b = builderFor(reg);
      // Fit the drawn content inside the requested box, keeping its aspect.
      let w = req.width, h = req.height;
      if (w / h > reg.aspect) w = h * reg.aspect;
      else h = w / reg.aspect;
      const seed = (req.seed % 1000) / 1000;
      if (reg.layer === 'neon') {
        b.color.setRGB(1, 1, 1);
        b.rough = seed;
        b.metal = 0;
        b.emissive = req.kind === 'blade' ? 7 : 6;
        b.flags = 0;
      } else {
        const glow = req.kind === 'billboard' ? 0.55 : req.kind === 'marquee' ? 1.6 : 0.22;
        b.surface('#FFFFFF', req.kind === 'billboard' ? 0.55 : 0.7, 0, glow, SurfFlag.NIGHT | SurfFlag.WET);
      }
      b.pushTRS(req.position.x, req.position.y, req.position.z, req.yaw);
      b.quad([w / 2, -h / 2, 0], [-w / 2, -h / 2, 0], [-w / 2, h / 2, 0], [w / 2, h / 2, 0], [reg.u0, reg.v0, reg.u1, reg.v1]);
      b.pop();
    });
    for (const [k, b] of builders) {
      const [layer, pageStr] = k.split('|') as ['neon' | 'board', string];
      const page = atlas.pages[Number(pageStr)]!;
      const mat = layer === 'neon' ? neonMaterial(page, shared) : boardMaterial(page, kit);
      signs.materials.push(mat);
      const mesh = new Mesh(b.build(), mat);
      mesh.name = `signs-${k}`;
      mesh.layers.set(LAYER_REFLECTED);
      mesh.matrixAutoUpdate = false;
      if (layer === 'neon') mesh.renderOrder = 5;
      else mesh.receiveShadow = true;
      signs.group.add(mesh);
      await slicer.breathe();
    }
    return signs;
  }

  dispose(kit: MaterialKit): void {
    this.group.traverse((o) => (o as { geometry?: { dispose(): void } }).geometry?.dispose());
    for (const m of this.materials) kit.release(m);
    this.atlas.dispose();
  }
}

function neonMaterial(atlas: Texture, shared: SharedUniforms): ShaderMaterial {
  const uniforms: Record<string, IUniform> = { uAtlas: { value: atlas } };
  shared.attach(uniforms);
  return new ShaderMaterial({
    name: 'hh-neon', uniforms, vertexShader: NEON_VERT, fragmentShader: NEON_FRAG,
    blending: AdditiveBlending, transparent: true, depthWrite: false, fog: false,
  });
}

function boardMaterial(atlas: Texture, kit: MaterialKit): Material {
  const m = kit.standard({ map: atlas, vertexColors: true, surfAttr: true, wet: true, roughness: 0.7, metalness: 0, color: new Color(1, 1, 1) });
  return m;
}
