/**
 * The poster backdrop for click-to-start, loading and goodbye: a striped 80s sunset over the bay,
 * Crown Point's skyline, the pier's Ferris wheel and two palms framing it like a postcard.
 * Pure SVG; the shimmer and sway are CSS animations that respect reduced motion.
 */

type P = readonly [number, number];

function frond(cx: number, cy: number, angle: number, len: number, droop: number, width: number): string {
  const a = (angle * Math.PI) / 180;
  const tipX = cx + Math.cos(a) * len;
  const tipY = cy + Math.sin(a) * len + droop;
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const mx = cx + Math.cos(a) * len * 0.55;
  const my = cy + Math.sin(a) * len * 0.55 - droop * 0.15;
  return `M${cx} ${cy}Q${mx + nx * width} ${my + ny * width - width * 0.3} ${tipX} ${tipY}Q${mx - nx * width * 0.5} ${my - ny * width * 0.5 + width * 0.4} ${cx} ${cy}Z`;
}

function palm(base: P, crown: P, lean: number, scale: number, key: string) {
  const [bx, by] = base;
  const [cx, cy] = crown;
  const trunk = `M${bx - 16 * scale} ${by}Q${(bx + cx) / 2 + lean} ${(by + cy) / 2} ${cx - 5 * scale} ${cy}L${cx + 5 * scale} ${cy}Q${(bx + cx) / 2 + lean + 14 * scale} ${(by + cy) / 2} ${bx + 16 * scale} ${by}Z`;
  const fronds = [
    [-170, 300, 120, 34], [-145, 330, 80, 38], [-118, 260, 40, 34], [-90, 210, 30, 30], [-62, 270, 50, 34],
    [-35, 320, 90, 38], [-8, 300, 130, 34], [-200, 250, 150, 30], [25, 240, 160, 28],
  ] as const;
  return (
    <g key={key} class="hh-art-palm" style={{ transformOrigin: `${bx}px ${by}px` }}>
      <path d={trunk} />
      {fronds.map(([ang, len, droop, w], i) => (
        <path key={i} d={frond(cx, cy, ang, len * scale, droop * scale, w * scale)} />
      ))}
      <circle cx={cx} cy={cy + 6 * scale} r={14 * scale} />
    </g>
  );
}

const TOWERS: ReadonlyArray<readonly [number, number, number]> = [
  [120, 70, 160], [196, 54, 230], [256, 80, 190], [342, 46, 300], [394, 66, 250], [466, 90, 200], [562, 58, 270],
  [626, 74, 210], [706, 50, 170], [762, 84, 140],
];

export function SunsetArt({ dim = 0 }: { dim?: number }) {
  const horizon = 640;
  return (
    <div class="hh-art" aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
        <defs>
          <linearGradient id="hh-art-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#140B33" />
            <stop offset="0.24" stop-color="#3A2A7A" />
            <stop offset="0.46" stop-color="#A63E92" />
            <stop offset="0.6" stop-color="#FF5E6C" />
            <stop offset="0.68" stop-color="#FF9A3C" />
            <stop offset="0.72" stop-color="#FFD166" />
          </linearGradient>
          <linearGradient id="hh-art-sun" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#FFF1B8" />
            <stop offset="0.45" stop-color="#FFC060" />
            <stop offset="1" stop-color="#FF4F7A" />
          </linearGradient>
          <linearGradient id="hh-art-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#5A2E7E" />
            <stop offset="0.35" stop-color="#2B1D66" />
            <stop offset="1" stop-color="#0B0720" />
          </linearGradient>
          <radialGradient id="hh-art-glow" cx="0.66" cy="0.66" r="0.5">
            <stop offset="0" stop-color="#FFB45A" stop-opacity=".55" />
            <stop offset="1" stop-color="#FFB45A" stop-opacity="0" />
          </radialGradient>
          <mask id="hh-art-sunmask">
            <rect x="0" y="0" width="1600" height="900" fill="#fff" />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <rect key={i} x="700" y={560 + i * 18 + i * i * 1.6} width="760" height={3 + i * 2.2} fill="#000" />
            ))}
          </mask>
        </defs>
        <rect x="0" y="0" width="1600" height={horizon + 2} fill="url(#hh-art-sky)" />
        <rect x="0" y="0" width="1600" height="900" fill="url(#hh-art-glow)" />
        <circle cx="1060" cy="560" r="236" fill="url(#hh-art-sun)" mask="url(#hh-art-sunmask)" />
        <g class="hh-art-clouds" fill="#FFB0C4" opacity=".55">
          <path d="M120 300q60-26 140-8 70-30 150 4 40-12 80 6H120z" />
          <path d="M1240 220q50-20 110-6 60-22 120 4 30-8 60 6h-290z" opacity=".7" />
          <path d="M760 380q40-16 90-4 50-18 100 2h-190z" opacity=".55" />
        </g>
        <g fill="#2A1A5C">
          {TOWERS.map(([x, w, h], i) => (
            <rect key={i} x={x} y={horizon - h} width={w} height={h} rx="2" />
          ))}
          <rect x="346" y={horizon - 330} width="8" height="40" />
        </g>
        <g fill="#FFD166" opacity=".85">
          {TOWERS.flatMap(([x, w, h], i) =>
            [0.2, 0.45, 0.7].map((fy, j) => (
              <rect key={`${i}-${j}`} x={x + w * (0.2 + ((i + j) % 3) * 0.25)} y={horizon - h + h * fy} width="6" height="4" rx="1" />
            )),
          )}
        </g>
        <g class="hh-art-wheel" fill="none" stroke="#2A1A5C" stroke-width="5" style={{ transformOrigin: '1380px 520px' }}>
          <circle cx="1380" cy="520" r="96" />
          <circle cx="1380" cy="520" r="12" fill="#2A1A5C" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <path key={i} d={`M1380 520L${1380 + Math.cos(a) * 96} ${520 + Math.sin(a) * 96}`} stroke-width="3" />;
          })}
        </g>
        <path d={`M1300 ${horizon}L1380 520L1460 ${horizon}`} fill="none" stroke="#2A1A5C" stroke-width="7" />
        <rect x="1180" y={horizon - 14} width="420" height="14" fill="#2A1A5C" />
        <rect x="0" y={horizon} width="1600" height={900 - horizon} fill="url(#hh-art-sea)" />
        <g class="hh-art-shimmer" fill="#FFC060">
          {Array.from({ length: 12 }, (_, i) => {
            const y = horizon + 10 + i * 18 + i * i * 0.9;
            const w = 360 - i * 22 + ((i * 37) % 60);
            return <rect key={i} x={1060 - w / 2 + ((i * 53) % 40) - 20} y={y} width={w} height={2 + i * 0.5} rx="1.5" opacity={0.85 - i * 0.06} />;
          })}
        </g>
        <g class="hh-art-gulls" fill="none" stroke="#2A1A5C" stroke-width="3" stroke-linecap="round">
          <path d="M520 250q12-12 24 0q12-12 24 0" />
          <path d="M600 210q9-9 18 0q9-9 18 0" />
        </g>
        <g fill="#0B0720">
          {palm([150, 920], [250, 300], -40, 1.15, 'p1')}
          {palm([1520, 940], [1430, 360], 30, 0.95, 'p2')}
        </g>
        {dim > 0 && <rect x="0" y="0" width="1600" height="900" fill="#0B0720" opacity={dim} />}
      </svg>
    </div>
  );
}
