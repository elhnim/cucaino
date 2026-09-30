// Close encounters — pure maths, deterministic, no three.js (tested).
//
// A diving kid should *meet* the sea's big life, not glimpse it far off in the blue: now and then a
// creature (an orca pod's leader, a manta, a turtle, a dolphin pod at the surface) is sent to swim
// past close by. It turns up out of sight ahead (respawn), heads for a point `side` metres beside
// the kid — tracking them if they move — at the height it was given, and once it's alongside it
// carries on past and back to its own life. Keeps out of water too shallow for it on the way.
import { WATER_Y } from "../../registry/terrain";
import { aimPast } from "./whales";
import { climbTo, desiredTurn, respawn, seaFloorY, settle, shallowAhead, wrapAngle, type Swimmer, type SwimStyle } from "./wander";

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

export interface Visit {
  /** on its way to (or past) the kid */
  on: boolean;
  /** pass this many metres to the kid's side (signed) */
  side: number;
  /** swim at this height */
  y: number;
  /** has drawn level with the kid (now carrying on past) */
  passed: boolean;
  /** seconds since it was sent */
  t: number;
  /** until the next visit (the caller's clock) */
  wait: number;
}

export const makeVisit = (wait: number): Visit => ({ on: false, side: 0, y: 0, passed: false, t: 0, wait });

/** a height inside the water for this creature at (x, z): clear of the floor, under the surface */
export function visitHeight(x: number, z: number, st: SwimStyle, y: number): number {
  const lo = seaFloorY(x, z) + st.clear;
  const hi = WATER_Y - st.depth[0];
  if (lo >= hi) return (lo + hi) / 2;
  return clamp(y, lo, hi);
}

/**
 * Send `s` to pass `lateral` metres beside `focus` at height `y`, starting `rMin..rMax` metres away
 * (mostly ahead of the direction of travel `dirX, dirZ`).
 */
export function startVisit(s: Swimmer, st: SwimStyle, v: Visit, focus: { x: number; z: number }, dirX: number, dirZ: number, rnd: () => number, rMin: number, rMax: number, lateral: number, y: number): void {
  respawn(s, st, focus, dirX, dirZ, rnd, rMin, rMax, 0.9);
  v.side = aimPast(s, focus, lateral, rnd);
  v.y = y;
  v.on = true;
  v.passed = false;
  v.t = 0;
  s.y = visitHeight(s.x, s.z, st, y);
  s.vy = 0;
}

/**
 * One step of a visit: steer for the point beside the (moving) focus until level with it, then
 * carry on straight-ish (the usual wander). Holds the visit height. Returns the horizontal
 * distance to the focus.
 */
export function stepVisit(s: Swimmer, st: SwimStyle, v: Visit, focus: { x: number; z: number }, dt: number, t: number): number {
  v.t += dt;
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  const bx = focus.x - s.x;
  const bz = focus.z - s.z;
  const bl = Math.hypot(bx, bz) || 1;
  let want: number;
  if (!v.passed && bx * fx + bz * fz <= 0) v.passed = true;
  if (!v.passed) {
    const tx = focus.x + (bz / bl) * v.side;
    const tz = focus.z - (bx / bl) * v.side;
    const dy = wrapAngle(Math.atan2(tx - s.x, tz - s.z) - s.yaw);
    want = clamp(dy * 2, -1, 1) * st.turn * 1.5;
    // the shallows still win
    const urg = shallowAhead(s, st);
    if (urg > 0) want = want * (1 - urg) + desiredTurn(s, st, t) * urg;
  } else want = desiredTurn(s, st, t);
  s.yawRate += (want - s.yawRate) * Math.min(1, dt * 2);
  s.yaw = wrapAngle(s.yaw + s.yawRate * dt);
  s.speed += (st.speed[1] * 0.85 - s.speed) * Math.min(1, dt * 0.8);
  s.x += Math.sin(s.yaw) * s.speed * dt;
  s.z += Math.cos(s.yaw) * s.speed * dt;
  climbTo(s, st, visitHeight(s.x, s.z, st, v.y), dt);
  settle(s, st, dt);
  return bl;
}
