// The main island's waterways, all at TRUE size (1 m = 1.6 units; the kid is 2.26 units tall):
//
//   Rainbow Falls  a rocky mesa on the west-south-west coast (~21 m high) with a waterfall pouring
//                  off its east face into a deep plunge pool
//   the river      ~6-9 m wide, winding from the plunge pool south-east through the rainforest
//                  into Rainbow Lake: shallow edges you can wade, a deep middle you swim and dive in
//   Rainbow Lake   ~55 x 33 m, just south of the park gate, with a beach and a jetty on its north
//                  shore and a duck bay; it drains to the south-east sea down a short outlet stream
//
// Every water surface sits at the sea's level (WATER_Y), so the engine's swimming, diving and
// under-water camera work the same in the lake as at sea; the terrain (./terrain.ts) carves the
// beds from `waterBedY`. Pure data + maths, deterministic, no three.js (tested in waterways.test.ts).
//
// Queries are O(1): signed distance (negative in the water), bed depth and flow are baked once into
// a 1-unit grid over the waterways' bounding box.
import { cumLength, nearestOnPolyline, smooth, smoothstep, type P2 } from "./geom2d";
import { inWildWater, wildBedY, wildFlowAt, wildWaterBody, wildWaterDepth, wildWaterSdf } from "./wildWater";

/** the sea's surface height (kept in step with terrain.ts WATER_Y, which can't be imported here) */
export const WATER_LEVEL = -0.25;
/** true size: units per real metre */
export const U_PER_M = 1.6;

// ── Rainbow Falls: the mesa and its waterfall ──
export const MESA = { x: -121.5, z: 51, top: 38.5 } as const;
/** the mesa's outline radius toward heading a (atan2(dx, dz) from its centre) */
export function mesaRadius(a: number): number {
  return 17.5 + 3 * Math.sin(3 * a + 1) + 2 * Math.sin(5 * a + 2);
}
/** how wide the cliff band is round the mesa (steepest where the falls pour over) */
export function mesaCliff(a: number): number {
  const toFalls = Math.cos(a - Math.PI / 2);
  return 3.4 - 1.3 * smoothstep(0.7, 1, toFalls);
}
/** signed distance (approximate, radial) from the mesa's top edge: < 0 on top */
export function mesaEdgeDist(x: number, z: number): number {
  const dx = x - MESA.x;
  const dz = z - MESA.z;
  return Math.hypot(dx, dz) - mesaRadius(Math.atan2(dx, dz));
}

const LIP_A = Math.PI / 2;
const lipR = mesaRadius(LIP_A) - 0.6;
export const FALLS = {
  /** where the water pours over the edge (top of the drop) */
  lip: { x: MESA.x + Math.sin(LIP_A) * lipR, z: MESA.z + Math.cos(LIP_A) * lipR, y: MESA.top - 0.9 },
  /** heading the water falls toward (radians about +Y) */
  heading: LIP_A,
  /** width of the fall at the lip and at the pool */
  width: 8.5,
  widthBottom: 12,
  /** the plunge pool */
  pool: { x: -95.5, z: 52, r: 9.5 },
} as const;
/** the falls drop in real metres (for tests / signs) */
export const FALLS_DROP_M = (FALLS.lip.y - WATER_LEVEL) / U_PER_M;

// ── the river ──
export const RIVER_CTRL: P2[] = [
  [FALLS.pool.x + 1, FALLS.pool.z + 1],
  [-89, 62],
  [-86.5, 74],
  [-92, 87],
  [-86, 98.5],
  [-73, 103],
  [-61, 110],
  [-50, 112.5],
  [-40, 110],
];
export const RIVER_POINTS: P2[] = smooth(RIVER_CTRL, 1.6);
const riverLen = cumLength(RIVER_POINTS);
export const RIVER_LENGTH = riverLen[riverLen.length - 1];
/** half the river's width at distance s (units) along it: wider by the pool and at the mouth */
export function riverHalfWidth(s: number): number {
  const u = s / RIVER_LENGTH;
  const base = 5.85 + 0.6 * Math.sin(s * 0.09 + 1.2) + 0.35 * Math.sin(s * 0.23);
  return base + 1.4 * (1 - smoothstep(0, 0.12, u)) + 1.4 * smoothstep(0.85, 1, u);
}
/** nominal width (for the shared helpers that want one number) */
export const RIVER_WIDTH = 11.4;

// ── Rainbow Lake ──
export const LAKE = { x: 0, z: 106 } as const;
/** the lake's shore radius toward heading a (atan2(dx, dz) from its centre) */
export function lakeRadius(a: number): number {
  const s = Math.sin(a);
  const c = Math.cos(a);
  const rx = s > 0 ? 38 : 43;
  const rz = c > 0 ? 26 : 23.5;
  const e = 1 / Math.sqrt((s / rx) ** 2 + (c / rz) ** 2);
  return e * (1 + 0.065 * Math.sin(3 * a + 0.4) + 0.045 * Math.sin(5 * a + 2.1) + 0.025 * Math.sin(8 * a + 0.7));
}
const LAKE_N = 256;
export const LAKE_OUTLINE: P2[] = Array.from({ length: LAKE_N + 1 }, (_, i) => {
  const a = (i / LAKE_N) * Math.PI * 2;
  const r = lakeRadius(a);
  return [LAKE.x + Math.sin(a) * r, LAKE.z + Math.cos(a) * r] as P2;
});
/** signed distance (approximate, radial) from Rainbow Lake's shore: < 0 in the lake */
export function lakeEdgeDist(x: number, z: number): number {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  return Math.hypot(dx, dz) - lakeRadius(Math.atan2(dx, dz));
}
/** the ducks' quiet bay (fully in the lake; the fauna's "pond") */
export const DUCK_BAY = { x: 17, z: 97, r: 7 } as const;

/** the lake's beach (north shore, below the gate) and its jetty out into the lake */
export const LAKE_BEACH = { x: 0, z: 84.5, r: 11 } as const;
export const JETTY = { ax: 0, az: 81.5, bx: 0, bz: 95.5, half: 1.25, y: WATER_LEVEL + 1.05, headHalf: 4.2 } as const;

// ── the outlet: a short stream from the lake's south-east down to the sea ──
export const OUTLET_CTRL: P2[] = [
  [24, 122],
  [31, 133],
  [36.5, 144],
  [41, 155],
  [45, 168],
];
export const OUTLET_POINTS: P2[] = smooth(OUTLET_CTRL, 1.6);
export const OUTLET_HALF = 3.6;

// ── the baked grid ──
const X0 = -128;
const X1 = 54;
const Z0 = 34;
const Z1 = 172;
const GX = X1 - X0 + 1;
const GZ = Z1 - Z0 + 1;
export const WATER_BODIES = { none: 0, river: 1, lake: 2, pool: 3, outlet: 4 } as const;
/** the box every waterway sits in */
export const WATER_BOUNDS = { x0: X0, x1: X1, z0: Z0, z1: Z1 } as const;

interface Baked {
  sdf: Float32Array;
  depth: Float32Array;
  fx: Float32Array;
  fz: Float32Array;
  body: Uint8Array;
}
let baked: Baked | null = null;

function lakeSdfExact(x: number, z: number): number {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  const inside = Math.hypot(dx, dz) < lakeRadius(Math.atan2(dx, dz));
  const d = nearestOnPolyline(LAKE_OUTLINE, x, z).d;
  return inside ? -d : d;
}

/** max depth (units below the surface) of each body, and how far in its shelf reaches */
const DEPTH = {
  // river: a wadeable shelf along each edge, a deep swimming middle
  river: (d: number, half: number) => {
    const shelf = Math.min(2.2, half * 0.36);
    return 0.3 + 0.42 * smoothstep(0, shelf, -d) + 2.9 * smoothstep(shelf, shelf + 2.6, -d);
  },
  lake: (d: number) => 0.3 + 0.45 * smoothstep(0, 3.2, -d) + 5.6 * smoothstep(3.2, 15, -d),
  pool: (d: number) => 0.4 + 1 * smoothstep(0, 1.6, -d) + 5.8 * smoothstep(1.6, 7.5, -d),
  outlet: (d: number) => 0.3 + 0.7 * smoothstep(0, 1.8, -d) + 0.6 * smoothstep(1.8, 3.2, -d),
};

function bake(): Baked {
  const n = GX * GZ;
  const sdf = new Float32Array(n);
  const depth = new Float32Array(n);
  const fx = new Float32Array(n);
  const fz = new Float32Array(n);
  const body = new Uint8Array(n);
  const P = FALLS.pool;
  for (let j = 0; j < GZ; j++)
    for (let i = 0; i < GX; i++) {
      const x = X0 + i;
      const z = Z0 + j;
      const k = j * GX + i;
      // the river
      const rv = nearestOnPolyline(RIVER_POINTS, x, z);
      const s = riverLen[rv.i] + (riverLen[rv.i + 1] - riverLen[rv.i]) * rv.u;
      const half = riverHalfWidth(s);
      const dR = rv.d - half;
      // the lake, the pool, the outlet
      const dL = lakeSdfExact(x, z);
      const dP = Math.hypot(x - P.x, z - P.z) - P.r;
      const ov = nearestOnPolyline(OUTLET_POINTS, x, z);
      const dO = ov.d - OUTLET_HALF;
      let d = dR;
      let b: number = WATER_BODIES.river;
      if (dL < d) ((d = dL), (b = WATER_BODIES.lake));
      if (dP < d) ((d = dP), (b = WATER_BODIES.pool));
      if (dO < d) ((d = dO), (b = WATER_BODIES.outlet));
      sdf[k] = d;
      body[k] = d < 6 ? b : 0;
      // the deepest of the overlapping bodies wins (smooth where the river meets the lake)
      let dep = 0;
      if (dR < 0) dep = Math.max(dep, DEPTH.river(dR, half));
      if (dL < 0) dep = Math.max(dep, DEPTH.lake(dL));
      if (dP < 0) dep = Math.max(dep, DEPTH.pool(dP));
      if (dO < 0) dep = Math.max(dep, DEPTH.outlet(dO));
      depth[k] = dep;
      // flow (units/s): down the river and the outlet, a slow drift across the lake, the pool churns
      let vx = 0;
      let vz = 0;
      const tang = (pts: P2[], i0: number): P2 => {
        const a = pts[Math.max(0, i0)];
        const c = pts[Math.min(pts.length - 1, i0 + 1)];
        const l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
        return [(c[0] - a[0]) / l, (c[1] - a[1]) / l];
      };
      if (dR < 2) {
        const t = tang(RIVER_POINTS, rv.i);
        // faster in the middle, slower at the edges; quicker where it's narrow
        const sp = (1.15 + (6.2 - half) * 0.18) * (1 - 0.6 * smoothstep(half * 0.55, half, rv.d)) * (1 - smoothstep(0.88, 1, s / RIVER_LENGTH) * 0.6);
        vx += t[0] * sp;
        vz += t[1] * sp;
      }
      if (dO < 2) {
        const t = tang(OUTLET_POINTS, ov.i);
        const sp = 1.3 * (1 - 0.5 * smoothstep(OUTLET_HALF * 0.5, OUTLET_HALF, ov.d)) * smoothstep(-6, 2, dO - dL * 0);
        vx += t[0] * sp;
        vz += t[1] * sp;
      }
      if (dL < 0 && dR > 0 && dO > 0) {
        // a slow drift from the river mouth toward the outlet
        const mx = OUTLET_CTRL[0][0] - RIVER_CTRL[RIVER_CTRL.length - 1][0];
        const mz = OUTLET_CTRL[0][1] - RIVER_CTRL[RIVER_CTRL.length - 1][1];
        const ml = Math.hypot(mx, mz);
        vx += (mx / ml) * 0.12;
        vz += (mz / ml) * 0.12;
      }
      if (dP < 1) {
        // swirling out from where the falls land
        const ax = x - FALLS.lip.x;
        const az = z - FALLS.lip.z;
        const al = Math.hypot(ax, az) || 1;
        vx += (ax / al) * 0.7 + (-az / al) * 0.35;
        vz += (az / al) * 0.7 + (ax / al) * 0.35;
      }
      fx[k] = vx;
      fz[k] = vz;
    }
  return { sdf, depth, fx, fz, body };
}

function grid(): Baked {
  if (!baked) baked = bake();
  return baked;
}

/** bilinear sample of a baked field (off the grid = `far`) */
function sample(f: Float32Array, x: number, z: number, far: number): number {
  const u = x - X0;
  const v = z - Z0;
  if (u < 0 || v < 0 || u >= GX - 1 || v >= GZ - 1) return far;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const a = u - i;
  const b = v - j;
  const k = j * GX + i;
  return (f[k] * (1 - a) + f[k + 1] * a) * (1 - b) + (f[k + GX] * (1 - a) + f[k + GX + 1] * a) * b;
}

/** signed distance (units) to the nearest water's edge: negative in the water, large far away
 *  (the park's waterways, or the Wildlands' great river and lake: ./wildWater.ts) */
export function waterSdf(x: number, z: number): number {
  if (inWildWater(x, z)) return wildWaterSdf(x, z);
  return sample(grid().sdf, x, z, 99);
}
/** is (x, z) within `pad` of the river, the lake, the pool or the outlet */
export function nearWater(x: number, z: number, pad = 0): boolean {
  return waterSdf(x, z) < pad;
}
/** which body (WATER_BODIES) is nearest (x, z), within ~6 units of it */
export function waterBodyAt(x: number, z: number): number {
  if (inWildWater(x, z)) return wildWaterBody(x, z);
  const u = Math.round(x - X0);
  const v = Math.round(z - Z0);
  if (u < 0 || v < 0 || u >= GX || v >= GZ) return 0;
  return grid().body[v * GX + u];
}
/** how deep the water is meant to be at (x, z) (0 on land) */
export function waterDepthAt(x: number, z: number): number {
  if (inWildWater(x, z)) return wildWaterDepth(x, z);
  return sample(grid().depth, x, z, 0);
}
/** the current at (x, z): units/s along x and z (0 out of the water) */
export function flowAt(x: number, z: number, out: { x: number; z: number }): { x: number; z: number } {
  if (inWildWater(x, z)) return wildFlowAt(x, z, out);
  const g = grid();
  out.x = sample(g.fx, x, z, 0);
  out.z = sample(g.fz, x, z, 0);
  return out;
}

/**
 * The ground the terrain should have here because of the waterways (null = leave it alone):
 * the bed under the water (WATER_LEVEL - depth) and the banks rising gently out of it. The
 * terrain takes min(ground, this) so it only ever carves down.
 */
export function waterBedY(x: number, z: number): number | null {
  if (inWildWater(x, z)) return wildBedY(x, z);
  const d = waterSdf(x, z);
  if (d > 9) return null;
  if (d < 0) return WATER_LEVEL - waterDepthAt(x, z);
  // the bank: just proud of the water at the edge, then up to meet the meadow
  const beach = beachK(x, z);
  const slope = 0.32 - 0.2 * beach;
  return WATER_LEVEL + 0.3 + d * slope + Math.max(0, d - 4) * 0.25;
}
/** 0..1 how much (x, z) is on the lake's sandy beach (the north shore below the gate) */
export function beachK(x: number, z: number): number {
  return 1 - smoothstep(LAKE_BEACH.r * 0.6, LAKE_BEACH.r, Math.hypot((x - LAKE_BEACH.x) * 0.75, z - LAKE_BEACH.z));
}

/** the mesa's ground (null = not on or by the mesa): a flat rocky top, cliffs round it */
export function mesaY(x: number, z: number, ground: number): number | null {
  const dx = x - MESA.x;
  const dz = z - MESA.z;
  const r = Math.hypot(dx, dz);
  if (r > 32) return null;
  const a = Math.atan2(dx, dz);
  const R = mesaRadius(a);
  const cliff = mesaCliff(a);
  // a rocky, lumpy top that dips toward the lip (the spring's channel runs down it)
  const lump = Math.sin(x * 0.35 + 1.3) * Math.cos(z * 0.29 - 0.4) * 0.9 + Math.sin(x * 0.9) * Math.sin(z * 0.8) * 0.35;
  const toLip = Math.hypot(x - FALLS.lip.x, z - FALLS.lip.z);
  const channel = (1 - smoothstep(1.2, 3.4, Math.abs(z - FALLS.lip.z))) * smoothstep(MESA.x - 4, FALLS.lip.x, x) * 1.3;
  const top = MESA.top + lump - channel - (1 - smoothstep(0, 6, toLip)) * 0.4;
  if (r <= R) return top;
  if (r >= R + cliff) return null;
  // the cliff face: steep, with a little ledge partway down
  const u = (r - R) / cliff;
  const fall = u < 0.55 ? smoothstep(0, 0.55, u) * 0.62 : 0.62 + smoothstep(0.62, 1, u) * 0.38;
  return Math.max(ground, top + (ground - top) * fall);
}

/** all the waterways' polylines + the lake outline (for the map and the 3D builders) */
export const WATERWAYS = { river: RIVER_POINTS, outlet: OUTLET_POINTS, lake: LAKE_OUTLINE } as const;

/** the river's half width and heading at the river point nearest (x, z) */
export function riverAt(x: number, z: number): { d: number; half: number; s: number; heading: number } {
  const rv = nearestOnPolyline(RIVER_POINTS, x, z);
  const s = riverLen[rv.i] + (riverLen[rv.i + 1] - riverLen[rv.i]) * rv.u;
  const a = RIVER_POINTS[rv.i];
  const b = RIVER_POINTS[Math.min(RIVER_POINTS.length - 1, rv.i + 1)];
  return { d: rv.d, half: riverHalfWidth(s), s, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}
/** the river point (x, z) at distance s along it */
export function riverPointAt(s: number): P2 {
  const t = Math.max(0, Math.min(RIVER_LENGTH, s));
  let i = 0;
  while (i + 2 < riverLen.length && riverLen[i + 1] < t) i++;
  const u = (t - riverLen[i]) / Math.max(1e-6, riverLen[i + 1] - riverLen[i]);
  const a = RIVER_POINTS[i];
  const b = RIVER_POINTS[i + 1];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

// ── the stepping-stone ford across the open lower river, by the lake (hop across!) ──
export interface FordStone {
  x: number;
  z: number;
  r: number;
  /** the stone's flat top */
  y: number;
}
export const FORD_STONES: FordStone[] = (() => {
  const s = RIVER_LENGTH * 0.86;
  const [cx, cz] = riverPointAt(s);
  const [nx, nz] = riverPointAt(s + 1);
  const h = Math.atan2(nx - cx, nz - cz);
  const half = riverHalfWidth(s);
  const out: FordStone[] = [];
  const n = Math.ceil((half * 2 + 1.5) / 1.75);
  for (let i = 0; i <= n; i++) {
    const o = -half - 0.75 + (i * (half * 2 + 1.5)) / n;
    // (a gentle zig-zag, like stones dropped by hand)
    const w = Math.sin(i * 2.1) * 0.35;
    out.push({ x: cx + Math.cos(h) * o + Math.sin(h) * w, z: cz - Math.sin(h) * o + Math.cos(h) * w, r: 0.95 + Math.sin(i * 1.7) * 0.12, y: WATER_LEVEL + 0.28 + Math.sin(i * 1.3) * 0.06 });
  }
  return out;
})();
/** the top of the ford stone under (x, z), if any */
export function fordStoneY(x: number, z: number): number | null {
  for (const st of FORD_STONES) if ((x - st.x) ** 2 + (z - st.z) ** 2 < st.r * st.r) return st.y;
  return null;
}
