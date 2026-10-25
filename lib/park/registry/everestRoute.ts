// The Climb Everest route: a single polyline, in the REAL world, from Everest Base Camp's trailhead
// up the glacier's edge, through the Khumbu Icefall, past Camp 1-4, up the ridge, to the true summit
// (registry/landform.ts's EVEREST_SUMMIT) — the same ground the kid walks everywhere else in the
// park, not a separate scene. Pure data + maths, deterministic, no three.js: lib/park/engine/
// ParkWorld.ts samples this (plus the real groundY()) to walk the kid's own animal along it, and
// lib/park/world/everestClimbRoute.ts builds the small streamed decorations (camps/ladders/stakes)
// at the same points.
//
// Authored as a handful of CONTROL points along the Base Camp -> summit bearing, each a (radius
// along the bearing, sideways jog) pair — a switchback: a path that zigzags rather than runs
// straight up the glacier's own steep flank, the same way a real mountain trail does. The jogs
// through the Icefall and up the ridge are sharper (shorter radius between reversals) because the
// REAL ground there (registry/landform.ts) is steeper; the camp ledges are each nudged sideways by a
// small local search for the gentlest real ground nearby (findGentleSpot), so they read as a plinth
// to pitch a tent on, not a random point on a 40° face.
import { EVEREST_SUMMIT, footprintStats } from "./landform";
import { BASE_CAMP_SITE } from "./everestBaseCamp";
import { cumLength, smooth, type P2 } from "./geom2d";
import { EVEREST_CAMPS } from "./everestFacts";

/** the heading from Base Camp straight to the true summit — every control point is expressed as
 *  (how far along this heading, how far sideways from it) */
const BEARING = Math.atan2(EVEREST_SUMMIT.x - BASE_CAMP_SITE.x, EVEREST_SUMMIT.z - BASE_CAMP_SITE.z);
const SIDE_X = Math.sin(BEARING + Math.PI / 2);
const SIDE_Z = Math.cos(BEARING + Math.PI / 2);
function along(radius: number, side: number): P2 {
  return [BASE_CAMP_SITE.x + Math.sin(BEARING) * radius + SIDE_X * side, BASE_CAMP_SITE.z + Math.cos(BEARING) * radius + SIDE_Z * side];
}

/** the gentlest real ground within a small arc of `side` offsets at this radius (a local search,
 *  the same idea as every settlement's own site search, just one point instead of a whole village)
 *  — used for every camp ledge so each one sits on the least-steep real patch nearby, not wherever
 *  the switchback's own zigzag formula happens to land */
function findGentleSpot(radius: number, spread: number): { side: number; x: number; z: number; maxSlope: number } {
  let best: { side: number; x: number; z: number; maxSlope: number } | null = null;
  for (let side = -spread; side <= spread; side += 2) {
    const [x, z] = along(radius, side);
    const stats = footprintStats(x, z, 6, 2);
    if (!best || stats.maxSlope < best.maxSlope) best = { side, x, z, maxSlope: stats.maxSlope };
  }
  return best!;
}

// ── the switchback's control points ──
// radius 0 is Base Camp's own trailhead; the summit is forced as the exact last point regardless of
// the formula, so the route always ends precisely on EVEREST_SUMMIT. Everest's own flanks are
// genuinely steep almost everywhere past the Icefall (the real mountain's Lhotse Face is much the
// same) — a wide search (±30-45 units either side of the bearing) finds the single least-bad real
// ledge near each camp's target altitude, not a flat golf green that simply isn't there.
const campIcefall = findGentleSpot(70, 20); // a shelf just past the Icefall's worst of it
const camp1 = findGentleSpot(140, 28);
const camp2 = findGentleSpot(195, 35);
const camp3 = findGentleSpot(245, 45);
const camp4 = findGentleSpot(285, 35);

const CONTROL: P2[] = [
  along(0, 0), // the trailhead, right at Base Camp
  along(22, 6), // into the Icefall
  along(38, -9), // ladder 1 (a crevasse cut)
  along(55, 10), // between the seracs
  along(70, campIcefall.side), // ladder 2, then the Icefall's own gentlest shelf
  along(100, -8),
  along(120, 9),
  [camp1.x, camp1.z],
  along(165, -7),
  [camp2.x, camp2.z],
  along(220, 9),
  [camp3.x, camp3.z],
  along(265, -8),
  [camp4.x, camp4.z],
  along(300, 6), // onto the ridge
  along(318, -5), // fixed-rope switchback
  [EVEREST_SUMMIT.x, EVEREST_SUMMIT.z], // the true summit, exactly
];

/** the route, smoothed and densely sampled (xz only — the real groundY() gives its height) */
export const EVEREST_ROUTE: P2[] = smooth(CONTROL, 5);
const ROUTE_CUM = cumLength(EVEREST_ROUTE);
const ROUTE_LEN = ROUTE_CUM[ROUTE_CUM.length - 1];

/** (x, z) a fraction `u` (0..1, Base Camp -> summit) along the route */
export function climbPointAtU(u: number): { x: number; z: number } {
  const target = Math.max(0, Math.min(1, u)) * ROUTE_LEN;
  let lo = 0;
  let hi = ROUTE_CUM.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ROUTE_CUM[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const segLen = ROUTE_CUM[i] - ROUTE_CUM[i - 1] || 1;
  const t = (target - ROUTE_CUM[i - 1]) / segLen;
  const a = EVEREST_ROUTE[i - 1];
  const b = EVEREST_ROUTE[i];
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t };
}

/** the walking heading (atan2(dx, dz) convention) at `u` along the route */
export function climbHeadingAtU(u: number): number {
  const e = 0.004;
  const a = climbPointAtU(Math.max(0, u - e));
  const b = climbPointAtU(Math.min(1, u + e));
  return Math.atan2(b.x - a.x, b.z - a.z);
}

/** the route's own `u` for the point nearest (x, z) — used to find each camp's REAL fraction along
 *  the route (not an assumed even split): a camp's ledge was sited by findGentleSpot above, wherever
 *  the real ground was gentlest near its target radius, so its exact `u` has to be read back off the
 *  route rather than guessed */
function uOfPoint(x: number, z: number): number {
  let best = Infinity;
  let bestI = 0;
  for (let i = 0; i < EVEREST_ROUTE.length; i++) {
    const d = Math.hypot(EVEREST_ROUTE[i][0] - x, EVEREST_ROUTE[i][1] - z);
    if (d < best) {
      best = d;
      bestI = i;
    }
  }
  return ROUTE_CUM[bestI] / ROUTE_LEN;
}
/** one stop per lib/park/registry/everestFacts.ts's EVEREST_CAMPS — Base Camp (0) and the summit (1)
 *  are fixed; the five in between are each camp's REAL fraction along the route (see uOfPoint),
 *  since every camp ledge sits wherever its own local gentle-ground search actually landed, not at a
 *  uniform 1/6 split. lib/park/climbing/logic.ts's overallProgress() reads these same numbers, so a
 *  camp's world position and its HUD fact card always land together regardless of the spacing. */
export const CLIMB_CAMP_U: number[] = [
  0,
  uOfPoint(campIcefall.x, campIcefall.z),
  uOfPoint(camp1.x, camp1.z),
  uOfPoint(camp2.x, camp2.z),
  uOfPoint(camp3.x, camp3.z),
  uOfPoint(camp4.x, camp4.z),
  1,
];
if (CLIMB_CAMP_U.length !== EVEREST_CAMPS.length) throw new Error("everestRoute: CLIMB_CAMP_U must have one entry per EVEREST_CAMPS stop");
/** the Icefall's own two ladder crossings (crevasse cuts), as `u` fractions within its own leg
 *  (CLIMB_CAMP_U[0]..CLIMB_CAMP_U[1], Base Camp -> the Icefall camp) */
export const CLIMB_LADDER_U: number[] = [CLIMB_CAMP_U[0] + (CLIMB_CAMP_U[1] - CLIMB_CAMP_U[0]) * 0.32, CLIMB_CAMP_U[0] + (CLIMB_CAMP_U[1] - CLIMB_CAMP_U[0]) * 0.68];
/** the ridge's own fixed-rope stretch, as a `u` range (Camp 4 -> the summit) */
export const CLIMB_RIDGE_U: [number, number] = [CLIMB_CAMP_U[5] + (CLIMB_CAMP_U[6] - CLIMB_CAMP_U[5]) * 0.5, 0.995];

/** how far outside the route's own tread (x, z) is — for "stays off the glacier except at a
 *  ladder"-style checks; a crude but cheap nearest-of-samples distance (the route itself is already
 *  densely sampled, ~5-unit steps) */
export function distToClimbRoute(x: number, z: number): number {
  let best = Infinity;
  for (const [rx, rz] of EVEREST_ROUTE) {
    const d = Math.hypot(x - rx, z - rz);
    if (d < best) best = d;
  }
  return best;
}
