// The Wildlands Railway: a steam railway loop from Park Station (just past the park's north-east
// edge) out across the Wildlands and back — along the foothills under the Great Ridge to the Great
// Falls, over a trestle bridge across the Wild River to the Great Lake's north shore, on to the Lone
// Peak, south to the Sunny Plains, over the outlet and home. Five stations; the train stops at
// each, and a kid can get on or off at any of them. This is the route on the map (x/z only): the
// rails' heights come from the land under them (terrain.ts railHeights, which also levels the
// ground under the track and the platforms). Pure data + geometry, deterministic.
import { cumLength, smooth, type P2 } from "./geom2d";

export interface Station {
  id: string;
  name: string;
  emoji: string;
  /** the platform's middle (beside the track) */
  x: number;
  z: number;
  /** distance along the loop where the train stops for it */
  s: number;
  /** what it's for (the map and the signs) */
  blurb: string;
}

const CTRL: P2[] = [
  [185, -115],
  [300, -190],
  [430, -262],
  [560, -330],
  [690, -405],
  [810, -470],
  [905, -560],
  [950, -640],
  [1020, -660],
  [1120, -620],
  [1250, -598],
  [1360, -592],
  [1480, -585],
  [1610, -540],
  [1720, -440],
  [1765, -310],
  [1780, -150],
  [1740, 40],
  [1660, 200],
  [1540, 290],
  [1400, 315],
  [1250, 330],
  [1080, 345],
  [900, 335],
  [720, 290],
  [540, 210],
  [390, 120],
  [280, 30],
  [215, -50],
];
/** the loop, sampled every ~3 units (closed: the last point runs back to the first) */
export const RAIL_POINTS: P2[] = smooth(CTRL, 3, true);
const len = cumLength([...RAIL_POINTS, RAIL_POINTS[0]]);
export const RAIL_LENGTH = len[len.length - 1];
/** distance along the loop of point i */
export const railS = (i: number) => len[i];

/** the rail point index and fraction at distance s along the loop (wrapping) */
export function railIndexAt(s: number): { i: number; u: number } {
  let t = s % RAIL_LENGTH;
  if (t < 0) t += RAIL_LENGTH;
  let lo = 0;
  let hi = RAIL_POINTS.length;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (len[m] <= t) lo = m;
    else hi = m;
  }
  const seg = len[lo + 1] - len[lo] || 1;
  return { i: lo, u: (t - len[lo]) / seg };
}
/** where the track is at distance s (x, z) and which way it runs */
export function railAt(s: number, out: { x: number; z: number; dx: number; dz: number } = { x: 0, z: 0, dx: 0, dz: 1 }) {
  const { i, u } = railIndexAt(s);
  const a = RAIL_POINTS[i];
  const b = RAIL_POINTS[(i + 1) % RAIL_POINTS.length];
  out.x = a[0] + (b[0] - a[0]) * u;
  out.z = a[1] + (b[1] - a[1]) * u;
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  out.dx = (b[0] - a[0]) / l;
  out.dz = (b[1] - a[1]) / l;
  return out;
}

// ── nearest point on the loop: segments bucketed in a coarse grid ──
const BK = 64;
const bx0 = Math.min(...RAIL_POINTS.map((p) => p[0])) - 80;
const bz0 = Math.min(...RAIL_POINTS.map((p) => p[1])) - 80;
const BNX = Math.ceil((Math.max(...RAIL_POINTS.map((p) => p[0])) + 80 - bx0) / BK);
const BNZ = Math.ceil((Math.max(...RAIL_POINTS.map((p) => p[1])) + 80 - bz0) / BK);
const BUCKETS: number[][] = (() => {
  const b: number[][] = Array.from({ length: BNX * BNZ }, () => []);
  const R = 80;
  for (let i = 0; i < RAIL_POINTS.length; i++) {
    const a = RAIL_POINTS[i];
    const c = RAIL_POINTS[(i + 1) % RAIL_POINTS.length];
    for (let j = Math.max(0, Math.floor((Math.min(a[1], c[1]) - R - bz0) / BK)); j <= Math.min(BNZ - 1, Math.floor((Math.max(a[1], c[1]) + R - bz0) / BK)); j++)
      for (let k = Math.max(0, Math.floor((Math.min(a[0], c[0]) - R - bx0) / BK)); k <= Math.min(BNX - 1, Math.floor((Math.max(a[0], c[0]) + R - bx0) / BK)); k++) b[j * BNX + k].push(i);
  }
  return b;
})();
const _n = { d: Infinity, s: 0 };
/** the nearest point of the track to (x, z): its distance and its s along the loop (d = Infinity
 *  when the track is more than ~80 units away) */
export function nearestRail(x: number, z: number): { d: number; s: number } {
  _n.d = Infinity;
  _n.s = 0;
  const k = Math.floor((x - bx0) / BK);
  const j = Math.floor((z - bz0) / BK);
  if (k < 0 || j < 0 || k >= BNX || j >= BNZ) return _n;
  let best = Infinity;
  for (const i of BUCKETS[j * BNX + k]) {
    const a = RAIL_POINTS[i];
    const c = RAIL_POINTS[(i + 1) % RAIL_POINTS.length];
    const ex = c[0] - a[0];
    const ez = c[1] - a[1];
    const l2 = ex * ex + ez * ez || 1;
    const u = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2));
    const dx = a[0] + ex * u - x;
    const dz = a[1] + ez * u - z;
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      _n.s = len[i] + (len[i + 1] - len[i]) * u;
    }
  }
  _n.d = Math.sqrt(best);
  return _n;
}
/** is (x, z) within `pad` of the track (its ballast is ~3.4 wide) */
export const nearRail = (x: number, z: number, pad = 0) => nearestRail(x, z).d < 1.7 + pad;

/** the platforms sit this far to the right of the track (facing the way the train runs) */
export const PLATFORM_OFF = 4.2;
/** a platform's length (along the track) and depth */
export const PLATFORM = { len: 22, depth: 4.2 };

const STATION_DEFS: { id: string; name: string; emoji: string; at: P2; blurb: string }[] = [
  { id: "park-station", name: "Park Station", emoji: "🎡", at: [185, -115], blurb: "All aboard for the Wildlands!" },
  { id: "falls-station", name: "Great Falls", emoji: "💦", at: [950, -640], blurb: "The Great Falls and the rainforest." },
  { id: "lake-station", name: "Great Lake", emoji: "🏖️", at: [1430, -588], blurb: "Sandy beaches and a huge lake to swim in." },
  { id: "peak-station", name: "Lone Peak", emoji: "🏔️", at: [1765, -310], blurb: "The tall snowy Lone Peak." },
  { id: "plains-station", name: "Sunny Plains", emoji: "🌻", at: [1600, 240], blurb: "Wide open plains, jeeps to drive." },
];
/** the stations, in the order the train reaches them */
export const STATIONS: Station[] = STATION_DEFS.map((d) => {
  const n = nearestRail(d.at[0], d.at[1]);
  const p = railAt(n.s);
  // (the platform beside the track, on its right)
  return { id: d.id, name: d.name, emoji: d.emoji, blurb: d.blurb, s: n.s, x: p.x + p.dz * PLATFORM_OFF, z: p.z - p.dx * PLATFORM_OFF };
}).sort((a, b) => a.s - b.s);

/** the station whose platform (x, z) is on or by (within `pad`), or null */
export function stationAt(x: number, z: number, pad = 3): Station | null {
  for (const st of STATIONS) {
    const p = railAt(st.s);
    const ax = x - st.x;
    const az = z - st.z;
    const along = ax * p.dx + az * p.dz;
    const across = -ax * p.dz + az * p.dx;
    if (Math.abs(along) < PLATFORM.len / 2 + pad && Math.abs(across) < PLATFORM.depth / 2 + pad) return st;
  }
  return null;
}
