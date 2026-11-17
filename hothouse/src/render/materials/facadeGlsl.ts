/**
 * Procedural facades. Walls carry a `win` attribute (cell width, cell height, style, seed) and
 * metre UVs; this fragment code draws windows, frames, sills, shutters and corrugation with
 * analytic antialiasing, fades the pattern to its average when cells get smaller than a few pixels
 * (no moiré), and fills lit windows at night with interior-mapped rooms.
 *
 * Requires: SHARED_PARS, `vHHWorld`, `vHHWorldNormal`, `vUvM`, `vWin`, `cameraPosition`.
 */
export const FACADE_GLSL = /* glsl */ `
float hhHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hhBox(vec2 f, vec2 lo, vec2 hi, vec2 aa) {
  vec2 a = smoothstep(lo - aa, lo + aa, f);
  vec2 b = 1.0 - smoothstep(hi - aa, hi + aa, f);
  return a.x * a.y * b.x * b.y;
}

float hhLine(float d, float halfWidth, float aa) {
  return 1.0 - smoothstep(halfWidth - aa, halfWidth + aa, d);
}

// Window layout for one cell. glass: 0–1 coverage; frame: trim; sill: ledge; shutter: louvres;
// gUv: 0–1 inside the glass rect; gSize: glass rect size in cell units; avg: average glass
// coverage of a cell (used when the pattern is too small to resolve).
void hhWindows(vec2 f, vec2 aa, float style, float seed, vec2 cellId,
               out float glass, out float frame, out float sill, out float shutter,
               out vec2 gUv, out vec2 gSize, out float avg) {
  glass = 0.0; frame = 0.0; sill = 0.0; shutter = 0.0; gUv = f; gSize = vec2(1.0); avg = 0.0;
  if (style < 1.5 || (style > 7.5 && style < 8.5)) {
    // Punched (1) and shuttered (8): a framed window with a sill and a muntin cross.
    vec2 lo = vec2(0.25, 0.27), hi = vec2(0.75, 0.86);
    if (style > 7.5) { lo = vec2(0.31, 0.26); hi = vec2(0.69, 0.84); }
    float outer = hhBox(f, lo - vec2(0.03, 0.025), hi + vec2(0.03, 0.025), aa);
    glass = hhBox(f, lo, hi, aa);
    frame = max(outer - glass, 0.0);
    float mx = hhLine(abs(f.x - 0.5), 0.009, aa.x);
    float my = hhLine(abs(f.y - mix(lo.y, hi.y, 0.62)), 0.009, aa.y);
    float mullion = max(mx, my) * glass;
    frame = max(frame, mullion);
    glass *= 1.0 - mullion;
    sill = hhBox(f, vec2(lo.x - 0.06, lo.y - 0.075), vec2(hi.x + 0.06, lo.y - 0.03), aa);
    if (style > 7.5) {
      float l = hhBox(f, vec2(lo.x - 0.19, lo.y), vec2(lo.x - 0.035, hi.y), aa);
      float r = hhBox(f, vec2(hi.x + 0.035, lo.y), vec2(hi.x + 0.19, hi.y), aa);
      float slats = 0.8 + 0.2 * step(0.5, fract(f.y * 26.0));
      shutter = (l + r) * slats;
    }
    gUv = (f - lo) / (hi - lo);
    gSize = hi - lo;
    avg = gSize.x * gSize.y * 0.92;
  } else if (style < 2.5) {
    // Band (2): Streamline ribbon windows with slim mullions and chrome trim lines.
    vec2 lo = vec2(-1.0, 0.3), hi = vec2(2.0, 0.8);
    glass = hhBox(f, lo, hi, aa);
    float m = hhLine(min(f.x, 1.0 - f.x), 0.012, aa.x) * glass;
    frame = max(m, hhBox(f, vec2(-1.0, 0.255), vec2(2.0, 0.3), aa) + hhBox(f, vec2(-1.0, 0.8), vec2(2.0, 0.845), aa));
    glass *= 1.0 - m;
    gUv = vec2(f.x, (f.y - 0.3) / 0.5);
    gSize = vec2(1.0, 0.5);
    avg = 0.48;
  } else if (style < 3.5) {
    // Arched (3): Mediterranean round-topped windows.
    vec2 c = vec2(0.5, 0.66);
    float r = 0.2;
    float rect = hhBox(f, vec2(0.3, 0.2), vec2(0.7, 0.66), aa);
    float d = length((f - c) * vec2(1.0, 0.9));
    float arch = (1.0 - smoothstep(r - aa.x, r + aa.x, d)) * step(c.y, f.y);
    glass = max(rect, arch);
    float rect2 = hhBox(f, vec2(0.27, 0.18), vec2(0.73, 0.66), aa);
    float arch2 = (1.0 - smoothstep(r + 0.03 - aa.x, r + 0.03 + aa.x, d)) * step(c.y, f.y);
    frame = max(max(rect2, arch2) - glass, 0.0);
    sill = hhBox(f, vec2(0.24, 0.13), vec2(0.76, 0.18), aa);
    gUv = vec2((f.x - 0.3) / 0.4, (f.y - 0.2) / 0.66);
    gSize = vec2(0.4, 0.66);
    avg = 0.3;
  } else if (style < 4.5) {
    // Curtain wall (4): glass with mullions on the cell grid and opaque spandrels at slab lines.
    float spandrel = hhBox(f, vec2(-1.0, -1.0), vec2(2.0, 0.17), aa);
    float m = hhLine(min(f.x, 1.0 - f.x), 0.016, aa.x);
    float t = hhLine(abs(f.y - 0.17), 0.012, aa.y);
    frame = max(max(m, t), spandrel * 0.6);
    glass = (1.0 - spandrel) * (1.0 - max(m, t));
    gUv = vec2(f.x, (f.y - 0.17) / 0.83);
    gSize = vec2(1.0, 0.83);
    avg = 0.78;
  } else if (style < 5.5) {
    // Storefront (5): tall glass with a transom and a stall riser.
    vec2 lo = vec2(0.04, 0.1), hi = vec2(0.96, 0.7);
    glass = hhBox(f, lo, hi, aa) + hhBox(f, vec2(0.04, 0.74), vec2(0.96, 0.86), aa);
    float m = hhLine(abs(f.x - 0.5), 0.01, aa.x) * glass;
    frame = max(m, hhBox(f, vec2(0.02, 0.07), vec2(0.98, 0.89), aa) - glass);
    glass *= 1.0 - m;
    gUv = (f - lo) / (hi - lo);
    gSize = hi - lo;
    avg = 0.62;
  } else if (style < 6.5) {
    // Motel (6): a door and a picture window per room.
    float door = hhBox(f, vec2(0.08, 0.0), vec2(0.3, 0.8), aa);
    glass = hhBox(f, vec2(0.42, 0.34), vec2(0.9, 0.76), aa);
    frame = max(hhBox(f, vec2(0.06, 0.0), vec2(0.32, 0.83), aa) - door, 0.0)
          + max(hhBox(f, vec2(0.4, 0.31), vec2(0.92, 0.79), aa) - glass, 0.0);
    shutter = door * 0.9; // the door uses the shutter (accent) colour
    sill = hhBox(f, vec2(0.38, 0.27), vec2(0.94, 0.31), aa);
    gUv = vec2((f.x - 0.42) / 0.48, (f.y - 0.34) / 0.42);
    gSize = vec2(0.48, 0.42);
    avg = 0.2;
  } else if (style < 7.5) {
    // Porthole (7): round Deco accents.
    float d = length(f - 0.5);
    glass = 1.0 - smoothstep(0.24 - aa.x, 0.24 + aa.x, d);
    frame = (1.0 - smoothstep(0.29 - aa.x, 0.29 + aa.x, d)) - glass;
    gUv = (f - 0.26) / 0.48;
    gSize = vec2(0.48);
    avg = 0.18;
  } else {
    // Corrugated (9): no glass; ribs handled by the caller.
    avg = 0.0;
  }
}

vec3 hhRoomColor(float h, float night) {
  // Warm lamps dominate; some cool screens, TV flicker, the rare grow-light magenta.
  vec3 warm = vec3(1.0, 0.56, 0.24);
  vec3 soft = vec3(1.0, 0.78, 0.52);
  vec3 cool = vec3(0.72, 0.84, 1.0);
  vec3 tv = vec3(0.36, 0.52, 1.0);
  vec3 grow = vec3(0.95, 0.28, 1.0);
  if (h < 0.42) return warm;
  if (h < 0.7) return soft;
  if (h < 0.86) return cool;
  if (h < 0.97) return tv;
  return grow;
}

// Interior mapping: ray-cast a box room behind the glass. Returns linear colour (unlit factor);
// \`lightOn\` decides whether the room is lit.
vec3 hhInterior(vec2 uv, vec3 rayT, float seed, vec2 cellId, float lightOn, out float emissive) {
  vec3 p = vec3(clamp(uv, 0.0, 1.0), 0.0);
  vec3 d = rayT;
  d.z = max(d.z, 1e-3);
  vec3 bound = vec3(d.x > 0.0 ? 1.0 : 0.0, d.y > 0.0 ? 1.0 : 0.0, 1.0);
  vec3 safeD = vec3(abs(d.x) < 1e-4 ? 1e-4 : d.x, abs(d.y) < 1e-4 ? 1e-4 : d.y, d.z);
  vec3 tt = (bound - p) / safeD;
  float t = min(min(tt.x, tt.y), tt.z);
  vec3 h = p + d * t;
  float hsh = hhHash12(cellId * 1.37 + seed * 7.1);
  vec3 base = hhRoomColor(fract(hsh * 13.37), lightOn);
  float shade;
  if (t == tt.z) {
    // Back wall with a piece of furniture or art.
    shade = 0.85;
    float furn = step(0.55, hhHash12(cellId + 3.1 + seed));
    vec2 fl = vec2(0.15 + 0.5 * hhHash12(cellId + 9.2), 0.0);
    float sofa = step(fl.x, h.x) * step(h.x, fl.x + 0.38) * step(h.y, 0.32);
    float art = step(0.35, h.x) * step(h.x, 0.62) * step(0.52, h.y) * step(h.y, 0.74) * (1.0 - furn);
    shade *= 1.0 - sofa * furn * 0.55;
    shade += art * 0.35;
  } else if (t == tt.y) {
    shade = d.y > 0.0 ? 1.25 - 0.6 * length(h.xz - vec2(0.5, 0.5)) : 0.42; // ceiling lamp falloff / floor
  } else {
    shade = 0.62;
  }
  shade *= 1.0 - 0.32 * h.z;
  // Blinds on some windows: light leaks through the slats.
  float blinds = step(0.72, fract(hsh * 7.77));
  float slat = mix(1.0, 0.55 + 0.45 * smoothstep(0.35, 0.65, fract(uv.y * 16.0)), blinds);
  // Curtains framing others.
  float curtain = step(0.82, fract(hsh * 3.3)) * (1.0 - smoothstep(0.12, 0.2, min(uv.x, 1.0 - uv.x)));
  vec3 lit = base * shade * slat;
  lit = mix(lit, base * vec3(1.1, 0.7, 0.6) * 0.8, curtain * 0.8);
  // TV flicker.
  if (fract(hsh * 13.37) > 0.86 && fract(hsh * 13.37) < 0.97) lit *= 0.75 + 0.25 * sin(uTime * 9.0 + hsh * 40.0) * sin(uTime * 3.7 + hsh * 11.0);
  emissive = lightOn;
  vec3 dark = vec3(0.035, 0.04, 0.06) * shade;
  return mix(dark, lit, lightOn);
}
`;
