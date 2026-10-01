// The Midnight Rift: a long, winding crack in the open-ocean floor far south of the park, where the
// sandy plain (DEEP_FLOOR, ~-22 m) suddenly drops away down terraced, jagged cliffs to a dark floor
// 85-105 m further down. Sunlight never reaches the bottom — the deep-sea creatures (and a few
// animals that have been extinct for millions of years) make their own light.
//
// Pure + deterministic (no three.js) so the engine (swimming, diving), the renderer
// (world/abyss/**) and the tests all read the same numbers:
//   - the crack follows a smooth centreline (a Catmull-Rom spline through PATH_CTRL, resampled
//     every ROW_STEP metres). Each sample is a "row": a straight line across the crack along the
//     row's normal. ABYSS_GRID holds the height of every vertex on every row (COLS columns across);
//     the canyon mesh is built from exactly these vertices and triangles, and abyssFloorY()
//     interpolates the very same triangles — so the floor you swim down to is exactly the rock you
//     see, walls and all
//   - the cross-section: a flat-ish floor, then terraced cliffs (ledges and steep drops, different
//     on each side and changing along the crack) up to the rim, where the height is exactly the
//     sandy plain's (DEEP_FLOOR + dunes, the same formula as sea/wander.ts) — so there is no seam
//   - the strip extends RIM_MARGIN metres beyond the rim at plain height (the mesh blends into the
//     deep floor patch there); abyssFloorY() is null outside the strip
// NOTE: must not import terrain.ts or sea/wander.ts (wander.ts will import this file): the plain's
// height is repeated here and checked against them by the tests.
import { noise2 } from "../world/fantasy/noise";

/** the deep sandy plain (= terrain.DEEP_FLOOR) */
const DEEP = -22;

/** the plain's low dunes (= sea/wander.ts dunes) */
function dunes(x: number, z: number): number {
  return (noise2(x / 46, z / 46, 71) - 0.5) * 1.3 + (noise2(x / 13, z / 13, 72) - 0.5) * 0.35;
}
/** the open-ocean floor's height where there is no crack (= seaFloorY out on the plain) */
export function abyssPlainY(x: number, z: number): number {
  return DEEP + dunes(x, z);
}

const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

// ── the centreline ──

/** control points of the crack's centreline, west to east */
const PATH_CTRL: { x: number; z: number }[] = [
  { x: -168, z: -402 },
  { x: -118, z: -438 },
  { x: -58, z: -434 },
  { x: -2, z: -462 },
  { x: 58, z: -500 },
  { x: 118, z: -494 },
  { x: 186, z: -526 },
];
/** metres between rows along the centreline */
export const ROW_STEP = 2;
/** columns across the strip (even: the centre is a column) */
export const COLS = 88;
/** the strip reaches this far beyond the rim, at plain height */
export const RIM_MARGIN = 4;
/** the rows reach this far beyond the ends of the centreline (flat plain there) */
const END_EXT = 6;

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** the spline densely sampled, then resampled by arc length */
function buildCentreline() {
  const dense: { x: number; z: number }[] = [];
  const P = PATH_CTRL;
  const n = P.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = P[Math.max(0, i - 1)];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[Math.min(n - 1, i + 2)];
    // (the end segments mirror their neighbour so the ends are straight-ish)
    const q0 = i === 0 ? { x: 2 * p1.x - p2.x, z: 2 * p1.z - p2.z } : p0;
    const q3 = i === n - 2 ? { x: 2 * p2.x - p1.x, z: 2 * p2.z - p1.z } : p3;
    for (let k = 0; k < 200; k++) {
      const t = k / 200;
      dense.push({ x: catmull(q0.x, p1.x, p2.x, q3.x, t), z: catmull(q0.z, p1.z, p2.z, q3.z, t) });
    }
  }
  dense.push({ ...P[n - 1] });
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z));
  const L = cum[cum.length - 1];
  const at = (s: number) => {
    // straight extension beyond the ends
    if (s <= 0) {
      const dx = dense[1].x - dense[0].x;
      const dz = dense[1].z - dense[0].z;
      const l = Math.hypot(dx, dz);
      return { x: dense[0].x + (dx / l) * s, z: dense[0].z + (dz / l) * s };
    }
    if (s >= L) {
      const m = dense.length - 1;
      const dx = dense[m].x - dense[m - 1].x;
      const dz = dense[m].z - dense[m - 1].z;
      const l = Math.hypot(dx, dz);
      return { x: dense[m].x + (dx / l) * (s - L), z: dense[m].z + (dz / l) * (s - L) };
    }
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const k = (s - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
    return { x: dense[lo].x + (dense[hi].x - dense[lo].x) * k, z: dense[lo].z + (dense[hi].z - dense[lo].z) * k };
  };
  return { L, at };
}

const CL = buildCentreline();
/** the length of the crack along its centreline (m) */
export const ABYSS_LENGTH = CL.L;

// ── the shape along the crack ──

/** 0 at the tips of the crack .. 1 along its body (it pinches shut at both ends) */
function taper(s: number) {
  return smooth(-2, 62, s) * smooth(CL.L + 2, CL.L - 62, s);
}
/** the widest the strip may be at s (m, half-width incl. its margin) without its rows crossing on a
 *  bend: the centreline's radius of curvature there (the tightest within +-8 m), less 25% */
const BEND_CAP: Float32Array = (() => {
  const n = Math.ceil(CL.L) + 41;
  const R = new Float32Array(n);
  const dir = (s: number) => {
    const a = CL.at(s - 0.5);
    const b = CL.at(s + 0.5);
    return Math.atan2(b.x - a.x, b.z - a.z);
  };
  for (let i = 0; i < n; i++) {
    const s = i - 20;
    let d = Math.abs(dir(s + 1) - dir(s - 1));
    if (d > Math.PI) d = Math.PI * 2 - d;
    R[i] = 2 / Math.max(1e-9, d);
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let r = Infinity;
    for (let k = Math.max(0, i - 8); k <= Math.min(n - 1, i + 8); k++) r = Math.min(r, R[k]);
    out[i] = r / 1.25;
  }
  return out;
})();
/** half-width at the rim (m): 4 at the tips, 18-36 along the body (36-72 m across) — wide enough
 *  for the true-size giants (a 26-unit megalodon, a 19-unit giant squid) to turn round in — but
 *  never so wide on a bend that the strip would fold over itself */
export function rimHalfAt(s: number): number {
  const e = taper(s);
  const w = 4 + Math.pow(e, 0.6) * (14 + 18 * noise2(s / 64 + 0.3, 1.7, 301));
  const i = Math.min(BEND_CAP.length - 1, Math.max(0, Math.round(s) + 20));
  return Math.min(w, BEND_CAP[i] - RIM_MARGIN);
}
/** how far the floor sits below the plain (m): shallow at the tips, 86-112 along the body */
export function depthAt(s: number): number {
  const e = taper(s);
  return 1.5 + Math.pow(e, 0.7) * (86 + 26 * noise2(s / 85 + 2.1, 4.2, 302));
}
/** the floor's half-width as a fraction of the rim's */
function floorFrac(s: number): number {
  return 0.24 + 0.16 * noise2(s / 48 + 5, 7.3, 303);
}

/** a terraced wall: 0 at the foot (w = 0) .. 1 at the rim (w = 1), K steps */
function terraces(s: number, side: number, w: number, K: number): number {
  const q = clamp(w * K, 0, K);
  const step = Math.floor(Math.min(K - 1e-6, q));
  const fr = q - step;
  const ledge = 0.3 + 0.28 * noise2(s / 22 + step * 3.3 + side * 7 + K * 11, 5.5, 322); // flat part of each step
  // up the step: a flat shelf (rising just 4% of the step), then a sheer cliff
  const rise = fr < ledge ? (fr / ledge) * 0.04 : 0.04 + 0.96 * smooth(ledge, 1, fr);
  return (step + rise) / K;
}

/**
 * How far below the plain the rock is at (s along, u across; m). 0 at and beyond the rim.
 * Terraced cliffs: each side has 3-4 steps, each a gently sloping ledge then a steep drop, with
 * jagged noise so the edges break up in little buttresses.
 */
export function abyssCut(s: number, u: number): number {
  const rim = rimHalfAt(s);
  const au = Math.abs(u);
  if (au >= rim) return 0;
  const D = depthAt(s);
  const f = floorFrac(s);
  const side = u >= 0 ? 1 : 0;
  const n = au / rim;
  // the floor: a little rubble and a shallow central channel
  const rubble = (noise2(s / 5.5, u / 4 + 40, 310) - 0.5) * 2.4 + (noise2(s / 2.2, u / 1.8, 311) - 0.5) * 0.9;
  const channel = (1 - smooth(0, f * 0.8, n)) * 2.2;
  if (n <= f) return Math.max(0, D + channel - (Math.max(0, rubble) * 0.6 + 0.8) * (1 - smooth(f * 0.75, f, n)));
  // the walls
  const w = (n - f) / (1 - f); // 0 at the foot .. 1 at the rim
  // 3 or 4 steps on this side (blended smoothly where it changes along the crack)
  const k4 = smooth(0.42, 0.58, noise2(s / 70 + side * 9, 2.2, 320));
  let h = terraces(s, side, w, 3) * (1 - k4) + terraces(s, side, w, 4) * k4;
  // the top lip rounds over into the plain (no knife edge)
  h = h + (1 - h) * smooth(0.9, 1, w) * 0.55;
  // jagged buttresses and gullies on the cliffs
  // (mostly varying along the crack, so the shelves stay flat across but their edges break up)
  const jag = (noise2(s / 4.2 + side * 50, w * 1.5, 330) - 0.5) * 0.06 + (noise2(s / 1.7, w * 4 + side * 20, 331) - 0.5) * 0.015;
  h = clamp(h + jag * (1 - smooth(0.85, 1, w)) * smooth(0, 0.08, w), 0, 1);
  // the lip itself goes to exactly 0
  const cut = D * (1 - h) * (1 - smooth(0.965, 1, n));
  return Math.max(0, cut);
}

// ── the grid (rows x columns); the canyon mesh and abyssFloorY share it ──

export interface AbyssGrid {
  rows: number;
  cols: number;
  /** per row: centreline point, unit normal (pointing to +u), half-width of the strip, s */
  cx: Float64Array;
  cz: Float64Array;
  nx: Float64Array;
  nz: Float64Array;
  half: Float64Array;
  s: Float64Array;
  /** vertex heights, row-major: y[i * (cols + 1) + j] */
  y: Float64Array;
}

function buildGrid(): AbyssGrid {
  const s0 = -END_EXT;
  const rows = Math.ceil((CL.L + END_EXT * 2) / ROW_STEP) + 1;
  const cols = COLS;
  const cx = new Float64Array(rows);
  const cz = new Float64Array(rows);
  const nx = new Float64Array(rows);
  const nz = new Float64Array(rows);
  const half = new Float64Array(rows);
  const ss = new Float64Array(rows);
  const y = new Float64Array(rows * (cols + 1));
  for (let i = 0; i < rows; i++) {
    const s = s0 + i * ROW_STEP;
    const p = CL.at(s);
    const a = CL.at(s - 0.5);
    const b = CL.at(s + 0.5);
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const tl = Math.hypot(tx, tz);
    cx[i] = p.x;
    cz[i] = p.z;
    // +u is to the right of the direction of travel: (tz, -tx)
    nx[i] = tz / tl;
    nz[i] = -tx / tl;
    ss[i] = s;
    half[i] = rimHalfAt(s) + RIM_MARGIN;
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j <= cols; j++) {
      const e = (j / cols) * 2 - 1;
      const u = e * half[i];
      const x = cx[i] + nx[i] * u;
      const z = cz[i] + nz[i] * u;
      y[i * (cols + 1) + j] = abyssPlainY(x, z) - abyssCut(ss[i], u);
    }
  return { rows, cols, cx, cz, nx, nz, half, s: ss, y };
}

export const ABYSS_GRID: AbyssGrid = buildGrid();

/** the crack: centreline (every ~12 m), widest width at the rim (m), deepest drop below the plain (m) */
export const ABYSS: { id: string; name: string; path: { x: number; z: number }[]; width: number; depth: number } = (() => {
  const path: { x: number; z: number }[] = [];
  for (let s = 0; s <= CL.L; s += 12) path.push(CL.at(s));
  path.push(CL.at(CL.L));
  let width = 0;
  let depth = 0;
  for (let s = 0; s <= CL.L; s += 1) {
    width = Math.max(width, rimHalfAt(s) * 2);
    depth = Math.max(depth, depthAt(s));
  }
  return { id: "midnight-rift", name: "The Midnight Rift", path, width, depth };
})();

// ── acceleration: which row strips can contain a point ──

const CELL = 8;
const G = ABYSS_GRID;
let minX = Infinity;
let maxX = -Infinity;
let minZ = Infinity;
let maxZ = -Infinity;
for (let i = 0; i < G.rows; i++)
  for (const e of [-1, 1]) {
    const x = G.cx[i] + G.nx[i] * G.half[i] * e;
    const z = G.cz[i] + G.nz[i] * G.half[i] * e;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
/** the strip's bounding box (world xz) */
export const ABYSS_BOUNDS = { minX, maxX, minZ, maxZ };
const GX = Math.ceil((maxX - minX) / CELL) + 1;
const GZ = Math.ceil((maxZ - minZ) / CELL) + 1;
const cellStrips: number[][] = Array.from({ length: GX * GZ }, () => []);
for (let i = 0; i < G.rows - 1; i++) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const r of [i, i + 1])
    for (const e of [-1, 0, 1]) {
      const x = G.cx[r] + G.nx[r] * G.half[r] * e;
      const z = G.cz[r] + G.nz[r] * G.half[r] * e;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
  for (let gx = Math.floor((x0 - minX) / CELL) - 1; gx <= Math.floor((x1 - minX) / CELL) + 1; gx++)
    for (let gz = Math.floor((z0 - minZ) / CELL) - 1; gz <= Math.floor((z1 - minZ) / CELL) + 1; gz++)
      if (gx >= 0 && gz >= 0 && gx < GX && gz < GZ) cellStrips[gz * GX + gx].push(i);
}
// flatten
const cellStart = new Int32Array(GX * GZ + 1);
for (let k = 0; k < GX * GZ; k++) cellStart[k + 1] = cellStart[k] + cellStrips[k].length;
const cellList = new Int32Array(cellStart[GX * GZ]);
for (let k = 0; k < GX * GZ; k++) cellList.set(cellStrips[k], cellStart[k]);

/** where a point sits in the strip: row strip i, a (0..1 between rows i and i+1), e (-1..1 across) */
export interface AbyssHit {
  i: number;
  a: number;
  e: number;
}
const hit: AbyssHit = { i: -1, a: 0, e: 0 };

/** invert the strip between rows i and i+1 at (x, z); true if inside it (fills `out`) */
function inStrip(i: number, x: number, z: number, out: AbyssHit): boolean {
  const cx0 = G.cx[i];
  const cz0 = G.cz[i];
  const dcx = G.cx[i + 1] - cx0;
  const dcz = G.cz[i + 1] - cz0;
  const vx0 = G.nx[i] * G.half[i];
  const vz0 = G.nz[i] * G.half[i];
  const dvx = G.nx[i + 1] * G.half[i + 1] - vx0;
  const dvz = G.nz[i + 1] * G.half[i + 1] - vz0;
  const qx = x - cx0;
  const qz = z - cz0;
  // cross(Q - a dC, V0 + a dV) = 0  ->  A a^2 + B a + C = 0
  const cr = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;
  const A = -cr(dcx, dcz, dvx, dvz);
  const B = cr(qx, qz, dvx, dvz) - cr(dcx, dcz, vx0, vz0);
  const C = cr(qx, qz, vx0, vz0);
  let a: number;
  if (Math.abs(A) < 1e-9) {
    if (Math.abs(B) < 1e-12) return false;
    a = -C / B;
  } else {
    const disc = B * B - 4 * A * C;
    if (disc < 0) return false;
    const sq = Math.sqrt(disc);
    const a1 = (-B + sq) / (2 * A);
    const a2 = (-B - sq) / (2 * A);
    a = Math.abs(a1 - 0.5) < Math.abs(a2 - 0.5) ? a1 : a2;
  }
  if (a < -1e-9 || a > 1 + 1e-9) return false;
  a = clamp(a, 0, 1);
  const vx = vx0 + dvx * a;
  const vz = vz0 + dvz * a;
  const e = ((qx - dcx * a) * vx + (qz - dcz * a) * vz) / (vx * vx + vz * vz);
  if (e < -1 - 1e-9 || e > 1 + 1e-9) return false;
  out.i = i;
  out.a = a;
  out.e = clamp(e, -1, 1);
  return true;
}

/** find the strip cell containing (x, z); null if outside the strip */
export function abyssLocate(x: number, z: number, out: AbyssHit = hit): AbyssHit | null {
  if (x < minX || x > maxX || z < minZ || z > maxZ) return null;
  const gx = Math.floor((x - minX) / CELL);
  const gz = Math.floor((z - minZ) / CELL);
  if (gx < 0 || gz < 0 || gx >= GX || gz >= GZ) return null;
  const k = gz * GX + gx;
  for (let p = cellStart[k]; p < cellStart[k + 1]; p++) if (inStrip(cellList[p], x, z, out)) return out;
  return null;
}

/** world x/z of grid vertex (row i, column j) */
export function abyssVertexX(i: number, j: number): number {
  return G.cx[i] + G.nx[i] * G.half[i] * ((j / G.cols) * 2 - 1);
}
export function abyssVertexZ(i: number, j: number): number {
  return G.cz[i] + G.nz[i] * G.half[i] * ((j / G.cols) * 2 - 1);
}

/** barycentric height in the triangle (ax,az,ay)(bx,bz,by)(cx,cz,cy) at (x, z); NaN if outside */
function tri(x: number, z: number, ax: number, az: number, ay: number, bx: number, bz: number, by: number, cx: number, cz: number, cy: number, tol: number): number {
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(d) < 1e-12) return NaN;
  const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
  const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
  const l3 = 1 - l1 - l2;
  if (l1 < -tol || l2 < -tol || l3 < -tol) return NaN;
  return l1 * ay + l2 * by + l3 * cy;
}

/**
 * The trench floor/walls height where (x, z) is inside the crack's strip (never above the plain,
 * equal to it at the rim and beyond, up to RIM_MARGIN m out), else null. Exactly the canyon mesh:
 * each grid quad is two triangles, (i,j)(i+1,j)(i,j+1) and (i,j+1)(i+1,j)(i+1,j+1).
 */
export function abyssFloorY(x: number, z: number): number | null {
  const h = abyssLocate(x, z, hit);
  if (!h) return null;
  const cols = G.cols;
  const i = h.i;
  const fj = ((h.e + 1) / 2) * cols;
  const j = Math.min(cols - 1, Math.max(0, Math.floor(fj)));
  const W = cols + 1;
  const ax = abyssVertexX(i, j);
  const az = abyssVertexZ(i, j);
  const bx = abyssVertexX(i + 1, j);
  const bz = abyssVertexZ(i + 1, j);
  const cx = abyssVertexX(i, j + 1);
  const cz = abyssVertexZ(i, j + 1);
  const dx = abyssVertexX(i + 1, j + 1);
  const dz = abyssVertexZ(i + 1, j + 1);
  const ya = G.y[i * W + j];
  const yb = G.y[(i + 1) * W + j];
  const yc = G.y[i * W + j + 1];
  const yd = G.y[(i + 1) * W + j + 1];
  let y = tri(x, z, ax, az, ya, bx, bz, yb, cx, cz, yc, 1e-7);
  if (y !== y) y = tri(x, z, cx, cz, yc, bx, bz, yb, dx, dz, yd, 1e-7);
  if (y !== y) {
    // (a hair outside both through rounding: take the nearer)
    y = tri(x, z, ax, az, ya, bx, bz, yb, cx, cz, yc, 1e-3);
    if (y !== y) y = tri(x, z, cx, cz, yc, bx, bz, yb, dx, dz, yd, 1e-3);
    if (y !== y) y = (ya + yb + yc + yd) / 4;
  }
  return y;
}

/** where a point is along the crack: s (m along the centreline) and u (m across, + to the right) */
export interface AbyssCoords {
  s: number;
  u: number;
  /** the rim's half-width here */
  rim: number;
}
const coords: AbyssCoords = { s: 0, u: 0, rim: 0 };

/** (s, u) of a point inside the strip, else null */
export function abyssProject(x: number, z: number, out: AbyssCoords = coords): AbyssCoords | null {
  const h = abyssLocate(x, z, hit);
  if (!h) return null;
  const i = h.i;
  const a = h.a;
  out.s = G.s[i] + (G.s[i + 1] - G.s[i]) * a;
  out.u = h.e * (G.half[i] + (G.half[i + 1] - G.half[i]) * a);
  out.rim = out.u === out.u ? rimHalfAt(out.s) : 0;
  return out;
}

/** the centreline point (x, z) and unit normal (nx, nz: towards +u) at s (interpolated rows) */
export interface AbyssFrame {
  x: number;
  z: number;
  nx: number;
  nz: number;
}
export function abyssFrame(s: number, out: AbyssFrame): AbyssFrame {
  const f = clamp((s + END_EXT) / ROW_STEP, 0, G.rows - 1.000001);
  const i = Math.floor(f);
  const k = f - i;
  out.x = G.cx[i] + (G.cx[i + 1] - G.cx[i]) * k;
  out.z = G.cz[i] + (G.cz[i + 1] - G.cz[i]) * k;
  const nx = G.nx[i] + (G.nx[i + 1] - G.nx[i]) * k;
  const nz = G.nz[i] + (G.nz[i + 1] - G.nz[i]) * k;
  const l = Math.hypot(nx, nz) || 1;
  out.nx = nx / l;
  out.nz = nz / l;
  return out;
}

/**
 * How close (m) (x, z) is to the crack: 0 over it (inside the rim), else the distance out from
 * the rim. For visibility/ambience (approximate far away).
 */
export function abyssDistance(x: number, z: number): number {
  const c = abyssProject(x, z, coords);
  if (c) return Math.max(0, Math.abs(c.u) - c.rim);
  let best = Infinity;
  for (let i = 0; i < G.rows; i++) {
    const d = Math.hypot(x - G.cx[i], z - G.cz[i]) - (G.half[i] - RIM_MARGIN);
    if (d < best) best = d;
  }
  return Math.max(0, best);
}
