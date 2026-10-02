// The rainforest on Cucaino Island's west-south-west side (round Rainbow Falls and the river) and
// the THICKET: between the jungle's trails the undergrowth (ferns, shrubs, roots) is too dense to
// push through, so the kid walks the trails under the canopy. Also the mesa's cliffs, which nobody
// can climb.
//
//   jungleK / inJungle   where the rainforest grows (0..1), for the 3D planters and the camera
//   thicketAt            blocked ground (1-unit grid), with a signed-distance field so the walk
//                        collision slides smoothly along its edge (pushOutOfThicket)
//   findWalkPath         tap-to-walk routing round the thicket (A* over the grid, string-pulled)
//
// Pure data + maths, deterministic, no three.js. Built lazily once (tested in jungle.test.ts).
import { LANDS, PLACES } from "./places";
import { TRAIL_POINTS, coastR } from "./island";
import { smoothstep, type P2 } from "./geom2d";
import { FALLS, LAKE, MESA, lakeRadius, mesaCliff, mesaRadius, waterSdf } from "./waterways";

// ── where the rainforest grows ──
function hash(i: number, j: number, s: number) {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, s: number) {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const u = x - i;
  const v = z - j;
  const a = hash(i, j, s);
  const b = hash(i + 1, j, s);
  const c = hash(i, j + 1, s);
  const d = hash(i + 1, j + 1, s);
  const uu = u * u * (3 - 2 * u);
  const vv = v * v * (3 - 2 * v);
  return a + (b - a) * uu + (c - a) * vv + (a - b - c + d) * uu * vv;
}

/** the rainforest's blobs: the falls valley and a lobe on the western hill */
export const JUNGLE_BLOBS = [
  { x: -99, z: 81, r: 63 },
  { x: -125, z: 24, r: 32 },
  { x: -113, z: -3, r: 15 },
] as const;

/** the falls' viewpoint clearing at the end of the "jungle-falls" trail */
export const FALLS_CLEARING = { x: -87.5, z: 43.5, r: 6.5 } as const;

/** 0..1 how much (x, z) is rainforest (> 0.5 = in it) */
export function jungleK(x: number, z: number): number {
  const n = (vnoise(x / 13, z / 13, 7) - 0.5) * 10 + (vnoise(x / 5, z / 5, 9) - 0.5) * 3;
  let k = 0;
  for (const b of JUNGLE_BLOBS) k = Math.max(k, 1 - smoothstep(b.r - 6, b.r + 2, Math.hypot(x - b.x, z - b.z) + n));
  if (k <= 0) return 0;
  const r = Math.hypot(x, z);
  k *= 1 - smoothstep(coastR(Math.atan2(x, z)) - 14, coastR(Math.atan2(x, z)) - 9, r);
  // every land keeps a meadow round it (Pet Meadow, Friends Café, the Golf Green ...)
  for (const l of LANDS) k *= smoothstep(l.radius + 3, l.radius + 6.5, Math.hypot(x - l.x, z - l.z) + n * 0.3);
  // the lake's shore stays open meadow
  const ldx = x - LAKE.x;
  const ldz = z - LAKE.z;
  k *= smoothstep(3, 7.5, Math.hypot(ldx, ldz) - lakeRadius(Math.atan2(ldx, ldz)) + n * 0.3);
  // no rainforest on the mesa or its cliffs
  const mdx = x - MESA.x;
  const mdz = z - MESA.z;
  const ma = Math.atan2(mdx, mdz);
  k *= smoothstep(mesaCliff(ma) + 0.5, mesaCliff(ma) + 3, Math.hypot(mdx, mdz) - mesaRadius(ma));
  for (const p of PLACES) if (!p.sky) k *= smoothstep(Math.max(p.radius, p.doorRadius) + 3, Math.max(p.radius, p.doorRadius) + 7, Math.hypot(x - p.x, z - p.z));
  return k;
}
export const inJungle = (x: number, z: number, pad = 0) => jungleK(x, z) > 0.5 - Math.min(0.45, pad * 0.06);

// ── the thicket grid ──
export const TG_HALF = 160;
export const TG_N = 320;
/** how far either side of a jungle trail's centre line you can walk (trail + a verge) */
export const TRAIL_CLEAR = 2.9;

interface Thicket {
  /** 1 = can't walk here (thicket or cliff) */
  blocked: Uint8Array;
  /** 1 = the jungle canopy is overhead (for the camera / the 3D) */
  canopy: Uint8Array;
  /** signed distance (units) to blocked ground: > 0 free, < 0 inside */
  sdf: Float32Array;
}
let T: Thicket | null = null;

const cellX = (i: number) => -TG_HALF + i + 0.5;

/** distance from (x, z) to the nearest trail centre line (exact, only trails passing near) */
export function trailDistance(x: number, z: number, max: number): number {
  let best = max * max;
  for (const pts of TRAIL_POINTS)
    for (let i = 0; i + 1 < pts.length; i++) {
      const ax = pts[i][0];
      const az = pts[i][1];
      // quick reject
      if (Math.abs(ax - x) > max + 4 || Math.abs(az - z) > max + 4) continue;
      const ex = pts[i + 1][0] - ax;
      const ez = pts[i + 1][1] - az;
      const l2 = ex * ex + ez * ez || 1;
      const u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
      const d = (ax + ex * u - x) ** 2 + (az + ez * u - z) ** 2;
      if (d < best) best = d;
    }
  return Math.sqrt(best);
}

/** is this on the mesa or its cliff (nobody climbs those) */
function onMesa(x: number, z: number): boolean {
  const dx = x - MESA.x;
  const dz = z - MESA.z;
  const a = Math.atan2(dx, dz);
  return Math.hypot(dx, dz) < mesaRadius(a) + mesaCliff(a) + 0.4;
}

function build(): Thicket {
  const N = TG_N;
  const blocked = new Uint8Array(N * N);
  const canopy = new Uint8Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = cellX(i);
      const z = cellX(j);
      const k = j * N + i;
      if (onMesa(x, z)) {
        blocked[k] = 1;
        continue;
      }
      const jk = jungleK(x, z);
      if (jk <= 0.5) continue;
      canopy[k] = 1;
      // the water's never blocked (wade the shallows, swim the middle), nor its very edge
      if (waterSdf(x, z) < 0.6) continue;
      if (Math.hypot(x - FALLS_CLEARING.x, z - FALLS_CLEARING.z) < FALLS_CLEARING.r) continue;
      // the jungle's ragged edge: a little thinner where it meets the meadow
      if (jk < 0.56) continue;
      if (trailDistance(x, z, TRAIL_CLEAR + 1) < TRAIL_CLEAR) continue;
      blocked[k] = 1;
    }
  // signed distance: chamfer from both sides, then a soft blur so the wall is smooth to slide along
  const BIG = 1e5;
  const out = new Float32Array(N * N);
  const inn = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) {
    out[k] = blocked[k] ? 0 : BIG;
    inn[k] = blocked[k] ? BIG : 0;
  }
  chamfer(out, N);
  chamfer(inn, N);
  const sdf = new Float32Array(N * N);
  // (cell centres: the wall sits half a cell from the first blocked centre)
  for (let k = 0; k < N * N; k++) sdf[k] = blocked[k] ? -(inn[k] - 0.5) : out[k] - 0.5;
  const tmp = new Float32Array(N * N);
  for (let pass = 0; pass < 2; pass++) {
    tmp.set(sdf);
    for (let j = 1; j < N - 1; j++)
      for (let i = 1; i < N - 1; i++) {
        const k = j * N + i;
        tmp[k] = (sdf[k] * 4 + sdf[k - 1] + sdf[k + 1] + sdf[k - N] + sdf[k + N]) / 8;
      }
    sdf.set(tmp);
  }
  return { blocked, canopy, sdf };
}

function chamfer(d: Float32Array, N: number) {
  const a = 1;
  const b = Math.SQRT2;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + a);
      if (j > 0) {
        v = Math.min(v, d[k - N] + a);
        if (i > 0) v = Math.min(v, d[k - N - 1] + b);
        if (i < N - 1) v = Math.min(v, d[k - N + 1] + b);
      }
      d[k] = v;
    }
  for (let j = N - 1; j >= 0; j--)
    for (let i = N - 1; i >= 0; i--) {
      const k = j * N + i;
      let v = d[k];
      if (i < N - 1) v = Math.min(v, d[k + 1] + a);
      if (j < N - 1) {
        v = Math.min(v, d[k + N] + a);
        if (i < N - 1) v = Math.min(v, d[k + N + 1] + b);
        if (i > 0) v = Math.min(v, d[k + N - 1] + b);
      }
      d[k] = v;
    }
}

export function thicketGrid(): Thicket {
  if (!T) T = build();
  return T;
}

const cellIndex = (x: number, z: number) => {
  const i = Math.floor(x + TG_HALF);
  const j = Math.floor(z + TG_HALF);
  return i < 0 || j < 0 || i >= TG_N || j >= TG_N ? -1 : j * TG_N + i;
};

/** can't walk here: the rainforest's thicket (or the mesa's cliffs) */
export function thicketAt(x: number, z: number): boolean {
  const k = cellIndex(x, z);
  return k >= 0 && thicketGrid().blocked[k] === 1;
}
/** under the rainforest's canopy (trails included) */
export function underCanopy(x: number, z: number): boolean {
  const k = cellIndex(x, z);
  return k >= 0 && thicketGrid().canopy[k] === 1;
}

/** signed distance (units) to the thicket's edge: > 0 on walkable ground, < 0 in the thicket */
export function thicketSdf(x: number, z: number): number {
  const g = thicketGrid().sdf;
  const u = x + TG_HALF - 0.5;
  const v = z + TG_HALF - 0.5;
  if (u < 0 || v < 0 || u >= TG_N - 1 || v >= TG_N - 1) return 50;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const a = u - i;
  const b = v - j;
  const k = j * TG_N + i;
  return (g[k] * (1 - a) + g[k + 1] * a) * (1 - b) + (g[k + TG_N] * (1 - a) + g[k + TG_N + 1] * a) * b;
}

/**
 * Keep a walker of radius `r` out of the thicket: if it's too close (or inside), push it back out
 * along the distance field's gradient — so walking into the edge slides along it. Mutates `p`;
 * returns true if it moved it. Allocation-free.
 */
export function pushOutOfThicket(p: { x: number; z: number }, r = 0.55): boolean {
  let moved = false;
  for (let it = 0; it < 3; it++) {
    const d = thicketSdf(p.x, p.z);
    if (d >= r) break;
    const e = 0.5;
    let gx = thicketSdf(p.x + e, p.z) - thicketSdf(p.x - e, p.z);
    let gz = thicketSdf(p.x, p.z + e) - thicketSdf(p.x, p.z - e);
    const gl = Math.hypot(gx, gz);
    if (gl < 1e-5) {
      // deep inside, flat field: hop to the nearest walkable cell
      const f = nearestWalkable(p.x, p.z);
      if (!f) return moved;
      p.x = f[0];
      p.z = f[1];
      return true;
    }
    gx /= gl;
    gz /= gl;
    const push = Math.min(r - d, 6);
    p.x += gx * push;
    p.z += gz * push;
    moved = true;
  }
  return moved;
}

/** the nearest walkable cell centre to (x, z) (a ring search), or null */
export function nearestWalkable(x: number, z: number, maxR = 40): P2 | null {
  const g = thicketGrid();
  const ci = Math.floor(x + TG_HALF);
  const cj = Math.floor(z + TG_HALF);
  for (let r = 0; r <= maxR; r++) {
    let best: P2 | null = null;
    let bd = Infinity;
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= TG_N || j >= TG_N) continue;
        if (g.blocked[j * TG_N + i] || g.sdf[j * TG_N + i] < 0.7) continue;
        const px = cellX(i);
        const pz = cellX(j);
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < bd) ((bd = d), (best = [px, pz]));
      }
    if (best) return best;
  }
  return null;
}

/** is the straight walk from a to b clear of the thicket (sampled every half unit, `r` clearance) */
export function walkClear(ax: number, az: number, bx: number, bz: number, r = 0.4): boolean {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(L / 0.5));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    if (thicketSdf(ax + (bx - ax) * u, az + (bz - az) * u) < r) return false;
  }
  return true;
}

// ── A* over the grid (scratch preallocated on first use) ──
let gScore: Float32Array | null = null;
let fromIdx: Int32Array | null = null;
let heap: Int32Array | null = null;
let heapF: Float32Array | null = null;
let closed: Uint8Array | null = null;
let stamp: Uint32Array | null = null;
let stampNow = 1;
/** water costs more to cross (swimming), so routes prefer the land and the bridges */
const WATER_COST = 2.6;

/**
 * A walking route from (fx, fz) to (tx, tz) that goes round the thicket: [] if the straight line
 * is clear (just walk there), otherwise waypoints (the last is the goal, or the nearest walkable
 * spot to it). Null if it can't be reached.
 */
export function findWalkPath(fx: number, fz: number, tx: number, tz: number): P2[] | null {
  if (thicketSdf(tx, tz) < 0.5) {
    const n = nearestWalkable(tx, tz);
    if (!n) return null;
    tx = n[0];
    tz = n[1];
  }
  if (walkClear(fx, fz, tx, tz)) return [[tx, tz]];
  const g = thicketGrid();
  const N = TG_N;
  const NN = N * N;
  if (!gScore) {
    gScore = new Float32Array(NN);
    fromIdx = new Int32Array(NN);
    heap = new Int32Array(NN);
    heapF = new Float32Array(NN);
    closed = new Uint8Array(NN);
    stamp = new Uint32Array(NN);
  }
  stampNow++;
  const st = stamp!;
  const gs = gScore;
  const fr = fromIdx!;
  const hp = heap!;
  const hf = heapF!;
  const cl = closed!;
  const s0 = nearestWalkable(fx, fz, 6) ?? [fx, fz];
  const si = Math.floor(s0[0] + TG_HALF);
  const sj = Math.floor(s0[1] + TG_HALF);
  const ti = Math.floor(tx + TG_HALF);
  const tj = Math.floor(tz + TG_HALF);
  if (si < 0 || sj < 0 || si >= N || sj >= N || ti < 0 || tj < 0 || ti >= N || tj >= N) return null;
  const start = sj * N + si;
  const goal = tj * N + ti;
  const h = (k: number) => Math.hypot((k % N) - ti, Math.floor(k / N) - tj);
  let size = 0;
  const push = (k: number, f: number) => {
    let i = size++;
    hp[i] = k;
    hf[i] = f;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hf[p] <= hf[i]) break;
      const tk = hp[p];
      const tf = hf[p];
      hp[p] = hp[i];
      hf[p] = hf[i];
      hp[i] = tk;
      hf[i] = tf;
      i = p;
    }
  };
  const pop = () => {
    const top = hp[0];
    size--;
    hp[0] = hp[size];
    hf[0] = hf[size];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < size && hf[l] < hf[m]) m = l;
      if (r < size && hf[r] < hf[m]) m = r;
      if (m === i) break;
      const tk = hp[m];
      const tf = hf[m];
      hp[m] = hp[i];
      hf[m] = hf[i];
      hp[i] = tk;
      hf[i] = tf;
      i = m;
    }
    return top;
  };
  st[start] = stampNow;
  gs[start] = 0;
  fr[start] = -1;
  cl[start] = 0;
  push(start, h(start));
  let found = false;
  const DI = [1, -1, 0, 0, 1, 1, -1, -1];
  const DJ = [0, 0, 1, -1, 1, -1, 1, -1];
  let iters = 0;
  while (size > 0 && iters++ < NN) {
    const u = pop();
    if (st[u] === stampNow && cl[u] === 1) continue;
    cl[u] = 1;
    if (u === goal) {
      found = true;
      break;
    }
    const ui = u % N;
    const uj = (u - ui) / N;
    for (let d = 0; d < 8; d++) {
      const vi = ui + DI[d];
      const vj = uj + DJ[d];
      if (vi < 0 || vj < 0 || vi >= N || vj >= N) continue;
      const v = vj * N + vi;
      if (g.blocked[v] || g.sdf[v] < 0.45) continue;
      // no cutting a corner of the thicket diagonally
      if (d >= 4 && (g.blocked[uj * N + vi] || g.blocked[vj * N + ui])) continue;
      const wet = waterSdf(cellX(vi), cellX(vj)) < -0.8;
      const c = (d >= 4 ? Math.SQRT2 : 1) * (wet ? WATER_COST : 1);
      const ng = gs[u] + c;
      if (st[v] !== stampNow) {
        st[v] = stampNow;
        cl[v] = 0;
        gs[v] = Infinity;
      }
      if (cl[v] || ng >= gs[v]) continue;
      gs[v] = ng;
      fr[v] = u;
      push(v, ng + h(v));
    }
  }
  if (!found) return null;
  // walk back, then string-pull: from each waypoint jump to the farthest cell still in clear view
  const cells: P2[] = [];
  for (let v = goal; v >= 0; v = fr[v]) cells.push([cellX(v % N), cellX(Math.floor(v / N))]);
  cells.reverse();
  cells[cells.length - 1] = [tx, tz];
  const out: P2[] = [];
  let cx = fx;
  let cz = fz;
  let i = 0;
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    while (j > i + 1 && !walkClear(cx, cz, cells[j][0], cells[j][1], 0.5)) j--;
    out.push(cells[j]);
    cx = cells[j][0];
    cz = cells[j][1];
    i = j;
  }
  return out;
}

/** where Rainbow Falls can be seen from (the end of the falls trail) */
export const FALLS_VIEW = { x: FALLS_CLEARING.x, z: FALLS_CLEARING.z, lookX: FALLS.lip.x, lookZ: FALLS.lip.z } as const;
