// Frostpeak Isle: a snowy island far out in Cucaino Park's boundless ocean (east-south-east of the
// park, well clear of Coralcove Isle, the Lost World and the Abyss), home of a big, busy penguin
// colony. What's on it:
//   - a tall snowy peak (rock faces, ice streaks), rolling snow hills and blue ice cliffs along the
//     east coast, where the land drops straight into the sea
//   - Penguin Point (north-west beach): the colony — emperors with their fluffy grey chicks, and
//     little blue penguins — and, above it, the Slide Top terrace on the peak's shoulder where three
//     icy slide chutes (FROST_SLIDES) run all the way down into the sea. The penguins waddle up in
//     lines, belly-toboggan down, splash in, porpoise back to the beach and hop out (the sim lives in
//     world/frost/colony.ts and reads the routes below)
//   - an igloo camp with a little research station, a frozen pond, an ice cave, snowy pines, and a
//     lookout on the north-east hill for watching the aurora
//   - ice floes offshore (seals lounge on them; you can climb onto them too) and icebergs further out
// Pure + deterministic (no three.js): the engine (walking, swimming, sliding), the renderer
// (world/frost/**), the penguins' routines and the tests all read the same numbers:
//   - the land is a heightfield sampled on a fixed triangle grid (FROST_GRID); the mesh uses the very
//     same triangles, so frostGroundY() is exactly where the snow is
//   - its submerged slopes (frostSeaFloorY) rise from the deep sea floor to shallows round the beaches
//   - the slide chutes are carved into the heightfield: smooth, always-downhill grooves
// NOTE: must not import places.ts or terrain.ts (terrain imports places): the few shared numbers are
// repeated here and checked against terrain.ts by the tests.

/** the sea's resting surface (= terrain.WATER_Y) */
export const FROST_WATER_Y = -0.25;
/** the deep sea floor around the island (= terrain.DEEP_FLOOR) */
const DEEP = -22;

export const FROST_ISLAND = { id: "frostpeak", name: "Frostpeak Isle", x: 385, z: 228, r: 66 };
const X0 = FROST_ISLAND.x;
const Z0 = FROST_ISLAND.z;
const R = FROST_ISLAND.r;
/** how far out (from the island centre) the submerged slopes reach the deep floor */
export const FROST_SEA_R = 128;

// ── tiny deterministic noise ──

function hash2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** a seeded xorshift rng (0..1) */
export function frostRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const W = (lx: number, lz: number) => ({ x: X0 + lx, z: Z0 + lz });

function segDist2(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const ux = bx - ax;
  const uz = bz - az;
  const t = Math.min(1, Math.max(0, ((px - ax) * ux + (pz - az) * uz) / (ux * ux + uz * uz || 1)));
  return (ax + ux * t - px) ** 2 + (az + uz * t - pz) ** 2;
}

// ── the shape of the land (local coordinates: relative to the island centre) ──

/** the coastline's radius (where the beach meets the sea) at angle a = atan2(lx, lz) */
export function frostCoastR(a: number): number {
  return R * (1 + 0.06 * Math.sin(2 * a + 0.4) + 0.045 * Math.sin(5 * a + 1.9) + 0.025 * Math.sin(9 * a + 0.6));
}

// the profile across the coast: s = distance / coast radius -> height (a shingle-and-snow beach)
const PROFILE: [number, number][] = [
  [0.8, NaN], // (inland: the snowfields)
  [0.9, 1.25], // top of the beach
  [1.0, -0.65], // just under the waterline
  [1.1, -1.9],
  [1.22, -3.6],
  [1.4, -7],
  [1.7, DEEP - 1.2], // down the island's flanks to the deep floor
];
// ... and where the ice cliffs are (the east coast): high snow right up to a sheer drop
const CLIFF: [number, number][] = [
  [0.8, NaN],
  [0.955, 7.2],
  [0.99, -1.2],
  [1.06, -5.5],
  [1.3, -11],
  [1.7, DEEP - 1.2],
];
function profileAt(P: [number, number][], s: number, inland: number, top: boolean): number {
  if (s <= P[0][0]) return inland;
  if (s >= P[P.length - 1][0]) return P[P.length - 1][1];
  let i = 0;
  while (s > P[i + 1][0]) i++;
  const [s0, h0] = P[i];
  const [s1, h1] = P[i + 1];
  const a0 = Number.isNaN(h0) ? inland : h0;
  const b1 = top && i === 0 ? Math.max(h1, inland + 3.2) : h1;
  const k = (s - s0) / (s1 - s0);
  return lerp(a0, b1, i >= 4 ? k * 0.35 + fade(k) * 0.65 : fade(k));
}
/** 0..1: how much of the coast at angle a is ice cliff */
export function frostCliffK(a: number): number {
  return smooth(1.05, 1.45, a) * (1 - smooth(2.55, 2.95, a));
}

/** the snowfields' base height: dry land stays well above the sea's crests */
const LAND_Y = 3.0;
const PEAK = { lx: 14, lz: 6, r: 34, h: 27 };
const HILLS: [number, number, number, number][] = [
  // lx, lz, r, h
  [38, -22, 18, 11], // the north-east hill (the aurora lookout)
  [24, 38, 15, 7], // the south hill
];
/** level terraces: [lx, lz, inner r, outer r, height] */
const COLONY_L = { lx: -36.7, lz: -15.9 };
const TERRACE_L = { lx: -4, lz: 4, h: 11 };
const CAMP_L = { lx: -20, lz: 37 };
const HUT_L = { lx: -6, lz: 47.5 };
const CAVE_L = { lx: 6, lz: -38 };
/** the Penguin Ski Run: its start terrace on the peak's south-east shoulder, and the run-out at the bottom */
const SKI_TOP_L = { lx: 31, lz: 3, h: 11 };
const SKI_BOT_L = { lx: 41, lz: 31, h: 3 };
/** the warm-up lodge, on its own little terrace beside the run-out */
const LODGE_L = { lx: 32.6, lz: 36.6 };
const FLATS: [number, number, number, number, number][] = [
  [COLONY_L.lx, COLONY_L.lz, 8, 12.5, 1.9], // Penguin Point
  [TERRACE_L.lx, TERRACE_L.lz, 5.6, 10, TERRACE_L.h], // Slide Top
  [CAMP_L.lx, CAMP_L.lz, 8, 12, 2.6], // the igloo camp
  [HUT_L.lx, HUT_L.lz, 3.8, 6.5, 2.7], // the research station
  [CAVE_L.lx, CAVE_L.lz, 5.5, 8.5, 2.8], // the ice cave's floor
  [SKI_TOP_L.lx, SKI_TOP_L.lz, 6.5, 10.5, SKI_TOP_L.h], // the ski run's start
  [SKI_BOT_L.lx, SKI_BOT_L.lz, 5.5, 9.5, SKI_BOT_L.h], // the ski run's bottom (the lift station)
  [LODGE_L.lx, LODGE_L.lz, 4.4, 7.5, SKI_BOT_L.h + 0.1], // the warm-up lodge
];
const POND_L = { lx: 3, lz: 30, rx: 8, rz: 5.5, rot: 0.3, iceY: 2.05, bedY: 1.55 };

function pondE(lx: number, lz: number) {
  const dx = lx - POND_L.lx;
  const dz = lz - POND_L.lz;
  const c = Math.cos(POND_L.rot);
  const s = Math.sin(POND_L.rot);
  const u = (dx * c - dz * s) / POND_L.rx;
  const v = (dx * s + dz * c) / POND_L.rz;
  const a = Math.atan2(u, v);
  return Math.hypot(u, v) * (1 + 0.05 * Math.sin(3 * a + 1) + 0.04 * Math.sin(5 * a));
}

/** the island's height before the slide chutes are carved in */
function rawHeight(lx: number, lz: number): number {
  const d = Math.hypot(lx, lz);
  const a = Math.atan2(lx, lz);
  const s = d / frostCoastR(a);
  // rolling snowy hummocks
  const inland = LAND_Y + (noise(lx / 14 + 5, lz / 14 - 3, 3) - 0.5) * 1.5 + (noise(lx / 5, lz / 5, 4) - 0.5) * 0.3;
  const ck = frostCliffK(a);
  let h = profileAt(PROFILE, s, inland, false);
  if (ck > 0) h = lerp(h, profileAt(CLIFF, s, inland, true), ck);
  // a little rubble on the shelf
  if (s > 1.02 && s < 1.45) h += (noise(lx / 6, lz / 6, 8) - 0.5) * 0.6;
  // the peak: broad snowy flanks, a craggy ridge, then a sharp summit horn
  const pd = Math.hypot(lx - PEAK.lx, lz - PEAK.lz) / PEAK.r;
  if (pd < 1) {
    const k = Math.pow(1 - fade(pd), 1.5);
    const crag = 0.86 + 0.28 * noise(lx / 5 + 2, lz / 5, 11) + 0.12 * noise(lx / 2.2, lz / 2.2, 12);
    h += PEAK.h * k * crag;
    if (pd < 0.24) h += 9 * Math.pow(1 - pd / 0.24, 1.6);
  }
  for (const [hx, hz, hr, hh] of HILLS) {
    const q = Math.hypot(lx - hx, lz - hz) / hr;
    if (q < 1) h += hh * Math.pow(1 - fade(q), 1.2) * (0.9 + 0.2 * noise(lx / 4, lz / 4, 13));
  }
  // level terraces
  for (const [fx, fz, r0, r1, fh] of FLATS) {
    const fd = Math.hypot(lx - fx, lz - fz);
    if (fd < r1) h = lerp(h, fh, 1 - smooth(r0, r1, fd));
  }
  // the frozen pond: a shallow hollow (the ice lies over it)
  const e = pondE(lx, lz);
  if (e < 1.35) h = lerp(h, POND_L.bedY - 0.12 * (1 - Math.min(1, e)), 1 - smooth(0.9, 1.3, e));
  return h;
}

// ── the slide chutes ──

/** the channel's floor sits this far above the carved ground (the slide mesh's ice) */
export const SLIDE_FLOOR = 0.06;
/** half the width of a chute's icy floor (m); its walls stand just outside */
export const SLIDE_HALF = 1.15;
const CHUTE_DEFS: { id: string; name: string; pts: [number, number][] }[] = [
  {
    id: "frost-slide-belly",
    name: "Big Belly Slide",
    pts: [
      [-4.8, -1.2],
      [-6.5, -9],
      [-11, -19],
      [-19, -31],
      [-30, -45],
      [-39, -56],
      [-45, -63],
    ],
  },
  {
    id: "frost-slide-zoomy",
    name: "Zoomy Chute",
    pts: [
      [-9.3, 5.6],
      [-20, 6],
      [-32, 4],
      [-45, 1.5],
      [-58, -1.2],
      [-66, -3],
    ],
  },
  {
    id: "frost-slide-wiggly",
    name: "Wiggly Whoosh",
    pts: [
      [-5.2, 9.1],
      [-9, 14],
      [-16, 17.5],
      [-23, 17],
      [-30, 20.5],
      [-36, 26],
      [-43, 28],
      [-50, 33],
      [-57, 37],
    ],
  },
];

interface Chute {
  id: string;
  name: string;
  /** centreline samples (local), ~1 m apart, from the top down into the sea */
  x: Float32Array;
  z: Float32Array;
  /** the channel's ground height at each sample (always downhill) */
  h: Float32Array;
  /** distance along from the top */
  u: Float32Array;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** a Catmull-Rom spline through the points, resampled ~`step` metres apart */
function spline(pts: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [];
  const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len / (step * 0.25)));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  // even spacing
  const even: [number, number][] = [out[0]];
  let acc = 0;
  for (let i = 1; i < out.length; i++) {
    const [ax, az] = out[i - 1];
    const [bx, bz] = out[i];
    let seg = Math.hypot(bx - ax, bz - az);
    let sx = ax;
    let sz = az;
    while (acc + seg >= step) {
      const k = (step - acc) / seg;
      sx += (bx - sx) * k;
      sz += (bz - sz) * k;
      even.push([sx, sz]);
      seg = Math.hypot(bx - sx, bz - sz);
      acc = 0;
    }
    acc += seg;
  }
  return even;
}

/** the steepest a chute gets (rise over run: ~31°) */
const MAX_DROP = 0.6;

function buildChute(def: (typeof CHUTE_DEFS)[number]): Chute {
  const pts = spline(def.pts, 1);
  // run on into the sea until the floor's well under the water
  const n0 = pts.length;
  const [ex, ez] = pts[n0 - 1];
  const [px, pz] = pts[n0 - 3];
  const dl = Math.hypot(ex - px, ez - pz) || 1;
  const dx = (ex - px) / dl;
  const dz = (ez - pz) / dl;
  let extra = 0;
  for (let k = 1; k < 40; k++) {
    const x = ex + dx * k;
    const z = ez + dz * k;
    pts.push([x, z]);
    if (rawHeight(x, z) < FROST_WATER_Y - 1.1) extra++;
    if (extra >= 3) break;
  }
  const n = pts.length;
  const h = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = rawHeight(pts[i][0], pts[i][1]);
  h[0] = TERRACE_L.h;
  // always downhill (cutting through any bumps) but never steeper than MAX_DROP (built up on a snow
  // bank where the hillside falls away faster), then smoothed (a moving average keeps it monotone)
  const mono = () => {
    for (let i = 1; i < n; i++) h[i] = Math.min(Math.max(h[i], h[i - 1] - MAX_DROP), h[i - 1] - 0.035);
  };
  mono();
  const tmp = new Float32Array(n);
  for (let pass = 0; pass < 8; pass++) {
    tmp.set(h);
    for (let i = 1; i < n - 1; i++) {
      const a = h[Math.max(0, i - 2)];
      const b = h[i - 1];
      const c = h[i + 1];
      const d = h[Math.min(n - 1, i + 2)];
      tmp[i] = (a + b * 2 + h[i] * 2 + c * 2 + d) / 8;
    }
    tmp[0] = TERRACE_L.h;
    h.set(tmp);
    mono();
  }
  const x = new Float32Array(n);
  const z = new Float32Array(n);
  const u = new Float32Array(n);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    x[i] = pts[i][0];
    z[i] = pts[i][1];
    if (i) u[i] = u[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
    minX = Math.min(minX, x[i]);
    maxX = Math.max(maxX, x[i]);
    minZ = Math.min(minZ, z[i]);
    maxZ = Math.max(maxZ, z[i]);
  }
  return { id: def.id, name: def.name, x, z, h, u, minX, maxX, minZ, maxZ };
}
const CHUTES: Chute[] = CHUTE_DEFS.map(buildChute);
/** how far either side of a chute's centreline the ground is shaped to it */
const CARVE_IN = 1.9;
const CARVE_OUT = 5.2;

/** the nearest chute to a local point: its height there and the distance (or null if none near) */
function chuteAt(lx: number, lz: number): { h: number; d: number } | null {
  let best: { h: number; d: number } | null = null;
  for (const c of CHUTES) {
    if (lx < c.minX - CARVE_OUT || lx > c.maxX + CARVE_OUT || lz < c.minZ - CARVE_OUT || lz > c.maxZ + CARVE_OUT) continue;
    const n = c.x.length;
    for (let i = 0; i + 1 < n; i++) {
      const ax = c.x[i];
      const az = c.z[i];
      const ux = c.x[i + 1] - ax;
      const uz = c.z[i + 1] - az;
      const L2 = ux * ux + uz * uz || 1;
      const t = Math.min(1, Math.max(0, ((lx - ax) * ux + (lz - az) * uz) / L2));
      const d = Math.hypot(ax + ux * t - lx, az + uz * t - lz);
      if (d < CARVE_OUT && (!best || d < best.d)) best = { h: c.h[i] + (c.h[i + 1] - c.h[i]) * t, d };
    }
  }
  return best;
}

// ── the penguins' walk up: a snowy ramp from the colony to Slide Top, never too steep ──

const ASCENT_L: [number, number][] = [
  [COLONY_L.lx + 6.5, COLONY_L.lz + 3.5],
  [-25, -9.5],
  [-20, -7],
  [-16, -4.5],
  [-12.5, -1.5],
  [-9.8, 0.4],
  [-8, 1.5],
  [-6.2, 2.3],
];
const RAMP_GRADE = 0.42;
const RAMP_IN = 1.5;
const RAMP_OUT = 4.2;
const RAMP = (() => {
  const pts = spline(ASCENT_L.slice().reverse(), 1);
  const n = pts.length;
  const h = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = rawHeight(pts[i][0], pts[i][1]);
  h[0] = TERRACE_L.h;
  const last = h[n - 1];
  const clampG = () => {
    for (let i = 1; i < n; i++) h[i] = Math.min(h[i - 1] + RAMP_GRADE, Math.max(h[i - 1] - RAMP_GRADE, h[i]));
    for (let i = n - 2; i >= 0; i--) h[i] = Math.min(h[i + 1] + RAMP_GRADE, Math.max(h[i + 1] - RAMP_GRADE, h[i]));
  };
  clampG();
  const tmp = new Float32Array(n);
  for (let pass = 0; pass < 6; pass++) {
    tmp.set(h);
    for (let i = 1; i < n - 1; i++) tmp[i] = (h[i - 1] + h[i] * 2 + h[i + 1]) / 4;
    tmp[0] = TERRACE_L.h;
    tmp[n - 1] = last;
    h.set(tmp);
    clampG();
  }
  return { x: Float32Array.from(pts, (p) => p[0]), z: Float32Array.from(pts, (p) => p[1]), h };
})();
function rampAt(lx: number, lz: number): { h: number; d: number } | null {
  let best: { h: number; d: number } | null = null;
  const n = RAMP.x.length;
  for (let i = 0; i + 1 < n; i++) {
    const ax = RAMP.x[i];
    const az = RAMP.z[i];
    if (Math.abs(ax - lx) > RAMP_OUT + 2 || Math.abs(az - lz) > RAMP_OUT + 2) continue;
    const ux = RAMP.x[i + 1] - ax;
    const uz = RAMP.z[i + 1] - az;
    const t = Math.min(1, Math.max(0, ((lx - ax) * ux + (lz - az) * uz) / (ux * ux + uz * uz || 1)));
    const d = Math.hypot(ax + ux * t - lx, az + uz * t - lz);
    if (d < RAMP_OUT && (!best || d < best.d)) best = { h: RAMP.h[i] + (RAMP.h[i + 1] - RAMP.h[i]) * t, d };
  }
  return best;
}

// ── the Penguin Ski Run: a groomed piste traversing the peak's south-east shoulder (a steady
// ~17° at its steepest, gentle at both ends), and a little nursery slope beside its bottom ──

/** half the width of the groomed piste (world units) */
export const PISTE_HW = 5;
export const NURSERY_HW = 2.6;
interface Run {
  x: Float32Array;
  z: Float32Array;
  h: Float32Array;
  u: Float32Array;
  len: number;
  hw: number;
  carveIn: number;
  carveOut: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
function buildRun(ctrl: [number, number][], h0: number, h1: number, hw: number, carveIn: number, carveOut: number): Run {
  const pts = spline(ctrl, 1);
  const n = pts.length;
  const x = Float32Array.from(pts, (p) => p[0]);
  const z = Float32Array.from(pts, (p) => p[1]);
  const u = new Float32Array(n);
  for (let i = 1; i < n; i++) u[i] = u[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
  const len = u[n - 1];
  // (half linear, half eased: a steady fall line, flattening out at the start and the run-out)
  const h = Float32Array.from(u, (s) => {
    const k = s / len;
    return h0 + (h1 - h0) * (0.45 * k + 0.55 * fade(k));
  });
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i]);
    maxX = Math.max(maxX, x[i]);
    minZ = Math.min(minZ, z[i]);
    maxZ = Math.max(maxZ, z[i]);
  }
  return { x, z, h, u, len, hw, carveIn, carveOut, minX, maxX, minZ, maxZ };
}
const PISTE = buildRun(
  [
    [33.5, 6],
    [39, 10.5],
    [43.5, 16],
    [45.5, 22],
    [44, 27.5],
  ],
  SKI_TOP_L.h,
  SKI_BOT_L.h,
  PISTE_HW,
  PISTE_HW + 1.5,
  PISTE_HW + 7,
);
const NURSERY = buildRun(
  [
    [53.5, 18.5],
    [52.6, 22.5],
    [51.5, 26.5],
  ],
  4.6,
  3.15,
  NURSERY_HW,
  NURSERY_HW + 1,
  NURSERY_HW + 5,
);
const SKI_RUNS = [PISTE, NURSERY];
/** the nearest point of a run: its groomed height, distance from the centreline, distance along it */
function runAt(r: Run, lx: number, lz: number, reach: number): { h: number; d: number; s: number } | null {
  if (lx < r.minX - reach || lx > r.maxX + reach || lz < r.minZ - reach || lz > r.maxZ + reach) return null;
  let best: { h: number; d: number; s: number } | null = null;
  const n = r.x.length;
  for (let i = 0; i + 1 < n; i++) {
    const ax = r.x[i];
    const az = r.z[i];
    const ux = r.x[i + 1] - ax;
    const uz = r.z[i + 1] - az;
    const L2 = ux * ux + uz * uz || 1;
    const t = Math.min(1, Math.max(0, ((lx - ax) * ux + (lz - az) * uz) / L2));
    const d = Math.hypot(ax + ux * t - lx, az + uz * t - lz);
    if (d < reach && (!best || d < best.d)) best = { h: r.h[i] + (r.h[i + 1] - r.h[i]) * t, d, s: r.u[i] + (r.u[i + 1] - r.u[i]) * t };
  }
  return best;
}

/** the island's height at a local point (the smooth truth the grid samples) */
function localHeight(lx: number, lz: number): number {
  let h = rawHeight(lx, lz);
  const r = rampAt(lx, lz);
  if (r) h = lerp(h, r.h, 1 - smooth(RAMP_IN, RAMP_OUT, r.d));
  for (const run of SKI_RUNS) {
    const p = runAt(run, lx, lz, run.carveOut);
    if (p) h = lerp(h, p.h, 1 - smooth(run.carveIn, run.carveOut, p.d));
  }
  const c = chuteAt(lx, lz);
  if (!c) return h;
  return lerp(h, c.h, 1 - smooth(CARVE_IN, CARVE_OUT, c.d));
}

// ── the height grid (the mesh uses exactly these triangles) ──

/** grid spacing (m) and half-extent (m, local) of the island's land mesh */
export const FROST_GRID = 1.6;
export const FROST_EXTENT = 82;
export const FROST_N = Math.round((FROST_EXTENT * 2) / FROST_GRID) + 1;
let grid: Float32Array | null = null;

/** the baked heights (row-major N x N: rows along z, columns along x, local -EXTENT..EXTENT) */
export function frostGrid(): Float32Array {
  if (grid) return grid;
  const N = FROST_N;
  const g = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) g[j * N + i] = localHeight(-FROST_EXTENT + i * FROST_GRID, -FROST_EXTENT + j * FROST_GRID);
  grid = g;
  return g;
}

/** the land height at a world point, interpolated on the mesh's triangles (null off the grid) */
export function frostLandY(x: number, z: number): number | null {
  const fx = (x - X0 + FROST_EXTENT) / FROST_GRID;
  const fz = (z - Z0 + FROST_EXTENT) / FROST_GRID;
  const N = FROST_N;
  if (!(fx >= 0 && fz >= 0 && fx < N - 1 && fz < N - 1)) return null;
  const g = frostGrid();
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const k = j * N + i;
  // cells are split along the (i+1, j) – (i, j+1) diagonal
  if (u + v <= 1) return g[k] + (g[k + 1] - g[k]) * u + (g[k + N] - g[k]) * v;
  return g[k + N + 1] + (g[k + N] - g[k + N + 1]) * (1 - u) + (g[k + 1] - g[k + N + 1]) * (1 - v);
}

/** the smooth height of the island (land and submerged slopes) at a world point, for the skirt mesh */
export function frostHeightAt(x: number, z: number): number {
  return localHeight(x - X0, z - Z0);
}

// ── ice floes (walkable, floating just above the calm water) and icebergs (too steep: obstacles) ──

export interface FrostFloe {
  id: string;
  x: number;
  z: number;
  /** mean radius; the outline wobbles (frostFloeR) */
  r: number;
  rot: number;
  /** the top of the ice */
  top: number;
  seed: number;
}
export const FLOE_TOP = 0.42;
const FLOES_L: [number, number, number][] = [
  // angle (atan2(lx, lz)), distance from the centre, radius
  [-2.95, 94, 5.5],
  [-2.6, 99, 4.2],
  [-2.25, 92, 6.6],
  [-1.88, 101, 4.6],
  [-1.5, 93, 5.4],
  [-1.12, 99, 3.9],
  [-0.72, 92, 5.2],
  [0.35, 94, 4.4],
  [2.3, 97, 4.8],
];
export const FROST_FLOES: FrostFloe[] = FLOES_L.map(([a, d, r], i) => ({ id: `floe-${i}`, ...W(Math.sin(a) * d, Math.cos(a) * d), r, rot: i * 1.7, top: FLOE_TOP, seed: 31 + i * 7 }));
/** a floe's outline radius at angle b (in its own frame) */
export function frostFloeR(f: FrostFloe, b: number): number {
  return f.r * (1 + 0.14 * Math.sin(3 * b + f.seed) + 0.08 * Math.sin(5 * b + f.seed * 2) + 0.05 * Math.sin(7 * b + f.seed * 0.3));
}
/** the floe under (x, z), if any */
export function frostFloeAt(x: number, z: number): FrostFloe | null {
  for (const f of FROST_FLOES) {
    const dx = x - f.x;
    const dz = z - f.z;
    const d = Math.hypot(dx, dz);
    if (d > f.r * 1.3) continue;
    if (d <= frostFloeR(f, Math.atan2(dx, dz) - f.rot)) return f;
  }
  return null;
}

export interface FrostBerg {
  id: string;
  x: number;
  z: number;
  /** footprint radius at the waterline */
  r: number;
  /** height above the water */
  h: number;
  rot: number;
  seed: number;
}
const BERGS_L: [number, number, number, number][] = [
  // angle, distance, radius, height
  [-2.35, 110, 8, 15],
  [-1.3, 111, 6.5, 10],
  [0.62, 108, 9, 18],
  [1.75, 104, 7.5, 13],
  [2.95, 109, 6, 9],
];
export const FROST_BERGS: FrostBerg[] = BERGS_L.map(([a, d, r, h], i) => ({ id: `berg-${i}`, ...W(Math.sin(a) * d, Math.cos(a) * d), r, h, rot: i * 2.1 + 0.4, seed: 71 + i * 13 }));

// ── walkable ground + the sea floor ──

/** the frozen pond: its ice is walkable (and slippery!) */
export const FROST_POND = { ...W(POND_L.lx, POND_L.lz), rx: POND_L.rx, rz: POND_L.rz, rot: POND_L.rot, iceY: POND_L.iceY };
/** is (x, z) (world) on the frozen pond's ice */
export function frostOnPond(x: number, z: number): boolean {
  return pondE(x - X0, z - Z0) < 1.06;
}

/** land height above the sea where (x, z) is on the island's walkable ground (snow, beach, the
 *  slide chutes, the frozen pond's ice, the ice floes), else null */
export function frostGroundY(x: number, z: number): number | null {
  const dx = x - X0;
  const dz = z - Z0;
  const d2 = dx * dx + dz * dz;
  if (d2 > (FROST_SEA_R - 10) ** 2) return null;
  if (d2 > (FROST_EXTENT - 4) ** 2) {
    const f = frostFloeAt(x, z);
    return f ? f.top : null;
  }
  const land = frostLandY(x, z);
  if (land === null) return null;
  if (frostOnPond(x, z)) return Math.max(land, POND_L.iceY);
  if (land < FROST_WATER_Y + 0.05) {
    const f = frostFloeAt(x, z);
    return f ? f.top : null;
  }
  return land;
}

/** the island's own sea floor (its submerged slopes rising out of the deep), for swimming near it;
 *  returns null far from it. (It meets the deep floor at the rim, so max() with the sea's floor is seamless.) */
export function frostSeaFloorY(x: number, z: number): number | null {
  const dx = x - X0;
  const dz = z - Z0;
  const d2 = dx * dx + dz * dz;
  if (d2 > FROST_SEA_R * FROST_SEA_R) return null;
  if (Math.abs(dx) < FROST_EXTENT - 1 && Math.abs(dz) < FROST_EXTENT - 1) {
    const g = frostLandY(x, z);
    if (g !== null) return g;
  }
  return localHeight(dx, dz);
}

// ── the slides (for the renderer, the penguins and the kid) ──

export interface FrostSlide {
  id: string;
  name: string;
  /** world points ~1 m apart from the top (on the Slide Top terrace) down the chute and into the
   *  sea; y = the chute's icy floor */
  path: { x: number; y: number; z: number }[];
}
export const FROST_SLIDES: FrostSlide[] = CHUTES.map((c) => ({
  id: c.id,
  name: c.name,
  path: Array.from(c.x, (lx, i) => ({ x: X0 + lx, y: c.h[i] + SLIDE_FLOOR, z: Z0 + c.z[i] })),
}));
/** the index along a slide's path where it first dips under the sea (the splash) */
export function frostSlideSplash(s: FrostSlide): number {
  const i = s.path.findIndex((p) => p.y < FROST_WATER_Y);
  return i < 0 ? s.path.length - 1 : i;
}

// ── the penguins' places and routes ──

/** Penguin Point: the colony's terrace (world) */
export const FROST_COLONY = { ...W(COLONY_L.lx, COLONY_L.lz), r: 9, y: 1.9 };
/** the Slide Top terrace on the peak's shoulder, where every chute starts */
export const FROST_TERRACE = { ...W(TERRACE_L.lx, TERRACE_L.lz), r: 5.2, y: TERRACE_L.h };
/** where the emperors huddle and the chicks crowd together (world) */
export const FROST_HUDDLE = { ...W(COLONY_L.lx + 1.5, COLONY_L.lz + 3.5), r: 2.2 };
export const FROST_CRECHE = { ...W(COLONY_L.lx + 3.5, COLONY_L.lz - 3), r: 1.8 };

/** the waddling path from the colony up the slope between the chutes to Slide Top (world x, z) */
export const FROST_ASCENT: { x: number; z: number }[] = ASCENT_L.map(([lx, lz]) => W(lx, lz));

/** the heading out from the island centre to the colony's beach */
const COLONY_A = Math.atan2(COLONY_L.lx, COLONY_L.lz);
const polarW = (a: number, r: number) => W(Math.sin(a) * r, Math.cos(a) * r);
/** the colony's beach: where the swimmers come ashore (in the water `entry`, hop to `land`) */
export const FROST_SHORE = {
  a: COLONY_A,
  entry: polarW(COLONY_A, frostCoastR(COLONY_A) * 1.055),
  land: polarW(COLONY_A, frostCoastR(COLONY_A) * 0.935),
  /** the sideways direction along the beach (world), to spread the landings out */
  side: { x: Math.cos(COLONY_A), z: -Math.sin(COLONY_A) },
};
/** the bay off the colony where penguins go fishing underwater (world): a loop round (x, z) */
export const FROST_FISHING = { ...polarW(COLONY_A, frostCoastR(COLONY_A) * 1.44), r: 12 };

/** each chute's swim home: from its splash, round the coast to the colony's beach (world x, z) */
export const FROST_SWIMS: { x: number; z: number }[][] = FROST_SLIDES.map((s) => {
  const end = s.path[s.path.length - 1];
  const a0 = Math.atan2(end.x - X0, end.z - Z0);
  const a1 = COLONY_A;
  const out: { x: number; z: number }[] = [{ x: end.x, z: end.z }];
  const da = a1 - a0;
  const n = Math.max(2, Math.ceil((Math.abs(da) * R) / 4));
  for (let k = 1; k <= n; k++) {
    const a = a0 + (da * k) / n;
    const r = frostCoastR(a) * (1.12 + 0.03 * Math.sin((k / n) * Math.PI));
    out.push(polarW(a, r));
  }
  out.push(FROST_SHORE.entry);
  return out;
});

// ── the Penguin Ski Run (world): the piste, the nursery slope, the slalom course, the chairlift ──

export interface FrostRun {
  /** centreline samples ~1 m apart from the top down (world x, z; y = the groomed snow) */
  x: Float32Array;
  z: Float32Array;
  y: Float32Array;
  /** distance along from the top */
  u: Float32Array;
  len: number;
  /** half the groomed width */
  hw: number;
}
const worldRun = (r: Run): FrostRun => ({ x: Float32Array.from(r.x, (v) => v + X0), z: Float32Array.from(r.z, (v) => v + Z0), y: Float32Array.from(r.h), u: r.u, len: r.len, hw: r.hw });

/** a point on a run, `lat` to the left of its centreline (looking downhill); dx, dz = downhill */
export function frostRunPoint(r: FrostRun, s: number, lat: number, out: { x: number; z: number; dx: number; dz: number }) {
  const d = Math.min(r.len, Math.max(0, s));
  const n = r.x.length;
  // (binary search: runs are a few dozen samples)
  let lo = 1;
  let hi = n - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (r.u[m] < d) lo = m + 1;
    else hi = m;
  }
  const k = lo;
  const seg = r.u[k] - r.u[k - 1] || 1;
  const f = (d - r.u[k - 1]) / seg;
  const dx = (r.x[k] - r.x[k - 1]) / seg;
  const dz = (r.z[k] - r.z[k - 1]) / seg;
  out.dx = dx;
  out.dz = dz;
  // (left = (dz, -dx))
  out.x = r.x[k - 1] + (r.x[k] - r.x[k - 1]) * f + dz * lat;
  out.z = r.z[k - 1] + (r.z[k] - r.z[k - 1]) * f - dx * lat;
  return out;
}

/** the slalom course: the racing line weaves `COURSE_AMP` either side of the piste's centre */
export const COURSE_AMP = 2.3;
export const COURSE_WAVE = 7.6;
export const COURSE_S0 = 3.5;
const COURSE_S1 = PISTE.len - 3.5;
/** the racing line's offset (left +) at distance s down the piste */
export function frostCourseLat(s: number): number {
  const a = COURSE_AMP * smooth(COURSE_S0, COURSE_S0 + 3, s) * (1 - smooth(COURSE_S1 - 3, COURSE_S1, s));
  return a * Math.sin(((s - COURSE_S0) / COURSE_WAVE) * Math.PI * 2);
}
/** each gate's two poles stand this far either side of the racing line */
export const GATE_HALF = 1.05;
const gates: { s: number; lat: number; red: boolean }[] = [];
for (let k = 0, s = COURSE_S0 + COURSE_WAVE / 4; s < COURSE_S1 - 1.5; k++, s += COURSE_WAVE / 2) if (s > COURSE_S0 + 3) gates.push({ s, lat: frostCourseLat(s), red: k % 2 === 0 });

/** the chairlift: bottom (B) and top (T) stations, the line between them (world) */
const LIFT_B = W(36.8, 30.6);
const LIFT_T = W(27.8, 2.0);
const LIFT_LEN = Math.hypot(LIFT_T.x - LIFT_B.x, LIFT_T.z - LIFT_B.z);
const LIFT_DX = (LIFT_T.x - LIFT_B.x) / LIFT_LEN;
const LIFT_DZ = (LIFT_T.z - LIFT_B.z) / LIFT_LEN;
/** the up line and the down line run this far either side of the lift's axis */
export const LIFT_GAP = 1.2;
/** a chair's seat hangs this far below its cable */
export const CHAIR_DROP = 2.25;
const liftGround = (d: number) => frostLandY(LIFT_B.x + LIFT_DX * d, LIFT_B.z + LIFT_DZ * d) ?? 3;
/** the cable's heads: [distance from the bottom station, height] — station wheels and pylon tops */
const CABLE: [number, number][] = (() => {
  const ds = [0, 6.5, 13, 19.5, 25, LIFT_LEN];
  const hs = ds.map((d, i) => liftGround(d) + (i === 0 || i === ds.length - 1 ? 2.95 : 5.4));
  // raise pylons until a hanging penguin clears the snow everywhere along the line
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 0; i + 1 < ds.length; i++) {
      for (let k = 1; k < 10; k++) {
        const d = ds[i] + ((ds[i + 1] - ds[i]) * k) / 10;
        const y = hs[i] + ((hs[i + 1] - hs[i]) * k) / 10;
        const need = liftGround(d) + CHAIR_DROP + 1.1 - y;
        if (need > 0) {
          if (i > 0) hs[i] += need;
          if (i + 1 < ds.length - 1) hs[i + 1] += need;
        }
      }
    }
  }
  return ds.map((d, i) => [d, hs[i]] as [number, number]);
})();
/** the cable's height at distance d (0 = bottom station .. LIFT_LEN = top) along the lift */
export function frostCableY(d: number): number {
  const c = CABLE;
  if (d <= 0) return c[0][1];
  for (let i = 0; i + 1 < c.length; i++) if (d <= c[i + 1][0]) return c[i][1] + ((c[i + 1][1] - c[i][1]) * (d - c[i][0])) / (c[i + 1][0] - c[i][0]);
  return c[c.length - 1][1];
}

const runStart = (r: Run) => W(r.x[0], r.z[0]);
const pisteDir0 = { x: PISTE.x[4] - PISTE.x[0], z: PISTE.z[4] - PISTE.z[0] };
const pd0L = Math.hypot(pisteDir0.x, pisteDir0.z);
/** the start hut beside the piste's start gate, the lodge at the bottom (world) */
const SKI_HUT_L = { lx: PISTE.x[0] + (pisteDir0.z / pd0L) * 5.2 - (pisteDir0.x / pd0L) * 1.8, lz: PISTE.z[0] - (pisteDir0.x / pd0L) * 5.2 - (pisteDir0.z / pd0L) * 1.8 };

/** the start gate's queue pen (to the right of the start line, looking downhill): how far right and
 *  back from the gate its rows run (world units) */
export const SKI_PEN = { right0: 2.4, right1: 6.6, back0: 0.8, back1: 2.4 };
/** the ski run's viewpoint: a telescope deck on the lodge's terrace, looking up the whole run */
const SKI_VIEW_L = (() => {
  const mid = Math.floor(PISTE.x.length * 0.45);
  const dx = PISTE.x[mid] - LODGE_L.lx;
  const dz = PISTE.z[mid] - LODGE_L.lz;
  const l = Math.hypot(dx, dz);
  // (round to the west of the line to the run, clear of the lift's bottom station)
  const a = Math.atan2(dx, dz) + 0.62;
  return { lx: LODGE_L.lx + Math.sin(a) * 5.6, lz: LODGE_L.lz + Math.cos(a) * 5.6, mid, l };
})();

export const FROST_SKI = {
  piste: worldRun(PISTE),
  nursery: worldRun(NURSERY),
  /** the start terrace and the run-out (world, y = the snow) */
  top: { ...W(SKI_TOP_L.lx, SKI_TOP_L.lz), y: SKI_TOP_L.h },
  bottom: { ...W(SKI_BOT_L.lx, SKI_BOT_L.lz), y: SKI_BOT_L.h },
  start: runStart(PISTE),
  gates,
  lift: { b: LIFT_B, t: LIFT_T, len: LIFT_LEN, dx: LIFT_DX, dz: LIFT_DZ, heads: CABLE, wheel: 0.6 },
  hut: W(SKI_HUT_L.lx, SKI_HUT_L.lz),
  lodge: W(LODGE_L.lx, LODGE_L.lz),
  /** the viewpoint (stand here to see the whole run) and the point on the run it looks at */
  view: { ...W(SKI_VIEW_L.lx, SKI_VIEW_L.lz), look: W(PISTE.x[SKI_VIEW_L.mid], PISTE.z[SKI_VIEW_L.mid]), lookY: PISTE.h[SKI_VIEW_L.mid] },
};
/** distance (m) from a world point to the piste's or the nursery slope's centreline, and along it */
export function frostPisteAt(x: number, z: number): { d: number; s: number; nursery: boolean } | null {
  const lx = x - X0;
  const lz = z - Z0;
  const a = runAt(PISTE, lx, lz, PISTE.hw + 2);
  const b = runAt(NURSERY, lx, lz, NURSERY.hw + 1.5);
  // (the nearer of the two)
  if (a && (!b || a.d - PISTE.hw <= b.d - NURSERY.hw)) return { d: a.d, s: a.s, nursery: false };
  return b ? { d: b.d, s: b.s, nursery: true } : null;
}

// ── the island's things ──

export type FrostPropKind =
  | "igloo"
  | "hut"
  | "pine"
  | "rock"
  | "crystal"
  | "snowman"
  | "sled"
  | "lamp"
  | "flag"
  | "sign"
  | "telescope"
  | "cave"
  | "fishhole"
  | "crates"
  | "slidegate"
  | "fire"
  | "skihut"
  | "lodge"
  | "skirack"
  | "pylon"
  | "liftstation"
  | "skigate"
  | "marker"
  | "arrow";

export interface FrostProp {
  kind: FrostPropKind;
  x: number;
  z: number;
  /** base height (ground) */
  y: number;
  /** facing (radians, atan2 convention: the prop's front looks along (sin rot, cos rot)) */
  rot: number;
  s: number;
  seed: number;
  v: number;
  /** a height (pylons: the cable head above the base; ski gates: the gate's half-width) */
  h?: number;
}

/** obstacle radius of one prop (0 = walk-through) at scale 1 */
const PROP_R: Record<FrostPropKind, number> = {
  igloo: 2.6,
  hut: 3.4,
  pine: 0.7,
  rock: 1.1,
  crystal: 0.8,
  snowman: 0.7,
  sled: 0.9,
  lamp: 0.2,
  flag: 0.15,
  sign: 0.3,
  telescope: 0.45,
  cave: 0, // (walk-in: its walls are separate obstacles)
  fishhole: 0,
  crates: 0.8,
  slidegate: 0,
  fire: 0.8,
  skihut: 2.3,
  lodge: 3.4,
  skirack: 0.7,
  pylon: 0.55,
  liftstation: 1.7,
  skigate: 0,
  marker: 0,
  arrow: 0,
};
/** the ice cave: a dome of blue ice (radius, height) you can walk into; entrance faces `rot` */
export const FROST_CAVE = { ...W(CAVE_L.lx, CAVE_L.lz), r: 6, h: 5.2, rot: -2.4, y: 2.8 };
/** the research station and the igloo camp's campfire (world) */
export const FROST_HUT = { ...W(HUT_L.lx, HUT_L.lz), rot: Math.atan2(CAMP_L.lx - HUT_L.lx, CAMP_L.lz - HUT_L.lz) };
export const FROST_CAMP = { ...W(CAMP_L.lx, CAMP_L.lz), r: 8 };
/** the aurora lookout (top of the north-east hill) */
export const FROST_LOOKOUT = W(36.5, -21);
/** the peak's summit */
export const FROST_SUMMIT = W(PEAK.lx, PEAK.lz);

function groundAt(x: number, z: number) {
  return frostGroundY(x, z) ?? frostLandY(x, z) ?? 0;
}

function buildProps(): FrostProp[] {
  const out: FrostProp[] = [];
  const add = (kind: FrostPropKind, lx: number, lz: number, rot: number, extra: Partial<FrostProp> = {}) => {
    const p = W(lx, lz);
    out.push({ kind, x: p.x, z: p.z, y: groundAt(p.x, p.z), rot, s: 1, seed: out.length * 7 + 3, v: 0, ...extra });
    return out[out.length - 1];
  };
  const face = (lx: number, lz: number, tx: number, tz: number) => Math.atan2(tx - lx, tz - lz);
  const C = CAMP_L;
  // the igloo camp: igloos round a campfire, a snowman, a sled with crates
  add("fire", C.lx, C.lz, 0);
  const igloos: [number, number, number][] = [
    [-5.6, -1.6, 1],
    [-1.2, 5.8, 0.92],
    [5.2, 2.4, 1.06],
  ];
  igloos.forEach(([ox, oz, s], i) => add("igloo", C.lx + ox, C.lz + oz, face(C.lx + ox, C.lz + oz, C.lx, C.lz), { s, v: i }));
  add("snowman", C.lx + 3.4, C.lz - 4.4, face(C.lx + 3.4, C.lz - 4.4, C.lx - 20, C.lz - 40));
  add("sled", C.lx - 3.2, C.lz - 5.2, 0.5);
  add("crates", C.lx + 7.2, C.lz - 2.8, 0.3);
  add("lamp", C.lx - 7.8, C.lz + 3.8, 0);
  add("lamp", C.lx + 1.5, C.lz - 7.5, 0);
  // the research station: a little red hut with a radio mast and a weather vane, and its flag
  add("hut", HUT_L.lx, HUT_L.lz, FROST_HUT.rot);
  add("flag", HUT_L.lx + 4.4, HUT_L.lz - 1.8, 0.3, { v: 1 });
  add("lamp", HUT_L.lx - 3.6, HUT_L.lz - 4, 0);
  add("crates", HUT_L.lx + 3.9, HUT_L.lz + 2.6, 1.1, { v: 1 });
  // the frozen pond: an ice-fishing hole, a sign
  add("fishhole", POND_L.lx + 3.2, POND_L.lz + 0.6, 0);
  add("sign", POND_L.lx - 8.4, POND_L.lz - 3.8, face(POND_L.lx - 8.4, POND_L.lz - 3.8, POND_L.lx, POND_L.lz), { v: 2 });
  // Slide Top: an arch over each chute's start, a flag, a sign
  for (const c of CHUTES) {
    const dx = c.x[3] - c.x[0];
    const dz = c.z[3] - c.z[0];
    add("slidegate", c.x[1], c.z[1], Math.atan2(dx, dz), { v: CHUTES.indexOf(c) });
  }
  add("flag", TERRACE_L.lx + 2.2, TERRACE_L.lz - 1.2, 0, { v: 0 });
  add("sign", COLONY_L.lx + 7.8, COLONY_L.lz + 6.8, face(COLONY_L.lx + 7.8, COLONY_L.lz + 6.8, -60, -40), { v: 0 });
  add("sign", -13.2, -7.2, face(-13.2, -7.2, -30, -20), { v: 1 });
  // the peak's summit flag, the lookout's telescope
  add("flag", PEAK.lx + 0.6, PEAK.lz - 0.4, 0, { v: 2 });
  add("telescope", FROST_LOOKOUT.x - X0, FROST_LOOKOUT.z - Z0, face(36.5, -21, -40, -110));
  add("sign", 34.5, -17.8, 0.2, { v: 3 });
  // the ice cave
  add("cave", CAVE_L.lx, CAVE_L.lz, FROST_CAVE.rot);
  // the way back up to Slide Top: blue arrow posts either side of the snowy ramp
  for (let i = 0; i + 1 < ASCENT_L.length; i++) {
    const [ax, az] = ASCENT_L[i];
    const [bx, bz] = ASCENT_L[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bx - ax, bz - az);
    for (let d = i === 0 ? 1 : 0; d < L - 1; d += 4.6) {
      const k = d / L;
      let side = (i + Math.floor(d / 4.6)) % 2 ? 1 : -1;
      const at = (sd: number) => [ax + (bx - ax) * k + ((bz - az) / L) * 2.1 * sd, az + (bz - az) * k - ((bx - ax) / L) * 2.1 * sd];
      // (the ramp runs between two chutes: keep the posts off their walls)
      if (chuteNear(at(side)[0], at(side)[1], 3.2)) side = -side;
      if (chuteNear(at(side)[0], at(side)[1], 3.2)) continue;
      add("arrow", at(side)[0], at(side)[1], rot, { v: 0 });
    }
  }

  // ── the Penguin Ski Run ──
  const pt = { x: 0, z: 0, dx: 0, dz: 1 };
  const PW = worldRun(PISTE);
  const startRot = Math.atan2(pisteDir0.x, pisteDir0.z);
  add("skihut", SKI_HUT_L.lx, SKI_HUT_L.lz, face(SKI_HUT_L.lx, SKI_HUT_L.lz, PISTE.x[0], PISTE.z[0]));
  add("skirack", SKI_HUT_L.lx - (pisteDir0.x / pd0L) * 3.3, SKI_HUT_L.lz - (pisteDir0.z / pd0L) * 3.3, startRot + Math.PI / 2, { v: 0 });
  add("lodge", LODGE_L.lx, LODGE_L.lz, face(LODGE_L.lx, LODGE_L.lz, SKI_BOT_L.lx + 2, SKI_BOT_L.lz - 2));
  add("skirack", LODGE_L.lx + 3.9, LODGE_L.lz - 3.2, face(LODGE_L.lx, LODGE_L.lz, SKI_BOT_L.lx, SKI_BOT_L.lz) + Math.PI / 2, { v: 1 });
  add("lamp", LODGE_L.lx - 3.6, LODGE_L.lz - 3.4, 0);
  add("lamp", SKI_TOP_L.lx - 2.5, SKI_TOP_L.lz + 3.4, 0);
  // the viewpoint's telescope, looking up the run
  add("telescope", SKI_VIEW_L.lx + 0.9, SKI_VIEW_L.lz + 0.3, Math.atan2(PISTE.x[SKI_VIEW_L.mid] - SKI_VIEW_L.lx, PISTE.z[SKI_VIEW_L.mid] - SKI_VIEW_L.lz));
  // rope posts round the start gate's queue pen (beside the start line, not on it)
  {
    const d0 = { x: pisteDir0.x / pd0L, z: pisteDir0.z / pd0L };
    const byStart = (back: number, right: number) => [PISTE.x[0] - d0.x * back - d0.z * right, PISTE.z[0] - d0.z * back + d0.x * right] as const;
    const P0 = SKI_PEN;
    const b0 = P0.back0 - 0.8;
    const b1 = P0.back1 + 0.8;
    const r0 = P0.right0 - 0.9;
    const r1 = P0.right1 + 0.9;
    for (const [b, r] of [[b0, r0], [b0, (r0 + r1) / 2], [b0, r1], [b1, r1], [b1, (r0 + r1) / 2], [b1, r0]] as const) {
      const [x, z] = byStart(b, r);
      add("marker", x, z, 0, { v: 1 });
    }
  }
  // the start gate: a banner arch over the piste's first metres
  add("skigate", PISTE.x[1], PISTE.z[1], startRot, { v: 2, h: 3.3 });
  // slalom gates (red / blue) along the racing line, and orange marker poles down both edges
  for (const g of gates) {
    frostRunPoint(PW, g.s, g.lat, pt);
    add("skigate", pt.x - X0, pt.z - Z0, Math.atan2(pt.dx, pt.dz), { v: g.red ? 0 : 1, h: GATE_HALF });
  }
  for (let s = 2; s < PISTE.len - 1; s += 5.5)
    for (const side of [-1, 1]) {
      frostRunPoint(PW, s, side * (PISTE.hw + 0.5), pt);
      add("marker", pt.x - X0, pt.z - Z0, 0, { v: Math.round(s / 5.5) % 2 });
    }
  // the chairlift: a station at each end, pylons between
  const liftRot = Math.atan2(LIFT_DX, LIFT_DZ);
  const at = (d: number) => ({ lx: LIFT_B.x - X0 + LIFT_DX * d, lz: LIFT_B.z - Z0 + LIFT_DZ * d });
  for (let i = 0; i < CABLE.length; i++) {
    const [d, hy] = CABLE[i];
    const p = at(d);
    const g = groundAt(p.lx + X0, p.lz + Z0);
    const end = i === 0 || i === CABLE.length - 1;
    add(end ? "liftstation" : "pylon", p.lx, p.lz, liftRot, { h: hy - g, v: i === 0 ? 0 : 1 });
  }

  // ── scatter: snowy pines, rocks, ice crystals (kept off the routes, chutes, terraces, the pond) ──
  const rnd = frostRng(4242);
  const discs = out.filter((p) => PROP_R[p.kind] > 0).map((p) => ({ x: p.x, z: p.z, r: PROP_R[p.kind] * p.s }));
  discs.push({ x: FROST_CAVE.x, z: FROST_CAVE.z, r: FROST_CAVE.r + 2.5 });
  discs.push({ ...W(COLONY_L.lx, COLONY_L.lz), r: 14 });
  discs.push({ ...W(TERRACE_L.lx, TERRACE_L.lz), r: 9 });
  discs.push({ ...W(CAMP_L.lx, CAMP_L.lz), r: 10 });
  discs.push({ ...W(SKI_TOP_L.lx, SKI_TOP_L.lz), r: 8 });
  discs.push({ ...W(SKI_BOT_L.lx, SKI_BOT_L.lz), r: 9 });
  discs.push({ ...W(LODGE_L.lx, LODGE_L.lz), r: 6 });
  const lines: [number, number, number, number][] = [];
  for (let i = 0; i + 1 < FROST_ASCENT.length; i++) lines.push([FROST_ASCENT[i].x, FROST_ASCENT[i].z, FROST_ASCENT[i + 1].x, FROST_ASCENT[i + 1].z]);
  lines.push([FROST_COLONY.x, FROST_COLONY.z, FROST_SHORE.land.x, FROST_SHORE.land.z]);
  const clearOf = (x: number, z: number, pad: number) => {
    if (!discs.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 > (t.r + pad) ** 2)) return false;
    if (!lines.every(([ax, az, bx, bz]) => segDist2(x, z, ax, az, bx, bz) > (pad + 2.2) ** 2)) return false;
    const c = chuteAt(x - X0, z - Z0);
    if (c && c.d < CARVE_OUT) return false;
    if (chuteNear(x - X0, z - Z0, pad + 4)) return false;
    if (segDist2(x, z, LIFT_B.x, LIFT_B.z, LIFT_T.x, LIFT_T.z) < (pad + 5) ** 2) return false;
    for (const run of SKI_RUNS) if (runAt(run, x - X0, z - Z0, run.hw + 3.5 + pad)) return false;
    return pondE(x - X0, z - Z0) > 1.45;
  };
  const tryPlace = (kind: FrostPropKind, lx: number, lz: number, pad: number, minY: number, maxY: number, extra: Partial<FrostProp> = {}) => {
    const p = W(lx, lz);
    const y = frostLandY(p.x, p.z);
    if (y === null || y < minY || y > maxY) return false;
    // (not on steep ground: sample the slope)
    const e = 1.2;
    const sl = Math.hypot((frostLandY(p.x + e, p.z) ?? y) - (frostLandY(p.x - e, p.z) ?? y), (frostLandY(p.x, p.z + e) ?? y) - (frostLandY(p.x, p.z - e) ?? y)) / (2 * e);
    if (kind !== "crystal" && kind !== "rock" && sl > 0.55) return false;
    if (!clearOf(p.x, p.z, pad)) return false;
    add(kind, lx, lz, rnd() * Math.PI * 2, extra);
    discs.push({ x: p.x, z: p.z, r: PROP_R[kind] * (extra.s ?? 1) });
    return true;
  };
  const scatter: [FrostPropKind, number, number, number, number, number][] = [
    // kind, count, pad, min height, max height, reach (fraction of the coast radius)
    ["pine", 46, 1.7, 1.6, 10, 0.84],
    ["rock", 18, 1.2, 0.6, 30, 0.93],
    ["crystal", 14, 1.3, 2.5, 30, 0.9],
  ];
  for (const [kind, count, pad, minY, maxY, reach] of scatter) {
    let n = 0;
    for (let k = 0; k < 3000 && n < count; k++) {
      const a = rnd() * Math.PI * 2;
      // pines grow on the sheltered south and east; rocks and crystals anywhere
      if (kind === "pine" && Math.cos(a - 0.9) < -0.35 && rnd() < 0.85) continue;
      const r = Math.sqrt(rnd()) * frostCoastR(a) * reach;
      const lx = Math.sin(a) * r;
      const lz = Math.cos(a) * r;
      const s = kind === "pine" ? 0.75 + rnd() * 0.6 : kind === "rock" ? 0.6 + rnd() * 0.9 : 0.6 + rnd() * 0.7;
      if (tryPlace(kind, lx, lz, pad, minY, maxY, { s, v: Math.floor(rnd() * 3) })) n++;
    }
  }
  return out;
}

/** is a local point within `r` of any chute's centreline */
function chuteNear(lx: number, lz: number, r: number): boolean {
  for (const c of CHUTES) {
    if (lx < c.minX - r || lx > c.maxX + r || lz < c.minZ - r || lz > c.maxZ + r) continue;
    for (let i = 0; i + 1 < c.x.length; i++) if (segDist2(lx, lz, c.x[i], c.z[i], c.x[i + 1], c.z[i + 1]) < r * r) return true;
  }
  return false;
}
/** distance (m) from a world point to the nearest slide chute's centreline */
export function frostChuteDistance(x: number, z: number): number {
  let best = Infinity;
  for (const c of CHUTES) for (let i = 0; i + 1 < c.x.length; i++) best = Math.min(best, segDist2(x - X0, z - Z0, c.x[i], c.z[i], c.x[i + 1], c.z[i + 1]));
  return Math.sqrt(best);
}

export const FROST_PROPS: FrostProp[] = buildProps();

/** the ice cave's walls, as a ring of discs with a gap for the entrance */
const CAVE_WALLS: { x: number; z: number; r: number }[] = (() => {
  const out: { x: number; z: number; r: number }[] = [];
  const n = 14;
  for (let k = 0; k < n; k++) {
    const b = (k / n) * Math.PI * 2;
    // (b = 0 is the entrance, facing rot)
    if (Math.cos(b) > 0.72) continue;
    const a = FROST_CAVE.rot + b;
    out.push({ x: FROST_CAVE.x + Math.sin(a) * (FROST_CAVE.r - 0.4), z: FROST_CAVE.z + Math.cos(a) * (FROST_CAVE.r - 0.4), r: 1.1 });
  }
  return out;
})();

/** round things to walk (or swim) around: igloos, the hut, pines, rocks, the ice cave's walls, icebergs */
export const FROST_OBSTACLES: { x: number; z: number; r: number }[] = [
  ...FROST_PROPS.filter((p) => PROP_R[p.kind] > 0).map((p) => ({ x: p.x, z: p.z, r: PROP_R[p.kind] * p.s })),
  ...CAVE_WALLS,
  ...FROST_BERGS.map((b) => ({ x: b.x, z: b.z, r: b.r })),
];

/** lamps (world x/z, the lamp's height) */
export const FROST_LAMPS: { x: number; z: number; y: number }[] = FROST_PROPS.filter((p) => p.kind === "lamp").map((p) => ({ x: p.x, z: p.z, y: p.y + 2.4 }));

// ── named spots (landing, HUD, discoveries) ──

export type FrostSpotKind = "colony" | "slide" | "icecave" | "igloo" | "peak" | "floe" | "aurora" | "ski";
export const FROST_SPOTS: { id: string; name: string; x: number; z: number; kind: FrostSpotKind }[] = [
  { id: "frost-colony", name: "Penguin Point", ...W(COLONY_L.lx + 2, COLONY_L.lz + 1), kind: "colony" },
  { id: "frost-slide-top", name: "Slide Top", ...W(TERRACE_L.lx - 1, TERRACE_L.lz + 0.5), kind: "slide" },
  ...CHUTES.map((c) => {
    const i = Math.floor(c.x.length * 0.55);
    return { id: c.id, name: c.name, ...W(c.x[i], c.z[i]), kind: "slide" as const };
  }),
  { id: "frost-icecave", name: "Blue Ice Cave", x: FROST_CAVE.x, z: FROST_CAVE.z, kind: "icecave" },
  { id: "frost-camp", name: "Igloo Camp", ...W(CAMP_L.lx, CAMP_L.lz), kind: "igloo" },
  { id: "frost-station", name: "Frostpeak Research Station", ...W(HUT_L.lx, HUT_L.lz - 4.5), kind: "igloo" },
  { id: "frost-pond", name: "Frozen Pond", x: FROST_POND.x, z: FROST_POND.z, kind: "floe" },
  { id: "frost-summit", name: "Frostpeak Summit", ...FROST_SUMMIT, kind: "peak" },
  { id: "frost-lookout", name: "Aurora Lookout", ...FROST_LOOKOUT, kind: "aurora" },
  ...FROST_FLOES.filter((_, i) => i % 2 === 0).map((f) => ({ id: `frost-${f.id}`, name: "Seal Floe", x: f.x, z: f.z, kind: "floe" as const })),
  { id: "frost-berg", name: "Giant Iceberg", x: FROST_BERGS[2].x, z: FROST_BERGS[2].z, kind: "floe" },
  { id: "frost-ski", name: "Penguin Ski Run", ...W(PISTE.x[Math.floor(PISTE.x.length * 0.6)] - 3, PISTE.z[Math.floor(PISTE.x.length * 0.6)] + 2), kind: "ski" },
];
/** how close (m) you must be to discover a spot */
export const FROST_SPOT_R: Record<FrostSpotKind, number> = { colony: 11, slide: 6.5, icecave: 7, igloo: 8, peak: 9, floe: 9, aurora: 7, ski: 9 };

/** real, fun facts for each spot (shown in turn each time you come back) */
export const FROST_FACTS: Record<string, string[]> = {
  "frost-colony": [
    "Emperor penguins can dive deeper than 500 m and hold their breath for over 20 minutes!",
    "In icy storms, emperor penguins huddle together and take turns standing in the warm middle.",
    "Emperor penguin dads keep their egg warm on their feet for about two months — without eating!",
    "Frostpeak is magic! In the real world penguins live in the far south, and narwhals in the far north.",
  ],
  "frost-slide-top": [
    "Tap 🐧 Slide! at a chute's arch to toboggan down like a penguin. Swim back to the beach and follow the blue arrows up the ramp to go again!",
    "Penguins 'toboggan': they flop on their bellies and push with their feet to zoom over the snow!",
    "Penguins can't fly in the air — but underwater they 'fly' with their flippers!",
  ],
  "frost-slide-belly": ["Tobogganing on their tummies is faster than waddling — and it saves penguins lots of energy!"],
  "frost-slide-zoomy": ["Penguins 'porpoise': they leap out of the water as they swim, to breathe without slowing down."],
  "frost-slide-wiggly": ["Little penguins are the smallest penguins in the world — only about 33 cm tall!"],
  "frost-icecave": [
    "Glacier ice looks blue because it's packed so tight that it soaks up red light and lets blue light through.",
    "Ice caves melt and change shape every year — no two are ever the same!",
  ],
  "frost-camp": [
    "Snow is full of trapped air, so an igloo can be much warmer inside than the icy wind outside!",
    "The Inuit have built snow houses called igloos for hundreds of years.",
  ],
  "frost-station": [
    "Polar scientists drill ice cores — some ice is hundreds of thousands of years old, with bubbles of ancient air inside!",
    "Scientists count a penguin colony from space, by spotting the brown patches it leaves on the ice!",
  ],
  "frost-pond": ["Ice floats because water gets bigger when it freezes — so fish keep swimming in the water under a frozen pond."],
  "frost-summit": [
    "Snowflakes almost always have six sides — and no two are exactly alike!",
    "Arctic terns fly from the Arctic to the Antarctic and back every year — the longest trip of any animal!",
  ],
  "frost-lookout": [
    "The northern lights glow when tiny bits from the Sun crash into the air high above the Earth!",
    "Green auroras glow about 100 km up in the sky — way higher than planes fly!",
  ],
  floe: [
    "Seals have a thick layer of blubber under their skin that keeps them warm in icy water.",
    "A narwhal's 'tusk' is really a super-long tooth — it can grow up to 3 metres!",
  ],
  "frost-berg": ["Only about a tenth of an iceberg shows above the water — the rest is hiding underneath!"],
  "frost-ski": [
    "Real penguins can't ski — Frostpeak's penguins are just pretending! In the wild they 'toboggan': flop on their tummies and push with their feet.",
    "Penguins have strong, claw-tipped feet for gripping slippery ice — perfect for climbing back up a snowy hill.",
    "The very first chairlift was built in 1936 in Sun Valley, USA — before that, skiers had to climb back up!",
  ],
};
/** the facts for a spot id */
export function frostFacts(id: string): string[] {
  return FROST_FACTS[id] ?? (id.startsWith("frost-floe") ? FROST_FACTS.floe : ["Brrr! It's chilly on Frostpeak Isle!"]);
}

// ── calm water round Frostpeak: the open-ocean swell (±1.1 m) dies down over its shallows so the
// waterline stays put on the beaches and the floes float level. Used by the ocean surface, the
// island's own water and anything floating. ──
const CALM_IN = FROST_ISLAND.r + 8;
const CALM_OUT = FROST_ISLAND.r + 72;
/** 0.12 right by the island .. 1 out at sea */
export function frostCalm(x: number, z: number): number {
  const d = Math.hypot(x - FROST_ISLAND.x, z - FROST_ISLAND.z);
  const u = Math.min(1, Math.max(0, (d - CALM_IN) / (CALM_OUT - CALM_IN)));
  return 0.12 + 0.88 * u * u * (3 - 2 * u);
}
/** the same in GLSL */
export const FROST_CALM_GLSL = `
  float frostCalm( vec2 p ) {
    float d = length( p - vec2( ${FROST_ISLAND.x.toFixed(2)}, ${FROST_ISLAND.z.toFixed(2)} ) );
    return 0.12 + 0.88 * smoothstep( ${CALM_IN.toFixed(2)}, ${CALM_OUT.toFixed(2)}, d );
  }`;
