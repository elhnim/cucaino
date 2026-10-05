// Cucaino Karts: the kart's arcade driving model, tuned for 6-10 year-olds on a touch screen.
//
// What it feels like:
//   - the kart goes by itself (hold BRAKE to slow down; hold it at a stop to back up)
//   - steering eases in and out (no twitch), and gets a little heavier the faster you go
//   - nothing invisible ever slows you: turning hard scrubs a little speed off by itself, so a kid
//     who just steers round the hairpin gets round it; a kid who brakes first gets round faster
//   - a gentle steering helper keeps a wandering kart pointing down the road (it never takes over)
//   - the grass is slow, not a trap; the tyre walls slide you along instead of stopping you dead
//   - laps only count when you've really driven round (progress is tracked along the road, never
//     guessed from where the nearest bit of track is), "wrong way" is noticed, and a kart that's
//     properly stuck is put back on the road, pointing the right way
//
// Pure function of (state, input, dt): no three.js, no randomness, no wall-clock reads — the same
// state/input/dt always gives the same state back (race.ts's determinism test leans on this).
import { nearestOnTrackNear, onBoostPad, progressFraction, trackAt, WALL_MARGIN, type KartTrack } from "./track";

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
  /** forward speed (m/s); a little negative when backing up */
  speed: number;
  /** the steering actually applied right now (-1..1): eases toward the input */
  steer: number;
  /** current lap, 1-based (ticks up when the kart has really driven a whole lap) */
  lap: number;
  /** where on the lap the kart is (0..track.length), following the road it's actually on */
  sLocal: number;
  /** distance driven round THIS lap (m): negative on the grid behind the line, track.length at the line */
  lapDist: number;
  /** (lap - 1) * track.length + lapDist — rises as the kart races forward, used to rank karts */
  distTotal: number;
  /** signed distance from the middle of the road, as track.ts measures it: positive = LEFT of the
   *  way the road runs (the point is at centre + (-dz, dx) * lateral for road direction (dx, dz)) */
  lateral: number;
  /** on the grass right now */
  offTrack: boolean;
  /** seconds spent off the road without a break */
  offTrackT: number;
  /** seconds spent pointing the wrong way round */
  wrongWayT: number;
  /** seconds of boosted top speed left */
  boostT: number;
  /** seconds before this kart can trigger another boost pad (so one pass = one boost) */
  boostCooldownT: number;
  /** how hard it touched a wall THIS tick (0 = didn't; ~1 = head-on) — for sparks and sound */
  wallHit: number;
  /** was put back on the road THIS tick — for a little "pop" effect */
  rescued: boolean;
  /** how much it's sliding sideways through this corner (0..1) — for tyre smoke and the body lean */
  slide: number;
  /** how much of its tightest possible turn it made last tick (0..1) — the engine eases off by this */
  slide0: number;
  /** seconds since the driver last touched the steering or the brake (the helper helps a kid who's
   *  driving; a kart nobody is driving only gets enough help not to get stuck) */
  idleT: number;
}

/** per-kart tuning: the kid's kart is the default; computer karts get a `power` a touch under 1 */
export interface KartTune {
  /** top-speed multiplier (1 = the kid's kart) */
  power?: number;
  /** 0..1: how much the steering helper keeps the kart pointing down the road (kids: on) */
  assist?: number;
}

export const KART_RADIUS = 1.15;

export const MAX_SPEED = 24; // m/s on the road (flat out down the straight)
export const BOOST_MAX_SPEED = 33;
export const GRASS_MAX_SPEED = 12.5;
const REVERSE_MAX_SPEED = 5;
/** how briskly it picks up speed: the kart closes this fraction of the gap to top speed per second */
const ACCEL_RATE = 0.62;
const ACCEL_MIN = 5.5; // m/s^2 — so it still pulls away smartly from a stop
const BRAKE_DECEL = 30;
const GRASS_DRAG = 16; // how fast the grass pulls it down to GRASS_MAX_SPEED
const COAST_DOWN = 9; // how fast a boost's extra speed bleeds off afterwards
/** steering eases toward the input at this rate (full left to full right takes ~0.45 s) */
const STEER_SLEW = 4.6;
/** the tightest circle it can turn at a crawl (m), and how much wider that gets per m/s of speed —
 *  at 24 m/s the tightest line is ~21 m radius, at 12 m/s ~13.5 m: the hairpin (11 m radius, 11 m
 *  of road to use) wants you down to about 13 m/s, which hard steering does for you */
const TURN_R0 = 6;
const TURN_R_PER_SPEED = 0.625;
/** turning hard scrubs speed: full lock sheds this fraction of the speed above SCRUB_FLOOR per second */
const SCRUB = 1.05;
const SCRUB_FLOOR = 12.5;
const BOOST_IMPULSE = 9;
const BOOST_DURATION = 1.4;
const BOOST_COOLDOWN = 1.6;
/** off the road and past the wall this long, or facing backwards this long -> put back on the road */
const RESCUE_OFF_TRACK = 3.2;
const RESCUE_WRONG_WAY = 3;
/** the helper's strength: how hard it eases the heading back toward the road's own direction when
 *  the kart is drifting toward an edge and the kid isn't steering away from it */
const ASSIST_RATE = 1.9;

export function initialKartState(x: number, z: number, yaw: number): KartPhysState {
  return { x, z, yaw, speed: 0, steer: 0, lap: 1, sLocal: 0, lapDist: 0, distTotal: 0, lateral: 0, offTrack: false, offTrackT: 0, wrongWayT: 0, boostT: 0, boostCooldownT: 0, wallHit: 0, rescued: false, slide: 0, slide0: 0, idleT: 0 };
}

/** places a kart at one of the track's starting-grid slots (behind the line, so crossing the line
 *  at the start is NOT a lap: its lapDist starts negative) */
export function gridStartState(track: KartTrack, toWorld: (local: { x: number; z: number }) => { x: number; z: number }, slot: number, yawOffset = 0): KartPhysState {
  const g = track.grid[Math.max(0, Math.min(track.grid.length - 1, slot))];
  const at = trackAt(track, g.s);
  const nx = at.dz; // right-hand normal of the tangent (dx,dz) -> (dz,-dx); the same sign as `lateral`
  const nz = -at.dx;
  const local = { x: at.x + nx * g.lateral, z: at.z + nz * g.lateral };
  const world = toWorld(local);
  const st = initialKartState(world.x, world.z, Math.atan2(at.dx, at.dz) + yawOffset);
  st.sLocal = ((g.s % track.length) + track.length) % track.length;
  st.lapDist = g.s;
  st.distTotal = g.s;
  st.lateral = -g.lateral;
  return st;
}

const wrapPi = (a: number) => {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** the tightest circle (m) the kart can drive at this speed */
export function turnRadius(speed: number): number {
  return TURN_R0 + TURN_R_PER_SPEED * Math.abs(speed);
}
/** the fastest the kart can go round a bend of this radius (m) — what the computer drivers aim for */
export function cornerSpeed(radius: number): number {
  return Math.max(6, (radius - TURN_R0) / TURN_R_PER_SPEED);
}

/** one physics tick. `others` are the OTHER karts' positions this frame (read-only: each kart's own
 *  step only ever moves itself, so stepping every kart once in a fixed order is deterministic). */
export function stepKart(state: KartPhysState, input: KartInput, track: KartTrack, dt: number, others: { x: number; z: number }[] = [], tune: KartTune = {}): KartPhysState {
  const s = { ...state, wallHit: 0, rescued: false };
  const power = tune.power ?? 1;
  const assist = tune.assist ?? 0;
  const half = track.width / 2;
  const wall = half + WALL_MARGIN;

  // ── where are we on the road (following the stretch we were already on) ──
  let near = nearestOnTrackNear(track, s.x, s.z, s.sLocal);
  let at = trackAt(track, near.s);
  const trackYaw = Math.atan2(at.dx, at.dz);
  const offTrack = Math.abs(near.lateral) > half;
  s.offTrack = offTrack;
  s.offTrackT = offTrack ? s.offTrackT + dt : 0;
  s.boostCooldownT = Math.max(0, s.boostCooldownT - dt);
  s.boostT = Math.max(0, s.boostT - dt);

  // ── boost pads (one shove per pass) ──
  if (s.boostCooldownT <= 0 && s.speed > 3 && onBoostPad(track, near.s, near.lateral)) {
    s.speed = Math.min(BOOST_MAX_SPEED, s.speed + BOOST_IMPULSE);
    s.boostT = BOOST_DURATION;
    s.boostCooldownT = BOOST_COOLDOWN;
  }

  // ── steering eases toward the input ──
  const want = Math.max(-1, Math.min(1, input.steer));
  s.idleT = Math.abs(want) > 0.05 || input.brake ? 0 : s.idleT + dt;
  const dSteer = want - s.steer;
  const slew = STEER_SLEW * dt * (Math.sign(dSteer) !== Math.sign(s.steer) && s.steer !== 0 ? 1.5 : 1); // (quicker back to centre)
  s.steer += Math.abs(dSteer) <= slew ? dSteer : Math.sign(dSteer) * slew;

  // ── speed: goes by itself; BRAKE slows it (and backs it up from a stop); grass and hard turning cost speed ──
  const top = (s.boostT > 0 ? BOOST_MAX_SPEED : MAX_SPEED) * power;
  const cap = offTrack ? Math.min(top, GRASS_MAX_SPEED) : top;
  if (input.brake) {
    if (s.speed > 0.4) s.speed = Math.max(0, s.speed - BRAKE_DECEL * dt);
    else s.speed = Math.max(-REVERSE_MAX_SPEED, s.speed - 7 * dt);
  } else if (s.speed < 0) {
    s.speed = Math.min(0, s.speed + 14 * dt);
  } else if (s.speed > cap) {
    s.speed = Math.max(cap, s.speed - (offTrack ? GRASS_DRAG : COAST_DOWN) * dt);
  } else {
    // (the harder it's turning, the less it pushes on — a full-lock turn is nearly coasting)
    const push = 1 - 0.7 * s.slide0 * s.slide0;
    s.speed = Math.min(cap, s.speed + Math.max(ACCEL_MIN, (cap - s.speed) * ACCEL_RATE * 2.2) * push * dt);
  }

  // ── turning: tighter at low speed, wider at high (never a spin on the spot) ──
  const dir = s.speed >= 0 ? 1 : -1;
  const yaw0 = s.yaw;
  const yawRate = (s.speed / turnRadius(s.speed)) * s.steer;
  s.yaw += yawRate * dt;

  // ── the steering helper: eases the heading toward where the road goes a little way ahead — firmly
  //    when the kart is near an edge, lightly in the middle of the road, and hardly at all when the
  //    kid is steering (it never fights a real input; it just stops the slow wander into the grass
  //    that little hands can't correct in time). Off the road it points you back toward it. ──
  if (assist > 0 && s.speed > 3) {
    const aheadAt = trackAt(track, near.s + 7 + s.speed * 0.45);
    // (aim to keep roughly the lane we're in, pulled a little toward the middle)
    const keep = Math.max(-half * 0.6, Math.min(half * 0.6, near.lateral * 0.6));
    const tx = aheadAt.x - aheadAt.dz * keep;
    const tz = aheadAt.z + aheadAt.dx * keep;
    const off = wrapPi(Math.atan2(tx - s.x, tz - s.z) - s.yaw);
    const edge = Math.max(0, Math.min(1, (Math.abs(near.lateral) - half * 0.3) / (half * 0.7))); // 0 in the middle -> 1 at the kerb
    const steering = Math.abs(want) > 0.2;
    const kidSame = steering && Math.sign(want) === Math.sign(off);
    // (a kid who's driving gets the full helper between their own inputs; a kart left alone for a
    // couple of seconds gets a third of it — enough to bumble round, not enough to race)
    const engaged = 1 - 0.68 * Math.max(0, Math.min(1, (s.idleT - 0.9) / 1.2));
    const kidFactor = (!steering ? 1 : kidSame ? 0.5 : 0.12) * engaged;
    const k = assist * ASSIST_RATE * (0.35 + 0.65 * edge) * kidFactor;
    const maxTurn = k * dt;
    s.yaw += Math.max(-maxTurn, Math.min(maxTurn, off * 6 * dt * (0.35 + 0.65 * edge) * assist * kidFactor));
  }

  // ── turning hard scrubs speed — however the turn came about (the kid's steering or the helper):
  //    `lock` is how much of the kart's tightest possible turn it's actually making right now ──
  const lock = Math.min(1, (Math.abs(wrapPi(s.yaw - yaw0)) / dt) * (turnRadius(s.speed) / Math.max(1, Math.abs(s.speed))));
  s.slide0 = lock;
  if (s.speed > SCRUB_FLOOR) s.speed -= (s.speed - SCRUB_FLOOR) * SCRUB * lock * lock * dt;
  s.slide = Math.max(0, Math.min(1, (lock - 0.55) / 0.45)) * Math.max(0, Math.min(1, (s.speed - 9) / 9));

  // ── move ──
  s.x += Math.sin(s.yaw) * s.speed * dt;
  s.z += Math.cos(s.yaw) * s.speed * dt;

  // ── other karts: bump apart (each kart moves itself half the overlap), scrub a little speed ──
  for (const o of others) {
    const dx = s.x - o.x;
    const dz = s.z - o.z;
    const d = Math.hypot(dx, dz);
    const minD = KART_RADIUS * 2;
    if (d > 1e-4 && d < minD) {
      const push = (minD - d) / 2;
      s.x += (dx / d) * push;
      s.z += (dz / d) * push;
      s.speed *= 1 - 0.6 * dt;
    }
  }

  // ── the soft wall: you can't get past it, and you slide along it. The harder you hit it the more
  //    speed it costs (a glancing brush costs almost nothing; head-on, about half) ──
  const prevS = near.s;
  near = nearestOnTrackNear(track, s.x, s.z, prevS);
  if (Math.abs(near.lateral) > wall) {
    at = trackAt(track, near.s);
    const sign = Math.sign(near.lateral) || 1;
    const nx = -at.dz * sign; // outward normal on the side we're on (lateral > 0 = left = (-dz, dx))
    const nz = at.dx * sign;
    s.x = at.x + nx * wall;
    s.z = at.z + nz * wall;
    // how squarely we're driving INTO the wall (0 = along it, 1 = straight at it)
    const into = Math.max(0, Math.sin(s.yaw) * nx + Math.cos(s.yaw) * nz) * dir;
    const tYaw = Math.atan2(at.dx, at.dz);
    if (into > 0) {
      s.wallHit = into;
      s.speed *= 1 - 0.5 * into * Math.min(1, Math.abs(s.speed) / 10 + 0.3);
      // turn to run along the wall, pointing the way we were already roughly going
      const along = Math.cos(wrapPi(s.yaw - tYaw)) >= 0 ? tYaw : tYaw + Math.PI;
      s.yaw += wrapPi(along - s.yaw) * Math.min(1, (0.25 + into * 0.75) * 9 * dt);
    }
    near = nearestOnTrackNear(track, s.x, s.z, near.s);
  }

  // ── lap progress: how far along the road we moved this tick (wrap-aware; a rescue or a bump can't
  //    hand out distance, only really driving it can) ──
  let ds = near.s - prevS;
  if (ds > track.length / 2) ds -= track.length;
  if (ds < -track.length / 2) ds += track.length;
  if (Math.abs(ds) < 12) s.lapDist += ds;
  s.sLocal = near.s;
  s.lateral = near.lateral;
  if (s.lapDist >= track.length) {
    s.lapDist -= track.length;
    s.lap += 1;
  }
  s.distTotal = (s.lap - 1) * track.length + s.lapDist;

  // ── wrong way round? ──
  at = trackAt(track, near.s);
  const facing = Math.cos(wrapPi(s.yaw - Math.atan2(at.dx, at.dz)));
  s.wrongWayT = facing < -0.35 && Math.abs(s.speed) > 1.5 && s.speed > 0 ? s.wrongWayT + dt : Math.max(0, s.wrongWayT - dt * 2);

  // ── rescue: properly stuck (off the road for ages, or driving the wrong way) -> back on the road ──
  if (s.offTrackT > RESCUE_OFF_TRACK || s.wrongWayT > RESCUE_WRONG_WAY) {
    s.x = at.x;
    s.z = at.z;
    s.yaw = Math.atan2(at.dx, at.dz);
    s.speed = 7;
    s.steer = 0;
    s.offTrackT = 0;
    s.wrongWayT = 0;
    s.offTrack = false;
    s.lateral = 0;
    s.rescued = true;
  }
  return s;
}

/** 0..1 fraction along the current lap (what the HUD/mini-map and KartPose.progress show) */
export function kartProgress(track: KartTrack, state: KartPhysState): number {
  return progressFraction(track, state.sLocal);
}

/** is this kart going the wrong way round right now (the HUD shows a big turn-around sign) */
export function isWrongWay(state: KartPhysState): boolean {
  return state.wrongWayT > 0.8;
}
