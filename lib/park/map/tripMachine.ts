// Advances a planned trip (lib/park/map/planner.ts's TripOption.legs) one step at a time as the
// world actually changes under the kid's feet — a pure reducer, so it's easy to test without a
// real ParkWorld: feed it a tiny "sense" snapshot each tick (pose, and the same train/flight
// getters the HUD already polls) and it tells you which leg is current and when to move to the
// next one. components/park/map/TripBar.tsx owns the ticking; this module just decides.
import type { TripLeg } from "./planner";

/** close enough to a leg's target to call it arrived (a bit more generous than a place's own
 *  doorRadius — the planner's targets are centres, not doorsteps) */
export const ARRIVE_R = 7;
/** how far short of its target the dragon autopilot sets down (ParkWorld's own landing distance —
 *  it reads this number, so the two can never disagree again) */
export const FLY_LAND_R = 22;
/** a flight has arrived once the dragon has landed within its own landing distance (+ its glide) */
export const FLY_ARRIVE_R = FLY_LAND_R + 8;
/** a drive has arrived once the jeep is in the destination's car park */
export const JEEP_ARRIVE_R = 16;

export interface TripSense {
  pose: { x: number; z: number } | null;
  /** riding the Wildlands Railway right now (ParkWorld.onTrain) */
  onTrain: boolean;
  /** standing at a platform able to board/alight (ParkWorld.railStop), or null */
  railStop: { name: string } | null;
  /** the dragon autopilot's current destination label (ParkWorld.flyingTo), or null when not flying there */
  flyingTo: string | null;
}

export interface TripState {
  legIndex: number;
  /** a train leg's own two-phase life: waiting to board, then actually riding */
  boarded: boolean;
  done: boolean;
}

export function startTrip(): TripState {
  return { legIndex: 0, boarded: false, done: false };
}

function arrived(sense: TripSense, x: number, z: number, r = ARRIVE_R): boolean {
  return !!sense.pose && Math.hypot(sense.pose.x - x, sense.pose.z - z) < r;
}

function toNextLeg(state: TripState, legCount: number): TripState {
  const legIndex = state.legIndex + 1;
  return { legIndex, boarded: false, done: legIndex >= legCount };
}

/** One tick: given the current leg and what the world looks like right now, either stay put or
 *  move on to the next leg (never skips more than one leg per call — the caller ticks often
 *  enough, same as the mini-map's own ~8/s poll, that this never matters). */
export function advanceTrip(legs: readonly TripLeg[], state: TripState, sense: TripSense): TripState {
  if (state.done || legs.length === 0 || state.legIndex >= legs.length) return { ...state, done: true };
  const leg = legs[state.legIndex];

  if (leg.mode === "train") {
    if (!state.boarded) return sense.onTrain ? { ...state, boarded: true } : state;
    // boarded: the leg finishes once the kid steps off at (or very near) the right stop
    if (!sense.onTrain && arrived(sense, leg.x, leg.z)) return toNextLeg(state, legs.length);
    return state;
  }

  if (leg.mode === "fly") {
    // the dragon autopilot lands itself; the leg is done once it's no longer flying there and
    // we've actually arrived (covers both "landed on target" and "kid took over early but got there")
    if (!sense.flyingTo && arrived(sense, leg.x, leg.z, FLY_ARRIVE_R)) return toNextLeg(state, legs.length);
    return state;
  }

  // a jeep leg ends in a car park (pulled up anywhere on its apron counts)
  if (leg.mode === "jeep") return arrived(sense, leg.x, leg.z, JEEP_ARRIVE_R) ? toNextLeg(state, legs.length) : state;
  // walk / boat: no special engine hook for these yet, so "arrived" is the one honest signal
  if (arrived(sense, leg.x, leg.z)) return toNextLeg(state, legs.length);
  return state;
}

export interface TripStatus {
  legIndex: number;
  leg: TripLeg | null;
  /** straight-line metres-ish left on this leg (null with no pose yet) */
  remaining: number | null;
  done: boolean;
}

export function tripStatus(legs: readonly TripLeg[], state: TripState, sense: TripSense): TripStatus {
  const leg = state.legIndex < legs.length ? legs[state.legIndex] : null;
  return {
    legIndex: state.legIndex,
    leg,
    remaining: leg && sense.pose ? Math.hypot(sense.pose.x - leg.x, sense.pose.z - leg.z) : null,
    done: state.done,
  };
}
