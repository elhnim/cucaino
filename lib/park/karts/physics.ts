// Cucaino Karts: the kart's own little arcade physics — auto-accelerate, steer with a soft lock,
// slow down on the grass, bounce gently off the soft walls (kerbs/tyres/hay), get a shove off a
// boost pad, bump softly off other karts. Pure function of (state, input, dt): no three.js, no
// randomness, no wall-clock reads — call stepKart with the same state/input/dt and you always get
// the same state back (race.ts's determinism test leans on this).
import { cornerAt, nearestOnTrack, onBoostPad, progressFraction, trackAt, WALL_MARGIN, type KartTrack } from "./track";

export interface KartInput {
  /** -1 (left) .. +1 (right) */
  steer: number;
  /** holding the brake button */
  brake: boolean;
}

export interface KartPhysState {
  x: number;
  z: number;
  /** heading (radians): forward = (sin(yaw), cos(yaw)), same convention as the rest of the park */
  yaw: number;
  speed: number;
  /** current lap, 1-based (ticks up the instant the kart crosses the finish line) */
  lap: number;
  /** progress along THIS lap (0..track.length); wraps to 0 at the finish line */
  sLocal: number;
  /** (lap - 1) * track.length + sLocal — monotonic while racing forward, used to rank karts */
  distTotal: number;
  /** seconds spent off the road without a break (drives the >2 s rescue pop-back) */
  offTrackT: number;
  /** seconds of boosted top speed left */
  boostT: number;
  /** seconds before this kart can trigger another boost pad (so one pass = one boost) */
  boostCooldownT: number;
}

export const KART_RADIUS = 1.1;

export const MAX_SPEED = 21; // m/s, on the road
export const BOOST_MAX_SPEED = 32;
const ACCEL = 13;
const BRAKE_DECEL = 26;
const OFF_TRACK_MAX_SPEED = 9;
const GRASS_DRAG = 9;
const STEER_RATE = 2.35; // rad/s at a dead stop
const STEER_HIGH_SPEED_FLOOR = 0.42; // steering never goes below this fraction of STEER_RATE
const BOOST_IMPULSE = 11;
const BOOST_DURATION = 1.3;
const BOOST_COOLDOWN = 1.6;
const RESCUE_AFTER = 2; // seconds continuously off-track before a gentle pop-back onto the road
const WALL_BOUNCE_SPEED_LOSS = 0.45;
/** how fast a kart can comfortably take each kind of corner — read by ai.ts too, so the computer
 *  drivers brake for the same corners the physics itself slows them in */
export const CORNER_SPEED_CAP: Record<string, number> = { hairpin: 9, chicane: 12, esses: 15, sweeper: 17 };

export function initialKartState(x: number, z: number, yaw: number): KartPhysState {
  return { x, z, yaw, speed: 0, lap: 1, sLocal: 0, distTotal: 0, offTrackT: 0, boostT: 0, boostCooldownT: 0 };
}

/** places a kart at one of the track's starting-grid slots in world space */
export function gridStartState(track: KartTrack, toWorld: (local: { x: number; z: number }) => { x: number; z: number }, slot: number, yawOffset = 0): KartPhysState {
  const g = track.grid[Math.max(0, Math.min(track.grid.length - 1, slot))];
  const at = trackAt(track, g.s);
  const nx = at.dz; // right-hand normal of the tangent (dx,dz) -> (dz,-dx); keep consistent with nearestOnTrack's lateral sign
  const nz = -at.dx;
  const local = { x: at.x + nx * g.lateral, z: at.z + nz * g.lateral };
  const world = toWorld(local);
  const yaw = Math.atan2(at.dx, at.dz) + yawOffset;
  return initialKartState(world.x, world.z, yaw);
}

/** one physics tick. `others` are the OTHER karts' positions this frame (read-only; each kart's own
 *  step call only ever moves itself, so stepping every kart once in a fixed order each frame is
 *  deterministic). */
export function stepKart(state: KartPhysState, input: KartInput, track: KartTrack, dt: number, others: { x: number; z: number }[] = []): KartPhysState {
  const s = { ...state };
  const near = nearestOnTrack(track, s.x, s.z);
  const half = track.width / 2;
  const offTrack = Math.abs(near.lateral) > half;
  s.offTrackT = offTrack ? s.offTrackT + dt : 0;
  s.boostCooldownT = Math.max(0, s.boostCooldownT - dt);
  s.boostT = Math.max(0, s.boostT - dt);

  // ── boost pads (one impulse per pass) ──
  if (s.boostCooldownT <= 0 && onBoostPad(track, near.s, near.lateral)) {
    s.speed = Math.min(BOOST_MAX_SPEED, s.speed + BOOST_IMPULSE);
    s.boostT = BOOST_DURATION;
    s.boostCooldownT = BOOST_COOLDOWN;
  }

  // ── speed: auto-accelerate unless braking; the grass (and a sharp corner, gently) cap it ──
  const corner = cornerAt(track, near.s);
  let cap = s.boostT > 0 ? BOOST_MAX_SPEED : MAX_SPEED;
  if (offTrack) cap = Math.min(cap, OFF_TRACK_MAX_SPEED);
  else if (corner) cap = Math.min(cap, CORNER_SPEED_CAP[corner.kind] + (s.boostT > 0 ? 6 : 0));
  if (input.brake) {
    s.speed = Math.max(0, s.speed - BRAKE_DECEL * dt);
  } else if (s.speed > cap) {
    s.speed = Math.max(cap, s.speed - (offTrack ? GRASS_DRAG : BRAKE_DECEL * 0.5) * dt);
  } else {
    s.speed = Math.min(cap, s.speed + ACCEL * dt);
  }

  // ── steering: softer at speed (forgiving for little hands), and while off-track too ──
  const speedFrac = Math.max(0, Math.min(1, s.speed / MAX_SPEED));
  const steerRate = STEER_RATE * (1 - (1 - STEER_HIGH_SPEED_FLOOR) * speedFrac);
  s.yaw += input.steer * steerRate * dt;

  // ── integrate ──
  s.x += Math.sin(s.yaw) * s.speed * dt;
  s.z += Math.cos(s.yaw) * s.speed * dt;

  // ── soft walls: past the kerb/grass shoulder, slide back along the edge instead of stopping ──
  // (an ABSOLUTE snap to the wall boundary at the fresh nearest point, not a relative nudge by the
  // overshoot: a relative nudge only converges for a small overshoot — someone who starts the tick
  // already miles from the track, or a chain of corrections near a tight corner where the nearest
  // point keeps jumping, can otherwise overshoot further away each tick and never converge)
  let after = nearestOnTrack(track, s.x, s.z);
  const limit = half + WALL_MARGIN;
  // only a kart that's just breached the wall gets caught by it — something hopelessly far off
  // the circuit (flung into the sea, or starting miles away in a test) has no physical wall to
  // meet, and must stay slow via OFF_TRACK_MAX_SPEED until the >2 s rescue brings it back
  const atWall = Math.abs(after.lateral) > limit && Math.abs(after.lateral) < limit + 6;
  if (atWall) {
    const sign = Math.sign(after.lateral) || 1;
    const at = trackAt(track, after.s);
    const nx = at.dz * sign;
    const nz = -at.dx * sign;
    s.x = at.x + nx * limit;
    s.z = at.z + nz * limit;
    s.speed *= 1 - WALL_BOUNCE_SPEED_LOSS;
    // nudge the heading back towards the track direction so the kart slides along the wall, not
    // straight into it again next frame
    const trackYaw = Math.atan2(at.dx, at.dz);
    s.yaw = lerpAngle(s.yaw, trackYaw, 0.35);
    after = nearestOnTrack(track, s.x, s.z);
  }

  // ── rescue: stuck off-track too long (or wedged against a wall) pops gently back onto the road ──
  if (s.offTrackT > RESCUE_AFTER) {
    const at = trackAt(track, after.s);
    s.x = at.x;
    s.z = at.z;
    s.yaw = Math.atan2(at.dx, at.dz);
    s.speed = Math.min(s.speed, OFF_TRACK_MAX_SPEED);
    s.offTrackT = 0;
  }

  // ── other karts: simple circle-vs-circle, pushed half the overlap apart, a little speed lost ──
  for (const o of others) {
    const dx = s.x - o.x;
    const dz = s.z - o.z;
    const d = Math.hypot(dx, dz);
    const minD = KART_RADIUS * 2;
    if (d > 0 && d < minD) {
      const push = (minD - d) / 2;
      s.x += (dx / d) * push;
      s.z += (dz / d) * push;
      s.speed *= 0.97;
    }
  }

  // ── lap counting: crossing the finish line forward (near the end of the lap -> near the start) ──
  const finalNear = nearestOnTrack(track, s.x, s.z);
  const wasNearEnd = s.sLocal > track.length * 0.75;
  const nowNearStart = finalNear.s < track.length * 0.25;
  if (wasNearEnd && nowNearStart) s.lap += 1;
  s.sLocal = finalNear.s;
  s.distTotal = (s.lap - 1) * track.length + s.sLocal;

  return s;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** 0..1 fraction along the current lap (what the HUD/mini-map and KartPose.progress show) */
export function kartProgress(track: KartTrack, state: KartPhysState): number {
  return progressFraction(track, state.sLocal);
}
