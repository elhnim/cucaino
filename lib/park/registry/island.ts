// The shape of Cucaino Island, shared by the 3D park (lib/park/world/buildPark.ts), the mini
// map and walk-to routes: a network of natural winding trails (a big loop round the island,
// four trails out from the plaza, a short trail into every land, and the rainforest's and the
// lake's own trails), the river from Rainbow Falls down to Rainbow Lake (./waterways.ts) with
// bridges where trails cross it, and gentle grassy hills in the open meadows. Pure data +
// geometry maths, computed once and deterministic.
import { LANDS, PLACES, type LandDef } from "./places";
import { smooth, segHit, type P2 } from "./geom2d";
import { DUCK_BAY, MESA, OUTLET_HALF, OUTLET_POINTS, RIVER_POINTS, RIVER_WIDTH, WATER_LEVEL, mesaRadius, nearWater, riverAt, waterSdf } from "./waterways";

export type { P2 };
export { smooth };

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
  { id: "quest", pts: [[-3.5, -7.5], [-5.6, -11.9]] as P2[] },
  // a short trail into every land
  ...LANDS.filter((l) => l.id !== "plaza").map((l) => {
    const start = nearestOnLoop(l.x, l.z);
    return { id: `land-${l.id}`, pts: bendy(start, entranceOf(l), (R() - 0.5) * 8) };
  }),
  // ── the rainforest's trails (you walk under the canopy along these; the undergrowth either side
  // is too thick to push through — see ./jungle.ts) ──
  // off the loop, west through the trees to the viewpoint over Rainbow Falls' plunge pool
  { id: "jungle-falls", pts: [nearestOnLoop(-41, 30), [-53, 37.5], [-66, 44.5], [-78, 45.5], [-87.5, 43.5]] as P2[] },
  // a branch south through the deep woods, over the river and down its far bank to the lake
  { id: "jungle-river", pts: [[-66, 44.5], [-71, 56], [-74, 66], [-81, 72], [-92, 76], [-101, 84], [-105.5, 94], [-102, 104], [-91, 112.5], [-76, 117], [-62, 121.5], [-49, 124], [-39, 122.5]] as P2[] },
  // Friends Café's back door, over the river near its mouth, to the lake's south-west shore
  { id: "jungle-friends", pts: [[-56.5, 92.5], [-59, 96.5], [-62, 101.5], [-65, 106.6], [-68, 111.7], [-67, 118], [-58, 122.8], [-49, 124]] as P2[] },
  // ── Rainbow Lake: from the park gate down to its beach and jetty, and round the north shore ──
  { id: "lake-beach", pts: [[0, 67.6], [1.2, 73.5], [0, 79.5]] as P2[] },
  { id: "lake-north", pts: [[0, 79.5], [-13, 80.5], [-26, 82.5], [-38, 87.5], [-48, 92], [-54, 93.5]] as P2[] },
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
  // ... and every land joins the trail ends that arrive at its edge (you walk across a land to its
  // back door: the Friends Café's trail into the rainforest, the gate's trail down to the lake)
  const ends = TRAIL_POINTS.flatMap((pts) => [pts[0], pts[pts.length - 1]]).map(idOf);
  for (const l of LANDS) {
    const here = ends.filter((i) => Math.hypot(nodes[i].p[0] - l.x, nodes[i].p[1] - l.z) < l.radius + 4);
    for (const a of here) for (const b of here) if (a < b && !nodes[a].next.some((n) => n.i === b)) link(a, b);
  }
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

// ── the river (./waterways.ts): from Rainbow Falls' plunge pool through the rainforest into
// Rainbow Lake. The old names stay so every placer keeps avoiding the water. ──
/** the river's centre line (the fauna's bears fish along it, frogs sit on its banks) */
export const STREAM_POINTS: P2[] = RIVER_POINTS;
/** the river's nominal width (it varies a little: see riverHalfWidth) */
export const STREAM_WIDTH = RIVER_WIDTH;
/** the ducks' bay in Rainbow Lake (the fauna's "pond": ducks, the platypus) */
export const POND = { x: DUCK_BAY.x, z: DUCK_BAY.z, r: DUCK_BAY.r };

/** a footbridge where a trail crosses the river or the lake's outlet (true size: ~2.2 m wide) */
export interface Bridge {
  x: number;
  z: number;
  /** the trail's heading over it */
  heading: number;
  /** end to end, bank to bank (units) */
  span: number;
  /** half the deck's width */
  half: number;
  /** deck height at each end and the arch's rise in the middle */
  y0: number;
  y1: number;
  rise: number;
}

/** where a trail crosses the river or the outlet: a bridge goes here (bank to bank, along the trail) */
export const BRIDGES: Bridge[] = (() => {
  const out: Bridge[] = [];
  for (const pts of TRAIL_POINTS) {
    // walk the trail finely; every wet stretch gets a deck from where it gets wet to where it's dry
    const fine: P2[] = [];
    for (let i = 0; i + 1 < pts.length; i++)
      for (let u = 0; u < 1; u += 0.1) fine.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u]);
    fine.push(pts[pts.length - 1]);
    let runStart = -1;
    for (let i = 0; i <= fine.length; i++) {
      const wet = i < fine.length && waterSdf(fine[i][0], fine[i][1]) < 1.1;
      if (wet && runStart < 0) runStart = i;
      if (!wet && runStart >= 0) {
        const a = fine[Math.max(0, runStart - 1)];
        const b = fine[Math.min(fine.length - 1, i)];
        runStart = -1;
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const L = Math.hypot(dx, dz);
        // (a trail just grazing a bank isn't a crossing)
        let deepest = 0;
        for (let k = 0; k <= 10; k++) deepest = Math.min(deepest, waterSdf(a[0] + (dx * k) / 10, a[1] + (dz * k) / 10));
        if (deepest > -1 || L < 2) continue;
        let dev = 0;
        for (let k = Math.max(0, i - 1 - Math.round(L / 0.24)); k < i; k++) dev = Math.max(dev, Math.abs(((fine[k][0] - a[0]) * dz - (fine[k][1] - a[1]) * dx) / L));
        out.push({ x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, heading: Math.atan2(dx, dz), span: L + 1.2, half: Math.max(1.4, dev + 0.7), y0: WATER_LEVEL + 0.72, y1: WATER_LEVEL + 0.72, rise: 0.5 + L * 0.06 });
      }
    }
  }
  return out;
})();

/** the deck height under (x, z) if it's on one of the bridges (else null) */
export function bridgeDeckY(x: number, z: number): number | null {
  for (const b of BRIDGES) {
    const dx = x - b.x;
    const dz = z - b.z;
    const along = dx * Math.sin(b.heading) + dz * Math.cos(b.heading);
    const side = dx * Math.cos(b.heading) - dz * Math.sin(b.heading);
    if (Math.abs(side) > b.half + 0.15 || Math.abs(along) > b.span / 2) continue;
    const u = along / b.span + 0.5;
    return b.y0 + (b.y1 - b.y0) * u + Math.sin(u * Math.PI) * b.rise;
  }
  return null;
}

/** within `pad` of the river, the lake, the plunge pool or the outlet (the old stream + pond helper) */
export function nearStream(x: number, z: number, pad: number): boolean {
  return nearWater(x, z, pad);
}

/** on (or within `pad` of) the Rainbow Falls mesa and its cliffs */
export function nearMesa(x: number, z: number, pad: number): boolean {
  const dx = x - MESA.x;
  const dz = z - MESA.z;
  return Math.hypot(dx, dz) < mesaRadius(Math.atan2(dx, dz)) + 3.6 + pad;
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
    if (nearTrail(x, z, rad + 3) || nearStream(x, z, rad + 2) || nearMesa(x, z, rad + 2)) continue;
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
