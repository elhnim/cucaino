// "Climb Everest!" — the pure state machine behind the guided climb at Everest Base Camp
// (components/park/EverestClimb.tsx is the 2D overlay that drives this; the 3D park keeps running
// behind it, same shape as lib/park/weaving/logic.ts + WeaveGame.tsx). No three.js, no DOM: every
// function here is a plain (state) -> state transform, so the whole climb is unit-tested in
// isolation.
//
// The climb is a tap-to-advance minigame, not a real-time one: tap "Climb!" to take a roped step up
// (costs breath and, every STEPS_PER_LEG taps, arrives at the next camp — lib/park/registry/
// everestFacts.ts's EVEREST_CAMPS, in real altitude order, Base Camp -> the Icefall -> Camp 1-4 ->
// the Summit), or tap "Breathe" to rest and refill the breath meter. Thin air is represented gently:
// running out of breath just PAUSES the climb (climbStep no-ops) until the kid taps Breathe — there
// is no fail state, no losing, nothing that sends the kid back down. That's deliberate (ages 6-10):
// the "oxygen meter" teaches that climbing high is hard work and you have to rest, not a punishment.
import { EVEREST_CAMPS, type EverestCamp } from "../registry/everestFacts";

export { EVEREST_CAMPS };
export type { EverestCamp };

/** roped-up steps needed to cross from one camp to the next */
export const STEPS_PER_LEG = 4;
/** breath spent by one "Climb!" tap */
export const BREATH_COST = 22;
/** breath restored by one "Breathe" tap (always allowed, always helps) */
export const BREATH_GAIN = 34;
export const BREATH_MAX = 100;

export interface ClimbState {
  /** index into EVEREST_CAMPS of the camp just left (0 = still at Base Camp, hasn't set off) */
  campIndex: number;
  /** roped steps taken since leaving `campIndex`'s camp, 0..STEPS_PER_LEG */
  stepsIntoLeg: number;
  /** 0..BREATH_MAX — thin-air "oxygen" meter; never fails the climb, just pauses it */
  breath: number;
  /** true once the Summit camp (the last in EVEREST_CAMPS) has been reached */
  summited: boolean;
  /** how many times climbStep() had to turn away a tap for lack of breath (for a gentle on-screen
   *  "catch your breath!" nudge — never a fail, just a hint to tap Breathe) */
  winded: number;
}

export function initialClimbState(): ClimbState {
  return { campIndex: 0, stepsIntoLeg: 0, breath: BREATH_MAX, summited: false, winded: 0 };
}

/** the current camp the climber just left (or is standing at, if stepsIntoLeg is 0) */
export function currentCamp(state: ClimbState): EverestCamp {
  return EVEREST_CAMPS[Math.min(state.campIndex, EVEREST_CAMPS.length - 1)];
}
/** the camp this leg is climbing towards (the last camp once summited) */
export function nextCamp(state: ClimbState): EverestCamp {
  return EVEREST_CAMPS[Math.min(state.campIndex + 1, EVEREST_CAMPS.length - 1)];
}

/** the real altitude (metres) right now, interpolated along the current leg */
export function currentAltitude(state: ClimbState): number {
  const a = currentCamp(state).altitude;
  const b = nextCamp(state).altitude;
  const t = state.summited ? 1 : state.stepsIntoLeg / STEPS_PER_LEG;
  return Math.round(a + (b - a) * t);
}

/** 0..1 how far along the WHOLE route (Base Camp -> Summit) the climber has come */
export function overallProgress(state: ClimbState): number {
  const legs = EVEREST_CAMPS.length - 1;
  const legsDone = state.campIndex + state.stepsIntoLeg / STEPS_PER_LEG;
  return Math.max(0, Math.min(1, legsDone / legs));
}

/** the camp just arrived at this tick (stepsIntoLeg just rolled over to 0 on a NEW camp) — null
 *  unless this exact state is "standing right at a camp, having just climbed up to it" (Base Camp
 *  itself, state 0, counts once at the very start so its own fact can show immediately) */
export function justArrivedCamp(state: ClimbState): EverestCamp | null {
  return state.stepsIntoLeg === 0 ? currentCamp(state) : null;
}

/** tap "Climb!": a roped step up. Spends breath and advances the leg; if there isn't enough breath
 *  left, this is a no-op (breath is never driven negative, the climb never "fails" — it just waits
 *  for a Breathe tap) other than bumping `winded`, a hint counter the UI can use for a gentle nudge. */
export function climbStep(state: ClimbState): ClimbState {
  if (state.summited) return state;
  if (state.breath < BREATH_COST) return { ...state, winded: state.winded + 1 };
  let { campIndex, stepsIntoLeg } = state;
  const breath = state.breath - BREATH_COST;
  stepsIntoLeg += 1;
  if (stepsIntoLeg >= STEPS_PER_LEG) {
    stepsIntoLeg = 0;
    campIndex = Math.min(campIndex + 1, EVEREST_CAMPS.length - 1);
  }
  const summited = campIndex === EVEREST_CAMPS.length - 1 && stepsIntoLeg === 0;
  return { campIndex, stepsIntoLeg, breath, summited, winded: 0 };
}

/** tap "Breathe": always safe, always helps — the only way to recover breath. Never fails, never
 *  makes things worse, so a kid can never get the climb "wrong" by resting too much. */
export function breathe(state: ClimbState): ClimbState {
  return { ...state, breath: Math.min(BREATH_MAX, state.breath + BREATH_GAIN), winded: 0 };
}

export function isSummited(state: ClimbState): boolean {
  return state.summited;
}
