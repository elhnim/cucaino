// The roaming map of Cucaino Island: a graph of a few hundred spots the animals travel between —
// meadows, forest edges, drinking places on the pond / stream / lake shores, the plaza's edges,
// the verges beside every trail and the hillsides — joined wherever an animal of that size can
// walk straight from one to the next. Herds route across the island along it (and so across the
// trails), the kid's "director" sends animals over the path in front of the kid, and a spatial
// hash keeps everybody a polite distance apart. Pure maths, deterministic, allocation-free at run
// time (all scratch is preallocated), no three.js (tested).
import { ISLAND_R, TRAIL_POINTS } from "../../registry/island";
import { groundY } from "../../registry/terrain";
import { fieldAt, openFields, rngOf } from "../storybook/plan";
import { B_BLOCK, B_JUNGLE, B_KEEP, B_LAND, B_OPEN, B_POND, B_SHORE, B_STREAM, B_TRAIL, B_WET, bitsAt, headroomAt, shareAround, slopeOf, type WalkGrid } from "./ground";
import { CLASSES, C_GIANT, C_SMALL } from "./types";

const TAU = Math.PI * 2;

/** what a spot is good for */
export const TAG_OPEN = 1; // grazing in the open
export const TAG_SHADE = 2; // under the trees at the forest edge (rest, midday shade, the night)
export const TAG_WATER = 4; // a drinking place
export const TAG_PLAZA = 8; // the plaza's edges
export const TAG_TRAIL = 16; // the verge beside a trail
export const TAG_HILL = 32; // a hillside (goats)
export const TAG_ROOMY = 64; // big open ground (cows, the safari)
export const TAG_PATH = 128; // on a trail itself (a waypoint for travelling, never a goal)

/** how much room a mover class needs either side, and the steepest ground it takes */
export const CLEAR = [0.35, 0.7, 1.2];
export const CLASS_SLOPE = [0.6, 0.52, 0.46];
/**
 * head room a mover class needs under the trees (units): the medium ones (a stag's antlers, an
 * emu's head ~2.7) duck under nothing lower; the giants (a giraffe's head is 8 units up, an
 * elephant's back 4.5) keep out from under every crown (WalkGrid.crown, CROWN_PAD past the leaves)
 */
export const CLASS_HEAD = [0, 2.9, 9];

export interface RoamGraph {
  n: number;
  x: Float32Array;
  z: Float32Array;
  tag: Uint8Array;
  /** drinking places: which way the water is (yaw) */
  face: Float32Array;
  /** per class: may stand here, CSR neighbours (start / nb / nd), connected component */
  ok: Uint8Array[];
  start: Int32Array[];
  nb: Int16Array[];
  nd: Float32Array[];
  comp: Int16Array[];
  /** seconds (park clock) when an animal last arrived here */
  seen: Float32Array;
  /** how many herds are heading here now */
  resv: Uint8Array;
  // scratch for routing
  dist: Float32Array;
  prev: Int16Array;
  heap: Int16Array;
  hidx: Int16Array;
  done: Uint8Array;
}

/** one cell an animal of this class may stand on */
export function cellOk(g: WalkGrid, cls: number, x: number, z: number): boolean {
  const b = bitsAt(g, x, z);
  if ((b & (B_LAND | B_BLOCK | B_KEEP)) !== B_LAND) return false;
  if (slopeOf(g, x, z) > CLASS_SLOPE[cls]) return false;
  if (cls === C_GIANT && (!(b & (B_OPEN | B_TRAIL)) || b & B_JUNGLE)) return false;
  if (cls !== C_SMALL && headroomAt(g, x, z) < CLASS_HEAD[cls]) return false;
  return true;
}

/** room to stand here (the centre and round it at the class's clearance) */
export function spotOk(g: WalkGrid, cls: number, x: number, z: number): boolean {
  if (!cellOk(g, cls, x, z)) return false;
  const c = CLEAR[cls];
  const k = cls === C_GIANT ? 8 : 4;
  for (let i = 0; i < k; i++) {
    const a = (i / k) * TAU;
    if (!cellOk(g, cls, x + Math.sin(a) * c, z + Math.cos(a) * c)) return false;
  }
  return true;
}

/** can an animal of this class walk straight from a to b */
export function segmentOk(g: WalkGrid, cls: number, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const L = Math.sqrt(dx * dx + dz * dz);
  if (L < 1e-3) return cellOk(g, cls, ax, az);
  const n = Math.ceil(L / 0.8);
  const c = CLEAR[cls];
  const px = (-dz / L) * c;
  const pz = (dx / L) * c;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = ax + dx * u;
    const z = az + dz * u;
    if (!cellOk(g, cls, x, z) || !cellOk(g, cls, x + px, z + pz) || !cellOk(g, cls, x - px, z - pz)) return false;
  }
  return true;
}

/** how much of the straight line from a to b runs under the trees (0..1) */
function coveredShare(g: WalkGrid, ax: number, az: number, bx: number, bz: number): number {
  let c = 0;
  for (let i = 0; i <= 8; i++) {
    const b = bitsAt(g, ax + ((bx - ax) * i) / 8, az + ((bz - az) * i) / 8);
    if (!(b & (B_OPEN | B_TRAIL))) c++;
  }
  return c / 9;
}

/** which way the water is from a shore spot (yaw), or NaN */
function waterYaw(g: WalkGrid, x: number, z: number): number {
  let sx = 0;
  let sz = 0;
  for (let r = 1.5; r <= 5; r += 1.2)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      if (bitsAt(g, x + Math.sin(a) * r, z + Math.cos(a) * r) & (B_WET | B_POND | B_STREAM)) {
        sx += Math.sin(a) / r;
        sz += Math.cos(a) / r;
      }
    }
  return sx * sx + sz * sz > 1e-4 ? Math.atan2(sx, sz) : NaN;
}

export interface RoamOptions {
  seed?: number;
  /** grid spacing of the general spots (m) */
  step?: number;
  /** spots nobody should head for (the sheep's pasture, the paddock ...) */
  avoid?: { x: number; z: number; r: number }[];
}

const MAXN = 900;

export function buildRoamGraph(g: WalkGrid, opts: RoamOptions = {}): RoamGraph {
  const r = rngOf(opts.seed ?? 77123);
  const f = openFields();
  const xs: number[] = [];
  const zs: number[] = [];
  const faces: number[] = [];
  const avoid = opts.avoid ?? [];
  const clearOf = (x: number, z: number, minD: number) => {
    for (let i = 0; i < xs.length; i++) if ((xs[i] - x) ** 2 + (zs[i] - z) ** 2 < minD * minD) return false;
    return true;
  };
  const okHere = (x: number, z: number) => spotOk(g, C_SMALL, x, z) && !(bitsAt(g, x, z) & B_TRAIL) && !avoid.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < o.r * o.r);
  const add = (x: number, z: number, face = NaN) => {
    if (xs.length >= MAXN) return;
    xs.push(x);
    zs.push(z);
    faces.push(face);
  };
  // drinking places along every shore (a few metres apart)
  for (let z = -ISLAND_R; z <= ISLAND_R; z += 2.5)
    for (let x = -ISLAND_R; x <= ISLAND_R; x += 2.5) {
      const jx = x + (r() - 0.5) * 1.5;
      const jz = z + (r() - 0.5) * 1.5;
      if (!(bitsAt(g, jx, jz) & B_SHORE) || !okHere(jx, jz)) continue;
      if (!clearOf(jx, jz, 9)) continue;
      const yaw = waterYaw(g, jx, jz);
      if (Number.isNaN(yaw)) continue;
      add(jx, jz, yaw);
    }
  // verges beside every trail, both sides
  for (const pts of TRAIL_POINTS)
    for (let i = 2; i + 2 < pts.length; i += 5) {
      const [px, pz] = pts[i];
      const [qx, qz] = pts[i + 1];
      const l = Math.hypot(qx - px, qz - pz) || 1;
      const nx = (qz - pz) / l;
      const nz = -(qx - px) / l;
      for (const side of [1, -1])
        for (const off of [5, 7.5]) {
          const x = px + nx * side * off;
          const z = pz + nz * side * off;
          if (okHere(x, z) && clearOf(x, z, 7)) {
            add(x, z);
            break;
          }
        }
    }
  // the plaza's edges
  for (const rad of [17, 22, 27])
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU + rad * 0.1;
      const x = Math.sin(a) * rad;
      const z = Math.cos(a) * rad;
      if (okHere(x, z) && clearOf(x, z, 6)) add(x, z);
    }
  // everywhere else: a jittered grid
  const step = opts.step ?? 10;
  for (let z = -ISLAND_R; z <= ISLAND_R; z += step)
    for (let x = -ISLAND_R; x <= ISLAND_R; x += step)
      for (let t = 0; t < 4; t++) {
        const jx = x + (r() - 0.5) * step * 0.8;
        const jz = z + (r() - 0.5) * step * 0.8;
        if (okHere(jx, jz) && clearOf(jx, jz, step * 0.55)) {
          add(jx, jz);
          break;
        }
      }
  // waypoints on the trails themselves: the herds' highways round the island
  const firstPath = xs.length;
  for (const pts of TRAIL_POINTS)
    for (let i = 0; i < pts.length; i += 2) {
      const [x, z] = pts[i];
      if (!spotOk(g, C_SMALL, x, z)) continue;
      let near = false;
      for (let k = firstPath; k < xs.length && !near; k++) near = (xs[k] - x) ** 2 + (zs[k] - z) ** 2 < 16;
      if (!near) add(x, z);
    }
  const n = xs.length;
  const G: RoamGraph = {
    n,
    x: Float32Array.from(xs),
    z: Float32Array.from(zs),
    tag: new Uint8Array(n),
    face: Float32Array.from(faces),
    ok: [],
    start: [],
    nb: [],
    nd: [],
    comp: [],
    seen: new Float32Array(n).fill(-1e4),
    resv: new Uint8Array(n),
    dist: new Float32Array(n),
    prev: new Int16Array(n),
    heap: new Int16Array(n + 1),
    hidx: new Int16Array(n),
    done: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) {
    const x = G.x[i];
    const z = G.z[i];
    const b = bitsAt(g, x, z);
    if (i >= firstPath) {
      G.tag[i] = TAG_PATH;
      continue;
    }
    let t = 0;
    const open = shareAround(g, x, z, 4, B_OPEN, 1.5);
    if (b & B_OPEN && open > 0.7) t |= TAG_OPEN;
    if (!(b & B_OPEN) && shareAround(g, x, z, 8, B_OPEN | B_LAND, 2) > 0.12) t |= TAG_SHADE;
    if (!Number.isNaN(G.face[i])) t |= TAG_WATER;
    if (Math.hypot(x, z) < 31) t |= TAG_PLAZA;
    const td = fieldAt(f.trail, x, z);
    if (td > 2.5 && td < 10) t |= TAG_TRAIL;
    if (slopeOf(g, x, z) > 0.2 || groundY(x, z) > 9) t |= TAG_HILL;
    if (spotOk(g, C_GIANT, x, z) && shareAround(g, x, z, 7, B_OPEN | B_LAND, 1.5) > 0.7) t |= TAG_ROOMY;
    G.tag[i] = t;
  }
  // edges per class
  const R1 = 17;
  const R2 = 25;
  for (let cls = 0; cls < CLASSES; cls++) {
    const ok = new Uint8Array(n);
    for (let i = 0; i < n; i++) ok[i] = spotOk(g, cls, G.x[i], G.z[i]) ? 1 : 0;
    const lists: number[][] = Array.from({ length: n }, () => []);
    const dl: number[][] = Array.from({ length: n }, () => []);
    // (bigger animals would rather not push through the woods: routes under the canopy cost more,
    // so herds keep to the trails, the verges and the meadows where the kid sees them)
    const link = (i: number, j: number, d0: number) => {
      const d = cls === C_SMALL ? d0 : d0 * (1 + 2.5 * coveredShare(g, G.x[i], G.z[i], G.x[j], G.z[j]));
      lists[i].push(j);
      dl[i].push(d);
      lists[j].push(i);
      dl[j].push(d);
    };
    for (let i = 0; i < n; i++) {
      if (!ok[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (!ok[j]) continue;
        const d = Math.hypot(G.x[i] - G.x[j], G.z[i] - G.z[j]);
        if (d > R1) continue;
        if (segmentOk(g, cls, G.x[i], G.z[i], G.x[j], G.z[j])) link(i, j, d);
      }
    }
    // the lonely ones reach a little further
    for (let i = 0; i < n; i++) {
      if (!ok[i] || lists[i].length >= 3) continue;
      for (let j = 0; j < n; j++) {
        if (j === i || !ok[j] || lists[i].includes(j)) continue;
        const d = Math.hypot(G.x[i] - G.x[j], G.z[i] - G.z[j]);
        if (d <= R1 || d > R2) continue;
        if (segmentOk(g, cls, G.x[i], G.z[i], G.x[j], G.z[j])) link(i, j, d);
      }
    }
    const start = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) start[i + 1] = start[i] + lists[i].length;
    const nb = new Int16Array(start[n]);
    const nd = new Float32Array(start[n]);
    for (let i = 0; i < n; i++)
      for (let k = 0; k < lists[i].length; k++) {
        nb[start[i] + k] = lists[i][k];
        nd[start[i] + k] = dl[i][k];
      }
    const comp = new Int16Array(n).fill(-1);
    let c = 0;
    const stack: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!ok[i] || comp[i] >= 0) continue;
      comp[i] = c;
      stack.push(i);
      while (stack.length) {
        const u = stack.pop()!;
        for (let k = start[u]; k < start[u + 1]; k++) {
          const v = nb[k];
          if (comp[v] < 0) {
            comp[v] = c;
            stack.push(v);
          }
        }
      }
      c++;
    }
    G.ok.push(ok);
    G.start.push(start);
    G.nb.push(nb);
    G.nd.push(nd);
    G.comp.push(comp);
  }
  return G;
}

/** sizes of the biggest connected parts (per class), for tests and stats */
export function componentSizes(G: RoamGraph, cls: number): number[] {
  const m = new Map<number, number>();
  for (let i = 0; i < G.n; i++) if (G.comp[cls][i] >= 0) m.set(G.comp[cls][i], (m.get(G.comp[cls][i]) ?? 0) + 1);
  return [...m.values()].sort((a, b) => b - a);
}

/**
 * The nearest spot an animal of this class standing at (x, z) can walk straight to (within
 * `maxD`), or -1. Allocation-free (checks the few nearest by a partial scan).
 */
export function nearestNode(G: RoamGraph, g: WalkGrid, cls: number, x: number, z: number, maxD = 30): number {
  const ok = G.ok[cls];
  let lastD = -1;
  for (let tries = 0; tries < 6; tries++) {
    let best = -1;
    let bd = maxD * maxD;
    for (let i = 0; i < G.n; i++) {
      if (!ok[i]) continue;
      const d = (G.x[i] - x) ** 2 + (G.z[i] - z) ** 2;
      if (d < bd && d > lastD) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) return -1;
    // (the first step needs no more room than where it already stands)
    if (bd < 9 || segmentOk(g, C_SMALL, x, z, G.x[best], G.z[best])) return best;
    lastD = bd;
  }
  return -1;
}

// ── routing (Dijkstra on a preallocated binary heap) ──

function heapPush(G: RoamGraph, size: number, v: number): number {
  let i = size + 1;
  G.heap[i] = v;
  G.hidx[v] = i;
  while (i > 1) {
    const p = i >> 1;
    if (G.dist[G.heap[p]] <= G.dist[G.heap[i]]) break;
    const t = G.heap[p];
    G.heap[p] = G.heap[i];
    G.heap[i] = t;
    G.hidx[G.heap[p]] = p;
    G.hidx[G.heap[i]] = i;
    i = p;
  }
  return size + 1;
}
function heapUp(G: RoamGraph, i: number) {
  while (i > 1) {
    const p = i >> 1;
    if (G.dist[G.heap[p]] <= G.dist[G.heap[i]]) break;
    const t = G.heap[p];
    G.heap[p] = G.heap[i];
    G.heap[i] = t;
    G.hidx[G.heap[p]] = p;
    G.hidx[G.heap[i]] = i;
    i = p;
  }
}
function heapPop(G: RoamGraph, size: number): number {
  const top = G.heap[1];
  G.heap[1] = G.heap[size];
  G.hidx[G.heap[1]] = 1;
  size--;
  let i = 1;
  for (;;) {
    const l = i * 2;
    const rr = l + 1;
    let m = i;
    if (l <= size && G.dist[G.heap[l]] < G.dist[G.heap[m]]) m = l;
    if (rr <= size && G.dist[G.heap[rr]] < G.dist[G.heap[m]]) m = rr;
    if (m === i) break;
    const t = G.heap[m];
    G.heap[m] = G.heap[i];
    G.heap[i] = t;
    G.hidx[G.heap[m]] = m;
    G.hidx[G.heap[i]] = i;
    i = m;
  }
  G.hidx[top] = -1;
  return top;
}

/**
 * Shortest route from node `from` to node `to` for the class, written into `out` from `off`
 * (at most `max` nodes, the first being the node after `from`, the last `to`). Returns its
 * length, 0 if `to` can't be reached (or from === to).
 */
export function route(G: RoamGraph, cls: number, from: number, to: number, out: Int16Array, off: number, max: number): number {
  if (from < 0 || to < 0 || from === to) return 0;
  if (G.comp[cls][from] < 0 || G.comp[cls][from] !== G.comp[cls][to]) return 0;
  G.dist.fill(Infinity);
  G.prev.fill(-1);
  G.done.fill(0);
  G.hidx.fill(-1);
  const start = G.start[cls];
  const nb = G.nb[cls];
  const nd = G.nd[cls];
  G.dist[from] = 0;
  let size = heapPush(G, 0, from);
  while (size > 0) {
    const u = heapPop(G, size);
    size--;
    if (u === to) break;
    G.done[u] = 1;
    for (let k = start[u]; k < start[u + 1]; k++) {
      const v = nb[k];
      if (G.done[v]) continue;
      const d = G.dist[u] + nd[k];
      if (d < G.dist[v]) {
        G.dist[v] = d;
        G.prev[v] = u;
        if (G.hidx[v] < 0) size = heapPush(G, size, v);
        else heapUp(G, G.hidx[v]);
      }
    }
  }
  if (G.prev[to] < 0) return 0;
  // count, then write backwards (dropping the far end if it's too long: the herd re-plans)
  let len = 0;
  for (let v = to; v !== from && v >= 0; v = G.prev[v]) len++;
  let skip = Math.max(0, len - max);
  const w = Math.min(len, max);
  let v = to;
  while (skip > 0) {
    v = G.prev[v];
    skip--;
  }
  for (let i = w - 1; i >= 0; i--) {
    out[off + i] = v;
    v = G.prev[v];
  }
  return w;
}

// ── the day ──

export const P_NIGHT = 0;
export const P_DAWN = 1;
export const P_MORNING = 2;
export const P_MIDDAY = 3;
export const P_AFTERNOON = 4;
export const P_DUSK = 5;

/** the part of the day an hour (0..24) falls in */
export function phaseOf(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5 || h >= 21) return P_NIGHT;
  if (h < 7.5) return P_DAWN;
  if (h < 11) return P_MORNING;
  if (h < 15) return P_MIDDAY;
  if (h < 17.5) return P_AFTERNOON;
  return P_DUSK;
}

// ── a spatial hash (4 m cells over the island), rebuilt every frame ──

export const HCELL = 4;
export const HN = 80;
export const HHALF = 160;

export interface SpatialHash {
  head: Int16Array;
  next: Int16Array;
}

export function makeHash(cap: number): SpatialHash {
  return { head: new Int16Array(HN * HN).fill(-1), next: new Int16Array(cap) };
}

export function hashCell(x: number, z: number): number {
  const i = Math.floor((x + HHALF) / HCELL);
  const j = Math.floor((z + HHALF) / HCELL);
  if (i < 0 || j < 0 || i >= HN || j >= HN) return -1;
  return j * HN + i;
}
