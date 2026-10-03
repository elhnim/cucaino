// Cucaino Island's terrain. Round the park (the south-west end of the island): rolling hills and
// valleys, mountains rising behind it to the north, gentle slopes down to the beaches, the Rainbow
// Falls mesa and the beds of the river, the plunge pool, Rainbow Lake and its outlet
// (./waterways.ts) — while every trail, building, land, the plaza and the Dream Park sit on
// smoothly levelled ground so walking stays easy. Beyond the park, the Wildlands (island.ts): the
// Great Ridge of snowy peaks running away to the north-east, a lone peak, the north-west uplands
// and broad rolling plains down to a long coast. `groundY(x, z)` samples a height field that is
// baked lazily, tile by tile, as anything asks for it; far-off ground can use groundYFar(), which
// works the height out on the spot without baking anything. Pure maths, deterministic, no three.js.
import { LANDS, PLACES } from "./places";
import { ISLAND_R, TRAIL_POINTS, coastR, parkCoastR, seaDist } from "./island";
import { mesaY, waterBedY, waterSdf } from "./waterways";
import { wildShelfY } from "./wildWater";
import { RAIL_POINTS, STATIONS, railIndexAt } from "./railway";
import { DREAM_ZONE } from "../builder/rules";
import { SETTLEMENTS } from "./settlements";

// ── value noise ──
function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct = 4) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** the park's land (the old little island's shape); `sd` = how far out to sea (negative inland) */
function parkHeight(x: number, z: number, sd: number): number {
  // rolling meadow hills
  let h = (fbm(x / 38 + 11, z / 38 - 7) - 0.45) * 11;
  // broad swells
  h += Math.sin(x / 61 + 1.3) * Math.cos(z / 53 - 0.7) * 3.5;
  // mountains with cliffs rising behind the park to the north (z very negative = north on the map),
  // shaped as they always were: they fall away where the park's old shore was, down to the
  // foothills before the Great Ridge rises
  const north = smooth(0.1, 0.9, (-z - 40) / 90) * smooth(-2, -40, Math.max(sd, Math.hypot(x, z) - parkCoastR(Math.atan2(x, z))));
  const ridge = Math.pow(fbm(x / 22 + 40, z / 22 + 3, 5), 1.6) * 60;
  h += north * (14 + ridge);
  // softer highlands in the far west
  const west = smooth(0.2, 1, (-x - 70) / 70) * smooth(0, -30, sd);
  h += west * fbm(x / 30 - 5, z / 30 + 9) * 16;
  return h * smooth(0, -26, sd);
}

/** the Great Ridge's spine: from the mountains behind the park away to the north-east */
const RIDGE: [number, number][] = [
  [-40, -165],
  [180, -380],
  [480, -640],
  [820, -930],
  [1150, -1210],
  [1460, -1470],
  [1760, -1690],
];
const RIDGE_LEN: number[] = (() => {
  const out = [0];
  for (let i = 1; i < RIDGE.length; i++) out.push(out[i - 1] + Math.hypot(RIDGE[i][0] - RIDGE[i - 1][0], RIDGE[i][1] - RIDGE[i - 1][1]));
  return out;
})();
const _rp = { d: 0, u: 0 };
/** distance from (x, z) to the ridge's spine, and how far along it (0..1) */
function ridgeAt(x: number, z: number): typeof _rp {
  let best = Infinity;
  let bu = 0;
  for (let i = 0; i + 1 < RIDGE.length; i++) {
    const [ax, az] = RIDGE[i];
    const bx = RIDGE[i + 1][0] - ax;
    const bz = RIDGE[i + 1][1] - az;
    const L2 = bx * bx + bz * bz;
    const t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / L2));
    const d = Math.hypot(x - ax - bx * t, z - az - bz * t);
    if (d < best) {
      best = d;
      bu = (RIDGE_LEN[i] + Math.sqrt(L2) * t) / RIDGE_LEN[RIDGE_LEN.length - 1];
    }
  }
  _rp.d = best;
  _rp.u = bu;
  return _rp;
}
/** the lone peak out east, and the north-west uplands */
const LONE_PEAK = { x: 1980, z: -520, r: 260, h: 95 };
const UPLANDS = { x: 380, z: -1500, r: 520, h: 26 };

/** the Wildlands' land: plains, the Great Ridge, the lone peak and the uplands */
function wildHeight(x: number, z: number, sd: number): number {
  // broad rolling plains (dry land: the base sits well above the sea) with smaller hills on them
  let h = 7 + (fbm(x / 230 + 31, z / 230 - 17) - 0.45) * 30 + (fbm(x / 64 - 9, z / 64 + 4) - 0.45) * 9;
  // the Great Ridge: a long range of crags and snowy peaks, highest along its middle
  const rp = ridgeAt(x, z);
  const width = 85 + fbm(x / 300 + 4, z / 300 - 8) * 70;
  const along = Math.pow(Math.sin(Math.PI * Math.min(1, rp.u * 1.08)), 0.6);
  const crest = 30 + along * (55 + fbm(x / 160 - 3, z / 160 + 6) * 50);
  const k = Math.exp(-((rp.d / width) ** 2));
  const crag = 1 - Math.abs(2 * fbm(x / 46 + 13, z / 46 - 21, 5) - 1);
  h += k * (crest + crag * crag * 30 * (0.4 + along));
  // the lone peak (a tall cone with gullies down its flanks)
  const ld = Math.hypot(x - LONE_PEAK.x, z - LONE_PEAK.z) / LONE_PEAK.r;
  if (ld < 1.6) h += LONE_PEAK.h * Math.exp(-ld * ld * 2.2) * (0.85 + 0.3 * fbm(x / 35 + 2, z / 35 - 2, 3));
  // the north-west uplands: a high rolling plateau with a steep edge
  const ud = Math.hypot(x - UPLANDS.x, z - UPLANDS.z) / UPLANDS.r;
  h += UPLANDS.h * (1 - smooth(0.75, 1.0, ud + (fbm(x / 120, z / 120) - 0.5) * 0.3));
  // down to the coast through wide lowlands
  return h * smooth(0, -70, sd);
}

/** the wild land before anything is levelled */
function rawHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const sd = seaDist(x, z);
  // the park's land near the plaza, the Wildlands' beyond (blended over a wide band)
  const wPark = 1 - smooth(190, 340, r);
  let h = wPark > 0 ? parkHeight(x, z, sd) * wPark : 0;
  if (wPark < 1) h += wildHeight(x, z, sd) * (1 - wPark);
  // under the sea: a shallow sandy lagoon, a reef shelf with coral mounds, and a drop-off wall
  // into the deep blue
  const d = sd;
  if (d > 10) h -= seabedDrop(x, z, d);
  return h;
}

/** how far the sea floor sits below the beach, `d` metres out from the grass line */
function seabedDrop(x: number, z: number, d: number): number {
  const lagoon = smooth(12, 24, d) * 3.2; // ~-3 m: bright sand, snorkelling depth
  const shelf = smooth(24, 34, d) * 3.8; // ~-7 m: the reef shelf
  const wall = smooth(37, 46, d) * 15; // ~-22 m: the deep blue beyond the reef
  // coral mounds and sand ripples on the lagoon floor and the shelf
  const mounds = smooth(16, 26, d) * (1 - smooth(36, 43, d)) * (fbm(x / 9 + 3, z / 9 - 8) - 0.45) * 5;
  const ripples = smooth(12, 20, d) * Math.sin(x * 0.7 + Math.sin(z * 0.13) * 3) * 0.12;
  return lagoon + shelf + wall - mounds - ripples;
}
/** the deepest sea floor (past the reef wall, and off the edge of the height field) */
export const DEEP_FLOOR = -22;
/** the sea's surface height (the water mesh's resting level) */
export const WATER_Y = -0.25;
/** The ocean has no edge: sail, swim or fly past this radius and you come back in from the
 *  opposite side of the world (like going round a little planet) — see wrapWorld(). */
export const WRAP_R = 3600;
/** where you reappear after crossing WRAP_R: the antipode, just inside the edge, same heading */
export function wrapWorld(p: { x: number; z: number }): boolean {
  const r = Math.hypot(p.x, p.z);
  if (r <= WRAP_R) return false;
  const k = -(WRAP_R - 2) / r;
  p.x *= k;
  p.z *= k;
  return true;
}

// ── the height field: a regular grid over the island and its reef, baked lazily ──
/** the grid's cell size (world units) */
export const TERRAIN_CELL = 400 / 319;
/** how far past the coast the field reaches (the reef wall is at +46) */
const FIELD_PAD = 64;
const FIELD = (() => {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let k = 0; k < 2048; k++) {
    const a = (k / 2048) * Math.PI * 2;
    const c = coastR(a);
    x0 = Math.min(x0, Math.sin(a) * c);
    x1 = Math.max(x1, Math.sin(a) * c);
    z0 = Math.min(z0, Math.cos(a) * c);
    z1 = Math.max(z1, Math.cos(a) * c);
  }
  // (snapped to the old little island's grid, so the park's samples sit where they always did)
  const snapLo = (v: number) => -200 + Math.floor((v - FIELD_PAD + 200) / TERRAIN_CELL) * TERRAIN_CELL;
  const ox = snapLo(x0);
  const oz = snapLo(z0);
  return { x0: ox, z0: oz, nx: Math.ceil((x1 + FIELD_PAD - ox) / TERRAIN_CELL) + 1, nz: Math.ceil((z1 + FIELD_PAD - oz) / TERRAIN_CELL) + 1 };
})();
/** the field's first sample (its north-west corner) and its size in samples */
export const TERRAIN_X0 = FIELD.x0;
export const TERRAIN_Z0 = FIELD.z0;
export const TERRAIN_NX = FIELD.nx;
export const TERRAIN_NZ = FIELD.nz;
export const TERRAIN_X1 = TERRAIN_X0 + (TERRAIN_NX - 1) * TERRAIN_CELL;
export const TERRAIN_Z1 = TERRAIN_Z0 + (TERRAIN_NZ - 1) * TERRAIN_CELL;
/** is (x, z) over the height field (else it's the deep sea floor) */
export function inTerrain(x: number, z: number): boolean {
  return x > TERRAIN_X0 && z > TERRAIN_Z0 && x < TERRAIN_X1 && z < TERRAIN_Z1;
}
const CELL = TERRAIN_CELL;

// Nothing is baked up front: a tile of TERRAIN_TILE cells a side is worked out the first time
// anything asks for a height inside it (the park only pays for the ground near the kid, and
// loading stays light however big the island is). Each tile bakes a padded patch, so the soft
// blur and the stamps give exactly the values one whole-grid bake would. Tiles nobody has used
// for a while are let go (a re-bake gives the same values).

/** cells per tile side (a tile holds TERRAIN_TILE + 1 samples a side, sharing its edges with the next) */
export const TERRAIN_TILE = 48;
/** the blur's reach (two passes, one cell each) */
const PAD = 2;
const TILES_X = Math.ceil((TERRAIN_NX - 1) / TERRAIN_TILE);
const TILES_Z = Math.ceil((TERRAIN_NZ - 1) / TERRAIN_TILE);
const TS = TERRAIN_TILE + 1;
const tiles: (Float32Array | undefined)[] = new Array(TILES_X * TILES_Z);
const tileUsed = new Float64Array(TILES_X * TILES_Z);
/** at most this many tiles are kept baked (~10 KB each) */
const KEEP_TILES = 900;
let baked = 0;
let useClock = 0;

interface Stamp {
  x: number;
  z: number;
  rIn: number;
  rOut: number;
  h: number;
  /** (a height worked out only when a tile it reaches is first baked: NaN until then) */
  hf?: () => number;
}
/** a stamp's target height (lazy ones are worked out the first time they're needed) */
const stampH = (st: Stamp) => (st.hf ? ((st.h = st.hf()), (st.hf = undefined), st.h) : st.h);
/** every levelling stamp, in bake order (the strongest wins; on a tie the first), bucketed by tile */
let stampBuckets: Stamp[][] | null = null;
function stamps(): Stamp[][] {
  if (stampBuckets) return stampBuckets;
  const list: Stamp[] = [];
  const stamp = (x: number, z: number, rIn: number, rOut: number, h: number) => list.push({ x, z, rIn, rOut, h });
  // (lazy: far out in the Wildlands, sampling the natural ground there means working out the land
  //  and its water, which the park itself never needs — so only when a tile there is first baked)
  const stampLazy = (x: number, z: number, rIn: number, rOut: number, hf: () => number) => list.push({ x, z, rIn, rOut, h: NaN, hf });
  const sample = (x: number, z: number) => rawHeight(x, z);
  // trails: follow the land softly, so paths roll with the hills but never get steep
  for (const pts of TRAIL_POINTS) {
    const hs = pts.map(([x, z]) => sample(x, z) * 0.55);
    // smooth along the trail
    for (let pass = 0; pass < 6; pass++) for (let i = 1; i + 1 < hs.length; i++) hs[i] = (hs[i - 1] + hs[i] * 2 + hs[i + 1]) / 4;
    pts.forEach(([x, z], i) => stamp(x, z, 2.6, 7, hs[i]));
  }
  // the Wildlands Railway: the ground levelled under the track and the platforms (not over the
  // water: the trestle bridges cross the river and the outlet)
  const RH = railHeights();
  for (let i = 0; i < RAIL_POINTS.length; i++) {
    const [x, z] = RAIL_POINTS[i];
    if (waterSdf(x, z) < 16) continue;
    stamp(x, z, 3.4, 8.5, RH[i] - 0.3);
  }
  for (const st of STATIONS) stamp(st.x, st.z, 14, 21, railY(st.s) - 0.3);
  // lands, places, plaza, Dream Park: flat terraces
  const landH: Record<string, number> = {};
  for (const l of LANDS) {
    const h = l.id === "gate" ? 0 : sample(l.x, l.z) * 0.45;
    landH[l.id] = h;
    stamp(l.x, l.z, l.radius + 1, l.radius + 10, h);
  }
  for (const p of PLACES) if (!p.sky) stamp(p.x, p.z, p.radius + 2, p.radius + 7, landH[p.land] ?? 0);
  stamp(0, 0, 13, 24, 0);
  // Wildlands settlements: the ground under the fire/plaza, every hut and every work spot but the
  // fishing one (its pier crosses the real shore on purpose, sloping down to the water like any
  // beach) is gently levelled — like a trail, each spot settles to a SMOOTHED version of its own
  // natural height (not one flat height for the whole village, which left a sunken-looking disc
  // where the land naturally rises away from the shore; the smoothing, not a single shared number,
  // is what keeps neighbouring huts from stepping against each other), with its own small,
  // soft-edged clearing so the kid can still see where one dooryard ends and the grass begins.
  // Never below the waterline; a stilt hut right at the water gets a lower floor than one further
  // up the bank (registry/settlements.ts).
  const smoothSample = (x: number, z: number) => {
    let s = sample(x, z) * 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      s += sample(x + Math.sin(a) * 3.5, z + Math.cos(a) * 3.5);
    }
    return s / 8;
  };
  for (const st of SETTLEMENTS) {
    stampLazy(st.x, st.z, 7, 22, () => Math.max(smoothSample(st.x, st.z) * 0.6, WATER_Y + 0.6));
    for (const hut of st.huts) {
      const floor = hut.shore ? WATER_Y + 0.45 : WATER_Y + 0.6;
      stampLazy(hut.x, hut.z, hut.size + 2.6, hut.size + (hut.shore ? 13 : 11), () => Math.max(smoothSample(hut.x, hut.z) * (hut.shore ? 0.75 : 0.6), floor));
    }
    for (const w of st.work) {
      if (w.id === "fishing") continue;
      stampLazy(w.x, w.z, 3.2, 14, () => Math.max(smoothSample(w.x, w.z) * 0.6, WATER_Y + 0.6));
    }
  }
  const dz = { cx: DREAM_ZONE.x0 + (DREAM_ZONE.cols * DREAM_ZONE.cell) / 2, cz: DREAM_ZONE.z0 + (DREAM_ZONE.rows * DREAM_ZONE.cell) / 2 };
  stamp(dz.cx, dz.cz, DREAM_ZONE.cols * DREAM_ZONE.cell * 0.75, DREAM_ZONE.cols * DREAM_ZONE.cell * 0.75 + 8, landH.dream ?? 0);
  // (each stamp goes in every tile whose padded patch it reaches, keeping the bake order)
  const b: Stamp[][] = Array.from({ length: TILES_X * TILES_Z }, () => []);
  const tw = TERRAIN_TILE * CELL;
  for (const st of list) {
    const lo = (v: number, o: number) => Math.floor((v - st.rOut - o) / tw) - 1;
    const hi = (v: number, o: number) => Math.floor((v + st.rOut - o) / tw) + 1;
    for (let tj = Math.max(0, lo(st.z, TERRAIN_Z0)); tj <= Math.min(TILES_Z - 1, hi(st.z, TERRAIN_Z0)); tj++)
      for (let ti = Math.max(0, lo(st.x, TERRAIN_X0)); ti <= Math.min(TILES_X - 1, hi(st.x, TERRAIN_X0)); ti++) {
        const x0 = TERRAIN_X0 + (ti * TERRAIN_TILE - PAD - 1) * CELL;
        const z0 = TERRAIN_Z0 + (tj * TERRAIN_TILE - PAD - 1) * CELL;
        const x1 = TERRAIN_X0 + (ti * TERRAIN_TILE + TERRAIN_TILE + PAD + 1) * CELL;
        const z1 = TERRAIN_Z0 + (tj * TERRAIN_TILE + TERRAIN_TILE + PAD + 1) * CELL;
        if (st.x + st.rOut < x0 || st.x - st.rOut > x1 || st.z + st.rOut < z0 || st.z - st.rOut > z1) continue;
        b[tj * TILES_X + ti].push(st);
      }
  }
  stampBuckets = b;
  return b;
}

// ── the railway's rails: their height along the loop, from the land under them ──
let railH: Float32Array | null = null;
/** the rails' height at every RAIL_POINTS point: the wild land under them, smoothed a long way
 *  and kept to a gentle grade (a toy steam train can't climb cliffs), at least a few metres over
 *  any water it bridges */
export function railHeights(): Float32Array {
  if (railH) return railH;
  const n = RAIL_POINTS.length;
  let h: Float32Array = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = Math.max(rawHeight(RAIL_POINTS[i][0], RAIL_POINTS[i][1]), WATER_Y + 1.2) + 0.35;
  // (a long running average, round the loop)
  const W = 12;
  for (let pass = 0; pass < 4; pass++) {
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -W; k <= W; k++) sum += h[(i + k + n) % n];
      o[i] = sum / (2 * W + 1);
    }
    h = o;
  }
  // over the water: well clear of it (the bridges)
  for (let i = 0; i < n; i++) {
    const [x, z] = RAIL_POINTS[i];
    const ws = waterSdf(x, z);
    if (ws < 30) h[i] = Math.max(h[i], WATER_Y + 3.6 * (1 - smooth(10, 30, ws)) + (h[i] - WATER_Y) * smooth(10, 30, ws));
  }
  // at most a 4% grade, both ways round (each segment by its own length; until it settles)
  const segL = new Float32Array(n);
  for (let i = 0; i < n; i++) segL[i] = Math.hypot(RAIL_POINTS[(i + 1) % n][0] - RAIL_POINTS[i][0], RAIL_POINTS[(i + 1) % n][1] - RAIL_POINTS[i][1]);
  for (let pass = 0; pass < 30; pass++) {
    let changed = false;
    for (let i = 1; i <= 2 * n; i++) {
      const a = (i - 1) % n;
      const k = i % n;
      const lim = h[a] - 0.04 * segL[a];
      if (h[k] < lim) {
        h[k] = lim;
        changed = true;
      }
    }
    for (let i = 2 * n - 1; i >= 0; i--) {
      const k = i % n;
      const b = (i + 1) % n;
      const lim = h[b] - 0.04 * segL[k];
      if (h[k] < lim) {
        h[k] = lim;
        changed = true;
      }
    }
    if (!changed) break;
  }
  railH = h;
  return h;
}
/** the rails' height at distance s along the loop */
export function railY(s: number): number {
  const H = railHeights();
  const { i, u } = railIndexAt(s);
  return H[i] + (H[(i + 1) % H.length] - H[i]) * u;
}

/** Rainbow Falls' mesa rises out of the west coast; the waterways are carved in; and no other
 *  inland hollow dips below the waterline (the only inland water is the river, the pool and the
 *  lake, so you never "swim" on dry grass) — the last step for every sample, on its own */
function finish(x: number, z: number, h: number): number {
  const r = Math.hypot(x, z);
  const inland = 1 - smooth(-7, -2, seaDist(x, z));
  // (the park's river, falls and lake, and the Wildlands' great river, falls and lake: each answers
  // at once anywhere away from its own box)
  const bed = waterBedY(x, z);
  if (bed !== null) {
    // inland the beds are shaped exactly (an old hollow mustn't make a deep hole in the
    // lake's shallows); out by the sea the outlet only ever carves down
    const carved = Math.min(h, bed);
    h = waterSdf(x, z) < 0 ? carved + (bed - carved) * inland : carved;
  }
  // (the mesa after the carving: its cliffs stand right down into the plunge pool)
  const m = r < ISLAND_R + 60 ? mesaY(x, z, h) : wildShelfY(x, z, h);
  if (m !== null) h = Math.max(h, m);
  if (inland > 0) {
    const d = bed === null ? 9 : waterSdf(x, z);
    const floor = WATER_Y + 0.35 + 0.04 * Math.min(Math.max(d, 0), 6);
    if (d > 0.4 && h < floor) h += (floor - h) * inland;
  }
  return h;
}

/** bake one tile: its padded patch of the field, levelled, blurred and carved; returns its samples */
function bakeTile(ti: number, tj: number): Float32Array {
  // the padded patch, in whole-grid indices (clamped to the grid: its outer rim is never blurred)
  const pi0 = Math.max(0, ti * TERRAIN_TILE - PAD);
  const pj0 = Math.max(0, tj * TERRAIN_TILE - PAD);
  const pi1 = Math.min(TERRAIN_NX - 1, ti * TERRAIN_TILE + TERRAIN_TILE + PAD);
  const pj1 = Math.min(TERRAIN_NZ - 1, tj * TERRAIN_TILE + TERRAIN_TILE + PAD);
  const W = pi1 - pi0 + 1;
  const H = pj1 - pj0 + 1;
  const raw = new Float32Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) raw[j * W + i] = rawHeight(TERRAIN_X0 + (pi0 + i) * CELL, TERRAIN_Z0 + (pj0 + j) * CELL);

  // level the walkable things: stamp "target height + weight" discs, then blend
  const target = new Float32Array(W * H);
  const weight = new Float32Array(W * H);
  for (const st of stamps()[tj * TILES_X + ti]) {
    const i0 = Math.max(pi0, Math.floor((st.x - st.rOut - TERRAIN_X0) / CELL));
    const i1 = Math.min(pi1, Math.ceil((st.x + st.rOut - TERRAIN_X0) / CELL));
    const j0 = Math.max(pj0, Math.floor((st.z - st.rOut - TERRAIN_Z0) / CELL));
    const j1 = Math.min(pj1, Math.ceil((st.z + st.rOut - TERRAIN_Z0) / CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(TERRAIN_X0 + i * CELL - st.x, TERRAIN_Z0 + j * CELL - st.z);
        if (d > st.rOut) continue;
        const w = 1 - smooth(st.rIn, st.rOut, d);
        const k = (j - pj0) * W + (i - pi0);
        if (w > weight[k]) {
          // the strongest stamp wins (a land beats the trail running into it)
          target[k] = stampH(st);
          weight[k] = w;
        }
      }
  }
  const out = new Float32Array(W * H);
  for (let k = 0; k < out.length; k++) out[k] = raw[k] + (target[k] - raw[k]) * weight[k];
  // two soft blur passes so nothing has a hard edge (except the mountain cliffs, which stay bold)
  // (the grid's own outer rim is never blurred; the patch's padding soaks up the patch's rim)
  const tmp = new Float32Array(W * H);
  for (let pass = 0; pass < 2; pass++) {
    tmp.set(out);
    for (let j = 1; j < H - 1; j++)
      for (let i = 1; i < W - 1; i++) {
        const k = j * W + i;
        tmp[k] = (out[k] * 4 + out[k - 1] + out[k + 1] + out[k - W] + out[k + W]) / 8;
      }
    out.set(tmp);
  }
  const tile = new Float32Array(TS * TS).fill(DEEP_FLOOR);
  for (let j = 0; j < TS; j++) {
    const gj = tj * TERRAIN_TILE + j;
    if (gj > TERRAIN_NZ - 1) break;
    for (let i = 0; i < TS; i++) {
      const gi = ti * TERRAIN_TILE + i;
      if (gi > TERRAIN_NX - 1) break;
      tile[j * TS + i] = finish(TERRAIN_X0 + gi * CELL, TERRAIN_Z0 + gj * CELL, out[(gj - pj0) * W + (gi - pi0)]);
    }
  }
  return tile;
}

// ── which tiles the island's ground covers: the land and its reef. The rest of the rectangle is
// open deep sea (about half of it): never baked — it's DEEP_FLOOR, drawn by the deep sea floor
// (lib/park/world/sea/deepFloor.ts) along with the other islands' slopes ──
let cover: Uint8Array | null = null;
const DEEP_TILE = new Float32Array(TS * TS).fill(DEEP_FLOOR);
function coverGrid(): Uint8Array {
  if (cover) return cover;
  const c = new Uint8Array(TILES_X * TILES_Z);
  const tw = TERRAIN_TILE * CELL;
  // (a tile is covered if any of it, padding and all, is within the reef's reach of the coast — the
  // reef wall ends 46 m out — checked at points across it, with a margin for the blur and the
  // coast's wobble between them)
  const reach = 46 + 6 + (PAD + 1) * CELL;
  for (let tj = 0; tj < TILES_Z; tj++)
    for (let ti = 0; ti < TILES_X; ti++) {
      let hit = false;
      for (let v = 0; v <= 6 && !hit; v++)
        for (let u = 0; u <= 6 && !hit; u++) {
          const x = TERRAIN_X0 + (ti + u / 6) * tw;
          const z = TERRAIN_Z0 + (tj + v / 6) * tw;
          if (seaDist(x, z) < reach + tw / 12) hit = true;
        }
      if (hit) c[tj * TILES_X + ti] = 1;
    }
  cover = c;
  return c;
}
/** the cover grid, for the shaders: one byte per tile (1 = the island's ground is drawn there),
 *  tile (ti, tj) spanning x from TERRAIN_X0 + ti * size (and z likewise) */
export function terrainCoverGrid(): { data: Uint8Array; nx: number; nz: number; size: number } {
  return { data: coverGrid(), nx: TILES_X, nz: TILES_Z, size: TERRAIN_TILE * CELL };
}
/** is the island's ground (land or reef) drawn at (x, z)? (else it's the open deep sea floor) */
export function terrainCovers(x: number, z: number): boolean {
  if (!inTerrain(x, z)) return false;
  const tw = TERRAIN_TILE * CELL;
  return coverGrid()[Math.floor((z - TERRAIN_Z0) / tw) * TILES_X + Math.floor((x - TERRAIN_X0) / tw)] === 1;
}

function tileAt(ti: number, tj: number): Float32Array {
  const k = tj * TILES_X + ti;
  if (!coverGrid()[k]) return DEEP_TILE;
  let t = tiles[k];
  tileUsed[k] = ++useClock;
  if (!t) {
    if (baked >= KEEP_TILES) evict();
    t = bakeTile(ti, tj);
    tiles[k] = t;
    baked++;
  }
  return t;
}
/** let the least recently used quarter of the tiles go */
function evict() {
  const used: number[] = [];
  for (let k = 0; k < tiles.length; k++) if (tiles[k]) used.push(tileUsed[k]);
  used.sort((a, b) => a - b);
  const cut = used[Math.floor(used.length / 4)];
  for (let k = 0; k < tiles.length; k++)
    if (tiles[k] && tileUsed[k] <= cut) {
      tiles[k] = undefined;
      baked--;
    }
  lastK = -1;
}

/** Bake ahead: up to `max` of the not-yet-baked tiles within `r` of (x, z), nearest first, so the
 *  ground near the kid is ready before anything needs it (call it with spare time each frame).
 *  Returns how many it baked. */
export function terrainPrefetch(x: number, z: number, r: number, max = 1): number {
  const tw = TERRAIN_TILE * CELL;
  const c = coverGrid();
  const ti0 = Math.max(0, Math.floor((x - r - TERRAIN_X0) / tw));
  const ti1 = Math.min(TILES_X - 1, Math.floor((x + r - TERRAIN_X0) / tw));
  const tj0 = Math.max(0, Math.floor((z - r - TERRAIN_Z0) / tw));
  const tj1 = Math.min(TILES_Z - 1, Math.floor((z + r - TERRAIN_Z0) / tw));
  let made = 0;
  while (made < max) {
    let best = -1;
    let bd = Infinity;
    for (let tj = tj0; tj <= tj1; tj++)
      for (let ti = ti0; ti <= ti1; ti++) {
        const k = tj * TILES_X + ti;
        if (!c[k] || tiles[k]) continue;
        const d = Math.hypot(TERRAIN_X0 + (ti + 0.5) * tw - x, TERRAIN_Z0 + (tj + 0.5) * tw - z);
        if (d < r + tw * 0.71 && d < bd) {
          bd = d;
          best = k;
        }
      }
    if (best < 0) break;
    tileAt(best % TILES_X, Math.floor(best / TILES_X));
    made++;
  }
  return made;
}

/** how many of the field's tiles are baked right now (load-cost checks) */
export function terrainTilesBaked(): number {
  return baked;
}

/** the height at grid sample (i, j) — DEEP_FLOOR off the grid */
export function terrainSample(i: number, j: number): number {
  if (i < 0 || j < 0 || i > TERRAIN_NX - 1 || j > TERRAIN_NZ - 1) return DEEP_FLOOR;
  const ti = Math.min(TILES_X - 1, Math.floor(i / TERRAIN_TILE));
  const tj = Math.min(TILES_Z - 1, Math.floor(j / TERRAIN_TILE));
  return tileAt(ti, tj)[(j - tj * TERRAIN_TILE) * TS + (i - ti * TERRAIN_TILE)];
}

// (a one-tile memo: most lookups land in the same tile as the last one)
let lastK = -1;
let lastT: Float32Array = new Float32Array(TS * TS);

/** ground height at (x, z) — everything that stands on the island uses this */
export function groundY(x: number, z: number): number {
  const fx = (x - TERRAIN_X0) / CELL;
  const fz = (z - TERRAIN_Z0) / CELL;
  if (!(fx >= 0 && fz >= 0 && fx < TERRAIN_NX - 1 && fz < TERRAIN_NZ - 1)) return DEEP_FLOOR;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const ti = (i / TERRAIN_TILE) | 0;
  const tj = (j / TERRAIN_TILE) | 0;
  const tk = tj * TILES_X + ti;
  let g = lastT;
  if (tk !== lastK || !tiles[tk]) {
    g = tileAt(ti, tj);
    lastK = tk;
    lastT = g;
  }
  const u = fx - i;
  const v = fz - j;
  const k = (j - tj * TERRAIN_TILE) * TS + (i - ti * TERRAIN_TILE);
  return (g[k] * (1 - u) + g[k + 1] * u) * (1 - v) + (g[k + TS] * (1 - u) + g[k + TS + 1] * u) * v;
}

/** The ground's height at (x, z) worked out on the spot (no tiles baked): everything but the soft
 *  blur, so it's within a few centimetres of groundY() — for far-off ground and maps. */
export function groundYFar(x: number, z: number): number {
  if (!terrainCovers(x, z)) return DEEP_FLOOR;
  let h = rawHeight(x, z);
  const ti = Math.floor((x - TERRAIN_X0) / CELL / TERRAIN_TILE);
  const tj = Math.floor((z - TERRAIN_Z0) / CELL / TERRAIN_TILE);
  let w = 0;
  let target = 0;
  for (const st of stamps()[Math.min(TILES_Z - 1, tj) * TILES_X + Math.min(TILES_X - 1, ti)]) {
    const d = Math.hypot(x - st.x, z - st.z);
    if (d > st.rOut) continue;
    const s = 1 - smooth(st.rIn, st.rOut, d);
    if (s > w) {
      w = s;
      target = stampH(st);
    }
  }
  h += (target - h) * w;
  return finish(x, z, h);
}

/** how steep the ground is at (x, z): 0 flat .. 1 cliff (for rock vs grass colouring) */
export function slopeAt(x: number, z: number): number {
  const e = CELL;
  const dx = groundY(x + e, z) - groundY(x - e, z);
  const dz = groundY(x, z + e) - groundY(x, z - e);
  return Math.min(1, Math.hypot(dx, dz) / (2 * e) / 1.4);
}

export const ISLAND_RADIUS = ISLAND_R;
