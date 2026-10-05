// Cucaino Karts: the circuit's shape — a closed centerline with a start/finish straight, a
// sweeping right-hander, a hairpin, a little chicane and some esses on the way back. Pure data +
// maths, deterministic, no three.js — exactly like registry/railway.ts's loop (the same
// smooth()/cumLength() helpers, the same indexAt/at pattern for sampling a closed loop by
// distance). This file works in the track's OWN local space (start/finish at (0, 0), heading
// +x first) — lib/park/registry/kartTrack.ts places it on the island and offsets everything into
// world space.
import { cumLength, nearestOnPolyline, smooth, type P2 } from "../registry/geom2d";

export type TrackCornerKind = "sweeper" | "hairpin" | "chicane" | "esses";
export interface TrackCorner {
  kind: TrackCornerKind;
  /** distance range along the lap this corner covers (kerbs/tyre walls/boost timing read this) */
  s0: number;
  s1: number;
}

export interface KartTrack {
  /** the closed centerline, smoothed, local space, ~2 m apart; point 0 is the start/finish line */
  points: P2[];
  /** cumulative distance to each point (point 0 = 0); one extra trailing entry = the full lap length */
  cum: Float64Array;
  /** total lap length (metres) */
  length: number;
  /** the road's width, kerb to kerb */
  width: number;
  corners: TrackCorner[];
  /** glowing boost pads: a short zone centred on `s`, full width */
  boostPads: { s: number; len: number }[];
  /** starting grid slots, behind the line (negative s), alternating sides like a real grid */
  grid: { s: number; lateral: number }[];
  /** the road's own bend radius (m) at each centerline point (huge on the straights) */
  radius: Float64Array;
}

export const TRACK_WIDTH = 11;
/** how far outside the road edge the soft wall (tyres/hay) actually stops a kart */
export const WALL_MARGIN = 2.6;

/** the hand-laid loop, in local space (centred on the origin, so the site's own centre is the
 *  circuit's middle; the start/finish line is on the south straight, heading +x): a long start straight, a fast double-left at the east end, a flick down into the
 *  infield and round a tight hairpin, a run north, a long sweeping left round the west end and a
 *  final left back onto the straight. ~480 m a lap; every stretch of road is at least 13 m clear
 *  of any other (measured), so nothing ever reads as crossing. Fed through the same closed
 *  Catmull-Rom smooth() every other trail/road in the park uses. */
const RAW: P2[] = [
  [-37, -43], // 0: start/finish
  [3, -43], // 1: main straight (boost pad)
  [45, -43], // 2: braking zone
  [68, -39], // 3: turn 1
  [79, -23], // 4
  [79, -3], // 5: turn 2
  [71, 13], // 6
  [53, 21], // 7: short back straight (boost pad)
  [33, 21], // 8
  [17, 11], // 9: the flick into the infield
  [7, -5], // 10
  [-3, -17], // 11: hairpin entry
  [-15, -17], // 12: hairpin
  [-23, -5], // 13: hairpin exit
  [-25, 15], // 14: the run north (boost pad)
  [-31, 33], // 15
  [-45, 43], // 16: the long west sweeper
  [-65, 41], // 17
  [-77, 25], // 18
  [-81, 3], // 19
  [-79, -19], // 20
  [-73, -35], // 21: final corner
  [-59, -43], // 22: back onto the straight
];

function buildCenterline(): { points: P2[]; cum: Float64Array; length: number } {
  const points = smooth(RAW, 2.2, true);
  const cum = cumLength([...points, points[0]]);
  return { points, cum, length: cum[cum.length - 1] };
}

/** how tight the road is at each centerline point: the radius (m) of the circle through it and
 *  its neighbours ~7 m either side (huge on the straights) */
function buildRadii(points: P2[]): Float64Array {
  const n = points.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = points[(i - 3 + n) % n];
    const b = points[i];
    const c = points[(i + 3) % n];
    const A = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const B = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const C = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    out[i] = area < 1e-6 ? 1e6 : Math.min(1e6, (A * B * C) / (4 * area));
  }
  return out;
}

/** nearest raw waypoint's position along the smoothed lap */
function sOfWaypoint(points: P2[], cum: Float64Array, w: P2): number {
  const { i, u } = nearestOnPolyline(points, w[0], w[1]);
  return cum[i] + (cum[i + 1] - cum[i]) * u;
}

function buildTrack(): KartTrack {
  const { points, cum, length } = buildCenterline();
  const radius = buildRadii(points);
  const sAt = (idx: number) => sOfWaypoint(points, cum, RAW[idx]);
  // (corner zones are for the scenery — kerb colours, tyre walls, hay bales — and the map; the
  // driving itself reads the road's real curvature, not these labels)
  const corners: TrackCorner[] = [
    { kind: "sweeper", s0: sAt(2), s1: sAt(7) },
    { kind: "chicane", s0: sAt(8), s1: sAt(11) },
    { kind: "hairpin", s0: sAt(11), s1: sAt(14) - 6 },
    { kind: "esses", s0: sAt(15), s1: sAt(18) },
    { kind: "sweeper", s0: sAt(18), s1: sAt(22) },
  ];
  const boostPads = [
    { s: sAt(1), len: 9 }, // down the main straight
    { s: sAt(7) + 9, len: 8 }, // the short back straight
    { s: sAt(14), len: 8 }, // the run north out of the hairpin
  ];
  // the grid sits behind the line on the main straight (the final corner is ~22 m further back)
  const grid = [0, 1, 2, 3].map((i) => ({ s: -(10 + i * 4.2), lateral: i % 2 === 0 ? -2.3 : 2.3 }));
  return { points, cum, length, width: TRACK_WIDTH, corners, boostPads, grid, radius };
}

let _track: KartTrack | null = null;
/** the one circuit shape, built once (pure + deterministic: same call, same result) */
export function buildKartTrackShape(): KartTrack {
  if (!_track) _track = buildTrack();
  return _track;
}

/** the centerline point index and fraction at distance s along the lap (wrapping) */
export function trackIndexAt(track: KartTrack, s: number): { i: number; u: number } {
  const n = track.points.length;
  let t = s % track.length;
  if (t < 0) t += track.length;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (track.cum[m] <= t) lo = m;
    else hi = m;
  }
  const seg = track.cum[lo + 1] - track.cum[lo] || 1;
  return { i: lo, u: (t - track.cum[lo]) / seg };
}

export interface TrackSample {
  x: number;
  z: number;
  /** unit tangent (direction of travel) */
  dx: number;
  dz: number;
}
/** where the centerline is at distance s along the lap, and which way it runs there */
export function trackAt(track: KartTrack, s: number, out: TrackSample = { x: 0, z: 0, dx: 0, dz: 1 }): TrackSample {
  const { i, u } = trackIndexAt(track, s);
  const n = track.points.length;
  const a = track.points[i];
  const b = track.points[(i + 1) % n];
  out.x = a[0] + (b[0] - a[0]) * u;
  out.z = a[1] + (b[1] - a[1]) * u;
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  out.dx = (b[0] - a[0]) / l;
  out.dz = (b[1] - a[1]) / l;
  return out;
}

export interface NearestOnTrack {
  /** distance along the lap of the nearest centerline point */
  s: number;
  /** signed distance from the centerline: positive = to the LEFT of the way the road runs (the
   *  point sits at centre + (-dz, dx) * lateral for road direction (dx, dz)), negative = right */
  lateral: number;
  /** plain distance to the centerline (|lateral|, roughly) */
  d: number;
}
/** the nearest point on the track to (x, z): brute-force over the (short, ~190-point) centerline —
 *  plenty fast for a handful of karts at 60 fps, no need for railway.ts's spatial buckets */
export function nearestOnTrack(track: KartTrack, x: number, z: number): NearestOnTrack {
  const n = track.points.length;
  let best = Infinity;
  let bi = 0;
  let bu = 0;
  for (let i = 0; i < n; i++) {
    const a = track.points[i];
    const b = track.points[(i + 1) % n];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const l2 = ex * ex + ez * ez || 1;
    const u = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2));
    const dx = a[0] + ex * u - x;
    const dz = a[1] + ez * u - z;
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      bi = i;
      bu = u;
    }
  }
  const a = track.points[bi];
  const b = track.points[(bi + 1) % n];
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const l = Math.hypot(ex, ez) || 1;
  const tx = ex / l;
  const tz = ez / l;
  const px = x - (a[0] + ex * bu);
  const pz = z - (a[1] + ez * bu);
  // cross(tangent, toPoint): positive when the point is to the RIGHT of travel ((x,z) with x=sin,
  // z=cos heading convention — same as everywhere else in the registry). Only its SIGN is used:
  // when the nearest point is clamped to a segment endpoint (the true projection lands beyond it —
  // common for points well off the track, near a corner), the raw cross product under-reports the
  // actual distance (the residual isn't perpendicular to the tangent any more), so `lateral`'s
  // magnitude is pinned to the real distance `d` instead of that raw value.
  const d = Math.sqrt(best);
  const sign = tx * pz - tz * px >= 0 ? 1 : -1;
  const lateral = sign * d;
  const s = track.cum[bi] + (track.cum[bi + 1] - track.cum[bi]) * bu;
  return { s, lateral, d };
}

/** the nearest point on the track to (x, z) searched only near where the kart already was (`sPrev`,
 *  +/- `window` metres of road) — so a kart that's off on the grass between two stretches of road
 *  never "jumps" to the other stretch (that's what used to hand out free laps). Falls back to the
 *  whole-track search if nothing in the window is within `maxD`. */
export function nearestOnTrackNear(track: KartTrack, x: number, z: number, sPrev: number, window = 45, maxD = 40): NearestOnTrack {
  const n = track.points.length;
  const { i: i0 } = trackIndexAt(track, sPrev);
  const span = Math.max(4, Math.ceil(window / (track.length / n)));
  let best = Infinity;
  let bi = i0;
  let bu = 0;
  for (let k = -span; k <= span; k++) {
    const i = (((i0 + k) % n) + n) % n;
    const a = track.points[i];
    const b = track.points[(i + 1) % n];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const l2 = ex * ex + ez * ez || 1;
    const u = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2));
    const dx = a[0] + ex * u - x;
    const dz = a[1] + ez * u - z;
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      bi = i;
      bu = u;
    }
  }
  if (best > maxD * maxD) return nearestOnTrack(track, x, z);
  const a = track.points[bi];
  const b = track.points[(bi + 1) % n];
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const l = Math.hypot(ex, ez) || 1;
  const px = x - (a[0] + ex * bu);
  const pz = z - (a[1] + ez * bu);
  const d = Math.sqrt(best);
  const sign = (ex / l) * pz - (ez / l) * px >= 0 ? 1 : -1;
  return { s: track.cum[bi] + (track.cum[bi + 1] - track.cum[bi]) * bu, lateral: sign * d, d };
}

/** the tightest bend (smallest radius, m) on the road between s0 and s0 + ahead */
export function tightestAhead(track: KartTrack, s0: number, ahead: number): number {
  const n = track.points.length;
  const step = track.length / n;
  const { i } = trackIndexAt(track, s0);
  let r = 1e6;
  for (let k = 0; k * step <= ahead; k++) r = Math.min(r, track.radius[(i + k) % n]);
  return r;
}

/** 0..1 fraction of the lap completed at distance s (wrapping) */
export function progressFraction(track: KartTrack, s: number): number {
  let t = s % track.length;
  if (t < 0) t += track.length;
  return t / track.length;
}

/** is `s` inside a half-open [s0, s1) range that may wrap past the finish line */
export function sInRange(length: number, s: number, s0: number, s1: number): boolean {
  let t = s % length;
  if (t < 0) t += length;
  return s0 <= s1 ? t >= s0 && t < s1 : t >= s0 || t < s1;
}

/** the corner (if any) covering distance `s` along the lap */
export function cornerAt(track: KartTrack, s: number): TrackCorner | null {
  for (const c of track.corners) if (sInRange(track.length, s, c.s0, c.s1)) return c;
  return null;
}

/** is (x, z) on one of the glowing boost pads (lateral kept loose — the pad spans the road) */
export function onBoostPad(track: KartTrack, s: number, lateral: number): boolean {
  if (Math.abs(lateral) > track.width * 0.42) return false;
  for (const p of track.boostPads) if (sInRange(track.length, s, p.s - p.len / 2, p.s + p.len / 2)) return true;
  return false;
}
