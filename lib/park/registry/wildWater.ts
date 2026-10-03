// The Wildlands' great waterway, far out from the park: the Great Falls pour ~27 m off a rocky shelf
// on the Great Ridge's south-east flank into a deep plunge pool; the Wild River winds out of it
// across the foothills and the plains in a broad green valley to the Great Lake (~420 units across,
// sandy shallows round a deep blue middle); and the lake's outlet runs on south to the sea. Every
// stretch sits at the sea's level (like the park's own river and lake: swimming, the under-water
// camera and the fish all just work), its bed carved into the terrain (terrain.ts: wildCarveY) and
// its valley sloping gently up to the land round it. The rainforest grows round the falls and along
// the upper river (wildRainforestK). Pure maths + lazily baked tiles (only where something asks),
// deterministic, no three.js — the park's registry (./waterways.ts) answers for both.
import { cumLength, nearestOnPolyline, smooth, smoothstep, type P2 } from "./geom2d";

/** the sea's surface height (kept in step with terrain.ts WATER_Y) */
const WL = -0.25;

// ── the Great Falls: a rocky shelf on the ridge's flank, the lip, the pool below ──
export const WILD_SHELF = { x: 965, z: -805, top: 44 } as const;
/** the shelf's outline radius toward heading a (atan2(dx, dz) from its centre) */
export function wildShelfRadius(a: number): number {
  return 44 + 5 * Math.sin(3 * a + 0.7) + 3 * Math.sin(5 * a + 2.1);
}
/** the falls pour off the shelf's south-east side, toward the plains */
const FALLS_A = 0.83;
const lipR = wildShelfRadius(FALLS_A) - 0.8;
/** the pool at the foot of the cliff, right where the water lands */
const POOL_R = 19;
const POOL_C = { x: WILD_SHELF.x + Math.sin(FALLS_A) * (lipR + 5 + POOL_R * 0.55), z: WILD_SHELF.z + Math.cos(FALLS_A) * (lipR + 5 + POOL_R * 0.55) };
export const WILD_FALLS = {
  lip: { x: WILD_SHELF.x + Math.sin(FALLS_A) * lipR, z: WILD_SHELF.z + Math.cos(FALLS_A) * lipR, y: WILD_SHELF.top - 1.4 },
  heading: FALLS_A,
  width: 16,
  widthBottom: 22,
  pool: { x: POOL_C.x, z: POOL_C.z, r: POOL_R },
  /** where the spring rises on the shelf (the channel runs from here to the lip) */
  spring: { x: WILD_SHELF.x + Math.sin(FALLS_A) * 8, z: WILD_SHELF.z + Math.cos(FALLS_A) * 8 },
} as const;
/** how wide the shelf's cliff band is (steepest where the falls pour over) */
function shelfCliff(a: number): number {
  // (sheer where the falls pour over, so the water clears the rock all the way down)
  const toFalls = Math.cos(a - FALLS_A);
  return 9 - 7.4 * smoothstep(0.82, 0.97, toFalls);
}
/** signed distance (approximate, radial) from the shelf's top edge: < 0 on top */
export function wildShelfEdgeDist(x: number, z: number): number {
  const dx = x - WILD_SHELF.x;
  const dz = z - WILD_SHELF.z;
  return Math.hypot(dx, dz) - wildShelfRadius(Math.atan2(dx, dz));
}

// ── the Wild River: the pool to the lake ──
const RIVER_CTRL: P2[] = [
  [POOL_C.x + Math.sin(FALLS_A) * 12, POOL_C.z + Math.cos(FALLS_A) * 12],
  [1072, -700],
  [1100, -672],
  [1126, -646],
  [1150, -598],
  [1188, -560],
  [1214, -514],
  [1252, -486],
  [1278, -446],
];
export const WILD_RIVER_POINTS: P2[] = smooth(RIVER_CTRL, 4);
const riverLen = cumLength(WILD_RIVER_POINTS);
export const WILD_RIVER_LENGTH = riverLen[riverLen.length - 1];
/** the river's half width at distance s along it: a broad river, wider at its mouths */
export function wildRiverHalfWidth(s: number): number {
  const u = s / WILD_RIVER_LENGTH;
  return 8 + 1.2 * Math.sin(s * 0.03 + 0.4) + 0.6 * Math.sin(s * 0.11) + 2.5 * (1 - smoothstep(0, 0.1, u)) + 3 * smoothstep(0.85, 1, u);
}

// ── the Great Lake ──
export const WILD_LAKE = { x: 1420, z: -330 } as const;
/** the lake's shore radius toward heading a (atan2 from its centre): ~420 across, with bays */
export function wildLakeRadius(a: number): number {
  return 210 + 18 * Math.sin(2 * a + 0.9) + 11 * Math.sin(5 * a + 2.2) + 5 * Math.sin(9 * a + 0.3);
}
export const WILD_LAKE_OUTLINE: P2[] = Array.from({ length: 160 }, (_, k) => {
  const a = (k / 160) * Math.PI * 2;
  const r = wildLakeRadius(a);
  return [WILD_LAKE.x + Math.sin(a) * r, WILD_LAKE.z + Math.cos(a) * r] as P2;
});

// ── the outlet: the lake to the sea, south ──
const OUTLET_START = (() => {
  const a = Math.PI * 0.03;
  const r = wildLakeRadius(a) - 6;
  return [WILD_LAKE.x + Math.sin(a) * r, WILD_LAKE.z + Math.cos(a) * r] as P2;
})();
const OUTLET_CTRL: P2[] = [OUTLET_START, [1446, -40], [1436, 70], [1404, 170], [1376, 280], [1350, 390], [1324, 500], [1312, 600], [1306, 700]];
export const WILD_OUTLET_POINTS: P2[] = smooth(OUTLET_CTRL, 4);
const outletLen = cumLength(WILD_OUTLET_POINTS);
export const WILD_OUTLET_LENGTH = outletLen[outletLen.length - 1];
function outletHalfWidth(s: number): number {
  const u = s / WILD_OUTLET_LENGTH;
  return 7 + 0.8 * Math.sin(s * 0.04 + 1.1) + 2 * (1 - smoothstep(0, 0.08, u)) + 4 * smoothstep(0.9, 1, u);
}

/** the box everything (valley and all) sits in */
export const WILD_WATER_BOUNDS = { x0: 880, x1: 1700, z0: -900, z1: 720 } as const;
/** body ids (the same as the park's WATER_BODIES) */
const B_RIVER = 1;
const B_LAKE = 2;
const B_POOL = 3;
const B_OUTLET = 4;

// ── quick nearest-point lookups on the river and the outlet: their segments bucketed in a grid
// (each bucket lists every segment within SEARCH of it, so a lookup only checks a handful) ──
const BUCKET = 32;
const SEARCH = 180;
const BNX = Math.ceil((WILD_WATER_BOUNDS.x1 - WILD_WATER_BOUNDS.x0) / BUCKET);
const BNZ = Math.ceil((WILD_WATER_BOUNDS.z1 - WILD_WATER_BOUNDS.z0) / BUCKET);
function bucketSegments(pts: P2[]): number[][] {
  const b: number[][] = Array.from({ length: BNX * BNZ }, () => []);
  for (let i = 0; i + 1 < pts.length; i++) {
    const x0 = Math.min(pts[i][0], pts[i + 1][0]) - SEARCH;
    const x1 = Math.max(pts[i][0], pts[i + 1][0]) + SEARCH;
    const z0 = Math.min(pts[i][1], pts[i + 1][1]) - SEARCH;
    const z1 = Math.max(pts[i][1], pts[i + 1][1]) + SEARCH;
    for (let bj = Math.max(0, Math.floor((z0 - WILD_WATER_BOUNDS.z0) / BUCKET)); bj <= Math.min(BNZ - 1, Math.floor((z1 - WILD_WATER_BOUNDS.z0) / BUCKET)); bj++)
      for (let bi = Math.max(0, Math.floor((x0 - WILD_WATER_BOUNDS.x0) / BUCKET)); bi <= Math.min(BNX - 1, Math.floor((x1 - WILD_WATER_BOUNDS.x0) / BUCKET)); bi++) b[bj * BNX + bi].push(i);
  }
  return b;
}
const RIVER_B = bucketSegments(WILD_RIVER_POINTS);
const OUTLET_B = bucketSegments(WILD_OUTLET_POINTS);
// (fields start as the kinds they'll hold: d and u are fractions, i an int)
const _np = { d: 0.5, i: 0, u: 0.5 };
const WX0 = WILD_WATER_BOUNDS.x0;
const WZ0 = WILD_WATER_BOUNDS.z0;
/** nearest point on `pts` to (x, z) (as nearestOnPolyline), or d = Infinity when none is within SEARCH */
function nearestBucketed(f: Float64Array, B: number[][], x: number, z: number): typeof _np {
  // (written for the optimiser — this is the hottest loop in baking the water: the bucket index is
  //  range-checked as a float, then truncated, so it's always a small int; the points are one flat
  //  Float64Array, not little [x, z] arrays of mixed kinds; the result is written once, at the end.
  //  Before, it kept bailing out of its optimised code and gave up, making every later bake of the
  //  Wildlands' water several times slower)
  const fx = (x - WX0) / BUCKET;
  const fz = (z - WZ0) / BUCKET;
  if (!(fx >= 0 && fz >= 0 && fx < BNX && fz < BNZ)) {
    _np.d = Infinity;
    _np.i = 0;
    _np.u = 0;
    return _np;
  }
  const list = B[(fz | 0) * BNX + (fx | 0)];
  let best = Infinity;
  let bi = 0;
  let bu = 0;
  for (let k = 0; k < list.length; k++) {
    const i = list[k];
    const ax = f[i * 2];
    const az = f[i * 2 + 1];
    const ex = f[i * 2 + 2] - ax;
    const ez = f[i * 2 + 3] - az;
    const l2 = ex * ex + ez * ez || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    const dx = ax + ex * u - x;
    const dz = az + ez * u - z;
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      bi = i;
      bu = u;
    }
  }
  _np.d = Math.sqrt(best);
  _np.i = bi;
  _np.u = bu;
  return _np;
}
const flatOf = (pts: P2[]) => Float64Array.from(pts.flatMap((p) => [p[0], p[1]]));
const RIVER_F = flatOf(WILD_RIVER_POINTS);
const OUTLET_F = flatOf(WILD_OUTLET_POINTS);

/** the raw shapes at (x, z): signed distance to the water's edge, the body, and the current */
function shapeAt(x: number, z: number, out: { sdf: number; body: number; fx: number; fz: number; depth: number }) {
  let sdf = 1e9;
  let body = 0;
  let fx = 0;
  let fz = 0;
  let depth = 0;
  // the pool (a swirl)
  {
    const P = WILD_FALLS.pool;
    const d = Math.hypot(x - P.x, z - P.z) - P.r;
    if (d < sdf) {
      sdf = d;
      body = B_POOL;
      const ox = x - P.x;
      const oz = z - P.z;
      const l = Math.hypot(ox, oz) || 1;
      fx = (-oz / l) * 0.7;
      fz = (ox / l) * 0.7;
      depth = Math.min(4.6, 0.6 - d * 0.32);
    }
  }
  // the lake (a slow drift round it)
  {
    const ox = x - WILD_LAKE.x;
    const oz = z - WILD_LAKE.z;
    const r = Math.hypot(ox, oz);
    const d = r - wildLakeRadius(Math.atan2(ox, oz));
    if (d < sdf) {
      sdf = d;
      body = B_LAKE;
      const l = r || 1;
      fx = (-oz / l) * 0.18;
      fz = (ox / l) * 0.18;
      // (sandy shallows shelving gently to a deep middle)
      depth = Math.min(7.5, 0.3 - d * 0.075);
    }
  }
  // the river and the outlet: along their lines, flowing downstream
  for (const [pts, len, half, b, speed, B] of [
    [RIVER_F, riverLen, wildRiverHalfWidth, B_RIVER, 1.25, RIVER_B],
    [OUTLET_F, outletLen, outletHalfWidth, B_OUTLET, 1.0, OUTLET_B],
  ] as const) {
    const n = nearestBucketed(pts, B, x, z);
    if (n.d === Infinity) continue;
    const s = len[n.i] + (len[Math.min(len.length - 1, n.i + 1)] - len[n.i]) * n.u;
    const h = half(s);
    const d = n.d - h;
    if (d < sdf) {
      sdf = d;
      body = b;
      const ia = n.i * 2;
      const ic = Math.min(pts.length / 2 - 1, n.i + 1) * 2;
      const ex = pts[ic] - pts[ia];
      const ez = pts[ic + 1] - pts[ia + 1];
      const l = Math.hypot(ex, ez) || 1;
      // (fastest mid-stream)
      const k = speed * (0.35 + 0.65 * Math.max(0, 1 - (n.d / h) ** 2));
      fx = (ex / l) * k;
      fz = (ez / l) * k;
      // wadeable at the edges, deep enough to swim mid-stream
      depth = Math.min(2.4, 0.35 - d * 0.42);
    }
  }
  out.sdf = sdf;
  out.body = body;
  out.fx = fx;
  out.fz = fz;
  out.depth = Math.max(0, depth);
}

// ── the baked fields: 2-unit cells, in tiles baked the first time something looks there ──
const CELL = 2;
const T = 32;
const GX = Math.ceil((WILD_WATER_BOUNDS.x1 - WILD_WATER_BOUNDS.x0) / CELL) + 1;
const GZ = Math.ceil((WILD_WATER_BOUNDS.z1 - WILD_WATER_BOUNDS.z0) / CELL) + 1;
const TX = Math.ceil((GX - 1) / T);
const TZ = Math.ceil((GZ - 1) / T);
const TS = T + 1;
interface Tile {
  sdf: Float32Array;
  depth: Float32Array;
  fx: Float32Array;
  fz: Float32Array;
  body: Uint8Array;
}
const tiles: (Tile | undefined)[] = new Array(TX * TZ);
const _s = { sdf: 0, body: 0, fx: 0, fz: 0, depth: 0 };
function tileAt(ti: number, tj: number): Tile {
  const k = tj * TX + ti;
  let t = tiles[k];
  if (t) return t;
  t = { sdf: new Float32Array(TS * TS), depth: new Float32Array(TS * TS), fx: new Float32Array(TS * TS), fz: new Float32Array(TS * TS), body: new Uint8Array(TS * TS) };
  // (a tile nowhere near any water is simply dry land: no need to look at every sample)
  shapeAt(WILD_WATER_BOUNDS.x0 + (ti + 0.5) * T * CELL, WILD_WATER_BOUNDS.z0 + (tj + 0.5) * T * CELL, _s);
  if (_s.sdf > 99 + T * CELL * 0.75) {
    t.sdf.fill(99);
    tiles[k] = t;
    return t;
  }
  for (let j = 0; j < TS; j++)
    for (let i = 0; i < TS; i++) {
      const x = WILD_WATER_BOUNDS.x0 + (ti * T + i) * CELL;
      const z = WILD_WATER_BOUNDS.z0 + (tj * T + j) * CELL;
      shapeAt(x, z, _s);
      const q = j * TS + i;
      t.sdf[q] = Math.min(_s.sdf, 99);
      t.depth[q] = _s.depth;
      t.fx[q] = _s.sdf < 0 ? _s.fx : 0;
      t.fz[q] = _s.sdf < 0 ? _s.fz : 0;
      t.body[q] = _s.sdf < 6 ? _s.body : 0;
    }
  tiles[k] = t;
  return t;
}
/** is (x, z) in the box at all (the cheap early-out every lookup starts with) */
export const inWildWater = (x: number, z: number) => x > WILD_WATER_BOUNDS.x0 && x < WILD_WATER_BOUNDS.x1 && z > WILD_WATER_BOUNDS.z0 && z < WILD_WATER_BOUNDS.z1;
const _l = { t: null as Tile | null, q: 0, a: 0, b: 0 };
/** find the tile and the bilinear weights for (x, z) (false outside the box) */
function locate(x: number, z: number): boolean {
  if (!inWildWater(x, z)) return false;
  const u = (x - WILD_WATER_BOUNDS.x0) / CELL;
  const v = (z - WILD_WATER_BOUNDS.z0) / CELL;
  const i = Math.min(GX - 2, Math.floor(u));
  const j = Math.min(GZ - 2, Math.floor(v));
  const ti = Math.min(TX - 1, Math.floor(i / T));
  const tj = Math.min(TZ - 1, Math.floor(j / T));
  _l.t = tileAt(ti, tj);
  _l.q = (j - tj * T) * TS + (i - ti * T);
  _l.a = u - i;
  _l.b = v - j;
  return true;
}
const lerp4 = (f: Float32Array) => {
  const { q, a, b } = _l;
  return (f[q] * (1 - a) + f[q + 1] * a) * (1 - b) + (f[q + TS] * (1 - a) + f[q + TS + 1] * a) * b;
};

/** signed distance (units) to the Wildlands' water's edge: negative in it, 99 far away */
export function wildWaterSdf(x: number, z: number): number {
  return locate(x, z) ? lerp4(_l.t!.sdf) : 99;
}
/** how deep the water is meant to be at (x, z) (0 on land) */
export function wildWaterDepth(x: number, z: number): number {
  return locate(x, z) ? lerp4(_l.t!.depth) : 0;
}
/** which body is nearest (x, z), within ~6 units of it (0 none) */
export function wildWaterBody(x: number, z: number): number {
  if (!locate(x, z)) return 0;
  const k = _l.q + (_l.a > 0.5 ? 1 : 0) + (_l.b > 0.5 ? TS : 0);
  return _l.t!.body[k];
}
/** the current at (x, z): units/s */
export function wildFlowAt(x: number, z: number, out: { x: number; z: number }): { x: number; z: number } {
  if (!locate(x, z)) {
    out.x = 0;
    out.z = 0;
    return out;
  }
  out.x = lerp4(_l.t!.fx);
  out.z = lerp4(_l.t!.fz);
  return out;
}

/**
 * The ground the terrain should have here because of the Wildlands' water (null = leave it alone):
 * the bed under the water, and a broad valley rising gently from the banks to meet the land — the
 * terrain takes min(ground, this) so it only ever carves down. (The river runs in a green valley
 * through the foothills; the lake lies in a wide, sandy-shored basin.)
 */
export function wildBedY(x: number, z: number): number | null {
  if (!locate(x, z)) return null;
  const d = lerp4(_l.t!.sdf);
  if (d > 95) return null;
  if (d < 0) return WL - lerp4(_l.t!.depth);
  const lake = wildWaterBody(x, z) === B_LAKE;
  // the bank just proud of the water, then the valley sides: gentle by the lake (its beaches),
  // a little steeper along the river, then up to meet the land
  const near = lake ? d * 0.07 : d * 0.12;
  return WL + 0.35 + near + Math.max(0, d - (lake ? 26 : 14)) * (lake ? 0.22 : 0.36) + Math.max(0, d - 55) * 0.45;
}

/** the falls' shelf ground (null = not on or by it): a lumpy rocky top, cliffs round it */
export function wildShelfY(x: number, z: number, ground: number): number | null {
  const dx = x - WILD_SHELF.x;
  const dz = z - WILD_SHELF.z;
  const r = Math.hypot(dx, dz);
  if (r > 70) return null;
  const a = Math.atan2(dx, dz);
  const R = wildShelfRadius(a);
  const cliff = shelfCliff(a);
  // the spring's channel running across the top to the lip
  const L = WILD_FALLS.lip;
  const S = WILD_FALLS.spring;
  const n = nearestOnPolyline([[S.x, S.z], [L.x, L.z]], x, z);
  const channel = (1 - smoothstep(2, 5, n.d)) * 1.6;
  const lump = Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17 - 0.4) * 1.6 + Math.sin(x * 0.6) * Math.sin(z * 0.55) * 0.5;
  const top = WILD_SHELF.top + lump - channel;
  if (r <= R) return top;
  if (r >= R + cliff) return null;
  // the cliff face: steep, with a ledge partway down
  const u = (r - R) / cliff;
  const fall = u < 0.5 ? smoothstep(0, 0.5, u) * 0.6 : 0.6 + smoothstep(0.6, 1, u) * 0.4;
  return Math.max(ground, top + (ground - top) * fall);
}

/** 0..1: the rainforest — round the falls and the shelf, and in a broad band along the upper river */
export function wildRainforestK(x: number, z: number): number {
  if (!inWildWater(x, z)) return 0;
  const n = nearestBucketed(RIVER_F, RIVER_B, x, z);
  const s = n.d === Infinity ? 1 : riverLen[n.i] / WILD_RIVER_LENGTH;
  // (the band narrows toward the lake, where the plains open out)
  const band = 1 - smoothstep(55 + 70 * (1 - s), 85 + 90 * (1 - s), n.d);
  const falls = 1 - smoothstep(90, 150, Math.hypot(x - (WILD_SHELF.x + POOL_C.x) / 2, z - (WILD_SHELF.z + POOL_C.z) / 2));
  const k = Math.max(band * (1 - smoothstep(0.75, 1, s)), falls);
  // (not in the water, nor on its very banks)
  return k * smoothstep(3, 9, wildWaterSdf(x, z));
}
