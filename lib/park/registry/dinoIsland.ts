// Dino Isle: a Lost World far out in Cucaino Park's boundless ocean — a long, wild island in the
// open sea west of the main island, curled round it like a crescent, with room for its herds to
// roam free (true size: 1 m = 1.6 units; the Park kid is 2.26 units tall).
//   - the south: Mount Rumble, a smoking volcano with glowing lava; a steamy swamp; the nests; the
//     fossil dig; tree-fern and cycad jungle
//   - Rex Ridge (south-west): a high ridge with a deep walled valley in it where the T-rex roams
//     its own territory — the kid looks down on it from the Rex Bridge (a high boardwalk right
//     across the valley) and two lookouts; a tall log fence runs all round the rim
//   - the middle: wide grassy plains and savanna where the herds graze in plain sight, giant
//     monkey-puzzle and redwood groves for the long-necks, the Thunder Falls plateau and its lagoon,
//     and the river winding east across the plains to the sea, with a shallow ford where the herds
//     (and the safari trail) cross
//   - the visitors' side (east, facing the main island): a beach with the jetty, the great log
//     park gate, the plaza with the research hut and the safari jeeps
//   - the north: a land bridge over to the Ice Age valley — snowy tundra under a glacier with an
//     ice cave, mountains, a frozen pond, spruce woods and a mammoth-bone camp
//
// Pure + deterministic (no three.js) so the engine (walking, swimming, landing), the renderer
// (world/dino/**), the animals' behaviour and the tests all read the same numbers:
//   - the coast is a "spine" of round lobes (a smooth union of capsules); dinoShoreDist() is the
//     signed distance to it, and the land/sea profile is a function of that distance
//   - the land is a heightfield sampled on a fixed triangle grid (DINO_GRID); the mesh uses the
//     very same triangles, so dinoLandY() is exactly where the grass/snow/sand is
//   - the jetty, the boardwalks, the bridge and the viewing decks are walkable too (DINO_DECKS)
//   - everything that stands on the island is in DINO_OBSTACLES (trees too: DINO_TREES are drawn
//     instanced); the safari trail is DINO_TRAIL; the herds' places are DINO_ZONES
// NOTE: must not import places.ts or terrain.ts (terrain imports places): the few shared numbers
// are repeated here and checked against terrain.ts by the tests.

/** the sea's resting surface (= terrain.WATER_Y) */
export const DINO_WATER_Y = -0.25;
/** the deep sea floor around the island (= terrain.DEEP_FLOOR) */
const DEEP = -22;

/** the island's centre (world) and its rough half-length (for maps and "you've arrived") */
export const DINO_ISLAND: { id: string; name: string; x: number; z: number; r: number } = { id: "dino-isle", name: "Dino Isle", x: -500, z: 0, r: 215 };
const X0 = DINO_ISLAND.x;
const Z0 = DINO_ISLAND.z;
/** how far past the coast (m) the submerged slopes reach the deep floor (the island's footprint) */
export const DINO_SEA_PAD = 46;

// ── tiny deterministic noise ──

function hash2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** sqrt(x² + z²) — not Math.hypot, which V8 doesn't inline (it boxes its result: garbage every call) */
const hyp = (x: number, z: number) => Math.sqrt(x * x + z * z);
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

// ── the shape of the land (local coordinates: relative to the island's centre; -z is north) ──

/** the island's spine: round lobes [x, z, radius] joined by tapering capsules (north to south) */
const SPINE: [number, number, number][] = [
  [42, -262, 32], // the Ice Age valley's north tip
  [14, -216, 60], // the Ice Age valley
  [4, -150, 12], // the land bridge
  [-6, -52, 84], // the Great Plains
  [-8, 22, 96], // the river plains
  [4, 98, 88], // the savanna + Rex Ridge
  [26, 166, 60], // Mount Rumble's lobe
  [46, 204, 30], // the south tip
];
const SEGS = SPINE.length - 1;
const SP = new Float64Array(SPINE.flat());
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
/** signed distance (m) to the smooth spine shape, no wobble (cheap: the calm water uses it) */
function spineSD(lx: number, lz: number): number {
  let d = Infinity;
  for (let i = 0; i < SEGS; i++) {
    const ax = SP[i * 3];
    const az = SP[i * 3 + 1];
    const ar = SP[i * 3 + 2];
    const bx = SP[i * 3 + 3];
    const bz = SP[i * 3 + 4];
    const br = SP[i * 3 + 5];
    const t = segT(lx, lz, ax, az, bx, bz);
    const e = hyp(ax + (bx - ax) * t - lx, az + (bz - az) * t - lz) - (ar + (br - ar) * t);
    d = i === 0 ? e : smin(d, e, 26);
  }
  return d;
}
/** signed distance (m) to the coastline at a local point (negative inland): the spine plus a wobble */
function shoreL(lx: number, lz: number): number {
  return spineSD(lx, lz) + (noise(lx / 26 + 3, lz / 26 - 5, 2) - 0.5) * 13 + (noise(lx / 9, lz / 9, 6) - 0.5) * 3;
}
/** signed distance (m) from (x, z) (world) to Dino Isle's coastline: negative on the island */
export function dinoShoreDist(x: number, z: number): number {
  return shoreL(x - X0, z - Z0);
}
/**
 * Closed outlines of the island (world) where its shore distance is each of `levels` (ascending;
 * 0 = the coastline), `n` points each, all on the same rays (so rings line up for a mesh).
 */
export function dinoOutlines(levels: number[], n = 120): { x: number; z: number }[][] {
  // rays fan out from the spine: down its east side, round the south tip, up the west side
  const out: { x: number; z: number }[][] = levels.map(() => []);
  for (let k = 0; k < n; k++) {
    const u = k / n;
    const side = u < 0.5 ? 1 : -1;
    const s = u < 0.5 ? u * 2 : (1 - u) * 2;
    const f = s * SEGS;
    const i = Math.min(SEGS - 1, Math.floor(f));
    const t = f - i;
    const ax = SPINE[i][0];
    const az = SPINE[i][1];
    const bx = SPINE[i + 1][0];
    const bz = SPINE[i + 1][1];
    const cx = lerp(ax, bx, t);
    const cz = lerp(az, bz, t);
    let dx = -(bz - az) * side;
    let dz = (bx - ax) * side;
    // (the two tips: fan round the end lobe)
    if (s < 0.06 || s > 0.94) {
      const tip = s < 0.06 ? 0 : SEGS;
      const w = s < 0.06 ? 1 - s / 0.06 : (s - 0.94) / 0.06;
      const ex = SPINE[tip][0] - SPINE[tip === 0 ? 1 : SEGS - 1][0];
      const ez = SPINE[tip][1] - SPINE[tip === 0 ? 1 : SEGS - 1][1];
      const el = hyp(ex, ez);
      const dl0 = hyp(dx, dz);
      dx = lerp(dx / dl0, ex / el, w);
      dz = lerp(dz / dl0, ez / el, w);
    }
    const dl = hyp(dx, dz);
    dx /= dl;
    dz /= dl;
    let r = 0;
    for (let li = 0; li < levels.length; li++) {
      while (r < 420 && shoreL(cx + dx * r, cz + dz * r) < levels[li]) r += 0.5;
      out[li].push({ x: X0 + cx + dx * r, z: Z0 + cz + dz * r });
    }
  }
  return out;
}
/** a closed outline of the island (world) where its shore distance is `level` (0 = the coastline) */
export function dinoOutline(level = 0, n = 120): { x: number; z: number }[] {
  return dinoOutlines([level], n)[0];
}
/** the coastline (world), for the maps */
export const DINO_OUTLINE = dinoOutline(0, 96);

// the profile across the coast: shore distance (m, negative inland) -> height
const PROFILE: [number, number][] = [
  [-16, NaN], // (inland)
  [-9, 1.45], // top of the beach
  [0, -0.7], // just under the waterline
  [7, -1.6],
  [14, -2.8], // the sandy shelf
  [18, -2.2], // the reef crest
  [23, -4.5],
  [DINO_SEA_PAD - 2, DEEP - 1.2], // down the island's flanks to the deep floor
];

/** the rolling land's height: dry land stays well above the crests of the ocean's swell */
const LAND_Y = 3.4;

/** Mount Rumble (the south): a big cone with a crater and a lava lake */
const VOLC = { lx: 6, lz: 178, r: 48, h: 44, craterR: 8, craterDepth: 5 };
/** the Thunder Falls plateau (west) whose east cliff has the waterfall */
const PLATEAU = { lx: -70, lz: -36, r: 22, h: 12.5 };
/** the lagoon at the waterfall's foot (a raised, knee-deep pool) */
const LAG = { lx: -42, lz: -31, rx: 13, rz: 9.5, rot: 0.25, waterY: 2.7 };
/** the swamp (south-east): a hollow of shallow, murky water with little hummocks */
const SWAMP = { lx: 60, lz: 128, rx: 19, rz: 12, rot: -0.35, waterY: 2.8 };
/** Rex Ridge: a high ridge with the T-rex's valley cut deep into it (rim fenced) */
const RIDGE = { lx: -44, lz: 82, rx: 47, rz: 76, h: 15.2 };
/** the T-rex's valley: an ellipse cut into the ridge, its floor far below the rim */
const GORGE = { lx: -38, lz: 82, rx: 30, rz: 58, floorY: 3.6, wall: 6 };
/** a pool on the valley floor where the T-rex drinks */
const GPOOL = { lx: -44, lz: 112, rx: 7, rz: 5, rot: 0.4, waterY: 4.0 };
/** the Ice Age valley: centre + radius of the snowy land */
const ICE = { lx: 14, lz: -222, r: 68 };
/** the snowy mountains round the Ice Age valley */
const MOUNTS: { lx: number; lz: number; r: number; h: number }[] = [
  { lx: -24, lz: -248, r: 28, h: 25 },
  { lx: -40, lz: -212, r: 18, h: 15 },
  { lx: 26, lz: -272, r: 18, h: 12 },
  { lx: 62, lz: -246, r: 14, h: 9 },
];
/** the glacier: a tongue of ice from high on the mountain down to its snout (where the ice cave is) */
const GLACIER = { ax: -22, az: -246, bx: -4, bz: -214, w0: 10, w1: 7.5, y0: 24, y1: 9.2 };
/** the ice cave: a notch into the glacier's snout (roofed by the renderer) */
const CAVE = { depth: 8.5, half: 2.6, floorY: 3.55 };
/** the frozen pond (its ice is the ground) */
const POND = { lx: 42, lz: -202, r: 9, y: 3.15 };

/** the river: from the lagoon's south-east lip winding east across the plains to the sea (local) */
const RIVER_L: [number, number][] = [
  [-31, -27],
  [-16, -19],
  [2, -16],
  [20, -11],
  [36, -8],
  [52, -2],
  [68, 6],
  [84, 10],
  [100, 14],
  [118, 18],
];
/** the ford: where the river spreads wide and ankle-deep (the herds and the trail cross here) */
const FORD = { i: 3, t: 0.55, half: 7, len: 9 };
/** the plateau's stream: from its spring to the waterfall's lip */
const STREAM_L: [number, number][] = [
  [-76, -42],
  [-64, -36],
  [-53.5, -33],
];
const RIVER_HALF = 3.2;
/** where the jetty leaves the beach (local) */
const JETTY_Z = -50;
/** the coast (local x) along the jetty's line */
const JETTY_COAST = (() => {
  let lx = 60;
  while (lx < 160 && shoreL(lx, JETTY_Z) < 0) lx += 0.25;
  return lx;
})();
/** the visitors' side, inland from the jetty's beach: the park gate, then the plaza */
const GATE_X = JETTY_COAST - 24;
const PLAZA_X = JETTY_COAST - 44;
/** level terraces: [lx, lz, inner r, outer r, height] */
const FLATS: [number, number, number, number, number][] = [
  [GATE_X, JETTY_Z, 7, 12, 3.5], // the park gate
  [PLAZA_X, JETTY_Z, 12, 18, 3.5], // the plaza (research hut, the jeeps)
  [58, 82, 6, 10, 3.4], // the nests
  [-12, -198, 8, 13, 3.8], // the Ice Age camp
  [20, -86, 4, 8, 3.5], // the plains lookout tower
];
/** the fossil dig: a shallow pit */
const DIG = { lx: 62, lz: 160, r: 5.5, depth: 0.9 };

function ellE(lx: number, lz: number, E: { lx: number; lz: number; rx: number; rz: number; rot: number }, w1: number, w2: number) {
  const dx = lx - E.lx;
  const dz = lz - E.lz;
  const c = Math.cos(E.rot);
  const s = Math.sin(E.rot);
  const u = (dx * c - dz * s) / E.rx;
  const v = (dx * s + dz * c) / E.rz;
  const a = Math.atan2(u, v);
  return hyp(u, v) * (1 + w1 * Math.sin(3 * a + 1) + w2 * Math.sin(5 * a));
}
const lagoonE = (lx: number, lz: number) => ellE(lx, lz, LAG, 0.06, 0.04);
const swampE = (lx: number, lz: number) => ellE(lx, lz, SWAMP, 0.08, 0.05);
const poolE = (lx: number, lz: number) => ellE(lx, lz, GPOOL, 0.07, 0.04);
/** the valley's ellipse metric (1 at the foot of its walls) */
function gorgeE(lx: number, lz: number) {
  const u = (lx - GORGE.lx) / GORGE.rx;
  const v = (lz - GORGE.lz) / GORGE.rz;
  // (well away: no need for the wobble)
  const e0 = u * u + v * v;
  if (e0 > 4) return Math.sqrt(e0);
  const a = Math.atan2(u, v);
  return hyp(u, v) * (1 + 0.035 * Math.sin(4 * a + 0.7) + 0.02 * Math.sin(7 * a + 2));
}
const ridgeE = (lx: number, lz: number) => hyp((lx - RIDGE.lx) / RIDGE.rx, (lz - RIDGE.lz) / RIDGE.rz);

/** river: nearest point on a polyline -> distance, arc length along it, total length */
function polyNear(pts: [number, number][], lx: number, lz: number, out: PolyNear) {
  out.qx = lx;
  out.qz = lz;
  return polyNearQ(pts, out);
}
interface PolyNear {
  d: number;
  s: number;
  L: number;
  i: number;
  /** the query point (local) */
  qx: number;
  qz: number;
}
/** polyNear with its query point in out.qx/qz (allocation-free: no double arguments) */
function polyNearQ(pts: [number, number][], out: PolyNear) {
  const lx = out.qx;
  const lz = out.qz;
  let best = Infinity;
  let bs = 0;
  let bi = 0;
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    // (no destructuring: this runs every frame for the animals)
    const ax = pts[i][0];
    const az = pts[i][1];
    const bx = pts[i + 1][0];
    const bz = pts[i + 1][1];
    const ux = bx - ax;
    const uz = bz - az;
    const L = Math.sqrt(ux * ux + uz * uz);
    let t = ((lx - ax) * ux + (lz - az) * uz) / (ux * ux + uz * uz || 1);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + ux * t - lx;
    const ez = az + uz * t - lz;
    const d2 = ex * ex + ez * ez;
    if (d2 < best) {
      best = d2;
      bs = acc + t * L;
      bi = i;
    }
    acc += L;
  }
  out.d = Math.sqrt(best);
  out.s = bs;
  out.L = acc;
  out.i = bi;
  return out;
}
const _pn: PolyNear = { d: 0.5, s: 0.5, L: 0.5, i: 0, qx: 0.5, qz: 0.5 };
const RIVER_LEN = (() => {
  let L = 0;
  for (let i = 0; i + 1 < RIVER_L.length; i++) L += hyp(RIVER_L[i + 1][0] - RIVER_L[i][0], RIVER_L[i + 1][1] - RIVER_L[i][1]);
  return L;
})();
/** the ford's centre (local) and its arc length along the river */
const FORD_C = (() => {
  const [ax, az] = RIVER_L[FORD.i];
  const [bx, bz] = RIVER_L[FORD.i + 1];
  let s = 0;
  for (let i = 0; i < FORD.i; i++) s += hyp(RIVER_L[i + 1][0] - RIVER_L[i][0], RIVER_L[i + 1][1] - RIVER_L[i][1]);
  s += hyp(bx - ax, bz - az) * FORD.t;
  return { lx: lerp(ax, bx, FORD.t), lz: lerp(az, bz, FORD.t), s };
})();
/** the river's water surface at arc length s (from the lagoon, 0, to the sea) */
function riverWaterY(s: number) {
  const u = Math.min(1, Math.max(0, s / RIVER_LEN));
  return lerp(LAG.waterY, DINO_WATER_Y + 0.05, Math.pow(u, 1.25));
}
/** how wide (half, m) and deep (m) the river is at arc length s: wide and shallow at the ford */
function riverShape(s: number): { half: number; depth: number } {
  const f = 1 - smooth(FORD.len * 0.4, FORD.len, Math.abs(s - FORD_C.s));
  _rs.half = lerp(RIVER_HALF + Math.min(1.6, s / 60), FORD.half, f);
  _rs.depth = lerp(0.62, 0.22, f);
  return _rs;
}
const _rs = { half: 0, depth: 0 };

/** how snowy the land is (0 jungle/plains .. 1 deep Ice Age snow), local coordinates */
export function dinoSnowL(lx: number, lz: number): number {
  const d = hyp(lx - ICE.lx, (lz - ICE.lz) * 1.15) + (noise(lx / 11 + 4, lz / 11 - 2, 21) - 0.5) * 14;
  return 1 - smooth(ICE.r - 10, ICE.r + 6, d);
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
  const L = hyp(ux, uz);
  const t = ((lx - G.ax) * ux + (lz - G.az) * uz) / (L * L);
  if (t < -0.25 || t > 1.08) return null;
  const px = G.ax + ux * t;
  const pz = G.az + uz * t;
  const q = hyp(lx - px, lz - pz);
  const w = lerp(G.w0, G.w1, Math.min(1, Math.max(0, t))) * (1 + 0.08 * Math.sin(t * 9));
  if (q > w + 2.5) return null;
  const tc = Math.min(1, Math.max(0, t));
  // crevasses: shallow bands across the flow
  const crev = Math.max(0, Math.sin(tc * 38 + q * 0.4) - 0.82) * 2.2;
  const y = lerp(G.y0, G.y1, Math.pow(tc, 0.85)) + 1.4 * (1 - (q / w) ** 2) - crev;
  return { y, q, t, w };
}
/** the glacier's axis (local): unit direction down the flow */
const G_UX = (GLACIER.bx - GLACIER.ax) / hyp(GLACIER.bx - GLACIER.ax, GLACIER.bz - GLACIER.az);
const G_UZ = (GLACIER.bz - GLACIER.az) / hyp(GLACIER.bx - GLACIER.ax, GLACIER.bz - GLACIER.az);
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
  const sd = shoreL(lx, lz);
  // the rolling land: long gentle swells for the plains (herds seen from afar), small bumps on top
  const inland = LAND_Y + (noise(lx / 46 + 5, lz / 46 - 3, 3) - 0.5) * 2.4 + (noise(lx / 15, lz / 15, 4) - 0.5) * 0.9 + (noise(lx / 5, lz / 5, 9) - 0.5) * 0.2;
  let h: number;
  if (sd <= PROFILE[0][0]) h = inland;
  else if (sd >= PROFILE[PROFILE.length - 1][0]) h = PROFILE[PROFILE.length - 1][1];
  else {
    let i = 0;
    while (sd > PROFILE[i + 1][0]) i++;
    const [s0, h0] = PROFILE[i];
    const [s1, h1] = PROFILE[i + 1];
    const a0 = Number.isNaN(h0) ? inland : h0;
    const k = (sd - s0) / (s1 - s0);
    h = lerp(a0, h1, i >= 5 ? k * 0.35 + fade(k) * 0.65 : fade(k));
  }
  // ripples on the sandy shelf
  if (sd > 2 && sd < 26) h += Math.sin(lx * 0.6 + Math.sin(lz * 0.15) * 3) * 0.1 + (noise(lx / 6, lz / 6, 8) - 0.5) * 0.4;
  // big features fade out past the coast (their flanks drop into the sea as cliffs)
  const coastK = 1 - smooth(-10, -1, sd);

  // Mount Rumble: a concave cone, gullied flanks, a crater with a lava lake
  const V = VOLC;
  const vd = hyp(lx - V.lx, lz - V.lz);
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
    } else if (vd < V.craterR + 2) vh = lerp(cone(rimK) + 0.6, vh, smooth(V.craterR, V.craterR + 2, vd));
    h += vh * coastK;
  }
  // the snowy mountains
  for (const M of MOUNTS) {
    const md = hyp(lx - M.lx, lz - M.lz) / M.r;
    if (md < 1) {
      const k = Math.pow(1 - fade(md), 1.2);
      h += M.h * k * (0.82 + 0.36 * noise(lx / 6 + M.lx, lz / 6, 13)) * coastK;
    }
  }
  // the plateau: a flat-topped mesa with cliff sides
  const pd = hyp(lx - PLATEAU.lx, lz - PLATEAU.lz);
  const pa = Math.atan2(lx - PLATEAU.lx, lz - PLATEAU.lz);
  const pr = PLATEAU.r * (1 + 0.07 * Math.sin(5 * pa + 1) + 0.04 * Math.sin(9 * pa));
  if (pd < pr + 2) {
    const top = LAND_Y + PLATEAU.h + (noise(lx / 4, lz / 4, 14) - 0.5) * 0.5;
    h = lerp(h, Math.max(h, top), (1 - smooth(pr - 1.8, pr + 1.4, pd)) * coastK);
  }
  // the falls country: the land rises a little round the lagoon's basin
  const fr = hyp(lx - LAG.lx + 4, lz - LAG.lz);
  if (fr < 46) h += 1.6 * (1 - smooth(20, 46, fr)) * coastK;
  // Rex Ridge: a broad ridge (gentle outer slopes, so the trail can climb it) ...
  const re = ridgeE(lx, lz);
  if (re < 1.6) {
    const top = LAND_Y + RIDGE.h + (noise(lx / 9 + 2, lz / 9, 15) - 0.5) * 0.9;
    h = lerp(h, Math.max(h, top), (1 - smooth(1.0, 1.55, re)) * coastK);
  }
  // ... with the T-rex's valley cut deep into it: sheer walls down to a grassy floor
  const ge = gorgeE(lx, lz);
  const gw = GORGE.wall / GORGE.rx;
  if (ge < 1 + gw) {
    const floor = GORGE.floorY + (noise(lx / 7, lz / 7, 16) - 0.5) * 0.5 + (ge > 0.8 ? (ge - 0.8) * 2.5 : 0);
    const k = smooth(1, 1 + gw, ge);
    h = lerp(floor, h, k * k * (1 + 0.3 * (noise(lx / 2.5, lz / 2.5, 17) - 0.5)));
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
    const fd = hyp(lx - fx, lz - fz);
    if (fd < r1) h = lerp(h, fh, 1 - smooth(r0, r1, fd));
  }
  // the frozen pond (its ice surface is the ground)
  const od = hyp(lx - POND.lx, lz - POND.lz);
  if (od < POND.r + 3) h = lerp(h, od < POND.r ? POND.y : POND.y + 0.25, 1 - smooth(POND.r, POND.r + 3, od));
  // the fossil dig: a shallow square-ish pit
  const dq = Math.max(Math.abs(lx - DIG.lx), Math.abs(lz - DIG.lz)) * 0.7 + hyp(lx - DIG.lx, lz - DIG.lz) * 0.3;
  if (dq < DIG.r + 3) {
    const rim = LAND_Y + 0.05;
    h = lerp(h, rim, 1 - smooth(DIG.r + 0.5, DIG.r + 3, dq));
    if (dq < DIG.r + 0.5) h = lerp(rim - DIG.depth, rim, smooth(DIG.r - 0.6, DIG.r + 0.5, dq));
  }
  // the lagoon: a knee-deep hollow at the waterfall's foot
  const e = lagoonE(lx, lz);
  if (e < 1.35) {
    const floor = LAG.waterY - 0.45 - 0.2 * (1 - Math.min(1, e));
    h = lerp(h, floor, 1 - smooth(0.88, 1.3, e));
  }
  // the valley's pool
  const pe = poolE(lx, lz);
  if (pe < 1.4) h = lerp(h, GPOOL.waterY - 0.4 - 0.15 * (1 - Math.min(1, pe)), 1 - smooth(0.85, 1.35, pe));
  // the swamp: shallow water with hummocks poking out
  const se = swampE(lx, lz);
  if (se < 1.35) {
    const hum = (noise(lx / 3.2 + 9, lz / 3.2, 31) - 0.5) * 1.1;
    const floor = SWAMP.waterY - 0.42 + Math.max(-0.1, hum);
    h = lerp(h, floor, 1 - smooth(0.85, 1.3, se));
  }
  // the river (and the plateau's stream) carve their channels
  polyNear(RIVER_L, lx, lz, _pn);
  if (_pn.d < 40) {
    const wy = riverWaterY(_pn.s);
    const rs = riverShape(_pn.s);
    const bed = wy - rs.depth * (1 - (Math.min(_pn.d, rs.half) / rs.half) ** 2) - 0.08;
    // (gently sloping banks: the herds walk down to drink)
    const bank = Math.max(bed, Math.min(h, wy + 0.3 + (_pn.d - rs.half) * 0.35));
    h = Math.min(h, _pn.d < rs.half ? bed : bank);
  }
  polyNear(STREAM_L, lx, lz, _pn);
  if (_pn.d < 2.6 && pd < pr + 0.5) h -= 0.4 * (1 - smooth(0.7, 2.6, _pn.d));
  return h;
}

// ── the height grid (the mesh uses exactly these triangles) ──

/** grid spacing (m) and the grid's local extent (it covers the island's whole footprint) */
export const DINO_GRID = 2.4;
/** (the grid's local box: the island's whole footprint, plus a margin) */
const GRID_BOX = (() => {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of dinoOutline(DINO_SEA_PAD + 4, 240)) {
    x0 = Math.min(x0, p.x - X0);
    x1 = Math.max(x1, p.x - X0);
    z0 = Math.min(z0, p.z - Z0);
    z1 = Math.max(z1, p.z - Z0);
  }
  return { x0: Math.floor(x0 - 6), x1: Math.ceil(x1 + 6), z0: Math.floor(z0 - 6), z1: Math.ceil(z1 + 6) };
})();
export const DINO_GX0 = GRID_BOX.x0;
export const DINO_GZ0 = GRID_BOX.z0;
export const DINO_NX = Math.ceil((GRID_BOX.x1 - DINO_GX0) / DINO_GRID) + 1;
export const DINO_NZ = Math.ceil((GRID_BOX.z1 - DINO_GZ0) / DINO_GRID) + 1;
/** the grid's far edges (local) */
export const DINO_GX1 = DINO_GX0 + (DINO_NX - 1) * DINO_GRID;
export const DINO_GZ1 = DINO_GZ0 + (DINO_NZ - 1) * DINO_GRID;
let grid: Float32Array | null = null;

/** the baked heights (row-major NZ x NX: rows along z, columns along x, from (DINO_GX0, DINO_GZ0) local) */
export function dinoGrid(): Float32Array {
  if (grid) return grid;
  const g = new Float32Array(DINO_NX * DINO_NZ);
  for (let j = 0; j < DINO_NZ; j++) for (let i = 0; i < DINO_NX; i++) g[j * DINO_NX + i] = localHeight(DINO_GX0 + i * DINO_GRID, DINO_GZ0 + j * DINO_GRID);
  grid = g;
  return g;
}

/** the land height at a world point, interpolated on the mesh's triangles (null off the grid) */
export function dinoLandY(x: number, z: number): number | null {
  const y = dinoLandYN(x, z);
  return y === y ? y : null;
}
/** the same, NaN off the grid (no boxing: for the animals' per-frame maths) */
export function dinoLandYN(x: number, z: number): number {
  DQ[0] = x;
  DQ[1] = z;
  dinoLandYQ();
  return DQ[2];
}
/**
 * Allocation-free lookups for the animals' per-frame maths (V8 boxes every double passed to or
 * returned from a call it doesn't inline): put the world point in DQ[0], DQ[1], call the Q
 * function, read the answer from DQ[2] (NaN = none).
 */
export const DQ = new Float64Array(4);
/** dinoLandYN on DQ */
export function dinoLandYQ(): void {
  const fx = (DQ[0] - X0 - DINO_GX0) / DINO_GRID;
  const fz = (DQ[1] - Z0 - DINO_GZ0) / DINO_GRID;
  const N = DINO_NX;
  if (!(fx >= 0 && fz >= 0 && fx < N - 1 && fz < DINO_NZ - 1)) {
    DQ[2] = NaN;
    return;
  }
  const g = grid ?? dinoGrid();
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const k = j * N + i;
  // cells are split along the (i+1, j) - (i, j+1) diagonal
  if (u + v <= 1) DQ[2] = g[k] + (g[k + 1] - g[k]) * u + (g[k + N] - g[k]) * v;
  else DQ[2] = g[k + N + 1] + (g[k + N] - g[k + N + 1]) * (1 - u) + (g[k + 1] - g[k + N + 1]) * (1 - v);
}

/** the smooth height of the island (land and submerged slopes) at a world point */
export function dinoHeightAt(x: number, z: number): number {
  return localHeight(x - X0, z - Z0);
}

// ── water on the land: the lagoon, the swamp, the river, the valley pool ──

export const DINO_LAGOON = { x: X0 + LAG.lx, z: Z0 + LAG.lz, rx: LAG.rx, rz: LAG.rz, rot: LAG.rot, waterY: LAG.waterY };
export const DINO_SWAMP = { x: X0 + SWAMP.lx, z: Z0 + SWAMP.lz, rx: SWAMP.rx, rz: SWAMP.rz, rot: SWAMP.rot, waterY: SWAMP.waterY };
export const DINO_POOL = { x: X0 + GPOOL.lx, z: Z0 + GPOOL.lz, rx: GPOOL.rx, rz: GPOOL.rz, rot: GPOOL.rot, waterY: GPOOL.waterY };
/** the river's centreline (world) from the lagoon to the sea, with its water height and half-width at each point */
export const DINO_RIVER: { x: number; z: number; y: number; half: number }[] = (() => {
  const out: { x: number; z: number; y: number; half: number }[] = [];
  let s = 0;
  for (let i = 0; i + 1 < RIVER_L.length; i++) {
    const [ax, az] = RIVER_L[i];
    const [bx, bz] = RIVER_L[i + 1];
    const L = hyp(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / 3));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const u = k / n;
      const ss = s + u * L;
      out.push({ x: X0 + lerp(ax, bx, u), z: Z0 + lerp(az, bz, u), y: riverWaterY(ss), half: riverShape(ss).half });
    }
    s += L;
  }
  return out;
})();
export const DINO_RIVER_HALF = RIVER_HALF;
/** the ford (world): where the herds and the trail splash across */
export const DINO_FORD = { x: X0 + FORD_C.lx, z: Z0 + FORD_C.lz, half: FORD.half, y: riverWaterY(FORD_C.s) };
/** the plateau's stream (world), on top of the plateau */
export const DINO_STREAM: { x: number; z: number }[] = STREAM_L.map(([lx, lz]) => ({ x: X0 + lx, z: Z0 + lz }));
export const DINO_PLATEAU = { x: X0 + PLATEAU.lx, z: Z0 + PLATEAU.lz, r: PLATEAU.r, y: LAND_Y + PLATEAU.h };
/** the waterfall: its lip on the plateau's east cliff, falling into the lagoon (rot = the way it pours) */
export const DINO_WATERFALL = { x: X0 + STREAM_L[2][0] + 0.4, z: Z0 + STREAM_L[2][1], top: 0, bottom: LAG.waterY, rot: Math.PI / 2 - 0.12, w: 5.5 };
DINO_WATERFALL.top = localHeight(STREAM_L[2][0] - 1.4, STREAM_L[2][1]) + 0.1;
export const DINO_VOLCANO = {
  x: X0 + VOLC.lx,
  z: Z0 + VOLC.lz,
  r: VOLC.r,
  craterR: VOLC.craterR,
  /** the crater's rim height and its lava lake's surface + radius */
  rimY: 0,
  lavaY: 0,
  lavaR: 0,
};
DINO_VOLCANO.rimY = localHeight(VOLC.lx + VOLC.craterR, VOLC.lz);
DINO_VOLCANO.lavaY = localHeight(VOLC.lx, VOLC.lz) + 1.6;
DINO_VOLCANO.lavaR = VOLC.craterR * Math.sqrt(1.6 / VOLC.craterDepth) + 0.3;
/** the T-rex's valley (world): the ellipse at the foot of its walls, its floor and the ridge top round it */
export const DINO_GORGE = { x: X0 + GORGE.lx, z: Z0 + GORGE.lz, rx: GORGE.rx, rz: GORGE.rz, floorY: GORGE.floorY, rimY: LAND_Y + RIDGE.h, wall: GORGE.wall };
/** the valley's metric at a world point (< 1 on its floor, 1..1+wall/rx up its walls) */
export function dinoGorgeE(x: number, z: number): number {
  return gorgeE(x - X0, z - Z0);
}
/** dinoGorgeE on DQ */
export function dinoGorgeEQ(): void {
  const u = (DQ[0] - X0 - GORGE.lx) / GORGE.rx;
  const v = (DQ[1] - Z0 - GORGE.lz) / GORGE.rz;
  const e0 = u * u + v * v;
  if (e0 > 4) {
    DQ[2] = Math.sqrt(e0);
    return;
  }
  const a = Math.atan2(u, v);
  DQ[2] = Math.sqrt(e0) * (1 + 0.035 * Math.sin(4 * a + 0.7) + 0.02 * Math.sin(7 * a + 2));
}
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
/** the water surface over (x, z) on the island (lagoon, swamp, river, the valley pool), else null */
export function dinoWaterAt(x: number, z: number): number | null {
  const w = dinoWaterAtN(x, z);
  return w === w ? w : null;
}
/** the same, NaN where there's none (no boxing: for the animals' per-frame maths) */
export function dinoWaterAtN(x: number, z: number): number {
  DQ[0] = x;
  DQ[1] = z;
  dinoWaterAtQ();
  return DQ[2];
}
/** is the point in _eq inside the wobbly ellipse E's metric _eq.lim (allocation-free: no double arguments) */
function ellQ(E: { lx: number; lz: number; rx: number; rz: number; rot: number }, w1: number, w2: number): boolean {
  const dx = _eq.x - E.lx;
  const dz = _eq.z - E.lz;
  const c = Math.cos(E.rot);
  const s = Math.sin(E.rot);
  const u = (dx * c - dz * s) / E.rx;
  const v = (dx * s + dz * c) / E.rz;
  const a = Math.atan2(u, v);
  return Math.sqrt(u * u + v * v) * (1 + w1 * Math.sin(3 * a + 1) + w2 * Math.sin(5 * a)) < _eq.lim;
}
const _eq = { x: 0.5, z: 0.5, lim: 0.5 };
/** dinoWaterAtN on DQ */
export function dinoWaterAtQ(): void {
  const lx = DQ[0] - X0;
  const lz = DQ[1] - Z0;
  DQ[2] = NaN;
  if (lx < DINO_GX0 || lx > DINO_GX1 || lz < DINO_GZ0 || lz > DINO_GZ1) return;
  dinoLandYQ();
  const land = DQ[2];
  DQ[2] = NaN;
  if (land !== land) return;
  _eq.x = lx;
  _eq.z = lz;
  // (quick boxes before the ellipses)
  if (land < LAG.waterY && Math.abs(lx - LAG.lx) < LAG.rx * 1.5 && Math.abs(lz - LAG.lz) < LAG.rx * 1.5) {
    _eq.lim = 1.3;
    if (ellQ(LAG, 0.06, 0.04)) {
      DQ[2] = LAG.waterY;
      return;
    }
  }
  if (land < SWAMP.waterY && Math.abs(lx - SWAMP.lx) < SWAMP.rx * 1.5 && Math.abs(lz - SWAMP.lz) < SWAMP.rx * 1.5) {
    _eq.lim = 1.3;
    if (ellQ(SWAMP, 0.08, 0.05)) {
      DQ[2] = SWAMP.waterY;
      return;
    }
  }
  if (land < GPOOL.waterY && Math.abs(lx - GPOOL.lx) < GPOOL.rx * 1.6 && Math.abs(lz - GPOOL.lz) < GPOOL.rx * 1.6) {
    _eq.lim = 1.35;
    if (ellQ(GPOOL, 0.07, 0.04)) {
      DQ[2] = GPOOL.waterY;
      return;
    }
  }
  // (the river: a quick box test first — this runs for every animal, every frame)
  if (lz > -40 && lz < 34 && lx > -40) {
    _pn.qx = lx;
    _pn.qz = lz;
    polyNearQ(RIVER_L, _pn);
    if (_pn.d < 11) {
      // (riverWaterY, inline)
      const u = Math.min(1, Math.max(0, _pn.s / RIVER_LEN));
      const wy = LAG.waterY + (DINO_WATER_Y + 0.05 - LAG.waterY) * Math.pow(u, 1.25);
      if (land < wy && wy > DINO_WATER_Y + 0.1) DQ[2] = wy;
    }
  }
}

// ── decks: the jetty, the boardwalks, the Rex Bridge, the lookouts ──

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
  /** round decks: the way (angle) their railing opens to the trail */
  open?: number;
}

const W = (lx: number, lz: number) => ({ x: X0 + lx, z: Z0 + lz });
const JETTY_Y = 1.6;
/** the way to the main island (east): the jetty, beach and gate face it */
export const DINO_NE_A = Math.atan2(-X0, -Z0);
const NE = { x: Math.sin(DINO_NE_A), z: Math.cos(DINO_NE_A) };
/** the plains lookout tower, the river hide, the Rex lookouts */
const LOOKOUT = { lx: 20, lz: -86, r: 3.6, up: 7.2 };
const HIDE = { lx: 26, lz: -27, r: 3.4, up: 1.4 };
/** the Rex Bridge: straight across the valley, rim to rim (local z), and the lookouts at its ends and the north rim */
const REXB = { lz: 74, x0: 5, x1: -81 };
/** (the west lookout is a deck on the rim at the bridge's far end; the north one is raised, with a ramp) */
const REX_LOOK = { lx: -86, lz: 74, r: 3.8 };
const REX_NORTH = { lx: -5, lz: 26, r: 3.8 };

/** the land's height on the mesh (local), for where decks meet the ground */
const landL = (lx: number, lz: number) => dinoLandY(X0 + lx, Z0 + lz) ?? localHeight(lx, lz);

function buildDecks(): DinoDeck[] {
  const out: DinoDeck[] = [];
  const seg = (id: string, kind: DinoDeck["kind"], a: { x: number; z: number }, b: { x: number; z: number }, half: number, ya: number, yb: number) =>
    out.push({ id, kind, ax: a.x, az: a.z, bx: b.x, bz: b.z, half, ya, yb });
  const disc = (id: string, c: { x: number; z: number }, r: number, y: number) => out.push({ id, kind: "deck", ax: c.x, az: c.z, bx: c.x, bz: c.z, half: 0, ya: y, yb: y, r });
  // the jetty: from the east beach straight out to sea (towards the main island), a T at the end
  const jb = { lx: JETTY_COAST - 8.5, lz: JETTY_Z };
  const je = { lx: JETTY_COAST + 13, lz: JETTY_Z };
  seg("jetty", "jetty", W(jb.lx, jb.lz), W(je.lx, je.lz), 1.4, JETTY_Y, JETTY_Y);
  seg("jetty-t", "jetty", W(je.lx, je.lz - 6), W(je.lx, je.lz + 6), 1.45, JETTY_Y, JETTY_Y);
  // a high deck with a ramp down to the trail (`dir` = the way the ramp runs off, local)
  const lookout = (id: string, L: { lx: number; lz: number; r: number; up: number }, dir: [number, number], len: number) => {
    const y = localHeight(L.lx, L.lz) + L.up;
    disc(id, W(L.lx, L.lz), L.r, y);
    const dl = hyp(dir[0], dir[1]);
    const ux = dir[0] / dl;
    const uz = dir[1] / dl;
    const a = W(L.lx + ux * (L.r - 0.4), L.lz + uz * (L.r - 0.4));
    const bL = { lx: L.lx + ux * (L.r + len), lz: L.lz + uz * (L.r + len) };
    seg(`${id}-ramp`, "ramp", a, W(bL.lx, bL.lz), 1.1, y, landL(bL.lx, bL.lz) + 0.02);
  };
  lookout("lookout", LOOKOUT, [0.25, 1], 18);
  lookout("hide", HIDE, [0.6, -1], 4.5);
  // (the two Rex lookouts: decks on the rim, flush with the ground where you step on, on legs over the drop)
  disc("rex-look", W(REX_LOOK.lx, REX_LOOK.lz), REX_LOOK.r, landL(REX_LOOK.lx + REX_LOOK.r - 0.6, REX_LOOK.lz) + 0.02);
  out[out.length - 1].open = Math.PI / 2;
  disc("rex-north", W(REX_NORTH.lx, REX_NORTH.lz), REX_NORTH.r, landL(REX_NORTH.lx + REX_NORTH.r - 0.6, REX_NORTH.lz) + 0.02);
  out[out.length - 1].open = Math.PI / 2;
  // the swamp boardwalk: bank to bank along the swamp's long axis
  {
    const c = Math.cos(SWAMP.rot);
    const s = Math.sin(SWAMP.rot);
    const ax = SWAMP.lx - c * 23;
    const az = SWAMP.lz + s * 23;
    const bx = SWAMP.lx + c * 22;
    const bz = SWAMP.lz - s * 22;
    const y = SWAMP.waterY + 0.55;
    const m1 = { lx: lerp(ax, bx, 0.18), lz: lerp(az, bz, 0.18) };
    const m2 = { lx: lerp(ax, bx, 0.82), lz: lerp(az, bz, 0.82) };
    seg("swamp-w", "boardwalk", W(ax, az), W(m1.lx, m1.lz), 1.1, landL(ax, az) + 0.02, y);
    seg("swamp", "boardwalk", W(m1.lx, m1.lz), W(m2.lx, m2.lz), 1.1, y, y);
    seg("swamp-e", "boardwalk", W(m2.lx, m2.lz), W(bx, bz), 1.1, y, landL(bx, bz) + 0.02);
  }
  // the Rex Bridge: a long, high boardwalk right across the T-rex's valley, rim to rim, with a gentle hump
  {
    const y0 = landL(REXB.x0, REXB.lz) + 0.02;
    const y1 = landL(REXB.x1, REXB.lz) + 0.02;
    const xm = (REXB.x0 + REXB.x1) / 2;
    const crown = Math.max(y0, y1) + 1.2;
    seg("rexbridge-a", "bridge", W(REXB.x0, REXB.lz), W(xm, REXB.lz), 1.35, y0, crown);
    seg("rexbridge-b", "bridge", W(xm, REXB.lz), W(REXB.x1, REXB.lz), 1.35, crown, y1);
  }
  return out;
}
// (every deck the same shape — the same fields in the same order — so the animals' per-frame deck
//  lookups read one object shape: V8 boxes (allocates) a double read from many shapes)
export const DINO_DECKS: DinoDeck[] = buildDecks().map((d) => ({ id: d.id, kind: d.kind, ax: d.ax, az: d.az, bx: d.bx, bz: d.bz, half: d.half, ya: d.ya, yb: d.yb, r: d.r, open: d.open }));

/** the deck under (x, z), if any: its height */
export function dinoDeckY(x: number, z: number): number | null {
  const y = dinoDeckYN(x, z);
  return y === y ? y : null;
}
/** the same, NaN off the decks (no boxing) */
export function dinoDeckYN(x: number, z: number): number {
  DQ[0] = x;
  DQ[1] = z;
  dinoDeckYQ();
  return DQ[2];
}
/** dinoDeckYN on DQ */
export function dinoDeckYQ(): void {
  const x = DQ[0];
  const z = DQ[1];
  let best = NaN;
  for (let k = 0; k < DINO_DECKS.length; k++) {
    const d = DINO_DECKS[k];
    let y = NaN;
    if (d.r !== undefined) {
      const ex = x - d.ax;
      const ez = z - d.az;
      if (ex * ex + ez * ez <= d.r * d.r) y = d.ya;
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
    if (y === y && (best !== best || y > best)) best = y;
  }
  DQ[2] = best;
}

// ── walkable ground + the sea floor ──

/** land height above the sea where (x, z) is on the island's walkable ground (beach, jungle, plains,
 *  snow, the glacier, the knee-deep lagoon/swamp/river, the decks), else null */
export function dinoGroundY(x: number, z: number): number | null {
  const lx = x - X0;
  const lz = z - Z0;
  if (lx < DINO_GX0 + 2 || lx > DINO_GX1 - 2 || lz < DINO_GZ0 + 2 || lz > DINO_GZ1 - 2) return null;
  const deck = dinoDeckY(x, z);
  if (deck !== null) return deck;
  const land = dinoLandY(x, z);
  if (land === null) return null;
  if (land < DINO_WATER_Y + 0.05) return null;
  return land;
}

/** the island's own sea floor (its submerged slopes rising out of the deep), for swimming near it;
 *  returns null off its footprint. (It meets the deep floor at the rim, so max() with the sea's floor is seamless.) */
export function dinoSeaFloorY(x: number, z: number): number | null {
  const lx = x - X0;
  const lz = z - Z0;
  if (lx < DINO_GX0 || lx > DINO_GX1 || lz < DINO_GZ0 || lz > DINO_GZ1) return null;
  // (cheap reject far off the shape: the wobble is at most ~8 m)
  if (spineSD(lx, lz) > DINO_SEA_PAD + 9) return null;
  if (shoreL(lx, lz) > DINO_SEA_PAD) return null;
  const g = dinoLandY(x, z);
  if (g !== null) return g;
  return localHeight(lx, lz);
}

// ── the safari trail (a graph kept clear of obstacles, winding round the whole island) ──

const NODES_L: [string, number, number][] = [
  ["jetty-end", JETTY_COAST + 11.5, JETTY_Z],
  ["jetty-base", JETTY_COAST - 8, JETTY_Z],
  ["beach", JETTY_COAST - 14, JETTY_Z],
  ["gate-out", GATE_X + 7, JETTY_Z],
  ["gate-in", GATE_X - 7.5, JETTY_Z],
  ["plaza", PLAZA_X, JETTY_Z],
  ["plaza-n", PLAZA_X - 7, JETTY_Z - 15],
  ["lookout-foot", 0, 0], // (the ramps' feet: set below)
  ["lookout", 0, 0],
  ["plains-n", 2, -70],
  ["grove-n", -10, -92],
  ["plains-far", 6, -118],
  ["bridge-land", 4, -152],
  ["tundra-s", 8, -180],
  ["camp", 2, -194],
  ["cave", 0, 0], // (in front of the ice cave's mouth: set below)
  ["glacier-view", 14, -220],
  ["tundra-n", 34, -230],
  ["pond", 46, -216],
  ["tundra-e", 46, -186],
  ["plains-w", -30, -72],
  ["falls", -30, -46],
  ["lagoon-e", -28, -36],
  ["river-w", -6, -30],
  ["hide-foot", 0, 0],
  ["hide", 0, 0],
  ["ford-n", 0, 0], // (either side of the ford: set below)
  ["ford-s", 0, 0],
  ["savanna", 40, 26],
  ["grove-e", 74, 36],
  ["savanna-s", 30, 56],
  ["nests", 54, 74],
  ["swamp-w", 0, 0], // (the boardwalk's ends: set below)
  ["swamp-e", 0, 0],
  ["dig", 66, 150],
  ["volcano-e", 48, 168],
  ["ridge-s", 14, 132],
  ["ridge-e", 12, 96],
  ["bridge-e", 0, 0], // (the Rex Bridge's ends: set below)
  ["bridge-w", 0, 0],
  ["rex-look", 0, 0],
  ["ridge-ne", 8, 30],
  ["rex-north", 0, 0],
];
const EDGES_N: [string, string][] = [
  ["jetty-end", "jetty-base"],
  ["jetty-base", "beach"],
  ["beach", "gate-out"],
  ["gate-out", "gate-in"],
  ["gate-in", "plaza"],
  ["plaza", "plaza-n"],
  ["plaza-n", "lookout-foot"],
  ["lookout-foot", "lookout"],
  ["lookout-foot", "plains-n"],
  ["plains-n", "grove-n"],
  ["grove-n", "plains-far"],
  ["plains-far", "bridge-land"],
  ["bridge-land", "tundra-s"],
  ["tundra-s", "camp"],
  ["camp", "cave"],
  ["cave", "glacier-view"],
  ["glacier-view", "tundra-n"],
  ["tundra-n", "pond"],
  ["pond", "tundra-e"],
  ["tundra-e", "tundra-s"],
  ["grove-n", "plains-w"],
  ["plains-w", "falls"],
  ["falls", "lagoon-e"],
  ["lagoon-e", "river-w"],
  ["river-w", "hide-foot"],
  ["plaza", "hide-foot"],
  ["hide-foot", "hide"],
  ["hide-foot", "ford-n"],
  ["ford-n", "ford-s"],
  ["ford-s", "savanna"],
  ["savanna", "grove-e"],
  ["savanna", "savanna-s"],
  ["grove-e", "nests"],
  ["savanna-s", "nests"],
  ["nests", "swamp-w"],
  ["swamp-w", "swamp-e"],
  ["swamp-e", "dig"],
  ["dig", "volcano-e"],
  ["volcano-e", "ridge-s"],
  ["ridge-s", "ridge-e"],
  ["ridge-e", "bridge-e"],
  ["bridge-e", "bridge-w"],
  ["bridge-w", "rex-look"],
  ["ridge-e", "ridge-ne"],
  ["savanna-s", "ridge-e"],
  ["ridge-ne", "rex-north"],

];

export interface DinoTrailNode {
  id: string;
  x: number;
  z: number;
}
export const DINO_TRAIL: { nodes: DinoTrailNode[]; edges: [number, number][] } = (() => {
  const deck = (id: string) => DINO_DECKS.find((d) => d.id === id)!;
  const fordA = RIVER_L[FORD.i];
  const fordB = RIVER_L[FORD.i + 1];
  const fl = hyp(fordB[0] - fordA[0], fordB[1] - fordA[1]);
  // (straight across the ford, square to the river)
  const fpx = -(fordB[1] - fordA[1]) / fl;
  const fpz = (fordB[0] - fordA[0]) / fl;
  const fix: Record<string, { x: number; z: number }> = {
    lookout: { x: deck("lookout").ax, z: deck("lookout").az },
    "lookout-foot": { x: deck("lookout-ramp").bx, z: deck("lookout-ramp").bz },
    hide: { x: deck("hide").ax, z: deck("hide").az },
    "hide-foot": { x: deck("hide-ramp").bx, z: deck("hide-ramp").bz },
    "rex-look": { x: deck("rex-look").ax, z: deck("rex-look").az },
    "rex-north": { x: deck("rex-north").ax, z: deck("rex-north").az },

    "swamp-w": { x: deck("swamp-w").ax, z: deck("swamp-w").az },
    "swamp-e": { x: deck("swamp-e").bx, z: deck("swamp-e").bz },
    "bridge-e": { x: deck("rexbridge-a").ax, z: deck("rexbridge-a").az },
    "bridge-w": { x: deck("rexbridge-b").bx, z: deck("rexbridge-b").bz },
    "ford-n": W(FORD_C.lx - fpx * (FORD.half + 6), FORD_C.lz - fpz * (FORD.half + 6)),
    "ford-s": W(FORD_C.lx + fpx * (FORD.half + 6), FORD_C.lz + fpz * (FORD.half + 6)),
    cave: { x: X0 + GLACIER.bx + G_UX * 4, z: Z0 + GLACIER.bz + G_UZ * 4 },
  };
  const nodes = NODES_L.map(([id, lx, lz]) => (fix[id] ? { id, ...fix[id] } : { id, ...W(lx, lz) }));
  const ix = (id: string) => {
    const i = nodes.findIndex((n) => n.id === id);
    if (i < 0) throw new Error(`dino: unknown trail node ${id}`);
    return i;
  };
  return { nodes, edges: EDGES_N.map(([a, b]) => [ix(a), ix(b)] as [number, number]) };
})();
export const dinoTrailNode = (id: string) => DINO_TRAIL.nodes[DINO_TRAIL.nodes.findIndex((n) => n.id === id)];
/** half-width (m) of the safari trail: a dirt road the jeeps drive along */
export const DINO_TRAIL_HALF = 2.4;

/** distance (m) from (x, z) (world) to the nearest stretch of the safari trail */
export function dinoTrailDistance(x: number, z: number): number {
  const { nodes, edges } = DINO_TRAIL;
  let best = Infinity;
  for (let k = 0; k < edges.length; k++) {
    const a = nodes[edges[k][0]];
    const b = nodes[edges[k][1]];
    const d = segDist2(x, z, a.x, a.z, b.x, b.z);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// ── where the herds go (their pastures, waterholes, groves and resting woods) ──

export type DinoRealm = "dino" | "ice";
export type DinoZoneKind = "pasture" | "water" | "grove" | "rest" | "home";
export interface DinoZone {
  id: string;
  kind: DinoZoneKind;
  realm: DinoRealm;
  x: number;
  z: number;
  r: number;
}
/** the herds' places (world): open ground (kept free of trees) where a herd grazes, drinks, browses or sleeps */
export const DINO_ZONES: DinoZone[] = (
  [
    // the Great Plains (north) and the river plains
    ["plains-nw", "pasture", "dino", -26, -92, 16],
    ["plains-ne", "pasture", "dino", 28, -102, 13],
    ["plains-far", "pasture", "dino", 14, -112, 12],
    ["plains-mid", "pasture", "dino", 0, -42, 14],
    ["plains-w", "pasture", "dino", -56, -60, 12],
    // the savanna (south of the river) and the cycad scrub
    ["savanna-n", "pasture", "dino", 40, 20, 13],
    ["savanna-e", "pasture", "dino", 60, 66, 12],
    ["savanna-s", "pasture", "dino", 44, 100, 12],
    ["savanna-w", "pasture", "dino", 40, 48, 11],
    // water: the ford, the river banks, the lagoon
    ["ford", "water", "dino", FORD_C.lx, FORD_C.lz, 10],
    ["river-e", "water", "dino", 74, 2, 9],
    ["river-w", "water", "dino", -6, -24, 8],
    ["river-mid", "water", "dino", 10, -26, 8],
    ["river-s", "water", "dino", 50, 10, 7],
    ["lagoon", "water", "dino", LAG.lx + 15, LAG.lz + 5, 8],
    // the long-necks' groves (giant conifers round an open glade)
    ["grove-n", "grove", "dino", -6, -100, 12],
    ["grove-e", "grove", "dino", 56, 38, 12],
    ["grove-s", "grove", "dino", 32, 118, 11],
    ["grove-w", "grove", "dino", -48, -82, 10],
    // resting woods (night)
    ["wood-n", "rest", "dino", -40, -106, 10],
    ["wood-e", "rest", "dino", 62, -24, 9],
    ["wood-s", "rest", "dino", 50, 108, 10],
    // small homes
    ["nests", "home", "dino", 58, 82, 5],
    ["dodo-beach", "home", "dino", 84, 70, 6],
    ["compy-a", "home", "dino", 14, -60, 7],
    ["compy-b", "home", "dino", 40, 140, 7],
    ["jungle-w", "home", "dino", -34, -60, 7],
    ["raptor-a", "home", "dino", -26, -116, 7],
    ["moa", "home", "dino", -12, -124, 7],
    // the Ice Age valley
    ["tundra-e", "pasture", "ice", 38, -190, 13],
    ["tundra-n", "pasture", "ice", 24, -244, 12],
    ["tundra-w", "pasture", "ice", 12, -226, 9],
    ["bridge", "pasture", "ice", 6, -160, 6],
    ["pond", "water", "ice", 46, -213, 6],
    ["spruce-w", "rest", "ice", -30, -224, 8],
    ["spruce-e", "rest", "ice", 58, -232, 7],
    ["sabre-rocks", "home", "ice", 26, -174, 5],
    ["bear-den", "home", "ice", -32, -232, 5],
    ["elk-glade", "home", "ice", 18, -200, 6],
  ] as [string, DinoZoneKind, DinoRealm, number, number, number][]
).map(([id, kind, realm, lx, lz, r]) => ({ id, kind, realm, ...W(lx, lz), r }));
export const dinoZone = (id: string): DinoZone => {
  const z = DINO_ZONES.find((q) => q.id === id);
  if (!z) throw new Error(`dino: unknown zone ${id}`);
  return z;
};
/** which side of the land bridge (world z) belongs to the Ice Age */
export const DINO_ICE_LINE = Z0 - 150;

// ── the island's things ──

export type DinoPropKind =
  | "gate"
  | "torch"
  | "hut"
  | "kiosk"
  | "tower"
  | "hidehut"
  | "platform"
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
  | "cycad"
  | "fern"
  | "bigleaf"
  | "reeds"
  | "swamptree"
  | "flowers"
  | "rock"
  | "boulder"
  | "lavarock"
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
  tower: 0,
  hidehut: 0,
  platform: 0,
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
  cycad: 0.5,
  fern: 0,
  bigleaf: 0,
  reeds: 0,
  swamptree: 0.6,
  flowers: 0,
  rock: 1.0,
  boulder: 2.0,
  lavarock: 0.9,
  snowbush: 0.55,
  icecrystal: 0.8,
  footprints: 0,
  vent: 0,
};

/** the trees, drawn instanced (true size): giant monkey-puzzles, redwoods and spruces, tree ferns, broadleaf ginkgos */
export type DinoTreeKind = "araucaria" | "spire" | "treefern" | "broadleaf";
export interface DinoTree {
  kind: DinoTreeKind;
  x: number;
  z: number;
  y: number;
  rot: number;
  s: number;
  /** a tint variant (0..2) */
  v: number;
  /** snowy (spruces in the Ice Age valley) */
  snow: boolean;
}
/** each tree kind's height (m) at scale 1, and its trunk's obstacle radius */
export const DINO_TREE_H: Record<DinoTreeKind, number> = { araucaria: 60, spire: 58, treefern: 11, broadleaf: 24 };
const TREE_R: Record<DinoTreeKind, number> = { araucaria: 1.5, spire: 1.4, treefern: 0.45, broadleaf: 1.1 };

/** the gate (world): its centre, the way visitors walk in (rot = towards the island), and its half-width */
const GATE_L = { lx: GATE_X, lz: JETTY_Z };
/** the buildings at true size (the storybook models were built for a smaller world) */
export const DINO_BUILD_S = 1.55;
export const DINO_GATE = { ...W(GATE_L.lx, GATE_L.lz), rot: Math.atan2(-NE.x, -NE.z), half: 4.2 * DINO_BUILD_S, y: 3.5, s: DINO_BUILD_S };
export const DINO_PLAZA = { ...W(PLAZA_X, JETTY_Z) };
export const DINO_NESTS = { ...W(58, 82), r: 4.6 };
export const DINO_CAMP = { ...W(-12, -198) };
/** the rim fence round the T-rex's valley: posts every FENCE_STEP m (gaps only where the Rex Bridge's railed deck crosses) */
const FENCE_E = 1 + (GORGE.wall + 3.5) / GORGE.rx;
const FENCE_STEP = 1.3;
export const DINO_FENCE_POSTS: { x: number; z: number }[] = (() => {
  const out: { x: number; z: number }[] = [];
  // walk the fence line (the valley's own wobbly ellipse) in small steps, dropping a post every FENCE_STEP
  const at = (a: number) => {
    // (solve gorgeE = FENCE_E along this ray)
    let lo = 0;
    let hi = 3;
    const sx = Math.sin(a);
    const sz = Math.cos(a);
    for (let k = 0; k < 30; k++) {
      const m = (lo + hi) / 2;
      if (gorgeE(GORGE.lx + sx * GORGE.rx * m, GORGE.lz + sz * GORGE.rz * m) < FENCE_E) lo = m;
      else hi = m;
    }
    return { lx: GORGE.lx + sx * GORGE.rx * lo, lz: GORGE.lz + sz * GORGE.rz * lo };
  };
  // (sample the line finely, then drop posts evenly spaced along it, no more than FENCE_STEP apart)
  const n = 4000;
  const pts = Array.from({ length: n }, (_, k) => at((k / n) * Math.PI * 2));
  const cum = [0];
  for (let k = 1; k <= n; k++) cum.push(cum[k - 1] + hyp(pts[k % n].lx - pts[k - 1].lx, pts[k % n].lz - pts[k - 1].lz));
  const total = cum[n];
  const posts = Math.ceil(total / FENCE_STEP);
  let k = 0;
  for (let i = 0; i < posts; i++) {
    const want = (i / posts) * total;
    while (cum[k + 1] < want) k++;
    const p = pts[k];
    // (no posts across the Rex Bridge's deck: its railings carry on over the gap; nor where the
    // north overlook stands on the fence line: its rail is the fence there)
    if (Math.abs(p.lz - REXB.lz) < 1.35 + 1.15 && p.lx < REXB.x0 && p.lx > REXB.x1) continue;
    if (hyp(p.lx - REX_NORTH.lx, p.lz - REX_NORTH.lz) < REX_NORTH.r + 0.35 + 0.72 + 0.3) continue;
    out.push(W(p.lx, p.lz));
  }
  return out;
})();
export const DINO_FENCE_E = FENCE_E;

function groundAt(x: number, z: number) {
  return dinoDeckY(x, z) ?? dinoLandY(x, z) ?? 0;
}

interface Layout {
  props: DinoProp[];
  trees: DinoTree[];
  extraObstacles: { x: number; z: number; r: number }[];
}

function buildLayout(): Layout {
  const out: DinoProp[] = [];
  const trees: DinoTree[] = [];
  const extra: { x: number; z: number; r: number }[] = [];
  const add = (kind: DinoPropKind, lx: number, lz: number, rot: number, more: Partial<DinoProp> = {}) => {
    const p = W(lx, lz);
    out.push({ kind, x: p.x, z: p.z, y: groundAt(p.x, p.z), rot, s: 1, seed: out.length * 7 + 3, v: 0, ...more });
    return out[out.length - 1];
  };
  const face = (lx: number, lz: number, tx: number, tz: number) => Math.atan2(tx - lx, tz - lz);
  const GR = DINO_GATE.rot;
  const BS = DINO_BUILD_S;

  // ── the visitors' side: the gate, the plaza, the jetty's beach ──
  add("gate", GATE_L.lx, GATE_L.lz, GR, { s: BS });
  // (the gate's two great log towers: obstacles either side of the way through)
  const gx = Math.cos(GR);
  const gz = -Math.sin(GR);
  for (const s of [-1, 1]) {
    extra.push({ ...W(GATE_L.lx + gx * s * (DINO_GATE.half + 1.0 * BS), GATE_L.lz + gz * s * (DINO_GATE.half + 1.0 * BS)), r: 1.3 * BS });
    // (the walls running off into the trees)
    for (let k = 0; k < 4; k++) extra.push({ ...W(GATE_L.lx + gx * s * (DINO_GATE.half + (3.1 + k * 1.6) * BS), GATE_L.lz + gz * s * (DINO_GATE.half + (3.1 + k * 1.6) * BS)), r: 0.82 * BS });
  }
  // torches: on the path up from the beach and round the plaza
  const torchesL: [number, number][] = [
    [GATE_X + 10, JETTY_Z - 4.2],
    [GATE_X + 10, JETTY_Z + 4.2],
    [PLAZA_X + 11, JETTY_Z - 7],
    [PLAZA_X + 11, JETTY_Z + 7],
    [PLAZA_X - 11, JETTY_Z + 8],
    [PLAZA_X - 10, JETTY_Z - 9],
  ];
  for (const [lx, lz] of torchesL) add("torch", lx, lz, 0, { s: 1.25 });
  const PX = PLAZA_X;
  const PZ = JETTY_Z;
  add("hut", PX - 15, PZ + 2, face(PX - 15, PZ + 2, PX, PZ), { s: BS });
  add("kiosk", PX + 8, PZ + 9, face(PX + 8, PZ + 9, PX, PZ), { s: BS });
  add("crates", PX - 12, PZ + 11, 0.3, { s: 1.3 });
  add("bench", PX + 5, PZ - 8, Math.PI, { s: 1.2 });
  add("signpost", PX + 5.5, PZ + 3, 0.4, { s: 1.3 });
  add("signpost", 10, -63, 1.4, { v: 1, s: 1.3 });
  add("signpost", 30, 30, 2.6, { v: 2, s: 1.3 });
  add("signpost", 8, -142, 0.3, { v: 3, s: 1.3 });
  add("signpost", 20, 100, 1.9, { v: 1, s: 1.3 });
  // ── the lookouts and the river hide ──
  const lk = DINO_DECKS.find((d) => d.id === "lookout")!;
  add("tower", lk.ax - X0, lk.az - Z0, Math.PI);
  const hd = DINO_DECKS.find((d) => d.id === "hide")!;
  add("hidehut", hd.ax - X0, hd.az - Z0, face(HIDE.lx, HIDE.lz, FORD_C.lx, FORD_C.lz), { y: hd.ya });
  for (const id of ["rex-look", "rex-north"]) {
    const d = DINO_DECKS.find((q) => q.id === id)!;
    add("platform", d.ax - X0, d.az - Z0, face(d.ax - X0, d.az - Z0, GORGE.lx, GORGE.lz), { y: d.ya });
  }
  // (rails round the high decks, open at the ramp: obstacles so nobody steps off the edge)
  const rim = (deckId: string, rampId: string) => {
    const d = DINO_DECKS.find((q) => q.id === deckId)!;
    const rp = DINO_DECKS.find((q) => q.id === rampId)!;
    const r = d.r!;
    // (open towards the ramp — or the way the deck says)
    const ra = d.open ?? Math.atan2(rp.bx - rp.ax, rp.bz - rp.az);
    const n = Math.round((Math.PI * 2 * (r + 0.35)) / 0.7);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const da = Math.atan2(Math.sin(a - ra), Math.cos(a - ra));
      if (Math.abs(da) < 0.4) continue;
      extra.push({ x: d.ax + Math.sin(a) * (r + 0.35), z: d.az + Math.cos(a) * (r + 0.35), r: 0.4 });
    }
    // (and along the ramp's sides, where it's high off the ground)
    if (rp.kind !== "ramp") return;
    const L = hyp(rp.bx - rp.ax, rp.bz - rp.az);
    const ux = (rp.bx - rp.ax) / L;
    const uz = (rp.bz - rp.az) / L;
    for (let u = 1.4; u < L - 2.5; u += 0.7)
      for (const s of [-1, 1]) extra.push({ x: rp.ax + ux * u + uz * s * (rp.half + 0.4), z: rp.az + uz * u - ux * s * (rp.half + 0.4), r: 0.4 });
  };
  rim("lookout", "lookout-ramp");
  rim("rex-look", "rex-look");
  rim("rex-north", "rex-north");
  // the Rex Bridge's railings: all the way across (over the rim fence's gap)
  for (const id of ["rexbridge-a", "rexbridge-b"]) {
    const d = DINO_DECKS.find((q) => q.id === id)!;
    const L = hyp(d.bx - d.ax, d.bz - d.az);
    const ux = (d.bx - d.ax) / L;
    const uz = (d.bz - d.az) / L;
    for (let u = id.endsWith("-a") ? 1.6 : 0.7; u <= L - (id.endsWith("-b") ? 1.6 : 0.01); u += 0.7)
      for (const s of [-1, 1]) extra.push({ x: d.ax + ux * u + uz * s * (d.half + 0.4), z: d.az + uz * u - ux * s * (d.half + 0.4), r: 0.4 });
  }
  // the rim fence (tall logs) round the T-rex's valley
  for (const p of DINO_FENCE_POSTS) extra.push({ x: p.x, z: p.z, r: 0.72 });
  // T-rex footprints by the rim, a rail fence or two along the trail through the herds' plains
  add("footprints", 16, 108, face(16, 108, 14, 96), { s: 1.5 });
  add("footprints", 10, -70, face(10, -70, 20, -80), { v: 1, s: 1.2 });
  const fences: [number, number, number, number][] = [
    [30, -76, 18, -70],
    [44, 30, 60, 34],
    [-22, -40, -10, -34],
  ];
  for (const [ax, az, bx, bz] of fences) add("fence", (ax + bx) / 2, (az + bz) / 2, face(ax, az, bx, bz), { len: hyp(bx - ax, bz - az) });

  // ── the nests, the dig ──
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    add("nest", DINO_NESTS.x - X0 + Math.sin(a) * 3.4, DINO_NESTS.z - Z0 + Math.cos(a) * 3.4, a, { v: i % 3 });
  }
  add("dig", DIG.lx, DIG.lz, 0.2, { s: 1.15 });
  add("tent", DIG.lx - 9, DIG.lz - 6, face(DIG.lx - 9, DIG.lz - 6, DIG.lx, DIG.lz), { s: 1.3 });
  add("crates", DIG.lx + 8.5, DIG.lz + 3.6, 0.9, { v: 1, s: 1.2 });
  add("ribcage", DIG.lx + 14, DIG.lz + 7, 0.8, { s: 1.8 });

  // ── the Ice Age camp ──
  const C = { lx: DINO_CAMP.x - X0, lz: DINO_CAMP.z - Z0 };
  add("campfire", C.lx, C.lz, 0, { s: 1.2 });
  add("bonehut", C.lx - 6, C.lz - 4, face(C.lx - 6, C.lz - 4, C.lx, C.lz), { s: 1.35 });
  add("bonehut", C.lx + 1.5, C.lz - 7.5, face(C.lx + 1.5, C.lz - 7.5, C.lx, C.lz), { v: 1, s: 1.15 });
  add("rack", C.lx - 4.8, C.lz + 4.5, 0.5, { s: 1.25 });
  // (the tusk arch: walk through it; its tusks' feet and the skull's stone are in the way)
  const sk = add("skull", C.lx + 6, C.lz - 1.8, face(C.lx + 6, C.lz - 1.8, C.lx + 8, C.lz + 4), { s: 1.3 });
  const toW = (lx: number, lz: number) => ({ x: sk.x + (lx * Math.cos(sk.rot) + lz * Math.sin(sk.rot)) * sk.s, z: sk.z + (-lx * Math.sin(sk.rot) + lz * Math.cos(sk.rot)) * sk.s });
  for (const q of [toW(-1.7, 0), toW(1.7, 0)]) extra.push({ ...q, r: 0.5 });
  extra.push({ ...toW(2.6, 0.6), r: 0.8 });
  add("paintrock", C.lx - 12, C.lz + 2, face(C.lx - 12, C.lz + 2, C.lx, C.lz), { s: 1.3 });

  // ── the volcano's hot spots: steaming vents ──
  const V = VOLC;
  for (const [a, k] of [
    [0.9, 0.55],
    [2.2, 0.6],
    [-2.6, 0.5],
    [-0.3, 0.45],
  ] as [number, number][])
    add("vent", V.lx + Math.sin(a) * V.r * (1 - k), V.lz + Math.cos(a) * V.r * (1 - k), a, { s: 1.5 });
  // (the lava lake: nobody walks in)
  extra.push({ x: X0 + V.lx, z: Z0 + V.lz, r: DINO_VOLCANO.lavaR + 0.4 });

  // the sabre-cats' rocks (they lounge on top), the cave bears' boulders
  const SB = dinoZone("sabre-rocks");
  add("boulder", SB.x - X0 + 2, SB.z - Z0 - 3.2, 0.4, { s: 1.15, v: 7 });
  add("boulder", SB.x - X0 - 4.4, SB.z - Z0 + 1.6, 1.9, { s: 0.9, v: 7 });
  const BD = dinoZone("bear-den");
  add("boulder", BD.x - X0 - 5, BD.z - Z0 - 2, 1.2, { s: 1.3, v: 6 });
  // ── nature: seeded scatter by biome (kept off the trail, the decks, the herds' places, the water) ──
  const rnd = dinoRng(4242);
  const discs = out.filter((p) => PROP_R[p.kind] > 0).map((p) => ({ x: p.x, z: p.z, r: PROP_R[p.kind] * p.s }));
  for (const o of extra) discs.push(o);
  // (big things with no obstacle radius still keep trees away)
  discs.push(
    { x: X0 + GLACIER.bx + G_UX * 7, z: Z0 + GLACIER.bz + G_UZ * 7, r: 9 },
    { ...W(GATE_L.lx, GATE_L.lz), r: 12 },
    { ...W(DIG.lx, DIG.lz), r: DIG.r + 2 },
    { ...DINO_PLAZA, r: 17 },
    { x: DINO_CAMP.x, z: DINO_CAMP.z, r: 13 },
    { ...DINO_NESTS, r: 9 },
  );
  // (trees: their own spacing grid, so the scatter stays quick)
  const keepOpen = DINO_ZONES;
  const deckNear = (x: number, z: number, pad: number) => DINO_DECKS.some((d) => segDist2(x, z, d.ax, d.az, d.bx, d.bz) < ((d.r ?? d.half) + pad + 0.6) ** 2);
  const clearOf = (x: number, z: number, pad: number, open: number) =>
    discs.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 > (t.r + pad) ** 2) &&
    dinoDeckY(x, z) === null &&
    !deckNear(x, z, pad) &&
    dinoTrailDistance(x, z) > pad + DINO_TRAIL_HALF + 0.6 &&
    dinoWaterAt(x, z) === null &&
    keepOpen.every((q) => (q.x - x) ** 2 + (q.z - z) ** 2 > (q.r * open + 1.5) ** 2);
  /** the land is fine for a plant here (dry, not in the crater, the valley, on ice, too steep) */
  const landOk = (lx: number, lz: number, minY = 1.4) => {
    const y = dinoLandY(X0 + lx, Z0 + lz);
    if (y === null || y < minY) return false;
    if (hyp(lx - V.lx, lz - V.lz) < V.r * 0.45) return false;
    if (gorgeE(lx, lz) < FENCE_E + 0.12) return false;
    const g = glacierAt(lx, lz);
    if (g && g.q < g.w + 1.5) return false;
    if (inCave(lx, lz)) return false;
    if (shoreL(lx, lz) > -3) return false;
    // (not on a cliff: the ground round it is level enough)
    const e = 1.2;
    const sl = Math.max(Math.abs((dinoLandY(X0 + lx + e, Z0 + lz) ?? y) - y), Math.abs((dinoLandY(X0 + lx, Z0 + lz + e) ?? y) - y)) / e;
    return sl < 0.75;
  };
  const tryPlace = (kind: DinoPropKind, lx: number, lz: number, pad: number, more: Partial<DinoProp> = {}, open = 1) => {
    const p = W(lx, lz);
    if (!landOk(lx, lz)) return false;
    if (!clearOf(p.x, p.z, pad, open)) return false;
    add(kind, lx, lz, rnd() * Math.PI * 2, more);
    const r = PROP_R[kind] * (more.s ?? 1);
    if (r > 0) discs.push({ x: p.x, z: p.z, r });
    return true;
  };
  const tryTree = (kind: DinoTreeKind, lx: number, lz: number, s: number, pad: number, open = 1, snow = false) => {
    const p = W(lx, lz);
    if (!landOk(lx, lz, 1.6)) return false;
    // (a big tree needs the whole crown's footprint out of the way of the trail and the decks)
    if (!clearOf(p.x, p.z, pad, open)) return false;
    trees.push({ kind, x: p.x, z: p.z, y: dinoLandY(p.x, p.z)! - 0.2, rot: rnd() * Math.PI * 2, s, v: Math.floor(rnd() * 3), snow });
    discs.push({ x: p.x, z: p.z, r: TREE_R[kind] * s });
    return true;
  };
  const snowAt = (lx: number, lz: number) => dinoSnowL(lx, lz);
  const volK = (lx: number, lz: number) => 1 - hyp(lx - V.lx, lz - V.lz) / V.r; // (> 0 on the volcano)

  // the long-necks' groves: a ring of giant monkey-puzzles and redwoods round each grove's glade,
  // with young monkey-puzzles (the browse trees: their crowns at a brachiosaur's head height) inside
  for (const g of DINO_ZONES.filter((q) => q.kind === "grove")) {
    const gl = { lx: g.x - X0, lz: g.z - Z0 };
    for (let i = 0, n = 0; i < 40 && n < 6; i++) {
      const a = (i / 40) * Math.PI * 2 * 3 + rnd() * 0.4;
      const rr = g.r + 12 + rnd() * 18;
      const giant = rnd() < 0.6;
      if (tryTree(giant ? "araucaria" : "spire", gl.lx + Math.sin(a) * rr, gl.lz + Math.cos(a) * rr, giant ? 0.85 + rnd() * 0.4 : 0.85 + rnd() * 0.42, 8, 0.7)) n++;
    }
    for (let i = 0, n = 0; i < 80 && n < 5; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = g.r + 3 + rnd() * 8;
      if (tryTree("araucaria", gl.lx + Math.sin(a) * rr, gl.lz + Math.cos(a) * rr, 0.3 + rnd() * 0.1, 4.5, 0.6)) n++;
    }
  }
  /** the jungle: warm land, dense round the lagoon and plateau, the swamp, the volcano's feet, and by the gate */
  const jungle = (lx: number, lz: number) => {
    if (snowAt(lx, lz) > 0.2 || volK(lx, lz) > 0.42) return 0;
    const falls = 1 - smooth(18, 40, hyp(lx - PLATEAU.lx - 10, lz - PLATEAU.lz));
    const swamp = 1 - smooth(20, 40, hyp(lx - SWAMP.lx, lz - SWAMP.lz));
    const gate = 1 - smooth(14, 30, hyp(lx - 74, lz + 34));
    const foot = volK(lx, lz) > -0.3 ? 0.8 : 0;
    const coast = smooth(-26, -12, shoreL(lx, lz)) * 0.38;
    return Math.min(1, Math.max(falls, swamp, gate, foot, coast) + (noise(lx / 14, lz / 14, 41) - 0.5) * 0.5);
  };
  /** the conifer woods: the ridge's slopes, the west, the resting woods, the Ice Age spruces */
  const woods = (lx: number, lz: number) => {
    if (snowAt(lx, lz) > 0.3) return 0.85;
    const ridge = smooth(1.55, 1.0, ridgeE(lx, lz)) * (gorgeE(lx, lz) > FENCE_E + 0.25 ? 0.65 : 0);
    const west = smooth(-30, -70, lx) * (1 - smooth(60, 120, lz));
    const rest = DINO_ZONES.some((q) => q.kind === "rest" && hyp(q.x - X0 - lx, q.z - Z0 - lz) < q.r + 14) ? 0.8 : 0;
    return Math.min(1, Math.max(ridge, west, rest) + (noise(lx / 17, lz / 17, 43) - 0.5) * 0.45);
  };
  const plains = (lx: number, lz: number) => (snowAt(lx, lz) < 0.2 && volK(lx, lz) < 0.2 && jungle(lx, lz) < 0.4 && woods(lx, lz) < 0.4 ? 1 : 0);
  /** the wide open country where the herds are seen from afar: no woods here, a lone tree at most */
  const open = (lx: number, lz: number) => Math.max(
    1 - smooth(0.8, 1.1, hyp((lx - 2) / 66, (lz + 84) / 40)), // the Great Plains (north)
    1 - smooth(0.8, 1.1, hyp((lx - 6) / 40, (lz + 40) / 18)), // the plains by the river
    1 - smooth(0.8, 1.1, hyp((lx - 50) / 30, (lz - 52) / 48)), // the savanna (south of the river)
    1 - smooth(0.8, 1.1, hyp((lx - 26) / 30, (lz + 210) / 34)), // the mammoth tundra
  );
  const scatterTrees = (kind: DinoTreeKind, count: number, pad: number, biome: (lx: number, lz: number) => number, s0: number, s1: number, snowy = false) => {
    let n = 0;
    for (let k = 0; k < count * 60 && n < count; k++) {
      const lx = DINO_GX0 + 10 + rnd() * (DINO_GX1 - DINO_GX0 - 20);
      const lz = DINO_GZ0 + 10 + rnd() * (DINO_GZ1 - DINO_GZ0 - 20);
      if (shoreL(lx, lz) > -6) continue;
      if (rnd() > biome(lx, lz) * (1 - open(lx, lz) * 0.97)) continue;
      const snow = snowy && snowAt(lx, lz) > 0.3;
      if (tryTree(kind, lx, lz, s0 + rnd() * (s1 - s0), pad, 1, snow)) n++;
    }
  };
  // giants in the woods (and a few lone ones out on the plains: landmarks for miles)
  scatterTrees("araucaria", 20, 9, (lx, lz) => (snowAt(lx, lz) > 0.2 ? 0 : woods(lx, lz) * 0.6 + plains(lx, lz) * 0.02 + jungle(lx, lz) * 0.12), 0.8, 1.25);
  scatterTrees("spire", 24, 8, (lx, lz) => (snowAt(lx, lz) > 0.2 ? 0 : woods(lx, lz) * 0.7), 0.8, 1.3);
  // spruces in the Ice Age valley
  scatterTrees("spire", 46, 4, (lx, lz) => smooth(0.35, 0.8, snowAt(lx, lz)) * (0.35 + 0.65 * smooth(20, 45, hyp(lx - ICE.lx - 12, lz - ICE.lz - 8))), 0.36, 0.55, true);
  scatterTrees("broadleaf", 40, 4, (lx, lz) => jungle(lx, lz) * 0.9 + woods(lx, lz) * 0.15 * (snowAt(lx, lz) > 0.2 ? 0 : 1), 0.7, 1.15);
  scatterTrees("treefern", 120, 2.4, (lx, lz) => (snowAt(lx, lz) > 0.15 ? 0 : Math.max(jungle(lx, lz), smooth(-22, -10, shoreL(lx, lz)) * 0.55, woods(lx, lz) * 0.25)), 0.7, 1.15);

  // the understorey (static props)
  type Rule = [DinoPropKind, number, number, (lx: number, lz: number) => number, [number, number]];
  const rules: Rule[] = [
    ["cycad", 52, 1.6, (lx, lz) => Math.max(jungle(lx, lz) * 0.6, plains(lx, lz) * 0.3, woods(lx, lz) * 0.2 * (snowAt(lx, lz) > 0.2 ? 0 : 1)), [1.2, 2.0]],
    ["bigleaf", 36, 1.3, (lx, lz) => jungle(lx, lz), [1.0, 1.6]],
    ["fern", 70, 1.0, (lx, lz) => Math.max(jungle(lx, lz), plains(lx, lz) * 0.12, woods(lx, lz) * 0.3 * (snowAt(lx, lz) > 0.2 ? 0 : 1)), [1.0, 1.7]],
    ["flowers", 34, 0.6, (lx, lz) => Math.max(jungle(lx, lz) * 0.4, plains(lx, lz) * 0.25), [1.0, 1.4]],
    ["lavarock", 18, 1.6, (lx, lz) => (volK(lx, lz) > 0.15 && volK(lx, lz) < 0.6 ? 1 : 0), [1.0, 1.9]],
    ["rock", 24, 1.8, (lx, lz) => (snowAt(lx, lz) < 0.3 ? 0.35 : 0), [0.8, 1.7]],
    ["snowbush", 24, 1.0, (lx, lz) => smooth(0.4, 0.9, snowAt(lx, lz)), [1.0, 1.5]],
    ["boulder", 14, 2.6, (lx, lz) => smooth(0.5, 0.9, snowAt(lx, lz)), [0.8, 1.3]],
    ["icecrystal", 12, 1.4, (lx, lz) => (snowAt(lx, lz) > 0.85 && hyp(lx - GLACIER.bx, lz - GLACIER.bz) < 30 ? 1 : 0), [0.8, 1.5]],
  ];
  for (const [kind, count, pad, biome, [s0, s1]] of rules) {
    let n = 0;
    for (let k = 0; k < count * 50 && n < count; k++) {
      const lx = DINO_GX0 + 10 + rnd() * (DINO_GX1 - DINO_GX0 - 20);
      const lz = DINO_GZ0 + 10 + rnd() * (DINO_GZ1 - DINO_GZ0 - 20);
      if (shoreL(lx, lz) > -5) continue;
      if (rnd() > biome(lx, lz)) continue;
      if (tryPlace(kind, lx, lz, pad, { s: s0 + rnd() * (s1 - s0), v: Math.floor(rnd() * 3) })) n++;
    }
  }
  // down on the T-rex's valley floor: giant ferns, and horsetails round its pool (nothing in its way)
  for (let k = 0, n = 0; k < 400 && n < 22; k++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 0.8;
    const lx = GORGE.lx + Math.sin(a) * GORGE.rx * r;
    const lz = GORGE.lz + Math.cos(a) * GORGE.rz * r;
    if (poolE(lx, lz) < 1.6 || dinoWaterAt(X0 + lx, Z0 + lz) !== null) continue;
    add("fern", lx, lz, rnd() * Math.PI * 2, { s: 1.6 + rnd() * 0.9, v: Math.floor(rnd() * 3) });
    n++;
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + rnd() * 0.3;
    add("reeds", GPOOL.lx + Math.sin(a) * GPOOL.rx * 1.1, GPOOL.lz + Math.cos(a) * GPOOL.rz * 1.1, rnd() * Math.PI * 2, { s: 1.3 + rnd() * 0.5, v: 1 });
  }
  // the swamp: bald cypress trees round its edge (and on its hummocks), reeds and horsetails
  for (let k = 0, n = 0; k < 500 && n < 14; k++) {
    const a = rnd() * Math.PI * 2;
    const e = 0.95 + rnd() * 0.45;
    const c = Math.cos(SWAMP.rot);
    const s = Math.sin(SWAMP.rot);
    const u = Math.sin(a) * SWAMP.rx * e;
    const v = Math.cos(a) * SWAMP.rz * e;
    const lx = SWAMP.lx + u * c + v * s;
    const lz = SWAMP.lz - u * s + v * c;
    const p = W(lx, lz);
    if (dinoDeckY(p.x, p.z) !== null || deckNear(p.x, p.z, 1.6)) continue;
    if (!discs.every((t) => (t.x - p.x) ** 2 + (t.z - p.z) ** 2 > (t.r + 2.2) ** 2) || dinoTrailDistance(p.x, p.z) < DINO_TRAIL_HALF + 1.5) continue;
    if (!keepOpen.every((q) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2 > (q.r + 1.5) ** 2)) continue;
    add("swamptree", lx, lz, rnd() * Math.PI * 2, { s: 1.5 + rnd() * 0.6, v: Math.floor(rnd() * 3) });
    discs.push({ x: p.x, z: p.z, r: PROP_R.swamptree * out[out.length - 1].s });
    n++;
  }
  for (let k = 0, n = 0; k < 500 && n < 20; k++) {
    const a = rnd() * Math.PI * 2;
    const e = 0.7 + rnd() * 0.55;
    const c = Math.cos(SWAMP.rot);
    const s = Math.sin(SWAMP.rot);
    const lx = SWAMP.lx + Math.sin(a) * SWAMP.rx * e * c + Math.cos(a) * SWAMP.rz * e * s;
    const lz = SWAMP.lz - Math.sin(a) * SWAMP.rx * e * s + Math.cos(a) * SWAMP.rz * e * c;
    const p = W(lx, lz);
    if (deckNear(p.x, p.z, 0.2)) continue;
    add("reeds", lx, lz, rnd() * Math.PI * 2, { s: 1.1 + rnd() * 0.6, v: Math.floor(rnd() * 2) });
    n++;
  }
  // reeds along the river's banks (not at the ford: the herds cross there) and round the lagoon
  for (let k = 0, n = 0; k < 400 && n < 22; k++) {
    const i = Math.floor(rnd() * (RIVER_L.length - 2));
    const t = rnd();
    const [ax, az] = RIVER_L[i];
    const [bx, bz] = RIVER_L[i + 1];
    const L = hyp(bx - ax, bz - az);
    const side = rnd() < 0.5 ? -1 : 1;
    const lx0 = lerp(ax, bx, t);
    const lz0 = lerp(az, bz, t);
    if (hyp(lx0 - FORD_C.lx, lz0 - FORD_C.lz) < FORD.len + 8) continue;
    const off = RIVER_HALF + 1.0 + rnd() * 1.6;
    const lx = lx0 - ((bz - az) / L) * side * off;
    const lz = lz0 + ((bx - ax) / L) * side * off;
    const p = W(lx, lz);
    if (deckNear(p.x, p.z, 1.2) || dinoTrailDistance(p.x, p.z) < DINO_TRAIL_HALF + 0.5 || shoreL(lx, lz) > -4) continue;
    if (!keepOpen.every((q) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2 > (q.r * 0.8) ** 2)) continue;
    add("reeds", lx, lz, rnd() * Math.PI * 2, { s: 1.0 + rnd() * 0.5, v: 1 });
    n++;
  }
  return { props: out, trees, extraObstacles: extra };
}

const LAYOUT = buildLayout();
export const DINO_PROPS: DinoProp[] = LAYOUT.props;
export const DINO_TREES: DinoTree[] = LAYOUT.trees;

/** round things to walk around (buildings, trees, rocks, the rim fence, the gate towers, deck rails, the lava lake) */
export const DINO_OBSTACLES: { x: number; z: number; r: number }[] = [
  ...DINO_PROPS.filter((p) => PROP_R[p.kind] > 0).map((p) => ({ x: p.x, z: p.z, r: PROP_R[p.kind] * p.s })),
  ...DINO_TREES.map((t) => ({ x: t.x, z: t.z, r: TREE_R[t.kind] * t.s })),
  ...LAYOUT.extraObstacles,
];

/** the torches (world x/z and the flame's height): they burn at dusk and by night */
export const DINO_TORCHES: { x: number; z: number; y: number }[] = [
  ...DINO_PROPS.filter((p) => p.kind === "torch").map((p) => ({ x: p.x, z: p.z, y: p.y + 2.6 * p.s })),
  // (the gate's two torches, high on its towers)
  ...[-1, 1].map((s) => ({ x: DINO_GATE.x + Math.cos(DINO_GATE.rot) * s * (DINO_GATE.half + 1.0 * DINO_BUILD_S), z: DINO_GATE.z - Math.sin(DINO_GATE.rot) * s * (DINO_GATE.half + 1.0 * DINO_BUILD_S), y: DINO_GATE.y + 8.6 * DINO_BUILD_S })),
];
/** the height (above the gate's ground) of the "DINO ISLE" sign's middle */
export const DINO_GATE_SIGN_Y = 6.4 * DINO_BUILD_S;

/** the safari jeeps' parking (world): beside the trail at the plaza (rideable "car"s, see registry/rideables) */
export const DINO_JEEPS: { id: string; x: number; z: number; yaw: number; y: number }[] = (() => {
  const out: { id: string; x: number; z: number; yaw: number; y: number }[] = [];
  const a = dinoTrailNode("plaza");
  const b = dinoTrailNode("plaza-n");
  const L = hyp(b.x - a.x, b.z - a.z);
  const ux = (b.x - a.x) / L;
  const uz = (b.z - a.z) / L;
  const yaw = Math.atan2(ux, uz);
  // (side by side along the trail's edge, just off it, nose up the trail)
  for (let u = 3; u < L - 2 && out.length < 2; u += 1)
    for (const off of [DINO_TRAIL_HALF + 3.2, -(DINO_TRAIL_HALF + 3.2)]) {
      if (out.length >= 2) break;
      const x = a.x + ux * u + uz * off;
      const z = a.z + uz * u - ux * off;
      const y = dinoGroundY(x, z);
      if (y === null || y < 1.6) continue;
      if (DINO_OBSTACLES.some((o) => hyp(o.x - x, o.z - z) < o.r + 3)) continue;
      if (out.some((q) => hyp(q.x - x, q.z - z) < 4.5)) continue;
      if ([[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dz]) => Math.abs((dinoGroundY(x + dx, z + dz) ?? -9) - y) > 0.5)) continue;
      out.push({ id: `jeep-dino-${out.length + 1}`, x, z, yaw, y });
    }
  return out;
})();

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
  | "waterfall"
  | "ford"
  | "grove"
  | "landbridge"
  | "plains";

export const DINO_SPOTS: { id: string; name: string; x: number; z: number; kind: DinoSpotKind }[] = (() => {
  const n = (id: string) => dinoTrailNode(id);
  const at = (id: string, dx = 0, dz = 0) => ({ x: n(id).x + dx, z: n(id).z + dz });
  const deck = (id: string) => DINO_DECKS.find((d) => d.id === id)!;
  const br = deck("rexbridge-a");
  return [
    { id: "dino-gate", name: "Dino Isle Gate", ...at("gate-in", -1, 2), kind: "gate" },
    { id: "dino-beach", name: "Arrival Beach", ...at("beach"), kind: "beach" },
    { id: "dino-plaza", name: "Safari Base", ...at("plaza", -2, -3), kind: "plains" },
    { id: "dino-dodo-beach", name: "Dodo Beach", ...W(88, 64), kind: "beach" },
    { id: "dino-paddock", name: "Rex Bridge", x: br.bx, z: br.bz, kind: "paddock" },
    { id: "dino-rex-look", name: "Rex Lookout", x: deck("rex-look").ax, z: deck("rex-look").az, kind: "lookout" },
    { id: "dino-rex-north", name: "Rex Ridge Overlook", x: deck("rex-north").ax, z: deck("rex-north").az, kind: "lookout" },
    { id: "dino-lookout", name: "Plains Lookout", x: deck("lookout").ax, z: deck("lookout").az, kind: "lookout" },
    { id: "dino-hide", name: "River Hide", x: deck("hide").ax, z: deck("hide").az, kind: "ford" },
    { id: "dino-ford", name: "Big Splash Ford", ...at("ford-n", 0, 0), kind: "ford" },
    { id: "dino-plains", name: "Great Plains", ...at("plains-n"), kind: "plains" },
    { id: "dino-grove", name: "Giant Grove", ...at("grove-e"), kind: "grove" },
    { id: "dino-grove-n", name: "Monkey-Puzzle Grove", ...at("grove-n"), kind: "grove" },
    { id: "dino-landbridge", name: "Land Bridge", ...at("bridge-land"), kind: "landbridge" },
    { id: "dino-nests", name: "Dino Nests", ...at("nests"), kind: "nests" },
    { id: "dino-dig", name: "Fossil Dig", ...at("dig"), kind: "dig" },
    { id: "dino-volcano", name: "Mount Rumble", ...at("volcano-e"), kind: "volcano" },
    { id: "dino-lagoon", name: "Waterfall Lagoon", ...at("lagoon-e"), kind: "lagoon" },
    { id: "dino-waterfall", name: "Thunder Falls", ...at("falls"), kind: "waterfall" },
    { id: "dino-swamp", name: "Steamy Swamp", x: (n("swamp-w").x + n("swamp-e").x) / 2, z: (n("swamp-w").z + n("swamp-e").z) / 2, kind: "swamp" },
    { id: "dino-glacier", name: "Great Glacier", ...at("glacier-view"), kind: "glacier" },
    { id: "dino-icecave", name: "Ice Cave", ...at("cave"), kind: "icecave" },
    { id: "dino-camp", name: "Mammoth-Bone Camp", ...at("camp"), kind: "camp" },
    { id: "dino-pond", name: "Frozen Pond", ...at("pond"), kind: "pond" },
    { id: "dino-tundra", name: "Mammoth Tundra", ...at("tundra-e"), kind: "plains" },
  ];
})();

/** what the kid discovers at each spot (real, kid-sized facts) */
export const DINO_SPOT_FACTS: Record<string, string> = {
  "dino-gate": "Welcome to Dino Isle! Dinosaurs lived on Earth for over 160 million years.",
  "dino-beach": "Ahoy! Look for dinosaurs, flying reptiles and Ice Age giants — all on one island.",
  "dino-plaza": "Safari Base! Hop in a jeep and drive the safari trail. Stay on the trail!",
  "dino-dodo-beach": "Dodos lived only on the island of Mauritius. The last one was seen in 1662.",
  "dino-paddock": "Look down! The T-rex roams its valley below. T. rex teeth were as big as bananas!",
  "dino-rex-look": "T. rex could smell food from far away — its nose was super powerful!",
  "dino-rex-north": "Rex Ridge! A T. rex was as heavy as an elephant — about 8 tonnes.",
  "dino-lookout": "Up here you can see the herds! Many plant-eating dinosaurs lived in groups to stay safe.",
  "dino-hide": "Shh! Hides let scientists watch wild animals without scaring them.",
  "dino-ford": "Herds cross rivers at shallow fords — fossil footprints show dinosaurs did too!",
  "dino-plains": "Grass didn't cover the plains yet! Dinosaurs walked on ferns and low plants.",
  "dino-grove": "Monkey-puzzle trees grew in the age of dinosaurs — and still grow today!",
  "dino-grove-n": "Long-necks browsed treetops, like giraffes do today, but 3 times as tall.",
  "dino-landbridge": "In the Ice Age, seas were lower, and land bridges let animals walk to new lands.",
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
  "dino-tundra": "Mammoth herds were led by a wise old grandmother, just like elephants today.",
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
  | "raptor"
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
  raptor: { name: "Swiftclaw pack", era: "dino", fact: "Raptors had feathers like birds! They hunted in packs and ran really fast." },
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
const CALM_IN = 10;
const CALM_OUT = 62;
/** 0.12 right by the island .. 1 out at sea */
export function dinoCalm(x: number, z: number): number {
  const d = spineSD(x - X0, z - Z0);
  const u = Math.min(1, Math.max(0, (d - CALM_IN) / (CALM_OUT - CALM_IN)));
  return 0.12 + 0.88 * u * u * (3 - 2 * u);
}
/** the same in GLSL: float dinoCalm( vec2 p ) (the spine's smooth union, unrolled) */
export const DINO_CALM_GLSL = (() => {
  const f = (v: number) => v.toFixed(2);
  const lines: string[] = [];
  for (let i = 0; i < SEGS; i++) {
    const [ax, az, ar] = SPINE[i];
    const [bx, bz, br] = SPINE[i + 1];
    const e = `dinoSeg( q, vec2( ${f(ax)}, ${f(az)} ), vec2( ${f(bx)}, ${f(bz)} ), ${f(ar)}, ${f(br)} )`;
    lines.push(i === 0 ? `float d = ${e};` : `d = dinoSmin( d, ${e} );`);
  }
  return `
  float dinoSeg( vec2 p, vec2 a, vec2 b, float ra, float rb ) {
    vec2 ab = b - a; float t = clamp( dot( p - a, ab ) / dot( ab, ab ), 0.0, 1.0 );
    return length( a + ab * t - p ) - mix( ra, rb, t );
  }
  float dinoSmin( float a, float b ) { float h = max( 26.0 - abs( a - b ), 0.0 ) / 26.0; return min( a, b ) - h * h * 6.5; }
  float dinoCalm( vec2 p ) {
    vec2 q = p - vec2( ${f(X0)}, ${f(Z0)} );
    if ( q.x < ${f(DINO_GX0 - 80)} || q.x > ${f(DINO_GX1 + 80)} || q.y < ${f(DINO_GZ0 - 80)} || q.y > ${f(DINO_GZ1 + 80)} ) return 1.0;
    ${lines.join("\n    ")}
    return 0.12 + 0.88 * smoothstep( ${f(CALM_IN)}, ${f(CALM_OUT)}, d );
  }`;
})();

/** the island's bounding radius (m) from its centre (the whole footprint): for culling */
export const DINO_SEA_R = (() => {
  let r = 0;
  for (const p of dinoOutline(DINO_SEA_PAD, 160)) r = Math.max(r, hyp(p.x - X0, p.z - Z0));
  return Math.ceil(r + 4);
})();
