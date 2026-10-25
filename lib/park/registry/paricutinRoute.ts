// The "Climb to the crater!" route: a single polyline, in the REAL world, from the trailhead at
// Dionisio's farm (registry/paricutin.ts's PARICUTIN_TRAILHEAD) up the cone's own flank to the
// crater rim (PARICUTIN_RIM) — the same ground the kid walks everywhere else in the park, not a
// separate scene (registry/everestRoute.ts's own pattern, just much shorter: Parícutin's cone is a
// fraction of Everest's size). lib/park/engine/ParkWorld.ts samples this (plus the real groundY())
// to walk the kid's own animal along it.
//
// Authored as a short switchback (a handful of CONTROL points zigzagging side to side as the climb
// goes up), ending exactly on PARICUTIN_RIM.
import { PARICUTIN_RIM, PARICUTIN_TRAILHEAD } from "./paricutin";
import { cumLength, smooth, type P2 } from "./geom2d";
import { PARICUTIN_STOPS } from "./paricutinFacts";

const BEARING = Math.atan2(PARICUTIN_RIM.x - PARICUTIN_TRAILHEAD.x, PARICUTIN_RIM.z - PARICUTIN_TRAILHEAD.z);
const SIDE_X = Math.sin(BEARING + Math.PI / 2);
const SIDE_Z = Math.cos(BEARING + Math.PI / 2);
const CLIMB_LEN = Math.hypot(PARICUTIN_RIM.x - PARICUTIN_TRAILHEAD.x, PARICUTIN_RIM.z - PARICUTIN_TRAILHEAD.z);
function along(radius: number, side: number): P2 {
  return [PARICUTIN_TRAILHEAD.x + Math.sin(BEARING) * radius + SIDE_X * side, PARICUTIN_TRAILHEAD.z + Math.cos(BEARING) * radius + SIDE_Z * side];
}

const CONTROL: P2[] = [
  along(0, 0), // the trailhead, right at the farm's own edge
  along(CLIMB_LEN * 0.22, 9),
  along(CLIMB_LEN * 0.42, -11),
  along(CLIMB_LEN * 0.62, 10),
  along(CLIMB_LEN * 0.82, -8),
  [PARICUTIN_RIM.x, PARICUTIN_RIM.z], // the crater rim, exactly
];

/** the route, smoothed and densely sampled (xz only — the real groundY() gives its height) */
export const PARICUTIN_ROUTE: P2[] = smooth(CONTROL, 3);
const ROUTE_CUM = cumLength(PARICUTIN_ROUTE);
const ROUTE_LEN = ROUTE_CUM[ROUTE_CUM.length - 1];

/** (x, z) a fraction `u` (0..1, trailhead -> crater rim) along the route */
export function paricutinPointAtU(u: number): { x: number; z: number } {
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
  const a = PARICUTIN_ROUTE[i - 1];
  const b = PARICUTIN_ROUTE[i];
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t };
}

/** the walking heading (atan2(dx, dz) convention) at `u` along the route */
export function paricutinHeadingAtU(u: number): number {
  const e = 0.01;
  const a = paricutinPointAtU(Math.max(0, u - e));
  const b = paricutinPointAtU(Math.min(1, u + e));
  return Math.atan2(b.x - a.x, b.z - a.z);
}

/** how far outside the route's own tread (x, z) is — a crude but cheap nearest-of-samples distance,
 *  the same idea as registry/everestRoute.ts's distToClimbRoute */
export function distToParicutinRoute(x: number, z: number): number {
  let best = Infinity;
  for (const [rx, rz] of PARICUTIN_ROUTE) {
    const d = Math.hypot(x - rx, z - rz);
    if (d < best) best = d;
  }
  return best;
}

/** one evenly-spaced `u` per lib/park/registry/paricutinFacts.ts's PARICUTIN_STOPS — the walk is a
 *  short, simple switchback (not Everest's threaded icefall), so an even split reads just as
 *  naturally as a camp-by-camp one */
export const PARICUTIN_STOP_U: number[] = PARICUTIN_STOPS.map((_, i) => i / (PARICUTIN_STOPS.length - 1));
