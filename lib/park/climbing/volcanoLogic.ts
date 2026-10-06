// "Climb to the crater!" — the pure state machine behind the guided walk up Parícutin
// (components/park/VolcanoClimb.tsx is the 2D overlay that drives this; the 3D park keeps running
// behind it, the same shape as lib/park/climbing/logic.ts's "Climb Everest!"). No three.js, no DOM:
// every function here is a plain (state) -> state transform, unit-tested in isolation.
//
// Simpler than Everest's own climb: this is a short walk up a single cinder cone, not a multi-day
// expedition through an icefall, so there's no breath/oxygen meter to manage — every tap just
// walks a few steps further up, and every STEPS_PER_LEG taps arrives at the next stop in the
// volcano's own story (lib/park/registry/paricutinFacts.ts's PARICUTIN_STOPS, in real
// chronological order: 1943's crack, a day old, a year old, the villages, 1952's quiet, today).
import { PARICUTIN_STOPS, type ParicutinStop } from "../registry/paricutinFacts";

export { PARICUTIN_STOPS };
export type { ParicutinStop };

/** taps needed to cross from one stop to the next */
export const VOLCANO_STEPS_PER_LEG = 3;

export interface VolcanoClimbState {
  /** index into PARICUTIN_STOPS of the stop just left (0 = still at the trailhead) */
  stopIndex: number;
  /** taps taken since leaving `stopIndex`'s stop, 0..VOLCANO_STEPS_PER_LEG */
  stepsIntoLeg: number;
  /** true once the last stop (the crater rim) has been reached */
  arrived: boolean;
}

export function initialVolcanoClimbState(): VolcanoClimbState {
  return { stopIndex: 0, stepsIntoLeg: 0, arrived: false };
}

/** the stop the climber just left (or is standing at, if stepsIntoLeg is 0) */
export function currentStop(state: VolcanoClimbState): ParicutinStop {
  return PARICUTIN_STOPS[Math.min(state.stopIndex, PARICUTIN_STOPS.length - 1)];
}
/** the stop this leg is walking towards (the last stop once arrived) */
export function nextStop(state: VolcanoClimbState): ParicutinStop {
  return PARICUTIN_STOPS[Math.min(state.stopIndex + 1, PARICUTIN_STOPS.length - 1)];
}

/** 0..1 how far along the WHOLE route (trailhead -> crater rim) the climber has come */
export function volcanoProgress(state: VolcanoClimbState): number {
  const legs = PARICUTIN_STOPS.length - 1;
  const legsDone = state.stopIndex + state.stepsIntoLeg / VOLCANO_STEPS_PER_LEG;
  return Math.max(0, Math.min(1, legsDone / legs));
}

/** the stop just arrived at this tick (stepsIntoLeg just rolled over to 0 on a NEW stop) — null
 *  unless this exact state is "standing right at a stop, having just walked up to it" (the
 *  trailhead itself counts once at the very start, so its own fact can show immediately) */
export function justArrivedStop(state: VolcanoClimbState): ParicutinStop | null {
  return state.stepsIntoLeg === 0 ? currentStop(state) : null;
}

/** tap "Climb!": a few steps up. Never fails, never runs out of anything — this is a short, easy
 *  walk, not an expedition; the only thing a tap can do is move the story forward. */
export function volcanoStep(state: VolcanoClimbState): VolcanoClimbState {
  if (state.arrived) return state;
  let { stopIndex, stepsIntoLeg } = state;
  stepsIntoLeg += 1;
  if (stepsIntoLeg >= VOLCANO_STEPS_PER_LEG) {
    stepsIntoLeg = 0;
    stopIndex = Math.min(stopIndex + 1, PARICUTIN_STOPS.length - 1);
  }
  const arrived = stopIndex === PARICUTIN_STOPS.length - 1 && stepsIntoLeg === 0;
  return { stopIndex, stepsIntoLeg, arrived };
}

export function isAtRim(state: VolcanoClimbState): boolean {
  return state.arrived;
}
