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

export const WALK_SPEED = 7;
/** a winding Wildlands walk (no mapped trail) is never quite as direct as the crow flies */
const WILD_WALK_WIGGLE = 1.35;
export const TRAIN_SPEED = 24;
export const TRAIN_DWELL_S = 6;
export const FLY_SPEED = 7 * 2.6;
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

/** the shorter way round the loop between two stations, in world units */
function railArc(a: Station, b: Station): number {
  const d = Math.abs(a.s - b.s);
  return Math.min(d, RAIL_LENGTH - d);
}

/** stations strictly between `a` and `b` the short way round the loop (for a dwell-time estimate) */
function stopsBetween(a: Station, b: Station): number {
  const lo = Math.min(a.s, b.s);
  const hi = Math.max(a.s, b.s);
  const short = hi - lo < RAIL_LENGTH - (hi - lo);
  return STATIONS.filter((s) => s.id !== a.id && s.id !== b.id && (short ? s.s > lo && s.s < hi : s.s < lo || s.s > hi)).length;
}

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
    if (targetStation) {
      const board = nearestStation(from);
      const toBoard = walkDistance(from, board);
      const arc = railArc(board, targetStation);
      const dwell = stopsBetween(board, targetStation) * TRAIN_DWELL_S;
      const lastMile = targetStationId === to.id ? 0 : stationToSpot(targetStation, to, to.stationId);
      const walkSec = toBoard / WALK_SPEED;
      const rideSec = arc / TRAIN_SPEED + dwell;
      const useJeep = lastMile >= JEEP_WORTHWHILE_DIST;
      const lastSec = lastMile / (useJeep ? JEEP_SPEED : WALK_SPEED);
      const legs: TripLeg[] = [
        { mode: "walk", label: `Walk to ${board.emoji} ${board.name}`, x: board.x, z: board.z, instruction: `Walk to ${board.emoji} ${board.name} and hop on the train`, etaSec: walkSec },
        { mode: "train", label: `Ride to ${targetStation.emoji} ${targetStation.name}`, x: targetStation.x, z: targetStation.z, instruction: `Ride the train to ${targetStation.emoji} ${targetStation.name}`, etaSec: rideSec },
      ];
      if (lastMile > 0.5)
        legs.push({
          mode: useJeep ? "jeep" : "walk",
          label: useJeep ? `Jeep to ${to.name}` : `Walk to ${to.name}`,
          x: to.x,
          z: to.z,
          instruction: useJeep ? `Hop in a jeep to ${to.emoji} ${to.name}` : `Walk to ${to.emoji} ${to.name}`,
          etaSec: lastSec,
        });
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
