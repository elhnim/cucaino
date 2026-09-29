// The shape of Cucaino Island, shared by the 3D park (lib/park/world/buildPark.ts), the mini
// map and walk-to routes: a network of natural winding trails (a big loop round the island,
// four trails out from the plaza, and a short trail into every land), a stream running from
// the Glow Forest down to the sea with bridges where trails cross it, and gentle grassy hills
// in the open meadows. Pure data + geometry maths, computed once and deterministic.
import { LANDS, PLACES, type LandDef } from "./places";

export type P2 = [number, number];

/** grass meets sand here; the sea starts a little further out */
export const ISLAND_R = 152;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Smooth a polyline with Catmull-Rom so trails bend gently (samples every ~step units). */
export function smooth(pts: P2[], step = 2.4, closed = false): P2[] {
  if (pts.length < 2) return pts;
  const out: P2[] = [];
  const n = pts.length;
  const get = (i: number) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

// ── the trail network ──
export interface Trail {
  id: string;
  /** control points (smoothed for drawing and walking) */
  pts: P2[];
  closed?: boolean;
}

const R = rng(20260930);

// the big loop: a wobbly ring through the meadows between the plaza and the lands
const LOOP_R = (a: number) => 58 + Math.sin(a * 3 + 0.6) * 5 + Math.cos(a * 5 + 1.3) * 3;
const loopCtrl: P2[] = Array.from({ length: 22 }, (_, i) => {
  const a = (i / 22) * Math.PI * 2;
  const r = LOOP_R(a);
  return [Math.sin(a) * r, Math.cos(a) * r];
});
const loopPts = smooth(loopCtrl, 2.4, true);

const nearestOnLoop = (x: number, z: number): P2 => {
  let best = loopPts[0];
  let bd = Infinity;
  for (const p of loopPts) {
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
};

/** a trail from a to b with a gentle sideways bend, so nothing runs dead straight */
function bendy(a: P2, b: P2, bend: number): P2[] {
  const mx = (a[0] + b[0]) / 2;
  const mz = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len;
  const nz = dx / len;
  const q1: P2 = [a[0] + dx * 0.33 + nx * bend * 0.8, a[1] + dz * 0.33 + nz * bend * 0.8];
  const q2: P2 = [a[0] + dx * 0.66 - nx * bend * 0.5, a[1] + dz * 0.66 - nz * bend * 0.5];
  return len < 10 ? [a, [mx + nx * bend * 0.3, mz + nz * bend * 0.3], b] : [a, q1, q2, b];
}

/** where the trail arrives at a land: its edge, facing the loop */
function entranceOf(land: LandDef): P2 {
  const [lx, lz] = nearestOnLoop(land.x, land.z);
  const dx = lx - land.x;
  const dz = lz - land.z;
  const d = Math.hypot(dx, dz) || 1;
  return [land.x + (dx / d) * (land.radius - 1), land.z + (dz / d) * (land.radius - 1)];
}

export const TRAILS: Trail[] = [
  { id: "loop", pts: loopCtrl, closed: true },
  // four winding trails from the plaza out to the loop
  ...[0, 1, 2, 3].map((k) => {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4 + 0.2;
    const from: P2 = [Math.sin(a) * 8.3, Math.cos(a) * 8.3];
    const to = nearestOnLoop(Math.sin(a) * 60, Math.cos(a) * 60);
    return { id: `plaza-${k}`, pts: bendy(from, to, (k % 2 ? 1 : -1) * 7) };
  }),
  // plaza -> Quest Board
  { id: "quest", pts: [[0, -8.3], [0, -13.5]] as P2[] },
  // a short trail into every land
  ...LANDS.filter((l) => l.id !== "plaza").map((l) => {
    const start = nearestOnLoop(l.x, l.z);
    return { id: `land-${l.id}`, pts: bendy(start, entranceOf(l), (R() - 0.5) * 8) };
  }),
];

export const LAND_ENTRANCE: Record<string, P2> = Object.fromEntries(LANDS.map((l) => [l.id, entranceOf(l)]));

/** every trail smoothed into walkable points ~2.4 units apart */
export const TRAIL_POINTS: P2[][] = TRAILS.map((t) => smooth(t.pts, 2.4, t.closed));

// ── routing along the trails (Dijkstra over the sampled points) ──
interface Node {
  p: P2;
  next: { i: number; d: number }[];
}
const nodes: Node[] = [];
(() => {
  const key = (p: P2) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
  const index = new Map<string, number>();
  const idOf = (p: P2) => {
    const k = key(p);
    let i = index.get(k);
    if (i === undefined) {
      i = nodes.length;
      nodes.push({ p, next: [] });
      index.set(k, i);
    }
    return i;
  };
  const link = (a: number, b: number) => {
    if (a === b) return;
    const d = Math.hypot(nodes[a].p[0] - nodes[b].p[0], nodes[a].p[1] - nodes[b].p[1]);
    nodes[a].next.push({ i: b, d });
    nodes[b].next.push({ i: a, d });
  };
  TRAILS.forEach((t, ti) => {
    const pts = TRAIL_POINTS[ti];
    const ids = pts.map(idOf);
    for (let i = 0; i + 1 < ids.length; i++) link(ids[i], ids[i + 1]);
    if (t.closed) link(ids[ids.length - 1], ids[0]);
  });
  // stitch trail ends onto whatever trail they touch (junctions)
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].next.length > 1) continue;
    let best = -1;
    let bd = 3.5 * 3.5;
    for (let j = 0; j < nodes.length; j++) {
      if (j === i || nodes[i].next.some((n) => n.i === j)) continue;
      const d = (nodes[i].p[0] - nodes[j].p[0]) ** 2 + (nodes[i].p[1] - nodes[j].p[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    if (best >= 0) link(i, best);
  }
  // the plaza itself joins its four trail starts and the quest trail
  const plazaEnds = nodes.map((n, i) => (Math.hypot(n.p[0], n.p[1]) < 9 ? i : -1)).filter((i) => i >= 0);
  for (const a of plazaEnds) for (const b of plazaEnds) if (a < b) link(a, b);
})();

function nearestNode(x: number, z: number) {
  let best = 0;
  let bd = Infinity;
  nodes.forEach((n, i) => {
    const d = (n.p[0] - x) ** 2 + (n.p[1] - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Walk route from one spot to another along the trails (plus the last few steps off-trail). */
export function routeBetween(from: { x: number; z: number }, to: { x: number; z: number }): P2[] {
  const a = nearestNode(from.x, from.z);
  const b = nearestNode(to.x, to.z);
  const dist = new Float64Array(nodes.length).fill(Infinity);
  const prev = new Int32Array(nodes.length).fill(-1);
  const done = new Uint8Array(nodes.length);
  dist[a] = 0;
  for (let it = 0; it < nodes.length; it++) {
    let u = -1;
    let ud = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < ud) ((ud = dist[i]), (u = i));
    if (u < 0 || u === b) break;
    done[u] = 1;
    for (const e of nodes[u].next) {
      if (dist[u] + e.d < dist[e.i]) {
        dist[e.i] = dist[u] + e.d;
        prev[e.i] = u;
      }
    }
  }
  const path: P2[] = [];
  for (let v = b; v >= 0; v = prev[v]) path.unshift(nodes[v].p);
  // thin it out (every ~3rd point is plenty to walk along)
  const thin = path.filter((_, i) => i % 3 === 0 || i === path.length - 1);
  return [...thin, [to.x, to.z]];
}

export const TRAIL_WIDTH = 3;

/** Is (x, z) within `pad` of any trail? */
export function nearTrail(x: number, z: number, pad: number): boolean {
  const p2 = pad * pad;
  for (const pts of TRAIL_POINTS) for (const p of pts) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < p2) return true;
  return false;
}

// ── the stream: a spring in the Glow Forest, winding across the meadow, under the loop
// trail's bridge, into a lily pond in the inner meadow ──
const forest = LANDS.find((l) => l.id === "forest")!;
export const POND = { x: 40, z: 13, r: 6.5 };
export const STREAM_CTRL: P2[] = [
  [forest.x + 2, forest.z - 10],
  [forest.x + 4, forest.z - 28],
  [forest.x - 4, forest.z - 44],
  [53, 24],
  [POND.x + 3, POND.z + 3],
];
export const STREAM_POINTS: P2[] = smooth(STREAM_CTRL, 1.6);
export const STREAM_WIDTH = 3.4;

function segHit(a: P2, b: P2, c: P2, d: P2): P2 | null {
  const r = [b[0] - a[0], b[1] - a[1]];
  const q = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}

/** where a trail crosses the stream: a bridge goes here (with the trail's heading) */
export const BRIDGES: { x: number; z: number; heading: number }[] = (() => {
  const out: { x: number; z: number; heading: number }[] = [];
  TRAIL_POINTS.forEach((pts) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      for (let j = 0; j + 1 < STREAM_POINTS.length; j++) {
        const hit = segHit(pts[i], pts[i + 1], STREAM_POINTS[j], STREAM_POINTS[j + 1]);
        if (hit && !out.some((b) => Math.hypot(b.x - hit[0], b.z - hit[1]) < 8)) {
          out.push({ x: hit[0], z: hit[1], heading: Math.atan2(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) });
        }
      }
    }
  });
  return out;
})();

export function nearStream(x: number, z: number, pad: number): boolean {
  const p2 = (pad + STREAM_WIDTH / 2) ** 2;
  return Math.hypot(x - POND.x, z - POND.z) < POND.r + pad || STREAM_POINTS.some((p) => (p[0] - x) ** 2 + (p[1] - z) ** 2 < p2);
}

// ── gentle grassy hills in the open meadows (you walk round them, like little mounds) ──
export const HILLS: { x: number; z: number; r: number; h: number }[] = (() => {
  const r = rng(99);
  const out: { x: number; z: number; r: number; h: number }[] = [];
  for (let tries = 0; tries < 900 && out.length < 30; tries++) {
    const a = r() * Math.PI * 2;
    const d = 16 + Math.sqrt(r()) * (ISLAND_R - 24);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const rad = 4 + r() * 7;
    if (nearTrail(x, z, rad + 3) || nearStream(x, z, rad + 2)) continue;
    if (LANDS.some((l) => Math.hypot(x - l.x, z - l.z) < l.radius + rad + 3)) continue;
    if (PLACES.some((p) => Math.hypot(x - p.x, z - p.z) < rad + 6)) continue;
    if (out.some((h) => Math.hypot(h.x - x, h.z - z) < h.r + rad + 4)) continue;
    out.push({ x, z, r: rad, h: 1.2 + r() * 2.2 });
  }
  return out;
})();

/** the island's coastline wobble (shared by the 3D sand edge and the map) */
export function coastR(angle: number): number {
  return ISLAND_R + Math.sin(angle * 4 + 0.5) * 5 + Math.sin(angle * 9 + 2) * 2.5;
}
