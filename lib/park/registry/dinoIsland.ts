// Dino Isle: a Lost World far out in Cucaino Park's boundless ocean, with two eras side by side.
//   - the Dino side: Jurassic jungle (giant ferns, cycads, tree ferns, monkey-puzzle trees), open
//     plains where the herds graze, a smoking volcano with glowing lava, a plateau waterfall that
//     pours into a lagoon and a river running down to the sea, a steamy swamp, dino nests with
//     hatching eggs, a fossil dig, and the T-rex's paddock (with a viewing platform)
//   - the Ice Age valley (north-west): snowy tundra under a glacier with an ice cave and blue
//     crevasses, snowy pines, a frozen pond, and an Ice Age camp of mammoth-bone huts beside a
//     cave-painting rock
// plus the visitors' side (north-east, facing the main island): a beach with a jetty, the big
// wooden park gate with its torches and "DINO ISLE" sign, a plaza with the research hut, and a
// visitor trail round the whole island with fences, a lookout tower and bridges.
//
// Pure + deterministic (no three.js) so the engine (walking, swimming, landing), the renderer
// (world/dino/**), the animals' behaviour and the tests all read the same numbers:
//   - the land is a heightfield sampled on a fixed triangle grid (DINO_GRID); the mesh uses the
//     very same triangles, so dinoGroundY() is exactly where the grass/snow/sand is
//   - its submerged slopes (dinoSeaFloorY) rise from the deep sea floor to a sandy reef ring
//   - the jetty, the boardwalk, the bridges and the viewing decks are walkable too (DINO_DECKS)
//   - everything that stands on the island is in DINO_OBSTACLES; the visitor trail is DINO_TRAIL
// NOTE: must not import places.ts or terrain.ts (terrain imports places): the few shared numbers
// are repeated here and checked against terrain.ts by the tests.

/** the sea's resting surface (= terrain.WATER_Y) */
export const DINO_WATER_Y = -0.25;
/** the deep sea floor around the island (= terrain.DEEP_FLOOR) */
const DEEP = -22;

export const DINO_ISLAND: { id: string; name: string; x: number; z: number; r: number } = { id: "dino-isle", name: "Dino Isle", x: -330, z: 300, r: 86 };
const X0 = DINO_ISLAND.x;
const Z0 = DINO_ISLAND.z;
const R = DINO_ISLAND.r;
/** how far out (from the island centre) the submerged slopes reach the deep floor */
export const DINO_SEA_R = 132;

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
export function dinoRng(seed: number): () => number {
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
function segT(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const ux = bx - ax;
  const uz = bz - az;
  return Math.min(1, Math.max(0, ((px - ax) * ux + (pz - az) * uz) / (ux * ux + uz * uz || 1)));
}
function segDist2(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const t = segT(px, pz, ax, az, bx, bz);
  return (ax + (bx - ax) * t - px) ** 2 + (az + (bz - az) * t - pz) ** 2;
}

// ── the shape of the land (local coordinates: relative to the island centre; -z is north) ──

/** the coastline's radius (where the beach meets the sea) at angle a = atan2(lx, lz) */
export function dinoCoastR(a: number): number {
  return R * (1 + 0.03 * Math.sin(3 * a + 1.3) + 0.018 * Math.sin(5 * a + 0.4) + 0.008 * Math.sin(9 * a + 2.0));
}

// the profile across the coast: s = distance / coast radius -> height
const PROFILE: [number, number][] = [
  [0.8, NaN], // (inland)
  [0.885, 1.45], // top of the beach
  [1.0, -0.7], // just under the waterline
  [1.08, -1.6],
  [1.16, -2.8], // the sandy shelf
  [1.21, -2.2], // the reef crest
  [1.27, -4.5],
  [1.43, DEEP - 1.2], // down the island's flanks to the deep floor
];

/** the rolling land's height: dry land stays above the crests of the ocean's swell */
const LAND_Y = 2.6;

/** the volcano (south-west): a big cone with a crater and a lava lake */
export const DINO_VOLCANO_L = { lx: -34, lz: 44, r: 30, h: 30, craterR: 5.5, craterDepth: 3.6 };
/** the jungle plateau (west) whose east cliff has the waterfall */
const PLATEAU = { lx: -62, lz: 5, r: 14, h: 10.5 };
/** the lagoon at the waterfall's foot (a raised, knee-deep pool) */
const LAG = { lx: -38, lz: 9, rx: 9.5, rz: 7, rot: 0.25, waterY: 2.05 };
/** the swamp (south-east): a hollow of shallow, murky water with little hummocks */
const SWAMP = { lx: 44, lz: 44, rx: 13, rz: 8.5, rot: -0.35, waterY: 2.1 };
/** the T-rex's paddock (east): big enough for a true-size T-rex (~12 m long = ~20 units nose to
 *  tail, see world/dino/herd.ts TRUE_SIZE) to turn round in without its tail poking through the fence */
const PADDOCK = { lx: 54, lz: 3, r: 20 };
/** the Ice Age valley: centre + radius of the snowy land */
const ICE = { lx: -28, lz: -42, r: 41 };
/** the snowy mountains along the north-west coast */
const MOUNTS: { lx: number; lz: number; r: number; h: number }[] = [
  { lx: -30, lz: -64, r: 18, h: 17 },
  { lx: -58, lz: -44, r: 16, h: 13 },
  { lx: -4, lz: -70, r: 11, h: 9 },
];
/** the glacier: a tongue of ice from high on the mountain down to its snout (where the ice cave is) */
const GLACIER = { ax: -33, az: -66, bx: -22, bz: -40, w0: 8, w1: 6.2, y0: 17.5, y1: 7.6 };
/** the ice cave: a notch into the glacier's snout (roofed by the renderer) */
const CAVE = { depth: 7.5, half: 2.3, floorY: 2.75 };
/** the frozen pond (its ice is the ground) */
const POND = { lx: 4, lz: -44, r: 6.5, y: 2.35 };

/** the river: from the lagoon's south-east lip down to the south coast (local polyline) */
const RIVER_L: [number, number][] = [
  [-30.5, 13.5],
  [-22, 19],
  [-12, 25],
  [-4, 34],
  [1, 46],
  [4, 60],
  [6, 73],
  [7.5, 86],
];
/** the plateau's stream: from its spring to the waterfall's lip */
const STREAM_L: [number, number][] = [
  [-64, 1],
  [-56, 5],
  [-48.8, 7.2],
];

/** the bridges over the river: [river segment, t along it, half length, bank height] -> their two ends (local) */
const BRIDGES: { id: string; i: number; t: number; half: number; y: number }[] = [
  { id: "bridge-s", i: 4, t: 0.15, half: 4.6, y: 2.45 },
  { id: "bridge-n", i: 1, t: 0.5, half: 4.6, y: 2.65 },
];
const bridgeEnds = (b: (typeof BRIDGES)[number]) => {
  const [ax, az] = RIVER_L[b.i];
  const [bx, bz] = RIVER_L[b.i + 1];
  const cx = lerp(ax, bx, b.t);
  const cz = lerp(az, bz, b.t);
  const L = Math.hypot(bx - ax, bz - az);
  const px = -(bz - az) / L;
  const pz = (bx - ax) / L;
  return { cx, cz, e0: { lx: cx - px * b.half, lz: cz - pz * b.half }, e1: { lx: cx + px * b.half, lz: cz + pz * b.half } };
};
/** level terraces: [lx, lz, inner r, outer r, height] */
const FLATS: [number, number, number, number, number][] = [
  // (the bridges' feet)
  ...BRIDGES.flatMap((b) => {
    const e = bridgeEnds(b);
    return [e.e0, e.e1].map((q) => [q.lx, q.lz, 1.6, 4.2, b.y] as [number, number, number, number, number]);
  }),
  [43, -39, 5.5, 9, 2.75], // the park gate
  [31, -26, 7, 10.5, 2.75], // the plaza (research hut, jeep)
  [PADDOCK.lx, PADDOCK.lz, PADDOCK.r + 1, PADDOCK.r + 4, 2.7], // the paddock
  [22, 60, 5.5, 8.5, 2.6], // the nests
  [-50, -22, 5.5, 8.5, 2.95], // the Ice Age camp
  [16, 20, 3, 5.5, 2.7], // the lookout tower
];
/** the fossil dig: a shallow pit */
const DIG = { lx: -6, lz: 64, r: 4.6, depth: 0.8 };

function lagoonE(lx: number, lz: number) {
  const dx = lx - LAG.lx;
  const dz = lz - LAG.lz;
  const c = Math.cos(LAG.rot);
  const s = Math.sin(LAG.rot);
  const u = (dx * c - dz * s) / LAG.rx;
  const v = (dx * s + dz * c) / LAG.rz;
  const a = Math.atan2(u, v);
  return Math.hypot(u, v) * (1 + 0.06 * Math.sin(3 * a + 1) + 0.04 * Math.sin(5 * a));
}
function swampE(lx: number, lz: number) {
  const dx = lx - SWAMP.lx;
  const dz = lz - SWAMP.lz;
  const c = Math.cos(SWAMP.rot);
  const s = Math.sin(SWAMP.rot);
  const u = (dx * c - dz * s) / SWAMP.rx;
  const v = (dx * s + dz * c) / SWAMP.rz;
  const a = Math.atan2(u, v);
  return Math.hypot(u, v) * (1 + 0.08 * Math.sin(4 * a + 2) + 0.05 * Math.sin(7 * a));
}

/** river: nearest point on a polyline -> [distance, arc length along it, total length] */
function polyNear(pts: [number, number][], lx: number, lz: number, out: { d: number; s: number; L: number }) {
  let best = Infinity;
  let bs = 0;
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    // (no destructuring: this runs every frame for the animals)
    const ax = pts[i][0];
    const az = pts[i][1];
    const bx = pts[i + 1][0];
    const bz = pts[i + 1][1];
    const L = Math.hypot(bx - ax, bz - az);
    const t = segT(lx, lz, ax, az, bx, bz);
    const d2 = (ax + (bx - ax) * t - lx) ** 2 + (az + (bz - az) * t - lz) ** 2;
    if (d2 < best) {
      best = d2;
      bs = acc + t * L;
    }
    acc += L;
  }
  out.d = Math.sqrt(best);
  out.s = bs;
  out.L = acc;
  return out;
}
const _pn = { d: 0, s: 0, L: 0 };
/** the river's water surface at arc length s (from the lagoon, 0, to the sea) */
function riverWaterY(s: number, L: number) {
  const u = Math.min(1, Math.max(0, s / L));
  return lerp(LAG.waterY, DINO_WATER_Y + 0.05, Math.pow(u, 1.35));
}
const RIVER_HALF = 1.9;

/** how snowy the land is (0 jungle/plains .. 1 deep Ice Age snow), local coordinates */
export function dinoSnowL(lx: number, lz: number): number {
  const d = Math.hypot(lx - ICE.lx, lz - ICE.lz) + (noise(lx / 9 + 4, lz / 9 - 2, 21) - 0.5) * 10;
  return 1 - smooth(ICE.r - 6, ICE.r + 6, d);
}
/** the same at a world point */
export function dinoSnow(x: number, z: number): number {
  return dinoSnowL(x - X0, z - Z0);
}

/** the glacier at a local point: its ice surface height and how far across/along it (null off it) */
function glacierAt(lx: number, lz: number): { y: number; q: number; t: number; w: number } | null {
  const G = GLACIER;
  const ux = G.bx - G.ax;
  const uz = G.bz - G.az;
  const L = Math.hypot(ux, uz);
  const t = ((lx - G.ax) * ux + (lz - G.az) * uz) / (L * L);
  if (t < -0.25 || t > 1.08) return null;
  const px = G.ax + ux * t;
  const pz = G.az + uz * t;
  const q = Math.hypot(lx - px, lz - pz);
  const w = lerp(G.w0, G.w1, Math.min(1, Math.max(0, t))) * (1 + 0.08 * Math.sin(t * 9));
  if (q > w + 2.5) return null;
  const tc = Math.min(1, Math.max(0, t));
  // crevasses: shallow bands across the flow
  const crev = Math.max(0, Math.sin(tc * 38 + q * 0.4) - 0.82) * 2.2;
  const y = lerp(G.y0, G.y1, Math.pow(tc, 0.85)) + 1.4 * (1 - (q / w) ** 2) - crev;
  return { y, q, t, w };
}
/** the glacier's axis (local): unit direction down the flow, and the snout point */
const G_UX = (GLACIER.bx - GLACIER.ax) / Math.hypot(GLACIER.bx - GLACIER.ax, GLACIER.bz - GLACIER.az);
const G_UZ = (GLACIER.bz - GLACIER.az) / Math.hypot(GLACIER.bx - GLACIER.ax, GLACIER.bz - GLACIER.az);
/** is (lx, lz) inside the ice cave's notch (cut into the snout) */
function inCave(lx: number, lz: number) {
  const dx = lx - GLACIER.bx;
  const dz = lz - GLACIER.bz;
  const along = -(dx * G_UX + dz * G_UZ); // (into the glacier)
  const across = Math.abs(dx * G_UZ - dz * G_UX);
  return along > -1.5 && along < CAVE.depth && across < CAVE.half * (1 - 0.35 * Math.max(0, along / CAVE.depth));
}

/** the island's height at a local point (the smooth truth the grid samples) */
function localHeight(lx: number, lz: number): number {
  const d = Math.hypot(lx, lz);
  const a = Math.atan2(lx, lz);
  const s = d / dinoCoastR(a);
  const inland = LAND_Y + (noise(lx / 14 + 5, lz / 14 - 3, 3) - 0.5) * 1.1 + (noise(lx / 5, lz / 5, 4) - 0.5) * 0.2;
  let h: number;
  if (s <= PROFILE[0][0]) h = inland;
  else if (s >= PROFILE[PROFILE.length - 1][0]) h = PROFILE[PROFILE.length - 1][1];
  else {
    let i = 0;
    while (s > PROFILE[i + 1][0]) i++;
    const [s0, h0] = PROFILE[i];
    const [s1, h1] = PROFILE[i + 1];
    const a0 = Number.isNaN(h0) ? inland : h0;
    const k = (s - s0) / (s1 - s0);
    h = lerp(a0, h1, i >= 5 ? k * 0.35 + fade(k) * 0.65 : fade(k));
  }
  // ripples on the sandy shelf
  if (s > 1.02 && s < 1.3) h += Math.sin(lx * 0.6 + Math.sin(lz * 0.15) * 3) * 0.1 + (noise(lx / 6, lz / 6, 8) - 0.5) * 0.4;
  // big features fade out past the coast (their flanks drop into the sea as cliffs)
  const coastK = 1 - smooth(0.9, 1.04, s);

  // the volcano: a concave cone, gullied flanks, a crater with a lava lake
  const V = DINO_VOLCANO_L;
  const vd = Math.hypot(lx - V.lx, lz - V.lz);
  if (vd < V.r) {
    const va = Math.atan2(lx - V.lx, lz - V.lz);
    const k = 1 - vd / V.r;
    const gully = 1 + 0.1 * Math.sin(7 * va + 0.5) * smooth(0.1, 0.5, k) + (noise(va * 3 + 7, k * 4, 12) - 0.5) * 0.14;
    const rimK = 1 - V.craterR / V.r;
    const cone = (k: number) => V.h * (Math.pow(k, 1.55) * 0.82 + k * 0.18);
    let vh = cone(k) * gully;
    if (vd < V.craterR) {
      const u = vd / V.craterR;
      vh = cone(rimK) + 0.6 - V.craterDepth * (1 - u * u);
    } else if (vd < V.craterR + 1.5) vh = lerp(cone(rimK) + 0.6, vh, smooth(V.craterR, V.craterR + 1.5, vd));
    h += vh * coastK;
  }
  // the snowy mountains
  for (const M of MOUNTS) {
    const md = Math.hypot(lx - M.lx, lz - M.lz) / M.r;
    if (md < 1) {
      const k = Math.pow(1 - fade(md), 1.2);
      h += M.h * k * (0.82 + 0.36 * noise(lx / 5 + M.lx, lz / 5, 13)) * coastK;
    }
  }
  // the plateau: a flat-topped mesa with cliff sides
  const pd = Math.hypot(lx - PLATEAU.lx, lz - PLATEAU.lz);
  const pa = Math.atan2(lx - PLATEAU.lx, lz - PLATEAU.lz);
  const pr = PLATEAU.r * (1 + 0.07 * Math.sin(5 * pa + 1) + 0.04 * Math.sin(9 * pa));
  if (pd < pr + 2) {
    const top = LAND_Y + PLATEAU.h + (noise(lx / 4, lz / 4, 14) - 0.5) * 0.5;
    h = lerp(h, Math.max(h, top), (1 - smooth(pr - 1.6, pr + 1.2, pd)) * coastK);
  }
  // the glacier (and the ice cave cut into its snout)
  const g = glacierAt(lx, lz);
  if (g && !inCave(lx, lz)) {
    const edge = 1 - smooth(g.w - 0.3, g.w + 2.5, g.q);
    const snout = 1 - smooth(1.0, 1.06, g.t);
    const top = g.t < 0 ? lerp(h, g.y, smooth(-0.25, 0, g.t)) : g.y;
    h = Math.max(h, lerp(h, top, edge * snout));
  }
  if (inCave(lx, lz)) h = CAVE.floorY;
  // level terraces
  for (const [fx, fz, r0, r1, fh] of FLATS) {
    const fd = Math.hypot(lx - fx, lz - fz);
    if (fd < r1) h = lerp(h, fh, 1 - smooth(r0, r1, fd));
  }
  // the frozen pond (its ice surface is the ground)
  const od = Math.hypot(lx - POND.lx, lz - POND.lz);
  if (od < POND.r + 3) h = lerp(h, od < POND.r ? POND.y : POND.y + 0.25, 1 - smooth(POND.r, POND.r + 3, od));
  // the fossil dig: a shallow square-ish pit
  const dq = Math.max(Math.abs(lx - DIG.lx), Math.abs(lz - DIG.lz)) * 0.7 + Math.hypot(lx - DIG.lx, lz - DIG.lz) * 0.3;
  if (dq < DIG.r + 2.5) {
    const rim = LAND_Y + 0.05;
    h = lerp(h, rim, 1 - smooth(DIG.r + 0.5, DIG.r + 2.5, dq));
    if (dq < DIG.r + 0.5) h = lerp(rim - DIG.depth, rim, smooth(DIG.r - 0.6, DIG.r + 0.5, dq));
  }
  // the lagoon: a knee-deep hollow at the waterfall's foot
  const e = lagoonE(lx, lz);
  if (e < 1.35) {
    const floor = LAG.waterY - 0.45 - 0.2 * (1 - Math.min(1, e));
    h = lerp(h, floor, 1 - smooth(0.88, 1.3, e));
  }
  // the swamp: shallow water with hummocks poking out
  const se = swampE(lx, lz);
  if (se < 1.35) {
    const hum = (noise(lx / 3.2 + 9, lz / 3.2, 31) - 0.5) * 1.1;
    const floor = SWAMP.waterY - 0.42 + Math.max(-0.1, hum);
    h = lerp(h, floor, 1 - smooth(0.85, 1.3, se));
  }
  // the river (and the plateau's stream) carve their channels
  polyNear(RIVER_L, lx, lz, _pn);
  if (_pn.d < RIVER_HALF + 3) {
    const wy = riverWaterY(_pn.s, _pn.L);
    const bed = wy - 0.5 * (1 - (Math.min(_pn.d, RIVER_HALF) / RIVER_HALF) ** 2) - 0.08;
    const bank = Math.max(bed, Math.min(h, wy + 0.35 + (_pn.d - RIVER_HALF) * 0.6));
    h = Math.min(h, _pn.d < RIVER_HALF ? bed : bank);
  }
  polyNear(STREAM_L, lx, lz, _pn);
  if (_pn.d < 2.2 && pd < pr + 0.5) h -= 0.35 * (1 - smooth(0.6, 2.2, _pn.d));
  return h;
}

// ── the height grid (the mesh uses exactly these triangles) ──

/** grid spacing (m) and half-extent (m, local) of the island's land mesh */
export const DINO_GRID = 1.7;
export const DINO_EXTENT = 107.1;
export const DINO_N = Math.round((DINO_EXTENT * 2) / DINO_GRID) + 1;
let grid: Float32Array | null = null;

/** the baked heights (row-major N x N: rows along z, columns along x, local -EXTENT..EXTENT) */
export function dinoGrid(): Float32Array {
  if (grid) return grid;
  const N = DINO_N;
  const g = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) g[j * N + i] = localHeight(-DINO_EXTENT + i * DINO_GRID, -DINO_EXTENT + j * DINO_GRID);
  grid = g;
  return g;
}

/** the land height at a world point, interpolated on the mesh's triangles (null off the grid) */
export function dinoLandY(x: number, z: number): number | null {
  const fx = (x - X0 + DINO_EXTENT) / DINO_GRID;
  const fz = (z - Z0 + DINO_EXTENT) / DINO_GRID;
  const N = DINO_N;
  if (!(fx >= 0 && fz >= 0 && fx < N - 1 && fz < N - 1)) return null;
  const g = dinoGrid();
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
export function dinoHeightAt(x: number, z: number): number {
  return localHeight(x - X0, z - Z0);
}

// ── water on the land: the lagoon, the swamp, the river ──

export const DINO_LAGOON = { x: X0 + LAG.lx, z: Z0 + LAG.lz, rx: LAG.rx, rz: LAG.rz, rot: LAG.rot, waterY: LAG.waterY };
export const DINO_SWAMP = { x: X0 + SWAMP.lx, z: Z0 + SWAMP.lz, rx: SWAMP.rx, rz: SWAMP.rz, rot: SWAMP.rot, waterY: SWAMP.waterY };
/** the river's centreline (world) from the lagoon to the sea, with its water height at each point */
export const DINO_RIVER: { x: number; z: number; y: number }[] = (() => {
  let L = 0;
  for (let i = 0; i + 1 < RIVER_L.length; i++) L += Math.hypot(RIVER_L[i + 1][0] - RIVER_L[i][0], RIVER_L[i + 1][1] - RIVER_L[i][1]);
  let s = 0;
  return RIVER_L.map(([lx, lz], i) => {
    if (i > 0) s += Math.hypot(lx - RIVER_L[i - 1][0], lz - RIVER_L[i - 1][1]);
    return { x: X0 + lx, z: Z0 + lz, y: riverWaterY(s, L) };
  });
})();
export const DINO_RIVER_HALF = RIVER_HALF;
/** the plateau's stream (world), on top of the plateau */
export const DINO_STREAM: { x: number; z: number }[] = STREAM_L.map(([lx, lz]) => ({ x: X0 + lx, z: Z0 + lz }));
export const DINO_PLATEAU = { x: X0 + PLATEAU.lx, z: Z0 + PLATEAU.lz, r: PLATEAU.r, y: LAND_Y + PLATEAU.h };
/** the waterfall: its lip on the plateau's east cliff, falling into the lagoon (rot = the way it pours) */
export const DINO_WATERFALL = { x: X0 + STREAM_L[2][0] + 0.4, z: Z0 + STREAM_L[2][1], top: 0, bottom: LAG.waterY, rot: Math.PI / 2 - 0.12, w: 4.0 };
DINO_WATERFALL.top = localHeight(STREAM_L[2][0] - 1.2, STREAM_L[2][1]) + 0.1;
export const DINO_VOLCANO = {
  x: X0 + DINO_VOLCANO_L.lx,
  z: Z0 + DINO_VOLCANO_L.lz,
  r: DINO_VOLCANO_L.r,
  craterR: DINO_VOLCANO_L.craterR,
  /** the crater's rim height and its lava lake's surface + radius */
  rimY: 0,
  lavaY: 0,
  lavaR: 0,
};
DINO_VOLCANO.rimY = localHeight(DINO_VOLCANO_L.lx + DINO_VOLCANO_L.craterR, DINO_VOLCANO_L.lz);
DINO_VOLCANO.lavaY = localHeight(DINO_VOLCANO_L.lx, DINO_VOLCANO_L.lz) + 1.2;
DINO_VOLCANO.lavaR = DINO_VOLCANO_L.craterR * Math.sqrt(1.2 / DINO_VOLCANO_L.craterDepth) + 0.3;
export const DINO_PADDOCK = { x: X0 + PADDOCK.lx, z: Z0 + PADDOCK.lz, r: PADDOCK.r };
export const DINO_POND = { x: X0 + POND.lx, z: Z0 + POND.lz, r: POND.r, y: POND.y };
export const DINO_DIG = { x: X0 + DIG.lx, z: Z0 + DIG.lz, r: DIG.r, y: LAND_Y + 0.05 - DIG.depth };
export const DINO_GLACIER = { ax: X0 + GLACIER.ax, az: Z0 + GLACIER.az, bx: X0 + GLACIER.bx, bz: Z0 + GLACIER.bz, w0: GLACIER.w0, w1: GLACIER.w1 };
/** the ice cave's mouth (world), the way it faces (out of the glacier) and its size */
export const DINO_CAVE = { x: X0 + GLACIER.bx, z: Z0 + GLACIER.bz, rot: Math.atan2(G_UX, G_UZ), depth: CAVE.depth, half: CAVE.half, floorY: CAVE.floorY };
export const DINO_ICE = { x: X0 + ICE.lx, z: Z0 + ICE.lz, r: ICE.r };

export function dinoInLagoon(x: number, z: number): boolean {
  return lagoonE(x - X0, z - Z0) < 1.12;
}
export function dinoInSwamp(x: number, z: number): boolean {
  return swampE(x - X0, z - Z0) < 1.1;
}
/** the glacier's ice (world) where (x, z) is on it (for colouring), else null */
export function dinoGlacier(x: number, z: number): { y: number; q: number; t: number; w: number } | null {
  const g = glacierAt(x - X0, z - Z0);
  return g && g.q < g.w && g.t >= 0 && g.t <= 1 && !inCave(x - X0, z - Z0) ? g : null;
}
export function dinoInCave(x: number, z: number): boolean {
  return inCave(x - X0, z - Z0);
}
/** the water surface over (x, z) on the island (lagoon, swamp, river), else null */
export function dinoWaterAt(x: number, z: number): number | null {
  const lx = x - X0;
  const lz = z - Z0;
  if (lx * lx + lz * lz > (R * 1.1) ** 2) return null;
  const land = dinoLandY(x, z);
  if (land === null) return null;
  if (lagoonE(lx, lz) < 1.3 && land < LAG.waterY) return LAG.waterY;
  if (swampE(lx, lz) < 1.3 && land < SWAMP.waterY) return SWAMP.waterY;
  polyNear(RIVER_L, lx, lz, _pn);
  if (_pn.d < RIVER_HALF + 1.5) {
    const wy = riverWaterY(_pn.s, _pn.L);
    if (land < wy && wy > DINO_WATER_Y + 0.1) return wy;
  }
  return null;
}

// ── decks: the jetty, the swamp boardwalk, the bridges, the viewing platforms ──

export interface DinoDeck {
  id: string;
  kind: "jetty" | "boardwalk" | "bridge" | "ramp" | "deck";
  /** a straight plank walk from a to b (half = half its width), sloping from ya to yb; or a round deck (r) */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  half: number;
  ya: number;
  yb: number;
  r?: number;
}

const W = (lx: number, lz: number) => ({ x: X0 + lx, z: Z0 + lz });
const JETTY_Y = 1.6;
/** the NE: the way to the main island (the jetty, beach and gate face it) */
export const DINO_NE_A = 2.31;
const NE = { x: Math.sin(DINO_NE_A), z: Math.cos(DINO_NE_A) };
const NE_P = { x: -NE.z, z: NE.x };
const alongNE = (r: number, side = 0) => ({ lx: NE.x * r + NE_P.x * side, lz: NE.z * r + NE_P.z * side });
/** the viewing platform by the paddock, and the lookout tower on the plains */
const PLATFORM = { lx: 33, lz: -12, r: 3.4, up: 2.3, rampSide: -1 };
const LOOKOUT = { lx: 16, lz: 20, r: 3.2, up: 4.4 };

/** the land's height on the mesh (local), for where decks meet the ground */
const landL = (lx: number, lz: number) => dinoLandY(X0 + lx, Z0 + lz) ?? localHeight(lx, lz);

function buildDecks(): DinoDeck[] {
  const out: DinoDeck[] = [];
  const seg = (id: string, kind: DinoDeck["kind"], a: { x: number; z: number }, b: { x: number; z: number }, half: number, ya: number, yb: number) =>
    out.push({ id, kind, ax: a.x, az: a.z, bx: b.x, bz: b.z, half, ya, yb });
  const disc = (id: string, c: { x: number; z: number }, r: number, y: number) => out.push({ id, kind: "deck", ax: c.x, az: c.z, bx: c.x, bz: c.z, half: 0, ya: y, yb: y, r });
  // the jetty: from the NE beach out to sea, with a T at the end
  const cr = dinoCoastR(DINO_NE_A);
  const jb = alongNE(cr * 0.855);
  const je = alongNE(cr * 1.13);
  seg("jetty", "jetty", W(jb.lx, jb.lz), W(je.lx, je.lz), 1.3, JETTY_Y, JETTY_Y);
  const t0 = alongNE(cr * 1.13, -5);
  const t1 = alongNE(cr * 1.13, 5);
  seg("jetty-t", "jetty", W(t0.lx, t0.lz), W(t1.lx, t1.lz), 1.35, JETTY_Y, JETTY_Y);
  // the viewing platform by the T-rex paddock: a raised deck, a ramp down to the trail
  const py = localHeight(PLATFORM.lx, PLATFORM.lz) + PLATFORM.up;
  disc("platform", W(PLATFORM.lx, PLATFORM.lz), PLATFORM.r, py);
  {
    const dx = PLATFORM.lx - PADDOCK.lx;
    const dz = PLATFORM.lz - PADDOCK.lz;
    const L = Math.hypot(dx, dz);
    // (the ramp leaves the deck sideways, running along the fence)
    const rx = (-dz / L) * PLATFORM.rampSide;
    const rz = (dx / L) * PLATFORM.rampSide;
    const a = W(PLATFORM.lx + rx * (PLATFORM.r - 0.4), PLATFORM.lz + rz * (PLATFORM.r - 0.4));
    const bL = { lx: PLATFORM.lx + rx * (PLATFORM.r + 7.5), lz: PLATFORM.lz + rz * (PLATFORM.r + 7.5) };
    seg("platform-ramp", "ramp", a, W(bL.lx, bL.lz), 1.05, py, landL(bL.lx, bL.lz) + 0.02);
  }
  // the lookout tower on the plains: a high deck with a long ramp
  const ly = localHeight(LOOKOUT.lx, LOOKOUT.lz) + LOOKOUT.up;
  disc("lookout", W(LOOKOUT.lx, LOOKOUT.lz), LOOKOUT.r, ly);
  {
    const a = W(LOOKOUT.lx, LOOKOUT.lz - LOOKOUT.r + 0.4);
    const bL = { lx: LOOKOUT.lx, lz: LOOKOUT.lz - LOOKOUT.r - 12 };
    seg("lookout-ramp", "ramp", a, W(bL.lx, bL.lz), 1.05, ly, landL(bL.lx, bL.lz) + 0.02);
  }
  // the swamp boardwalk: bank to bank along the swamp's long axis
  {
    const c = Math.cos(SWAMP.rot);
    const s = Math.sin(SWAMP.rot);
    const ax = SWAMP.lx - c * 16.5;
    const az = SWAMP.lz + s * 16.5;
    const bx = SWAMP.lx + c * 15;
    const bz = SWAMP.lz - s * 15;
    const y = SWAMP.waterY + 0.55;
    const m1 = { lx: lerp(ax, bx, 0.2), lz: lerp(az, bz, 0.2) };
    const m2 = { lx: lerp(ax, bx, 0.8), lz: lerp(az, bz, 0.8) };
    seg("swamp-w", "boardwalk", W(ax, az), W(m1.lx, m1.lz), 1.0, landL(ax, az) + 0.02, y);
    seg("swamp", "boardwalk", W(m1.lx, m1.lz), W(m2.lx, m2.lz), 1.0, y, y);
    seg("swamp-e", "boardwalk", W(m2.lx, m2.lz), W(bx, bz), 1.0, y, landL(bx, bz) + 0.02);
  }
  // bridges over the river: humped plank bridges (two slopes to a crown)
  for (const b of BRIDGES) {
    const { cx, cz, e0, e1 } = bridgeEnds(b);
    const y0 = landL(e0.lx, e0.lz) + 0.02;
    const y1 = landL(e1.lx, e1.lz) + 0.02;
    const crown = Math.max(y0, y1) + 0.4;
    seg(`${b.id}-a`, "bridge", W(e0.lx, e0.lz), W(cx, cz), 1.1, y0, crown);
    seg(`${b.id}-b`, "bridge", W(cx, cz), W(e1.lx, e1.lz), 1.1, crown, y1);
  }
  return out;
}
export const DINO_DECKS: DinoDeck[] = buildDecks();

/** the deck under (x, z), if any: its height */
export function dinoDeckY(x: number, z: number): number | null {
  let best: number | null = null;
  for (const d of DINO_DECKS) {
    let y: number | null = null;
    if (d.r !== undefined) {
      if ((x - d.ax) ** 2 + (z - d.az) ** 2 <= d.r * d.r) y = d.ya;
    } else {
      const ux = d.bx - d.ax;
      const uz = d.bz - d.az;
      const L2 = ux * ux + uz * uz;
      const t = ((x - d.ax) * ux + (z - d.az) * uz) / L2;
      if (t >= 0 && t <= 1) {
        const px = d.ax + ux * t - x;
        const pz = d.az + uz * t - z;
        if (px * px + pz * pz <= d.half * d.half) y = d.ya + (d.yb - d.ya) * t;
      }
    }
    if (y !== null && (best === null || y > best)) best = y;
  }
  return best;
}

// ── walkable ground + the sea floor ──

/** land height above the sea where (x, z) is on the island's walkable ground (beach, jungle, plains,
 *  snow, the glacier, the knee-deep lagoon/swamp/river, the decks), else null */
export function dinoGroundY(x: number, z: number): number | null {
  const dx = x - X0;
  const dz = z - Z0;
  if (dx * dx + dz * dz > (DINO_EXTENT + 4) ** 2) return null;
  const deck = dinoDeckY(x, z);
  if (deck !== null) return deck;
  const land = dinoLandY(x, z);
  if (land === null) return null;
  if (land < DINO_WATER_Y + 0.05) return null;
  return land;
}

/** the island's own sea floor (its submerged slopes rising out of the deep), for swimming near it;
 *  returns null far from it. (It meets the deep floor at the rim, so max() with the sea's floor is seamless.) */
export function dinoSeaFloorY(x: number, z: number): number | null {
  const dx = x - X0;
  const dz = z - Z0;
  const d2 = dx * dx + dz * dz;
  if (d2 > DINO_SEA_R * DINO_SEA_R) return null;
  if (Math.abs(dx) < DINO_EXTENT - 1 && Math.abs(dz) < DINO_EXTENT - 1) {
    const g = dinoLandY(x, z);
    if (g !== null) return g;
  }
  return localHeight(dx, dz);
}

// ── the visitor trail (a little graph kept clear of obstacles) ──

const NODES_L: [string, number, number][] = [
  ["jetty-end", ...lxz(alongNE(dinoCoastR(DINO_NE_A) * 1.1))],
  ["jetty-base", ...lxz(alongNE(dinoCoastR(DINO_NE_A) * 0.87))],
  ["beach", ...lxz(alongNE(dinoCoastR(DINO_NE_A) * 0.79))],
  ["gate-out", 47.5, -43.5],
  ["gate-in", 38.5, -34.5],
  ["plaza", 31, -26],
  ["plaza-s", 29, -17],
  ["platform-foot", 0, 0], // (the ramp's foot: set below)
  ["platform", PLATFORM.lx, PLATFORM.lz],
  ["plains-n", 18, -6],
  ["lookout-foot", LOOKOUT.lx, LOOKOUT.lz - LOOKOUT.r - 13],
  ["lookout", LOOKOUT.lx, LOOKOUT.lz],
  ["brachio", -1, 2],
  ["lookout-e", 23, 12],
  ["trike", 25.5, 33.5],
  ["swamp-w", 0, 0], // (the boardwalk's ends: set below)
  ["swamp-e", 0, 0],
  ["dodo", 50, 62],
  ["nests", 23, 53],
  ["bridge-s-e", 0, 0],
  ["bridge-s-w", 0, 0],
  ["dig", -6, 57.2],
  ["volcano-e", -9, 42],
  ["bridge-n-s", 0, 0],
  ["bridge-n-n", 0, 0],
  ["lagoon-e", -25.5, 4],
  ["waterfall", -37, -1.5],
  ["jungle-nw", -41, -11],
  ["camp", -43.5, -19.5],
  ["rhino", -33, -28.5],
  ["cave", 0, 0], // (in front of the ice cave's mouth: set below)
  ["mammoth", -8, -27],
  ["pond", 4, -35.2],
  ["moa", 19, -39],
];
function lxz(p: { lx: number; lz: number }): [number, number] {
  return [p.lx, p.lz];
}
const EDGES_N: [string, string][] = [
  ["jetty-end", "jetty-base"],
  ["jetty-base", "beach"],
  ["beach", "gate-out"],
  ["gate-out", "gate-in"],
  ["gate-in", "plaza"],
  ["plaza", "plaza-s"],
  ["plains-n", "platform-foot"],
  ["platform-foot", "platform"],
  ["plaza-s", "plains-n"],
  ["plains-n", "lookout-foot"],
  ["lookout-foot", "lookout"],
  ["lookout-foot", "brachio"],
  ["plains-n", "lookout-e"],
  ["lookout-e", "trike"],
  ["trike", "swamp-w"],
  ["swamp-w", "swamp-e"],
  ["swamp-e", "dodo"],
  ["dodo", "nests"],
  ["trike", "nests"],
  ["nests", "bridge-s-e"],
  ["bridge-s-e", "bridge-s-w"],
  ["bridge-s-w", "dig"],
  ["dig", "volcano-e"],
  ["volcano-e", "bridge-n-s"],
  ["bridge-n-s", "bridge-n-n"],
  ["bridge-n-n", "brachio"],
  ["bridge-n-n", "lagoon-e"],
  ["lagoon-e", "waterfall"],
  ["waterfall", "jungle-nw"],
  ["jungle-nw", "camp"],
  ["camp", "rhino"],
  ["rhino", "cave"],
  ["cave", "mammoth"],
  ["mammoth", "pond"],
  ["pond", "moa"],
  ["moa", "plaza"],
  ["mammoth", "plains-n"],
];

export interface DinoTrailNode {
  id: string;
  x: number;
  z: number;
}
export const DINO_TRAIL: { nodes: DinoTrailNode[]; edges: [number, number][] } = (() => {
  const deck = (id: string) => DINO_DECKS.find((d) => d.id === id)!;
  const fix: Record<string, { x: number; z: number }> = {
    "platform-foot": { x: deck("platform-ramp").bx, z: deck("platform-ramp").bz },
    "lookout-foot": { x: deck("lookout-ramp").bx, z: deck("lookout-ramp").bz - 0.8 },
    "swamp-w": { x: deck("swamp-w").ax, z: deck("swamp-w").az },
    "swamp-e": { x: deck("swamp-e").bx, z: deck("swamp-e").bz },
    "bridge-s-e": { x: deck("bridge-s-a").ax, z: deck("bridge-s-a").az },
    "bridge-s-w": { x: deck("bridge-s-b").bx, z: deck("bridge-s-b").bz },
    "bridge-n-n": { x: deck("bridge-n-a").ax, z: deck("bridge-n-a").az },
    "bridge-n-s": { x: deck("bridge-n-b").bx, z: deck("bridge-n-b").bz },
    cave: { x: X0 + GLACIER.bx + G_UX * 3.5, z: Z0 + GLACIER.bz + G_UZ * 3.5 },
  };
  const nodes = NODES_L.map(([id, lx, lz]) => fix[id] ? { id, ...fix[id] } : { id, ...W(lx, lz) });
  const ix = (id: string) => {
    const i = nodes.findIndex((n) => n.id === id);
    if (i < 0) throw new Error(`dino: unknown trail node ${id}`);
    return i;
  };
  return { nodes, edges: EDGES_N.map(([a, b]) => [ix(a), ix(b)] as [number, number]) };
})();
export const dinoTrailNode = (id: string) => DINO_TRAIL.nodes[DINO_TRAIL.nodes.findIndex((n) => n.id === id)];

/** distance (m) from (x, z) (world) to the nearest stretch of the visitor trail */
export function dinoTrailDistance(x: number, z: number): number {
  const { nodes, edges } = DINO_TRAIL;
  let best = Infinity;
  for (const [a, b] of edges) best = Math.min(best, segDist2(x, z, nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z));
  return Math.sqrt(best);
}

// ── where the animals roam (herd ranges: open ground kept free of trees) ──

export type DinoRangeId =
  | "brachio"
  | "trike"
  | "stego"
  | "para"
  | "ankylo"
  | "compy"
  | "nests"
  | "trex"
  | "mammoth"
  | "rhino"
  | "elk"
  | "sabre"
  | "bear"
  | "sloth"
  | "glypto"
  | "dodo"
  | "moa"
  | "thylacine"
  | "terror";
/** each herd's home ground (world): a disc its members wander inside */
export const DINO_RANGES: Record<DinoRangeId, { x: number; z: number; r: number }> = (() => {
  const L: Record<DinoRangeId, [number, number, number]> = {
    brachio: [3, 0, 12],
    trike: [32, 25, 7],
    stego: [11, 42, 6.5],
    para: [-4, 17, 5.5],
    ankylo: [-20, 66, 4.5],
    compy: [22, -17, 6],
    nests: [22, 60, 4.5],
    // (the T-rex's hips stay this far in: its 7.8 m tail stays inside the fence)
    trex: [PADDOCK.lx, PADDOCK.lz, PADDOCK.r - 12.5],
    mammoth: [-10, -25, 8],
    rhino: [-34, -35, 5],
    elk: [-8, -50, 4.5],
    sabre: [13, -58, 3.5],
    bear: [-45, -45, 4.5],
    sloth: [-44, 1, 4],
    glypto: [-22, -13, 5],
    dodo: [44, 61, 4],
    moa: [24, -48, 5.5],
    thylacine: [-12, 9, 4.5],
    terror: [38, 31, 4],
  };
  const out = {} as Record<DinoRangeId, { x: number; z: number; r: number }>;
  for (const k of Object.keys(L) as DinoRangeId[]) out[k] = { ...W(L[k][0], L[k][1]), r: L[k][2] };
  return out;
})();

// ── the island's things ──

export type DinoPropKind =
  | "gate"
  | "torch"
  | "hut"
  | "kiosk"
  | "jeep"
  | "tower"
  | "platform"
  | "paddock"
  | "fence"
  | "signpost"
  | "bench"
  | "crates"
  | "tent"
  | "dig"
  | "ribcage"
  | "nest"
  | "bonehut"
  | "campfire"
  | "rack"
  | "paintrock"
  | "skull"
  | "palm"
  | "treefern"
  | "cycad"
  | "fern"
  | "bigleaf"
  | "araucaria"
  | "jungletree"
  | "reeds"
  | "swamptree"
  | "flowers"
  | "rock"
  | "boulder"
  | "lavarock"
  | "pine"
  | "snowbush"
  | "icecrystal"
  | "footprints"
  | "vent";

export interface DinoProp {
  kind: DinoPropKind;
  x: number;
  z: number;
  /** base height (ground, or deck) */
  y: number;
  /** facing (radians, atan2 convention: the prop's front looks along (sin rot, cos rot)) */
  rot: number;
  s: number;
  seed: number;
  /** a style/colour variant */
  v: number;
  /** a length for fences (m) */
  len?: number;
}

/** obstacle radius of one prop (0 = walk-through) at scale 1 */
const PROP_R: Record<DinoPropKind, number> = {
  gate: 0,
  torch: 0.35,
  hut: 3.3,
  kiosk: 1.7,
  jeep: 1.7,
  tower: 0,
  platform: 0,
  paddock: 0,
  fence: 0,
  signpost: 0.3,
  bench: 0.5,
  crates: 0.7,
  tent: 1.7,
  dig: 0,
  ribcage: 1.3,
  nest: 1.25,
  bonehut: 2.6,
  campfire: 1.0,
  rack: 0.6,
  paintrock: 3.4,
  skull: 0,
  palm: 0.45,
  treefern: 0.45,
  cycad: 0.55,
  fern: 0,
  bigleaf: 0,
  araucaria: 0.7,
  jungletree: 1.1,
  reeds: 0,
  swamptree: 0.6,
  flowers: 0,
  rock: 1.0,
  boulder: 2.0,
  lavarock: 0.9,
  pine: 0.55,
  snowbush: 0.55,
  icecrystal: 0.8,
  footprints: 0,
  vent: 0,
};

/** the gate (world): its centre, the way visitors walk in (rot = towards the island), and its half-width */
const GATE_L = { lx: 43, lz: -39 };
export const DINO_GATE = { ...W(GATE_L.lx, GATE_L.lz), rot: Math.atan2(-NE.x, -NE.z), half: 4.2, y: 2.75 };
export const DINO_PLAZA = { ...W(31, -26) };
export const DINO_NESTS = { ...W(22, 60), r: 4.2 };
export const DINO_CAMP = { ...W(-50, -22) };
/** the paddock fence: posts every FENCE_STEP m round a circle (gaps none: the T-rex stays in) */
export const DINO_FENCE_R = PADDOCK.r;
const FENCE_STEP = 1.3;
export const DINO_FENCE_POSTS: { x: number; z: number }[] = (() => {
  const n = Math.round((Math.PI * 2 * PADDOCK.r) / FENCE_STEP);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return W(PADDOCK.lx + Math.sin(a) * PADDOCK.r, PADDOCK.lz + Math.cos(a) * PADDOCK.r);
  });
})();

function groundAt(x: number, z: number) {
  return dinoDeckY(x, z) ?? dinoLandY(x, z) ?? 0;
}

interface Layout {
  props: DinoProp[];
  extraObstacles: { x: number; z: number; r: number }[];
}

function buildLayout(): Layout {
  const out: DinoProp[] = [];
  const extra: { x: number; z: number; r: number }[] = [];
  const add = (kind: DinoPropKind, lx: number, lz: number, rot: number, more: Partial<DinoProp> = {}) => {
    const p = W(lx, lz);
    out.push({ kind, x: p.x, z: p.z, y: groundAt(p.x, p.z), rot, s: 1, seed: out.length * 7 + 3, v: 0, ...more });
    return out[out.length - 1];
  };
  const face = (lx: number, lz: number, tx: number, tz: number) => Math.atan2(tx - lx, tz - lz);
  const GR = DINO_GATE.rot;

  // ── the visitors' side: the gate, the plaza, the jetty's beach ──
  add("gate", GATE_L.lx, GATE_L.lz, GR);
  // (the gate's two great log towers: obstacles either side of the way through)
  const gx = Math.cos(GR);
  const gz = -Math.sin(GR);
  for (const s of [-1, 1]) {
    extra.push({ ...W(GATE_L.lx + gx * s * (DINO_GATE.half + 1.0), GATE_L.lz + gz * s * (DINO_GATE.half + 1.0)), r: 1.3 });
    // (the walls running off into the jungle)
    for (let k = 0; k < 3; k++) extra.push({ ...W(GATE_L.lx + gx * s * (DINO_GATE.half + 3.1 + k * 1.6), GATE_L.lz + gz * s * (DINO_GATE.half + 3.1 + k * 1.6)), r: 0.9 });
  }
  // torches: on the path up from the beach and round the plaza
  const torchesL: [number, number][] = [
    [50.5, -44.5],
    [48.5, -48],
    [36.5, -31],
    [27, -21],
    [36, -21.5],
    [27, -35.5],
  ];
  for (const [lx, lz] of torchesL) add("torch", lx, lz, 0);
  add("hut", 21, -30, face(21, -30, 31, -26));
  add("kiosk", 36.5, -26, face(36.5, -26, 31, -26));
  add("jeep", 28.5, -32.5, 0.7);
  add("crates", 18, -26.5, 0.3);
  add("bench", 32, -20.8, Math.PI);
  add("signpost", 33.5, -30.2, 0.4);
  add("signpost", 16.5, -8.5, 1.4, { v: 1 });
  add("signpost", -6, 46.5, 2.6, { v: 2 });
  add("signpost", -34, -16.5, 0.3, { v: 3 });
  // ── the T-rex paddock: a ring of tall log fencing, the viewing platform, the tower ──
  add("paddock", PADDOCK.lx, PADDOCK.lz, face(PADDOCK.lx, PADDOCK.lz, PLATFORM.lx, PLATFORM.lz));
  for (const p of DINO_FENCE_POSTS) extra.push({ x: p.x, z: p.z, r: 0.72 });
  add("platform", PLATFORM.lx, PLATFORM.lz, face(PLATFORM.lx, PLATFORM.lz, PADDOCK.lx, PADDOCK.lz));
  add("tower", LOOKOUT.lx, LOOKOUT.lz, Math.PI);
  // (rails round the high decks, open at the ramp: obstacles so nobody steps off the edge)
  const rim = (deckId: string, rampId: string, r: number) => {
    const d = DINO_DECKS.find((q) => q.id === deckId)!;
    const rp = DINO_DECKS.find((q) => q.id === rampId)!;
    const ra = Math.atan2(rp.bx - rp.ax, rp.bz - rp.az);
    const n = Math.round((Math.PI * 2 * (r + 0.35)) / 0.8);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const da = Math.atan2(Math.sin(a - ra), Math.cos(a - ra));
      if (Math.abs(da) < 0.42) continue;
      extra.push({ x: d.ax + Math.sin(a) * (r + 0.35), z: d.az + Math.cos(a) * (r + 0.35), r: 0.4 });
    }
    // (and along the ramp's sides, where it's high off the ground)
    const L = Math.hypot(rp.bx - rp.ax, rp.bz - rp.az);
    const ux = (rp.bx - rp.ax) / L;
    const uz = (rp.bz - rp.az) / L;
    for (let u = 1.6; u < L - 3; u += 0.8)
      for (const s of [-1, 1]) extra.push({ x: rp.ax + ux * u + uz * s * (rp.half + 0.4), z: rp.az + uz * u - ux * s * (rp.half + 0.4), r: 0.38 });
  };
  rim("platform", "platform-ramp", PLATFORM.r);
  rim("lookout", "lookout-ramp", LOOKOUT.r);
  // trail fences: rail fences along the stretches through the dino plains
  const fences: [number, number, number, number][] = [
    [27, -13, 20, -7.5],
    [21, 8, 24, 16],
    [27, 20, 25, 29],
    [7, 57, 13, 55.5],
    [-9, 49, -8, 53],
  ];
  for (const [ax, az, bx, bz] of fences) add("fence", (ax + bx) / 2, (az + bz) / 2, face(ax, az, bx, bz), { len: Math.hypot(bx - ax, bz - az) });
  // T-rex footprints along the trail by the paddock (a big three-toed track)
  add("footprints", 24, -10.5, face(24, -10.5, 18, -6));
  add("footprints", 40, -18, face(40, -18, 46, -12), { v: 1 });

  // ── the nests, the dig ──
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.6;
    add("nest", DINO_NESTS.x - X0 + Math.sin(a) * 3.1, DINO_NESTS.z - Z0 + Math.cos(a) * 3.1, a, { v: i });
  }
  add("dig", DIG.lx, DIG.lz, 0.2);
  add("tent", DIG.lx - 8.2, DIG.lz + 2.5, face(DIG.lx - 8.2, DIG.lz + 2.5, DIG.lx, DIG.lz));
  add("crates", DIG.lx + 6.8, DIG.lz + 3.2, 0.9, { v: 1 });
  add("ribcage", 12, 67, 0.8);

  // ── the Ice Age camp ──
  const C = { lx: DINO_CAMP.x - X0, lz: DINO_CAMP.z - Z0 };
  add("campfire", C.lx, C.lz, 0);
  add("bonehut", C.lx - 4.6, C.lz - 3.2, face(C.lx - 4.6, C.lz - 3.2, C.lx, C.lz));
  add("bonehut", C.lx + 1.2, C.lz - 5.8, face(C.lx + 1.2, C.lz - 5.8, C.lx, C.lz), { v: 1, s: 0.85 });
  add("rack", C.lx - 3.8, C.lz + 3.6, 0.5);
  // (the tusk arch: walk through it; its tusks' feet and the skull's stone are in the way)
  const sk = add("skull", C.lx + 4.6, C.lz - 1.4, face(C.lx + 4.6, C.lz - 1.4, C.lx + 6, C.lz + 3));
  const toW = (lx: number, lz: number) => ({ x: sk.x + lx * Math.cos(sk.rot) + lz * Math.sin(sk.rot), z: sk.z - lx * Math.sin(sk.rot) + lz * Math.cos(sk.rot) });
  for (const q of [toW(-1.7, 0), toW(1.7, 0)]) extra.push({ ...q, r: 0.45 });
  extra.push({ ...toW(2.6, 0.6), r: 0.7 });
  add("paintrock", C.lx - 9.5, C.lz + 1.5, face(C.lx - 9.5, C.lz + 1.5, C.lx, C.lz));

  // ── the volcano's hot spots: steaming vents ──
  const V = DINO_VOLCANO_L;
  for (const [a, k] of [
    [0.9, 0.55],
    [2.2, 0.6],
    [-2.6, 0.5],
  ] as [number, number][])
    add("vent", V.lx + Math.sin(a) * V.r * (1 - k), V.lz + Math.cos(a) * V.r * (1 - k), a);
  // (the lava lake: nobody walks in)
  extra.push({ x: X0 + V.lx, z: Z0 + V.lz, r: DINO_VOLCANO.lavaR + 0.4 });

  // ── nature: seeded scatter by biome (kept off the trail, the decks, the herds' ranges, the water) ──
  const rnd = dinoRng(4242);
  const discs = out.filter((p) => PROP_R[p.kind] > 0).map((p) => ({ x: p.x, z: p.z, r: PROP_R[p.kind] * p.s }));
  for (const o of extra) discs.push(o);
  // (big things with no obstacle radius still keep trees away)
  discs.push({ x: X0 + GLACIER.bx + G_UX * 6, z: Z0 + GLACIER.bz + G_UZ * 6, r: 7 }, { ...W(GATE_L.lx, GATE_L.lz), r: 7 }, { ...W(PADDOCK.lx, PADDOCK.lz), r: PADDOCK.r + 1.2 }, { ...W(DIG.lx, DIG.lz), r: DIG.r + 1.5 }, { ...W(31, -26), r: 7.5 }, { x: DINO_CAMP.x, z: DINO_CAMP.z, r: 5.5 });
  const keepOpen = Object.values(DINO_RANGES);
  const clearOf = (x: number, z: number, pad: number, inRange = false) =>
    discs.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 > (t.r + pad) ** 2) &&
    dinoDeckY(x, z) === null &&
    DINO_DECKS.every((d) => segDist2(x, z, d.ax, d.az, d.bx, d.bz) > ((d.r ?? d.half) + pad + 0.6) ** 2) &&
    dinoTrailDistance(x, z) > pad + 1.3 &&
    dinoWaterAt(x, z) === null &&
    (inRange || keepOpen.every((q) => (q.x - x) ** 2 + (q.z - z) ** 2 > (q.r + 1.5) ** 2));
  const tryPlace = (kind: DinoPropKind, lx: number, lz: number, pad: number, more: Partial<DinoProp> = {}, inRange = false) => {
    const p = W(lx, lz);
    const y = dinoLandY(p.x, p.z);
    if (y === null || y < 1.2) return false;
    if (!clearOf(p.x, p.z, pad, inRange)) return false;
    // (not in the crater, not on the glacier's ice)
    if (Math.hypot(lx - V.lx, lz - V.lz) < V.r * 0.42) return false;
    if (glacierAt(lx, lz) && glacierAt(lx, lz)!.q < glacierAt(lx, lz)!.w + 1) return false;
    if (inCave(lx, lz)) return false;
    add(kind, lx, lz, rnd() * Math.PI * 2, more);
    const r = PROP_R[kind] * (more.s ?? 1);
    if (r > 0) discs.push({ x: p.x, z: p.z, r });
    return true;
  };
  // palms: a ring along the top of the beaches (not in the snow)
  for (let i = 0, n = 0; i < 150 && n < 34; i++) {
    const a = (i / 150) * Math.PI * 2 + rnd() * 0.05;
    const r = dinoCoastR(a) * (0.78 + rnd() * 0.07);
    const lx = Math.sin(a) * r;
    const lz = Math.cos(a) * r;
    if (dinoSnowL(lx, lz) > 0.2) continue;
    if (tryPlace("palm", lx, lz, 2.2, { s: 0.85 + rnd() * 0.35, v: Math.floor(rnd() * 3) })) {
      out[out.length - 1].rot = a; // (lean seawards)
      n++;
    }
  }
  // the jungle / plains / snow scatter: each kind has a count, a spacing pad and a biome test
  const snowAt = (lx: number, lz: number) => dinoSnowL(lx, lz);
  const volK = (lx: number, lz: number) => 1 - Math.hypot(lx - V.lx, lz - V.lz) / V.r; // (> 0 on the volcano)
  /** the jungle: warm land, dense in the west round the lagoon and plateau, up the volcano's feet, and in a belt by the gate */
  const jungle = (lx: number, lz: number) => {
    if (snowAt(lx, lz) > 0.25 || volK(lx, lz) > 0.36) return 0;
    const west = smooth(10, -20, lx) * (1 - smooth(-10, 10, lz - 60));
    const gate = 1 - smooth(8, 24, Math.hypot(lx - 38, lz + 36));
    const ring = smooth(0.55, 0.78, Math.hypot(lx, lz) / dinoCoastR(Math.atan2(lx, lz)));
    const foot = volK(lx, lz) > 0 ? 0.8 : 0;
    return Math.min(1, Math.max(west, gate, foot, ring * 0.7) + (noise(lx / 12, lz / 12, 41) - 0.5) * 0.6);
  };
  const plains = (lx: number, lz: number) => (snowAt(lx, lz) < 0.2 && volK(lx, lz) < 0.3 ? 1 : 0);
  type Rule = [DinoPropKind, number, number, (lx: number, lz: number) => number, [number, number]];
  const rules: Rule[] = [
    ["araucaria", 26, 2.6, (lx, lz) => jungle(lx, lz) * 0.8 + (plains(lx, lz) ? 0.15 : 0), [0.85, 1.3]],
    ["jungletree", 30, 3.2, (lx, lz) => jungle(lx, lz), [0.8, 1.2]],
    ["treefern", 34, 1.6, (lx, lz) => jungle(lx, lz), [0.8, 1.25]],
    ["cycad", 30, 1.4, (lx, lz) => Math.max(jungle(lx, lz) * 0.6, plains(lx, lz) * 0.35), [0.75, 1.2]],
    ["bigleaf", 34, 1.2, (lx, lz) => jungle(lx, lz), [0.8, 1.3]],
    ["fern", 60, 0.9, (lx, lz) => Math.max(jungle(lx, lz), plains(lx, lz) * 0.25), [0.8, 1.4]],
    ["flowers", 26, 0.6, (lx, lz) => Math.max(jungle(lx, lz) * 0.5, plains(lx, lz) * 0.3), [0.8, 1.2]],
    ["lavarock", 14, 1.4, (lx, lz) => (volK(lx, lz) > 0.2 && volK(lx, lz) < 0.6 ? 1 : 0), [0.7, 1.5]],
    ["rock", 16, 1.6, (lx, lz) => (snowAt(lx, lz) < 0.3 ? 0.4 : 0), [0.6, 1.4]],
    ["pine", 46, 1.8, (lx, lz) => smooth(0.35, 0.8, snowAt(lx, lz)), [0.75, 1.35]],
    ["snowbush", 20, 1.0, (lx, lz) => smooth(0.4, 0.9, snowAt(lx, lz)), [0.8, 1.3]],
    ["boulder", 10, 2.4, (lx, lz) => smooth(0.5, 0.9, snowAt(lx, lz)), [0.7, 1.2]],
    ["icecrystal", 12, 1.4, (lx, lz) => (snowAt(lx, lz) > 0.85 && Math.hypot(lx - GLACIER.bx, lz - GLACIER.bz) < 26 ? 1 : 0), [0.7, 1.4]],
  ];
  for (const [kind, count, pad, biome, [s0, s1]] of rules) {
    let n = 0;
    for (let k = 0; k < 2600 && n < count; k++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * dinoCoastR(a) * 0.83;
      const lx = Math.sin(a) * r;
      const lz = Math.cos(a) * r;
      if (rnd() > biome(lx, lz)) continue;
      if (tryPlace(kind, lx, lz, pad, { s: s0 + rnd() * (s1 - s0), v: Math.floor(rnd() * 3) })) n++;
    }
  }
  // the swamp: bald cypress trees round its edge (and on its hummocks), reeds and horsetails
  for (let k = 0, n = 0; k < 400 && n < 12; k++) {
    const a = rnd() * Math.PI * 2;
    const e = 0.95 + rnd() * 0.45;
    const c = Math.cos(SWAMP.rot);
    const s = Math.sin(SWAMP.rot);
    const u = Math.sin(a) * SWAMP.rx * e;
    const v = Math.cos(a) * SWAMP.rz * e;
    const lx = SWAMP.lx + u * c + v * s;
    const lz = SWAMP.lz - u * s + v * c;
    const p = W(lx, lz);
    if (dinoDeckY(p.x, p.z) !== null || DINO_DECKS.some((d) => segDist2(p.x, p.z, d.ax, d.az, d.bx, d.bz) < (d.half + 1.6) ** 2)) continue;
    if (!discs.every((t) => (t.x - p.x) ** 2 + (t.z - p.z) ** 2 > (t.r + 1.8) ** 2) || dinoTrailDistance(p.x, p.z) < 2) continue;
    if (!keepOpen.every((q) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2 > (q.r + 1.5) ** 2)) continue;
    add("swamptree", lx, lz, rnd() * Math.PI * 2, { s: 0.8 + rnd() * 0.4, v: Math.floor(rnd() * 3) });
    discs.push({ x: p.x, z: p.z, r: PROP_R.swamptree });
    n++;
  }
  for (let k = 0, n = 0; k < 400 && n < 22; k++) {
    const a = rnd() * Math.PI * 2;
    const e = 0.7 + rnd() * 0.55;
    const c = Math.cos(SWAMP.rot);
    const s = Math.sin(SWAMP.rot);
    const lx = SWAMP.lx + Math.sin(a) * SWAMP.rx * e * c + Math.cos(a) * SWAMP.rz * e * s;
    const lz = SWAMP.lz - Math.sin(a) * SWAMP.rx * e * s + Math.cos(a) * SWAMP.rz * e * c;
    const p = W(lx, lz);
    if (DINO_DECKS.some((d) => segDist2(p.x, p.z, d.ax, d.az, d.bx, d.bz) < (d.half + 0.6) ** 2)) continue;
    add("reeds", lx, lz, rnd() * Math.PI * 2, { s: 0.8 + rnd() * 0.5, v: Math.floor(rnd() * 2) });
    n++;
  }
  // reeds along the lagoon and the river's banks too
  for (let k = 0, n = 0; k < 300 && n < 16; k++) {
    const i = Math.floor(rnd() * (RIVER_L.length - 2));
    const t = rnd();
    const [ax, az] = RIVER_L[i];
    const [bx, bz] = RIVER_L[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const side = rnd() < 0.5 ? -1 : 1;
    const off = RIVER_HALF + 0.3 + rnd() * 0.8;
    const lx = lerp(ax, bx, t) - ((bz - az) / L) * side * off;
    const lz = lerp(az, bz, t) + ((bx - ax) / L) * side * off;
    const p = W(lx, lz);
    if (DINO_DECKS.some((d) => segDist2(p.x, p.z, d.ax, d.az, d.bx, d.bz) < (d.half + 1.2) ** 2) || dinoTrailDistance(p.x, p.z) < 1.4) continue;
    add("reeds", lx, lz, rnd() * Math.PI * 2, { s: 0.7 + rnd() * 0.4, v: 1 });
    n++;
  }
  // monkey-puzzle trees on the brachiosaurs' range edge: they browse the tops
  const B = DINO_RANGES.brachio;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    for (let tries = 0; tries < 6; tries++) {
      const rr = B.r + 2.2 + tries * 0.9;
      if (tryPlace("araucaria", B.x - X0 + Math.sin(a) * rr, B.z - Z0 + Math.cos(a) * rr, 2.2, { s: 1.35, v: 1 }, true)) break;
    }
  }
  // the sloths' trees (they reach up into them)
  const SL = DINO_RANGES.sloth;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 1;
    for (let tries = 0; tries < 6; tries++) {
      const rr = SL.r + 1.6 + tries * 0.8;
      if (tryPlace("jungletree", SL.x - X0 + Math.sin(a) * rr, SL.z - Z0 + Math.cos(a) * rr, 1.8, { s: 0.9, v: 2 }, true)) break;
    }
  }
  // the sabre-cats' rocks (they lounge on top)
  const SB = DINO_RANGES.sabre;
  add("boulder", SB.x - X0 + 1.5, SB.z - Z0 - 2.4, 0.4, { s: 0.85, v: 7 });
  discs.push({ x: SB.x + 1.5, z: SB.z - 2.4, r: PROP_R.boulder * 0.85 });
  return { props: out, extraObstacles: extra };
}

const LAYOUT = buildLayout();
export const DINO_PROPS: DinoProp[] = LAYOUT.props;

/** round things to walk around (buildings, trees, rocks, the paddock fence, the gate towers, deck rails, the lava lake) */
export const DINO_OBSTACLES: { x: number; z: number; r: number }[] = [
  ...DINO_PROPS.filter((p) => PROP_R[p.kind] > 0).map((p) => ({ x: p.x, z: p.z, r: PROP_R[p.kind] * p.s })),
  ...LAYOUT.extraObstacles,
];

/** the torches (world x/z and the flame's height): they burn at dusk and by night */
export const DINO_TORCHES: { x: number; z: number; y: number }[] = [
  ...DINO_PROPS.filter((p) => p.kind === "torch").map((p) => ({ x: p.x, z: p.z, y: p.y + 2.6 })),
  // (the gate's two torches, high on its towers)
  ...[-1, 1].map((s) => ({ x: DINO_GATE.x + Math.cos(DINO_GATE.rot) * s * (DINO_GATE.half + 1.0), z: DINO_GATE.z - Math.sin(DINO_GATE.rot) * s * (DINO_GATE.half + 1.0), y: DINO_GATE.y + 8.6 })),
];
/** the height (above the gate's ground) of the "DINO ISLE" sign's middle */
export const DINO_GATE_SIGN_Y = 6.4;

// ── named spots (landing, HUD, discoveries) ──

export type DinoSpotKind =
  | "gate"
  | "lookout"
  | "nests"
  | "volcano"
  | "lagoon"
  | "dig"
  | "beach"
  | "paddock"
  | "glacier"
  | "icecave"
  | "camp"
  | "swamp"
  | "pond"
  | "waterfall";

export const DINO_SPOTS: { id: string; name: string; x: number; z: number; kind: DinoSpotKind }[] = (() => {
  const n = (id: string) => dinoTrailNode(id);
  const at = (id: string, dx = 0, dz = 0) => ({ x: n(id).x + dx, z: n(id).z + dz });
  const pf = DINO_DECKS.find((d) => d.id === "platform")!;
  const lk = DINO_DECKS.find((d) => d.id === "lookout")!;
  const g = DINO_GLACIER;
  return [
    { id: "dino-gate", name: "Dino Isle Gate", ...at("gate-in", 1.2, -1.2), kind: "gate" },
    { id: "dino-beach", name: "Arrival Beach", ...at("beach"), kind: "beach" },
    { id: "dino-dodo-beach", name: "Dodo Beach", ...at("dodo"), kind: "beach" },
    { id: "dino-paddock", name: "T-rex Paddock", x: pf.ax, z: pf.az, kind: "paddock" },
    { id: "dino-lookout", name: "Lookout Tower", x: lk.ax, z: lk.az, kind: "lookout" },
    { id: "dino-nests", name: "Dino Nests", ...at("nests"), kind: "nests" },
    { id: "dino-dig", name: "Fossil Dig", ...at("dig"), kind: "dig" },
    { id: "dino-volcano", name: "Mount Rumble", ...at("volcano-e"), kind: "volcano" },
    { id: "dino-lagoon", name: "Waterfall Lagoon", ...at("lagoon-e"), kind: "lagoon" },
    { id: "dino-waterfall", name: "Thunder Falls", ...at("waterfall"), kind: "waterfall" },
    { id: "dino-swamp", name: "Steamy Swamp", x: (n("swamp-w").x + n("swamp-e").x) / 2, z: (n("swamp-w").z + n("swamp-e").z) / 2, kind: "swamp" },
    { id: "dino-glacier", name: "Great Glacier", x: lerp(g.ax, g.bx, 0.62), z: lerp(g.az, g.bz, 0.62), kind: "glacier" },
    { id: "dino-icecave", name: "Ice Cave", ...at("cave"), kind: "icecave" },
    { id: "dino-camp", name: "Mammoth-Bone Camp", ...at("camp"), kind: "camp" },
    { id: "dino-pond", name: "Frozen Pond", ...at("pond"), kind: "pond" },
  ];
})();

/** what the kid discovers at each spot (real, kid-sized facts) */
export const DINO_SPOT_FACTS: Record<string, string> = {
  "dino-gate": "Welcome to Dino Isle! Dinosaurs lived on Earth for over 160 million years.",
  "dino-beach": "Ahoy! Look for dinosaurs, flying reptiles and Ice Age giants — all on one island.",
  "dino-dodo-beach": "Dodos lived only on the island of Mauritius. The last one was seen in 1662.",
  "dino-paddock": "Shh! The T-rex is grumpy when woken. T. rex teeth were as big as bananas!",
  "dino-lookout": "Up here you can see the herds! Many plant-eating dinosaurs lived in groups to stay safe.",
  "dino-nests": "Dinosaurs hatched from eggs, like birds. Some parents guarded their nests.",
  "dino-dig": "A fossil dig! Fossils are bones and shells that slowly turned to stone.",
  "dino-volcano": "Mount Rumble is smoking! Volcanoes were busy while the dinosaurs were alive.",
  "dino-lagoon": "Lagoon water attracts thirsty dinos — just like animals at a waterhole today.",
  "dino-waterfall": "Thunder Falls! Rivers and waterfalls carved valleys where fossils are found.",
  "dino-swamp": "Steamy swamps were full of giant ferns and horsetails — tasty dino food!",
  "dino-glacier": "In the last Ice Age, about 20,000 years ago, ice covered a quarter of Earth's land!",
  "dino-icecave": "Glacier ice looks blue because it's packed so tight it soaks up red light.",
  "dino-camp": "Ice Age people built huts from mammoth bones and painted animals on cave walls.",
  "dino-pond": "Brrr! Ice Age animals grew thick fur and fat to keep warm in the cold.",
};

// ── the animals (species facts for the discoveries; the renderer + behaviour live in world/dino/**) ──

export type DinoSpeciesId =
  | "brachio"
  | "trike"
  | "stego"
  | "para"
  | "ankylo"
  | "trex"
  | "compy"
  | "ptero"
  | "plesio"
  | "mammoth"
  | "rhino"
  | "sloth"
  | "glypto"
  | "elk"
  | "sabre"
  | "bear"
  | "dodo"
  | "moa"
  | "thylacine"
  | "terror";

export const DINO_SPECIES: Record<DinoSpeciesId, { name: string; era: "dino" | "iceage" | "recent"; fact: string }> = {
  brachio: { name: "Brachiosaurus herd", era: "dino", fact: "Brachiosaurus stood about 12 m tall — as high as a 4-storey building!" },
  trike: { name: "Triceratops herd", era: "dino", fact: "Triceratops means 'three-horned face'. Its skull was one of the biggest of any land animal!" },
  stego: { name: "Stegosaurus", era: "dino", fact: "Stegosaurus had a brain the size of a lime. Its spiky tail is called a 'thagomizer'!" },
  para: { name: "Parasaurolophus", era: "dino", fact: "Parasaurolophus blew air through its hollow head crest to honk like a trombone!" },
  ankylo: { name: "Ankylosaurus", era: "dino", fact: "Ankylosaurus was armoured like a tank and had a heavy bony club on its tail." },
  trex: { name: "Tyrannosaurus rex", era: "dino", fact: "T. rex lived closer in time to us than to Stegosaurus! It was 12 m long." },
  compy: { name: "Compsognathus", era: "dino", fact: "Compsognathus was only about the size of a chicken — and super speedy!" },
  ptero: { name: "Pteranodons", era: "dino", fact: "Pteranodons weren't dinosaurs — they were flying reptiles with 6 m wings!" },
  plesio: { name: "Plesiosaurus", era: "dino", fact: "Plesiosaurs swam with four big flippers, like underwater wings." },
  mammoth: { name: "Woolly mammoths", era: "iceage", fact: "Woolly mammoths lived until about 4,000 years ago — after the pyramids were built!" },
  rhino: { name: "Woolly rhinos", era: "iceage", fact: "Woolly rhinos had a front horn up to 1 m long. Ice Age people painted them on caves." },
  sloth: { name: "Giant ground sloths", era: "iceage", fact: "Megatherium was as big as an elephant and stood up tall to munch treetop leaves." },
  glypto: { name: "Glyptodons", era: "iceage", fact: "Glyptodons were giant armadillos as big as a small car, with shells of bony plates." },
  elk: { name: "Irish elk", era: "iceage", fact: "Irish elk antlers were up to 3.6 m across — the biggest antlers ever!" },
  sabre: { name: "Sabre-toothed cats", era: "iceage", fact: "Smilodon's fangs were up to 28 cm long, and it could open its jaws super wide." },
  bear: { name: "Cave bears", era: "iceage", fact: "Cave bears were bigger than grizzlies but mostly ate plants. They napped in caves." },
  dodo: { name: "Dodos", era: "recent", fact: "Dodos were giant flightless cousins of pigeons, as tall as a 3-year-old." },
  moa: { name: "Moa flock", era: "recent", fact: "Moa from New Zealand had no wings at all — the tallest stood 3.6 m high!" },
  thylacine: { name: "Thylacine", era: "recent", fact: "The thylacine, or Tasmanian tiger, carried its babies in a pouch like a kangaroo." },
  terror: { name: "Terror bird", era: "recent", fact: "Terror birds couldn't fly, but they were up to 3 m tall and ran really fast!" },
};

// ── calm water round Dino Isle: the open-ocean swell dies down over its reef so the waterline
// stays put on the beaches. Used by the ocean surface, the island's own water and anything afloat. ──
const CALM_IN = DINO_ISLAND.r + 8;
const CALM_OUT = DINO_ISLAND.r + 60;
/** 0.12 right by the island .. 1 out at sea */
export function dinoCalm(x: number, z: number): number {
  const d = Math.hypot(x - DINO_ISLAND.x, z - DINO_ISLAND.z);
  const u = Math.min(1, Math.max(0, (d - CALM_IN) / (CALM_OUT - CALM_IN)));
  return 0.12 + 0.88 * u * u * (3 - 2 * u);
}
/** the same in GLSL: float dinoCalm( vec2 p ) */
export const DINO_CALM_GLSL = `
  float dinoCalm( vec2 p ) {
    float d = length( p - vec2( ${DINO_ISLAND.x.toFixed(2)}, ${DINO_ISLAND.z.toFixed(2)} ) );
    return 0.12 + 0.88 * smoothstep( ${CALM_IN.toFixed(2)}, ${CALM_OUT.toFixed(2)}, d );
  }`;
