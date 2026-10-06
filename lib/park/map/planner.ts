// The trip planner: "pick any place, see the sensible ways to get there." A small hand-built graph
// of legs (walk / train / fly / boat), not a generic path-solver — the island only really has those
// four ways to travel, and each has its own speed and rules, so reasoning about them directly is
// both simpler and gives better answers than Dijkstra over an undifferentiated graph.
//
// Speeds mirror the engine's real ones (so an ETA is an honest estimate, not a guess): a kid's own
// walking pace is lib/park/engine/ParkWorld.ts's WALK_SPEED (7 units/s); the train is
// lib/park/world/railway/index.ts's TRAIN_V/DWELL (24 units/s, 6s per stop); a dragon's cruise
// speed is lib/park/characters/mounts.ts's MOUNT_CAPS.dragon.speed (x2.6) — these few numbers are
// copied rather than imported because every one of those modules pulls in three.js, which this
// module (and everything that imports it, including the map's lazy-loaded bundle) must stay free
// of. A places.ts/kartTrack.ts comment already uses this same "copy the number, not the module"
// trick for the same reason.
import { routeBetween } from "../registry/island";
import { STATIONS, RAIL_LENGTH, railS, type Station } from "../registry/railway";
import { footpathOf } from "../registry/footpaths";
import { MAP_DOCKS, type MapEntity } from "./entities";
import { CAR_PARKS, type CarPark } from "../registry/roads";

export const WALK_SPEED = 7;
/** a winding Wildlands walk (no mapped trail) is never quite as direct as the crow flies */
const WILD_WALK_WIGGLE = 1.35;
export const TRAIN_SPEED = 24;
export const TRAIN_DWELL_S = 6;
/** (walk speed x the dragon's own speed x its autopilot boost: ParkWorld flies a map trip at this) */
export const FLY_SPEED = 7 * 2.6 * 2.6;
export const BOAT_SPEED = 7 * 2.6;
export const JEEP_SPEED = 7 * 2.6;
/** a last-mile walk this long or longer from a station is worth a jeep instead */
const JEEP_WORTHWHILE_DIST = 26;

/** the park's own trail network only reaches this far from the plaza (island.ts's ISLAND_R-ish
 *  footprint); past it, routeBetween's answer isn't meaningful and a wiggled straight line is the
 *  honest estimate */
const PARK_TRAIL_REACH = 170;

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** walking distance between two points, in world units: the real trail length inside the park,
 *  a wiggled straight line out in the Wildlands (there's no single walked graph covering every
 *  footpath/cart road/open meadow out there yet — see the module comment) */
function walkDistance(from: { x: number; z: number }, to: { x: number; z: number }): number {
  if (Math.hypot(from.x, from.z) < PARK_TRAIL_REACH && Math.hypot(to.x, to.z) < PARK_TRAIL_REACH) {
    const route = routeBetween(from, to);
    let d = 0;
    for (let i = 1; i < route.length; i++) d += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
    return d;
  }
  return dist(from, to) * WILD_WALK_WIGGLE;
}

function nearestStation(p: { x: number; z: number }): Station {
  return STATIONS.reduce((best, s) => (dist(p, s) < dist(p, best) ? s : best), STATIONS[0]);
}

/** how far the train really travels from `a` to `b`: it only ever runs ONE way round the loop
 *  (world/railway always increases s), so this is the forward distance, not the shorter arc */
function railArc(a: Station, b: Station): number {
  let d = b.s - a.s;
  if (d < 0) d += RAIL_LENGTH;
  return d;
}

/** stations the train stops at on the way from `a` to `b` (for a dwell-time estimate) */
function stopsBetween(a: Station, b: Station): number {
  const arc = railArc(a, b);
  return STATIONS.filter((s) => s.id !== a.id && s.id !== b.id && railArc(a, s) < arc).length;
}

const nearestCarPark = (p: { x: number; z: number }): CarPark => CAR_PARKS.reduce((best, c) => (dist(p, c) < dist(p, best) ? c : best), CAR_PARKS[0]);
/** a road winds: this much longer than the straight line between two car parks */
const ROAD_WIGGLE = 1.4;

/** the last mile from a station's platform to a settlement/wonder it serves: the real footpath
 *  when one exists (registry/footpaths.ts), else a wiggled straight line */
function stationToSpot(station: Station, spot: { x: number; z: number }, spotStationId?: string): number {
  if (spotStationId === station.id) {
    const fp = footpathOf(station.id);
    if (fp) {
      let d = 0;
      for (let i = 1; i < fp.points.length; i++) d += Math.hypot(fp.points[i][0] - fp.points[i - 1][0], fp.points[i][1] - fp.points[i - 1][1]);
      return d;
    }
  }
  return dist(station, spot) * WILD_WALK_WIGGLE;
}

export type TripMode = "walk" | "train" | "fly" | "boat" | "jeep";

export interface TripLeg {
  mode: TripMode;
  label: string;
  /** where this leg ends (so the guided trip / mini-HUD arrow has somewhere to point) */
  x: number;
  z: number;
  /** what to tell the kid to do (walk legs auto-walk; others need a tap/board/alight) */
  instruction: string;
  etaSec: number;
}

export interface TripOption {
  mode: TripMode;
  emoji: string;
  label: string;
  etaMin: number;
  legs: TripLeg[];
}

export interface PlannerContext {
  /** riding a flier right now (ParkWorld.canFlyTo) — only then is "Fly" ever offered, same rule
   *  the old goToDestination() used */
  canFly?: boolean;
}

/** Plan every sensible way from `from` to `to`, fastest first. Always includes a walk (however
 *  slow); adds train when `to` is a station or names one it's served by (`to.stationId`); adds fly
 *  only when `ctx.canFly`; adds boat for remote (sea/sky) destinations. */
export function planTrip(from: { x: number; z: number }, to: MapEntity, ctx: PlannerContext = {}): TripOption[] {
  const out: TripOption[] = [];

  // ── walk ──
  if (!to.remote) {
    const d = walkDistance(from, to);
    out.push({
      mode: "walk",
      emoji: "🚶",
      label: "Walk",
      etaMin: d / WALK_SPEED / 60,
      legs: [{ mode: "walk", label: `Walk to ${to.name}`, x: to.x, z: to.z, instruction: `Walk to ${to.emoji} ${to.name}`, etaSec: d / WALK_SPEED }],
    });
  }

  // ── train (the destination IS a station, or names one) ──
  const targetStationId = to.category === "station" ? to.id : to.stationId;
  if (targetStationId) {
    const targetStation = STATIONS.find((s) => s.id === targetStationId);
    const boardAt = nearestStation(from);
    // (already at the right station: there is no train to take — the walk option covers it)
    if (targetStation && boardAt.id !== targetStation.id) {
      const board = boardAt;
      const toBoard = walkDistance(from, board);
      const arc = railArc(board, targetStation);
      const dwell = stopsBetween(board, targetStation) * TRAIN_DWELL_S;
      const lastMile = targetStationId === to.id ? 0 : stationToSpot(targetStation, to, to.stationId);
      const walkSec = toBoard / WALK_SPEED;
      const rideSec = arc / TRAIN_SPEED + dwell;
      // a jeep goes car park to car park — it can't leave the road — so it is only worth it when the
      // destination's own car park is much nearer the place than the station is
      const cpFrom = nearestCarPark(targetStation);
      const cpTo = nearestCarPark(to);
      const walkOn = dist(cpTo, to) * WILD_WALK_WIGGLE;
      const useJeep = lastMile >= JEEP_WORTHWHILE_DIST && cpTo.id !== cpFrom.id && walkOn < lastMile * 0.6;
      const toJeep = dist(targetStation, cpFrom) * WILD_WALK_WIGGLE;
      const driveSec = (dist(cpFrom, cpTo) * ROAD_WIGGLE) / JEEP_SPEED;
      const lastSec = useJeep ? toJeep / WALK_SPEED + driveSec + walkOn / WALK_SPEED : lastMile / WALK_SPEED;
      const legs: TripLeg[] = [
        { mode: "walk", label: `Walk to ${board.emoji} ${board.name}`, x: board.x, z: board.z, instruction: `Walk to ${board.emoji} ${board.name} and hop on the train`, etaSec: walkSec },
        { mode: "train", label: `Ride to ${targetStation.emoji} ${targetStation.name}`, x: targetStation.x, z: targetStation.z, instruction: `Ride the train to ${targetStation.emoji} ${targetStation.name}`, etaSec: rideSec },
      ];
      if (useJeep) {
        legs.push(
          { mode: "walk", label: "Walk to the jeeps", x: cpFrom.x, z: cpFrom.z, instruction: "Walk to the car park and hop in a jeep 🚙", etaSec: toJeep / WALK_SPEED },
          { mode: "jeep", label: `Drive towards ${to.name}`, x: cpTo.x, z: cpTo.z, instruction: `Drive along the road to the ${to.emoji} ${to.name} car park`, etaSec: driveSec },
          { mode: "walk", label: `Walk to ${to.name}`, x: to.x, z: to.z, instruction: `Park, hop out and walk to ${to.emoji} ${to.name}`, etaSec: walkOn / WALK_SPEED },
        );
      } else if (lastMile > 0.5)
        legs.push({ mode: "walk", label: `Walk to ${to.name}`, x: to.x, z: to.z, instruction: `Walk to ${to.emoji} ${to.name}`, etaSec: lastSec });
      out.push({
        mode: useJeep ? "jeep" : "train",
        emoji: "🚂",
        label: useJeep ? "Train + jeep" : "Train",
        etaMin: (walkSec + rideSec + lastSec) / 60,
        legs,
      });
    }
  }

  // ── fly (only ever offered while actually riding a flier, same rule the HUD already uses) ──
  if (ctx.canFly) {
    const d = dist(from, to);
    out.push({
      mode: "fly",
      emoji: "🐉",
      label: "Fly",
      etaMin: d / FLY_SPEED / 60,
      legs: [{ mode: "fly", label: `Fly to ${to.name}`, x: to.x, z: to.z, instruction: `Fly to ${to.emoji} ${to.name}`, etaSec: d / FLY_SPEED }],
    });
  }

  // ── boat (remote SEA places — far islands, the Abyss — reached from the nearest dock; floating
  // sky islands and mountains are "mountain"-category and need flying, never a boat) ──
  if (to.remote && to.category !== "mountain" && MAP_DOCKS.length) {
    const dock = MAP_DOCKS.reduce((best, dk) => (dist(from, dk) < dist(from, best) ? dk : best), MAP_DOCKS[0]);
    const toDock = walkDistance(from, dock);
    const sail = dist(dock, to);
    out.push({
      mode: "boat",
      emoji: "⛵",
      label: "Boat",
      etaMin: (toDock / WALK_SPEED + sail / BOAT_SPEED) / 60,
      legs: [
        { mode: "walk", label: `Walk to ${dock.name}`, x: dock.x, z: dock.z, instruction: `Walk to ⚓ ${dock.name} and hop on a boat`, etaSec: toDock / WALK_SPEED },
        { mode: "boat", label: `Sail to ${to.name}`, x: to.x, z: to.z, instruction: `Sail to ${to.emoji} ${to.name}`, etaSec: sail / BOAT_SPEED },
      ],
    });
  }

  return out.sort((a, b) => a.etaMin - b.etaMin);
}

/** a friendly "3 min" / "48 s" string for the Trip bar's big buttons */
export function formatEta(etaMin: number): string {
  if (etaMin < 1) return `${Math.max(1, Math.round(etaMin * 60))} s`;
  return `${Math.round(etaMin)} min`;
}
