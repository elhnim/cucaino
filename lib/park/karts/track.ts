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
}

export const TRACK_WIDTH = 15;
/** how far outside the road edge the soft wall (tyres/hay) actually stops a kart */
export const WALL_MARGIN = 2.4;

/** the hand-laid loop, in local space (start/finish at the origin, heading +x): a back straight
 *  and a front straight on opposite sides of a compact loop (so no feature on one can ever read
 *  as crossing the other), a sweeping right-hander at the east end, a tight hairpin at the west
 *  end, and a flowing esses + a short chicane along the front straight — kept tight (a ~64 m
 *  footprint radius) so the whole circuit fits the real site just outside the park, not a
 *  wide-open stadium. Fed through the same closed Catmull-Rom smooth() every other trail/road in
 *  the park uses, so it reads as one continuous flowing road, not a join-the-dots shape. */
const RAW: P2[] = [
  [0, -31.2], // 0: start/finish, back straight begins, heading +x
  [48, -31.2], // 1: back straight (a boost pad lives here)
  [86.4, -31.2], // 2: back straight ends, into the sweeper
  [103.2, -16.8], // 3: sweeper
  [108, 2.4], // 4: sweeper's apex, the loop's eastmost point
  [103.2, 21.6], // 5: sweeper
  [84, 33.6], // 6: sweeper exit, easing towards the front straight
  [88.8, 40.8], // 7: esses, kick one way
  [74.4, 45.6], // 8: esses, kick back
  [55.2, 38.4], // 9: settled onto the front straight
  [36, 44.4], // 10: chicane, kink right
  [19.2, 31.2], // 11: chicane, kink left
  [2.4, 36], // 12: resettled, running up to the hairpin
  [-12, 24], // 13: hairpin entry
  [-19.2, 0], // 14: hairpin tip, the loop's westmost point
  [-9.6, -19.2], // 15: hairpin exit
  [4.8, -28.8], // 16: back onto the back straight's line, closing the loop
];

function buildCenterline(): { points: P2[]; cum: Float64Array; length: number } {
  const points = smooth(RAW, 2.2, true);
  const cum = cumLength([...points, points[0]]);
  return { points, cum, length: cum[cum.length - 1] };
}

/** nearest raw waypoint's position along the smoothed lap (used only to anchor corner zones to
 *  the hand-laid shape above, so moving a waypoint keeps its corner zone with it) */
function sOfWaypoint(points: P2[], cum: Float64Array, w: P2): number {
  const { i, u } = nearestOnPolyline(points, w[0], w[1]);
  return cum[i] + (cum[i + 1] - cum[i]) * u;
}

function buildTrack(): KartTrack {
  const { points, cum, length } = buildCenterline();
  const sAt = (idx: number) => sOfWaypoint(points, cum, RAW[idx]);
  const rawCorners: TrackCorner[] = [
    { kind: "sweeper", s0: sAt(2) - 8, s1: sAt(6) + 6 },
    { kind: "esses", s0: sAt(6) + 6, s1: sAt(9) - 4 },
    { kind: "chicane", s0: sAt(9) - 4, s1: sAt(12) + 6 },
    // (the hairpin's exit waypoint is only ~30 m before the finish line — just room enough for the
    // starting grid behind it, so this zone stops right at the exit, not past it)
    { kind: "hairpin", s0: sAt(13) - 8, s1: sAt(15) },
  ];
  const corners: TrackCorner[] = rawCorners.map((c) => ({ ...c, s0: ((c.s0 % length) + length) % length, s1: ((c.s1 % length) + length) % length }));
  const boostPads = [
    { s: sAt(1), len: 10 }, // down the back straight
    { s: sAt(6) + 12, len: 8 }, // blasting out of the sweeper
    { s: sAt(12) + 10, len: 8 }, // out of the chicane, onto the run to the hairpin
  ];
  // the grid sits behind the line, on the short straight between the hairpin's exit and the
  // finish (~30 m) — kept well clear of both so no kart starts already mid-corner
  const grid = [0, 1, 2, 3].map((i) => ({ s: -(6 + i * 7), lateral: i % 2 === 0 ? -2.6 : 2.6 }));
  return { points, cum, length, width: TRACK_WIDTH, corners, boostPads, grid };
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
  /** signed distance from the centerline: positive = to the right of travel, negative = left */
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
