// "Ride the Mule Trail!" — the pure state machine behind the guided mule ride down into the Grand
// Canyon (components/park/CanyonRide.tsx is the 2D overlay that drives this; the 3D park keeps
// running behind it, the same shape as lib/park/climbing/logic.ts's "Climb Everest!" and
// lib/park/climbing/volcanoLogic.ts's "Climb to the crater!"). No three.js, no DOM: every function
// here is a plain (state) -> state transform, unit-tested in isolation.
//
// Simpler than Everest's own climb, like Parícutin's: a short guided ride, not an expedition, so
// there's no breath/oxygen meter — every tap just rides a few steps further down, and every
// STEPS_PER_LEG taps arrives at the next rock layer in lib/park/registry/grandCanyon.ts's
// CANYON_LAYERS (in real descending order: the Rim -> Kaibab -> Coconino -> the Esplanade ->
// Redwall -> the Tonto Platform -> the Colorado River).
import { CANYON_LAYERS, type CanyonLayer } from "../registry/grandCanyon";

export { CANYON_LAYERS };
export type { CanyonLayer };

/** taps needed to cross from one rock layer to the next */
export const RIDE_STEPS_PER_LEG = 3;

export interface CanyonRideState {
  /** index into CANYON_LAYERS of the layer just left (0 = still at the trailhead, hasn't set off) */
  layerIndex: number;
  /** taps taken since leaving `layerIndex`'s layer, 0..RIDE_STEPS_PER_LEG */
  stepsIntoLeg: number;
  /** true once the last layer (the river) has been reached */
  arrived: boolean;
}

export function initialCanyonRideState(): CanyonRideState {
  return { layerIndex: 0, stepsIntoLeg: 0, arrived: false };
}

/** the layer the mule just left (or is standing at, if stepsIntoLeg is 0) */
export function currentLayer(state: CanyonRideState): CanyonLayer {
  return CANYON_LAYERS[Math.min(state.layerIndex, CANYON_LAYERS.length - 1)];
}
/** the layer this leg is riding towards (the last layer once arrived) */
export function nextLayer(state: CanyonRideState): CanyonLayer {
  return CANYON_LAYERS[Math.min(state.layerIndex + 1, CANYON_LAYERS.length - 1)];
}

/** 0..1 how far along the WHOLE ride (the trailhead -> the river) the mule has come */
export function rideProgress(state: CanyonRideState): number {
  const legs = CANYON_LAYERS.length - 1;
  const legsDone = state.layerIndex + state.stepsIntoLeg / RIDE_STEPS_PER_LEG;
  return Math.max(0, Math.min(1, legsDone / legs));
}

/** the layer just arrived at this tick (stepsIntoLeg just rolled over to 0 on a NEW layer) — null
 *  unless this exact state is "standing right at a layer, having just ridden down to it" (the
 *  trailhead itself counts once at the very start, so its own fact can show immediately) */
export function justArrivedLayer(state: CanyonRideState): CanyonLayer | null {
  return state.stepsIntoLeg === 0 ? currentLayer(state) : null;
}

/** tap "Ride on!": a few steps down. Never fails, never runs out of anything — this is a gentle,
 *  guided mule ride, not a climb; the only thing a tap can do is move the story forward. */
export function rideStep(state: CanyonRideState): CanyonRideState {
  if (state.arrived) return state;
  let { layerIndex, stepsIntoLeg } = state;
  stepsIntoLeg += 1;
  if (stepsIntoLeg >= RIDE_STEPS_PER_LEG) {
    stepsIntoLeg = 0;
    layerIndex = Math.min(layerIndex + 1, CANYON_LAYERS.length - 1);
  }
  const arrived = layerIndex === CANYON_LAYERS.length - 1 && stepsIntoLeg === 0;
  return { layerIndex, stepsIntoLeg, arrived };
}

export function isAtRiver(state: CanyonRideState): boolean {
  return state.arrived;
}
