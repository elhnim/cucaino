// Shared config for lib/park/engine/ParkWorld.ts's "guided route climb" mode — walking the kid's
// own animal along a real, authored trail on the real terrain (groundY), with a guide roped/walking
// just ahead, a small ambient particle drift, and a short swoop/hop back down at the end. This was
// Everest-only code (boardClimb/tickClimb/endClimb importing registry/everestRoute.ts and
// registry/everestBaseCamp.ts directly); it's generalised here so a second guided route — Parícutin's
// "Climb to the crater!" — just adds an entry below instead of duplicating the engine mode. Adding a
// THIRD guided route later means adding one more entry here, touching nothing in ParkWorld.ts.
//
// Pure data, no three.js (AnimalId is just a string union).
import type { AnimalId } from "../assets/loader";
import { climbHeadingAtU as everestHeadingAtU, climbPointAtU as everestPointAtU } from "./everestRoute";
import { BASE_CAMP_SITE } from "./everestBaseCamp";
import { paricutinHeadingAtU, paricutinPointAtU } from "./paricutinRoute";
import { PARICUTIN_TRAILHEAD } from "./paricutin";
import { muleRouteHeadingAtU, muleRoutePointAtU, CANYON_TRAILHEAD } from "./grandCanyon";

export interface ClimbRouteDef {
  id: string;
  /** (x, z) a fraction `u` (0..1, start -> top) along the route */
  pointAtU(u: number): { x: number; z: number };
  /** the walking heading (atan2(dx, dz) convention) at `u` */
  headingAtU(u: number): number;
  /** where the kid starts, and returns to on an early exit or once the descent lands */
  start: { x: number; z: number };
  /** the guide walking/roped just ahead (a chibi actor, same as any other visitor) */
  guideAnimal: AnimalId;
  guideAccent: string;
  guideHeight: number;
  /** the drifting ambient particles (snow above the snow line on Everest; dust/ash the whole way up
   *  Parícutin's own cone) */
  ambientColor: string;
  /** world Y above which the ambient drift shows — -Infinity shows it the whole route */
  ambientAbove: number;
  /** the swoop/hop back down to `start` once the top's little celebration has run: how long it
   *  takes, and how high its arc rises */
  descendSeconds: number;
  descendArc: number;
  /** the little celebration circle's own orbit radius at the top */
  summitOrbitR: number;
}

export const CLIMB_ROUTES: Record<string, ClimbRouteDef> = {
  everest: {
    id: "everest",
    pointAtU: everestPointAtU,
    headingAtU: everestHeadingAtU,
    start: BASE_CAMP_SITE,
    guideAnimal: "animal-dog" as AnimalId,
    guideAccent: "#c0392b",
    guideHeight: 2.0,
    ambientColor: "#ffffff",
    ambientAbove: 90,
    descendSeconds: 2.2,
    descendArc: 14,
    summitOrbitR: 22,
  },
  paricutin: {
    id: "paricutin",
    pointAtU: paricutinPointAtU,
    headingAtU: paricutinHeadingAtU,
    start: PARICUTIN_TRAILHEAD,
    guideAnimal: "animal-fox" as AnimalId, // the volcanologist guide, in a bright hi-vis orange
    guideAccent: "#e8893c",
    guideHeight: 2.0,
    ambientColor: "#9a9488", // drifting ash
    ambientAbove: -Infinity,
    descendSeconds: 1.5,
    descendArc: 5,
    summitOrbitR: 13,
  },
  "grand-canyon": {
    id: "grand-canyon",
    pointAtU: muleRoutePointAtU,
    headingAtU: muleRouteHeadingAtU,
    start: CANYON_TRAILHEAD,
    guideAnimal: "animal-deer" as AnimalId, // the trail wrangler, leading the mule string
    guideAccent: "#8a6238",
    guideHeight: 1.9,
    ambientColor: "#d9c49a", // a little dust kicked up on the switchbacks
    ambientAbove: -Infinity,
    descendSeconds: 1.8,
    descendArc: 8,
    summitOrbitR: 14,
  },
};

export function climbRouteById(id: string): ClimbRouteDef | undefined {
  return CLIMB_ROUTES[id];
}
