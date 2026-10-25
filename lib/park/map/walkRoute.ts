// Where a guided WALK goes, point by point. Inside the park that is the trail graph
// (registry/island.ts's routeBetween); out in the Wildlands there is no trail graph, so the answer
// is a settlement's own footpath when the walk runs between its two ends, and otherwise straight
// there. (The park graph must never be asked about a Wildlands point: it answers with its own
// nearest trail node, which sent a kid standing by the Great Lake a thousand units back to the park.)
import { routeBetween, type P2 } from "../registry/island";
import { FOOTPATHS } from "../registry/footpaths";

/** the park's own trail network only reaches this far from the plaza */
export const PARK_TRAIL_REACH = 170;
const FOOTPATH_END_REACH = 45;

const inPark = (p: { x: number; z: number }) => Math.hypot(p.x, p.z) < PARK_TRAIL_REACH;

export function walkRoute(from: { x: number; z: number }, to: { x: number; z: number }): P2[] {
  if (inPark(from) && inPark(to)) return routeBetween(from, to);
  for (const f of FOOTPATHS) {
    const a = f.points[0];
    const b = f.points[f.points.length - 1];
    const near = (p: { x: number; z: number }, q: P2) => Math.hypot(p.x - q[0], p.z - q[1]) < FOOTPATH_END_REACH;
    if (near(from, a) && near(to, b)) return [...f.points, [to.x, to.z]];
    if (near(from, b) && near(to, a)) return [...f.points.slice().reverse(), [to.x, to.z]];
  }
  return [[to.x, to.z]];
}
